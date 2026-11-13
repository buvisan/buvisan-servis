-- ============================================================================
--  🔧 MÜŞTERİ PORTALI v5 (Güncelleme #150)
-- ----------------------------------------------------------------------------
--  1) Kendi makinesi ANINDA görünür (onay beklemez) + sil/düzenle
--  2) Biletlerden (taleplerden) makine bilgisini de çek
--  3) Daha toleranslı firma eşleştirme
--
--  KULLANIM: 177'den SONRA çalıştır.
-- ============================================================================

-- ─── 1) Daha akıllı firma eşleştirme ───
create or replace function public.firma_eslestir(p_a text, p_b text)
returns integer
language plpgsql
immutable
as $$
declare
  v_a text := public.firma_normal(coalesce(p_a,''));
  v_b text := public.firma_normal(coalesce(p_b,''));
  v_ilk_a text;
  v_ilk_b text;
  v_ortak integer := 0;
  v_toplam integer := 0;
  v_kelime text;
begin
  if v_a = '' or v_b = '' then return 0; end if;
  if v_a = v_b then return 100; end if;

  v_ilk_a := split_part(v_a, ' ', 1);
  v_ilk_b := split_part(v_b, ' ', 1);

  -- Tam kapsama
  if v_a like '%' || v_b || '%' or v_b like '%' || v_a || '%' then return 96; end if;

  -- Ilk kelime ayni
  if length(v_ilk_a) >= 2 and v_ilk_a = v_ilk_b then return 92; end if;

  -- Ilk 3 harf prefix (KPS vs KPSM)
  if length(v_ilk_a) >= 3 and length(v_ilk_b) >= 3
     and left(v_ilk_a, 3) = left(v_ilk_b, 3) then return 88; end if;

  -- Kisa isim prefix (KPS -> KPS MOTOR)
  if length(v_a) between 2 and 6 and left(v_b, length(v_a)) = v_a then return 90; end if;
  if length(v_b) between 2 and 6 and left(v_a, length(v_b)) = v_b then return 90; end if;

  -- Kelime kapsama
  for v_kelime in select unnest(string_to_array(v_a, ' ')) loop
    if length(v_kelime) >= 3 then
      v_toplam := v_toplam + 1;
      if v_b like '%' || v_kelime || '%' then v_ortak := v_ortak + 1; end if;
    end if;
  end loop;

  if v_toplam > 0 and v_ortak > 0 then
    return greatest(55, (v_ortak * 100 / v_toplam));
  end if;

  -- Ters yon
  v_ortak := 0; v_toplam := 0;
  for v_kelime in select unnest(string_to_array(v_b, ' ')) loop
    if length(v_kelime) >= 3 then
      v_toplam := v_toplam + 1;
      if v_a like '%' || v_kelime || '%' then v_ortak := v_ortak + 1; end if;
    end if;
  end loop;

  if v_toplam > 0 and v_ortak > 0 then
    return greatest(55, (v_ortak * 100 / v_toplam));
  end if;

  return 0;
end $$;

revoke all on function public.firma_eslestir(text, text) from public;
grant execute on function public.firma_eslestir(text, text) to anon, authenticated;


-- ─── 2) Kendi makinesi ANINDA onayli ───
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

  if v_h.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz.'); end if;
  if coalesce(trim(p_model),'') = '' then return jsonb_build_object('ok', false, 'mesaj', 'Makine modeli zorunludur.'); end if;

  -- ⭐ DOĞRUDAN onayli (müşteri kendi makinesini yönetir)
  insert into public.musteri_vincler (hesap_id, musteri, model, seri_no, kapasite, makine_tipi, konum, durum)
  values (v_h.id, v_h.firma_adi, trim(p_model), nullif(trim(coalesce(p_seri_no,'')),''),
          nullif(trim(coalesce(p_kapasite,'')),''), coalesce(p_tip,'vinç'),
          nullif(trim(coalesce(p_konum,'')),''), 'onaylandi')
  returning id into v_id;

  begin
    perform public.bildirim_gonder(
      '🏗️ Müşteri Makine Ekledi',
      v_h.firma_adi || ' — ' || trim(p_model),
      'admin', null, '/admin/musteri-hesaplari', 'normal'
    );
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'id', v_id, 'mesaj', 'Makineniz eklendi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_vinc_ekle(text, text, text, text, text, text) from public;
grant execute on function public.musteri_vinc_ekle(text, text, text, text, text, text) to anon, authenticated;


-- ─── 3) Makine sil ───
create or replace function public.musteri_vinc_sil(p_token text, p_id uuid)
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

  delete from public.musteri_vincler where id = p_id and hesap_id = v_h.id;

  if not found then return jsonb_build_object('ok', false, 'mesaj', 'Makine bulunamadı.'); end if;
  return jsonb_build_object('ok', true, 'mesaj', 'Makine silindi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_vinc_sil(text, uuid) from public;
grant execute on function public.musteri_vinc_sil(text, uuid) to anon, authenticated;


-- ─── 4) Makine düzenle ───
create or replace function public.musteri_vinc_guncelle(
  p_token text, p_id uuid, p_model text,
  p_seri_no text default null, p_kapasite text default null,
  p_tip text default 'vinç', p_konum text default null
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
  if coalesce(trim(p_model),'') = '' then return jsonb_build_object('ok', false, 'mesaj', 'Model zorunludur.'); end if;

  update public.musteri_vincler
     set model = trim(p_model),
         seri_no = nullif(trim(coalesce(p_seri_no,'')),''),
         kapasite = nullif(trim(coalesce(p_kapasite,'')),''),
         makine_tipi = coalesce(p_tip,'vinç'),
         konum = nullif(trim(coalesce(p_konum,'')),'')
   where id = p_id and hesap_id = v_h.id;

  if not found then return jsonb_build_object('ok', false, 'mesaj', 'Makine bulunamadı.'); end if;
  return jsonb_build_object('ok', true, 'mesaj', 'Makine güncellendi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_vinc_guncelle(text, uuid, text, text, text, text, text) from public;
grant execute on function public.musteri_vinc_guncelle(text, uuid, text, text, text, text, text) to anon, authenticated;


-- ─── 5) Biletlerden makine bilgisi cikar ───
create or replace function public.musteri_portal_v5(p_token text)
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
  v_bilet_makine jsonb := '[]'::jsonb;
  v_okunmamis integer := 0;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz. Tekrar giriş yapın.');
  end if;

  -- SISTEM VINCLERI (akilli firma + telefon)
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
    where public.firma_eslestir(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),''), v_h.firma_adi) >= 75
       or public.temiz_telefon(coalesce(public.jalan(to_jsonb(c),'telefon','phone','musteri_telefon'),'')) like '%' || v_h.telefon || '%';
  exception when others then v_vincler := '[]'::jsonb; end;

  -- KENDI EKLEDIKLERI (aninda gorunur)
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', mv.id, 'model', mv.model, 'seri_no', coalesce(mv.seri_no,'—'),
      'kapasite', coalesce(mv.kapasite,'—'), 'makine_tipi', mv.makine_tipi,
      'konum', coalesce(mv.konum,'—'), 'durum', mv.durum,
      'tarih', to_char(mv.created_at,'DD.MM.YYYY')
    ) order by mv.created_at desc), '[]'::jsonb)
    into v_kendi
    from public.musteri_vincler mv where mv.hesap_id = v_h.id;
  exception when others then v_kendi := '[]'::jsonb; end;

  -- ⭐ BILETLERDEN MAKINE BILGISI (talep acarken girilen)
  begin
    select coalesce(jsonb_agg(distinct jsonb_build_object(
      'id', 'bilet-' || st.id,
      'model', public.jalan(to_jsonb(st),'manual_crane_info','vinc_bilgisi'),
      'kaynak', 'talep',
      'tarih', to_char(st.created_at,'DD.MM.YYYY')
    )), '[]'::jsonb)
    into v_bilet_makine
    from public.service_tickets st
    where (public.firma_eslestir(coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),''), v_h.firma_adi) >= 75
        or public.temiz_telefon(coalesce(public.jalan(to_jsonb(st),'manual_phone','telefon'),'')) like '%' || v_h.telefon || '%')
      and coalesce(public.jalan(to_jsonb(st),'manual_crane_info','vinc_bilgisi'),'') <> '';
  exception when others then v_bilet_makine := '[]'::jsonb; end;

  -- SERVIS GECMISI
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
    where public.firma_eslestir(coalesce(cs.customer_text,''), v_h.firma_adi) >= 75
       or public.temiz_telefon(coalesce(cs.customer_text,'')) like '%' || v_h.telefon || '%'
    limit 80;
  exception when others then v_servisler := '[]'::jsonb; end;

  -- AKTIF ISLER
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
    where (public.firma_eslestir(coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),''), v_h.firma_adi) >= 75
        or public.temiz_telefon(coalesce(public.jalan(to_jsonb(st),'manual_phone','telefon'),'')) like '%' || v_h.telefon || '%')
      and coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu');
  exception when others then v_aktif := '[]'::jsonb; end;

  -- BAKIM TAKVIMI
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'model', coalesce(public.jalan(to_jsonb(c),'model','makine_modeli'),'—'),
      'tarih', to_char(nullif(trim(coalesce(public.jalan(to_jsonb(c),'next_maintenance_date'),'')),'')::date, 'DD.MM.YYYY'),
      'gun_kaldi', (nullif(trim(coalesce(public.jalan(to_jsonb(c),'next_maintenance_date'),'')),'')::date - current_date)
    ) order by 2), '[]'::jsonb)
    into v_bakim
    from public.cranes c
    where public.firma_eslestir(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),''), v_h.firma_adi) >= 75
      and nullif(trim(coalesce(public.jalan(to_jsonb(c),'next_maintenance_date'),'')),'') is not null;
  exception when others then v_bakim := '[]'::jsonb; end;

  -- OKUNMAMIS
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
    'bilet_makineleri', v_bilet_makine,
    'servisler', v_servisler,
    'aktif_isler', v_aktif,
    'bakim_takvimi', v_bakim,
    'okunmamis_mesaj', v_okunmamis
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_portal_v5(text) from public;
grant execute on function public.musteri_portal_v5(text) to anon, authenticated;


-- ─── 6) TEST ───
select
  public.firma_eslestir('KPS', 'KPS OTOMOTİV') as kps_uzun,
  public.firma_eslestir('kps otomotiv', 'KPS OTOMOTIV') as kucuk_harf,
  public.firma_eslestir('MATAY', 'KPS OTOMOTİV') as farkli;

select count(*) as mevcut_kendi_makine from public.musteri_vincler;
