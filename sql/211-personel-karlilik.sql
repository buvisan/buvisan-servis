-- ============================================================================
--  💰 PERSONEL KÂRLILIK PANELİ — 211
-- ----------------------------------------------------------------------------
--  NE YAPAR?
--    Personel performans ekranında isme tıklanınca açılan maliyet/kârlılık
--    panelinin okuduğu sorgular için INDEX ekler. Veri DEĞİŞTİRMEZ.
--
--  PANEL HANGİ TABLOLARI OKUR?
--    completed_services  → ciro (tek ciro kaynağı) + ekip + süre
--    service_reports     → saklı maliyet (degisen_parcalar[].birim_maliyet)
--                          bağ: finans_kayit_id = completed_services.id,
--                          yoksa form_no = rapor id ilk 6 karakter
--    materials           → kayıtta maliyet yoksa GÜNCEL alış fiyatı (etiketli)
--    personel_maas       → kişi saat ücreti (maaş × 1,65 ÷ 225)
--    randevular          → personel ataması / planlanan iş sayısı
--    profiles            → kimlik eşleşmesi
--
--  NEDEN INDEX?
--    Panel her açılışta ay penceresiyle bu tabloları tarar. Tablolar
--    büyüdükçe sıralı tarama yavaşlar; bu indexler tarih/personel/bağ
--    kolonlarını kapsar.
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
--  Sonunda migration_isaretle() çağrılır (yoksa hata vermez, notice basar).
-- ============================================================================


-- ─── 1) completed_services: ay + personel taraması ──────────────────────────
create index if not exists idx_cs_service_date_tech
  on public.completed_services (service_date, technician);

create index if not exists idx_cs_service_date
  on public.completed_services (service_date);


-- ─── 2) service_reports: işe bağlanma (finans_kayit_id) + tarih ─────────────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_reports'
      and column_name = 'finans_kayit_id'
  ) then
    create index if not exists idx_sr_finans_kayit
      on public.service_reports (finans_kayit_id);
  else
    raise notice 'service_reports.finans_kayit_id yok → index atlandı (rapor bağı form_no ile kurulur)';
  end if;
end $$;

create index if not exists idx_sr_created_at
  on public.service_reports (created_at desc);


-- ─── 3) randevular: ay + atanan personel ────────────────────────────────────
create index if not exists idx_randevular_tarih_personel
  on public.randevular (randevu_tarihi, atanan_personel);


-- ─── 4) materials: ad eşleşmesi (maliyet düşüşü) ────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'materials' and column_name = 'name'
  ) then
    create index if not exists idx_materials_name
      on public.materials (lower(name));
  else
    raise notice 'materials.name yok → index atlandı';
  end if;
end $$;


-- ─── 5) KONTROL — indexler oluştu mu? ───────────────────────────────────────
do $$
declare
  v_say integer;
begin
  select count(*) into v_say
  from pg_indexes
  where schemaname = 'public'
    and indexname in (
      'idx_cs_service_date_tech',
      'idx_cs_service_date',
      'idx_sr_finans_kayit',
      'idx_sr_created_at',
      'idx_randevular_tarih_personel',
      'idx_materials_name'
    );

  raise notice '✅ 211: % / 6 index hazır', v_say;
  raise notice '✅ Panel: /api/personel-karlilik (yalnızca yönetici)';
end $$;


-- ─── 6) MIGRATION KAYDI ─────────────────────────────────────────────────────
do $$
begin
  perform public.migration_isaretle(
    '211-personel-karlilik.sql',
    'personel karlilik paneli: okuma indexleri (ciro/maliyet/kar)'
  );
  raise notice '✅ 211 kaydedildi';
exception when others then
  raise notice 'migration kaydı atlandı (205 çalıştırılmamış olabilir): %', sqlerrm;
end $$;
