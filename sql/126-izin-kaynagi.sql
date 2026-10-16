-- ============================================================================
--  🏖️ İZİN VE MESAİ VERİ KAYNAĞI (Güncelleme #98)
-- ----------------------------------------------------------------------------
--  SORUN: Veysel'e 1 gün izin verildi ama personel karnesinde görünmüyor
--
--  ŞU AN OKUDUĞUM: puantaj_gunluk.izin_mi
--  KONTROL: Bu alan doğru mu? İzin başka tabloda mı?
--
--  KULLANIM: 125'ten SONRA çalıştır.
-- ============================================================================

-- 1) 📋 puantaj_gunluk SÜTUNLARI
select string_agg(column_name || ' (' || data_type || ')', ', ' order by ordinal_position) as puantaj_sutunlari
from information_schema.columns
where table_schema='public' and table_name='puantaj_gunluk';

-- 2) 📋 İZİN İLE İLGİLİ TABLOLAR
select table_name
from information_schema.tables
where table_schema='public'
  and (table_name like '%izin%' or table_name like '%tatil%' or table_name like '%leave%'
       or table_name like '%puantaj%' or table_name like '%personel%')
order by table_name;

-- 3) 🔍 VEYSEL'İN PUANTAJ KAYITLARI (bu ay)
select
  g.tarih,
  g.personel,
  g.normal_saat, g.mesai50_saat, g.mesai100_saat,
  coalesce(to_jsonb(g)->>'izin_mi','?')     as izin_mi,
  coalesce(to_jsonb(g)->>'izin_turu','')    as izin_turu,
  coalesce(to_jsonb(g)->>'aciklama','')     as aciklama
from public.puantaj_gunluk g
where to_char(g.tarih,'YYYY-MM') = to_char(current_date,'YYYY-MM')
  and public.parca_adi_normal(g.personel) like '%veysel%'
order by g.tarih desc
limit 15;

-- 4) 🔍 TÜM PUANTAJ'DA izin_mi DOLU OLAN VAR MI?
select
  g.personel,
  count(*) as toplam_kayit,
  count(*) filter (where coalesce(g.izin_mi,false)) as izinli_gun,
  min(g.tarih) as ilk, max(g.tarih) as son
from public.puantaj_gunluk g
group by g.personel
order by 3 desc, 1;

-- 5) 🔍 PUANTAJ_MANUEL TABLOSU (izin orada olabilir)
do $$
declare v_adet bigint;
begin
  begin
    execute 'select count(*) from public.puantaj_manuel' into v_adet;
    raise notice '📋 puantaj_manuel → % kayıt', v_adet;
  exception when others then
    raise notice '⚠️ puantaj_manuel okunamadı';
  end;
end $$;

select
  column_name || ' (' || data_type || ')'
from information_schema.columns
where table_schema='public' and table_name='puantaj_manuel'
order by ordinal_position;

-- 6) 🔍 PERSONEL_TALEPLER (izin talebi orada olabilir)
select
  string_agg(column_name, ', ' order by ordinal_position) as personel_talepler_sutunlari
from information_schema.columns
where table_schema='public' and table_name='personel_talepler';

-- 7) 🔍 İZİN KAYITLARI — içinde "izin" geçen her şey
do $$
declare
  v_t record;
  v_adet bigint;
  v_kolon text;
begin
  raise notice ' ';
  raise notice '═══════ İZİN KAYITLARI ARAŞTIRMASI ═══════';

  for v_t in
    select table_name from information_schema.tables
    where table_schema='public'
      and table_name in ('puantaj_gunluk','puantaj_manuel','personel_talepler','personel_maas','izinler','personel_izin')
    order by table_name
  loop
    begin
      execute format('select count(*) from public.%I', v_t.table_name) into v_adet;
      raise notice '  📋 % → % kayıt', rpad(v_t.table_name, 22), v_adet;
    exception when others then null; end;
  end loop;

  raise notice '═══════════════════════════════════════════';
end $$;
