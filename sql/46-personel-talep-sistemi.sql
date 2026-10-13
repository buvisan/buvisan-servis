-- ============================================================================
--  📋 PERSONEL TALEP SİSTEMİ + ADEM ACAR PASİF (Güncelleme #24)
-- ----------------------------------------------------------------------------
--  1) Adem Acar ayrıldı → pasife alınır (verisi silinmez)
--  2) TALEPLERİM: personel yönetimden şunları isteyebilir:
--       ⛱️ İZİN    · 💰 AVANS    · 📦 MALZEME    · 🔧 ARIZA BİLDİRİMİ
--     Yönetim onaylar/reddeder, personel durumunu görür.
--
--  ⚠️ Yeni tablo kurar. Mevcut veriye dokunmaz.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) ADEM ACAR'I PASİFE AL (veri silinmez)
-- ============================================================================
update public.personel_maas
   set aktif = false,
       aciklama = coalesce(aciklama, '') || ' (ayrıldı)'
 where public.parca_adi_normal(personel) = public.parca_adi_normal('ADEM ACAR');


-- ============================================================================
-- 2) TALEP TABLOSU
-- ============================================================================
create table if not exists public.personel_talepler (
  id            uuid primary key default gen_random_uuid(),
  personel      text not null,
  talep_tipi    text not null,          -- IZIN / AVANS / MALZEME / ARIZA
  baslik        text,
  aciklama      text,
  tutar         numeric,                -- avans için
  baslangic     date,                   -- izin başlangıcı
  bitis         date,                   -- izin bitişi
  oncelik       text default 'NORMAL',  -- DUSUK / NORMAL / ACIL
  durum         text not null default 'BEKLEMEDE',  -- BEKLEMEDE / ONAYLANDI / REDDEDILDI
  yonetici_notu text,
  cevaplayan    text,
  cevap_tarihi  timestamptz,
  created_at    timestamptz default now()
);

create index if not exists idx_talepler_personel on public.personel_talepler (personel, created_at desc);
create index if not exists idx_talepler_durum    on public.personel_talepler (durum, created_at desc);

comment on table public.personel_talepler is
  'Personel talepleri: izin, avans, malzeme, arıza bildirimi';


-- ============================================================================
-- 3) TALEP GÖNDER (personel kullanır)
-- ============================================================================
create or replace function public.talep_gonder(
  p_talep_tipi text,
  p_baslik     text default null,
  p_aciklama   text default null,
  p_tutar      numeric default null,
  p_baslangic  date default null,
  p_bitis      date default null,
  p_oncelik    text default 'NORMAL'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ben  text := public.benim_adim();
  v_id   uuid;
begin
  if coalesce(trim(v_ben), '') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Kimliğiniz bulunamadı, tekrar giriş yapın.');
  end if;

  if p_talep_tipi not in ('IZIN','AVANS','MALZEME','ARIZA') then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçersiz talep tipi.');
  end if;

  if coalesce(trim(p_baslik), '') = '' and coalesce(trim(p_aciklama), '') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Konu veya açıklama girin.');
  end if;

  insert into public.personel_talepler
    (personel, talep_tipi, baslik, aciklama, tutar, baslangic, bitis, oncelik)
  values
    (v_ben, p_talep_tipi, p_baslik, p_aciklama, p_tutar, p_baslangic, p_bitis,
     coalesce(p_oncelik, 'NORMAL'))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'mesaj', 'Talebiniz gönderildi.');
end;
$$;

revoke all on function public.talep_gonder(text, text, text, numeric, date, date, text) from public;
grant execute on function public.talep_gonder(text, text, text, numeric, date, date, text) to authenticated;


-- ============================================================================
-- 4) TALEPLERİM (personel kendi taleplerini görür)
-- ============================================================================
create or replace function public.taleplerim()
returns table (
  id            uuid,
  talep_tipi    text,
  baslik        text,
  aciklama      text,
  tutar         numeric,
  baslangic     date,
  bitis         date,
  oncelik       text,
  durum         text,
  yonetici_notu text,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select id, talep_tipi, baslik, aciklama, tutar, baslangic, bitis,
         oncelik, durum, yonetici_notu, created_at
  from public.personel_talepler
  where public.parca_adi_normal(personel) = public.parca_adi_normal(public.benim_adim())
  order by created_at desc
  limit 50;
$$;

revoke all on function public.taleplerim() from public;
grant execute on function public.taleplerim() to authenticated;


-- ============================================================================
-- 5) TÜM TALEPLER (yönetim görünümü)
-- ============================================================================
create or replace function public.tum_talepler(p_durum text default null)
returns table (
  id            uuid,
  personel      text,
  talep_tipi    text,
  baslik        text,
  aciklama      text,
  tutar         numeric,
  baslangic     date,
  bitis         date,
  oncelik       text,
  durum         text,
  created_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.buvisan_admin_mi() then
    raise exception 'YETKI_YOK: Tüm talepleri sadece yönetici görebilir.';
  end if;

  return query
  select t.id, t.personel, t.talep_tipi, t.baslik, t.aciklama, t.tutar,
         t.baslangic, t.bitis, t.oncelik, t.durum, t.created_at
  from public.personel_talepler t
  where p_durum is null or t.durum = p_durum
  order by
    case t.oncelik when 'ACIL' then 0 when 'NORMAL' then 1 else 2 end,
    t.created_at desc
  limit 200;
end;
$$;

revoke all on function public.tum_talepler(text) from public;
grant execute on function public.tum_talepler(text) to authenticated;


-- ============================================================================
-- 6) TALEBİ CEVAPLA (yönetim onaylar/reddeder)
-- ============================================================================
create or replace function public.talep_cevapla(
  p_id     uuid,
  p_durum  text,
  p_not    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.buvisan_admin_mi() then
    return jsonb_build_object('yetki_yok', true, 'mesaj', 'Talebi sadece yönetici cevaplayabilir.');
  end if;

  if p_durum not in ('ONAYLANDI','REDDEDILDI','BEKLEMEDE') then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçersiz durum.');
  end if;

  update public.personel_talepler
     set durum = p_durum,
         yonetici_notu = p_not,
         cevaplayan = public.benim_adim(),
         cevap_tarihi = now()
   where id = p_id;

  if not found then
    return jsonb_build_object('ok', false, 'mesaj', 'Talep bulunamadı.');
  end if;

  return jsonb_build_object('ok', true, 'mesaj', 'Talep ' || lower(p_durum) || '.');
end;
$$;

revoke all on function public.talep_cevapla(uuid, text, text) from public;
grant execute on function public.talep_cevapla(uuid, text, text) to authenticated;


-- ============================================================================
-- 7) GÜVENLİK
-- ============================================================================
alter table public.personel_talepler enable row level security;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname='public' and tablename='personel_talepler'
  loop
    execute format('drop policy if exists %I on public.personel_talepler', r.policyname);
  end loop;
end $$;

-- Yönetici hepsini görür/yönetir; personel SADECE kendi talebini görür
create policy talep_yonetici on public.personel_talepler
  for all to authenticated
  using (public.buvisan_admin_mi())
  with check (public.buvisan_admin_mi());

create policy talep_personel_gor on public.personel_talepler
  for select to authenticated
  using (public.parca_adi_normal(personel) = public.parca_adi_normal(public.benim_adim()));

revoke all on public.personel_talepler from anon;


-- ============================================================================
-- 8) KONTROL
-- ============================================================================
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='personel_talepler')    as tablo_kuruldu,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('talep_gonder','taleplerim','tum_talepler','talep_cevapla'))    as fonksiyonlar,
  (select count(*) from public.personel_maas where aktif)              as aktif_personel;

-- Aktif personel ve maaşları
select personel, maas, aktif from public.maas_listesi() where aktif;
