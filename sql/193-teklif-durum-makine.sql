-- ============================================================================
--  🔧 TEKLİF DURUMU + ADMIN MAKİNE YÖNETİMİ (Güncelleme #165)
-- ----------------------------------------------------------------------------
--  1) Müşteri onaylayınca offers.status = 'onaylandi' (admin doğru görsün)
--  2) Mesaj: sadece "onaylandı/reddedildi" (iletişime geçeceğiz YOK)
--  3) Admin müşterinin makinesini silebilir/düzenleyebilir
--
--  KULLANIM: 192'den SONRA çalıştır.
-- ============================================================================

-- ─── 1) musteri_teklif_onayla — DÜZELTİLDİ ───
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
  v_durum text := case when p_onay then 'onaylandi' else 'reddedildi' end;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz.'); end if;

  -- Onay kaydı: HER kaynak için doğru alana yaz
  insert into public.musteri_teklif_onay (hesap_id, offer_id, satis_id, durum, not_)
  values (
    v_h.id,
    case when p_kaynak in ('offer','teklif') then p_id else null end,
    case when p_kaynak = 'satis' then p_id else null end,
    v_durum,
    nullif(trim(coalesce(p_not,'')),'')
  );

  -- ⭐ offers tablosunu da güncelle (admin panelinde doğru görünsün)
  if p_kaynak in ('offer','teklif') then
    begin
      update public.offers
         set status = v_durum
       where id = p_id
         and exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='offers' and column_name='status');
    exception when others then null; end;
  end if;

  -- teklif_bekleyenler tablosu da güncellensin
  if p_kaynak = 'teklif' then
    begin
      update public.teklif_bekleyenler
         set durum = case when p_onay then 'TEKLIF VERILDI' else 'IPTAL' end
       where id = p_id;
    exception when others then null; end;
  end if;

  begin
    perform public.bildirim_gonder(
      case when p_onay then '✅ TEKLİF ONAYLANDI' else '❌ TEKLİF REDDEDİLDİ' end,
      v_h.firma_adi || coalesce(' — ' || p_not, ''),
      'admin', null, '/admin/teklifler', 'kritik'
    );
  exception when others then null; end;

  return jsonb_build_object('ok', true,
    'mesaj', case when p_onay then 'Teklif onaylandı.' else 'Teklif reddedildi.' end);
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_teklif_onayla(text, text, uuid, boolean, text) from public;
grant execute on function public.musteri_teklif_onayla(text, text, uuid, boolean, text) to anon, authenticated;


-- ─── 2) musteri_pazarlik_karar — mesaj sadeleşti ───
create or replace function public.musteri_pazarlik_karar(
  p_token text, p_pazarlik_id uuid, p_onay boolean, p_not text default null
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

  select * into v_p from public.teklif_pazarlik
  where id = p_pazarlik_id and hesap_id = v_h.id;

  if v_p.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Pazarlık bulunamadı.'); end if;
  if v_p.durum not in ('revize', 'bekliyor') then
    return jsonb_build_object('ok', false, 'mesaj', 'Bu pazarlık zaten sonuçlanmış.');
  end if;

  update public.teklif_pazarlik
     set durum = case when p_onay then 'kabul' else 'red' end,
         admin_notu = coalesce(nullif(trim(coalesce(p_not,'')),''), admin_notu),
         cevap_tarihi = now()
   where id = p_pazarlik_id;

  begin
    insert into public.musteri_teklif_onay (hesap_id, offer_id, satis_id, durum, not_)
    values (v_h.id,
      case when v_p.kaynak in ('offer','teklif') then v_p.kayit_id else null end,
      case when v_p.kaynak = 'satis' then v_p.kayit_id else null end,
      case when p_onay then 'onaylandi' else 'reddedildi' end,
      nullif(trim(coalesce(p_not,'')),''));
  exception when others then null; end;

  if v_p.kaynak in ('offer','teklif') then
    begin
      update public.offers set status = case when p_onay then 'onaylandi' else 'reddedildi' end
       where id = v_p.kayit_id
         and exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='offers' and column_name='status');
    exception when others then null; end;
  end if;

  begin
    perform public.bildirim_gonder(
      case when p_onay then '✅ PAZARLIK ONAYLANDI' else '❌ PAZARLIK REDDEDİLDİ' end,
      v_h.firma_adi || ' — ' || to_char(coalesce(v_p.istenen_tutar,0), 'FM999G999D00') || ' TL',
      'admin', null, '/admin/musteri-hesaplari', 'kritik');
  exception when others then null; end;

  return jsonb_build_object('ok', true,
    'mesaj', case when p_onay then 'Anlaşma sağlandı.' else 'Pazarlık reddedildi.' end);
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_pazarlik_karar(text, uuid, boolean, text) from public;
grant execute on function public.musteri_pazarlik_karar(text, uuid, boolean, text) to anon, authenticated;


-- ─── 3) ADMIN: müşterinin makinesini sil ───
create or replace function public.admin_makine_sil(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.musteri_vincler where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'mesaj', 'Makine bulunamadı.'); end if;
  return jsonb_build_object('ok', true, 'mesaj', 'Makine silindi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.admin_makine_sil(uuid) from public;
grant execute on function public.admin_makine_sil(uuid) to authenticated;


-- ─── 4) ADMIN: müşterinin makinesini düzenle ───
create or replace function public.admin_makine_guncelle(
  p_id uuid, p_model text, p_seri_no text default null, p_kapasite text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_model),'') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Model zorunludur.');
  end if;

  update public.musteri_vincler
     set model = trim(p_model),
         seri_no = nullif(trim(coalesce(p_seri_no,'')),''),
         kapasite = nullif(trim(coalesce(p_kapasite,'')),'')
   where id = p_id;

  if not found then return jsonb_build_object('ok', false, 'mesaj', 'Makine bulunamadı.'); end if;
  return jsonb_build_object('ok', true, 'mesaj', 'Güncellendi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.admin_makine_guncelle(uuid, text, text, text) from public;
grant execute on function public.admin_makine_guncelle(uuid, text, text, text) to authenticated;


-- ─── 5) ADMIN: müşteri adına makine ekle ───
create or replace function public.admin_makine_ekle(
  p_hesap_id uuid, p_model text, p_seri_no text default null,
  p_kapasite text default null, p_tip text default 'vinç', p_konum text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_h record;
begin
  select * into v_h from public.musteri_hesaplar where id = p_hesap_id;
  if v_h.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Hesap bulunamadı.'); end if;
  if coalesce(trim(p_model),'') = '' then return jsonb_build_object('ok', false, 'mesaj', 'Model zorunludur.'); end if;

  insert into public.musteri_vincler (hesap_id, musteri, model, seri_no, kapasite, makine_tipi, konum, durum)
  values (p_hesap_id, v_h.firma_adi, trim(p_model),
          nullif(trim(coalesce(p_seri_no,'')),''), nullif(trim(coalesce(p_kapasite,'')),''),
          coalesce(p_tip,'vinç'), nullif(trim(coalesce(p_konum,'')),''), 'onaylandi');

  return jsonb_build_object('ok', true, 'mesaj', 'Makine eklendi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.admin_makine_ekle(uuid, text, text, text, text, text) from public;
grant execute on function public.admin_makine_ekle(uuid, text, text, text, text, text) to authenticated;


-- ─── 6) musteri_detay: makine id + kendi olanlar ───
create or replace function public.musteri_detay_makineler(p_hesap_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', mv.id, 'model', mv.model,
      'seri_no', coalesce(mv.seri_no,''), 'kapasite', coalesce(mv.kapasite,''),
      'tip', mv.makine_tipi, 'kaynak', 'kendi'
    ) as x
    from public.musteri_vincler mv where mv.hesap_id = p_hesap_id
    union all
    select jsonb_build_object(
      'id', c.id,
      'model', coalesce(public.jalan(to_jsonb(c),'model','makine_modeli'),'—'),
      'seri_no', coalesce(public.jalan(to_jsonb(c),'serial_number','seri_no'),''),
      'kapasite', coalesce(public.jalan(to_jsonb(c),'crane_capacity','kapasite'),''),
      'tip', coalesce(public.jalan(to_jsonb(c),'makine_tipi'),''), 'kaynak', 'sistem'
    )
    from public.cranes c
    where public.firma_eslestir(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),''),
          (select firma_adi from public.musteri_hesaplar where id = p_hesap_id)) >= 75
  ) t;
$$;

revoke all on function public.musteri_detay_makineler(uuid) from public;
grant execute on function public.musteri_detay_makineler(uuid) to authenticated;


-- ─── TEST ───
select
  (select count(*) from information_schema.routines
    where routine_schema='public' and routine_name in
      ('admin_makine_sil','admin_makine_guncelle','admin_makine_ekle','musteri_detay_makineler')) as fn_ok;
