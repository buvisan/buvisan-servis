-- ============================================================================
--  🔍 TAKİP LİNKİ KAYDINI TÜM TABLOLARDA ARA (Güncelleme #85)
-- ----------------------------------------------------------------------------
--  DURUM: is_durumu('e95816ec-...') → {"bulundu": false}
--         Yani o kayıt NE randevular NE service_tickets tablosunda.
--
--  BU SCRIPT: o UUID'yi TÜM public tablolarında arar ve nerede olduğunu söyler
--
--  KULLANIM: 112'den SONRA çalıştır.
-- ============================================================================

-- ============================================================================
-- 1) 🎯 VERİLEN UUID HANGİ TABLODA? (tüm id sütunlarını tarar)
-- ============================================================================
do $$
declare
  v_hedef uuid := 'e95816ec-e74f-4587-88dd-82a10c5647e0';
  v_tablo record;
  v_adet integer;
  v_bulundu integer := 0;
begin
  raise notice ' ';
  raise notice '═══════ ARANAN: % ═══════', v_hedef;

  for v_tablo in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and data_type = 'uuid'
      and column_name in ('id','kayit_id','randevu_id','ticket_id','is_id','takip_id','crane_id')
    order by table_name, column_name
  loop
    begin
      execute format('select count(*) from public.%I where %I = $1', v_tablo.table_name, v_tablo.column_name)
        into v_adet using v_hedef;
      if v_adet > 0 then
        raise notice '✅ BULUNDU → %.%  (% kayıt)', v_tablo.table_name, v_tablo.column_name, v_adet;
        v_bulundu := v_bulundu + 1;
      end if;
    exception when others then null; end;
  end loop;

  if v_bulundu = 0 then
    raise notice '❌ HİÇBİR TABLODA BULUNAMADI';
    raise notice '   → Bu kayıt silinmiş veya başka bir sistemden geliyor.';
  else
    raise notice '─────────';
    raise notice 'Toplam % yerde bulundu', v_bulundu;
  end if;
  raise notice '═══════════════════════════════════════';
end $$;


-- ============================================================================
-- 2) 🔍 UUID BENZERİ KAYIT — ilk 8 karakter eşleşen var mı?
-- ============================================================================
do $$
declare
  v_on text := 'e95816ec';
  v_tablo record;
  v_adet integer;
begin
  raise notice ' ';
  raise notice '═══════ "%" İLE BAŞLAYAN KAYITLAR ═══════', v_on;

  for v_tablo in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public' and data_type = 'uuid'
      and column_name = 'id'
    order by table_name
  loop
    begin
      execute format('select count(*) from public.%I where %I::text like $1', v_tablo.table_name, v_tablo.column_name)
        into v_adet using v_on || '%';
      if v_adet > 0 then
        raise notice '  • % → % kayıt', v_tablo.table_name, v_adet;
      end if;
    exception when others then null; end;
  end loop;
  raise notice '═══════════════════════════════════════';
end $$;


-- ============================================================================
-- 3) 📋 TAKİP İLE İLGİLİ TABLOLAR (isim benzerliği)
-- ============================================================================
select table_name
from information_schema.tables
where table_schema = 'public'
  and (table_name like '%takip%' or table_name like '%track%' or table_name like '%canli%'
       or table_name like '%durum%' or table_name like '%randevu%')
order by table_name;


-- ============================================================================
-- 4) 📋 SERVICE_TICKETS SÜTUNLARI (takip linki buradan geliyor olabilir)
-- ============================================================================
select string_agg(column_name || ' (' || data_type || ')', ', ' order by ordinal_position) as service_tickets_sutunlari
from information_schema.columns
where table_schema='public' and table_name='service_tickets';


-- ============================================================================
-- 5) 🔍 RANDEVULAR'DA EN SON 5 KAYIT (takip linki için gerçek ID'ler)
-- ============================================================================
select
  r.id                                   as randevu_id,
  'https://servis.buvisan.com/takip/' || r.id::text as takip_linki,
  public.randevu_isim(to_jsonb(r))        as musteri,
  coalesce(to_jsonb(r)->>'durum','?')      as durum,
  to_jsonb(r)->>'randevu_tarihi'           as tarih
from public.randevular r
order by coalesce(to_jsonb(r)->>'created_at','') desc
limit 5;


-- ============================================================================
-- 6) 🔍 SERVICE_TICKETS'TE EN SON 5 KAYIT
-- ============================================================================
select
  t.id                                   as ticket_id,
  'https://servis.buvisan.com/takip/' || t.id::text as takip_linki,
  public.randevu_isim(to_jsonb(t))        as musteri,
  coalesce(public.jalan(to_jsonb(t),'pipeline_status','status','durum'),'?') as durum,
  left(coalesce(to_jsonb(t)->>'created_at',''), 19) as olusturma
from public.service_tickets t
order by coalesce(to_jsonb(t)->>'created_at','') desc
limit 5;
