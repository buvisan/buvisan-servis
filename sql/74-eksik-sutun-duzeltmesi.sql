-- ============================================================================
--  🔧 EKSİK SÜTUN DÜZELTMESİ (Güncelleme #51) — KRİTİK
-- ----------------------------------------------------------------------------
--  HATA:
--    • SQL 71 → column "crane_capacity" does not exist  (cranes tablosunda)
--    • SQL 72 → column c.crane_capacity does not exist  (cranes tablosunda)
--
--  SEBEP:
--    completed_services.crane_capacity  → VAR ✅ (asansör tespiti buradan yapılıyor)
--    cranes.crane_capacity              → YOK ❌
--    FAZ 2 ve FAZ 3 fonksiyonları cranes'ten okumaya çalıştı → hata
--
--  ÇÖZÜM (en temiz yol):
--    1) Eksik sütunu EKLE
--    2) Mevcut servis kayıtlarından OTOMATİK DOLDUR (müşteri adına göre)
--    3) Böylece tüm fonksiyonlar çalışır, veri de zenginleşir
--
--  ⚠️ Veri silmez. Sütun ekler + mevcut veriden doldurur.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) EKSİK SÜTUNLARI EKLE
-- ============================================================================
alter table public.cranes add column if not exists crane_capacity text;
alter table public.cranes add column if not exists makine_tipi    text;

-- Diğer olası eksikler (FAZ paketleri kullanıyor)
alter table public.cranes add column if not exists location_address  text;
alter table public.cranes add column if not exists customer_phone    text;

comment on column public.cranes.crane_capacity is 'Vinç kapasitesi/modeli (örn: 5 TON, ASANSÖR 630)';


-- ============================================================================
-- 2) MEVCUT SERVİS KAYITLARINDAN OTOMATİK DOLDUR
--    (müşteri adına göre en sık kullanılan kapasite)
-- ============================================================================
do $$
declare
  v_doldurulan integer := 0;
begin
  update public.cranes c
     set crane_capacity = src.kapasite
  from (
    select
      public.parca_adi_normal(
        coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                 nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),'')) as mnorm,
      -- En sık geçen kapasite değeri
      (select cs2.crane_capacity
       from public.completed_services cs2
       where public.parca_adi_normal(
               coalesce(nullif(trim(coalesce(to_jsonb(cs2)->>'customer_name','')),''),
                        nullif(trim(coalesce(to_jsonb(cs2)->>'firm_name','')),''),''))
             = public.parca_adi_normal(
                 coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                          nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
         and coalesce(trim(cs2.crane_capacity), '') <> ''
       group by cs2.crane_capacity
       order by count(*) desc
       limit 1) as kapasite
    from public.completed_services cs
    where coalesce(trim(cs.crane_capacity), '') <> ''
    group by 1
  ) src
  where public.parca_adi_normal(coalesce(c.customer_name,'')) = src.mnorm
    and coalesce(trim(c.crane_capacity), '') = ''
    and coalesce(src.kapasite, '') <> '';

  get diagnostics v_doldurulan = row_count;
  raise notice 'Kapasitesi doldurulan vinç: %', v_doldurulan;
end $$;


-- ============================================================================
-- 3) MAKİNE TİPİNİ DE TAMAMLA (asansör/vinç ayrımı)
-- ============================================================================
do $$
declare
  v_asansor integer := 0;
begin
  update public.cranes
     set makine_tipi = 'Asansör'
   where public.parca_adi_normal(coalesce(crane_capacity,'')) like '%asansor%'
     and coalesce(makine_tipi,'') in ('', 'Vinç');

  get diagnostics v_asansor = row_count;
  raise notice 'Asansör olarak işaretlenen: %', v_asansor;

  update public.cranes
     set makine_tipi = 'Vinç'
   where coalesce(makine_tipi,'') = '';
end $$;


-- ============================================================================
-- 4) KONTROL — kaç vinçte kapasite var?
-- ============================================================================
select
  count(*)                                                  as toplam_vinc,
  count(*) filter (where coalesce(trim(crane_capacity),'') <> '') as kapasitesi_var,
  count(*) filter (where coalesce(trim(makine_tipi),'') <> '')    as tipi_var,
  count(*) filter (where public.parca_adi_normal(coalesce(makine_tipi,'')) = 'asansor') as asansor,
  count(*) filter (where public.parca_adi_normal(coalesce(crane_capacity,'')) <> '' and coalesce(customer_phone,'') = '') as telefonsuz,
  count(*) filter (where coalesce(trim(location_address),'') = '') as adressiz
from public.cranes;


-- ============================================================================
-- 5) ÖRNEK — kapasite dağılımı
-- ============================================================================
select
  coalesce(nullif(trim(coalesce(crane_capacity,'')),''), '(boş)') as kapasite,
  count(*) as adet
from public.cranes
group by 1
order by count(*) desc
limit 20;
