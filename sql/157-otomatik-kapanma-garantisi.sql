-- ============================================================================
--  🛡️ OTOMATİK KAPANMA GARANTİSİ (Güncelleme #129)
-- ----------------------------------------------------------------------------
--  SORU: Gelecekte bir arıza için PERİYODİK BAKIM formu doldurulursa
--        arıza otomatik ÇÖZÜLDÜ olur mu? GARANTİ var mı?
--
--  CEVAP: EVET — 2 mekanizma ile garanti:
--    1) bakim_formu_kaydet() RPC → p_ticket_id ile kapatır
--    2) trg_bakim_operasyon TRIGGER → bakim_formlari.ticket_id ile kapatır
--
--  BU SCRIPT: doğrular + eksikse ekler + TEST eder
--
--  KULLANIM: 156'dan SONRA çalıştır.
-- ============================================================================


-- ============================================================================
-- 1) 🔍 MEVCUT DURUM — triggerlar var mı?
-- ============================================================================
select
  tg.tgname as trigger_adi,
  c.relname as tablo,
  p.proname as fonksiyon,
  case when tg.tgenabled = 'O' then 'AKTİF' else 'KAPALI' end as durum
from pg_trigger tg
join pg_class c on c.oid = tg.tgrelid
join pg_proc p on p.oid = tg.tgfoid
where c.relname in ('service_reports','bakim_formlari')
  and not tg.tgisinternal
order by c.relname, tg.tgname;


-- ============================================================================
-- 2) 🛡️ TRIGGER FONKSİYONU — HER İKİ FORMDAN ARIZA KAPATMA
-- ============================================================================
create or replace function public.form_ariza_kapat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket uuid;
  v_kapatildi integer := 0;
begin
  begin
    -- Formun taşıdığı ticket_id'yi al
    v_ticket := nullif(trim(coalesce(to_jsonb(NEW)->>'ticket_id','')),'')::uuid;

    if v_ticket is null then
      raise notice 'ℹ️ Form kaydedildi ama ticket_id YOK → arıza kapatılmadı';
      return NEW;
    end if;

    -- Arızayı kapat (sadece açıksa)
    update public.service_tickets
       set pipeline_status = 'tamamlandi',
           status = 'tamamlandi'
     where id = v_ticket
       and coalesce(to_jsonb(service_tickets)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu');

    get diagnostics v_kapatildi = row_count;

    if v_kapatildi > 0 then
      raise notice '✅ ARIZA KAPATILDI (ticket_id: %)', v_ticket;
    else
      raise notice 'ℹ️ Arıza zaten kapalıydı veya bulunamadı: %', v_ticket;
    end if;
  exception when others then
    raise notice '⚠️ form_ariza_kapat: %', sqlerrm;
  end;

  return NEW;
end $$;


-- ============================================================================
-- 3) 🛡️ TRIGGERLARI BAĞLA — 3 TABLO İÇİN
-- ============================================================================
do $$
begin
  -- SERVİS RAPORU
  begin
    drop trigger if exists trg_servis_ariza on public.service_reports;
    create trigger trg_servis_ariza
      after insert on public.service_reports
      for each row execute function public.form_ariza_kapat();
    raise notice '✅ trg_servis_ariza (servis raporu → arıza kapat)';
  exception when others then raise notice '⚠️ trg_servis_ariza: %', sqlerrm; end;

  -- BAKIM FORMU
  begin
    drop trigger if exists trg_bakim_ariza on public.bakim_formlari;
    create trigger trg_bakim_ariza
      after insert on public.bakim_formlari
      for each row execute function public.form_ariza_kapat();
    raise notice '✅ trg_bakim_ariza (bakım formu → arıza kapat)';
  exception when others then raise notice '⚠️ trg_bakim_ariza: %', sqlerrm; end;

  -- ESKİ TRIGGER'LARI TEMİZLE (çakışma olmasın)
  begin
    drop trigger if exists trg_operasyon_coz on public.service_reports;
    raise notice '🧹 trg_operasyon_coz kaldırıldı (yeni trigger devraldı)';
  exception when others then null; end;

  begin
    drop trigger if exists trg_bakim_operasyon on public.bakim_formlari;
    raise notice '🧹 trg_bakim_operasyon kaldırıldı (yeni trigger devraldı)';
  exception when others then null; end;
end $$;


-- ============================================================================
-- 4) 🧪 GARANTİ TESTİ — gerçek hayat senaryosu
-- ============================================================================
do $$
declare
  v_test_ticket uuid;
  v_test_form uuid;
  v_durum_before text;
  v_durum_after text;
  v_onay integer;
begin
  raise notice ' ';
  raise notice '═══════ GARANTİ TESTİ ═══════';

  -- 1) Test arızası oluştur
  begin
    insert into public.service_tickets (firma_adi, description, pipeline_status, status)
    values ('GARANTI TEST FIRMASI', 'Otomatik kapanma testi', 'acil_cozum_bekliyor', 'acil_cozum_bekliyor')
    returning id into v_test_ticket;
    raise notice '1️⃣ Test arızası oluşturuldu: %', v_test_ticket;
  exception when others then
    raise notice '❌ Test arızası oluşturulamadı: %', sqlerrm;
    return;
  end;

  -- Durum: önce
  select coalesce(to_jsonb(service_tickets)->>'pipeline_status','?') into v_durum_before
  from public.service_tickets where id = v_test_ticket;
  raise notice '2️⃣ ÖNCE durum: %', v_durum_before;

  -- 2) PERİYODİK BAKIM FORMU oluştur (ticket_id ile)
  begin
    insert into public.bakim_formlari (
      form_tipi, musteri, personel, kontrol_tarihi,
      onay_sayisi, ret_sayisi, is_durumu, ticket_id
    ) values (
      'vinc', 'GARANTI TEST FIRMASI', 'TEST PERSONEL', current_date,
      5, 0, 'bitti', v_test_ticket
    ) returning id into v_test_form;
    raise notice '3️⃣ Bakım formu oluşturuldu: %', v_test_form;
  exception when others then
    raise notice '❌ Bakım formu oluşturulamadı: %', sqlerrm;
    delete from public.service_tickets where id = v_test_ticket;
    return;
  end;

  -- Durum: sonra
  select coalesce(to_jsonb(service_tickets)->>'pipeline_status','?') into v_durum_after
  from public.service_tickets where id = v_test_ticket;
  raise notice '4️⃣ SONRA durum: %', v_durum_after;

  -- SONUÇ
  if v_durum_after = 'tamamlandi' then
    raise notice ' ';
    raise notice '✅✅✅ GARANTİ DOĞRULANDI ✅✅✅';
    raise notice 'Bakım formu → arıza OTOMATİK kapandı!';
  else
    raise notice ' ';
    raise notice '❌ GARANTİ BAŞARISIZ — arıza hâlâ: %', v_durum_after;
  end if;

  -- TEMİZLİK
  delete from public.bakim_formlari where id = v_test_form;
  delete from public.service_tickets where id = v_test_ticket;
  raise notice '🧹 Test kayıtları temizlendi';
  raise notice '═════════════════════════════';
exception when others then
  raise notice '❌ TEST HATASI: %', sqlerrm;
  begin
    delete from public.bakim_formlari where id = v_test_form;
    delete from public.service_tickets where id = v_test_ticket;
  exception when others then null; end;
end $$;


-- ============================================================================
-- 5) 📋 ÖZET
-- ============================================================================
select
  (select count(*) from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    where c.relname = 'service_reports' and tg.tgname = 'trg_servis_ariza') as servis_trigger,
  (select count(*) from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    where c.relname = 'bakim_formlari' and tg.tgname = 'trg_bakim_ariza') as bakim_trigger;
