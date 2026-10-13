-- ============================================================================
--  📚 ARIZA KÜTÜPHANESİ + AI TEŞHİS (Büyük Güncelleme #9)
-- ----------------------------------------------------------------------------
--  FİKİR:
--    624 servis kaydındaki ÇÖZÜMLER şu an dağınık metinlerde duruyor.
--    Teknisyen "kedi yürütme switch takılı kalmış" yazınca sistem o arızayı
--    daha önce YAŞAMIŞ işleri bulup çıkarıyor:
--      • Nasıl çözülmüş (açıklama)
--      • Hangi parçalar kullanılmış
--      • Kaç para tutmuş, kaç saat sürmüş
--      • Hangi teknisyen çözmüş
--
--  NEDEN ÇIĞIR AÇICI:
--    Şirket bilgisi İNSANLARIN KAFASINDAN çıkıp ŞİRKETİN MALI olur.
--    Yeni teknisyen aylarca değil, günler içinde verimli olur.
--    Personel ayrılsa bilgi gitmez.
--
--  ⚠️ Veri değiştirmez.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) ARIZA ÇÖZÜMÜ ARA (asıl özellik)
--    Şikayet metnini yaz → benzer geçmiş işleri bul
-- ============================================================================
create or replace function public.ariza_cozum_ara(p_sikayet text, p_limit integer default 12)
returns table (
  tarih        date,
  musteri      text,
  aciklama     text,
  parcalar     text,
  tutar        numeric,
  teknisyen    text,
  benzerlik    integer
)
language sql
stable
security definer
set search_path = public
as $$
  with kelimeler as (
    select distinct trim(k) as k
    from unnest(string_to_array(public.parca_adi_normal(p_sikayet), ' ')) as w(k)
    where length(trim(k)) >= 4
  ),
  puanli as (
    select
      cs.id,
      cs.service_date,
      coalesce(cs.customer_text, '-') as musteri,
      cs.description,
      coalesce(cs.price, 0)::numeric as tutar,
      cs.technician,
      (select count(*) from kelimeler kl
        where public.parca_adi_normal(cs.description) like '%' || kl.k || '%')::int as puan,
      (select string_agg(distinct (p.value ->> 'ad'), ', ')
         from jsonb_array_elements(coalesce(cs.materials, '[]'::jsonb)) p
        where coalesce(trim(p.value ->> 'ad'), '') <> ''
          and not public.iscilik_kalemi_mi(p.value ->> 'ad')) as parcalar
    from public.completed_services cs
    where coalesce(trim(cs.description), '') <> ''
  )
  select
    p.service_date,
    p.musteri,
    p.description,
    p.parcalar,
    p.tutar,
    p.technician,
    p.puan
  from puanli p
  where p.puan > 0
  order by p.puan desc, p.service_date desc
  limit p_limit;
$$;

revoke all on function public.ariza_cozum_ara(text, integer) from public;
grant execute on function public.ariza_cozum_ara(text, integer) to authenticated;


-- ============================================================================
-- 2) ARIZA KATEGORİLERİ (hangi arıza ne sıklıkta, ne kadar tutuyor)
-- ============================================================================
create or replace function public.ariza_kategorileri()
returns table (
  kategori        text,
  adet            bigint,
  musteri_sayisi  bigint,
  ort_tutar       numeric,
  toplam_tutar    numeric,
  ilk_kayit       date,
  son_kayit       date,
  ornek_cozum     text
)
language sql
stable
security definer
set search_path = public
as $$
  with kategoriler as (
    select unnest(array[
      'switch','diyot','halat','role','kontaktor','kablo','sensor','fren','motor',
      'siren','kumanda','teker','rulman','limit','trafo','sigorta','buton',
      'reduktor','kayis','kaplin','mil','kanca','inverter','surucu','enkoder',
      'valf','pompa','kece','bobin','klemens','pano','cerceve','fotosel'
    ]) as kat
  )
  select
    k.kat,
    count(cs.id),
    count(distinct public.parca_adi_normal(cs.customer_text)),
    round(coalesce(avg(cs.price), 0), 0),
    round(coalesce(sum(cs.price), 0), 0),
    min(cs.service_date),
    max(cs.service_date),
    (select cs2.description from public.completed_services cs2
      where public.parca_adi_normal(cs2.description) like '%' || public.parca_adi_normal(k.kat) || '%'
        and coalesce(trim(cs2.description), '') <> ''
      order by cs2.service_date desc limit 1)
  from kategoriler k
  join public.completed_services cs
    on public.parca_adi_normal(cs.description) like '%' || public.parca_adi_normal(k.kat) || '%'
  group by k.kat
  order by count(cs.id) desc;
$$;

revoke all on function public.ariza_kategorileri() from public;
grant execute on function public.ariza_kategorileri() to authenticated;


-- ============================================================================
-- 3) FİRMA İÇİN ÖNERİLEN PARÇA SEPETİ
--    "Bu firmaya gidiyorsan yanına şunları al" (geçmiş arızalardan)
-- ============================================================================
create or replace function public.firma_onerilen_parcalar(p_musteri text, p_limit integer default 12)
returns table (
  parca      text,
  kullanim   bigint,
  ort_fiyat  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (p.value ->> 'ad') as parca,
    count(*),
    round(coalesce(avg(nullif(p.value ->> 'birim_fiyat', '')::numeric), 0), 0)
  from public.completed_services cs
  cross join lateral jsonb_array_elements(coalesce(cs.materials, '[]'::jsonb)) p
  where public.parca_adi_normal(cs.customer_text) = public.parca_adi_normal(p_musteri)
    and coalesce(trim(p.value ->> 'ad'), '') <> ''
    and not public.iscilik_kalemi_mi(p.value ->> 'ad')
  group by 1
  order by count(*) desc
  limit p_limit;
$$;

revoke all on function public.firma_onerilen_parcalar(text, integer) from public;
grant execute on function public.firma_onerilen_parcalar(text, integer) to authenticated;


-- ============================================================================
-- 4) KÜTÜPHANE ÖZETİ
-- ============================================================================
create or replace function public.kutuphane_ozeti()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with k as (select * from public.ariza_kategorileri())
  select jsonb_build_object(
    'kayit_sayisi',       (select count(*) from public.completed_services where coalesce(trim(description),'') <> ''),
    'kategori_sayisi',    (select count(*) from k),
    'en_sik_ariza',       (select kategori from k limit 1),
    'en_sik_adet',        (select adet from k limit 1),
    'en_pahali_ariza',    (select kategori from k order by ort_tutar desc limit 1),
    'en_pahali_tutar',    (select ort_tutar from k order by ort_tutar desc limit 1),
    'toplam_cozum_degeri', round(coalesce((select sum(toplam_tutar) from k), 0), 0)
  );
$$;

revoke all on function public.kutuphane_ozeti() from public;
grant execute on function public.kutuphane_ozeti() to authenticated;


-- ============================================================================
-- 5) KONTROL
-- ============================================================================
select
  (public.kutuphane_ozeti() ->> 'kayit_sayisi')     as kayit_sayisi,
  (public.kutuphane_ozeti() ->> 'kategori_sayisi')  as kategori_sayisi,
  (public.kutuphane_ozeti() ->> 'en_sik_ariza')     as en_sik_ariza,
  (public.kutuphane_ozeti() ->> 'en_pahali_ariza')  as en_pahali_ariza;

-- Arıza kategorileri (en sık 12)
select kategori, adet, musteri_sayisi, ort_tutar, son_kayit
from public.ariza_kategorileri()
limit 12;

-- ÖRNEK ARAMA: "switch takılı kalmış"
select tarih, musteri, left(aciklama, 60) as cozum, parcalar, tutar, benzerlik
from public.ariza_cozum_ara('switch takılı kalmış arıza', 5);
