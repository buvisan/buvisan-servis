-- ============================================================================
--  ⚡ REALTIME MESAJLAŞMA (Güncelleme #162)
-- ----------------------------------------------------------------------------
--  SORUN: Mesajlar 30 saniye gecikmeyle geliyor
--  ÇÖZÜM: Supabase Realtime ile anında
--
--  KULLANIM: 189'dan SONRA çalıştır.
-- ============================================================================

-- ─── 1) Realtime yayınına tablo ekle ───
do $$
begin
  begin
    alter publication supabase_realtime add table public.musteri_sohbet;
    raise notice '✅ musteri_sohbet realtime yayinina eklendi';
  exception when duplicate_object then
    raise notice 'ℹ️ musteri_sohbet zaten yayinda';
  when others then
    raise notice '⚠️ %', sqlerrm;
  end;

  begin
    alter publication supabase_realtime add table public.teklif_pazarlik;
    raise notice '✅ teklif_pazarlik realtime yayinina eklendi';
  exception when duplicate_object then
    raise notice 'ℹ️ teklif_pazarlik zaten yayinda';
  when others then
    raise notice '⚠️ %', sqlerrm;
  end;
end $$;


-- ─── 2) Realtime RLS (okuma izni) ───
drop policy if exists "sohbet_realtime_oku" on public.musteri_sohbet;
create policy "sohbet_realtime_oku" on public.musteri_sohbet
  for select to anon, authenticated using (true);

drop policy if exists "pazarlik_realtime_oku" on public.teklif_pazarlik;
create policy "pazarlik_realtime_oku" on public.teklif_pazarlik
  for select to anon, authenticated using (true);


-- ─── 3) Realtime durumu ───
select
  schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('musteri_sohbet', 'teklif_pazarlik')
order by tablename;

-- ─── 4) Test ───
select count(*) as sohbet_mesaj_sayisi from public.musteri_sohbet;
