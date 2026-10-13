-- ============================================================================
--  🦺 İSG KONTROL LİSTESİ + ⭐ MEMNUNİYET PUANI (Güncelleme #19)
-- ----------------------------------------------------------------------------
--  SENİN İSTEĞİN:
--    1) İSG (iş sağlığı ve güvenliği) kontrol listesi
--       → Yüksekte çalışma öncesi zorunlu adımlar + fotoğraf kanıtı
--       → Hem GERÇEK güvenlik hem YASAL koruma
--    2) Müşteri memnuniyet puanı (imza ekranında 1-5 yıldız)
--
--  ⚠️ Sadece YENİ SÜTUN ekler. Mevcut veriye dokunmaz.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) SAHA RAPORUNA İSG + MEMNUNİYET ALANLARI
-- ============================================================================
alter table public.service_reports
  add column if not exists isg_kontrol   jsonb default '[]'::jsonb,
  add column if not exists isg_foto_url  text,
  add column if not exists musteri_puani integer,
  add column if not exists musteri_yorumu text;

comment on column public.service_reports.isg_kontrol    is 'İSG kontrol listesi: [{madde, tamam}]';
comment on column public.service_reports.isg_foto_url   is 'İSG kanıt fotoğrafı (emniyet kemeri, bariyer vb.)';
comment on column public.service_reports.musteri_puani  is 'Müşteri memnuniyet puanı (1-5)';
comment on column public.service_reports.musteri_yorumu is 'Müşterinin kısa yorumu (isteğe bağlı)';

-- Puan 1-5 arası olsun (boş olabilir)
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'service_reports' and constraint_name = 'service_reports_musteri_puani_chk'
  ) then
    alter table public.service_reports
      add constraint service_reports_musteri_puani_chk
      check (musteri_puani is null or (musteri_puani >= 1 and musteri_puani <= 5));
  end if;
exception when others then null;
end $$;


-- ============================================================================
-- 2) MEMNUNİYET ÖZETİ (kim iyi hizmet veriyor?)
-- ============================================================================
create or replace function public.memnuniyet_ozeti()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'puanlanan_is',    (select count(*) from public.service_reports where musteri_puani is not null),
    'ortalama_puan',   round(coalesce((select avg(musteri_puani) from public.service_reports where musteri_puani is not null), 0)::numeric, 2),
    'bes_yildiz',      (select count(*) from public.service_reports where musteri_puani = 5),
    'tek_yildiz',      (select count(*) from public.service_reports where musteri_puani = 1),
    'isg_dolgulu',     (select count(*) from public.service_reports
                         where jsonb_array_length(coalesce(isg_kontrol, '[]'::jsonb)) > 0),
    'isg_fotolu',      (select count(*) from public.service_reports where coalesce(isg_foto_url, '') <> '')
  );
$$;

revoke all on function public.memnuniyet_ozeti() from public;
grant execute on function public.memnuniyet_ozeti() to authenticated;


-- ============================================================================
-- 3) PERSONEL BAZINDA MEMNUNİYET (kim ne kadar beğeniliyor?)
-- ============================================================================
create or replace function public.personel_memnuniyet()
returns table (
  personel      text,
  is_sayisi     bigint,
  puanlanan     bigint,
  ort_puan      numeric,
  bes_yildiz    bigint,
  dusuk_puan    bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(nullif(trim(personel_adi), ''), 'Bilinmiyor'),
    count(*),
    count(*) filter (where musteri_puani is not null),
    round(coalesce(avg(musteri_puani) filter (where musteri_puani is not null), 0)::numeric, 2),
    count(*) filter (where musteri_puani = 5),
    count(*) filter (where musteri_puani is not null and musteri_puani <= 2)
  from public.service_reports
  group by 1
  order by round(coalesce(avg(musteri_puani) filter (where musteri_puani is not null), 0)::numeric, 2) desc;
$$;

revoke all on function public.personel_memnuniyet() from public;
grant execute on function public.personel_memnuniyet() to authenticated;


-- ============================================================================
-- 4) KONTROL
-- ============================================================================
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'service_reports'
      and column_name in ('isg_kontrol','isg_foto_url','musteri_puani','musteri_yorumu'))  as yeni_sutun_sayisi,
  (public.memnuniyet_ozeti() ->> 'puanlanan_is')  as puanlanan_is,
  (public.memnuniyet_ozeti() ->> 'ortalama_puan') as ortalama_puan;
