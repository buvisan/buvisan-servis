-- ============================================================================
--  📍 OSB + CADDE KOORDİNATLARI (Güncelleme #75)
-- ----------------------------------------------------------------------------
--  SORUN (harita ekranından):
--    1. ROLLMECH 1     ~0 km  Minareliçavuş OSB  ┐
--    2. ALPOLİMER      ~0 km  Minareliçavuş OSB  ├ hepsi aynı noktada!
--    3. ETABAL ÇELİK   ~0 km  NOSAB             ┘
--    → İlçe merkezi kullanıldığı için 0 km çıkıyor
--
--  ÇÖZÜM: OSB ve sanayi bölgelerinin GERÇEK koordinatlarını ekle
--         Daha uzun eşleşme öncelikli (NOSAB > Nilüfer)
--
--  KULLANIM: 100'den SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 🏭 OSB VE SANAYİ BÖLGESİ KOORDİNATLARI
-- ============================================================================
insert into public.ilce_koordinat (ilce, lat, lng) values
  ('minareliçavuş osb',   40.2360, 28.9330),
  ('minarelicavus osb',   40.2360, 28.9330),
  ('nosab',               40.2280, 28.9520),
  ('balat osb',           40.2320, 28.9450),
  ('demirtaş osb',        40.2200, 29.1300),
  ('demirtas osb',        40.2200, 29.1300),
  ('dosab',               40.2200, 29.1300),
  ('kestel osb',          40.1990, 29.2120),
  ('bursa osb',           40.2280, 28.9520),
  ('gürsu osb',           40.2190, 29.1930),
  ('gursu osb',           40.2190, 29.1930),
  ('inegöl osb',          40.0790, 29.5110),
  ('inegol osb',          40.0790, 29.5110),
  ('gemlik osb',          40.4320, 29.1560),
  ('barakfakih',          40.1950, 29.2700),
  ('kayapa',              40.1800, 29.0800),
  ('hasanağa',            40.2400, 28.8700),
  ('hasanaga',            40.2400, 28.8700),
  ('mudanya yolu',        40.2400, 28.9200),
  ('izmir yolu',          40.2100, 28.8500),
  ('izmir yolu cd',       40.2100, 28.8500),
  ('samanlı',             40.1800, 29.0800),
  ('samani',              40.1800, 29.0800),
  ('küçükbalıklı',        40.2000, 29.0800),
  ('kucukbalikli',        40.2000, 29.0800),
  ('demirci',             40.1900, 29.0400),
  ('panayır',             40.1950, 29.0700),
  ('panayir',             40.1950, 29.0700),
  ('hocataşkın',          40.2050, 29.0500),
  ('beşevler',            40.2100, 29.0350),
  ('besevler',            40.2100, 29.0350),
  ('görükle',             40.2280, 28.8400),
  ('gorukle',             40.2280, 28.8400),
  ('özlüce',              40.2250, 28.9000),
  ('ozluce',              40.2250, 28.9000),
  ('esentepe',            40.2150, 29.0250),
  ('çalı',                40.2050, 28.9000),
  ('cali',                40.2050, 28.9000),
  ('kükürtlü',            40.1980, 29.0350),
  ('kukurtlu',            40.1980, 29.0350),
  ('altıparmak',          40.1950, 29.0450),
  ('altiparmak',          40.1950, 29.0450),
  ('setbaşı',             40.1900, 29.0650),
  ('setbasi',             40.1900, 29.0650),
  ('heykel',              40.1850, 29.0600),
  ('santralgar',          40.1880, 29.0550),
  ('yıldırım',            40.1880, 29.1050),
  ('davutkadı',           40.1900, 29.1000),
  ('davutkadi',           40.1900, 29.1000),
  ('millet mah',          40.2000, 29.1200),
  ('karapınar',           40.2100, 29.1600),
  ('karapinar',           40.2100, 29.1600),
  ('hamitler',            40.2300, 28.9700),
  ('bağlarbaşı',          40.2150, 28.9900),
  ('baglarbasi',          40.2150, 28.9900),
  ('dereağzı',            40.2500, 28.9600),
  ('dereagzi',            40.2500, 28.9600),
  ('alaşar',              40.2450, 28.9000),
  ('alasar',              40.2450, 28.9000),
  ('akçalar',             40.2300, 28.7800),
  ('akcalar',             40.2300, 28.7800),
  ('gölyazı',             40.2550, 28.8200),
  ('golyazi',             40.2550, 28.8200),
  ('üçevler',             40.2250, 28.9750),
  ('ucevler',             40.2250, 28.9750),
  ('ihsaniye',            40.2400, 29.0000),
  ('eşrefzade',           40.4350, 29.7200),
  ('esrefzade',           40.4350, 29.7200),
  ('orhangazi osb',       40.4900, 29.3100),
  ('yeniköy',             40.2700, 29.6400),
  ('yenikoy',             40.2700, 29.6400),
  ('söğüt',               40.0150, 30.1830),
  ('sogut',               40.0150, 30.1830),
  ('bozüyük',             39.9080, 30.0400),
  ('bozuyuk',             39.9080, 30.0400),
  ('pazaryeri',           39.9950, 29.9000),
  ('mustafakemalpaşa osb', 40.0360, 28.4120),
  ('karacabey osb',       40.2140, 28.3600),
  ('gemlik serbest',      40.4300, 29.1300),
  ('taşköprü',            40.4100, 29.1800),
  ('taskopru',            40.4100, 29.1800),
  ('küçükkumla',          40.4700, 29.0500),
  ('kucukkumla',          40.4700, 29.0500),
  ('kurşunlu',            40.3900, 29.2500),
  ('kursunlu',            40.3900, 29.2500),
  ('umurbey',             40.4200, 29.1900),
  ('çınarcık',            40.4700, 29.1300),
  ('cinarcik',            40.4700, 29.1300),
  ('kumla',               40.4600, 29.1100),
  ('şahinyurdu',          40.4000, 29.2000),
  ('sahinyurdu',          40.4000, 29.2000)
on conflict (ilce) do update set lat = excluded.lat, lng = excluded.lng;


-- ============================================================================
-- 2) 🔎 ADRES ÇÖZÜCÜ v2 — EN UZUN eşleşme + sokak/no ipucu
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
  v_ek_lat numeric := 0;
  v_ek_lng numeric := 0;
  v_no integer;
begin
  if length(v_adr) < 3 then return null; end if;

  -- Sokak NO'suna göre küçük sapma ekle (aynı bölgedekiler üst üste gelmesin)
  begin
    v_no := nullif(substring(v_adr from 'no[:\s]*([0-9]{1,4})'), '')::integer;
    if v_no is not null then
      v_ek_lat := ((v_no % 20) - 10) * 0.00035;
      v_ek_lng := (((v_no * 7) % 20) - 10) * 0.00045;
    end if;
  exception when others then null; end;

  -- EN UZUN eşleşen anahtarı bul (NOSAB > Nilüfer)
  for v_r in
    select k.ilce, k.lat, k.lng
    from public.ilce_koordinat k
    where v_adr like '%' || public.parca_adi_normal(k.ilce) || '%'
    order by length(k.ilce) desc, k.ilce
    limit 1
  loop
    return jsonb_build_object(
      'lat', round(v_r.lat + v_ek_lat, 6),
      'lng', round(v_r.lng + v_ek_lng, 6),
      'ilce', v_r.ilce, 'kaynak', 'adres');
  end loop;

  return null;
end $$;

revoke all on function public.adres_koordinat(text) from public;
grant execute on function public.adres_koordinat(text) to authenticated;


-- ============================================================================
-- 3) 🔄 RANDEVU + TALEP KOORDİNATLARINI YENİDEN HESAPLA
-- ============================================================================
do $$
declare v_adet integer := 0;
begin
  -- Randevular
  begin
    update public.randevular r
       set lat = (public.adres_koordinat(public.randevu_adres(to_jsonb(r))) ->> 'lat')::numeric,
           lng = (public.adres_koordinat(public.randevu_adres(to_jsonb(r))) ->> 'lng')::numeric
     where public.adres_koordinat(public.randevu_adres(to_jsonb(r))) is not null;
    get diagnostics v_adet = row_count;
    raise notice '✅ Randevu koordinatı güncellendi: %', v_adet;
  exception when others then raise notice '⚠️ Randevu → %', sqlerrm; end;

  -- Servis talepleri
  begin
    update public.service_tickets t
       set lat = (public.adres_koordinat(public.randevu_adres(to_jsonb(t))) ->> 'lat')::numeric,
           lng = (public.adres_koordinat(public.randevu_adres(to_jsonb(t))) ->> 'lng')::numeric
     where public.adres_koordinat(public.randevu_adres(to_jsonb(t))) is not null;
    get diagnostics v_adet = row_count;
    raise notice '✅ Talep koordinatı güncellendi: %', v_adet;
  exception when others then raise notice '⚠️ Talep → %', sqlerrm; end;
end $$;


-- ============================================================================
-- 4) 🧪 TEST — aynı bölgedeki firmalar artık farklı noktada mı?
-- ============================================================================
select
  public.randevu_isim(to_jsonb(t)) as musteri,
  left(coalesce(public.randevu_adres(to_jsonb(t)),''), 45) as adres,
  t.lat, t.lng
from public.service_tickets t
where t.lat is not null
order by t.lat desc
limit 10;


-- ============================================================================
-- 5) SONUÇ
-- ============================================================================
select
  (public.harita_noktalari() -> 'sayilar' ->> 'vinc')    as vinc,
  (public.harita_noktalari() -> 'sayilar' ->> 'randevu') as randevu,
  (public.harita_noktalari() -> 'sayilar' ->> 'talep')   as talep;

select public.adres_koordinat('Minareliçavuş OSB, N. 117 Sk. No:23 D:1, 16140 Nilüfer/Bursa') as ornek1,
       public.adres_koordinat('NOSAB, 117. Sk. NO:15, 16140 Nilüfer/Bursa') as ornek2,
       public.adres_koordinat('Balat OSB, Mavi Cd. No:2, 16220 Nilüfer/Bursa') as ornek3;
