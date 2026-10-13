-- ============================================================================
--  🔮 ARIZA TAHMİN MOTORU (Büyük Güncelleme #2)
-- ----------------------------------------------------------------------------
--  MANTIK:
--    Bir vinç düzenli aralıklarla arızalanır. Geçmiş servis tarihlerinden
--    ORTALAMA ARIZA ARALIĞI hesaplanır. Son servisin üzerine bu aralık
--    eklendiğinde "tahmini arıza tarihi" çıkar.
--
--    Örnek: Vinç 4 ayda bir arızalanıyorsa ve son servis 5 ay önceyse
--           → GECİKMİŞ, müşteriyi ara.
--
--  NEDEN ÖNEMLİ:
--    Şu an 129 iş emrinin 28'i "Kritik (Makine Durdu)".
--    Yani müşteri arızayı YAŞADIKTAN sonra geliyorsun. Bu motorla
--    arıza olmadan arıyorsun → planlı iş, mutlu müşteri, daha çok ciro.
--
--  ⚠️ Veri değiştirmez. Sadece okur ve hesaplar.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) VİNÇ BAZINDA ARIZA TAHMİNİ
-- ============================================================================
create or replace function public.ariza_tahmini()
returns table (
  crane_id          uuid,
  musteri           text,
  seri_no           text,
  model             text,
  kapasite          text,
  servis_sayisi     bigint,
  ort_aralik_gun    integer,
  son_servis        date,
  gecen_gun         integer,
  tahmini_tarih     date,
  durum_gun         integer,
  risk              text,
  ort_servis_tutari numeric,
  son_ariza         text
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
      max(v.seri_no)    as seri_no,
      max(v.model)      as model,
      max(v.kapasite)   as kapasite,
      count(*)          as servis_sayisi,
      max(v.service_date) as son_servis,
      min(v.service_date) as ilk_servis,
      avg(coalesce(v.price, 0)) as ort_tutar,
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
  son_ariza as (
    select distinct on (v.crane_id) v.crane_id, v.description
    from vinc_servisleri v
    where v.sira = 1
  )
  select
    o.crane_id,
    o.musteri,
    o.seri_no,
    o.model,
    o.kapasite,
    o.servis_sayisi,
    o.ort_aralik,
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
    sa.description
  from ozet o
  left join son_ariza sa on sa.crane_id = o.crane_id
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
-- 2) TAHMİN ÖZETİ
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
    'en_acil_musteri',    (select musteri from t where risk = 'GECİKMİŞ' order by durum_gun asc limit 1)
  );
$$;

revoke all on function public.ariza_ozeti() from public;
grant execute on function public.ariza_ozeti() to authenticated;


-- ============================================================================
-- 3) EN SIK ARIZALAR (arıza kütüphanesinin ilk adımı)
-- ============================================================================
create or replace function public.ariza_kelimeleri(p_limit integer default 25)
returns table (
  kelime     text,
  adet       bigint,
  ort_tutar  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with kelimeler as (
    select unnest(array[
      'switch','diyot','halat','role','kontaktor','kablo','sensor','fren','motor',
      'siren','kumanda','teker','rulman','limit','trafo','sigorta','buton',
      'reduktor','kayis','kaplin','disli','mil','kanca','cerceve','pano',
      'inverter','surucu','enkoder','valf','silindir','pompa','kece','yay',
      'komur','bobin','kondansator','role','klemens','buat','floresan','far'
    ]) as kelime
  )
  select
    k.kelime,
    count(cs.id),
    round(coalesce(avg(cs.price), 0), 0)
  from kelimeler k
  join public.completed_services cs
    on public.parca_adi_normal(cs.description) like '%' || public.parca_adi_normal(k.kelime) || '%'
  group by k.kelime
  having count(cs.id) > 0
  order by count(cs.id) desc
  limit p_limit;
$$;

revoke all on function public.ariza_kelimeleri(integer) from public;
grant execute on function public.ariza_kelimeleri(integer) to authenticated;


-- ============================================================================
-- 4) KONTROL
-- ============================================================================
select
  (public.ariza_ozeti() ->> 'takip_edilen_vinc') as takip_edilen,
  (public.ariza_ozeti() ->> 'gecikmis')          as gecikmis,
  (public.ariza_ozeti() ->> 'yaklasan')          as yaklasan,
  (public.ariza_ozeti() ->> 'ort_aralik_gun')    as ort_aralik_gun,
  (public.ariza_ozeti() ->> 'riskli_potansiyel') as riskli_potansiyel;

-- Takip edilmesi gereken vinçler
select musteri, seri_no, servis_sayisi, ort_aralik_gun, son_servis, gecen_gun, risk, ort_servis_tutari
from public.ariza_tahmini()
where risk in ('GECİKMİŞ', 'YAKLAŞIYOR')
limit 20;
