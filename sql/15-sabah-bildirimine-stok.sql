-- ============================================================================
--  📦 SABAH BİLDİRİMİNE KRİTİK STOK SATIRI EKLE
-- ----------------------------------------------------------------------------
--  Her sabah 07:30'da gelen "günün planı" mesajının sonuna şu satır eklenir:
--     ⚠️ KRİTİK STOK: 3 parça kritik seviyede
--        • 6205 RULMAN (2 adet kaldı)
--        • HALAT 8MM (0 adet kaldı)
--
--  Kritik parça yoksa satır eklenmez (mesaj kısa kalır).
--  ⚠️ Sadece bildirim fonksiyonunu yeniler. Başka hiçbir şeye dokunmaz.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================

create or replace function public.gunluk_plan_gonder()
returns text
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_bot    text := coalesce(current_setting('app.telegram_bot', true), '8567697885:AAGCSyckJKLG11HwTQaMGGUwMyXIm0UqAK0');
  v_grup   text := coalesce(current_setting('app.telegram_grup', true), '-5079408473');
  v_metin  text;
  v_stok   text;
  v_adet   integer;
begin
  -- Bugünün planı
  v_metin := public.gunluk_plan_metni(current_date, '🌅 BUGÜNÜN SERVİS PLANI');

  -- Yarın da iş varsa ekle
  if exists (select 1 from public.randevular
              where randevu_tarihi = current_date + 1 and durum <> 'iptal') then
    v_metin := v_metin || E'\n\n\n' ||
               public.gunluk_plan_metni(current_date + 1, '📌 YARININ PLANI');
  end if;

  -- 📦 KRİTİK STOK UYARISI
  begin
    select count(*) into v_adet from public.kritik_stoklar();

    if v_adet > 0 then
      select string_agg('   • ' || name || ' (' || stok_adet || ' ' || coalesce(unit, 'adet') || ' kaldı)', E'\n')
        into v_stok
      from (
        select name, stok_adet, unit
        from public.kritik_stoklar()
        limit 10
      ) x;

      v_metin := v_metin || E'\n\n\n⚠️ KRİTİK STOK: ' || v_adet || ' parça kritik seviyede' ||
                 E'\n' || coalesce(v_stok, '');
    end if;
  exception when others then
    -- Stok tablosu henüz kurulmadıysa bildirimi bozma
    null;
  end;

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
-- KONTROL: fonksiyon güncellendi mi? (mesajı GÖNDERMEZ, sadece metni üretir)
-- ============================================================================
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'gunluk_plan_gonder')  as fonksiyon_guncel,
  (select count(*) from public.kritik_stoklar())                      as kritik_parca_sayisi,
  (select count(*) from public.materials)                             as toplam_malzeme,
  'Kritik parça 0 ise stok satırı mesaja eklenmez (normal)'           as aciklama;
