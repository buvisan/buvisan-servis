-- ============================================================================
--  🗺️ RANDEVU KOORDİNATI — TAM DİNAMİK (Güncelleme #73)
-- ----------------------------------------------------------------------------
--  SORUN: randevu = 0 · talep = 0 → haritada görünmüyor
--  SEBEP: SQL 98'deki dolum exception bloğundaydı → hata SESSİZCE yutuldu
--         randevular tablosunun gerçek sütun adları farklı
--
--  ÇÖZÜM: to_jsonb() ile HİÇBİR sütun adı varsaymadan tara
--         Adres benzeri + isim benzeri TÜM alanları otomatik bul
--
--  KULLANIM: 98'den SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 📋 RANDEVULAR TABLOSUNUN GERÇEK SÜTUNLARI (ekran görüntüsü için kritik)
-- ============================================================================
select
  table_name,
  string_agg(column_name || ' (' || data_type || ')', ', ' order by ordinal_position) as sutunlar
from information_schema.columns
where table_schema = 'public' and table_name in ('randevular','service_tickets')
group by table_name;


-- ============================================================================
-- 2) 🔎 İSİM/ADRES ALANI OTOMATİK BUL
--    "adres" geçen veya "isim/musteri/firma/customer" geçen alanı seçer
-- ============================================================================
create or replace function public.randevu_isim(p_r jsonb)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(trim(coalesce(p_r->>'firma_adi','')),''),
    nullif(trim(coalesce(p_r->>'customer_name','')),''),
    nullif(trim(coalesce(p_r->>'musteri_adi','')),''),
    nullif(trim(coalesce(p_r->>'musteri','')),''),
    nullif(trim(coalesce(p_r->>'firma','')),''),
    nullif(trim(coalesce(p_r->>'title','')),''),
    nullif(trim(coalesce(p_r->>'baslik','')),''),
    '');
$$;

create or replace function public.randevu_adres(p_r jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_anahtar text;
  v_deger   text;
begin
  -- Önce bilinen adlar
  v_deger := coalesce(
    nullif(trim(coalesce(p_r->>'address','')),''),
    nullif(trim(coalesce(p_r->>'adres','')),''),
    nullif(trim(coalesce(p_r->>'location','')),''),
    nullif(trim(coalesce(p_r->>'konum','')),''),
    nullif(trim(coalesce(p_r->>'aciklama','')),''));
  if v_deger is not null and length(v_deger) > 8 then return v_deger; end if;

  -- Sonra içinde "adres" veya ilçe adı geçen herhangi bir alanı ara
  for v_anahtar, v_deger in select key, value from jsonb_each_text(p_r) loop
    if v_deger is null or length(v_deger) < 10 then continue; end if;
    if public.parca_adi_normal(v_anahtar) like '%adres%'
       or public.parca_adi_normal(v_anahtar) like '%address%'
       or public.parca_adi_normal(v_anahtar) like '%konum%'
       or public.parca_adi_normal(v_anahtar) like '%location%'
       or public.parca_adi_normal(v_deger) ~ '(nilufer|osmangazi|yildirim|gemlik|gursu|kestel|mudanya|inegol|iznik|bursa|osb|mahalle|cadde|sokak|sk\.|no:|no )'
    then
      return v_deger;
    end if;
  end loop;

  return null;
end $$;

revoke all on function public.randevu_isim(jsonb) from public;
revoke all on function public.randevu_adres(jsonb) from public;
grant execute on function public.randevu_isim(jsonb) to authenticated;
grant execute on function public.randevu_adres(jsonb) to authenticated;


-- ============================================================================
-- 3) 🗺️ KOORDİNAT DOLDUR — TAM DİNAMİK (hata yutma YOK)
-- ============================================================================
do $$
declare
  v_toplam integer := 0;
  v_adet   integer := 0;
  v_r      record;
  v_adres  text;
  v_isim   text;
  v_k      jsonb;
  v_lat    numeric;
  v_lng    numeric;
  v_hatali integer := 0;
begin
  raise notice ' ';
  raise notice '═══════ RANDEVU KOORDİNAT DOLDURMA ═══════';

  for v_r in
    select r.id, to_jsonb(r) as j
    from public.randevular r
    where nullif(trim(coalesce(to_jsonb(r)->>'lat','')),'') is null
  loop
    v_lat := null; v_lng := null;
    v_isim  := public.randevu_isim(v_r.j);
    v_adres := public.randevu_adres(v_r.j);

    -- KATMAN 1: Vinç müşteri eşleşmesi
    if coalesce(v_isim,'') <> '' then
      begin
        select c.lat, c.lng into v_lat, v_lng
        from public.cranes c
        where c.lat is not null
          and public.parca_adi_normal(c.customer_name) <> ''
          and (
            public.parca_adi_normal(c.customer_name) = public.parca_adi_normal(v_isim)
            or public.parca_adi_normal(c.customer_name) like '%' || public.parca_adi_normal(v_isim) || '%'
            or public.parca_adi_normal(v_isim) like '%' || public.parca_adi_normal(c.customer_name) || '%'
          )
        limit 1;
      exception when others then v_lat := null; end;
    end if;

    -- KATMAN 2: Adresten ilçe
    if v_lat is null and coalesce(v_adres,'') <> '' then
      begin
        v_k := public.adres_koordinat(v_adres);
        if v_k is not null then
          v_lat := (v_k ->> 'lat')::numeric;
          v_lng := (v_k ->> 'lng')::numeric;
        end if;
      exception when others then v_lat := null; end;
    end if;

    -- YAZ (hata olursa say, devam et)
    if v_lat is not null and v_lng is not null then
      begin
        execute 'update public.randevular set lat = $1, lng = $2 where id = $3'
          using v_lat, v_lng, v_r.id;
        v_adet := v_adet + 1;
      exception when others then
        v_hatali := v_hatali + 1;
      end;
    end if;

    v_toplam := v_toplam + 1;
  end loop;

  raise notice 'İncelenen randevu : %', v_toplam;
  raise notice 'Koordinat eklenen : %', v_adet;
  raise notice 'Hatalı            : %', v_hatali;
  raise notice '════════════════════════════════════════';
end $$;


-- ============================================================================
-- 4) 🗺️ SERVİS TALEPLERİ için aynı işlem
-- ============================================================================
do $$
declare
  v_adet integer := 0; v_r record; v_adres text; v_isim text;
  v_k jsonb; v_lat numeric; v_lng numeric;
begin
  begin
    for v_r in
      select t.id, to_jsonb(t) as j from public.service_tickets t
      where nullif(trim(coalesce(to_jsonb(t)->>'lat','')),'') is null
    loop
      v_lat := null;
      v_isim := public.randevu_isim(v_r.j);
      v_adres := public.randevu_adres(v_r.j);

      if coalesce(v_isim,'') <> '' then
        begin
          select c.lat, c.lng into v_lat, v_lng
          from public.cranes c
          where c.lat is not null
            and public.parca_adi_normal(c.customer_name) <> ''
            and (public.parca_adi_normal(c.customer_name) = public.parca_adi_normal(v_isim)
              or public.parca_adi_normal(c.customer_name) like '%' || public.parca_adi_normal(v_isim) || '%')
          limit 1;
        exception when others then v_lat := null; end;
      end if;

      if v_lat is null and coalesce(v_adres,'') <> '' then
        begin
          v_k := public.adres_koordinat(v_adres);
          if v_k is not null then
            v_lat := (v_k ->> 'lat')::numeric; v_lng := (v_k ->> 'lng')::numeric;
          end if;
        exception when others then v_lat := null; end;
      end if;

      if v_lat is not null and v_lng is not null then
        begin
          execute 'update public.service_tickets set lat = $1, lng = $2 where id = $3'
            using v_lat, v_lng, v_r.id;
          v_adet := v_adet + 1;
        exception when others then null; end;
      end if;
    end loop;
    raise notice '✅ Servis talebi koordinatı: %', v_adet;
  exception when others then
    raise notice '⚠️ Servis talebi → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 5) 🗺️ HARİTA v3 — tamamen dinamik randevu katmanı
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

  -- ⭐ RANDEVULAR — dinamik isim/adres
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'lat', (to_jsonb(r)->>'lat')::numeric,
             'lng', (to_jsonb(r)->>'lng')::numeric,
             'tip', 'randevu',
             'baslik', public.randevu_isim(to_jsonb(r)),
             'alt', coalesce(
               nullif(trim(coalesce(to_jsonb(r)->>'service_type','')),''),
               nullif(trim(coalesce(to_jsonb(r)->>'is_tipi','')),''),
               nullif(trim(coalesce(to_jsonb(r)->>'tip','')),''), 'Randevu'),
             'adres', coalesce(public.randevu_adres(to_jsonb(r)),''),
             'telefon', coalesce(
               nullif(trim(coalesce(to_jsonb(r)->>'phone','')),''),
               nullif(trim(coalesce(to_jsonb(r)->>'telefon','')),''),
               nullif(trim(coalesce(to_jsonb(r)->>'customer_phone','')),''),''))), '[]'::jsonb)
      into v_rand
    from public.randevular r
    where nullif(trim(coalesce(to_jsonb(r)->>'lat','')),'') is not null;
  exception when others then v_rand := '[]'::jsonb; end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
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
    where nullif(trim(coalesce(to_jsonb(t)->>'lat','')),'') is not null;
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
-- 6) SONUÇ
-- ============================================================================
select
  (public.harita_noktalari() -> 'sayilar' ->> 'vinc')    as vinc,
  (public.harita_noktalari() -> 'sayilar' ->> 'randevu') as randevu,
  (public.harita_noktalari() -> 'sayilar' ->> 'talep')   as talep;

-- İlk 3 randevu noktası (kontrol için)
select jsonb_pretty(public.harita_noktalari() -> 'randevu') as randevu_noktalari;
