-- ============================================================================
--  🗓️ FAZ 3 — BAKIM TAKVİMİ + AKILLI HAFTALIK PLAN + MEVSİM KAMPANYASI
-- ----------------------------------------------------------------------------
--  NE YAPAR?
--    1) bakim_takvimi()        → 12 aylık vinç bakım takvimi (yıllık görünüm)
--    2) bakim_durumu()         → gecikmiş / yaklaşan / planlı / tamam özeti
--    3) bakim_planla()         → vincin bakım tarihini belirle
--    4) akilli_haftalik_plan() → bu haftanın işlerini BÖLGEYE göre gruplar
--    5) mevsim_kampanya()      → mevsime göre kampanya hedef listesi
--    6) bakim_firsatlari()     → sözleşmesiz vinçler (abonelik fırsatı)
--
--  TASARIM:
--    • Veri yoksa çökmez → boş dizi döner
--    • Mevsim OTOMATİK algılanır (ay no'dan)
--    • Bölge = adresin ilk kelimesi / ilçe (mesafe yerine pratik gruplama)
--    • jsonb → yeni alan eklemek kodu bozmaz
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) 📊 BAKIM DURUMU ÖZETİ
-- ============================================================================
create or replace function public.bakim_durumu()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gecikmis integer := 0;
  v_bu_hafta integer := 0;
  v_bu_ay    integer := 0;
  v_gelecek  integer := 0;
  v_tarihsiz integer := 0;
  v_sozlesmeli integer := 0;
  v_toplam   integer := 0;
begin
  begin
    select
      count(*) filter (where next_maintenance_date < current_date),
      count(*) filter (where next_maintenance_date between current_date and current_date + 7),
      count(*) filter (where next_maintenance_date between current_date and current_date + 30),
      count(*) filter (where next_maintenance_date > current_date + 30),
      count(*) filter (where next_maintenance_date is null),
      count(*)
    into v_gecikmis, v_bu_hafta, v_bu_ay, v_gelecek, v_tarihsiz, v_toplam
    from public.cranes
    where coalesce(customer_name,'') <> '';
  exception when others then null; end;

  begin
    select count(distinct mc.crane_id) into v_sozlesmeli
    from public.maintenance_contracts mc;
  exception when others then v_sozlesmeli := 0; end;

  return jsonb_build_object(
    'gecikmis', v_gecikmis,
    'bu_hafta', v_bu_hafta,
    'bu_ay', v_bu_ay,
    'gelecek', v_gelecek,
    'tarihsiz', v_tarihsiz,
    'toplam_vinc', v_toplam,
    'sozlesmeli', v_sozlesmeli,
    'sozlesmesiz', greatest(0, v_toplam - v_sozlesmeli),
    'uyum_orani', case when v_toplam > 0
                       then round(((v_toplam - v_gecikmis - v_tarihsiz)::numeric / v_toplam) * 100)
                       else 0 end
  );
end $$;

revoke all on function public.bakim_durumu() from public;
grant execute on function public.bakim_durumu() to authenticated;


-- ============================================================================
-- 2) 🗓️ 12 AYLIK BAKIM TAKVİMİ — kim, hangi ay bakımlı?
-- ============================================================================
create or replace function public.bakim_takvimi(
  p_yil   integer default null,
  p_limit integer default 60
)
returns table (
  crane_id    uuid,
  musteri     text,
  vinc        text,
  makine_tipi text,
  aylar       jsonb,      -- [{ay:1, durum:'yapildi'}, ...]
  son_bakim   text,
  sonraki     text,
  gecikme     integer,
  sozlesmeli  boolean,
  durum       text
)
language sql
stable
security definer
set search_path = public
as $$
  with y as (select coalesce(p_yil, extract(year from current_date)::int) as yil),
  vincler as (
    select
      c.id, c.customer_name, c.crane_capacity, c.makine_tipi,
      c.next_maintenance_date,
      public.parca_adi_normal(coalesce(c.customer_name,'')) as mnorm,
      exists (select 1 from public.maintenance_contracts mc where mc.crane_id = c.id) as soz
    from public.cranes c
    where coalesce(c.customer_name,'') <> ''
  ),
  servisler as (
    select
      public.parca_adi_normal(
        coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                 nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),'')) as mnorm,
      extract(month from cs.service_date::date)::int as ay,
      cs.service_date::date as tarih
    from public.completed_services cs, y
    where extract(year from cs.service_date::date)::int = y.yil
      and coalesce(cs.service_type,'') !~* '(montaj)'
  )
  select
    v.id,
    v.customer_name,
    coalesce(nullif(trim(coalesce(v.crane_capacity,'')),''), '—'),
    coalesce(nullif(trim(coalesce(v.makine_tipi,'')),''), 'Vinç'),
    coalesce((
      select jsonb_agg(jsonb_build_object('ay', m.mn, 'durum', m.dr) order by m.mn)
      from (
        select mn,
          case
            when exists (select 1 from servisler s where s.mnorm = v.mnorm and s.ay = mn)
              then 'yapildi'
            when v.next_maintenance_date is not null
                 and extract(month from v.next_maintenance_date)::int = mn
                 and extract(year from v.next_maintenance_date)::int = (select yil from y)
              then 'planli'
            when v.next_maintenance_date is not null
                 and v.next_maintenance_date < current_date
                 and extract(month from v.next_maintenance_date)::int = mn
              then 'gecikti'
            else 'bos' end as dr
        from generate_series(1,12) mn
      ) m
    ), '[]'::jsonb),
    (select to_char(max(s.tarih),'DD.MM.YYYY') from servisler s where s.mnorm = v.mnorm),
    case when v.next_maintenance_date is not null
         then to_char(v.next_maintenance_date,'DD.MM.YYYY') else null end,
    case when v.next_maintenance_date is not null
         then (current_date - v.next_maintenance_date) else null end,
    v.soz,
    case
      when v.next_maintenance_date is null then 'tarihsiz'
      when v.next_maintenance_date < current_date then 'gecikmis'
      when v.next_maintenance_date <= current_date + 30 then 'yaklasan'
      else 'planli' end
  from vincler v
  order by
    case
      when v.next_maintenance_date is null then 3
      when v.next_maintenance_date < current_date then 1
      when v.next_maintenance_date <= current_date + 30 then 2
      else 4 end,
    v.next_maintenance_date asc nulls last,
    v.customer_name asc
  limit greatest(1, least(coalesce(p_limit, 60), 500));
$$;

revoke all on function public.bakim_takvimi(integer, integer) from public;
grant execute on function public.bakim_takvimi(integer, integer) to authenticated;


-- ============================================================================
-- 3) ✏️ BAKIM PLANLA — vincin bakım tarihini belirle
-- ============================================================================
create or replace function public.bakim_planla(
  p_crane_id uuid,
  p_tarih    date,
  p_not      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.buvisan_admin_mi() then
    return jsonb_build_object('yetki_yok', true, 'mesaj', 'Sadece yönetici planlayabilir.');
  end if;

  if p_tarih is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Tarih gerekli.');
  end if;

  update public.cranes
     set next_maintenance_date = p_tarih
   where id = p_crane_id;

  if not found then
    return jsonb_build_object('ok', false, 'mesaj', 'Vinç bulunamadı.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'mesaj', 'Bakım planlandı: ' || to_char(p_tarih, 'DD.MM.YYYY')
             || case when coalesce(p_not,'') <> '' then ' · ' || p_not else '' end
  );
end $$;

revoke all on function public.bakim_planla(uuid, date, text) from public;
grant execute on function public.bakim_planla(uuid, date, text) to authenticated;


-- ============================================================================
-- 4) 🤖 AKILLI HAFTALIK PLAN — işleri BÖLGEYE göre grupla
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
  v_r       record;
  v_gun     record;
begin
  -- BÖLGE GRUPLARI: bakımı gelen/geciken vinçler adres ilk kelimesine göre
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'bolge', bolge, 'adet', adet, 'musteriler', musteriler
           ) order by adet desc), '[]'::jsonb)
      into v_bolgeler
    from (
      select
        coalesce(nullif(split_part(trim(coalesce(c.location_address,'')), ' ', 1), ''), 'Adres yok') as bolge,
        count(*)::int as adet,
        string_agg(distinct c.customer_name, ', ' order by c.customer_name) as musteriler
      from public.cranes c
      where c.next_maintenance_date is not null
        and c.next_maintenance_date <= current_date + 30
        and coalesce(c.customer_name,'') <> ''
      group by 1
      order by 2 desc
      limit 8
    ) b;
  exception when others then v_bolgeler := '[]'::jsonb; end;

  -- GÜNLÜK PLAN: önümüzdeki 7 gün için öneriler
  begin
    for v_gun in
      select d::date as gun,
             extract(dow from d)::int as dow,
             to_char(d, 'DD.MM.YYYY') as gun_str
      from generate_series(current_date, current_date + 6, interval '1 day') d
    loop
      declare
        v_isler jsonb := '[]'::jsonb;
      begin
        select coalesce(jsonb_agg(jsonb_build_object(
                 'musteri', musteri, 'is', is_tanimi, 'oncelik', oncelik
               )), '[]'::jsonb)
          into v_isler
        from (
          -- Randevulu işler
          select coalesce(nullif(trim(coalesce(to_jsonb(a)->>'customer_name','')),''),
                          nullif(trim(coalesce(to_jsonb(a)->>'firma_adi','')),''), 'İsimsiz') as musteri,
                 'Randevu' as is_tanimi, 1 as oncelik
          from public.appointments a
          where a.appointment_date = v_gun.gun
            and coalesce(a.status,'') not in ('iptal')
          limit 5
        ) x;
        v_gunler := v_gunler || jsonb_build_object(
          'tarih', v_gun.gun_str,
          'gun', v_gun.dow,
          'hafta_sonu', v_gun.dow in (0, 6),
          'isler', v_isler
        );
      exception when others then
        v_gunler := v_gunler || jsonb_build_object('tarih', v_gun.gun_str, 'gun', v_gun.dow, 'isler', '[]'::jsonb);
      end;
    end loop;
  exception when others then v_gunler := '[]'::jsonb; end;

  return jsonb_build_object(
    'bolgeler', v_bolgeler,
    'gunler', v_gunler,
    'olusturma', to_char(now() at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI')
  );
end $$;

revoke all on function public.akilli_haftalik_plan() from public;
grant execute on function public.akilli_haftalik_plan() to authenticated;


-- ============================================================================
-- 5) 🌡️ MEVSİM KAMPANYASI — otomatik mevsim algılama + hedef liste
-- ============================================================================
create or replace function public.mevsim_kampanya()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ay       integer := extract(month from current_date)::int;
  v_mevsim   text;
  v_baslik   text;
  v_mesaj    text;
  v_hizmet   text;
  v_fiyat    numeric := 2500;
  v_hedef    jsonb := '[]'::jsonb;
  v_adet     integer := 0;
  v_potansiyel numeric := 0;
begin
  v_mevsim := case
    when v_ay in (12,1,2) then 'kis'
    when v_ay in (3,4,5)  then 'ilkbahar'
    when v_ay in (6,7,8)  then 'yaz'
    else 'sonbahar' end;

  v_baslik := case v_mevsim
    when 'kis'      then '❄️ Kış Öncesi Bakım Kampanyası'
    when 'ilkbahar' then '🌸 Sezon Açılışı Bakım Kampanyası'
    when 'yaz'      then '☀️ Yaz Yoğunluk Öncesi Bakım'
    else '🍂 Kış Hazırlık Bakım Kampanyası' end;

  v_hizmet := case v_mevsim
    when 'kis'      then 'Hidrolik sistem + antifriz kontrolü + akü testi'
    when 'ilkbahar' then 'Genel bakım + yağ değişimi + halat kontrolü'
    when 'yaz'      then 'Soğutma sistemi + hidrolik yağ + lastik kontrolü'
    else 'Kış hazırlık + hidrolik + elektrik tesisatı' end;

  v_mesaj := v_baslik || E'\n\n' ||
    'Sayın yetkili,' || E'\n' ||
    'Vinçlerinizin ' || case v_mevsim when 'kis' then 'kış koşullarına' else 'yeni sezona' end ||
    ' hazır olması için ' || v_hizmet || ' paketimizi sunuyoruz.' || E'\n\n' ||
    'Özel kampanya fiyatı: ' || to_char(v_fiyat, 'FM999G999') || ' ₺ + KDV' || E'\n' ||
    'Bakım süresi: yaklaşık 2 saat' || E'\n\n' ||
    'Randevu için bize ulaşabilirsiniz.' || E'\n' ||
    'BUVİSAN Vinç Servis';

  -- HEDEF LİSTE: son 6 ayda servis görmemiş VEYA bakımı gecikmiş müşteriler
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'musteri', musteri, 'vinç', vinc, 'son_servis', son_servis,
             'gun_once', gun_once, 'telefon', telefon
           )), '[]'::jsonb), count(*)
      into v_hedef, v_adet
    from (
      select
        c.customer_name as musteri,
        coalesce(nullif(trim(coalesce(c.crane_capacity,'')),''), '—') as vinc,
        (select to_char(max(cs.service_date::date),'DD.MM.YYYY')
         from public.completed_services cs
         where public.parca_adi_normal(
                 coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                          nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
               = public.parca_adi_normal(coalesce(c.customer_name,''))) as son_servis,
        (select (current_date - max(cs.service_date::date))
         from public.completed_services cs
         where public.parca_adi_normal(
                 coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                          nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
               = public.parca_adi_normal(coalesce(c.customer_name,''))) as gun_once,
        coalesce(c.customer_phone, '') as telefon
      from public.cranes c
      where coalesce(c.customer_name,'') <> ''
        and (
          c.next_maintenance_date is null
          or c.next_maintenance_date <= current_date + 30
          or not exists (
            select 1 from public.completed_services cs2
            where public.parca_adi_normal(
                    coalesce(nullif(trim(coalesce(to_jsonb(cs2)->>'customer_name','')),''),
                             nullif(trim(coalesce(to_jsonb(cs2)->>'firm_name','')),''),''))
                  = public.parca_adi_normal(coalesce(c.customer_name,''))
              and cs2.service_date::date > current_date - 180
          )
        )
      group by c.customer_name, c.crane_capacity, c.customer_phone
      limit 40
    ) h;
  exception when others then v_hedef := '[]'::jsonb; v_adet := 0; end;

  v_potansiyel := coalesce(v_adet, 0) * v_fiyat;

  return jsonb_build_object(
    'mevsim', v_mevsim,
    'ay', v_ay,
    'baslik', v_baslik,
    'hizmet', v_hizmet,
    'fiyat', v_fiyat,
    'mesaj', v_mesaj,
    'hedef_adet', coalesce(v_adet, 0),
    'potansiyel', v_potansiyel,
    'hedefler', v_hedef
  );
end $$;

revoke all on function public.mevsim_kampanya() from public;
grant execute on function public.mevsim_kampanya() to authenticated;


-- ============================================================================
-- 6) 💰 BAKIM FIRSATLARI — sözleşmesiz vinçler (abonelik potansiyeli)
-- ============================================================================
create or replace function public.bakim_firsatlari(p_limit integer default 30)
returns table (
  musteri      text,
  vinc_sayisi  integer,
  yillik_ciro  numeric,
  son_servis   text,
  gun_once     integer,
  onerilen_paket text,
  tahmini_gelir numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with ozet as (
    select
      c.customer_name as musteri,
      count(*)::int as vinc_sayisi,
      coalesce((
        select sum(cs.price) from public.completed_services cs
        where public.parca_adi_normal(
                coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                         nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
              = public.parca_adi_normal(coalesce(c.customer_name,'')))
      , 0) as ciro
    from public.cranes c
    where coalesce(c.customer_name,'') <> ''
      and not exists (select 1 from public.maintenance_contracts mc where mc.crane_id = c.id)
    group by c.customer_name
  )
  select
    o.musteri,
    o.vinc_sayisi,
    round(o.ciro),
    (select to_char(max(cs.service_date::date),'DD.MM.YYYY')
     from public.completed_services cs
     where public.parca_adi_normal(
             coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                      nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
           = public.parca_adi_normal(o.musteri)),
    (select (current_date - max(cs.service_date::date))
     from public.completed_services cs
     where public.parca_adi_normal(
             coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                      nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
           = public.parca_adi_normal(o.musteri)),
    case when o.vinc_sayisi >= 10 then '10-14 filo paketi'
         when o.vinc_sayisi >= 7  then '7-9 filo paketi'
         when o.vinc_sayisi >= 4  then '4-6 filo paketi'
         when o.vinc_sayisi >= 2  then '2-3 filo paketi'
         else 'Tek makine paketi' end,
    case when o.vinc_sayisi >= 10 then o.vinc_sayisi * 4500
         when o.vinc_sayisi >= 7  then o.vinc_sayisi * 5500
         when o.vinc_sayisi >= 4  then o.vinc_sayisi * 6500
         when o.vinc_sayisi >= 2  then o.vinc_sayisi * 7500
         else o.vinc_sayisi * 8500 end
  from ozet o
  order by o.vinc_sayisi desc, o.ciro desc
  limit greatest(1, least(coalesce(p_limit, 30), 200));
$$;

revoke all on function public.bakim_firsatlari(integer) from public;
grant execute on function public.bakim_firsatlari(integer) to authenticated;


-- ============================================================================
-- 7) TEST
-- ============================================================================
select public.bakim_durumu();
select * from public.bakim_takvimi(null, 15);
select public.mevsim_kampanya() -> 'baslik' as kampanya,
       public.mevsim_kampanya() -> 'hedef_adet' as hedef,
       public.mevsim_kampanya() -> 'potansiyel' as potansiyel;
select * from public.bakim_firsatlari(10);
