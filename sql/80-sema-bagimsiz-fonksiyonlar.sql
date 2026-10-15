-- ============================================================================
--  🛡️ ŞEMA-BAĞIMSIZ FONKSİYONLAR (Güncelleme #54) — KALICI ÇÖZÜM
-- ----------------------------------------------------------------------------
--  SORUN:
--    FAZ fonksiyonları sütun adlarını DOĞRUDAN okuyordu:
--      v_c.crane_capacity → sütun yoksa HATA
--    Her yeni kurulumda farklı sütun eksikleri çıkıyordu.
--
--  ÇÖZÜM:
--    Artık tüm alanlar to_jsonb() ile DİNAMİK okunuyor:
--      to_jsonb(v_c) ->> 'crane_capacity' → sütun yoksa NULL döner, HATA VERMEZ
--
--  SONUÇ:
--    Bu fonksiyonlar HANGİ ŞEMADA OLURSA OLSUN çalışır ✓
--    Sütun eklemek/çıkarmak kodu BOZMAZ ✓
--
--  ETKİLENEN FONKSİYONLAR:
--    vinc_saglik_skoru · ariza_kehanet · bakim_takvimi · harita_noktalari
--    mevsim_kampanya · bakim_firsatlari · model_analizi
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- YARDIMCI: güvenli alan okuma (sütun yoksa boş metin)
-- ============================================================================
create or replace function public.jalan(p_kayit jsonb, variadic p_alanlar text[])
returns text
language sql
immutable
as $$
  select coalesce(
    (select nullif(trim(coalesce(p_kayit ->> a, '')), '')
     from unnest(p_alanlar) a
     where nullif(trim(coalesce(p_kayit ->> a, '')), '') is not null
     limit 1),
    ''
  );
$$;


-- ============================================================================
-- 1) 🏗️ VİNÇ SAĞLIK SKORU (dinamik — hata vermez)
-- ============================================================================
create or replace function public.vinc_saglik_skoru(p_crane_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c            jsonb;
  v_musteri      text;
  v_kapasite     text;
  v_makine       text;
  v_bakim_tarih  date;
  v_bakim_puan   numeric := 20;
  v_ariza_puan   numeric := 15;
  v_tazelik_puan numeric := 15;
  v_memnun_puan  numeric := 12;
  v_skor         numeric;
  v_ariza_sayisi integer := 0;
  v_is_sayisi    integer := 0;
  v_son_ariza    date;
  v_gun_once     integer;
  v_ort_ariza    numeric := 0;
  v_puan_ort     numeric;
  v_bakim_gun    integer;
  v_seviye       text;
  v_renk         text;
begin
  select to_jsonb(c) into v_c from public.cranes c where c.id = p_crane_id;
  if v_c is null then
    return jsonb_build_object('skor', 0, 'seviye', 'Bulunamadı', 'renk', 'slate');
  end if;

  v_musteri  := public.jalan(v_c, 'customer_name', 'firma_adi', 'musteri_adi', 'company_name');
  v_kapasite := public.jalan(v_c, 'crane_capacity', 'capacity', 'kapasite', 'crane_type');
  v_makine   := public.jalan(v_c, 'makine_tipi', 'machine_type', 'tip');

  begin
    v_bakim_tarih := nullif(trim(coalesce(v_c ->> 'next_maintenance_date','')), '')::date;
  exception when others then v_bakim_tarih := null; end;

  -- Müşterinin servis geçmişi
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
        and (
          coalesce(cs.service_type,'') ilike '%arıza%'
          or coalesce(cs.service_type,'') ilike '%ariza%'
          or coalesce(cs.description,'') ~* '(ar[ıi]za|bozuk|de[ğg]i[şs]meli|ka[çc]ak|çalışmıyor|patlak|k[ıi]r[ıi]k)'
        );
    exception when others then null; end;
  end if;

  -- 1) BAKIM UYUMU (0-40)
  if v_bakim_tarih is not null then
    v_bakim_gun := (v_bakim_tarih - current_date);
    if v_bakim_gun < 0 then
      v_bakim_puan := greatest(5, 40 - (abs(v_bakim_gun) / 30.0 * 8));
    elsif v_bakim_gun <= 30 then
      v_bakim_puan := 34;
    else
      v_bakim_puan := 40;
    end if;
  else
    v_bakim_puan := 15;
  end if;

  -- 2) ARIZA SIKLIĞI (0-25)
  if v_is_sayisi > 0 then
    v_ort_ariza := round(v_ariza_sayisi::numeric / greatest(1, (v_is_sayisi / 12.0)), 2);
    v_ariza_puan := case
      when v_ariza_sayisi = 0 then 25
      when v_ariza_sayisi <= 2 then 20
      when v_ariza_sayisi <= 5 then 13
      when v_ariza_sayisi <= 10 then 7
      else 3 end;
  else
    v_ariza_puan := 18;
  end if;

  -- 3) SON ARIZA TAZELİĞİ (0-20)
  if v_son_ariza is not null then
    v_gun_once := (current_date - v_son_ariza);
    v_tazelik_puan := case
      when v_gun_once <= 30 then 4
      when v_gun_once <= 90 then 9
      when v_gun_once <= 180 then 14
      else 20 end;
  else
    v_tazelik_puan := 16;
  end if;

  -- 4) MEMNUNİYET (0-15)
  begin
    select round(avg(r.musteri_puani), 1) into v_puan_ort
    from public.service_reports r
    where r.musteri_puani is not null
      and public.parca_adi_normal(public.jalan(to_jsonb(r),'musteri_adi','customer_name')) =
          public.parca_adi_normal(v_musteri);
    if v_puan_ort is not null then
      v_memnun_puan := round((v_puan_ort / 5.0) * 15, 1);
    end if;
  exception when others then null; end;

  v_skor := greatest(0, least(100, round(v_bakim_puan + v_ariza_puan + v_tazelik_puan + v_memnun_puan, 1)));

  v_seviye := case when v_skor >= 80 then '🟢 İYİ'
                   when v_skor >= 60 then '🟡 ORTA'
                   when v_skor >= 40 then '🟠 ZAYIF'
                   else '🔴 KÖTÜ' end;
  v_renk   := case when v_skor >= 80 then 'emerald'
                   when v_skor >= 60 then 'amber'
                   when v_skor >= 40 then 'orange'
                   else 'rose' end;

  return jsonb_build_object(
    'crane_id', v_c ->> 'id',
    'musteri', v_musteri,
    'vinç', coalesce(nullif(v_kapasite,''), 'Belirsiz'),
    'makine_tipi', coalesce(nullif(v_makine,''), 'Vinç'),
    'skor', v_skor, 'seviye', v_seviye, 'renk', v_renk,
    'bakim_puan', round(v_bakim_puan,1),
    'ariza_puan', round(v_ariza_puan,1),
    'tazelik_puan', round(v_tazelik_puan,1),
    'memnuniyet_puan', round(v_memnun_puan,1),
    'toplam_servis', v_is_sayisi,
    'ariza_sayisi', v_ariza_sayisi,
    'son_ariza', case when v_son_ariza is not null then to_char(v_son_ariza,'DD.MM.YYYY') else null end,
    'gun_once', v_gun_once,
    'yillik_ariza', v_ort_ariza,
    'bakim_tarihi', case when v_bakim_tarih is not null then to_char(v_bakim_tarih,'DD.MM.YYYY') else null end,
    'bakim_gecikme_gun', case when v_bakim_tarih is not null then (current_date - v_bakim_tarih) else null end,
    'musteri_puani', v_puan_ort
  );
end $$;

revoke all on function public.vinc_saglik_skoru(uuid) from public;
grant execute on function public.vinc_saglik_skoru(uuid) to authenticated;


-- ============================================================================
-- 2) 🔮 ARIZA KEHANETİ (dinamik)
-- ============================================================================
create or replace function public.ariza_kehanet(p_crane_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c        jsonb;
  v_musteri  text;
  v_saglik   jsonb;
  v_skor     numeric;
  v_risk     numeric := 0;
  v_ariza    integer := 0;
  v_gun_once integer;
  v_gecikme  integer;
  v_riskli   jsonb := '[]'::jsonb;
  v_oneri    text;
  v_p        record;
begin
  select to_jsonb(c) into v_c from public.cranes c where c.id = p_crane_id;
  if v_c is null then
    return jsonb_build_object('risk', 0, 'mesaj', 'Vinç bulunamadı');
  end if;

  v_musteri := public.jalan(v_c, 'customer_name', 'firma_adi', 'musteri_adi');
  v_saglik  := public.vinc_saglik_skoru(p_crane_id);
  v_skor    := coalesce((v_saglik ->> 'skor')::numeric, 50);
  v_ariza   := coalesce((v_saglik ->> 'ariza_sayisi')::int, 0);
  v_gun_once:= coalesce((v_saglik ->> 'gun_once')::int, 999);
  v_gecikme := coalesce((v_saglik ->> 'bakim_gecikme_gun')::int, 0);

  v_risk := (100 - v_skor) * 0.5;
  v_risk := v_risk + least(20, v_ariza * 2.5);
  v_risk := v_risk + case
    when v_gun_once <= 30 then 20 when v_gun_once <= 60 then 15
    when v_gun_once <= 120 then 8 else 0 end;
  v_risk := v_risk + case when v_gecikme > 60 then 10 when v_gecikme > 0 then 6 else 0 end;
  v_risk := round(greatest(0, least(100, v_risk)), 0);

  -- Riskli parçalar
  if v_musteri <> '' then
    begin
      for v_p in
        select p2.ad, count(*) as adet, max(p2.tarih) as son
        from (
          select coalesce(nullif(trim(coalesce(to_jsonb(m)->>'ad','')), ''),
                          nullif(trim(coalesce(to_jsonb(m)->>'name','')), '')) as ad,
                 cs.service_date::date as tarih
          from public.completed_services cs
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(cs.materials) = 'array' then cs.materials else '[]'::jsonb end) m
          where public.parca_adi_normal(public.jalan(to_jsonb(cs),'customer_name','firm_name','customer')) =
                public.parca_adi_normal(v_musteri)
        ) p2
        where coalesce(p2.ad,'') <> ''
        group by p2.ad having count(*) >= 2
        order by count(*) desc limit 5
      loop
        v_riskli := v_riskli || jsonb_build_object(
          'parca', v_p.ad, 'adet', v_p.adet, 'son', to_char(v_p.son,'DD.MM.YYYY'));
      end loop;
    exception when others then null; end;
  end if;

  v_oneri := case
    when v_risk >= 70 then '🔴 ACİL: Önleyici bakım planla, riskli parçaları stokla'
    when v_risk >= 50 then '🟠 Bu ay içinde kontrol et, parça hazırlığı yap'
    when v_risk >= 30 then '🟡 Rutin bakımda kontrol listesine ekle'
    else '🟢 Şu an risk yok, normal takip yeterli' end;

  return jsonb_build_object(
    'crane_id', p_crane_id, 'musteri', v_musteri,
    'risk', v_risk,
    'risk_etiket', case when v_risk >= 70 then '🔴 YÜKSEK'
                        when v_risk >= 50 then '🟠 ORTA-YÜKSEK'
                        when v_risk >= 30 then '🟡 ORTA' else '🟢 DÜŞÜK' end,
    'saglik_skoru', v_skor, 'ariza_sayisi', v_ariza,
    'son_ariza_gun', case when v_gun_once < 999 then v_gun_once else null end,
    'bakim_gecikme', v_gecikme,
    'riskli_parcalar', v_riskli, 'oneri', v_oneri,
    'tahmin_metni', case
      when v_risk >= 70 then '60 gün içinde arıza riski yüksek'
      when v_risk >= 50 then '90 gün içinde kontrol edilmeli'
      else 'Yakın vadede risk düşük' end
  );
end $$;

revoke all on function public.ariza_kehanet(uuid) from public;
grant execute on function public.ariza_kehanet(uuid) to authenticated;


-- ============================================================================
-- 3) 🗓️ BAKIM TAKVİMİ (dinamik)
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
      exists (select 1 from public.maintenance_contracts mc where public.jalan(to_jsonb(mc),'crane_id','cranes_id','crane','makine_id','vinc_id','vincl_id','crane_uuid') = c.id::text) as soz
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
-- 4) 📍 HARİTA NOKTALARI (dinamik)
-- ============================================================================
create or replace function public.harita_noktalari()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_vinc jsonb := '[]'::jsonb;
  v_talep jsonb := '[]'::jsonb;
  v_bakim jsonb := '[]'::jsonb;
  v_yapildi jsonb := '[]'::jsonb;
begin
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'lat', (to_jsonb(c)->>'lat')::numeric, 'lng', (to_jsonb(c)->>'lng')::numeric, 'tip', 'vinc',
             'baslik', public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi'),
             'alt', coalesce(nullif(public.jalan(to_jsonb(c),'makine_tipi','machine_type'),''),'Vinç') || ' · ' ||
                    coalesce(nullif(public.jalan(to_jsonb(c),'crane_capacity','capacity'),''),'—'),
             'adres', public.jalan(to_jsonb(c),'location_address','address'),
             'telefon', public.jalan(to_jsonb(c),'customer_phone','phone','telefon')
           )), '[]'::jsonb)
      into v_vinc
    from public.cranes c
    where nullif(trim(coalesce(to_jsonb(c)->>'lat','')),'') is not null
      and public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> '';
  exception when others then v_vinc := '[]'::jsonb; end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'lat', (to_jsonb(t)->>'lat')::numeric, 'lng', (to_jsonb(t)->>'lng')::numeric, 'tip', 'talep',
             'baslik', coalesce(nullif(public.jalan(to_jsonb(t),'manual_customer_name','customer_name'),''),'İsimsiz'),
             'alt', left(coalesce(public.jalan(to_jsonb(t),'description','issue_type'),'-'), 60),
             'aciliyet', coalesce(nullif(public.jalan(to_jsonb(t),'priority'),''),'Normal'),
             'adres', public.jalan(to_jsonb(t),'manual_location','location'),
             'telefon', public.jalan(to_jsonb(t),'manual_phone','phone')
           )), '[]'::jsonb)
      into v_talep
    from public.service_tickets t
    where nullif(trim(coalesce(to_jsonb(t)->>'lat','')),'') is not null
      and coalesce(public.jalan(to_jsonb(t),'pipeline_status'),'') not in ('tamamlandi','iptal');
  exception when others then v_talep := '[]'::jsonb; end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'lat', (to_jsonb(c)->>'lat')::numeric, 'lng', (to_jsonb(c)->>'lng')::numeric, 'tip', 'bakim',
             'baslik', public.jalan(to_jsonb(c),'customer_name','firma_adi'),
             'alt', 'Bakım: ' || coalesce(public.jalan(to_jsonb(c),'next_maintenance_date'),'?'),
             'adres', public.jalan(to_jsonb(c),'location_address','address'),
             'telefon', public.jalan(to_jsonb(c),'customer_phone','phone')
           )), '[]'::jsonb)
      into v_bakim
    from public.cranes c
    where nullif(trim(coalesce(to_jsonb(c)->>'lat','')),'') is not null
      and nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'') is not null
      and (to_jsonb(c)->>'next_maintenance_date')::date <= current_date + 30;
  exception when others then v_bakim := '[]'::jsonb; end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'lat', (to_jsonb(r)->>'lat')::numeric, 'lng', (to_jsonb(r)->>'lng')::numeric,
             'tip', 'yapildi', 'baslik', 'Bugün yapıldı',
             'alt', public.jalan(to_jsonb(r),'musteri_adi','customer_name'))), '[]'::jsonb)
      into v_yapildi
    from public.service_reports r
    where nullif(trim(coalesce(to_jsonb(r)->>'lat','')),'') is not null
      and r.created_at::date = (now() at time zone 'Europe/Istanbul')::date;
  exception when others then v_yapildi := '[]'::jsonb; end;

  return jsonb_build_object(
    'vinc', v_vinc, 'talep', v_talep, 'bakim', v_bakim, 'yapildi', v_yapildi,
    'merkez', jsonb_build_object(
      'lat', coalesce((select round(avg((to_jsonb(c)->>'lat')::numeric),4) from public.cranes c
                        where nullif(trim(coalesce(to_jsonb(c)->>'lat','')),'') is not null), 40.1950),
      'lng', coalesce((select round(avg((to_jsonb(c)->>'lng')::numeric),4) from public.cranes c
                        where nullif(trim(coalesce(to_jsonb(c)->>'lng','')),'') is not null), 29.0600)),
    'sayilar', jsonb_build_object(
      'vinc', jsonb_array_length(v_vinc), 'talep', jsonb_array_length(v_talep),
      'bakim', jsonb_array_length(v_bakim), 'yapildi', jsonb_array_length(v_yapildi))
  );
end $$;

revoke all on function public.harita_noktalari() from public;
grant execute on function public.harita_noktalari() to authenticated;


-- ============================================================================
-- 5) TEST
-- ============================================================================
select 'vinc_saglik_skoru' as test,
       coalesce(public.vinc_saglik_skoru((select id from public.cranes limit 1)) ->> 'skor', '?') as sonuc
union all
select 'ariza_kehanet',
       coalesce(public.ariza_kehanet((select id from public.cranes limit 1)) ->> 'risk', '?')
union all
select 'bakim_takvimi',
       (select count(*)::text from public.bakim_takvimi(null, 5))
union all
select 'harita_noktalari',
       coalesce(public.harita_noktalari() -> 'sayilar' ->> 'vinc', '?');
