-- ============================================================================
--  🔮 ARIZA TAHMİNİ v2 — İŞ DETAYLARI EKLENDİ
-- ----------------------------------------------------------------------------
--  SENİN İSTEĞİN:
--    "Finans butonunun içinde, bitmiş işlerin ve toplam ödemelerinin
--     yazdığı formlar var. Bunların verisini de arıza tahminine ekle."
--
--  EKLENENLER:
--    • toplam_odeme    → o vincin bugüne kadarki toplam servis tutarı
--    • son_ariza       → en son YAPILAN İŞ (ne iş yapıldı)
--    • son_isler       → son 5 iş: tarih + yapılan iş + tutar (JSON)
--    • ilk_servis      → vincin ilk servis tarihi
--
--  Kaynak: completed_services (Finans → Son İşlemler formlarının yazdığı tablo)
--  ⚠️ Veri değiştirmez.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================

drop function if exists public.ariza_tahmini();


create or replace function public.ariza_tahmini()
returns table (
  crane_id          uuid,
  musteri           text,
  seri_no           text,
  model             text,
  kapasite          text,
  servis_sayisi     bigint,
  ort_aralik_gun    integer,
  ilk_servis        date,
  son_servis        date,
  gecen_gun         integer,
  tahmini_tarih     date,
  durum_gun         integer,
  risk              text,
  ort_servis_tutari numeric,
  toplam_odeme      numeric,
  son_ariza         text,
  son_isler         jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with vinc_servisleri as (
    select
      c.id            as crane_id,
      c.customer_name as musteri,
      c.serial_number as seri_no,
      c.model_name    as model,
      c.capacity      as kapasite,
      cs.service_date,
      cs.description,
      cs.price,
      cs.technician,
      cs.service_type,
      row_number() over (partition by c.id order by cs.service_date desc) as sira
    from public.cranes c
    join public.completed_services cs
      on public.parca_adi_normal(cs.customer_text) = public.parca_adi_normal(c.customer_name)
    where coalesce(trim(c.customer_name), '') <> ''
  ),
  ozet as (
    select
      v.crane_id,
      v.musteri,
      max(v.seri_no)      as seri_no,
      max(v.model)        as model,
      max(v.kapasite)     as kapasite,
      count(*)            as servis_sayisi,
      max(v.service_date) as son_servis,
      min(v.service_date) as ilk_servis,
      avg(coalesce(v.price, 0))   as ort_tutar,
      sum(coalesce(v.price, 0))   as toplam,
      case
        when count(*) >= 2 then
          greatest(
            round((max(v.service_date) - min(v.service_date))::numeric
                  / nullif(count(*) - 1, 0)),
            30
          )::int
        else null
      end as ort_aralik
    from vinc_servisleri v
    group by v.crane_id, v.musteri
  ),
  son_isler as (
    select
      v.crane_id,
      jsonb_agg(
        jsonb_build_object(
          'tarih',      v.service_date,
          'aciklama',   v.description,
          'tutar',      coalesce(v.price, 0),
          'teknisyen',  v.technician,
          'tur',        v.service_type
        ) order by v.service_date desc
      ) as veri
    from vinc_servisleri v
    where v.sira <= 5
    group by v.crane_id
  )
  select
    o.crane_id,
    o.musteri,
    o.seri_no,
    o.model,
    o.kapasite,
    o.servis_sayisi,
    o.ort_aralik,
    o.ilk_servis,
    o.son_servis,
    (current_date - o.son_servis)::int,
    case when o.ort_aralik is not null
         then (o.son_servis + (o.ort_aralik || ' days')::interval)::date
         else null end,
    case when o.ort_aralik is not null
         then ((o.son_servis + (o.ort_aralik || ' days')::interval)::date - current_date)
         else null end,
    case
      when o.ort_aralik is null then 'VERİ YETERSİZ'
      when (current_date - o.son_servis) > o.ort_aralik * 1.3 then 'GECİKMİŞ'
      when (current_date - o.son_servis) > o.ort_aralik * 0.9 then 'YAKLAŞIYOR'
      else 'NORMAL'
    end,
    round(o.ort_tutar, 0),
    round(o.toplam, 0),
    (select si.aciklama from vinc_servisleri si
      where si.crane_id = o.crane_id and si.sira = 1),
    coalesce((select s.veri from son_isler s where s.crane_id = o.crane_id), '[]'::jsonb)
  from ozet o
  order by
    case
      when o.ort_aralik is null then 2
      when (current_date - o.son_servis) > o.ort_aralik * 1.3 then 0
      when (current_date - o.son_servis) > o.ort_aralik * 0.9 then 1
      else 2
    end,
    (current_date - o.son_servis) desc;
$$;

revoke all on function public.ariza_tahmini() from public;
grant execute on function public.ariza_tahmini() to authenticated;


-- ============================================================================
-- BAKIM FIRSATLARINA DA İŞ DETAYI EKLE (aynı istek)
-- ============================================================================
drop function if exists public.bakim_firsatlari();

create or replace function public.bakim_firsatlari()
returns table (
  crane_id        uuid,
  musteri         text,
  seri_no         text,
  model           text,
  kapasite        text,
  adres           text,
  son_servis      date,
  gecen_ay        integer,
  toplam_is       bigint,
  musteri_cirosu  numeric,
  sozlesme_var    boolean,
  risk            text,
  tahmini_teklif  numeric,
  son_isler       jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with servisler as (
    select
      public.parca_adi_normal(cs.customer_text) as firma_norm,
      max(cs.service_date)                      as son_servis,
      count(*)                                  as is_sayisi,
      sum(coalesce(cs.price, 0))                as toplam_ciro,
      avg(coalesce(cs.price, 0))                as ort_is
    from public.completed_services cs
    where coalesce(trim(cs.customer_text), '') <> ''
    group by 1
  ),
  musteri_isler as (
    select
      public.parca_adi_normal(cs.customer_text) as firma_norm,
      jsonb_agg(
        jsonb_build_object(
          'tarih',    cs.service_date,
          'aciklama', cs.description,
          'tutar',    coalesce(cs.price, 0)
        ) order by cs.service_date desc
      ) filter (where cs.id is not null) as veri
    from (
      select *, row_number() over (
        partition by public.parca_adi_normal(customer_text)
        order by service_date desc) as sira
      from public.completed_services
      where coalesce(trim(customer_text), '') <> ''
    ) cs
    where cs.sira <= 5
    group by 1
  ),
  sozlesmeliler as (
    select distinct public.parca_adi_normal(company_name) as firma_norm
    from public.maintenance_contracts
    where coalesce(trim(company_name), '') <> ''
  )
  select
    c.id,
    coalesce(c.customer_name, 'Bilinmiyor'),
    c.serial_number,
    c.model_name,
    c.capacity,
    c.location_address,
    s.son_servis,
    case
      when s.son_servis is null then 999
      else (extract(year from age(current_date, s.son_servis)) * 12
            + extract(month from age(current_date, s.son_servis)))::int
    end,
    coalesce(s.is_sayisi, 0),
    round(coalesce(s.toplam_ciro, 0), 0),
    (so.firma_norm is not null),
    case
      when so.firma_norm is not null then 'SÖZLEŞMELİ'
      when s.son_servis is null        then 'HİÇ SERVİS ALMAMIŞ'
      when (extract(year from age(current_date, s.son_servis)) * 12
            + extract(month from age(current_date, s.son_servis))) >= 8 then 'YÜKSEK RİSK'
      when (extract(year from age(current_date, s.son_servis)) * 12
            + extract(month from age(current_date, s.son_servis))) >= 5 then 'ORTA RİSK'
      else 'YAKINDA'
    end,
    greatest(round(coalesce(s.ort_is, 0)), 5000),
    coalesce((select mi.veri from musteri_isler mi
               where mi.firma_norm = public.parca_adi_normal(c.customer_name)), '[]'::jsonb)
  from public.cranes c
  left join servisler s      on s.firma_norm  = public.parca_adi_normal(c.customer_name)
  left join sozlesmeliler so on so.firma_norm = public.parca_adi_normal(c.customer_name)
  where so.firma_norm is null
    and coalesce(trim(c.customer_name), '') <> ''
  order by
    case when s.son_servis is null then 1 else 0 end,
    s.son_servis asc nulls first;
$$;

revoke all on function public.bakim_firsatlari() from public;
grant execute on function public.bakim_firsatlari() to authenticated;


-- ============================================================================
-- ARIZA ÖZETİ (v2 — değişmedi, fonksiyonu tazele)
-- ============================================================================
create or replace function public.ariza_ozeti()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with t as (select * from public.ariza_tahmini())
  select jsonb_build_object(
    'takip_edilen_vinc',  (select count(*) from t),
    'gecikmis',           (select count(*) from t where risk = 'GECİKMİŞ'),
    'yaklasan',           (select count(*) from t where risk = 'YAKLAŞIYOR'),
    'normal',             (select count(*) from t where risk = 'NORMAL'),
    'veri_yetersiz',      (select count(*) from t where risk = 'VERİ YETERSİZ'),
    'ort_aralik_gun',     round(coalesce((select avg(ort_aralik_gun) from t where ort_aralik_gun is not null), 0)),
    'riskli_potansiyel',  round(coalesce((select sum(ort_servis_tutari) from t where risk in ('GECİKMİŞ','YAKLAŞIYOR')), 0)),
    'toplam_servis_degeri', round(coalesce((select sum(toplam_odeme) from t), 0))
  );
$$;

revoke all on function public.ariza_ozeti() from public;
grant execute on function public.ariza_ozeti() to authenticated;


-- ============================================================================
-- KONTROL: iş detayları geldi mi?
-- ============================================================================
select
  (public.ariza_ozeti() ->> 'takip_edilen_vinc')      as takip_edilen,
  (public.ariza_ozeti() ->> 'gecikmis')               as gecikmis,
  (public.ariza_ozeti() ->> 'yaklasan')               as yaklasan,
  (public.ariza_ozeti() ->> 'toplam_servis_degeri')   as toplam_servis_degeri;

-- İş detaylarıyla birlikte ilk 5 vinç
select musteri, seri_no, servis_sayisi, toplam_odeme, son_servis, risk,
       left(coalesce(son_ariza, '-'), 60) as son_yapilan_is,
       jsonb_array_length(son_isler)      as is_detay_sayisi
from public.ariza_tahmini()
limit 5;
