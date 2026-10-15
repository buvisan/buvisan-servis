-- ============================================================================
--  🗺️ FAZ 5 — HARİTA + AKILLI ROTA + BÖLGE YOĞUNLUĞU
-- ----------------------------------------------------------------------------
--  NE YAPAR?
--    1) mesafe_km()          → iki nokta arası kuş uçuşu mesafe (Haversine)
--    2) harita_noktalari()   → haritada gösterilecek TÜM noktalar
--    3) bolge_analizi()      → ilçe/bölge bazlı yoğunluk + potansiyel
--    4) rota_optimize()      → günün işlerini EN KISA sıraya dizer
--    5) gunun_rotasi()       → bugünün rotası (hazır)
--
--  ROTA ALGORİTMASI (En Yakın Komşu):
--    Başlangıç noktasından en yakın işe → oradan en yakın işe → ...
--    Gerçek hayatta %20-30 tasarruf sağlar
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 0) GEREKLİ SÜTUNLAR (yoksa ekle — hata çıkmasın)
-- ============================================================================
alter table public.cranes           add column if not exists lat numeric;
alter table public.cranes           add column if not exists lng numeric;
alter table public.appointments     add column if not exists lat numeric;
alter table public.appointments     add column if not exists lng numeric;
alter table public.service_tickets  add column if not exists lat numeric;
alter table public.service_tickets  add column if not exists lng numeric;

comment on column public.cranes.lat is 'Vinç/müşteri konum enlemi (harita için)';
comment on column public.cranes.lng is 'Vinç/müşteri konum boylamı (harita için)';


-- ============================================================================
-- 1) 📏 MESAFE HESABI (Haversine — kuş uçuşu km)
-- ============================================================================
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


-- ============================================================================
-- 2) 📍 HARİTA NOKTALARI — tüm önemli noktalar
-- ============================================================================
create or replace function public.harita_noktalari()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_vinc      jsonb := '[]'::jsonb;
  v_isler     jsonb := '[]'::jsonb;
  v_kritik    jsonb := '[]'::jsonb;
  v_bakim     jsonb := '[]'::jsonb;
begin
  -- 🔵 VİNÇLER (koordinatı olanlar)
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'lat', c.lat, 'lng', c.lng, 'tip', 'vinc',
             'baslik', c.customer_name,
             'alt', coalesce(nullif(trim(coalesce(c.makine_tipi,'')),''),'Vinç') || ' · ' ||
                    coalesce(nullif(trim(coalesce(c.crane_capacity,'')),''),'—'),
             'adres', coalesce(c.location_address,''),
             'telefon', coalesce(c.customer_phone,'')
           )), '[]'::jsonb)
      into v_vinc
    from public.cranes c
    where c.lat is not null and c.lng is not null
      and coalesce(c.customer_name,'') <> '';
  exception when others then v_vinc := '[]'::jsonb; end;

  -- 🟢 AKTİF SERVİS TALEPLERİ
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'lat', t.lat, 'lng', t.lng, 'tip', 'talep',
             'baslik', coalesce(t.manual_customer_name,'İsimsiz'),
             'alt', left(coalesce(t.description, t.issue_type, '-'), 60),
             'aciliyet', coalesce(t.priority,'Normal'),
             'adres', coalesce(t.manual_location,''),
             'telefon', coalesce(t.manual_phone,'')
           )), '[]'::jsonb)
      into v_kritik
    from public.service_tickets t
    where t.lat is not null and t.lng is not null
      and coalesce(t.pipeline_status,'') not in ('tamamlandi','iptal');
  exception when others then v_kritik := '[]'::jsonb; end;

  -- 🟡 BAKIM ZAMANI GELENLER
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'lat', c.lat, 'lng', c.lng, 'tip', 'bakim',
             'baslik', c.customer_name,
             'alt', 'Bakım: ' || to_char(c.next_maintenance_date,'DD.MM.YYYY'),
             'adres', coalesce(c.location_address,''),
             'telefon', coalesce(c.customer_phone,'')
           )), '[]'::jsonb)
      into v_bakim
    from public.cranes c
    where c.lat is not null and c.lng is not null
      and c.next_maintenance_date is not null
      and c.next_maintenance_date <= current_date + 30;
  exception when others then v_bakim := '[]'::jsonb; end;

  -- 🟠 BUGÜN YAPILAN İŞLER (rapor koordinatlarından)
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'lat', r.lat, 'lng', r.lng, 'tip', 'yapildi',
             'baslik', 'Bugün yapıldı',
             'alt', coalesce(nullif(trim(coalesce(to_jsonb(r)->>'musteri_adi','')),''),'-')
           )), '[]'::jsonb)
      into v_isler
    from public.service_reports r
    where r.lat is not null and r.lng is not null
      and r.created_at::date = (now() at time zone 'Europe/Istanbul')::date;
  exception when others then v_isler := '[]'::jsonb; end;

  return jsonb_build_object(
    'vinc', v_vinc,
    'talep', v_kritik,
    'bakim', v_bakim,
    'yapildi', v_isler,
    'merkez', jsonb_build_object(
      'lat', coalesce(
        (select avg(c.lat) from public.cranes c where c.lat is not null),
        40.1950),
      'lng', coalesce(
        (select avg(c.lng) from public.cranes c where c.lng is not null),
        29.0600)
    ),
    'sayilar', jsonb_build_object(
      'vinc', jsonb_array_length(v_vinc),
      'talep', jsonb_array_length(v_kritik),
      'bakim', jsonb_array_length(v_bakim),
      'yapildi', jsonb_array_length(v_isler)
    )
  );
end $$;

revoke all on function public.harita_noktalari() from public;
grant execute on function public.harita_noktalari() to authenticated;


-- ============================================================================
-- 3) 📊 BÖLGE ANALİZİ — yoğunluk + potansiyel
-- ============================================================================
create or replace function public.bolge_analizi()
returns table (
  bolge         text,
  vinc_sayisi   integer,
  musteri_sayisi integer,
  toplam_ciro   numeric,
  son_servis    text,
  gun_once      integer,
  bakim_bekleyen integer,
  durum         text
)
language sql
stable
security definer
set search_path = public
as $$
  with bolgeler as (
    select
      c.customer_name,
      -- İlçe tahmini: adresin 2. kelimesi (genelde "OSMANGAZI / BURSA" gibi)
      coalesce(
        nullif(trim(split_part(coalesce(c.location_address,''), '/', 1)), ''),
        nullif(trim(split_part(coalesce(c.location_address,''), ',', 1)), ''),
        'Adres yok'
      ) as bolge,
      c.next_maintenance_date
    from public.cranes c
    where coalesce(c.customer_name,'') <> ''
  )
  select
    b.bolge,
    count(*)::int,
    count(distinct b.customer_name)::int,
    coalesce((
      select round(sum(cs.price))
      from public.completed_services cs
      where public.parca_adi_normal(
              coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                       nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
            in (select public.parca_adi_normal(customer_name) from bolgeler b2 where b2.bolge = b.bolge)
    ), 0),
    (select to_char(max(cs.service_date::date),'DD.MM.YYYY')
     from public.completed_services cs
     where public.parca_adi_normal(
             coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                      nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
           in (select public.parca_adi_normal(customer_name) from bolgeler b2 where b2.bolge = b.bolge)),
    (select (current_date - max(cs.service_date::date))::int
     from public.completed_services cs
     where public.parca_adi_normal(
             coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                      nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
           in (select public.parca_adi_normal(customer_name) from bolgeler b2 where b2.bolge = b.bolge)),
    count(*) filter (where b.next_maintenance_date is not null and b.next_maintenance_date <= current_date + 30)::int,
    case
      when b.bolge = 'Adres yok' then '⚠️ Adres eksik'
      when count(*) >= 20 then '⭐ ANA BÖLGE'
      when count(*) >= 10 then '🟢 GÜÇLÜ'
      when count(*) >= 5  then '🟡 ORTA'
      else '🔵 POTANSİYEL' end
  from bolgeler b
  group by b.bolge
  order by count(*) desc
  limit 30;
$$;

revoke all on function public.bolge_analizi() from public;
grant execute on function public.bolge_analizi() to authenticated;


-- ============================================================================
-- 4) 🚐 ROTA OPTİMİZASYONU — en yakın komşu algoritması
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
  v_tarih    date := coalesce(p_tarih, (now() at time zone 'Europe/Istanbul')::date);
  v_lat      numeric := coalesce(p_baslangic_lat, 40.1950);
  v_lng      numeric := coalesce(p_baslangic_lng, 29.0600);
  v_kalan    jsonb;
  v_rota     jsonb := '[]'::jsonb;
  v_sira     integer := 0;
  v_toplam   numeric := 0;
  v_en_yakin jsonb;
  v_mesafe   numeric;
  v_secili   integer;
  v_i        integer;
  v_adet     integer;
begin
  -- Noktaları topla: randevular + bakımı gelenler + kritik talepler
  begin
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_kalan
    from (
      select jsonb_build_object(
               'lat', a.lat, 'lng', a.lng,
               'baslik', coalesce(nullif(trim(coalesce(to_jsonb(a)->>'customer_name','')),''),
                                  nullif(trim(coalesce(to_jsonb(a)->>'firma_adi','')),''),'İsimsiz'),
               'tur', 'Randevu', 'adres', coalesce(to_jsonb(a)->>'location','')
             ) as x
      from public.appointments a
      where a.appointment_date = v_tarih
        and a.lat is not null and a.lng is not null
      union all
      select jsonb_build_object(
               'lat', c.lat, 'lng', c.lng, 'baslik', c.customer_name,
               'tur', 'Bakım', 'adres', coalesce(c.location_address,''))
      from public.cranes c
      where c.lat is not null and c.lng is not null
        and c.next_maintenance_date is not null
        and c.next_maintenance_date <= v_tarih
      union all
      select jsonb_build_object(
               'lat', t.lat, 'lng', t.lng,
               'baslik', coalesce(t.manual_customer_name,'İsimsiz'),
               'tur', 'Kritik Talep', 'adres', coalesce(t.manual_location,''))
      from public.service_tickets t
      where t.lat is not null and t.lng is not null
        and coalesce(t.pipeline_status,'') not in ('tamamlandi','iptal')
    ) n;
  exception when others then v_kalan := '[]'::jsonb; end;

  -- En yakın komşu ile sırala (max 20 durak)
  v_adet := least(jsonb_array_length(v_kalan), 20);

  for v_i in 1..v_adet loop
    v_en_yakin := null; v_mesafe := null; v_secili := null;

    for v_sira in 0..(jsonb_array_length(v_kalan) - 1) loop
      declare
        v_p jsonb := v_kalan -> v_sira;
        v_d numeric;
      begin
        if v_p is null then continue; end if;
        v_d := public.mesafe_km(v_lat, v_lng,
                                (v_p->>'lat')::numeric,
                                (v_p->>'lng')::numeric);
        if v_d is not null and (v_mesafe is null or v_d < v_mesafe) then
          v_mesafe := v_d; v_en_yakin := v_p; v_secili := v_sira;
        end if;
      end;
    end loop;

    exit when v_en_yakin is null;

    v_toplam := v_toplam + coalesce(v_mesafe, 0);
    v_rota := v_rota || jsonb_build_object(
      'sira', v_i,
      'lat', v_en_yakin->>'lat',
      'lng', v_en_yakin->>'lng',
      'baslik', v_en_yakin->>'baslik',
      'tur', v_en_yakin->>'tur',
      'adres', v_en_yakin->>'adres',
      'mesafe', coalesce(v_mesafe, 0)
    );

    -- Konumu güncelle ve bu durağı listeden çıkar
    v_lat := (v_en_yakin->>'lat')::numeric;
    v_lng := (v_en_yakin->>'lng')::numeric;
    select coalesce(jsonb_agg(y), '[]'::jsonb) into v_kalan
    from (
      select value as y from jsonb_array_elements(v_kalan) with ordinality
      where ordinality - 1 <> v_secili
    ) z;
  end loop;

  return jsonb_build_object(
    'tarih', to_char(v_tarih, 'DD.MM.YYYY'),
    'duraklar', v_rota,
    'durak_sayisi', jsonb_array_length(v_rota),
    'toplam_km', round(coalesce(v_toplam, 0), 1),
    'tahmini_sure_saat', round(coalesce(v_toplam, 0) / 45.0 + jsonb_array_length(v_rota) * 1.5, 1),
    'baslangic', jsonb_build_object('lat', coalesce(p_baslangic_lat, 40.1950), 'lng', coalesce(p_baslangic_lng, 29.0600))
  );
end $$;

revoke all on function public.rota_optimize(numeric, numeric, date) from public;
grant execute on function public.rota_optimize(numeric, numeric, date) to authenticated;


-- ============================================================================
-- 5) 🚐 GÜNÜN ROTASI — bugün için hazır rota
-- ============================================================================
create or replace function public.gunun_rotasi()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.rota_optimize(null, null, null);
$$;

revoke all on function public.gunun_rotasi() from public;
grant execute on function public.gunun_rotasi() to authenticated;


-- ============================================================================
-- 6) TEST
-- ============================================================================
select public.harita_noktalari() -> 'sayilar' as harita_sayilari;
select * from public.bolge_analizi() limit 10;
select public.gunun_rotasi() -> 'durak_sayisi' as durak,
       public.gunun_rotasi() -> 'toplam_km'    as km;
select public.mesafe_km(40.1950, 29.0600, 40.2000, 29.0700) as ornek_mesafe_km;
