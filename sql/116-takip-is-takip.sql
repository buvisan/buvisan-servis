-- ============================================================================
--  🎯 TAKİP SİSTEMİ KESİN ÇÖZÜM — is_takip TABLOSU (Güncelleme #88)
-- ----------------------------------------------------------------------------
--  BULGU (115 kaynak kodundan):
--    Takip kayıtları public.is_takip tablosunda!
--      • takip_mesaji(): select * into t from public.is_takip where id = p_id
--      • Link: https://servis.buvisan.com/takip/ || t.id::text
--
--  BENİM HATAM:
--    is_durumu() fonksiyonunu randevular + service_tickets için yazdım,
--    is_takip tablosunu HİÇ kontrol etmedim! → Tüm linkler "Bulunamadı" ❌
--
--  ÇÖZÜM:
--    is_durumu() → ÖNCE is_takip, sonra randevular, sonra service_tickets
--
--  KULLANIM: 115'ten SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 📋 is_takip TABLOSU — sütunlar + kayıt sayısı
-- ============================================================================
select
  (select string_agg(column_name || ' (' || data_type || ')', ', ' order by ordinal_position)
   from information_schema.columns
   where table_schema='public' and table_name='is_takip') as is_takip_sutunlari,
  (select count(*) from public.is_takip) as toplam_kayit;


-- ============================================================================
-- 2) 📋 MEVCUT TAKİP KAYITLARI (canlı)
-- ============================================================================
select
  id::text                            as takip_id,
  'https://servis.buvisan.com/takip/' || id::text as takip_linki,
  coalesce(musteri,'-')               as musteri,
  coalesce(durum,'-')                 as durum,
  coalesce(teknisyen,'-')             as teknisyen,
  left(coalesce(tahmini_varis::text,''), 16) as tahmini_varis
from public.is_takip
order by coalesce(created_at, now()) desc
limit 10;


-- ============================================================================
-- 3) 📍 is_durumu() — ARTIK is_takip'i KONTROL EDİYOR
-- ============================================================================
drop function if exists public.is_durumu(uuid);

create function public.is_durumu(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_r jsonb;
  v_kaynak text := '';
  v_durum text;
  v_musteri text;
begin
  -- ⭐ 1. ÖNCE is_takip (gerçek takip kaydı)
  begin
    select to_jsonb(t) into v_r from public.is_takip t where t.id = p_id limit 1;
    if v_r is not null then v_kaynak := 'is_takip'; end if;
  exception when others then v_r := null; end;

  -- 2. Sonra RANDEVULAR
  if v_r is null then
    begin
      select to_jsonb(r) into v_r from public.randevular r where r.id = p_id limit 1;
      if v_r is not null then v_kaynak := 'randevular'; end if;
    exception when others then v_r := null; end;
  end if;

  -- 3. Sonra SERVICE_TICKETS
  if v_r is null then
    begin
      select to_jsonb(t) into v_r from public.service_tickets t where t.id = p_id limit 1;
      if v_r is not null then v_kaynak := 'service_tickets'; end if;
    exception when others then v_r := null; end;
  end if;

  if v_r is null then
    return jsonb_build_object('bulundu', false);
  end if;

  -- MÜŞTERİ ADI
  v_musteri := coalesce(
    nullif(trim(coalesce(v_r->>'musteri','')),''),
    nullif(trim(coalesce(v_r->>'musteri_adi','')),''),
    nullif(trim(coalesce(v_r->>'manual_customer_name','')),''),
    nullif(trim(coalesce(v_r->>'customer_name','')),''),
    nullif(trim(coalesce(v_r->>'firma_adi','')),''),
    'Değerli Müşterimiz');

  -- DURUM — is_takip'te zaten PLANLANDI/YOLDA/VARDI/CALISIYOR/BITTI/IPTAL
  declare
    v_ham text := public.parca_adi_normal(coalesce(
      nullif(trim(coalesce(v_r->>'durum','')),''),
      nullif(trim(coalesce(v_r->>'pipeline_status','')),''),
      nullif(trim(coalesce(v_r->>'status','')),''), 'planlandi'));
  begin
    v_durum := case
      when v_ham in ('yolda','yola_cikti') then 'YOLDA'
      when v_ham in ('vardi','varis') then 'VARDI'
      when v_ham in ('calisiyor','serviste','islemde') then 'CALISIYOR'
      when v_ham in ('bitti','tamamlandi','yapildi','servis_tamamlandi','kapandi','kapali') then 'BITTI'
      when v_ham in ('iptal','canceled','cancelled') then 'IPTAL'
      else 'PLANLANDI' end;
  end;

  return jsonb_build_object(
    'bulundu', true,
    'kaynak', v_kaynak,
    'durum', v_durum,
    'musteri', v_musteri,
    'vinc', coalesce(
      nullif(trim(coalesce(v_r->>'vinc','')),''),
      nullif(trim(coalesce(v_r->>'vinc_bilgisi','')),''),
      nullif(trim(coalesce(v_r->>'machine_info','')),''), ''),
    'teknisyen', coalesce(
      nullif(trim(coalesce(v_r->>'teknisyen','')),''),
      nullif(trim(coalesce(v_r->>'atanan_personel','')),''),
      nullif(trim(coalesce(v_r->>'assigned_team','')),''),
      nullif(trim(coalesce(v_r->>'technician','')),''), ''),
    -- ⭐ VARIŞ SAATLERİ
    'tahmini_varis', coalesce(v_r->>'tahmini_varis', v_r->>'randevu_saati'),
    'yola_cikis', v_r->>'yola_cikis',
    'varis', v_r->>'varis',
    'bitis', coalesce(v_r->>'bitis', v_r->>'tamamlanma_tarihi', v_r->>'updated_at'),
    'konum_guncelleme', coalesce(v_r->>'konum_guncelleme', v_r->>'guncelleme', v_r->>'updated_at'),
    'guncelleme', coalesce(v_r->>'guncelleme', v_r->>'updated_at', v_r->>'created_at'),
    'musteri_notu', coalesce(nullif(trim(coalesce(v_r->>'musteri_notu','')),''), ''),
    'randevu_tarihi', coalesce(v_r->>'randevu_tarihi', v_r->>'tarih')
  );
end $$;

-- ⭐ İZİNLER — girişsiz müşteri erişimi ŞART
revoke all on function public.is_durumu(uuid) from public;
grant execute on function public.is_durumu(uuid) to anon;
grant execute on function public.is_durumu(uuid) to authenticated;
grant execute on function public.is_durumu(uuid) to service_role;


-- ============================================================================
-- 4) 🧪 TEST — is_takip kayıtları artık bulunuyor mu?
-- ============================================================================
select
  t.id::text                             as takip_id,
  public.is_durumu(t.id) ->> 'bulundu'    as bulundu,
  public.is_durumu(t.id) ->> 'kaynak'     as kaynak,
  public.is_durumu(t.id) ->> 'musteri'    as musteri,
  public.is_durumu(t.id) ->> 'durum'      as durum,
  public.is_durumu(t.id) ->> 'teknisyen'  as teknisyen
from public.is_takip t
order by coalesce(t.created_at, now()) desc
limit 10;


-- ============================================================================
-- 5) 🧪 SENİN ÖLÜ LİNKLERİN — artık bulunuyor mu?
-- ============================================================================
select
  'e95816ec-e74f-4587-88dd-82a10c5647e0' as link_id,
  public.is_durumu('e95816ec-e74f-4587-88dd-82a10c5647e0'::uuid) as veri
union all
select '89bad23b-dfbc-4b85-99ac-94998d92c6f4',
  public.is_durumu('89bad23b-dfbc-4b85-99ac-94998d92c6f4'::uuid)
union all
select '38e73d31-0d9d-4a1c-89df-80696e05551b',
  public.is_durumu('38e73d31-0d9d-4a1c-89df-80696e05551b'::uuid);


-- ============================================================================
-- 6) ✅ ÖLÜ TAKİP KAYITLARINI TEMİZLE (isteğe bağlı — yorumlu)
-- ============================================================================
-- Aşağıdaki satırı açarsan, 90 günden eski BİTMİŞ takip kayıtları silinir.
-- (Müşteri linkleri artık çalışmayacak — ama zaten bitmiş işler)
--
-- delete from public.is_takip
--  where durum in ('BITTI','IPTAL')
--    and coalesce(created_at, now()) < now() - interval '90 days';
