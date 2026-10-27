-- ============================================================================
--  🎯 BASİT VE KESİN: ARIZALARI KAPAT (Güncelleme #128)
-- ----------------------------------------------------------------------------
--  SQL 154/155 karmaşık CTE'ler yüzünden çalışmadı.
--  Bu script BASİT UPDATE kullanır — sonucu hemen göreceksin.
--
--  3 ADIM — her biri ayrı, sonucu görünür:
--    ADIM 1: ÖNCE say
--    ADIM 2: KAPAT
--    ADIM 3: SONRA say
--
--  KULLANIM: 153'ten SONRA çalıştır. Veri silmez.
-- ============================================================================


-- ============================================================================
-- ADIM 1) 🔍 ÖNCE SAY — kaç arıza kapatılabilir?
-- ============================================================================
select
  count(*) as kapatilabilir
from public.service_tickets st
where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
  and exists (
    select 1 from public.service_reports sr
    where public.firma_benzerlik(
      coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
      coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
    ) >= 60
    and sr.created_at >= st.created_at - interval '2 days'
    and sr.created_at <= st.created_at + interval '45 days'
  );


-- ============================================================================
-- ADIM 2) 🎯 KAPAT — basit UPDATE (CTE yok)
-- ============================================================================
do $$
declare
  v_kapatilan integer := 0;
  v_kalan integer := 0;
begin
  update public.service_tickets st
     set pipeline_status = 'tamamlandi',
         status = 'tamamlandi'
   where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
     and exists (
       select 1 from public.service_reports sr
       where public.firma_benzerlik(
         coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
         coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
       ) >= 60
       and sr.created_at >= st.created_at - interval '2 days'
       and sr.created_at <= st.created_at + interval '45 days'
     );

  get diagnostics v_kapatilan = row_count;

  select count(*) into v_kalan
  from public.service_tickets st
  where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu');

  raise notice '═══════════════════════════════════';
  raise notice '  KAPATILAN: %', v_kapatilan;
  raise notice '  KALAN   : %', v_kalan;
  raise notice '═══════════════════════════════════';
end $$;


-- ============================================================================
-- ADIM 3) 📋 SON DURUM — kalan işler
-- ============================================================================
select
  coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'—') as firma,
  to_char(st.created_at,'DD.MM.YYYY HH24:MI') as tarih,
  coalesce(to_jsonb(st)->>'pipeline_status','?') as durum
from public.service_tickets st
where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
order by st.created_at desc;


-- ============================================================================
-- ADIM 4) 🔧 KALANLARI BAKIM FORMU İLE KAPAT
-- ============================================================================
do $$
declare
  v_kapatilan integer := 0;
  v_kalan integer := 0;
begin
  update public.service_tickets st
     set pipeline_status = 'tamamlandi',
         status = 'tamamlandi'
   where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
     and exists (
       select 1 from public.bakim_formlari bf
       where public.firma_benzerlik(
         coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
         coalesce(bf.musteri,'')
       ) >= 55
       and bf.created_at >= st.created_at - interval '2 days'
       and bf.created_at <= st.created_at + interval '45 days'
     );

  get diagnostics v_kapatilan = row_count;

  select count(*) into v_kalan
  from public.service_tickets st
  where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu');

  raise notice '═══════════════════════════════════';
  raise notice '  BAKIM İLE KAPATILAN: %', v_kapatilan;
  raise notice '  SON KALAN         : %', v_kalan;
  raise notice '═══════════════════════════════════';
end $$;


-- ============================================================================
-- ADIM 5) 📋 NİHAİ DURUM
-- ============================================================================
select
  coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'—') as firma,
  to_char(st.created_at,'DD.MM.YYYY HH24:MI') as tarih
from public.service_tickets st
where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
order by st.created_at desc;
