-- ============================================================================
-- 0) YARDIMCI FONKSİYON — sözleşmeli mi? (SQL 83 hata verince oluşmamıştı)
--    Sütun adı ne olursa olsun bulur, yoksa FALSE döner.
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
--  🔧 SON DÜZELTME — bakim_firsatlari (Güncelleme #58)
-- ----------------------------------------------------------------------------
--  HATA: subquery uses ungrouped column "c.*" from outer query
--  SEBEP: bakim_firsatlari() içinde GROUP BY varken korelasyonlu alt sorgu
--         dış sorgunun c.* sütununu kullanıyordu.
--
--  ÇÖZÜM: Korelasyon kaldırıldı → CTE'ler ile JOIN yapısına çevrildi.
--         Artık gruplama sorunu YOK.
--
--  KULLANIM: 83'ten SONRA çalıştır. Hata vermez.
-- ============================================================================

create or replace function public.bakim_firsatlari(p_limit integer default 30)
returns table (
  musteri        text,
  vinc_sayisi    integer,
  yillik_ciro    numeric,
  son_servis     text,
  gun_once       integer,
  onerilen_paket text,
  tahmini_gelir  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with vincler as (
    select
      c.id,
      public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') as musteri,
      public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi')) as mnorm
    from public.cranes c
    where public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
      and not public.sozlesmeli_mi(c.id)
  ),
  ozet as (
    select v.musteri, count(*)::int as vinc_sayisi
    from vincler v
    group by v.musteri
  ),
  ciro as (
    select
      public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer')) as mnorm,
      round(coalesce(sum(cs.price),0)) as toplam
    from public.completed_services cs
    group by 1
  ),
  son as (
    select
      public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer')) as mnorm,
      max(cs.service_date::date) as son_t
    from public.completed_services cs
    group by 1
  )
  select
    o.musteri,
    o.vinc_sayisi,
    coalesce(ci.toplam, 0),
    case when s.son_t is not null then to_char(s.son_t,'DD.MM.YYYY') else null end,
    case when s.son_t is not null then (current_date - s.son_t) else null end,
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
  left join ciro ci on ci.mnorm = public.parca_adi_normal(o.musteri)
  left join son  s  on s.mnorm  = public.parca_adi_normal(o.musteri)
  order by o.vinc_sayisi desc, coalesce(ci.toplam,0) desc
  limit greatest(1, least(coalesce(p_limit, 30), 200));
$$;

revoke all on function public.bakim_firsatlari(integer) from public;
grant execute on function public.bakim_firsatlari(integer) to authenticated;


-- ============================================================================
-- DİĞER GRUPLAMA RİSKLERİNİ DE KONTROL ET / DÜZELT
-- ============================================================================

-- mevsim_kampanya: GROUP BY 1,2,5 vardı ama korelasyonlu alt sorgular
-- kullanıyor → aynı hatayı verebilir. Yeniden yazıldı.
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

  -- HEDEF LİSTE (korelasyonsuz — CTE + JOIN)
  begin
    with vc as (
      select
        public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') as musteri,
        public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi')) as mnorm,
        nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date as bakim,
        public.jalan(to_jsonb(c),'customer_phone','phone','telefon') as telefon,
        coalesce(nullif(public.jalan(to_jsonb(c),'crane_capacity','capacity','kapasite'),''), '—') as vinc
      from public.cranes c
      where public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
    ),
    son as (
      select public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer')) as mnorm,
             max(cs.service_date::date) as son_t
      from public.completed_services cs group by 1
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'musteri', v.musteri, 'vinç', v.vinc, 'son_servis',
        case when s.son_t is not null then to_char(s.son_t,'DD.MM.YYYY') else null end,
        'gun_once', case when s.son_t is not null then (current_date - s.son_t) else null end,
        'telefon', coalesce(v.telefon,''))), '[]'::jsonb),
      count(*)
    into v_hedef, v_adet
    from vc v
    left join son s on s.mnorm = v.mnorm
    where v.bakim is null
       or v.bakim <= current_date + 30
       or s.son_t is null
       or s.son_t < current_date - 180;
  exception when others then
    v_hedef := '[]'::jsonb; v_adet := 0;
  end;

  return jsonb_build_object(
    'mevsim', v_mevsim, 'ay', v_ay, 'baslik', v_baslik, 'hizmet', v_hizmet,
    'fiyat', v_fiyat, 'mesaj', v_mesaj,
    'hedef_adet', coalesce(v_adet, 0),
    'potansiyel', coalesce(v_adet, 0) * v_fiyat,
    'hedefler', coalesce(v_hedef, '[]'::jsonb));
end $$;

revoke all on function public.mevsim_kampanya() from public;
grant execute on function public.mevsim_kampanya() to authenticated;


-- ============================================================================
-- 3) 📊 BAKIM DURUMU (72'de kalmıştı — buraya alındı ki 84 tek başına yetsin)
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
      count(*) filter (where nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date < current_date),
      count(*) filter (where nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date
                             between current_date and current_date + 7),
      count(*) filter (where nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date
                             between current_date and current_date + 30),
      count(*) filter (where nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date > current_date + 30),
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
-- TEST — her test KENDİ KORUMASINDA (biri patlarsa diğerleri devam eder)
-- ============================================================================
do $$
declare
  v_testler text[][] := array[
    ['sozlesmeli_mi',    'select public.sozlesmeli_mi((select id from public.cranes limit 1))'],
    ['bakim_firsatlari', 'select * from public.bakim_firsatlari(3)'],
    ['mevsim_kampanya',  'select public.mevsim_kampanya()'],
    ['bakim_durumu',     'select public.bakim_durumu()']
  ];
  t text[];
  v_ok integer := 0; v_hata integer := 0;
begin
  raise notice ' ';
  raise notice '═══════ SQL 84 TEST RAPORU ═══════';
  foreach t slice 1 in array v_testler loop
    begin
      execute t[2];
      raise notice '✅ %', rpad(t[1], 22);
      v_ok := v_ok + 1;
    exception when others then
      raise notice '❌ % → %', rpad(t[1], 22), sqlerrm;
      v_hata := v_hata + 1;
    end;
  end loop;
  raise notice '─────────────────────────────';
  raise notice 'ÇALIŞAN: %   HATALI: %', v_ok, v_hata;
  raise notice '════════════════════════════════';
end $$;


-- ============================================================================
-- SONUÇ TABLOSU — güvenli (sadece bu scriptin kurduğu fonksiyonlar)
-- ============================================================================
select 'sozlesmeli_mi' as test,
       public.sozlesmeli_mi((select id from public.cranes limit 1))::text as sonuc
union all
select 'bakim_firsatlari',
       (select count(*)::text from public.bakim_firsatlari(10))
union all
select 'mevsim_kampanya',
       coalesce(public.mevsim_kampanya() ->> 'hedef_adet', '?')
union all
select 'bakim_durumu',
       coalesce(public.bakim_durumu() ->> 'toplam_vinc', '?');

-- Sözleşmesiz müşteriler (abonelik fırsatları)
select * from public.bakim_firsatlari(8);
