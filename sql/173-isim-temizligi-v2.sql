-- ============================================================================
--  🧹 İSİM TEMİZLİĞİ v2 (Güncelleme #145)
--  ? ve = karakterlerini temizle, kesik isimleri düzelt
--  KULLANIM: 172'den SONRA çalıştır.
-- ============================================================================

do $$
declare
  v_sayi integer := 0;
begin
  -- 1) ? ve = karakterlerini bosluga cevir
  update public.musteri_telefon_izinleri
     set yetkili = trim(regexp_replace(yetkili, '[=?]+', ' ', 'g'))
   where yetkili ~ '[=?]';
  get diagnostics v_sayi = row_count;
  raise notice '✅ 1) % kayitta ? ve = temizlendi', v_sayi;

  -- 2) Coklu bosluk tek bosluk
  update public.musteri_telefon_izinleri
     set yetkili = regexp_replace(trim(yetkili), '\s+', ' ', 'g')
   where yetkili ~ '\s{2,}';
  get diagnostics v_sayi = row_count;
  raise notice '✅ 2) % kayitta bosluk duzenlendi', v_sayi;

  -- 3) Kontrol karakterleri
  update public.musteri_telefon_izinleri
     set yetkili = regexp_replace(yetkili, '[\u0000-\u001F\u007F]', '', 'g')
   where yetkili ~ '[\u0000-\u001F\u007F]';
  get diagnostics v_sayi = row_count;
  raise notice '✅ 3) % kayitta kontrol karakteri temizlendi', v_sayi;

  -- 4) Bosalanlari null yap
  update public.musteri_telefon_izinleri
     set yetkili = null
   where trim(both ' =?' from coalesce(yetkili,'')) = '';

  -- 5) Sadece 1-2 karakter kalan isimleri null yap (kesik isimler)
  update public.musteri_telefon_izinleri
     set yetkili = null
   where yetkili is not null and length(trim(yetkili)) < 3;

  raise notice '✅ Temizlik tamamlandi';
exception when others then
  raise notice '⚠️ Hata: %', sqlerrm;
end $$;

-- KONTROL
select
  count(*) as toplam,
  count(*) filter (where yetkili ~ '[=?]') as sorunlu,
  count(*) filter (where yetkili is null) as isimsiz,
  count(*) filter (where length(coalesce(yetkili,'')) between 1 and 2) as cok_kisa
from public.musteri_telefon_izinleri;
