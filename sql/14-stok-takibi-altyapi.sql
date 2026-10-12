-- ============================================================================
--  📦 GERÇEK STOK TAKİBİ — ALTYAPI (PAKET 2 / A)
-- ----------------------------------------------------------------------------
--  ŞU ANKİ DURUM:
--    materials tablosunda SADECE isim, birim, alış/satış fiyatı var.
--    Stok adedi diye bir alan YOK. Bu yüzden:
--      • /api/stok-dus ucu sahteydi ("düşüldü" diyordu, hiçbir şey yapmıyordu)
--      • Servis raporunda parça kullanılsa da depodan düşmüyordu
--      • "Hangi parça bitiyor?" sorusunun cevabı yoktu
--
--  BU SCRIPT NE KURAR:
--    1) materials tablosuna stok_adet + kritik_seviye alanları
--    2) stok_hareketleri tablosu (her giriş/çıkışın kaydı: kim, ne zaman, kaç adet)
--    3) stok_hareket() fonksiyonu → stoğu güvenli şekilde artırır/azaltır
--       (stok eksiye düşemez, her hareket kayıt altına alınır)
--    4) Kritik seviye listesi fonksiyonu
--
--  ⚠️ Mevcut veriye DOKUNMAZ. Sadece yeni alan/tablo/fonksiyon ekler.
--     Mevcut 383 malzemenin stoğu 0 olarak başlar; gerçek adetleri
--     panelden gireceksin (bir sonraki adımda giriş ekranı geliyor).
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) MALZEMEYE STOK ALANLARI
-- ============================================================================
alter table public.materials
  add column if not exists stok_adet     numeric not null default 0,
  add column if not exists kritik_seviye numeric not null default 0,
  add column if not exists stok_guncelleme timestamptz;

comment on column public.materials.stok_adet      is 'Depoda kaç adet var (giriş/çıkışlarla otomatik güncellenir)';
comment on column public.materials.kritik_seviye  is 'Bu adedin altına düşünce uyarı verilir (0 = uyarı yok)';


-- ============================================================================
-- 2) STOK HAREKETLERİ TABLOSU (her giriş/çıkışın kaydı)
-- ============================================================================
create table if not exists public.stok_hareketleri (
  id           uuid primary key default gen_random_uuid(),
  malzeme_id   uuid not null references public.materials(id) on delete cascade,
  malzeme_adi  text,                                    -- okunması kolay olsun diye kopya
  tip          text not null check (tip in ('giris', 'cikis', 'duzeltme')),
  miktar       numeric not null,
  onceki_adet  numeric,
  sonraki_adet numeric,
  aciklama     text,
  ticket_id    uuid references public.service_tickets(id) on delete set null,  -- hangi iş için kullanıldı
  kullanici    text,
  created_at   timestamptz not null default now()
);

create index if not exists stok_hareket_malzeme_idx on public.stok_hareketleri (malzeme_id, created_at desc);
create index if not exists stok_hareket_tarih_idx   on public.stok_hareketleri (created_at desc);


-- ============================================================================
-- 3) STOK HAREKETİ FONKSİYONU
--    Stoğu artırır/azaltır ve hareketi kaydeder. Stok eksiye düşemez.
-- ============================================================================
create or replace function public.stok_hareket(
  p_malzeme_id uuid,
  p_tip        text,            -- 'giris' | 'cikis' | 'duzeltme'
  p_miktar     numeric,
  p_aciklama   text default null,
  p_ticket_id  uuid default null,
  p_kullanici  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onceki numeric;
  v_sonraki numeric;
  v_ad     text;
begin
  if p_tip not in ('giris', 'cikis', 'duzeltme') then
    raise exception 'GECERSIZ_HAREKET_TIPI';
  end if;
  if p_miktar is null or p_miktar < 0 then
    raise exception 'GECERSIZ_MIKTAR';
  end if;

  select stok_adet, name into v_onceki, v_ad
  from public.materials where id = p_malzeme_id for update;

  if not found then
    raise exception 'MALZEME_BULUNAMADI';
  end if;

  v_onceki := coalesce(v_onceki, 0);

  if p_tip = 'giris' then
    v_sonraki := v_onceki + p_miktar;
  elsif p_tip = 'cikis' then
    v_sonraki := v_onceki - p_miktar;
    if v_sonraki < 0 then
      -- Stok eksiye düşmesin: mevcut kadarını düş, bilgi ver
      return jsonb_build_object(
        'ok', false,
        'mesaj', format('Stok yetersiz: %s (mevcut: %s, istenen: %s)', v_ad, v_onceki, p_miktar),
        'mevcut', v_onceki
      );
    end if;
  else
    v_sonraki := p_miktar;   -- düzeltme: doğrudan sayım girilir
  end if;

  update public.materials
     set stok_adet = v_sonraki,
         stok_guncelleme = now()
   where id = p_malzeme_id;

  insert into public.stok_hareketleri
    (malzeme_id, malzeme_adi, tip, miktar, onceki_adet, sonraki_adet, aciklama, ticket_id, kullanici)
  values
    (p_malzeme_id, v_ad, p_tip, p_miktar, v_onceki, v_sonraki, p_aciklama, p_ticket_id, p_kullanici);

  return jsonb_build_object('ok', true, 'onceki', v_onceki, 'sonraki', v_sonraki, 'malzeme', v_ad);
end;
$$;

revoke all on function public.stok_hareket(uuid, text, numeric, text, uuid, text) from public;
grant execute on function public.stok_hareket(uuid, text, numeric, text, uuid, text) to authenticated;


-- ============================================================================
-- 4) KRİTİK SEVİYE LİSTESİ (hangi parça bitiyor?)
-- ============================================================================
create or replace function public.kritik_stoklar()
returns table (
  id uuid, name text, unit text, stok_adet numeric, kritik_seviye numeric, sale_price numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.name, m.unit, m.stok_adet, m.kritik_seviye, m.sale_price
  from public.materials m
  where m.kritik_seviye > 0
    and m.stok_adet <= m.kritik_seviye
  order by (m.stok_adet - m.kritik_seviye) asc, m.name asc;
$$;

revoke all on function public.kritik_stoklar() from public;
grant execute on function public.kritik_stoklar() to authenticated;


-- ============================================================================
-- 5) GÜVENLİK: yeni tabloları da kilitle
-- ============================================================================
alter table public.stok_hareketleri enable row level security;

drop policy if exists stok_hareketleri_yonetici on public.stok_hareketleri;
create policy stok_hareketleri_yonetici on public.stok_hareketleri
  for all to authenticated
  using (public.buvisan_admin_mi())
  with check (public.buvisan_admin_mi());


-- ============================================================================
-- 6) KONTROL
-- ============================================================================
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='materials' and column_name in ('stok_adet','kritik_seviye')) as yeni_alan_sayisi,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='stok_hareketleri')                                                                  as hareket_tablosu,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('stok_hareket','kritik_stoklar'))                                                   as fonksiyon_sayisi,
  (select count(*) from public.materials)                                                                                          as toplam_malzeme,
  'Beklenen: alan 2, tablo 1, fonksiyon 2'                                                                                         as aciklama;
