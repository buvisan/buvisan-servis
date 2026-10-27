-- ============================================================================
--  🔄 GERİYE DÖNÜK EŞLEŞTİRME + TEŞHİS (Güncelleme #114)
-- ----------------------------------------------------------------------------
--  SORUN: Triggerlar sadece YENİ kayıtlarda çalışıyor.
--         Eski formlar/arızalar eşleştirilmedi.
--
--  BU SCRIPT:
--    1) TEŞHİS: Hangi arıza hangi formla kaç skorla eşleşiyor
--    2) Operasyon: Eşleşen arızaları ÇÖZÜLDÜ yap
--    3) Finans: Finansa eklenen işlerin formlarını işaretle
--
--  KULLANIM: 141'den SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 🔍 TEŞHİS — Açık arızalar ve en iyi eşleşen form
-- ============================================================================
select
  st.id as ariza_id,
  coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'—') as ariza_firma,
  coalesce(to_jsonb(st)->>'pipeline_status','?') as durum,
  (
    select coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'—')
    from public.service_reports sr
    order by public.firma_benzerlik(
      coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
      coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
    ) desc
    limit 1
  ) as en_iyi_form,
  (
    select public.firma_benzerlik(
      coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
      coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
    )
    from public.service_reports sr
    order by public.firma_benzerlik(
      coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
      coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
    ) desc
    limit 1
  ) as skor
from public.service_tickets st
where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
order by 5 desc nulls last
limit 20;


-- ============================================================================
-- 2) ✅ OPERASYON — Eşleşen arızaları otomatik ÇÖZÜLDÜ yap
-- ============================================================================
create or replace function public.operasyon_geriye_donuk(p_esik integer default 60)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kapatilan integer := 0;
  v_kalan integer := 0;
begin
  -- Eşleşen arızaları kapat
  with hedefler as (
    select st.id
    from public.service_tickets st
    where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
      and exists (
        select 1 from public.service_reports sr
        where public.firma_benzerlik(
          coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
          coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
        ) >= p_esik
      )
  )
  update public.service_tickets st
     set pipeline_status = 'tamamlandi', status = 'tamamlandi'
   from hedefler h
   where st.id = h.id;

  get diagnostics v_kapatilan = row_count;

  -- Kalan açık arızalar
  begin
    select count(*) into v_kalan
    from public.service_tickets st
    where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu');
  exception when others then v_kalan := 0; end;

  return jsonb_build_object(
    'kapatilan', v_kapatilan,
    'kalan_acik', v_kalan,
    'mesaj', '✅ ' || v_kapatilan || ' arıza çözüldü olarak işaretlendi. ' ||
             v_kalan || ' arıza hâlâ açık.'
  );
exception when others then
  return jsonb_build_object('kapatilan', 0, 'kalan_acik', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.operasyon_geriye_donuk(integer) from public;
grant execute on function public.operasyon_geriye_donuk(integer) to authenticated;


-- ============================================================================
-- 3) 💰 FİNANS — Finansa eklenen işlerin formlarını işaretle
-- ============================================================================
create or replace function public.finans_geriye_donuk(p_esik integer default 60)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servis integer := 0;
  v_bakim integer := 0;
begin
  -- SERVİS raporlarını işaretle: her finans kaydı için en iyi eşleşen 1 form
  with secilen as (
    select e.sr_id, e.fr_id
    from (
      select fr.id as fr_id, sr.id as sr_id,
             public.firma_benzerlik(
               coalesce(public.jalan(to_jsonb(fr),'firma_adi','musteri','musteri_adi'),''),
               coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
             ) as skor,
             row_number() over (
               partition by fr.id
               order by public.firma_benzerlik(
                 coalesce(public.jalan(to_jsonb(fr),'firma_adi','musteri','musteri_adi'),''),
                 coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
               ) desc, sr.created_at asc
             ) as sira
      from public.financial_records fr
      cross join public.service_reports sr
      where coalesce((to_jsonb(sr)->>'finans_kaydedildi')::boolean, false) = false
    ) e
    where e.skor >= p_esik and e.sira = 1
  )
  update public.service_reports sr
     set finans_kaydedildi = true, finans_kayit_id = s.fr_id
    from secilen s
   where sr.id = s.sr_id;

  get diagnostics v_servis = row_count;

  -- BAKIM formlarını işaretle
  with secilen as (
    select e.f_id, e.fr_id
    from (
      select fr.id as fr_id, f.id as f_id,
             public.firma_benzerlik(
               coalesce(public.jalan(to_jsonb(fr),'firma_adi','musteri','musteri_adi'),''),
               coalesce(f.musteri,'')
             ) as skor,
             row_number() over (
               partition by fr.id
               order by public.firma_benzerlik(
                 coalesce(public.jalan(to_jsonb(fr),'firma_adi','musteri','musteri_adi'),''),
                 coalesce(f.musteri,'')
               ) desc, f.created_at asc
             ) as sira
      from public.financial_records fr
      cross join public.bakim_formlari f
      where coalesce(f.finans_kaydedildi, false) = false
    ) e
    where e.skor >= p_esik and e.sira = 1
  )
  update public.bakim_formlari f
     set finans_kaydedildi = true, finans_kayit_id = s.fr_id
    from secilen s
   where f.id = s.f_id;

  get diagnostics v_bakim = row_count;

  return jsonb_build_object(
    'servis_isaretlenen', v_servis,
    'bakim_isaretlenen', v_bakim,
    'mesaj', '✅ ' || v_servis || ' servis + ' || v_bakim || ' bakım formu finansa kaydedildi olarak işaretlendi.'
  );
exception when others then
  return jsonb_build_object('servis_isaretlenen', 0, 'bakim_isaretlenen', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.finans_geriye_donuk(integer) from public;
grant execute on function public.finans_geriye_donuk(integer) to authenticated;


-- ============================================================================
-- 4) 🧪 ÇALIŞTIR + SONUÇ
-- ============================================================================
select public.operasyon_geriye_donuk(60) as operasyon_sonuc;
select public.finans_geriye_donuk(60) as finans_sonuc;

-- Son durum
select
  (select count(*) from public.service_tickets
    where coalesce(to_jsonb(service_tickets)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')) as acik_ariza,
  (select count(*) from public.service_reports
    where coalesce((to_jsonb(service_reports)->>'finans_kaydedildi')::boolean,false)) as finansa_isaretli_servis,
  (select count(*) from public.bakim_formlari where coalesce(finans_kaydedildi,false)) as finansa_isaretli_bakim;
