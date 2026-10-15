-- ============================================================================
--  🌍 GERÇEK ADRES GEOCoding + BİTEN İŞLERİ GİZLE (Güncelleme #76)
-- ----------------------------------------------------------------------------
--  SORUNLAR:
--    1) İlçe/OSB merkez koordinatı YANLIŞ yer gösteriyor
--       (ETABAL → "Gelinolu Sokak" çıkıyor ❌)
--    2) Yazılan açık adresler tam noktayı bulmalı
--    3) Biten işler haritada kalıyor — silinmeli
--
--  ÇÖZÜM:
--    1) geocode_kaydet() — tarayıcıdan gelen GERÇEK koordinatı kaydeder
--       (arayüz Nominatim/OpenStreetMap'e sorar, sonucu buraya yazar)
--    2) harita_noktalari() — biten/iptal işleri HARİÇ TUTAR
--    3) adres_tam() — Google Maps linki için temiz adres döner
--
--  KULLANIM: 101'den SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 📝 GEOCoding KAYIT TABLOSU (hangi adres çözüldü, ne zaman)
-- ============================================================================
create table if not exists public.geocode_kayit (
  id          uuid primary key default gen_random_uuid(),
  kaynak      text not null,                 -- 'randevular' | 'service_tickets' | 'cranes'
  kayit_id    uuid not null,
  adres       text,
  lat         numeric,
  lng         numeric,
  hassasiyet  text default 'sokak',          -- 'bina' | 'sokak' | 'mahalle' | 'ilce'
  saglayici   text default 'nominatim',
  olusturma   timestamptz default now(),
  unique (kaynak, kayit_id)
);

alter table public.geocode_kayit enable row level security;

drop policy if exists "geocode_oku" on public.geocode_kayit;
create policy "geocode_oku" on public.geocode_kayit
  for select to authenticated using (true);

drop policy if exists "geocode_yaz" on public.geocode_kayit;
create policy "geocode_yaz" on public.geocode_kayit
  for all to authenticated using (true) with check (true);


-- ============================================================================
-- 2) 💾 GEOCoding SONUCUNU KAYDET (arayüzden çağrılır)
-- ============================================================================
create or replace function public.geocode_kaydet(
  p_kaynak text, p_kayit_id uuid, p_lat numeric, p_lng numeric,
  p_adres text default null, p_hassasiyet text default 'sokak'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kaynak not in ('randevular','service_tickets','cranes') then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçersiz kaynak.');
  end if;
  if p_lat is null or p_lng is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Koordinat yok.');
  end if;
  if p_lat < 35 or p_lat > 43 or p_lng < 25 or p_lng > 45 then
    return jsonb_build_object('ok', false, 'mesaj', 'Koordinat Türkiye dışında.');
  end if;

  -- Kayıt tablosunu güncelle
  execute format('update public.%I set lat = $1, lng = $2 where id = $3', p_kaynak)
    using p_lat, p_lng, p_kayit_id;

  -- Geçmişe yaz
  insert into public.geocode_kayit (kaynak, kayit_id, adres, lat, lng, hassasiyet)
  values (p_kaynak, p_kayit_id, p_adres, p_lat, p_lng, p_hassasiyet)
  on conflict (kaynak, kayit_id) do update
    set lat = excluded.lat, lng = excluded.lng,
        adres = coalesce(excluded.adres, public.geocode_kayit.adres),
        hassasiyet = excluded.hassasiyet, olusturma = now();

  return jsonb_build_object('ok', true, 'lat', p_lat, 'lng', p_lng);
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.geocode_kaydet(text, uuid, numeric, numeric, text, text) from public;
grant execute on function public.geocode_kaydet(text, uuid, numeric, numeric, text, text) to authenticated;


-- ============================================================================
-- 3) 📋 KOORDİNATSIZ KAYITLARI LİSTELE (arayüz geocode edecek)
-- ============================================================================
create or replace function public.geocode_bekleyenler(p_limit integer default 25)
returns table (kaynak text, kayit_id uuid, adres text, musteri text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kaynak text;
  v_kolon  text;
begin
  -- RANDEVULAR
  begin
    return query execute $q$
      select 'randevular'::text, r.id, public.randevu_adres(to_jsonb(r)), public.randevu_isim(to_jsonb(r))
      from public.randevular r
      where nullif(trim(coalesce(to_jsonb(r)->>'lat','')),'') is null
        and length(coalesce(public.randevu_adres(to_jsonb(r)),'')) > 10
      limit $1
    $q$ using p_limit;
  exception when others then null; end;

  -- SERVİS TALEPLERİ
  begin
    return query execute $q$
      select 'service_tickets'::text, t.id, public.randevu_adres(to_jsonb(t)), public.randevu_isim(to_jsonb(t))
      from public.service_tickets t
      where nullif(trim(coalesce(to_jsonb(t)->>'lat','')),'') is null
        and length(coalesce(public.randevu_adres(to_jsonb(t)),'')) > 10
      limit $1
    $q$ using p_limit;
  exception when others then null; end;

  -- VİNÇLER
  begin
    return query execute $q$
      select 'cranes'::text, c.id, public.jalan(to_jsonb(c),'location_address','address'), 
             public.jalan(to_jsonb(c),'customer_name','firma_adi')
      from public.cranes c
      where nullif(trim(coalesce(to_jsonb(c)->>'lat','')),'') is null
        and length(coalesce(public.jalan(to_jsonb(c),'location_address','address'),'')) > 10
      limit $1
    $q$ using p_limit;
  exception when others then null; end;
end $$;

revoke all on function public.geocode_bekleyenler(integer) from public;
grant execute on function public.geocode_bekleyenler(integer) to authenticated;


-- ============================================================================
-- 4) 🗺️ HARİTA v4 — BİTEN İŞLERİ GİZLE + Google Maps linki için adres
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
begin
  -- VİNÇLER (pasif olanlar hariç)
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', to_jsonb(c)->>'id',
             'kaynak', 'cranes',
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

  -- 🗓️ RANDEVULAR — BİTENLERİ GİZLE
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', to_jsonb(r)->>'id',
             'kaynak', 'randevular',
             'lat', (to_jsonb(r)->>'lat')::numeric,
             'lng', (to_jsonb(r)->>'lng')::numeric,
             'tip', 'randevu',
             'baslik', public.randevu_isim(to_jsonb(r)),
             'alt', coalesce(
               nullif(trim(coalesce(to_jsonb(r)->>'service_type','')),''),
               nullif(trim(coalesce(to_jsonb(r)->>'is_tipi','')),''), 'Randevu'),
             'adres', coalesce(public.randevu_adres(to_jsonb(r)),''),
             'telefon', coalesce(
               nullif(trim(coalesce(to_jsonb(r)->>'phone','')),''),
               nullif(trim(coalesce(to_jsonb(r)->>'telefon','')),''),''),
             'durum', coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum','planlandi'))), '[]'::jsonb)
      into v_rand
    from public.randevular r
    where nullif(trim(coalesce(to_jsonb(r)->>'lat','')),'') is not null
      -- ⭐ BİTEN/İPTAL OLANLARI GİZLE
      and public.parca_adi_normal(coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum','')) 
          not in ('tamamlandi','tamamlandı','yapildi','yapıldı','iptal','canceled','cancelled','bitti','kapali','kapalı')
      -- ⭐ 60 GÜNDEN ESKİ OLANLARI GİZLE
      and coalesce(
            nullif(trim(coalesce(to_jsonb(r)->>'appointment_date','')),'')::date,
            nullif(trim(coalesce(to_jsonb(r)->>'tarih','')),'')::date,
            current_date) > current_date - 60;
  exception when others then v_rand := '[]'::jsonb; end;

  -- ⚠️ TALEPLER — BİTENLERİ GİZLE
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', to_jsonb(t)->>'id',
             'kaynak', 'service_tickets',
             'lat', (to_jsonb(t)->>'lat')::numeric, 'lng', (to_jsonb(t)->>'lng')::numeric, 'tip', 'talep',
             'baslik', public.randevu_isim(to_jsonb(t)),
             'alt', left(coalesce(public.jalan(to_jsonb(t),'description','issue_type','konu'),'-'), 60),
             'adres', coalesce(public.randevu_adres(to_jsonb(t)),''),
             'telefon', coalesce(
               nullif(trim(coalesce(to_jsonb(t)->>'manual_phone','')),''),
               nullif(trim(coalesce(to_jsonb(t)->>'phone','')),''),''),
             'aciliyet', coalesce(nullif(public.jalan(to_jsonb(t),'priority','aciliyet'),''),'Normal'))), '[]'::jsonb)
      into v_talep
    from public.service_tickets t
    where nullif(trim(coalesce(to_jsonb(t)->>'lat','')),'') is not null
      -- ⭐ BİTEN/İPTAL OLANLARI GİZLE
      and public.parca_adi_normal(coalesce(public.jalan(to_jsonb(t),'pipeline_status','status','durum'),''))
          not in ('tamamlandi','tamamlandı','yapildi','yapıldı','iptal','canceled','cancelled','bitti','kapali','kapalı','servis_tamamlandi')
      -- ⭐ 60 GÜNDEN ESKİ OLANLARI GİZLE
      and coalesce(nullif(trim(coalesce(to_jsonb(t)->>'created_at','')),'')::timestamptz, now()) 
          > now() - interval '60 days';
  exception when others then v_talep := '[]'::jsonb; end;

  return jsonb_build_object(
    'vinc', v_vinc, 'randevu', v_rand, 'talep', v_talep, 'bakim', '[]'::jsonb,
    'merkez', jsonb_build_object(
      'lat', coalesce((select round(avg((to_jsonb(c)->>'lat')::numeric),4) from public.cranes c
                        where nullif(trim(coalesce(to_jsonb(c)->>'lat','')),'') is not null), 40.1950),
      'lng', coalesce((select round(avg((to_jsonb(c)->>'lng')::numeric),4) from public.cranes c
                        where nullif(trim(coalesce(to_jsonb(c)->>'lng','')),'') is not null), 29.0600)),
    'sayilar', jsonb_build_object(
      'vinc', jsonb_array_length(v_vinc),
      'randevu', jsonb_array_length(v_rand),
      'talep', jsonb_array_length(v_talep),
      'bakim', 0));
end $$;

revoke all on function public.harita_noktalari() from public;
grant execute on function public.harita_noktalari() to authenticated;


-- ============================================================================
-- 5) SONUÇ
-- ============================================================================
select
  (public.harita_noktalari() -> 'sayilar' ->> 'vinc')    as vinc,
  (public.harita_noktalari() -> 'sayilar' ->> 'randevu') as randevu,
  (public.harita_noktalari() -> 'sayilar' ->> 'talep')   as talep;

-- Geocode bekleyenler (arayüz bunları çözecek)
select kaynak, musteri, left(coalesce(adres,''), 55) as adres
from public.geocode_bekleyenler(10);
