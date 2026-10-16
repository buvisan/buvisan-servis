-- ============================================================================
--  🔍 CANLI TAKİP FONKSİYONLARI — KAYNAK KODLARI (Güncelleme #87)
-- ----------------------------------------------------------------------------
--  SORU: /admin/takip sayfası hangi tabloyu kullanıyor?
--        aktif_takipler() · takip_baslat() · takip_guncelle() · takip_mesaji()
--
--  BU SCRIPT: 4 fonksiyonun TAM KAYNAK KODUNU gösterir
--             + hangi tabloları kullandığını listeler
--
--  KULLANIM: 114'ten SONRA çalıştır.
-- ============================================================================

-- 1) Fonksiyonlar VAR MI? Hangi tabloları kullanıyor?
select
  p.proname                                  as fonksiyon,
  pg_get_function_arguments(p.oid)            as parametreler,
  pg_get_function_result(p.oid)               as donus_tipi,
  case when p.prosecdef then 'SECURITY DEFINER' else 'normal' end as guvenlik,
  l.lanname                                   as dil
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and p.proname in ('aktif_takipler','takip_baslat','takip_guncelle','takip_mesaji','is_durumu')
order by p.proname;


-- 2) AKTİF TAKİPLER — şu an ne dönüyor?
select public.aktif_takipler() as aktif_takipler_verisi;


-- 3) FONKSİYON KAYNAK KODLARI (hangi tablo?)
select
  p.proname as fonksiyon,
  pg_get_functiondef(p.oid) as kaynak_kod
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('takip_baslat','takip_mesaji')
order by p.proname;


-- 4) TAKİP İLE İLGİLİ TÜM TABLOLAR + KAYIT SAYILARI
do $$
declare
  v_t record;
  v_adet bigint;
begin
  raise notice ' ';
  raise notice '═══════ TAKİP TABLOLARI ═══════';

  for v_t in
    select table_name from information_schema.tables
    where table_schema='public'
      and (table_name like '%takip%' or table_name like '%track%' or table_name like '%canli%')
    order by table_name
  loop
    begin
      execute format('select count(*) from public.%I', v_t.table_name) into v_adet;
      raise notice '  • % → % kayıt', rpad(v_t.table_name, 26), v_adet;
    exception when others then
      raise notice '  • % → okunamadı', v_t.table_name;
    end;
  end loop;

  raise notice '═══════════════════════════════';
end $$;


-- 5) ÖLÜ LİNKLERİ TESPİT ET — takip kaydı var ama randevu/talep yok
do $$
declare
  v_r record;
  v_sayac integer := 0;
begin
  raise notice ' ';
  raise notice '═══════ ÖLÜ TAKİP LİNKLERİ ═══════';

  -- randevular tablosundaki takip kaydı olmayanlar
  for v_r in
    select r.id::text as id, public.randevu_isim(to_jsonb(r)) as musteri
    from public.randevular r
    where public.is_durumu(r.id) ->> 'bulundu' = 'false'
    limit 10
  loop
    raise notice '  ❌ Randevu takip edilemiyor: % (%)', v_r.id, v_r.musteri;
    v_sayac := v_sayac + 1;
  end loop;

  if v_sayac = 0 then
    raise notice '  ✅ Tüm randevular takip edilebilir';
  end if;
  raise notice '══════════════════════════════════';
end $$;
