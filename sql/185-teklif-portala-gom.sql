-- ============================================================================
--  💰 TEKLİFLERİ ANA PORTALA GÖM (Güncelleme #157)
-- ----------------------------------------------------------------------------
--  SORUN: musteri_teklifleri ayrı RPC → UI'da gelmiyor
--  ÇÖZÜM: teklifler artık musteri_portal_v6 içinde dönüyor
--
--  KULLANIM: 184'ten SONRA çalıştır.
-- ============================================================================

create or replace function public.musteri_portal_v6(p_token text)
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
  v_teklifler jsonb := '[]'::jsonb;
  v_okunmamis integer := 0;
  v_makine_sayisi integer := 0;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz. Tekrar giriş yapın.');
  end if;

  -- VİNÇLER
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
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

  -- KENDİ EKLEDİKLERİ
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

  -- ⭐ TEKLİFLER (offers + satış + teklif-bekleyen)
  begin
    select coalesce(jsonb_agg(t.j order by t.sira desc), '[]'::jsonb)
    into v_teklifler
    from (
      select jsonb_build_object(
        'kaynak', 'offer', 'id', o.id, 'no', upper(left(o.id::text, 6)),
        'baslik', case
          when coalesce(public.jalan(to_jsonb(o),'template_type'),'') = 'bakim' then 'Periyodik Bakım Teklifi'
          when coalesce(public.jalan(to_jsonb(o),'template_type'),'') = 'siparis' then 'Sipariş Formu'
          else 'Fiyat Teklifi' end,
        'aciklama', coalesce(left(public.jalan(to_jsonb(o),'description','notlar'),300),''),
        'tutar', coalesce(nullif(public.jalan(to_jsonb(o),'total_price'),'')::numeric,
                          nullif(public.jalan(to_jsonb(o),'genel_toplam'),'')::numeric, 0),
        'firma', coalesce(public.jalan(to_jsonb(o),'customer_name','musteri','firma_adi'),''),
        'tarih', coalesce(public.jalan(to_jsonb(o),'offer_date'), to_char(o.created_at,'YYYY-MM-DD')),
        'sira', coalesce(nullif(public.jalan(to_jsonb(o),'offer_date'),'')::date, o.created_at::date),
        'durum', coalesce((
          select mo.durum from public.musteri_teklif_onay mo
          where mo.hesap_id = v_h.id and mo.offer_id = o.id limit 1
        ), lower(coalesce(public.jalan(to_jsonb(o),'status'),'bekliyor')))
      ) as j
      from public.offers o
      where public.firma_eslestir(
              coalesce(public.jalan(to_jsonb(o),'customer_name','musteri','firma_adi'),''),
              v_h.firma_adi) >= 75

      union all

      select jsonb_build_object(
        'kaynak', 'satis', 'id', s.id, 'no', s.satis_no,
        'baslik', 'Malzeme Satışı', 'aciklama', coalesce(s.notlar,''),
        'tutar', s.genel_toplam, 'firma', s.musteri,
        'tarih', to_char(s.satis_tarihi,'YYYY-MM-DD'),
        'sira', s.satis_tarihi,
        'durum', coalesce((
          select mo.durum from public.musteri_teklif_onay mo
          where mo.hesap_id = v_h.id and mo.satis_id = s.id limit 1
        ), 'bekliyor')
      ) as j
      from public.satislar s
      where s.durum <> 'iptal'
        and public.firma_eslestir(s.musteri, v_h.firma_adi) >= 75

      union all

      select jsonb_build_object(
        'kaynak', 'teklif', 'id', tb.id,
        'no', coalesce(public.jalan(to_jsonb(tb),'is_emri_no'),'—'),
        'baslik', 'Fiyat Teklifi',
        'aciklama', coalesce(left(public.jalan(to_jsonb(tb),'ariza'),300),''),
        'tutar', 0,
        'firma', coalesce(public.jalan(to_jsonb(tb),'musteri','musteri_adi','firma','firma_adi'),''),
        'tarih', to_char(tb.created_at,'YYYY-MM-DD'),
        'sira', tb.created_at::date,
        'durum', lower(coalesce(public.jalan(to_jsonb(tb),'durum'),'bekliyor'))
      ) as j
      from public.teklif_bekleyenler tb
      where public.firma_eslestir(
              coalesce(public.jalan(to_jsonb(tb),'musteri','musteri_adi','firma','firma_adi'),''),
              v_h.firma_adi) >= 75
    ) t;
  exception when others then v_teklifler := '[]'::jsonb; end;

  -- SERVİS GEÇMİŞİ (3 kaynak)
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'tarih', t.tarih, 'aciklama', t.aciklama, 'tur', t.tur,
      'personel', t.personel, 'tutar', t.tutar, 'malzeme', t.malzeme, 'form_no', t.form_no
    ) order by t.tarih_iso desc), '[]'::jsonb)
    into v_servisler
    from (
      select to_char(cs.service_date,'DD.MM.YYYY') as tarih,
             to_char(cs.service_date,'YYYY-MM-DD') as tarih_iso,
             coalesce(left(cs.description,300),'—') as aciklama,
             coalesce(cs.service_type,'Servis') as tur,
             coalesce(cs.technician,'—') as personel,
             coalesce(cs.price,0) as tutar,
             coalesce(left(cs.materials_text,200),'') as malzeme,
             coalesce(cs.form_number,'') as form_no
      from public.completed_services cs
      where public.firma_eslestir(coalesce(cs.customer_text,''), v_h.firma_adi) >= 75
         or public.temiz_telefon(coalesce(cs.customer_text,'')) like '%' || v_h.telefon || '%'
      union all
      select to_char(sr.created_at,'DD.MM.YYYY'), to_char(sr.created_at,'YYYY-MM-DD'),
             coalesce(left(coalesce(public.jalan(to_jsonb(sr),'arizanin_cinsi'),'') || ' — ' ||
                          coalesce(public.jalan(to_jsonb(sr),'yapilan_isler'),''), 300),'—'),
             coalesce(public.jalan(to_jsonb(sr),'islem_turu'),'Servis'),
             coalesce(public.jalan(to_jsonb(sr),'personel_adi'),'—'), 0,
             '', upper(left(sr.id::text,6))
      from public.service_reports sr
      where public.firma_eslestir(coalesce(public.jalan(to_jsonb(sr),'firma_adi'),''), v_h.firma_adi) >= 75
      union all
      select to_char(bf.kontrol_tarihi,'DD.MM.YYYY'), to_char(bf.kontrol_tarihi,'YYYY-MM-DD'),
             'Periyodik bakım — ' || coalesce(bf.onay_sayisi,0)::text || ' onay, ' ||
             coalesce(bf.ret_sayisi,0)::text || ' ret',
             'Bakım', coalesce(bf.personel,'—'), 0, '', coalesce(bf.seri_no,'')
      from public.bakim_formlari bf
      where public.firma_eslestir(coalesce(public.jalan(to_jsonb(bf),'musteri'),''), v_h.firma_adi) >= 75
    ) t
    limit 120;
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
    where (public.firma_eslestir(coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),''), v_h.firma_adi) >= 75
        or public.temiz_telefon(coalesce(public.jalan(to_jsonb(st),'manual_phone','telefon'),'')) like '%' || v_h.telefon || '%')
      and coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu');
  exception when others then v_aktif := '[]'::jsonb; end;

  -- BAKIM
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

  begin
    select count(*) into v_okunmamis from public.musteri_sohbet
    where hesap_id = v_h.id and gonderen = 'admin' and okundu = false;
  exception when others then v_okunmamis := 0; end;

  begin
    select count(distinct public.parca_adi_normal(m)) into v_makine_sayisi from (
      select coalesce(public.jalan(to_jsonb(c),'model','makine_modeli'),'') as m
      from public.cranes c
      where public.firma_eslestir(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),''), v_h.firma_adi) >= 75
         or public.temiz_telefon(coalesce(public.jalan(to_jsonb(c),'telefon','phone'),'')) like '%' || v_h.telefon || '%'
      union all
      select mv.model from public.musteri_vincler mv where mv.hesap_id = v_h.id
      union all
      select public.jalan(to_jsonb(st),'manual_crane_info','vinc_bilgisi') from public.service_tickets st
      where (public.firma_eslestir(coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),''), v_h.firma_adi) >= 75
          or public.temiz_telefon(coalesce(public.jalan(to_jsonb(st),'manual_phone','telefon'),'')) like '%' || v_h.telefon || '%')
        and coalesce(public.jalan(to_jsonb(st),'manual_crane_info','vinc_bilgisi'),'') <> ''
    ) x where coalesce(trim(m),'') not in ('','—');
  exception when others then v_makine_sayisi := 0; end;

  return jsonb_build_object(
    'ok', true, 'firma', v_h.firma_adi, 'ad_soyad', v_h.ad_soyad, 'telefon', v_h.telefon,
    'vincler', v_vincler, 'kendi_makineler', v_kendi,
    'teklifler', v_teklifler,
    'servisler', v_servisler, 'aktif_isler', v_aktif,
    'bakim_takvimi', v_bakim, 'okunmamis_mesaj', v_okunmamis,
    'makine_sayisi', v_makine_sayisi
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_portal_v6(text) from public;
grant execute on function public.musteri_portal_v6(text) to anon, authenticated;

-- TEST
select
  (select count(*) from public.offers) as offers,
  jsonb_array_length(public.musteri_portal_v6(
    (select token from public.musteri_hesaplar where durum='onaylandi' and token is not null limit 1)
  )->'teklifler') as portal_teklif_sayisi;
