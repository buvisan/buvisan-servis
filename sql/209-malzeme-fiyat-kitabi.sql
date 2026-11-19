-- ============================================================================
--  📚 MALZEME FİYAT KİTABI (Güncelleme #209)
-- ----------------------------------------------------------------------------
--  EKRAN: /admin/akilli-analiz → "Fiyat Motoru" sekmesi
--
--  NEDEN?
--    Malzeme fiyatı her seferinde web'de yeniden aranıyordu (yavaş) ve aynı
--    malzeme için her aramada farklı sonuç çıkabiliyordu. Fiyat kitabı,
--    bulunan GERÇEK fiyatı öğrenip saklar: aynı malzeme tekrar arandığında
--    ANINDA, ÜCRETSİZ ve aynı fiyatla gelir (kaynak: KİTAP).
--
--  BU DOSYA NE YAPAR?
--    1) public.malzeme_fiyat_kitabi tablosu (yoksa oluşturur)
--         ad_normal     : normalize malzeme adı (benzersiz anahtar)
--         ad            : kullanıcının yazdığı ad
--         birim_fiyat   : KDV HARİÇ birim fiyat (TL)
--         kaynak        : 'kitap' | 'web' | 'elle'
--         kaynak_url    : fiyatın bulunduğu sayfa (varsa)
--         adet_birimi   : 'adet' | 'metre' | 'kg' …
--         guncelleme    : son güncelleme zamanı
--         kullanim_sayisi : kaç kez kullanıldı (kitaptan kaç kez geldi)
--    2) public.malzeme_ad_normal(text)  → TS'deki adAnahtar() ile AYNI kural
--    3) public.malzeme_fiyat_kitabi(text[])      → tek çağrıda toplu arama
--                                                  (kullanim_sayisi +1)
--    4) public.malzeme_fiyat_kitabi_yaz(...)     → upsert (web/elle)
--    5) RLS: yalnızca giriş yapmış kullanıcı (authenticated) erişir
--
--  ⚠️ TÜM TUTARLAR KDV HARİÇTİR (kdv_haric = true).
--  ⚠️ Veri silmez; tablo yoksa oluşturur, varsa dokunmaz.
--  ⚠️ cranes tablosuna ve QR kodlarına DOKUNULMAZ.
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
--            (208'den SONRA çalıştırılır)
-- ============================================================================


-- ============================================================================
-- 1) TABLO
-- ============================================================================
create table if not exists public.malzeme_fiyat_kitabi (
  ad_normal       text primary key,
  ad              text not null,
  birim_fiyat     numeric(12,2) not null default 0 check (birim_fiyat >= 0),
  kaynak          text not null default 'web' check (kaynak in ('kitap', 'web', 'elle')),
  kaynak_url      text,
  adet_birimi     text default 'adet',
  guncelleme      timestamptz default now(),
  kullanim_sayisi integer not null default 0,
  kdv_haric       boolean not null default true
);

comment on table public.malzeme_fiyat_kitabi is
  'Öğrenen malzeme fiyat kitabı — TÜM tutarlar KDV HARİÇ; web araması/elle giriş ile güncellenir';
comment on column public.malzeme_fiyat_kitabi.birim_fiyat is
  'KDV HARİÇ birim fiyat (TL)';
comment on column public.malzeme_fiyat_kitabi.kaynak is
  'kitap = kitaptan doğrulandı · web = ücretsiz web araması · elle = kullanıcı düzeltti';

alter table public.malzeme_fiyat_kitabi enable row level security;

drop policy if exists "malzeme_fiyat_kitabi_all" on public.malzeme_fiyat_kitabi;
create policy "malzeme_fiyat_kitabi_all" on public.malzeme_fiyat_kitabi
  for all to authenticated using (true) with check (true);

create index if not exists idx_malzeme_fiyat_kitabi_guncelleme
  on public.malzeme_fiyat_kitabi(guncelleme desc);


-- ============================================================================
-- 2) 🧹 AD NORMALİZASYONU
--    TS: lib/malzemeFiyatWeb.ts → adAnahtar() ile AYNI kural:
--    küçük harf + Türkçe harf sadeleştirme + sadece [a-z0-9]
-- ============================================================================
create or replace function public.malzeme_ad_normal(p_ad text)
returns text
language plpgsql
immutable
as $$
begin
  -- translate: Ç→C, Ğ→G, İ→I, Ö→O, Ş→S, Ü→U, Â→A, Î→I, Û→U (ve küçükleri)
  -- sonra lower() + [a-z0-9] dışını at → TS adAnahtar() ile birebir aynı
  return regexp_replace(
    lower(
      translate(
        coalesce(p_ad, ''),
        'ÇĞİÖŞÜÂÎÛçğıöşüâîû',
        'CGIOSUAIUcgiosuaiu'
      )
    ),
    '[^a-z0-9]', '', 'g'
  );
end $$;

revoke all on function public.malzeme_ad_normal(text) from public;
grant execute on function public.malzeme_ad_normal(text) to authenticated, service_role;


-- ============================================================================
-- 3) 🔎 TOPLU ARAMA (kitaptan) — kullanim_sayisi'nı da artırır
--    p_adlar: ham malzeme adları (normalize fonksiyon içinde yapılır)
--    Dönen: jsonb dizi  [{ ad_normal, ad, birim_fiyat, kaynak, kaynak_url,
--                          adet_birimi, guncelleme, kullanim_sayisi }]
-- ============================================================================
create or replace function public.malzeme_fiyat_kitabi(p_adlar text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anahtarlar text[];
  v_sonuc jsonb;
begin
  if p_adlar is null or array_length(p_adlar, 1) is null then
    return '[]'::jsonb;
  end if;

  select array_agg(distinct public.malzeme_ad_normal(x))
    into v_anahtarlar
  from unnest(p_adlar) as x
  where public.malzeme_ad_normal(x) <> '';

  if v_anahtarlar is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.guncelleme desc), '[]'::jsonb)
    into v_sonuc
  from public.malzeme_fiyat_kitabi t
  where t.ad_normal = any (v_anahtarlar);

  -- Kullanım sayacı: bu kayıtlar fiyat motorunda kaç kez kullanıldı
  update public.malzeme_fiyat_kitabi t
     set kullanim_sayisi = t.kullanim_sayisi + 1
   where t.ad_normal = any (v_anahtarlar);

  return v_sonuc;
exception when others then
  return '[]'::jsonb;   -- tablo yoksa bile ekran çökmez
end $$;

revoke all on function public.malzeme_fiyat_kitabi(text[]) from public;
grant execute on function public.malzeme_fiyat_kitabi(text[]) to authenticated, service_role;


-- ============================================================================
-- 4) 💾 YAZMA (öğrenme) — web araması veya elle doğrulama
--    p_kaynak: 'web' (ücretsiz arama) | 'elle' (kullanıcı düzeltti)
--    ⚠️ birim_fiyat KDV HARİÇ olarak yazılır.
-- ============================================================================
create or replace function public.malzeme_fiyat_kitabi_yaz(
  p_ad          text,
  p_birim_fiyat numeric,
  p_kaynak      text default 'web',
  p_kaynak_url  text default null,
  p_adet_birimi text default 'adet'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad_normal text;
  v_ad        text;
  v_fiyat     numeric;
  v_kaynak    text;
begin
  v_ad := btrim(coalesce(p_ad, ''));
  v_ad_normal := public.malzeme_ad_normal(v_ad);
  v_fiyat := round(coalesce(p_birim_fiyat, 0)::numeric, 2);
  v_kaynak := case when lower(coalesce(p_kaynak, '')) in ('elle', 'kitap', 'web')
                   then lower(p_kaynak) else 'web' end;

  if v_ad_normal = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Malzeme adı boş olamaz.');
  end if;

  if v_fiyat <= 0 then
    return jsonb_build_object('ok', false, 'mesaj', 'Birim fiyat 0 olamaz (fiyat yoksa kaydetmeyin).');
  end if;

  insert into public.malzeme_fiyat_kitabi as k
    (ad_normal, ad, birim_fiyat, kaynak, kaynak_url, adet_birimi, guncelleme, kullanim_sayisi, kdv_haric)
  values
    (v_ad_normal, v_ad, v_fiyat, v_kaynak, nullif(btrim(coalesce(p_kaynak_url, '')), ''),
     coalesce(nullif(btrim(coalesce(p_adet_birimi, '')), ''), 'adet'), now(), 1, true)
  on conflict (ad_normal) do update
    set ad            = excluded.ad,
        birim_fiyat   = excluded.birim_fiyat,
        kaynak        = excluded.kaynak,
        kaynak_url    = coalesce(excluded.kaynak_url, k.kaynak_url),
        adet_birimi   = excluded.adet_birimi,
        guncelleme    = now(),
        kdv_haric     = true;

  return jsonb_build_object(
    'ok', true,
    'ad_normal', v_ad_normal,
    'birim_fiyat', v_fiyat,
    'kaynak', v_kaynak,
    'kdv_haric', true
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.malzeme_fiyat_kitabi_yaz(text, numeric, text, text, text) from public;
grant execute on function public.malzeme_fiyat_kitabi_yaz(text, numeric, text, text, text) to authenticated, service_role;


-- ============================================================================
-- 5) DOĞRULAMA
-- ============================================================================
do $$
declare
  v_tablo  boolean;
  v_satir  integer := 0;
  v_normal text;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'malzeme_fiyat_kitabi'
  ) into v_tablo;

  begin
    select count(*) into v_satir from public.malzeme_fiyat_kitabi;
  exception when others then
    v_satir := 0;
  end;

  begin
    v_normal := public.malzeme_ad_normal('Kontaktör 40A');
  exception when others then
    v_normal := '(hata)';
  end;

  raise notice '✅ malzeme_fiyat_kitabi tablosu=%, kayıt=%', v_tablo, v_satir;
  raise notice '✅ ad normalizasyonu: "Kontaktör 40A" → %', v_normal;
end $$;


-- ─── MIGRATION KAYDI ───
do $$
begin
  perform public.migration_isaretle('209-malzeme-fiyat-kitabi.sql', 'malzeme fiyat kitabı: tablo + toplu arama + yazma (KDV hariç)');
  raise notice '✅ 209 kaydedildi';
exception when others then
  raise notice 'migration kaydı atlandı (205 çalıştırılmamış olabilir)';
end $$;
