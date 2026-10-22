-- ============================================================================
--  🔧 PERSONEL RAPOR EŞLEŞTİRME DÜZELTMESİ (Güncelleme #107)
-- ----------------------------------------------------------------------------
--  SORUN: Admin 10+ servis formu görüyor, personel ekranı 7 gösteriyor
--
--  SEBEP: İsim eşleştirmesi çok katı
--    "GÖKHAN GÖK" = "GÖKHAN GÖK"        → eşleşir
--    "GÖKHAN GÖK - KERİM AKDOĞAN"       → eşleşmez (eski sürüm)
--    Farklı yazımlar, fazla boşluk      → eşleşmez
--
--  ÇÖZÜM:
--    1) AD SOYAD'ın HER KELİMESİ ile eşleştir (GÖKHAN / GÖK)
--    2) TÜM personel alanlarını dene (personel, personel_adi, teknisyen, imza_atan)
--    3) Limit 50 → 200
--    4) Admin ise TÜM raporları gör
--
--  KULLANIM: 134'ten SONRA çalıştır. Hata vermez.
-- ============================================================================

drop function if exists public.benim_bakim_formlarim(integer);

create function public.benim_bakim_formlarim(p_limit integer default 200)
returns table (
  id uuid, kaynak text, seri_no text, form_tipi text, musteri text,
  kontrol_tarihi text, onay_sayisi integer, ret_sayisi integer,
  musteri_puani integer, is_durumu text, olusturma text, kim text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ben text;
  v_nm text;
  v_ad text;      -- ilk kelime (GÖKHAN)
  v_soyad text;   -- son kelime (GÖK)
  v_admin boolean := false;
begin
  begin
    v_ben := public.benim_adim();
    v_nm := public.parca_adi_normal(coalesce(v_ben,''));
    -- İlk ve son kelime
    v_ad := public.parca_adi_normal(split_part(coalesce(v_ben,''), ' ', 1));
    v_soyad := public.parca_adi_normal(
      coalesce(nullif(substring(coalesce(v_ben,'') from '[^ ]+$'),''), v_ben));
  exception when others then
    v_ben := null; v_nm := ''; v_ad := ''; v_soyad := '';
  end;

  -- Admin mi?
  begin
    v_admin := coalesce(public.buvisan_admin_mi(), false);
  exception when others then v_admin := false; end;

  -- Hiç isim yoksa veya admin ise HER ŞEYİ göster
  if v_ben is null or v_nm = '' then
    v_admin := true;
  end if;

  return query
  with bakim as (
    select
      f.id, 'bakim'::text as kaynak,
      f.seri_no, f.form_tipi,
      coalesce(f.musteri,'—') as musteri,
      to_char(f.kontrol_tarihi,'DD.MM.YYYY') as kontrol_tarihi,
      coalesce(f.onay_sayisi,0) as onay_sayisi,
      coalesce(f.ret_sayisi,0) as ret_sayisi,
      f.musteri_puani,
      coalesce(f.is_durumu,'bitti') as is_durumu,
      to_char(f.created_at,'DD.MM.YYYY HH24:MI') as olusturma,
      coalesce(f.personel,'—') as kim,
      f.created_at as sirala
    from public.bakim_formlari f
    where v_admin
       or public.parca_adi_normal(coalesce(f.personel,'')) like '%' || v_ad || '%'
       or public.parca_adi_normal(coalesce(f.personel,'')) like '%' || v_soyad || '%'
       or public.parca_adi_normal(coalesce(f.personel,'')) like '%' || v_nm || '%'
  ),
  servis as (
    select
      sr.id, 'servis'::text as kaynak,
      'SR-' || to_char(sr.created_at,'YYMMDD') as seri_no,
      'servis'::text as form_tipi,
      coalesce(nullif(trim(coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')),''), '—') as musteri,
      to_char(sr.created_at,'DD.MM.YYYY') as kontrol_tarihi,
      1 as onay_sayisi, 0 as ret_sayisi,
      nullif(trim(coalesce(to_jsonb(sr)->>'musteri_puani','')),'')::integer as musteri_puani,
      'bitti'::text as is_durumu,
      to_char(sr.created_at,'DD.MM.YYYY HH24:MI') as olusturma,
      coalesce(public.jalan(to_jsonb(sr),'personel_adi','personel','teknisyen','imza_atan'),'—') as kim,
      sr.created_at as sirala
    from public.service_reports sr
    where v_admin
       or public.parca_adi_normal(coalesce(public.jalan(to_jsonb(sr),
            'personel_adi','personel','teknisyen','imza_atan'),'')) like '%' || v_ad || '%'
       or public.parca_adi_normal(coalesce(public.jalan(to_jsonb(sr),
            'personel_adi','personel','teknisyen','imza_atan'),'')) like '%' || v_soyad || '%'
       or public.parca_adi_normal(coalesce(public.jalan(to_jsonb(sr),
            'personel_adi','personel','teknisyen','imza_atan'),'')) like '%' || v_nm || '%'
  ),
  birlesik as (
    select * from bakim
    union all
    select * from servis
  )
  select b.id, b.kaynak, b.seri_no, b.form_tipi, b.musteri,
         b.kontrol_tarihi, b.onay_sayisi, b.ret_sayisi, b.musteri_puani,
         b.is_durumu, b.olusturma, b.kim
  from birlesik b
  order by b.sirala desc
  limit greatest(1, least(coalesce(p_limit,200), 500));
end $$;

revoke all on function public.benim_bakim_formlarim(integer) from public;
grant execute on function public.benim_bakim_formlarim(integer) to authenticated;


-- ============================================================================
-- 🧪 TEST — Kim kaç rapor görüyor?
-- ============================================================================
select
  public.benim_adim() as giris_yapan,
  public.buvisan_admin_mi() as admin_mi,
  count(*) filter (where kaynak='servis') as servis,
  count(*) filter (where kaynak='bakim') as bakim,
  count(*) as toplam
from public.benim_bakim_formlarim(200);

-- Gökhan'ın kaç raporu var (tüm veritabanında)?
select
  'DB TOPLAM' as kaynak_tipi,
  count(*) as adet
from public.service_reports
where public.parca_adi_normal(coalesce(public.jalan(to_jsonb(service_reports),
      'personel_adi','personel','teknisyen','imza_atan'),'')) like '%gokhan%'
union all
select 'EKRANDA GORUNEN', count(*)
from public.benim_bakim_formlarim(200)
where kaynak = 'servis'
  and public.parca_adi_normal(coalesce(kim,'')) like '%gokhan%';
