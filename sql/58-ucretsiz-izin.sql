-- ============================================================================
--  💸 ÜCRETSİZ İZİN + OTOMATİK MAAŞ KESİNTİSİ (Güncelleme #38)
-- ----------------------------------------------------------------------------
--  SENİN İSTEĞİN:
--    "Ücretsiz izin seçeneği ekle → seçince maaştan otomatik düşsün
--     (maaş ÷ 30 × gün)"
--
--  MANTIK:
--    • Personel izin talebi gönderirken ÜCRETLİ / ÜCRETSİZ seçer
--    • ÜCRETLİ   → maaştan DÜŞMEZ (yıllık izin, yasal hak) ✅
--    • ÜCRETSİZ  → maaştan DÜŞER: (maaş ÷ 30) × gün sayısı ✅
--
--  ⚠️ Yeni sütun ekler. Mevcut veriye dokunmaz (eskiler "ücretli" sayılır).
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) YENİ SÜTUNLAR
-- ============================================================================
alter table public.personel_talepler
  add column if not exists ucretli boolean default true;

alter table public.puantaj_gunluk
  add column if not exists ucretsiz_izin boolean default false;

comment on column public.personel_talepler.ucretli is 'İzin ücretli mi? true=ücretli (kesilmez), false=ücretsiz (kesilir)';
comment on column public.puantaj_gunluk.ucretsiz_izin is 'Ücretsiz izin günü mü? true ise maaştan kesilir';


-- ============================================================================
-- 2) TALEP GÖNDER v2 — ücretli/ücretsiz seçimi
-- ============================================================================
drop function if exists public.talep_gonder(text, text, text, numeric, date, date, text);

create or replace function public.talep_gonder(
  p_talep_tipi text,
  p_baslik     text default null,
  p_aciklama   text default null,
  p_tutar      numeric default null,
  p_baslangic  date default null,
  p_bitis      date default null,
  p_oncelik    text default 'NORMAL',
  p_ucretli    boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ben text := public.benim_adim();
  v_id  uuid;
begin
  if coalesce(trim(v_ben), '') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Kimliğiniz bulunamadı, tekrar giriş yapın.');
  end if;

  if p_talep_tipi not in ('IZIN','AVANS','MALZEME','ARIZA') then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçersiz talep tipi.');
  end if;

  if coalesce(trim(p_baslik), '') = '' and coalesce(trim(p_aciklama), '') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Konu veya açıklama girin.');
  end if;

  insert into public.personel_talepler
    (personel, talep_tipi, baslik, aciklama, tutar, baslangic, bitis, oncelik, ucretli)
  values
    (v_ben, p_talep_tipi, p_baslik, p_aciklama, p_tutar, p_baslangic, p_bitis,
     coalesce(p_oncelik, 'NORMAL'), coalesce(p_ucretli, true))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'mesaj', 'Talebiniz gönderildi.');
end;
$$;

revoke all on function public.talep_gonder(text, text, text, numeric, date, date, text, boolean) from public;
grant execute on function public.talep_gonder(text, text, text, numeric, date, date, text, boolean) to authenticated;


-- ============================================================================
-- 3) TALEP CEVAPLA v2 — onaylanınca izin günleri işaretlenir (ücretli bilgisiyle)
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
  v_tip     text;
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

  -- ⭐ İZİN ONAYLANDIYSA → puantaja işle (ücretli bilgisiyle)
  if p_durum = 'ONAYLANDI'
     and v_talep.talep_tipi = 'IZIN'
     and v_talep.baslangic is not null then

    v_tip := case when coalesce(v_talep.ucretli, true) then 'Ücretli izin' else 'ÜCRETSİZ izin' end;

    v_gun := v_talep.baslangic;
    while v_gun <= coalesce(v_talep.bitis, v_talep.baslangic) loop
      insert into public.puantaj_gunluk
        (personel, tarih, normal_saat, mesai50_saat, mesai100_saat,
         izin_mi, ucretsiz_izin, aciklama, olusturan)
      values
        (v_talep.personel, v_gun, 0, 0, 0,
         true, not coalesce(v_talep.ucretli, true),
         'Onaylı ' || v_tip || case when p_not is not null then ' · ' || p_not else '' end,
         public.benim_adim())
      on conflict (personel, tarih) do update
        set izin_mi = true,
            ucretsiz_izin = not coalesce(v_talep.ucretli, true),
            normal_saat = 0, mesai50_saat = 0, mesai100_saat = 0;

      v_eklenen := v_eklenen + 1;
      v_gun := v_gun + 1;
    end loop;
  end if;

  -- Reddedildiyse izin işaretini kaldır
  if v_talep.talep_tipi = 'IZIN' and p_durum = 'REDDEDILDI' and v_talep.baslangic is not null then
    update public.puantaj_gunluk
       set izin_mi = false, ucretsiz_izin = false
     where public.parca_adi_normal(personel) = public.parca_adi_normal(v_talep.personel)
       and tarih between v_talep.baslangic and coalesce(v_talep.bitis, v_talep.baslangic)
       and coalesce(aciklama, '') like 'Onaylı %izin%';
  end if;

  return jsonb_build_object(
    'ok', true,
    'mesaj', 'Talep ' || lower(p_durum) || '.'
             || case when v_eklenen > 0
                     then ' (' || v_eklenen || ' gün ' || lower(coalesce(v_tip, 'izin')) || ' puantaja işlendi.)'
                     else '' end,
    'izin_gun', v_eklenen
  );
end;
$$;

revoke all on function public.talep_cevapla(uuid, text, text) from public;
grant execute on function public.talep_cevapla(uuid, text, text) to authenticated;


-- ============================================================================
-- 4) KAZANÇ MOTORU v5 — ÜCRETSİZ İZİN KESİNTİSİ
--    Kesinti = (maaş ÷ 30) × ücretsiz izin günü
-- ============================================================================
create or replace function public.personel_kazanc(
  p_personel text,
  p_ay       text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ay            text := coalesce(p_ay, to_char(current_date, 'YYYY-MM'));
  v_bu_ay         text := to_char(current_date, 'YYYY-MM');
  v_maas_guncel   numeric := 0;
  v_maas_aylik    numeric := 0;
  v_maas          numeric := 0;
  v_kaynak        text;
  v_normal        numeric := 0;
  v_m50           numeric := 0;
  v_m100          numeric := 0;
  v_m50_manuel    numeric := 0;
  v_m100_manuel   numeric := 0;
  v_avans         numeric := 0;
  v_kesinti       numeric := 0;
  v_yemek         numeric := 0;
  v_prim          numeric := 0;
  v_gun_sayisi    integer := 0;
  v_izin_gun      integer := 0;
  v_ucretsiz_gun  integer := 0;
  v_izin_kesinti  numeric := 0;
  v_saatlik       numeric;
  v_mesai_tutar   numeric;
  v_is_sayisi     bigint := 0;
  v_ciro          numeric := 0;
  v_saat          numeric := 0;
  v_cmt           bigint := 0;
  v_paz           bigint := 0;
begin
  if not (
    public.buvisan_admin_mi()
    or public.parca_adi_normal(p_personel) = public.parca_adi_normal(public.benim_adim())
  ) then
    return jsonb_build_object('yetki_yok', true, 'mesaj', 'Sadece kendi kazanç bilginizi görebilirsiniz.');
  end if;

  -- Güncel maaş
  select coalesce(max(pm.maas), 0) into v_maas_guncel
  from public.personel_maas pm
  where public.parca_adi_normal(pm.personel) = public.parca_adi_normal(p_personel);

  -- Aylık kayıt
  select
    coalesce(max(maas), 0), coalesce(max(avans), 0), coalesce(max(kesinti), 0),
    coalesce(max(yemek), 0), coalesce(max(prim), 0),
    coalesce(max(mesai50_saat), 0), coalesce(max(mesai100_saat), 0)
  into v_maas_aylik, v_avans, v_kesinti, v_yemek, v_prim, v_m50_manuel, v_m100_manuel
  from public.puantaj_manuel
  where public.parca_adi_normal(personel) = public.parca_adi_normal(p_personel)
    and ay = v_ay;

  -- MAAŞ SEÇİMİ: geçmiş ay + kilitli değer → kilitli (değişmez)
  if v_ay < v_bu_ay and v_maas_aylik > 0 then
    v_maas   := v_maas_aylik;
    v_kaynak := '🔒 kilitli (geçmiş ay)';
  else
    v_maas   := v_maas_guncel;
    v_kaynak := 'güncel maaş';
  end if;

  if v_maas = 0 then v_maas := v_maas_guncel; end if;

  -- Günlük kayıtlar (izin günleri ayrı sayılır)
  select
    count(*) filter (where not coalesce(g.izin_mi, false)),
    count(*) filter (where coalesce(g.izin_mi, false)),
    count(*) filter (where coalesce(g.izin_mi, false) and coalesce(g.ucretsiz_izin, false)),
    coalesce(sum(g.normal_saat), 0),
    coalesce(sum(g.mesai50_saat), 0),
    coalesce(sum(g.mesai100_saat), 0)
  into v_gun_sayisi, v_izin_gun, v_ucretsiz_gun, v_normal, v_m50, v_m100
  from public.puantaj_gunluk g
  where public.parca_adi_normal(g.personel) = public.parca_adi_normal(p_personel)
    and to_char(g.tarih, 'YYYY-MM') = v_ay;

  if v_m50 = 0 then v_m50 := v_m50_manuel; end if;
  if v_m100 = 0 then v_m100 := v_m100_manuel; end if;

  v_saatlik     := round(v_maas / 225.0, 2);
  v_mesai_tutar := round(v_saatlik * v_m50 * 1.5 + v_saatlik * v_m100 * 2.0, 2);

  -- ⭐ ÜCRETSİZ İZİN KESİNTİSİ: (maaş ÷ 30) × gün
  v_izin_kesinti := round((v_maas / 30.0) * v_ucretsiz_gun, 2);

  select
    count(*), coalesce(sum(cs.price), 0), coalesce(sum(cs.work_hours), 0),
    count(*) filter (where extract(dow from cs.service_date) = 6),
    count(*) filter (where extract(dow from cs.service_date) = 0)
  into v_is_sayisi, v_ciro, v_saat, v_cmt, v_paz
  from public.completed_services cs
  where to_char(cs.service_date, 'YYYY-MM') = v_ay
    and coalesce(cs.technician, '') <> ''
    and public.parca_adi_normal(cs.technician) like '%' || public.parca_adi_normal(p_personel) || '%';

  return jsonb_build_object(
    'personel',          p_personel,
    'ay',                v_ay,
    'kayit_var',         (v_maas > 0 or v_m50 > 0 or v_m100 > 0 or v_gun_sayisi > 0),
    'maas',              v_maas,
    'maas_kaynagi',      v_kaynak,
    'saatlik_ucret',     v_saatlik,
    'normal_saat',       round(v_normal, 1),
    'gun_sayisi',        v_gun_sayisi,
    'izin_gun',          v_izin_gun,
    'ucretsiz_izin_gun', v_ucretsiz_gun,
    'izin_kesintisi',    v_izin_kesinti,
    'gunluk_kesinti',    round(v_maas / 30.0, 2),
    'mesai50_saat',      round(v_m50, 1),
    'mesai50_tutar',     round(v_saatlik * v_m50 * 1.5, 2),
    'mesai100_saat',     round(v_m100, 1),
    'mesai100_tutar',    round(v_saatlik * v_m100 * 2.0, 2),
    'toplam_mesai',      v_mesai_tutar,
    'prim',              v_prim,
    'yemek',             v_yemek,
    'avans',             v_avans,
    'kesinti',           v_kesinti,
    'toplam_kesinti',    round(v_kesinti + v_izin_kesinti, 2),
    'net_ele_gecen',     round(v_maas + v_mesai_tutar + v_prim + v_yemek
                               - v_avans - v_kesinti - v_izin_kesinti, 2),
    'is_sayisi',         v_is_sayisi,
    'toplam_ciro',       round(v_ciro, 0),
    'calisma_saati',     v_saat,
    'cumartesi_is',      v_cmt,
    'pazar_is',          v_paz
  );
end;
$$;

revoke all on function public.personel_kazanc(text, text) from public;
grant execute on function public.personel_kazanc(text, text) to authenticated;


-- ============================================================================
-- 5) KONTROL
-- ============================================================================
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='personel_talepler' and column_name='ucretli')     as talep_ucretli,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='puantaj_gunluk' and column_name='ucretsiz_izin')  as puantaj_ucretsiz,
  (select count(*) from public.puantaj_gunluk where izin_mi)          as izin_gun_toplam,
  (select count(*) from public.puantaj_gunluk where ucretsiz_izin)    as ucretsiz_gun_toplam;

-- Örnek hesap: 38.000 ₺ maaş, 3 gün ücretsiz izin
select
  round(38000 / 30.0, 2)            as gunluk_ucret,
  round((38000 / 30.0) * 3, 2)      as uc_gun_kesinti,
  round(38000 - ((38000 / 30.0) * 3), 2) as kalan_maas;
