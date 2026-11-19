-- ============================================================================
--  🤖 AKILLI ANALİZ DÜZELTMESİ (Güncelleme #207)
-- ----------------------------------------------------------------------------
--  EKRAN: /admin/akilli-analiz  (fiyat_onerisi · anomali_tara)
--
--  BULGU 1 — MÜŞTERİ EŞLEŞMESİ HİÇ ÇALIŞMIYOR (sessiz hata):
--    76-foto-fiyat-anomali.sql, müşteri adını şu sütunlardan okuyordu:
--        to_jsonb(cs)->>'customer_name'  → completed_services'te YOK
--        to_jsonb(cs)->>'firm_name'      → completed_services'te YOK
--    GERÇEK sütun: completed_services.customer_text  (bkz. 89-customer-text-duzeltmesi)
--
--    SONUÇ (canlı test):
--      • fiyat_onerisi() → musteri_is = 0, musteri_ciro = 0, sadakat_indirim = 0
--        → "sadakat indirimi" ve "bu müşteriyle N iş" bilgisi HİÇ görünmüyordu.
--      • anomali_tara()  → tüm uyarıların başlığı "İsimsiz ..." çıkıyordu.
--      • "müşteri 90 gündür iş vermiyor" kontrolü (kayıp riski) hiç tetiklenmiyordu.
--
--  BULGU 2 — YANLIŞ YÜZDE (kısmi ay kıyaslaması):
--    Malzeme gideri anomalisi, "bu ay (ayın sadece N günü)" toplamını
--    "son 3 TAM ayın ortalaması" ile kıyaslıyordu → ayın ilk günlerinde
--    yüzde hep düşük çıkıyor, gerçek artış gözden kaçıyordu.
--    DÜZELTME: günlük harcama hızı kıyaslanır (bu ay/gün  ↔  aylık ortalama/30).
--
--  DEĞİŞMEYENLER:
--    • Fonksiyon imzaları, dönüş anahtarları (UI aynı alanları okur).
--    • cranes tablosuna DOKUNULMAZ (sadece okunur).
--    • Tüm tutarlar KDV hariçtir.
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) 💰 DİNAMİK FİYAT ÖNERİSİ (müşteri eşleşmesi customer_text ile)
-- ============================================================================
create or replace function public.fiyat_onerisi(
  p_is_tipi   text    default null,
  p_musteri   text    default null,
  p_mesafe_km numeric default 0,
  p_acil      boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_benzer_adet  integer := 0;
  v_ortalama     numeric := 0;
  v_en_az        numeric := 0;
  v_en_cok       numeric := 0;
  v_medyan       numeric := 0;
  v_mesafe_ek    numeric := 0;
  v_acil_ek      numeric := 0;
  v_sadakat      numeric := 0;
  v_musteri_ciro numeric := 0;
  v_musteri_is   integer := 0;
  v_oneri        numeric := 0;
  v_alt          numeric := 0;
  v_ust          numeric := 0;
  v_kar_orani    numeric := 0;
  v_malzeme      numeric := 0;
  v_mesaj        text;
begin
  -- Benzer işlerin istatistikleri
  begin
    select count(*), round(avg(cs.price)), min(cs.price), max(cs.price)
      into v_benzer_adet, v_ortalama, v_en_az, v_en_cok
    from public.completed_services cs
    where cs.price > 0
      and cs.service_date::date > current_date - 365
      and (
        coalesce(p_is_tipi,'') = ''
        or coalesce(cs.service_type,'') ilike '%' || p_is_tipi || '%'
        or coalesce(cs.description,'')  ilike '%' || p_is_tipi || '%'
      );

    select round(percentile_cont(0.5) within group (order by cs.price))
      into v_medyan
    from public.completed_services cs
    where cs.price > 0 and cs.service_date::date > current_date - 365
      and (coalesce(p_is_tipi,'') = ''
           or coalesce(cs.service_type,'') ilike '%' || p_is_tipi || '%'
           or coalesce(cs.description,'')  ilike '%' || p_is_tipi || '%');

    -- Benzer işlerin ortalama malzeme maliyeti (kâr için)
    select round(coalesce(avg(mt), 0)) into v_malzeme
    from (
      select coalesce(sum((m->>'birim_fiyat')::numeric * coalesce((m->>'adet')::numeric, 1)), 0) as mt
      from public.completed_services cs
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(cs.materials) = 'array' then cs.materials else '[]'::jsonb end) m
      where cs.price > 0 and cs.service_date::date > current_date - 365
      group by cs.id
    ) z;
  exception when others then null; end;

  if coalesce(v_benzer_adet, 0) = 0 then
    v_medyan := 5000;   -- hiç veri yoksa makul varsayılan
    v_ortalama := 5000;
  end if;

  -- Müşteri geçmişi (sadakat) — customer_text ÖNCE (şema-bağımsız: cs_isim_normal)
  if coalesce(trim(p_musteri),'') <> '' then
    begin
      select count(*), coalesce(sum(cs.price), 0) into v_musteri_is, v_musteri_ciro
      from public.completed_services cs
      where public.cs_isim_normal(to_jsonb(cs)) = public.parca_adi_normal(p_musteri);
    exception when others then null; end;
  end if;

  -- Faktörler
  v_mesafe_ek := round(greatest(0, coalesce(p_mesafe_km, 0)) * 25);       -- km başı 25₺ (negatif km sayılmaz)
  v_acil_ek   := case when p_acil then round(coalesce(v_medyan,0) * 0.25) else 0 end;  -- %25 aciliyet
  v_sadakat   := case
    when v_musteri_is >= 20 then -round(coalesce(v_medyan,0) * 0.10)      -- %10 sadık müşteri
    when v_musteri_is >= 10 then -round(coalesce(v_medyan,0) * 0.07)
    when v_musteri_is >= 5  then -round(coalesce(v_medyan,0) * 0.04)
    else 0 end;

  v_oneri := greatest(500, round(coalesce(v_medyan, 0) + v_mesafe_ek + v_acil_ek + v_sadakat));
  v_alt   := round(v_oneri * 0.90);
  v_ust   := round(v_oneri * 1.15);

  -- Kâr oranı tahmini (işçilik varsayımı: cironun %25'i)
  v_kar_orani := case when v_oneri > 0
                      then round(((v_oneri - coalesce(v_malzeme,0) - (v_oneri * 0.25)) / v_oneri) * 100)
                      else 0 end;

  v_mesaj := 'Benzer ' || v_benzer_adet || ' işin medyanı: ' || to_char(coalesce(v_medyan,0),'FM999G999') || ' ₺ (KDV hariç)';
  if v_mesafe_ek > 0 then v_mesaj := v_mesaj || ' · mesafe +' || to_char(v_mesafe_ek,'FM999G999') || ' ₺'; end if;
  if v_acil_ek > 0   then v_mesaj := v_mesaj || ' · aciliyet +' || to_char(v_acil_ek,'FM999G999') || ' ₺'; end if;
  if v_sadakat < 0   then v_mesaj := v_mesaj || ' · sadakat ' || to_char(v_sadakat,'FM999G999') || ' ₺'; end if;

  return jsonb_build_object(
    'oneri', v_oneri,
    'alt_sinir', v_alt,
    'ust_sinir', v_ust,
    'medyan', v_medyan,
    'ortalama', v_ortalama,
    'en_az', v_en_az,
    'en_cok', v_en_cok,
    'benzer_is', v_benzer_adet,
    'mesafe_ek', v_mesafe_ek,
    'acil_ek', v_acil_ek,
    'sadakat_indirim', v_sadakat,
    'musteri_is', v_musteri_is,
    'musteri_ciro', v_musteri_ciro,
    'tahmini_malzeme', v_malzeme,
    'tahmini_kar_orani', v_kar_orani,
    'mesaj', v_mesaj,
    'uyari', case
      when coalesce(v_benzer_adet,0) < 3 then '⚠️ Az veri — dikkatli kullan'
      when v_kar_orani < 20 then '⚠️ Kâr marjı düşük olabilir'
      else null end
  );
end $$;

revoke all on function public.fiyat_onerisi(text, text, numeric, boolean) from public;
grant execute on function public.fiyat_onerisi(text, text, numeric, boolean) to authenticated;


-- ============================================================================
-- 2) 🚨 ANOMALİ ALARMI (müşteri adları + kısmi ay düzeltmesi)
-- ============================================================================
create or replace function public.anomali_tara()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_liste jsonb := '[]'::jsonb;
  v_r     record;
  v_bu_ay numeric := 0;
  v_ort   numeric := 0;
  v_fark  numeric := 0;
  v_gun   integer := 1;
begin
  -- 1) MALZEME GİDERİ ANİ ARTIŞI
  begin
    select coalesce(sum((m->>'birim_fiyat')::numeric * coalesce((m->>'adet')::numeric,1)),0)
      into v_bu_ay
    from public.completed_services cs
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(cs.materials)='array' then cs.materials else '[]'::jsonb end) m
    where cs.service_date::date >= date_trunc('month', current_date)::date;

    select coalesce(avg(t),0) into v_ort from (
      select sum((m->>'birim_fiyat')::numeric * coalesce((m->>'adet')::numeric,1)) as t
      from public.completed_services cs
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(cs.materials)='array' then cs.materials else '[]'::jsonb end) m
      where cs.service_date::date >= (date_trunc('month', current_date) - interval '3 months')::date
        and cs.service_date::date < date_trunc('month', current_date)::date
      group by date_trunc('month', cs.service_date::date)
    ) x;

    -- ⚠️ Kısmi ay, tam ay ortalamasıyla kıyaslanmaz → GÜNLÜK hız kıyaslanır.
    if v_ort > 0 and v_bu_ay > 0 then
      v_gun  := greatest(1, extract(day from current_date)::int);
      v_fark := round((((v_bu_ay / v_gun) - (v_ort / 30.0)) / (v_ort / 30.0)) * 100);

      if v_fark >= 30 then
        v_liste := v_liste || jsonb_build_object(
          'tip', 'gider', 'seviye', 'yuksek',
          'baslik', 'Malzeme gideri normalin %' || v_fark || ' üstünde',
          'detay', 'Bu ay (' || v_gun || ' gün): ' || to_char(v_bu_ay,'FM999G999G999') || ' ₺ · 3 aylık ortalama: ' || to_char(v_ort,'FM999G999G999') || ' ₺ (KDV hariç)',
          'oneri', 'Sipariş fiyatlarını ve kullanım miktarını kontrol et'
        );
      end if;
    end if;
  exception when others then null; end;

  -- 2) DÜŞÜK KÂR MARJI İŞLERİ
  begin
    for v_r in
      select
        coalesce(nullif(public.cs_isim(to_jsonb(cs)),''), 'İsimsiz') as musteri,
        round(cs.price) as ucret,
        to_char(cs.service_date::date,'DD.MM.YYYY') as tarih
      from public.completed_services cs
      where cs.price > 0
        and cs.service_date::date > current_date - 30
        -- Malzeme maliyeti fiyatın %70'inden fazlaysa → düşük kâr
        and coalesce((
          select sum((m->>'birim_fiyat')::numeric * coalesce((m->>'adet')::numeric,1))
          from jsonb_array_elements(
            case when jsonb_typeof(cs.materials)='array' then cs.materials else '[]'::jsonb end) m
        ), 0) > cs.price * 0.70
      order by cs.service_date desc
      limit 5
    loop
      v_liste := v_liste || jsonb_build_object(
        'tip', 'kar', 'seviye', 'orta',
        'baslik', v_r.musteri || ' işinde kâr marjı düşük',
        'detay', v_r.tarih || ' · Ücret: ' || to_char(v_r.ucret,'FM999G999G999') || ' ₺ (KDV hariç) · malzeme maliyeti yüksek',
        'oneri', 'Fiyatlandırmayı gözden geçir veya parça maliyetini düşür'
      );
    end loop;
  exception when others then null; end;

  -- 3) MÜŞTERİ AKTİVİTESİ DÜŞÜŞÜ (kayıp riski ön sinyali)
  begin
    for v_r in
      with vincler as (
        select distinct
          public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') as musteri,
          public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi')) as mnorm
        from public.cranes c
        where public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
      ),
      sayim as (
        select
          public.cs_isim_normal(to_jsonb(cs)) as mnorm,
          count(*) filter (where cs.service_date::date > current_date - 90) as son_90,
          count(*) filter (where cs.service_date::date >= current_date - 180
                             and cs.service_date::date <= current_date - 90) as onceki_90
        from public.completed_services cs
        where cs.service_date::date >= current_date - 180
        group by 1
      )
      select v.musteri,
             coalesce(s.son_90, 0)    as son_90,
             coalesce(s.onceki_90, 0) as onceki_90
      from vincler v
      left join sayim s on s.mnorm = v.mnorm
      where v.mnorm <> ''
        and coalesce(s.onceki_90, 0) >= 3
        and coalesce(s.son_90, 0) = 0
      order by coalesce(s.onceki_90, 0) desc
      limit 5
    loop
      v_liste := v_liste || jsonb_build_object(
        'tip', 'musteri', 'seviye', 'yuksek',
        'baslik', v_r.musteri || ' 90 gündür iş vermiyor',
        'detay', 'Önceki 90 günde ' || v_r.onceki_90 || ' iş vardı, şimdi 0',
        'oneri', 'Müşteriyi ara — memnuniyetsizlik veya rakibe geçiş olabilir'
      );
    end loop;
  exception when others then null; end;

  -- 4) UZUN SÜREN İŞLER (verimlilik)
  begin
    for v_r in
      select
        coalesce(nullif(public.cs_isim(to_jsonb(cs)),''), 'İsimsiz') as musteri,
        cs.work_hours as saat,
        to_char(cs.service_date::date,'DD.MM.YYYY') as tarih
      from public.completed_services cs
      where cs.work_hours > 0
        and cs.service_date::date > current_date - 30
        and cs.work_hours > coalesce((
          select avg(cs2.work_hours) * 2 from public.completed_services cs2
          where cs2.work_hours > 0 and cs2.service_date::date > current_date - 180
        ), 8)
      order by cs.work_hours desc
      limit 3
    loop
      v_liste := v_liste || jsonb_build_object(
        'tip', 'sure', 'seviye', 'dusuk',
        'baslik', v_r.musteri || ' işi normalden çok uzun sürdü',
        'detay', v_r.tarih || ' · ' || v_r.saat || ' saat',
        'oneri', 'Sebebini öğren — eksik parça, tekrar gidiş veya zorluk olabilir'
      );
    end loop;
  exception when others then null; end;

  return jsonb_build_object(
    'tarih', to_char(now() at time zone 'Europe/Istanbul','DD.MM.YYYY HH24:MI'),
    'toplam', jsonb_array_length(v_liste),
    'yuksek_oncelikli', (
      select count(*) from jsonb_array_elements(v_liste) x
      where x->>'seviye' = 'yuksek'),
    'uyarilar', v_liste
  );
end $$;

revoke all on function public.anomali_tara() from public;
grant execute on function public.anomali_tara() to authenticated;


-- ============================================================================
-- 3) DOĞRULAMA — "İsimsiz" kalmadı mı?
-- ============================================================================
select
  public.fiyat_onerisi('Rulman', 'RB KARESİ', 25, true) -> 'musteri_is'   as musteri_is,
  public.fiyat_onerisi('Rulman', 'RB KARESİ', 25, true) -> 'sadakat_indirim' as sadakat_indirim,
  public.anomali_tara() -> 'toplam'           as anomali_sayisi,
  public.anomali_tara() -> 'yuksek_oncelikli' as acil,
  (select count(*) from jsonb_array_elements(public.anomali_tara() -> 'uyarilar') u
    where u->>'baslik' like '%İsimsiz%')       as isimsiz_uyari;


-- ─── MIGRATION KAYDI ───
do $$
begin
  perform public.migration_isaretle('207-akilli-analiz-musteri-fix.sql', 'akilli analiz: customer_text eşleşmesi + kısmi ay gider düzeltmesi');
  raise notice '✅ 207 kaydedildi';
exception when others then
  raise notice 'migration kaydı atlandı (205 çalıştırılmamış olabilir)';
end $$;
