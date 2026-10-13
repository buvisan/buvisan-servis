-- ============================================================================
--  💸 CARİ HESAP & TAHSİLAT MOTORU (Büyük Güncelleme #5)
-- ----------------------------------------------------------------------------
--  SORUN:
--    8.560.236 ₺ iş yapılmış (624 servis) ama NE KADARI TAHSİL EDİLDİ,
--    kim ne kadar borçlu — sistemde TAKİP EDİLMİYOR.
--    Mimli firmalar listesinde elle "22.200 TL alınacak" notu tutuluyor.
--    Türkiye'de KOBİ'lerin 1 numaralı ölüm sebebi: tahsil edilemeyen alacak.
--
--  ÇÖZÜM:
--    Tek bir yeni tablo: cari_tahsilatlar (gelen ödemeler)
--    Borç tarafı ZATEN VAR: completed_services (yapılan işler + tutarları)
--
--    BAKİYE = Yapılan İşlerin Toplamı  −  Tahsil Edilen
--
--  ⚠️ Sadece YENİ tablo kurar. Mevcut hiçbir veriye dokunmaz.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) TAHSİLAT TABLOSU (gelen ödemeler)
-- ============================================================================
create table if not exists public.cari_tahsilatlar (
  id           uuid primary key default gen_random_uuid(),
  musteri      text not null,
  tarih        date not null default current_date,
  tutar        numeric not null check (tutar > 0),
  odeme_tipi   text default 'Havale',        -- Havale / Nakit / Çek / Kredi Kartı / Mahsup
  fatura_no    text,
  aciklama     text,
  olusturan    text,
  created_at   timestamptz default now()
);

create index if not exists idx_cari_tahsilat_musteri on public.cari_tahsilatlar (musteri);
create index if not exists idx_cari_tahsilat_tarih   on public.cari_tahsilatlar (tarih desc);

comment on table public.cari_tahsilatlar is 'Müşterilerden gelen ödemeler (cari hesap tahsilatları)';


-- ============================================================================
-- 2) MÜŞTERİ CARİ HESABI (bakiye hesaplama)
-- ============================================================================
create or replace function public.cari_hesap(p_musteri text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with isler as (
    select
      coalesce(sum(price), 0)::numeric as toplam,
      count(*)::int                    as is_sayisi,
      max(service_date)                as son_is
    from public.completed_services
    where public.parca_adi_normal(customer_text) = public.parca_adi_normal(p_musteri)
  ),
  tahsil as (
    select
      coalesce(sum(tutar), 0)::numeric as toplam,
      count(*)::int                    as adet,
      max(tarih)                       as son_odeme
    from public.cari_tahsilatlar
    where public.parca_adi_normal(musteri) = public.parca_adi_normal(p_musteri)
  )
  select jsonb_build_object(
    'musteri',        p_musteri,
    'yapilan_is',     (select toplam from isler),
    'is_sayisi',      (select is_sayisi from isler),
    'son_is',         (select son_is from isler),
    'tahsil_edilen',  (select toplam from tahsil),
    'odeme_sayisi',   (select adet from tahsil),
    'son_odeme',      (select son_odeme from tahsil),
    'bakiye',         ((select toplam from isler) - (select toplam from tahsil)),
    'durum',          case
                        when ((select toplam from isler) - (select toplam from tahsil)) <= 0 then 'BORCU YOK'
                        when ((select toplam from isler) - (select toplam from tahsil)) < 5000 then 'AZ BORÇ'
                        else 'BORÇLU'
                      end
  );
$$;

revoke all on function public.cari_hesap(text) from public;
grant execute on function public.cari_hesap(text) to authenticated;


-- ============================================================================
-- 3) TÜM MÜŞTERİLERİN CARİ LİSTESİ (borç sırasına göre)
-- ============================================================================
create or replace function public.cari_listesi()
returns table (
  musteri        text,
  yapilan_is     numeric,
  tahsil_edilen  numeric,
  bakiye         numeric,
  is_sayisi      bigint,
  son_is         date,
  son_odeme      date,
  tahsilat_orani numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with isler as (
    select
      public.parca_adi_normal(customer_text) as norm,
      min(trim(customer_text))               as musteri,
      sum(coalesce(price, 0))                as toplam,
      count(*)                               as adet,
      max(service_date)                      as son_is
    from public.completed_services
    where coalesce(trim(customer_text), '') <> ''
    group by 1
  ),
  tahsil as (
    select
      public.parca_adi_normal(musteri) as norm,
      sum(tutar)                       as toplam,
      max(tarih)                       as son_odeme
    from public.cari_tahsilatlar
    group by 1
  )
  select
    i.musteri,
    round(i.toplam, 0),
    round(coalesce(t.toplam, 0), 0),
    round(i.toplam - coalesce(t.toplam, 0), 0),
    i.adet,
    i.son_is,
    t.son_odeme,
    case when i.toplam > 0
         then round((coalesce(t.toplam, 0) / i.toplam * 100)::numeric, 1)
         else 0 end
  from isler i
  left join tahsil t on t.norm = i.norm
  order by (i.toplam - coalesce(t.toplam, 0)) desc;
$$;

revoke all on function public.cari_listesi() from public;
grant execute on function public.cari_listesi() to authenticated;


-- ============================================================================
-- 4) CARİ ÖZET (yönetim tablosu)
-- ============================================================================
create or replace function public.cari_ozet()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with l as (select * from public.cari_listesi())
  select jsonb_build_object(
    'toplam_is',        round(coalesce((select sum(yapilan_is) from l), 0), 0),
    'toplam_tahsilat',  round(coalesce((select sum(tahsil_edilen) from l), 0), 0),
    'toplam_bakiye',    round(coalesce((select sum(bakiye) from l), 0), 0),
    'musteri_sayisi',   (select count(*) from l),
    'borclu_sayisi',    (select count(*) from l where bakiye > 0),
    'tahsilat_orani',   case when coalesce((select sum(yapilan_is) from l), 0) > 0
                             then round(((select sum(tahsil_edilen) from l) /
                                         (select sum(yapilan_is) from l) * 100)::numeric, 1)
                             else 0 end,
    'en_buyuk_borclu',  (select musteri from l where bakiye > 0 order by bakiye desc limit 1),
    'en_buyuk_borc',    round(coalesce((select max(bakiye) from l), 0), 0)
  );
$$;

revoke all on function public.cari_ozet() from public;
grant execute on function public.cari_ozet() to authenticated;


-- ============================================================================
-- 5) TAHSİLAT EKLE (güvenli yazma)
-- ============================================================================
create or replace function public.tahsilat_ekle(
  p_musteri    text,
  p_tutar      numeric,
  p_tarih      date default current_date,
  p_tip        text default 'Havale',
  p_fatura_no  text default null,
  p_aciklama   text default null,
  p_kullanici  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_musteri), '') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Müşteri adı gerekli.');
  end if;
  if coalesce(p_tutar, 0) <= 0 then
    return jsonb_build_object('ok', false, 'mesaj', 'Tutar 0 dan büyük olmalı.');
  end if;

  insert into public.cari_tahsilatlar (musteri, tarih, tutar, odeme_tipi, fatura_no, aciklama, olusturan)
  values (trim(p_musteri), coalesce(p_tarih, current_date), p_tutar,
          coalesce(p_tip, 'Havale'), p_fatura_no, p_aciklama, p_kullanici)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id,
    'mesaj', 'Tahsilat kaydedildi: ' || to_char(p_tutar, 'FM999G999G999') || ' ₺');
end;
$$;

revoke all on function public.tahsilat_ekle(text, numeric, date, text, text, text, text) from public;
grant execute on function public.tahsilat_ekle(text, numeric, date, text, text, text, text) to authenticated;


-- ============================================================================
-- 6) GÜVENLİK: sadece yönetici
-- ============================================================================
alter table public.cari_tahsilatlar enable row level security;

drop policy if exists cari_tahsilat_yonetici on public.cari_tahsilatlar;
create policy cari_tahsilat_yonetici on public.cari_tahsilatlar
  for all to authenticated
  using (public.buvisan_admin_mi())
  with check (public.buvisan_admin_mi());

revoke all on public.cari_tahsilatlar from anon;


-- ============================================================================
-- 7) KONTROL: NAKİT DURUMU
-- ============================================================================
select
  (public.cari_ozet() ->> 'toplam_is')       as toplam_is,
  (public.cari_ozet() ->> 'toplam_tahsilat') as tahsil_edilen,
  (public.cari_ozet() ->> 'toplam_bakiye')   as kalan_alacak,
  (public.cari_ozet() ->> 'borclu_sayisi')   as borclu_musteri,
  (public.cari_ozet() ->> 'en_buyuk_borclu') as en_buyuk_borclu,
  (public.cari_ozet() ->> 'en_buyuk_borc')   as en_buyuk_borc;

-- En çok borcu olan 15 müşteri
select musteri, yapilan_is, tahsil_edilen, bakiye, tahsilat_orani
from public.cari_listesi()
where bakiye > 0
limit 15;
