-- ============================================================================
--  ⏰ MESAİ SAAT PENCERESİ + OTOMATİK KOORDİNAT (Güncelleme #72)
-- ----------------------------------------------------------------------------
--  SORUN 1: 08:00 → 23:00 girişi NORMAL 14 sa yazıyor ❌
--           Çalışma: 08:00-18:00 normal · 18:00 sonrası %50 mesai
--           DOĞRU: 9 sa normal + 5 sa %50 mesai
--
--  SORUN 2: Yeni randevu/müşteri eklenince haritada görünmüyor
--           → TRIGGER ile OTOMATİK koordinat doldurulacak
--
--  KURALLAR:
--    Hafta içi : 08:00-18:00 normal (mola düş) · dışı %50 mesai
--    Cumartesi : TAMAMI %50 mesai
--    Pazar     : TAMAMI %100 mesai
--
--  KULLANIM: 97'den SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) ⏰ MESAİ GİRİŞİ v2 — SAAT PENCERESİNE GÖRE böler
-- ============================================================================
drop function if exists public.mesai_girisi_ekle(date, text, text, integer);

create or replace function public.mesai_girisi_ekle(
  p_tarih date,
  p_giris text,
  p_cikis text,
  p_mola_dk integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ben      text := public.benim_adim();
  v_giris_t  time;
  v_cikis_t  time;
  v_gun      integer;
  v_tip      text;

  v_normal_dk  numeric := 0;
  v_m50_dk     numeric := 0;
  v_m100_dk    numeric := 0;

  v_toplam_dk  numeric;
  v_bas_dk     numeric;
  v_bit_dk     numeric;
  v_normal_bas numeric := 480;    -- 08:00
  v_normal_bit numeric := 1080;   -- 18:00
begin
  if coalesce(trim(v_ben), '') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Kimliğiniz bulunamadı, tekrar giriş yapın.');
  end if;
  if p_tarih is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Tarih seçin.');
  end if;
  if p_tarih > current_date then
    return jsonb_build_object('ok', false, 'mesaj', 'Gelecek bir tarihe mesai girilemez.');
  end if;

  begin
    v_giris_t := nullif(trim(coalesce(p_giris,'')), '')::time;
    v_cikis_t := nullif(trim(coalesce(p_cikis,'')), '')::time;
  exception when others then
    return jsonb_build_object('ok', false, 'mesaj', 'Saat formatı hatalı. Örnek: 08:00');
  end;

  if v_giris_t is null or v_cikis_t is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Giriş ve çıkış saatini girin.');
  end if;

  -- Dakikaya çevir
  v_bas_dk := extract(hour from v_giris_t) * 60 + extract(minute from v_giris_t);
  v_bit_dk := extract(hour from v_cikis_t) * 60 + extract(minute from v_cikis_t);
  if v_bit_dk <= v_bas_dk then v_bit_dk := v_bit_dk + 1440; end if;   -- gece vardiyası

  v_toplam_dk := v_bit_dk - v_bas_dk;
  if v_toplam_dk <= 0 then
    return jsonb_build_object('ok', false, 'mesaj', 'Çalışma süresi hesaplanamadı.');
  end if;
  if v_toplam_dk > 16 * 60 then
    return jsonb_build_object('ok', false, 'mesaj', 'Günde 16 saatten fazla mesai girilemez.');
  end if;

  v_gun := extract(dow from p_tarih)::int;

  -- ═══ GÜN TİPİNE GÖRE BÖLME ═══
  if v_gun = 0 then
    -- PAZAR → tamamı %100
    v_m100_dk := v_toplam_dk;
    v_tip := 'PAZAR (%100 mesai)';

  elsif v_gun = 6 then
    -- CUMARTESİ → tamamı %50
    v_m50_dk := v_toplam_dk;
    v_tip := 'CUMARTESİ (%50 mesai)';

  else
    -- HAFTA İÇİ → 08:00-18:00 normal, dışı %50
    -- Normal pencereyle kesişim
    declare
      v_kesisim_bas numeric := greatest(v_bas_dk, v_normal_bas);
      v_kesisim_bit numeric := least(v_bit_dk, v_normal_bit);
    begin
      if v_kesisim_bit > v_kesisim_bas then
        v_normal_dk := v_kesisim_bit - v_kesisim_bas;
      end if;
    end;

    -- Kalan = mesai (günü aşan kısım da %50)
    v_m50_dk := v_toplam_dk - v_normal_dk;

    -- Mola sadece NORMAL saatten düşülür
    if v_normal_dk > 480 then
      v_normal_dk := v_normal_dk - coalesce(p_mola_dk, 60);
    end if;
    if v_normal_dk < 0 then v_normal_dk := 0; end if;

    v_tip := 'HAFTA İÇİ (08:00-18:00 normal · sonrası %50)';
  end if;

  -- Yuvarlama (saate çevir)
  insert into public.puantaj_gunluk
    (personel, tarih, normal_saat, mesai50_saat, mesai100_saat, aciklama, olusturan)
  values
    (v_ben, p_tarih,
     round(v_normal_dk / 60.0, 2),
     round(v_m50_dk / 60.0, 2),
     round(v_m100_dk / 60.0, 2),
     'Giriş ' || to_char(v_giris_t,'HH24:MI') || ' · Çıkış ' || to_char(v_cikis_t,'HH24:MI'),
     v_ben)
  on conflict (personel, tarih) do update
    set normal_saat   = excluded.normal_saat,
        mesai50_saat  = excluded.mesai50_saat,
        mesai100_saat = excluded.mesai100_saat,
        aciklama      = excluded.aciklama;

  return jsonb_build_object(
    'ok', true, 'gun_tipi', v_tip,
    'giris', to_char(v_giris_t,'HH24:MI'),
    'cikis', to_char(v_cikis_t,'HH24:MI'),
    'toplam_saat', round(v_toplam_dk / 60.0, 2),
    'normal_saat', round(v_normal_dk / 60.0, 2),
    'mesai50_saat', round(v_m50_dk / 60.0, 2),
    'mesai100_saat', round(v_m100_dk / 60.0, 2),
    'mesaj', to_char(p_tarih,'DD.MM.YYYY') || ' · ' || to_char(v_giris_t,'HH24:MI') || '-' ||
             to_char(v_cikis_t,'HH24:MI') || ' → ' ||
             round(v_normal_dk/60.0,1) || ' sa normal' ||
             case when v_m50_dk > 0 then ' + ' || round(v_m50_dk/60.0,1) || ' sa %50' else '' end ||
             case when v_m100_dk > 0 then ' + ' || round(v_m100_dk/60.0,1) || ' sa %100' else '' end);
end $$;

revoke all on function public.mesai_girisi_ekle(date, text, text, integer) from public;
grant execute on function public.mesai_girisi_ekle(date, text, text, integer) to authenticated;


-- ============================================================================
-- 2) 📍 OTOMATİK KOORDİNAT — yeni randevu/müşteri gelince dolsun
-- ============================================================================
create or replace function public.randevu_koordinat_doldur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adres text;
  v_musteri text;
  v_k jsonb;
begin
  -- Zaten koordinat varsa dokunma
  if new.lat is not null and new.lng is not null then return new; end if;

  v_adres := coalesce(
    nullif(trim(coalesce(to_jsonb(new)->>'address','')),''),
    nullif(trim(coalesce(to_jsonb(new)->>'adres','')),''),
    nullif(trim(coalesce(to_jsonb(new)->>'location','')),''));
  v_musteri := coalesce(
    nullif(trim(coalesce(to_jsonb(new)->>'customer_name','')),''),
    nullif(trim(coalesce(to_jsonb(new)->>'musteri_adi','')),''),
    nullif(trim(coalesce(to_jsonb(new)->>'firma_adi','')),''));

  -- KATMAN 1: Vinç tablosundan müşteri eşleşmesi (en isabetli)
  if v_musteri is not null then
    begin
      select c.lat, c.lng into new.lat, new.lng
      from public.cranes c
      where c.lat is not null
        and public.parca_adi_normal(c.customer_name) <> ''
        and (
          public.parca_adi_normal(c.customer_name) = public.parca_adi_normal(v_musteri)
          or public.parca_adi_normal(c.customer_name) like '%' || public.parca_adi_normal(v_musteri) || '%'
          or public.parca_adi_normal(v_musteri) like '%' || public.parca_adi_normal(c.customer_name) || '%'
        )
      limit 1;
    exception when others then null; end;
  end if;

  -- KATMAN 2: Adresten ilçe koordinatı
  if new.lat is null and v_adres is not null then
    begin
      v_k := public.adres_koordinat(v_adres);
      if v_k is not null then
        new.lat := (v_k ->> 'lat')::numeric;
        new.lng := (v_k ->> 'lng')::numeric;
      end if;
    exception when others then null; end;
  end if;

  return new;
end $$;

-- Trigger'ı randevular tablosuna bağla
do $$
begin
  begin
    drop trigger if exists tr_randevu_koordinat on public.randevular;
    create trigger tr_randevu_koordinat
      before insert or update of address, adres, location, customer_name, musteri_adi
      on public.randevular
      for each row execute function public.randevu_koordinat_doldur();
    raise notice '✅ Trigger eklendi: randevular → otomatik koordinat';
  exception when others then
    raise notice '⚠️ randevular trigger → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 3) 📍 SERVİS TALEPLERİ için de aynı trigger
-- ============================================================================
create or replace function public.talep_koordinat_doldur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adres text; v_musteri text; v_k jsonb;
begin
  if new.lat is not null and new.lng is not null then return new; end if;

  v_adres := coalesce(
    nullif(trim(coalesce(to_jsonb(new)->>'manual_location','')),''),
    nullif(trim(coalesce(to_jsonb(new)->>'location','')),''),
    nullif(trim(coalesce(to_jsonb(new)->>'adres','')),''));
  v_musteri := coalesce(
    nullif(trim(coalesce(to_jsonb(new)->>'manual_customer_name','')),''),
    nullif(trim(coalesce(to_jsonb(new)->>'customer_name','')),''));

  if v_musteri is not null then
    begin
      select c.lat, c.lng into new.lat, new.lng
      from public.cranes c
      where c.lat is not null
        and public.parca_adi_normal(c.customer_name) <> ''
        and (
          public.parca_adi_normal(c.customer_name) = public.parca_adi_normal(v_musteri)
          or public.parca_adi_normal(c.customer_name) like '%' || public.parca_adi_normal(v_musteri) || '%'
          or public.parca_adi_normal(v_musteri) like '%' || public.parca_adi_normal(c.customer_name) || '%'
        )
      limit 1;
    exception when others then null; end;
  end if;

  if new.lat is null and v_adres is not null then
    begin
      v_k := public.adres_koordinat(v_adres);
      if v_k is not null then
        new.lat := (v_k ->> 'lat')::numeric;
        new.lng := (v_k ->> 'lng')::numeric;
      end if;
    exception when others then null; end;
  end if;

  return new;
end $$;

do $$
begin
  begin
    drop trigger if exists tr_talep_koordinat on public.service_tickets;
    create trigger tr_talep_koordinat
      before insert or update of manual_location, location, manual_customer_name
      on public.service_tickets
      for each row execute function public.talep_koordinat_doldur();
    raise notice '✅ Trigger eklendi: service_tickets → otomatik koordinat';
  exception when others then
    raise notice '⚠️ service_tickets trigger → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 4) ⭐ VİNÇ MÜŞTERİSİ değişince randevuları güncelle
-- ============================================================================
do $$
declare v_adet integer := 0;
begin
  begin
    update public.randevular r
       set lat = c.lat, lng = c.lng
      from public.cranes c
     where r.lat is null and c.lat is not null
       and public.parca_adi_normal(c.customer_name) <> ''
       and (
         public.parca_adi_normal(c.customer_name) = public.parca_adi_normal(coalesce(r.customer_name, r.musteri_adi,''))
         or public.parca_adi_normal(c.customer_name) like '%' || public.parca_adi_normal(coalesce(r.customer_name, r.musteri_adi,'')) || '%'
       );
    get diagnostics v_adet = row_count;
    raise notice '✅ Kalan randevular dolduruldu: %', v_adet;
  exception when others then null; end;
end $$;


-- ============================================================================
-- 5) 🧪 TEST — 08:00 → 23:00 senaryosu
-- ============================================================================
do $$
declare
  v_hafta_ici date;
  v_cmt date;
  v_paz date;
  v_r jsonb;
begin
  raise notice ' ';
  raise notice '═══════ MESAİ SAAT PENCERESİ TESTİ ═══════';

  -- Test tarihleri bul
  select d::date into v_hafta_ici from generate_series(current_date - 14, current_date - 1, interval '1 day') d
   where extract(dow from d) = 4 limit 1;   -- Perşembe
  select d::date into v_cmt from generate_series(current_date - 14, current_date - 1, interval '1 day') d
   where extract(dow from d) = 6 limit 1;
  select d::date into v_paz from generate_series(current_date - 14, current_date - 1, interval '1 day') d
   where extract(dow from d) = 0 limit 1;

  if v_hafta_ici is not null then
    v_r := public.mesai_girisi_ekle(v_hafta_ici, '08:00', '23:00', 60);
    raise notice 'HAFTA ICI - gun: %', to_char(v_hafta_ici,'DD.MM');
    raise notice '   normal saat  : %', v_r->>'normal_saat';
    raise notice '   mesai50 saat : %', v_r->>'mesai50_saat';
    raise notice '   mesai100 saat: %', v_r->>'mesai100_saat';
  end if;

  if v_cmt is not null then
    v_r := public.mesai_girisi_ekle(v_cmt, '08:00', '18:00', 60);
    raise notice 'CUMARTESI - gun: %', to_char(v_cmt,'DD.MM');
    raise notice '   normal saat  : %', v_r->>'normal_saat';
    raise notice '   mesai50 saat : %', v_r->>'mesai50_saat';
  end if;

  if v_paz is not null then
    v_r := public.mesai_girisi_ekle(v_paz, '09:00', '15:00', 0);
    raise notice 'PAZAR - gun: %', to_char(v_paz,'DD.MM');
    raise notice '   normal saat   : %', v_r->>'normal_saat';
    raise notice '   mesai100 saat : %', v_r->>'mesai100_saat';
  end if;

  raise notice '═══════════════════════════════════════════';
  raise notice 'BEKLENEN: Hafta içi 08:00-23:00 → 9 sa normal + 5 sa %50';
  raise notice '═══════════════════════════════════════════';
end $$;


-- ============================================================================
-- 6) SONUÇ
-- ============================================================================
select
  (public.harita_noktalari() -> 'sayilar' ->> 'vinc')    as vinc,
  (public.harita_noktalari() -> 'sayilar' ->> 'randevu') as randevu,
  (public.harita_noktalari() -> 'sayilar' ->> 'talep')   as talep,
  (public.harita_noktalari() -> 'sayilar' ->> 'bakim')   as bakim;
