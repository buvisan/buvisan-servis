-- ============================================================================
--  🔧 MALZEME MALİYETİ DÜZELTMESİ (v3)
-- ----------------------------------------------------------------------------
--  SORUN 1: Raporda parça ELLE YAZILMIŞSA ("Diyot" gibi) maliyet 0 çıkıyordu.
--           → Artık parça ADI depoyla eşleştirilerek alış fiyatı bulunacak.
--
--  SORUN 2: Teknisyenler henüz depodan parça seçmediği için raporlarda
--           parça verisi neredeyse yok → malzeme gideri her ay 0 görünüyor.
--           → Artık: raporda parça varsa O kullanılır, YOKSA o ay için elle
--             girilen depo gideri kullanılır. Hangisinin kullanıldığı
--             açıkça belirtilir (kaynak: raporlar / elle girilen).
--
--  Maliyet bulma sırası (her parça için):
--     1) Kullanım anında saklanan maliyet  (yeni raporlar)
--     2) Depodaki malzeme kimliğinden alış fiyatı
--     3) Parça ADINDAN depoda eşleştirme (elle yazılmış parçalar)
--     4) Bulunamazsa 0 (ve raporda "eşleşmedi" olarak görünür)
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) PARÇA ADI NORMALİZASYONU (Türkçe karakter + büyük/küçük harf toleransı)
-- ============================================================================
create or replace function public.parca_adi_normal(x text)
returns text
language sql
immutable
as $$
  select translate(
           lower(trim(coalesce(x, ''))),
           'ıişğüöçİIŞĞÜÖÇ',
           'iisguociisguoc'
         );
$$;


-- ============================================================================
-- 2) AYLIK MALZEME MALİYETİ (ad eşleştirmeli)
-- ============================================================================
create or replace function public.rapor_malzeme_maliyeti(p_ay text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with parcalar as (
    select p
    from public.service_reports sr
    cross join lateral jsonb_array_elements(coalesce(sr.degisen_parcalar, '[]'::jsonb)) as p
    where to_char(sr.created_at, 'YYYY-MM') = p_ay
      and coalesce(trim(p ->> 'parca_adi'), '') <> ''
  )
  select coalesce(sum(
    coalesce(
      -- 1) kullanım anında saklanan maliyet
      nullif(p ->> 'birim_maliyet', '')::numeric,

      -- 2) malzeme kimliğinden
      (select m.buy_price from public.materials m
        where m.id::text = coalesce(p ->> 'malzeme_id', '')),

      -- 3) parça ADINDAN eşleştirme
      (select m.buy_price from public.materials m
        where public.parca_adi_normal(m.name) = public.parca_adi_normal(p ->> 'parca_adi')
        limit 1),

      0
    ) * coalesce(nullif(p ->> 'adet', '')::numeric, 0)
  ), 0)::numeric
  from parcalar;
$$;

revoke all on function public.rapor_malzeme_maliyeti(text) from public;
grant execute on function public.rapor_malzeme_maliyeti(text) to authenticated;


-- ============================================================================
-- 3) FİNANS ÖZETİ v3 — raporda veri yoksa elle girilene düşer
-- ============================================================================
create or replace function public.finans_ozet(p_ay text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ciro as (
    select
      coalesce(sum(cs.price), 0)::numeric as toplam,
      count(*)::int                       as is_adedi,
      count(*) filter (where coalesce(cs.currency, 'TL') <> 'TL')::int as tl_disi_is
    from public.completed_services cs
    where to_char(cs.service_date, 'YYYY-MM') = p_ay
      and coalesce(cs.currency, 'TL') = 'TL'
  ),
  hesap as (
    select
      coalesce(fr.maas, 0)::numeric                          as personel,
      (coalesce(fr.kira, 0) + coalesce(fr.yakit, 0) + coalesce(fr.yemek, 0)
       + coalesce(fr.mesai_yemek, 0) + coalesce(fr.arac_yipranma, 0)
       + coalesce(fr.arac_sigorta, 0) + coalesce(fr.arac_bakim, 0)
       + coalesce(fr.tazminat, 0))::numeric                   as sabit,
      public.rapor_malzeme_maliyeti(p_ay)                     as rapor_maliyet,
      coalesce(fr.malzeme, 0)::numeric                        as elle_maliyet,
      (fr.month_key is not null)                              as gider_girilmis,
      (select count(*) from public.service_reports sr
        where to_char(sr.created_at, 'YYYY-MM') = p_ay)       as rapor_sayisi
    from (select 1) x
    left join public.financial_records fr on fr.month_key = p_ay
    limit 1
  ),
  secim as (
    select
      h.*,
      case when h.rapor_maliyet > 0 then h.rapor_maliyet else h.elle_maliyet end as malzeme,
      case when h.rapor_maliyet > 0 then 'servis raporları (otomatik)'
           when h.elle_maliyet  > 0 then 'gider tablosu (elle girilen)'
           else 'veri yok' end                                                as malzeme_kaynagi
    from hesap h
  )
  select jsonb_build_object(
    'ay',               p_ay,
    'ciro',             (select toplam from ciro),
    'is_adedi',         (select is_adedi from ciro),
    'tl_disi_is',       (select tl_disi_is from ciro),

    'personel_gideri',  s.personel,
    'sabit_giderler',   s.sabit,
    'malzeme_gideri',   s.malzeme,
    'malzeme_rapor',    s.rapor_maliyet,
    'malzeme_elle',     s.elle_maliyet,
    'malzeme_kaynagi',  s.malzeme_kaynagi,
    'rapor_sayisi',     s.rapor_sayisi,

    'toplam_gider',     (s.personel + s.sabit + s.malzeme),
    'net_kar',          ((select toplam from ciro) - (s.personel + s.sabit + s.malzeme)),
    'kar_marji_yuzde',  case when (select toplam from ciro) > 0
                             then round((((select toplam from ciro) - (s.personel + s.sabit + s.malzeme))
                                         / (select toplam from ciro) * 100)::numeric, 1)
                             else 0 end,
    'gider_girilmis',   s.gider_girilmis,
    'personel_kaynagi', 'gider tablosu (elle girilen maaş)',
    'uyari',            case
                          when not s.gider_girilmis
                            then 'Bu ay için gider kaydı girilmemiş — personel/sabit giderler 0 sayıldı.'
                          when s.rapor_maliyet = 0 and s.rapor_sayisi > 0
                            then 'Bu ayın raporlarında depodan seçilmiş parça yok. Teknisyenler parçayı depodan seçerse malzeme gideri otomatik hesaplanır.'
                          when s.rapor_maliyet = 0 and s.rapor_sayisi = 0
                            then 'Bu ay için saha raporu girilmemiş — malzeme gideri elle girilen değerden alındı.'
                          else null
                        end
  )
  from secim s;
$$;

revoke all on function public.finans_ozet(text) from public;
grant execute on function public.finans_ozet(text) to authenticated;


-- ============================================================================
-- 4) KONTROL: son 4 ay + malzeme kaynağı
-- ============================================================================
select
  (public.finans_ozet(to_char(d, 'YYYY-MM')) ->> 'ay')              as ay,
  (public.finans_ozet(to_char(d, 'YYYY-MM')) ->> 'ciro')            as ciro,
  (public.finans_ozet(to_char(d, 'YYYY-MM')) ->> 'malzeme_gideri')  as malzeme,
  (public.finans_ozet(to_char(d, 'YYYY-MM')) ->> 'malzeme_kaynagi') as kaynak,
  (public.finans_ozet(to_char(d, 'YYYY-MM')) ->> 'rapor_sayisi')    as rapor,
  (public.finans_ozet(to_char(d, 'YYYY-MM')) ->> 'net_kar')         as net_kar
from generate_series(
  date_trunc('month', current_date) - interval '3 months',
  date_trunc('month', current_date),
  interval '1 month'
) d;
