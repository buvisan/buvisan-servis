-- ============================================================================
--  🔐 TEKLİF ODASI: ESKİ AÇIK ERİŞİMİ KAPAT (son adım)
-- ----------------------------------------------------------------------------
--  ÖNCEKİ ADIMDA ne oldu?
--    teklif_getir() ve teklif_yanitla() fonksiyonları kuruldu ve
--    teklif odası sayfası onları kullanmaya başladı. Test edildi:
--      ✅ Tek teklif geliyor (220 teklif inmiyor)
--      ✅ Geçersiz durum reddediliyor
--      ✅ Yanıtlanmış teklifin fiyatı DEĞİŞTİRİLEMİYOR
--
--  BU SCRIPT NE YAPAR?
--    Artık kimsenin kullanmadığı eski doğrudan erişimi kapatır:
--      • offers tablosunu girişsiz okumak   → KAPANIR
--      • girişsiz fiyat değiştirmek         → KAPANIR
--
--  NE DEĞİŞMEZ?
--    ✅ Müşteri teklif linki AYNI: /teklif-odasi/<kimlik>
--    ✅ Müşteri teklifi görür ve onaylar/reddeder (fonksiyonlar üzerinden)
--    ✅ Admin panelindeki Teklifler sayfası çalışmaya devam eder
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) offers TABLOSUNDAKİ TÜM ESKİ POLİTİKALARI SİL
-- ============================================================================
do $$
declare
  r record;
  v_sayac integer := 0;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'offers'
  loop
    execute format('drop policy if exists %I on public.offers', r.policyname);
    raise notice 'Silindi: %', r.policyname;
    v_sayac := v_sayac + 1;
  end loop;
  raise notice 'Toplam % eski politika silindi.', v_sayac;
end $$;


-- ============================================================================
-- 2) RLS AÇ + SADECE YÖNETİCİ DOĞRUDAN ERİŞSİN
-- ============================================================================
alter table public.offers enable row level security;

create policy offers_yonetici_tam on public.offers
  for all to authenticated
  using (public.buvisan_admin_mi())
  with check (public.buvisan_admin_mi());


-- ============================================================================
-- 3) GİRİŞSİZ ERİŞİMİ TAMAMEN KALDIR
--    (Müşteri sadece güvenli fonksiyonlar üzerinden erişir)
-- ============================================================================
revoke all on public.offers from anon;

grant execute on function public.teklif_getir(uuid) to anon;
grant execute on function public.teklif_yanitla(uuid, text, numeric, jsonb) to anon;


-- ============================================================================
-- 4) KONTROL RAPORU
-- ============================================================================
select
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'offers')            as offers_politika_sayisi,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'offers'
      and 'anon' = any(roles::text[]))                               as anon_politika_sayisi,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'teklif_getir')       as getir_fonksiyonu,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'teklif_yanitla')     as yanitla_fonksiyonu,
  'Beklenen: politika 1, anon politika 0, fonksiyonlar 1-1'          as aciklama;
