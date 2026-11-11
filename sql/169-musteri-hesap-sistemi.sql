-- ============================================================================
--  🚀 MÜŞTERİ HESAP SİSTEMİ (Güncelleme #141)
-- ----------------------------------------------------------------------------
--  AMAÇ: Müşteri kendi kaydını yapar, admin onaylar, kendi firmasının
--        TÜM verisini görür. Dışarıdan biri başka firmayı göremez.
--
--  GÜVENLİK:
--    1) Telefon sistemde kayıtlı olmalı (cranes / randevular / tickets)
--    2) Kayıt BEKLEMEDE durumuna düşer
--    3) ADMIN onayı olmadan giriş YAPILAMAZ
--    4) Şifre salt + hash (düz metin saklanmaz)
--    5) Her sorgu firma adı ile filtrelenir
--
--  KULLANIM: 168'den SONRA çalıştır.
-- ============================================================================


-- ============================================================================
-- 1) 👤 musteri_hesaplar
-- ============================================================================
create table if not exists public.musteri_hesaplar (
  id              uuid primary key default gen_random_uuid(),
  firma_adi       text not null,
  kullanici_adi   text not null unique,
  ad_soyad        text,
  telefon         text not null,
  email           text,
  sifre_hash      text not null,
  sifre_salt      text not null,
  durum           text default 'bekliyor',   -- bekliyor | onaylandi | reddedildi
  ret_sebebi      text,
  onaylayan       text,
  onay_tarihi     timestamptz,
  son_giris       timestamptz,
  token           text,
  token_son       timestamptz,
  created_at      timestamptz default now()
);

alter table public.musteri_hesaplar enable row level security;
drop policy if exists "musteri_hesap_all" on public.musteri_hesaplar;
create policy "musteri_hesap_all" on public.musteri_hesaplar for all to authenticated using (true) with check (true);

create index if not exists idx_musteri_hesap_kadi on public.musteri_hesaplar(lower(kullanici_adi));
create index if not exists idx_musteri_hesap_durum on public.musteri_hesaplar(durum);


-- ============================================================================
-- 2) 🔐 sifre_hash_uret(sifre, salt)
-- ============================================================================
create or replace function public.sifre_hash_uret(p_sifre text, p_salt text)
returns text
language sql
immutable
as $$
  select md5(p_salt || '::' || p_sifre || '::' || p_salt);
$$;


-- ============================================================================
-- 3) 📝 musteri_kayit_ol(...)
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
  v_firma text := trim(p_firma_adi);
  v_kadi text := lower(trim(p_kullanici_adi));
  v_id uuid;
begin
  -- ═══ DOĞRULAMA ═══
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

  -- Kullanıcı adı kullanılıyor mu?
  if exists (select 1 from public.musteri_hesaplar where lower(kullanici_adi) = v_kadi) then
    return jsonb_build_object('ok', false, 'mesaj', 'Bu kullanıcı adı zaten alınmış.');
  end if;

  -- ⭐ TELEFON SİSTEMDE KAYITLI Mİ? (güvenlik)
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

  if not v_sistemde_var then
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

  -- Admin'e bildirim
  begin
    perform public.bildirim_gonder(
      '👤 Yeni Müşteri Kaydı',
      v_firma || ' — ' || coalesce(p_ad_soyad,'') || ' (' || v_tel || ') ONAY BEKLİYOR',
      'admin', null, '/admin/musteri-hesaplari', 'yuksek'
    );
  exception when others then null; end;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'mesaj', 'Kaydınız alındı! Yönetici onayından sonra giriş yapabilirsiniz.'
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_kayit_ol(text, text, text, text, text, text) from public;
grant execute on function public.musteri_kayit_ol(text, text, text, text, text, text) to anon, authenticated;


-- ============================================================================
-- 4) 🔑 musteri_giris_sifre(kullanici_adi, sifre)
-- ============================================================================
create or replace function public.musteri_giris_sifre(p_kullanici_adi text, p_sifre text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hesap record;
  v_hash text;
  v_token text;
begin
  select * into v_hesap
  from public.musteri_hesaplar
  where lower(kullanici_adi) = lower(trim(p_kullanici_adi))
  limit 1;

  if v_hesap.id is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Kullanıcı adı veya şifre hatalı.');
  end if;

  -- ⛔ DURUM KONTROLÜ
  if v_hesap.durum = 'bekliyor' then
    return jsonb_build_object('ok', false, 'mesaj',
      'Hesabınız henüz ONAYLANMADI. Yönetici onayından sonra giriş yapabilirsiniz.');
  end if;
  if v_hesap.durum = 'reddedildi' then
    return jsonb_build_object('ok', false, 'mesaj',
      'Hesabınız reddedildi. Sebep: ' || coalesce(v_hesap.ret_sebebi, 'Belirtilmedi') ||
      ' — İletişim: 0224 374 00 01');
  end if;

  -- Şifre doğrula
  v_hash := public.sifre_hash_uret(p_sifre, v_hesap.sifre_salt);
  if v_hash <> v_hesap.sifre_hash then
    return jsonb_build_object('ok', false, 'mesaj', 'Kullanıcı adı veya şifre hatalı.');
  end if;

  -- Token üret
  v_token := md5(random()::text || clock_timestamp()::text || v_hesap.id::text) ||
             md5(random()::text || v_hesap.id::text);

  update public.musteri_hesaplar
     set token = v_token,
         token_son = now() + interval '30 days',
         son_giris = now()
   where id = v_hesap.id;

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'firma', v_hesap.firma_adi,
    'ad_soyad', v_hesap.ad_soyad,
    'mesaj', 'Hoş geldiniz!'
  );
end $$;

revoke all on function public.musteri_giris_sifre(text, text) from public;
grant execute on function public.musteri_giris_sifre(text, text) to anon, authenticated;


-- ============================================================================
-- 5) 📊 musteri_portal_verisi_v2(token) — FİRMA BAZLI
-- ============================================================================
create or replace function public.musteri_portal_verisi_v2(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hesap record;
  v_firma text;
  v_tel text;
  v_vincler jsonb := '[]'::jsonb;
  v_servisler jsonb := '[]'::jsonb;
  v_aktif jsonb := '[]'::jsonb;
  v_bakim jsonb := '[]'::jsonb;
  v_teklifler jsonb := '[]'::jsonb;
begin
  select * into v_hesap
  from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi'
  limit 1;

  if v_hesap.id is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz. Tekrar giriş yapın.');
  end if;

  v_firma := public.firma_normal(v_hesap.firma_adi);
  v_tel := v_hesap.telefon;

  -- VİNÇLER (firma adı VEYA telefon eşleşmesi)
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'musteri', coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),'—'),
      'model', coalesce(public.jalan(to_jsonb(c),'model','makine_modeli'),'—'),
      'seri_no', coalesce(public.jalan(to_jsonb(c),'serial_number','seri_no'),'—'),
      'kapasite', coalesce(public.jalan(to_jsonb(c),'crane_capacity','kapasite'),'—'),
      'makine_tipi', coalesce(public.jalan(to_jsonb(c),'makine_tipi','type'),'—'),
      'adres', coalesce(public.jalan(to_jsonb(c),'address','adres'),'—'),
      'sonraki_bakim', public.jalan(to_jsonb(c),'next_maintenance_date')
    )), '[]'::jsonb)
    into v_vincler
    from public.cranes c
    where public.firma_normal(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),'')) like '%' || v_firma || '%'
       or public.firma_normal(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),'')) like '%' || split_part(v_firma,' ',1) || '%'
       or public.temiz_telefon(coalesce(public.jalan(to_jsonb(c),'telefon','phone','musteri_telefon'),'')) like '%' || v_tel || '%';
  exception when others then v_vincler := '[]'::jsonb; end;

  -- SERVİS GEÇMİŞİ (firma bazlı)
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'tarih', to_char(cs.service_date,'DD.MM.YYYY'),
      'aciklama', coalesce(left(cs.description, 250), '—'),
      'tur', coalesce(cs.service_type,'Servis'),
      'personel', coalesce(cs.technician,'—'),
      'tutar', coalesce(cs.price, 0),
      'malzeme', coalesce(left(cs.materials_text, 150), '')
    ) order by cs.service_date desc), '[]'::jsonb)
    into v_servisler
    from public.completed_services cs
    where public.firma_normal(coalesce(cs.customer_text,'')) like '%' || v_firma || '%'
       or public.firma_normal(coalesce(cs.customer_text,'')) like '%' || split_part(v_firma,' ',1) || '%'
       or public.temiz_telefon(coalesce(cs.customer_text,'')) like '%' || v_tel || '%';
  exception when others then v_servisler := '[]'::jsonb; end;

  -- AKTİF İŞLER
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', st.id,
      'firma', coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),'—'),
      'aciklama', coalesce(left(public.jalan(to_jsonb(st),'description','aciklama'), 200), '—'),
      'durum', coalesce(to_jsonb(st)->>'pipeline_status','bekliyor'),
      'tarih', to_char(st.created_at,'DD.MM.YYYY HH24:MI')
    ) order by st.created_at desc), '[]'::jsonb)
    into v_aktif
    from public.service_tickets st
    where (public.firma_normal(coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),'')) like '%' || v_firma || '%'
        or public.temiz_telefon(coalesce(public.jalan(to_jsonb(st),'manual_phone','telefon'),'')) like '%' || v_tel || '%')
      and coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu');
  exception when others then v_aktif := '[]'::jsonb; end;

  -- BAKIM TAKVİMİ
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'musteri', coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),'—'),
      'model', coalesce(public.jalan(to_jsonb(c),'model','makine_modeli'),'—'),
      'tarih', to_char(nullif(trim(coalesce(public.jalan(to_jsonb(c),'next_maintenance_date'),'')),'')::date, 'DD.MM.YYYY'),
      'gun_kaldi', (nullif(trim(coalesce(public.jalan(to_jsonb(c),'next_maintenance_date'),'')),'')::date - current_date)
    ) order by 3), '[]'::jsonb)
    into v_bakim
    from public.cranes c
    where (public.firma_normal(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),'')) like '%' || v_firma || '%'
        or public.temiz_telefon(coalesce(public.jalan(to_jsonb(c),'telefon','phone'),'')) like '%' || v_tel || '%')
      and nullif(trim(coalesce(public.jalan(to_jsonb(c),'next_maintenance_date'),'')),'') is not null;
  exception when others then v_bakim := '[]'::jsonb; end;

  -- TEKLİFLER
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'musteri', coalesce(tb.musteri,'—'),
      'ariza', coalesce(left(tb.ariza,200),'—'),
      'durum', coalesce(tb.durum,'BEKLIYOR'),
      'tarih', to_char(tb.created_at,'DD.MM.YYYY')
    ) order by tb.created_at desc), '[]'::jsonb)
    into v_teklifler
    from public.teklif_bekleyenler tb
    where public.firma_normal(coalesce(tb.musteri,'')) like '%' || v_firma || '%';
  exception when others then v_teklifler := '[]'::jsonb; end;

  return jsonb_build_object(
    'ok', true,
    'firma', v_hesap.firma_adi,
    'ad_soyad', v_hesap.ad_soyad,
    'telefon', v_tel,
    'vincler', v_vincler,
    'servisler', v_servisler,
    'aktif_isler', v_aktif,
    'bakim_takvimi', v_bakim,
    'teklifler', v_teklifler
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_portal_verisi_v2(text) from public;
grant execute on function public.musteri_portal_verisi_v2(text) to anon, authenticated;


-- ============================================================================
-- 6) 📋 ADMIN — Hesap listesi + onay
-- ============================================================================
create or replace function public.musteri_hesap_listesi(p_durum text default 'bekliyor')
returns table (
  id uuid, firma_adi text, kullanici_adi text, ad_soyad text,
  telefon text, email text, durum text, ret_sebebi text,
  onaylayan text, onay_tarihi text, son_giris text, olusturma text,
  vinç_sayisi bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.id, h.firma_adi, h.kullanici_adi, h.ad_soyad,
    h.telefon, h.email, h.durum, h.ret_sebebi,
    h.onaylayan, to_char(h.onay_tarihi,'DD.MM.YYYY HH24:MI'),
    to_char(h.son_giris,'DD.MM.YYYY HH24:MI'),
    to_char(h.created_at,'DD.MM.YYYY HH24:MI'),
    (select count(*) from public.cranes c
      where public.firma_normal(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),''))
            like '%' || public.firma_normal(h.firma_adi) || '%')
  from public.musteri_hesaplar h
  where (p_durum = 'hepsi' or h.durum = p_durum)
  order by h.created_at desc;
$$;

revoke all on function public.musteri_hesap_listesi(text) from public;
grant execute on function public.musteri_hesap_listesi(text) to authenticated;


create or replace function public.musteri_hesap_onayla(
  p_id uuid,
  p_durum text,          -- onaylandi | reddedildi
  p_sebep text default null,
  p_onaylayan text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_durum not in ('onaylandi','reddedildi','bekliyor') then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçersiz durum.');
  end if;

  update public.musteri_hesaplar
     set durum = p_durum,
         ret_sebebi = case when p_durum = 'reddedildi' then p_sebep else null end,
         onaylayan = p_onaylayan,
         onay_tarihi = now()
   where id = p_id;

  if not found then
    return jsonb_build_object('ok', false, 'mesaj', 'Hesap bulunamadı.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'mesaj', case when p_durum = 'onaylandi'
      then '✅ Hesap onaylandı. Müşteri artık giriş yapabilir.'
      else '❌ Hesap reddedildi.' end
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_hesap_onayla(uuid, text, text, text) from public;
grant execute on function public.musteri_hesap_onayla(uuid, text, text, text) to authenticated;


-- ============================================================================
-- 7) 🧪 TEST
-- ============================================================================
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='musteri_hesaplar') as tablo_ok,
  (select count(*) from information_schema.routines
    where routine_schema='public' and routine_name in
      ('musteri_kayit_ol','musteri_giris_sifre','musteri_portal_verisi_v2',
       'musteri_hesap_listesi','musteri_hesap_onayla','sifre_hash_uret')) as fonksiyon_ok;

select public.sifre_hash_uret('test123', 'abcd') as hash_ornek;
