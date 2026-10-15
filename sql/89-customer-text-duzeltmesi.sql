-- ============================================================================
--  🎯 MÜŞTERİ SÜTUNU DÜZELTMESİ — customer_text (Güncelleme #63) — KRİTİK
-- ----------------------------------------------------------------------------
--  BULGU (senin sütun listenden):
--    completed_services'in müşteri sütunu = "customer_text"
--    (customer_name / firm_name / customer DEĞİL!)
--
--  AYRICA: completed_services.crane_id VAR → tam eşleşme mümkün!
--
--  ETKİ: Bu düzeltme olmadan HİÇBİR müşteri eşleşmiyordu →
--        toplam_servis: 0, arıza: 0, son_servis: NULL
--
--  ÇÖZÜM:
--    1) cs_isim() yardımcısı → customer_text ÖNCE, sonra diğerleri
--    2) vinc_saglik_listesi + bakim_takvimi yeniden yazıldı
--    3) crane_id eşleşmesi de eklendi (varsa isimden üstün)
--
--  KULLANIM: 88'den SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) YARDIMCI: servis kaydından müşteri adını çıkar (customer_text ÖNCE)
-- ============================================================================
create or replace function public.cs_isim(p_cs jsonb)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(trim(coalesce(p_cs ->> 'customer_text', '')), ''),      -- ⭐ GERÇEK SÜTUN
    nullif(trim(coalesce(p_cs ->> 'customer_name', '')), ''),
    nullif(trim(coalesce(p_cs ->> 'firm_name', '')), ''),
    nullif(trim(coalesce(p_cs ->> 'customer', '')), ''),
    nullif(trim(coalesce(p_cs ->> 'musteri_adi', '')), ''),
    nullif(trim(coalesce(p_cs ->> 'firma', '')), ''),
    nullif(trim(coalesce(p_cs ->> 'cari_adi', '')), ''),
    nullif(trim(coalesce(p_cs ->> 'musteri', '')), ''),
    ''
  );
$$;

create or replace function public.cs_isim_normal(p_cs jsonb)
returns text
language sql
immutable
as $$
  select public.parca_adi_normal(public.cs_isim(p_cs));
$$;

revoke all on function public.cs_isim(jsonb) from public;
revoke all on function public.cs_isim_normal(jsonb) from public;
grant execute on function public.cs_isim(jsonb) to authenticated;
grant execute on function public.cs_isim_normal(jsonb) to authenticated;


-- ============================================================================
-- 2) 🏗️ VİNÇ SAĞLIK LİSTESİ v3 — customer_text + crane_id eşleşmesi
-- ============================================================================
create or replace function public.vinc_saglik_listesi(
  p_limit     integer default 50,
  p_siralama  text    default 'riskli'
)
returns table (
  crane_id      uuid, musteri text, vinc text, makine_tipi text,
  skor          numeric, seviye text, renk text,
  toplam_servis integer, ariza_sayisi integer,
  son_ariza     text, bakim_tarihi text, gecikme_gun integer
)
language sql
stable
security definer
set search_path = public
as $$
  with vincler as (
    select
      c.id,
      public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') as musteri,
      public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi')) as mnorm,
      coalesce(nullif(public.jalan(to_jsonb(c),'crane_capacity','capacity','kapasite'),''), '—') as kapasite,
      coalesce(nullif(public.jalan(to_jsonb(c),'makine_tipi','machine_type'),''), 'Vinç') as makine,
      nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date as bakim
    from public.cranes c
    where public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
  ),
  -- SERVİS KAYITLARI — isim + crane_id ile eşleşme
  servisler as (
    select
      public.cs_isim_normal(to_jsonb(cs)) as mnorm,
      nullif(trim(coalesce(to_jsonb(cs)->>'crane_id','')),'') as crane_ref,
      count(*)::int as toplam,
      count(*) filter (where
        coalesce(cs.service_type,'') ilike '%arıza%'
        or coalesce(cs.service_type,'') ilike '%ariza%'
        or coalesce(cs.description,'') ~* '(ar[ıi]za|bozuk|de[ğg]i[şs]meli|ka[çc]ak|çalışmıyor|patlak|k[ıi]r[ıi]k)'
      )::int as ariza,
      max(cs.service_date::date) as son
    from public.completed_services cs
    group by 1, 2
  ),
  -- İsimle toplam
  isim_toplam as (
    select mnorm,
           sum(toplam)::int as toplam,
           sum(ariza)::int as ariza,
           max(son) as son
    from servisler where mnorm <> '' group by mnorm
  ),
  -- crane_id ile toplam
  id_toplam as (
    select crane_ref,
           sum(toplam)::int as toplam,
           sum(ariza)::int as ariza,
           max(son) as son
    from servisler where crane_ref is not null group by crane_ref
  ),
  hesaplanan as (
    select
      v.id, v.musteri, v.kapasite, v.makine, v.bakim,
      -- ÖNCE crane_id eşleşmesi, SONRA isim eşleşmesi
      coalesce(it.toplam, i.toplam, 0) as toplam,
      coalesce(it.ariza,  i.ariza,  0) as ariza,
      coalesce(it.son,    i.son)       as son,
      case
        when v.bakim is null then 15
        when (v.bakim - current_date) < 0 then greatest(5, 40 - (abs(v.bakim - current_date) / 30.0 * 8))
        when (v.bakim - current_date) <= 30 then 34
        else 40 end as bakim_puan,
      case
        when coalesce(it.toplam, i.toplam, 0) = 0 then 18
        when coalesce(it.ariza, i.ariza, 0) = 0 then 25
        when coalesce(it.ariza, i.ariza, 0) <= 2 then 20
        when coalesce(it.ariza, i.ariza, 0) <= 5 then 13
        when coalesce(it.ariza, i.ariza, 0) <= 10 then 7
        else 3 end as ariza_puan,
      case
        when coalesce(it.son, i.son) is null then 16
        when (current_date - coalesce(it.son, i.son)) <= 30 then 4
        when (current_date - coalesce(it.son, i.son)) <= 90 then 9
        when (current_date - coalesce(it.son, i.son)) <= 180 then 14
        else 20 end as tazelik_puan
    from vincler v
    left join id_toplam  it on it.crane_ref = v.id::text
    left join isim_toplam i on i.mnorm     = v.mnorm
  )
  select
    h.id, h.musteri, h.kapasite, h.makine,
    greatest(0, least(100, round(h.bakim_puan + h.ariza_puan + h.tazelik_puan + 12, 1))),
    case when (h.bakim_puan + h.ariza_puan + h.tazelik_puan + 12) >= 80 then '🟢 İYİ'
         when (h.bakim_puan + h.ariza_puan + h.tazelik_puan + 12) >= 60 then '🟡 ORTA'
         when (h.bakim_puan + h.ariza_puan + h.tazelik_puan + 12) >= 40 then '🟠 ZAYIF'
         else '🔴 KÖTÜ' end,
    case when (h.bakim_puan + h.ariza_puan + h.tazelik_puan + 12) >= 80 then 'emerald'
         when (h.bakim_puan + h.ariza_puan + h.tazelik_puan + 12) >= 60 then 'amber'
         when (h.bakim_puan + h.ariza_puan + h.tazelik_puan + 12) >= 40 then 'orange'
         else 'rose' end,
    h.toplam, h.ariza,
    case when h.son is not null then to_char(h.son,'DD.MM.YYYY') else null end,
    case when h.bakim is not null then to_char(h.bakim,'DD.MM.YYYY') else null end,
    case when h.bakim is not null then (current_date - h.bakim) else null end
  from hesaplanan h
  order by
    case when p_siralama = 'iyi' then -(h.bakim_puan + h.ariza_puan + h.tazelik_puan)
         when p_siralama = 'musteri' then 0
         else (h.bakim_puan + h.ariza_puan + h.tazelik_puan) end asc,
    h.musteri asc
  limit greatest(1, least(coalesce(p_limit, 50), 500));
$$;

revoke all on function public.vinc_saglik_listesi(integer, text) from public;
grant execute on function public.vinc_saglik_listesi(integer, text) to authenticated;


-- ============================================================================
-- 3) 🗓️ BAKIM TAKVİMİ v3 — customer_text ile
-- ============================================================================
drop function if exists public.bakim_takvimi(integer, integer);

create or replace function public.bakim_takvimi(
  p_yil integer default null, p_limit integer default 60
)
returns table (
  crane_id uuid, musteri text, vinc text, makine_tipi text,
  aylar jsonb, son_bakim text, sonraki text, gecikme integer,
  sozlesmeli boolean, durum text
)
language sql
stable
security definer
set search_path = public
as $$
  with y as (select coalesce(p_yil, extract(year from current_date)::int) as yil),
  vincler as (
    select
      c.id,
      public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') as musteri,
      public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi')) as mnorm,
      coalesce(nullif(public.jalan(to_jsonb(c),'crane_capacity','capacity','kapasite'),''), '—') as kapasite,
      coalesce(nullif(public.jalan(to_jsonb(c),'makine_tipi','machine_type'),''), 'Vinç') as makine,
      nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date as bakim
    from public.cranes c
    where public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
  ),
  servis_aylari as (
    select
      public.cs_isim_normal(to_jsonb(cs)) as mnorm,
      nullif(trim(coalesce(to_jsonb(cs)->>'crane_id','')),'') as crane_ref,
      extract(month from cs.service_date::date)::int as ay
    from public.completed_services cs, y
    where cs.service_date is not null
      and extract(year from cs.service_date::date)::int = y.yil
  ),
  son_servis as (
    select public.cs_isim_normal(to_jsonb(cs)) as mnorm,
           max(cs.service_date::date) as son
    from public.completed_services cs
    group by 1
  ),
  son_servis_id as (
    select nullif(trim(coalesce(to_jsonb(cs)->>'crane_id','')),'') as crane_ref,
           max(cs.service_date::date) as son
    from public.completed_services cs
    where nullif(trim(coalesce(to_jsonb(cs)->>'crane_id','')),'') is not null
    group by 1
  )
  select
    v.id, v.musteri, v.kapasite, v.makine,
    (select jsonb_agg(jsonb_build_object(
        'ay', mn,
        'durum', case
          when exists (select 1 from servis_aylari sa
                        where sa.ay = mn
                          and (sa.crane_ref = v.id::text or sa.mnorm = v.mnorm)) then 'yapildi'
          when v.bakim is not null and extract(month from v.bakim)::int = mn
               and extract(year from v.bakim)::int = (select yil from y) then 'planli'
          when v.bakim is not null and v.bakim < current_date
               and extract(month from v.bakim)::int = mn then 'gecikti'
          else 'bos' end
      ) order by mn)
      from generate_series(1,12) mn),
    coalesce(
      (select to_char(ss.son,'DD.MM.YYYY') from son_servis_id ss where ss.crane_ref = v.id::text),
      (select to_char(ss.son,'DD.MM.YYYY') from son_servis ss where ss.mnorm = v.mnorm)
    ),
    case when v.bakim is not null then to_char(v.bakim,'DD.MM.YYYY') else null end,
    case when v.bakim is not null then (current_date - v.bakim) else null end,
    public.sozlesmeli_mi(v.id),
    case when v.bakim is null then 'tarihsiz'
         when v.bakim < current_date then 'gecikmis'
         when v.bakim <= current_date + 30 then 'yaklasan'
         else 'planli' end
  from vincler v
  order by
    case when v.bakim is null then 3 when v.bakim < current_date then 1
         when v.bakim <= current_date + 30 then 2 else 4 end,
    v.bakim asc nulls last, v.musteri asc
  limit greatest(1, least(coalesce(p_limit, 60), 500));
$$;

revoke all on function public.bakim_takvimi(integer, integer) from public;
grant execute on function public.bakim_takvimi(integer, integer) to authenticated;


-- ============================================================================
-- 4) 🔍 DOĞRULAMA — crane_id dolu mu?
-- ============================================================================
select
  count(*)                                                          as toplam_servis,
  count(*) filter (where nullif(trim(coalesce(customer_text,'')),'') is not null) as musteri_adi_dolu,
  count(*) filter (where nullif(trim(coalesce(crane_id::text,'')),'') is not null) as crane_id_dolu,
  count(distinct public.parca_adi_normal(customer_text))            as farkli_musteri
from public.completed_services;


-- ============================================================================
-- 5) 🎯 EŞLEŞME TESTİ — ALSA ÇÖZÜM artık bulunuyor mu?
-- ============================================================================
select
  c.customer_name,
  (select count(*) from public.completed_services cs
    where public.parca_adi_normal(cs.customer_text) = public.parca_adi_normal(c.customer_name)) as eslesen_servis
from public.cranes c
where public.parca_adi_normal(c.customer_name) in ('alsa cozum','rb karesi','erbek kalip')
order by 2 desc
limit 10;


-- ============================================================================
-- 6) SONUÇ — sağlık listesi (artık servis geçmişi DOLU olmalı)
-- ============================================================================
select * from public.vinc_saglik_listesi(10, 'riskli');


-- ============================================================================
-- 7) ⏱️ PERFORMANS
-- ============================================================================
do $$
declare v_bas timestamptz; v_adet integer;
begin
  v_bas := clock_timestamp();
  select count(*) into v_adet from public.vinc_saglik_listesi(100, 'riskli');
  raise notice '⏱️ vinc_saglik_listesi: % kayıt · % ms', v_adet,
                round(extract(epoch from (clock_timestamp() - v_bas)) * 1000);

  v_bas := clock_timestamp();
  select count(*) into v_adet from public.bakim_takvimi(null, 100);
  raise notice '⏱️ bakim_takvimi: % kayıt · % ms', v_adet,
                round(extract(epoch from (clock_timestamp() - v_bas)) * 1000);
end $$;
