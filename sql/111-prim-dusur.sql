-- ============================================================================
--  💰 PRİM TUTARINI DÜŞÜR (Güncelleme #83)
-- ----------------------------------------------------------------------------
--  SENİN İSTEĞİN: Prim çok fazla → Veysel 3.296 ₺ yerine ~1.500 ₺ olsun
--
--  ÇÖZÜM: maks_prim (100 puan = kaç ₺) değerini düşür
--         1.200 ₺ → 600 ₺  = prim yarıya iner
--
--  NOT: Bu değeri istediğin zaman /admin/personel-performans ekranındaki
--       ⚙️ AYARLAR butonundan da değiştirebilirsin (kod bilgisi gerekmez)
--
--  KULLANIM: 110'dan SONRA çalıştır.
-- ============================================================================

-- 1) Maksimum primi 600 ₺ yap (100 puan = 600 ₺)
update public.prim_ayarlari
   set maks_prim = 600,
       guncelleme = now()
 where id = 1;

-- 2) KONTROL — yeni ayarlar
select
  maks_prim      as maks_prim_100puan,
  min_prim       as en_dusuk_prim,
  sure_puan      as sure_agirligi,
  parca_puan     as parca_agirligi,
  tip_puan       as tip_agirligi,
  bedel_puan     as bedel_agirligi,
  memnuniyet_puan as memnuniyet_agirligi
from public.prim_ayarlari where id = 1;

-- 3) YENİ PRİM TABLOSU — düştü mü?
select
  personel,
  is_sayisi                                             as biten_is,
  ortalama_agirlik,
  toplam_prim                                           as yeni_prim,
  round(toplam_prim * 2)                                as eski_prim,
  maas,
  toplam_maliyet                                        as maas_arti_prim
from public.prim_ozet()
order by toplam_prim desc;

-- 4) ÖRNEK: iş ağırlığına göre yeni prim tutarları
select
  'ÇOK AĞIR (83 puan)' as is_tipi,
  round(83 / 100.0 * (select maks_prim from public.prim_ayarlari where id=1)) as prim
union all select 'AĞIR (65 puan)',
  round(65 / 100.0 * (select maks_prim from public.prim_ayarlari where id=1))
union all select 'ORTA (45 puan)',
  round(45 / 100.0 * (select maks_prim from public.prim_ayarlari where id=1))
union all select 'HAFİF (25 puan)',
  greatest((select min_prim from public.prim_ayarlari where id=1),
           round(25 / 100.0 * (select maks_prim from public.prim_ayarlari where id=1)))
union all select 'ÇOK KOLAY (11 puan)',
  greatest((select min_prim from public.prim_ayarlari where id=1),
           round(11 / 100.0 * (select maks_prim from public.prim_ayarlari where id=1)));
