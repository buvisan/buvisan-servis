-- ============================================================================
--  📅 BAKIM ABONELİK MOTORU (Büyük Güncelleme #3)
-- ----------------------------------------------------------------------------
--  VERİDEN ÇIKAN GERÇEK:
--    • 288 vinç · 172 müşteri · SADECE 7 bakım sözleşmesi
--    • Yani 281 vinç SÖZLEŞMESİZ → her biri düzenli gelire çevrilebilir
--
--  ÖNEMLİ TEKNİK NOT:
--    624 servis kaydının hiçbiri vinç kimliğine bağlı değil (crane_id boş).
--    Bu yüzden servis geçmişi MÜŞTERİ ADINDAN eşleştirilir (Türkçe karakter
--    ve yazım farkı toleranslı). Böylece vinç bağlantısı kurulmadan da
--    "bu vinç ne zaman servis gördü" sorusu cevaplanabilir.
--
--  BU SCRIPT NE KURAR:
--    1) bakim_firsatlari()   → hangi vinç bakım istiyor, risk seviyesi, tahmini teklif
--    2) bakim_ozeti()        → toplam fırsat: kaç vinç, tahmini yıllık gelir
--    3) abonelik_aday_musteriler() → müşteri bazlı filo sağlık raporu
--
--  ⚠️ Veri değiştirmez. Sadece okur ve hesaplar.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) BAKIM ZAMANI GELEN VİNÇLER (fırsat listesi)
-- ============================================================================
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
  tahmini_teklif  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with servisler as (
    select
      public.parca_adi_normal(cs.customer_text)          as firma_norm,
      max(cs.service_date)                               as son_servis,
      count(*)                                           as is_sayisi,
      sum(coalesce(cs.price, 0))                         as toplam_ciro,
      avg(coalesce(cs.price, 0))                         as ort_is
    from public.completed_services cs
    where coalesce(trim(cs.customer_text), '') <> ''
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
    end as gecen_ay,
    coalesce(s.is_sayisi, 0),
    round(coalesce(s.toplam_ciro, 0), 0),
    (so.firma_norm is not null),
    case
      when so.firma_norm is not null              then 'SÖZLEŞMELİ'
      when s.son_servis is null                   then 'HİÇ SERVİS ALMAMIŞ'
      when (extract(year from age(current_date, s.son_servis)) * 12
            + extract(month from age(current_date, s.son_servis))) >= 8 then 'YÜKSEK RİSK'
      when (extract(year from age(current_date, s.son_servis)) * 12
            + extract(month from age(current_date, s.son_servis))) >= 5 then 'ORTA RİSK'
      else 'YAKINDA'
    end,
    -- Tahmini bakım teklifi: müşterinin ortalama iş bedeli, en az 5.000 ₺
    greatest(round(coalesce(s.ort_is, 0)), 5000)
  from public.cranes c
  left join servisler s      on s.firma_norm  = public.parca_adi_normal(c.customer_name)
  left join sozlesmeliler so on so.firma_norm = public.parca_adi_normal(c.customer_name)
  where so.firma_norm is null                       -- sözleşmesi olmayanlar
    and coalesce(trim(c.customer_name), '') <> ''
  order by
    case when s.son_servis is null then 1 else 0 end,
    s.son_servis asc nulls first;
$$;

revoke all on function public.bakim_firsatlari() from public;
grant execute on function public.bakim_firsatlari() to authenticated;


-- ============================================================================
-- 2) FIRSAT ÖZETİ (yönetime tek bakışta)
-- ============================================================================
create or replace function public.bakim_ozeti()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with f as (select * from public.bakim_firsatlari())
  select jsonb_build_object(
    'toplam_vinc',        (select count(*) from public.cranes),
    'sozlesmeli_vinc',    (select count(*) from public.cranes) - (select count(*) from f),
    'sozlesmesiz_vinc',   (select count(*) from f),
    'yuksek_risk',        (select count(*) from f where risk = 'YÜKSEK RİSK'),
    'orta_risk',          (select count(*) from f where risk = 'ORTA RİSK'),
    'hic_servis_yok',     (select count(*) from f where risk = 'HİÇ SERVİS ALMAMIŞ'),
    'farkli_musteri',     (select count(distinct musteri) from f),
    'potansiyel_ciro',    round(coalesce((select sum(tahmini_teklif) from f), 0), 0),
    'yillik_abonelik_potansiyeli',
      round(coalesce((select sum(tahmini_teklif) from f where risk in ('YÜKSEK RİSK','ORTA RİSK')), 0), 0)
  );
$$;

revoke all on function public.bakim_ozeti() from public;
grant execute on function public.bakim_ozeti() to authenticated;


-- ============================================================================
-- 3) MÜŞTERİ BAZLI FİLO SAĞLIK RAPORU
--    ("5 vincinizden 3'ünün bakımı gecikmiş" konuşması için)
-- ============================================================================
create or replace function public.abonelik_aday_musteriler()
returns table (
  musteri        text,
  vinc_sayisi    bigint,
  riskli_vinc    bigint,
  son_servis     date,
  toplam_ciro    numeric,
  potansiyel     numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.musteri,
    count(*)                                                as vinc_sayisi,
    count(*) filter (where f.risk in ('YÜKSEK RİSK','ORTA RİSK')) as riskli_vinc,
    max(f.son_servis)                                       as son_servis,
    max(f.musteri_cirosu)                                   as toplam_ciro,
    sum(f.tahmini_teklif)                                   as potansiyel
  from public.bakim_firsatlari() f
  group by f.musteri
  order by count(*) filter (where f.risk in ('YÜKSEK RİSK','ORTA RİSK')) desc,
           count(*) desc;
$$;

revoke all on function public.abonelik_aday_musteriler() from public;
grant execute on function public.abonelik_aday_musteriler() to authenticated;


-- ============================================================================
-- 4) KONTROL: FIRSAT NE KADAR BÜYÜK?
-- ============================================================================
select
  (public.bakim_ozeti() ->> 'toplam_vinc')        as toplam_vinc,
  (public.bakim_ozeti() ->> 'sozlesmeli_vinc')    as sozlesmeli,
  (public.bakim_ozeti() ->> 'sozlesmesiz_vinc')   as sozlesmesiz,
  (public.bakim_ozeti() ->> 'yuksek_risk')        as yuksek_risk,
  (public.bakim_ozeti() ->> 'orta_risk')          as orta_risk,
  (public.bakim_ozeti() ->> 'potansiyel_ciro')    as potansiyel_ciro;

-- En büyük fırsatlar (ilk 15)
select musteri, vinc_sayisi, riskli_vinc, son_servis, potansiyel
from public.abonelik_aday_musteriler()
limit 15;
