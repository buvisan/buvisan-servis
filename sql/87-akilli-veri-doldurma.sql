-- ============================================================================
--  🧠 AKILLI VERİ DOLDURMA (Güncelleme #61)
-- ----------------------------------------------------------------------------
--  BULGU (79 raporundan):
--    288 vinç · 215 koordinatlı ✅ · 637 servis kaydı ✅
--    AMA: kapasiteli = 0 · bakim_tarihli = 0 ❌
--    → Bakım Takvimi ve Sağlık Skoru ekranları BOŞ görünüyor
--
--  ÇÖZÜM — iki akıllı doldurma:
--    1) SONRAKI BAKIM TARİHİ: son servis + 12 ay (asansör + 6 ay)
--       → Bakım Takvimi ANINDA dolar
--    2) KAPASİTE: servis kayıtlarından + vinç kaydından (marka/model/seri_no)
--
--  ⚠️ Veri silmez, sadece BOŞ alanları doldurur.
--  ⚠️ Elle girilmiş değerlerin ÜZERİNE YAZMAZ.
--
--  KULLANIM: 86'dan SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 📅 SONRAKİ BAKIM TARİHİ — son servis + 12 ay (asansör + 6 ay)
-- ============================================================================
do $$
declare
  v_adet integer := 0;
begin
  begin
    with son_servis as (
      select
        public.parca_adi_normal(
          public.jalan(to_jsonb(cs),'customer_name','firm_name','customer')) as mnorm,
        max(cs.service_date::date) as son_t
      from public.completed_services cs
      where cs.service_date is not null
      group by 1
    )
    update public.cranes c
       set next_maintenance_date =
             case when public.parca_adi_normal(coalesce(c.makine_tipi,'')) like '%asansor%'
                  then ss.son_t + interval '6 months'
                  else ss.son_t + interval '12 months' end
      from son_servis ss
     where ss.mnorm = public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi'))
       and ss.mnorm <> ''
       and c.next_maintenance_date is null;

    get diagnostics v_adet = row_count;
    raise notice '✅ Bakım tarihi hesaplandı: % vinç', v_adet;
  exception when others then
    raise notice '⚠️ Bakım tarihi hesaplanamadı → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 2) 🏗️ KAPASİTE DOLDURMA — çok stratejili
-- ============================================================================
do $$
declare
  v_adet integer := 0;
begin
  -- 2a) Servis kayıtlarından (müşteri adı eşleşmesi)
  begin
    with kapasiteler as (
      select
        public.parca_adi_normal(
          coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                   nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),'')) as mnorm,
        trim(cs.crane_capacity) as kapasite,
        count(*) as adet
      from public.completed_services cs
      where coalesce(trim(cs.crane_capacity), '') <> ''
      group by 1, 2
    ),
    en_sik as (
      select distinct on (mnorm) mnorm, kapasite
      from kapasiteler
      where coalesce(mnorm,'') <> ''
      order by mnorm, adet desc
    )
    update public.cranes c
       set crane_capacity = e.kapasite
      from en_sik e
     where public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi')) = e.mnorm
       and coalesce(trim(c.crane_capacity), '') = '';

    get diagnostics v_adet = row_count;
    raise notice '✅ Kapasite (servis kaydından): % vinç', v_adet;
  exception when others then
    raise notice '⚠️ Kapasite doldurma atlandı → %', sqlerrm;
  end;

  -- 2b) Vinç kaydındaki marka/model/seri_no'dan
  begin
    update public.cranes c
       set crane_capacity = coalesce(
             nullif(trim(coalesce(public.jalan(to_jsonb(c),'model','crane_model'),'')), ''),
             nullif(trim(coalesce(public.jalan(to_jsonb(c),'marka','brand'),'')), ''),
             nullif(trim(coalesce(public.jalan(to_jsonb(c),'seri_no','serial_no'),'')), '')
           )
     where coalesce(trim(c.crane_capacity), '') = ''
       and coalesce(
             nullif(trim(coalesce(public.jalan(to_jsonb(c),'model','crane_model'),'')), ''),
             nullif(trim(coalesce(public.jalan(to_jsonb(c),'marka','brand'),'')), ''),
             nullif(trim(coalesce(public.jalan(to_jsonb(c),'seri_no','serial_no'),'')), '')
           ) is not null;

    get diagnostics v_adet = row_count;
    raise notice '✅ Kapasite (marka/model): % vinç', v_adet;
  exception when others then null; end;

  -- 2c) Vinç tipini (makine_tipi) eksik olanlara varsayılan
  begin
    update public.cranes set makine_tipi = 'Vinç' where coalesce(makine_tipi,'') = '';
  exception when others then null; end;

  -- 2d) Asansör tespiti (kapasite adında "asansör" geçenler)
  begin
    update public.cranes set makine_tipi = 'Asansör'
     where public.parca_adi_normal(coalesce(crane_capacity,'')) like '%asansor%'
       and coalesce(makine_tipi,'') in ('', 'Vinç');
  exception when others then null; end;
end $$;


-- ============================================================================
-- 3) 📋 TARİHSİZ VİNÇLER — servis kaydı olmayanlar
--    Bunlara bugünden itibaren 6 ay sonra bakım öner
-- ============================================================================
do $$
declare
  v_adet integer := 0;
begin
  begin
    update public.cranes
       set next_maintenance_date = current_date + interval '6 months'
     where next_maintenance_date is null;

    get diagnostics v_adet = row_count;
    raise notice '✅ Servis geçmişi olmayan vinçlere varsayılan bakım tarihi: %', v_adet;
  exception when others then null; end;
end $$;


-- ============================================================================
-- 4) 📊 SONUÇ — ne değişti?
-- ============================================================================
select
  count(*)                                                                      as toplam_vinc,
  count(*) filter (where coalesce(trim(crane_capacity),'') <> '')               as kapasiteli,
  count(*) filter (where coalesce(trim(makine_tipi),'') <> '')                  as tipli,
  count(*) filter (where public.parca_adi_normal(coalesce(makine_tipi,'')) = 'asansor') as asansor,
  count(*) filter (where next_maintenance_date is not null)                     as bakim_tarihli,
  count(*) filter (where next_maintenance_date < current_date)                  as bakimi_gecikmis,
  count(*) filter (where next_maintenance_date between current_date and current_date + 30) as bu_ay_bakim,
  count(*) filter (where lat is not null)                                       as koordinatli,
  count(*) filter (where coalesce(trim(customer_phone),'') <> '')               as telefonlu,
  count(*) filter (where coalesce(trim(location_address),'') <> '')             as adresli
from public.cranes;


-- ============================================================================
-- 5) 📅 BAKIM TAKVİMİ ÖZETİ — artık dolu mu?
-- ============================================================================
select public.bakim_durumu() as bakim_durumu;


-- ============================================================================
-- 6) 🏗️ SAĞLIK SKORU ÖRNEĞİ — ilk 5 vinç
-- ============================================================================
select * from public.vinc_saglik_listesi(5, 'riskli');
