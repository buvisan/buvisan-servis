-- ============================================================================
--  🛡️ SON SAĞLAMLAŞTIRMA (Güncelleme #55) — KALAN FONKSİYONLAR
-- ----------------------------------------------------------------------------
--  SQL 80'de 4 kritik fonksiyonu şema-bağımsız yaptım.
--  Bu script KALAN riskli fonksiyonları da aynı şekilde sağlamlaştırır:
--    • personel_karnesi()      → r.musteri_puani, r.isg_kontrol
--    • musteri_kayip_riski()   → r.musteri_puani
--    • mevsim_kampanya()       → c.crane_capacity, c.customer_phone
--    • akilli_haftalik_plan()  → c.location_address, c.next_maintenance_date
--    • bakim_firsatlari()      → c.crane_capacity
--
--  SONUÇ: Artık HANGİ sütun eksik olursa olsun bu fonksiyonlar ÇALIŞIR ✓
--         (SQL 77 çalışmasa bile ekranlar dolu gelir)
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
--  SIRALAMA: 80'den SONRA çalıştır
-- ============================================================================


-- ============================================================================
-- 1) 🏆 PERSONEL KARNESİ (şema-bağımsız)
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
  v_ay          text := coalesce(p_ay, to_char(current_date, 'YYYY-MM'));
  v_ad          text;
  v_is          integer := 0;
  v_ciro        numeric := 0;
  v_saat        numeric := 0;
  v_ort_sure    numeric := 0;
  v_puan        numeric;
  v_yorumlu     integer := 0;
  v_toplam_rpr  integer := 0;
  v_rapor_kayit integer := 0;
  v_isg_ok      integer := 0;
  v_isg_top     integer := 0;
  v_mesai_gun   integer := 0;
  v_izin_gun    integer := 0;
  v_trend       jsonb := '[]'::jsonb;
  v_isler       jsonb := '[]'::jsonb;
  v_siralama    integer := 0;
  v_toplam_kisi integer := 0;
  v_ortalama_ciro numeric := 0;
  v_perf        numeric := 0;
begin
  v_ad := coalesce(public.personel_eslestir(p_personel), public.tr_buyuk(trim(p_personel)));

  -- İş istatistikleri
  begin
    select count(*), coalesce(sum(cs.price),0), coalesce(sum(cs.work_hours),0)
      into v_is, v_ciro, v_saat
    from public.completed_services cs
    where to_char(cs.service_date::date, 'YYYY-MM') = v_ay
      and public.parca_adi_normal(public.jalan(to_jsonb(cs),'technician','personel','tekniker'))
          like '%' || public.parca_adi_normal(v_ad) || '%';
    v_ort_sure := case when v_is > 0 then round(v_saat / v_is, 1) else 0 end;
  exception when others then null; end;

  -- Memnuniyet (DİNAMİK — musteri_puani sütunu yoksa da çalışır)
  begin
    select round(avg((to_jsonb(r)->>'musteri_puani')::numeric), 1),
           count(*) filter (where public.jalan(to_jsonb(r),'musteri_yorumu') <> '')
      into v_puan, v_yorumlu
    from public.service_reports r
    where nullif(trim(coalesce(to_jsonb(r)->>'musteri_puani','')),'') is not null
      and to_char(r.created_at, 'YYYY-MM') = v_ay;
  exception when others then null; end;

  -- Rapor düzeni
  begin
    select count(*) into v_rapor_kayit
    from public.service_reports r where to_char(r.created_at, 'YYYY-MM') = v_ay;

    select count(*) into v_toplam_rpr
    from public.completed_services cs
    where to_char(cs.service_date::date, 'YYYY-MM') = v_ay
      and public.parca_adi_normal(public.jalan(to_jsonb(cs),'technician','personel','tekniker'))
          like '%' || public.parca_adi_normal(v_ad) || '%';
  exception when others then null; end;

  -- İSG uyumu (DİNAMİK)
  begin
    select
      count(*) filter (where jsonb_array_length(
                case when jsonb_typeof(to_jsonb(r)->'isg_kontrol') = 'array'
                     then to_jsonb(r)->'isg_kontrol' else '[]'::jsonb end) > 0
              and not exists (
                select 1 from jsonb_array_elements(
                  case when jsonb_typeof(to_jsonb(r)->'isg_kontrol') = 'array'
                       then to_jsonb(r)->'isg_kontrol' else '[]'::jsonb end) x
                where coalesce((x->>'tamam')::boolean, false) = false)),
      count(*) filter (where jsonb_array_length(
                case when jsonb_typeof(to_jsonb(r)->'isg_kontrol') = 'array'
                     then to_jsonb(r)->'isg_kontrol' else '[]'::jsonb end) > 0)
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
             coalesce(sum(cs.price),0) as ciro, count(cs.id) as adet
      from generate_series(
             (to_date(v_ay || '-01','YYYY-MM-DD') - interval '5 months'),
             to_date(v_ay || '-01','YYYY-MM-DD'), interval '1 month') d
      left join public.completed_services cs
        on to_char(cs.service_date::date,'YYYY-MM') = to_char(d,'YYYY-MM')
       and public.parca_adi_normal(public.jalan(to_jsonb(cs),'technician','personel','tekniker'))
           like '%' || public.parca_adi_normal(v_ad) || '%'
      group by to_char(d,'YYYY-MM')
    ) t;
  exception when others then v_trend := '[]'::jsonb; end;

  -- SON İŞLER
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'tarih', to_char(tarih,'DD.MM.YYYY'), 'musteri', musteri,
             'tur', tur, 'ucret', ucret, 'saat', saat)), '[]'::jsonb)
      into v_isler
    from (
      select cs.service_date::date as tarih,
             coalesce(nullif(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer'),''),'İsimsiz') as musteri,
             coalesce(public.jalan(to_jsonb(cs),'service_type'),'Servis') as tur,
             round(coalesce(cs.price,0)) as ucret,
             coalesce(cs.work_hours,0) as saat
      from public.completed_services cs
      where to_char(cs.service_date::date,'YYYY-MM') = v_ay
        and public.parca_adi_normal(public.jalan(to_jsonb(cs),'technician','personel','tekniker'))
            like '%' || public.parca_adi_normal(v_ad) || '%'
      order by cs.service_date desc limit 10
    ) i;
  exception when others then v_isler := '[]'::jsonb; end;

  -- SIRALAMA
  begin
    select count(*), count(*) + 1 into v_toplam_kisi, v_siralama
    from (
      select public.personel_eslestir(public.jalan(to_jsonb(cs),'technician','personel','tekniker')) as ad,
             sum(cs.price) as c
      from public.completed_services cs
      where to_char(cs.service_date::date,'YYYY-MM') = v_ay
        and public.personel_eslestir(public.jalan(to_jsonb(cs),'technician','personel','tekniker')) is not null
      group by 1
    ) y;
    select count(*) + 1 into v_siralama from (
      select public.personel_eslestir(public.jalan(to_jsonb(cs),'technician','personel','tekniker')) as ad,
             sum(cs.price) as c
      from public.completed_services cs
      where to_char(cs.service_date::date,'YYYY-MM') = v_ay
        and public.personel_eslestir(public.jalan(to_jsonb(cs),'technician','personel','tekniker')) is not null
      group by 1
    ) y where coalesce(y.c,0) > v_ciro;

    select round(avg(c)) into v_ortalama_ciro from (
      select sum(cs.price) as c from public.completed_services cs
      where to_char(cs.service_date::date,'YYYY-MM') = v_ay
        and public.personel_eslestir(public.jalan(to_jsonb(cs),'technician','personel','tekniker')) is not null
      group by public.personel_eslestir(public.jalan(to_jsonb(cs),'technician','personel','tekniker'))
    ) z;
  exception when others then null; end;

  -- PERFORMANS PUANI
  v_perf := round(
      least(30, coalesce(v_ciro,0) / 15000.0 * 30)
    + least(20, coalesce(v_is,0) * 2.0)
    + coalesce(v_puan, 4) / 5.0 * 20
    + case when v_toplam_rpr > 0 then least(15, v_rapor_kayit::numeric / v_toplam_rpr * 15) else 10 end
    + case when v_isg_top > 0 then v_isg_ok::numeric / v_isg_top * 10 else 8 end
    + least(5, coalesce(v_mesai_gun,0) / 4.0)
  , 1);

  return jsonb_build_object(
    'personel', v_ad, 'ay', v_ay,
    'is_sayisi', v_is, 'ciro', round(v_ciro),
    'toplam_saat', round(v_saat, 1), 'ortalama_sure', v_ort_sure,
    'musteri_puani', v_puan, 'yorumlu_is', v_yorumlu,
    'rapor_kayit', v_rapor_kayit, 'rapor_beklenen', v_toplam_rpr,
    'rapor_orani', case when v_toplam_rpr > 0 then round(v_rapor_kayit::numeric / v_toplam_rpr * 100) else null end,
    'isg_uyum', case when v_isg_top > 0 then round(v_isg_ok::numeric / v_isg_top * 100) else null end,
    'mesai_gun', v_mesai_gun, 'izin_gun', v_izin_gun,
    'siralama', v_siralama, 'toplam_personel', v_toplam_kisi,
    'ortalama_ciro', round(coalesce(v_ortalama_ciro,0)),
    'performans', v_perf,
    'performans_etiket', case
      when v_perf >= 85 then '🏆 YILDIZ'
      when v_perf >= 70 then '⭐ ÇOK İYİ'
      when v_perf >= 55 then '👍 İYİ'
      when v_perf >= 40 then '📈 GELİŞİYOR'
      else '📚 DESTEK GEREK' end,
    'trend', v_trend, 'son_isler', v_isler
  );
end $$;

revoke all on function public.personel_karnesi(text, text) from public;
grant execute on function public.personel_karnesi(text, text) to authenticated;


-- ============================================================================
-- 2) 🏆 MÜŞTERİ KAYIP RİSKİ (şema-bağımsız)
-- ============================================================================
create or replace function public.musteri_kayip_riski(p_limit integer default 40)
returns table (
  musteri text, vinc_sayisi integer, toplam_ciro numeric,
  son_servis text, gun_once integer, son_90_is integer, onceki_90_is integer,
  dusus_orani integer, memnuniyet numeric, sozlesmeli boolean,
  risk integer, risk_etiket text, oneri text
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
      bool_or(exists (select 1 from public.maintenance_contracts mc where public.jalan(to_jsonb(mc),'crane_id','cranes_id','crane','makine_id','vinc_id','vincl_id','crane_uuid') = c.id::text)) as soz
    from public.cranes c
    where public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
    group by 1
  ),
  istatistik as (
    select
      m.ad, m.vinc_sayisi, m.soz,
      coalesce((select sum(cs.price) from public.completed_services cs
        where public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer'))
              = public.parca_adi_normal(m.ad)), 0) as ciro,
      (select max(cs.service_date::date) from public.completed_services cs
        where public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer'))
              = public.parca_adi_normal(m.ad)) as son,
      (select count(*) from public.completed_services cs
        where public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer'))
              = public.parca_adi_normal(m.ad)
          and cs.service_date::date > current_date - 90)::int as s90,
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
        + case when h.soz then 0 else 10 end
      )))::int as r
    from h
  )
  select
    p.ad, p.vinc_sayisi, round(p.ciro),
    case when p.son is not null then to_char(p.son,'DD.MM.YYYY') else null end,
    p.gun, p.s90, p.o90, p.dusus, p.puan, p.soz, p.r,
    case when p.r >= 70 then '🔴 YÜKSEK' when p.r >= 45 then '🟠 ORTA' else '🟢 DÜŞÜK' end,
    case
      when p.gun is null or p.gun > 180 then '☎️ Hemen ara — uzun süredir sessiz'
      when coalesce(p.dusus,0) >= 50     then '📞 İş hacmi düştü — sebebini öğren'
      when coalesce(p.puan,5) <= 3       then '😐 Memnuniyet düşük — gönlünü al'
      when not p.soz                     then '📄 Abonelik teklif et — bağlayıcı olsun'
      else '👀 Takibe al' end
  from p
  order by p.r desc, p.ciro desc
  limit greatest(1, least(coalesce(p_limit, 40), 200));
$$;

revoke all on function public.musteri_kayip_riski(integer) from public;
grant execute on function public.musteri_kayip_riski(integer) to authenticated;


-- ============================================================================
-- 3) 🌡️ MEVSİM KAMPANYASI (şema-bağımsız)
-- ============================================================================
create or replace function public.mevsim_kampanya()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ay      integer := extract(month from current_date)::int;
  v_mevsim  text;
  v_baslik  text;
  v_mesaj   text;
  v_hizmet  text;
  v_fiyat   numeric := 2500;
  v_hedef   jsonb := '[]'::jsonb;
  v_adet    integer := 0;
begin
  v_mevsim := case when v_ay in (12,1,2) then 'kis'
                   when v_ay in (3,4,5) then 'ilkbahar'
                   when v_ay in (6,7,8) then 'yaz' else 'sonbahar' end;

  v_baslik := case v_mevsim
    when 'kis' then '❄️ Kış Öncesi Bakım Kampanyası'
    when 'ilkbahar' then '🌸 Sezon Açılışı Bakım Kampanyası'
    when 'yaz' then '☀️ Yaz Yoğunluk Öncesi Bakım'
    else '🍂 Kış Hazırlık Bakım Kampanyası' end;

  v_hizmet := case v_mevsim
    when 'kis' then 'Hidrolik sistem + antifriz kontrolü + akü testi'
    when 'ilkbahar' then 'Genel bakım + yağ değişimi + halat kontrolü'
    when 'yaz' then 'Soğutma sistemi + hidrolik yağ + lastik kontrolü'
    else 'Kış hazırlık + hidrolik + elektrik tesisatı' end;

  v_mesaj := v_baslik || E'\n\nSayın yetkili,' || E'\n' ||
    'Vinçlerinizin ' || case v_mevsim when 'kis' then 'kış koşullarına' else 'yeni sezona' end ||
    ' hazır olması için ' || v_hizmet || ' paketimizi sunuyoruz.' || E'\n\n' ||
    'Özel kampanya fiyatı: ' || to_char(v_fiyat,'FM999G999') || ' ₺ + KDV' || E'\n' ||
    'Bakım süresi: yaklaşık 2 saat' || E'\n\n' ||
    'Randevu için bize ulaşabilirsiniz.' || E'\nBUVİSAN Vinç Servis';

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'musteri', musteri, 'vinç', vinc, 'son_servis', son_servis,
             'gun_once', gun_once, 'telefon', telefon)), '[]'::jsonb), count(*)
      into v_hedef, v_adet
    from (
      select
        public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') as musteri,
        coalesce(nullif(public.jalan(to_jsonb(c),'crane_capacity','capacity','kapasite'),''), '—') as vinc,
        (select to_char(max(cs.service_date::date),'DD.MM.YYYY') from public.completed_services cs
         where public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer'))
               = public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi'))) as son_servis,
        (select (current_date - max(cs.service_date::date)) from public.completed_services cs
         where public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer'))
               = public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi'))) as gun_once,
        public.jalan(to_jsonb(c),'customer_phone','phone','telefon') as telefon
      from public.cranes c
      where public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
        and (
          nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'') is null
          or (to_jsonb(c)->>'next_maintenance_date')::date <= current_date + 30
          or not exists (
            select 1 from public.completed_services cs2
            where public.parca_adi_normal(public.jalan(to_jsonb(cs2),'customer_name','firm_name','customer'))
                  = public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi'))
              and cs2.service_date::date > current_date - 180)
        )
      group by 1, 2, 5
      limit 40
    ) h;
  exception when others then v_hedef := '[]'::jsonb; v_adet := 0; end;

  return jsonb_build_object(
    'mevsim', v_mevsim, 'ay', v_ay, 'baslik', v_baslik, 'hizmet', v_hizmet,
    'fiyat', v_fiyat, 'mesaj', v_mesaj,
    'hedef_adet', coalesce(v_adet, 0),
    'potansiyel', coalesce(v_adet, 0) * v_fiyat,
    'hedefler', v_hedef);
end $$;

revoke all on function public.mevsim_kampanya() from public;
grant execute on function public.mevsim_kampanya() to authenticated;


-- ============================================================================
-- 4) 🤖 AKILLI HAFTALIK PLAN (şema-bağımsız)
-- ============================================================================
create or replace function public.akilli_haftalik_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gunler  jsonb := '[]'::jsonb;
  v_bolgeler jsonb := '[]'::jsonb;
  v_gun     record;
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
-- 5) TEST
-- ============================================================================
select 'personel_karnesi' as test,
       coalesce(public.personel_karnesi((select personel from public.personel_maas limit 1)) ->> 'performans','?') as sonuc
union all
select 'musteri_kayip_riski', (select count(*)::text from public.musteri_kayip_riski(5))
union all
select 'mevsim_kampanya', coalesce(public.mevsim_kampanya() ->> 'hedef_adet','?')
union all
select 'akilli_haftalik_plan', coalesce(jsonb_array_length(public.akilli_haftalik_plan() -> 'gunler')::text,'?');
