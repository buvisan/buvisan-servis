-- ============================================================================
--  🏢 ASANSÖR ENTEGRASYONU v2 — KAPASİTE ALANINDAN OTOMATİK
-- ----------------------------------------------------------------------------
--  SENİN TESPİTİN (harika!):
--    "Ben kapasite kısmına hep (2 TON ASANSÖR) gibi yazdım"
--
--  VERİDEN ÇIKAN:
--    • 60 asansör işi · 805.900 ₺
--    • RB KARESİ 39 iş (en büyük müşterin aslında ASANSÖR müşterisi!)
--    • "14 NOLU ASANSÖR", "24 NOLU ASANSÖR" → numaralı bina asansörleri
--
--  BU SCRIPT:
--    1) completed_services tablosuna makine_tipi ekler ve OTOMATİK doldurur
--    2) ASANSÖR ENVANTERİ çıkarır (müşteri + asansör adı + iş sayısı + ciro)
--       → servis kayıtlarından sanal asansör filosu oluşur
--    3) Makine tipi özetini gerçek rakamlarla günceller
--
--  ⚠️ Veri silmez. Sadece yeni sütun ekler ve doldurur.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) SERVİS KAYITLARINA MAKİNE TİPİ (kapasite + açıklamadan otomatik)
-- ============================================================================
alter table public.completed_services
  add column if not exists makine_tipi text default 'Vinç';

create index if not exists idx_cs_makine_tipi on public.completed_services (makine_tipi);

comment on column public.completed_services.makine_tipi is
  'Makine tipi: Vinç / Asansör — kapasite ve açıklama alanından otomatik belirlenir';

-- Otomatik sınıflandırma: kapasite alanında veya açıklamada "asansör" geçiyorsa
update public.completed_services
   set makine_tipi = case
     when public.parca_adi_normal(crane_capacity) like '%asansor%'
       or public.parca_adi_normal(description)    like '%asansor%'
       or public.parca_adi_normal(service_type)   like '%asansor%'
       or public.parca_adi_normal(materials_text) like '%asansor%'
     then 'Asansör'
     else 'Vinç'
   end
 where coalesce(makine_tipi, '') = '';


-- ============================================================================
-- 2) ASANSÖR ENVANTERİ (servis kayıtlarından sanal filo)
--    Her müşterinin her asansörü: kaç kez servis görmüş, ne kadar tutmuş
-- ============================================================================
create or replace function public.asansor_envanteri()
returns table (
  musteri        text,
  asansor_adi    text,
  servis_sayisi  bigint,
  toplam_tutar   numeric,
  ilk_servis     date,
  son_servis     date,
  gecen_gun      integer,
  son_yapilan_is text
)
language sql
stable
security definer
set search_path = public
as $$
  with gruplar as (
    select
      coalesce(cs.customer_text, 'Bilinmiyor') as musteri,
      trim(cs.crane_capacity)                  as asansor_adi,
      count(*)                                 as servis_sayisi,
      sum(coalesce(cs.price, 0))               as toplam,
      min(cs.service_date)                     as ilk,
      max(cs.service_date)                     as son
    from public.completed_services cs
    where cs.makine_tipi = 'Asansör'
      and coalesce(trim(cs.crane_capacity), '') <> ''
    group by 1, 2
  )
  select
    g.musteri,
    g.asansor_adi,
    g.servis_sayisi,
    round(g.toplam, 0),
    g.ilk,
    g.son,
    (current_date - g.son)::int,
    (select cs2.description from public.completed_services cs2
      where coalesce(cs2.customer_text, 'Bilinmiyor') = g.musteri
        and trim(cs2.crane_capacity) = g.asansor_adi
      order by cs2.service_date desc
      limit 1)
  from gruplar g
  order by g.servis_sayisi desc, g.son desc;
$$;

revoke all on function public.asansor_envanteri() from public;
grant execute on function public.asansor_envanteri() to authenticated;


-- ============================================================================
-- 3) MÜŞTERİ BAZINDA ASANSÖR ÖZETİ
-- ============================================================================
create or replace function public.asansor_musterileri()
returns table (
  musteri          text,
  asansor_cesidi   bigint,
  servis_sayisi    bigint,
  toplam_tutar     numeric,
  son_servis       date,
  gecen_gun        integer,
  abonelik_6ay     numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(cs.customer_text, 'Bilinmiyor'),
    count(distinct trim(cs.crane_capacity)),
    count(*),
    round(coalesce(sum(cs.price), 0), 0),
    max(cs.service_date),
    (current_date - max(cs.service_date))::int,
    (public.abonelik_teklifi(greatest(count(distinct trim(cs.crane_capacity)), 1)::int, 6, 0) ->> 'genel_toplam')::numeric
  from public.completed_services cs
  where cs.makine_tipi = 'Asansör'
    and coalesce(trim(cs.customer_text), '') <> ''
  group by cs.customer_text
  order by count(*) desc;
$$;

revoke all on function public.asansor_musterileri() from public;
grant execute on function public.asansor_musterileri() to authenticated;


-- ============================================================================
-- 4) MAKİNE TİPİ ÖZETİ v2 (filo + servis birlikte)
-- ============================================================================
create or replace function public.makine_tipi_ozeti()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    -- Filo kaydı
    'filo_toplam',      (select count(*) from public.cranes),
    'filo_vinc',        (select count(*) from public.cranes where coalesce(makine_tipi,'Vinç') = 'Vinç'),
    'filo_asansor',     (select count(*) from public.cranes where makine_tipi = 'Asansör'),
    -- Servis kayıtları (gerçek işler)
    'servis_toplam',    (select count(*) from public.completed_services),
    'servis_vinc',      (select count(*) from public.completed_services where coalesce(makine_tipi,'Vinç') = 'Vinç'),
    'servis_asansor',   (select count(*) from public.completed_services where makine_tipi = 'Asansör'),
    'asansor_ciro',     (select round(coalesce(sum(price),0),0) from public.completed_services where makine_tipi = 'Asansör'),
    'asansor_musteri',  (select count(distinct public.parca_adi_normal(customer_text))
                          from public.completed_services where makine_tipi = 'Asansör'),
    'asansor_cesidi',   (select count(distinct (public.parca_adi_normal(customer_text) || '|' || public.parca_adi_normal(crane_capacity)))
                          from public.completed_services
                          where makine_tipi = 'Asansör' and coalesce(trim(crane_capacity),'') <> ''),
    'en_buyuk_asansor_musteri',
      (select customer_text from public.completed_services
        where makine_tipi = 'Asansör' group by customer_text order by count(*) desc limit 1)
  );
$$;

revoke all on function public.makine_tipi_ozeti() from public;
grant execute on function public.makine_tipi_ozeti() to authenticated;


-- ============================================================================
-- 5) YENİ GELEN İŞLER İÇİN OTOMATİK ETİKETLEME (tetikleyici)
--    Bundan sonra girilen işler de otomatik sınıflanır.
-- ============================================================================
create or replace function public.makine_tipi_etiketi()
returns trigger
language plpgsql
as $$
begin
  if coalesce(trim(new.makine_tipi), '') = '' then
    new.makine_tipi := case
      when public.parca_adi_normal(new.crane_capacity) like '%asansor%'
        or public.parca_adi_normal(new.description)    like '%asansor%'
        or public.parca_adi_normal(new.service_type)   like '%asansor%'
        or public.parca_adi_normal(new.materials_text) like '%asansor%'
      then 'Asansör'
      else 'Vinç'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_makine_tipi_etiketi on public.completed_services;
create trigger trg_makine_tipi_etiketi
  before insert or update on public.completed_services
  for each row execute function public.makine_tipi_etiketi();


-- ============================================================================
-- 6) KONTROL: ASANSÖR İŞİ GERÇEKTEN KAÇ TANE?
-- ============================================================================
select
  (public.makine_tipi_ozeti() ->> 'servis_asansor')      as asansor_isi,
  (public.makine_tipi_ozeti() ->> 'asansor_ciro')        as asansor_cirosu,
  (public.makine_tipi_ozeti() ->> 'asansor_musteri')     as asansor_musterisi,
  (public.makine_tipi_ozeti() ->> 'asansor_cesidi')      as farkli_asansor,
  (public.makine_tipi_ozeti() ->> 'en_buyuk_asansor_musteri') as en_buyuk;

-- Asansör müşterileri (abonelik fırsatıyla)
select musteri, asansor_cesidi, servis_sayisi, toplam_tutar, gecen_gun, abonelik_6ay
from public.asansor_musterileri()
limit 15;
