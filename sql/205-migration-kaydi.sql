-- ============================================================================
--  🗂️ MIGRATION KAYDI (Güncelleme #205)
-- ----------------------------------------------------------------------------
--  SORUN: 204 SQL dosyası Supabase SQL Editor'de elle çalıştırılıyor.
--         "Hangi dosya çalıştı, hangisi unutuldu?" sorusunun cevabı yok.
--         Unutulan bir dosya = sessizce bozuk özellik.
--
--  ÇÖZÜM: schema_migrations tablosu + migration_isaretle() RPC'si.
--         Bundan sonraki HER yeni SQL dosyasının sonuna şu blok eklenir:
--
--           do $$
--           begin
--             perform public.migration_isaretle('206-yeni-dosya.sql', null);
--           exception when others then
--             raise notice 'migration kaydı atlandı';
--           end $$;
--
--  ⚠️ NOT: kolon adı "not" OLAMAZ (SQL rezerve kelimesi) → "notlar" kullanılır.
--
--  KULLANIM: Supabase SQL Editor'de bir kez çalıştır (204'ten sonra).
-- ============================================================================


-- ─── 1) TABLO ───
create table if not exists public.schema_migrations (
  dosya        text primary key,
  uygulandi_at timestamptz default now(),
  notlar       text
);

alter table public.schema_migrations enable row level security;

drop policy if exists "schema_migrations_all" on public.schema_migrations;
create policy "schema_migrations_all" on public.schema_migrations
  for all to authenticated using (true) with check (true);

create index if not exists idx_schema_migrations_tarih
  on public.schema_migrations(uygulandi_at desc);


-- ─── 2) İŞARETLEME FONKSİYONU ───
create or replace function public.migration_isaretle(p_dosya text, p_not text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_dosya), '') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Dosya adı zorunlu.');
  end if;

  insert into public.schema_migrations (dosya, notlar)
  values (trim(p_dosya), nullif(trim(coalesce(p_not, '')), ''))
  on conflict (dosya) do update
    set uygulandi_at = now(),
        notlar = excluded.notlar;

  return jsonb_build_object('ok', true, 'mesaj', trim(p_dosya) || ' kaydedildi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.migration_isaretle(text, text) from public;
grant execute on function public.migration_isaretle(text, text) to authenticated, service_role;


-- ─── 3) BU DOSYAYI KENDİ KAYDET ───
do $$
begin
  perform public.migration_isaretle('205-migration-kaydi.sql', 'migration sistemi kuruldu');
  raise notice '✅ 205 kaydedildi';
exception when others then
  raise notice 'kayıt atlandı: %', sqlerrm;
end $$;


-- ─── 4) KONTROL ───
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'schema_migrations') as tablo_ok,
  (select count(*) from information_schema.routines
    where routine_schema = 'public' and routine_name = 'migration_isaretle') as fonksiyon_ok,
  (select count(*) from public.schema_migrations) as kayitli_migration;
