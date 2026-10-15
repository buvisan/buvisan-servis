-- ============================================================================
--  💰 CANLI KÂR + SEZON TAHMİNİ + YAŞAM DÖNGÜSÜ (Güncelleme #60)
-- ----------------------------------------------------------------------------
--  NEDEN BU SCRIPT?
--    78-kayip-riski-ve-kar.sql hata verdi çünkü içindeki musteri_kayip_riski()
--    mc.crane_id kullanıyordu (o sütun yok).
--
--    AMA musteri_kayip_riski() zaten SQL 81'de DÜZELTİLMİŞ haliyle kurulu ✓
--    Yani 78'in tek eksik kısmı şu 3 fonksiyon:
--      • canli_kar()       → iş kârı hesabı
--      • sezon_tahmini()   → 3 aylık ciro tahmini
--      • musteri_yasam()   → müşteri yaşam döngüsü hunisi
--
--  Bu 3 fonksiyon maintenance_contracts KULLANMAZ → hata vermez.
--
--  KULLANIM: 85'ten SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 📊 CANLI KÂR SAYACI
-- ============================================================================
create or replace function public.canli_kar(
  p_ucret      numeric,
  p_malzemeler jsonb default '[]'::jsonb,
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
  v_p              jsonb;
  v_ad             text;
  v_adet           numeric;
  v_birim          numeric;
  v_depo           numeric;
begin
  if jsonb_typeof(p_malzemeler) = 'array' then
    for v_p in select * from jsonb_array_elements(p_malzemeler) loop
      v_ad    := coalesce(nullif(trim(coalesce(v_p->>'ad','')),''),
                          nullif(trim(coalesce(v_p->>'parca_adi','')),''), 'Parça');
      v_adet  := coalesce((v_p->>'adet')::numeric, 1);
      v_birim := coalesce((v_p->>'birim_fiyat')::numeric,
                          (v_p->>'birim_maliyet')::numeric, 0);

      -- Depodaki gerçek alış fiyatı (varsa onu kullan)
      begin
        select coalesce(m.buy_price, v_birim) into v_depo
        from public.materials m
        where public.parca_adi_normal(m.name) = public.parca_adi_normal(v_ad)
        limit 1;
        if v_depo is not null and v_depo > 0 then v_birim := v_depo; end if;
      exception when others then null; end;

      v_malzeme_toplam := v_malzeme_toplam + (v_adet * v_birim);
      v_detay := v_detay || jsonb_build_object(
        'ad', v_ad, 'adet', v_adet, 'birim', v_birim, 'toplam', round(v_adet * v_birim));
    end loop;
  end if;

  -- Saatlik işçilik (personel maaşlarından ortalama)
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
    'malzeme_detay', v_detay);
end $$;

revoke all on function public.canli_kar(numeric, jsonb, numeric, numeric) from public;
grant execute on function public.canli_kar(numeric, jsonb, numeric, numeric) to authenticated;


-- ============================================================================
-- 2) 📈 SEZON TAHMİNİ (3 ay)
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

    begin
      select coalesce(sum(cs.price),0), count(*)
        into v_gecen, v_is
      from public.completed_services cs
      where date_trunc('month', cs.service_date::date) = (v_ay - interval '1 year');
    exception when others then v_gecen := 0; v_is := 0; end;

    begin
      select coalesce(avg(t),0) into v_trend from (
        select sum(cs.price) as t
        from public.completed_services cs
        where cs.service_date::date >= (date_trunc('month', current_date) - interval '3 months')::date
        group by date_trunc('month', cs.service_date::date)
      ) x;
    exception when others then v_trend := 0; end;

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
        else 'Normal seyir — mevcut plan yeterli' end);
  end loop;

  return jsonb_build_object(
    'olusturma', to_char(now() at time zone 'Europe/Istanbul','DD.MM.YYYY HH24:MI'),
    'aylar', v_liste,
    'toplam_tahmin', round(coalesce((
      select sum((x->>'tahmin')::numeric) from jsonb_array_elements(v_liste) x), 0)));
end $$;

revoke all on function public.sezon_tahmini() from public;
grant execute on function public.sezon_tahmini() to authenticated;


-- ============================================================================
-- 3) 👥 MÜŞTERİ YAŞAM DÖNGÜSÜ (huni)
-- ============================================================================
create or replace function public.musteri_yasam()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_yeni integer := 0; v_aktif integer := 0; v_riskli integer := 0;
  v_kayip integer := 0; v_toplam integer := 0;
begin
  begin
    with musteriler as (
      select
        public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') as ad,
        public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi')) as mnorm
      from public.cranes c
      where public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
      group by 1, 2
    ),
    son as (
      select public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer')) as mnorm,
             max(cs.service_date::date) as son_t
      from public.completed_services cs group by 1
    )
    select
      count(*) filter (where s.son_t is null or s.son_t > current_date - 30),
      count(*) filter (where s.son_t between current_date - 90 and current_date - 30),
      count(*) filter (where s.son_t between current_date - 180 and current_date - 90),
      count(*) filter (where s.son_t < current_date - 180),
      count(*)
    into v_yeni, v_aktif, v_riskli, v_kayip, v_toplam
    from musteriler m
    left join son s on s.mnorm = m.mnorm;
  exception when others then null; end;

  return jsonb_build_object(
    'yeni', v_yeni, 'aktif', v_aktif, 'riskli', v_riskli,
    'kayip', v_kayip, 'toplam', v_toplam);
end $$;

revoke all on function public.musteri_yasam() from public;
grant execute on function public.musteri_yasam() to authenticated;


-- ============================================================================
-- TEST — korunmuş
-- ============================================================================
do $$
declare
  v_testler text[][] := array[
    ['canli_kar',      'select public.canli_kar(5000, ''[]''::jsonb, 2)'],
    ['sezon_tahmini',  'select public.sezon_tahmini()'],
    ['musteri_yasam',  'select public.musteri_yasam()']
  ];
  t text[];
  v_ok integer := 0; v_hata integer := 0;
begin
  raise notice ' ';
  raise notice '═══════ KÂR + TAHMİN TESTİ ═══════';
  foreach t slice 1 in array v_testler loop
    begin
      execute t[2];
      raise notice '✅ %', rpad(t[1], 18);
      v_ok := v_ok + 1;
    exception when others then
      raise notice '❌ % → %', rpad(t[1], 18), sqlerrm;
      v_hata := v_hata + 1;
    end;
  end loop;
  raise notice '──────────────────────────';
  raise notice 'ÇALIŞAN: %   HATALI: %', v_ok, v_hata;
  raise notice '════════════════════════════';
end $$;


-- ============================================================================
-- SONUÇ
-- ============================================================================
select 'canli_kar' as test,
       coalesce(public.canli_kar(5000, '[{"ad":"Rulman 6205","adet":2}]'::jsonb, 2.5) ->> 'kar', '?') as sonuc
union all
select 'sezon_3ay_tahmini',
       coalesce(public.sezon_tahmini() ->> 'toplam_tahmin', '?')
union all
select 'musteri_yasam',
       coalesce(public.musteri_yasam() ->> 'toplam', '?');

-- Kâr örneği detayı
select public.canli_kar(5000, '[{"ad":"Rulman 6205","adet":2}]'::jsonb, 2.5) as kar_detayi;
