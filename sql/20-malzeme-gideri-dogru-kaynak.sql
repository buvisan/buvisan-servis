-- ============================================================================
--  💰 MALZEME GİDERİ — DOĞRU KAYNAKTAN (v4)
-- ----------------------------------------------------------------------------
--  SENİN TESPİTİN DOĞRUYDU:
--    Malzemeler "Analiz → Son İşlemler" formundan giriliyor ve
--    completed_services.materials_text alanına SERBEST METİN olarak yazılıyor:
--
--       "2 Adet - 250Kg Manyetik Kilit
--        1 Adet - 24V Siren
--        15M 2x1 Kablo"
--
--    624 işin 279'unda malzeme bilgisi var. Yani asıl kaynak BURASI.
--
--  BU SCRIPT NE YAPAR:
--    Her satırı ayrıştırır → miktar + ürün adı çıkarır → depoda eşleştirir
--    → alış fiyatıyla çarpar → aylık malzeme maliyetini bulur.
--
--  Maliyet bulma sırası:
--     1) Analiz formlarındaki malzeme metni (ASIL KAYNAK)
--     2) Servis raporlarında depodan seçilen parçalar
--     3) Gider tablosuna elle girilen aylık malzeme (son çare)
--
--  ⚠️ Metinden eşleştirme TAHMİNİDİR: depoda tam adı bulunamayan parçalar
--     0 ₺ sayılır. Detay fonksiyonu hangi parçanın eşleşmediğini gösterir.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) MALZEME METNİNİ AYRIŞTIR (her satır → miktar + ürün)
-- ============================================================================
create or replace function public.analiz_malzeme_detay(p_ay text)
returns table (
  tarih        date,
  musteri      text,
  satir        text,
  miktar       numeric,
  urun         text,
  eslesen      text,
  birim_fiyat  numeric,
  tutar        numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with ham as (
    select
      cs.service_date as tarih,
      coalesce(cs.customer_text, '-') as musteri,
      trim(s) as satir
    from public.completed_services cs
    cross join lateral unnest(string_to_array(coalesce(cs.materials_text, ''), E'\n')) as s
    where to_char(cs.service_date, 'YYYY-MM') = p_ay
      and coalesce(trim(s), '') <> ''
  ),
  ayristirilmis as (
    select
      h.tarih, h.musteri, h.satir,
      case
        when h.satir ~ '^[0-9]' then
          coalesce(nullif(replace((regexp_match(h.satir, '^([0-9]+(?:[.,][0-9]+)?)'))[1], ',', '.'), ''), '1')::numeric
        else 1
      end as miktar,
      trim(regexp_replace(h.satir,
        '^[0-9]+(?:[.,][0-9]+)?\s*(adet|m|mt|metre|kg|ton|takım|set|çift|paket)?\s*[-–—:]?\s*',
        '', 'i')) as urun
    from ham h
  )
  select
    a.tarih, a.musteri, a.satir, a.miktar, a.urun,
    (select m.name from public.materials m
      where public.parca_adi_normal(m.name) = public.parca_adi_normal(a.urun) limit 1) as eslesen,
    coalesce(
      (select m.buy_price from public.materials m
        where public.parca_adi_normal(m.name) = public.parca_adi_normal(a.urun) limit 1),
      (select m.buy_price from public.materials m
        where (public.parca_adi_normal(a.urun) like '%' || public.parca_adi_normal(m.name) || '%'
            or public.parca_adi_normal(m.name) like '%' || public.parca_adi_normal(a.urun) || '%')
          and length(public.parca_adi_normal(m.name)) >= 4
        order by length(m.name) desc
        limit 1),
      0
    ) as birim_fiyat,
    a.miktar * coalesce(
      (select m.buy_price from public.materials m
        where public.parca_adi_normal(m.name) = public.parca_adi_normal(a.urun) limit 1),
      (select m.buy_price from public.materials m
        where (public.parca_adi_normal(a.urun) like '%' || public.parca_adi_normal(m.name) || '%'
            or public.parca_adi_normal(m.name) like '%' || public.parca_adi_normal(a.urun) || '%')
          and length(public.parca_adi_normal(m.name)) >= 4
        order by length(m.name) desc
        limit 1),
      0
    ) as tutar
  from ayristirilmis a
  where length(trim(a.urun)) >= 3
  order by a.tarih desc;
$$;

revoke all on function public.analiz_malzeme_detay(text) from public;
grant execute on function public.analiz_malzeme_detay(text) to authenticated;


-- ============================================================================
-- 2) AYLIK TOPLAM (sadece sayı)
-- ============================================================================
create or replace function public.analiz_malzeme_maliyeti(p_ay text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(d.tutar), 0)::numeric
  from public.analiz_malzeme_detay(p_ay) d;
$$;

revoke all on function public.analiz_malzeme_maliyeti(text) from public;
grant execute on function public.analiz_malzeme_maliyeti(text) to authenticated;


-- ============================================================================
-- 3) FİNANS ÖZETİ v4 — malzeme kaynağı önceliği netleşti
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
      count(*)::int                       as is_adedi
    from public.completed_services cs
    where to_char(cs.service_date, 'YYYY-MM') = p_ay
      and coalesce(cs.currency, 'TL') = 'TL'
  ),
  hesap as (
    select
      coalesce(fr.maas, 0)::numeric                  as personel,
      (coalesce(fr.kira, 0) + coalesce(fr.yakit, 0) + coalesce(fr.yemek, 0)
       + coalesce(fr.mesai_yemek, 0) + coalesce(fr.arac_yipranma, 0)
       + coalesce(fr.arac_sigorta, 0) + coalesce(fr.arac_bakim, 0)
       + coalesce(fr.tazminat, 0))::numeric           as sabit,
      public.analiz_malzeme_maliyeti(p_ay)            as analiz_maliyet,
      public.rapor_malzeme_maliyeti(p_ay)             as rapor_maliyet,
      coalesce(fr.malzeme, 0)::numeric                as elle_maliyet,
      (fr.month_key is not null)                      as gider_girilmis,
      (select count(*) from public.completed_services cs
        where to_char(cs.service_date, 'YYYY-MM') = p_ay
          and coalesce(cs.materials_text, '') <> '')  as malzemeli_is
    from (select 1) x
    left join public.financial_records fr on fr.month_key = p_ay
    limit 1
  ),
  secim as (
    select
      h.*,
      case
        when h.analiz_maliyet > 0 then h.analiz_maliyet
        when h.rapor_maliyet  > 0 then h.rapor_maliyet
        else h.elle_maliyet
      end as malzeme,
      case
        when h.analiz_maliyet > 0 then 'analiz formları (metinden eşleştirme)'
        when h.rapor_maliyet  > 0 then 'servis raporları (depodan seçilen)'
        when h.elle_maliyet   > 0 then 'gider tablosu (elle girilen)'
        else 'veri yok'
      end as malzeme_kaynagi
    from hesap h
  )
  select jsonb_build_object(
    'ay',               p_ay,
    'ciro',             (select toplam from ciro),
    'is_adedi',         (select is_adedi from ciro),

    'personel_gideri',  s.personel,
    'sabit_giderler',   s.sabit,
    'malzeme_gideri',   s.malzeme,
    'malzeme_analiz',   s.analiz_maliyet,
    'malzeme_rapor',    s.rapor_maliyet,
    'malzeme_elle',     s.elle_maliyet,
    'malzeme_kaynagi',  s.malzeme_kaynagi,
    'malzemeli_is',     s.malzemeli_is,

    'toplam_gider',     (s.personel + s.sabit + s.malzeme),
    'net_kar',          ((select toplam from ciro) - (s.personel + s.sabit + s.malzeme)),
    'kar_marji_yuzde',  case when (select toplam from ciro) > 0
                             then round((((select toplam from ciro) - (s.personel + s.sabit + s.malzeme))
                                         / (select toplam from ciro) * 100)::numeric, 1)
                             else 0 end,
    'gider_girilmis',   s.gider_girilmis,
    'uyari',            case
                          when not s.gider_girilmis
                            then 'Bu ay için gider kaydı girilmemiş — personel/sabit giderler 0 sayıldı.'
                          when s.analiz_maliyet = 0 and s.malzemeli_is > 0
                            then 'Malzeme metni var ama depoda eşleşen ürün bulunamadı. Depo fiyat listesine eksik ürünleri ekleyin.'
                          when s.malzeme = 0
                            then 'Bu ay için malzeme kaydı bulunmuyor.'
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
  (public.finans_ozet(to_char(d, 'YYYY-MM')) ->> 'malzemeli_is')    as malzemeli_is,
  (public.finans_ozet(to_char(d, 'YYYY-MM')) ->> 'net_kar')         as net_kar
from generate_series(
  date_trunc('month', current_date) - interval '3 months',
  date_trunc('month', current_date),
  interval '1 month'
) d;

-- Eşleşmeyen parçalar (depo fiyat listesini tamamlamak için)
select 'ESLESMEYEN ORNEKLER' as baslik, urun, miktar, satir
from public.analiz_malzeme_detay(to_char(current_date - interval '1 month', 'YYYY-MM'))
where birim_fiyat = 0
limit 15;
