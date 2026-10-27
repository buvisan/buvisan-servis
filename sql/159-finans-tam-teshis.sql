-- ============================================================================
--  🔍 FİNANS TABLOSU TAM TEŞHİS (Güncelleme #131)
-- ----------------------------------------------------------------------------
--  DURUM: 10 finans kaydı var, 0 form işaretlendi.
--         Sebep: müşteri adının hangi alanda olduğunu bilmiyoruz.
--
--  BU SCRIPT: tablonun TAMAMINI gösterir
-- ============================================================================


-- 1) 📋 financial_records KOLONLARI
select
  ordinal_position as sira,
  column_name as kolon,
  data_type as tip
from information_schema.columns
where table_schema='public' and table_name='financial_records'
order by ordinal_position;


-- 2) 📄 TÜM KAYITLAR — JSON olarak (her alan görünür)
select
  id,
  to_jsonb(fr) as tum_alanlar
from public.financial_records fr
order by coalesce(to_jsonb(fr)->>'month_key','') desc
limit 10;


-- 3) 🎯 HANGI ALAN DOLU?
select
  'firma_adi' as alan,
  count(*) filter (where coalesce(to_jsonb(fr)->>'firma_adi','') <> '') as dolu
from public.financial_records fr
union all
select 'musteri', count(*) filter (where coalesce(to_jsonb(fr)->>'musteri','') <> '')
from public.financial_records fr
union all
select 'musteri_adi', count(*) filter (where coalesce(to_jsonb(fr)->>'musteri_adi','') <> '')
from public.financial_records fr
union all
select 'aciklama', count(*) filter (where coalesce(to_jsonb(fr)->>'aciklama','') <> '')
from public.financial_records fr
union all
select 'description', count(*) filter (where coalesce(to_jsonb(fr)->>'description','') <> '')
from public.financial_records fr
union all
select 'baslik', count(*) filter (where coalesce(to_jsonb(fr)->>'baslik','') <> '')
from public.financial_records fr
union all
select 'firma', count(*) filter (where coalesce(to_jsonb(fr)->>'firma','') <> '')
from public.financial_records fr
union all
select 'title', count(*) filter (where coalesce(to_jsonb(fr)->>'title','') <> '')
from public.financial_records fr
union all
select 'kategori', count(*) filter (where coalesce(to_jsonb(fr)->>'kategori','') <> '')
from public.financial_records fr;


-- 4) 🔍 SERVİS RAPORLARINDAKİ FİRMA ADLARI (karşılaştırma için)
select distinct
  coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'—') as form_firma
from public.service_reports sr
order by 1
limit 20;
