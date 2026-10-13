-- ============================================================================
--  💰 MALZEME GİDERİ — GERÇEK YAPI (v5) ✅ DOĞRU KAYNAK
-- ----------------------------------------------------------------------------
--  BULUNAN GERÇEK YAPI:
--    Analiz → Son İşlemler formu, işi şu şekilde kaydediyor:
--      completed_services.materials = [
--        {"ad":"SCHNEİDER 3 KUTUPLU 6A KONTAKTÖR","adet":1,"birim_fiyat":1400,"toplam_fiyat":1400},
--        {"ad":"SERVİS İŞÇİLİĞİ","adet":1,"birim_fiyat":6500,"toplam_fiyat":6500}
--      ]
--
--    267 işte toplam 574 kalem var. Bunların ~285'i GERÇEK MALZEME,
--    geri kalanı İŞÇİLİK/HİZMET kalemi (SERVİS İŞÇİLİĞİ vb.).
--
--  HESAP KURALI:
--    • İşçilik/hizmet kalemleri HARİÇ (onlar personel giderine dahil)
--    • Gerçek malzemeler: adı depoda aranır → ALIŞ FİYATI × adet
--    • Depoda bulunamayan kalemler 0 sayılır (detay fonksiyonu listeler)
--
--  ⚠️ Veri değiştirmez. Sadece hesaplar.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) İŞÇİLİK/HİZMET KALEMİ Mİ? (malzeme giderine sayılmasın)
-- ============================================================================
create or replace function public.iscilik_kalemi_mi(p_ad text)
returns boolean
language sql
immutable
as $$
  select public.parca_adi_normal(p_ad) ~ '(servis iscilig|saat basi|periyodik bakim|iscilik|isçilik|yol ucreti|nakliye|montaj|demontaj|kesif|kesfi)';
$$;


-- ============================================================================
-- 2) MALZEME KALEMLERİNİN DETAYI (hangi kalem ne kadar?)
-- ============================================================================
create or replace function public.analiz_malzeme_detay(p_ay text)
returns table (
  tarih        date,
  musteri      text,
  kalem        text,
  adet         numeric,
  satis_fiyat  numeric,
  alis_fiyat   numeric,
  maliyet      numeric,
  eslesti      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cs.service_date,
    coalesce(cs.customer_text, '-'),
    (p ->> 'ad'),
    coalesce(nullif(p ->> 'adet', '')::numeric, 1),
    coalesce(nullif(p ->> 'birim_fiyat', '')::numeric, 0),
    coalesce(
      (select m.buy_price from public.materials m
        where public.parca_adi_normal(m.name) = public.parca_adi_normal(p ->> 'ad') limit 1),
      (select m.buy_price from public.materials m
        where length(public.parca_adi_normal(m.name)) >= 4
          and (public.parca_adi_normal(p ->> 'ad') like '%' || public.parca_adi_normal(m.name) || '%'
            or public.parca_adi_normal(m.name) like '%' || public.parca_adi_normal(p ->> 'ad') || '%')
        order by length(m.name) desc
        limit 1),
      0
    ) as alis,
    coalesce(nullif(p ->> 'adet', '')::numeric, 1) * coalesce(
      (select m.buy_price from public.materials m
        where public.parca_adi_normal(m.name) = public.parca_adi_normal(p ->> 'ad') limit 1),
      (select m.buy_price from public.materials m
        where length(public.parca_adi_normal(m.name)) >= 4
          and (public.parca_adi_normal(p ->> 'ad') like '%' || public.parca_adi_normal(m.name) || '%'
            or public.parca_adi_normal(m.name) like '%' || public.parca_adi_normal(p ->> 'ad') || '%')
        order by length(m.name) desc
        limit 1),
      0
    ) as maliyet_toplam,
    exists (
      select 1 from public.materials m
       where public.parca_adi_normal(m.name) = public.parca_adi_normal(p ->> 'ad')
          or (length(public.parca_adi_normal(m.name)) >= 4
              and (public.parca_adi_normal(p ->> 'ad') like '%' || public.parca_adi_normal(m.name) || '%'
                or public.parca_adi_normal(m.name) like '%' || public.parca_adi_normal(p ->> 'ad') || '%'))
    ) as eslesti
  from public.completed_services cs
  cross join lateral jsonb_array_elements(coalesce(cs.materials, '[]'::jsonb)) as p
  where to_char(cs.service_date, 'YYYY-MM') = p_ay
    and coalesce(trim(p ->> 'ad'), '') <> ''
    and not public.iscilik_kalemi_mi(p ->> 'ad')
  order by cs.service_date desc;
$$;

revoke all on function public.analiz_malzeme_detay(text) from public;
grant execute on function public.analiz_malzeme_detay(text) to authenticated;


-- ============================================================================
-- 3) AYLIK MALZEME MALİYETİ (tek sayı)
-- ============================================================================
create or replace function public.analiz_malzeme_maliyeti(p_ay text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(d.maliyet), 0)::numeric
  from public.analiz_malzeme_detay(p_ay) d;
$$;

revoke all on function public.analiz_malzeme_maliyeti(text) from public;
grant execute on function public.analiz_malzeme_maliyeti(text) to authenticated;


-- ============================================================================
-- 4) AYLIK MALZEME SATIŞ TUTARI (müşteriye yansıtılan — kâr marjı için)
-- ============================================================================
create or replace function public.analiz_malzeme_satis(p_ay text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(d.satis_fiyat * d.adet), 0)::numeric
  from public.analiz_malzeme_detay(p_ay) d;
$$;

revoke all on function public.analiz_malzeme_satis(text) from public;
grant execute on function public.analiz_malzeme_satis(text) to authenticated;


-- ============================================================================
-- 5) FİNANS ÖZETİ v5
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
      coalesce(fr.maas, 0)::numeric                    as personel,
      (coalesce(fr.kira, 0) + coalesce(fr.yakit, 0) + coalesce(fr.yemek, 0)
       + coalesce(fr.mesai_yemek, 0) + coalesce(fr.arac_yipranma, 0)
       + coalesce(fr.arac_sigorta, 0) + coalesce(fr.arac_bakim, 0)
       + coalesce(fr.tazminat, 0))::numeric             as sabit,
      public.analiz_malzeme_maliyeti(p_ay)              as malzeme,
      public.analiz_malzeme_satis(p_ay)                 as malzeme_satis,
      public.rapor_malzeme_maliyeti(p_ay)               as rapor_maliyet,
      coalesce(fr.malzeme, 0)::numeric                  as elle_maliyet,
      (fr.month_key is not null)                        as gider_girilmis,
      (select count(*) from public.analiz_malzeme_detay(p_ay)) as malzeme_kalem
    from (select 1) x
    left join public.financial_records fr on fr.month_key = p_ay
    limit 1
  )
  select jsonb_build_object(
    'ay',               p_ay,
    'ciro',             (select toplam from ciro),
    'is_adedi',         (select is_adedi from ciro),

    'personel_gideri',  h.personel,
    'sabit_giderler',   h.sabit,
    'malzeme_gideri',   h.malzeme,
    'malzeme_satis',    h.malzeme_satis,
    'malzeme_kalem',    h.malzeme_kalem,
    'malzeme_rapor',    h.rapor_maliyet,
    'malzeme_elle',     h.elle_maliyet,
    'malzeme_kaynagi',  'analiz formları (iş kalemleri)',

    'toplam_gider',     (h.personel + h.sabit + h.malzeme),
    'net_kar',          ((select toplam from ciro) - (h.personel + h.sabit + h.malzeme)),
    'kar_marji_yuzde',  case when (select toplam from ciro) > 0
                             then round((((select toplam from ciro) - (h.personel + h.sabit + h.malzeme))
                                         / (select toplam from ciro) * 100)::numeric, 1)
                             else 0 end,
    'gider_girilmis',   h.gider_girilmis,
    'uyari',            case
                          when not h.gider_girilmis
                            then 'Bu ay için gider kaydı girilmemiş — personel/sabit giderler 0 sayıldı.'
                          when h.malzeme = 0 and h.malzeme_kalem > 0
                            then 'İş kalemleri var ama hiçbiri depo fiyat listesiyle eşleşmedi. Depoya eksik ürünleri ekleyin.'
                          when h.malzeme_kalem = 0
                            then 'Bu ayın işlerinde malzeme kalemi girilmemiş.'
                          else null
                        end
  )
  from hesap h;
$$;

revoke all on function public.finans_ozet(text) from public;
grant execute on function public.finans_ozet(text) to authenticated;


-- ============================================================================
-- 6) KONTROL: son 6 ay
-- ============================================================================
select
  (public.finans_ozet(to_char(d, 'YYYY-MM')) ->> 'ay')              as ay,
  (public.finans_ozet(to_char(d, 'YYYY-MM')) ->> 'ciro')            as ciro,
  (public.finans_ozet(to_char(d, 'YYYY-MM')) ->> 'malzeme_gideri')  as malzeme_maliyet,
  (public.finans_ozet(to_char(d, 'YYYY-MM')) ->> 'malzeme_satis')   as malzeme_satis,
  (public.finans_ozet(to_char(d, 'YYYY-MM')) ->> 'malzeme_kalem')   as kalem,
  (public.finans_ozet(to_char(d, 'YYYY-MM')) ->> 'net_kar')         as net_kar
from generate_series(
  date_trunc('month', current_date) - interval '5 months',
  date_trunc('month', current_date),
  interval '1 month'
) d;

-- Eşleşmeyen malzemeler (depo fiyat listesini tamamlamak için)
select 'ESLESMEYEN KALEMLER' as baslik, kalem, count(*) as adet, max(tarih) as son_kullanim
from public.analiz_malzeme_detay(to_char(current_date, 'YYYY-MM'))
where not eslesti
group by kalem
order by count(*) desc
limit 20;
