-- ============================================================================
--  📞 TELEFON İZNİ SİSTEMİ (Güncelleme #142)
-- ----------------------------------------------------------------------------
--  SORUN: Müşteri hiç servis çağırmamışsa telefonu sistemde yok
--         → kayıt olamıyor
--
--  ÇÖZÜM: Admin panelden telefon tanımlanır → müşteri kayıt olabilir
--
--  KULLANIM: 169'dan SONRA çalıştır.
-- ============================================================================


-- ============================================================================
-- 1) 📞 musteri_telefon_izinleri
-- ============================================================================
create table if not exists public.musteri_telefon_izinleri (
  id            uuid primary key default gen_random_uuid(),
  telefon       text not null,
  firma_adi     text,
  yetkili       text,
  notlar        text,
  ekleyen       text,
  kullanildi    boolean default false,
  created_at    timestamptz default now()
);

alter table public.musteri_telefon_izinleri enable row level security;
drop policy if exists "musteri_tel_izin_all" on public.musteri_telefon_izinleri;
create policy "musteri_tel_izin_all" on public.musteri_telefon_izinleri for all to authenticated using (true) with check (true);

create index if not exists idx_musteri_tel_izin on public.musteri_telefon_izinleri(telefon);


-- ============================================================================
-- 2) 🔧 musteri_kayit_ol — TELEFON İZNİ KONTROLÜ EKLENDİ
-- ============================================================================
create or replace function public.musteri_kayit_ol(
  p_firma_adi text,
  p_kullanici_adi text,
  p_ad_soyad text,
  p_telefon text,
  p_sifre text,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := public.temiz_telefon(p_telefon);
  v_salt text;
  v_hash text;
  v_sistemde_var boolean := false;
  v_izin_var boolean := false;
  v_firma text := trim(p_firma_adi);
  v_kadi text := lower(trim(p_kullanici_adi));
  v_id uuid;
begin
  if length(v_firma) < 2 then
    return jsonb_build_object('ok', false, 'mesaj', 'Firma adı zorunludur.');
  end if;
  if length(v_kadi) < 4 then
    return jsonb_build_object('ok', false, 'mesaj', 'Kullanıcı adı en az 4 karakter olmalı.');
  end if;
  if length(v_tel) < 10 then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçerli bir telefon numarası girin.');
  end if;
  if length(coalesce(p_sifre,'')) < 6 then
    return jsonb_build_object('ok', false, 'mesaj', 'Şifre en az 6 karakter olmalı.');
  end if;

  if exists (select 1 from public.musteri_hesaplar where lower(kullanici_adi) = v_kadi) then
    return jsonb_build_object('ok', false, 'mesaj', 'Bu kullanıcı adı zaten alınmış.');
  end if;

  -- ⭐ 1) ADMIN İZNİ VAR MI?
  begin
    select exists(
      select 1 from public.musteri_telefon_izinleri
      where public.temiz_telefon(telefon) = v_tel
    ) into v_izin_var;
  exception when others then v_izin_var := false; end;

  -- ⭐ 2) SİSTEMDE KAYITLI MI?
  if not v_izin_var then
    begin
      select exists(
        select 1 from public.cranes c
        where public.temiz_telefon(coalesce(public.jalan(to_jsonb(c),'telefon','phone','musteri_telefon'),'')) like '%' || v_tel || '%'
      ) into v_sistemde_var;
    exception when others then v_sistemde_var := false; end;

    if not v_sistemde_var then
      begin
        select exists(
          select 1 from public.randevular r
          where public.temiz_telefon(coalesce(public.jalan(to_jsonb(r),'telefon'),'')) like '%' || v_tel || '%'
        ) into v_sistemde_var;
      exception when others then null; end;
    end if;

    if not v_sistemde_var then
      begin
        select exists(
          select 1 from public.service_tickets st
          where public.temiz_telefon(coalesce(public.jalan(to_jsonb(st),'manual_phone','telefon','phone'),'')) like '%' || v_tel || '%'
        ) into v_sistemde_var;
      exception when others then null; end;
    end if;
  end if;

  if not v_izin_var and not v_sistemde_var then
    return jsonb_build_object('ok', false,
      'mesaj', 'Bu telefon numarası sistemimizde kayıtlı değil. Lütfen bizi arayın: 0224 374 00 01');
  end if;

  -- Şifre hash
  v_salt := md5(random()::text || clock_timestamp()::text || v_tel);
  v_hash := public.sifre_hash_uret(p_sifre, v_salt);

  insert into public.musteri_hesaplar (
    firma_adi, kullanici_adi, ad_soyad, telefon, email, sifre_hash, sifre_salt, durum
  ) values (
    v_firma, v_kadi, nullif(trim(coalesce(p_ad_soyad,'')),''), v_tel,
    nullif(trim(coalesce(p_email,'')),''), v_hash, v_salt, 'bekliyor'
  ) returning id into v_id;

  -- İzin kullanıldı işaretle
  begin
    update public.musteri_telefon_izinleri
       set kullanildi = true
     where public.temiz_telefon(telefon) = v_tel;
  exception when others then null; end;

  -- Admin'e bildirim
  begin
    perform public.bildirim_gonder(
      '👤 Yeni Müşteri Kaydı',
      v_firma || ' — ' || coalesce(p_ad_soyad,'') || ' (' || v_tel || ') ONAY BEKLİYOR',
      'admin', null, '/admin/musteri-hesaplari', 'yuksek'
    );
  exception when others then null; end;

  return jsonb_build_object(
    'ok', true, 'id', v_id,
    'mesaj', 'Kaydınız alındı! Yönetici onayından sonra giriş yapabilirsiniz.'
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_kayit_ol(text, text, text, text, text, text) from public;
grant execute on function public.musteri_kayit_ol(text, text, text, text, text, text) to anon, authenticated;


-- ============================================================================
-- 3) 📞 telefon_izni_ekle(telefon, firma, yetkili, notlar)
-- ============================================================================
create or replace function public.telefon_izni_ekle(
  p_telefon text,
  p_firma text default null,
  p_yetkili text default null,
  p_notlar text default null,
  p_ekleyen text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := public.temiz_telefon(p_telefon);
  v_id uuid;
begin
  if length(v_tel) < 10 then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçerli telefon girin.');
  end if;

  if exists (select 1 from public.musteri_telefon_izinleri where public.temiz_telefon(telefon) = v_tel) then
    return jsonb_build_object('ok', false, 'mesaj', 'Bu numara zaten tanımlı.');
  end if;

  insert into public.musteri_telefon_izinleri (telefon, firma_adi, yetkili, notlar, ekleyen)
  values (v_tel, nullif(trim(coalesce(p_firma,'')),''), nullif(trim(coalesce(p_yetkili,'')),''),
          nullif(trim(coalesce(p_notlar,'')),''), p_ekleyen)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id,
    'mesaj', '✅ Numara tanımlandı. Müşteri artık kayıt olabilir.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.telefon_izni_ekle(text, text, text, text, text) from public;
grant execute on function public.telefon_izni_ekle(text, text, text, text, text) to authenticated;


-- ============================================================================
-- 4) 📋 telefon_izin_listesi()
-- ============================================================================
create or replace function public.telefon_izin_listesi()
returns table (
  id uuid, telefon text, firma_adi text, yetkili text, notlar text,
  kullanildi boolean, ekleyen text, olusturma text
)
language sql
stable
security definer
set search_path = public
as $$
  select id, telefon, firma_adi, yetkili, notlar, kullanildi, ekleyen,
         to_char(created_at,'DD.MM.YYYY HH24:MI')
  from public.musteri_telefon_izinleri
  order by created_at desc;
$$;

revoke all on function public.telefon_izin_listesi() from public;
grant execute on function public.telefon_izin_listesi() to authenticated;


-- ============================================================================
-- 5) 🗑️ telefon_izni_sil(id)
-- ============================================================================
create or replace function public.telefon_izni_sil(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.musteri_telefon_izinleri where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'mesaj', 'Kayıt bulunamadı.');
  end if;
  return jsonb_build_object('ok', true, 'mesaj', 'Silindi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.telefon_izni_sil(uuid) from public;
grant execute on function public.telefon_izni_sil(uuid) to authenticated;


-- ============================================================================
-- 6) 🔍 telefon_izin_ara(telefon) — kayıt olabilir mi?
-- ============================================================================
create or replace function public.telefon_izin_ara(p_telefon text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tel text := public.temiz_telefon(p_telefon);
  v_izin boolean := false;
  v_sistem boolean := false;
begin
  begin
    select exists(select 1 from public.musteri_telefon_izinleri where public.temiz_telefon(telefon) = v_tel)
      into v_izin;
  exception when others then v_izin := false; end;

  begin
    select exists(
      select 1 from public.cranes c
      where public.temiz_telefon(coalesce(public.jalan(to_jsonb(c),'telefon','phone','musteri_telefon'),'')) like '%' || v_tel || '%'
    ) into v_sistem;
  exception when others then v_sistem := false; end;

  return jsonb_build_object(
    'telefon', v_tel,
    'izinli', v_izin,
    'sistemde', v_sistem,
    'kayit_olabilir', (v_izin or v_sistem)
  );
end $$;

revoke all on function public.telefon_izin_ara(text) from public;
grant execute on function public.telefon_izin_ara(text) to anon, authenticated;


-- ============================================================================
-- 7) 🧪 TEST
-- ============================================================================
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='musteri_telefon_izinleri') as tablo_ok,
  (select count(*) from information_schema.routines
    where routine_schema='public' and routine_name in
      ('telefon_izni_ekle','telefon_izin_listesi','telefon_izni_sil','telefon_izin_ara')) as fonksiyon_ok;

select public.telefon_izin_ara('05551112233') as test_arama;
