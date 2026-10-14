-- ============================================================================
--  🔬 ASİSTAN KAPSAM TEŞHİSİ (Güncelleme #41)
-- ----------------------------------------------------------------------------
--  SENİN SORUN: "Bu bot hiçbir şeyi atlamayacak mı?"
--
--  DÜRÜST CEVAP: Asistan bir VERİ KOŞULUNA bakar. Tablo/sütun adı sistemde
--  farklıysa o kontrol SESSİZCE atlanır (hata vermez ama çalışmaz da).
--
--  BU SCRIPT NE YAPAR?
--    1) Her hatırlatma kaynağını TEK TEK test eder
--    2) ÇALIŞIYOR mu, ATLANDI mı, hata mesajı ne → hepsini gösterir
--    3) Periyodik yakalama neden 0 buldu → gerçek veriyi gösterir
--    4) Memnuniyet puanlarını listeler
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) 🎯 PERİYODİK YAKALAMA NEDEN 0 BULDU? (gerçek service_type değerleri)
-- ============================================================================
select
  coalesce(service_type, '(boş)')  as servis_turu,
  count(*)                          as adet,
  count(*) filter (where service_date::date > current_date - 90) as son_90_gun,
  count(*) filter (where coalesce(trim(description), '') <> '')  as aciklamasi_dolu
from public.completed_services
group by coalesce(service_type, '(boş)')
order by count(*) desc
limit 25;


-- ============================================================================
-- 2) 🔬 HER KONTROLÜ TEK TEK TEST ET — çalışıyor mu, atlandı mı?
-- ============================================================================
do $$
declare
  v_testler text[][] := array[
    ['kritik_talep',      'select count(*) from public.service_tickets where coalesce(status,'''') ilike ''%kritik%'''],
    ['rapor_bekleyen',    'select count(*) from public.service_tickets t where coalesce(t.pipeline_status,'''') = ''tamamlandi'' and not exists (select 1 from public.service_reports r where r.ticket_id = t.id)'],
    ['bugun_randevu',     'select count(*) from public.appointments a where a.appointment_date = current_date'],
    ['kritik_stok',       'select count(*) from public.materials m where coalesce(m.stock_quantity,0) <= coalesce(m.min_stock,0)'],
    ['personel_talep',    'select count(*) from public.personel_talepler where durum = ''BEKLEMEDE'''],
    ['geciken_tahsilat',  'select count(*) from public.cari_hesaplar c where coalesce(c.bakiye,0) > 0'],
    ['bakim_zamani',      'select count(*) from public.cranes c where c.next_maintenance_date is not null'],
    ['teklif_bekleyen',   'select count(*) from public.teklif_bekleyenler where durum = ''BEKLIYOR'''],
    ['memnuniyet',        'select count(*) from public.service_reports r where coalesce(r.musteri_puani,5) <= 2']
  ];
  t text[];
  v_adet bigint;
begin
  raise notice '═══════════════ ASİSTAN KAPSAM TESTİ ═══════════════';
  foreach t slice 1 in array v_testler loop
    begin
      execute t[2] into v_adet;
      raise notice '✅ % — ÇALIŞIYOR (% kayıt)', rpad(t[1], 20), v_adet;
    exception when others then
      raise notice '❌ % — ATLANDI → %', rpad(t[1], 20), sqlerrm;
    end;
  end loop;
  raise notice '════════════════════════════════════════════════════';
end $$;


-- ============================================================================
-- 3) 📊 ŞU AN ASİSTANIN GÖRDÜĞÜ BEKLEYEN İŞLER
-- ============================================================================
select anahtar, baslik, adet, aciliyet,
       coalesce(left(detay, 60), '-') as ornek_detay
from public.asistan_bekleyenler()
order by aciliyet;


-- ============================================================================
-- 4) ⭐ MEMNUNİYET PUANLARI (personel sahada müşteriye sorar)
-- ============================================================================
select
  coalesce(cs.customer_name, 'Bilinmiyor')          as musteri,
  r.musteri_puani                                    as puan,
  r.musteri_yorumu                                   as yorum,
  to_char(r.created_at, 'DD.MM.YYYY')                as tarih,
  case when coalesce(r.musteri_puani, 5) <= 2 then '⚠️ DÜŞÜK' 
       when r.musteri_puani = 3 then '😐 ORTA'
       else '✅ İYİ' end                             as durum
from public.service_reports r
left join public.completed_services cs on cs.id = r.ticket_id
where r.musteri_puani is not null
order by r.created_at desc
limit 30;


-- ============================================================================
-- 5) ⭐ MEMNUNİYET ÖZETİ
-- ============================================================================
select
  count(*) filter (where musteri_puani is not null)              as puanlanan_is,
  round(avg(musteri_puani) filter (where musteri_puani is not null), 2) as ortalama_puan,
  count(*) filter (where musteri_puani >= 4)                     as memnun,
  count(*) filter (where musteri_puani = 3)                      as orta,
  count(*) filter (where musteri_puani <= 2)                     as memnuniyetsiz,
  count(*) filter (where musteri_yorumu is not null and trim(musteri_yorumu) <> '') as yorumlu
from public.service_reports;


-- ============================================================================
-- 6) 📋 ASİSTANIN TAKİP EDEMEDİĞİ ŞEYLER (eksik kapsam listesi)
--    Bunlar raporda görünüp asistanın bilemeyeceği durumlar
-- ============================================================================
select 'Teklif verilmesi gereken ama işaretlenmemiş işler' as eksik_alan,
       count(*) as adet
from public.completed_services cs
where coalesce(cs.description, '') ilike '%ariza%'
  and cs.service_date::date > current_date - 30
  and not exists (select 1 from public.teklif_bekleyenler t where t.is_emri_no = cs.id::text)
union all
select 'Yarım kalan işler (takip gereken)',
       count(*) from public.completed_services
where coalesce(service_type,'') ilike '%yarım%' and service_date::date > current_date - 60
union all
select 'Garanti kapsamında yapılan işler',
       count(*) from public.completed_services
where coalesce(service_type,'') ilike '%garanti%' and service_date::date > current_date - 60
union all
select 'Telefonu olmayan müşteriler (arama yapılamaz)',
       count(*) from public.cranes where coalesce(customer_phone,'') = ''
union all
select 'Adresi olmayan vinçler (yol tarifi alınamaz)',
       count(*) from public.cranes where coalesce(location_address,'') = '';
