-- ============================================================================
--  🚀 MÜŞTERİ PORTALI v4 (Güncelleme #149)
-- ----------------------------------------------------------------------------
--  1) Akıllı firma eşleştirme (KPS ↔ KPS OTOMOTİV)
--  2) Teklif merkezi (müşteri görür + onaylar)
--  3) Canlı sohbet (müşteri ↔ admin)
--  4) Müşteri kendi vincini ekler
--
--  KULLANIM: 176'dan SONRA çalıştır. Veri silmez.
-- ============================================================================


-- ============================================================================
-- 1) 🎯 firma_eslestir(a, b) — akıllı firma eşleştirme
--    "KPS" ↔ "KPS OTOMOTİV" ↔ "KPS OTOMOTIV" → 100
-- ============================================================================
create or replace function public.firma_eslestir(p_a text, p_b text)
returns integer
language plpgsql
immutable
as $$
declare
  v_a text := public.firma_normal(coalesce(p_a,''));
  v_b text := public.firma_normal(coalesce(p_b,''));
  v_kisa text;
  v_uzun text;
  v_ilk_a text;
  v_ilk_b text;
begin
  if v_a = '' or v_b = '' then return 0; end if;
  if v_a = v_b then return 100; end if;

  -- Biri digerini iceriyor mu?
  if v_a like '%' || v_b || '%' or v_b like '%' || v_a || '%' then
    return 95;
  end if;

  -- Ilk kelime eslesmesi (en az 3 harf)
  v_ilk_a := split_part(v_a, ' ', 1);
  v_ilk_b := split_part(v_b, ' ', 1);
  if length(v_ilk_a) >= 3 and v_ilk_a = v_ilk_b then
    return 90;
  end if;

  -- Ilk 4 harf prefix (KPS OTOMOTIV vs KPS MOTOR)
  if length(v_ilk_a) >= 3 and length(v_ilk_b) >= 3
     and left(v_ilk_a, 4) = left(v_ilk_b, 4) then
    return 85;
  end if;

  -- Kisaltma: "KPS" 3 harfli → "KPS OTOMOTIV" icinde geciyor mu?
  if length(v_a) between 2 and 5 and v_b like v_a || '%' then return 88; end if;
  if length(v_b) between 2 and 5 and v_a like v_b || '%' then return 88; end if;

  -- Kelime kapsama orani
  declare
    v_ortak integer := 0;
    v_kelime text;
    v_toplam integer := 0;
  begin
    for v_kelime in select unnest(string_to_array(v_a, ' ')) loop
      if length(v_kelime) >= 3 then
        v_toplam := v_toplam + 1;
        if v_b like '%' || v_kelime || '%' then v_ortak := v_ortak + 1; end if;
      end if;
    end loop;

    if v_toplam > 0 and v_ortak > 0 then
      return greatest(60, (v_ortak * 100 / v_toplam));
    end if;
  end;

  return 0;
end $$;

revoke all on function public.firma_eslestir(text, text) from public;
grant execute on function public.firma_eslestir(text, text) to anon, authenticated;


-- ============================================================================
-- 2) 🏗️ musteri_vincler — müşterinin eklediği makineler
-- ============================================================================
create table if not exists public.musteri_vincler (
  id            uuid primary key default gen_random_uuid(),
  hesap_id      uuid references public.musteri_hesaplar(id) on delete cascade,
  crane_id      uuid,
  musteri       text,
  model         text not null,
  seri_no       text,
  kapasite      text,
  makine_tipi   text default 'vinç',
  konum         text,
  durum         text default 'bekliyor',   -- bekliyor | onaylandi | reddedildi
  admin_notu    text,
  created_at    timestamptz default now()
);

alter table public.musteri_vincler enable row level security;
drop policy if exists "musteri_vincler_all" on public.musteri_vincler;
create policy "musteri_vincler_all" on public.musteri_vincler for all to authenticated using (true) with check (true);


-- ============================================================================
-- 3) 💬 musteri_sohbet — canlı yazışma
-- ============================================================================
create table if not exists public.musteri_sohbet (
  id            uuid primary key default gen_random_uuid(),
  hesap_id      uuid references public.musteri_hesaplar(id) on delete cascade,
  gonderen      text not null,              -- musteri | admin
  mesaj         text not null,
  okundu        boolean default false,
  created_at    timestamptz default now()
);

alter table public.musteri_sohbet enable row level security;
drop policy if exists "musteri_sohbet_all" on public.musteri_sohbet;
create policy "musteri_sohbet_all" on public.musteri_sohbet for all to authenticated using (true) with check (true);

create index if not exists idx_sohbet_hesap on public.musteri_sohbet(hesap_id, created_at desc);


-- ============================================================================
-- 4) 💰 musteri_teklif_onay — teklif onay kayıtları
-- ============================================================================
create table if not exists public.musteri_teklif_onay (
  id            uuid primary key default gen_random_uuid(),
  hesap_id      uuid references public.musteri_hesaplar(id) on delete cascade,
  offer_id      uuid,
  satis_id      uuid,
  durum         text default 'bekliyor',    -- bekliyor | onaylandi | reddedildi
  not_          text,
  created_at    timestamptz default now()
);

alter table public.musteri_teklif_onay enable row level security;
drop policy if exists "musteri_teklif_onay_all" on public.musteri_teklif_onay;
create policy "musteri_teklif_onay_all" on public.musteri_teklif_onay for all to authenticated using (true) with check (true);


-- ============================================================================
-- 5) 🔐 oturum_hesap(token) — token'dan hesap
-- ============================================================================
create or replace function public.oturum_hesap(p_token text)
returns public.musteri_hesaplar
language sql
stable
security definer
set search_path = public
as $$
  select * from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi'
  limit 1;
$$;

revoke all on function public.oturum_hesap(text) from public;
grant execute on function public.oturum_hesap(text) to anon, authenticated;


-- ============================================================================
-- 6) 🏗️ musteri_vinc_ekle(token, model, seri_no, kapasite, tip, konum)
-- ============================================================================
create or replace function public.musteri_vinc_ekle(
  p_token text, p_model text, p_seri_no text default null,
  p_kapasite text default null, p_tip text default 'vinç', p_konum text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_h record;
  v_id uuid;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz.');
  end if;
  if coalesce(trim(p_model),'') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Makine modeli zorunludur.');
  end if;

  insert into public.musteri_vincler (hesap_id, musteri, model, seri_no, kapasite, makine_tipi, konum)
  values (v_h.id, v_h.firma_adi, trim(p_model), nullif(trim(coalesce(p_seri_no,'')),''),
          nullif(trim(coalesce(p_kapasite,'')),''), coalesce(p_tip,'vinç'),
          nullif(trim(coalesce(p_konum,'')),''))
  returning id into v_id;

  perform public.bildirim_gonder(
    '🏗️ Yeni Makine Kaydı',
    v_h.firma_adi || ' — ' || trim(p_model) || ' (ONAY BEKLİYOR)',
    'admin', null, '/admin/musteri-hesaplari', 'normal'
  );

  return jsonb_build_object('ok', true, 'id', v_id,
    'mesaj', 'Makineniz kaydedildi. Yönetici onayından sonra listede görünecek.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_vinc_ekle(text, text, text, text, text, text) from public;
grant execute on function public.musteri_vinc_ekle(text, text, text, text, text, text) to anon, authenticated;


-- ============================================================================
-- 7) 💬 musteri_mesaj_gonder(token, mesaj)
-- ============================================================================
create or replace function public.musteri_mesaj_gonder(p_token text, p_mesaj text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_h record;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz.'); end if;
  if coalesce(trim(p_mesaj),'') = '' then return jsonb_build_object('ok', false, 'mesaj', 'Mesaj boş.'); end if;

  insert into public.musteri_sohbet (hesap_id, gonderen, mesaj)
  values (v_h.id, 'musteri', left(trim(p_mesaj), 2000));

  perform public.bildirim_gonder(
    '💬 Müşteri Mesajı',
    v_h.firma_adi || ': ' || left(trim(p_mesaj), 90),
    'admin', null, '/admin/musteri-hesaplari', 'yuksek'
  );

  return jsonb_build_object('ok', true, 'mesaj', 'Mesajınız gönderildi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_mesaj_gonder(text, text) from public;
grant execute on function public.musteri_mesaj_gonder(text, text) to anon, authenticated;


-- ============================================================================
-- 8) 💬 musteri_sohbet_getir(token)
-- ============================================================================
create or replace function public.musteri_sohbet_getir(p_token text)
returns jsonb
language plpgsql
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
    'id', s.id, 'gonderen', s.gonderen, 'mesaj', s.mesaj,
    'tarih', to_char(s.created_at, 'DD.MM.YYYY HH24:MI')
  ) order by s.created_at), '[]'::jsonb)
  into v_sonuc
  from public.musteri_sohbet s
  where s.hesap_id = v_h.id;

  -- admin mesajlarini okundu isaretle
  begin
    update public.musteri_sohbet set okundu = true
    where hesap_id = v_h.id and gonderen = 'admin' and okundu = false;
  exception when others then null; end;

  return v_sonuc;
end $$;

revoke all on function public.musteri_sohbet_getir(text) from public;
grant execute on function public.musteri_sohbet_getir(text) to anon, authenticated;


-- ============================================================================
-- 9) 💰 musteri_teklifleri(token) — admin'in verdiği teklifler + onay durumu
-- ============================================================================
create or replace function public.musteri_teklifleri(p_token text)
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

  select coalesce(jsonb_agg(x) , '[]'::jsonb) into v_sonuc from (
    -- SATIŞLAR (malzeme satışı)
    select jsonb_build_object(
      'kaynak', 'satis', 'id', s.id,
      'no', s.satis_no, 'baslik', 'Malzeme Satışı',
      'aciklama', coalesce(s.notlar,''),
      'tutar', s.genel_toplam,
      'tarih', to_char(s.satis_tarihi,'DD.MM.YYYY'),
      'durum', coalesce((select o.durum from public.musteri_teklif_onay o
                         where o.hesap_id = v_h.id and o.satis_id = s.id limit 1), 'bekliyor')
    )
    from public.satislar s
    where s.durum <> 'iptal'
      and public.firma_eslestir(s.musteri, v_h.firma_adi) >= 85

    union all

    -- TEKLIF BEKLEYENLER
    select jsonb_build_object(
      'kaynak', 'teklif', 'id', tb.id,
      'no', coalesce(tb.is_emri_no,'—'), 'baslik', 'Fiyat Teklifi',
      'aciklama', coalesce(left(tb.ariza,300),''),
      'tutar', 0,
      'tarih', to_char(tb.created_at,'DD.MM.YYYY'),
      'durum', coalesce(tb.durum,'BEKLIYOR')
    )
    from public.teklif_bekleyenler tb
    where public.firma_eslestir(tb.musteri, v_h.firma_adi) >= 85
  ) x
  order by x->>'tarih' desc;

  return v_sonuc;
exception when others then
  return '[]'::jsonb;
end $$;

revoke all on function public.musteri_teklifleri(text) from public;
grant execute on function public.musteri_teklifleri(text) to anon, authenticated;


-- ============================================================================
-- 10) ✅ musteri_teklif_onayla(token, kaynak, id, onay)
-- ============================================================================
create or replace function public.musteri_teklif_onayla(
  p_token text, p_kaynak text, p_id uuid, p_onay boolean, p_not text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_h record;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz.'); end if;

  insert into public.musteri_teklif_onay (hesap_id, offer_id, satis_id, durum, not_)
  values (
    v_h.id,
    case when p_kaynak = 'teklif' then p_id else null end,
    case when p_kaynak = 'satis' then p_id else null end,
    case when p_onay then 'onaylandi' else 'reddedildi' end,
    nullif(trim(coalesce(p_not,'')),'')
  );

  perform public.bildirim_gonder(
    case when p_onay then '✅ Teklif ONAYLANDI' else '❌ Teklif REDDEDİLDİ' end,
    v_h.firma_adi || coalesce(' — ' || p_not, ''),
    'admin', null, '/admin/teklifler', 'yuksek'
  );

  return jsonb_build_object('ok', true,
    'mesaj', case when p_onay then 'Teklif onaylandı. En kısa sürede iletişime geçeceğiz.' else 'Teklif reddedildi.' end);
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_teklif_onayla(text, text, uuid, boolean, text) from public;
grant execute on function public.musteri_teklif_onayla(text, text, uuid, boolean, text) to anon, authenticated;


-- ============================================================================
-- 11) 📊 musteri_portal_v4(token) — TÜM VERİ (akıllı eşleştirme)
-- ============================================================================
create or replace function public.musteri_portal_v4(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_h record;
  v_vincler jsonb := '[]'::jsonb;
  v_kendi jsonb := '[]'::jsonb;
  v_servisler jsonb := '[]'::jsonb;
  v_aktif jsonb := '[]'::jsonb;
  v_bakim jsonb := '[]'::jsonb;
  v_okunmamis integer := 0;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz. Tekrar giriş yapın.');
  end if;

  -- VİNÇLER (akıllı firma eşleştirme + telefon)
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
    where public.firma_eslestir(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),''), v_h.firma_adi) >= 80
       or public.temiz_telefon(coalesce(public.jalan(to_jsonb(c),'telefon','phone','musteri_telefon'),'')) like '%' || v_h.telefon || '%';
  exception when others then v_vincler := '[]'::jsonb; end;

  -- MÜŞTERİNİN KENDİ EKLEDİĞİ MAKİNELER
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', mv.id, 'model', mv.model, 'seri_no', coalesce(mv.seri_no,'—'),
      'kapasite', coalesce(mv.kapasite,'—'), 'makine_tipi', mv.makine_tipi,
      'konum', coalesce(mv.konum,'—'), 'durum', mv.durum,
      'tarih', to_char(mv.created_at,'DD.MM.YYYY')
    )), '[]'::jsonb)
    into v_kendi
    from public.musteri_vincler mv where mv.hesap_id = v_h.id;
  exception when others then v_kendi := '[]'::jsonb; end;

  -- SERVİS GEÇMİŞİ (akıllı)
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'tarih', to_char(cs.service_date,'DD.MM.YYYY'),
      'aciklama', coalesce(left(cs.description, 300), '—'),
      'tur', coalesce(cs.service_type,'Servis'),
      'personel', coalesce(cs.technician,'—'),
      'tutar', coalesce(cs.price, 0),
      'malzeme', coalesce(left(cs.materials_text, 200), ''),
      'form_no', coalesce(cs.form_number,'')
    ) order by cs.service_date desc), '[]'::jsonb)
    into v_servisler
    from public.completed_services cs
    where public.firma_eslestir(coalesce(cs.customer_text,''), v_h.firma_adi) >= 80
       or public.temiz_telefon(coalesce(cs.customer_text,'')) like '%' || v_h.telefon || '%'
    limit 60;
  exception when others then v_servisler := '[]'::jsonb; end;

  -- AKTİF İŞLER
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', st.id,
      'firma', coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),'—'),
      'aciklama', coalesce(left(public.jalan(to_jsonb(st),'description','aciklama'), 250), '—'),
      'durum', coalesce(to_jsonb(st)->>'pipeline_status','bekliyor'),
      'tarih', to_char(st.created_at,'DD.MM.YYYY HH24:MI')
    ) order by st.created_at desc), '[]'::jsonb)
    into v_aktif
    from public.service_tickets st
    where (public.firma_eslestir(coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),''), v_h.firma_adi) >= 80
        or public.temiz_telefon(coalesce(public.jalan(to_jsonb(st),'manual_phone','telefon'),'')) like '%' || v_h.telefon || '%')
      and coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu');
  exception when others then v_aktif := '[]'::jsonb; end;

  -- BAKIM TAKVİMİ
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'model', coalesce(public.jalan(to_jsonb(c),'model','makine_modeli'),'—'),
      'tarih', to_char(nullif(trim(coalesce(public.jalan(to_jsonb(c),'next_maintenance_date'),'')),'')::date, 'DD.MM.YYYY'),
      'gun_kaldi', (nullif(trim(coalesce(public.jalan(to_jsonb(c),'next_maintenance_date'),'')),'')::date - current_date)
    ) order by 2), '[]'::jsonb)
    into v_bakim
    from public.cranes c
    where public.firma_eslestir(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),''), v_h.firma_adi) >= 80
      and nullif(trim(coalesce(public.jalan(to_jsonb(c),'next_maintenance_date'),'')),'') is not null;
  exception when others then v_bakim := '[]'::jsonb; end;

  -- OKUNMAMIŞ MESAJ
  begin
    select count(*) into v_okunmamis from public.musteri_sohbet
    where hesap_id = v_h.id and gonderen = 'admin' and okundu = false;
  exception when others then v_okunmamis := 0; end;

  return jsonb_build_object(
    'ok', true,
    'firma', v_h.firma_adi,
    'ad_soyad', v_h.ad_soyad,
    'telefon', v_h.telefon,
    'vincler', v_vincler,
    'kendi_makineler', v_kendi,
    'servisler', v_servisler,
    'aktif_isler', v_aktif,
    'bakim_takvimi', v_bakim,
    'okunmamis_mesaj', v_okunmamis
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_portal_v4(text) from public;
grant execute on function public.musteri_portal_v4(text) to anon, authenticated;


-- ============================================================================
-- 12) 🧪 TEST
-- ============================================================================
select
  public.firma_eslestir('KPS', 'KPS OTOMOTİV') as kps_test,
  public.firma_eslestir('kps otomotiv', 'KPS OTOMOTIV') as kucuk_harf,
  public.firma_eslestir('MATAY', 'KPS OTOMOTİV') as farkli;

select
  (select count(*) from information_schema.tables where table_schema='public'
    and table_name in ('musteri_vincler','musteri_sohbet','musteri_teklif_onay')) as tablo_ok,
  (select count(*) from information_schema.routines where routine_schema='public'
    and routine_name in ('firma_eslestir','musteri_vinc_ekle','musteri_mesaj_gonder',
      'musteri_sohbet_getir','musteri_teklifleri','musteri_teklif_onayla','musteri_portal_v4')) as fn_ok;
