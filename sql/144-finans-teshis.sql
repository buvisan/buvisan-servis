-- ============================================================================
--  🔍 FİNANS EŞLEŞTİRME TEŞHİSİ (Güncelleme #116)
-- ----------------------------------------------------------------------------
--  DURUM: operasyon_geriye_donuk çalıştı (36 → 3 açık)
--         finans_geriye_donuk 0 işaretledi → SEBEBİNİ BULMAMIZ LAZIM
--
--  KONTROL:
--    1) financial_records kaç kayıt?
--    2) Hangi kolonlar var?
--    3) Firma adı hangi kolonda?
--    4) En iyi eşleşme skoru kaç?
--
--  KULLANIM: 143'ten SONRA çalıştır.
-- ============================================================================


-- 1) 📋 financial_records KOLONLARI
select string_agg(column_name || ' (' || data_type || ')', ', ' order by ordinal_position) as kolonlar
from information_schema.columns
where table_schema='public' and table_name='financial_records';

-- 2) 📊 KAÇ KAYIT VAR?
select count(*) as finans_kayit_sayisi from public.financial_records;

-- 3) 📄 ÖRNEK KAYITLAR (ilk 5)
do $$
declare
  v_var boolean;
begin
  select exists(select 1 from information_schema.tables
    where table_schema='public' and table_name='financial_records') into v_var;
  if v_var then
    raise notice '📋 financial_records VAR';
  else
    raise notice '❌ financial_records YOK';
  end if;
end $$;

select *
from public.financial_records
order by created_at desc nulls last
limit 5;

-- 4) 🎯 EŞLEŞME TESTİ — her finans kaydı için en iyi form
select
  fr.id as finans_id,
  coalesce(
    public.jalan(to_jsonb(fr),'firma_adi','musteri','musteri_adi','aciklama','description','baslik','firma'),
    '—') as finans_firma,
  (
    select coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'—')
    from public.service_reports sr
    order by public.firma_benzerlik(
      coalesce(public.jalan(to_jsonb(fr),'firma_adi','musteri','musteri_adi','aciklama','description','baslik','firma'),''),
      coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
    ) desc
    limit 1
  ) as en_iyi_form,
  (
    select public.firma_benzerlik(
      coalesce(public.jalan(to_jsonb(fr),'firma_adi','musteri','musteri_adi','aciklama','description','baslik','firma'),''),
      coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
    )
    from public.service_reports sr
    order by public.firma_benzerlik(
      coalesce(public.jalan(to_jsonb(fr),'firma_adi','musteri','musteri_adi','aciklama','description','baslik','firma'),''),
      coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
    ) desc
    limit 1
  ) as skor
from public.financial_records fr
order by fr.created_at desc nulls last
limit 15;

-- 5) 🔍 SERVİS RAPORLARINDAKİ FİRMA ADLARI (örnek)
select distinct
  coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'—') as form_firma
from public.service_reports sr
order by 1
limit 15;
