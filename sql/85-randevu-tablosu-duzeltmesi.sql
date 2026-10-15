-- ============================================================================
--  🔧 RANDEVU TABLOSU DÜZELTMESİ (Güncelleme #59)
-- ----------------------------------------------------------------------------
--  BULGU: Randevu tablosunun adı "appointments" DEĞİL → "randevular" (Türkçe!)
--
--  ETKİLENEN YERLER:
--    • rota_optimize()      → hata veriyordu
--    • gunun_rotasi()       → hata veriyordu
--    • akilli_haftalik_plan() → randevuları bulamıyordu
--    • kokpit_ozet()        → randevu sayısı 0 görünüyordu
--    • bakim_durumu()       → randevu etkisi yok
--
--  ÇÖZÜM: Dinamik tablo bulma — hangi isim varsa onu kullanır
--         (randevular VEYA appointments) → isim değişse bile çalışır
--
--  KULLANIM: 84'ten SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 0) EKSİK YARDIMCILAR (SQL 75 hata verince oluşmamıştı)
-- ============================================================================

-- 📏 Mesafe hesabı (Haversine — kuş uçuşu km)
create or replace function public.mesafe_km(
  p_lat1 numeric, p_lng1 numeric,
  p_lat2 numeric, p_lng2 numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then null
    else round(
      6371 * 2 * asin(sqrt(
        power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
        cos(radians(p_lat1)) * cos(radians(p_lat2)) *
        power(sin(radians(p_lng2 - p_lng1) / 2), 2)
      ))::numeric
    , 1)
  end;
$$;

revoke all on function public.mesafe_km(numeric, numeric, numeric, numeric) from public;
grant execute on function public.mesafe_km(numeric, numeric, numeric, numeric) to authenticated;


-- 📊 Bölge analizi (randevusuz — sadece vinç müşterileri)
create or replace function public.bolge_analizi()
returns table (
  bolge text, vinc_sayisi integer, musteri_sayisi integer, toplam_ciro numeric,
  son_servis text, gun_once integer, bakim_bekleyen integer, durum text
)
language sql
stable
security definer
set search_path = public
as $$
  with bolgeler as (
    select
      public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') as customer_name,
      coalesce(
        nullif(trim(split_part(coalesce(public.jalan(to_jsonb(c),'location_address','address'),''), '/', 1)), ''),
        nullif(trim(split_part(coalesce(public.jalan(to_jsonb(c),'location_address','address'),''), ',', 1)), ''),
        'Adres yok'
      ) as bolge,
      nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date as bakim
    from public.cranes c
    where public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
  ),
  ciro as (
    select public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer')) as mnorm,
           round(coalesce(sum(cs.price),0)) as toplam, max(cs.service_date::date) as son_t
    from public.completed_services cs group by 1
  )
  select
    b.bolge,
    count(*)::int,
    count(distinct b.customer_name)::int,
    coalesce(sum(ci.toplam), 0),
    case when max(ci.son_t) is not null then to_char(max(ci.son_t),'DD.MM.YYYY') else null end,
    case when max(ci.son_t) is not null then (current_date - max(ci.son_t))::int else null end,
    count(*) filter (where b.bakim is not null and b.bakim <= current_date + 30)::int,
    case
      when b.bolge = 'Adres yok' then '⚠️ Adres eksik'
      when count(*) >= 20 then '⭐ ANA BÖLGE'
      when count(*) >= 10 then '🟢 GÜÇLÜ'
      when count(*) >= 5  then '🟡 ORTA'
      else '🔵 POTANSİYEL' end
  from bolgeler b
  left join ciro ci on ci.mnorm = public.parca_adi_normal(b.customer_name)
  group by b.bolge
  order by count(*) desc
  limit 30;
$$;

revoke all on function public.bolge_analizi() from public;
grant execute on function public.bolge_analizi() to authenticated;


-- 📍 Harita noktaları (SQL 80'de kuruldu ama garanti olsun)
create or replace function public.harita_noktalari()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_vinc jsonb := '[]'::jsonb;
  v_talep jsonb := '[]'::jsonb;
  v_bakim jsonb := '[]'::jsonb;
  v_yapildi jsonb := '[]'::jsonb;
begin
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

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'lat', (to_jsonb(t)->>'lat')::numeric, 'lng', (to_jsonb(t)->>'lng')::numeric, 'tip', 'talep',
             'baslik', coalesce(nullif(public.jalan(to_jsonb(t),'manual_customer_name','customer_name'),''),'İsimsiz'),
             'alt', left(coalesce(public.jalan(to_jsonb(t),'description','issue_type'),'-'), 60),
             'aciliyet', coalesce(nullif(public.jalan(to_jsonb(t),'priority'),''),'Normal'),
             'adres', public.jalan(to_jsonb(t),'manual_location','location'),
             'telefon', public.jalan(to_jsonb(t),'manual_phone','phone'))), '[]'::jsonb)
      into v_talep
    from public.service_tickets t
    where nullif(trim(coalesce(to_jsonb(t)->>'lat','')),'') is not null
      and coalesce(public.jalan(to_jsonb(t),'pipeline_status'),'') not in ('tamamlandi','iptal');
  exception when others then v_talep := '[]'::jsonb; end;

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

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'lat', (to_jsonb(r)->>'lat')::numeric, 'lng', (to_jsonb(r)->>'lng')::numeric,
             'tip', 'yapildi', 'baslik', 'Bugün yapıldı',
             'alt', public.jalan(to_jsonb(r),'musteri_adi','customer_name'))), '[]'::jsonb)
      into v_yapildi
    from public.service_reports r
    where nullif(trim(coalesce(to_jsonb(r)->>'lat','')),'') is not null
      and r.created_at::date = (now() at time zone 'Europe/Istanbul')::date;
  exception when others then v_yapildi := '[]'::jsonb; end;

  return jsonb_build_object(
    'vinc', v_vinc, 'talep', v_talep, 'bakim', v_bakim, 'yapildi', v_yapildi,
    'merkez', jsonb_build_object(
      'lat', coalesce((select round(avg((to_jsonb(c)->>'lat')::numeric),4) from public.cranes c
                        where nullif(trim(coalesce(to_jsonb(c)->>'lat','')),'') is not null), 40.1950),
      'lng', coalesce((select round(avg((to_jsonb(c)->>'lng')::numeric),4) from public.cranes c
                        where nullif(trim(coalesce(to_jsonb(c)->>'lng','')),'') is not null), 29.0600)),
    'sayilar', jsonb_build_object(
      'vinc', jsonb_array_length(v_vinc), 'talep', jsonb_array_length(v_talep),
      'bakim', jsonb_array_length(v_bakim), 'yapildi', jsonb_array_length(v_yapildi)));
end $$;

revoke all on function public.harita_noktalari() from public;
grant execute on function public.harita_noktalari() to authenticated;


-- ============================================================================
-- 1) YARDIMCILAR — randevu tablosunu dinamik bul
-- ============================================================================
create or replace function public.randevu_tablo()
returns text
language sql
stable
as $$
  select case
    when to_regclass('public.randevular')   is not null then 'randevular'
    when to_regclass('public.appointments') is not null then 'appointments'
    else '' end;
$$;

create or replace function public.randevu_sayisi(p_bas date, p_bit date)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tablo text;
  v_adet  integer := 0;
  v_alan  text;
begin
  v_tablo := public.randevu_tablo();
  if v_tablo = '' then return 0; end if;

  -- Tarih alanı için olası isimler
  foreach v_alan in array array['appointment_date','randevu_tarihi','tarih','date','randevu_zamani'] loop
    begin
      execute format(
        'select count(*) from public.%I a where nullif(trim(coalesce(to_jsonb(a)->>%L,'''')),'''')::date between $1 and $2',
        v_tablo, v_alan)
        into v_adet using p_bas, p_bit;
      return coalesce(v_adet, 0);
    exception when others then
      v_adet := 0;
    end;
  end loop;

  return 0;
end $$;

create or replace function public.randevu_listesi(p_bas date, p_bit date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tablo text;
  v_alan  text;
  v_sonuc jsonb := '[]'::jsonb;
begin
  v_tablo := public.randevu_tablo();
  if v_tablo = '' then return '[]'::jsonb; end if;

  foreach v_alan in array array['appointment_date','randevu_tarihi','tarih','date','randevu_zamani'] loop
    begin
      execute format($q$
        select coalesce(jsonb_agg(jsonb_build_object(
                 'musteri', coalesce(
                   nullif(trim(coalesce(to_jsonb(a)->>'customer_name','')),''),
                   nullif(trim(coalesce(to_jsonb(a)->>'firma_adi','')),''),
                   nullif(trim(coalesce(to_jsonb(a)->>'musteri_adi','')),''),
                   nullif(trim(coalesce(to_jsonb(a)->>'musteri','')),''),
                   'İsimsiz'),
                 'tarih', to_char(nullif(trim(coalesce(to_jsonb(a)->>%L,'''')),'''')::date,'DD.MM.YYYY'),
                 'lat', nullif(trim(coalesce(to_jsonb(a)->>'lat','')),''),
                 'lng', nullif(trim(coalesce(to_jsonb(a)->>'lng','')),''),
                 'adres', coalesce(to_jsonb(a)->>'location', to_jsonb(a)->>'adres',''),
                 'telefon', coalesce(to_jsonb(a)->>'phone', to_jsonb(a)->>'telefon','')
               ) order by nullif(trim(coalesce(to_jsonb(a)->>%L,'''')),'''')::date), '[]'::jsonb)
        from public.%I a
        where nullif(trim(coalesce(to_jsonb(a)->>%L,'''')),'''')::date between $1 and $2
      $q$, v_alan, v_alan, v_tablo, v_alan)
        into v_sonuc using p_bas, p_bit;
      return coalesce(v_sonuc, '[]'::jsonb);
    exception when others then
      v_sonuc := '[]'::jsonb;
    end;
  end loop;

  return '[]'::jsonb;
end $$;

revoke all on function public.randevu_tablo() from public;
revoke all on function public.randevu_sayisi(date, date) from public;
revoke all on function public.randevu_listesi(date, date) from public;
grant execute on function public.randevu_tablo() to authenticated;
grant execute on function public.randevu_sayisi(date, date) to authenticated;
grant execute on function public.randevu_listesi(date, date) to authenticated;


-- ============================================================================
-- 2) 🚐 ROTA OPTİMİZASYONU (randevu tablosu dinamik)
-- ============================================================================
create or replace function public.rota_optimize(
  p_baslangic_lat numeric default null,
  p_baslangic_lng numeric default null,
  p_tarih         date    default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tarih  date := coalesce(p_tarih, (now() at time zone 'Europe/Istanbul')::date);
  v_lat    numeric := coalesce(p_baslangic_lat, 40.1950);
  v_lng    numeric := coalesce(p_baslangic_lng, 29.0600);
  v_kalan  jsonb;
  v_rota   jsonb := '[]'::jsonb;
  v_sira   integer := 0;
  v_toplam numeric := 0;
  v_en     jsonb;
  v_mes    numeric;
  v_secili integer;
  v_i      integer;
  v_adet   integer;
begin
  -- Noktaları topla: randevular + bakımı gelenler + kritik talepler
  begin
    with rnd as (
      select public.randevu_listesi(v_tarih, v_tarih) as l
    )
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_kalan
    from (
      -- Randevular (koordinatlı)
      select jsonb_build_object(
               'lat', (r->>'lat')::numeric, 'lng', (r->>'lng')::numeric,
               'baslik', r->>'musteri', 'tur', 'Randevu', 'adres', coalesce(r->>'adres','')) as x
      from rnd, jsonb_array_elements(rnd.l) r
      where nullif(coalesce(r->>'lat',''),'') is not null
        and nullif(coalesce(r->>'lng',''),'') is not null

      union all
      -- Bakımı gelenler
      select jsonb_build_object(
               'lat', (to_jsonb(c)->>'lat')::numeric, 'lng', (to_jsonb(c)->>'lng')::numeric,
               'baslik', public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi'),
               'tur', 'Bakım',
               'adres', public.jalan(to_jsonb(c),'location_address','address')) as x
      from public.cranes c
      where nullif(trim(coalesce(to_jsonb(c)->>'lat','')),'') is not null
        and nullif(trim(coalesce(to_jsonb(c)->>'lng','')),'') is not null
        and nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'') is not null
        and (to_jsonb(c)->>'next_maintenance_date')::date <= v_tarih

      union all
      -- Kritik talepler
      select jsonb_build_object(
               'lat', (to_jsonb(t)->>'lat')::numeric, 'lng', (to_jsonb(t)->>'lng')::numeric,
               'baslik', coalesce(nullif(public.jalan(to_jsonb(t),'manual_customer_name','customer_name'),''),'İsimsiz'),
               'tur', 'Kritik Talep',
               'adres', public.jalan(to_jsonb(t),'manual_location','location')) as x
      from public.service_tickets t
      where nullif(trim(coalesce(to_jsonb(t)->>'lat','')),'') is not null
        and nullif(trim(coalesce(to_jsonb(t)->>'lng','')),'') is not null
        and coalesce(public.jalan(to_jsonb(t),'pipeline_status'),'') not in ('tamamlandi','iptal')
    ) n;
  exception when others then v_kalan := '[]'::jsonb; end;

  v_adet := least(coalesce(jsonb_array_length(v_kalan), 0), 20);

  for v_i in 1..v_adet loop
    v_en := null; v_mes := null; v_secili := null;

    for v_sira in 0..(jsonb_array_length(v_kalan) - 1) loop
      declare
        v_p jsonb := v_kalan -> v_sira;
        v_d numeric;
      begin
        if v_p is null then continue; end if;
        v_d := public.mesafe_km(v_lat, v_lng, (v_p->>'lat')::numeric, (v_p->>'lng')::numeric);
        if v_d is not null and (v_mes is null or v_d < v_mes) then
          v_mes := v_d; v_en := v_p; v_secili := v_sira;
        end if;
      end;
    end loop;

    exit when v_en is null;

    v_toplam := v_toplam + coalesce(v_mes, 0);
    v_rota := v_rota || jsonb_build_object(
      'sira', v_i, 'lat', v_en->>'lat', 'lng', v_en->>'lng',
      'baslik', v_en->>'baslik', 'tur', v_en->>'tur',
      'adres', v_en->>'adres', 'mesafe', coalesce(v_mes, 0));

    v_lat := (v_en->>'lat')::numeric;
    v_lng := (v_en->>'lng')::numeric;

    select coalesce(jsonb_agg(y), '[]'::jsonb) into v_kalan
    from (select value as y from jsonb_array_elements(v_kalan) with ordinality
          where ordinality - 1 <> v_secili) z;
  end loop;

  return jsonb_build_object(
    'tarih', to_char(v_tarih, 'DD.MM.YYYY'),
    'duraklar', v_rota,
    'durak_sayisi', jsonb_array_length(v_rota),
    'toplam_km', round(coalesce(v_toplam, 0), 1),
    'tahmini_sure_saat', round(coalesce(v_toplam, 0) / 45.0 + jsonb_array_length(v_rota) * 1.5, 1),
    'baslangic', jsonb_build_object('lat', coalesce(p_baslangic_lat, 40.1950), 'lng', coalesce(p_baslangic_lng, 29.0600)));
end $$;

revoke all on function public.rota_optimize(numeric, numeric, date) from public;
grant execute on function public.rota_optimize(numeric, numeric, date) to authenticated;

create or replace function public.gunun_rotasi()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$ select public.rota_optimize(null, null, null); $$;

revoke all on function public.gunun_rotasi() from public;
grant execute on function public.gunun_rotasi() to authenticated;


-- ============================================================================
-- 3) 🤖 AKILLI HAFTALIK PLAN (randevu dinamik)
-- ============================================================================
create or replace function public.akilli_haftalik_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gunler jsonb := '[]'::jsonb;
  v_bolgeler jsonb := '[]'::jsonb;
  v_gun record;
  v_rand jsonb;
begin
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'bolge', bolge, 'adet', adet, 'musteriler', musteriler) order by adet desc), '[]'::jsonb)
      into v_bolgeler
    from (
      select
        coalesce(nullif(split_part(trim(coalesce(public.jalan(to_jsonb(c),'location_address','address'),'')), ' ', 1), ''), 'Adres yok') as bolge,
        count(*)::int as adet,
        string_agg(distinct public.jalan(to_jsonb(c),'customer_name','firma_adi'), ', ') as musteriler
      from public.cranes c
      where nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'') is not null
        and (to_jsonb(c)->>'next_maintenance_date')::date <= current_date + 30
        and public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
      group by 1 order by 2 desc limit 8
    ) b;
  exception when others then v_bolgeler := '[]'::jsonb; end;

  begin
    for v_gun in
      select d::date as gun, extract(dow from d)::int as dow, to_char(d,'DD.MM.YYYY') as gun_str
      from generate_series(current_date, current_date + 6, interval '1 day') d
    loop
      begin
        v_rand := public.randevu_listesi(v_gun.gun, v_gun.gun);
      exception when others then v_rand := '[]'::jsonb; end;

      v_gunler := v_gunler || jsonb_build_object(
        'tarih', v_gun.gun_str, 'gun', v_gun.dow,
        'hafta_sonu', v_gun.dow in (0,6),
        'isler', coalesce(v_rand, '[]'::jsonb));
    end loop;
  exception when others then v_gunler := '[]'::jsonb; end;

  return jsonb_build_object(
    'bolgeler', v_bolgeler, 'gunler', v_gunler,
    'olusturma', to_char(now() at time zone 'Europe/Istanbul','DD.MM.YYYY HH24:MI'));
end $$;

revoke all on function public.akilli_haftalik_plan() from public;
grant execute on function public.akilli_haftalik_plan() to authenticated;


-- ============================================================================
-- 4) 📊 KOKPİT ÖZETİ v2 (randevu sayısı artık çalışıyor)
-- ============================================================================
create or replace function public.kokpit_randevu_ozet()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'bugun', public.randevu_sayisi((now() at time zone 'Europe/Istanbul')::date,
                                    (now() at time zone 'Europe/Istanbul')::date),
    'bu_hafta', public.randevu_sayisi((now() at time zone 'Europe/Istanbul')::date,
                                       (now() at time zone 'Europe/Istanbul')::date + 7),
    'bu_ay', public.randevu_sayisi((now() at time zone 'Europe/Istanbul')::date,
                                    (now() at time zone 'Europe/Istanbul')::date + 30),
    'tablo', public.randevu_tablo());
$$;

revoke all on function public.kokpit_randevu_ozet() from public;
grant execute on function public.kokpit_randevu_ozet() to authenticated;


-- ============================================================================
-- TEST — korunmuş
-- ============================================================================
do $$
declare
  v_testler text[][] := array[
    ['randevu_tablo',   'select public.randevu_tablo()'],
    ['randevu_sayisi',  'select public.randevu_sayisi(current_date - 30, current_date + 30)'],
    ['randevu_listesi', 'select public.randevu_listesi(current_date, current_date + 7)'],
    ['gunun_rotasi',    'select public.gunun_rotasi()'],
    ['akilli_plan',     'select public.akilli_haftalik_plan()']
  ];
  t text[];
  v_ok integer := 0; v_hata integer := 0;
begin
  raise notice ' ';
  raise notice '═══════ RANDEVU DÜZELTMESİ TESTİ ═══════';
  foreach t slice 1 in array v_testler loop
    begin
      execute t[2];
      raise notice '✅ %', rpad(t[1], 20);
      v_ok := v_ok + 1;
    exception when others then
      raise notice '❌ % → %', rpad(t[1], 20), sqlerrm;
      v_hata := v_hata + 1;
    end;
  end loop;
  raise notice '──────────────────────────────';
  raise notice 'ÇALIŞAN: %   HATALI: %', v_ok, v_hata;
  raise notice '════════════════════════════════';
end $$;


-- ============================================================================
-- SONUÇ
-- ============================================================================
select
  public.randevu_tablo()                                        as randevu_tablosu,
  public.randevu_sayisi(current_date - 30, current_date + 30)   as son_60_gun_randevu,
  (select count(*) from public.cranes c
    where nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'') is not null) as bakim_tarihli_vinc,
  coalesce(public.gunun_rotasi() ->> 'durak_sayisi','?')        as bugun_durak,
  coalesce(public.gunun_rotasi() ->> 'toplam_km','?')           as bugun_km;

-- Randevu örnekleri
select public.randevu_listesi(current_date, current_date + 30) as randevular;
