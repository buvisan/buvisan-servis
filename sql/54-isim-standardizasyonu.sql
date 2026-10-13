-- ============================================================================
--  🔤 İSİM STANDARDİZASYONU + MAAŞ DÜZELTME (Güncelleme #34)
-- ----------------------------------------------------------------------------
--  SENİN TESPİTİN:
--    "Sadece Kaya Ali Tosun'un ismi küçük harflerle yazılmış, diğerleri büyük"
--
--  SEBEP:
--    Çift kayıt temizliğinde "maaşı büyük olan" kayıt kazandı. O kayıt
--    uygulamadan gelen karışık harfli versiyondu ("Kaya Ali TOSUN", 50.000 ₺).
--    Diğer personel SQL'den geldiği için BÜYÜK harfliydi.
--
--  ÇÖZÜM:
--    1) Tüm personel isimleri TEK STANDARDA getirilir (BÜYÜK HARF, Türkçe uyumlu)
--    2) Kaya Ali'nin maaşı doğru değere (38.000) çekilir
--    3) Bundan sonra isimler hep aynı yazılır → karışıklık bitter
--
--  ⚠️ İsimler standartlaştırılır, veri kaybı yok.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) TÜRKÇE UYUMLU BÜYÜK HARF FONKSİYONU
--    (i → İ , ı → I — normal upper() bunu yanlış yapar)
-- ============================================================================
create or replace function public.tr_buyuk(x text)
returns text
language sql
immutable
as $$
  select upper(replace(replace(coalesce(x, ''), 'i', 'İ'), 'ı', 'I'));
$$;


-- ============================================================================
-- 2) TÜM PERSONEL İSİMLERİNİ STANDARTLAŞTIR (BÜYÜK HARF)
-- ============================================================================
update public.personel_maas
   set personel = public.tr_buyuk(personel)
 where personel <> public.tr_buyuk(personel);

update public.puantaj_gunluk
   set personel = public.tr_buyuk(personel)
 where personel <> public.tr_buyuk(personel);

update public.puantaj_manuel
   set personel = public.tr_buyuk(personel)
 where personel <> public.tr_buyuk(personel);

update public.personel_talepler
   set personel = public.tr_buyuk(personel)
 where personel <> public.tr_buyuk(personel);


-- ============================================================================
-- 3) KAYA ALİ'NİN MAAŞINI DOĞRU DEĞERE ÇEK (38.000 ₺)
--    (senin bildirdiğin maaş — test değeri 50.000 kalmıştı)
-- ============================================================================
update public.personel_maas
   set maas = 38000,
       guncelleme = now()
 where public.parca_adi_normal(personel) = public.parca_adi_normal('KAYA ALİ TOSUN')
   and maas <> 38000;


-- ============================================================================
-- 4) KONTROL — hepsi BÜYÜK harf mi, maaşlar doğru mu?
-- ============================================================================
select
  personel,
  public.parca_adi_normal(personel)                     as normalize,
  maas,
  aktif,
  case when personel = public.tr_buyuk(personel)
       then '✅ Standart' else '⚠️ Düzeltilmeli' end     as isim_durumu
from public.personel_maas
order by aktif desc, maas desc;


-- ============================================================================
-- 5) ÖZET — aktif personel ve toplam maaş
-- ============================================================================
select
  count(*) filter (where aktif)                 as aktif_personel,
  coalesce(sum(maas) filter (where aktif), 0)   as toplam_aylik_maas,
  count(*) filter (where not aktif)             as pasif_personel
from public.personel_maas;
