-- ============================================================================
--  📅 YENİ PUANTAJ SİSTEMİ (Güncelleme #22)
-- ----------------------------------------------------------------------------
--  ESKİ SİSTEMİN SORUNLARI:
--    • Veri JSON içinde gömülü → sorgulanamıyor, raporlanamıyor
--    • Sadece 5 kişi kayıtlı (7 personel var)
--    • GÜNLÜK DETAY YOK → "hangi gün kaç saat" bilinmiyor
--    • Mesai tutarları hiç hesaplanmamış
--
--  YENİ SİSTEM:
--    1) puantaj_gunluk  → her personel × her gün (giriş/çıkış, saat)
--       ⭐ Cumartesi günü girilen saat OTOMATİK %50 mesaiye yazılır
--       ⭐ Pazar günü girilen saat OTOMATİK %100 mesaiye yazılır
--    2) puantaj_manuel  → eski aylık veriler (geçiş dönemi, veri kaybı yok)
--    3) puantaj_aylik() → günlük kayıtlardan aylık özet çıkarır
--
--  ⚠️ Yeni tablolar kurar + eski veriyi TAŞIR (silmez).
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) GÜNLÜK PUANTAJ TABLOSU
-- ============================================================================
create table if not exists public.puantaj_gunluk (
  id            uuid primary key default gen_random_uuid(),
  personel      text not null,
  tarih         date not null,
  giris_saat    numeric,                       -- örn 8.0 = 08:00
  cikis_saat    numeric,                       -- örn 18.0 = 18:00
  normal_saat   numeric default 0,             -- hafta içi normal çalışma
  mesai50_saat  numeric default 0,             -- cumartesi (%50)
  mesai100_saat numeric default 0,             -- pazar (%100)
  izin_mi       boolean default false,
  aciklama      text,
  olusturan     text,
  created_at    timestamptz default now(),
  unique (personel, tarih)
);

create index if not exists idx_puantaj_gun_personel on public.puantaj_gunluk (personel, tarih desc);

comment on table public.puantaj_gunluk is
  'Günlük puantaj: cumartesi %50, pazar %100 mesaiye otomatik yazılır';


-- ============================================================================
-- 2) AYLIK MANUEL VERİ (eski sistemden taşınan / elle düzeltme)
-- ============================================================================
create table if not exists public.puantaj_manuel (
  id            uuid primary key default gen_random_uuid(),
  personel      text not null,
  ay            text not null,                 -- YYYY-MM
  maas          numeric default 0,
  avans         numeric default 0,
  kesinti       numeric default 0,
  yemek         numeric default 0,
  prim          numeric default 0,
  mesai50_saat  numeric default 0,             -- günlük yoksa buradan
  mesai100_saat numeric default 0,
  aciklama      text,
  created_at    timestamptz default now(),
  unique (personel, ay)
);

create index if not exists idx_puantaj_manuel_ay on public.puantaj_manuel (ay, personel);

comment on table public.puantaj_manuel is
  'Aylık puantaj (maaş, avans, kesinti) — günlük kayıt yoksa bu değerler kullanılır';


-- ============================================================================
-- 3) GÜN EKLE — cumartesi/pazar OTOMATİK mesaiye yazılır
-- ============================================================================
create or replace function public.puantaj_gun_ekle(
  p_personel   text,
  p_tarih      date,
  p_giris      numeric default null,
  p_cikis      numeric default null,
  p_saat       numeric default null,
  p_izin       boolean default false,
  p_aciklama   text default null,
  p_kullanici  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gun     integer;
  v_saat    numeric;
  v_normal  numeric := 0;
  v_m50     numeric := 0;
  v_m100    numeric := 0;
  v_tip     text;
begin
  if coalesce(trim(p_personel), '') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Personel adı gerekli.');
  end if;

  -- Saat: verilmişse onu kullan, yoksa giriş/çıkıştan hesapla
  v_saat := coalesce(
    p_saat,
    case when p_giris is not null and p_cikis is not null
         then greatest(p_cikis - p_giris, 0) else 0 end
  );

  v_gun := extract(dow from p_tarih)::int;   -- 0=Pazar, 6=Cumartesi

  if p_izin then
    v_tip := 'İZİN';
  elsif v_gun = 6 then
    v_m50 := v_saat;  v_tip := 'CUMARTESİ (%50)';
  elsif v_gun = 0 then
    v_m100 := v_saat; v_tip := 'PAZAR (%100)';
  else
    v_normal := v_saat; v_tip := 'HAFTA İÇİ';
  end if;

  insert into public.puantaj_gunluk
    (personel, tarih, giris_saat, cikis_saat, normal_saat, mesai50_saat, mesai100_saat, izin_mi, aciklama, olusturan)
  values
    (trim(p_personel), p_tarih, p_giris, p_cikis, v_normal, v_m50, v_m100, coalesce(p_izin, false), p_aciklama, p_kullanici)
  on conflict (personel, tarih) do update
    set giris_saat    = excluded.giris_saat,
        cikis_saat    = excluded.cikis_saat,
        normal_saat   = excluded.normal_saat,
        mesai50_saat  = excluded.mesai50_saat,
        mesai100_saat = excluded.mesai100_saat,
        izin_mi       = excluded.izin_mi,
        aciklama      = excluded.aciklama;

  return jsonb_build_object(
    'ok', true,
    'gun_tipi', v_tip,
    'normal_saat', v_normal,
    'mesai50_saat', v_m50,
    'mesai100_saat', v_m100,
    'mesaj', to_char(p_tarih, 'DD.MM.YYYY') || ' · ' || v_tip || ' · ' || v_saat || ' saat kaydedildi.'
  );
end;
$$;

revoke all on function public.puantaj_gun_ekle(text, date, numeric, numeric, numeric, boolean, text, text) from public;
grant execute on function public.puantaj_gun_ekle(text, date, numeric, numeric, numeric, boolean, text, text) to authenticated;


-- ============================================================================
-- 4) AYLIK ÖZET (günlük varsa ondan, yoksa manuelden)
-- ============================================================================
create or replace function public.puantaj_aylik(
  p_personel text,
  p_ay       text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ay       text := coalesce(p_ay, to_char(current_date, 'YYYY-MM'));
  v_gunluk   record;
  v_manuel   record;
begin
  -- 🔒 Sadece kendisi veya yönetici
  if not (
    public.buvisan_admin_mi()
    or public.parca_adi_normal(p_personel) = public.parca_adi_normal(public.benim_adim())
  ) then
    return jsonb_build_object('yetki_yok', true, 'mesaj', 'Sadece kendi puantajınızı görebilirsiniz.');
  end if;

  select
    count(*) filter (where not izin_mi)                        as calisilan_gun,
    count(*) filter (where izin_mi)                            as izin_gun,
    coalesce(sum(normal_saat), 0)                              as normal_saat,
    coalesce(sum(mesai50_saat), 0)                             as m50,
    coalesce(sum(mesai100_saat), 0)                            as m100
  into v_gunluk
  from public.puantaj_gunluk
  where public.parca_adi_normal(personel) = public.parca_adi_normal(p_personel)
    and to_char(tarih, 'YYYY-MM') = v_ay;

  select * into v_manuel
  from public.puantaj_manuel
  where public.parca_adi_normal(personel) = public.parca_adi_normal(p_personel)
    and ay = v_ay;

  return jsonb_build_object(
    'personel',        p_personel,
    'ay',              v_ay,
    'gunluk_kayit',    coalesce(v_gunluk.calisilan_gun, 0) + coalesce(v_gunluk.izin_gun, 0),
    'calisilan_gun',   coalesce(v_gunluk.calisilan_gun, 0),
    'izin_gun',        coalesce(v_gunluk.izin_gun, 0),
    'normal_saat',     round(coalesce(v_gunluk.normal_saat, 0), 1),
    'mesai50_saat',    round(coalesce(nullif(v_gunluk.m50, 0), v_manuel.mesai50_saat, 0), 1),
    'mesai100_saat',   round(coalesce(nullif(v_gunluk.m100, 0), v_manuel.mesai100_saat, 0), 1),
    'maas',            coalesce(v_manuel.maas, 0),
    'avans',           coalesce(v_manuel.avans, 0),
    'kesinti',         coalesce(v_manuel.kesinti, 0),
    'yemek',           coalesce(v_manuel.yemek, 0),
    'prim',            coalesce(v_manuel.prim, 0),
    'kaynak',          case when coalesce(v_gunluk.calisilan_gun, 0) > 0
                            then 'günlük kayıtlar' else 'aylık kayıt' end
  );
end;
$$;

revoke all on function public.puantaj_aylik(text, text) from public;
grant execute on function public.puantaj_aylik(text, text) to authenticated;


-- ============================================================================
-- 5) ESKİ VERİYİ TAŞI (JSON → puantaj_manuel) — VERİ KAYBI YOK
-- ============================================================================
do $$
declare
  aylar integer := 0;
begin
  insert into public.puantaj_manuel
    (personel, ay, maas, avans, kesinti, yemek, prim, mesai50_saat, mesai100_saat, aciklama)
  select
    trim(p.value ->> 'ad'),
    pml.month_key,
    coalesce((p.value ->> 'maas')::numeric, 0),
    coalesce((p.value ->> 'avans')::numeric, 0),
    coalesce((p.value ->> 'kesinti')::numeric, 0),
    coalesce((p.value ->> 'yemek')::numeric, 0),
    coalesce((p.value ->> 'prim')::numeric, 0),
    coalesce((p.value ->> 'mesai50_saat')::numeric, 0),
    coalesce((p.value ->> 'mesai100_saat')::numeric, 0),
    'Eski puantaj sisteminden taşındı'
  from public.personnel_monthly_lists pml
  cross join lateral jsonb_array_elements(coalesce(pml.personnel_data, '[]'::jsonb)) p
  where coalesce(trim(p.value ->> 'ad'), '') <> ''
  on conflict (personel, ay) do update
    set maas          = excluded.maas,
        avans         = excluded.avans,
        kesinti       = excluded.kesinti,
        yemek         = excluded.yemek,
        prim          = excluded.prim,
        mesai50_saat  = excluded.mesai50_saat,
        mesai100_saat = excluded.mesai100_saat;

  get diagnostics aylar = row_count;
  raise notice 'Taşınan kayıt: %', aylar;
end $$;


-- ============================================================================
-- 6) GÜVENLİK
-- ============================================================================
alter table public.puantaj_gunluk enable row level security;
alter table public.puantaj_manuel enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('puantaj_gunluk','puantaj_manuel')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Sadece yönetici yazar; personel kendi kaydını FONKSİYON üzerinden okur
create policy puantaj_gunluk_yonetici on public.puantaj_gunluk
  for all to authenticated
  using (public.buvisan_admin_mi())
  with check (public.buvisan_admin_mi());

create policy puantaj_manuel_yonetici on public.puantaj_manuel
  for all to authenticated
  using (public.buvisan_admin_mi())
  with check (public.buvisan_admin_mi());

revoke all on public.puantaj_gunluk from anon;
revoke all on public.puantaj_manuel from anon;


-- ============================================================================
-- 7) KONTROL
-- ============================================================================
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name in ('puantaj_gunluk','puantaj_manuel')) as tablo_kuruldu,
  (select count(distinct personel) from public.puantaj_manuel)  as tasinan_personel,
  (select count(distinct ay) from public.puantaj_manuel)        as tasinan_ay,
  (select count(*) from public.puantaj_manuel)                  as tasinan_kayit;

-- Taşınan veriler (kim, hangi ay, ne kadar)
select personel, ay, maas, avans, kesinti, yemek, mesai50_saat, mesai100_saat
from public.puantaj_manuel
order by ay desc, personel
limit 20;
