-- ============================================================================
--  📍 TAKİP FONKSİYONU KESİN DÜZELTME (Güncelleme #86)
-- ----------------------------------------------------------------------------
--  BULGULAR (113 teşhisinden):
--    • Takip linkleri service_tickets tablosundan geliyor
--    • Gerçek linkler: 38e73d31-... e32c4343-... 8a5a09dc-... 89bad23b-...
--    • Ama hepsi "Takip Bulunamadı" diyor → is_durumu() HATA VERİYOR
--    • Müşteri adı/durum yanlış okunuyor ("acil_cozum" çıkıyor)
--
--  ÇÖZÜM:
--    1) ESKİ is_durumu sürümlerini TAMAMEN SİL (overload çakışması)
--    2) Temiz uuid sürümü oluştur
--    3) service_tickets'ın GERÇEK sütunlarını kullan
--    4) anon + authenticated izni ver
--    5) GERÇEK ID ile test et
--
--  KULLANIM: 113'ten SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 🗑️ ESKİ is_durumu SÜRÜMLERİNİ SİL (tüm imzalar)
-- ============================================================================
do $$
declare
  v_r record;
  v_sayac integer := 0;
begin
  raise notice ' ';
  raise notice '═══════ ESKİ FONKSİYONLAR SİLİNİYOR ═══════';

  for v_r in
    select p.oid::regprocedure as imza
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_durumu'
  loop
    begin
      execute 'drop function if exists ' || v_r.imza || ' cascade';
      raise notice '  🗑️ Silindi: %', v_r.imza;
      v_sayac := v_sayac + 1;
    exception when others then
      raise notice '  ⚠️ Silinemedi: % → %', v_r.imza, sqlerrm;
    end;
  end loop;

  raise notice 'Silinen: %', v_sayac;
  raise notice '════════════════════════════════════════';
end $$;


-- ============================================================================
-- 2) 📋 service_tickets GERÇEK SÜTUNLARI (hangi alan ne?)
-- ============================================================================
select string_agg(column_name, ', ' order by ordinal_position) as service_tickets_sutunlari
from information_schema.columns
where table_schema='public' and table_name='service_tickets';


-- ============================================================================
-- 3) 📍 is_durumu() — TEMİZ SÜRÜM (uuid)
-- ============================================================================
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
  v_durum_ham text;
  v_durum text;
  v_musteri text;
begin
  -- Önce RANDEVULAR
  begin
    select to_jsonb(r) into v_r from public.randevular r where r.id = p_id limit 1;
    if v_r is not null then v_kaynak := 'randevular'; end if;
  exception when others then v_r := null; end;

  -- Sonra SERVICE_TICKETS
  if v_r is null then
    begin
      select to_jsonb(t) into v_r from public.service_tickets t where t.id = p_id limit 1;
      if v_r is not null then v_kaynak := 'service_tickets'; end if;
    exception when others then v_r := null; end;
  end if;

  if v_r is null then
    return jsonb_build_object('bulundu', false);
  end if;

  -- MÜŞTERİ ADI — gerçek alanlar (musteri_adi → manual_customer_name → firma_adi)
  v_musteri := coalesce(
    nullif(trim(coalesce(v_r->>'musteri_adi','')),''),
    nullif(trim(coalesce(v_r->>'manual_customer_name','')),''),
    nullif(trim(coalesce(v_r->>'customer_name','')),''),
    nullif(trim(coalesce(v_r->>'firma_adi','')),''),
    nullif(trim(coalesce(v_r->>'musteri','')),''),
    '');

  -- DURUM — pipeline_status → durum → status sırasıyla
  v_durum_ham := public.parca_adi_normal(coalesce(
    nullif(trim(coalesce(v_r->>'pipeline_status','')),''),
    nullif(trim(coalesce(v_r->>'durum','')),''),
    nullif(trim(coalesce(v_r->>'status','')),''), 'planlandi'));

  v_durum := case
    when v_durum_ham in ('planlandi','bekliyor','yeni','acil_cozum','acil') then
      case when v_durum_ham in ('acil_cozum','acil') then 'PLANLANDI' else 'PLANLANDI' end
    when v_durum_ham in ('yolda','yola_cikti') then 'YOLDA'
    when v_durum_ham in ('vardi','varis') then 'VARDI'
    when v_durum_ham in ('calisiyor','serviste','islemde') then 'CALISIYOR'
    when v_durum_ham in ('tamamlandi','yapildi','bitti','servis_tamamlandi','kapandi','kapali') then 'BITTI'
    when v_durum_ham in ('iptal','canceled','cancelled') then 'IPTAL'
    else 'PLANLANDI' end;

  return jsonb_build_object(
    'bulundu', true,
    'kaynak', v_kaynak,
    'durum', v_durum,
    'musteri', coalesce(nullif(v_musteri,''), 'Değerli Müşterimiz'),
    'vinc', coalesce(
      nullif(trim(coalesce(v_r->>'vinc_bilgisi','')),''),
      nullif(trim(coalesce(v_r->>'machine_info','')),''), ''),
    'teknisyen', coalesce(
      nullif(trim(coalesce(v_r->>'atanan_personel','')),''),
      nullif(trim(coalesce(v_r->>'assigned_team','')),''),
      nullif(trim(coalesce(v_r->>'technician','')),''), ''),
    'tahmini_varis', coalesce(v_r->>'tahmini_varis', v_r->>'randevu_saati'),
    'yola_cikis', v_r->>'yola_cikis',
    'varis', v_r->>'varis',
    'bitis', coalesce(v_r->>'bitis', v_r->>'tamamlanma_tarihi', v_r->>'updated_at'),
    'konum_guncelleme', coalesce(v_r->>'guncelleme', v_r->>'updated_at'),
    'guncelleme', coalesce(v_r->>'guncelleme', v_r->>'updated_at', v_r->>'created_at'),
    'musteri_notu', coalesce(nullif(trim(coalesce(v_r->>'musteri_notu','')),''), ''),
    'randevu_tarihi', v_r->>'randevu_tarihi'
  );
end $$;

-- ⭐ İZİNLER — girişsiz erişim şart
revoke all on function public.is_durumu(uuid) from public;
grant execute on function public.is_durumu(uuid) to anon;
grant execute on function public.is_durumu(uuid) to authenticated;
grant execute on function public.is_durumu(uuid) to service_role;


-- ============================================================================
-- 4) 🧪 TEST — GERÇEK takip linkleriyle
-- ============================================================================
select
  t.id::text                                  as ticket_id,
  public.is_durumu(t.id) ->> 'bulundu'         as bulundu,
  public.is_durumu(t.id) ->> 'kaynak'          as kaynak,
  public.is_durumu(t.id) ->> 'musteri'         as musteri,
  public.is_durumu(t.id) ->> 'durum'           as durum,
  public.is_durumu(t.id) ->> 'teknisyen'       as teknisyen
from public.service_tickets t
order by coalesce(to_jsonb(t)->>'created_at','') desc
limit 8;


-- ============================================================================
-- 5) 🧪 SENİN GÖRDÜĞÜN LİNKLER
-- ============================================================================
select
  'e95816ec-e74f-4587-88dd-82a10c5647e0' as link_id,
  public.is_durumu('e95816ec-e74f-4587-88dd-82a10c5647e0'::uuid) as veri
union all
select '38e73d31-0d9d-4a1c-89df-80696e05551b',
  public.is_durumu('38e73d31-0d9d-4a1c-89df-80696e05551b'::uuid)
union all
select '89bad23b-dfbc-4b85-99ac-94998d92c6f4',
  public.is_durumu('89bad23b-dfbc-4b85-99ac-94998d92c6f4'::uuid);
