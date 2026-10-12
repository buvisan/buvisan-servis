-- ============================================================================
--  💰 FİNANS v2 — SENİN KURALLARINLA
-- ----------------------------------------------------------------------------
--  SENİN KARARLARIN:
--    • Personel gideri  → Gider tablosuna ELLE girilen maaş geçerli
--    • Malzeme gideri   → Servis raporlarındaki GERÇEK parça kullanımından
--                         otomatik hesaplanır (elle girilen değil)
--
--  NEDEN "BİRİM MALİYET SAKLAMA" GEREKLİ?
--    Parçanın alış fiyatı bugün 100 ₺, 3 ay sonra 150 ₺ olabilir.
--    Eğer maliyeti her seferinde GÜNCEL fiyattan hesaplarsak,
--    3 ay önceki ayın kârı da kendiliğinden değişir. Bu yüzden parça
--    kullanıldığı ANDAKİ alış fiyatı raporda saklanmalı.
--    (Eski raporlarda bu alan yok → depodaki güncel fiyata düşülür.)
--
--  ⚠️ Veri silmez/değiştirmez. Fonksiyonları yeniler + yeni alan ekler.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) RAPORLARDAN AYLIK MALZEME MALİYETİ
--    Her parça için: (adet × birim maliyet)
--    birim maliyet yoksa → depodaki güncel alış fiyatı
-- ============================================================================
create or replace function public.rapor_malzeme_maliyeti(p_ay text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    coalesce(
      nullif(p ->> 'birim_maliyet', '')::numeric,                                  -- kullanım anındaki maliyet
      (select m.buy_price from public.materials m
        where m.id::text = coalesce(p ->> 'malzeme_id', '')),                      -- yoksa güncel alış fiyatı
      0
    ) * coalesce(nullif(p ->> 'adet', '')::numeric, 0)
  ), 0)::numeric
  from public.service_reports sr
  cross join lateral jsonb_array_elements(coalesce(sr.degisen_parcalar, '[]'::jsonb)) as p
  where to_char(sr.created_at, 'YYYY-MM') = p_ay;
$$;

revoke all on function public.rapor_malzeme_maliyeti(text) from public;
grant execute on function public.rapor_malzeme_maliyeti(text) to authenticated;


-- ============================================================================
-- 2) FİNANS ÖZETİ v2 (senin kurallarınla)
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
  gider as (
    select
      coalesce(fr.maas, 0)::numeric as personel,
      (coalesce(fr.kira, 0) + coalesce(fr.yakit, 0) + coalesce(fr.yemek, 0)
       + coalesce(fr.mesai_yemek, 0) + coalesce(fr.arac_yipranma, 0)
       + coalesce(fr.arac_sigorta, 0) + coalesce(fr.arac_bakim, 0)
       + coalesce(fr.tazminat, 0))::numeric as sabit,
      public.rapor_malzeme_maliyeti(p_ay)   as malzeme_rapor,
      coalesce(fr.malzeme, 0)::numeric      as malzeme_elle,
      (fr.month_key is not null)            as gider_girilmis
    from (select 1) x
    left join public.financial_records fr on fr.month_key = p_ay
    limit 1
  )
  select jsonb_build_object(
    'ay',               p_ay,
    'ciro',             (select toplam from ciro),
    'is_adedi',         (select is_adedi from ciro),
    'tl_disi_is',       (select tl_disi_is from ciro),

    'personel_gideri',  g.personel,
    'sabit_giderler',   g.sabit,
    'malzeme_gideri',   g.malzeme_rapor,          -- ⭐ rapordan otomatik
    'malzeme_elle',     g.malzeme_elle,           -- bilgi amaçlı (karşılaştırma)

    'toplam_gider',     (g.personel + g.sabit + g.malzeme_rapor),
    'net_kar',          ((select toplam from ciro) - (g.personel + g.sabit + g.malzeme_rapor)),
    'kar_marji_yuzde',  case when (select toplam from ciro) > 0
                             then round((((select toplam from ciro) - (g.personel + g.sabit + g.malzeme_rapor))
                                         / (select toplam from ciro) * 100)::numeric, 1)
                             else 0 end,
    'gider_girilmis',   g.gider_girilmis,
    'malzeme_kaynagi',  'servis raporları (otomatik)',
    'personel_kaynagi', 'gider tablosu (elle girilen)',
    'uyari',            case
                          when not g.gider_girilmis
                            then 'Bu ay için gider kaydı girilmemiş — personel/sabit giderler 0 sayıldı.'
                          when g.malzeme_rapor = 0 and g.malzeme_elle > 0
                            then 'Raporlarda parça kullanımı görünmüyor (teknisyenler depodan parça seçmemiş olabilir).'
                          else null
                        end
  )
  from gider g;
$$;

revoke all on function public.finans_ozet(text) from public;
grant execute on function public.finans_ozet(text) to authenticated;


-- ============================================================================
-- 3) KONTROL: son 3 ay + malzeme kaynağı karşılaştırması
-- ============================================================================
select
  f.ay,
  f.ciro,
  f.personel_gideri        as personel,
  f.sabit_giderler         as sabit,
  f.malzeme_gideri         as malzeme_rapor,
  f.malzeme_elle           as malzeme_elle,
  f.net_kar,
  f.kar_marji_yuzde         as kar_marji
from (
  select (public.finans_ozet(to_char(d, 'YYYY-MM'))) as j
  from generate_series(
    date_trunc('month', current_date) - interval '3 months',
    date_trunc('month', current_date),
    interval '1 month'
  ) d
) x
cross join lateral (
  select
    (x.j ->> 'ay')::text                    as ay,
    (x.j ->> 'ciro')::numeric               as ciro,
    (x.j ->> 'personel_gideri')::numeric    as personel_gideri,
    (x.j ->> 'sabit_giderler')::numeric     as sabit_giderler,
    (x.j ->> 'malzeme_gideri')::numeric     as malzeme_gideri,
    (x.j ->> 'malzeme_elle')::numeric       as malzeme_elle,
    (x.j ->> 'net_kar')::numeric            as net_kar,
    (x.j ->> 'kar_marji_yuzde')::numeric    as kar_marji_yuzde
) f
order by f.ay;
