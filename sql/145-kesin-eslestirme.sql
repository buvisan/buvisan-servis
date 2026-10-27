-- ============================================================================
--  🚨 YANLIŞ KAPANAN ARIZALARI GERİ AÇ + KESİN EŞLEŞTİRME (Güncelleme #117)
-- ----------------------------------------------------------------------------
--  HATA: operasyon_geriye_donuk 33 arızayı kapattı ama ÇOĞU FORM DOLDURULMAMIŞTI
--        Sebep: "aynı firmadan HERHANGİ bir form" varsa kapatıyordu
--
--  ÇÖZÜM:
--    1) service_reports.ticket_id kolonu ekle (KESİN BAĞ)
--    2) Yanlış kapanan arızaları GERİ AÇ
--    3) Trigger'ı KESİN eşleştirmeye çevir (sadece ticket_id)
--
--  KULLANIM: 143'ten SONRA çalıştır. Veri silmez.
-- ============================================================================


-- ============================================================================
-- 1) 🔗 service_reports.ticket_id KOLONU (kesin bağ)
-- ============================================================================
do $$
begin
  begin
    alter table public.service_reports add column if not exists ticket_id uuid;
    raise notice '✅ service_reports.ticket_id eklendi';
  exception when others then raise notice '⚠️ ticket_id: %', sqlerrm; end;

  begin
    alter table public.bakim_formlari add column if not exists ticket_id uuid;
    raise notice '✅ bakim_formlari.ticket_id (zaten var olabilir)';
  exception when others then raise notice '⚠️ bakim ticket_id: %', sqlerrm; end;
end $$;


-- ============================================================================
-- 2) 🔄 YANLIŞ KAPANAN ARIZALARI GERİ AÇ
--    Kural: Arıza "tamamlandi" ise AMA ona bağlı form YOKSA → tekrar aç
--    (Sadece son 7 günde kapananlar — geçmişi bozmayalım)
-- ============================================================================
create or replace function public.yanlis_kapananlari_ac(p_gun integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acilan integer := 0;
begin
  with hedefler as (
    select st.id
    from public.service_tickets st
    where coalesce(to_jsonb(st)->>'pipeline_status','') = 'tamamlandi'
      and st.updated_at >= (now() - (p_gun || ' days')::interval)
      -- Bu arızaya KESİN bağlı form YOK
      and not exists (
        select 1 from public.service_reports sr
        where coalesce(to_jsonb(sr)->>'ticket_id','') = st.id::text
      )
      and not exists (
        select 1 from public.bakim_formlari bf
        where coalesce(to_jsonb(bf)->>'ticket_id','') = st.id::text
      )
  )
  update public.service_tickets st
     set pipeline_status = 'acil_cozum_bekliyor',
         status = 'acil_cozum_bekliyor'
   from hedefler h
   where st.id = h.id;

  get diagnostics v_acilan = row_count;

  return jsonb_build_object(
    'acilan', v_acilan,
    'mesaj', '🔓 ' || v_acilan || ' arıza geri açıldı (form doldurulmamıştı).'
  );
exception when others then
  return jsonb_build_object('acilan', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.yanlis_kapananlari_ac(integer) from public;
grant execute on function public.yanlis_kapananlari_ac(integer) to authenticated;


-- ============================================================================
-- 3) 🎯 TRIGGER — SADECE KESİN BAĞ İLE KAPAT
-- ============================================================================
create or replace function public.operasyon_otomatik_coz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket uuid;
begin
  begin
    -- Form KENDİ ticket_id'sini taşıyorsa → o arızayı kapat
    v_ticket := null;
    begin
      v_ticket := nullif(trim(coalesce(to_jsonb(NEW)->>'ticket_id','')),'')::uuid;
    exception when others then v_ticket := null; end;

    if v_ticket is not null then
      update public.service_tickets
         set pipeline_status = 'tamamlandi', status = 'tamamlandi'
       where id = v_ticket
         and coalesce(to_jsonb(service_tickets)->>'pipeline_status','') not in ('tamamlandi','iptal');
      raise notice '✅ Arıza kapatıldı (kesin bağ): %', v_ticket;
      return NEW;
    end if;

    -- ⛔ ticket_id YOKSA HİÇBİR ŞEY KAPATMA
    raise notice 'ℹ️ Form kaydedildi ama ticket_id yok → arıza kapatılmadı';
  exception when others then
    raise notice 'operasyon_otomatik_coz: %', sqlerrm;
  end;
  return NEW;
end $$;

drop trigger if exists trg_operasyon_coz on public.service_reports;
create trigger trg_operasyon_coz
  after insert on public.service_reports
  for each row execute function public.operasyon_otomatik_coz();


-- ============================================================================
-- 4) 🎯 BAKIM FORMU TRIGGER — AYNI KESİN KURAL
-- ============================================================================
create or replace function public.bakim_operasyon_coz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket uuid;
begin
  begin
    v_ticket := nullif(trim(coalesce(to_jsonb(NEW)->>'ticket_id','')),'')::uuid;
    if v_ticket is not null then
      update public.service_tickets
         set pipeline_status = 'tamamlandi', status = 'tamamlandi'
       where id = v_ticket
         and coalesce(to_jsonb(service_tickets)->>'pipeline_status','') not in ('tamamlandi','iptal');
      raise notice '✅ Arıza kapatıldı (bakım formu, kesin bağ): %', v_ticket;
    end if;
  exception when others then null; end;
  return NEW;
end $$;

drop trigger if exists trg_bakim_operasyon on public.bakim_formlari;
create trigger trg_bakim_operasyon
  after insert on public.bakim_formlari
  for each row execute function public.bakim_operasyon_coz();


-- ============================================================================
-- 5) 🔄 GERİYE DÖNÜK: mevcut formları randevu üzerinden arızaya bağla
--    randevular.ticket_id ↔ form tarihi eşleşmesi
-- ============================================================================
create or replace function public.formlari_arizaya_bagla()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servis integer := 0;
  v_bakim integer := 0;
begin
  -- SERVİS raporları: randevu üzerinden ticket_id bul
  update public.service_reports sr
     set ticket_id = r.ticket_id
    from public.randevular r
   where coalesce(to_jsonb(sr)->>'ticket_id','') = ''
     and r.ticket_id is not null
     and public.firma_benzerlik(
           coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
           coalesce(r.musteri_adi,'')
         ) >= 80
     and abs(extract(epoch from (sr.created_at::date - r.randevu_tarihi::date))) <= 259200;

  get diagnostics v_servis = row_count;

  -- BAKIM formları
  update public.bakim_formlari bf
     set ticket_id = r.ticket_id
    from public.randevular r
   where bf.ticket_id is null
     and r.ticket_id is not null
     and public.firma_benzerlik(coalesce(bf.musteri,''), coalesce(r.musteri_adi,'')) >= 80
     and abs(extract(epoch from (bf.created_at::date - r.randevu_tarihi::date))) <= 259200;

  get diagnostics v_bakim = row_count;

  return jsonb_build_object(
    'servis_baglanan', v_servis,
    'bakim_baglanan', v_bakim,
    'mesaj', '🔗 ' || v_servis || ' servis + ' || v_bakim || ' bakım formu arızaya bağlandı.'
  );
exception when others then
  return jsonb_build_object('servis_baglanan', 0, 'bakim_baglanan', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.formlari_arizaya_bagla() from public;
grant execute on function public.formlari_arizaya_bagla() from authenticated;


-- ============================================================================
-- 6) 🧪 ÇALIŞTIR
-- ============================================================================
select public.yanlis_kapananlari_ac(7) as geri_acma_sonucu;

select public.formlari_arizaya_bagla() as baglama_sonucu;

-- Durum
select
  (select count(*) from public.service_tickets
    where coalesce(to_jsonb(service_tickets)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')) as acik_ariza,
  (select count(*) from public.service_reports
    where coalesce(to_jsonb(service_reports)->>'ticket_id','') <> '') as bagli_servis_formu,
  (select count(*) from public.bakim_formlari where ticket_id is not null) as bagli_bakim_formu;
