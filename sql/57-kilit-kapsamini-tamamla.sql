-- ============================================================================
--  🔒 KİLİT KAPSAMINI TAMAMLA (Güncelleme #37)
-- ----------------------------------------------------------------------------
--  SENİN TESPİTİN:
--    "Bazı isimlerde 'geçmiş ay — kilitli' yazmıyor, bazılarında yazıyor"
--
--  DURUM:
--    • Rozet sadece o ay KİLİTLİ kayıt varsa görünür → bu normal
--    • AMA kilitsiz geçmiş aylar güncel maaştan okunur → maaş değişirse DEĞİŞİR
--    • Yani kilit kapsamı EKSİK → tamamlanmalı
--
--  EKSİKLİĞİN SEBEBİ:
--    İş kayıtlarındaki teknisyen alanı şöyle: "GÖKHAN GÖK - KERİM AKDOĞAN"
--    (iki isim birlikte). Bu birleşik metin hiçbir personelle eşleşmiyordu
--    → o aylar kilitlenmemiş.
--
--  ÇÖZÜM:
--    Teknisyen metni PARÇALANIR ve her isim ayrı ayrı eşleştirilir.
--    Böylece veri olan TÜM geçmiş aylar kilitlenir.
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) EKSİK GEÇMİŞ AYLARI KİLİTLE (teknisyen adını parçalayarak)
-- ============================================================================
do $$
declare
  v_eklenen integer := 0;
begin
  with
  -- Her personelin "tarihsel maaşı" (eski puantajdaki en son değer)
  tarihsel as (
    select distinct on (public.tr_buyuk(trim(p.value ->> 'ad')))
      public.tr_buyuk(trim(p.value ->> 'ad'))    as personel,
      coalesce((p.value ->> 'maas')::numeric, 0) as maas
    from public.personnel_monthly_lists pml
    cross join lateral jsonb_array_elements(coalesce(pml.personnel_data, '[]'::jsonb)) p
    where coalesce(trim(p.value ->> 'ad'), '') <> ''
      and coalesce((p.value ->> 'maas')::numeric, 0) > 0
    order by public.tr_buyuk(trim(p.value ->> 'ad')), pml.month_key desc
  ),
  -- Veri olan TÜM (personel, geçmiş ay) çiftleri
  aylar as (
    -- Günlük mesai kayıtlarından
    select distinct
      g.personel,
      to_char(g.tarih, 'YYYY-MM') as ay
    from public.puantaj_gunluk g
    where to_char(g.tarih, 'YYYY-MM') < to_char(current_date, 'YYYY-MM')

    union

    -- İş kayıtlarından: teknisyen metni PARÇALANIR ("A - B" → A, B)
    select distinct
      public.personel_eslestir(trim(parca)) as personel,
      to_char(cs.service_date, 'YYYY-MM')   as ay
    from public.completed_services cs
    cross join lateral unnest(string_to_array(coalesce(cs.technician, ''), '-')) as parca
    where coalesce(trim(parca), '') <> ''
      and to_char(cs.service_date, 'YYYY-MM') < to_char(current_date, 'YYYY-MM')
      and public.personel_eslestir(trim(parca)) is not null
  )
  insert into public.puantaj_manuel (personel, ay, maas, aciklama)
  select
    a.personel,
    a.ay,
    coalesce(
      t.maas,
      (select pm.maas from public.personel_maas pm
        where public.parca_adi_normal(pm.personel) = public.parca_adi_normal(a.personel)),
      0
    ),
    'Geçmiş maaş (kilitlendi)'
  from aylar a
  left join tarihsel t on public.parca_adi_normal(t.personel) = public.parca_adi_normal(a.personel)
  where coalesce(a.personel, '') <> ''
    and coalesce(a.ay, '') <> ''
    and not exists (
      select 1 from public.puantaj_manuel m
      where public.parca_adi_normal(m.personel) = public.parca_adi_normal(a.personel)
        and m.ay = a.ay
    )
  on conflict (personel, ay) do nothing;

  get diagnostics v_eklenen = row_count;
  raise notice 'Yeni kilitlenen (personel, ay): %', v_eklenen;
end $$;


-- ============================================================================
-- 2) KONTROL — her personel kaç ay kilitli, kaç ayda verisi var?
-- ============================================================================
with veri_aylari as (
  select public.tr_buyuk(personel) as personel, to_char(tarih, 'YYYY-MM') as ay
  from public.puantaj_gunluk
  where to_char(tarih, 'YYYY-MM') < to_char(current_date, 'YYYY-MM')
  union
  select distinct public.personel_eslestir(trim(parca)), to_char(cs.service_date, 'YYYY-MM')
  from public.completed_services cs
  cross join lateral unnest(string_to_array(coalesce(cs.technician, ''), '-')) as parca
  where coalesce(trim(parca), '') <> ''
    and to_char(cs.service_date, 'YYYY-MM') < to_char(current_date, 'YYYY-MM')
    and public.personel_eslestir(trim(parca)) is not null
)
select
  pm.personel,
  pm.maas                                                     as guncel_maas,
  (select count(distinct v.ay) from veri_aylari v
    where public.parca_adi_normal(v.personel) = public.parca_adi_normal(pm.personel)) as veri_olan_gecmis_ay,
  (select count(*) from public.puantaj_manuel m
    where public.parca_adi_normal(m.personel) = public.parca_adi_normal(pm.personel)
      and m.maas > 0
      and m.ay < to_char(current_date, 'YYYY-MM'))            as kilitli_gecmis_ay,
  case when (select count(distinct v.ay) from veri_aylari v
              where public.parca_adi_normal(v.personel) = public.parca_adi_normal(pm.personel))
          <=
          (select count(*) from public.puantaj_manuel m
            where public.parca_adi_normal(m.personel) = public.parca_adi_normal(pm.personel)
              and m.maas > 0
              and m.ay < to_char(current_date, 'YYYY-MM'))
       then '✅ TAM KORUMA' else '⚠️ Eksik ay var' end     as koruma_durumu
from public.personel_maas pm
where pm.aktif
order by pm.maas desc;
