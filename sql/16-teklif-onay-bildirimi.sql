-- ============================================================================
--  📣 TEKLİF ONAY HATTI — MÜŞTERİ YANITLAYINCA HABER VER
-- ----------------------------------------------------------------------------
--  SORUN:
--    Müşteri teklif odasında "ONAYLA" veya "REDDET" butonuna basıyor.
--    Teklifin durumu değişiyor ama KİMSEYE HABER GİTMİYOR.
--    Sayfada "operasyon birimimize anında bildirim gönderilecek" yazıyor —
--    bu YANLIŞTI, hiçbir bildirim yoktu.
--
--  ÇÖZÜM:
--    teklif_yanitla() fonksiyonu artık müşteri yanıt verdiği anda
--    Telegram grubuna mesaj gönderiyor:
--
--      🎉 TEKLİF ONAYLANDI!
--      🏢 Müşteri: COATS
--      👤 Yetkili: ABDULLAH DURDURAK
--      💰 Onaylanan Tutar: 13.200 ₺
--      🕐 12.10.2026 19:45
--
--  ⚠️ Aynı teklif iki kez yanıtlanırsa ikinci kez bildirim GİTMEZ
--     (fiyat da değişmez — mevcut koruma devam ediyor).
--  ⚠️ Veriyi değiştirmez; sadece fonksiyonu yeniler.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================

create or replace function public.teklif_yanitla(
  p_id          uuid,
  p_durum       text,
  p_final       numeric,
  p_secenekler  jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_etkilenen integer;
  v_final     numeric;
  v_musteri   text;
  v_yetkili   text;
  v_bot       text := '8567697885:AAGCSyckJKLG11HwTQaMGGUwMyXIm0UqAK0';
  v_grup      text := '-5079408473';
  v_mesaj     text;
  v_ekstra    text;
  v_ops       jsonb;
begin
  -- --- Geçerlilik kontrolleri ---
  if p_durum not in ('onaylandi', 'reddedildi') then
    raise exception 'GECERSIZ_DURUM';
  end if;

  v_final := greatest(coalesce(p_final, 0), 0);

  -- --- Sadece HENÜZ YANITLANMAMIŞ teklif güncellenebilir ---
  update public.offers
     set status           = p_durum,
         final_price      = v_final,
         selected_options = coalesce(p_secenekler, '{}'::jsonb)
   where id = p_id
     and coalesce(status, '') not in ('onaylandi', 'reddedildi')
  returning customer_name, customer_rep, selected_options
       into v_musteri, v_yetkili, v_ops;

  get diagnostics v_etkilenen = row_count;

  if v_etkilenen = 0 then
    return jsonb_build_object('ok', false, 'mesaj', 'Bu teklif zaten yanıtlanmış.');
  end if;

  -- --- 📣 TELEGRAM BİLDİRİMİ ---
  begin
    v_ekstra := '';

    if v_ops is not null and jsonb_typeof(v_ops) = 'object' then
      if (v_ops ->> 'pesinOdeme') = 'true'       then v_ekstra := v_ekstra || E'\n   ✅ Peşin ödeme (%5 indirim)'; end if;
      if (v_ops ->> 'servisOnceligi') = 'true'   then v_ekstra := v_ekstra || E'\n   ✅ Servis önceliği'; end if;
      if (v_ops ->> 'iscilikGarantisi') = 'true' then v_ekstra := v_ekstra || E'\n   ✅ İşçilik garantisi'; end if;
      if (v_ops ->> 'genelKontrol') = 'true'     then v_ekstra := v_ekstra || E'\n   ✅ Genel kontrol'; end if;
    end if;

    v_mesaj :=
      case when p_durum = 'onaylandi'
           then '🎉 *TEKLİF ONAYLANDI!*'
           else '❌ *TEKLİF REDDEDİLDİ*' end || E'\n\n' ||
      '🏢 *Müşteri:* ' || coalesce(v_musteri, 'Bilinmiyor') || E'\n' ||
      '👤 *Yetkili:* ' || coalesce(v_yetkili, '-') || E'\n' ||
      '💰 *' || case when p_durum = 'onaylandi' then 'Onaylanan Tutar' else 'Reddedilen Tutar' end || ':* ' ||
        to_char(v_final, 'FM999G999G999D00') || ' ₺' ||
      case when v_ekstra <> '' then E'\n\n*Seçilen opsiyonlar:*' || v_ekstra else '' end || E'\n\n' ||
      '🕐 ' || to_char(now() at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI') || E'\n' ||
      '📄 Teklif No: ' || left(p_id::text, 8);

    perform net.http_post(
      url     := 'https://api.telegram.org/bot' || v_bot || '/sendMessage',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object(
                   'chat_id', v_grup,
                   'text', v_mesaj,
                   'parse_mode', 'Markdown',
                   'disable_web_page_preview', true
                 )
    );
  exception when others then
    -- Bildirim gönderilemezse teklif yanıtı YİNE DE kaydedilmiş kalır
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'mesaj', case when p_durum = 'onaylandi'
                  then 'Teklif onaylandı, ekibe haber verildi.'
                  else 'Teklif reddedildi, ekibe haber verildi.' end,
    'tutar', v_final
  );
end;
$$;

revoke all on function public.teklif_yanitla(uuid, text, numeric, jsonb) from public;
grant execute on function public.teklif_yanitla(uuid, text, numeric, jsonb) to anon, authenticated;


-- ============================================================================
-- KONTROL
-- ============================================================================
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'teklif_yanitla')      as fonksiyon_guncel,
  (select count(*) from pg_extension where extname = 'pg_net')        as pg_net_hazir,
  (select count(*) from public.offers
    where coalesce(status,'') not in ('onaylandi','reddedildi'))      as bekleyen_teklif,
  'pg_net 1 olmalı (Telegram gönderimi için), bekleyen teklif sayısı bilgi amaçlı' as aciklama;
