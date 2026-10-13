-- ============================================================================
--  🧊 GEÇMİŞ MAAŞ KORUMASI — SON PARÇA (Güncelleme #36) — KRİTİK
-- ----------------------------------------------------------------------------
--  DURUM:
--    • Dondurma ÇALIŞIYOR (puantaj_manuel'de kilitli aylar var) ✅
--    • AMA okuma fonksiyonu onu KULLANMIYOR ❌
--
--  SEBEP:
--    "Geçmiş ay → dondurulmuş değeri kullan" mantığı SQL 52'de yazılmıştı.
--    SQL 52 hata verip GERİ ALINDI → o düzeltme hiç uygulanmadı.
--    Şu an çalışan fonksiyon hâlâ "maaşı her zaman güncelden oku" diyor.
--
--  ÇÖZÜM:
--    1) personel_kazanc() düzeltilir:
--       GEÇMİŞ AY + dondurulmuş değer varsa → DONDURULMUŞ değer kullanılır
--       (bu ay ve sonrası → güncel maaş)
--    2) Eksik geçmiş aylar da dondurulur (eski puantajdaki tarihsel değerle)
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) EKSİK GEÇMİŞ AYLARI DONDUR (tarihsel değerle)
--    Veri olan ama kilitli olmayan aylar → kişinin eski puantajdaki maaşıyla kilitlenir
-- ============================================================================
do $$
declare
  v_eklenen integer := 0;
begin
  with tarihsel as (
    -- Her kişi için eski puantajdaki maaşlar
    select
      public.tr_buyuk(trim(p.value ->> 'ad'))          as personel,
      coalesce((p.value ->> 'maas')::numeric, 0)       as maas,
      pml.month_key,
      row_number() over (
        partition by public.tr_buyuk(trim(p.value ->> 'ad'))
        order by pml.month_key desc
      ) as sira
    from public.personnel_monthly_lists pml
    cross join lateral jsonb_array_elements(coalesce(pml.personnel_data, '[]'::jsonb)) p
    where coalesce(trim(p.value ->> 'ad'), '') <> ''
      and coalesce((p.value ->> 'maas')::numeric, 0) > 0
  ),
  son_tarihsel as (
    select personel, maas from tarihsel where sira = 1
  ),
  aktif_aylar as (
    -- Personelin veri olan TÜM geçmiş ayları
    select distinct
      public.tr_buyuk(g.personel) as personel,
      to_char(g.tarih, 'YYYY-MM') as ay
    from public.puantaj_gunluk g
    where to_char(g.tarih, 'YYYY-MM') < to_char(current_date, 'YYYY-MM')
    union
    select distinct
      public.tr_buyuk(cs.technician) as personel,
      to_char(cs.service_date, 'YYYY-MM') as ay
    from public.completed_services cs
    where coalesce(cs.technician, '') <> ''
      and to_char(cs.service_date, 'YYYY-MM') < to_char(current_date, 'YYYY-MM')
  )
  insert into public.puantaj_manuel (personel, ay, maas, aciklama)
  select
    a.personel,
    a.ay,
    coalesce(st.maas,
             (select pm.maas from public.personel_maas pm
               where public.parca_adi_normal(pm.personel) = public.parca_adi_normal(a.personel)),
             0),
    'Geçmiş maaş (kilitlendi)'
  from aktif_aylar a
  left join son_tarihsel st on public.parca_adi_normal(st.personel) = public.parca_adi_normal(a.personel)
  where coalesce(a.personel, '') <> ''
    and not exists (
      select 1 from public.puantaj_manuel m
      where public.parca_adi_normal(m.personel) = public.parca_adi_normal(a.personel)
        and m.ay = a.ay
    )
  on conflict (personel, ay) do nothing;

  get diagnostics v_eklenen = row_count;
  raise notice 'Kilitlenen geçmiş ay: %', v_eklenen;
end $$;


-- ============================================================================
-- 2) ⭐ KRİTİK DÜZELTME: GEÇMİŞ AY → DONDURULMUŞ MAAŞ
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

  -- Aylık kayıt (kilitli maaş + avans/kesinti/yemek/prim + eski mesai saatleri)
  select
    coalesce(max(maas), 0), coalesce(max(avans), 0), coalesce(max(kesinti), 0),
    coalesce(max(yemek), 0), coalesce(max(prim), 0),
    coalesce(max(mesai50_saat), 0), coalesce(max(mesai100_saat), 0)
  into v_maas_aylik, v_avans, v_kesinti, v_yemek, v_prim, v_m50_manuel, v_m100_manuel
  from public.puantaj_manuel
  where public.parca_adi_normal(personel) = public.parca_adi_normal(p_personel)
    and ay = v_ay;

  -- ⭐⭐⭐ MAAŞ SEÇİMİ ⭐⭐⭐
  --   GEÇMİŞ AY + kilitli değer varsa → KİLİTLİ değer (maaş güncellense bile DEĞİŞMEZ)
  --   Bu ay ve sonrası → GÜNCEL maaş
  if v_ay < v_bu_ay and v_maas_aylik > 0 then
    v_maas   := v_maas_aylik;
    v_kaynak := '🔒 kilitli (geçmiş ay)';
  else
    v_maas   := v_maas_guncel;
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
-- 3) KONTROL — hangi ay hangi maaşla kilitli?
-- ============================================================================
select
  m.ay,
  m.maas          as kilitli_maas,
  m.aciklama
from public.puantaj_manuel m
where public.parca_adi_normal(m.personel) = public.parca_adi_normal('KAYA ALİ TOSUN')
order by m.ay desc
limit 20;


-- ============================================================================
-- 4) KONTROL — güncel maaş + kilitli ay sayısı
-- ============================================================================
select
  pm.personel,
  pm.maas                                     as guncel_maas,
  (select count(*) from public.puantaj_manuel m
    where public.parca_adi_normal(m.personel) = public.parca_adi_normal(pm.personel)
      and m.maas > 0
      and m.ay < to_char(current_date, 'YYYY-MM'))  as kilitli_gecmis_ay
from public.personel_maas pm
where pm.aktif
order by pm.maas desc;
