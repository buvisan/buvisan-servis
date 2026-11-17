-- ============================================================================
--  ⏰ HATIRLATMA MOTORU (Güncelleme #204)
-- ----------------------------------------------------------------------------
--  AMAÇ: kimse "keşke hatırlatsaydı" demesin.
--    • Bakımdan 7 gün ve 1 gün önce MÜŞTERİYE hatırlatma
--      → portal sohbetine mesaj + push kuyruğu (hesap yoksa admin'e düşer)
--    • Her pazartesi ADMIN'e haftalık özet:
--      gecikmiş bakım · cevapsız teklif · yenilenecek sözleşme
--
--  TEKRAR KORUMASI: hatirlatma_gonderim.anahtar (unique) — aynı hatırlatma
--  ikinci kez üretilmez. Bu yüzden fonksiyon günde kaç kez çağrılırsa çağrılsın
--  mükerrer bildirim oluşmaz.
--
--  ⚠️ TUTAR KURALI: bu sistemdeki TÜM tutarlar KDV HARİÇTİR.
--     (Tek istisna: depo ekranındaki hesaplayıcının KDV'li çıktısı.)
--     Bu fonksiyon tutar yazmaz; ileride yazarsan "KDV hariç" ibaresi ekle.
--
--  KULLANIM: Supabase SQL Editor'de bir kez çalıştır (203'ten sonra).
-- ============================================================================


-- ─── 1) GÖNDERİM KAYDI (tekrar koruması) ───
create table if not exists public.hatirlatma_gonderim (
  anahtar     text primary key,
  tip         text not null,
  kaynak_id   uuid,
  created_at  timestamptz default now()
);

alter table public.hatirlatma_gonderim enable row level security;

drop policy if exists "hatirlatma_gonderim_all" on public.hatirlatma_gonderim;
create policy "hatirlatma_gonderim_all" on public.hatirlatma_gonderim
  for all to authenticated using (true) with check (true);

create index if not exists idx_hatirlatma_gonderim_tip
  on public.hatirlatma_gonderim(tip, created_at desc);


-- ─── 2) ÜRETİCİ ───
create or replace function public.hatirlatma_uret()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p record;
  v_anahtar text;
  v_mesaj text;
  v_gun integer;
  v_hesap_id uuid;
  v_hesap_firma text;
  v_bakim integer := 0;
  v_ozet integer := 0;
  v_gecikmis integer;
  v_teklif integer;
  v_sozlesme integer;
begin
  -- ═══ 1) BAKIM HATIRLATMASI (7 gün / 1 gün kala) — MÜŞTERİYE ═══
  for v_p in
    select b.id, b.tarih, b.sira, s.company_name, s.hitap_adi
    from public.bakim_plani b
    join public.maintenance_contracts s on s.id = b.sozlesme_id
    where b.durum = 'planlandi'
      and (b.tarih = current_date + 7 or b.tarih = current_date + 1)
    order by b.tarih
  loop
    v_gun := v_p.tarih - current_date;
    v_anahtar := 'bakim:' || v_gun::text || ':' || v_p.id::text;

    if exists (select 1 from public.hatirlatma_gonderim g where g.anahtar = v_anahtar) then
      continue;
    end if;

    v_mesaj := 'Periyodik bakımınız ' || to_char(v_p.tarih, 'DD.MM.YYYY') ||
               ' tarihinde (' || v_gun || ' gün sonra). Uygun değilse müşteri portalı → ' ||
               'BAKIM sekmesinden tarih değişikliği talep edebilirsiniz.';

    -- Portal hesabı var mı? (sözleşme tam ünvanı VEYA hitap ile eşleşme)
    v_hesap_id := null;
    v_hesap_firma := null;

    select h.id, h.firma_adi
      into v_hesap_id, v_hesap_firma
    from public.musteri_hesaplar h
    where h.durum = 'onaylandi'
      and (public.firma_eslestir(v_p.company_name, h.firma_adi) >= 75
        or public.firma_eslestir(coalesce(v_p.hitap_adi, ''), h.firma_adi) >= 75)
    order by h.id
    limit 1;

    if v_hesap_id is not null then
      -- portal sohbetine mesaj (müşteri portalda anında görür)
      begin
        insert into public.musteri_sohbet (hesap_id, gonderen, mesaj, okundu)
        values (v_hesap_id, 'admin', v_mesaj, false);
      exception when others then null; end;

      -- push kuyruğu (müşteri cihazı)
      insert into public.bildirim_kuyrugu (hedef_rol, hedef_kisi, baslik, mesaj, url, oncelik)
      values ('musteri', v_hesap_firma, 'Bakım hatırlatma', v_mesaj, '/musteri', 'normal');
    else
      -- portal hesabı yok → admin'e düşsün
      insert into public.bildirim_kuyrugu (hedef_rol, baslik, mesaj, url, oncelik)
      values ('admin', 'Bakım hatırlatma (müşteri hesabı yok)',
              v_p.company_name || ' — ' || v_mesaj, '/admin/bakim-takvimi', 'normal');
    end if;

    insert into public.hatirlatma_gonderim (anahtar, tip, kaynak_id)
    values (v_anahtar, 'bakim', v_p.id)
    on conflict (anahtar) do nothing;

    v_bakim := v_bakim + 1;
  end loop;

  -- ═══ 2) HAFTALIK ÖZET (pazartesi) — ADMIN'E ═══
  if extract(isodow from current_date) = 1 then
    v_anahtar := 'ozet:' || current_date::text;

    if not exists (select 1 from public.hatirlatma_gonderim g where g.anahtar = v_anahtar) then
      select count(*) into v_gecikmis
      from public.bakim_plani b
      where b.durum = 'planlandi' and b.tarih < current_date;

      select count(*) into v_teklif
      from public.offers o
      where lower(coalesce(public.jalan(to_jsonb(o), 'status'), 'bekliyor'))
              in ('bekliyor', 'beklemede', '')
        and o.created_at < now() - interval '3 days';

      select count(*) into v_sozlesme
      from public.maintenance_contracts s
      where coalesce(s.status, 'aktif') <> 'bitti'
        and coalesce(s.asama, 'anlasildi') <> 'teklif'
        and s.end_date between current_date and current_date + 60;

      if (v_gecikmis + v_teklif + v_sozlesme) > 0 then
        v_mesaj := 'Bu hafta: ' || v_gecikmis || ' gecikmiş bakım · ' ||
                   v_teklif || ' cevapsız teklif · ' ||
                   v_sozlesme || ' yenilenecek sözleşme.';

        insert into public.bildirim_kuyrugu (hedef_rol, baslik, mesaj, url, oncelik)
        values ('admin', 'Haftalık hatırlatma özeti', v_mesaj, '/admin/hatirlatmalar', 'yuksek');

        insert into public.hatirlatma_gonderim (anahtar, tip)
        values (v_anahtar, 'ozet')
        on conflict (anahtar) do nothing;

        v_ozet := 1;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'bakim', v_bakim,
    'ozet', v_ozet,
    'toplam', v_bakim + v_ozet,
    'mesaj', case when (v_bakim + v_ozet) = 0
               then 'Yeni hatırlatma yok (hepsi zaten gönderilmiş).'
               else (v_bakim + v_ozet) || ' yeni hatırlatma oluşturuldu.' end
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.hatirlatma_uret() from public;
grant execute on function public.hatirlatma_uret() to authenticated, service_role;


-- ─── 3) ESKİ KAYITLARI TEMİZLE (1 yıldan eski) ───
do $$
declare v integer;
begin
  delete from public.hatirlatma_gonderim where created_at < now() - interval '1 year';
  get diagnostics v = row_count;
  raise notice 'temizlenen eski kayit: %', v;
end $$;


-- ─── 4) KONTROL ───
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'hatirlatma_gonderim') as tablo_ok,
  (select count(*) from information_schema.routines
    where routine_schema = 'public' and routine_name = 'hatirlatma_uret') as fonksiyon_ok;
