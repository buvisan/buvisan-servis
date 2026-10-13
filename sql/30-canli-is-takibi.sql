-- ============================================================================
--  📍 CANLI İŞ TAKİBİ (Büyük Güncelleme #7)
-- ----------------------------------------------------------------------------
--  FİKİR:
--    Kargo takibi gibi. Müşteriye bir link verilir:
--      servis.buvisan.com/takip/<kimlik>
--    Müşteri açtığında görür:
--      ✅ Teknisyeniniz yolda
--      👤 GÖKHAN GÖK
--      🕐 Tahmini varış: 14:35
--      📍 Son konum güncellemesi: 5 dk önce
--
--  NEDEN ÇIĞIR AÇICI:
--    • "Nerede kaldınız?" telefonları BİTER
--    • Müşteride "profesyonel firma" algısı oluşur
--    • Sırada bekleyen müşteri kendini hazırlar
--    • Konum damgalama altyapısı ZATEN VAR (saha raporu)
--
--  GÜVENLİK:
--    Link kimliği tahmin edilemez (uuid). Sayfa SADECE şu alanları gösterir:
--    müşteri adı, vinç bilgisi, teknisyen adı, durum, tahmini varış.
--    Telefon, fiyat, not gibi iç bilgiler ASLA paylaşılmaz.
--
--  ⚠️ Yeni tablo kurar. Mevcut veriye dokunmaz.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) TAKİP TABLOSU
-- ============================================================================
create table if not exists public.is_takip (
  id              uuid primary key default gen_random_uuid(),
  musteri         text not null,
  vinc_bilgi      text,
  teknisyen       text,
  adres           text,
  konu            text,
  durum           text not null default 'PLANLANDI',
  yola_cikis      timestamptz,
  varis           timestamptz,
  bitis           timestamptz,
  tahmini_varis   timestamptz,
  konum_lat       numeric,
  konum_lng       numeric,
  konum_saat      timestamptz,
  musteri_notu    text,
  created_at      timestamptz default now(),
  guncelleme      timestamptz default now()
);

create index if not exists idx_is_takip_durum on public.is_takip (durum);
create index if not exists idx_is_takip_tarih on public.is_takip (created_at desc);

comment on table public.is_takip is 'Canlı iş takibi: müşteriye paylaşılan durum linkleri';


-- ============================================================================
-- 2) TAKİP BAŞLAT (ofis kullanır)
-- ============================================================================
create or replace function public.takip_baslat(
  p_musteri    text,
  p_teknisyen  text default null,
  p_vinc       text default null,
  p_adres      text default null,
  p_konu       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_musteri), '') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Müşteri adı gerekli.');
  end if;

  insert into public.is_takip (musteri, teknisyen, vinc_bilgi, adres, konu, durum)
  values (trim(p_musteri), p_teknisyen, p_vinc, p_adres, p_konu, 'PLANLANDI')
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'link', 'https://servis.buvisan.com/takip/' || v_id::text,
    'mesaj', 'Takip başlatıldı.'
  );
end;
$$;

revoke all on function public.takip_baslat(text, text, text, text, text) from public;
grant execute on function public.takip_baslat(text, text, text, text, text) to authenticated;


-- ============================================================================
-- 3) DURUM GÜNCELLE (saha/teknisyen kullanır)
-- ============================================================================
create or replace function public.takip_guncelle(
  p_id      uuid,
  p_durum   text default null,
  p_lat     numeric default null,
  p_lng     numeric default null,
  p_eta_dk  integer default null,
  p_not     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_durum text;
begin
  if p_durum is not null and p_durum not in
     ('PLANLANDI','YOLDA','VARDI','CALISIYOR','BITTI','IPTAL') then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçersiz durum: ' || p_durum);
  end if;

  update public.is_takip t
     set durum         = coalesce(p_durum, t.durum),
         yola_cikis    = case when p_durum = 'YOLDA' and t.yola_cikis is null
                              then now() else t.yola_cikis end,
         varis         = case when p_durum = 'VARDI' and t.varis is null
                              then now() else t.varis end,
         bitis         = case when p_durum = 'BITTI' and t.bitis is null
                              then now() else t.bitis end,
         tahmini_varis = case when p_eta_dk is not null
                              then now() + (p_eta_dk || ' minutes')::interval
                              else t.tahmini_varis end,
         konum_lat     = coalesce(p_lat, t.konum_lat),
         konum_lng     = coalesce(p_lng, t.konum_lng),
         konum_saat    = case when p_lat is not null or p_lng is not null
                              then now() else t.konum_saat end,
         musteri_notu  = coalesce(p_not, t.musteri_notu),
         guncelleme    = now()
   where t.id = p_id
   returning t.durum into v_durum;

  if v_durum is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Takip kaydı bulunamadı.');
  end if;

  return jsonb_build_object('ok', true, 'durum', v_durum, 'mesaj', 'Durum güncellendi.');
end;
$$;

revoke all on function public.takip_guncelle(uuid, text, numeric, numeric, integer, text) from public;
grant execute on function public.takip_guncelle(uuid, text, numeric, numeric, integer, text) to authenticated;


-- ============================================================================
-- 4) GENEL ERİŞİM: is_durumu(uuid) — SADECE güvenli alanlar
--    (müşteri sayfası bu fonksiyonu kullanır; fiyat/telefon/not paylaşılmaz)
-- ============================================================================
create or replace function public.is_durumu(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'bulundu',        (t.id is not null),
    'musteri',        t.musteri,
    'vinc',           t.vinc_bilgi,
    'teknisyen',      t.teknisyen,
    'konu',           t.konu,
    'durum',          t.durum,
    'yola_cikis',     t.yola_cikis,
    'varis',          t.varis,
    'bitis',          t.bitis,
    'tahmini_varis',  case when t.durum in ('BITTI','IPTAL') then null else t.tahmini_varis end,
    'konum_guncelleme', case when t.durum in ('VARDI','CALISIYOR','BITTI') then null else t.konum_saat end,
    'musteri_notu',   t.musteri_notu,
    'guncelleme',     t.guncelleme
  )
  from (select * from public.is_takip where id = p_id) t;
$$;

revoke all on function public.is_durumu(uuid) from public;
grant execute on function public.is_durumu(uuid) to anon, authenticated;


-- ============================================================================
-- 5) GÜVENLİK: takip tablosu doğrudan okunamaz
-- ============================================================================
alter table public.is_takip enable row level security;

drop policy if exists is_takip_yonetici on public.is_takip;
create policy is_takip_yonetici on public.is_takip
  for all to authenticated
  using (public.buvisan_admin_mi())
  with check (public.buvisan_admin_mi());

revoke all on public.is_takip from anon;


-- ============================================================================
-- 6) KONTROL
-- ============================================================================
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'is_takip')      as tablo_kuruldu,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('takip_baslat','takip_guncelle','is_durumu'))                as fonksiyon_sayisi,
  (select count(*) from public.is_takip)                            as mevcut_takip;
