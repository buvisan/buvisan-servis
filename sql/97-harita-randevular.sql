-- ============================================================================
--  🗺️ HARİTA + RANDEVULAR (Güncelleme #71)
-- ----------------------------------------------------------------------------
--  KAYNAK: /admin/planlayici ekranı (randevular tablosu)
--    COATS      · Balat OSB, Mavi Cd. No:2, Nilüfer/Bursa    ← adres var!
--    ALPOLİMER  · Minareliçavuş OSB, N.117 Sk. Nilüfer/Bursa ← adres var!
--    HTS METAL  · (adres yok, müşteri kaydından alınacak)
--
--  SORUN: randevularda KOORDİNAT yok → haritada görünmüyor
--
--  ÇÖZÜM (3 katmanlı):
--    1) Vinç tablosundan müşteri eşleşmesiyle koordinat al
--    2) Adres metninden İLÇE çıkar → ilçe merkez koordinatı
--    3) Haritaya randevu katmanı ekle
--
--  KULLANIM: 96'dan SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 🔍 RANDEVULAR TABLOSU YAPISI (önce öğren)
-- ============================================================================
select string_agg(column_name, ', ' order by ordinal_position) as randevular_sutunlari
from information_schema.columns
where table_schema='public' and table_name='randevular';


-- ============================================================================
-- 2) 📍 İLÇE KOORDİNAT TABLOSU (Bursa + çevre)
-- ============================================================================
create table if not exists public.ilce_koordinat (
  ilce  text primary key,
  lat   numeric not null,
  lng   numeric not null
);

insert into public.ilce_koordinat (ilce, lat, lng) values
  ('nilüfer',        40.2130, 28.9720),
  ('osmangazi',      40.1950, 29.0600),
  ('yıldırım',       40.1880, 29.1050),
  ('gemlik',         40.4320, 29.1560),
  ('gürsu',          40.2190, 29.1930),
  ('kestel',         40.1990, 29.2120),
  ('mudanya',        40.3750, 28.8830),
  ('iznik',          40.4300, 29.7210),
  ('inegöl',         40.0790, 29.5110),
  ('mustafakemalpaşa', 40.0360, 28.4120),
  ('karacabey',      40.2140, 28.3600),
  ('orhangazi',      40.4900, 29.3100),
  ('yenisehir',      40.2640, 29.6530),
  ('buyukorhan',     39.7600, 28.8800),
  ('keles',          39.9100, 29.2300),
  ('harmancik',      39.6800, 29.1500),
  ('ornakoy',        39.9400, 28.7600),
  ('bandirma',       40.3520, 27.9770),
  ('bursa',          40.1950, 29.0600),
  ('balıkesir',      39.6490, 27.8860),
  ('balikesir',      39.6490, 27.8860),
  ('yalova',         40.6550, 29.2760),
  ('kocaeli',        40.8530, 29.8820),
  ('istanbul',       41.0080, 28.9780),
  ('eskisehir',      39.7760, 30.5200),
  ('kütahya',        39.4240, 29.9830),
  ('bilecik',        40.1420, 29.9800),
  ('sakarya',        40.7800, 30.4030),
  ('gebze',          40.8000, 29.4300),
  ('tuzla',          40.8170, 29.3000),
  ('pendik',         40.8790, 29.2340),
  ('kartal',         40.8900, 29.1850),
  ('maltepe',        40.9350, 29.1550),
  ('kadikoy',        40.9900, 29.0300),
  ('uskudar',        41.0250, 29.0150),
  ('besiktas',       41.0430, 29.0090),
  ('sisli',          41.0600, 28.9870),
  ('bakirkoy',       40.9800, 28.8770),
  ('bahcelievler',   41.0000, 28.8600),
  ('bagcilar',       41.0400, 28.8560),
  ('kucukcekmece',   41.0000, 28.7800),
  ('buyukcekmece',   41.0200, 28.5850),
  ('silivri',        41.0740, 28.2470),
  ('corlu',          41.1600, 27.8000),
  ('cerkezkoy',      41.2870, 27.9990),
  ('kapakli',        41.3300, 27.9600),
  ('corum',          40.5500, 34.9550),
  ('ankara',         39.9330, 32.8590),
  ('izmir',          38.4230, 27.1430),
  ('manisa',         38.6130, 27.4260),
  ('denizli',        37.7750, 29.0870),
  ('aydin',          37.8480, 27.8450),
  ('tekirdag',       40.9780, 27.5110),
  ('edirne',         41.6770, 26.5560),
  ('kirklareli',     41.7350, 27.2250),
  ('canakkale',      40.1470, 26.4090)
on conflict (ilce) do nothing;

alter table public.ilce_koordinat enable row level security;
drop policy if exists "ilce_koordinat_oku" on public.ilce_koordinat;
create policy "ilce_koordinat_oku" on public.ilce_koordinat
  for select to authenticated using (true);


-- ============================================================================
-- 3) 🔎 ADRESTEN İLÇE + KOORDİNAT BUL
-- ============================================================================
create or replace function public.adres_koordinat(p_adres text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_adr text := public.parca_adi_normal(coalesce(p_adres,''));
  v_r record;
begin
  if length(v_adr) < 3 then return null; end if;

  -- En uzun eşleşen ilçeyi bul (yanlış eşleşmeyi önler)
  for v_r in
    select k.ilce, k.lat, k.lng, length(k.ilce) as uzunluk
    from public.ilce_koordinat k
    where v_adr like '%' || public.parca_adi_normal(k.ilce) || '%'
    order by length(k.ilce) desc
    limit 1
  loop
    return jsonb_build_object(
      'lat', v_r.lat, 'lng', v_r.lng,
      'ilce', v_r.ilce, 'kaynak', 'ilce');
  end loop;

  return null;
end $$;

revoke all on function public.adres_koordinat(text) from public;
grant execute on function public.adres_koordinat(text) to authenticated;


-- ============================================================================
-- 4) 📍 RANDEVU KOORDİNATLARINI DOLDUR (2 katmanlı)
-- ============================================================================
do $$
declare v_adet integer := 0; v_toplam integer := 0;
begin
  -- KATMAN 1: Vinç tablosundan müşteri eşleşmesi
  begin
    update public.randevular r
       set lat = c.lat, lng = c.lng
      from public.cranes c
     where r.lat is null and c.lat is not null
       and public.parca_adi_normal(coalesce(r.customer_name, r.musteri_adi,'')) <> ''
       and (
         public.parca_adi_normal(c.customer_name) = public.parca_adi_normal(coalesce(r.customer_name, r.musteri_adi,''))
         or public.parca_adi_normal(c.customer_name) like '%' || public.parca_adi_normal(coalesce(r.customer_name, r.musteri_adi,'')) || '%'
         or public.parca_adi_normal(coalesce(r.customer_name, r.musteri_adi,'')) like '%' || public.parca_adi_normal(c.customer_name) || '%'
       );
    get diagnostics v_adet = row_count;
    raise notice '✅ Katman 1 (vinç eşleşmesi): % randevu', v_adet;
    v_toplam := v_toplam + v_adet;
  exception when others then
    raise notice '⚠️ Katman 1 atlandı → %', sqlerrm;
  end;

  -- KATMAN 2: Adres metninden ilçe koordinatı
  begin
    update public.randevular r
       set lat = (public.adres_koordinat(coalesce(r.address, r.adres, r.location,'')) ->> 'lat')::numeric,
           lng = (public.adres_koordinat(coalesce(r.address, r.adres, r.location,'')) ->> 'lng')::numeric
     where r.lat is null
       and public.adres_koordinat(coalesce(r.address, r.adres, r.location,'')) is not null;
    get diagnostics v_adet = row_count;
    raise notice '✅ Katman 2 (adres→ilçe): % randevu', v_adet;
    v_toplam := v_toplam + v_adet;
  exception when others then
    raise notice '⚠️ Katman 2 atlandı → %', sqlerrm;
  end;

  raise notice '📍 TOPLAM koordinat eklenen: %', v_toplam;
end $$;


-- ============================================================================
-- 5) 🗺️ HARİTA NOKTALARI v2 — randevular dahil
-- ============================================================================
create or replace function public.harita_noktalari()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_vinc jsonb := '[]'::jsonb;
  v_rand jsonb := '[]'::jsonb;
  v_talep jsonb := '[]'::jsonb;
  v_bakim jsonb := '[]'::jsonb;
begin
  -- VİNÇLER
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'lat', (to_jsonb(c)->>'lat')::numeric, 'lng', (to_jsonb(c)->>'lng')::numeric, 'tip', 'vinc',
             'baslik', public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi'),
             'alt', coalesce(nullif(public.jalan(to_jsonb(c),'makine_tipi','machine_type'),''),'Vinç') || ' · ' ||
                    coalesce(nullif(public.jalan(to_jsonb(c),'crane_capacity','capacity'),''),'—'),
             'adres', public.jalan(to_jsonb(c),'location_address','address'),
             'telefon', public.jalan(to_jsonb(c),'customer_phone','phone','telefon'))), '[]'::jsonb)
      into v_vinc
    from public.cranes c
    where nullif(trim(coalesce(to_jsonb(c)->>'lat','')),'') is not null
      and public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> '';
  exception when others then v_vinc := '[]'::jsonb; end;

  -- ⭐ RANDEVULAR (planlayıcı ekranından)
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'lat', (to_jsonb(r)->>'lat')::numeric,
             'lng', (to_jsonb(r)->>'lng')::numeric,
             'tip', 'randevu',
             'baslik', coalesce(
               nullif(trim(coalesce(to_jsonb(r)->>'customer_name','')),''),
               nullif(trim(coalesce(to_jsonb(r)->>'musteri_adi','')),''),
               nullif(trim(coalesce(to_jsonb(r)->>'firma_adi','')),''), 'Randevu'),
             'alt', coalesce(nullif(trim(coalesce(to_jsonb(r)->>'service_type','')),''),
                             nullif(trim(coalesce(to_jsonb(r)->>'is_tipi','')),''), 'Servis') ||
                    ' · ' || coalesce(to_jsonb(r)->>'appointment_date', to_jsonb(r)->>'tarih', to_jsonb(r)->>'randevu_tarihi','?'),
             'adres', coalesce(to_jsonb(r)->>'address', to_jsonb(r)->>'adres', to_jsonb(r)->>'location',''),
             'telefon', coalesce(to_jsonb(r)->>'phone', to_jsonb(r)->>'telefon', to_jsonb(r)->>'customer_phone',''),
             'durum', coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum','planlandi'))), '[]'::jsonb)
      into v_rand
    from public.randevular r
    where nullif(trim(coalesce(to_jsonb(r)->>'lat','')),'') is not null;
  exception when others then v_rand := '[]'::jsonb; end;

  -- TALEPLER
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'lat', (to_jsonb(t)->>'lat')::numeric, 'lng', (to_jsonb(t)->>'lng')::numeric, 'tip', 'talep',
             'baslik', coalesce(nullif(public.jalan(to_jsonb(t),'manual_customer_name','customer_name'),''),'İsimsiz'),
             'alt', left(coalesce(public.jalan(to_jsonb(t),'description','issue_type'),'-'), 60),
             'adres', public.jalan(to_jsonb(t),'manual_location','location'),
             'telefon', public.jalan(to_jsonb(t),'manual_phone','phone'),
             'aciliyet', coalesce(nullif(public.jalan(to_jsonb(t),'priority'),''),'Normal'))), '[]'::jsonb)
      into v_talep
    from public.service_tickets t
    where nullif(trim(coalesce(to_jsonb(t)->>'lat','')),'') is not null
      and coalesce(public.jalan(to_jsonb(t),'pipeline_status'),'') not in ('tamamlandi','iptal');
  exception when others then v_talep := '[]'::jsonb; end;

  -- BAKIMI GELENLER
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'lat', (to_jsonb(c)->>'lat')::numeric, 'lng', (to_jsonb(c)->>'lng')::numeric, 'tip', 'bakim',
             'baslik', public.jalan(to_jsonb(c),'customer_name','firma_adi'),
             'alt', 'Bakım: ' || coalesce(public.jalan(to_jsonb(c),'next_maintenance_date'),'?'),
             'adres', public.jalan(to_jsonb(c),'location_address','address'),
             'telefon', public.jalan(to_jsonb(c),'customer_phone','phone'))), '[]'::jsonb)
      into v_bakim
    from public.cranes c
    where nullif(trim(coalesce(to_jsonb(c)->>'lat','')),'') is not null
      and nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'') is not null
      and (to_jsonb(c)->>'next_maintenance_date')::date <= current_date + 30;
  exception when others then v_bakim := '[]'::jsonb; end;

  return jsonb_build_object(
    'vinc', v_vinc, 'randevu', v_rand, 'talep', v_talep, 'bakim', v_bakim,
    'merkez', jsonb_build_object(
      'lat', coalesce((select round(avg((to_jsonb(c)->>'lat')::numeric),4) from public.cranes c
                        where nullif(trim(coalesce(to_jsonb(c)->>'lat','')),'') is not null), 40.1950),
      'lng', coalesce((select round(avg((to_jsonb(c)->>'lng')::numeric),4) from public.cranes c
                        where nullif(trim(coalesce(to_jsonb(c)->>'lng','')),'') is not null), 29.0600)),
    'sayilar', jsonb_build_object(
      'vinc', jsonb_array_length(v_vinc),
      'randevu', jsonb_array_length(v_rand),
      'talep', jsonb_array_length(v_talep),
      'bakim', jsonb_array_length(v_bakim)));
end $$;

revoke all on function public.harita_noktalari() from public;
grant execute on function public.harita_noktalari() to authenticated;


-- ============================================================================
-- 6) SONUÇ
-- ============================================================================
select
  (public.harita_noktalari() -> 'sayilar' ->> 'vinc')    as vinc,
  (public.harita_noktalari() -> 'sayilar' ->> 'randevu') as randevu,
  (public.harita_noktalari() -> 'sayilar' ->> 'talep')   as talep,
  (public.harita_noktalari() -> 'sayilar' ->> 'bakim')   as bakim;

-- Randevu örnekleri
select public.harita_noktalari() -> 'randevu' as randevu_noktalari;

-- Adres testi
select 'Balat OSB, Mavi Cd. No:2, 16220 Nilüfer/Bursa' as adres,
       public.adres_koordinat('Balat OSB, Mavi Cd. No:2, 16220 Nilüfer/Bursa') as koordinat
union all
select 'Minareliçavuş OSB, N. 117 Sk. No:23 D:1, 16140 Nilüfer/Bursa',
       public.adres_koordinat('Minareliçavuş OSB, N. 117 Sk. No:23 D:1, 16140 Nilüfer/Bursa');
