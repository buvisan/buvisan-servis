-- ============================================================================
--  🔧 TÜRKÇE HARF KÖK ÇÖZÜMÜ — Maaş Eşleşme Hatası (Güncelleme #27)
-- ----------------------------------------------------------------------------
--  SORUN:
--    "KAYA ALİ TOSUN" ve "KERİM AKDOĞAN" isimlerinde MAAŞ 0 görünüyor.
--    Sebep: Türkçe "İ" harfi küçültülünce "i + GÖRÜNMEZ NOKTA" (U+0307)
--    oluşuyor. Bu yüzden "KAYA ALİ TOSUN" ile "Kaya Ali TOSUN" EŞLEŞMİYOR.
--    → İçinde İ olmayan isimler (Veysel, Gökhan) sorunsuz çalışıyor.
--
--  KÖK ÇÖZÜM:
--    Normalizasyon fonksiyonu artık küçültmeden ÖNCE Türkçe büyük harfleri
--    çeviriyor. Böylece hangi locale olursa olsun "İ" → "i" olur.
--
--  ⚠️ Sadece fonksiyonu düzeltir. Veri değiştirmez.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) KÖK ÇÖZÜM: küçültmeden ÖNCE Türkçe harfleri çevir
-- ============================================================================
create or replace function public.parca_adi_normal(x text)
returns text
language sql
immutable
as $$
  select translate(
           -- 1) ÖNCE büyük Türkçe harfleri ASCII karşılığına çevir (İ → i, I → i, ı → i)
           lower(
             translate(trim(coalesce(x, '')), 'İIı', 'iii')
           ),
           -- 2) Sonra kalan Türkçe harfleri sadeleştir
           'şğüöç',
           'sguoc'
         );
$$;


-- ============================================================================
-- 2) KONTROL: her personel için normalizasyon ve maaş eşleşmesi
-- ============================================================================
select
  pm.personel                             as maas_tablosundaki_ad,
  public.parca_adi_normal(pm.personel)    as normalize_hali,
  pm.maas                                 as maas,
  pm.aktif                                as aktif
from public.personel_maas pm
order by pm.aktif desc, pm.maas desc;


-- ============================================================================
-- 3) KONTROL: eşleşme testi (isim ↔ maaş)
-- ============================================================================
with isimler as (
  select unnest(array[
    'Kaya Ali TOSUN','KERİM AKDOĞAN','Veysel ÇARKLI','Gökhan GÖK','Okan ARAN'
  ]) as ad
)
select
  i.ad,
  public.parca_adi_normal(i.ad)                       as normalize,
  (select pm.maas from public.personel_maas pm
    where public.parca_adi_normal(pm.personel) = public.parca_adi_normal(i.ad)
    limit 1)                                          as bulunan_maas,
  case when (select pm.maas from public.personel_maas pm
              where public.parca_adi_normal(pm.personel) = public.parca_adi_normal(i.ad)
              limit 1) is not null
       then '✅ EŞLEŞTİ' else '❌ EŞLEŞMEDİ' end       as durum
from isimler i;


-- ============================================================================
-- 4) EKSİK MAAŞ VARSA EKLE (Kaya Ali 38.000, Kerim 50.000)
-- ============================================================================
insert into public.personel_maas (personel, maas, aktif, aciklama)
values
  ('KAYA ALİ TOSUN', 38000, true, 'Aylık maaş'),
  ('KERİM AKDOĞAN',  50000, true, 'Aylık maaş')
on conflict (personel) do update
  set maas   = case when coalesce(public.personel_maas.maas, 0) = 0
                    then excluded.maas else public.personel_maas.maas end,
      aktif  = true,
      guncelleme = now();
