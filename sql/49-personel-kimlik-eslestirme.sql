-- ============================================================================
--  🔗 PERSONEL KİMLİK EŞLEŞTİRME — KÖK ÇÖZÜM (Güncelleme #29) — KRİTİK
-- ----------------------------------------------------------------------------
--  SORUNLARIN HEPSİ TEK SEBEPTEN:
--    Personel mesai giriyor → personel alanına "profiles.full_name" yazılıyor
--    (örn: "Gökhan Gök"). AMA admin sayfası resmi listeyle arıyor
--    ("GÖKHAN GÖK") → EŞLEŞMİYOR → 0 saat görünüyor.
--
--    Sonuç:
--      • Personel ekranı: mesailer görünüyor ✅ (kendi adıyla arıyor)
--      • Admin puantaj: 0 saat görünüyor ❌ (resmi adla arıyor)
--      • KAZANCIM kartı: "puantaj girilmemiş" diyor ❌
--      • NET TOPLAM: yanlış çıkıyor ❌
--
--  ÇÖZÜM:
--    personel_eslestir(ad) → her türlü yazımı RESMİ isme çevirir
--    benim_adim() → artık RESMİ ismi döndürür ("Gökhan Gök" → "GÖKHAN GÖK")
--    Böylece kim nereden bakarsa baksın AYNI ismi görür.
--
--  ⚠️ Veri değiştirmez (sadece fonksiyon).
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) İSİM EŞLEŞTİRİCİ — her yazımı resmi isme çevirir
-- ============================================================================
create or replace function public.personel_eslestir(p_ad text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with temiz as (select public.parca_adi_normal(p_ad) as n)
  select pm.personel
  from public.personel_maas pm, temiz t
  where t.n <> ''
    and (
      public.parca_adi_normal(pm.personel) = t.n
      or public.parca_adi_normal(pm.personel) like '%' || t.n || '%'
      or t.n like '%' || public.parca_adi_normal(pm.personel) || '%'
      -- İsim + soyisim parçaları eşleşiyorsa (örn "Gökhan GÖK" ↔ "GÖKHAN GÖK")
      or (
        select bool_and(t.n like '%' || parca || '%')
        from unnest(string_to_array(public.parca_adi_normal(pm.personel), ' ')) as parca
        where length(parca) >= 3
      )
    )
  order by length(pm.personel) desc
  limit 1;
$$;

revoke all on function public.personel_eslestir(text) from public;
grant execute on function public.personel_eslestir(text) to authenticated;


-- ============================================================================
-- 2) BENİM ADIM — artık RESMİ ismi döndürür
-- ============================================================================
create or replace function public.benim_adim()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- Önce giriş yapanın adını RESMİ listeye çevirmeyi dene
    public.personel_eslestir((select p.full_name from public.profiles p where p.id = auth.uid())),
    -- Eşleşme bulunamazsa ham adı döndür
    (select p.full_name from public.profiles p where p.id = auth.uid()),
    ''
  );
$$;

revoke all on function public.benim_adim() from public;
grant execute on function public.benim_adim() to authenticated;


-- ============================================================================
-- 3) ESKİ KAYITLARI RESMİ İSME ÇEVİR (mesai kayıtları)
--    Böylece geçmişte yanlış isimle girilen mesailer de görünür olur.
-- ============================================================================
update public.puantaj_gunluk g
   set personel = public.personel_eslestir(g.personel)
 where public.personel_eslestir(g.personel) is not null
   and public.personel_eslestir(g.personel) <> g.personel;


-- Eski talepleri de resmi isme çevir
update public.personel_talepler t
   set personel = public.personel_eslestir(t.personel)
 where public.personel_eslestir(t.personel) is not null
   and public.personel_eslestir(t.personel) <> t.personel;


-- ============================================================================
-- 4) KONTROL: kim nasıl eşleşiyor?
-- ============================================================================
select
  p.full_name                             as giris_yapan_ham_ad,
  public.personel_eslestir(p.full_name)   as resmi_eslesme,
  case when public.personel_eslestir(p.full_name) is not null
       then '✅ EŞLEŞTİ' else '⚠️ EŞLEŞMEDİ' end as durum
from public.profiles p
where coalesce(trim(p.full_name), '') <> ''
order by p.full_name;


-- ============================================================================
-- 5) KONTROL: mesai kayıtları kimin altında?
-- ============================================================================
select
  g.personel,
  count(*)                                  as gun_sayisi,
  coalesce(sum(g.normal_saat), 0)           as normal_saat,
  coalesce(sum(g.mesai50_saat), 0)          as cmt50,
  coalesce(sum(g.mesai100_saat), 0)         as paz100,
  min(g.tarih)                              as ilk,
  max(g.tarih)                              as son
from public.puantaj_gunluk g
group by g.personel
order by count(*) desc;
