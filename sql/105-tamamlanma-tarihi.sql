-- ============================================================================
--  ✅ TAMAMLANMA TARİHİ + GÜNLÜK ROTA (Güncelleme #79)
-- ----------------------------------------------------------------------------
--  SENİN İSTEKLERİN:
--    1) "Bugün yapılan" = BUGÜN gerçekten bitirilenler (7 yanlış çıkıyordu)
--    2) Rota GÜNÜ GÜNÜNE = planlayıcıdaki o günün işleri (bugün 2 → rota 2)
--    3) Biten arıza rotadan SİLİNSİN
--
--  KÖK SORUN: Tamamlanma TARİHİ kaydedilmiyordu!
--             Sistem "yapıldı" durumunu görüyor ama NE ZAMAN bilmiyor.
--
--  ÇÖZÜM:
--    1) randevular.tamamlanma_tarihi sütunu eklendi
--    2) TRIGGER: durum "yapildi" olunca tarihi OTOMATİK yazar
--    3) Eski kayıtlar için makul varsayılan (randevu tarihi)
--    4) Rota: SADECE o günün randevuları + o günün bakımları
--
--  KULLANIM: 104'ten SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) ➕ tamamlanma_tarihi SÜTUNU
-- ============================================================================
do $$
begin
  begin
    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='randevular'
                      and column_name='tamamlanma_tarihi') then
      alter table public.randevular add column tamamlanma_tarihi timestamptz;
      raise notice '✅ randevular.tamamlanma_tarihi eklendi';
    else
      raise notice 'ℹ️ tamamlanma_tarihi zaten var';
    end if;
  exception when others then
    raise notice '⚠️ Sütun eklenemedi → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 2) 🔄 TRIGGER — "yapildi" olunca tarihi otomatik yaz
-- ============================================================================
create or replace function public.randevu_tamamlanma_tarihi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yeni_durum text;
  v_eski_durum text;
begin
  v_yeni_durum := public.parca_adi_normal(coalesce(to_jsonb(new)->>'status', to_jsonb(new)->>'durum',''));
  v_eski_durum := case when tg_op = 'UPDATE'
                       then public.parca_adi_normal(coalesce(to_jsonb(old)->>'status', to_jsonb(old)->>'durum',''))
                       else '' end;

  -- "yapildi" olduysa ve daha önce değildiyse → şimdi damgala
  if v_yeni_durum in ('tamamlandi','tamamlandı','yapildi','yapıldı') then
    if v_eski_durum not in ('tamamlandi','tamamlandı','yapildi','yapıldı')
       or (to_jsonb(new)->>'tamamlanma_tarihi') is null then
      begin
        new.tamamlanma_tarihi := now();
      exception when others then null; end;
    end if;
  -- Geri alındıysa → tarihi temizle
  elsif v_eski_durum in ('tamamlandi','tamamlandı','yapildi','yapıldı') then
    begin
      new.tamamlanma_tarihi := null;
    exception when others then null; end;
  end if;

  return new;
end $$;

do $$
begin
  begin
    drop trigger if exists tr_randevu_tamamlanma on public.randevular;
    create trigger tr_randevu_tamamlanma
      before insert or update on public.randevular
      for each row execute function public.randevu_tamamlanma_tarihi();
    raise notice '✅ Trigger: randevular → tamamlanma tarihi otomatik';
  exception when others then
    raise notice '⚠️ Trigger → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 3) 📅 ESKİ KAYITLAR — makul varsayılan
--    (randevu tarihi bugünse bugün, geçmişse randevu tarihi)
-- ============================================================================
do $$
declare v_adet integer := 0;
begin
  begin
    update public.randevular r
       set tamamlanma_tarihi = coalesce(
             nullif(trim(coalesce(to_jsonb(r)->>'appointment_date','')),'')::timestamptz,
             nullif(trim(coalesce(to_jsonb(r)->>'tarih','')),'')::timestamptz,
             now())
     where public.parca_adi_normal(coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum',''))
           in ('tamamlandi','tamamlandı','yapildi','yapıldı')
       and (to_jsonb(r)->>'tamamlanma_tarihi') is null;
    get diagnostics v_adet = row_count;
    raise notice '✅ Eski tamamlanmış kayıtlara tarih yazıldı: %', v_adet;
  exception when others then
    raise notice '⚠️ Eski kayıtlar → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 4) 🗺️ HARİTA v6 — "Bugün yapılan" = BUGÜN damgalananlar
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
  v_yapildi jsonb := '[]'::jsonb;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
begin
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', to_jsonb(c)->>'id', 'kaynak', 'cranes',
             'lat', (to_jsonb(c)->>'lat')::numeric, 'lng', (to_jsonb(c)->>'lng')::numeric, 'tip', 'vinc',
             'baslik', public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi'),
             'alt', coalesce(nullif(public.jalan(to_jsonb(c),'makine_tipi','machine_type'),''),'Vinç') || ' · ' ||
                    coalesce(nullif(public.jalan(to_jsonb(c),'crane_capacity','capacity'),''),'—'),
             'adres', coalesce(public.jalan(to_jsonb(c),'location_address','address'),''),
             'telefon', public.jalan(to_jsonb(c),'customer_phone','phone','telefon'))), '[]'::jsonb)
      into v_vinc
    from public.cranes c
    where nullif(trim(coalesce(to_jsonb(c)->>'lat','')),'') is not null
      and coalesce(to_jsonb(c)->>'aktif','true') not in ('false','0')
      and public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> '';
  exception when others then v_vinc := '[]'::jsonb; end;

  -- RANDEVULAR (bitmemiş, koordinatlı)
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', to_jsonb(r)->>'id', 'kaynak', 'randevular',
             'lat', (to_jsonb(r)->>'lat')::numeric, 'lng', (to_jsonb(r)->>'lng')::numeric, 'tip', 'randevu',
             'baslik', public.randevu_isim(to_jsonb(r)),
             'alt', coalesce(nullif(trim(coalesce(to_jsonb(r)->>'service_type','')),''),
                             nullif(trim(coalesce(to_jsonb(r)->>'is_tipi','')),''), 'Randevu'),
             'adres', coalesce(public.randevu_adres(to_jsonb(r)),''),
             'telefon', coalesce(nullif(trim(coalesce(to_jsonb(r)->>'phone','')),''),''),
             'durum', coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum','planlandi'))), '[]'::jsonb)
      into v_rand
    from public.randevular r
    where nullif(trim(coalesce(to_jsonb(r)->>'lat','')),'') is not null
      and public.parca_adi_normal(coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum',''))
          not in ('tamamlandi','tamamlandı','yapildi','yapıldı','iptal','canceled','cancelled','bitti','kapali','kapalı')
      and coalesce(nullif(trim(coalesce(to_jsonb(r)->>'appointment_date','')),'')::date,
                   nullif(trim(coalesce(to_jsonb(r)->>'tarih','')),'')::date,
                   current_date) > current_date - 60;
  exception when others then v_rand := '[]'::jsonb; end;

  -- AÇIK TALEPLER
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', to_jsonb(t)->>'id', 'kaynak', 'service_tickets',
             'lat', (to_jsonb(t)->>'lat')::numeric, 'lng', (to_jsonb(t)->>'lng')::numeric, 'tip', 'talep',
             'baslik', public.randevu_isim(to_jsonb(t)),
             'alt', left(coalesce(public.jalan(to_jsonb(t),'description','issue_type','konu'),'-'), 60),
             'adres', coalesce(public.randevu_adres(to_jsonb(t)),''),
             'telefon', coalesce(nullif(trim(coalesce(to_jsonb(t)->>'manual_phone','')),''),''),
             'aciliyet', coalesce(nullif(public.jalan(to_jsonb(t),'priority','aciliyet'),''),'Normal'))), '[]'::jsonb)
      into v_talep
    from public.service_tickets t
    where nullif(trim(coalesce(to_jsonb(t)->>'lat','')),'') is not null
      and public.parca_adi_normal(coalesce(public.jalan(to_jsonb(t),'pipeline_status','status','durum'),''))
          not in ('tamamlandi','tamamlandı','yapildi','yapıldı','iptal','canceled','cancelled','bitti','kapali','kapalı','servis_tamamlandi');
  exception when others then v_talep := '[]'::jsonb; end;

  -- ✅ BUGÜN YAPILANLAR — tamamlanma_tarihi BUGÜN olanlar
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', to_jsonb(r)->>'id', 'kaynak', 'randevular',
             'lat', (to_jsonb(r)->>'lat')::numeric, 'lng', (to_jsonb(r)->>'lng')::numeric, 'tip', 'yapildi',
             'baslik', public.randevu_isim(to_jsonb(r)),
             'alt', 'Bugün tamamlandı · ' || to_char((to_jsonb(r)->>'tamamlanma_tarihi')::timestamptz,
                                                     'DD.MM.YYYY HH24:MI'),
             'adres', coalesce(public.randevu_adres(to_jsonb(r)),''),
             'telefon', coalesce(nullif(trim(coalesce(to_jsonb(r)->>'phone','')),''),''))), '[]'::jsonb)
      into v_yapildi
    from public.randevular r
    where nullif(trim(coalesce(to_jsonb(r)->>'lat','')),'') is not null
      and public.parca_adi_normal(coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum',''))
          in ('tamamlandi','tamamlandı','yapildi','yapıldı')
      and nullif(trim(coalesce(to_jsonb(r)->>'tamamlanma_tarihi','')),'') is not null
      and (to_jsonb(r)->>'tamamlanma_tarihi')::timestamptz::date = v_bugun;
  exception when others then v_yapildi := '[]'::jsonb; end;

  return jsonb_build_object(
    'vinc', v_vinc, 'randevu', v_rand, 'talep', v_talep,
    'bakim', '[]'::jsonb, 'yapildi', v_yapildi,
    'merkez', jsonb_build_object(
      'lat', coalesce((select round(avg((to_jsonb(c)->>'lat')::numeric),4) from public.cranes c
                        where nullif(trim(coalesce(to_jsonb(c)->>'lat','')),'') is not null), 40.1950),
      'lng', coalesce((select round(avg((to_jsonb(c)->>'lng')::numeric),4) from public.cranes c
                        where nullif(trim(coalesce(to_jsonb(c)->>'lng','')),'') is not null), 29.0600)),
    'sayilar', jsonb_build_object(
      'vinc', jsonb_array_length(v_vinc),
      'randevu', jsonb_array_length(v_rand),
      'talep', jsonb_array_length(v_talep),
      'bakim', 0,
      'yapildi', jsonb_array_length(v_yapildi)));
end $$;

revoke all on function public.harita_noktalari() from public;
grant execute on function public.harita_noktalari() to authenticated;


-- ============================================================================
-- 5) 🚐 ROTA v4 — GÜNÜ GÜNÜNE (sadece o günün işleri)
--    + Biten işler rotaya GİRMEZ (durum kontrolü)
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
  v_sira integer := 0;
  v_toplam numeric := 0;
  v_en jsonb; v_mes numeric; v_secili integer; v_i integer; v_adet integer;
begin
  begin
    with gunluk as (
      -- a) O GÜNÜN randevuları (bitmemiş olanlar)
      select
        (to_jsonb(r)->>'lat')::numeric as lat,
        (to_jsonb(r)->>'lng')::numeric as lng,
        public.randevu_isim(to_jsonb(r)) as baslik,
        coalesce(nullif(trim(coalesce(to_jsonb(r)->>'service_type','')),''),
                 nullif(trim(coalesce(to_jsonb(r)->>'is_tipi','')),''), 'Randevu') as tur,
        coalesce(public.randevu_adres(to_jsonb(r)),'') as adres,
        case when public.parca_adi_normal(coalesce(to_jsonb(r)->>'is_tipi','')) = 'ariza' then 0 else 1 end as oncelik
      from public.randevular r
      where nullif(trim(coalesce(to_jsonb(r)->>'lat','')),'') is not null
        and nullif(trim(coalesce(to_jsonb(r)->>'lng','')),'') is not null
        and coalesce(nullif(trim(coalesce(to_jsonb(r)->>'appointment_date','')),'')::date,
                     nullif(trim(coalesce(to_jsonb(r)->>'tarih','')),'')::date) = v_tarih
        -- ⭐ BİTEN/İPTAL İŞLER ROTAYA GİRMEZ
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
    from (select * from gunluk order by oncelik asc limit 25) g;
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
-- 6) SONUÇ
-- ============================================================================
select
  (public.harita_noktalari() -> 'sayilar' ->> 'vinc')    as vinc,
  (public.harita_noktalari() -> 'sayilar' ->> 'randevu') as randevu,
  (public.harita_noktalari() -> 'sayilar' ->> 'talep')   as talep,
  (public.harita_noktalari() -> 'sayilar' ->> 'yapildi') as bugun_yapilan;

select
  public.gunun_rotasi() ->> 'tarih'        as tarih,
  public.gunun_rotasi() ->> 'tarih_gun'    as gun,
  public.gunun_rotasi() ->> 'durak_sayisi' as durak,
  public.gunun_rotasi() ->> 'toplam_km'    as km;

-- Bugünün rotası — duraklar
select (d->>'sira') as sira, (d->>'tur') as tur, (d->>'baslik') as musteri
from jsonb_array_elements(public.gunun_rotasi() -> 'duraklar') d;

-- Bugün planlanan randevular (planlayıcı ile karşılaştırma)
select public.randevu_isim(to_jsonb(r)) as musteri,
       coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum') as durum
from public.randevular r
where coalesce(nullif(trim(coalesce(to_jsonb(r)->>'appointment_date','')),'')::date,
               nullif(trim(coalesce(to_jsonb(r)->>'tarih','')),'')::date) = current_date;
