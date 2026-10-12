-- ============================================================================
--  BUVISAN - HER SABAH OTOMATIK "GUNUN PLANI" TELEGRAM BILDIRIMI
-- ----------------------------------------------------------------------------
--  Ne yapar?
--    Her is gunu sabahi (varsayilan 07:30 Turkiye saati) servis Telegram
--    grubuna O GUNUN randevu planini ve varsa YARININ planini gonderir.
--
--  Neden Supabase icinde?
--    Ek API adresi, sifre, ek sunucu yok. Vercel mesgul olsa da calisir.
--
--  Nasil calisir?
--    pg_cron  -> zamanlayici (her gun belirlenen saatte tetikler)
--    pg_net   -> Telegram'a HTTP istegi gonderir
--
--  ⚠️ Bu script sonunda GRUBA BIR DENEME MESAJI GONDERIR (dogrulama icin).
--  ⚠️ Hicbir mevcut veriye/tabloya dokunmaz, sadece fonksiyon + zamanlama ekler.
--
--  KULLANIM: Supabase -> SQL Editor -> New query -> tamamini yapistir -> RUN
--
--  SAATI DEGISTIRMEK ICIN: En alttaki '30 4 * * *' degerini degistir.
--     Ornek: 06:00 TR = 03:00 UTC -> '0 3 * * *'
--            08:00 TR = 05:00 UTC -> '0 5 * * *'
--  (pg_cron UTC ile calisir; Turkiye = UTC+3)
-- ============================================================================


-- ============================================================================
-- 1) GEREKLI EKLENTILER (pg_cron = zamanlayici, pg_net = internet istegi)
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      create extension pg_cron;
    exception when others then
      raise exception E'pg_cron eklentisi acilamadi.\nSupabase panelinde: Database > Extensions > "pg_cron" ve "pg_net" ikisini de ACIP bu scripti tekrar calistirin.\nHata: %', sqlerrm;
    end;
  end if;

  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    begin
      create extension pg_net;
    exception when others then
      raise exception E'pg_net eklentisi acilamadi.\nSupabase panelinde: Database > Extensions > "pg_cron" ve "pg_net" ikisini de ACIP bu scripti tekrar calistirin.\nHata: %', sqlerrm;
    end;
  end if;
end $$;


-- ============================================================================
-- 2) TURKCE TARIH YARDIMCILARI
-- ============================================================================
create or replace function public.tr_gun_adi(p_tarih date)
returns text
language sql
immutable
as $$
  select case extract(dow from p_tarih)
           when 0 then 'Pazar'   when 1 then 'Pazartesi' when 2 then 'Salı'
           when 3 then 'Çarşamba' when 4 then 'Perşembe'  when 5 then 'Cuma'
           else 'Cumartesi' end;
$$;

create or replace function public.tr_tarih_yazi(p_tarih date)
returns text
language sql
immutable
as $$
  select to_char(p_tarih, 'DD') || ' ' ||
         (case extract(month from p_tarih)
            when 1 then 'Ocak'   when 2 then 'Şubat'  when 3 then 'Mart'
            when 4 then 'Nisan'  when 5 then 'Mayıs'  when 6 then 'Haziran'
            when 7 then 'Temmuz' when 8 then 'Ağustos' when 9 then 'Eylül'
            when 10 then 'Ekim'  when 11 then 'Kasım' else 'Aralık' end) ||
         ' ' || to_char(p_tarih, 'YYYY') || ', ' || public.tr_gun_adi(p_tarih);
$$;


-- ============================================================================
-- 3) PLAN METNINI HAZIRLAYAN FONKSIYON
-- ============================================================================
create or replace function public.gunluk_plan_metni(p_tarih date, p_baslik text default '📋 PLAN')
returns text
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select slot, musteri_adi, yetkili, telefon, adres, vinc_bilgisi, is_tipi, atanan_personel
    from public.randevular
    where randevu_tarihi = p_tarih
      and durum <> 'iptal'
    order by slot
  )
  select
    p_baslik || ' — ' || public.tr_tarih_yazi(p_tarih) || E'\n' ||
    '━━━━━━━━━━━━━━━━━━' || E'\n' ||
    coalesce(
      (select string_agg(
          (case is_tipi when 'ariza' then '🔴' when 'kesif' then '🟣' else '🔵' end)
          || ' ' || slot || ') ' || musteri_adi ||
          E'\n   📞 ' || coalesce(telefon, 'telefon yok') ||
          case when coalesce(adres, '') <> ''        then E'\n   📍 ' || adres        else '' end ||
          case when coalesce(vinc_bilgisi, '') <> '' then E'\n   🏗️ ' || vinc_bilgisi else '' end ||
          case when coalesce(atanan_personel, '') <> '' then E'\n   👷 ' || atanan_personel else '' end,
          E'\n\n' order by slot)
       from r),
      '✅ Bu gün için planlanmış iş yok.') ||
    E'\n' || '━━━━━━━━━━━━━━━━━━' || E'\n' ||
    'Toplam: ' || (select count(*) from r) || ' iş';
$$;


-- ============================================================================
-- 4) TELEGRAM'A GONDEREN FONKSIYON
-- ============================================================================
create or replace function public.gunluk_plan_gonder()
returns text
language plpgsql
security definer
set search_path = public, net
as $$
declare
  -- Mevcut sistemde kullanilan servis botu ve grup (ayni degerler)
  v_bot   text := '8567697885:AAGCSyckJKLG11HwTQaMGGUwMyXIm0UqAK0';
  v_grup  text := '-5079408473';
  v_metin text;
begin
  -- Bugunun plani
  v_metin := public.gunluk_plan_metni(current_date, '🌅 BUGÜNÜN SERVİS PLANI');

  -- Yarin da is varsa ekle
  if exists (select 1 from public.randevular
              where randevu_tarihi = current_date + 1 and durum <> 'iptal') then
    v_metin := v_metin || E'\n\n\n' ||
               public.gunluk_plan_metni(current_date + 1, '📌 YARININ PLANI');
  end if;

  perform net.http_post(
    url     := 'https://api.telegram.org/bot' || v_bot || '/sendMessage',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
                 'chat_id', v_grup,
                 'text', v_metin,
                 'disable_web_page_preview', true
               )
  );

  return v_metin;
end;
$$;


-- ============================================================================
-- 5) ZAMANLAMA (her gun 04:30 UTC = 07:30 Turkiye saati)
-- ============================================================================
do $$
begin
  if exists (select 1 from cron.job where jobname = 'buvisan-gunluk-plan') then
    perform cron.unschedule('buvisan-gunluk-plan');
  end if;
end $$;

select cron.schedule(
  'buvisan-gunluk-plan',
  '30 4 * * *',                         -- 04:30 UTC = 07:30 TR  (degistirmek icin burayi duzenle)
  $$select public.gunluk_plan_gonder();$$
);


-- ============================================================================
-- 6) DOGRULAMA
-- ============================================================================

-- 6a) Zamanlama kayitli mi?
select jobid, jobname, schedule, active, database
from cron.job
where jobname = 'buvisan-gunluk-plan';

-- 6b) ŞİMDİ deneme mesajı gönder (gruba düşecek mesajın aynısı)
select public.gunluk_plan_gonder() as gonderilen_mesaj;
