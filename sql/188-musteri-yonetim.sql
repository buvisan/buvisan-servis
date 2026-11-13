-- ============================================================================
--  👥 MÜŞTERİ YÖNETİM PANELİ (Güncelleme #160)
-- ----------------------------------------------------------------------------
--  Her müşteri hesabı için TEK çağrıda her şey:
--    • Sohbet (mesaj geçmişi + admin cevabı)
--    • Pazarlıklar (kabul/red/revize)
--    • Teklifler
--    • Makineler (sistem + kendi eklediği + talepten)
--    • Servis geçmişi
--    • Aktif işler
--    • Bakım takvimi
--
--  KULLANIM: 187'den SONRA çalıştır.
-- ============================================================================

-- ─── 1) ADMIN mesaj gönderir ───
create or replace function public.admin_mesaj_gonder(
  p_hesap_id uuid, p_mesaj text
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
  if coalesce(trim(p_mesaj),'') = '' then return jsonb_build_object('ok', false, 'mesaj', 'Mesaj boş.'); end if;

  insert into public.musteri_sohbet (hesap_id, gonderen, mesaj)
  values (p_hesap_id, 'admin', left(trim(p_mesaj), 2000));

  return jsonb_build_object('ok', true, 'mesaj', 'Mesaj gönderildi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.admin_mesaj_gonder(uuid, text) from public;
grant execute on function public.admin_mesaj_gonder(uuid, text) to authenticated;


-- ─── 2) ADMIN sohbeti okur (okundu işaretle) ───
create or replace function public.admin_sohbet_getir(p_hesap_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sonuc jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'gonderen', s.gonderen, 'mesaj', s.mesaj,
    'tarih', to_char(s.created_at,'DD.MM.YYYY HH24:MI')
  ) order by s.created_at), '[]'::jsonb)
  into v_sonuc
  from public.musteri_sohbet s where s.hesap_id = p_hesap_id;

  begin
    update public.musteri_sohbet set okundu = true
    where hesap_id = p_hesap_id and gonderen = 'musteri' and okundu = false;
  exception when others then null; end;

  return v_sonuc;
exception when others then return '[]'::jsonb;
end $$;

revoke all on function public.admin_sohbet_getir(uuid) from public;
grant execute on function public.admin_sohbet_getir(uuid) to authenticated;


-- ─── 3) ⭐ MÜŞTERİ DETAY — HER ŞEY TEK ÇAĞRIDA ───
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

  -- SOHBET
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'gonderen', s.gonderen, 'mesaj', s.mesaj,
      'tarih', to_char(s.created_at,'DD.MM.YYYY HH24:MI')
    ) order by s.created_at), '[]'::jsonb)
    into v_sohbet
    from public.musteri_sohbet s where s.hesap_id = p_hesap_id;
  exception when others then v_sohbet := '[]'::jsonb; end;

  -- PAZARLIKLAR
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

  -- TEKLİFLER
  begin
    v_teklif := public.musteri_teklif_bloku(v_h.id, v_h.firma_adi);
  exception when others then v_teklif := '[]'::jsonb; end;

  -- MAKİNELER (sistem + kendi + talep)
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'model', model, 'kaynak', kaynak, 'id', kendi_id
    ) order by model), '[]'::jsonb)
    into v_makine
    from (
      select distinct on (public.parca_adi_normal(m))
        m as model, kaynak, kendi_id
      from (
        select coalesce(public.jalan(to_jsonb(c),'model','makine_modeli'),'') as m,
               'sistem'::text as kaynak, null::uuid as kendi_id
        from public.cranes c
        where public.firma_eslestir(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),''), v_h.firma_adi) >= 75
           or public.temiz_telefon(coalesce(public.jalan(to_jsonb(c),'telefon','phone','musteri_telefon'),'')) like '%' || v_h.telefon || '%'
        union all
        select mv.model, 'kendi', mv.id from public.musteri_vincler mv where mv.hesap_id = v_h.id
        union all
        select public.jalan(to_jsonb(st),'manual_crane_info','vinc_bilgisi'), 'talep', null::uuid
        from public.service_tickets st
        where (public.firma_eslestir(coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),''), v_h.firma_adi) >= 75
            or public.temiz_telefon(coalesce(public.jalan(to_jsonb(st),'manual_phone','telefon'),'')) like '%' || v_h.telefon || '%')
          and coalesce(public.jalan(to_jsonb(st),'manual_crane_info','vinc_bilgisi'),'') <> ''
      ) r
      where coalesce(trim(m),'') not in ('','—')
    ) x;
  exception when others then v_makine := '[]'::jsonb; end;

  -- SERVİS GEÇMİŞİ
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'tarih', t.tarih, 'aciklama', t.aciklama, 'tur', t.tur,
      'personel', t.personel, 'tutar', t.tutar, 'form_no', t.form_no
    ) order by t.sira desc), '[]'::jsonb)
    into v_servis
    from (
      select to_char(cs.service_date,'DD.MM.YYYY') as tarih,
             cs.service_date as sira,
             coalesce(left(cs.description,300),'—') as aciklama,
             coalesce(cs.service_type,'Servis') as tur,
             coalesce(cs.technician,'—') as personel,
             coalesce(cs.price,0) as tutar,
             coalesce(cs.form_number,'') as form_no
      from public.completed_services cs
      where public.firma_eslestir(coalesce(cs.customer_text,''), v_h.firma_adi) >= 75
         or public.temiz_telefon(coalesce(cs.customer_text,'')) like '%' || v_h.telefon || '%'
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

  -- AKTİF İŞLER
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


-- ─── 4) Hesap listesi: okunmamış mesaj + bekleyen pazarlık sayısı ekle ───
create or replace function public.musteri_hesap_listesi(p_durum text default 'bekliyor')
returns table (
  id uuid, firma_adi text, kullanici_adi text, ad_soyad text,
  telefon text, email text, durum text, ret_sebebi text,
  onaylayan text, onay_tarihi text, son_giris text, olusturma text,
  vinç_sayisi bigint, okunmamis integer, pazarlik integer
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
    to_char(h.created_at,'DD.MM.YYYY HH:MI'),
    (select count(*) from public.cranes c
      where public.firma_normal(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),''))
            like '%' || public.firma_normal(h.firma_adi) || '%'),
    (select count(*)::int from public.musteri_sohbet s
      where s.hesap_id = h.id and s.gonderen = 'musteri' and s.okundu = false),
    (select count(*)::int from public.teklif_pazarlik p
      where p.hesap_id = h.id and p.durum = 'bekliyor')
  from public.musteri_hesaplar h
  where (p_durum = 'hepsi' or h.durum = p_durum)
  order by
    (select count(*) from public.musteri_sohbet s where s.hesap_id = h.id and s.gonderen = 'musteri' and s.okundu = false) desc,
    h.created_at desc;
$$;

revoke all on function public.musteri_hesap_listesi(text) from public;
grant execute on function public.musteri_hesap_listesi(text) to authenticated;


-- ─── 5) TEST ───
select
  (select count(*) from information_schema.routines
    where routine_schema='public' and routine_name in
      ('musteri_detay','admin_mesaj_gonder','admin_sohbet_getir')) as fn_ok;

select firma_adi, durum, okunmamis, pazarlik
from public.musteri_hesap_listesi('hepsi') limit 10;
