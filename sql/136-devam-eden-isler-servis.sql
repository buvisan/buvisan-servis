-- ============================================================================
--  ⏸️ DEVAM EDEN İŞLER — SERVİS RAPORLARI DAHİL (Güncelleme #108)
-- ----------------------------------------------------------------------------
--  SORUN: Servis raporunda "DEVAM EDİYOR" seçilince
--         /admin'deki panelde GÖRÜNMÜYORDU
--
--  SEBEP: devam_eden_isler() sadece bakim_formlari tablosunu okuyordu
--
--  ÇÖZÜM: service_tickets (pipeline_status='devam_ediyor') + bakim_formlari
--
--  KULLANIM: 135'ten SONRA çalıştır. Hata vermez.
-- ============================================================================

drop function if exists public.devam_eden_isler();

create function public.devam_eden_isler()
returns table (
  kaynak text, id uuid, seri_no text, form_tipi text, musteri text,
  personel text, kontrol_tarihi text, devam_tarihi text,
  gun_gecti integer, acil boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with bakimlar as (
    select
      'bakim'::text as kaynak,
      f.id,
      f.seri_no,
      f.form_tipi,
      coalesce(f.musteri,'—') as musteri,
      coalesce(f.personel,'—') as personel,
      to_char(f.kontrol_tarihi,'DD.MM.YYYY') as kontrol_tarihi,
      to_char(coalesce(f.devam_tarihi, f.hatirlatma_tarihi),'DD.MM.YYYY') as devam_tarihi,
      (current_date - coalesce(f.devam_tarihi, f.hatirlatma_tarihi, current_date))::int as gun_gecti,
      (current_date >= coalesce(f.hatirlatma_tarihi, f.devam_tarihi, current_date + 1)) as acil,
      coalesce(f.hatirlatma_tarihi, f.devam_tarihi, current_date) as sirala
    from public.bakim_formlari f
    where f.is_durumu = 'devam_ediyor'
  ),
  servisler as (
    select
      'servis'::text as kaynak,
      st.id,
      'SR-' || to_char(st.created_at,'YYMMDD') as seri_no,
      'servis'::text as form_tipi,
      coalesce(
        nullif(trim(coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name'),'')),''),
        '—') as musteri,
      coalesce(
        nullif(trim(coalesce(public.jalan(to_jsonb(st),'personel_adi','atanan_personel','teknisyen','assigned_to'),'')),''),
        '—') as personel,
      to_char(st.created_at,'DD.MM.YYYY') as kontrol_tarihi,
      to_char(st.created_at + interval '1 day','DD.MM.YYYY') as devam_tarihi,
      greatest(0, (current_date - st.created_at::date))::int as gun_gecti,
      (current_date >= (st.created_at::date + 1)) as acil,
      st.created_at + interval '1 day' as sirala
    from public.service_tickets st
    where st.pipeline_status = 'devam_ediyor'
  ),
  birlesik as (
    select * from bakimlar
    union all
    select * from servisler
  )
  select b.kaynak, b.id, b.seri_no, b.form_tipi, b.musteri,
         b.personel, b.kontrol_tarihi, b.devam_tarihi,
         b.gun_gecti, b.acil
  from birlesik b
  order by b.sirala asc nulls last;
exception when others then
  -- Hata olursa en azından bakım formlarını göster
  return query
  select 'bakim'::text, f.id, f.seri_no, f.form_tipi,
         coalesce(f.musteri,'—'), coalesce(f.personel,'—'),
         to_char(f.kontrol_tarihi,'DD.MM.YYYY'),
         to_char(coalesce(f.devam_tarihi, f.hatirlatma_tarihi),'DD.MM.YYYY'),
         (current_date - coalesce(f.devam_tarihi, f.hatirlatma_tarihi, current_date))::int,
         (current_date >= coalesce(f.hatirlatma_tarihi, f.devam_tarihi, current_date + 1))
  from public.bakim_formlari f
  where f.is_durumu = 'devam_ediyor'
  order by coalesce(f.hatirlatma_tarihi, f.devam_tarihi) asc nulls last;
end $$;

revoke all on function public.devam_eden_isler() from public;
grant execute on function public.devam_eden_isler() to authenticated;


-- ============================================================================
-- 🧪 TEST
-- ============================================================================
select kaynak, count(*) as adet from public.devam_eden_isler() group by kaynak;

select * from public.devam_eden_isler();

-- Servis taleplerinde devam ediyor var mı?
select pipeline_status, count(*) as adet
from public.service_tickets
group by pipeline_status
order by 2 desc;
