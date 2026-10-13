-- ============================================================================
--  💵 PERSONEL MAAŞ YÖNETİMİ (Güncelleme #23)
-- ----------------------------------------------------------------------------
--  SENİN BİLGİN:
--    • Hamza Attar ayrılıyor → yerine Okan Aran
--    • Aylık maaşlar:
--        Kaya Ali Tosun : 38.000
--        Gökhan Gök     : 50.000
--        Okan Aran      : 55.000
--        Kerim Akdoğan  : 50.000
--        Veysel Çarklı  : 46.000
--    • Maaşlar PROGRAMDAN güncellenebilmeli (kalıcı)
--
--  BU SCRIPT:
--    1) personel_maas tablosu → güncel maaşlar burada tutulur
--    2) maas_guncelle() → programdan maaş değiştirme (sadece yönetici)
--    3) personel_kazanc() artık YENİ puantaj tablolarından beslenir
--
--  ⚠️ Veri silmez. Eski aylık kayıtlar korunur (tarihsel veri).
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) GÜNCEL MAAŞ TABLOSU
-- ============================================================================
create table if not exists public.personel_maas (
  id           uuid primary key default gen_random_uuid(),
  personel     text not null unique,
  maas         numeric not null default 0,
  aktif        boolean default true,
  aciklama     text,
  guncelleyen  text,
  guncelleme   timestamptz default now(),
  created_at   timestamptz default now()
);

comment on table public.personel_maas is
  'Personelin GÜNCEL aylık maaşı — programdan güncellenebilir';

create index if not exists idx_personel_maas_personel on public.personel_maas (personel);


-- ============================================================================
-- 2) MAAŞLARI YÜKLE / GÜNCELLE (senin verdiğin rakamlar)
-- ============================================================================
insert into public.personel_maas (personel, maas, aktif, aciklama)
values
  ('KAYA ALİ TOSUN', 38000, true,  'Aylık maaş'),
  ('GÖKHAN GÖK',     50000, true,  'Aylık maaş'),
  ('OKAN ARAN',      55000, true,  'Aylık maaş'),
  ('KERİM AKDOĞAN',  50000, true,  'Aylık maaş'),
  ('VEYSEL ÇARKLI',  46000, true,  'Aylık maaş'),
  ('HAMZA ATTAR',        0, false, 'Ayrıldı — pasif'),
  ('ADEM ACAR',          0, false, 'Maaş girilmedi')
on conflict (personel) do update
  set maas       = excluded.maas,
      aktif      = excluded.aktif,
      aciklama   = excluded.aciklama,
      guncelleme = now();


-- ============================================================================
-- 3) MAAŞ GÜNCELLE (programdan — sadece yönetici)
-- ============================================================================
create or replace function public.maas_guncelle(
  p_personel   text,
  p_maas       numeric,
  p_kullanici  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.buvisan_admin_mi() then
    return jsonb_build_object('yetki_yok', true, 'mesaj', 'Maaş güncellemek için yönetici girişi gerekir.');
  end if;

  if coalesce(trim(p_personel), '') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Personel adı gerekli.');
  end if;

  if coalesce(p_maas, -1) < 0 then
    return jsonb_build_object('ok', false, 'mesaj', 'Maaş negatif olamaz.');
  end if;

  insert into public.personel_maas (personel, maas, aktif, guncelleyen, guncelleme)
  values (trim(p_personel), p_maas, true, p_kullanici, now())
  on conflict (personel) do update
    set maas       = excluded.maas,
        aktif      = true,
        guncelleyen = excluded.guncelleyen,
        guncelleme = now();

  return jsonb_build_object('ok', true,
    'mesaj', trim(p_personel) || ' maaşı güncellendi: ' ||
             to_char(p_maas, 'FM999G999G999') || ' ₺');
end;
$$;

revoke all on function public.maas_guncelle(text, numeric, text) from public;
grant execute on function public.maas_guncelle(text, numeric, text) to authenticated;


-- ============================================================================
-- 4) MAAŞ LİSTESİ
-- ============================================================================
create or replace function public.maas_listesi()
returns table (
  personel    text,
  maas        numeric,
  aktif       boolean,
  aciklama    text,
  guncelleme  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select personel, maas, aktif, aciklama, guncelleme
  from public.personel_maas
  order by aktif desc, maas desc, personel;
$$;

revoke all on function public.maas_listesi() from public;
grant execute on function public.maas_listesi() to authenticated;


-- ============================================================================
-- 5) PUANTAJ AYLIK v2 — maaş önceliği: aylık kayıt → güncel maaş tablosu
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
  v_ay     text := coalesce(p_ay, to_char(current_date, 'YYYY-MM'));
  v_gunluk record;
  v_manuel record;
  v_maas   numeric;
begin
  if not (
    public.buvisan_admin_mi()
    or public.parca_adi_normal(p_personel) = public.parca_adi_normal(public.benim_adim())
  ) then
    return jsonb_build_object('yetki_yok', true, 'mesaj', 'Sadece kendi puantajınızı görebilirsiniz.');
  end if;

  select
    count(*) filter (where not izin_mi) as calisilan_gun,
    count(*) filter (where izin_mi)     as izin_gun,
    coalesce(sum(normal_saat), 0)       as normal_saat,
    coalesce(sum(mesai50_saat), 0)      as m50,
    coalesce(sum(mesai100_saat), 0)     as m100
  into v_gunluk
  from public.puantaj_gunluk
  where public.parca_adi_normal(personel) = public.parca_adi_normal(p_personel)
    and to_char(tarih, 'YYYY-MM') = v_ay;

  select * into v_manuel
  from public.puantaj_manuel
  where public.parca_adi_normal(personel) = public.parca_adi_normal(p_personel)
    and ay = v_ay;

  -- Maaş: aylık kayıtta varsa o (tarihsel), yoksa GÜNCEL maaş tablosundan
  v_maas := coalesce(
    nullif(v_manuel.maas, 0),
    (select pm.maas from public.personel_maas pm
      where public.parca_adi_normal(pm.personel) = public.parca_adi_normal(p_personel)),
    0
  );

  return jsonb_build_object(
    'personel',        p_personel,
    'ay',              v_ay,
    'gunluk_kayit',    coalesce(v_gunluk.calisilan_gun, 0) + coalesce(v_gunluk.izin_gun, 0),
    'calisilan_gun',   coalesce(v_gunluk.calisilan_gun, 0),
    'izin_gun',        coalesce(v_gunluk.izin_gun, 0),
    'normal_saat',     round(coalesce(v_gunluk.normal_saat, 0), 1),
    'mesai50_saat',    round(coalesce(nullif(v_gunluk.m50, 0), v_manuel.mesai50_saat, 0), 1),
    'mesai100_saat',   round(coalesce(nullif(v_gunluk.m100, 0), v_manuel.mesai100_saat, 0), 1),
    'maas',            v_maas,
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
-- 6) PERSONEL KAZANÇ v2 — YENİ puantaj tablolarından beslenir
-- ============================================================================
create or replace function public.personel_kazanc(
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
  v_p    jsonb;
  v_ay   text := coalesce(p_ay, to_char(current_date, 'YYYY-MM'));
  v_maas numeric;
  v_m50  numeric;
  v_m100 numeric;
  v_saatlik numeric;
  v_isler record;
begin
  if not (
    public.buvisan_admin_mi()
    or public.parca_adi_normal(p_personel) = public.parca_adi_normal(public.benim_adim())
  ) then
    return jsonb_build_object('yetki_yok', true, 'mesaj', 'Sadece kendi kazanç bilginizi görebilirsiniz.');
  end if;

  -- Yetki geçtiği için puantaj_aylik güvenle çağrılabilir
  v_p    := public.puantaj_aylik(p_personel, v_ay);
  v_maas := coalesce((v_p ->> 'maas')::numeric, 0);
  v_m50  := coalesce((v_p ->> 'mesai50_saat')::numeric, 0);
  v_m100 := coalesce((v_p ->> 'mesai100_saat')::numeric, 0);
  v_saatlik := public.saatlik_ucret(v_maas);

  select
    count(*) as adet,
    coalesce(sum(cs.price), 0) as ciro,
    coalesce(sum(cs.work_hours), 0) as saat,
    count(*) filter (where extract(dow from cs.service_date) = 6) as cmt,
    count(*) filter (where extract(dow from cs.service_date) = 0) as paz
  into v_isler
  from public.completed_services cs
  where to_char(cs.service_date, 'YYYY-MM') = v_ay
    and coalesce(cs.technician, '') <> ''
    and public.parca_adi_normal(cs.technician) like '%' || public.parca_adi_normal(p_personel) || '%';

  return jsonb_build_object(
    'personel',       p_personel,
    'ay',             v_ay,
    'kayit_var',      (v_maas > 0 or v_m50 > 0 or v_m100 > 0),
    'maas',           v_maas,
    'saatlik_ucret',  v_saatlik,
    'mesai50_saat',   v_m50,
    'mesai50_tutar',  round(v_saatlik * v_m50 * 1.5, 2),
    'mesai100_saat',  v_m100,
    'mesai100_tutar', round(v_saatlik * v_m100 * 2.0, 2),
    'toplam_mesai',   round(v_saatlik * v_m50 * 1.5 + v_saatlik * v_m100 * 2.0, 2),
    'prim',           coalesce((v_p ->> 'prim')::numeric, 0),
    'yemek',          coalesce((v_p ->> 'yemek')::numeric, 0),
    'avans',          coalesce((v_p ->> 'avans')::numeric, 0),
    'kesinti',        coalesce((v_p ->> 'kesinti')::numeric, 0),
    'net_ele_gecen',  round(
        v_maas
        + v_saatlik * v_m50 * 1.5
        + v_saatlik * v_m100 * 2.0
        + coalesce((v_p ->> 'prim')::numeric, 0)
        + coalesce((v_p ->> 'yemek')::numeric, 0)
        - coalesce((v_p ->> 'avans')::numeric, 0)
        - coalesce((v_p ->> 'kesinti')::numeric, 0)
      , 2),
    'is_sayisi',      v_isler.adet,
    'toplam_ciro',    round(v_isler.ciro, 0),
    'calisma_saati',  v_isler.saat,
    'cumartesi_is',   v_isler.cmt,
    'pazar_is',       v_isler.paz,
    'kaynak',         v_p ->> 'kaynak'
  );
end;
$$;

revoke all on function public.personel_kazanc(text, text) from public;
grant execute on function public.personel_kazanc(text, text) to authenticated;


-- ============================================================================
-- 7) GÜVENLİK
-- ============================================================================
alter table public.personel_maas enable row level security;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname='public' and tablename='personel_maas'
  loop
    execute format('drop policy if exists %I on public.personel_maas', r.policyname);
  end loop;
end $$;

create policy personel_maas_yonetici on public.personel_maas
  for all to authenticated
  using (public.buvisan_admin_mi())
  with check (public.buvisan_admin_mi());

revoke all on public.personel_maas from anon;


-- ============================================================================
-- 8) KONTROL
-- ============================================================================
select personel, maas, aktif, aciklama
from public.maas_listesi();

-- Örnek: bir kişinin güncel kazancı
select jsonb_pretty(public.personel_kazanc('GÖKHAN GÖK')) as ornek;
