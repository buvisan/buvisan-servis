-- ============================================================================
--  🚨 BUVISAN ACİL GÜVENLİK KİLİDİ (RLS)  —  v1.0
-- ----------------------------------------------------------------------------
--  SORUN (canlı testlerle kanıtlandı):
--    • 18 tablonun tamamı girişsiz (anon anahtarla) OKUNABİLİYOR:
--      maaşlar, kira, ciro, kâr marjları, müşteri listesi, mimli firmalar...
--    • Tablolara girişsiz YAZILABİLİYOR ve GÜNCELLENEBİLİYOR.
--    • Sebep: bu tablolarda RLS (satır düzeyi güvenlik) hiç açılmamış.
--
--  NE YAPAR:
--    Her tabloya "kim ne yapabilir" kuralı yazar:
--      • Müşteri (girişsiz)  → sadece form gönderebilir (gereken yerlerde)
--      • Saha personeli       → kendi işini görebilir/yazabilir
--      • Yönetici (admin)     → her şeye tam yetki
--      • Maaş/ciro/filo/mimli → SADECE yönetici
--
--  NE YAPMAZ:
--    • Hiçbir kaydı SİLMEZ, DEĞİŞTİRMEZ (sadece 2 denetim test kaydını temizler)
--    • Uygulamayı bozmaz: personel ve müşteri akışları korunur
--
--  ⚠️ ÇALIŞTIRDIKTAN SONRA haber ver → uygulamayı baştan sona test edeceğim.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 0) DENETİM SIRASINDA OLUŞAN 2 TEST KAYDINI TEMİZLE
--    (güvenlik denetçisinin doğrulama amaçlı açtığı kayıtlar)
-- ============================================================================
delete from public.service_tickets
 where id in ('52311af7-14ec-4c0e-b2c9-d1b3258b4458',
              'e8a1d1a0-fa89-4b15-995a-dcf8a612b829');

delete from public.offers
 where id = '7bc98d3f-57ef-4d1a-9f91-d4a030e53954';


-- ============================================================================
-- 1) YARDIMCI FONKSİYON: tabloyu kilitle + kuralları yaz
-- ============================================================================
create or replace function public.buvisan_tablo_kilitle(
  p_tablo            text,
  p_personel_okuma   boolean default false,   -- saha personeli okuyabilir mi?
  p_personel_yazma   boolean default false,   -- saha personeli yeni kayıt açabilir mi?
  p_anon_yazma       boolean default false,   -- girişsiz müşteri kayıt açabilir mi?
  p_anon_okuma       boolean default false    -- girişsiz müşteri okuyabilir mi? (GEÇİCİ)
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.' || p_tablo) is null then
    return 'ATLANDI (tablo yok)';
  end if;

  -- RLS'i aç: kural yazmadığımız hiç kimse erişemez
  execute format('alter table public.%I enable row level security', p_tablo);

  -- 1) Yönetici: her şeye tam yetki
  execute format('drop policy if exists %I on public.%I', p_tablo || '_yonetici_tam', p_tablo);
  execute format(
    'create policy %I on public.%I for all to authenticated
       using (public.buvisan_admin_mi()) with check (public.buvisan_admin_mi())',
    p_tablo || '_yonetici_tam', p_tablo);

  -- 2) Saha personeli: okuma
  if p_personel_okuma then
    execute format('drop policy if exists %I on public.%I', p_tablo || '_personel_okuma', p_tablo);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      p_tablo || '_personel_okuma', p_tablo);
  end if;

  -- 3) Saha personeli: yeni kayıt
  if p_personel_yazma then
    execute format('drop policy if exists %I on public.%I', p_tablo || '_personel_yazma', p_tablo);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (true)',
      p_tablo || '_personel_yazma', p_tablo);
  end if;

  -- 4) Girişsiz müşteri: yeni kayıt (form gönderimi)
  if p_anon_yazma then
    execute format('drop policy if exists %I on public.%I', p_tablo || '_musteri_yazma', p_tablo);
    execute format(
      'create policy %I on public.%I for insert to anon with check (true)',
      p_tablo || '_musteri_yazma', p_tablo);
  end if;

  -- 5) Girişsiz müşteri: okuma  (SADECE geçici - sonraki adımda kapatılacak)
  if p_anon_okuma then
    execute format('drop policy if exists %I on public.%I', p_tablo || '_musteri_okuma_GECICI', p_tablo);
    execute format(
      'create policy %I on public.%I for select to anon using (true)',
      p_tablo || '_musteri_okuma_GECICI', p_tablo);
  end if;

  return 'KİLİTLENDİ';
end;
$$;


-- ============================================================================
-- 2) SADECE YÖNETİCİYE AÇIK TABLOLAR  (en kritik sızıntılar)
--    Maaşlar, ciro, kâr marjları, filo, mimli firmalar...
-- ============================================================================
select 'financial_records'       as tablo, public.buvisan_tablo_kilitle('financial_records')
union all select 'personnel_monthly_lists', public.buvisan_tablo_kilitle('personnel_monthly_lists')
union all select 'completed_services',      public.buvisan_tablo_kilitle('completed_services')
union all select 'fleet_vehicles',          public.buvisan_tablo_kilitle('fleet_vehicles')
union all select 'fleet_fines',             public.buvisan_tablo_kilitle('fleet_fines')
union all select 'fleet_fuel',              public.buvisan_tablo_kilitle('fleet_fuel')
union all select 'fleet_maintenance',       public.buvisan_tablo_kilitle('fleet_maintenance')
union all select 'blacklisted_companies',   public.buvisan_tablo_kilitle('blacklisted_companies')
union all select 'maintenance_contracts',   public.buvisan_tablo_kilitle('maintenance_contracts')
union all select 'documents',               public.buvisan_tablo_kilitle('documents')
union all select 'bekleyen_onaylar',        public.buvisan_tablo_kilitle('bekleyen_onaylar')
union all select 'ajan_notlari',            public.buvisan_tablo_kilitle('ajan_notlari')
union all select 'ajan_loglari',            public.buvisan_tablo_kilitle('ajan_loglari');


-- ============================================================================
-- 3) PERSONELİN OKUYABİLECEĞİ TABLOLAR
--    (saha ekranı bu tabloları kullanıyor)
-- ============================================================================
select 'materials'        as tablo, public.buvisan_tablo_kilitle('materials', true, false)
union all select 'service_reports', public.buvisan_tablo_kilitle('service_reports', true, true)
union all select 'field_reports',   public.buvisan_tablo_kilitle('field_reports', true, true);


-- ============================================================================
-- 4) MÜŞTERİ + PERSONEL ORTAK TABLOLAR
--    service_tickets : müşteri form gönderir (yazma) + sahada okunur
--    cranes / crane_history / ticket_messages / offers : herkese açık QR
--    sayfaları ve teklif odası kullanıyor → OKUMA GEÇİCİ OLARAK AÇIK.
--    (Sonraki adımda bu okumalar güvenli fonksiyonlara çevrilecek.)
-- ============================================================================
select 'service_tickets' as tablo, public.buvisan_tablo_kilitle('service_tickets', true, true, true, true)
union all select 'cranes',          public.buvisan_tablo_kilitle('cranes',         true, false, false, true)
union all select 'crane_history',   public.buvisan_tablo_kilitle('crane_history',  true, true,  true,  true)
union all select 'ticket_messages', public.buvisan_tablo_kilitle('ticket_messages',true, true,  true,  true)
union all select 'offers',          public.buvisan_tablo_kilitle('offers',         false,false, false, true);


-- ============================================================================
-- 5) PROFILES — ÖZEL DURUM
--    Herkes SADECE KENDİ kaydını okur; yönetici hepsini görür.
--    (Dışarıdan kimse profil oluşturamaz → sahte personel engellenir)
-- ============================================================================
select 'profiles' as tablo, public.buvisan_tablo_kilitle('profiles');

drop policy if exists profiles_kendi_kaydi on public.profiles;
create policy profiles_kendi_kaydi on public.profiles
  for select to authenticated
  using (id = auth.uid());


-- ============================================================================
-- 6) KONTROL: hangi tabloda kaç kural var?
-- ============================================================================
select
  tablename as tablo,
  count(*)  as kural_sayisi,
  case when count(*) = 0 then '⚠️ KORUMASIZ' else '✅ korumalı' end as durum
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles','service_tickets','service_reports','field_reports','offers','cranes',
    'crane_history','ticket_messages','materials','completed_services','financial_records',
    'personnel_monthly_lists','fleet_vehicles','fleet_fines','fleet_fuel','fleet_maintenance',
    'blacklisted_companies','maintenance_contracts','documents','bekleyen_onaylar',
    'ajan_notlari','ajan_loglari','randevular','randevu_ayarlari')
group by tablename
order by count(*) asc, tablename;

-- Test kayıtları temizlendi mi?
select
  (select count(*) from public.service_tickets
    where id in ('52311af7-14ec-4c0e-b2c9-d1b3258b4458','e8a1d1a0-fa89-4b15-995a-dcf8a612b829')) as kalan_test_is_emri,
  (select count(*) from public.offers
    where id = '7bc98d3f-57ef-4d1a-9f91-d4a030e53954') as kalan_test_teklif;
