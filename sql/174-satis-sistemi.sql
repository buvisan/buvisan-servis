-- ============================================================================
--  🛒 MALZEME SATIŞ SİSTEMİ (Güncelleme #146)
-- ----------------------------------------------------------------------------
--  • Depodan malzeme seç → satış oluştur
--  • A4 satış formu + irsaliye yazdır
--  • Tek tuşla finansa aktar
--
--  KULLANIM: 173'ten SONRA çalıştır. Veri silmez.
-- ============================================================================


-- ============================================================================
-- 1) 🧾 satislar
-- ============================================================================
create table if not exists public.satislar (
  id              uuid primary key default gen_random_uuid(),
  satis_no        text unique,
  musteri         text not null,
  yetkili         text,
  telefon         text,
  adres           text,
  satis_tarihi    date default current_date,
  belge_tipi      text default 'satis',      -- satis | irsaliye
  irsaliye_no     text,
  ara_toplam      numeric(12,2) default 0,
  iskonto         numeric(12,2) default 0,
  kdv_orani       numeric(5,2) default 20,
  kdv_tutar       numeric(12,2) default 0,
  genel_toplam    numeric(12,2) default 0,
  odeme_tipi      text,                       -- nakit | havale | cek | senet | kredi_karti
  notlar          text,
  durum           text default 'tamamlandi',  -- taslak | tamamlandi | iptal
  finans_kaydedildi boolean default false,
  finans_kayit_id uuid,
  olusturan       text,
  created_at      timestamptz default now()
);

alter table public.satislar enable row level security;
drop policy if exists "satislar_all" on public.satislar;
create policy "satislar_all" on public.satislar for all to authenticated using (true) with check (true);

create index if not exists idx_satis_tarih on public.satislar(satis_tarihi desc);


-- ============================================================================
-- 2) 📦 satis_kalemleri
-- ============================================================================
create table if not exists public.satis_kalemleri (
  id              uuid primary key default gen_random_uuid(),
  satis_id        uuid references public.satislar(id) on delete cascade,
  stok_id         uuid,
  parca_adi       text not null,
  parca_kodu      text,
  birim           text default 'Adet',
  adet            numeric(10,2) default 1,
  birim_fiyat     numeric(12,2) default 0,
  toplam          numeric(12,2) default 0,
  created_at      timestamptz default now()
);

alter table public.satis_kalemleri enable row level security;
drop policy if exists "satis_kalem_all" on public.satis_kalemleri;
create policy "satis_kalem_all" on public.satis_kalemleri for all to authenticated using (true) with check (true);

create index if not exists idx_satis_kalem on public.satis_kalemleri(satis_id);


-- ============================================================================
-- 3) 🔢 satis_no_uret()
-- ============================================================================
create or replace function public.satis_no_uret()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yil text := to_char(current_date, 'YYYY');
  v_sira integer;
  v_no text;
begin
  select coalesce(max(
    case when satis_no ~ ('^SAT-' || v_yil || '-[0-9]+$')
         then split_part(satis_no, '-', 3)::integer else 0 end
  ), 0) + 1
  into v_sira
  from public.satislar;

  v_no := 'SAT-' || v_yil || '-' || lpad(v_sira::text, 4, '0');
  return v_no;
exception when others then
  return 'SAT-' || to_char(current_date, 'YYYYMMDD') || '-' || floor(random() * 9000 + 1000)::text;
end $$;

revoke all on function public.satis_no_uret() from public;
grant execute on function public.satis_no_uret() to authenticated;


-- ============================================================================
-- 4) 💾 satis_kaydet(...)
-- ============================================================================
create or replace function public.satis_kaydet(
  p_musteri text,
  p_kalemler jsonb,
  p_yetkili text default null,
  p_telefon text default null,
  p_adres text default null,
  p_odeme_tipi text default null,
  p_iskonto numeric default 0,
  p_kdv_orani numeric default 20,
  p_belge_tipi text default 'satis',
  p_notlar text default null,
  p_olusturan text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_no text;
  v_ara numeric(12,2) := 0;
  v_kdv numeric(12,2);
  v_genel numeric(12,2);
  v_kalem record;
  v_adet numeric;
  v_bf numeric;
begin
  if coalesce(trim(p_musteri),'') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Müşteri adı zorunludur.');
  end if;
  if p_kalemler is null or jsonb_array_length(p_kalemler) = 0 then
    return jsonb_build_object('ok', false, 'mesaj', 'En az bir malzeme ekleyin.');
  end if;

  -- Ara toplam
  for v_kalem in select * from jsonb_array_elements(p_kalemler) loop
    v_adet := coalesce((v_kalem.value->>'adet')::numeric, 1);
    v_bf := coalesce((v_kalem.value->>'birim_fiyat')::numeric, 0);
    v_ara := v_ara + (v_adet * v_bf);
  end loop;

  v_ara := greatest(0, v_ara - coalesce(p_iskonto, 0));
  v_kdv := round(v_ara * coalesce(p_kdv_orani, 20) / 100, 2);
  v_genel := v_ara + v_kdv;
  v_no := public.satis_no_uret();

  insert into public.satislar (
    satis_no, musteri, yetkili, telefon, adres, satis_tarihi,
    belge_tipi, ara_toplam, iskonto, kdv_orani, kdv_tutar, genel_toplam,
    odeme_tipi, notlar, olusturan
  ) values (
    v_no, trim(p_musteri), nullif(trim(coalesce(p_yetkili,'')),''),
    nullif(trim(coalesce(p_telefon,'')),''), nullif(trim(coalesce(p_adres,'')),''),
    current_date, coalesce(p_belge_tipi,'satis'), v_ara, coalesce(p_iskonto,0),
    coalesce(p_kdv_orani,20), v_kdv, v_genel, nullif(trim(coalesce(p_odeme_tipi,'')),''),
    nullif(trim(coalesce(p_notlar,'')),''), p_olusturan
  ) returning id into v_id;

  -- Kalemler
  for v_kalem in select * from jsonb_array_elements(p_kalemler) loop
    v_adet := coalesce((v_kalem.value->>'adet')::numeric, 1);
    v_bf := coalesce((v_kalem.value->>'birim_fiyat')::numeric, 0);
    insert into public.satis_kalemleri (
      satis_id, stok_id, parca_adi, parca_kodu, birim, adet, birim_fiyat, toplam
    ) values (
      v_id,
      nullif(v_kalem.value->>'stok_id','')::uuid,
      coalesce(v_kalem.value->>'parca_adi', 'Malzeme'),
      nullif(v_kalem.value->>'parca_kodu',''),
      coalesce(nullif(v_kalem.value->>'birim',''), 'Adet'),
      v_adet, v_bf, v_adet * v_bf
    );
  end loop;

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'satis_no', v_no,
    'ara_toplam', v_ara, 'kdv', v_kdv, 'genel_toplam', v_genel,
    'mesaj', 'Satış kaydedildi: ' || v_no
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.satis_kaydet(text, jsonb, text, text, text, text, numeric, numeric, text, text, text) from public;
grant execute on function public.satis_kaydet(text, jsonb, text, text, text, text, numeric, numeric, text, text, text) to authenticated;


-- ============================================================================
-- 5) 📋 satis_listesi()
-- ============================================================================
create or replace function public.satis_listesi(p_limit integer default 100)
returns table (
  id uuid, satis_no text, musteri text, yetkili text, telefon text,
  tarih text, belge_tipi text, ara_toplam numeric, kdv_tutar numeric,
  genel_toplam numeric, odeme_tipi text, finans_kaydedildi boolean,
  kalem_sayisi bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.satis_no, s.musteri, s.yetkili, s.telefon,
         to_char(s.satis_tarihi, 'DD.MM.YYYY'), s.belge_tipi,
         s.ara_toplam, s.kdv_tutar, s.genel_toplam, s.odeme_tipi,
         s.finans_kaydedildi,
         (select count(*) from public.satis_kalemleri k where k.satis_id = s.id)
  from public.satislar s
  where s.durum <> 'iptal'
  order by s.created_at desc
  limit p_limit;
$$;

revoke all on function public.satis_listesi(integer) from public;
grant execute on function public.satis_listesi(integer) to authenticated;


-- ============================================================================
-- 6) 🖨️ satis_getir(id) — kalemleriyle
-- ============================================================================
create or replace function public.satis_getir(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_satis jsonb;
  v_kalemler jsonb;
begin
  select to_jsonb(s) || jsonb_build_object(
    'tarih_tr', to_char(s.satis_tarihi, 'DD.MM.YYYY')
  ) into v_satis
  from public.satislar s where s.id = p_id;

  if v_satis is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Satış bulunamadı.');
  end if;

  select coalesce(jsonb_agg(to_jsonb(k) order by k.created_at), '[]'::jsonb)
  into v_kalemler
  from public.satis_kalemleri k where k.satis_id = p_id;

  return jsonb_build_object('ok', true, 'satis', v_satis, 'kalemler', v_kalemler);
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.satis_getir(uuid) from public;
grant execute on function public.satis_getir(uuid) to authenticated;


-- ============================================================================
-- 7) 💰 satisi_finansa_kaydet(id) — completed_services'e ekle
-- ============================================================================
create or replace function public.satisi_finansa_kaydet(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s record;
  v_kalemler text;
  v_yeni_id uuid;
begin
  select * into v_s from public.satislar where id = p_id;
  if v_s.id is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Satış bulunamadı.');
  end if;
  if v_s.finans_kaydedildi then
    return jsonb_build_object('ok', false, 'mesaj', 'Bu satış zaten finansa kaydedilmiş.');
  end if;

  select coalesce(string_agg(
    k.adet::text || ' ' || coalesce(k.birim,'Adet') || ' ' ||
    k.parca_adi || ' @ ' || to_char(k.birim_fiyat, 'FM999G999D00') || ' TL',
    E'\n' order by k.created_at), 'Malzeme')
  into v_kalemler
  from public.satis_kalemleri k where k.satis_id = p_id;

  insert into public.completed_services (
    customer_text, service_date, description, price, currency,
    technician, service_type, materials_text, makine_tipi, form_number
  ) values (
    v_s.musteri,
    v_s.satis_tarihi,
    coalesce('MALZEME SATIŞI - ' || v_s.satis_no, 'Malzeme satışı'),
    v_s.genel_toplam,
    'TRY',
    upper(coalesce(v_s.olusturan, 'BUVISAN')),
    case when v_s.belge_tipi = 'irsaliye' then 'İrsaliye' else 'Malzeme Satışı' end,
    v_kalemler,
    'Malzeme',
    v_s.satis_no
  ) returning id into v_yeni_id;

  update public.satislar
     set finans_kaydedildi = true, finans_kayit_id = v_yeni_id
   where id = p_id;

  return jsonb_build_object('ok', true, 'finans_id', v_yeni_id,
    'mesaj', '✅ Finansa kaydedildi (' || to_char(v_s.genel_toplam, 'FM999G999D00') || ' TL)');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.satisi_finansa_kaydet(uuid) from public;
grant execute on function public.satisi_finansa_kaydet(uuid) to authenticated;


-- ============================================================================
-- 8) 🗑️ satis_sil(id)
-- ============================================================================
create or replace function public.satis_sil(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.satislar set durum = 'iptal' where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'mesaj', 'Satış bulunamadı.');
  end if;
  return jsonb_build_object('ok', true, 'mesaj', 'Satış iptal edildi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.satis_sil(uuid) from public;
grant execute on function public.satis_sil(uuid) to authenticated;


-- ============================================================================
-- 9) 🧪 TEST
-- ============================================================================
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name in ('satislar','satis_kalemleri')) as tablo_ok,
  (select count(*) from information_schema.routines
    where routine_schema='public' and routine_name in
      ('satis_no_uret','satis_kaydet','satis_listesi','satis_getir',
       'satisi_finansa_kaydet','satis_sil')) as fonksiyon_ok;

select public.satis_no_uret() as ornek_satis_no;
