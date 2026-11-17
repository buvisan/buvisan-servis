-- ============================================================================
--  🔧 MÜŞTERİ PORTALI: SÖZLEŞME EŞLEŞTİRME + SERVİS FORMU DETAYI
--  (Güncelleme #203)
-- ----------------------------------------------------------------------------
--  SORUN 1 — "Bakım sözleşmesi var ama müşteri göremiyor"
--    Sebep: sözleşmeler company_name (tam ünvan) ile eşleşiyordu.
--      firma_eslestir('KARESİ POLYESTER VE PETROKİMYA SANAYİ A.Ş.','RB KARESİ') = 0
--      firma_eslestir('KARESİ',            'RB KARESİ') = 95   ← hitap_adi
--    Çözüm: company_name VEYA hitap_adi eşleşmesi (>= 75).
--
--  SORUN 2 — Müşteri servis formlarının detayını göremiyor
--    Çözüm: musteri_servislerim()  → liste (FİYAT YOK)
--           musteri_servis_detay() → tek formun TÜM detayı (fiyat dahil)
--
--  KULLANIM: Supabase SQL Editor'de bir kez çalıştır. (202'den SONRA)
-- ============================================================================


-- ─── 1) MÜŞTERİNİN SÖZLEŞMESİ (hitap_adi eşleşmesi eklendi) ───
create or replace function public.musteri_sozlesmem(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_h record;
  v_s record;
  v_yilda integer;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz.'); end if;

  select * into v_s from public.maintenance_contracts s
  where (public.firma_eslestir(coalesce(s.company_name,''), v_h.firma_adi) >= 75
      or public.firma_eslestir(coalesce(s.hitap_adi,''),   v_h.firma_adi) >= 75)
    and coalesce(s.asama,'anlasildi') = 'anlasildi'
    and coalesce(s.status,'aktif') <> 'bitti'
  order by greatest(
             public.firma_eslestir(coalesce(s.company_name,''), v_h.firma_adi),
             public.firma_eslestir(coalesce(s.hitap_adi,''),   v_h.firma_adi)
           ) desc,
           s.start_date desc
  limit 1;

  if v_s.id is null then
    return jsonb_build_object('ok', true, 'var', false);
  end if;

  -- Yılda kaç bakım: takvimde gerçekten kaç ziyaret varsa o (visits_per_year),
  -- yoksa periyottan hesaplanır. (takvim_yenile de aynı mantığı kullanır)
  v_yilda := greatest(1, least(12, coalesce(
               nullif(v_s.visits_per_year, 0),
               round(12.0 / greatest(1, coalesce(nullif(v_s.maintenance_period_months,0), 3)))::integer
             )));

  return jsonb_build_object('ok', true, 'var', true,
    'id', v_s.id,
    'firma', v_s.company_name,
    'hitap', coalesce(v_s.hitap_adi,''),
    'makine_sayisi', coalesce(v_s.machine_count,0),
    'makine_tipi', coalesce(v_s.machine_type,'vinç'),
    'makine_fiyat', coalesce(v_s.price_per_machine,0),
    'servis_fiyat', coalesce(v_s.service_price,0),
    'periyot', greatest(1, round(12.0 / v_yilda)::integer),
    'yilda', v_yilda,
    'baslangic', to_char(v_s.start_date,'DD.MM.YYYY'),
    'bitis', to_char(v_s.end_date,'DD.MM.YYYY'),
    'baslangic_iso', to_char(v_s.start_date,'YYYY-MM-DD'),
    'bitis_iso', to_char(v_s.end_date,'YYYY-MM-DD'),
    'yillik_toplam', coalesce(v_s.yearly_total,0),
    'visit_count', coalesce(v_s.visit_count, v_yilda),
    'dosya_url', coalesce(v_s.contract_file_url,''),
    'gun_kaldi', (v_s.end_date - current_date)::integer
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_sozlesmem(text) from public;
grant execute on function public.musteri_sozlesmem(text) to anon, authenticated;


-- ─── 2) MÜŞTERİNİN BAKIM TAKVİMİ (plan → sözleşme üzerinden eşleşir) ───
create or replace function public.musteri_bakim_takvimi(p_token text, p_yil integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_h record;
  v_sonuc jsonb := '[]'::jsonb;
  v_sozlesme_var boolean := false;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz.',
                              'sozlesme_var', false, 'takvim', '[]'::jsonb);
  end if;

  select exists(
    select 1 from public.maintenance_contracts s
    where (public.firma_eslestir(coalesce(s.company_name,''), v_h.firma_adi) >= 75
        or public.firma_eslestir(coalesce(s.hitap_adi,''),   v_h.firma_adi) >= 75)
      and coalesce(s.asama,'anlasildi') = 'anlasildi'
      and coalesce(s.status,'aktif') <> 'bitti'
  ) into v_sozlesme_var;

  if not v_sozlesme_var then
    return jsonb_build_object('ok', true, 'firma', v_h.firma_adi,
                              'sozlesme_var', false, 'takvim', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'tarih', to_char(b.tarih,'DD.MM.YYYY'),
    'tarih_iso', to_char(b.tarih,'YYYY-MM-DD'),
    'sira', b.sira,
    'durum', b.durum,
    'gun_kaldi', (b.tarih - current_date)::integer,
    'makine_sayisi', coalesce(s.machine_count,0),
    'makine_tipi', coalesce(s.machine_type,'vinç'),
    'periyot', coalesce(s.maintenance_period_months,0),
    'yilda', greatest(1, round(12.0 / greatest(1, coalesce(s.maintenance_period_months,3)))::integer)
  ) order by b.tarih), '[]'::jsonb)
  into v_sonuc
  from public.bakim_plani b
  join public.maintenance_contracts s on s.id = b.sozlesme_id
  where (public.firma_eslestir(coalesce(s.company_name,''), v_h.firma_adi) >= 75
      or public.firma_eslestir(coalesce(s.hitap_adi,''),   v_h.firma_adi) >= 75)
    and (p_yil is null or b.yil = p_yil);

  return jsonb_build_object('ok', true,
    'firma', v_h.firma_adi,
    'sozlesme_var', true,
    'takvim', v_sonuc,
    'toplam', jsonb_array_length(v_sonuc),
    'yapilan', (select count(*) from jsonb_array_elements(v_sonuc) e where e->>'durum' = 'yapildi')
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm,
                            'sozlesme_var', false, 'takvim', '[]'::jsonb);
end $$;

revoke all on function public.musteri_bakim_takvimi(text, integer) from public;
grant execute on function public.musteri_bakim_takvimi(text, integer) to anon, authenticated;


-- ─── 3) MÜŞTERİNİN SERVİS FORMLARI — LİSTE (FİYAT YOK!) ───
--     Fiyat sadece musteri_servis_detay() ile, tıklanınca gelir.
create or replace function public.musteri_servislerim(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_h record;
  v_sonuc jsonb := '[]'::jsonb;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(q.j order by q.sira desc), '[]'::jsonb)
  into v_sonuc
  from (
    select u.j, u.sira
    from (
      -- 1) FİNANSA GİDEN SERVİSLER (completed_services)
      select jsonb_build_object(
        'kaynak', 'completed',
        'id', cs.id,
        'tarih', to_char(cs.service_date,'DD.MM.YYYY'),
        'tarih_iso', to_char(cs.service_date,'YYYY-MM-DD'),
        'aciklama', coalesce(left(cs.description, 240), '—'),
        'tur', coalesce(cs.service_type, 'Servis'),
        'personel', coalesce(cs.technician, '—'),
        'form_no', coalesce(cs.form_number, ''),
        'makine', coalesce(cs.makine_tipi, ''),
        'malzeme_var', (coalesce(cs.materials_text,'') <> '')
      ) as j,
      cs.service_date::timestamp as sira
      from public.completed_services cs
      where public.firma_eslestir(coalesce(cs.customer_text,''), v_h.firma_adi) >= 75
         or public.temiz_telefon(coalesce(cs.customer_text,'')) like '%' || v_h.telefon || '%'

      union all

      -- 2) SERVİS RAPORLARI (service_reports)
      select jsonb_build_object(
        'kaynak', 'rapor',
        'id', sr.id,
        'tarih', to_char(sr.created_at,'DD.MM.YYYY'),
        'tarih_iso', to_char(sr.created_at,'YYYY-MM-DD'),
        'aciklama', coalesce(left(
            coalesce(public.jalan(to_jsonb(sr),'arizanin_cinsi'),'') || ' — ' ||
            coalesce(public.jalan(to_jsonb(sr),'yapilan_isler'),''), 240), '—'),
        'tur', coalesce(public.jalan(to_jsonb(sr),'islem_turu'), 'Servis'),
        'personel', coalesce(public.jalan(to_jsonb(sr),'personel_adi'), '—'),
        'form_no', upper(left(sr.id::text,6)),
        'makine', '',
        'malzeme_var', (coalesce(public.jalan(to_jsonb(sr),'degisen_parcalar'),'[]') <> '[]')
      ) as j,
      sr.created_at as sira
      from public.service_reports sr
      where public.firma_eslestir(coalesce(public.jalan(to_jsonb(sr),'firma_adi'),''), v_h.firma_adi) >= 75

      union all

      -- 3) PERİYODİK BAKIM FORMLARI (bakim_formlari)
      select jsonb_build_object(
        'kaynak', 'bakim',
        'id', bf.id,
        'tarih', to_char(bf.kontrol_tarihi,'DD.MM.YYYY'),
        'tarih_iso', to_char(bf.kontrol_tarihi,'YYYY-MM-DD'),
        'aciklama', 'Periyodik bakım — ' || coalesce(bf.onay_sayisi,0)::text || ' onay, '
                    || coalesce(bf.ret_sayisi,0)::text || ' ret',
        'tur', 'Bakım',
        'personel', coalesce(bf.personel,'—'),
        'form_no', coalesce(bf.seri_no,''),
        'makine', coalesce(bf.seri_no,''),
        'malzeme_var', false
      ) as j,
      bf.kontrol_tarihi::timestamp as sira
      from public.bakim_formlari bf
      where public.firma_eslestir(coalesce(public.jalan(to_jsonb(bf),'musteri'),''), v_h.firma_adi) >= 75
    ) u
    order by u.sira desc
    limit 200
  ) q;

  return v_sonuc;
exception when others then
  return '[]'::jsonb;
end $$;

revoke all on function public.musteri_servislerim(text) from public;
grant execute on function public.musteri_servislerim(text) to anon, authenticated;


-- ─── 4) TEK SERVİS FORMU DETAYI (fiyat BURADA) ───
create or replace function public.musteri_servis_detay(
  p_token text, p_kaynak text, p_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_h record;
  v_cs record;
  v_sr record;
  v_bf record;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz.'); end if;

  -- 1) FİNANS / TAMAMLANAN SERVİS
  if coalesce(p_kaynak,'') = 'completed' then
    select * into v_cs from public.completed_services where id::text = p_id;
    if not found then return jsonb_build_object('ok', false, 'mesaj', 'Kayıt bulunamadı.'); end if;

    if not (public.firma_eslestir(coalesce(v_cs.customer_text,''), v_h.firma_adi) >= 75
            or public.temiz_telefon(coalesce(v_cs.customer_text,'')) like '%' || v_h.telefon || '%') then
      return jsonb_build_object('ok', false, 'mesaj', 'Bu kayıt size ait değil.');
    end if;

    return jsonb_build_object(
      'ok', true, 'kaynak', 'completed',
      'tarih', to_char(v_cs.service_date,'DD.MM.YYYY'),
      'tur', coalesce(v_cs.service_type,'Servis'),
      'form_no', coalesce(v_cs.form_number,''),
      'personel', coalesce(v_cs.technician,'—'),
      'makine', coalesce(v_cs.makine_tipi,''),
      'aciklama', coalesce(v_cs.description,'—'),
      'malzeme', coalesce(v_cs.materials_text,''),
      'tutar', coalesce(v_cs.price,0),
      'para_birimi', coalesce(v_cs.currency,'TRY')
    );
  end if;

  -- 2) SERVİS RAPORU
  if coalesce(p_kaynak,'') = 'rapor' then
    select * into v_sr from public.service_reports where id::text = p_id;
    if not found then return jsonb_build_object('ok', false, 'mesaj', 'Rapor bulunamadı.'); end if;

    if public.firma_eslestir(coalesce(public.jalan(to_jsonb(v_sr),'firma_adi'),''), v_h.firma_adi) < 75 then
      return jsonb_build_object('ok', false, 'mesaj', 'Bu rapor size ait değil.');
    end if;

    return jsonb_build_object(
      'ok', true, 'kaynak', 'rapor',
      'tarih', to_char(v_sr.created_at,'DD.MM.YYYY'),
      'tur', coalesce(public.jalan(to_jsonb(v_sr),'islem_turu'),'Servis'),
      'form_no', upper(left(v_sr.id::text,6)),
      'personel', coalesce(public.jalan(to_jsonb(v_sr),'personel_adi'),'—'),
      'makine', coalesce(public.jalan(to_jsonb(v_sr),'makine_tipi','vinc_tipi','makine'),''),
      'aciklama', coalesce(public.jalan(to_jsonb(v_sr),'arizanin_cinsi','ariza'),'—'),
      'yapilan_isler', coalesce(public.jalan(to_jsonb(v_sr),'yapilan_isler'),''),
      'malzeme', coalesce(public.jalan(to_jsonb(v_sr),'kullanilan_malzemeler','malzeme'),''),
      'tutar', 0,
      'para_birimi', 'TRY'
    );
  end if;

  -- 3) PERİYODİK BAKIM FORMU (madde madde kontrol listesi ile)
  if coalesce(p_kaynak,'') = 'bakim' then
    select * into v_bf from public.bakim_formlari where id::text = p_id;
    if not found then return jsonb_build_object('ok', false, 'mesaj', 'Form bulunamadı.'); end if;

    if public.firma_eslestir(coalesce(public.jalan(to_jsonb(v_bf),'musteri'),''), v_h.firma_adi) < 75 then
      return jsonb_build_object('ok', false, 'mesaj', 'Bu form size ait değil.');
    end if;

    return jsonb_build_object(
      'ok', true, 'kaynak', 'bakim',
      'tarih', to_char(v_bf.kontrol_tarihi,'DD.MM.YYYY'),
      'tur', case when v_bf.form_tipi = 'asansor' then 'Asansör Bakımı' else 'Vinç Bakımı' end,
      'form_no', coalesce(v_bf.seri_no,''),
      'personel', coalesce(v_bf.personel,'—'),
      'makine', coalesce(nullif(trim(coalesce(v_bf.makine_bilgileri->>'model','')), ''), coalesce(v_bf.seri_no,'')),
      'makine_bilgileri', coalesce(v_bf.makine_bilgileri, '{}'::jsonb),
      'aciklama', coalesce(v_bf.notlar, 'Periyodik bakım formu'),
      'onay', coalesce(v_bf.onay_sayisi,0),
      'ret', coalesce(v_bf.ret_sayisi,0),
      'maddeler', coalesce(v_bf.maddeler, '[]'::jsonb),
      'musteri_yorumu', coalesce(v_bf.musteri_yorumu,''),
      'tutar', 0,
      'para_birimi', 'TRY'
    );
  end if;

  return jsonb_build_object('ok', false, 'mesaj', 'Bilinmeyen kaynak.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_servis_detay(text, text, text) from public;
grant execute on function public.musteri_servis_detay(text, text, text) to anon, authenticated;


-- ─── 5) KONTROL (sonuçları göreceksin) ───
select
  public.firma_eslestir('KARESİ POLYESTER VE PETROKİMYA SANAYİ A.Ş.', 'RB KARESİ') as tam_unvan_eslesme,   -- 0
  public.firma_eslestir('KARESİ', 'RB KARESİ')                                   as hitap_eslesme,        -- 95
  (select count(*) from public.maintenance_contracts)                             as sozlesme_sayisi,
  (select count(*) from information_schema.routines
     where routine_schema = 'public'
       and routine_name in ('musteri_sozlesmem','musteri_bakim_takvimi',
                            'musteri_servislerim','musteri_servis_detay'))        as fonksiyon_sayisi;  -- 4
