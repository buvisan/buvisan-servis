-- ============================================================================
--  🎤 SES KAYDI ZEKASI (Büyük Güncelleme #8)
-- ----------------------------------------------------------------------------
--  DURUM TESPİTİ:
--    Sistemde şu an SADECE 3 ses kaydı var (service_tickets.audio_url).
--    Müşteriler sesli kayıt özelliğini henüz kullanmıyor.
--    Bu yüzden altyapı kurulur, kullanım arttıkça değer kazanır.
--
--  NE YAPAR:
--    1) Tüm ses kayıtlarını tek yerde toplar (müşteri, tarih, talep metniyle)
--    2) Yazıya çevrilen kayıtlar burada saklanır → ARANABİLİR olur
--    3) "Geçen ay GOTEC ne demişti?" → metinden bulunur
--
--  ⚠️ Yeni tablo kurar (ses_cozumleri). Mevcut veriye dokunmaz.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) YAZIYA ÇEVRİLEN SES KAYITLARI TABLOSU
-- ============================================================================
create table if not exists public.ses_cozumleri (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid,
  audio_url    text not null,
  musteri      text,
  metin        text,
  ozet         text,
  ariza_tipi   text,
  aciliyet     text,
  cozuldu      boolean default false,
  created_at   timestamptz default now(),
  unique (audio_url)
);

create index if not exists idx_ses_cozum_musteri on public.ses_cozumleri (musteri);
create index if not exists idx_ses_cozum_tarih   on public.ses_cozumleri (created_at desc);

comment on table public.ses_cozumleri is 'Sesli müşteri kayıtlarının yazıya çevrilmiş halleri (aranabilir)';


-- ============================================================================
-- 2) SES KAYITLARI LİSTESİ (çevrilmiş + çevrilmemiş hepsi)
-- ============================================================================
create or replace function public.ses_kayitlari()
returns table (
  ticket_id     uuid,
  musteri       text,
  talep_metni   text,
  ariza_tipi    text,
  aciliyet      text,
  audio_url     text,
  kayit_tarihi  timestamptz,
  cevrildi      boolean,
  metin         text,
  ozet          text,
  tespit_ariza  text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    st.id,
    coalesce(st.manual_customer_name, 'Bilinmiyor'),
    st.description,
    st.issue_type,
    st.priority,
    st.audio_url,
    st.created_at,
    (sc.id is not null),
    sc.metin,
    sc.ozet,
    sc.ariza_tipi
  from public.service_tickets st
  left join public.ses_cozumleri sc on sc.audio_url = st.audio_url
  where coalesce(trim(st.audio_url), '') <> ''
  order by st.created_at desc;
$$;

revoke all on function public.ses_kayitlari() from public;
grant execute on function public.ses_kayitlari() to authenticated;


-- ============================================================================
-- 3) YAZIYA ÇEVİRME SONUCUNU KAYDET (API buraya yazar)
-- ============================================================================
create or replace function public.ses_cevirisi_kaydet(
  p_ticket_id   uuid,
  p_audio_url   text,
  p_musteri     text,
  p_metin       text,
  p_ozet        text default null,
  p_ariza_tipi  text default null,
  p_aciliyet    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_audio_url), '') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Ses adresi gerekli.');
  end if;

  insert into public.ses_cozumleri (ticket_id, audio_url, musteri, metin, ozet, ariza_tipi, aciliyet)
  values (p_ticket_id, p_audio_url, p_musteri, p_metin, p_ozet, p_ariza_tipi, p_aciliyet)
  on conflict (audio_url) do update
    set metin = excluded.metin,
        ozet = excluded.ozet,
        ariza_tipi = excluded.ariza_tipi,
        aciliyet = excluded.aciliyet,
        musteri = coalesce(excluded.musteri, public.ses_cozumleri.musteri)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'mesaj', 'Çeviri kaydedildi.');
end;
$$;

revoke all on function public.ses_cevirisi_kaydet(uuid, text, text, text, text, text, text) from public;
grant execute on function public.ses_cevirisi_kaydet(uuid, text, text, text, text, text, text) to authenticated;


-- ============================================================================
-- 4) ÇEVRİLMİŞ METİNLERDE ARAMA ("geçen ay ne demişlerdi?")
-- ============================================================================
create or replace function public.ses_metin_ara(p_arama text, p_limit integer default 20)
returns table (
  musteri      text,
  ozet         text,
  metin        text,
  ariza_tipi   text,
  kayit_tarihi timestamptz,
  audio_url    text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sc.musteri,
    sc.ozet,
    sc.metin,
    sc.ariza_tipi,
    sc.created_at,
    sc.audio_url
  from public.ses_cozumleri sc
  where coalesce(trim(p_arama), '') = ''
     or public.parca_adi_normal(sc.metin) like '%' || public.parca_adi_normal(p_arama) || '%'
     or public.parca_adi_normal(sc.ozet) like '%' || public.parca_adi_normal(p_arama) || '%'
     or public.parca_adi_normal(sc.musteri) like '%' || public.parca_adi_normal(p_arama) || '%'
  order by sc.created_at desc
  limit p_limit;
$$;

revoke all on function public.ses_metin_ara(text, integer) from public;
grant execute on function public.ses_metin_ara(text, integer) to authenticated;


-- ============================================================================
-- 5) GÜVENLİK
-- ============================================================================
alter table public.ses_cozumleri enable row level security;

drop policy if exists ses_cozumleri_yonetici on public.ses_cozumleri;
create policy ses_cozumleri_yonetici on public.ses_cozumleri
  for all to authenticated
  using (public.buvisan_admin_mi())
  with check (public.buvisan_admin_mi());

revoke all on public.ses_cozumleri from anon;


-- ============================================================================
-- 6) KONTROL
-- ============================================================================
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'ses_cozumleri')  as tablo_kuruldu,
  (select count(*) from public.ses_kayitlari())                       as ses_kaydi_sayisi,
  (select count(*) from public.ses_cozumleri)                         as cevrilmis_sayisi,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('ses_kayitlari','ses_cevirisi_kaydet','ses_metin_ara'))        as fonksiyon_sayisi;
