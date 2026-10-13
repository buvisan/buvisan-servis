-- ============================================================================
--  💵 İŞ BAZLI KÂR MOTORU (Büyük Güncelleme #6)
-- ----------------------------------------------------------------------------
--  SORUN:
--    Şu ana kadar sadece AYLIK toplam kâr görülüyordu. Ama hangi İŞİN kâr
--    bıraktığı, hangisinin ZARAR ettiği bilinmiyordu. Bir müşteri çok iş
--    veriyor ama marjı düşük olabilir — kimse fark etmiyor.
--
--  HESAP:
--    Kâr = İş Bedeli (fiyat)
--          − Malzeme Maliyeti (depodaki ALIŞ fiyatı × adet, işçilik kalemleri hariç)
--          − İşçilik Maliyeti (çalışma saati × saatlik maliyet)
--
--    Saatlik maliyet = o ayın personel gideri / 220 saat
--
--  ⚠️ Veri değiştirmez. Sadece okur ve hesaplar.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) SAATLİK İŞÇİLİK MALİYETİ
-- ============================================================================
create or replace function public.saatlik_iscilik_maliyeti(p_ay text default null)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(
    coalesce(
      (select fr.maas from public.financial_records fr
        where fr.month_key = p_ay and coalesce(fr.maas, 0) > 0),
      (select avg(fr.maas) from public.financial_records fr where coalesce(fr.maas, 0) > 0),
      0
    ) / 220.0
  , 2);
$$;

revoke all on function public.saatlik_iscilik_maliyeti(text) from public;
grant execute on function public.saatlik_iscilik_maliyeti(text) to authenticated;


-- ============================================================================
-- 2) İŞ BAZINDA KÂRLILIK
-- ============================================================================
create or replace function public.is_karliligi(p_limit integer default 200, p_sadece_zararli boolean default false)
returns table (
  is_id             uuid,
  tarih             date,
  musteri           text,
  aciklama          text,
  is_turu           text,
  teknisyen         text,
  fiyat             numeric,
  malzeme_maliyeti  numeric,
  iscilik_maliyeti  numeric,
  toplam_maliyet    numeric,
  kar               numeric,
  marj_yuzde        numeric,
  durum             text
)
language sql
stable
security definer
set search_path = public
as $$
  with malzeme as (
    select
      cs.id as is_id,
      coalesce(sum(
        coalesce(
          (select m.buy_price from public.materials m
            where public.parca_adi_normal(m.name) = public.parca_adi_normal(p ->> 'ad') limit 1),
          (select m.buy_price from public.materials m
            where length(public.parca_adi_normal(m.name)) >= 4
              and (public.parca_adi_normal(p ->> 'ad') like '%' || public.parca_adi_normal(m.name) || '%'
                or public.parca_adi_normal(m.name) like '%' || public.parca_adi_normal(p ->> 'ad') || '%')
            order by length(m.name) desc limit 1),
          0
        ) * coalesce(nullif(p ->> 'adet', '')::numeric, 1)
      ), 0)::numeric as maliyet
    from public.completed_services cs
    cross join lateral jsonb_array_elements(coalesce(cs.materials, '[]'::jsonb)) p
    where coalesce(trim(p ->> 'ad'), '') <> ''
      and not public.iscilik_kalemi_mi(p ->> 'ad')
    group by cs.id
  ),
  hesap as (
    select
      cs.id,
      cs.service_date,
      coalesce(cs.customer_text, 'Bilinmiyor') as musteri,
      cs.description,
      cs.service_type,
      cs.technician,
      coalesce(cs.price, 0)::numeric                        as fiyat,
      coalesce(mz.maliyet, 0)::numeric                      as malzeme_maliyeti,
      round(coalesce(cs.work_hours, 0)::numeric
            * public.saatlik_iscilik_maliyeti(to_char(cs.service_date, 'YYYY-MM')), 0) as iscilik_maliyeti
    from public.completed_services cs
    left join malzeme mz on mz.is_id = cs.id
    where coalesce(cs.currency, 'TL') = 'TL'
  )
  select
    h.id,
    h.service_date,
    h.musteri,
    h.description,
    h.service_type,
    h.technician,
    h.fiyat,
    h.malzeme_maliyeti,
    h.iscilik_maliyeti,
    (h.malzeme_maliyeti + h.iscilik_maliyeti),
    (h.fiyat - (h.malzeme_maliyeti + h.iscilik_maliyeti)),
    case when h.fiyat > 0
         then round(((h.fiyat - (h.malzeme_maliyeti + h.iscilik_maliyeti)) / h.fiyat * 100)::numeric, 1)
         else 0 end,
    case
      when h.fiyat <= 0 then 'BEDELSİZ'
      when (h.fiyat - (h.malzeme_maliyeti + h.iscilik_maliyeti)) < 0 then 'ZARAR'
      when h.fiyat > 0
       and ((h.fiyat - (h.malzeme_maliyeti + h.iscilik_maliyeti)) / h.fiyat) < 0.30 then 'DÜŞÜK MARJ'
      else 'KÂRLI'
    end
  from hesap h
  where (not p_sadece_zararli) or (h.fiyat - (h.malzeme_maliyeti + h.iscilik_maliyeti)) < 0
  order by (h.fiyat - (h.malzeme_maliyeti + h.iscilik_maliyeti)) asc
  limit p_limit;
$$;

revoke all on function public.is_karliligi(integer, boolean) from public;
grant execute on function public.is_karliligi(integer, boolean) to authenticated;


-- ============================================================================
-- 3) MÜŞTERİ BAZINDA KÂRLILIK
-- ============================================================================
create or replace function public.musteri_karliligi()
returns table (
  musteri          text,
  is_sayisi        bigint,
  ciro             numeric,
  malzeme_maliyeti numeric,
  iscilik_maliyeti numeric,
  toplam_maliyet   numeric,
  kar              numeric,
  marj_yuzde       numeric,
  ort_is_bedeli    numeric,
  zararli_is       bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    k.musteri,
    count(*),
    sum(k.fiyat),
    sum(k.malzeme_maliyeti),
    sum(k.iscilik_maliyeti),
    sum(k.toplam_maliyet),
    sum(k.kar),
    case when sum(k.fiyat) > 0
         then round((sum(k.kar) / sum(k.fiyat) * 100)::numeric, 1)
         else 0 end,
    round(avg(k.fiyat), 0),
    count(*) filter (where k.kar < 0)
  from public.is_karliligi(100000, false) k
  group by k.musteri
  order by sum(k.kar) desc;
$$;

revoke all on function public.musteri_karliligi() from public;
grant execute on function public.musteri_karliligi() to authenticated;


-- ============================================================================
-- 4) KÂR ÖZETİ
-- ============================================================================
create or replace function public.kar_ozeti()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with k as (select * from public.is_karliligi(100000, false))
  select jsonb_build_object(
    'is_sayisi',      (select count(*) from k),
    'ciro',           round(coalesce((select sum(fiyat) from k), 0), 0),
    'malzeme',        round(coalesce((select sum(malzeme_maliyeti) from k), 0), 0),
    'iscilik',        round(coalesce((select sum(iscilik_maliyeti) from k), 0), 0),
    'toplam_maliyet', round(coalesce((select sum(toplam_maliyet) from k), 0), 0),
    'brut_kar',       round(coalesce((select sum(kar) from k), 0), 0),
    'marj_yuzde',     case when coalesce((select sum(fiyat) from k), 0) > 0
                           then round((coalesce((select sum(kar) from k), 0) /
                                       (select sum(fiyat) from k) * 100)::numeric, 1)
                           else 0 end,
    'zararli_is',     (select count(*) from k where durum = 'ZARAR'),
    'dusuk_marj_is',  (select count(*) from k where durum = 'DÜŞÜK MARJ'),
    'karli_is',       (select count(*) from k where durum = 'KÂRLI'),
    'zarar_tutari',   round(coalesce((select sum(kar) from k where kar < 0), 0), 0),
    'en_karli_musteri',  (select musteri from public.musteri_karliligi() limit 1),
    'en_zararli_musteri',(select musteri from public.musteri_karliligi() order by kar asc limit 1),
    'saatlik_maliyet',   public.saatlik_iscilik_maliyeti(null)
  );
$$;

revoke all on function public.kar_ozeti() from public;
grant execute on function public.kar_ozeti() to authenticated;


-- ============================================================================
-- 5) KONTROL
-- ============================================================================
select
  (public.kar_ozeti() ->> 'is_sayisi')          as is_sayisi,
  (public.kar_ozeti() ->> 'ciro')               as ciro,
  (public.kar_ozeti() ->> 'malzeme')            as malzeme_maliyeti,
  (public.kar_ozeti() ->> 'brut_kar')           as brut_kar,
  (public.kar_ozeti() ->> 'marj_yuzde')         as marj_yuzde,
  (public.kar_ozeti() ->> 'zararli_is')         as zararli_is,
  (public.kar_ozeti() ->> 'saatlik_maliyet')    as saatlik_maliyet;

-- En kârlı 10 müşteri
select musteri, is_sayisi, ciro, toplam_maliyet, kar, marj_yuzde
from public.musteri_karliligi()
limit 10;

-- Zarar eden son 10 iş
select tarih, musteri, left(coalesce(aciklama, '-'), 40) as is_aciklamasi,
       fiyat, malzeme_maliyeti, kar, marj_yuzde
from public.is_karliligi(10, true);
