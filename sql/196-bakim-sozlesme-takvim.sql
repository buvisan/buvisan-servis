-- ============================================================================
--  📋 BAKIM SÖZLEŞMESİ + OTOMATİK TAKVİM (Güncelleme #168)
-- ----------------------------------------------------------------------------
--  1) Sözleşme alanları genişletildi (hitap, servis fiyatı, tip, yıllık toplam)
--  2) bakim_plani tablosu — her bakım tarihi ayrı kayıt
--  3) Sözleşme eklenince takvim OTOMATİK oluşur
--  4) Tarih değiştirme + yapıldı işaretleme
--  5) Müşteri paneli için RPC
--
--  KULLANIM: 195'ten SONRA çalıştır.
-- ============================================================================

-- ─── 1) Sözleşme yeni alanlar ───
alter table public.maintenance_contracts
  add column if not exists hitap_adi text,
  add column if not exists service_price numeric(12,2) default 0,
  add column if not exists machine_type text default 'vinç',
  add column if not exists yearly_total numeric(12,2) default 0,
  add column if not exists visit_count integer default 0,
  add column if not exists notes text;

-- ─── 2) Bakım planı tablosu ───
create table if not exists public.bakim_plani (
  id            uuid primary key default gen_random_uuid(),
  sozlesme_id   uuid references public.maintenance_contracts(id) on delete cascade,
  musteri       text not null,
  tarih         date not null,
  sira          integer default 1,           -- yıl içindeki kaçıncı bakım
  yil           integer,
  durum         text default 'planlandi',    -- planlandi | yapildi | ertelendi | iptal
  yapilma_tarihi date,
  notlar        text,
  form_id       uuid,                        -- bağlı bakım formu
  created_at    timestamptz default now(),
  guncelleme    timestamptz default now()
);

alter table public.bakim_plani enable row level security;
drop policy if exists "bakim_plani_all" on public.bakim_plani;
create policy "bakim_plani_all" on public.bakim_plani for all to authenticated using (true) with check (true);

create index if not exists idx_bakim_plani_tarih on public.bakim_plani(tarih, durum);
create index if not exists idx_bakim_plani_sozlesme on public.bakim_plani(sozlesme_id);


-- ─── 3) Sözleşme kaydet + TAKVİM OLUŞTUR ───
create or replace function public.sozlesme_kaydet(
  p_firma text,
  p_hitap text default null,
  p_makine_sayisi integer default 1,
  p_makine_fiyat numeric default 0,
  p_servis_fiyat numeric default 0,
  p_periyot integer default 3,
  p_makine_tipi text default 'vinç',
  p_baslangic date default current_date,
  p_sure_yil integer default 1,
  p_dosya_url text default null,
  p_notlar text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_bitis date;
  v_ay_sayisi integer;
  v_ziyaret integer;
  v_yillik numeric(12,2);
  v_i integer;
  v_tarih date;
begin
  if coalesce(trim(p_firma),'') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Firma adı zorunludur.');
  end if;

  v_ay_sayisi := greatest(1, coalesce(p_periyot, 3));
  v_bitis := (coalesce(p_baslangic, current_date)::date + (greatest(1, coalesce(p_sure_yil,1)) * interval '1 year'))::date;

  -- Yıllık ziyaret sayısı = 12 / periyot
  v_ziyaret := greatest(1, floor(12.0 / v_ay_sayisi)::integer);

  -- Yıllık toplam = (makine × makine fiyat + servis fiyat) × ziyaret
  v_yillik := (coalesce(p_makine_sayisi,1) * coalesce(p_makine_fiyat,0) + coalesce(p_servis_fiyat,0)) * v_ziyaret;

  insert into public.maintenance_contracts (
    company_name, hitap_adi, machine_count, price_per_machine, service_price,
    maintenance_period_months, machine_type, start_date, end_date,
    status, contract_file_url, yearly_total, visit_count, notes
  ) values (
    trim(p_firma), nullif(trim(coalesce(p_hitap,'')),''),
    greatest(1, coalesce(p_makine_sayisi,1)), coalesce(p_makine_fiyat,0), coalesce(p_servis_fiyat,0),
    v_ay_sayisi, coalesce(p_makine_tipi,'vinç'),
    coalesce(p_baslangic, current_date)::date, v_bitis,
    'aktif', nullif(trim(coalesce(p_dosya_url,'')),''), v_yillik, v_ziyaret,
    nullif(trim(coalesce(p_notlar,'')),'')
  ) returning id into v_id;

  -- ⭐ TAKVİM OLUŞTUR: her periyot için bir tarih
  v_i := 0;
  v_tarih := coalesce(p_baslangic, current_date)::date;
  while v_tarih <= v_bitis and v_i < 50 loop
    insert into public.bakim_plani (sozlesme_id, musteri, tarih, sira, yil, durum)
    values (v_id, trim(p_firma), v_tarih, v_i + 1, extract(year from v_tarih)::integer, 'planlandi');
    v_i := v_i + 1;
    v_tarih := (v_tarih + (v_ay_sayisi || ' months')::interval)::date;
  end loop;

  return jsonb_build_object('ok', true, 'id', v_id,
    'bitis', v_bitis, 'yillik_toplam', v_yillik, 'ziyaret', v_ziyaret,
    'takvim_kayit', v_i,
    'mesaj', 'Sözleşme kaydedildi. ' || v_i || ' bakım takvime eklendi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.sozlesme_kaydet(text,text,integer,numeric,numeric,integer,text,date,integer,text,text) from public;
grant execute on function public.sozlesme_kaydet(text,text,integer,numeric,numeric,integer,text,date,integer,text,text) to authenticated;


-- ─── 4) Bakım takvimi (yıl bazlı) ───
create or replace function public.bakim_takvimi_detay(p_yil integer default null, p_musteri text default null)
returns table (
  id uuid, sozlesme_id uuid, musteri text, tarih text, tarih_iso text,
  sira integer, durum text, makine_sayisi integer, makine_tipi text,
  periyot integer, hitap text, gun_kaldi integer, sozlesme_bitis text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id, b.sozlesme_id, b.musteri,
    to_char(b.tarih,'DD.MM.YYYY'), to_char(b.tarih,'YYYY-MM-DD'),
    b.sira, b.durum,
    coalesce(s.machine_count, 0), coalesce(s.machine_type,'vinç'),
    coalesce(s.maintenance_period_months, 0), coalesce(s.hitap_adi,''),
    (b.tarih - current_date)::integer,
    to_char(s.end_date,'DD.MM.YYYY')
  from public.bakim_plani b
  left join public.maintenance_contracts s on s.id = b.sozlesme_id
  where (p_yil is null or b.yil = p_yil)
    and (p_musteri is null or public.firma_eslestir(b.musteri, p_musteri) >= 75)
  order by b.tarih asc;
$$;

revoke all on function public.bakim_takvimi_detay(integer, text) from public;
grant execute on function public.bakim_takvimi_detay(integer, text) to authenticated;


-- ─── 5) Tarih değiştir ───
create or replace function public.bakim_tarihi_degistir(p_id uuid, p_yeni_tarih date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bakim_plani
     set tarih = p_yeni_tarih,
         yil = extract(year from p_yeni_tarih)::integer,
         guncelleme = now()
   where id = p_id;

  if not found then return jsonb_build_object('ok', false, 'mesaj', 'Kayıt bulunamadı.'); end if;
  return jsonb_build_object('ok', true, 'mesaj', 'Tarih güncellendi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.bakim_tarihi_degistir(uuid, date) from public;
grant execute on function public.bakim_tarihi_degistir(uuid, date) to authenticated;


-- ─── 6) Yapıldı işaretle ───
create or replace function public.bakim_yapildi_isaretle(p_id uuid, p_yapildi boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bakim_plani
     set durum = case when p_yapildi then 'yapildi' else 'planlandi' end,
         yapilma_tarihi = case when p_yapildi then current_date else null end,
         guncelleme = now()
   where id = p_id;

  if not found then return jsonb_build_object('ok', false, 'mesaj', 'Kayıt bulunamadı.'); end if;
  return jsonb_build_object('ok', true, 'mesaj', case when p_yapildi then 'Yapıldı olarak işaretlendi.' else 'Geri alındı.' end);
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.bakim_yapildi_isaretle(uuid, boolean) from public;
grant execute on function public.bakim_yapildi_isaretle(uuid, boolean) to authenticated;


-- ─── 7) Eski sözleşmeler için takvim oluştur (tek seferlik) ───
create or replace function public.eksik_takvimleri_tamamla()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s record;
  v_sayi integer := 0;
  v_adet integer;
  v_tarih date;
  v_ay integer;
  v_i integer;
begin
  for v_s in
    select * from public.maintenance_contracts s
    where not exists (select 1 from public.bakim_plani b where b.sozlesme_id = s.id)
      and coalesce(s.status,'aktif') <> 'bitti'
  loop
    v_ay := greatest(1, coalesce(v_s.maintenance_period_months, 3));
    v_tarih := coalesce(v_s.start_date, current_date);
    v_i := 0;
    while v_tarih <= coalesce(v_s.end_date, (v_tarih + interval '1 year')::date) and v_i < 50 loop
      insert into public.bakim_plani (sozlesme_id, musteri, tarih, sira, yil, durum)
      values (v_s.id, v_s.company_name, v_tarih, v_i + 1, extract(year from v_tarih)::integer, 'planlandi');
      v_i := v_i + 1;
      v_adet := coalesce(v_adet, 0) + 1;
      v_tarih := (v_tarih + (v_ay || ' months')::interval)::date;
    end loop;
    v_sayi := v_sayi + 1;
  end loop;

  return jsonb_build_object('ok', true, 'sozlesme', v_sayi, 'kayit', coalesce(v_adet,0),
    'mesaj', v_sayi || ' sözleşme için takvim oluşturuldu.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.eksik_takvimleri_tamamla() from public;
grant execute on function public.eksik_takvimleri_tamamla() to authenticated;


-- ─── 8) MÜŞTERİ: kendi bakım takvimi ───
create or replace function public.musteri_bakim_takvimi(p_token text, p_yil integer default null)
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

  if v_h.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz.'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'tarih', to_char(b.tarih,'DD.MM.YYYY'),
    'tarih_iso', to_char(b.tarih,'YYYY-MM-DD'),
    'sira', b.sira, 'durum', b.durum,
    'gun_kaldi', (b.tarih - current_date)::integer,
    'makine_sayisi', coalesce(s.machine_count,0),
    'makine_tipi', coalesce(s.machine_type,'vinç'),
    'periyot', coalesce(s.maintenance_period_months,0)
  ) order by b.tarih), '[]'::jsonb)
  into v_sonuc
  from public.bakim_plani b
  join public.maintenance_contracts s on s.id = b.sozlesme_id
  where public.firma_eslestir(b.musteri, v_h.firma_adi) >= 75
    and (p_yil is null or b.yil = p_yil);

  return jsonb_build_object('ok', true,
    'firma', v_h.firma_adi,
    'takvim', v_sonuc,
    'sozlesme_var', jsonb_array_length(v_sonuc) > 0
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_bakim_takvimi(text, integer) from public;
grant execute on function public.musteri_bakim_takvimi(text, integer) to anon, authenticated;


-- ─── 9) MÜŞTERİ: sözleşme bilgisi (PDF için) ───
create or replace function public.musteri_sozlesmem(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_h record;
  v_s record;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz.'); end if;

  select * into v_s from public.maintenance_contracts s
  where public.firma_eslestir(s.company_name, v_h.firma_adi) >= 75
    and coalesce(s.status,'aktif') <> 'bitti'
  order by s.start_date desc limit 1;

  if v_s.id is null then
    return jsonb_build_object('ok', true, 'var', false);
  end if;

  return jsonb_build_object('ok', true, 'var', true,
    'id', v_s.id,
    'firma', v_s.company_name,
    'hitap', coalesce(v_s.hitap_adi,''),
    'makine_sayisi', coalesce(v_s.machine_count,0),
    'makine_tipi', coalesce(v_s.machine_type,'vinç'),
    'makine_fiyat', coalesce(v_s.price_per_machine,0),
    'servis_fiyat', coalesce(v_s.service_price,0),
    'periyot', coalesce(v_s.maintenance_period_months,0),
    'baslangic', to_char(v_s.start_date,'DD.MM.YYYY'),
    'bitis', to_char(v_s.end_date,'DD.MM.YYYY'),
    'yillik_toplam', coalesce(v_s.yearly_total,0),
    'visit_count', coalesce(v_s.visit_count,0),
    'dosya_url', coalesce(v_s.contract_file_url,'')
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_sozlesmem(text) from public;
grant execute on function public.musteri_sozlesmem(text) to anon, authenticated;


-- ─── 10) MEVCUT SÖZLEŞMELER İÇİN TAKVİM OLUŞTUR ───
do $$
declare r jsonb;
begin
  r := public.eksik_takvimleri_tamamla();
  raise notice '📅 %', r::text;
end $$;

-- ─── 11) TEST ───
select count(*) as sozlesme from public.maintenance_contracts;
select count(*) as takvim_kayit from public.bakim_plani;
select musteri, tarih, durum from public.bakim_takvimi_detay(null, null) limit 10;
