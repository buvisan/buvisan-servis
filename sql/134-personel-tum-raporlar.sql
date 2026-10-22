-- ============================================================================
--  👤 PERSONEL TÜM RAPORLARI (Güncelleme #106)
-- ----------------------------------------------------------------------------
--  İSTEK: Personel sadece bakım formlarını değil,
--         TÜM raporlarını görsün (servis + bakım)
--
--  ÇÖZÜM: benim_bakim_formlarim() → servis raporlarını da içerir
--
--  KULLANIM: 133'ten SONRA çalıştır. Hata vermez.
-- ============================================================================

-- ⚠️ Dönüş tipi değişti → DROP
drop function if exists public.benim_bakim_formlarim(integer);

create function public.benim_bakim_formlarim(p_limit integer default 50)
returns table (
  id uuid, kaynak text, seri_no text, form_tipi text, musteri text,
  kontrol_tarihi text, onay_sayisi integer, ret_sayisi integer,
  musteri_puani integer, is_durumu text, olusturma text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ben text;
  v_nm text;
begin
  begin
    v_ben := public.benim_adim();
    v_nm := public.parca_adi_normal(coalesce(v_ben,''));
  exception when others then v_ben := null; v_nm := ''; end;

  return query
  -- 🏗️ BAKIM FORMLARI
  select
    f.id, 'bakim'::text as kaynak,
    f.seri_no,
    f.form_tipi,
    coalesce(f.musteri,'—') as musteri,
    to_char(f.kontrol_tarihi,'DD.MM.YYYY') as kontrol_tarihi,
    f.onay_sayisi, f.ret_sayisi, f.musteri_puani, f.is_durumu,
    to_char(f.created_at,'DD.MM.YYYY HH24:MI') as olusturma
  from public.bakim_formlari f
  where v_nm = '' or v_ben is null
     or public.parca_adi_normal(coalesce(f.personel,'')) = v_nm

  union all

  -- 📄 SERVİS RAPORLARI
  select
    sr.id, 'servis'::text as kaynak,
    'SR-' || to_char(sr.created_at,'YYMMDD') as seri_no,
    'servis'::text as form_tipi,
    coalesce(nullif(trim(coalesce(public.jalan(to_jsonb(sr),'musteri_adi','customer_name','firma_adi'),'')),''), '—') as musteri,
    to_char(sr.created_at,'DD.MM.YYYY') as kontrol_tarihi,
    1 as onay_sayisi,
    0 as ret_sayisi,
    nullif(trim(coalesce(to_jsonb(sr)->>'musteri_puani','')),'')::integer as musteri_puani,
    'bitti'::text as is_durumu,
    to_char(sr.created_at,'DD.MM.YYYY HH24:MI') as olusturma
  from public.service_reports sr
  where v_nm = '' or v_ben is null
     or public.parca_adi_normal(coalesce(public.jalan(to_jsonb(sr),
          'personel','teknisyen','imza_atan','personel_adi'),'')) = v_nm
     or public.parca_adi_normal(coalesce(public.jalan(to_jsonb(sr),
          'personel','teknisyen','imza_atan','personel_adi'),'')) like '%' || v_nm || '%'

  order by 11 desc
  limit greatest(1, least(coalesce(p_limit,50), 200));
end $$;

revoke all on function public.benim_bakim_formlarim(integer) from public;
grant execute on function public.benim_bakim_formlarim(integer) to authenticated;


-- ============================================================================
-- 🧪 TEST
-- ============================================================================
select kaynak, count(*) as adet from public.benim_bakim_formlarim(50) group by kaynak;
select * from public.benim_bakim_formlarim(5);
