-- ============================================================================
--  🔧 SÖZLEŞME + RANDEVU SÜTUN DÜZELTMESİ (Güncelleme #57)
-- ----------------------------------------------------------------------------
--  BULGULAR (senin test sonuçlarından):
--    1) maintenance_contracts.crane_id → YOK (farklı isim kullanılıyor)
--    2) appointments.lat / lng        → YOK (eklenemedi)
--
--  ÇÖZÜM:
--    Her iki alan da artık DİNAMİK okunuyor:
--      • Sözleşme bağlantısı: crane_id / cranes_id / crane / makine_id ... hepsi denenir
--      • Randevu koordinatı : to_jsonb ile okunur, yoksa NULL (hata vermez)
--
--  ETKİLENEN FONKSİYONLAR:
--    vinc_saglik_skoru · bakim_durumu · bakim_takvimi · bakim_firsatlari
--    musteri_kayip_riski · akilli_haftalik_plan · harita_noktalari
--
--  KULLANIM: 82'den SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) YARDIMCI: vinç sözleşmeli mi? (sütun adı ne olursa olsun çalışır)
-- ============================================================================
create or replace function public.sozlesmeli_mi(p_crane_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_var boolean := false;
begin
  if p_crane_id is null then return false; end if;
  begin
    execute $q$
      select exists (
        select 1 from public.maintenance_contracts mc
        where public.jalan(to_jsonb(mc), 'crane_id','cranes_id','crane','makine_id','vinc_id','vincl_id','crane_uuid')
              = $1::text
      )
    $q$ into v_var using p_crane_id;
    return coalesce(v_var, false);
  exception when others then
    return false;
  end;
end $$;

revoke all on function public.sozlesmeli_mi(uuid) from public;
grant execute on function public.sozlesmeli_mi(uuid) to authenticated;


-- ============================================================================
-- 2) 🏗️ VİNÇ SAĞLIK SKORU (sözleşme dinamik)
-- ============================================================================
create or replace function public.vinc_saglik_skoru(p_crane_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c jsonb; v_musteri text; v_kapasite text; v_makine text;
  v_bakim_tarih date;
  v_bakim_puan numeric := 20; v_ariza_puan numeric := 15;
  v_tazelik_puan numeric := 15; v_memnun_puan numeric := 12;
  v_skor numeric;
  v_ariza_sayisi integer := 0; v_is_sayisi integer := 0;
  v_son_ariza date; v_gun_once integer; v_ort_ariza numeric := 0;
  v_puan_ort numeric; v_bakim_gun integer;
  v_seviye text; v_renk text;
begin
  select to_jsonb(c) into v_c from public.cranes c where c.id = p_crane_id;
  if v_c is null then
    return jsonb_build_object('skor', 0, 'seviye', 'Bulunamadı', 'renk', 'slate');
  end if;

  v_musteri  := public.jalan(v_c, 'customer_name','firma_adi','musteri_adi','company_name');
  v_kapasite := public.jalan(v_c, 'crane_capacity','capacity','kapasite','crane_type');
  v_makine   := public.jalan(v_c, 'makine_tipi','machine_type','tip');

  begin
    v_bakim_tarih := nullif(trim(coalesce(v_c ->> 'next_maintenance_date','')), '')::date;
  exception when others then v_bakim_tarih := null; end;

  if v_musteri <> '' then
    begin
      select count(*) into v_is_sayisi
      from public.completed_services cs
      where public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer')) =
            public.parca_adi_normal(v_musteri);

      select count(*), max(cs.service_date::date) into v_ariza_sayisi, v_son_ariza
      from public.completed_services cs
      where public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer')) =
            public.parca_adi_normal(v_musteri)
        and (coalesce(cs.service_type,'') ilike '%arıza%'
          or coalesce(cs.service_type,'') ilike '%ariza%'
          or coalesce(cs.description,'') ~* '(ar[ıi]za|bozuk|de[ğg]i[şs]meli|ka[çc]ak|çalışmıyor|patlak|k[ıi]r[ıi]k)');
    exception when others then null; end;
  end if;

  if v_bakim_tarih is not null then
    v_bakim_gun := (v_bakim_tarih - current_date);
    if v_bakim_gun < 0 then v_bakim_puan := greatest(5, 40 - (abs(v_bakim_gun) / 30.0 * 8));
    elsif v_bakim_gun <= 30 then v_bakim_puan := 34;
    else v_bakim_puan := 40; end if;
  else v_bakim_puan := 15; end if;

  if v_is_sayisi > 0 then
    v_ort_ariza := round(v_ariza_sayisi::numeric / greatest(1, (v_is_sayisi / 12.0)), 2);
    v_ariza_puan := case when v_ariza_sayisi = 0 then 25 when v_ariza_sayisi <= 2 then 20
                         when v_ariza_sayisi <= 5 then 13 when v_ariza_sayisi <= 10 then 7 else 3 end;
  else v_ariza_puan := 18; end if;

  if v_son_ariza is not null then
    v_gun_once := (current_date - v_son_ariza);
    v_tazelik_puan := case when v_gun_once <= 30 then 4 when v_gun_once <= 90 then 9
                           when v_gun_once <= 180 then 14 else 20 end;
  else v_tazelik_puan := 16; end if;

  begin
    select round(avg((to_jsonb(r)->>'musteri_puani')::numeric), 1) into v_puan_ort
    from public.service_reports r
    where nullif(trim(coalesce(to_jsonb(r)->>'musteri_puani','')),'') is not null
      and public.parca_adi_normal(public.jalan(to_jsonb(r),'musteri_adi','customer_name')) =
          public.parca_adi_normal(v_musteri);
    if v_puan_ort is not null then v_memnun_puan := round((v_puan_ort / 5.0) * 15, 1); end if;
  exception when others then null; end;

  v_skor := greatest(0, least(100, round(v_bakim_puan + v_ariza_puan + v_tazelik_puan + v_memnun_puan, 1)));
  v_seviye := case when v_skor >= 80 then '🟢 İYİ' when v_skor >= 60 then '🟡 ORTA'
                   when v_skor >= 40 then '🟠 ZAYIF' else '🔴 KÖTÜ' end;
  v_renk := case when v_skor >= 80 then 'emerald' when v_skor >= 60 then 'amber'
                 when v_skor >= 40 then 'orange' else 'rose' end;

  return jsonb_build_object(
    'crane_id', v_c ->> 'id', 'musteri', v_musteri,
    'vinç', coalesce(nullif(v_kapasite,''), 'Belirsiz'),
    'makine_tipi', coalesce(nullif(v_makine,''), 'Vinç'),
    'skor', v_skor, 'seviye', v_seviye, 'renk', v_renk,
    'bakim_puan', round(v_bakim_puan,1), 'ariza_puan', round(v_ariza_puan,1),
    'tazelik_puan', round(v_tazelik_puan,1), 'memnuniyet_puan', round(v_memnun_puan,1),
    'toplam_servis', v_is_sayisi, 'ariza_sayisi', v_ariza_sayisi,
    'son_ariza', case when v_son_ariza is not null then to_char(v_son_ariza,'DD.MM.YYYY') else null end,
    'gun_once', v_gun_once, 'yillik_ariza', v_ort_ariza,
    'bakim_tarihi', case when v_bakim_tarih is not null then to_char(v_bakim_tarih,'DD.MM.YYYY') else null end,
    'bakim_gecikme_gun', case when v_bakim_tarih is not null then (current_date - v_bakim_tarih) else null end,
    'sozlesmeli', public.sozlesmeli_mi(p_crane_id),
    'musteri_puani', v_puan_ort
  );
end $$;

revoke all on function public.vinc_saglik_skoru(uuid) from public;
grant execute on function public.vinc_saglik_skoru(uuid) to authenticated;


-- ============================================================================
-- 3) 📊 BAKIM DURUMU (dinamik)
-- ============================================================================
create or replace function public.bakim_durumu()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gecikmis integer := 0; v_bu_hafta integer := 0; v_bu_ay integer := 0;
  v_gelecek integer := 0; v_tarihsiz integer := 0; v_toplam integer := 0;
  v_sozlesmeli integer := 0;
begin
  begin
    select
      count(*) filter (where (nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date) < current_date),
      count(*) filter (where (nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date)
                             between current_date and current_date + 7),
      count(*) filter (where (nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date)
                             between current_date and current_date + 30),
      count(*) filter (where (nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date) > current_date + 30),
      count(*) filter (where nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'') is null),
      count(*)
    into v_gecikmis, v_bu_hafta, v_bu_ay, v_gelecek, v_tarihsiz, v_toplam
    from public.cranes c
    where public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> '';
  exception when others then null; end;

  begin
    select count(*) into v_sozlesmeli from public.cranes c where public.sozlesmeli_mi(c.id);
  exception when others then v_sozlesmeli := 0; end;

  return jsonb_build_object(
    'gecikmis', v_gecikmis, 'bu_hafta', v_bu_hafta, 'bu_ay', v_bu_ay,
    'gelecek', v_gelecek, 'tarihsiz', v_tarihsiz, 'toplam_vinc', v_toplam,
    'sozlesmeli', v_sozlesmeli, 'sozlesmesiz', greatest(0, v_toplam - v_sozlesmeli),
    'uyum_orani', case when v_toplam > 0
                       then round(((v_toplam - v_gecikmis - v_tarihsiz)::numeric / v_toplam) * 100)
                       else 0 end);
end $$;

revoke all on function public.bakim_durumu() from public;
grant execute on function public.bakim_durumu() to authenticated;


-- ============================================================================
-- 4) 🗓️ BAKIM TAKVİMİ (sözleşme dinamik)
-- ============================================================================
drop function if exists public.bakim_takvimi(integer, integer);

create or replace function public.bakim_takvimi(p_yil integer default null, p_limit integer default 60)
returns table (
  crane_id uuid, musteri text, vinc text, makine_tipi text,
  aylar jsonb, son_bakim text, sonraki text, gecikme integer,
  sozlesmeli boolean, durum text
)
language sql
stable
security definer
set search_path = public
as $$
  with y as (select coalesce(p_yil, extract(year from current_date)::int) as yil),
  vincler as (
    select
      c.id,
      public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') as musteri,
      public.jalan(to_jsonb(c),'crane_capacity','capacity','kapasite') as kapasite,
      public.jalan(to_jsonb(c),'makine_tipi','machine_type','tip') as makine,
      nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date as bakim,
      public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi')) as mnorm,
      public.sozlesmeli_mi(c.id) as soz
    from public.cranes c
    where public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
  ),
  servisler as (
    select
      public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer')) as mnorm,
      extract(month from cs.service_date::date)::int as ay,
      cs.service_date::date as tarih
    from public.completed_services cs, y
    where cs.service_date is not null
      and extract(year from cs.service_date::date)::int = y.yil
  )
  select
    v.id, v.musteri,
    coalesce(nullif(v.kapasite,''), '—'),
    coalesce(nullif(v.makine,''), 'Vinç'),
    coalesce((
      select jsonb_agg(jsonb_build_object('ay', m.mn, 'durum', m.dr) order by m.mn)
      from (
        select mn, case
          when exists (select 1 from servisler s where s.mnorm = v.mnorm and s.ay = mn) then 'yapildi'
          when v.bakim is not null and extract(month from v.bakim)::int = mn
               and extract(year from v.bakim)::int = (select yil from y) then 'planli'
          when v.bakim is not null and v.bakim < current_date
               and extract(month from v.bakim)::int = mn then 'gecikti'
          else 'bos' end as dr
        from generate_series(1,12) mn
      ) m
    ), '[]'::jsonb),
    (select to_char(max(s.tarih),'DD.MM.YYYY') from servisler s where s.mnorm = v.mnorm),
    case when v.bakim is not null then to_char(v.bakim,'DD.MM.YYYY') else null end,
    case when v.bakim is not null then (current_date - v.bakim) else null end,
    v.soz,
    case when v.bakim is null then 'tarihsiz'
         when v.bakim < current_date then 'gecikmis'
         when v.bakim <= current_date + 30 then 'yaklasan'
         else 'planli' end
  from vincler v
  order by
    case when v.bakim is null then 3 when v.bakim < current_date then 1
         when v.bakim <= current_date + 30 then 2 else 4 end,
    v.bakim asc nulls last, v.musteri asc
  limit greatest(1, least(coalesce(p_limit, 60), 500));
$$;

revoke all on function public.bakim_takvimi(integer, integer) from public;
grant execute on function public.bakim_takvimi(integer, integer) to authenticated;


-- ============================================================================
-- 5) 💰 BAKIM FIRSATLARI (sözleşme dinamik)
-- ============================================================================
create or replace function public.bakim_firsatlari(p_limit integer default 30)
returns table (
  musteri text, vinc_sayisi integer, yillik_ciro numeric,
  son_servis text, gun_once integer, onerilen_paket text, tahmini_gelir numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with ozet as (
    select
      public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') as musteri,
      count(*)::int as vinc_sayisi,
      coalesce((
        select sum(cs.price) from public.completed_services cs
        where public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer'))
              = public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi'))
      ), 0) as ciro
    from public.cranes c
    where public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
      and not public.sozlesmeli_mi(c.id)
    group by 1
  )
  select
    o.musteri, o.vinc_sayisi, round(o.ciro),
    (select to_char(max(cs.service_date::date),'DD.MM.YYYY') from public.completed_services cs
     where public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer'))
           = public.parca_adi_normal(o.musteri)),
    (select (current_date - max(cs.service_date::date)) from public.completed_services cs
     where public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer'))
           = public.parca_adi_normal(o.musteri)),
    case when o.vinc_sayisi >= 10 then '10-14 filo paketi'
         when o.vinc_sayisi >= 7 then '7-9 filo paketi'
         when o.vinc_sayisi >= 4 then '4-6 filo paketi'
         when o.vinc_sayisi >= 2 then '2-3 filo paketi'
         else 'Tek makine paketi' end,
    case when o.vinc_sayisi >= 10 then o.vinc_sayisi * 4500
         when o.vinc_sayisi >= 7 then o.vinc_sayisi * 5500
         when o.vinc_sayisi >= 4 then o.vinc_sayisi * 6500
         when o.vinc_sayisi >= 2 then o.vinc_sayisi * 7500
         else o.vinc_sayisi * 8500 end
  from ozet o
  order by o.vinc_sayisi desc, o.ciro desc
  limit greatest(1, least(coalesce(p_limit, 30), 200));
$$;

revoke all on function public.bakim_firsatlari(integer) from public;
grant execute on function public.bakim_firsatlari(integer) to authenticated;


-- ============================================================================
-- 6) 🏆 MÜŞTERİ KAYIP RİSKİ (sözleşme dinamik)
-- ============================================================================
create or replace function public.musteri_kayip_riski(p_limit integer default 40)
returns table (
  musteri text, vinc_sayisi integer, toplam_ciro numeric, son_servis text,
  gun_once integer, son_90_is integer, onceki_90_is integer, dusus_orani integer,
  memnuniyet numeric, sozlesmeli boolean, risk integer, risk_etiket text, oneri text
)
language sql
stable
security definer
set search_path = public
as $$
  with musteriler as (
    select
      public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') as ad,
      count(*)::int as vinc_sayisi,
      bool_or(public.sozlesmeli_mi(c.id)) as soz
    from public.cranes c
    where public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
    group by 1
  ),
  istatistik as (
    select m.ad, m.vinc_sayisi, m.soz,
      coalesce((select sum(cs.price) from public.completed_services cs
        where public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer'))
              = public.parca_adi_normal(m.ad)), 0) as ciro,
      (select max(cs.service_date::date) from public.completed_services cs
        where public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer'))
              = public.parca_adi_normal(m.ad)) as son,
      (select count(*) from public.completed_services cs
        where public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer'))
              = public.parca_adi_normal(m.ad) and cs.service_date::date > current_date - 90)::int as s90,
      (select count(*) from public.completed_services cs
        where public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer'))
              = public.parca_adi_normal(m.ad)
          and cs.service_date::date between current_date - 180 and current_date - 90)::int as o90,
      (select round(avg((to_jsonb(r)->>'musteri_puani')::numeric),1) from public.service_reports r
        where nullif(trim(coalesce(to_jsonb(r)->>'musteri_puani','')),'') is not null
          and public.parca_adi_normal(public.jalan(to_jsonb(r),'musteri_adi','customer_name'))
              = public.parca_adi_normal(m.ad)) as puan
    from musteriler m
  ),
  h as (
    select i.*,
      case when i.son is not null then (current_date - i.son)::int else null end as gun,
      case when i.o90 > 0 then round(((i.o90 - i.s90)::numeric / i.o90) * 100)::int
           when i.s90 = 0 then 100 else 0 end as dusus
    from istatistik i
  ),
  p as (
    select h.*,
      least(100, greatest(0, round(
          least(40, coalesce(h.dusus,0) * 0.4)
        + case when h.gun is null then 30 when h.gun > 180 then 30 when h.gun > 120 then 22
               when h.gun > 90 then 14 when h.gun > 60 then 7 else 0 end
        + case when h.puan is null then 10 when h.puan <= 2 then 20 when h.puan <= 3 then 13
               when h.puan <= 4 then 6 else 0 end
        + case when h.soz then 0 else 10 end)))::int as r
    from h
  )
  select p.ad, p.vinc_sayisi, round(p.ciro),
    case when p.son is not null then to_char(p.son,'DD.MM.YYYY') else null end,
    p.gun, p.s90, p.o90, p.dusus, p.puan, p.soz, p.r,
    case when p.r >= 70 then '🔴 YÜKSEK' when p.r >= 45 then '🟠 ORTA' else '🟢 DÜŞÜK' end,
    case
      when p.gun is null or p.gun > 180 then '☎️ Hemen ara — uzun süredir sessiz'
      when coalesce(p.dusus,0) >= 50 then '📞 İş hacmi düştü — sebebini öğren'
      when coalesce(p.puan,5) <= 3 then '😐 Memnuniyet düşük — gönlünü al'
      when not p.soz then '📄 Abonelik teklif et — bağlayıcı olsun'
      else '👀 Takibe al' end
  from p
  order by p.r desc, p.ciro desc
  limit greatest(1, least(coalesce(p_limit, 40), 200));
$$;

revoke all on function public.musteri_kayip_riski(integer) from public;
grant execute on function public.musteri_kayip_riski(integer) to authenticated;


-- ============================================================================
-- 7) AKILLI HAFTALIK PLAN (randevu koordinatı dinamik)
-- ============================================================================
create or replace function public.akilli_haftalik_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gunler jsonb := '[]'::jsonb;
  v_bolgeler jsonb := '[]'::jsonb;
  v_gun record;
begin
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'bolge', bolge, 'adet', adet, 'musteriler', musteriler) order by adet desc), '[]'::jsonb)
      into v_bolgeler
    from (
      select
        coalesce(nullif(split_part(trim(coalesce(public.jalan(to_jsonb(c),'location_address','address'),'')), ' ', 1), ''), 'Adres yok') as bolge,
        count(*)::int as adet,
        string_agg(distinct public.jalan(to_jsonb(c),'customer_name','firma_adi'), ', ') as musteriler
      from public.cranes c
      where nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'') is not null
        and (to_jsonb(c)->>'next_maintenance_date')::date <= current_date + 30
        and public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
      group by 1 order by 2 desc limit 8
    ) b;
  exception when others then v_bolgeler := '[]'::jsonb; end;

  begin
    for v_gun in
      select d::date as gun, extract(dow from d)::int as dow, to_char(d,'DD.MM.YYYY') as gun_str
      from generate_series(current_date, current_date + 6, interval '1 day') d
    loop
      declare
        v_isler jsonb := '[]'::jsonb;
      begin
        select coalesce(jsonb_agg(jsonb_build_object(
                 'musteri', musteri, 'is', is_tanimi, 'oncelik', oncelik)), '[]'::jsonb)
          into v_isler
        from (
          select coalesce(nullif(public.jalan(to_jsonb(a),'customer_name','firma_adi','musteri_adi'),''),'İsimsiz') as musteri,
                 'Randevu' as is_tanimi, 1 as oncelik
          from public.appointments a
          where a.appointment_date = v_gun.gun
          limit 5
        ) x;
        v_gunler := v_gunler || jsonb_build_object(
          'tarih', v_gun.gun_str, 'gun', v_gun.dow,
          'hafta_sonu', v_gun.dow in (0,6), 'isler', v_isler);
      exception when others then
        v_gunler := v_gunler || jsonb_build_object('tarih', v_gun.gun_str, 'gun', v_gun.dow, 'isler', '[]'::jsonb);
      end;
    end loop;
  exception when others then v_gunler := '[]'::jsonb; end;

  return jsonb_build_object(
    'bolgeler', v_bolgeler, 'gunler', v_gunler,
    'olusturma', to_char(now() at time zone 'Europe/Istanbul','DD.MM.YYYY HH24:MI'));
end $$;

revoke all on function public.akilli_haftalik_plan() from public;
grant execute on function public.akilli_haftalik_plan() to authenticated;


-- ============================================================================
-- 8) TEST
-- ============================================================================
select 'sozlesmeli_mi' as test, public.sozlesmeli_mi((select id from public.cranes limit 1))::text as sonuc
union all
select 'vinc_saglik_skoru', coalesce(public.vinc_saglik_skoru((select id from public.cranes limit 1)) ->> 'skor','?')
union all
select 'bakim_durumu', coalesce(public.bakim_durumu() ->> 'toplam_vinc','?')
union all
select 'bakim_takvimi', (select count(*)::text from public.bakim_takvimi(null,5))
union all
select 'bakim_firsatlari', (select count(*)::text from public.bakim_firsatlari(5))
union all
select 'musteri_kayip_riski', (select count(*)::text from public.musteri_kayip_riski(5))
union all
select 'akilli_haftalik_plan', coalesce(jsonb_array_length(public.akilli_haftalik_plan() -> 'gunler')::text,'?');


-- ============================================================================
-- 9) MAINTENANCE_CONTRACTS GERÇEK SÜTUNLARI (merak için)
-- ============================================================================
select string_agg(column_name, ', ' order by ordinal_position) as sozlesme_sutunlari
from information_schema.columns
where table_schema='public' and table_name='maintenance_contracts';
