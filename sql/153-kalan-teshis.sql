-- ============================================================================
--  🔍 KALAN 9 İŞ — FORM VAR MI? (Güncelleme #125)
-- ----------------------------------------------------------------------------
--  Her açık arıza için:
--    • Kaç servis raporu var (firma benzerliği 50+)
--    • Kaç bakım formu var
--    • O formlar başka arızalara bağlı mı
--
--  KULLANIM: 152'den SONRA çalıştır.
-- ============================================================================

select
  coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'—') as ariza_firma,
  to_char(st.created_at,'DD.MM.YYYY HH24:MI') as ariza_tarih,
  coalesce(to_jsonb(st)->>'pipeline_status','?') as durum,

  -- SERVİS raporu sayısı (benzerlik 50+)
  (
    select count(*)
    from public.service_reports sr
    where public.firma_benzerlik(
      coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
      coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
    ) >= 50
  ) as servis_form,

  -- Bu formlardan BAĞLI olan
  (
    select count(*)
    from public.service_reports sr
    where coalesce(public.jalan(to_jsonb(sr),'ticket_id'),'') <> ''
      and public.firma_benzerlik(
        coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
        coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
      ) >= 50
  ) as bagli_servis,

  -- BAKIM formu sayısı (benzerlik 50+)
  (
    select count(*)
    from public.bakim_formlari bf
    where public.firma_benzerlik(
      coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
      coalesce(bf.musteri,'')
    ) >= 50
  ) as bakim_form,

  -- En iyi benzerlik skoru (servis)
  (
    select max(public.firma_benzerlik(
      coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
      coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
    ))
    from public.service_reports sr
  ) as en_iyi_skor

from public.service_tickets st
where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
order by st.created_at desc;


-- ============================================================================
-- 2) 🔍 HER ARIZA İÇİN EN İYİ EŞLEŞEN FORM (skor düşük olsa da göster)
-- ============================================================================
select
  coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'—') as ariza_firma,
  to_char(st.created_at,'DD.MM') as ariza,
  (
    select coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'—')
    from public.service_reports sr
    order by public.firma_benzerlik(
      coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
      coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
    ) desc
    limit 1
  ) as en_iyi_form,
  (
    select public.firma_benzerlik(
      coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
      coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
    )
    from public.service_reports sr
    order by public.firma_benzerlik(
      coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
      coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
    ) desc
    limit 1
  ) as skor
from public.service_tickets st
where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
order by st.created_at desc;
