-- ============================================================================
--  🔗 FİRMA BİRLEŞTİRME + TÜRKÇE HARF DÜZELTMESİ (Güncelleme #11)
-- ----------------------------------------------------------------------------
--  SENİN TESPİTİN:
--    • RB KARESİ · KARESİ · RB KARESİ TEKSTİL · KARESİ TEKSTİL → AYNI FİRMA
--    • SOLOTEX / SOLETEX → aynı firma (yanlış harf yazılmış)
--
--  BULUNAN KÖK SEBEP:
--    Türkçe "İ" harfi küçültüldüğünde "i" + GÖRÜNMEZ NOKTA (U+0307) oluşuyor.
--    Bu yüzden "RB KARESİ" ile "RB Karesi" eşleşmiyordu ve otomatik ikiz
--    tespiti 0 sonuç veriyordu. Normalizasyon fonksiyonu düzeltildi.
--
--  YAPILANLAR:
--    1) parca_adi_normal() düzeltildi → Türkçe harf sorunu bitti
--    2) musteri_gruplari tablosu kuruldu (hangi isim hangisine bağlandı)
--    3) Belirtilen firmalar TEK isim altında birleştirildi
--
--  ⚠️ Bu script VERİYİ GÜNCELLER (firma adlarını birleştirir).
--     Ancak: hangi ismin neye dönüştüğü musteri_gruplari tablosunda SAKLANIR
--     → istenirse geri alınabilir. Vinç kimlikleri ve QR'lar ETKİLENMEZ.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) TÜRKÇE HARF NORMALİZASYONUNU DÜZELT
--    İ → i + U+0307 (görünmez nokta) sorunu giderildi
-- ============================================================================
create or replace function public.parca_adi_normal(x text)
returns text
language sql
immutable
as $$
  select translate(
           replace(lower(trim(coalesce(x, ''))), chr(775), ''),   -- görünmez noktayı sil
           'ıişğüöç',
           'iisguoc'
         );
$$;


-- ============================================================================
-- 2) FİRMA GRUP TABLOSU (birleştirme kaydı — geri alınabilir)
-- ============================================================================
create table if not exists public.musteri_gruplari (
  id               uuid primary key default gen_random_uuid(),
  kanonik_ad       text not null,
  varyant_orijinal text not null,
  varyant_norm     text not null,
  kaynak_tablo     text,
  created_at       timestamptz default now(),
  unique (varyant_norm, kaynak_tablo)
);

comment on table public.musteri_gruplari is
  'Firma adı birleştirme kaydı: hangi yazım hangi kanonik isme bağlandı (geri alınabilir)';


-- ============================================================================
-- 3) BİRLEŞTİRME KURALLARI (senin bildirdiğin firmalar)
-- ============================================================================
do $$
declare
  v_kural record;
  v_etkilenen integer := 0;
  v_toplam integer := 0;
begin
  for v_kural in
    select * from (values
      -- KARESİ grubu → hepsi "RB KARESİ" altında toplanır
      ('RB KARESİ', 'RB KARESİ'),
      ('RB KARESİ', 'RB Karesi'),
      ('RB KARESİ', 'KARESİ'),
      ('RB KARESİ', 'KARESİ TEKSTİL'),
      ('RB KARESİ', 'RB KARESİ TEKSTİL'),
      ('RB KARESİ', 'KARESI'),
      -- SOLOTEX grubu → "SOLOTEX"
      ('SOLOTEX', 'SOLOTEX'),
      ('SOLOTEX', 'SOLETEX')
    ) as t(kanonik, varyant)
  loop
    -- Kayıt: neyi neye çevirdik
    insert into public.musteri_gruplari (kanonik_ad, varyant_orijinal, varyant_norm, kaynak_tablo)
    values (v_kural.kanonik, v_kural.varyant, public.parca_adi_normal(v_kural.varyant), 'ikisi')
    on conflict (varyant_norm, kaynak_tablo) do update
      set kanonik_ad = excluded.kanonik_ad;

    -- İş kayıtlarını birleştir (kanonik isme eşitse dokunma)
    if public.parca_adi_normal(v_kural.varyant) <> public.parca_adi_normal(v_kural.kanonik) then
      update public.completed_services
         set customer_text = v_kural.kanonik
       where public.parca_adi_normal(customer_text) = public.parca_adi_normal(v_kural.varyant);

      get diagnostics v_etkilenen = row_count;
      v_toplam := v_toplam + v_etkilenen;

      -- Filo kayıtlarını birleştir (QR KİMLİKLERİ DEĞİŞMEZ)
      update public.cranes
         set customer_name = v_kural.kanonik
       where public.parca_adi_normal(customer_name) = public.parca_adi_normal(v_kural.varyant);
    end if;
  end loop;

  raise notice 'Toplam % iş kaydı birleştirildi.', v_toplam;
end $$;


-- ============================================================================
-- 4) BİRLEŞTİRME SONRASI ÖZET
-- ============================================================================
select
  kanonik_ad,
  count(*)                    as bagli_varyant,
  string_agg(varyant_orijinal, ' · ') as varyantlar
from public.musteri_gruplari
group by kanonik_ad
order by kanonik_ad;


-- ============================================================================
-- 5) KONTROL: ARTIK TEK SATIR OLMALI
-- ============================================================================
select
  coalesce(customer_text, '-') as musteri,
  count(*)                     as is_sayisi,
  round(sum(coalesce(price,0)), 0) as toplam_ciro
from public.completed_services
where public.parca_adi_normal(customer_text) like '%karesi%'
   or public.parca_adi_normal(customer_text) like '%solet%'
   or public.parca_adi_normal(customer_text) like '%solote%'
group by 1
order by 2 desc;


-- ============================================================================
-- 6) YENİDEN İKİZ TARAMASI (artık çalışıyor olmalı)
-- ============================================================================
select vinc_sayisi, onerilen_ad, varyantlar
from public.musteri_ikizleri()
limit 15;
