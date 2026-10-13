-- ============================================================================
--  💰 KÂR MOTORU v2 + 📅 ABONELİK PAKETLERİ
-- ----------------------------------------------------------------------------
--  SENİN VERDİĞİN BİLGİLER:
--    • "ZARAR" çıkan işlerin çoğu GARANTİLİ işler (kasıtlı), birkaçı gerçek hata
--    • Abonelik: 3 ayda 1 veya 6 ayda 1 · makine başı 8.500 ₺ + KDV
--    • Hem VİNÇ hem ASANSÖR bakımı yapıyorsunuz
--    • Her marka vince servis yapıyorsunuz
--
--  BU SCRIPT:
--    1) Kâr motoru artık GARANTİ ve YARIM KALAN işleri ayırır
--       → "ZARAR" listesinde sadece GERÇEK zararlar kalır
--    2) Abonelik paketleri tablosu + fiyat hesaplama motoru
--
--  ⚠️ Veri değiştirmez (yeni tablo kurar: bakim_paketleri).
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) ABONELİK PAKETLERİ TABLOSU
-- ============================================================================
create table if not exists public.bakim_paketleri (
  id            uuid primary key default gen_random_uuid(),
  ad            text not null,
  periyot_ay    integer not null,
  makine_fiyat  numeric not null,
  kdv_orani     numeric default 20,
  makine_tipi   text default 'Tümü',      -- Vinç / Asansör / Tümü
  aciklama      text,
  aktif         boolean default true,
  created_at    timestamptz default now()
);

comment on table public.bakim_paketleri is 'Periyodik bakım abonelik paketleri (vinç + asansör)';

-- Varsayılan paketler (sadece tablo boşsa eklenir)
insert into public.bakim_paketleri (ad, periyot_ay, makine_fiyat, kdv_orani, makine_tipi, aciklama)
select * from (values
  ('3 Aylık Bakım Anlaşması', 3, 8500::numeric, 20::numeric, 'Tümü',
   'Yılda 4 periyodik bakım · acil servis önceliği · bakım raporu'),
  ('6 Aylık Bakım Anlaşması', 6, 8500::numeric, 20::numeric, 'Tümü',
   'Yılda 2 periyodik bakım · acil servis önceliği · bakım raporu')
) v
where not exists (select 1 from public.bakim_paketleri);


-- ============================================================================
-- 2) ABONELİK TEKLİFİ HESAPLA
-- ============================================================================
create or replace function public.abonelik_teklifi(
  p_makine_sayisi   integer,
  p_periyot_ay      integer default 6,
  p_iskonto_yuzde   numeric default 0,
  p_makine_fiyat    numeric default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_paket     record;
  v_birim     numeric;
  v_yillik_adet integer;
  v_brut      numeric;
  v_iskonto   numeric;
  v_net       numeric;
  v_kdv       numeric;
  v_toplam    numeric;
begin
  if coalesce(p_makine_sayisi, 0) <= 0 then
    return jsonb_build_object('ok', false, 'mesaj', 'Makine sayısı 0 dan büyük olmalı.');
  end if;

  select * into v_paket from public.bakim_paketleri
   where periyot_ay = p_periyot_ay and aktif
   order by created_at limit 1;

  if v_paket is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Bu periyotta aktif paket yok.');
  end if;

  v_birim       := coalesce(p_makine_fiyat, v_paket.makine_fiyat);
  v_yillik_adet := greatest(round(12.0 / v_paket.periyot_ay), 1);
  v_brut        := v_birim * p_makine_sayisi * v_yillik_adet;
  v_iskonto     := round(v_brut * (coalesce(p_iskonto_yuzde, 0) / 100.0), 2);
  v_net         := v_brut - v_iskonto;
  v_kdv         := round(v_net * (v_paket.kdv_orani / 100.0), 2);
  v_toplam      := v_net + v_kdv;

  return jsonb_build_object(
    'ok',                true,
    'paket',             v_paket.ad,
    'periyot_ay',        v_paket.periyot_ay,
    'makine_sayisi',     p_makine_sayisi,
    'makine_birim_fiyat', v_birim,
    'yillik_bakim_adedi', v_yillik_adet,
    'yillik_bakim_toplam', (p_makine_sayisi * v_yillik_adet),
    'brut_tutar',        v_brut,
    'iskonto_yuzde',     coalesce(p_iskonto_yuzde, 0),
    'iskonto_tutar',     v_iskonto,
    'net_tutar',         v_net,
    'kdv_orani',         v_paket.kdv_orani,
    'kdv_tutar',         v_kdv,
    'genel_toplam',      v_toplam,
    'aylik_esdeger',     round(v_toplam / 12.0, 0),
    'makine_basi_yillik', round(v_net / p_makine_sayisi, 0),
    'ozet', 'Yılda ' || v_yillik_adet || ' bakım × ' || p_makine_sayisi || ' makine · ' ||
            to_char(v_toplam, 'FM999G999G999') || ' ₺ (KDV dahil)'
  );
end;
$$;

revoke all on function public.abonelik_teklifi(integer, integer, numeric, numeric) from public;
grant execute on function public.abonelik_teklifi(integer, integer, numeric, numeric) to authenticated;


-- ============================================================================
-- 3) MÜŞTERİ BAZINDA ABONELİK FIRSATI
-- ============================================================================
create or replace function public.abonelik_firsatlari()
returns table (
  musteri         text,
  kayitli_makine  bigint,
  son_servis      date,
  gecen_ay        integer,
  yillik_6ay      numeric,
  yillik_3ay      numeric,
  oneri           text
)
language sql
stable
security definer
set search_path = public
as $$
  with makine as (
    select
      public.parca_adi_normal(customer_name) as norm,
      min(trim(customer_name))               as musteri,
      count(*)                               as adet
    from public.cranes
    where coalesce(trim(customer_name), '') <> ''
    group by 1
  ),
  servis as (
    select
      public.parca_adi_normal(customer_text) as norm,
      max(service_date)                      as son_servis
    from public.completed_services
    where coalesce(trim(customer_text), '') <> ''
    group by 1
  ),
  sozlesmeli as (
    select distinct public.parca_adi_normal(company_name) as norm
    from public.maintenance_contracts
    where coalesce(trim(company_name), '') <> ''
  )
  select
    m.musteri,
    m.adet,
    s.son_servis,
    case when s.son_servis is null then null
         else (extract(year from age(current_date, s.son_servis)) * 12
               + extract(month from age(current_date, s.son_servis)))::int end,
    (public.abonelik_teklifi(m.adet::int, 6, 0) ->> 'genel_toplam')::numeric,
    (public.abonelik_teklifi(m.adet::int, 3, 0) ->> 'genel_toplam')::numeric,
    case
      when s.son_servis is null then 'Hiç servis almamış — ilk temas'
      when (extract(year from age(current_date, s.son_servis)) * 12
            + extract(month from age(current_date, s.son_servis))) >= 8 then 'ACİL: 8+ aydır bakımsız'
      when (extract(year from age(current_date, s.son_servis)) * 12
            + extract(month from age(current_date, s.son_servis))) >= 5 then 'UYGUN: bakım gecikmiş'
      else 'Yeni bakım görmüş'
    end
  from makine m
  left join servis s      on s.norm = m.norm
  left join sozlesmeli so on so.norm = m.norm
  where so.norm is null
  order by m.adet desc, s.son_servis asc nulls first;
$$;

revoke all on function public.abonelik_firsatlari() from public;
grant execute on function public.abonelik_firsatlari() to authenticated;


-- ============================================================================
-- 4) KÂR MOTORU v2 — GARANTİ ve YARIM KALAN işleri ayır
-- ============================================================================
drop function if exists public.is_karliligi(integer, boolean);

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
      coalesce(cs.price, 0)::numeric as fiyat,
      coalesce(mz.maliyet, 0)::numeric as malzeme_maliyeti,
      round(coalesce(cs.work_hours, 0)::numeric
            * public.saatlik_iscilik_maliyeti(to_char(cs.service_date, 'YYYY-MM')), 0) as iscilik_maliyeti,
      public.parca_adi_normal(cs.service_type) as tur_norm
    from public.completed_services cs
    left join malzeme mz on mz.is_id = cs.id
    where coalesce(cs.currency, 'TL') = 'TL'
  ),
  sonuc as (
    select
      h.*,
      (h.fiyat - (h.malzeme_maliyeti + h.iscilik_maliyeti)) as kar,
      case when h.fiyat > 0
           then round(((h.fiyat - (h.malzeme_maliyeti + h.iscilik_maliyeti)) / h.fiyat * 100)::numeric, 1)
           else 0 end as marj
    from hesap h
  )
  select
    s.id, s.service_date, s.musteri, s.description, s.service_type, s.technician,
    s.fiyat, s.malzeme_maliyeti, s.iscilik_maliyeti,
    (s.malzeme_maliyeti + s.iscilik_maliyeti),
    s.kar, s.marj,
    case
      when s.tur_norm like '%garanti%'      then 'GARANTİ'
      when s.tur_norm like '%yarim kalan%'  then 'YARIM KALAN'
      when s.fiyat <= 0                     then 'BEDELSİZ'
      when s.kar < 0                        then 'ZARAR'
      when s.marj < 30                      then 'DÜŞÜK MARJ'
      else 'KÂRLI'
    end
  from sonuc s
  where (not p_sadece_zararli)
     or (s.kar < 0 and s.tur_norm not like '%garanti%' and s.tur_norm not like '%yarim kalan%')
  order by s.kar asc
  limit p_limit;
$$;

revoke all on function public.is_karliligi(integer, boolean) from public;
grant execute on function public.is_karliligi(integer, boolean) to authenticated;


-- ============================================================================
-- 5) KÂR ÖZETİ v2 — garanti ayrı gösterilir
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
    'is_sayisi',        (select count(*) from k),
    'ciro',             round(coalesce((select sum(fiyat) from k), 0), 0),
    'malzeme',          round(coalesce((select sum(malzeme_maliyeti) from k), 0), 0),
    'iscilik',          round(coalesce((select sum(iscilik_maliyeti) from k), 0), 0),
    'toplam_maliyet',   round(coalesce((select sum(toplam_maliyet) from k), 0), 0),
    'brut_kar',         round(coalesce((select sum(kar) from k), 0), 0),
    'marj_yuzde',       case when coalesce((select sum(fiyat) from k), 0) > 0
                             then round((coalesce((select sum(kar) from k), 0) /
                                         (select sum(fiyat) from k) * 100)::numeric, 1)
                             else 0 end,
    'karli_is',         (select count(*) from k where durum = 'KÂRLI'),
    'dusuk_marj_is',    (select count(*) from k where durum = 'DÜŞÜK MARJ'),
    'zararli_is',       (select count(*) from k where durum = 'ZARAR'),
    'zarar_tutari',     round(coalesce((select sum(kar) from k where durum = 'ZARAR'), 0), 0),
    'garanti_is',       (select count(*) from k where durum = 'GARANTİ'),
    'garanti_maliyet',  round(coalesce((select sum(toplam_maliyet) from k where durum = 'GARANTİ'), 0), 0),
    'yarim_kalan_is',   (select count(*) from k where durum = 'YARIM KALAN'),
    'bedelsiz_is',      (select count(*) from k where durum = 'BEDELSİZ'),
    'saatlik_maliyet',  public.saatlik_iscilik_maliyeti(null),
    'en_karli_musteri', (select musteri from k where durum = 'KÂRLI' group by musteri order by sum(kar) desc limit 1)
  );
$$;

revoke all on function public.kar_ozeti() from public;
grant execute on function public.kar_ozeti() to authenticated;


-- ============================================================================
-- 6) KONTROL
-- ============================================================================
select
  (public.kar_ozeti() ->> 'zararli_is')      as gercek_zararli_is,
  (public.kar_ozeti() ->> 'garanti_is')      as garanti_is,
  (public.kar_ozeti() ->> 'garanti_maliyet') as garanti_maliyet,
  (public.kar_ozeti() ->> 'yarim_kalan_is')  as yarim_kalan_is,
  (public.kar_ozeti() ->> 'brut_kar')        as brut_kar;

-- Abonelik fırsatları (en çok makineli 10 müşteri)
select musteri, kayitli_makine, gecen_ay, yillik_6ay, yillik_3ay, oneri
from public.abonelik_firsatlari()
limit 10;
