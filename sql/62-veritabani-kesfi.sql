-- ============================================================================
--  🔍 VERİTABANI KEŞFİ — Gerçek sütun isimleri (Güncelleme #42)
-- ----------------------------------------------------------------------------
--  NEDEN BU SCRIPT?
--    Asistan "customer_name" sütununu aradı → YOK. Fonksiyon sessizce atlandı
--    → teklif motoru 0 buldu. Aynı sorun başka yerlerde de olabilir.
--
--  NE YAPAR?
--    Asistanın kullandığı tüm tabloların GERÇEK sütun isimlerini listeler.
--    Böylece yanlış varsayımları düzeltiriz.
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) ASİSTANIN İHTİYAÇ DUYDUĞU TÜM TABLOLARIN SÜTUNLARI
-- ============================================================================
select
  table_name,
  string_agg(column_name, ', ' order by ordinal_position) as sutunlar
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'completed_services','cranes','service_reports','service_tickets',
    'materials','appointments','cari_hesaplar','maintenance_contracts',
    'quotes','teklif_bekleyenler','personel_talepler'
  )
group by table_name
order by table_name;


-- ============================================================================
-- 2) ÖZELLİKLE ARA DIĞIMIZ SÜTUNLAR VAR MI?
-- ============================================================================
with aranan(tablo, sutun, ne_icin) as (
  values
    ('completed_services', 'customer_name',   'Müşteri adı'),
    ('completed_services', 'firm_name',       'Müşteri adı (alternatif)'),
    ('completed_services', 'customer',        'Müşteri adı (alternatif 2)'),
    ('completed_services', 'service_type',    'Servis türü (periyodik yakalama)'),
    ('completed_services', 'description',     'Açıklama (arıza özeti)'),
    ('completed_services', 'service_date',    'Servis tarihi'),
    ('completed_services', 'price',           'Ücret'),
    ('completed_services', 'technician',      'Personel'),
    ('completed_services', 'materials',       'Kullanılan malzemeler'),
    ('cranes',             'customer_name',   'Vinç müşterisi'),
    ('cranes',             'customer_phone',  'Müşteri telefonu'),
    ('cranes',             'location_address','Vinç adresi'),
    ('cranes',             'next_maintenance_date', 'Bakım tarihi'),
    ('materials',          'stock_quantity',  'Stok miktarı'),
    ('materials',          'min_stock',       'Minimum stok'),
    ('materials',          'stock',           'Stok (alternatif)'),
    ('materials',          'buy_price',       'Alış fiyatı'),
    ('service_reports',    'musteri_puani',   'Memnuniyet puanı'),
    ('service_reports',    'musteri_yorumu',  'Memnuniyet yorumu'),
    ('service_reports',    'ticket_id',       'İş emri bağlantısı'),
    ('appointments',       'appointment_date','Randevu tarihi'),
    ('appointments',       'status',          'Randevu durumu')
)
select
  a.tablo,
  a.sutun,
  a.ne_icin,
  case when c.column_name is not null then '✅ VAR' else '❌ YOK' end as durum,
  coalesce(c.data_type, '-') as tip
from aranan a
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = a.tablo and c.column_name = a.sutun
order by (c.column_name is null) desc, a.tablo, a.sutun;


-- ============================================================================
-- 3) SERVİS TÜRLERİ — periyodik yakalama için gerçek değerler
-- ============================================================================
select
  coalesce(service_type, '(boş)') as servis_turu,
  count(*) as adet,
  count(*) filter (where service_date::date > current_date - 90) as son_90_gun
from public.completed_services
group by coalesce(service_type, '(boş)')
order by count(*) desc
limit 30;


-- ============================================================================
-- 4) MEMNUNİYET PUANLARI (sütun adı doğruysa)
-- ============================================================================
do $$
declare
  v_adet bigint;
begin
  begin
    execute 'select count(*) from public.service_reports where musteri_puani is not null' into v_adet;
    raise notice '✅ Memnuniyet puanı ÇALIŞIYOR — % adet puanlanmış iş', v_adet;
  exception when others then
    raise notice '❌ Memnuniyet puanı hatası: %', sqlerrm;
  end;

  begin
    execute 'select count(*) from public.completed_services where customer_name is not null' into v_adet;
    raise notice '✅ completed_services.customer_name VAR (% kayıt)', v_adet;
  exception when others then
    raise notice '❌ completed_services.customer_name YOK → %', sqlerrm;
  end;

  begin
    execute 'select count(*) from public.materials where stock_quantity is not null' into v_adet;
    raise notice '✅ materials.stock_quantity VAR (% kayıt)', v_adet;
  exception when others then
    raise notice '❌ materials.stock_quantity YOK → %', sqlerrm;
  end;
end $$;
