-- ============================================================================
--  👤 MÜŞTERİ BAKIM TARİHİ DEĞİŞTİRME (Güncelleme #173)
-- ----------------------------------------------------------------------------
--  Müşteri kendi bakım tarihini değiştirebilsin (1 kez, admin onayına düşer)
--
--  KULLANIM: 200'den SONRA çalıştır.
-- ============================================================================

-- ─── 1) Değişiklik talepleri tablosu ───
create table if not exists public.bakim_tarih_talebi (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid references public.bakim_plani(id) on delete cascade,
  hesap_id      uuid references public.musteri_hesaplar(id) on delete cascade,
  eski_tarih    date,
  yeni_tarih    date not null,
  sebep         text,
  durum         text default 'bekliyor',   -- bekliyor | onaylandi | reddedildi
  admin_notu    text,
  created_at    timestamptz default now()
);

alter table public.bakim_tarih_talebi enable row level security;
drop policy if exists "bakim_talep_all" on public.bakim_tarih_talebi;
create policy "bakim_talep_all" on public.bakim_tarih_talebi for all to authenticated using (true) with check (true);


-- ─── 2) Müşteri tarih değişikliği talep eder ───
create or replace function public.musteri_bakim_tarih_talebi(
  p_token text, p_plan_id uuid, p_yeni_tarih date, p_sebep text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_h record;
  v_p record;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz.'); end if;

  select * into v_p from public.bakim_plani where id = p_plan_id;
  if v_p.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Bakım kaydı bulunamadı.'); end if;

  -- Bu bakım bu müşteriye mi ait?
  if public.firma_eslestir(v_p.musteri, v_h.firma_adi) < 75 then
    return jsonb_build_object('ok', false, 'mesaj', 'Bu bakım size ait değil.');
  end if;

  if v_p.durum = 'yapildi' then
    return jsonb_build_object('ok', false, 'mesaj', 'Yapılmış bakımın tarihi değiştirilemez.');
  end if;

  if p_yeni_tarih < current_date then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçmiş bir tarih seçilemez.');
  end if;

  -- Bekleyen talep var mı?
  if exists (select 1 from public.bakim_tarih_talebi
             where plan_id = p_plan_id and durum = 'bekliyor') then
    return jsonb_build_object('ok', false, 'mesaj', 'Bu bakım için zaten bekleyen bir talebiniz var.');
  end if;

  insert into public.bakim_tarih_talebi (plan_id, hesap_id, eski_tarih, yeni_tarih, sebep)
  values (p_plan_id, v_h.id, v_p.tarih, p_yeni_tarih, nullif(trim(coalesce(p_sebep,'')),''));

  begin
    perform public.bildirim_gonder(
      '📅 Bakım Tarihi Değişiklik Talebi',
      v_h.firma_adi || ' — ' || to_char(v_p.tarih,'DD.MM.YYYY') || ' → ' || to_char(p_yeni_tarih,'DD.MM.YYYY'),
      'admin', null, '/admin/bakim-takvimi', 'yuksek'
    );
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'mesaj', 'Talebiniz alındı. Onaylandığında tarih güncellenecek.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_bakim_tarih_talebi(text, uuid, date, text) from public;
grant execute on function public.musteri_bakim_tarih_talebi(text, uuid, date, text) to anon, authenticated;


-- ─── 3) Admin talepleri görür + cevaplar ───
create or replace function public.bakim_tarih_talepleri(p_durum text default 'bekliyor')
returns table (
  id uuid, plan_id uuid, firma text, eski_tarih text, yeni_tarih text,
  sebep text, durum text, tarih text, hesap_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.plan_id, h.firma_adi,
         to_char(t.eski_tarih,'DD.MM.YYYY'), to_char(t.yeni_tarih,'DD.MM.YYYY'),
         coalesce(t.sebep,''), t.durum,
         to_char(t.created_at,'DD.MM.YYYY HH24:MI'), t.hesap_id
  from public.bakim_tarih_talebi t
  join public.musteri_hesaplar h on h.id = t.hesap_id
  where (p_durum = 'hepsi' or t.durum = p_durum)
  order by t.created_at desc;
$$;

revoke all on function public.bakim_tarih_talepleri(text) from public;
grant execute on function public.bakim_tarih_talepleri(text) to authenticated;


create or replace function public.bakim_tarih_talebi_cevapla(
  p_id uuid, p_onay boolean, p_not text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t record;
  v_h record;
begin
  select * into v_t from public.bakim_tarih_talebi where id = p_id;
  if v_t.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Talep bulunamadı.'); end if;
  if v_t.durum <> 'bekliyor' then return jsonb_build_object('ok', false, 'mesaj', 'Bu talep zaten sonuçlanmış.'); end if;

  select * into v_h from public.musteri_hesaplar where id = v_t.hesap_id;

  if p_onay then
    update public.bakim_plani
       set tarih = v_t.yeni_tarih,
           yil = extract(year from v_t.yeni_tarih)::integer,
           guncelleme = now()
     where id = v_t.plan_id;
  end if;

  update public.bakim_tarih_talebi
     set durum = case when p_onay then 'onaylandi' else 'reddedildi' end,
         admin_notu = nullif(trim(coalesce(p_not,'')),'')
   where id = p_id;

  return jsonb_build_object('ok', true,
    'mesaj', case when p_onay then '✅ Tarih güncellendi.' else '❌ Talep reddedildi.' end);
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.bakim_tarih_talebi_cevapla(uuid, boolean, text) from public;
grant execute on function public.bakim_tarih_talebi_cevapla(uuid, boolean, text) to authenticated;


-- ─── 4) Müşteri kendi taleplerini görür ───
create or replace function public.musteri_bakim_taleplerim(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_h record;
  v_sonuc jsonb;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'eski', to_char(t.eski_tarih,'DD.MM.YYYY'),
    'yeni', to_char(t.yeni_tarih,'DD.MM.YYYY'),
    'sebep', coalesce(t.sebep,''), 'durum', t.durum,
    'admin_notu', coalesce(t.admin_notu,''),
    'tarih', to_char(t.created_at,'DD.MM.YYYY HH24:MI')
  ) order by t.created_at desc), '[]'::jsonb)
  into v_sonuc
  from public.bakim_tarih_talebi t where t.hesap_id = v_h.id;

  return v_sonuc;
exception when others then return '[]'::jsonb;
end $$;

revoke all on function public.musteri_bakim_taleplerim(text) from public;
grant execute on function public.musteri_bakim_taleplerim(text) to anon, authenticated;


-- ─── 5) TEST ───
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='bakim_tarih_talebi') as tablo_ok,
  (select count(*) from information_schema.routines
    where routine_schema='public' and routine_name in
      ('musteri_bakim_tarih_talebi','bakim_tarih_talepleri','bakim_tarih_talebi_cevapla','musteri_bakim_taleplerim')) as fn_ok;
