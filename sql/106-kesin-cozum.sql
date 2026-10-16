-- ============================================================================
--  🔧 KESİN ÇÖZÜM — Rotanın Çalışması (Güncelleme #80)
-- ----------------------------------------------------------------------------
--  TEŞHİS:
--    1) Rota 0 durak → bugünün randevuları (COATS, ALPOLİMER) KOORDİNATSIZ
--    2) "Bugün 7 iş" YANLIŞ → eski kayıtları now() ile damgaladım (benim hatam)
--    3) "6 talep" → service_tickets (ayrı havuz, randevulardan bağımsız)
--
--  ÇÖZÜM:
--    1) Yanlış tamamlanma tarihlerini DÜZELT (randevu tarihine çek, yoksa NULL)
--    2) Bugünün randevularına vinç eşleşmesinden OTOMATİK koordinat ver
--    3) Rota: koordinatsız işleri de "koordinat bekleyen" olarak BİLDİR
--
--  KULLANIM: 105'ten SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 🔧 YANLIŞ TAMAMLANMA TARİHLERİNİ DÜZELT
--    Eski kayıtlar: randevu tarihi → yoksa NULL (bugün DEĞİL!)
-- ============================================================================
do $$
declare v_adet integer := 0;
begin
  begin
    update public.randevular r
       set tamamlanma_tarihi = nullif(trim(coalesce(to_jsonb(r)->>'appointment_date','')),'')::timestamptz
     where public.parca_adi_normal(coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum',''))
           in ('tamamlandi','tamamlandı','yapildi','yapıldı')
       and nullif(trim(coalesce(to_jsonb(r)->>'appointment_date','')),'') is not null
       and nullif(trim(coalesce(to_jsonb(r)->>'appointment_date','')),'')::date <> current_date;
    get diagnostics v_adet = row_count;
    raise notice '✅ Yanlış damgalanan kayıtlar düzeltildi: %', v_adet;
  exception when others then
    raise notice '⚠️ Düzeltme → %', sqlerrm;
  end;

  -- Randevu tarihi hiç olmayanları NULL yap (bugün sayılmasınlar)
  begin
    update public.randevular
       set tamamlanma_tarihi = null
     where tamamlanma_tarihi is not null
       and tamamlanma_tarihi::date = current_date
       and nullif(trim(coalesce(to_jsonb(randevular)->>'appointment_date','')),'') is null;
    get diagnostics v_adet = row_count;
    raise notice '✅ Tarihi belirsiz kayıtlar temizlendi: %', v_adet;
  exception when others then null; end;
end $$;


-- ============================================================================
-- 2) 📍 BUGÜNÜN RANDEVULARINA OTOMATİK KOORDİNAT (vinç eşleşmesi)
-- ============================================================================
do $$
declare v_adet integer := 0;
begin
  begin
    update public.randevular r
       set lat = c.lat, lng = c.lng
      from public.cranes c
     where r.lat is null and c.lat is not null
       and public.randevu_isim(to_jsonb(r)) <> ''
       and (
         public.parca_adi_normal(c.customer_name) = public.randevu_isim(to_jsonb(r))
         or public.parca_adi_normal(c.customer_name) like '%' || public.randevu_isim(to_jsonb(r)) || '%'
         or public.randevu_isim(to_jsonb(r)) like '%' || public.parca_adi_normal(c.customer_name) || '%'
       );
    get diagnostics v_adet = row_count;
    raise notice '✅ Vinç eşleşmesinden koordinat alan randevu: %', v_adet;
  exception when others then
    raise notice '⚠️ Koordinat eşleşmesi → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 3) 🚐 ROTA v5 — koordinatsız işleri de RAPORLA + isim eşleşmesiyle koordinat
-- ============================================================================
create or replace function public.rota_optimize(
  p_baslangic_lat numeric default null,
  p_baslangic_lng numeric default null,
  p_tarih date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tarih date := coalesce(p_tarih, (now() at time zone 'Europe/Istanbul')::date);
  v_lat numeric := coalesce(p_baslangic_lat, 40.1950);
  v_lng numeric := coalesce(p_baslangic_lng, 29.0600);
  v_kalan jsonb;
  v_rota jsonb := '[]'::jsonb;
  v_eksik jsonb := '[]'::jsonb;
  v_sira integer := 0;
  v_toplam numeric := 0;
  v_en jsonb; v_mes numeric; v_secili integer; v_i integer; v_adet integer;
begin
  -- ⭐ KOORDİNATSIZ İŞLERİ AYRI LİSTELE
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'baslik', public.randevu_isim(to_jsonb(r)),
             'adres', coalesce(public.randevu_adres(to_jsonb(r)),''),
             'id', to_jsonb(r)->>'id')), '[]'::jsonb)
      into v_eksik
    from public.randevular r
    where coalesce(nullif(trim(coalesce(to_jsonb(r)->>'appointment_date','')),'')::date,
                   nullif(trim(coalesce(to_jsonb(r)->>'tarih','')),'')::date) = v_tarih
      and public.parca_adi_normal(coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum',''))
          not in ('tamamlandi','tamamlandı','yapildi','yapıldı','iptal','canceled','cancelled','bitti')
      and (nullif(trim(coalesce(to_jsonb(r)->>'lat','')),'') is null
           or nullif(trim(coalesce(to_jsonb(r)->>'lng','')),'') is null);
  exception when others then v_eksik := '[]'::jsonb; end;

  -- KOORDİNATLI İŞLER
  begin
    with gunluk as (
      -- a) O günün randevuları — koordinat varsa, yoksa VİNÇ eşleşmesinden
      select
        coalesce(
          (to_jsonb(r)->>'lat')::numeric,
          (select c.lat from public.cranes c
            where c.lat is not null and public.randevu_isim(to_jsonb(r)) <> ''
              and (public.parca_adi_normal(c.customer_name) = public.randevu_isim(to_jsonb(r))
                or public.parca_adi_normal(c.customer_name) like '%' || public.randevu_isim(to_jsonb(r)) || '%')
            limit 1)
        ) as lat,
        coalesce(
          (to_jsonb(r)->>'lng')::numeric,
          (select c.lng from public.cranes c
            where c.lng is not null and public.randevu_isim(to_jsonb(r)) <> ''
              and (public.parca_adi_normal(c.customer_name) = public.randevu_isim(to_jsonb(r))
                or public.parca_adi_normal(c.customer_name) like '%' || public.randevu_isim(to_jsonb(r)) || '%')
            limit 1)
        ) as lng,
        public.randevu_isim(to_jsonb(r)) as baslik,
        coalesce(nullif(trim(coalesce(to_jsonb(r)->>'service_type','')),''),
                 nullif(trim(coalesce(to_jsonb(r)->>'is_tipi','')),''), 'Randevu') as tur,
        coalesce(public.randevu_adres(to_jsonb(r)),'') as adres,
        case when public.parca_adi_normal(coalesce(to_jsonb(r)->>'is_tipi','')) = 'ariza' then 0 else 1 end as oncelik
      from public.randevular r
      where coalesce(nullif(trim(coalesce(to_jsonb(r)->>'appointment_date','')),'')::date,
                     nullif(trim(coalesce(to_jsonb(r)->>'tarih','')),'')::date) = v_tarih
        and public.parca_adi_normal(coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum',''))
            not in ('tamamlandi','tamamlandı','yapildi','yapıldı','iptal','canceled','cancelled','bitti','kapali','kapalı')

      union all
      -- b) Bakım tarihi TAM O GÜN olanlar
      select
        (to_jsonb(c)->>'lat')::numeric, (to_jsonb(c)->>'lng')::numeric,
        public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi'),
        'Bakım', coalesce(public.jalan(to_jsonb(c),'location_address','address'),''), 2
      from public.cranes c
      where nullif(trim(coalesce(to_jsonb(c)->>'lat','')),'') is not null
        and nullif(trim(coalesce(to_jsonb(c)->>'lng','')),'') is not null
        and nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date = v_tarih
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'lat', lat, 'lng', lng, 'baslik', baslik, 'tur', tur,
             'adres', adres, 'oncelik', oncelik)), '[]'::jsonb)
      into v_kalan
    from (select * from gunluk
          where lat is not null and lng is not null
          order by oncelik asc limit 25) g;
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
    'tarih_gun', case extract(dow from v_tarih)
      when 0 then 'Pazar' when 1 then 'Pazartesi' when 2 then 'Salı'
      when 3 then 'Çarşamba' when 4 then 'Perşembe' when 5 then 'Cuma' else 'Cumartesi' end,
    'duraklar', v_rota,
    'durak_sayisi', jsonb_array_length(v_rota),
    'koordinatsiz', v_eksik,
    'koordinatsiz_sayi', jsonb_array_length(v_eksik),
    'toplam_km', round(coalesce(v_toplam, 0), 1),
    'tahmini_sure_saat', round(coalesce(v_toplam, 0) / 45.0 + jsonb_array_length(v_rota) * 1.5, 1),
    'baslangic', jsonb_build_object('lat', coalesce(p_baslangic_lat, 40.1950), 'lng', coalesce(p_baslangic_lng, 29.0600)));
end $$;

revoke all on function public.rota_optimize(numeric, numeric, date) from public;
grant execute on function public.rota_optimize(numeric, numeric, date) to authenticated;

create or replace function public.gunun_rotasi()
returns jsonb language sql stable security definer set search_path = public
as $$ select public.rota_optimize(null, null, null); $$;

revoke all on function public.gunun_rotasi() from public;
grant execute on function public.gunun_rotasi() to authenticated;


-- ============================================================================
-- 4) ✅ BUGÜN YAPILAN — sadece GERÇEKTEN bugün damgalananlar
-- ============================================================================
create or replace function public.bugun_yapilanlar()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'musteri', public.randevu_isim(to_jsonb(r)),
           'saat', to_char((to_jsonb(r)->>'tamamlanma_tarihi')::timestamptz, 'HH24:MI'),
           'adres', coalesce(public.randevu_adres(to_jsonb(r)),''))), '[]'::jsonb)
  from public.randevular r
  where public.parca_adi_normal(coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum',''))
        in ('tamamlandi','tamamlandı','yapildi','yapıldı')
    and nullif(trim(coalesce(to_jsonb(r)->>'tamamlanma_tarihi','')),'') is not null
    and (to_jsonb(r)->>'tamamlanma_tarihi')::timestamptz::date
        = (now() at time zone 'Europe/Istanbul')::date;
$$;

revoke all on function public.bugun_yapilanlar() from public;
grant execute on function public.bugun_yapilanlar() to authenticated;


-- ============================================================================
-- 5) SONUÇ
-- ============================================================================
select
  public.gunun_rotasi() ->> 'tarih'              as tarih,
  public.gunun_rotasi() ->> 'tarih_gun'          as gun,
  public.gunun_rotasi() ->> 'durak_sayisi'       as durak,
  public.gunun_rotasi() ->> 'koordinatsiz_sayi'  as koordinatsiz,
  public.gunun_rotasi() ->> 'toplam_km'          as km;

-- Rotanın durakları
select (d->>'sira') as sira, (d->>'tur') as tur, (d->>'baslik') as musteri
from jsonb_array_elements(public.gunun_rotasi() -> 'duraklar') d;

-- Koordinat bekleyen işler
select (k->>'baslik') as musteri, left(coalesce(k->>'adres',''), 45) as adres
from jsonb_array_elements(public.gunun_rotasi() -> 'koordinatsiz') k;

-- Bugün gerçekten yapılanlar
select jsonb_array_length(public.bugun_yapilanlar()) as bugun_yapilan_adet;

-- Bugünün tüm randevuları (planlayıcı ile karşılaştır)
select public.randevu_isim(to_jsonb(r)) as musteri,
       coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum') as durum,
       case when (to_jsonb(r)->>'lat') is null then 'KOORDİNATSIZ' else 'koordinatlı' end as konum
from public.randevular r
where coalesce(nullif(trim(coalesce(to_jsonb(r)->>'appointment_date','')),'')::date,
               nullif(trim(coalesce(to_jsonb(r)->>'tarih','')),'')::date) = current_date;
