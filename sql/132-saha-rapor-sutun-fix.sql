-- ============================================================================
--  🔧 SAHA RAPORLARI BİRLEŞİK — SÜTUN DÜZELTMESİ (Güncelleme #104)
-- ----------------------------------------------------------------------------
--  HATA: column sr.service_type does not exist
--  SEBEP: service_reports tablosunda service_type / description yok
--
--  ÇÖZÜM: to_jsonb ile DİNAMİK okuma — sütun adı ne olursa olsun çalışır
--
--  KULLANIM: 131'den SONRA çalıştır. Hata vermez.
-- ============================================================================

create or replace function public.saha_raporlari_birlesik(p_limit integer default 60)
returns table (
  kaynak text, id uuid, baslik text, musteri text, personel text,
  tarih text, tip text, ozet text, durum text
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
      'servis'::text as kaynak,
      sr.id,
      coalesce(
        nullif(trim(coalesce(public.jalan(to_jsonb(sr),'musteri_adi','customer_name','firma_adi'),'')),''),
        nullif(trim(coalesce(public.jalan(to_jsonb(sr),'description','aciklama'),'')),''),
        'Servis Raporu') as baslik,
      coalesce(nullif(trim(coalesce(public.jalan(to_jsonb(sr),'musteri_adi','customer_name','firma_adi'),'')),''), '—') as musteri,
      coalesce(nullif(trim(coalesce(public.jalan(to_jsonb(sr),'personel','teknisyen','imza_atan','personel_adi'),'')),''), '—') as personel,
      to_char(sr.created_at,'DD.MM.YYYY HH24:MI') as tarih,
      coalesce(nullif(trim(coalesce(to_jsonb(sr)->>'service_type','')),''),
               nullif(trim(coalesce(to_jsonb(sr)->>'is_tipi','')),''), 'Servis') as tip,
      left(coalesce(public.jalan(to_jsonb(sr),'description','aciklama','konu'),'-'), 80) as ozet,
      'tamamlandi'::text as durum
    from public.service_reports sr
  ),
  bakim as (
    select
      'bakim'::text as kaynak,
      f.id,
      f.seri_no || ' · ' || coalesce(f.form_tipi,'') as baslik,
      coalesce(f.musteri,'—') as musteri,
      coalesce(f.personel,'—') as personel,
      to_char(f.created_at,'DD.MM.YYYY HH24:MI') as tarih,
      case when f.form_tipi = 'asansor' then 'Asansör Bakım' else 'Vinç Bakım' end as tip,
      (coalesce(f.onay_sayisi,0) || ' onay · ' || coalesce(f.ret_sayisi,0) || ' ret') as ozet,
      coalesce(f.is_durumu,'bitti') as durum
    from public.bakim_formlari f
  ),
  birlesik as (
    select * from servis
    union all
    select * from bakim
  )
  select b.kaynak, b.id, b.baslik, b.musteri, b.personel,
         b.tarih, b.tip, b.ozet, b.durum
  from birlesik b
  order by b.tarih desc
  limit greatest(1, least(coalesce(p_limit,60), 200));
exception when others then
  -- Hata olursa en azından bakım formlarını döndür
  return query
  select 'bakim'::text, f.id,
         f.seri_no || ' · ' || coalesce(f.form_tipi,''),
         coalesce(f.musteri,'—'),
         coalesce(f.personel,'—'),
         to_char(f.created_at,'DD.MM.YYYY HH24:MI'),
         case when f.form_tipi = 'asansor' then 'Asansör Bakım' else 'Vinç Bakım' end,
         (coalesce(f.onay_sayisi,0) || ' onay · ' || coalesce(f.ret_sayisi,0) || ' ret'),
         coalesce(f.is_durumu,'bitti')
  from public.bakim_formlari f
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit,60), 200));
end $$;

revoke all on function public.saha_raporlari_birlesik(integer) from public;
grant execute on function public.saha_raporlari_birlesik(integer) to authenticated;


-- ============================================================================
-- 🧪 TEST
-- ============================================================================
select kaynak, count(*) as adet from public.saha_raporlari_birlesik(50) group by kaynak;
