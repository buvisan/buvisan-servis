-- ============================================================================
--  ✅ DOĞRULAMA — Kimlik gerektirmeyen kontrol (Güncelleme #31)
-- ----------------------------------------------------------------------------
--  NEDEN BU SCRIPT?
--    SQL Editor'de giriş yapmış kullanıcı YOKTUR. Bu yüzden yetki kontrolü
--    yapan fonksiyonlar (personel_kazanc vb.) "yetki yok" döner ve tüm
--    alanlar NULL görünür → YANILTICI.
--
--    Bu script fonksiyonları DEĞİL, TABLOLARI doğrudan okur.
--    Uygulamada ise fonksiyonlar normal çalışır (çünkü orada giriş var).
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) PERSONEL + MAAŞ + BU AYKİ MESAİLER (tek bakışta)
-- ============================================================================
select
  pm.personel                                    as personel,
  pm.maas                                        as maas,
  count(g.id) filter (where not coalesce(g.izin_mi, false)) as gun,
  coalesce(sum(g.normal_saat), 0)                as normal_saat,
  coalesce(sum(g.mesai50_saat), 0)               as cmt50,
  coalesce(sum(g.mesai100_saat), 0)              as paz100,
  count(g.id) filter (where coalesce(g.izin_mi, false))     as izin_gun
from public.personel_maas pm
left join public.puantaj_gunluk g
  on public.parca_adi_normal(g.personel) = public.parca_adi_normal(pm.personel)
 and to_char(g.tarih, 'YYYY-MM') = to_char(current_date, 'YYYY-MM')
where pm.aktif
group by pm.personel, pm.maas
order by pm.maas desc;


-- ============================================================================
-- 2) GÜNLÜK MESAİ KAYITLARI (kim, hangi gün, kaç saat)
-- ============================================================================
select
  g.personel,
  g.tarih,
  to_char(g.tarih, 'Day')            as gun_adi,
  g.normal_saat,
  g.mesai50_saat,
  g.mesai100_saat,
  case when coalesce(g.izin_mi, false) then 'İZİN'
       when extract(dow from g.tarih) = 6 then 'CUMARTESİ %50'
       when extract(dow from g.tarih) = 0 then 'PAZAR %100'
       else 'Hafta içi' end          as gun_tipi,
  g.olusturan
from public.puantaj_gunluk g
order by g.tarih desc
limit 40;


-- ============================================================================
-- 3) İSİM EŞLEŞME TESTİ (Türkçe harf kontrolü)
-- ============================================================================
select
  pm.personel                                  as resmi_ad,
  public.parca_adi_normal(pm.personel)         as normalize,
  coalesce(
    (select count(*) from public.puantaj_gunluk g
      where public.parca_adi_normal(g.personel) = public.parca_adi_normal(pm.personel)),
    0)                                         as eslesen_mesai_kaydi,
  case when public.parca_adi_normal(pm.personel) =
            public.parca_adi_normal(replace(pm.personel, 'İ', 'i'))
       then '✅ Sorunsuz' else '⚠️ Kontrol et' end as durum
from public.personel_maas pm
where pm.aktif
order by pm.personel;


-- ============================================================================
-- 4) ÖZET
-- ============================================================================
select
  (select count(*) from public.personel_maas where aktif)              as aktif_personel,
  (select coalesce(sum(maas), 0) from public.personel_maas where aktif) as toplam_maas,
  (select count(*) from public.puantaj_gunluk)                         as toplam_mesai_kaydi,
  (select count(*) from public.puantaj_gunluk where izin_mi)           as izin_kaydi,
  (select count(*) from public.puantaj_manuel)                         as aylik_kayit;
