-- ============================================================================
--  🔍 PERSONEL KARNESİ FONKSİYONU — KAYNAK KOD (Güncelleme #93)
-- ----------------------------------------------------------------------------
--  SORUN: Personel performans modalında "SON İŞLER" → müşteri adı "isimsiz"
--
--  BU SCRIPT: personel_karnesi() ve ilgili fonksiyonların kaynak kodunu gösterir
--             + müşteri adı nereden okunuyor tespit eder
--
--  KULLANIM: 120'den SONRA çalıştır.
-- ============================================================================

-- 1) Personel ile ilgili fonksiyonlar
select
  p.proname                             as fonksiyon,
  pg_get_function_arguments(p.oid)       as parametreler,
  pg_get_function_result(p.oid)          as donus_tipi
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname like '%karne%' or p.proname like '%personel%' or p.proname like '%siralama%'
       or p.proname like '%skor%' or p.proname like '%yetkinlik%')
order by p.proname;


-- 2) personel_karnesi KAYNAK KODU
select pg_get_functiondef(p.oid) as kaynak_kod
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'personel_karnesi';


-- 3) 🔍 MÜŞTERİ ADI TESTİ — hangi alan dolu?
select
  left(coalesce(to_jsonb(cs)->>'customer_text',''), 42)  as customer_text,
  left(coalesce(to_jsonb(cs)->>'customer_name',''), 42)  as customer_name,
  left(coalesce(to_jsonb(cs)->>'firm_name',''), 42)      as firm_name,
  left(public.cs_isim(to_jsonb(cs)), 42)                 as cs_isim_SONUC,
  coalesce(cs.technician,'-')                            as teknisyen,
  cs.service_date::date                                  as tarih,
  coalesce(cs.price,0)                                   as ucret
from public.completed_services cs
where public.parca_adi_normal(cs.technician) like '%veysel%'
order by cs.service_date desc
limit 6;


-- 4) 🔍 VEYSEL'İN SON İŞLERİ — doğru isimlerle (olması gereken)
select
  cs.service_date::date                    as tarih,
  public.cs_isim(to_jsonb(cs))             as musteri_DOGRU,
  coalesce(cs.service_type,'Servis')       as tip,
  round(coalesce(cs.work_hours,0), 1)      as sure,
  round(coalesce(cs.price,0))              as ucret
from public.completed_services cs
where public.parca_adi_normal(cs.technician) like '%veysel%'
  and coalesce(cs.price,0) > 0
order by cs.service_date desc
limit 8;
