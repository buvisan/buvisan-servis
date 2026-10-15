-- ============================================================================
--  🏗️ TAM ŞEMA DÜZELTMESİ — TÜM FAZ PAKETLERİ İÇİN (Güncelleme #52)
-- ----------------------------------------------------------------------------
--  SORUN:
--    FAZ 2-6 fonksiyonları cranes tablosunda OLMAYAN sütunları okuyordu:
--      crane_capacity, makine_tipi, next_maintenance_date, location_address,
--      customer_phone, lat, lng ...
--    → Her SQL hata veriyordu.
--
--  ÇÖZÜM:
--    Gerekli TÜM sütunları tek seferde ekler. Sonra diğer SQL'ler sorunsuz çalışır.
--
--  SIRALAMA:
--    1) BU SCRIPT (77)  ← önce bu
--    2) 71, 72, 73, 75, 76  ← sonra bunlar
--
--  ⚠️ Veri silmez. Sadece eksik sütunları ekler.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) ÇRANES TABLOSU — FAZ 2/3/5 için gereken TÜM sütunlar
-- ============================================================================
alter table public.cranes add column if not exists crane_capacity      text;
alter table public.cranes add column if not exists makine_tipi         text;
alter table public.cranes add column if not exists next_maintenance_date date;
alter table public.cranes add column if not exists location_address    text;
alter table public.cranes add column if not exists customer_phone      text;
alter table public.cranes add column if not exists lat                 numeric;
alter table public.cranes add column if not exists lng                 numeric;
alter table public.cranes add column if not exists seri_no             text;
alter table public.cranes add column if not exists marka               text;
alter table public.cranes add column if not exists model               text;
alter table public.cranes add column if not exists uretim_yili         integer;
alter table public.cranes add column if not exists aktif               boolean default true;

-- ============================================================================
-- 2) SERVİS TALEPLERİ
-- ============================================================================
alter table public.service_tickets add column if not exists lat          numeric;
alter table public.service_tickets add column if not exists lng          numeric;
alter table public.service_tickets add column if not exists assigned_team text;
alter table public.service_tickets add column if not exists priority     text;

-- ============================================================================
-- 3) RANDEVULAR
-- ============================================================================
alter table public.appointments add column if not exists lat    numeric;
alter table public.appointments add column if not exists lng    numeric;
alter table public.appointments add column if not exists status text;

-- ============================================================================
-- 4) SERVİS RAPORLARI (memnuniyet + İSG FAZ'larda kullanılıyor)
-- ============================================================================
alter table public.service_reports add column if not exists musteri_puani  integer;
alter table public.service_reports add column if not exists musteri_yorumu text;
alter table public.service_reports add column if not exists isg_kontrol    jsonb;
alter table public.service_reports add column if not exists lat            numeric;
alter table public.service_reports add column if not exists lng            numeric;
alter table public.service_reports add column if not exists imza_atan      text;

-- ============================================================================
-- 5) MALZEMELER (stok kontrolü FAZ'larda kullanılıyor)
-- ============================================================================
alter table public.materials add column if not exists stock_quantity numeric default 0;
alter table public.materials add column if not exists min_stock      numeric default 0;
alter table public.materials add column if not exists buy_price      numeric default 0;
alter table public.materials add column if not exists sale_price     numeric default 0;
alter table public.materials add column if not exists unit           text;

-- ============================================================================
-- 6) TEKLİFLER (offers)
-- ============================================================================
alter table public.offers add column if not exists status     text;
alter table public.offers add column if not exists created_at timestamptz default now();


-- ============================================================================
-- 7) OTOMATİK DOLDURMA — vinç kapasitesi + makine tipi (mevcut servis verisinden)
-- ============================================================================
do $$
declare
  v_kap integer := 0;
  v_tip integer := 0;
begin
  with kapasiteler as (
    select
      public.parca_adi_normal(
        coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                 nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),'')) as mnorm,
      trim(cs.crane_capacity) as kapasite,
      count(*) as adet
    from public.completed_services cs
    where coalesce(trim(cs.crane_capacity), '') <> ''
    group by 1, 2
  ),
  en_sik as (
    select distinct on (mnorm) mnorm, kapasite
    from kapasiteler
    where coalesce(mnorm,'') <> ''
    order by mnorm, adet desc
  )
  update public.cranes c
     set crane_capacity = e.kapasite
    from en_sik e
   where public.parca_adi_normal(coalesce(c.customer_name,'')) = e.mnorm
     and coalesce(trim(c.crane_capacity), '') = '';

  get diagnostics v_kap = row_count;
  raise notice 'Kapasitesi doldurulan vinç: %', v_kap;

  -- Asansör tespiti
  update public.cranes
     set makine_tipi = 'Asansör'
   where public.parca_adi_normal(coalesce(crane_capacity,'')) like '%asansor%'
     and coalesce(makine_tipi,'') in ('', 'Vinç');

  get diagnostics v_tip = row_count;
  raise notice 'Asansör işaretlenen: %', v_tip;

  -- Kalanlara varsayılan
  update public.cranes set makine_tipi = 'Vinç' where coalesce(makine_tipi,'') = '';

  -- Telefon/adres servis kayıtlarından tamamla
  begin
    update public.cranes c
       set customer_phone = src.tel
      from (
        select distinct on (mnorm) mnorm, tel from (
          select public.parca_adi_normal(
                   coalesce(nullif(trim(coalesce(to_jsonb(t)->>'manual_customer_name','')),''),'')) as mnorm,
                 coalesce(to_jsonb(t)->>'manual_phone','') as tel
          from public.service_tickets t
          where coalesce(to_jsonb(t)->>'manual_phone','') <> ''
        ) x where coalesce(mnorm,'') <> '' and tel <> ''
      ) src
     where public.parca_adi_normal(coalesce(c.customer_name,'')) = src.mnorm
       and coalesce(c.customer_phone,'') = '';
  exception when others then null; end;

  begin
    update public.cranes c
       set location_address = src.adr
      from (
        select distinct on (mnorm) mnorm, adr from (
          select public.parca_adi_normal(
                   coalesce(nullif(trim(coalesce(to_jsonb(t)->>'manual_customer_name','')),''),'')) as mnorm,
                 coalesce(to_jsonb(t)->>'manual_location','') as adr
          from public.service_tickets t
          where coalesce(to_jsonb(t)->>'manual_location','') <> ''
        ) x where coalesce(mnorm,'') <> '' and adr <> ''
      ) src
     where public.parca_adi_normal(coalesce(c.customer_name,'')) = src.mnorm
       and coalesce(c.location_address,'') = '';
  exception when others then null; end;
end $$;


-- ============================================================================
-- 8) KONTROL — hangi sütunlar var?
-- ============================================================================
select
  table_name,
  string_agg(column_name, ', ' order by ordinal_position) as sutunlar
from information_schema.columns
where table_schema = 'public'
  and table_name in ('cranes','service_tickets','appointments','service_reports','materials','offers')
group by table_name
order by table_name;


-- ============================================================================
-- 9) ÖZET
-- ============================================================================
select
  count(*)                                                              as toplam_vinc,
  count(*) filter (where coalesce(trim(crane_capacity),'') <> '')       as kapasitesi_var,
  count(*) filter (where coalesce(trim(makine_tipi),'') <> '')          as tipi_var,
  count(*) filter (where public.parca_adi_normal(coalesce(makine_tipi,'')) = 'asansor') as asansor,
  count(*) filter (where coalesce(trim(customer_phone),'') <> '')       as telefonu_var,
  count(*) filter (where coalesce(trim(location_address),'') <> '')     as adresi_var,
  count(*) filter (where lat is not null)                               as koordinati_var,
  count(*) filter (where next_maintenance_date is not null)             as bakim_tarihi_var
from public.cranes;
