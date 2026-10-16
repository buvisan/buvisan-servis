-- ============================================================================
--  🔍 TEŞHİS — Randevu tarih alanları ve "bugün yapılan" kayıtları
-- ----------------------------------------------------------------------------
--  SORU: Planlayıcı bugün 2 iş gösteriyor (Planlandı) ama sistem 8 "yapıldı"
--        kaydını BUGÜN damgalı sayıyor. Hangisi doğru?
--
--  BU SCRIPT: randevular tablosunun GERÇEK yapısını ve o 8 kaydı gösterir
--
--  KULLANIM: 106'dan SONRA çalıştır.
-- ============================================================================

-- 1) randevular tablosunun TÜM sütunları (tarih alanları kritik)
select string_agg(column_name || ' (' || data_type || ')', ', ' order by ordinal_position) as randevular_sutunlari
from information_schema.columns
where table_schema='public' and table_name='randevular';


-- 2) BUGÜN damgalı "yapıldı" kayıtları — hepsi tek tek
select
  public.randevu_isim(to_jsonb(r))                            as musteri,
  coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum')      as durum,
  to_jsonb(r)->>'appointment_date'                             as appointment_date,
  to_jsonb(r)->>'tarih'                                        as tarih_alani,
  to_jsonb(r)->>'randevu_tarihi'                               as randevu_tarihi,
  to_jsonb(r)->>'tamamlanma_tarihi'                            as tamamlanma,
  to_jsonb(r)->>'created_at'                                   as olusturma
from public.randevular r
where public.parca_adi_normal(coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum',''))
      in ('tamamlandi','tamamlandı','yapildi','yapıldı')
  and nullif(trim(coalesce(to_jsonb(r)->>'tamamlanma_tarihi','')),'') is not null
  and (to_jsonb(r)->>'tamamlanma_tarihi')::timestamptz::date = current_date
order by 1;


-- 3) TÜM randevuların tarih alanları — hangisi dolu?
select
  count(*)                                                        as toplam,
  count(nullif(trim(coalesce(to_jsonb(r)->>'appointment_date','')),'')) as appointment_date_dolu,
  count(nullif(trim(coalesce(to_jsonb(r)->>'tarih','')),''))      as tarih_dolu,
  count(nullif(trim(coalesce(to_jsonb(r)->>'randevu_tarihi','')),'')) as randevu_tarihi_dolu,
  count(nullif(trim(coalesce(to_jsonb(r)->>'tamamlanma_tarihi','')),'')) as tamamlanma_dolu
from public.randevular r;


-- 4) BUGÜN tarihli TÜM randevular (durum ne olursa olsun)
select
  public.randevu_isim(to_jsonb(r))                        as musteri,
  coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum')  as durum,
  to_jsonb(r)->>'appointment_date'                         as appointment_date,
  to_jsonb(r)->>'tarih'                                    as tarih_alani,
  to_jsonb(r)->>'tamamlanma_tarihi'                        as tamamlanma
from public.randevular r
where to_jsonb(r)->>'appointment_date' = to_char(current_date,'YYYY-MM-DD')
   or to_jsonb(r)->>'tarih' = to_char(current_date,'YYYY-MM-DD')
   or to_jsonb(r)->>'randevu_tarihi' = to_char(current_date,'YYYY-MM-DD')
order by 3 nulls last, 4 nulls last;


-- 5) EKİM ayı özeti (planlayıcı "8 yapıldı · 4 bekliyor" diyor)
select
  coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum') as durum,
  count(*) as adet
from public.randevular r
where coalesce(to_jsonb(r)->>'appointment_date', to_jsonb(r)->>'tarih') like '2026-10%'
group by 1 order by 2 desc;


-- 6) SON 20 randevu — tarih + durum + tamamlanma
select
  public.randevu_isim(to_jsonb(r))                        as musteri,
  to_jsonb(r)->>'appointment_date'                         as appt_date,
  to_jsonb(r)->>'tarih'                                    as tarih,
  coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum')  as durum,
  left(coalesce(to_jsonb(r)->>'tamamlanma_tarihi',''), 19)  as tamamlanma,
  left(coalesce(to_jsonb(r)->>'created_at',''), 19)         as olusturma
from public.randevular r
order by coalesce(to_jsonb(r)->>'appointment_date', to_jsonb(r)->>'tarih') desc nulls last
limit 20;
