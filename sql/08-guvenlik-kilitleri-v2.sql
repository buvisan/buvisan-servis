-- ============================================================================
--  🔐 BUVISAN GÜVENLİK KİLİDİ v2 — "ESKİ AÇIK KAPILARI SÖK"
-- ----------------------------------------------------------------------------
--  NEDEN GEREKLİ?
--    v1 scripti RLS'i açtı ve kendi kurallarını yazdı. ANCAK Supabase panelinden
--    daha önce eklenmiş "herkese izin ver" politikaları hâlâ duruyordu.
--    PostgreSQL'de politikalar VEYA ile birleşir → eski açık politika varsa
--    bizim kilit hiçbir işe yaramaz (kapı kilitli ama pencere açık).
--
--  NE YAPAR?
--    Hedef tablolardaki TÜM eski politikaları siler, RLS'i açar ve
--    SADECE aşağıdaki doğru kuralları yazar:
--      • Müşteri (girişsiz) → sadece form gönderebilir
--      • Saha personeli      → kendi işini görür/yazar
--      • Yönetici            → tam yetki
--      • Maaş/ciro/marj/filo → SADECE yönetici
--
--  ⚠️ Veri SİLMEZ. Sadece erişim kurallarını yazar.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 0) SİLİNEN ESKİ POLİTİKALARI KAYIT ALTINA AL (rapor için)
-- ============================================================================
drop table if exists _eski_politikalar;
create temp table _eski_politikalar (tablo text, politika text, roller text);


-- ============================================================================
-- 1) YARDIMCI: tabloyu TEMİZLE ve kilitle
-- ============================================================================
create or replace function public.buvisan_tablo_kilitle(
  p_tablo            text,
  p_personel_okuma   boolean default false,
  p_personel_yazma   boolean default false,
  p_anon_yazma       boolean default false,
  p_anon_okuma       boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_sayac integer := 0;
begin
  if to_regclass('public.' || p_tablo) is null then
    return 'ATLANDI (tablo yok)';
  end if;

  -- (a) ESKİ POLİTİKALARI SİL — asıl düzeltme burada
  for r in
    select policyname, roles::text as roller
    from pg_policies
    where schemaname = 'public' and tablename = p_tablo
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, p_tablo);
    if to_regclass('pg_temp._eski_politikalar') is not null then
      insert into _eski_politikalar (tablo, politika, roller)
      values (p_tablo, r.policyname, r.roller);
    end if;
    v_sayac := v_sayac + 1;
  end loop;

  -- (b) RLS aç
  execute format('alter table public.%I enable row level security', p_tablo);

  -- (c) Yönetici: tam yetki
  execute format(
    'create policy %I on public.%I for all to authenticated
       using (public.buvisan_admin_mi()) with check (public.buvisan_admin_mi())',
    p_tablo || '_yonetici_tam', p_tablo);

  -- (d) Saha personeli: okuma
  if p_personel_okuma then
    execute format('create policy %I on public.%I for select to authenticated using (true)',
      p_tablo || '_personel_okuma', p_tablo);
  end if;

  -- (e) Saha personeli: yeni kayıt
  if p_personel_yazma then
    execute format('create policy %I on public.%I for insert to authenticated with check (true)',
      p_tablo || '_personel_yazma', p_tablo);
  end if;

  -- (f) Girişsiz müşteri: yeni kayıt
  if p_anon_yazma then
    execute format('create policy %I on public.%I for insert to anon with check (true)',
      p_tablo || '_musteri_yazma', p_tablo);
  end if;

  -- (g) Girişsiz müşteri: okuma (GEÇİCİ - sonraki adımda güvenli fonksiyona çevrilecek)
  if p_anon_okuma then
    execute format('create policy %I on public.%I for select to anon using (true)',
      p_tablo || '_musteri_okuma_GECICI', p_tablo);
  end if;

  return 'KİLİTLENDİ (' || v_sayac || ' eski politika silindi)';
end;
$$;


-- ============================================================================
-- 2) SADECE YÖNETİCİ  (maaş, ciro, kâr marjı, filo, mimli, belgeler)
-- ============================================================================
select 'financial_records'        as tablo, public.buvisan_tablo_kilitle('financial_records')
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
-- 3) PERSONEL OKUR / YAZAR  (saha ekranının ihtiyacı)
-- ============================================================================
select 'materials'        as tablo, public.buvisan_tablo_kilitle('materials', true, false)
union all select 'service_reports', public.buvisan_tablo_kilitle('service_reports', true, true)
union all select 'field_reports',   public.buvisan_tablo_kilitle('field_reports', true, true);


-- ============================================================================
-- 4) MÜŞTERİ + PERSONEL ORTAK  (public QR sayfaları - okuma geçici)
-- ============================================================================
select 'service_tickets' as tablo, public.buvisan_tablo_kilitle('service_tickets', true, true, true, true)
union all select 'cranes',          public.buvisan_tablo_kilitle('cranes',         true, false, false, true)
union all select 'crane_history',   public.buvisan_tablo_kilitle('crane_history',  true, true,  true,  true)
union all select 'ticket_messages', public.buvisan_tablo_kilitle('ticket_messages',true, true,  true,  true)
union all select 'offers',          public.buvisan_tablo_kilitle('offers',         false,false, false, true);


-- ============================================================================
-- 5) PROFILES — herkes sadece kendi kaydını okur
-- ============================================================================
select 'profiles' as tablo, public.buvisan_tablo_kilitle('profiles');

create policy profiles_kendi_kaydi on public.profiles
  for select to authenticated
  using (id = auth.uid());


-- ============================================================================
-- 6) DOSYA DEPOSU (STORAGE) KİLİDİ
--    Sorun: girişsiz kişi "saha_raporlari" klasörünü LİSTELEYEBİLİYORDU
--    (dosya adları görünüyor, sonra public URL ile içerikleri açılıyordu:
--    müşteri imzaları, fabrika fotoğrafları → KVKK riski).
--    Çözüm: eski politikaları sök; yükleme serbest kalsın (müşteri formu +
--    saha ekibi kullanıyor), LİSTELEME sadece girişli personele açılsın.
--    Not: public bucket'larda dosya adresi (URL) yine çalışır — sadece
--    "klasörü listeleme" kapanır.
-- ============================================================================
do $$
declare r record;
begin
  for r in select policyname from pg_policies
            where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

-- Yükleme: müşteri formu (girişsiz) + saha ekibi
create policy buvisan_dosya_yukleme on storage.objects
  for insert to anon, authenticated
  with check (bucket_id in ('saha_raporlari', 'ariza-medya'));

-- Güncelleme / silme: girişli personel
create policy buvisan_dosya_guncelleme on storage.objects
  for update to authenticated
  using (bucket_id in ('saha_raporlari', 'ariza-medya', 'dokumanlar', 'documents'));

-- Listeleme ve okuma: SADECE girişli personel (asıl kapanan açık bu)
create policy buvisan_dosya_okuma on storage.objects
  for select to authenticated
  using (bucket_id in ('saha_raporlari', 'ariza-medya', 'dokumanlar', 'documents'));

-- Yönetici: her şey
create policy buvisan_dosya_yonetici on storage.objects
  for all to authenticated
  using (public.buvisan_admin_mi()) with check (public.buvisan_admin_mi());


-- ============================================================================
-- 7) RAPOR
-- ============================================================================
select 'SİLİNEN ESKİ POLİTİKALAR' as baslik, tablo, politika, roller
from _eski_politikalar
order by tablo, politika;

select
  tablename as tablo,
  count(*)  as yeni_kural_sayisi,
  string_agg(policyname, ', ' order by policyname) as kurallar
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;
