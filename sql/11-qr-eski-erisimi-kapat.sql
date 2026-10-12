-- ============================================================================
--  🔐 QR SAYFASI: ESKİ DOĞRUDAN ERİŞİMİ KAPAT (son adım)
-- ----------------------------------------------------------------------------
--  ÖNCEKİ ADIMDA ne oldu?
--    vinc_kimlik() fonksiyonu kuruldu ve QR sayfası onu kullanmaya başladı.
--    Sayfa artık 180.777 karakter yerine 984 karakter indiriyor (184 kat az).
--
--  BU SCRIPT NE YAPAR?
--    Artık kimsenin kullanmadığı ESKİ doğrudan erişimi kapatır:
--      • cranes         → girişsiz okuma kapanır
--      • service_tickets→ girişsiz okuma kapanır
--      • crane_history  → girişsiz okuma kapanır
--
--  NE DEĞİŞMEZ? (kritik)
--    ✅ QR ADRESİ AYNI:  https://servis.buvisan.com/vinc/<kimlik>
--    ✅ Müşteri arıza/keşif/bakım BİLDİRİMİ çalışmaya devam eder (yazma açık)
--    ✅ Sohbet (destek mesajları) çalışmaya devam eder
--    ✅ Servis geçmişi görünmeye devam eder (fonksiyon üzerinden)
--    ✅ Personel ve yönetici ekranları etkilenmez
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) GEÇİCİ "MÜŞTERİ OKUMA" POLİTİKALARINI SİL
--    (isimleri dinamik buluyoruz ki birebir eşleşme sorunu olmasın)
-- ============================================================================
do $$
declare
  r record;
  v_sayac integer := 0;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('cranes', 'service_tickets', 'crane_history')
      and (policyname like '%GECICI%' or policyname like '%musteri_okuma%')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
    raise notice 'Silindi: %.%', r.tablename, r.policyname;
    v_sayac := v_sayac + 1;
  end loop;

  raise notice 'Toplam % geçici politika silindi.', v_sayac;
end $$;


-- ============================================================================
-- 2) DOĞRUDAN SELECT YETKİSİNİ DE KALDIR (çift katman koruma)
-- ============================================================================
revoke select on public.cranes          from anon;
revoke select on public.service_tickets from anon;
revoke select on public.crane_history   from anon;


-- ============================================================================
-- 3) MÜŞTERİ AKIŞININ ÇALIŞMAYA DEVAM ETTİĞİNİ GARANTİ ET
--    (yazma + sohbet açık kalmalı)
-- ============================================================================
grant insert on public.service_tickets to anon;
grant insert on public.crane_history   to anon;
grant insert on public.ticket_messages to anon;
grant select on public.ticket_messages to anon;
grant execute on function public.vinc_kimlik(uuid) to anon;


-- ============================================================================
-- 4) KONTROL RAPORU
-- ============================================================================
select 'cranes' as tablo,
       (select count(*) from pg_policies where schemaname='public' and tablename='cranes') as politika_sayisi;
select 'service_tickets' as tablo,
       (select count(*) from pg_policies where schemaname='public' and tablename='service_tickets') as politika_sayisi;
select 'crane_history' as tablo,
       (select count(*) from pg_policies where schemaname='public' and tablename='crane_history') as politika_sayisi;

-- Güvenli fonksiyon yerinde mi?
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'vinc_kimlik') as qr_fonksiyonu_hazir;
