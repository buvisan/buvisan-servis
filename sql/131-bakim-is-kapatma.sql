-- ============================================================================
--  🔧 BAKIM FORMU: İŞ KAPATMA + PERSONEL FORMLARI (Güncelleme #103)
-- ----------------------------------------------------------------------------
--  SORUNLAR:
--    1) Bakım formu kaydedilince İŞ KAPANMIYOR (ticket/randevu açık kalıyor)
--    2) Personel kendi doldurduğu formları GÖREMİYOR
--    3) Admin "saha raporları"nda bakım formu görünmüyor
--
--  ÇÖZÜMLER:
--    1) bakim_formu_kaydet → bitti ise ticket + randevu kapat
--    2) benim_bakim_formlarim() → personelin kendi formları
--    3) saha_raporlari_birlesik() → service_reports + bakim_formlari birleşik
--
--  KULLANIM: 130'dan SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 🔧 bakim_formu_kaydet — İŞ KAPATMA EKLENDİ
-- ============================================================================
create or replace function public.bakim_formu_kaydet(
  p_tip text,
  p_musteri text default null,
  p_yetkili text default null,
  p_telefon text default null,
  p_adres text default null,
  p_crane_id uuid default null,
  p_randevu_id uuid default null,
  p_ticket_id uuid default null,
  p_personel text default null,
  p_kontrol_tarihi date default null,
  p_kontrol_saati text default null,
  p_makine_bilgileri jsonb default '{}'::jsonb,
  p_maddeler jsonb default '[]'::jsonb,
  p_musteri_puani integer default null,
  p_musteri_yorumu text default null,
  p_musteri_adi text default null,
  p_musteri_imza text default null,
  p_personel_imza text default null,
  p_notlar text default null,
  p_is_durumu text default 'bitti',
  p_devam_tarihi date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_seri text;
  v_onay integer := 0;
  v_ret integer := 0;
  v_ben text;
  v_ticket uuid := p_ticket_id;
  v_randevu uuid := p_randevu_id;
begin
  if p_tip not in ('vinc','asansor') then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçersiz form tipi.');
  end if;

  v_ben := coalesce(nullif(trim(p_personel),''), public.benim_adim());

  begin
    select
      count(*) filter (where (m->>'sonuc') = 'onay'),
      count(*) filter (where (m->>'sonuc') = 'ret')
    into v_onay, v_ret
    from jsonb_array_elements(
      case when jsonb_typeof(p_maddeler) = 'array' then p_maddeler else '[]'::jsonb end) m;
  exception when others then v_onay := 0; v_ret := 0; end;

  v_seri := public.bakim_seri_no(p_tip);

  insert into public.bakim_formlari (
    seri_no, form_tipi, musteri, yetkili, telefon, adres,
    crane_id, randevu_id, ticket_id, personel,
    kontrol_tarihi, kontrol_saati, makine_bilgileri, maddeler,
    onay_sayisi, ret_sayisi,
    musteri_puani, musteri_yorumu, musteri_adi, musteri_imza, personel_imza,
    notlar, is_durumu, devam_tarihi, hatirlatma_tarihi
  ) values (
    v_seri, p_tip, p_musteri, p_yetkili, p_telefon, p_adres,
    p_crane_id, p_randevu_id, p_ticket_id, v_ben,
    coalesce(p_kontrol_tarihi, current_date),
    nullif(trim(coalesce(p_kontrol_saati,'')),'')::time,
    coalesce(p_makine_bilgileri, '{}'::jsonb),
    coalesce(p_maddeler, '[]'::jsonb),
    v_onay, v_ret,
    p_musteri_puani, nullif(trim(coalesce(p_musteri_yorumu,'')),''),
    nullif(trim(coalesce(p_musteri_adi,'')),''), nullif(trim(coalesce(p_musteri_imza,'')),''),
    nullif(trim(coalesce(p_personel_imza,'')),''),
    nullif(trim(coalesce(p_notlar,'')),''),
    coalesce(p_is_durumu, 'bitti'),
    p_devam_tarihi,
    case when coalesce(p_is_durumu,'bitti') = 'devam_ediyor'
         then coalesce(p_devam_tarihi, current_date + 1) else null end
  ) returning id into v_id;

  -- ⭐ İŞ BİTTİYSE: TICKET + RANDEVU KAPAT
  if coalesce(p_is_durumu,'bitti') = 'bitti' then
    -- Ticket kapat
    if v_ticket is not null then
      begin
        update public.service_tickets
           set pipeline_status = 'tamamlandi', status = 'tamamlandi'
         where id = v_ticket;
      exception when others then null; end;
    end if;

    -- Randevu kapat
    begin
      if v_randevu is not null then
        update public.randevular set durum = 'yapildi' where id = v_randevu;
      elsif v_ticket is not null then
        update public.randevular set durum = 'yapildi' where ticket_id = v_ticket;
      end if;
    exception when others then null; end;
  end if;

  -- Bakım tarihini ilerlet (bittiyse)
  if coalesce(p_is_durumu,'bitti') = 'bitti' then
    begin
      if p_crane_id is not null then
        update public.cranes c
           set next_maintenance_date =
                 case when public.parca_adi_normal(coalesce(public.jalan(to_jsonb(c),'makine_tipi'),'')) like '%asansor%'
                      then current_date + interval '6 months'
                      else current_date + interval '12 months' end
         where c.id = p_crane_id;
      elsif p_musteri is not null then
        update public.cranes c
           set next_maintenance_date =
                 case when public.parca_adi_normal(coalesce(public.jalan(to_jsonb(c),'makine_tipi'),'')) like '%asansor%'
                      then current_date + interval '6 months'
                      else current_date + interval '12 months' end
         where public.parca_adi_normal(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),''))
               = public.parca_adi_normal(p_musteri);
      end if;
    exception when others then null; end;
  end if;

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'seri_no', v_seri,
    'onay', v_onay, 'ret', v_ret,
    'is_durumu', coalesce(p_is_durumu,'bitti'),
    'mesaj', v_seri || ' kaydedildi. ' || v_onay || ' onay, ' || v_ret || ' ret.' ||
             case when coalesce(p_is_durumu,'bitti') = 'bitti'
                  then ' ✅ İŞ TAMAMLANDI.' else ' ⏸️ İş DEVAM EDİYOR.' end);
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.bakim_formu_kaydet(text,text,text,text,text,uuid,uuid,uuid,text,date,text,jsonb,jsonb,integer,text,text,text,text,text,text,date) from public;
grant execute on function public.bakim_formu_kaydet(text,text,text,text,text,uuid,uuid,uuid,text,date,text,jsonb,jsonb,integer,text,text,text,text,text,text,date) to authenticated;


-- ============================================================================
-- 2) 👤 benim_bakim_formlarim() — personelin kendi formları
-- ============================================================================
create or replace function public.benim_bakim_formlarim(p_limit integer default 30)
returns table (
  id uuid, seri_no text, form_tipi text, musteri text,
  kontrol_tarihi text, onay_sayisi integer, ret_sayisi integer,
  musteri_puani integer, is_durumu text, olusturma text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id, f.seri_no, f.form_tipi, f.musteri,
    to_char(f.kontrol_tarihi,'DD.MM.YYYY'),
    f.onay_sayisi, f.ret_sayisi, f.musteri_puani, f.is_durumu,
    to_char(f.created_at,'DD.MM.YYYY HH24:MI')
  from public.bakim_formlari f
  where public.parca_adi_normal(coalesce(f.personel,'')) = public.parca_adi_normal(public.benim_adim())
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit,30), 100));
$$;

revoke all on function public.benim_bakim_formlarim(integer) from public;
grant execute on function public.benim_bakim_formlarim(integer) to authenticated;


-- ============================================================================
-- 3) 📊 saha_raporlari_birlesik() — admin için TÜM raporlar
-- ============================================================================
create or replace function public.saha_raporlari_birlesik(p_limit integer default 60)
returns table (
  kaynak text, id uuid, baslik text, musteri text, personel text,
  tarih text, tip text, ozet text, durum text
)
language sql
stable
security definer
set search_path = public
as $$
  -- SERVİS RAPORLARI
  select
    'servis'::text, sr.id,
    coalesce(nullif(public.jalan(to_jsonb(sr),'musteri_adi','customer_name'),''), 'Servis Raporu'),
    coalesce(nullif(public.jalan(to_jsonb(sr),'musteri_adi','customer_name'),''), '—'),
    coalesce(nullif(public.jalan(to_jsonb(sr),'personel','teknisyen','imza_atan'),''), '—'),
    to_char(sr.created_at,'DD.MM.YYYY HH24:MI'),
    coalesce(nullif(sr.service_type,''),'Servis'),
    left(coalesce(sr.description,''), 80),
    'tamamlandi'::text
  from public.service_reports sr

  union all

  -- BAKIM FORMLARI
  select
    'bakim'::text, f.id,
    f.seri_no || ' · ' || coalesce(f.form_tipi,''),
    coalesce(f.musteri,'—'),
    coalesce(f.personel,'—'),
    to_char(f.created_at,'DD.MM.YYYY HH24:MI'),
    case when f.form_tipi = 'asansor' then 'Asansör Bakım' else 'Vinç Bakım' end,
    (coalesce(f.onay_sayisi,0) || ' onay · ' || coalesce(f.ret_sayisi,0) || ' ret'),
    coalesce(f.is_durumu,'bitti')
  from public.bakim_formlari f

  order by 6 desc
  limit greatest(1, least(coalesce(p_limit,60), 200));
$$;

revoke all on function public.saha_raporlari_birlesik(integer) from public;
grant execute on function public.saha_raporlari_birlesik(integer) to authenticated;


-- ============================================================================
-- 4) 🧪 TEST
-- ============================================================================
select count(*) as bakim_formu_sayisi from public.bakim_formlari;
select count(*) as benim_formlarim from public.benim_bakim_formlarim();
select kaynak, count(*) from public.saha_raporlari_birlesik() group by kaynak;
