-- ============================================================================
--  🧊 MAAŞ DONDURMA — GEÇMİŞ AYLAR DEĞİŞMEZ (Güncelleme #32) — KRİTİK
-- ----------------------------------------------------------------------------
--  SENİN SORUN:
--    "2027 Ocak'ta maaşları güncelledim, geçen aylardaki maaşı aynı yapmaz
--     değil mi, öyle bir hata almayız?"
--
--  CEVAP: ŞU ANKİ SİSTEMDE O HATA VARDI! ❌
--    personel_kazanc() maaşı her zaman personel_maas (GÜNCEL) tablosundan
--    okuyordu. Yani maaş değişince GEÇMİŞ aylar da değişiyordu.
--
--  ÇÖZÜM: MAAŞ DONDURMA (geçmiş kilitlenir)
--    1) Maaş güncellenmeden ÖNCE eski maaş, geçmiş aylara DONDURULUR
--       (puantaj_manuel tablosuna "o ayın maaşı" olarak yazılır)
--    2) Geçmiş bir ayın maaşı DONDURULMUŞSA → o değer kullanılır (değişmez)
--    3) Sadece dondurulmamış (yeni) aylar güncel maaşı kullanır
--
--  ÖRNEK:
--    Ocak 2027'de maaş 38.000 → 45.000 yapıldı
--      • Aralık 2026 → 38.000 (DONDURULDU, değişmez) ✅
--      • Ocak 2027   → 45.000 (yeni maaş) ✅
--
--  ⚠️ Veri silmez. Yeni sütun ekler + geçmişi dondurur.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) MAAŞIN GEÇERLİ OLDUĞU AY (hangi aydan itibaren geçerli)
-- ============================================================================
alter table public.personel_maas
  add column if not exists gecerli_ay text;

comment on column public.personel_maas.gecerli_ay is
  'Bu maaşın geçerli olduğu ilk ay (YYYY-MM). Boşsa tüm aylar için geçerli.';

-- Mevcut maaşlar: bu aydan itibaren geçerli say
update public.personel_maas
   set gecerli_ay = to_char(current_date, 'YYYY-MM')
 where coalesce(gecerli_ay, '') = '';


-- ============================================================================
-- 2) GEÇMİŞ AYLARI DONDUR (mevcut kayıtların olduğu tüm aylar)
-- ============================================================================
do $$
declare
  v_eklenen integer := 0;
begin
  -- Günlük puantaj kaydı olan her (personel, ay) için maaş dondur
  insert into public.puantaj_manuel (personel, ay, maas, aciklama)
  select distinct
    g.personel,
    to_char(g.tarih, 'YYYY-MM'),
    coalesce((select pm.maas from public.personel_maas pm
               where public.parca_adi_normal(pm.personel) = public.parca_adi_normal(g.personel)),
             0),
    'Maaş donduruldu (geçmiş ay)'
  from public.puantaj_gunluk g
  where not exists (
    select 1 from public.puantaj_manuel m
    where public.parca_adi_normal(m.personel) = public.parca_adi_normal(g.personel)
      and m.ay = to_char(g.tarih, 'YYYY-MM')
  );

  get diagnostics v_eklenen = row_count;
  raise notice 'Dondurulan (personel, ay) kaydı: %', v_eklenen;
end $$;


-- ============================================================================
-- 3) MAAŞ GÜNCELLE v2 — önce ESKİ maaşı geçmişe dondurur
-- ============================================================================
create or replace function public.maas_guncelle(
  p_personel   text,
  p_maas       numeric,
  p_kullanici  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eski       numeric := 0;
  v_eski_bas   text;
  v_bu_ay      text := to_char(current_date, 'YYYY-MM');
  v_dondurulan integer := 0;
begin
  if not public.buvisan_admin_mi() then
    return jsonb_build_object('yetki_yok', true, 'mesaj', 'Maaş güncellemek için yönetici girişi gerekir.');
  end if;

  if coalesce(trim(p_personel), '') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Personel adı gerekli.');
  end if;

  if coalesce(p_maas, -1) < 0 then
    return jsonb_build_object('ok', false, 'mesaj', 'Maaş negatif olamaz.');
  end if;

  -- Mevcut maaşı oku
  select coalesce(pm.maas, 0), coalesce(pm.gecerli_ay, v_bu_ay)
    into v_eski, v_eski_bas
  from public.personel_maas pm
  where public.parca_adi_normal(pm.personel) = public.parca_adi_normal(p_personel);

  -- ⭐ ESKİ MAAŞI GEÇMİŞ AYLARA DONDUR
  --    (eski maaşın geçerli olduğu aydan bu aya kadar olan aylar)
  if v_eski > 0 and v_eski <> p_maas then
    insert into public.puantaj_manuel (personel, ay, maas, aciklama)
    select
      p_personel,
      to_char(d, 'YYYY-MM'),
      v_eski,
      'Maaş donduruldu (' || to_char(v_eski, 'FM999G999G999') || ' ₺)'
    from generate_series(
      to_date(coalesce(v_eski_bas, v_bu_ay) || '-01', 'YYYY-MM-DD'),
      (to_date(v_bu_ay || '-01', 'YYYY-MM-DD') - interval '1 month'),
      interval '1 month'
    ) d
    on conflict (personel, ay) do nothing;

    get diagnostics v_dondurulan = row_count;
  end if;

  -- Yeni maaşı kaydet (bu aydan itibaren geçerli)
  insert into public.personel_maas (personel, maas, aktif, gecerli_ay, guncelleyen, guncelleme)
  values (trim(p_personel), p_maas, true, v_bu_ay, p_kullanici, now())
  on conflict (personel) do update
    set maas       = excluded.maas,
        aktif      = true,
        gecerli_ay = excluded.gecerli_ay,
        guncelleyen = excluded.guncelleyen,
        guncelleme = now();

  return jsonb_build_object(
    'ok', true,
    'eski_maas', v_eski,
    'yeni_maas', p_maas,
    'dondurulan_ay', v_dondurulan,
    'mesaj', trim(p_personel) || ' maaşı güncellendi: ' ||
             to_char(p_maas, 'FM999G999G999') || ' ₺'
             || case when v_dondurulan > 0
                     then ' (' || v_dondurulan || ' geçmiş ay eski maaşla donduruldu.)'
                     else '' end
  );
end;
$$;

revoke all on function public.maas_guncelle(text, numeric, text) from public;
grant execute on function public.maas_guncelle(text, numeric, text) to authenticated;


-- ============================================================================
-- 4) KAZANÇ MOTORU v4 — GEÇMİŞ AYIN MAAŞI ÖNCELİKLİ (dondurulmuş)
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
  v_ay          text := coalesce(p_ay, to_char(current_date, 'YYYY-MM'));
  v_bu_ay       text := to_char(current_date, 'YYYY-MM');
  v_maas_guncel numeric := 0;
  v_maas_aylik  numeric := 0;
  v_maas        numeric := 0;
  v_kaynak      text;
  v_normal      numeric := 0;
  v_m50         numeric := 0;
  v_m100        numeric := 0;
  v_m50_manuel  numeric := 0;
  v_m100_manuel numeric := 0;
  v_avans       numeric := 0;
  v_kesinti     numeric := 0;
  v_yemek       numeric := 0;
  v_prim        numeric := 0;
  v_gun_sayisi  integer := 0;
  v_izin_gun    integer := 0;
  v_saatlik     numeric;
  v_mesai_tutar numeric;
  v_is_sayisi   bigint := 0;
  v_ciro        numeric := 0;
  v_saat        numeric := 0;
  v_cmt         bigint := 0;
  v_paz         bigint := 0;
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

  -- Aylık kayıt (avans, kesinti, yemek, prim + DONDURULMUŞ maaş/mesai)
  select
    coalesce(max(maas), 0), coalesce(max(avans), 0), coalesce(max(kesinti), 0),
    coalesce(max(yemek), 0), coalesce(max(prim), 0),
    coalesce(max(mesai50_saat), 0), coalesce(max(mesai100_saat), 0)
  into v_maas_aylik, v_avans, v_kesinti, v_yemek, v_prim, v_m50_manuel, v_m100_manuel
  from public.puantaj_manuel
  where public.parca_adi_normal(personel) = public.parca_adi_normal(p_personel)
    and ay = v_ay;

  -- ⭐ MAAŞ SEÇİMİ:
  --   Geçmiş ay (bu aydan önce) ve dondurulmuş değer varsa → DONDURULMUŞ (değişmez)
  --   Aksi halde → GÜNCEL maaş
  if v_ay < v_bu_ay and v_maas_aylik > 0 then
    v_maas   := v_maas_aylik;
    v_kaynak := 'dondurulmuş (geçmiş ay)';
  else
    v_maas   := greatest(v_maas_guncel, v_maas_aylik);
    v_kaynak := 'güncel maaş';
  end if;

  if v_maas = 0 then v_maas := v_maas_guncel; end if;

  -- Günlük mesai kayıtları
  select
    count(*) filter (where not coalesce(g.izin_mi, false)),
    count(*) filter (where coalesce(g.izin_mi, false)),
    coalesce(sum(g.normal_saat), 0),
    coalesce(sum(g.mesai50_saat), 0),
    coalesce(sum(g.mesai100_saat), 0)
  into v_gun_sayisi, v_izin_gun, v_normal, v_m50, v_m100
  from public.puantaj_gunluk g
  where public.parca_adi_normal(g.personel) = public.parca_adi_normal(p_personel)
    and to_char(g.tarih, 'YYYY-MM') = v_ay;

  -- Günlük yoksa aylık kayıttan
  if v_m50 = 0 then v_m50 := v_m50_manuel; end if;
  if v_m100 = 0 then v_m100 := v_m100_manuel; end if;

  v_saatlik     := round(v_maas / 225.0, 2);
  v_mesai_tutar := round(v_saatlik * v_m50 * 1.5 + v_saatlik * v_m100 * 2.0, 2);

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
    'personel',       p_personel,
    'ay',             v_ay,
    'kayit_var',      (v_maas > 0 or v_m50 > 0 or v_m100 > 0 or v_gun_sayisi > 0),
    'maas',           v_maas,
    'maas_kaynagi',   v_kaynak,
    'saatlik_ucret',  v_saatlik,
    'normal_saat',    round(v_normal, 1),
    'gun_sayisi',     v_gun_sayisi,
    'izin_gun',       v_izin_gun,
    'mesai50_saat',   round(v_m50, 1),
    'mesai50_tutar',  round(v_saatlik * v_m50 * 1.5, 2),
    'mesai100_saat',  round(v_m100, 1),
    'mesai100_tutar', round(v_saatlik * v_m100 * 2.0, 2),
    'toplam_mesai',   v_mesai_tutar,
    'prim',           v_prim,
    'yemek',          v_yemek,
    'avans',          v_avans,
    'kesinti',        v_kesinti,
    'net_ele_gecen',  round(v_maas + v_mesai_tutar + v_prim + v_yemek - v_avans - v_kesinti, 2),
    'is_sayisi',      v_is_sayisi,
    'toplam_ciro',    round(v_ciro, 0),
    'calisma_saati',  v_saat,
    'cumartesi_is',   v_cmt,
    'pazar_is',       v_paz
  );
end;
$$;

revoke all on function public.personel_kazanc(text, text) from public;
grant execute on function public.personel_kazanc(text, text) to authenticated;


-- ============================================================================
-- 5) DONDURMA DURUMU (kim, hangi ay, hangi maaşla kilitli?)
-- ============================================================================
select
  m.personel,
  m.ay,
  m.maas                       as dondurulmus_maas,
  (select pm.maas from public.personel_maas pm
    where public.parca_adi_normal(pm.personel) = public.parca_adi_normal(m.personel)) as guncel_maas,
  case when m.maas = (select pm.maas from public.personel_maas pm
                       where public.parca_adi_normal(pm.personel) = public.parca_adi_normal(m.personel))
       then 'aynı' else '🔒 FARKLI (geçmiş korunuyor)' end as durum
from public.puantaj_manuel m
where m.maas > 0
order by m.ay desc, m.personel
limit 30;
