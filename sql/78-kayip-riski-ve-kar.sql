-- ============================================================================
--  🏆 FAZ 7 — MÜŞTERİ KAYIP RİSKİ + CANLI KÂR SAYACI + SEZON TAHMİNİ (SON FAZ)
-- ----------------------------------------------------------------------------
--  1) musteri_kayip_riski()  → hangi müşteriyi kaybetme riski var?
--  2) canli_kar()            → iş sürerken CANLI kâr hesabı
--  3) sezon_tahmini()        → önümüzdeki 3 ayın ciro tahmini
--  4) musteri_yasam()        → müşteri yaşam döngüsü (yeni/aktif/riskli/kayıp)
--  5) kar_uyarilari()        → düşük kârlı işler listesi
--
--  KAYIP RİSKİ FORMÜLÜ:
--    Aktivite düşüşü (40) + Son servis tazeliği (30) + Memnuniyet (20) + Sözleşme (10)
--
--  SEZON TAHMİNİ:
--    Geçen yılın aynı ayı + son 3 ayın trendi → ağırlıklı ortalama
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) 🏆 MÜŞTERİ KAYIP RİSKİ
-- ============================================================================
create or replace function public.musteri_kayip_riski(p_limit integer default 40)
returns table (
  musteri        text,
  vinc_sayisi    integer,
  toplam_ciro    numeric,
  son_servis     text,
  gun_once       integer,
  son_90_is      integer,
  onceki_90_is   integer,
  dusus_orani    integer,
  memnuniyet     numeric,
  sozlesmeli     boolean,
  risk           integer,
  risk_etiket    text,
  oneri          text
)
language sql
stable
security definer
set search_path = public
as $$
  with musteriler as (
    select
      c.customer_name as ad,
      count(*)::int as vinc_sayisi,
      bool_or(exists (select 1 from public.maintenance_contracts mc where mc.crane_id = c.id)) as soz
    from public.cranes c
    where coalesce(c.customer_name,'') <> ''
    group by c.customer_name
  ),
  istatistik as (
    select
      m.ad, m.vinc_sayisi, m.soz,
      coalesce((
        select sum(cs.price) from public.completed_services cs
        where public.parca_adi_normal(
                coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                         nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
              = public.parca_adi_normal(m.ad)
      ), 0) as ciro,
      (select max(cs.service_date::date) from public.completed_services cs
       where public.parca_adi_normal(
               coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                        nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
             = public.parca_adi_normal(m.ad)) as son,
      (select count(*) from public.completed_services cs
       where public.parca_adi_normal(
               coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                        nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
             = public.parca_adi_normal(m.ad)
         and cs.service_date::date > current_date - 90)::int as s90,
      (select count(*) from public.completed_services cs
       where public.parca_adi_normal(
               coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                        nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
             = public.parca_adi_normal(m.ad)
         and cs.service_date::date between current_date - 180 and current_date - 90)::int as o90,
      (select round(avg(r.musteri_puani),1) from public.service_reports r
       where r.musteri_puani is not null
         and public.parca_adi_normal(coalesce(to_jsonb(r)->>'musteri_adi','')) = public.parca_adi_normal(m.ad)) as puan
    from musteriler m
  ),
  hesaplanan as (
    select
      i.*,
      case when i.son is not null then (current_date - i.son)::int else null end as gun,
      case when i.o90 > 0
           then round(((i.o90 - i.s90)::numeric / i.o90) * 100)::int
           when i.s90 = 0 then 100 else 0 end as dusus
    from istatistik i
    where i.ciro > 0 or i.gun is not null
  )
  select
    h.ad,
    h.vinc_sayisi,
    round(h.ciro),
    case when h.son is not null then to_char(h.son,'DD.MM.YYYY') else null end,
    h.gun,
    h.s90, h.o90, h.dusus, h.puan, h.soz,
    -- RİSK PUANI
    least(100, greatest(0, round(
        least(40, coalesce(h.dusus,0) * 0.4)                        -- aktivite düşüşü (40)
      + case when h.gun is null then 30
             when h.gun > 180 then 30
             when h.gun > 120 then 22
             when h.gun > 90  then 14
             when h.gun > 60  then 7 else 0 end                     -- tazelik (30)
      + case when h.puan is null then 10
             when h.puan <= 2 then 20
             when h.puan <= 3 then 13
             when h.puan <= 4 then 6 else 0 end                     -- memnuniyet (20)
      + case when h.soz then 0 else 10 end                          -- sözleşme (10)
    )))::int as risk,
    case
      when least(100, greatest(0, round(
        least(40, coalesce(h.dusus,0) * 0.4)
        + case when h.gun is null then 30 when h.gun > 180 then 30 when h.gun > 120 then 22
               when h.gun > 90 then 14 when h.gun > 60 then 7 else 0 end
        + case when h.puan is null then 10 when h.puan <= 2 then 20 when h.puan <= 3 then 13
               when h.puan <= 4 then 6 else 0 end
        + case when h.soz then 0 else 10 end
      ))) >= 70 then '🔴 YÜKSEK'
      when least(100, greatest(0, round(
        least(40, coalesce(h.dusus,0) * 0.4)
        + case when h.gun is null then 30 when h.gun > 180 then 30 when h.gun > 120 then 22
               when h.gun > 90 then 14 when h.gun > 60 then 7 else 0 end
        + case when h.puan is null then 10 when h.puan <= 2 then 20 when h.puan <= 3 then 13
               when h.puan <= 4 then 6 else 0 end
        + case when h.soz then 0 else 10 end
      ))) >= 45 then '🟠 ORTA'
      else '🟢 DÜŞÜK' end,
    case
      when h.gun is null or h.gun > 180 then '☎️ Hemen ara — uzun süredir sessiz'
      when coalesce(h.dusus,0) >= 50     then '📞 İş hacmi düştü — sebebini öğren'
      when coalesce(h.puan,5) <= 3       then '😐 Memnuniyet düşük — gönlünü al'
      when not h.soz                     then '📄 Abonelik teklif et — bağlayıcı olsun'
      else '👀 Takibe al' end
  from hesaplanan h
  order by 11 desc, h.ciro desc
  limit greatest(1, least(coalesce(p_limit, 40), 200));
$$;

revoke all on function public.musteri_kayip_riski(integer) from public;
grant execute on function public.musteri_kayip_riski(integer) to authenticated;


-- ============================================================================
-- 2) 📊 CANLI KÂR SAYACI — iş sürerken kâr hesabı
-- ============================================================================
create or replace function public.canli_kar(
  p_ucret      numeric,
  p_malzemeler jsonb default '[]'::jsonb,   -- [{ad, adet, birim_fiyat}]
  p_sure_saat  numeric default 0,
  p_saatlik    numeric default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_malzeme_toplam numeric := 0;
  v_saatlik        numeric;
  v_iscilik        numeric := 0;
  v_gider          numeric := 0;
  v_kar            numeric := 0;
  v_marj           numeric := 0;
  v_detay          jsonb := '[]'::jsonb;
  v_p             jsonb;
  v_ad            text;
  v_adet          numeric;
  v_birim         numeric;
  v_satis         numeric;
begin
  -- Malzeme maliyetleri
  if jsonb_typeof(p_malzemeler) = 'array' then
    for v_p in select * from jsonb_array_elements(p_malzemeler) loop
      v_ad    := coalesce(nullif(trim(coalesce(v_p->>'ad','')),''),
                          nullif(trim(coalesce(v_p->>'parca_adi','')),''), 'Parça');
      v_adet  := coalesce((v_p->>'adet')::numeric, 1);
      v_birim := coalesce((v_p->>'birim_fiyat')::numeric,
                          (v_p->>'birim_maliyet')::numeric, 0);

      -- Depodan gerçek alış fiyatını bul (varsa)
      begin
        select coalesce(m.buy_price, v_birim) into v_satis
        from public.materials m
        where public.parca_adi_normal(m.name) = public.parca_adi_normal(v_ad)
        limit 1;
        if v_satis is not null and v_satis > 0 then v_birim := v_satis; end if;
      exception when others then null; end;

      v_malzeme_toplam := v_malzeme_toplam + (v_adet * v_birim);
      v_detay := v_detay || jsonb_build_object(
        'ad', v_ad, 'adet', v_adet, 'birim', v_birim, 'toplam', round(v_adet * v_birim));
    end loop;
  end if;

  -- Saatlik işçilik maliyeti (personel maaşlarından ortalama)
  begin
    select round(avg(pm.maas) / 225.0, 2) into v_saatlik
    from public.personel_maas pm where pm.aktif;
  exception when others then null; end;

  v_saatlik := coalesce(p_saatlik, v_saatlik, 170);
  v_iscilik := round(coalesce(p_sure_saat, 0) * v_saatlik, 2);
  v_gider   := v_malzeme_toplam + v_iscilik;
  v_kar     := coalesce(p_ucret, 0) - v_gider;
  v_marj    := case when coalesce(p_ucret,0) > 0 then round((v_kar / p_ucret) * 100, 1) else 0 end;

  return jsonb_build_object(
    'ucret', round(coalesce(p_ucret,0)),
    'malzeme', round(v_malzeme_toplam),
    'iscilik', v_iscilik,
    'saatlik', v_saatlik,
    'sure_saat', coalesce(p_sure_saat, 0),
    'toplam_gider', round(v_gider),
    'kar', round(v_kar),
    'kar_marji', v_marj,
    'durum', case
      when v_marj >= 40 then '🟢 ÇOK İYİ'
      when v_marj >= 25 then '🟢 İYİ'
      when v_marj >= 10 then '🟡 KABUL EDİLEBİLİR'
      when v_marj >= 0  then '🟠 DÜŞÜK'
      else '🔴 ZARAR' end,
    'malzeme_detay', v_detay
  );
end $$;

revoke all on function public.canli_kar(numeric, jsonb, numeric, numeric) from public;
grant execute on function public.canli_kar(numeric, jsonb, numeric, numeric) to authenticated;


-- ============================================================================
-- 3) 📈 SEZON TAHMİNİ — önümüzdeki 3 ay
-- ============================================================================
create or replace function public.sezon_tahmini()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_liste jsonb := '[]'::jsonb;
  v_i     integer;
  v_ay    date;
  v_gecen numeric;
  v_trend numeric;
  v_tahmin numeric;
  v_is    integer;
  v_ay_adi text;
begin
  for v_i in 1..3 loop
    v_ay := (date_trunc('month', current_date) + (v_i || ' month')::interval)::date;

    -- Geçen yılın aynı ayı
    begin
      select coalesce(sum(cs.price),0), count(*)
        into v_gecen, v_is
      from public.completed_services cs
      where date_trunc('month', cs.service_date::date) = (v_ay - interval '1 year');
    exception when others then v_gecen := 0; v_is := 0; end;

    -- Son 3 ayın ortalaması (trend)
    begin
      select coalesce(avg(t),0) into v_trend from (
        select sum(cs.price) as t
        from public.completed_services cs
        where cs.service_date::date >= (date_trunc('month', current_date) - interval '3 months')::date
        group by date_trunc('month', cs.service_date::date)
      ) x;
    exception when others then v_trend := 0; end;

    -- Ağırlıklı tahmin: geçen yıl %60 + trend %40
    v_tahmin := case
      when v_gecen > 0 and v_trend > 0 then (v_gecen * 0.6) + (v_trend * 0.4)
      when v_gecen > 0 then v_gecen
      when v_trend > 0 then v_trend
      else 0 end;

    v_ay_adi := case extract(month from v_ay)
      when 1 then 'Ocak' when 2 then 'Şubat' when 3 then 'Mart' when 4 then 'Nisan'
      when 5 then 'Mayıs' when 6 then 'Haziran' when 7 then 'Temmuz' when 8 then 'Ağustos'
      when 9 then 'Eylül' when 10 then 'Ekim' when 11 then 'Kasım' else 'Aralık' end;

    v_liste := v_liste || jsonb_build_object(
      'ay', v_ay_adi,
      'yil', extract(year from v_ay)::int,
      'gecen_yil', round(v_gecen),
      'trend', round(v_trend),
      'tahmin', round(v_tahmin),
      'beklenen_is', v_is,
      'degisim', case when v_gecen > 0 then round(((v_tahmin - v_gecen) / v_gecen) * 100) else null end,
      'yon', case
        when v_gecen = 0 then '➡️'
        when v_tahmin > v_gecen * 1.1 then '📈'
        when v_tahmin < v_gecen * 0.9 then '📉'
        else '➡️' end,
      'oneri', case
        when v_tahmin < v_gecen * 0.85 then 'Bakım kampanyası başlat — düşüş bekleniyor'
        when v_tahmin > v_gecen * 1.15 then 'Kapasite planla — yoğunluk bekleniyor'
        else 'Normal seyir — mevcut plan yeterli' end
    );
  end loop;

  return jsonb_build_object(
    'olusturma', to_char(now() at time zone 'Europe/Istanbul','DD.MM.YYYY HH24:MI'),
    'aylar', v_liste,
    'toplam_tahmin', round(coalesce((
      select sum((x->>'tahmin')::numeric) from jsonb_array_elements(v_liste) x), 0))
  );
end $$;

revoke all on function public.sezon_tahmini() from public;
grant execute on function public.sezon_tahmini() to authenticated;


-- ============================================================================
-- 4) 👥 MÜŞTERİ YAŞAM DÖNGÜSÜ (huni)
-- ============================================================================
create or replace function public.musteri_yasam()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_yeni    integer := 0;
  v_aktif   integer := 0;
  v_riskli  integer := 0;
  v_kayip   integer := 0;
  v_toplam  integer := 0;
begin
  begin
    select
      count(*) filter (where son_tarih is null or son_tarih > current_date - 30),
      count(*) filter (where son_tarih between current_date - 90 and current_date - 30),
      count(*) filter (where son_tarih between current_date - 180 and current_date - 90),
      count(*) filter (where son_tarih < current_date - 180),
      count(*)
    into v_yeni, v_aktif, v_riskli, v_kayip, v_toplam
    from (
      select
        c.customer_name,
        (select max(cs.service_date::date) from public.completed_services cs
         where public.parca_adi_normal(
                 coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                          nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
               = public.parca_adi_normal(c.customer_name)) as son_tarih
      from public.cranes c
      where coalesce(c.customer_name,'') <> ''
      group by c.customer_name
    ) x;
  exception when others then null; end;

  return jsonb_build_object(
    'yeni', v_yeni, 'aktif', v_aktif, 'riskli', v_riskli, 'kayip', v_kayip, 'toplam', v_toplam
  );
end $$;

revoke all on function public.musteri_yasam() from public;
grant execute on function public.musteri_yasam() to authenticated;


-- ============================================================================
-- 5) TEST
-- ============================================================================
select * from public.musteri_kayip_riski(10);
select public.canli_kar(5000, '[{"ad":"Rulman 6205","adet":2}]'::jsonb, 2.5) as kar_ornegi;
select public.sezon_tahmini() -> 'toplam_tahmin' as uc_ay_tahmini;
select public.musteri_yasam();
