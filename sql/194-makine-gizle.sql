-- ============================================================================
--  👁️ MAKİNE GİZLEME (Güncelleme #166)
-- ----------------------------------------------------------------------------
--  SORUN: TALEP/SİSTEM kaynaklı makineler düzenlenemiyor/silinemiyor
--         (musteri_vincler'de kayıt yok)
--
--  ÇÖZÜM: gizli=true kaydı ekle → listede görünmez
--         Kaynak veri (talep/sistem) SİLİNMEZ (muhasebe güvenli)
--
--  KULLANIM: 193'ten SONRA çalıştır.
-- ============================================================================

-- ─── 1) gizli kolonu ───
alter table public.musteri_vincler
  add column if not exists gizli boolean default false;

-- ─── 2) Admin: makineyi gizle ───
create or replace function public.admin_makine_gizle(p_hesap_id uuid, p_model text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_h record;
  v_id uuid;
begin
  select * into v_h from public.musteri_hesaplar where id = p_hesap_id;
  if v_h.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Hesap bulunamadı.'); end if;
  if coalesce(trim(p_model),'') = '' then return jsonb_build_object('ok', false, 'mesaj', 'Model boş.'); end if;

  -- Aynı model için kayıt var mı?
  select id into v_id from public.musteri_vincler
  where hesap_id = p_hesap_id
    and public.parca_adi_normal(model) = public.parca_adi_normal(p_model)
  limit 1;

  if v_id is not null then
    update public.musteri_vincler set gizli = true where id = v_id;
  else
    insert into public.musteri_vincler (hesap_id, musteri, model, durum, gizli)
    values (p_hesap_id, v_h.firma_adi, trim(p_model), 'onaylandi', true);
  end if;

  return jsonb_build_object('ok', true, 'mesaj', 'Makine listeden kaldırıldı.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.admin_makine_gizle(uuid, text) from public;
grant execute on function public.admin_makine_gizle(uuid, text) to authenticated;


-- ─── 3) Admin: makineyi geri göster ───
create or replace function public.admin_makine_goster(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.musteri_vincler set gizli = false where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'mesaj', 'Kayıt bulunamadı.'); end if;
  return jsonb_build_object('ok', true, 'mesaj', 'Makine geri getirildi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.admin_makine_goster(uuid) from public;
grant execute on function public.admin_makine_goster(uuid) to authenticated;


-- ─── 4) Her makineye düzenleme için kendi kaydı oluştur ───
create or replace function public.admin_makine_sahiplen(
  p_hesap_id uuid, p_model text,
  p_seri_no text default null, p_kapasite text default null
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
  select * into v_h from public.musteri_hesaplar where id = p_hesap_id;
  if v_h.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Hesap bulunamadı.'); end if;
  if coalesce(trim(p_model),'') = '' then return jsonb_build_object('ok', false, 'mesaj', 'Model boş.'); end if;

  select id into v_id from public.musteri_vincler
  where hesap_id = p_hesap_id
    and public.parca_adi_normal(model) = public.parca_adi_normal(p_model)
  limit 1;

  if v_id is not null then
    update public.musteri_vincler
       set model = trim(p_model),
           seri_no = coalesce(nullif(trim(coalesce(p_seri_no,'')),''), seri_no),
           kapasite = coalesce(nullif(trim(coalesce(p_kapasite,'')),''), kapasite),
           gizli = false
     where id = v_id;
  else
    insert into public.musteri_vincler (hesap_id, musteri, model, seri_no, kapasite, durum, gizli)
    values (p_hesap_id, v_h.firma_adi, trim(p_model),
            nullif(trim(coalesce(p_seri_no,'')),''), nullif(trim(coalesce(p_kapasite,'')),''),
            'onaylandi', false);
  end if;

  return jsonb_build_object('ok', true, 'mesaj', 'Makine güncellendi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.admin_makine_sahiplen(uuid, text, text, text) from public;
grant execute on function public.admin_makine_sahiplen(uuid, text, text, text) to authenticated;


-- ─── 5) musteri_detay_makineler: gizlileri HARİÇ + kendi_id her zaman ───
drop function if exists public.musteri_detay_makineler(uuid) cascade;

create function public.musteri_detay_makineler(p_hesap_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with hesap as (
    select firma_adi, telefon from public.musteri_hesaplar where id = p_hesap_id
  ),
  gizli_modeller as (
    select public.parca_adi_normal(model) as m
    from public.musteri_vincler
    where hesap_id = p_hesap_id and coalesce(gizli, false) = true
  ),
  hepsi as (
    -- KENDİ EKLEDİKLERİ
    select
      mv.model, coalesce(mv.seri_no,'') as seri_no, coalesce(mv.kapasite,'') as kapasite,
      mv.makine_tipi as tip, 'kendi'::text as kaynak, mv.id as kendi_id
    from public.musteri_vincler mv
    where mv.hesap_id = p_hesap_id and coalesce(mv.gizli, false) = false

    union all

    -- SİSTEM VİNÇLERİ
    select
      coalesce(public.jalan(to_jsonb(c),'model','makine_modeli'),'—'),
      coalesce(public.jalan(to_jsonb(c),'serial_number','seri_no'),''),
      coalesce(public.jalan(to_jsonb(c),'crane_capacity','kapasite'),''),
      coalesce(public.jalan(to_jsonb(c),'makine_tipi'),''),
      'sistem', null::uuid
    from public.cranes c, hesap h
    where public.firma_eslestir(
            coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),''), h.firma_adi) >= 75
       or public.temiz_telefon(
            coalesce(public.jalan(to_jsonb(c),'telefon','phone','musteri_telefon'),'')) like '%' || h.telefon || '%'

    union all

    -- TALEPLERDEN
    select
      public.jalan(to_jsonb(st),'manual_crane_info','vinc_bilgisi'),
      '', '', '', 'talep', null::uuid
    from public.service_tickets st, hesap h
    where (public.firma_eslestir(
             coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),''), h.firma_adi) >= 75
        or public.temiz_telefon(
             coalesce(public.jalan(to_jsonb(st),'manual_phone','telefon'),'')) like '%' || h.telefon || '%')
      and coalesce(public.jalan(to_jsonb(st),'manual_crane_info','vinc_bilgisi'),'') <> ''
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'model', model, 'seri_no', seri_no, 'kapasite', kapasite,
    'tip', tip, 'kaynak', kaynak, 'kendi_id', kendi_id
  )), '[]'::jsonb)
  from (
    select distinct on (public.parca_adi_normal(model))
      model, seri_no, kapasite, tip, kaynak, kendi_id
    from hepsi
    where coalesce(trim(model),'') not in ('','—')
      and public.parca_adi_normal(model) not in (select m from gizli_modeller)
    order by public.parca_adi_normal(model),
             case when kaynak = 'kendi' then 0 else 1 end
  ) t;
$$;

revoke all on function public.musteri_detay_makineler(uuid) from public;
grant execute on function public.musteri_detay_makineler(uuid) to authenticated;


-- ─── 6) TEST ───
select public.musteri_detay_makineler(
  (select id from public.musteri_hesaplar where durum='onaylandi' limit 1)
) as makineler;
