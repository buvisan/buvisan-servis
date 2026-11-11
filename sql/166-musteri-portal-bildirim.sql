-- ============================================================================
--  📱 MÜŞTERİ PORTALI + PUSH BİLDİRİM ALTYAPISI (Güncelleme #138)
-- ----------------------------------------------------------------------------
--  MÜŞTERİ GİRİŞİ: Telefon + 6 haneli SMS kodu
--  PUSH: Cihaz abonelikleri + bildirim kuyruğu
--
--  KULLANIM: 165'ten SONRA çalıştır. Veri silmez.
-- ============================================================================


-- ============================================================================
-- 1) 👤 musteri_oturumlar — SMS giriş kodları + oturumlar
-- ============================================================================
create table if not exists public.musteri_oturumlar (
  id            uuid primary key default gen_random_uuid(),
  telefon       text not null,
  kod           text,
  kod_son       timestamptz,
  token         text,
  token_son     timestamptz,
  dogrulandi    boolean default false,
  created_at    timestamptz default now()
);

alter table public.musteri_oturumlar enable row level security;
drop policy if exists "musteri_oturum_all" on public.musteri_oturumlar;
create policy "musteri_oturum_all" on public.musteri_oturumlar for all to authenticated using (true) with check (true);

create index if not exists idx_musteri_oturum_tel on public.musteri_oturumlar(telefon);
create index if not exists idx_musteri_oturum_token on public.musteri_oturumlar(token);


-- ============================================================================
-- 2) 🔔 push_abonelikler — cihaz abonelikleri
-- ============================================================================
create table if not exists public.push_abonelikler (
  id            uuid primary key default gen_random_uuid(),
  kullanici     text,
  rol           text default 'personel',    -- personel | admin | musteri
  endpoint      text not null,
  p256dh        text,
  auth          text,
  cihaz         text,
  aktif         boolean default true,
  created_at    timestamptz default now(),
  unique(endpoint)
);

alter table public.push_abonelikler enable row level security;
drop policy if exists "push_abonelik_all" on public.push_abonelikler;
create policy "push_abonelik_all" on public.push_abonelikler for all to authenticated using (true) with check (true);

create index if not exists idx_push_rol on public.push_abonelikler(rol, aktif);


-- ============================================================================
-- 3) 📨 sms_kuyrugu — SMS gönderim kuyruğu (sağlayıcı bağlanınca gider)
-- ============================================================================
create table if not exists public.sms_kuyrugu (
  id            uuid primary key default gen_random_uuid(),
  telefon       text not null,
  mesaj         text not null,
  durum         text default 'bekliyor',    -- bekliyor | gonderildi | hata
  hata_mesaji   text,
  created_at    timestamptz default now(),
  gonderim      timestamptz
);

alter table public.sms_kuyrugu enable row level security;
drop policy if exists "sms_kuyruk_all" on public.sms_kuyrugu;
create policy "sms_kuyruk_all" on public.sms_kuyrugu for all to authenticated using (true) with check (true);


-- ============================================================================
-- 4) 🔔 bildirim_kuyrugu — push bildirim kuyruğu
-- ============================================================================
create table if not exists public.bildirim_kuyrugu (
  id            uuid primary key default gen_random_uuid(),
  hedef_rol     text,                        -- personel | admin | musteri | hepsi
  hedef_kisi    text,                        -- belirli kişi (opsiyonel)
  baslik        text not null,
  mesaj         text not null,
  url           text default '/',
  ikon          text,
  oncelik       text default 'normal',       -- normal | yuksek | kritik
  durum         text default 'bekliyor',     -- bekliyor | gonderildi | okundu
  created_at    timestamptz default now(),
  gonderim      timestamptz
);

alter table public.bildirim_kuyrugu enable row level security;
drop policy if exists "bildirim_kuyruk_all" on public.bildirim_kuyrugu;
create policy "bildirim_kuyruk_all" on public.bildirim_kuyrugu for all to authenticated using (true) with check (true);

create index if not exists idx_bildirim_durum on public.bildirim_kuyrugu(durum, created_at);


-- ============================================================================
-- 5) 🔐 musteri_giris_kodu_olustur(telefon)
-- ============================================================================
create or replace function public.musteri_giris_kodu_olustur(p_telefon text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := public.temiz_telefon(p_telefon);
  v_kod text;
  v_musteri_var boolean := false;
begin
  if length(v_tel) < 10 then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçerli bir telefon numarası girin.');
  end if;

  -- Müşteri kayıtlı mı?
  begin
    select exists(
      select 1 from public.cranes c
      where public.temiz_telefon(coalesce(public.jalan(to_jsonb(c),'telefon','phone','musteri_telefon'),'')) like '%' || right(v_tel, 9) || '%'
    ) into v_musteri_var;
  exception when others then v_musteri_var := false; end;

  if not v_musteri_var then
    begin
      select exists(
        select 1 from public.service_tickets st
        where public.temiz_telefon(coalesce(public.jalan(to_jsonb(st),'manual_phone','telefon','phone'),'')) like '%' || right(v_tel, 9) || '%'
      ) into v_musteri_var;
    exception when others then null; end;
  end if;

  -- 6 haneli kod
  v_kod := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');

  insert into public.musteri_oturumlar (telefon, kod, kod_son)
  values (v_tel, v_kod, now() + interval '10 minutes');

  -- SMS kuyruğuna ekle
  begin
    insert into public.sms_kuyrugu (telefon, mesaj)
    values (v_tel, 'BUVISAN giris kodunuz: ' || v_kod || ' (10 dakika gecerli)');
  exception when others then null; end;

  return jsonb_build_object(
    'ok', true,
    'musteri_var', v_musteri_var,
    'mesaj', 'Doğrulama kodu SMS olarak gönderildi.',
    -- SMS sağlayıcı yoksa admin görebilsin diye (sadece debug)
    'kod_debug', case when current_setting('app.debug_sms', true) = 'on' then v_kod else null end
  );
end $$;

revoke all on function public.musteri_giris_kodu_olustur(text) from public;
grant execute on function public.musteri_giris_kodu_olustur(text) to anon, authenticated;


-- ============================================================================
-- 6) 📞 temiz_telefon()
-- ============================================================================
create or replace function public.temiz_telefon(p_tel text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    regexp_replace(coalesce(p_tel,''), '[^0-9]', '', 'g'),
    '^(90|0)', '', '');
$$;


-- ============================================================================
-- 7) 🔐 musteri_giris_dogrula(telefon, kod)
-- ============================================================================
create or replace function public.musteri_giris_dogrula(p_telefon text, p_kod text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := public.temiz_telefon(p_telefon);
  v_token text;
  v_kayit record;
begin
  select * into v_kayit
  from public.musteri_oturumlar
  where telefon = v_tel
    and kod = trim(p_kod)
    and kod_son > now()
    and dogrulandi = false
  order by created_at desc
  limit 1;

  if v_kayit.id is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Kod geçersiz veya süresi dolmuş.');
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');

  update public.musteri_oturumlar
     set dogrulandi = true,
         token = v_token,
         token_son = now() + interval '30 days'
   where id = v_kayit.id;

  return jsonb_build_object('ok', true, 'token', v_token, 'telefon', v_tel,
                            'mesaj', 'Giriş başarılı.');
end $$;

revoke all on function public.musteri_giris_dogrula(text, text) from public;
grant execute on function public.musteri_giris_dogrula(text, text) to anon, authenticated;


-- ============================================================================
-- 8) 📊 musteri_portal_verisi(token) — müşterinin tüm verisi
-- ============================================================================
create or replace function public.musteri_portal_verisi(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tel text;
  v_cranes jsonb := '[]'::jsonb;
  v_servisler jsonb := '[]'::jsonb;
  v_aktif jsonb := '[]'::jsonb;
  v_bakim jsonb := '[]'::jsonb;
begin
  -- Token doğrula
  select telefon into v_tel
  from public.musteri_oturumlar
  where token = p_token
    and token_son > now()
    and dogrulandi = true
  limit 1;

  if v_tel is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Oturum süresi dolmuş. Tekrar giriş yapın.');
  end if;

  -- VİNÇLERİ
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'musteri', coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),'—'),
      'model', coalesce(public.jalan(to_jsonb(c),'model','makine_modeli'),'—'),
      'seri_no', coalesce(public.jalan(to_jsonb(c),'serial_number','seri_no'),'—'),
      'kapasite', coalesce(public.jalan(to_jsonb(c),'crane_capacity','kapasite'),'—'),
      'makine_tipi', coalesce(public.jalan(to_jsonb(c),'makine_tipi','type'),'—'),
      'adres', coalesce(public.jalan(to_jsonb(c),'address','adres'),'—'),
      'son_bakim', public.jalan(to_jsonb(c),'last_maintenance_date'),
      'sonraki_bakim', public.jalan(to_jsonb(c),'next_maintenance_date')
    ) order by 1), '[]'::jsonb)
    into v_cranes
    from public.cranes c
    where public.temiz_telefon(coalesce(public.jalan(to_jsonb(c),'telefon','phone','musteri_telefon'),'')) like '%' || v_tel || '%';
  exception when others then v_cranes := '[]'::jsonb; end;

  -- SERVİS GEÇMİŞİ
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'tarih', to_char(cs.service_date,'DD.MM.YYYY'),
      'aciklama', coalesce(left(cs.description, 200), '—'),
      'tur', coalesce(cs.service_type,'Servis'),
      'personel', coalesce(cs.technician,'—'),
      'tutar', coalesce(cs.price, 0)
    ) order by cs.service_date desc), '[]'::jsonb)
    into v_servisler
    from public.completed_services cs
    where public.temiz_telefon(coalesce(cs.customer_text,'')) like '%' || v_tel || '%'
       or exists (
         select 1 from public.cranes c
         where c.id = cs.crane_id
           and public.temiz_telefon(coalesce(public.jalan(to_jsonb(c),'telefon','phone','musteri_telefon'),'')) like '%' || v_tel || '%'
       )
    limit 30;
  exception when others then v_servisler := '[]'::jsonb; end;

  -- AKTİF İŞLER (arızalar)
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', st.id,
      'firma', coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name','musteri_adi'),'—'),
      'aciklama', coalesce(left(public.jalan(to_jsonb(st),'description','aciklama'), 200), '—'),
      'durum', coalesce(to_jsonb(st)->>'pipeline_status','bekliyor'),
      'tarih', to_char(st.created_at,'DD.MM.YYYY HH24:MI')
    ) order by st.created_at desc), '[]'::jsonb)
    into v_aktif
    from public.service_tickets st
    where public.temiz_telefon(coalesce(public.jalan(to_jsonb(st),'manual_phone','telefon','phone'),'')) like '%' || v_tel || '%'
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
    where public.temiz_telefon(coalesce(public.jalan(to_jsonb(c),'telefon','phone','musteri_telefon'),'')) like '%' || v_tel || '%'
      and nullif(trim(coalesce(public.jalan(to_jsonb(c),'next_maintenance_date'),'')),'') is not null;
  exception when others then v_bakim := '[]'::jsonb; end;

  return jsonb_build_object(
    'ok', true,
    'telefon', v_tel,
    'vincler', v_cranes,
    'servisler', v_servisler,
    'aktif_isler', v_aktif,
    'bakim_takvimi', v_bakim
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_portal_verisi(text) from public;
grant execute on function public.musteri_portal_verisi(text) to anon, authenticated;


-- ============================================================================
-- 9) 🔔 bildirim_gonder(...) — push kuyruğuna ekle
-- ============================================================================
create or replace function public.bildirim_gonder(
  p_baslik text,
  p_mesaj text,
  p_hedef_rol text default 'hepsi',
  p_hedef_kisi text default null,
  p_url text default '/',
  p_oncelik text default 'normal'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.bildirim_kuyrugu (hedef_rol, hedef_kisi, baslik, mesaj, url, oncelik)
  values (p_hedef_rol, p_hedef_kisi, p_baslik, p_mesaj, p_url, p_oncelik)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.bildirim_gonder(text, text, text, text, text, text) from public;
grant execute on function public.bildirim_gonder(text, text, text, text, text, text) to authenticated;


-- ============================================================================
-- 10) 🔔 TRIGGER'LAR — otomatik bildirimler
-- ============================================================================

-- A) YENİ TALEP → admin
create or replace function public.bildirim_yeni_talep()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.bildirim_gonder(
      '🔔 Yeni Servis Talebi',
      coalesce(public.jalan(to_jsonb(NEW),'firma_adi','manual_customer_name','musteri_adi'),'Müşteri') ||
        ' — ' || left(coalesce(public.jalan(to_jsonb(NEW),'description','aciklama'),''), 80),
      'admin', null, '/admin', 'yuksek'
    );
  exception when others then null; end;
  return NEW;
end $$;

drop trigger if exists trg_bildirim_talep on public.service_tickets;
create trigger trg_bildirim_talep after insert on public.service_tickets
  for each row execute function public.bildirim_yeni_talep();


-- B) FORM DOLDURULDU → admin
create or replace function public.bildirim_yeni_form()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.bildirim_gonder(
      '📄 Yeni Servis Raporu',
      coalesce(public.jalan(to_jsonb(NEW),'firma_adi','musteri_adi'),'Müşteri') ||
        ' — ' || coalesce(public.jalan(to_jsonb(NEW),'personel_adi'),'Personel'),
      'admin', null, '/admin/raporlar', 'normal'
    );
  exception when others then null; end;
  return NEW;
end $$;

drop trigger if exists trg_bildirim_form on public.service_reports;
create trigger trg_bildirim_form after insert on public.service_reports
  for each row execute function public.bildirim_yeni_form();


-- C) BAKIM FORMU → admin
create or replace function public.bildirim_yeni_bakim()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.bildirim_gonder(
      '🔧 Yeni Bakım Formu',
      coalesce(NEW.musteri,'Müşteri') || ' — ' || coalesce(NEW.form_tipi,''),
      'admin', null, '/admin/bakim-formlari', 'normal'
    );
  exception when others then null; end;
  return NEW;
end $$;

drop trigger if exists trg_bildirim_bakim on public.bakim_formlari;
create trigger trg_bildirim_bakim after insert on public.bakim_formlari
  for each row execute function public.bildirim_yeni_bakim();


-- D) TEKLİF TALEBİ → admin
create or replace function public.bildirim_teklif()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.bildirim_gonder(
      '💰 Yeni Teklif Talebi',
      coalesce(public.jalan(to_jsonb(NEW),'musteri','firma_adi','musteri_adi'),'Müşteri'),
      'admin', null, '/admin/teklif-bekleyenler', 'yuksek'
    );
  exception when others then null; end;
  return NEW;
end $$;

do $$
begin
  begin
    drop trigger if exists trg_bildirim_teklif on public.teklif_bekleyenler;
    create trigger trg_bildirim_teklif after insert on public.teklif_bekleyenler
      for each row execute function public.bildirim_teklif();
    raise notice '✅ trg_bildirim_teklif';
  exception when others then raise notice '⚠️ trg_bildirim_teklif: %', sqlerrm; end;
end $$;


-- E) PERSONEL TALEBİ → admin
create or replace function public.bildirim_personel_talep()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.bildirim_gonder(
      '📋 Personel Talebi',
      coalesce(NEW.personel,'Personel') || ' — ' || coalesce(NEW.talep_tipi,'') || ': ' || coalesce(left(NEW.baslik,60),''),
      'admin', null, '/admin/talepler', 'normal'
    );
  exception when others then null; end;
  return NEW;
end $$;

drop trigger if exists trg_bildirim_personel_talep on public.personel_talepler;
create trigger trg_bildirim_personel_talep after insert on public.personel_talepler
  for each row execute function public.bildirim_personel_talep();


-- F) İŞ ATANDI → personele
create or replace function public.bildirim_is_atandi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if NEW.atanan_personel is not null and coalesce(NEW.atanan_personel,'') <> '' then
      perform public.bildirim_gonder(
        '📌 Yeni İş Atandı',
        coalesce(NEW.musteri_adi,'Müşteri') || ' — ' || coalesce(NEW.adres,''),
        'personel', NEW.atanan_personel, '/personel', 'yuksek'
      );
    end if;
  exception when others then null; end;
  return NEW;
end $$;

drop trigger if exists trg_bildirim_is_atandi on public.randevular;
create trigger trg_bildirim_is_atandi after insert on public.randevular
  for each row execute function public.bildirim_is_atandi();


-- ============================================================================
-- 11) 🧪 TEST
-- ============================================================================
select public.bildirim_gonder('Test', 'Sistem çalışıyor', 'admin', null, '/admin', 'normal') as test_bildirim;

select count(*) as bildirim_sayisi from public.bildirim_kuyrugu;
select count(*) as sms_kuyrugu from public.sms_kuyrugu;

select public.temiz_telefon('0532 123 45 67') as temiz_tel;
