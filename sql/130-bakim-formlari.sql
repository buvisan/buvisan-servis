-- ============================================================================
--  📋 PERİYODİK BAKIM FORMLARI (Güncelleme #102)
-- ----------------------------------------------------------------------------
--  İKİ AYRI FORM:
--    1) VİNÇ PERİYODİK BAKIM FORMU     (5 grup, 27 madde)
--    2) YÜK PLATFORMU (ASANSÖR) FORMU  (13 genel + 16 durak + 2 diğer = 31)
--
--  ÖZELLİKLER:
--    • Her madde: RET / ONAY
--    • Müşteri adı + yetkili + imza
--    • Müşteri memnuniyeti (1-5)
--    • Personel imzası
--    • Otomatik seri no (VNC-YYYY-0001 / ASN-YYYY-0001)
--    • Bakım tarihi otomatik ilerletme
--    • DEVAM EDEN İŞ desteği (2. güncelleme)
--
--  KULLANIM: 129'dan SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 📋 bakim_formlari TABLOSU
-- ============================================================================
create table if not exists public.bakim_formlari (
  id                uuid primary key default gen_random_uuid(),
  seri_no           text unique,
  form_tipi         text not null,              -- 'vinc' | 'asansor'
  musteri           text,
  yetkili           text,
  telefon           text,
  adres             text,
  crane_id          uuid,
  randevu_id        uuid,
  ticket_id         uuid,
  personel          text,
  kontrol_tarihi    date default current_date,
  kontrol_saati     time,
  -- Makine bilgileri
  makine_bilgileri  jsonb default '{}'::jsonb,
  -- Maddeler: [{grup, madde, sonuc: 'onay'|'ret'|null, not}]
  maddeler          jsonb default '[]'::jsonb,
  -- Özet
  onay_sayisi       integer default 0,
  ret_sayisi        integer default 0,
  -- Müşteri
  musteri_puani     integer,
  musteri_yorumu    text,
  musteri_adi       text,
  musteri_imza      text,
  -- Personel
  personel_imza     text,
  notlar            text,
  -- İş durumu (2. güncelleme)
  is_durumu         text default 'bitti',       -- 'bitti' | 'devam_ediyor'
  devam_tarihi      date,
  hatirlatma_tarihi date,
  -- Meta
  created_at        timestamptz default now(),
  guncelleme        timestamptz default now()
);

alter table public.bakim_formlari enable row level security;

drop policy if exists "bakim_form_oku" on public.bakim_formlari;
create policy "bakim_form_oku" on public.bakim_formlari
  for select to authenticated using (true);

drop policy if exists "bakim_form_yaz" on public.bakim_formlari;
create policy "bakim_form_yaz" on public.bakim_formlari
  for all to authenticated using (true) with check (true);

create index if not exists idx_bakim_form_tipi on public.bakim_formlari(form_tipi);
create index if not exists idx_bakim_form_musteri on public.bakim_formlari(musteri);
create index if not exists idx_bakim_form_durum on public.bakim_formlari(is_durumu);
create index if not exists idx_bakim_form_tarih on public.bakim_formlari(kontrol_tarihi);


-- ============================================================================
-- 2) 🔢 SERİ NO ÜRETİCİ
-- ============================================================================
create or replace function public.bakim_seri_no(p_tipi text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onek text := case when p_tipi = 'asansor' then 'ASN' else 'VNC' end;
  v_yil text := to_char(current_date,'YYYY');
  v_sayac integer := 0;
  v_sonuc text;
begin
  begin
    select count(*) + 1 into v_sayac
    from public.bakim_formlari
    where form_tipi = p_tipi and to_char(created_at,'YYYY') = v_yil;
  exception when others then v_sayac := 1; end;

  v_sonuc := v_onek || '-' || v_yil || '-' || lpad(v_sayac::text, 4, '0');

  -- Çakışma varsa artır
  while exists (select 1 from public.bakim_formlari where seri_no = v_sonuc) loop
    v_sayac := v_sayac + 1;
    v_sonuc := v_onek || '-' || v_yil || '-' || lpad(v_sayac::text, 4, '0');
  end loop;

  return v_sonuc;
end $$;

revoke all on function public.bakim_seri_no(text) from public;
grant execute on function public.bakim_seri_no(text) to authenticated;


-- ============================================================================
-- 3) 📝 FORM KAYDET
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
  v_m record;
  v_ben text;
begin
  if p_tip not in ('vinc','asansor') then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçersiz form tipi.');
  end if;

  v_ben := coalesce(nullif(trim(p_personel),''), public.benim_adim());

  -- Madde sayımı
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
    notlar, is_durumu, devam_tarihi,
    hatirlatma_tarihi
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
    -- 1 GÜN SONRA HATIRLATMA (devam eden işler için)
    case when coalesce(p_is_durumu,'bitti') = 'devam_ediyor'
         then coalesce(p_devam_tarihi, current_date + 1)
         else null end
  ) returning id into v_id;

  -- ⭐ BAKIM TARİHİNİ İLERLET (iş bittiyse)
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
    'ok', true,
    'id', v_id,
    'seri_no', v_seri,
    'onay', v_onay, 'ret', v_ret,
    'is_durumu', coalesce(p_is_durumu,'bitti'),
    'mesaj', v_seri || ' numaralı form kaydedildi. ' ||
             v_onay || ' onay, ' || v_ret || ' ret.' ||
             case when coalesce(p_is_durumu,'bitti') = 'devam_ediyor'
                  then ' İş DEVAM EDİYOR olarak işaretlendi.' else '' end);
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.bakim_formu_kaydet(text,text,text,text,text,uuid,uuid,uuid,text,date,text,jsonb,jsonb,integer,text,text,text,text,text,text,date) from public;
grant execute on function public.bakim_formu_kaydet(text,text,text,text,text,uuid,uuid,uuid,text,date,text,jsonb,jsonb,integer,text,text,text,text,text,text,date) to authenticated;


-- ============================================================================
-- 4) 📋 FORM LİSTESİ
-- ============================================================================
create or replace function public.bakim_formlari_liste(
  p_tip text default null, p_limit integer default 50
)
returns table (
  id uuid, seri_no text, form_tipi text, musteri text, yetkili text,
  personel text, kontrol_tarihi text, onay_sayisi integer, ret_sayisi integer,
  musteri_puani integer, is_durumu text, devam_tarihi text, olusturma text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id, f.seri_no, f.form_tipi, f.musteri, f.yetkili,
    f.personel, to_char(f.kontrol_tarihi,'DD.MM.YYYY'),
    f.onay_sayisi, f.ret_sayisi, f.musteri_puani, f.is_durumu,
    case when f.devam_tarihi is not null then to_char(f.devam_tarihi,'DD.MM.YYYY') else null end,
    to_char(f.created_at,'DD.MM.YYYY HH24:MI')
  from public.bakim_formlari f
  where (p_tip is null or f.form_tipi = p_tip)
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit,50), 200));
$$;

revoke all on function public.bakim_formlari_liste(text, integer) from public;
grant execute on function public.bakim_formlari_liste(text, integer) to authenticated;


-- ============================================================================
-- 5) ⏸️ DEVAM EDEN İŞLER (1 gün hatırlatma)
-- ============================================================================
create or replace function public.devam_eden_isler()
returns table (
  id uuid, seri_no text, form_tipi text, musteri text, personel text,
  kontrol_tarihi text, devam_tarihi text, gun_gecti integer, acil boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id, f.seri_no, f.form_tipi, f.musteri, f.personel,
    to_char(f.kontrol_tarihi,'DD.MM.YYYY'),
    to_char(coalesce(f.devam_tarihi, f.hatirlatma_tarihi),'DD.MM.YYYY'),
    (current_date - coalesce(f.devam_tarihi, f.hatirlatma_tarihi, current_date))::int,
    (current_date >= coalesce(f.hatirlatma_tarihi, f.devam_tarihi, current_date + 1))
  from public.bakim_formlari f
  where f.is_durumu = 'devam_ediyor'
  order by coalesce(f.hatirlatma_tarihi, f.devam_tarihi) asc nulls last;
$$;

revoke all on function public.devam_eden_isler() from public;
grant execute on function public.devam_eden_isler() to authenticated;


-- ============================================================================
-- 6) ✅ İŞİ BİTİR / ⏸️ DEVAM ET
-- ============================================================================
create or replace function public.is_durumu_guncelle(
  p_form_id uuid,
  p_durum text,
  p_devam_tarihi date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_durum not in ('bitti','devam_ediyor') then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçersiz durum.');
  end if;

  update public.bakim_formlari
     set is_durumu = p_durum,
         devam_tarihi = case when p_durum = 'devam_ediyor'
                             then coalesce(p_devam_tarihi, current_date + 1) else null end,
         hatirlatma_tarihi = case when p_durum = 'devam_ediyor'
                                  then coalesce(p_devam_tarihi, current_date + 1) else null end,
         guncelleme = now()
   where id = p_form_id;

  if not found then
    return jsonb_build_object('ok', false, 'mesaj', 'Form bulunamadı.');
  end if;

  -- Bittiyse bakım tarihini ilerlet
  if p_durum = 'bitti' then
    begin
      update public.cranes c
         set next_maintenance_date =
               case when public.parca_adi_normal(coalesce(public.jalan(to_jsonb(c),'makine_tipi'),'')) like '%asansor%'
                    then current_date + interval '6 months'
                    else current_date + interval '12 months' end
       where public.parca_adi_normal(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),''))
             = (select public.parca_adi_normal(musteri) from public.bakim_formlari where id = p_form_id);
    exception when others then null; end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'mesaj', case when p_durum = 'bitti' then '✅ İş tamamlandı.'
                  else '⏸️ İş devam ediyor — 1 gün sonra hatırlatılacak.' end);
end $$;

revoke all on function public.is_durumu_guncelle(uuid, text, date) from public;
grant execute on function public.is_durumu_guncelle(uuid, text, date) to authenticated;


-- ============================================================================
-- 7) 🧪 TEST
-- ============================================================================
select public.bakim_seri_no('vinc')     as vinc_seri_no,
       public.bakim_seri_no('asansor')  as asansor_seri_no;

select count(*) as form_sayisi from public.bakim_formlari;
