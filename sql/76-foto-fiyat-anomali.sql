-- ============================================================================
--  📸 FAZ 6 — FOTOĞRAFTAN ARIZA (AI) + DİNAMİK FİYAT + ANOMALİ ALARMI
-- ----------------------------------------------------------------------------
--  NE YAPAR?
--    1) fiyat_onerisi()        → geçmiş veriden DOĞRU fiyat önerir
--    2) anomali_tara()         → sessiz sorunları yakalar (gider, kâr, süre)
--    3) foto_analizleri tablosu → AI fotoğraf analizlerini saklar
--    4) foto_analiz_kaydet()   → analiz sonucunu kaydeder
--    5) foto_analiz_gecmisi()  → geçmiş analizler + doğruluk oranı
--
--  FİYAT FORMÜLÜ:
--    Benzer işlerin ortalaması
--      + mesafe faktörü (km × 25 ₺)
--      + aciliyet faktörü (× 1.25)
--      − sadakat indirimi (sadık müşteri × 0.95)
--
--  ANOMALİ KONTROLLERİ:
--    • Malzeme gideri normalin %40 üstünde
--    • Kâr marjı %15 altı (normal %35)
--    • İş süresi ortalamanın 2 katı
--    • Müşteri aktivitesi %50+ düşmüş
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) 📸 FOTO ANALİZ TABLOSU (AI sonuçlarını saklar)
-- ============================================================================
create table if not exists public.foto_analizleri (
  id            uuid primary key default gen_random_uuid(),
  musteri       text,
  ticket_id     uuid,
  foto_url      text,
  tespit        text,          -- AI'nın bulduğu arıza
  onerilen_parca text,         -- önerilen parça
  guven         integer,       -- güven yüzdesi (0-100)
  ai_notu       text,
  gercek_parca  text,          -- kullanıcı düzelttiyse
  dogru_mu      boolean,       -- AI doğru bildi mi?
  kullanici     text,
  olusturma     timestamptz default now()
);

create index if not exists idx_foto_analiz_tarih on public.foto_analizleri (olusturma desc);

alter table public.foto_analizleri enable row level security;

drop policy if exists foto_analiz_admin on public.foto_analizleri;
create policy foto_analiz_admin on public.foto_analizleri
  for all to authenticated
  using (public.buvisan_admin_mi())
  with check (public.buvisan_admin_mi());

-- Personel de ekleyebilir (saha kullanımı)
drop policy if exists foto_analiz_ekle on public.foto_analizleri;
create policy foto_analiz_ekle on public.foto_analizleri
  for insert to authenticated with check (true);


create or replace function public.foto_analiz_kaydet(
  p_musteri        text,
  p_tespit         text,
  p_onerilen_parca text default null,
  p_guven          integer default null,
  p_ai_notu        text default null,
  p_foto_url       text default null,
  p_ticket_id      uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.foto_analizleri
    (musteri, tespit, onerilen_parca, guven, ai_notu, foto_url, ticket_id, kullanici)
  values (trim(coalesce(p_musteri,'Bilinmiyor')), p_tespit, p_onerilen_parca,
          greatest(0, least(100, coalesce(p_guven, 0))), p_ai_notu, p_foto_url, p_ticket_id,
          public.benim_adim())
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'mesaj', 'Analiz kaydedildi.');
end $$;

revoke all on function public.foto_analiz_kaydet(text, text, text, integer, text, text, uuid) from public;
grant execute on function public.foto_analiz_kaydet(text, text, text, integer, text, text, uuid) to authenticated;


create or replace function public.foto_analiz_gecmisi(p_limit integer default 30)
returns table (
  id            uuid,
  musteri       text,
  tespit        text,
  onerilen_parca text,
  guven         integer,
  dogru_mu      boolean,
  kullanici     text,
  tarih         text
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.musteri, left(coalesce(f.tespit,''), 120), f.onerilen_parca,
         f.guven, f.dogru_mu, f.kullanici, to_char(f.olusturma, 'DD.MM.YYYY HH24:MI')
  from public.foto_analizleri f
  order by f.olusturma desc
  limit greatest(1, least(coalesce(p_limit, 30), 200));
$$;

revoke all on function public.foto_analiz_gecmisi(integer) from public;
grant execute on function public.foto_analiz_gecmisi(integer) to authenticated;


-- ============================================================================
-- 2) 💰 DİNAMİK FİYAT ÖNERİSİ
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

  -- Müşteri geçmişi (sadakat)
  if coalesce(trim(p_musteri),'') <> '' then
    begin
      select count(*), coalesce(sum(cs.price),0) into v_musteri_is, v_musteri_ciro
      from public.completed_services cs
      where public.parca_adi_normal(
              coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                       nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
            = public.parca_adi_normal(p_musteri);
    exception when others then null; end;
  end if;

  -- Faktörler
  v_mesafe_ek := round(coalesce(p_mesafe_km, 0) * 25);                    -- km başı 25₺
  v_acil_ek   := case when p_acil then round(coalesce(v_medyan,0) * 0.25) else 0 end;  -- %25 aciliyet
  v_sadakat   := case
    when v_musteri_is >= 20 then -round(coalesce(v_medyan,0) * 0.10)      -- %10 sadık müşteri
    when v_musteri_is >= 10 then -round(coalesce(v_medyan,0) * 0.07)
    when v_musteri_is >= 5  then -round(coalesce(v_medyan,0) * 0.04)
    else 0 end;

  v_oneri := greatest(500, round(coalesce(v_medyan, 0) + v_mesafe_ek + v_acil_ek + v_sadakat));
  v_alt   := round(v_oneri * 0.90);
  v_ust   := round(v_oneri * 1.15);

  -- Kâr oranı tahmini
  v_kar_orani := case when v_oneri > 0
                      then round(((v_oneri - coalesce(v_malzeme,0) - (v_oneri * 0.25)) / v_oneri) * 100)
                      else 0 end;

  v_mesaj := 'Benzer ' || v_benzer_adet || ' işin medyanı: ' || to_char(coalesce(v_medyan,0),'FM999G999') || ' ₺';
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
-- 3) 🚨 ANOMALİ ALARMI — sessiz sorunları yakala
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

    if v_ort > 0 then
      v_fark := round(((v_bu_ay - v_ort) / v_ort) * 100);
      if v_fark >= 30 then
        v_liste := v_liste || jsonb_build_object(
          'tip', 'gider', 'seviye', 'yuksek',
          'baslik', 'Malzeme gideri normalin %' || v_fark || ' üstünde',
          'detay', 'Bu ay: ' || to_char(v_bu_ay,'FM999G999') || ' ₺ · Ortalama: ' || to_char(v_ort,'FM999G999') || ' ₺',
          'oneri', 'Sipariş fiyatlarını ve kullanım miktarını kontrol et'
        );
      end if;
    end if;
  exception when others then null; end;

  -- 2) DÜŞÜK KÂR MARJI İŞLERİ
  begin
    for v_r in
      select
        coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                 nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),'İsimsiz') as musteri,
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
      limit 5
    loop
      v_liste := v_liste || jsonb_build_object(
        'tip', 'kar', 'seviye', 'orta',
        'baslik', v_r.musteri || ' işinde kâr marjı düşük',
        'detay', v_r.tarih || ' · Ücret: ' || to_char(v_r.ucret,'FM999G999') || ' ₺ · malzeme maliyeti yüksek',
        'oneri', 'Fiyatlandırmayı gözden geçir veya parça maliyetini düşür'
      );
    end loop;
  exception when others then null; end;

  -- 3) MÜŞTERİ AKTİVİTESİ DÜŞÜŞÜ (kayıp riski ön sinyali)
  begin
    for v_r in
      select
        c.customer_name as musteri,
        (select count(*) from public.completed_services cs
          where public.parca_adi_normal(
                  coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                           nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
                = public.parca_adi_normal(c.customer_name)
            and cs.service_date::date > current_date - 90) as son_90,
        (select count(*) from public.completed_services cs
          where public.parca_adi_normal(
                  coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                           nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
                = public.parca_adi_normal(c.customer_name)
            and cs.service_date::date between current_date - 180 and current_date - 90) as onceki_90
      from public.cranes c
      where coalesce(c.customer_name,'') <> ''
      group by c.customer_name
      having (select count(*) from public.completed_services cs
               where public.parca_adi_normal(
                       coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                                nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
                     = public.parca_adi_normal(c.customer_name)
                 and cs.service_date::date between current_date - 180 and current_date - 90) >= 3
         and (select count(*) from public.completed_services cs
               where public.parca_adi_normal(
                       coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                                nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
                     = public.parca_adi_normal(c.customer_name)
                 and cs.service_date::date > current_date - 90) = 0
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
        coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                 nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),'İsimsiz') as musteri,
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
-- 4) TEST
-- ============================================================================
select public.fiyat_onerisi('Rulman', 'RB KARESİ', 25, true) as fiyat_ornegi;
select public.anomali_tara() -> 'toplam' as anomali_sayisi,
       public.anomali_tara() -> 'yuksek_oncelikli' as acil;
select * from public.foto_analiz_gecmisi(5);
