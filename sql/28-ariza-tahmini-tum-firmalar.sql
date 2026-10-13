-- ============================================================================
--  🔮 ARIZA TAHMİNİ v3 — TÜM FİRMALAR + ARIZA AYIKLAMA
-- ----------------------------------------------------------------------------
--  SENİN İSTEĞİN:
--    "Finans butonunun içindeki fiyatı yazan formlardaki firmaların HEPSİNİ
--     buraya dahil etsin, aynı şekilde formun açıklamasından da arızaları
--     ayıklasın ve diğer tahminleri yapsın."
--
--  ARTIK:
--    • Vinç kaydı olsun olmasın, iş yapılan TÜM firmalar analiz edilir
--    • Her firmanın ortalama arıza aralığı hesaplanır
--    • Tahmini arıza tarihi + kaç gün geciktiği çıkar
--    • Açıklama metinlerinden ARIZA TİPLERİ ayıklanır (switch, halat, diyot...)
--    • Son yapılan işler ve toplam ödeme gösterilir
--
--  ⚠️ Veri değiştirmez.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================

drop function if exists public.ariza_tahmini_musteri(integer);


-- ============================================================================
-- 1) FİRMA BAZINDA ARIZA TAHMİNİ (tüm firmalar)
-- ============================================================================
create or replace function public.ariza_tahmini_musteri(p_limit integer default 300)
returns table (
  musteri          text,
  servis_sayisi    bigint,
  ilk_servis       date,
  son_servis       date,
  gecen_gun        integer,
  ort_aralik_gun   integer,
  tahmini_tarih    date,
  durum_gun        integer,
  risk             text,
  toplam_odeme     numeric,
  ort_tutar        numeric,
  son_ariza        text,
  son_isler        jsonb,
  ariza_tipleri    jsonb,
  kayitli_vinc     bigint,
  vinc_serileri    text
)
language sql
stable
security definer
set search_path = public
as $$
  with temel as (
    select
      public.parca_adi_normal(cs.customer_text) as firma_norm,
      min(trim(cs.customer_text))               as musteri,
      count(*)                                  as servis_sayisi,
      min(cs.service_date)                      as ilk_servis,
      max(cs.service_date)                      as son_servis,
      sum(coalesce(cs.price, 0))                as toplam,
      avg(coalesce(cs.price, 0))                as ort_tutar
    from public.completed_services cs
    where coalesce(trim(cs.customer_text), '') <> ''
    group by 1
  ),
  aralik as (
    select
      t.*,
      case
        when t.servis_sayisi >= 2 then
          greatest(
            round((t.son_servis - t.ilk_servis)::numeric / nullif(t.servis_sayisi - 1, 0)),
            20
          )::int
        else null
      end as ort_aralik
    from temel t
  ),
  isler_sirali as (
    select
      public.parca_adi_normal(cs.customer_text) as firma_norm,
      cs.service_date,
      cs.description,
      coalesce(cs.price, 0) as price,
      cs.technician,
      cs.service_type,
      row_number() over (
        partition by public.parca_adi_normal(cs.customer_text)
        order by cs.service_date desc
      ) as sira
    from public.completed_services cs
    where coalesce(trim(cs.customer_text), '') <> ''
  ),
  son_isler as (
    select
      i.firma_norm,
      jsonb_agg(
        jsonb_build_object(
          'tarih',     i.service_date,
          'aciklama',  i.description,
          'tutar',     i.price,
          'teknisyen', i.technician,
          'tur',       i.service_type
        ) order by i.service_date desc
      ) as veri,
      (select i2.description from isler_sirali i2
        where i2.firma_norm = i.firma_norm and i2.sira = 1) as son_aciklama
    from isler_sirali i
    where i.sira <= 5
    group by i.firma_norm
  ),
  -- 🔍 AÇIKLAMALARDAN ARIZA TİPİ AYIKLAMA
  tipler as (
    select
      public.parca_adi_normal(cs.customer_text) as firma_norm,
      k.kelime,
      count(*) as adet
    from public.completed_services cs
    cross join unnest(array[
      'switch','diyot','halat','role','kontaktor','kablo','sensor','fren','motor',
      'siren','kumanda','teker','rulman','limit','trafo','sigorta','buton',
      'reduktor','kayis','kaplin','mil','kanca','inverter','surucu','enkoder',
      'valf','pompa','kece','bobin','klemens','pano','cerceve','fotosel','encoder'
    ]) as k(kelime)
    where public.parca_adi_normal(cs.description) like '%' || public.parca_adi_normal(k.kelime) || '%'
    group by 1, 2
  ),
  tipler_sirali as (
    select t.*, row_number() over (partition by t.firma_norm order by t.adet desc) as sira
    from tipler t
  ),
  tip_json as (
    select
      ts.firma_norm,
      jsonb_agg(jsonb_build_object('tip', ts.kelime, 'adet', ts.adet)
                order by ts.adet desc) as veri
    from tipler_sirali ts
    where ts.sira <= 6
    group by ts.firma_norm
  ),
  vinclar as (
    select
      public.parca_adi_normal(c.customer_name) as firma_norm,
      count(*)                                 as adet,
      string_agg(distinct coalesce(c.serial_number, '-'), ', ') as seriler
    from public.cranes c
    where coalesce(trim(c.customer_name), '') <> ''
    group by 1
  )
  select
    a.musteri,
    a.servis_sayisi,
    a.ilk_servis,
    a.son_servis,
    (current_date - a.son_servis)::int,
    a.ort_aralik,
    case when a.ort_aralik is not null
         then (a.son_servis + (a.ort_aralik || ' days')::interval)::date
         else null end,
    case when a.ort_aralik is not null
         then ((a.son_servis + (a.ort_aralik || ' days')::interval)::date - current_date)
         else null end,
    case
      when a.ort_aralik is null then 'VERİ YETERSİZ'
      when (current_date - a.son_servis) > a.ort_aralik * 1.3 then 'GECİKMİŞ'
      when (current_date - a.son_servis) > a.ort_aralik * 0.9 then 'YAKLAŞIYOR'
      else 'NORMAL'
    end,
    round(a.toplam, 0),
    round(a.ort_tutar, 0),
    si.son_aciklama,
    coalesce(si.veri, '[]'::jsonb),
    coalesce(tj.veri, '[]'::jsonb),
    coalesce(v.adet, 0),
    v.seriler
  from aralik a
  left join son_isler si on si.firma_norm = a.firma_norm
  left join tip_json  tj on tj.firma_norm = a.firma_norm
  left join vinclar   v  on v.firma_norm  = a.firma_norm
  order by
    case
      when a.ort_aralik is null then 2
      when (current_date - a.son_servis) > a.ort_aralik * 1.3 then 0
      when (current_date - a.son_servis) > a.ort_aralik * 0.9 then 1
      else 2
    end,
    (current_date - a.son_servis) desc
  limit p_limit;
$$;

revoke all on function public.ariza_tahmini_musteri(integer) from public;
grant execute on function public.ariza_tahmini_musteri(integer) to authenticated;


-- ============================================================================
-- 2) GÜNCELLENMİŞ ÖZET (tüm firmalar dahil)
-- ============================================================================
create or replace function public.ariza_ozeti_v2()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with t as (select * from public.ariza_tahmini_musteri(1000))
  select jsonb_build_object(
    'takip_edilen_firma',  (select count(*) from t),
    'gecikmis',            (select count(*) from t where risk = 'GECİKMİŞ'),
    'yaklasan',            (select count(*) from t where risk = 'YAKLAŞIYOR'),
    'normal',              (select count(*) from t where risk = 'NORMAL'),
    'veri_yetersiz',       (select count(*) from t where risk = 'VERİ YETERSİZ'),
    'ort_aralik_gun',      round(coalesce((select avg(ort_aralik_gun) from t where ort_aralik_gun is not null), 0)),
    'riskli_ciro',         round(coalesce((select sum(ort_tutar) from t where risk in ('GECİKMİŞ','YAKLAŞIYOR')), 0)),
    'toplam_servis_degeri', round(coalesce((select sum(toplam_odeme) from t), 0)),
    'kayitli_vinc',        (select count(*) from public.cranes),
    'vincsiz_firma',       (select count(*) from t where kayitli_vinc = 0),
    'en_acil_firma',       (select musteri from t where risk = 'GECİKMİŞ'
                             order by gecen_gun desc limit 1)
  );
$$;

revoke all on function public.ariza_ozeti_v2() from public;
grant execute on function public.ariza_ozeti_v2() to authenticated;


-- ============================================================================
-- 3) FİRMA ARIZA GEÇMİŞİ (tek firma detayı — teklif/arama öncesi)
-- ============================================================================
create or replace function public.firma_ariza_gecmisi(p_musteri text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'musteri',       p_musteri,
    'ozet',          (select to_jsonb(x) from (
                        select musteri, servis_sayisi, ilk_servis, son_servis,
                               gecen_gun, ort_aralik_gun, risk, toplam_odeme,
                               son_ariza, ariza_tipleri
                        from public.ariza_tahmini_musteri(1000)
                        where public.parca_adi_normal(musteri) = public.parca_adi_normal(p_musteri)
                        limit 1) x),
    'tum_isler',     (select coalesce(jsonb_agg(
                        jsonb_build_object(
                          'tarih', cs.service_date, 'aciklama', cs.description,
                          'tutar', coalesce(cs.price, 0), 'teknisyen', cs.technician)
                        order by cs.service_date desc), '[]'::jsonb)
                      from public.completed_services cs
                      where public.parca_adi_normal(cs.customer_text) = public.parca_adi_normal(p_musteri)),
    'kullanim_parcalari', (select coalesce(jsonb_agg(distinct p.value ->> 'ad'), '[]'::jsonb)
                      from public.completed_services cs
                      cross join lateral jsonb_array_elements(coalesce(cs.materials, '[]'::jsonb)) p
                      where public.parca_adi_normal(cs.customer_text) = public.parca_adi_normal(p_musteri)
                        and not public.iscilik_kalemi_mi(p.value ->> 'ad'))
  );
$$;

revoke all on function public.firma_ariza_gecmisi(text) from public;
grant execute on function public.firma_ariza_gecmisi(text) to authenticated;


-- ============================================================================
-- 4) KONTROL
-- ============================================================================
select
  (public.ariza_ozeti_v2() ->> 'takip_edilen_firma')    as takip_edilen_firma,
  (public.ariza_ozeti_v2() ->> 'gecikmis')              as gecikmis,
  (public.ariza_ozeti_v2() ->> 'yaklasan')              as yaklasan,
  (public.ariza_ozeti_v2() ->> 'vincsiz_firma')         as vinc_kaydi_olmayan,
  (public.ariza_ozeti_v2() ->> 'toplam_servis_degeri')  as toplam_servis_degeri;

-- Tüm firmalar (arıza tipleriyle)
select musteri, servis_sayisi, ort_aralik_gun, gecen_gun, risk, toplam_odeme,
       jsonb_array_length(ariza_tipleri) as ariza_cesidi,
       left(coalesce(son_ariza, '-'), 50) as son_yapilan_is
from public.ariza_tahmini_musteri(20);
