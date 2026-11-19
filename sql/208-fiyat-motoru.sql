-- ============================================================================
--  💰 FİYAT MOTORU (Güncelleme #208)
-- ----------------------------------------------------------------------------
--  EKRAN: /admin/akilli-analiz → "Fiyat Önerisi" sekmesi (artık FİYAT MOTORU)
--
--  NEDEN?
--    Eski ekran yalnızca geçmiş işlerin medyanına bakıyordu:
--    malzeme maliyeti, işçilik ve kâr marjı hesabı yoktu → yanlış fiyat.
--    Yeni motor: malzeme (gerçek/tahmini fiyat) + işçilik + yol + diğer
--    giderler + aciliyet → MALİYET, üzerine elle girilebilir kâr marjı.
--
--  BU DOSYA NE YAPAR?
--    1) offers tablosuna iki alan ekler (YENİ, mevcut akışı bozmaz):
--         • kar_marji      numeric  → teklif verilirken uygulanan kâr marjı (%)
--         • maliyet_detay  jsonb    → malzeme/işçilik/yol/diğer dökümü
--       (Ekran bu alanlar yoksa da çalışır: kolon hatası alırsa temel alanlarla
--        tekrar yazar. Yani bu dosya çalıştırılmadan da teklif kaybolmaz.)
--
--    2) fiyat_motoru_ayar() → EKRANIN TEK ÇAĞRIDA okuduğu ayarlar:
--         saat_ucreti   : personel aylık maaşı ÷ aylık saat × SGK katsayısı
--         km_birim      : ₺/km (yakıt + bakım + amortisman)
--         kaynak        : 'personel_maas' | 'varsayilan'
--       personel_maas / maliyet_ayarlari yoksa VARSAYILAN döner (çökmez).
--
--  ⚠️ TÜM TUTARLAR KDV HARİÇTİR (fonksiyon 'kdv_haric': true döner).
--  ⚠️ cranes tablosuna ve QR kodlarına DOKUNULMAZ.
--  ⚠️ Veri silmez; sadece kolon ekler + fonksiyon tanımlar.
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
--            (207'den SONRA çalıştırılır)
-- ============================================================================


-- ============================================================================
-- 1) OFFERS — kâr marjı + maliyet dökümü (yoksa ekle)
-- ============================================================================
do $$
begin
  alter table public.offers add column if not exists kar_marji numeric;
  raise notice '✅ offers.kar_marji hazır';
exception when others then
  raise notice '⚠️ offers.kar_marji eklenemedi: %', sqlerrm;
end $$;

do $$
begin
  alter table public.offers add column if not exists maliyet_detay jsonb;
  raise notice '✅ offers.maliyet_detay hazır';
exception when others then
  raise notice '⚠️ offers.maliyet_detay eklenemedi: %', sqlerrm;
end $$;

do $$
begin
  comment on column public.offers.kar_marji is
    'Teklifte uygulanan kâr marjı (%) — tutarlar KDV hariçtir';
  comment on column public.offers.maliyet_detay is
    'Fiyat motoru maliyet dökümü (malzeme/işçilik/yol/diğer/aciliyet + marj) — KDV hariç';
exception when others then null;
end $$;


-- ============================================================================
-- 2) 🧮 FİYAT MOTORU AYARI — ekranın tek çağrıda okuduğu değerler
--    Saat ücreti = ortalama aylık maaş × SGK katsayısı ÷ aylık çalışma saati
--    (personel_maas + maliyet_ayarlari varsa gerçek, yoksa varsayılan)
-- ============================================================================
create or replace function public.fiyat_motoru_ayar()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sgk        numeric := 1.65;   -- maaş × 1,65 (SGK + yemek + yol + kıdem)
  v_km         numeric := 12;     -- ₺/km
  v_saat       numeric := 225;    -- aylık çalışma saati
  v_maas       numeric := 0;      -- aktif personelin ortalama aylık maaşı
  v_saat_ucreti numeric := 0;
  v_kaynak     text := 'varsayilan';
  v_ayar_var   boolean := false;
begin
  -- ─── Maliyet ayarları (96-gercek-maliyet.sql) ───
  begin
    select coalesce(sgk_katsayisi, 1.65),
           coalesce(km_birim, 12),
           coalesce(aylik_saat, 225)
      into v_sgk, v_km, v_saat
    from public.maliyet_ayarlari
    where id = 1;

    v_ayar_var := v_saat > 0;
  exception when others then
    v_ayar_var := false;
  end;

  -- ─── Personel maaşları (45-personel-maas-yonetimi.sql) ───
  begin
    select avg(pm.maas) into v_maas
    from public.personel_maas pm
    where pm.aktif
      and coalesce(pm.maas, 0) > 0;
  exception when others then
    v_maas := 0;
  end;

  if coalesce(v_maas, 0) > 0 and coalesce(v_saat, 0) > 0 then
    v_saat_ucreti := round((v_maas * v_sgk) / v_saat, 2);
    v_kaynak := 'personel_maas';
  else
    -- Personel tablosu boş → ekranla uyumlu varsayılan (env ile değiştirilebilir:
    -- NEXT_PUBLIC_PERSONEL_SAAT_UCRETI)
    v_saat_ucreti := 345.00;
    v_kaynak := 'varsayilan';
  end if;

  return jsonb_build_object(
    'saat_ucreti',     v_saat_ucreti,
    'km_birim',        v_km,
    'sgk_katsayisi',   v_sgk,
    'aylik_saat',      v_saat,
    'ortalama_maas',   coalesce(v_maas, 0),
    'kaynak',          v_kaynak,
    'maliyet_ayar_var', v_ayar_var,
    'kdv_haric',       true
  );
exception when others then
  return jsonb_build_object(
    'saat_ucreti',   345.00,
    'km_birim',      12,
    'kaynak',        'varsayilan',
    'kdv_haric',     true,
    'hata',          sqlerrm
  );
end $$;

revoke all on function public.fiyat_motoru_ayar() from public;
grant execute on function public.fiyat_motoru_ayar() to authenticated;


-- ============================================================================
-- 3) DOĞRULAMA — alanlar eklendi mi, fonksiyon çalışıyor mu?
-- ============================================================================
do $$
declare
  v_kar  boolean;
  v_mal  boolean;
  v_ayar jsonb;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'offers' and column_name = 'kar_marji'
  ) into v_kar;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'offers' and column_name = 'maliyet_detay'
  ) into v_mal;

  begin
    v_ayar := public.fiyat_motoru_ayar();
  exception when others then
    v_ayar := jsonb_build_object('hata', sqlerrm);
  end;

  raise notice '✅ offers.kar_marji=%, offers.maliyet_detay=%', v_kar, v_mal;
  raise notice '✅ saat ücreti = % ₺ (kaynak: %) · km = % ₺',
    (v_ayar ->> 'saat_ucreti'), (v_ayar ->> 'kaynak'), (v_ayar ->> 'km_birim');
end $$;


-- ─── MIGRATION KAYDI ───
do $$
begin
  perform public.migration_isaretle('208-fiyat-motoru.sql', 'fiyat motoru: offers.kar_marji + maliyet_detay + fiyat_motoru_ayar()');
  raise notice '✅ 208 kaydedildi';
exception when others then
  raise notice 'migration kaydı atlandı (205 çalıştırılmamış olabilir)';
end $$;
