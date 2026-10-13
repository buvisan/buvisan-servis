-- ============================================================================
--  💰 PERSONEL KAZANÇ MOTORU (Güncelleme #20)
-- ----------------------------------------------------------------------------
--  SENİN BİLGİN:
--    • Prim YOK — personel hafta içi 08:00-18:00 çalışır
--    • Hafta sonu çalışılırsa: CUMARTESİ %50, PAZAR %100 mesai yazılır
--
--  MEVCUT VERİ (puantaj sisteminizde zaten var!):
--    personnel_monthly_lists.personnel_data içinde her kişi için:
--      maas · mesai50_saat · mesai100_saat · avans · kesinti · yemek · prim
--
--  BU SCRIPT:
--    personel_kazanc(personel, ay) → kişinin aylık kazanç dökümünü çıkarır
--
--  ⚠️ Veri değiştirmez. Sadece okur ve hesaplar.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) SAATLİK ÜCRET (aylık maaş ÷ 225 saat = 45 saat × 5 hafta)
-- ============================================================================
create or replace function public.saatlik_ucret(p_maas numeric)
returns numeric
language sql
immutable
as $$
  select round(coalesce(p_maas, 0) / 225.0, 2);
$$;


-- ============================================================================
-- 2) PERSONEL KAZANÇ DÖKÜMÜ
-- ============================================================================
create or replace function public.personel_kazanc(
  p_personel text,
  p_ay       text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with sec as (
    select coalesce(p_ay, to_char(current_date, 'YYYY-MM')) as ay
  ),
  kayit as (
    select p.value as veri
    from public.personnel_monthly_lists pml
    cross join sec
    cross join lateral jsonb_array_elements(coalesce(pml.personnel_data, '[]'::jsonb)) p
    where pml.month_key = sec.ay
      and public.parca_adi_normal(p.value ->> 'ad') = public.parca_adi_normal(p_personel)
    limit 1
  ),
  isler as (
    select
      count(*)                                  as adet,
      coalesce(sum(cs.price), 0)                as ciro,
      coalesce(sum(cs.work_hours), 0)           as saat,
      count(*) filter (where extract(dow from cs.service_date) = 6) as cumartesi_is,
      count(*) filter (where extract(dow from cs.service_date) = 0) as pazar_is
    from public.completed_services cs
    cross join sec
    where to_char(cs.service_date, 'YYYY-MM') = sec.ay
      and coalesce(cs.technician, '') <> ''
      and public.parca_adi_normal(cs.technician) like '%' || public.parca_adi_normal(p_personel) || '%'
  ),
  h as (
    select
      coalesce((select (veri ->> 'maas')::numeric from kayit), 0)           as maas,
      coalesce((select (veri ->> 'mesai50_saat')::numeric from kayit), 0)   as m50_saat,
      coalesce((select (veri ->> 'mesai100_saat')::numeric from kayit), 0)  as m100_saat,
      coalesce((select (veri ->> 'avans')::numeric from kayit), 0)          as avans,
      coalesce((select (veri ->> 'kesinti')::numeric from kayit), 0)        as kesinti,
      coalesce((select (veri ->> 'yemek')::numeric from kayit), 0)          as yemek,
      coalesce((select (veri ->> 'prim')::numeric from kayit), 0)           as prim,
      coalesce((select (veri ->> 'eksik_saat')::numeric from kayit), 0)     as eksik_saat,
      (select count(*) from kayit)                                          as kayit_var
  ),
  hesap as (
    select
      h.*,
      public.saatlik_ucret(h.maas)                          as saatlik,
      round(public.saatlik_ucret(h.maas) * h.m50_saat * 1.5, 2)  as m50_tutar,
      round(public.saatlik_ucret(h.maas) * h.m100_saat * 2.0, 2) as m100_tutar
    from h
  )
  select jsonb_build_object(
    'personel',       p_personel,
    'ay',             (select ay from sec),
    'kayit_var',      (h.kayit_var > 0),
    'maas',           h.maas,
    'saatlik_ucret',  h.saatlik,
    'mesai50_saat',   h.m50_saat,
    'mesai50_tutar',  h.m50_tutar,
    'mesai100_saat',  h.m100_saat,
    'mesai100_tutar', h.m100_tutar,
    'toplam_mesai',   round(h.m50_tutar + h.m100_tutar, 2),
    'prim',           h.prim,
    'yemek',          h.yemek,
    'avans',          h.avans,
    'kesinti',        h.kesinti,
    'eksik_saat',     h.eksik_saat,
    'net_ele_gecen',  round(h.maas + h.m50_tutar + h.m100_tutar + h.prim + h.yemek - h.avans - h.kesinti, 2),
    -- İş istatistikleri
    'is_sayisi',      (select adet from isler),
    'toplam_ciro',    round((select ciro from isler), 0),
    'calisma_saati',  (select saat from isler),
    'cumartesi_is',   (select cumartesi_is from isler),
    'pazar_is',       (select pazar_is from isler)
  )
  from hesap h;
$$;

revoke all on function public.personel_kazanc(text, text) from public;
grant execute on function public.personel_kazanc(text, text) to authenticated;


-- ============================================================================
-- 3) TÜM PERSONEL KARŞILAŞTIRMA (yönetim görünümü)
-- ============================================================================
create or replace function public.personel_kazanc_listesi(p_ay text default null)
returns table (
  personel        text,
  maas            numeric,
  mesai50_saat    numeric,
  mesai100_saat   numeric,
  toplam_mesai    numeric,
  avans           numeric,
  kesinti         numeric,
  net_ele_gecen   numeric,
  is_sayisi       bigint,
  toplam_ciro     numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with sec as (select coalesce(p_ay, to_char(current_date, 'YYYY-MM')) as ay),
  kisiler as (
    select distinct (p.value ->> 'ad') as ad
    from public.personnel_monthly_lists pml
    cross join sec
    cross join lateral jsonb_array_elements(coalesce(pml.personnel_data, '[]'::jsonb)) p
    where pml.month_key = sec.ay and coalesce(trim(p.value ->> 'ad'), '') <> ''
  )
  select
    k.ad,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'maas')::numeric,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'mesai50_saat')::numeric,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'mesai100_saat')::numeric,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'toplam_mesai')::numeric,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'avans')::numeric,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'kesinti')::numeric,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'net_ele_gecen')::numeric,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'is_sayisi')::bigint,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'toplam_ciro')::numeric
  from kisiler k
  order by (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'net_ele_gecen')::numeric desc;
$$;

revoke all on function public.personel_kazanc_listesi(text) from public;
grant execute on function public.personel_kazanc_listesi(text) to authenticated;


-- ============================================================================
-- 4) KONTROL — bu ayın kazanç dökümü
-- ============================================================================
select personel, maas, mesai50_saat, mesai100_saat, toplam_mesai, net_ele_gecen, is_sayisi, toplam_ciro
from public.personel_kazanc_listesi();

-- Örnek tek kişi dökümü
select jsonb_pretty(public.personel_kazanc(
  coalesce((select personel from public.personel_kazanc_listesi() limit 1), 'KAYA ALİ TOSUN')
)) as ornek_dokum;
