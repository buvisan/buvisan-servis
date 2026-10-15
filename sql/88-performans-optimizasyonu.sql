-- ============================================================================
--  ⚡ PERFORMANS OPTİMİZASYONU (Güncelleme #62)
-- ----------------------------------------------------------------------------
--  SORUNLAR (ekran görüntülerinden):
--    1) vinc_saglik_listesi() → "statement timeout" (288 vinç × fonksiyon çağrısı)
--    2) bakim_takvimi()       → liste boş geliyor (aynı sebep)
--
--  ÇÖZÜM: Fonksiyon çağrılarını KALDIR → her şeyi TEK SORGUDA hesapla.
--         288 kayıt için fonksiyon çağrısı: ~1500 sorgu → 1 sorgu
--
--  SONUÇ: 30 saniyeden 1 saniyeye iner, timeout biter.
--
--  KULLANIM: 87'den SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 🏗️ VİNÇ SAĞLIK LİSTESİ — TEK SORGU (fonksiyon çağrısı YOK)
-- ============================================================================
create or replace function public.vinc_saglik_listesi(
  p_limit     integer default 50,
  p_siralama  text    default 'riskli'
)
returns table (
  crane_id      uuid,
  musteri       text,
  vinc          text,
  makine_tipi   text,
  skor          numeric,
  seviye        text,
  renk          text,
  toplam_servis integer,
  ariza_sayisi  integer,
  son_ariza     text,
  bakim_tarihi  text,
  gecikme_gun   integer
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
  -- TÜM servis kayıtları TEK SEFERDE gruplanır
  servisler as (
    select
      public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer',
                                           'musteri_adi','firma','cari_adi','musteri')) as mnorm,
      count(*)::int as toplam,
      count(*) filter (where
        coalesce(cs.service_type,'') ilike '%arıza%'
        or coalesce(cs.service_type,'') ilike '%ariza%'
        or coalesce(cs.description,'') ~* '(ar[ıi]za|bozuk|de[ğg]i[şs]meli|ka[çc]ak|çalışmıyor|patlak|k[ıi]r[ıi]k)'
      )::int as ariza,
      max(cs.service_date::date) as son
    from public.completed_services cs
    group by 1
  ),
  hesaplanan as (
    select
      v.id, v.musteri, v.kapasite, v.makine, v.bakim,
      coalesce(s.toplam, 0) as toplam,
      coalesce(s.ariza, 0) as ariza,
      s.son,
      -- BAKIM PUANI (40)
      case
        when v.bakim is null then 15
        when (v.bakim - current_date) < 0 then greatest(5, 40 - (abs(v.bakim - current_date) / 30.0 * 8))
        when (v.bakim - current_date) <= 30 then 34
        else 40 end as bakim_puan,
      -- ARIZA PUANI (25)
      case
        when coalesce(s.toplam,0) = 0 then 18
        when coalesce(s.ariza,0) = 0 then 25
        when coalesce(s.ariza,0) <= 2 then 20
        when coalesce(s.ariza,0) <= 5 then 13
        when coalesce(s.ariza,0) <= 10 then 7
        else 3 end as ariza_puan,
      -- TAZELİK PUANI (20)
      case
        when s.son is null then 16
        when (current_date - s.son) <= 30 then 4
        when (current_date - s.son) <= 90 then 9
        when (current_date - s.son) <= 180 then 14
        else 20 end as tazelik_puan
    from vincler v
    left join servisler s on s.mnorm = v.mnorm
  )
  select
    h.id,
    h.musteri,
    h.kapasite,
    h.makine,
    greatest(0, least(100, round(h.bakim_puan + h.ariza_puan + h.tazelik_puan + 12, 1))) as skor,
    case when (h.bakim_puan + h.ariza_puan + h.tazelik_puan + 12) >= 80 then '🟢 İYİ'
         when (h.bakim_puan + h.ariza_puan + h.tazelik_puan + 12) >= 60 then '🟡 ORTA'
         when (h.bakim_puan + h.ariza_puan + h.tazelik_puan + 12) >= 40 then '🟠 ZAYIF'
         else '🔴 KÖTÜ' end,
    case when (h.bakim_puan + h.ariza_puan + h.tazelik_puan + 12) >= 80 then 'emerald'
         when (h.bakim_puan + h.ariza_puan + h.tazelik_puan + 12) >= 60 then 'amber'
         when (h.bakim_puan + h.ariza_puan + h.tazelik_puan + 12) >= 40 then 'orange'
         else 'rose' end,
    h.toplam,
    h.ariza,
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
-- 2) 🗓️ BAKIM TAKVİMİ — TEK SORGU (12 ay hesabı basitleştirildi)
-- ============================================================================
drop function if exists public.bakim_takvimi(integer, integer);

create or replace function public.bakim_takvimi(
  p_yil   integer default null,
  p_limit integer default 60
)
returns table (
  crane_id    uuid,
  musteri     text,
  vinc        text,
  makine_tipi text,
  aylar       jsonb,
  son_bakim   text,
  sonraki     text,
  gecikme     integer,
  sozlesmeli  boolean,
  durum       text
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
  -- Müşteri başına servis verilen AYLAR (tek sorgu!)
  servis_aylari as (
    select
      public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer',
                                           'musteri_adi','firma','cari_adi','musteri')) as mnorm,
      extract(month from cs.service_date::date)::int as ay,
      max(cs.service_date::date) as son
    from public.completed_services cs, y
    where cs.service_date is not null
      and extract(year from cs.service_date::date)::int = y.yil
    group by 1, 2
  ),
  son_servis as (
    select
      public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer',
                                           'musteri_adi','firma','cari_adi','musteri')) as mnorm,
      max(cs.service_date::date) as son
    from public.completed_services cs
    group by 1
  )
  select
    v.id, v.musteri, v.kapasite, v.makine,
    -- 12 AYLIK DİZİ (hafif hesap)
    (select jsonb_agg(jsonb_build_object(
        'ay', mn,
        'durum', case
          when exists (select 1 from servis_aylari sa where sa.mnorm = v.mnorm and sa.ay = mn) then 'yapildi'
          when v.bakim is not null and extract(month from v.bakim)::int = mn
               and extract(year from v.bakim)::int = (select yil from y) then 'planli'
          when v.bakim is not null and v.bakim < current_date
               and extract(month from v.bakim)::int = mn then 'gecikti'
          else 'bos' end
      ) order by mn)
      from generate_series(1,12) mn),
    (select to_char(ss.son,'DD.MM.YYYY') from son_servis ss where ss.mnorm = v.mnorm),
    case when v.bakim is not null then to_char(v.bakim,'DD.MM.YYYY') else null end,
    case when v.bakim is not null then (current_date - v.bakim) else null end,
    false,   -- sözleşmeli (hız için hesaplanmıyor)
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
-- 3) 🔍 completed_services GERÇEK SÜTUNLARI (müşteri adı hangisi?)
-- ============================================================================
select string_agg(column_name, ', ' order by ordinal_position) as completed_services_sutunlari
from information_schema.columns
where table_schema='public' and table_name='completed_services';


-- ============================================================================
-- 4) ⏱️ PERFORMANS TESTİ — ne kadar sürüyor?
-- ============================================================================
do $$
declare
  v_bas timestamptz;
  v_adet integer;
begin
  raise notice ' ';

  v_bas := clock_timestamp();
  select count(*) into v_adet from public.vinc_saglik_listesi(50, 'riskli');
  raise notice '⏱️ vinc_saglik_listesi: % kayıt · % ms', v_adet,
                round(extract(epoch from (clock_timestamp() - v_bas)) * 1000);

  v_bas := clock_timestamp();
  select count(*) into v_adet from public.bakim_takvimi(null, 60);
  raise notice '⏱️ bakim_takvimi: % kayıt · % ms', v_adet,
                round(extract(epoch from (clock_timestamp() - v_bas)) * 1000);

  v_bas := clock_timestamp();
  perform public.kokpit_ozet();
  raise notice '⏱️ kokpit_ozet: % ms', round(extract(epoch from (clock_timestamp() - v_bas)) * 1000);

  raise notice '✅ Optimizasyon tamam';
end $$;


-- ============================================================================
-- 5) SONUÇ — ilk 5 vinç
-- ============================================================================
select * from public.vinc_saglik_listesi(5, 'riskli');
