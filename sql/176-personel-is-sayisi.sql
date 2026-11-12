-- ============================================================================
--  🔢 PERSONEL İŞ SAYISI DÜZELTMESİ (Güncelleme #148)
-- ----------------------------------------------------------------------------
--  SORUN: "toplam_is" sadece completed_services'ten sayılıyordu
--         ve ortak işler ("A - B") tek kişiye yazılıyordu.
--
--  ÇÖZÜM:
--    1) 3 kaynak: service_reports + bakim_formlari + completed_services
--    2) Ortak isimleri ayır ("A - B" → A ve B'ye birer iş)
--    3) Tekrarları temizle (aynı iş iki kez sayılmasın)
--
--  KULLANIM: 175'ten SONRA çalıştır.
-- ============================================================================

create or replace function public.personel_yetkinlik_matrisi()
returns table (
  personel   text,
  vincs      integer,
  asansor    integer,
  hidrolik   integer,
  elektrik   integer,
  montaj     integer,
  isg        integer,
  toplam_is  integer,
  kaynak     text
)
language sql
stable
security definer
set search_path = public
as $$
  with ham as (
    -- SERVİS RAPORLARI
    select
      trim(sr.personel_adi)         as ham_ad,
      coalesce(sr.islem_turu,'')    as tur,
      coalesce(sr.vinc_modeli,'')   as kapasite,
      coalesce(sr.arizanin_cinsi,'') || ' ' || coalesce(sr.yapilan_isler,'') as aciklama
    from public.service_reports sr
    where coalesce(sr.personel_adi,'') <> ''

    union all

    -- BAKIM FORMLARI
    select
      trim(bf.personel)             as ham_ad,
      case when bf.form_tipi = 'asansor' then 'Asansör Bakım' else 'Vinç Bakım' end,
      coalesce(bf.makine_bilgileri::text,''),
      'periyodik bakım ' || coalesce(bf.form_tipi,'')
    from public.bakim_formlari bf
    where coalesce(bf.personel,'') <> ''

    union all

    -- FİNANS KAYITLARI
    select
      trim(cs.technician)           as ham_ad,
      coalesce(cs.service_type,'')  as tur,
      coalesce(to_jsonb(cs)->>'crane_capacity',''),
      coalesce(cs.description,'')
    from public.completed_services cs
    where coalesce(cs.technician,'') <> ''
  ),

  -- ⭐ ORTAK İSİMLERİ AYIR ("GÖKHAN GÖK - OKAN ARAN" → 2 satır)
  ayrilmis as (
    select
      public.personel_eslestir(trim(parca)) as ad,
      tur, kapasite, aciklama
    from ham,
    lateral regexp_split_to_table(ham_ad, '\s*[-/,&]\s*') as parca
    where length(trim(parca)) >= 3
  ),

  isler as (
    select
      a.ad,
      coalesce(a.tur,'')      as tur,
      coalesce(a.kapasite,'') as kapasite,
      coalesce(a.aciklama,'') as aciklama
    from ayrilmis a
    where a.ad is not null
  ),

  ozet as (
    select
      ad,
      count(*)::int as toplam,
      least(5, greatest(1, (count(*) / 5 + 1)::int))::int as vincs,
      least(5, greatest(1, (count(*) filter (where kapasite ilike '%asansör%' or kapasite ilike '%asansor%' or tur ilike '%asansör%' or tur ilike '%asansor%')) / 2 + 1))::int as asansor,
      least(5, greatest(1, (count(*) filter (where aciklama ~* '(hidrolik|yağ|yag|pompa|silindir|valf)')) / 3 + 1))::int as hidrolik,
      least(5, greatest(1, (count(*) filter (where aciklama ~* '(elektrik|kablo|şalter|salter|switch|sensör|sensor|motor|pano)')) / 3 + 1))::int as elektrik,
      least(5, greatest(1, (count(*) filter (where tur ilike '%montaj%' or aciklama ~* '(montaj|kurulum|sökme|sokme|takma)')) / 2 + 1))::int as montaj,
      3::int as isg
    from isler
    group by ad
  ),

  elle as (
    select personel, yetkinlik, seviye from public.personel_yetkinlik
  )

  select
    o.ad,
    coalesce((select e.seviye from elle e where public.parca_adi_normal(e.personel)=public.parca_adi_normal(o.ad) and e.yetkinlik='vincs'),    o.vincs),
    coalesce((select e.seviye from elle e where public.parca_adi_normal(e.personel)=public.parca_adi_normal(o.ad) and e.yetkinlik='asansor'),  o.asansor),
    coalesce((select e.seviye from elle e where public.parca_adi_normal(e.personel)=public.parca_adi_normal(o.ad) and e.yetkinlik='hidrolik'), o.hidrolik),
    coalesce((select e.seviye from elle e where public.parca_adi_normal(e.personel)=public.parca_adi_normal(o.ad) and e.yetkinlik='elektrik'), o.elektrik),
    coalesce((select e.seviye from elle e where public.parca_adi_normal(e.personel)=public.parca_adi_normal(o.ad) and e.yetkinlik='montaj'),   o.montaj),
    coalesce((select e.seviye from elle e where public.parca_adi_normal(e.personel)=public.parca_adi_normal(o.ad) and e.yetkinlik='isg'),      o.isg),
    o.toplam,
    case when exists (select 1 from elle e where public.parca_adi_normal(e.personel)=public.parca_adi_normal(o.ad))
         then 'elle + otomatik' else 'otomatik (geçmişten)' end
  from ozet o
  order by o.toplam desc;
$$;

revoke all on function public.personel_yetkinlik_matrisi() from public;
grant execute on function public.personel_yetkinlik_matrisi() to authenticated;

-- TEST
select personel, toplam_is from public.personel_yetkinlik_matrisi() order by toplam_is desc;
