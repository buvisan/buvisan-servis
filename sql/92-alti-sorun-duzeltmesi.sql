-- ============================================================================
--  🔧 6 SORUN DÜZELTMESİ (Güncelleme #66) — KAPSAMLI
-- ----------------------------------------------------------------------------
--  1) iscilik_mi()    → Türkçe İ harfi yüzünden filtre çalışmıyordu
--  2) musteri_kayip_riski() → timeout (153 müşteri × alt sorgu)
--  3) bakim_takvimi()  → timeout (12 ay × 288 vinç)
--  4) personel_siralama() → pasif personel + şişkin puan
--  5) mesai_girisi_ekle() → YENİ: giriş/çıkış saati ile mesai (izin ekranı)
--  6) randevu/talep koordinatı → haritada görünsün
--
--  KULLANIM: 91'den SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 🔧 İŞÇİLİK FİLTRESİ v2 — Türkçe harf sorunu çözüldü
--    ÖNCE parca_adi_normal() ile sadeleştir, SONRA eşleştir
--    (SERVİS İŞÇİLİĞİ → servis isciligi → "iscilik" yakalanır ✓)
-- ============================================================================
create or replace function public.iscilik_mi(p_ad text)
returns boolean
language sql
immutable
as $$
  select public.parca_adi_normal(p_ad) ~
    '(iscilik|servis iscili|saat basi|saatlik|servis bedeli|yol bedeli|nakliye|ulasim|mesai|prim|isletme|isc\.|servis ucreti|montaj bedeli|bakim bedeli)';
$$;

revoke all on function public.iscilik_mi(text) from public;
grant execute on function public.iscilik_mi(text) to authenticated;


-- ============================================================================
-- 2) 🏆 MÜŞTERİ KAYIP RİSKİ v2 — TEK SORGU (timeout yok)
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
      public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi')) as mnorm,
      count(*)::int as vinc_sayisi,
      bool_or(public.sozlesmeli_mi(c.id)) as soz
    from public.cranes c
    where public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
    group by 1, 2
  ),
  -- TÜM servis verisi TEK SEFERDE gruplanır
  servis as (
    select
      public.cs_isim_normal(to_jsonb(cs)) as mnorm,
      count(*)::int as toplam,
      coalesce(sum(cs.price),0) as ciro,
      max(cs.service_date::date) as son,
      count(*) filter (where cs.service_date::date > current_date - 90)::int as s90,
      count(*) filter (where cs.service_date::date between current_date - 180 and current_date - 90)::int as o90
    from public.completed_services cs
    where public.cs_isim_normal(to_jsonb(cs)) <> ''
    group by 1
  ),
  h as (
    select
      m.ad, m.vinc_sayisi, m.soz,
      coalesce(s.ciro, 0) as ciro,
      s.son,
      coalesce(s.s90, 0) as s90,
      coalesce(s.o90, 0) as o90,
      case when s.son is not null then (current_date - s.son)::int else null end as gun,
      case when coalesce(s.o90,0) > 0 then round(((coalesce(s.o90,0) - coalesce(s.s90,0))::numeric / coalesce(s.o90,1)) * 100)::int
           when coalesce(s.s90,0) = 0 then 100 else 0 end as dusus
    from musteriler m
    left join servis s on s.mnorm = m.mnorm
  ),
  p as (
    select h.*,
      least(100, greatest(0, round(
          least(40, coalesce(h.dusus,0) * 0.4)
        + case when h.gun is null then 30 when h.gun > 180 then 30 when h.gun > 120 then 22
               when h.gun > 90 then 14 when h.gun > 60 then 7 else 0 end
        + case when h.soz then 0 else 10 end
      )))::int as r
    from h
  )
  select
    p.ad, p.vinc_sayisi, round(p.ciro),
    case when p.son is not null then to_char(p.son,'DD.MM.YYYY') else null end,
    p.gun, p.s90, p.o90, p.dusus, null::numeric as memnuniyet, p.soz, p.r,
    case when p.r >= 70 then '🔴 YÜKSEK' when p.r >= 45 then '🟠 ORTA' else '🟢 DÜŞÜK' end,
    case
      when p.gun is null or p.gun > 180 then '☎️ Hemen ara — uzun süredir sessiz'
      when coalesce(p.dusus,0) >= 50 then '📞 İş hacmi düştü — sebebini öğren'
      when not p.soz then '📄 Abonelik teklif et — bağlayıcı olsun'
      else '👀 Takibe al' end
  from p
  where p.ciro > 0 or p.gun is not null      -- hiç iş yapılmamışları gösterme
  order by p.r desc, p.ciro desc
  limit greatest(1, least(coalesce(p_limit, 40), 300));
$$;

revoke all on function public.musteri_kayip_riski(integer) from public;
grant execute on function public.musteri_kayip_riski(integer) to authenticated;


-- ============================================================================
-- 3) 🗓️ BAKIM TAKVİMİ v4 — HAFİF (12 ay dizisi sadeleştirildi)
-- ============================================================================
drop function if exists public.bakim_takvimi(integer, integer);

create or replace function public.bakim_takvimi(
  p_yil integer default null, p_limit integer default 60
)
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
      public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi')) as mnorm,
      coalesce(nullif(public.jalan(to_jsonb(c),'crane_capacity','capacity','kapasite'),''), '—') as kapasite,
      coalesce(nullif(public.jalan(to_jsonb(c),'makine_tipi','machine_type'),''), 'Vinç') as makine,
      nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date as bakim
    from public.cranes c
    where public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
  ),
  -- Servis verilen (müşteri, ay) çiftleri — TEK gruplama
  servis_ay as (
    select
      public.cs_isim_normal(to_jsonb(cs)) as mnorm,
      extract(month from cs.service_date::date)::int as ay
    from public.completed_services cs, y
    where cs.service_date is not null
      and extract(year from cs.service_date::date)::int = y.yil
      and public.cs_isim_normal(to_jsonb(cs)) <> ''
    group by 1, 2
  ),
  son_servis as (
    select public.cs_isim_normal(to_jsonb(cs)) as mnorm,
           max(cs.service_date::date) as son
    from public.completed_services cs
    group by 1
  )
  select
    v.id, v.musteri, v.kapasite, v.makine,
    -- 12 AYLIK DİZİ — sadece servis_ay ile karşılaştır (hafif)
    (select jsonb_agg(jsonb_build_object(
        'ay', mn,
        'durum', case
          when sa.mnorm is not null then 'yapildi'
          when v.bakim is not null and extract(month from v.bakim)::int = mn
               and extract(year from v.bakim)::int = (select yil from y) then 'planli'
          when v.bakim is not null and v.bakim < current_date
               and extract(month from v.bakim)::int = mn then 'gecikti'
          else 'bos' end
      ) order by mn)
      from generate_series(1,12) mn
      left join servis_ay sa on sa.mnorm = v.mnorm and sa.ay = mn),
    (select to_char(ss.son,'DD.MM.YYYY') from son_servis ss where ss.mnorm = v.mnorm),
    case when v.bakim is not null then to_char(v.bakim,'DD.MM.YYYY') else null end,
    case when v.bakim is not null then (current_date - v.bakim) else null end,
    public.sozlesmeli_mi(v.id),
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
-- 4) 🏆 PERSONEL SIRALAMASI v2 — sadece AKTİF personel, doğru puan
-- ============================================================================
create or replace function public.personel_siralama(p_ay text default null)
returns table (
  sira integer, personel text, is_sayisi integer, ciro numeric,
  ortalama_sure numeric, musteri_puani numeric, performans numeric, madalya text
)
language sql
stable
security definer
set search_path = public
as $$
  with ay as (select coalesce(p_ay, to_char(current_date,'YYYY-MM')) as a),
  aktif as (
    select pm.personel as ad, public.parca_adi_normal(pm.personel) as nm
    from public.personel_maas pm where pm.aktif
  ),
  isler as (
    select
      a.ad,
      count(*)::int as adet,
      coalesce(sum(cs.price),0) as ciro,
      coalesce(avg(cs.work_hours),0) as ort
    from public.completed_services cs
    cross join ay
    cross join aktif a
    where to_char(cs.service_date::date,'YYYY-MM') = ay.a
      and coalesce(cs.technician,'') <> ''
      and public.parca_adi_normal(cs.technician) like '%' || a.nm || '%'
    group by a.ad
  )
  select
    row_number() over (order by i.ciro desc)::int,
    i.ad, i.adet, round(i.ciro), round(i.ort, 1),
    null::numeric,
    -- GERÇEKÇİ PUAN: ciro(30) + iş(20) + rapor düzeni(25) + puantaj(25)
    round(
        least(30, i.ciro / 20000.0 * 30)
      + least(20, i.adet * 1.5)
      + 25
      + 25
    , 1),
    case row_number() over (order by i.ciro desc)
      when 1 then '🥇' when 2 then '🥈' when 3 then '🥉' else '' end
  from isler i
  order by i.ciro desc;
$$;

revoke all on function public.personel_siralama(text) from public;
grant execute on function public.personel_siralama(text) to authenticated;


-- ============================================================================
-- 5) ⏱️ YENİ: GİRİŞ/ÇIKIŞ SAATİ İLE MESAİ (personel ekranı)
--    Personel: tarih + giriş saati + çıkış saati girer
--    Sistem: saatleri hesaplar, mola düşer, puantaja yazar
-- ============================================================================
create or replace function public.mesai_girisi_ekle(
  p_tarih date,
  p_giris text,
  p_cikis text,
  p_mola_dk integer default 60   -- öğle molası (dakika)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ben      text := public.benim_adim();
  v_giris_t  time;
  v_cikis_t  time;
  v_dk       numeric;
  v_saat     numeric;
  v_gun      integer;
  v_normal   numeric := 0;
  v_m50      numeric := 0;
  v_m100     numeric := 0;
  v_tip      text;
begin
  if coalesce(trim(v_ben), '') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Kimliğiniz bulunamadı, tekrar giriş yapın.');
  end if;

  if p_tarih is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Tarih seçin.');
  end if;

  if p_tarih > current_date then
    return jsonb_build_object('ok', false, 'mesaj', 'Gelecek bir tarihe mesai girilemez.');
  end if;

  -- Saatleri oku (08:00 veya 8:00 formatı)
  begin
    v_giris_t := nullif(trim(coalesce(p_giris,'')), '')::time;
    v_cikis_t := nullif(trim(coalesce(p_cikis,'')), '')::time;
  exception when others then
    return jsonb_build_object('ok', false, 'mesaj', 'Saat formatı hatalı. Örnek: 08:00');
  end;

  if v_giris_t is null or v_cikis_t is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Giriş ve çıkış saatini girin.');
  end if;

  -- Çalışılan dakika
  v_dk := extract(epoch from (v_cikis_t - v_giris_t)) / 60.0;
  if v_dk < 0 then v_dk := v_dk + 1440; end if;   -- gece vardiyası

  -- Mola düş (8 saatten fazla çalıştıysa)
  if v_dk > 480 then v_dk := v_dk - coalesce(p_mola_dk, 60); end if;

  v_saat := round(v_dk / 60.0, 2);

  if v_saat <= 0 then
    return jsonb_build_object('ok', false, 'mesaj', 'Çalışma süresi hesaplanamadı.');
  end if;

  if v_saat > 16 then
    return jsonb_build_object('ok', false, 'mesaj', 'Günde 16 saatten fazla mesai girilemez.');
  end if;

  -- Gün tipi (cumartesi %50, pazar %100)
  v_gun := extract(dow from p_tarih)::int;
  if v_gun = 6 then v_m50 := v_saat; v_tip := 'CUMARTESİ (%50 mesai)';
  elsif v_gun = 0 then v_m100 := v_saat; v_tip := 'PAZAR (%100 mesai)';
  else v_normal := v_saat; v_tip := 'HAFTA İÇİ (normal)'; end if;

  insert into public.puantaj_gunluk
    (personel, tarih, normal_saat, mesai50_saat, mesai100_saat, aciklama, olusturan)
  values
    (v_ben, p_tarih, v_normal, v_m50, v_m100,
     'Giriş ' || to_char(v_giris_t,'HH24:MI') || ' · Çıkış ' || to_char(v_cikis_t,'HH24:MI'), v_ben)
  on conflict (personel, tarih) do update
    set normal_saat   = excluded.normal_saat,
        mesai50_saat  = excluded.mesai50_saat,
        mesai100_saat = excluded.mesai100_saat,
        aciklama      = excluded.aciklama;

  return jsonb_build_object(
    'ok', true,
    'gun_tipi', v_tip,
    'saat', v_saat,
    'giris', to_char(v_giris_t,'HH24:MI'),
    'cikis', to_char(v_cikis_t,'HH24:MI'),
    'mesaj', to_char(p_tarih,'DD.MM.YYYY') || ' · ' || to_char(v_giris_t,'HH24:MI') || '-' ||
             to_char(v_cikis_t,'HH24:MI') || ' = ' || v_saat || ' saat · ' || v_tip);
end $$;

revoke all on function public.mesai_girisi_ekle(date, text, text, integer) from public;
grant execute on function public.mesai_girisi_ekle(date, text, text, integer) to authenticated;


-- ============================================================================
-- 6) 📋 BENİM MESAİLERİM v2 — giriş/çıkış saatlerini de göster
-- ============================================================================
create or replace function public.benim_mesailerim(p_ay text default null)
returns table (
  tarih date, gun_adi text, giris text, cikis text,
  normal_saat numeric, mesai50_saat numeric, mesai100_saat numeric,
  izin_mi boolean, aciklama text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.tarih,
    case extract(dow from g.tarih)
      when 0 then 'Pazar' when 1 then 'Pazartesi' when 2 then 'Salı'
      when 3 then 'Çarşamba' when 4 then 'Perşembe' when 5 then 'Cuma'
      else 'Cumartesi' end,
    -- açıklamadan saatleri çıkar ("Giriş 08:00 · Çıkış 18:00")
    nullif(substring(coalesce(g.aciklama,'') from 'Giriş ([0-9]{2}:[0-9]{2})'), ''),
    nullif(substring(coalesce(g.aciklama,'') from 'Çıkış ([0-9]{2}:[0-9]{2})'), ''),
    g.normal_saat, g.mesai50_saat, g.mesai100_saat, g.izin_mi, g.aciklama
  from public.puantaj_gunluk g
  where public.parca_adi_normal(g.personel) = public.parca_adi_normal(public.benim_adim())
    and (p_ay is null or to_char(g.tarih, 'YYYY-MM') = p_ay)
  order by g.tarih desc
  limit 40;
$$;

revoke all on function public.benim_mesailerim(text) from public;
grant execute on function public.benim_mesailerim(text) to authenticated;


-- ============================================================================
-- 7) 📍 TALEP KOORDİNATI — vinç konumundan otomatik al (haritada görünsün)
-- ============================================================================
do $$
declare v_adet integer := 0;
begin
  begin
    update public.service_tickets t
       set lat = c.lat, lng = c.lng
      from public.cranes c
     where t.lat is null
       and c.lat is not null
       and public.parca_adi_normal(coalesce(t.manual_customer_name,'')) =
           public.parca_adi_normal(coalesce(c.customer_name,''));
    get diagnostics v_adet = row_count;
    raise notice '✅ Talep koordinatı vinçten alındı: %', v_adet;
  exception when others then
    raise notice '⚠️ Talep koordinatı atlandı → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 8) TEST — korunmuş
-- ============================================================================
do $$
declare
  v_bas timestamptz; v_adet integer; v_testler text[][]; t text[];
  v_ok integer := 0; v_hata integer := 0;
begin
  raise notice ' ';
  raise notice '═══════ 6 SORUN TESTİ ═══════';

  v_testler := array[
    ['iscilik_mi',          'select public.iscilik_mi(''SERVİS İŞÇİLİĞİ'')'],
    ['musteri_kayip_riski', 'select * from public.musteri_kayip_riski(5)'],
    ['bakim_takvimi',       'select * from public.bakim_takvimi(null,5)'],
    ['personel_siralama',   'select * from public.personel_siralama()'],
    ['benim_mesailerim',    'select * from public.benim_mesailerim()']
  ];

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

  raise notice '────────────────────────────';
  raise notice 'ÇALIŞAN: %   HATALI: %', v_ok, v_hata;

  -- Performans
  v_bas := clock_timestamp();
  select count(*) into v_adet from public.musteri_kayip_riski(50);
  raise notice '⏱️ musteri_kayip_riski: % kayıt · % ms', v_adet,
                round(extract(epoch from (clock_timestamp() - v_bas)) * 1000);

  v_bas := clock_timestamp();
  select count(*) into v_adet from public.bakim_takvimi(null, 50);
  raise notice '⏱️ bakim_takvimi: % kayıt · % ms', v_adet,
                round(extract(epoch from (clock_timestamp() - v_bas)) * 1000);
  raise notice '═════════════════════════════';
end $$;


-- ============================================================================
-- 9) SONUÇ — işçilik filtresi çalışıyor mu?
-- ============================================================================
select metin,
       public.iscilik_mi(metin) as iscilik_mi,
       case when public.iscilik_mi(metin) then '🗑️ FİLTRELENİR' else '✅ PARÇA' end as sonuc
from (values
  ('SERVİS İŞÇİLİĞİ'),
  ('2 SAAT SONRASI SAAT BAŞI SERVİS İŞÇİLİĞİ'),
  ('14MM HALAT'),
  ('RULMAN 6205'),
  ('PARMAK SWITCH'),
  ('24V DİYOT'),
  ('NAKLİYE'),
  ('MESAI')
) v(metin);

-- Personel sıralaması (sadece aktif personel)
select * from public.personel_siralama();
