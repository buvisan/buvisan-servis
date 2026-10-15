-- ============================================================================
--  🔬 DEV PAKET SAĞLIK KONTROLÜ (Güncelleme #53)
-- ----------------------------------------------------------------------------
--  NE YAPAR?
--    1) Gerekli TÜM sütunları kontrol eder → eksik olanı söyler
--    2) TÜM FAZ fonksiyonlarını tek tek test eder → çalışıyor/çalışmıyor
--    3) Hata varsa GERÇEK hata mesajını gösterir
--    4) Sonunda "KAÇ TANE ÇALIŞIYOR" özeti verir
--
--  KULLANIM: Bu scripti çalıştır → çıkan raporu bana at.
--            Hangi fonksiyon çalışmıyorsa, hatasını görüp düzeltirim.
--
--  ⚠️ Veri değiştirmez, sadece TEST eder.
-- ============================================================================


-- ============================================================================
-- 1) GEREKLİ SÜTUNLAR VAR MI?
-- ============================================================================
with gerekli(tablo, sutun) as (
  values
    ('cranes','crane_capacity'), ('cranes','makine_tipi'),
    ('cranes','next_maintenance_date'), ('cranes','location_address'),
    ('cranes','customer_phone'), ('cranes','lat'), ('cranes','lng'),
    ('cranes','customer_name'),
    ('service_tickets','lat'), ('service_tickets','lng'),
    ('service_tickets','priority'), ('service_tickets','assigned_team'),
    ('service_tickets','manual_customer_name'), ('service_tickets','pipeline_status'),
    ('appointments','lat'), ('appointments','lng'), ('appointments','status'),
    ('service_reports','musteri_puani'), ('service_reports','musteri_yorumu'),
    ('service_reports','isg_kontrol'), ('service_reports','lat'), ('service_reports','lng'),
    ('materials','stock_quantity'), ('materials','min_stock'),
    ('materials','buy_price'), ('materials','sale_price'),
    ('completed_services','crane_capacity'), ('completed_services','technician'),
    ('completed_services','materials'), ('completed_services','service_date'),
    ('offers','status')
)
select
  g.tablo,
  g.sutun,
  case when c.column_name is not null then '✅' else '❌ EKSİK' end as durum
from gerekli g
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = g.tablo and c.column_name = g.sutun
where c.column_name is null          -- SADECE EKSİKLERİ GÖSTER
order by g.tablo, g.sutun;

-- (Boş dönerse → tüm sütunlar TAM ✅)


-- ============================================================================
-- 2) FONKSİYONLAR VAR MI?
-- ============================================================================
select
  f.ad,
  case when p.proname is not null then '✅ VAR' else '❌ YOK' end as durum
from (values
  ('kokpit_ozet'), ('is_oncelik_skoru'), ('oncelik_kuyrugu'),
  ('vinc_saglik_skoru'), ('vinc_saglik_listesi'), ('ariza_kehanet'),
  ('parca_omur_analizi'), ('kurumsal_hafiza'), ('model_analizi'),
  ('bakim_durumu'), ('bakim_takvimi'), ('bakim_planla'),
  ('akilli_haftalik_plan'), ('mevsim_kampanya'), ('bakim_firsatlari'),
  ('personel_karnesi'), ('personel_siralama'), ('gunluk_skor_tablosu'),
  ('personel_yetkinlik_matrisi'), ('yetkinlik_ayarla'),
  ('harita_noktalari'), ('bolge_analizi'), ('rota_optimize'),
  ('gunun_rotasi'), ('mesafe_km'),
  ('fiyat_onerisi'), ('anomali_tara'), ('foto_analiz_gecmisi'),
  ('musteri_kayip_riski'), ('canli_kar'), ('sezon_tahmini'), ('musteri_yasam'),
  ('parca_adi_normal'), ('benim_adim'), ('buvisan_admin_mi'), ('personel_eslestir')
) f(ad)
left join pg_proc p on p.proname = f.ad
  and p.pronamespace = 'public'::regnamespace
order by (p.proname is null) desc, f.ad;


-- ============================================================================
-- 3) HER FONKSİYONU TEK TEK TEST ET (gerçek hata mesajıyla)
-- ============================================================================
do $$
declare
  v_testler text[][] := array[
    ['mesafe_km',              'select public.mesafe_km(40.19, 29.06, 40.20, 29.07)'],
    ['kokpit_ozet',            'select public.kokpit_ozet()'],
    ['oncelik_kuyrugu',        'select * from public.oncelik_kuyrugu(3)'],
    ['vinc_saglik_listesi',    'select * from public.vinc_saglik_listesi(3)'],
    ['ariza_kehanet',          'select public.ariza_kehanet((select id from public.cranes limit 1))'],
    ['parca_omur_analizi',     'select * from public.parca_omur_analizi(3)'],
    ['kurumsal_hafiza',        'select public.kurumsal_hafiza((select customer_name from public.cranes where coalesce(customer_name,'''') <> '''' limit 1))'],
    ['model_analizi',          'select * from public.model_analizi()'],
    ['bakim_durumu',           'select public.bakim_durumu()'],
    ['bakim_takvimi',          'select * from public.bakim_takvimi(null, 3)'],
    ['akilli_haftalik_plan',   'select public.akilli_haftalik_plan()'],
    ['mevsim_kampanya',        'select public.mevsim_kampanya()'],
    ['bakim_firsatlari',       'select * from public.bakim_firsatlari(3)'],
    ['personel_siralama',      'select * from public.personel_siralama()'],
    ['gunluk_skor_tablosu',    'select public.gunluk_skor_tablosu()'],
    ['personel_yetkinlik_matrisi', 'select * from public.personel_yetkinlik_matrisi()'],
    ['personel_karnesi',       'select public.personel_karnesi((select personel from public.personel_maas limit 1))'],
    ['harita_noktalari',       'select public.harita_noktalari()'],
    ['bolge_analizi',          'select * from public.bolge_analizi()'],
    ['gunun_rotasi',           'select public.gunun_rotasi()'],
    ['fiyat_onerisi',          'select public.fiyat_onerisi(''test'', null, 10, false)'],
    ['anomali_tara',           'select public.anomali_tara()'],
    ['foto_analiz_gecmisi',    'select * from public.foto_analiz_gecmisi(3)'],
    ['musteri_kayip_riski',    'select * from public.musteri_kayip_riski(3)'],
    ['canli_kar',              'select public.canli_kar(5000, ''[]''::jsonb, 2)'],
    ['sezon_tahmini',          'select public.sezon_tahmini()'],
    ['musteri_yasam',          'select public.musteri_yasam()']
  ];
  t text[];
  v_ok integer := 0;
  v_hata integer := 0;
begin
  raise notice ' ';
  raise notice '═══════════ DEV PAKET TEST RAPORU ═══════════';

  foreach t slice 1 in array v_testler loop
    begin
      execute t[2];
      raise notice '✅ %', rpad(t[1], 26);
      v_ok := v_ok + 1;
    exception when others then
      raise notice '❌ % → %', rpad(t[1], 26), sqlerrm;
      v_hata := v_hata + 1;
    end;
  end loop;

  raise notice '════════════════════════════════════════════';
  raise notice 'ÇALIŞAN: %   HATALI: %   TOPLAM: %', v_ok, v_hata, v_ok + v_hata;
  raise notice '════════════════════════════════════════════';
end $$;


-- ============================================================================
-- 4) VERİ DURUMU — fonksiyonların beslendiği veri var mı?
-- ============================================================================
select
  (select count(*) from public.cranes)                       as vinc,
  (select count(*) from public.cranes
    where coalesce(trim(coalesce(crane_capacity,'')),'') <> '') as kapasiteli,
  (select count(*) from public.cranes where lat is not null)  as koordinatli,
  (select count(*) from public.cranes
    where next_maintenance_date is not null)                  as bakim_tarihli,
  (select count(*) from public.completed_services)            as servis_kaydi,
  (select count(*) from public.service_reports)               as rapor,
  (select count(*) from public.personel_maas where aktif)     as aktif_personel,
  (select count(*) from public.materials)                     as malzeme,
  (select count(*) from public.offers)                        as teklif;
