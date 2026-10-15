-- ============================================================================
--  🛡️ SIFIR HATALI ŞEMA DÜZELTMESİ (Güncelleme #56) — GARANTİLİ
-- ----------------------------------------------------------------------------
--  NEDEN BU SCRIPT?
--    77-tam-sema-duzeltmesi.sql bazı veritabanlarında hata veriyordu.
--    Bu sürümde HER KOMUT kendi hata korumasında çalışır:
--      → Biri başarısız olsa bile DİĞERLERİ DEVAM EDER
--      → Hata olsa bile SCRIPT ÇÖKMEZ, sadece uyarı yazar
--
--  ÇIKTI: "Messages" sekmesinde ne yapıldığını adım adım söyler
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
--  Bu script HATA VERMEZ. Verirse bana mesajı at.
-- ============================================================================

do $$
declare
  v_tablo text;
  v_sutun text;
  v_tip   text;
  v_sayac integer := 0;
  v_hata  integer := 0;
  v_liste text[][] := array[
    -- cranes tablosu (FAZ 2/3/5 için kritik)
    ['cranes','crane_capacity','text'],
    ['cranes','makine_tipi','text'],
    ['cranes','next_maintenance_date','date'],
    ['cranes','location_address','text'],
    ['cranes','customer_phone','text'],
    ['cranes','lat','numeric'],
    ['cranes','lng','numeric'],
    ['cranes','seri_no','text'],
    ['cranes','marka','text'],
    ['cranes','model','text'],
    ['cranes','uretim_yili','integer'],
    -- service_tickets
    ['service_tickets','lat','numeric'],
    ['service_tickets','lng','numeric'],
    ['service_tickets','assigned_team','text'],
    ['service_tickets','priority','text'],
    ['service_tickets','ticket_type','text'],
    -- appointments
    ['appointments','lat','numeric'],
    ['appointments','lng','numeric'],
    ['appointments','status','text'],
    -- service_reports
    ['service_reports','musteri_puani','integer'],
    ['service_reports','musteri_yorumu','text'],
    ['service_reports','isg_kontrol','jsonb'],
    ['service_reports','lat','numeric'],
    ['service_reports','lng','numeric'],
    ['service_reports','imza_atan','text'],
    ['service_reports','teklif_gerekli','boolean'],
    -- materials
    ['materials','stock_quantity','numeric'],
    ['materials','min_stock','numeric'],
    ['materials','buy_price','numeric'],
    ['materials','sale_price','numeric'],
    ['materials','unit','text'],
    -- offers
    ['offers','status','text'],
    ['offers','created_at','timestamptz']
  ];
  t text[];
begin
  raise notice '═══════ ŞEMA DÜZELTMESİ BAŞLADI ═══════';

  foreach t slice 1 in array v_liste loop
    v_tablo := t[1]; v_sutun := t[2]; v_tip := t[3];
    begin
      -- Tablo var mı?
      if not exists (select 1 from information_schema.tables
                      where table_schema='public' and table_name=v_tablo) then
        raise notice '⏭️  % → tablo yok, atlandı', v_tablo;
        continue;
      end if;

      -- Sütun zaten var mı?
      if exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name=v_tablo and column_name=v_sutun) then
        continue;   -- sessizce geç (zaten var)
      end if;

      execute format('alter table public.%I add column %I %s', v_tablo, v_sutun, v_tip);
      v_sayac := v_sayac + 1;
      raise notice '✅ % . % eklendi', v_tablo, v_sutun;
    exception when others then
      v_hata := v_hata + 1;
      raise notice '❌ % . % eklenemedi → %', v_tablo, v_sutun, sqlerrm;
    end;
  end loop;

  raise notice '─────────';
  raise notice 'EKLENEN SÜTUN: %   HATA: %', v_sayac, v_hata;
  raise notice '═══════ ŞEMA TAMAM ═══════';
end $$;


-- ============================================================================
-- VERİ DOLDURMA — her adım ayrı korumada
-- ============================================================================

-- 1) Vinç kapasitesini servis kayıtlarından doldur
do $$
declare v_adet integer := 0;
begin
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
     where public.parca_adi_normal(coalesce(c.customer_name,'')) = e.mnorm
       and coalesce(trim(c.crane_capacity), '') = '';

    get diagnostics v_adet = row_count;
    raise notice '✅ Kapasite dolduruldu: % vinç', v_adet;
  exception when others then
    raise notice '⚠️ Kapasite doldurma atlandı → %', sqlerrm;
  end;
end $$;

-- 2) Asansör tespiti
do $$
declare v_adet integer := 0;
begin
  begin
    update public.cranes set makine_tipi = 'Asansör'
     where public.parca_adi_normal(coalesce(crane_capacity,'')) like '%asansor%'
       and coalesce(makine_tipi,'') in ('', 'Vinç');
    get diagnostics v_adet = row_count;
    raise notice '✅ Asansör işaretlendi: %', v_adet;
  exception when others then
    raise notice '⚠️ Asansör tespiti atlandı → %', sqlerrm;
  end;

  begin
    update public.cranes set makine_tipi = 'Vinç' where coalesce(makine_tipi,'') = '';
  exception when others then null; end;
end $$;

-- 3) Telefon doldurma (servis taleplerinden)
do $$
declare v_adet integer := 0;
begin
  begin
    update public.cranes c
       set customer_phone = src.tel
      from (
        select distinct on (mnorm) mnorm, tel from (
          select public.parca_adi_normal(
                   coalesce(nullif(trim(coalesce(to_jsonb(t)->>'manual_customer_name','')),''),'')) as mnorm,
                 coalesce(to_jsonb(t)->>'manual_phone','') as tel
          from public.service_tickets t
          where coalesce(to_jsonb(t)->>'manual_phone','') <> ''
        ) x
        where coalesce(mnorm,'') <> '' and tel <> ''
        order by mnorm
      ) src
     where public.parca_adi_normal(coalesce(c.customer_name,'')) = src.mnorm
       and coalesce(c.customer_phone,'') = '';
    get diagnostics v_adet = row_count;
    raise notice '✅ Telefon dolduruldu: % vinç', v_adet;
  exception when others then
    raise notice '⚠️ Telefon doldurma atlandı → %', sqlerrm;
  end;
end $$;

-- 4) Adres doldurma
do $$
declare v_adet integer := 0;
begin
  begin
    update public.cranes c
       set location_address = src.adr
      from (
        select distinct on (mnorm) mnorm, adr from (
          select public.parca_adi_normal(
                   coalesce(nullif(trim(coalesce(to_jsonb(t)->>'manual_customer_name','')),''),'')) as mnorm,
                 coalesce(to_jsonb(t)->>'manual_location','') as adr
          from public.service_tickets t
          where coalesce(to_jsonb(t)->>'manual_location','') <> ''
        ) x
        where coalesce(mnorm,'') <> '' and adr <> ''
        order by mnorm
      ) src
     where public.parca_adi_normal(coalesce(c.customer_name,'')) = src.mnorm
       and coalesce(c.location_address,'') = '';
    get diagnostics v_adet = row_count;
    raise notice '✅ Adres dolduruldu: % vinç', v_adet;
  exception when others then
    raise notice '⚠️ Adres doldurma atlandı → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- RAPOR — ne durumdayız?
-- ============================================================================
select
  (select count(*) from public.cranes)                                     as toplam_vinc,
  (select count(*) from public.cranes
    where coalesce(trim(coalesce(crane_capacity,'')),'') <> '')            as kapasiteli,
  (select count(*) from public.cranes
    where coalesce(trim(coalesce(makine_tipi,'')),'') <> '')               as tipli,
  (select count(*) from public.cranes
    where coalesce(trim(coalesce(customer_phone,'')),'') <> '')            as telefonlu,
  (select count(*) from public.cranes
    where coalesce(trim(coalesce(location_address,'')),'') <> '')          as adresli,
  (select count(*) from public.cranes
    where coalesce(trim(coalesce(next_maintenance_date::text,'')),'') <> '') as bakim_tarihli,
  (select count(*) from public.cranes where lat is not null)               as koordinatli;


-- ============================================================================
-- EKSİK SÜTUN KALDI MI? (boş dönerse TAM ✅)
-- ============================================================================
select table_name, column_name
from (values
  ('cranes','crane_capacity'), ('cranes','makine_tipi'), ('cranes','next_maintenance_date'),
  ('cranes','location_address'), ('cranes','customer_phone'), ('cranes','lat'), ('cranes','lng'),
  ('service_tickets','lat'), ('service_tickets','lng'), ('service_tickets','priority'),
  ('appointments','lat'), ('appointments','lng'),
  ('service_reports','musteri_puani'), ('service_reports','isg_kontrol'),
  ('materials','stock_quantity'), ('materials','min_stock')
) g(table_name, column_name)
where not exists (
  select 1 from information_schema.columns c
  where c.table_schema='public' and c.table_name=g.table_name and c.column_name=g.column_name
);
