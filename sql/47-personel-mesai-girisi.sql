-- ============================================================================
--  ⏱️ PERSONEL KENDİ MESAİSİNİ GİRER + İZİN OTOMATİK İŞLENİR (Güncelleme #26)
-- ----------------------------------------------------------------------------
--  SENİN İSTEĞİN:
--    1) Personel kendi ekranından giriş/çıkış saatini girsin
--       → /admin/puantaj sayfasına OTOMATİK yansısın
--    2) İzin talebi ONAYLANIRSA puantaja izin olarak işlensin
--
--  KURALLAR (senin sistemin):
--    • Hafta içi 08:00-18:00 → normal saat
--    • Cumartesi → %50 mesai   ·   Pazar → %100 mesai  (OTOMATİK)
--
--  ⚠️ Personel SADECE kendi kaydını girebilir/değiştirebilir (RLS + fonksiyon).
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) PERSONEL KENDİ MESAİSİNİ GİRER (sadece kendisi için)
-- ============================================================================
create or replace function public.benim_mesaim_ekle(
  p_tarih    date,
  p_saat     numeric,
  p_aciklama text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ben   text := public.benim_adim();
  v_gun   integer;
  v_normal numeric := 0;
  v_m50   numeric := 0;
  v_m100  numeric := 0;
  v_tip   text;
begin
  if coalesce(trim(v_ben), '') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Kimliğiniz bulunamadı, tekrar giriş yapın.');
  end if;

  if p_tarih is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Tarih seçin.');
  end if;

  if p_tarih > current_date then
    return jsonb_build_object('ok', false, 'mesaj', 'Gelecek bir tarihe mesai girilemez.');
  end if;

  if coalesce(p_saat, 0) < 0 or coalesce(p_saat, 0) > 16 then
    return jsonb_build_object('ok', false, 'mesaj', 'Saat 0 ile 16 arasında olmalı.');
  end if;

  v_gun := extract(dow from p_tarih)::int;

  if v_gun = 6 then
    v_m50 := p_saat;  v_tip := 'CUMARTESİ (%50 mesai)';
  elsif v_gun = 0 then
    v_m100 := p_saat; v_tip := 'PAZAR (%100 mesai)';
  else
    v_normal := p_saat; v_tip := 'HAFTA İÇİ (normal)';
  end if;

  insert into public.puantaj_gunluk
    (personel, tarih, normal_saat, mesai50_saat, mesai100_saat, aciklama, olusturan)
  values
    (v_ben, p_tarih, v_normal, v_m50, v_m100, p_aciklama, v_ben)
  on conflict (personel, tarih) do update
    set normal_saat   = excluded.normal_saat,
        mesai50_saat  = excluded.mesai50_saat,
        mesai100_saat = excluded.mesai100_saat,
        aciklama      = excluded.aciklama;

  return jsonb_build_object(
    'ok', true,
    'gun_tipi', v_tip,
    'mesaj', to_char(p_tarih, 'DD.MM.YYYY') || ' · ' || v_tip || ' · ' || coalesce(p_saat, 0) || ' saat kaydedildi.'
  );
end;
$$;

revoke all on function public.benim_mesaim_ekle(date, numeric, text) from public;
grant execute on function public.benim_mesaim_ekle(date, numeric, text) to authenticated;


-- ============================================================================
-- 2) PERSONEL KENDİ MESAİLERİNİ GÖRÜR
-- ============================================================================
create or replace function public.benim_mesailerim(p_ay text default null)
returns table (
  tarih         date,
  gun_adi       text,
  normal_saat   numeric,
  mesai50_saat  numeric,
  mesai100_saat numeric,
  izin_mi       boolean,
  aciklama      text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.tarih,
    case extract(dow from g.tarih)
      when 0 then 'Pazar' when 1 then 'Pazartesi' when 2 then 'Salı'
      when 3 then 'Çarşamba' when 4 then 'Perşembe' when 5 then 'Cuma'
      else 'Cumartesi' end,
    g.normal_saat, g.mesai50_saat, g.mesai100_saat, g.izin_mi, g.aciklama
  from public.puantaj_gunluk g
  where public.parca_adi_normal(g.personel) = public.parca_adi_normal(public.benim_adim())
    and (p_ay is null or to_char(g.tarih, 'YYYY-MM') = p_ay)
  order by g.tarih desc
  limit 40;
$$;

revoke all on function public.benim_mesailerim(text) from public;
grant execute on function public.benim_mesailerim(text) to authenticated;


-- ============================================================================
-- 3) İZİN ONAYLANINCA PUANTAJA OTOMATİK İŞLENİR
-- ============================================================================
create or replace function public.talep_cevapla(
  p_id     uuid,
  p_durum  text,
  p_not    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_talep   record;
  v_gun     date;
  v_eklenen integer := 0;
begin
  if not public.buvisan_admin_mi() then
    return jsonb_build_object('yetki_yok', true, 'mesaj', 'Talebi sadece yönetici cevaplayabilir.');
  end if;

  if p_durum not in ('ONAYLANDI','REDDEDILDI','BEKLEMEDE') then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçersiz durum.');
  end if;

  select * into v_talep from public.personel_talepler where id = p_id;
  if v_talep.id is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Talep bulunamadı.');
  end if;

  update public.personel_talepler
     set durum = p_durum,
         yonetici_notu = p_not,
         cevaplayan = public.benim_adim(),
         cevap_tarihi = now()
   where id = p_id;

  -- ⭐ İZİN ONAYLANDIYSA → puantaja izin günleri işlenir
  if p_durum = 'ONAYLANDI'
     and v_talep.talep_tipi = 'IZIN'
     and v_talep.baslangic is not null then

    v_gun := v_talep.baslangic;
    while v_gun <= coalesce(v_talep.bitis, v_talep.baslangic) loop
      insert into public.puantaj_gunluk
        (personel, tarih, normal_saat, mesai50_saat, mesai100_saat, izin_mi, aciklama, olusturan)
      values
        (v_talep.personel, v_gun, 0, 0, 0, true,
         'Onaylı izin' || case when p_not is not null then ' · ' || p_not else '' end,
         public.benim_adim())
      on conflict (personel, tarih) do update
        set izin_mi = true,
            normal_saat = 0, mesai50_saat = 0, mesai100_saat = 0;

      v_eklenen := v_eklenen + 1;
      v_gun := v_gun + 1;
    end loop;
  end if;

  -- İzin reddedildiyse / geri alındıysa izin işaretini kaldır
  if v_talep.talep_tipi = 'IZIN' and p_durum = 'REDDEDILDI' and v_talep.baslangic is not null then
    update public.puantaj_gunluk
       set izin_mi = false
     where public.parca_adi_normal(personel) = public.parca_adi_normal(v_talep.personel)
       and tarih between v_talep.baslangic and coalesce(v_talep.bitis, v_talep.baslangic)
       and coalesce(aciklama, '') like 'Onaylı izin%';
  end if;

  return jsonb_build_object(
    'ok', true,
    'mesaj', 'Talep ' || lower(p_durum) || '.'
             || case when v_eklenen > 0 then ' (' || v_eklenen || ' gün izin puantaja işlendi.)' else '' end,
    'izin_gun', v_eklenen
  );
end;
$$;

revoke all on function public.talep_cevapla(uuid, text, text) from public;
grant execute on function public.talep_cevapla(uuid, text, text) to authenticated;


-- ============================================================================
-- 4) KONTROL
-- ============================================================================
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('benim_mesaim_ekle','benim_mesailerim','talep_cevapla'))  as fonksiyonlar,
  (select count(*) from public.puantaj_gunluk)                  as gunluk_kayit,
  (select count(*) from public.puantaj_gunluk where izin_mi)    as izin_kaydi;
