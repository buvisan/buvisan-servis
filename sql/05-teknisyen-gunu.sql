-- ============================================================================
--  BUVISAN - TEKNISYEN (SAHA EKIBI) RANDEVU ERISIMI  (v1.0)
-- ----------------------------------------------------------------------------
--  Neden gerekli?
--    randevular tablosu su an SADECE admin'e acik. Saha ekibi kendi gununun
--    planini gorebilmeli ve isi bitirince randevu otomatik kapanmali.
--
--  Ne ekler?
--    1) Saha ekibi (girisli her kullanici) randevulari OKUYABILIR,
--       ama sadece YAKIN TARIHLI olanlari (bugun -7 / +14 gun penceresi).
--       Gecmis arsiv ve tum musteri verisi adminde kalir.
--    2) Servis raporu doldurulup is bitirilince, o ise bagli RANDEVU
--       otomatik olarak "yapildi" olur (planlayici ile senkron).
--
--  ⚠️ Mevcut veriye/tabloya dokunmaz, sadece 1 politika + 1 fonksiyon ekler.
--  KULLANIM: Supabase -> SQL Editor -> New query -> tamamini yapistir -> RUN
-- ============================================================================


-- ============================================================================
-- 1) SAHA EKIBI OKUMA YETKISI (bugun -7 gun / +14 gun penceresi)
--    Not: Admin zaten "tum yetki" politikasina sahip, bu onu DEGISTIRMEZ.
-- ============================================================================
drop policy if exists randevular_saha_ekibi_okuma on public.randevular;

create policy randevular_saha_ekibi_okuma on public.randevular
  for select to authenticated
  using (
    randevu_tarihi between (current_date - 7) and (current_date + 14)
  );


-- ============================================================================
-- 2) IS BITINCE RANDEVUYU OTOMATIK KAPAT
--    Saha personeli raporu kaydedince cagrilir (guvenli fonksiyon).
-- ============================================================================
create or replace function public.randevu_tamamla(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ticket_id is null then
    return;
  end if;

  update public.randevular
     set durum = 'yapildi'
   where ticket_id = p_ticket_id
     and durum <> 'iptal';
end;
$$;

revoke all on function public.randevu_tamamla(uuid) from public;
grant execute on function public.randevu_tamamla(uuid) to authenticated;


-- ============================================================================
-- 3) KONTROL
-- ============================================================================
select
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'randevular')            as randevu_politika_sayisi,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'randevu_tamamla')        as fonksiyon_hazir,
  'Beklenen: politika 2+, fonksiyon 1'                                   as aciklama;
