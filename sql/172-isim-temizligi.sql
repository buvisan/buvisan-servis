-- ============================================================================
--  🧹 İSİM TEMİZLİĞİ (Güncelleme #144)
--  "Karas İnşaat Gökhan =" / "Mehmet ÇAKO=" → sondaki = kaldır
--  KULLANIM: 171'den SONRA çalıştır.
-- ============================================================================

do $$
declare
  v_sayi integer := 0;
begin
  update public.musteri_telefon_izinleri
     set yetkili = trim(both ' =' from regexp_replace(yetkili, '\s*=\s*$', '', 'g'))
   where yetkili ~ '=\s*$';

  get diagnostics v_sayi = row_count;
  raise notice '✅ % kayittan sondaki = temizlendi', v_sayi;

  update public.musteri_telefon_izinleri
     set yetkili = trim(both ' =' from regexp_replace(yetkili, '=', '', 'g'))
   where yetkili ~ '=';

  get diagnostics v_sayi = row_count;
  raise notice '✅ % kayitta kalan = temizlendi', v_sayi;

  -- bosalan isimleri null yap
  update public.musteri_telefon_izinleri
     set yetkili = null
   where trim(both ' =' from coalesce(yetkili,'')) = '';

  -- cift bosluk temizle
  update public.musteri_telefon_izinleri
     set yetkili = regexp_replace(trim(yetkili), '\s+', ' ', 'g')
   where yetkili is not null and yetkili ~ '\s{2,}';

  raise notice '✅ Temizlik tamamlandi';
exception when others then
  raise notice '⚠️ Hata: %', sqlerrm;
end $$;

-- Kontrol
select count(*) as toplam,
       count(*) filter (where yetkili ~ '=') as hala_esittir,
       count(*) filter (where yetkili is null) as isimsiz
from public.musteri_telefon_izinleri;
