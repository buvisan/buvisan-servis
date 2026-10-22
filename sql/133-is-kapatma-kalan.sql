-- ============================================================================
--  🔧 İŞ KAPATMA + PERSONEL FORMLARI (Güncelleme #105)
-- ----------------------------------------------------------------------------
--  SQL 131 hata verince geri alınmıştı → bu 2 fonksiyon UYGULANMADI
--
--  1) bakim_formu_kaydet → İŞ KAPATMA (ticket + randevu)
--  2) benim_bakim_formlarim → personelin kendi formları
--
--  KULLANIM: 132'den SONRA çalıştır. Hata vermez.
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
    if p_ticket_id is not null then
      begin
        update public.service_tickets
           set pipeline_status = 'tamamlandi', status = 'tamamlandi'
         where id = p_ticket_id;
      exception when others then null; end;
    end if;

    begin
      if p_randevu_id is not null then
        update public.randevular set durum = 'yapildi' where id = p_randevu_id;
      elsif p_ticket_id is not null then
        update public.randevular set durum = 'yapildi' where ticket_id = p_ticket_id;
      end if;
    exception when others then null; end;

    -- Bakım tarihini ilerlet
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
     or public.benim_adim() is null
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit,30), 100));
$$;

revoke all on function public.benim_bakim_formlarim(integer) from public;
grant execute on function public.benim_bakim_formlarim(integer) to authenticated;


-- ============================================================================
-- 🧪 TEST
-- ============================================================================
select
  count(*) as toplam_form,
  (select count(*) from public.benim_bakim_formlarim()) as benim_formlarim
from public.bakim_formlari;

-- Form durumları
select coalesce(is_durumu,'bitti') as durum, count(*) as adet
from public.bakim_formlari group by 1;
