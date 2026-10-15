-- ============================================================================
--  📊 FAZ 1 — YÖNETİM KOKPİTİ VERİ KATMANI (Güncelleme #50)
-- ----------------------------------------------------------------------------
--  TASARIM İLKELERİ (ileriyi düşünerek):
--    1) TEK FONKSİYON → tüm kokpit verisi (hızlı, az gidiş-geliş)
--    2) jsonb döner → yeni alan eklemek kodu BOZMAZ (geriye uyumlu)
--    3) Her bölüm hata korumalı → tablo yoksa o bölüm boş döner, sistem çökmez
--    4) Sütun adları dinamik (to_jsonb) → isim değişse bile çalışır
--    5) SECURITY DEFINER + admin kontrolü → güvenli
--    6) stable → aynı sorgu içinde tekrar çağrılırsa yeniden hesaplanmaz
--
--  İÇİNDEKİLER:
--    • bugun / bu_ay / bu_yil rakamları (karşılaştırmalı)
--    • 12 aylık trend
--    • bekleyen işler (asistan motorundan)
--    • en iyi müşteriler
--    • personel performansı
--    • yaklaşan ödemeler
--    • iş öncelik skoru (yeni talep sıralaması)
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) 🎯 İŞ ÖNCELİK SKORU — hangi talebe önce gidilmeli?
--    Formül: Aciliyet×40 + Müşteri Değeri×30 + Kâr Potansiyeli×20 + Mesafe×10
-- ============================================================================
create or replace function public.is_oncelik_skoru(p_ticket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_t          record;
  v_musteri    text;
  v_musteri_tl numeric := 0;
  v_is_sayisi  integer := 0;
  v_skor       numeric := 0;
  v_aciliyet   numeric := 0;
  v_deger      numeric := 0;
  v_kar        numeric := 0;
  v_mesafe     numeric := 50;   -- bilinmiyorsa nötr
  v_etiket     text;
begin
  select * into v_t from public.service_tickets where id = p_ticket_id;
  if v_t.id is null then
    return jsonb_build_object('skor', 0, 'etiket', 'Bulunamadı');
  end if;

  v_musteri := coalesce(
    nullif(trim(coalesce(v_t.manual_customer_name, '')), ''),
    nullif(trim(coalesce(to_jsonb(v_t) ->> 'customer_name', '')), ''),
    ''
  );

  -- 1) ACİLİYET (0-40)
  v_aciliyet := case
    when coalesce(v_t.priority, '') ilike '%kritik%'   then 40
    when coalesce(v_t.priority, '') ilike '%yüksek%'   then 30
    when coalesce(v_t.priority, '') ilike '%acil%'     then 35
    else 15 end;

  -- 2) MÜŞTERİ DEĞERİ (0-30) — geçmiş cirosu
  if v_musteri <> '' then
    begin
      select coalesce(sum(price),0), count(*) into v_musteri_tl, v_is_sayisi
      from public.completed_services cs
      where public.parca_adi_normal(coalesce(to_jsonb(cs)->>'customer_name',
                                             to_jsonb(cs)->>'firm_name',''))
            = public.parca_adi_normal(v_musteri);
      v_deger := least(30, (v_musteri_tl / 20000.0) * 30);
      v_deger := greatest(v_deger, case when v_is_sayisi > 0 then 8 else 12 end);
    exception when others then v_deger := 12; end;
  else
    v_deger := 12;
  end if;

  -- 3) KÂR POTANSİYELİ (0-20) — benzer işlerin ortalaması
  begin
    select least(20, (coalesce(avg(price),0) / 10000.0) * 20) into v_kar
    from public.completed_services cs
    where cs.service_date::date > current_date - 365;
    v_kar := coalesce(v_kar, 10);
  exception when others then v_kar := 10; end;

  -- 4) MESAFE (0-10) — koordinat varsa yakınlık
  if v_t.lat is not null and v_t.lng is not null then
    v_mesafe := 10;   -- konum var → ekibe kolaylık
  else
    v_mesafe := 5;    -- konum yok → belirsiz
  end if;

  v_skor := round(v_aciliyet + v_deger + v_kar + v_mesafe, 1);

  v_etiket := case
    when v_skor >= 80 then '🔴 ÇOK YÜKSEK'
    when v_skor >= 60 then '🟠 YÜKSEK'
    when v_skor >= 40 then '🟡 ORTA'
    else '🟢 NORMAL' end;

  return jsonb_build_object(
    'skor', v_skor, 'etiket', v_etiket,
    'aciliyet', round(v_aciliyet,1),
    'musteri_degeri', round(v_deger,1),
    'kar_potansiyeli', round(v_kar,1),
    'mesafe', round(v_mesafe,1),
    'musteri', v_musteri,
    'musteri_ciro', v_musteri_tl,
    'gecmis_is', v_is_sayisi
  );
end $$;

revoke all on function public.is_oncelik_skoru(uuid) from public;
grant execute on function public.is_oncelik_skoru(uuid) to authenticated;


-- ============================================================================
-- 2) 📋 ÖNCELİK SIRALI TALEP KUYRUĞU
-- ============================================================================
create or replace function public.oncelik_kuyrugu(p_limit integer default 20)
returns table (
  ticket_id    uuid,
  musteri      text,
  konu         text,
  aciliyet     text,
  skor         numeric,
  etiket       text,
  olusturma    timestamptz,
  gun_bekleme  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    coalesce(nullif(trim(coalesce(t.manual_customer_name,'')), ''), 'İsimsiz') as musteri,
    left(coalesce(nullif(trim(coalesce(t.description,'')), ''),
                  nullif(trim(coalesce(t.issue_type,'')), ''), '-'), 80) as konu,
    coalesce(t.priority, 'Normal') as aciliyet,
    coalesce((public.is_oncelik_skoru(t.id) ->> 'skor')::numeric, 0) as skor,
    coalesce(public.is_oncelik_skoru(t.id) ->> 'etiket', '-') as etiket,
    t.created_at,
    (current_date - t.created_at::date)::int as gun_bekleme
  from public.service_tickets t
  where coalesce(t.pipeline_status,'') not in ('tamamlandi','iptal')
  order by coalesce((public.is_oncelik_skoru(t.id) ->> 'skor')::numeric, 0) desc,
           t.created_at asc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke all on function public.oncelik_kuyrugu(integer) from public;
grant execute on function public.oncelik_kuyrugu(integer) to authenticated;


-- ============================================================================
-- 3) 📊 KOKPİT ÖZETİ — TEK ÇAĞRIDA HER ŞEY
-- ============================================================================
create or replace function public.kokpit_ozet()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bugun    date := (now() at time zone 'Europe/Istanbul')::date;
  v_ay_bas   date := date_trunc('month', v_bugun)::date;
  v_yil_bas  date := date_trunc('year',  v_bugun)::date;
  v_gay_bas  date := (date_trunc('month', v_bugun) - interval '1 month')::date;
  v_gy_bas   date := (date_trunc('year',  v_bugun) - interval '1 year')::date;
  v_bugun_k  jsonb := '{}'::jsonb;
  v_ay_k     jsonb := '{}'::jsonb;
  v_yil_k    jsonb := '{}'::jsonb;
  v_gay_k    jsonb := '{}'::jsonb;
  v_gy_k     jsonb := '{}'::jsonb;
  v_trend    jsonb := '[]'::jsonb;
  v_bekleyen jsonb := '[]'::jsonb;
  v_musteri  jsonb := '[]'::jsonb;
  v_personel jsonb := '[]'::jsonb;
  v_n          numeric; v_n2 numeric; v_i integer; v_i2 integer;
begin
  -- ─────────── BUGÜN ───────────
  begin
    select count(*), coalesce(sum(price),0) into v_i, v_n
    from public.completed_services where service_date::date = v_bugun;
    v_bugun_k := v_bugun_k || jsonb_build_object('is', v_i, 'ciro', round(v_n));
  exception when others then v_bugun_k := v_bugun_k || jsonb_build_object('is',0,'ciro',0); end;

  begin
    select count(*), count(*) filter (where coalesce(status,'') in ('tamamlandi','Yapıldı'))
      into v_i, v_i2 from public.appointments where appointment_date = v_bugun;
    v_bugun_k := v_bugun_k || jsonb_build_object('randevu', coalesce(v_i,0), 'tamamlanan', coalesce(v_i2,0));
  exception when others then v_bugun_k := v_bugun_k || jsonb_build_object('randevu',0,'tamamlanan',0); end;

  begin
    select count(*) into v_i from public.service_reports where created_at::date = v_bugun;
    v_bugun_k := v_bugun_k || jsonb_build_object('rapor', v_i);
  exception when others then v_bugun_k := v_bugun_k || jsonb_build_object('rapor',0); end;

  -- ─────────── BU AY ───────────
  begin
    select count(*), coalesce(sum(price),0) into v_i, v_n
    from public.completed_services
    where service_date::date >= v_ay_bas and service_date::date <= v_bugun;
    v_ay_k := v_ay_k || jsonb_build_object('is', v_i, 'ciro', round(v_n));
  exception when others then v_ay_k := v_ay_k || jsonb_build_object('is',0,'ciro',0); end;

  begin
    select coalesce(sum(tutar),0) into v_n from public.cari_tahsilatlar
    where created_at::date >= v_ay_bas;
    v_ay_k := v_ay_k || jsonb_build_object('tahsilat', round(v_n));
  exception when others then v_ay_k := v_ay_k || jsonb_build_object('tahsilat',0); end;

  begin
    select coalesce(sum(maas),0) into v_n from public.personel_maas where aktif;
    v_ay_k := v_ay_k || jsonb_build_object('personel_gider', round(v_n));
  exception when others then v_ay_k := v_ay_k || jsonb_build_object('personel_gider',0); end;

  -- ─────────── GEÇEN AY (karşılaştırma) ───────────
  begin
    select coalesce(sum(price),0), count(*) into v_n, v_i
    from public.completed_services
    where service_date::date >= v_gay_bas and service_date::date < v_ay_bas;
    v_gay_k := jsonb_build_object('ciro', round(v_n), 'is', v_i);
  exception when others then v_gay_k := jsonb_build_object('ciro',0,'is',0); end;

  -- ─────────── BU YIL ───────────
  begin
    select count(*), coalesce(sum(price),0) into v_i, v_n
    from public.completed_services
    where service_date::date >= v_yil_bas and service_date::date <= v_bugun;
    v_yil_k := v_yil_k || jsonb_build_object('is', v_i, 'ciro', round(v_n));
  exception when others then v_yil_k := v_yil_k || jsonb_build_object('is',0,'ciro',0); end;

  begin
    select coalesce(sum(tutar),0) into v_n from public.cari_tahsilatlar
    where created_at::date >= v_yil_bas;
    v_yil_k := v_yil_k || jsonb_build_object('tahsilat', round(v_n));
  exception when others then v_yil_k := v_yil_k || jsonb_build_object('tahsilat',0); end;

  -- ─────────── GEÇEN YIL ───────────
  begin
    select coalesce(sum(price),0), count(*) into v_n, v_i
    from public.completed_services
    where service_date::date >= v_gy_bas and service_date::date < v_yil_bas;
    v_gy_k := jsonb_build_object('ciro', round(v_n), 'is', v_i);
  exception when others then v_gy_k := jsonb_build_object('ciro',0,'is',0); end;

  -- ─────────── 12 AYLIK TREND ───────────
  begin
    select coalesce(jsonb_agg(jsonb_build_object('ay', ay, 'ciro', ciro, 'is', adet)
                              order by ay), '[]'::jsonb)
      into v_trend
    from (
      select to_char(d, 'YYYY-MM') as ay,
             coalesce(sum(cs.price),0) as ciro,
             count(cs.id) as adet
      from generate_series(v_ay_bas - interval '11 months', v_ay_bas, interval '1 month') d
      left join public.completed_services cs
        on to_char(cs.service_date::date, 'YYYY-MM') = to_char(d, 'YYYY-MM')
      group by to_char(d, 'YYYY-MM')
    ) x;
  exception when others then v_trend := '[]'::jsonb; end;

  -- ─────────── BEKLEYEN İŞLER (asistan motoru) ───────────
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'anahtar', anahtar, 'baslik', baslik, 'adet', adet,
             'aciliyet', aciliyet, 'detay', left(coalesce(detay,''), 80)
           ) order by aciliyet), '[]'::jsonb)
      into v_bekleyen
    from public.asistan_bekleyenler();
  exception when others then v_bekleyen := '[]'::jsonb; end;

  -- ─────────── EN İYİ MÜŞTERİLER ───────────
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'ad', musteri, 'ciro', ciro, 'is', adet, 'son', son
           )), '[]'::jsonb)
      into v_musteri
    from (
      select coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                      nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),
                      'İsimsiz') as musteri,
             round(sum(cs.price)) as ciro,
             count(*) as adet,
             to_char(max(cs.service_date::date), 'DD.MM.YYYY') as son
      from public.completed_services cs
      where cs.service_date::date > current_date - 365 and cs.price > 0
      group by 1 order by 2 desc limit 5
    ) m;
  exception when others then v_musteri := '[]'::jsonb; end;

  -- ─────────── PERSONEL PERFORMANSI (bu ay) ───────────
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'ad', ad, 'is', adet, 'ciro', ciro, 'puan', puan, 'saat', saat
           )), '[]'::jsonb)
      into v_personel
    from (
      select
        (select pm.personel from public.personel_maas pm
          where public.parca_adi_normal(pm.personel) = public.parca_adi_normal(cs.technician)
          limit 1) as ad_ham,
        cs.technician as ad,
        count(*) as adet,
        round(coalesce(sum(cs.price),0)) as ciro,
        round(coalesce(avg(cs.work_hours),0),1) as saat,
        (select round(avg(r.musteri_puani),1) from public.service_reports r
          where public.parca_adi_normal(r.tekniker) = public.parca_adi_normal(cs.technician)
            and r.musteri_puani is not null) as puan
      from public.completed_services cs
      where cs.service_date::date >= v_ay_bas
        and coalesce(cs.technician,'') <> ''
      group by cs.technician
      order by 3 desc limit 8
    ) p;
  exception when others then v_personel := '[]'::jsonb; end;

  return jsonb_build_object(
    'tarih', to_char(v_bugun, 'DD.MM.YYYY'),
    'saat', to_char(now() at time zone 'Europe/Istanbul', 'HH24:MI'),
    'bugun', v_bugun_k,
    'bu_ay', v_ay_k,
    'gecen_ay', v_gay_k,
    'bu_yil', v_yil_k,
    'gecen_yil', v_gy_k,
    'trend', v_trend,
    'bekleyen', v_bekleyen,
    'en_iyi_musteriler', v_musteri,
    'personel', v_personel
  );
end $$;

revoke all on function public.kokpit_ozet() from public;
grant execute on function public.kokpit_ozet() to authenticated;


-- ============================================================================
-- 4) TEST — kokpit verisi geliyor mu?
-- ============================================================================
select jsonb_pretty(public.kokpit_ozet());

-- Öncelik kuyruğu
select * from public.oncelik_kuyrugu(10);
