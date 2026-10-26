-- ============================================================================
--  🟢 FİNANS İŞARETİ GÖRÜNÜRLÜĞÜ (Güncelleme #111)
-- ----------------------------------------------------------------------------
--  SQL 138 formları işaretliyor ama LİSTELERDE GÖSTERİLMİYOR.
--  Bu script: listelere finans_kaydedildi alanını ekler.
--
--  KULLANIM: 138'den SONRA çalıştır. Hata vermez.
-- ============================================================================

-- 1) SAHA RAPORLARI (birleşik)
drop function if exists public.saha_raporlari_birlesik(integer);

create function public.saha_raporlari_birlesik(p_limit integer default 60)
returns table (
  kaynak text, id uuid, baslik text, musteri text, personel text,
  tarih text, tip text, ozet text, durum text, finans_kaydedildi boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with servis as (
    select
      'servis'::text as kaynak, sr.id,
      coalesce(nullif(trim(coalesce(public.jalan(to_jsonb(sr),'musteri_adi','customer_name','firma_adi'),'')),''), 'Servis Raporu') as baslik,
      coalesce(nullif(trim(coalesce(public.jalan(to_jsonb(sr),'musteri_adi','customer_name','firma_adi'),'')),''), '—') as musteri,
      coalesce(nullif(trim(coalesce(public.jalan(to_jsonb(sr),'personel','teknisyen','imza_atan','personel_adi'),'')),''), '—') as personel,
      to_char(sr.created_at,'DD.MM.YYYY HH24:MI') as tarih,
      coalesce(nullif(trim(coalesce(to_jsonb(sr)->>'service_type','')),''),
               nullif(trim(coalesce(to_jsonb(sr)->>'is_tipi','')),''), 'Servis') as tip,
      left(coalesce(public.jalan(to_jsonb(sr),'description','aciklama','konu'),'-'), 80) as ozet,
      'tamamlandi'::text as durum,
      coalesce((to_jsonb(sr)->>'finans_kaydedildi')::boolean, false) as finans_kaydedildi,
      sr.created_at as sirala
    from public.service_reports sr
  ),
  bakim as (
    select
      'bakim'::text as kaynak, f.id,
      f.seri_no || ' · ' || coalesce(f.form_tipi,'') as baslik,
      coalesce(f.musteri,'—') as musteri,
      coalesce(f.personel,'—') as personel,
      to_char(f.created_at,'DD.MM.YYYY HH24:MI') as tarih,
      case when f.form_tipi = 'asansor' then 'Asansör Bakım' else 'Vinç Bakım' end as tip,
      (coalesce(f.onay_sayisi,0) || ' onay · ' || coalesce(f.ret_sayisi,0) || ' ret') as ozet,
      coalesce(f.is_durumu,'bitti') as durum,
      coalesce(f.finans_kaydedildi, false) as finans_kaydedildi,
      f.created_at as sirala
    from public.bakim_formlari f
  ),
  birlesik as (select * from servis union all select * from bakim)
  select b.kaynak, b.id, b.baslik, b.musteri, b.personel,
         b.tarih, b.tip, b.ozet, b.durum, b.finans_kaydedildi
  from birlesik b
  order by b.sirala desc
  limit greatest(1, least(coalesce(p_limit,60), 200));
exception when others then
  return query
  select 'bakim'::text, f.id,
         f.seri_no || ' · ' || coalesce(f.form_tipi,''),
         coalesce(f.musteri,'—'), coalesce(f.personel,'—'),
         to_char(f.created_at,'DD.MM.YYYY HH24:MI'),
         case when f.form_tipi = 'asansor' then 'Asansör Bakım' else 'Vinç Bakım' end,
         (coalesce(f.onay_sayisi,0) || ' onay · ' || coalesce(f.ret_sayisi,0) || ' ret'),
         coalesce(f.is_durumu,'bitti'),
         coalesce(f.finans_kaydedildi, false)
  from public.bakim_formlari f
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit,60), 200));
end $$;

revoke all on function public.saha_raporlari_birlesik(integer) from public;
grant execute on function public.saha_raporlari_birlesik(integer) to authenticated;


-- 2) BAKIM FORMLARI LİSTESİ
drop function if exists public.bakim_formlari_liste(text, integer);

create function public.bakim_formlari_liste(
  p_tip text default null, p_limit integer default 50
)
returns table (
  id uuid, seri_no text, form_tipi text, musteri text, yetkili text,
  personel text, kontrol_tarihi text, onay_sayisi integer, ret_sayisi integer,
  musteri_puani integer, is_durumu text, devam_tarihi text, olusturma text,
  finans_kaydedildi boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id, f.seri_no, f.form_tipi, f.musteri, f.yetkili,
    f.personel, to_char(f.kontrol_tarihi,'DD.MM.YYYY'),
    f.onay_sayisi, f.ret_sayisi, f.musteri_puani, f.is_durumu,
    case when f.devam_tarihi is not null then to_char(f.devam_tarihi,'DD.MM.YYYY') else null end,
    to_char(f.created_at,'DD.MM.YYYY HH24:MI'),
    coalesce(f.finans_kaydedildi, false)
  from public.bakim_formlari f
  where (p_tip is null or f.form_tipi = p_tip)
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit,50), 200));
$$;

revoke all on function public.bakim_formlari_liste(text, integer) from public;
grant execute on function public.bakim_formlari_liste(text, integer) to authenticated;


-- 3) PERSONEL RAPORLARI
drop function if exists public.benim_bakim_formlarim(integer);

create function public.benim_bakim_formlarim(p_limit integer default 200)
returns table (
  id uuid, kaynak text, seri_no text, form_tipi text, musteri text,
  kontrol_tarihi text, onay_sayisi integer, ret_sayisi integer,
  musteri_puani integer, is_durumu text, olusturma text, kim text,
  finans_kaydedildi boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ben text; v_nm text; v_ad text; v_soyad text; v_admin boolean := false;
begin
  begin
    v_ben := public.benim_adim();
    v_nm := public.parca_adi_normal(coalesce(v_ben,''));
    v_ad := public.parca_adi_normal(split_part(coalesce(v_ben,''), ' ', 1));
    v_soyad := public.parca_adi_normal(coalesce(nullif(substring(coalesce(v_ben,'') from '[^ ]+$'),''), v_ben));
  exception when others then v_ben := null; v_nm := ''; v_ad := ''; v_soyad := ''; end;

  begin v_admin := coalesce(public.buvisan_admin_mi(), false);
  exception when others then v_admin := false; end;

  if v_ben is null or v_nm = '' then v_admin := true; end if;

  return query
  with bakim as (
    select f.id, 'bakim'::text as kaynak, f.seri_no, f.form_tipi,
      coalesce(f.musteri,'—') as musteri,
      to_char(f.kontrol_tarihi,'DD.MM.YYYY') as kontrol_tarihi,
      coalesce(f.onay_sayisi,0) as onay_sayisi, coalesce(f.ret_sayisi,0) as ret_sayisi,
      f.musteri_puani, coalesce(f.is_durumu,'bitti') as is_durumu,
      to_char(f.created_at,'DD.MM.YYYY HH24:MI') as olusturma,
      coalesce(f.personel,'—') as kim,
      coalesce(f.finans_kaydedildi, false) as finans_kaydedildi,
      f.created_at as sirala
    from public.bakim_formlari f
    where v_admin
       or public.parca_adi_normal(coalesce(f.personel,'')) like '%' || v_ad || '%'
       or public.parca_adi_normal(coalesce(f.personel,'')) like '%' || v_soyad || '%'
  ),
  servis as (
    select sr.id, 'servis'::text as kaynak,
      'SR-' || to_char(sr.created_at,'YYMMDD') as seri_no, 'servis'::text as form_tipi,
      coalesce(nullif(trim(coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')),''), '—') as musteri,
      to_char(sr.created_at,'DD.MM.YYYY') as kontrol_tarihi,
      1 as onay_sayisi, 0 as ret_sayisi,
      nullif(trim(coalesce(to_jsonb(sr)->>'musteri_puani','')),'')::integer as musteri_puani,
      'bitti'::text as is_durumu,
      to_char(sr.created_at,'DD.MM.YYYY HH24:MI') as olusturma,
      coalesce(public.jalan(to_jsonb(sr),'personel_adi','personel','teknisyen','imza_atan'),'—') as kim,
      coalesce((to_jsonb(sr)->>'finans_kaydedildi')::boolean, false) as finans_kaydedildi,
      sr.created_at as sirala
    from public.service_reports sr
    where v_admin
       or public.parca_adi_normal(coalesce(public.jalan(to_jsonb(sr),'personel_adi','personel','teknisyen','imza_atan'),'')) like '%' || v_ad || '%'
       or public.parca_adi_normal(coalesce(public.jalan(to_jsonb(sr),'personel_adi','personel','teknisyen','imza_atan'),'')) like '%' || v_soyad || '%'
  ),
  birlesik as (select * from bakim union all select * from servis)
  select b.id, b.kaynak, b.seri_no, b.form_tipi, b.musteri, b.kontrol_tarihi,
         b.onay_sayisi, b.ret_sayisi, b.musteri_puani, b.is_durumu, b.olusturma,
         b.kim, b.finans_kaydedildi
  from birlesik b
  order by b.sirala desc
  limit greatest(1, least(coalesce(p_limit,200), 500));
end $$;

revoke all on function public.benim_bakim_formlarim(integer) from public;
grant execute on function public.benim_bakim_formlarim(integer) to authenticated;


-- 4) 🧪 TEST
select count(*) filter (where finans_kaydedildi) as finansa_kaydedilen,
       count(*) as toplam
from public.saha_raporlari_birlesik(100);
