-- ============================================================================
--  🔗 musteri_detay → makineleri yeni fonksiyondan al (Güncelleme #167)
--  KULLANIM: 194'ten SONRA çalıştır.
-- ============================================================================

create or replace function public.musteri_detay(p_hesap_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_h record;
  v_sohbet jsonb := '[]'::jsonb;
  v_pazarlik jsonb := '[]'::jsonb;
  v_teklif jsonb := '[]'::jsonb;
  v_makine jsonb := '[]'::jsonb;
  v_servis jsonb := '[]'::jsonb;
  v_aktif jsonb := '[]'::jsonb;
  v_okunmamis integer := 0;
  v_okunmamis_pz integer := 0;
begin
  select * into v_h from public.musteri_hesaplar where id = p_hesap_id;
  if v_h.id is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Hesap bulunamadı.');
  end if;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'gonderen', s.gonderen, 'mesaj', s.mesaj,
      'tarih', to_char(s.created_at,'DD.MM.YYYY HH24:MI')
    ) order by s.created_at), '[]'::jsonb)
    into v_sohbet
    from public.musteri_sohbet s where s.hesap_id = p_hesap_id;
  exception when others then v_sohbet := '[]'::jsonb; end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'kaynak', p.kaynak, 'kayit_id', p.kayit_id,
      'teklif_tutar', p.teklif_tutar, 'istenen_tutar', p.istenen_tutar,
      'fark', p.fark, 'mesaj', coalesce(p.mesaj,''),
      'durum', p.durum, 'admin_notu', coalesce(p.admin_notu,''),
      'tarih', to_char(p.created_at,'DD.MM.YYYY HH24:MI')
    ) order by p.created_at desc), '[]'::jsonb)
    into v_pazarlik
    from public.teklif_pazarlik p where p.hesap_id = p_hesap_id;
  exception when others then v_pazarlik := '[]'::jsonb; end;

  begin
    v_teklif := public.musteri_teklif_bloku(v_h.id, v_h.firma_adi);
  exception when others then v_teklif := '[]'::jsonb; end;

  -- ⭐ MAKİNELER: yeni fonksiyondan (gizliler hariç, kendi_id ile)
  begin
    v_makine := public.musteri_detay_makineler(v_h.id);
  exception when others then v_makine := '[]'::jsonb; end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'tarih', t.tarih, 'aciklama', t.aciklama, 'tur', t.tur,
      'personel', t.personel, 'tutar', t.tutar, 'form_no', t.form_no
    ) order by t.sira desc), '[]'::jsonb)
    into v_servis
    from (
      select to_char(cs.service_date,'DD.MM.YYYY') as tarih, cs.service_date as sira,
             coalesce(left(cs.description,300),'—') as aciklama,
             coalesce(cs.service_type,'Servis') as tur,
             coalesce(cs.technician,'—') as personel,
             coalesce(cs.price,0) as tutar,
             coalesce(cs.form_number,'') as form_no
      from public.completed_services cs
      where public.firma_eslestir(coalesce(public.jalan(to_jsonb(cs),'customer_text','musteri'),''), v_h.firma_adi) >= 75
         or public.temiz_telefon(coalesce(public.jalan(to_jsonb(cs),'customer_text','musteri'),'')) like '%' || v_h.telefon || '%'
      union all
      select to_char(sr.created_at,'DD.MM.YYYY'), sr.created_at::date,
             coalesce(left(coalesce(public.jalan(to_jsonb(sr),'arizanin_cinsi'),'') || ' — ' ||
                          coalesce(public.jalan(to_jsonb(sr),'yapilan_isler'),''), 300),'—'),
             coalesce(public.jalan(to_jsonb(sr),'islem_turu'),'Servis'),
             coalesce(public.jalan(to_jsonb(sr),'personel_adi'),'—'), 0,
             upper(left(sr.id::text,6))
      from public.service_reports sr
      where public.firma_eslestir(coalesce(public.jalan(to_jsonb(sr),'firma_adi'),''), v_h.firma_adi) >= 75
    ) t limit 60;
  exception when others then v_servis := '[]'::jsonb; end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', st.id,
      'aciklama', coalesce(left(public.jalan(to_jsonb(st),'description','aciklama'),250),'—'),
      'durum', coalesce(to_jsonb(st)->>'pipeline_status','bekliyor'),
      'tarih', to_char(st.created_at,'DD.MM.YYYY HH24:MI')
    ) order by st.created_at desc), '[]'::jsonb)
    into v_aktif
    from public.service_tickets st
    where (public.firma_eslestir(coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),''), v_h.firma_adi) >= 75
        or public.temiz_telefon(coalesce(public.jalan(to_jsonb(st),'manual_phone','telefon'),'')) like '%' || v_h.telefon || '%')
      and coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu');
  exception when others then v_aktif := '[]'::jsonb; end;

  begin
    select count(*) into v_okunmamis from public.musteri_sohbet
    where hesap_id = p_hesap_id and gonderen = 'musteri' and okundu = false;
  exception when others then v_okunmamis := 0; end;

  begin
    select count(*) into v_okunmamis_pz from public.teklif_pazarlik
    where hesap_id = p_hesap_id and durum = 'bekliyor';
  exception when others then v_okunmamis_pz := 0; end;

  return jsonb_build_object(
    'ok', true,
    'hesap', jsonb_build_object(
      'id', v_h.id, 'firma', v_h.firma_adi, 'kullanici', v_h.kullanici_adi,
      'ad_soyad', coalesce(v_h.ad_soyad,''), 'telefon', v_h.telefon,
      'email', coalesce(v_h.email,''), 'durum', v_h.durum,
      'son_giris', to_char(v_h.son_giris,'DD.MM.YYYY HH24:MI'),
      'kayit', to_char(v_h.created_at,'DD.MM.YYYY')
    ),
    'sohbet', v_sohbet,
    'pazarliklar', v_pazarlik,
    'teklifler', v_teklif,
    'makineler', v_makine,
    'servisler', v_servis,
    'aktif_isler', v_aktif,
    'okunmamis_mesaj', v_okunmamis,
    'bekleyen_pazarlik', v_okunmamis_pz
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_detay(uuid) from public;
grant execute on function public.musteri_detay(uuid) to authenticated;

select jsonb_array_length(
  (public.musteri_detay((select id from public.musteri_hesaplar where durum='onaylandi' limit 1)))->'makineler'
) as makine_sayisi;
