-- ============================================================================
--  🏆 FAZ 4 — PERFORMANS KARNESİ + YETKİNLİK MATRİSİ + SKOR TABLOSU
-- ----------------------------------------------------------------------------
--  NE YAPAR?
--    1) personel_yetkinlik tablosu   → kim hangi işi yapabilir (elle + otomatik)
--    2) personel_yetkinlik_matrisi() → yetkinlik tablosu (geçmişten öğrenir)
--    3) personel_karnesi()           → tek personelin detaylı karnesi
--    4) personel_siralama()          → aylık sıralama (madalyalı)
--    5) gunluk_skor_tablosu()        → bugünün canlı performansı
--
--  YETKİNLİK NASIL BELİRLENİR?
--    • OTOMATİK: Geçmiş işlerinden öğrenilir (asansör işi yaptıysa ✅)
--    • ELLE: personel_yetkinlik tablosuna yazılır (elle işaret üstün gelir)
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) YETKİNLİK TABLOSU (elle işaretleme için)
-- ============================================================================
create table if not exists public.personel_yetkinlik (
  id          uuid primary key default gen_random_uuid(),
  personel    text not null,
  yetkinlik   text not null,          -- vincs | asansor | hidrolik | elektrik | montaj | isg
  seviye      integer default 3,      -- 1=başlangıç 2=orta 3=iyi 4=uzman 5=usta
  elle        boolean default true,   -- elle mi işaretlendi
  not_        text,
  guncelleme  timestamptz default now(),
  unique (personel, yetkinlik)
);

alter table public.personel_yetkinlik enable row level security;

drop policy if exists personel_yetkinlik_admin on public.personel_yetkinlik;
create policy personel_yetkinlik_admin on public.personel_yetkinlik
  for all to authenticated
  using (public.buvisan_admin_mi())
  with check (public.buvisan_admin_mi());


create or replace function public.yetkinlik_ayarla(
  p_personel  text,
  p_yetkinlik text,
  p_seviye    integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad text;
begin
  if not public.buvisan_admin_mi() then
    return jsonb_build_object('yetki_yok', true, 'mesaj', 'Sadece yönetici düzenleyebilir.');
  end if;

  v_ad := coalesce(public.personel_eslestir(p_personel), public.tr_buyuk(trim(p_personel)));

  insert into public.personel_yetkinlik (personel, yetkinlik, seviye, elle, guncelleme)
  values (v_ad, lower(trim(p_yetkinlik)), greatest(1, least(5, coalesce(p_seviye,3))), true, now())
  on conflict (personel, yetkinlik) do update
    set seviye = excluded.seviye, elle = true, guncelleme = now();

  return jsonb_build_object('ok', true, 'mesaj', v_ad || ' · ' || p_yetkinlik || ' → seviye ' || coalesce(p_seviye,3));
end $$;

revoke all on function public.yetkinlik_ayarla(text, text, integer) from public;
grant execute on function public.yetkinlik_ayarla(text, text, integer) to authenticated;


-- ============================================================================
-- 2) 🎓 YETKİNLİK MATRİSİ — geçmişten öğrenir + elle işareti birleştirir
-- ============================================================================
drop function if exists public.personel_yetkinlik_matrisi();

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
  with isler as (
    select
      public.personel_eslestir(trim(cs.technician)) as ad,
      coalesce(cs.service_type,'')                  as tur,
      coalesce(to_jsonb(cs)->>'crane_capacity','')  as kapasite,
      coalesce(cs.description,'')                   as aciklama
    from public.completed_services cs
    where coalesce(cs.technician,'') <> ''
      and public.personel_eslestir(trim(cs.technician)) is not null
  ),
  ozet as (
    select
      ad,
      count(*)::int as toplam,
      -- Her iş türü için 1-5 arası seviye (iş sayısına göre)
      least(5, greatest(1, (count(*) filter (where true)) / 5 + 1))::int as vincs,
      least(5, greatest(1, (count(*) filter (where kapasite ilike '%asansör%' or kapasite ilike '%asansor%' or tur ilike '%asansör%')) / 2 + 1))::int as asansor,
      least(5, greatest(1, (count(*) filter (where aciklama ~* '(hidrolik|yağ|pompa|silindir|valf)')) / 3 + 1))::int as hidrolik,
      least(5, greatest(1, (count(*) filter (where aciklama ~* '(elektrik|kablo|şalter|switch|sensör|motor|pano)')) / 3 + 1))::int as elektrik,
      least(5, greatest(1, (count(*) filter (where tur ilike '%montaj%' or aciklama ~* '(montaj|kurulum|sökme|takma)')) / 2 + 1))::int as montaj,
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


-- ============================================================================
-- 3) 🏆 PERSONEL KARNESİ — tek kişinin detaylı performansı
-- ============================================================================
create or replace function public.personel_karnesi(
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
  v_ay        text := coalesce(p_ay, to_char(current_date, 'YYYY-MM'));
  v_ad        text;
  v_is        integer := 0;
  v_ciro      numeric := 0;
  v_saat      numeric := 0;
  v_ort_sure  numeric := 0;
  v_puan      numeric;
  v_yorumlu   integer := 0;
  v_toplam_rpr integer := 0;
  v_rapor_kayit integer := 0;
  v_isg_ok    integer := 0;
  v_isg_top   integer := 0;
  v_mesai_gun integer := 0;
  v_izin_gun  integer := 0;
  v_trend     jsonb := '[]'::jsonb;
  v_isler     jsonb := '[]'::jsonb;
  v_siralama  integer := 0;
  v_toplam_kisi integer := 0;
  v_ortalama_ciro numeric := 0;
  v_perf      numeric := 0;
begin
  v_ad := coalesce(public.personel_eslestir(p_personel), public.tr_buyuk(trim(p_personel)));

  -- İş istatistikleri
  begin
    select count(*), coalesce(sum(cs.price),0), coalesce(sum(cs.work_hours),0)
      into v_is, v_ciro, v_saat
    from public.completed_services cs
    where to_char(cs.service_date::date, 'YYYY-MM') = v_ay
      and coalesce(cs.technician,'') <> ''
      and public.parca_adi_normal(cs.technician) like '%' || public.parca_adi_normal(v_ad) || '%';
    v_ort_sure := case when v_is > 0 then round(v_saat / v_is, 1) else 0 end;
  exception when others then null; end;

  -- Memnuniyet puanı
  begin
    select round(avg(r.musteri_puani),1), count(*) filter (where coalesce(r.musteri_yorumu,'') <> '')
      into v_puan, v_yorumlu
    from public.service_reports r
    where r.musteri_puani is not null
      and to_char(r.created_at, 'YYYY-MM') = v_ay;
  exception when others then null; end;

  -- Rapor düzeni: kaç işe rapor girilmiş?
  begin
    select count(*) into v_rapor_kayit
    from public.service_reports r
    where to_char(r.created_at, 'YYYY-MM') = v_ay;
    select count(*) into v_toplam_rpr
    from public.completed_services cs
    where to_char(cs.service_date::date, 'YYYY-MM') = v_ay
      and coalesce(cs.technician,'') <> ''
      and public.parca_adi_normal(cs.technician) like '%' || public.parca_adi_normal(v_ad) || '%';
  exception when others then null; end;

  -- İSG uyumu
  begin
    select
      count(*) filter (where jsonb_array_length(coalesce(r.isg_kontrol,'[]'::jsonb)) > 0
                         and not exists (
                           select 1 from jsonb_array_elements(r.isg_kontrol) x
                           where coalesce((x->>'tamam')::boolean, false) = false)),
      count(*) filter (where jsonb_array_length(coalesce(r.isg_kontrol,'[]'::jsonb)) > 0)
    into v_isg_ok, v_isg_top
    from public.service_reports r
    where to_char(r.created_at, 'YYYY-MM') = v_ay;
  exception when others then null; end;

  -- Puantaj
  begin
    select count(*) filter (where not coalesce(g.izin_mi,false)),
           count(*) filter (where coalesce(g.izin_mi,false))
      into v_mesai_gun, v_izin_gun
    from public.puantaj_gunluk g
    where public.parca_adi_normal(g.personel) = public.parca_adi_normal(v_ad)
      and to_char(g.tarih, 'YYYY-MM') = v_ay;
  exception when others then null; end;

  -- 6 AYLIK TREND
  begin
    select coalesce(jsonb_agg(jsonb_build_object('ay', ay, 'ciro', ciro, 'is', adet) order by ay), '[]'::jsonb)
      into v_trend
    from (
      select to_char(d, 'YYYY-MM') as ay,
             coalesce(sum(cs.price),0) as ciro,
             count(cs.id) as adet
      from generate_series(
             (to_date(v_ay || '-01','YYYY-MM-DD') - interval '5 months'),
             to_date(v_ay || '-01','YYYY-MM-DD'),
             interval '1 month') d
      left join public.completed_services cs
        on to_char(cs.service_date::date,'YYYY-MM') = to_char(d,'YYYY-MM')
       and coalesce(cs.technician,'') <> ''
       and public.parca_adi_normal(cs.technician) like '%' || public.parca_adi_normal(v_ad) || '%'
      group by to_char(d,'YYYY-MM')
    ) t;
  exception when others then v_trend := '[]'::jsonb; end;

  -- SON İŞLER
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'tarih', to_char(tarih,'DD.MM.YYYY'), 'musteri', musteri,
             'tur', tur, 'ucret', ucret, 'saat', saat
           )), '[]'::jsonb)
      into v_isler
    from (
      select cs.service_date::date as tarih,
             coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                      nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),'İsimsiz') as musteri,
             coalesce(cs.service_type,'Servis') as tur,
             round(coalesce(cs.price,0)) as ucret,
             coalesce(cs.work_hours,0) as saat
      from public.completed_services cs
      where to_char(cs.service_date::date,'YYYY-MM') = v_ay
        and coalesce(cs.technician,'') <> ''
        and public.parca_adi_normal(cs.technician) like '%' || public.parca_adi_normal(v_ad) || '%'
      order by cs.service_date desc limit 10
    ) i;
  exception when others then v_isler := '[]'::jsonb; end;

  -- SIRALAMA
  begin
    select count(*) into v_toplam_kisi from (
      select distinct public.personel_eslestir(trim(cs.technician)) as ad
      from public.completed_services cs
      where to_char(cs.service_date::date,'YYYY-MM') = v_ay
        and coalesce(cs.technician,'') <> ''
        and public.personel_eslestir(trim(cs.technician)) is not null
    ) x;

    select count(*) + 1 into v_siralama from (
      select public.personel_eslestir(trim(cs.technician)) as ad, sum(cs.price) as c
      from public.completed_services cs
      where to_char(cs.service_date::date,'YYYY-MM') = v_ay
        and coalesce(cs.technician,'') <> ''
        and public.personel_eslestir(trim(cs.technician)) is not null
      group by 1
    ) y where coalesce(y.c,0) > v_ciro;

    select round(avg(c)) into v_ortalama_ciro from (
      select sum(cs.price) as c
      from public.completed_services cs
      where to_char(cs.service_date::date,'YYYY-MM') = v_ay
        and coalesce(cs.technician,'') <> ''
        and public.personel_eslestir(trim(cs.technician)) is not null
      group by public.personel_eslestir(trim(cs.technician))
    ) z;
  exception when others then null; end;

  -- PERFORMANS PUANI (0-100)
  v_perf := round(
      least(30, coalesce(v_ciro,0) / 15000.0 * 30)                          -- ciro (30)
    + least(20, coalesce(v_is,0) * 2.0)                                     -- iş sayısı (20)
    + coalesce(v_puan, 4) / 5.0 * 20                                        -- memnuniyet (20)
    + case when v_toplam_rpr > 0 then least(15, v_rapor_kayit::numeric / v_toplam_rpr * 15) else 10 end  -- rapor düzeni (15)
    + case when v_isg_top > 0 then v_isg_ok::numeric / v_isg_top * 10 else 8 end  -- İSG (10)
    + least(5, coalesce(v_mesai_gun,0) / 4.0)                               -- puantaj (5)
  , 1);

  return jsonb_build_object(
    'personel', v_ad,
    'ay', v_ay,
    'is_sayisi', v_is,
    'ciro', round(v_ciro),
    'toplam_saat', round(v_saat, 1),
    'ortalama_sure', v_ort_sure,
    'musteri_puani', v_puan,
    'yorumlu_is', v_yorumlu,
    'rapor_kayit', v_rapor_kayit,
    'rapor_beklenen', v_toplam_rpr,
    'rapor_orani', case when v_toplam_rpr > 0 then round(v_rapor_kayit::numeric / v_toplam_rpr * 100) else null end,
    'isg_uyum', case when v_isg_top > 0 then round(v_isg_ok::numeric / v_isg_top * 100) else null end,
    'mesai_gun', v_mesai_gun,
    'izin_gun', v_izin_gun,
    'siralama', v_siralama,
    'toplam_personel', v_toplam_kisi,
    'ortalama_ciro', round(coalesce(v_ortalama_ciro,0)),
    'performans', v_perf,
    'performans_etiket', case
      when v_perf >= 85 then '🏆 YILDIZ'
      when v_perf >= 70 then '⭐ ÇOK İYİ'
      when v_perf >= 55 then '👍 İYİ'
      when v_perf >= 40 then '📈 GELİŞİYOR'
      else '📚 DESTEK GEREK' end,
    'trend', v_trend,
    'son_isler', v_isler
  );
end $$;

revoke all on function public.personel_karnesi(text, text) from public;
grant execute on function public.personel_karnesi(text, text) to authenticated;


-- ============================================================================
-- 4) 📊 PERSONEL SIRALAMA — aylık lig tablosu
-- ============================================================================
create or replace function public.personel_siralama(p_ay text default null)
returns table (
  sira         integer,
  personel     text,
  is_sayisi    integer,
  ciro         numeric,
  ortalama_sure numeric,
  musteri_puani numeric,
  performans   numeric,
  madalya      text
)
language sql
stable
security definer
set search_path = public
as $$
  with ay as (select coalesce(p_ay, to_char(current_date,'YYYY-MM')) as a),
  isler as (
    select
      public.personel_eslestir(trim(cs.technician)) as ad,
      count(*)::int as adet,
      coalesce(sum(cs.price),0) as ciro,
      coalesce(avg(cs.work_hours),0) as ort
    from public.completed_services cs, ay
    where to_char(cs.service_date::date,'YYYY-MM') = ay.a
      and coalesce(cs.technician,'') <> ''
      and public.personel_eslestir(trim(cs.technician)) is not null
    group by 1
  ),
  puanlar as (
    select round(avg(r.musteri_puani),1) as p
    from public.service_reports r, ay
    where r.musteri_puani is not null and to_char(r.created_at,'YYYY-MM') = ay.a
  )
  select
    row_number() over (order by i.ciro desc)::int,
    i.ad,
    i.adet,
    round(i.ciro),
    round(i.ort, 1),
    (select p from puanlar),
    round(
        least(30, i.ciro / 15000.0 * 30)
      + least(20, i.adet * 2.0)
      + coalesce((select p from puanlar), 4) / 5.0 * 20
      + 15 + 10
    , 1),
    case row_number() over (order by i.ciro desc)
      when 1 then '🥇' when 2 then '🥈' when 3 then '🥉' else '' end
  from isler i
  order by i.ciro desc;
$$;

revoke all on function public.personel_siralama(text) from public;
grant execute on function public.personel_siralama(text) to authenticated;


-- ============================================================================
-- 5) 🎯 GÜNLÜK SKOR TABLOSU — bugünün canlı performansı
-- ============================================================================
create or replace function public.gunluk_skor_tablosu()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_liste jsonb := '[]'::jsonb;
  v_hedef_is integer := 8;
  v_hedef_ciro numeric := 30000;
  v_yapilan_is integer := 0;
  v_yapilan_ciro numeric := 0;
begin
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'personel', ad, 'is', adet, 'ciro', ciro, 'son', son_is
           ) order by ciro desc), '[]'::jsonb)
      into v_liste
    from (
      select
        public.personel_eslestir(trim(cs.technician)) as ad,
        count(*)::int as adet,
        round(coalesce(sum(cs.price),0)) as ciro,
        (select coalesce(cs2.service_type,'Servis')
         from public.completed_services cs2
         where to_char(cs2.service_date::date,'YYYY-MM-DD') = to_char(v_bugun,'YYYY-MM-DD')
           and public.parca_adi_normal(cs2.technician) = public.parca_adi_normal(cs.technician)
         order by cs2.service_date desc limit 1) as son_is
      from public.completed_services cs
      where cs.service_date::date = v_bugun
        and coalesce(cs.technician,'') <> ''
        and public.personel_eslestir(trim(cs.technician)) is not null
      group by public.personel_eslestir(trim(cs.technician)), cs.technician
      order by 3 desc
    ) x;

    select count(*), coalesce(sum(price),0) into v_yapilan_is, v_yapilan_ciro
    from public.completed_services where service_date::date = v_bugun;
  exception when others then null; end;

  return jsonb_build_object(
    'tarih', to_char(v_bugun,'DD.MM.YYYY'),
    'saat', to_char(now() at time zone 'Europe/Istanbul','HH24:MI'),
    'personel', v_liste,
    'yapilan_is', v_yapilan_is,
    'yapilan_ciro', round(v_yapilan_ciro),
    'hedef_is', v_hedef_is,
    'hedef_ciro', v_hedef_ciro,
    'is_orani', case when v_hedef_is > 0 then round(v_yapilan_is::numeric / v_hedef_is * 100) else 0 end,
    'ciro_orani', case when v_hedef_ciro > 0 then round(v_yapilan_ciro / v_hedef_ciro * 100) else 0 end
  );
end $$;

revoke all on function public.gunluk_skor_tablosu() from public;
grant execute on function public.gunluk_skor_tablosu() to authenticated;


-- ============================================================================
-- 6) TEST
-- ============================================================================
select * from public.personel_siralama();
select * from public.personel_yetkinlik_matrisi();
select public.gunluk_skor_tablosu() -> 'yapilan_is' as bugun_is,
       public.gunluk_skor_tablosu() -> 'is_orani'   as hedef_orani;
select public.personel_karnesi('GÖKHAN GÖK') -> 'performans' as performans,
       public.personel_karnesi('GÖKHAN GÖK') -> 'performans_etiket' as etiket;
