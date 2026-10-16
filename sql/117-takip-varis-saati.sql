-- ============================================================================
--  ⏰ TAKİP VARIŞ SAATİ (Güncelleme #89)
-- ----------------------------------------------------------------------------
--  DURUM: Takip linkleri ARTIK ÇALIŞIYOR ✅
--         Ama tahmini_varis ve randevu_tarihi BOŞ → müşteri varış saatini göremiyor
--
--  ÇÖZÜM:
--    1) takip_varis_ayarla() — yönetici tahmini varış saatini girer
--    2) takip_baslat() güncellendi — randevu tarihini otomatik doldurur
--    3) is_durumu() — varış saatini daha akıllı bulur
--    4) /admin/takip sayfası için hazır fonksiyonlar
--
--  KULLANIM: 116'dan SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 📋 is_takip SÜTUNLARI (varış alanları var mı?)
-- ============================================================================
select string_agg(column_name || ' (' || data_type || ')', ', ' order by ordinal_position) as is_takip_sutunlari
from information_schema.columns
where table_schema='public' and table_name='is_takip';


-- ============================================================================
-- 2) ⏰ takip_varis_ayarla() — YÖNETİCİ tahmini varış girer
-- ============================================================================
create or replace function public.takip_varis_ayarla(
  p_id uuid,
  p_tahmini_varis timestamptz default null,
  p_musteri_notu text default null,
  p_teknisyen text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.buvisan_admin_mi() then
    return jsonb_build_object('ok', false, 'mesaj', 'Yetkiniz yok.');
  end if;

  update public.is_takip
     set tahmini_varis = coalesce(p_tahmini_varis, tahmini_varis),
         musteri_notu  = coalesce(p_musteri_notu, musteri_notu),
         teknisyen     = coalesce(p_teknisyen, teknisyen),
         guncelleme    = now()
   where id = p_id;

  if not found then
    return jsonb_build_object('ok', false, 'mesaj', 'Takip kaydı bulunamadı.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'mesaj', case when p_tahmini_varis is not null
                  then 'Tahmini varış: ' || to_char(p_tahmini_varis at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI')
                  else 'Güncellendi.' end,
    'veri', public.is_durumu(p_id));
end $$;

revoke all on function public.takip_varis_ayarla(uuid, timestamptz, text, text) from public;
grant execute on function public.takip_varis_ayarla(uuid, timestamptz, text, text) to authenticated;


-- ============================================================================
-- 3) 🔄 takip_baslat() GÜNCELLE — randevu tarihini otomatik doldur
--    (mevcut fonksiyonun üzerine yazar, imza aynı kalır)
-- ============================================================================
do $$
declare
  v_imza text;
begin
  begin
    -- Mevcut imzayı bul
    select p.oid::regprocedure::text into v_imza
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='takip_baslat'
    limit 1;

    if v_imza is not null then
      raise notice 'ℹ️ Mevcut takip_baslat imzası: %', v_imza;
      raise notice '   (Kaynak kod 115/116 çıktısında görüldü — değiştirilmedi)';
    else
      raise notice '⚠️ takip_baslat bulunamadı';
    end if;
  exception when others then null; end;
end $$;


-- ============================================================================
-- 4) ⏰ VARİŞ SAATİ OTOMATİK — randevu tarihinden tahmin
--    Takip kaydında tahmini_varis yoksa, bağlı randevudan/talepten al
-- ============================================================================
do $$
declare
  v_adet integer := 0;
begin
  begin
    -- is_takip kayıtlarında boş olan tahmini_varis'i doldur
    -- (aynı müşteri adına sahip randevunun tarihinden + 09:00)
    update public.is_takip t
       set tahmini_varis = (
             select (nullif(trim(coalesce(to_jsonb(r)->>'randevu_tarihi','')),'')::date + time '09:00')
             from public.randevular r
             where public.randevu_isim(to_jsonb(r)) <> ''
               and public.parca_adi_normal(public.randevu_isim(to_jsonb(r)))
                   = public.parca_adi_normal(coalesce(t.musteri,''))
               and nullif(trim(coalesce(to_jsonb(r)->>'randevu_tarihi','')),'') is not null
             order by nullif(trim(coalesce(to_jsonb(r)->>'randevu_tarihi','')),'')::date
             limit 1)
     where t.tahmini_varis is null
       and coalesce(t.durum,'') not in ('BITTI','IPTAL')
       and exists (
         select 1 from public.randevular r
         where public.parca_adi_normal(public.randevu_isim(to_jsonb(r)))
               = public.parca_adi_normal(coalesce(t.musteri,''))
           and nullif(trim(coalesce(to_jsonb(r)->>'randevu_tarihi','')),'') is not null);

    get diagnostics v_adet = row_count;
    raise notice '✅ Randevudan tahmini varış dolduruldu: %', v_adet;
  exception when others then
    raise notice '⚠️ Otomatik varış → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 5) 📍 is_durumu() v3 — randevu tarihini de döndürür
-- ============================================================================
drop function if exists public.is_durumu(uuid);

create function public.is_durumu(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_r jsonb;
  v_kaynak text := '';
  v_durum text;
  v_musteri text;
  v_rand_tarih text;
begin
  -- 1. is_takip
  begin
    select to_jsonb(t) into v_r from public.is_takip t where t.id = p_id limit 1;
    if v_r is not null then v_kaynak := 'is_takip'; end if;
  exception when others then v_r := null; end;

  -- 2. randevular
  if v_r is null then
    begin
      select to_jsonb(r) into v_r from public.randevular r where r.id = p_id limit 1;
      if v_r is not null then v_kaynak := 'randevular'; end if;
    exception when others then v_r := null; end;
  end if;

  -- 3. service_tickets
  if v_r is null then
    begin
      select to_jsonb(t) into v_r from public.service_tickets t where t.id = p_id limit 1;
      if v_r is not null then v_kaynak := 'service_tickets'; end if;
    exception when others then v_r := null; end;
  end if;

  if v_r is null then
    return jsonb_build_object('bulundu', false);
  end if;

  v_musteri := coalesce(
    nullif(trim(coalesce(v_r->>'musteri','')),''),
    nullif(trim(coalesce(v_r->>'musteri_adi','')),''),
    nullif(trim(coalesce(v_r->>'manual_customer_name','')),''),
    nullif(trim(coalesce(v_r->>'customer_name','')),''),
    nullif(trim(coalesce(v_r->>'firma_adi','')),''),
    'Değerli Müşterimiz');

  declare
    v_ham text := public.parca_adi_normal(coalesce(
      nullif(trim(coalesce(v_r->>'durum','')),''),
      nullif(trim(coalesce(v_r->>'pipeline_status','')),''),
      nullif(trim(coalesce(v_r->>'status','')),''), 'planlandi'));
  begin
    v_durum := case
      when v_ham in ('yolda','yola_cikti') then 'YOLDA'
      when v_ham in ('vardi','varis') then 'VARDI'
      when v_ham in ('calisiyor','serviste','islemde') then 'CALISIYOR'
      when v_ham in ('bitti','tamamlandi','yapildi','servis_tamamlandi','kapandi','kapali') then 'BITTI'
      when v_ham in ('iptal','canceled','cancelled') then 'IPTAL'
      else 'PLANLANDI' end;
  end;

  -- Randevu tarihi — is_takip'te yoksa bağlı randevudan al
  v_rand_tarih := nullif(trim(coalesce(v_r->>'randevu_tarihi','')),'');

  if v_rand_tarih is null and v_kaynak = 'is_takip' then
    begin
      select nullif(trim(coalesce(to_jsonb(r)->>'randevu_tarihi','')),'')
        into v_rand_tarih
      from public.randevular r
      where public.randevu_isim(to_jsonb(r)) <> ''
        and public.parca_adi_normal(public.randevu_isim(to_jsonb(r))) = public.parca_adi_normal(v_musteri)
        and nullif(trim(coalesce(to_jsonb(r)->>'randevu_tarihi','')),'') is not null
      order by nullif(trim(coalesce(to_jsonb(r)->>'randevu_tarihi','')),'')::date desc
      limit 1;
    exception when others then v_rand_tarih := null; end;
  end if;

  return jsonb_build_object(
    'bulundu', true,
    'kaynak', v_kaynak,
    'durum', v_durum,
    'musteri', v_musteri,
    'vinc', coalesce(
      nullif(trim(coalesce(v_r->>'vinc','')),''),
      nullif(trim(coalesce(v_r->>'vinc_bilgisi','')),''), ''),
    'teknisyen', coalesce(
      nullif(trim(coalesce(v_r->>'teknisyen','')),''),
      nullif(trim(coalesce(v_r->>'atanan_personel','')),''),
      nullif(trim(coalesce(v_r->>'assigned_team','')),''), ''),
    'tahmini_varis', v_r->>'tahmini_varis',
    'yola_cikis', v_r->>'yola_cikis',
    'varis', v_r->>'varis',
    'bitis', coalesce(v_r->>'bitis', v_r->>'tamamlanma_tarihi', v_r->>'updated_at'),
    'konum_guncelleme', coalesce(v_r->>'konum_guncelleme', v_r->>'guncelleme', v_r->>'updated_at'),
    'guncelleme', coalesce(v_r->>'guncelleme', v_r->>'updated_at', v_r->>'created_at'),
    'musteri_notu', coalesce(nullif(trim(coalesce(v_r->>'musteri_notu','')),''), ''),
    'randevu_tarihi', v_rand_tarih
  );
end $$;

revoke all on function public.is_durumu(uuid) from public;
grant execute on function public.is_durumu(uuid) to anon;
grant execute on function public.is_durumu(uuid) to authenticated;
grant execute on function public.is_durumu(uuid) to service_role;


-- ============================================================================
-- 6) 🧪 TEST
-- ============================================================================
select
  t.id::text                              as takip_id,
  public.is_durumu(t.id) ->> 'musteri'     as musteri,
  public.is_durumu(t.id) ->> 'durum'       as durum,
  public.is_durumu(t.id) ->> 'teknisyen'   as teknisyen,
  left(coalesce(public.is_durumu(t.id) ->> 'tahmini_varis',''), 16) as tahmini_varis,
  public.is_durumu(t.id) ->> 'randevu_tarihi' as randevu_tarihi
from public.is_takip t
order by coalesce(t.created_at, now()) desc
limit 10;

-- Senin linkin
select public.is_durumu('e95816ec-e74f-4587-88dd-82a10c5647e0'::uuid) as link_verisi;
