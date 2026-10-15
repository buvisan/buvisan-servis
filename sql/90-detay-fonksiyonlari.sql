-- ============================================================================
--  🎯 DETAY FONKSİYONLARI DÜZELTMESİ (Güncelleme #64) — customer_text
-- ----------------------------------------------------------------------------
--  SORUN (ekran görüntülerinden):
--    Liste DOĞRU:  ALSA ÇÖZÜM → 32 servis · 6 arıza · skor 63
--    Detay YANLIŞ: TOPLAM SERVİS 0 · ARIZA 0 · skor 86 · risk %7
--
--  SEBEP:
--    Detay modalı 3 fonksiyon kullanır ve onlar HÂLÂ eski isim aramasını
--    (customer_name/firm_name/customer) kullanıyor → customer_text bulunamıyor.
--
--  DÜZELTİLEN FONKSİYONLAR:
--    • vinc_saglik_skoru()  → detay skoru
--    • ariza_kehanet()      → risk tahmini + riskli parçalar
--    • kurumsal_hafiza()    → tekrarlayan sorunlar + geçmiş
--
--  Hepsi artık cs_isim() kullanıyor (customer_text ÖNCE) ✓
--
--  KULLANIM: 89'dan SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 🏗️ VİNÇ SAĞLIK SKORU v2 — customer_text
-- ============================================================================
create or replace function public.vinc_saglik_skoru(p_crane_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c jsonb; v_musteri text; v_kapasite text; v_makine text; v_mnorm text;
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
  v_mnorm    := public.parca_adi_normal(v_musteri);
  v_kapasite := public.jalan(v_c, 'crane_capacity','capacity','kapasite','crane_type');
  v_makine   := public.jalan(v_c, 'makine_tipi','machine_type','tip');

  begin
    v_bakim_tarih := nullif(trim(coalesce(v_c ->> 'next_maintenance_date','')), '')::date;
  exception when others then v_bakim_tarih := null; end;

  -- ⭐ SERVİS GEÇMİŞİ — crane_id VEYA customer_text ile
  begin
    select count(*) into v_is_sayisi
    from public.completed_services cs
    where nullif(trim(coalesce(to_jsonb(cs)->>'crane_id','')),'') = p_crane_id::text
       or public.cs_isim_normal(to_jsonb(cs)) = v_mnorm;

    select count(*), max(cs.service_date::date) into v_ariza_sayisi, v_son_ariza
    from public.completed_services cs
    where (nullif(trim(coalesce(to_jsonb(cs)->>'crane_id','')),'') = p_crane_id::text
           or public.cs_isim_normal(to_jsonb(cs)) = v_mnorm)
      and (coalesce(cs.service_type,'') ilike '%arıza%'
        or coalesce(cs.service_type,'') ilike '%ariza%'
        or coalesce(cs.description,'') ~* '(ar[ıi]za|bozuk|de[ğg]i[şs]meli|ka[çc]ak|çalışmıyor|patlak|k[ıi]r[ıi]k)');
  exception when others then null; end;

  -- BAKIM PUANI (40)
  if v_bakim_tarih is not null then
    v_bakim_gun := (v_bakim_tarih - current_date);
    if v_bakim_gun < 0 then v_bakim_puan := greatest(5, 40 - (abs(v_bakim_gun) / 30.0 * 8));
    elsif v_bakim_gun <= 30 then v_bakim_puan := 34;
    else v_bakim_puan := 40; end if;
  else v_bakim_puan := 15; end if;

  -- ARIZA PUANI (25)
  if v_is_sayisi > 0 then
    v_ort_ariza := round(v_ariza_sayisi::numeric / greatest(1, (v_is_sayisi / 12.0)), 2);
    v_ariza_puan := case when v_ariza_sayisi = 0 then 25 when v_ariza_sayisi <= 2 then 20
                         when v_ariza_sayisi <= 5 then 13 when v_ariza_sayisi <= 10 then 7 else 3 end;
  else v_ariza_puan := 18; end if;

  -- TAZELİK PUANI (20)
  if v_son_ariza is not null then
    v_gun_once := (current_date - v_son_ariza);
    v_tazelik_puan := case when v_gun_once <= 30 then 4 when v_gun_once <= 90 then 9
                           when v_gun_once <= 180 then 14 else 20 end;
  else v_tazelik_puan := 16; end if;

  -- MEMNUNİYET (15)
  begin
    select round(avg((to_jsonb(r)->>'musteri_puani')::numeric), 1) into v_puan_ort
    from public.service_reports r
    where nullif(trim(coalesce(to_jsonb(r)->>'musteri_puani','')),'') is not null
      and public.parca_adi_normal(public.jalan(to_jsonb(r),'musteri_adi','customer_name')) = v_mnorm;
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
    'musteri_puani', v_puan_ort);
end $$;

revoke all on function public.vinc_saglik_skoru(uuid) from public;
grant execute on function public.vinc_saglik_skoru(uuid) to authenticated;


-- ============================================================================
-- 2) 🔮 ARIZA KEHANETİ v2 — customer_text
-- ============================================================================
create or replace function public.ariza_kehanet(p_crane_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c jsonb; v_musteri text; v_mnorm text; v_saglik jsonb;
  v_skor numeric; v_risk numeric := 0; v_ariza integer := 0;
  v_gun_once integer; v_gecikme integer;
  v_riskli jsonb := '[]'::jsonb; v_oneri text; v_p record;
begin
  select to_jsonb(c) into v_c from public.cranes c where c.id = p_crane_id;
  if v_c is null then return jsonb_build_object('risk', 0, 'mesaj', 'Vinç bulunamadı'); end if;

  v_musteri := public.jalan(v_c, 'customer_name','firma_adi','musteri_adi');
  v_mnorm   := public.parca_adi_normal(v_musteri);
  v_saglik  := public.vinc_saglik_skoru(p_crane_id);
  v_skor    := coalesce((v_saglik ->> 'skor')::numeric, 50);
  v_ariza   := coalesce((v_saglik ->> 'ariza_sayisi')::int, 0);
  v_gun_once:= coalesce((v_saglik ->> 'gun_once')::int, 999);
  v_gecikme := coalesce((v_saglik ->> 'bakim_gecikme_gun')::int, 0);

  -- RİSK HESABI (sağlık skoru düştükçe risk artar)
  v_risk := (100 - v_skor) * 0.5;
  v_risk := v_risk + least(20, v_ariza * 2.5);
  v_risk := v_risk + case
    when v_gun_once <= 30 then 20 when v_gun_once <= 60 then 15
    when v_gun_once <= 120 then 8 else 0 end;
  v_risk := v_risk + case when v_gecikme > 60 then 10 when v_gecikme > 0 then 6 else 0 end;
  v_risk := round(greatest(0, least(100, v_risk)), 0);

  -- RİSKLİ PARÇALAR (customer_text ile)
  if v_mnorm <> '' then
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
          where (nullif(trim(coalesce(to_jsonb(cs)->>'crane_id','')),'') = p_crane_id::text
                 or public.cs_isim_normal(to_jsonb(cs)) = v_mnorm)
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
      else 'Yakın vadede risk düşük' end);
end $$;

revoke all on function public.ariza_kehanet(uuid) from public;
grant execute on function public.ariza_kehanet(uuid) to authenticated;


-- ============================================================================
-- 3) 🧠 KURUMSAL HAFIZA v2 — customer_text
-- ============================================================================
create or replace function public.kurumsal_hafiza(p_musteri text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tekrarlar jsonb := '[]'::jsonb;
  v_gecmis    jsonb := '[]'::jsonb;
  v_benzer    jsonb := '[]'::jsonb;
  v_r         record;
  v_is        integer := 0;
  v_ciro      numeric := 0;
  v_ilk       date;
  v_son       date;
  v_mnorm     text;
begin
  if coalesce(trim(p_musteri),'') = '' then
    return jsonb_build_object('tekrarlar','[]'::jsonb,'gecmis','[]'::jsonb);
  end if;

  v_mnorm := public.parca_adi_normal(p_musteri);

  -- Servis istatistikleri (customer_text)
  begin
    select count(*), coalesce(sum(cs.price),0),
           min(cs.service_date::date), max(cs.service_date::date)
      into v_is, v_ciro, v_ilk, v_son
    from public.completed_services cs
    where public.cs_isim_normal(to_jsonb(cs)) = v_mnorm;
  exception when others then null; end;

  -- Son 10 servis
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'tarih', to_char(tarih,'DD.MM.YYYY'),
             'tur', tur, 'aciklama', aciklama, 'ucret', ucret)), '[]'::jsonb)
      into v_gecmis
    from (
      select cs.service_date::date as tarih,
             coalesce(cs.service_type,'Servis') as tur,
             left(coalesce(nullif(trim(coalesce(cs.description,'')),''), '-'), 120) as aciklama,
             round(coalesce(cs.price,0)) as ucret
      from public.completed_services cs
      where public.cs_isim_normal(to_jsonb(cs)) = v_mnorm
      order by cs.service_date desc limit 10
    ) g;
  exception when others then null; end;

  -- TEKRARLAYAN PARÇALAR (3+ kez)
  begin
    for v_r in
      select p.ad, count(*) as adet, min(p.tarih) as ilk, max(p.tarih) as son
      from (
        select coalesce(nullif(trim(coalesce(to_jsonb(m)->>'ad','')), ''),
                        nullif(trim(coalesce(to_jsonb(m)->>'name','')), '')) as ad,
               cs.service_date::date as tarih
        from public.completed_services cs
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(cs.materials) = 'array' then cs.materials else '[]'::jsonb end) m
        where public.cs_isim_normal(to_jsonb(cs)) = v_mnorm
      ) p
      where coalesce(p.ad,'') <> ''
      group by p.ad having count(*) >= 3
      order by count(*) desc limit 5
    loop
      v_tekrarlar := v_tekrarlar || jsonb_build_object(
        'parca', v_r.ad, 'adet', v_r.adet,
        'ilk', to_char(v_r.ilk,'DD.MM.YYYY'), 'son', to_char(v_r.son,'DD.MM.YYYY'),
        'uyari', case when v_r.adet >= 4 then '🔴 Kronik sorun — kök sebep araştır'
                      else '🟠 Tekrarlıyor — takibe al' end);
    end loop;
  exception when others then null; end;

  -- AYNI PARÇAYI KULLANAN DİĞER MÜŞTERİLER
  begin
    select coalesce(jsonb_agg(distinct jsonb_build_object('musteri', m2.musteri)), '[]'::jsonb)
      into v_benzer
    from (
      select distinct public.cs_isim(to_jsonb(cs)) as musteri
      from public.completed_services cs
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(cs.materials) = 'array' then cs.materials else '[]'::jsonb end) m
      where coalesce(nullif(trim(coalesce(to_jsonb(m)->>'ad','')), ''),
                     nullif(trim(coalesce(to_jsonb(m)->>'name','')), '')) in (
        select coalesce(nullif(trim(coalesce(to_jsonb(m3)->>'ad','')), ''),
                        nullif(trim(coalesce(to_jsonb(m3)->>'name','')), ''))
        from public.completed_services cs3
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(cs3.materials) = 'array' then cs3.materials else '[]'::jsonb end) m3
        where public.cs_isim_normal(to_jsonb(cs3)) = v_mnorm
      )
      and public.cs_isim_normal(to_jsonb(cs)) <> v_mnorm
      and public.cs_isim(to_jsonb(cs)) <> ''
      limit 5
    ) m2;
  exception when others then null; end;

  return jsonb_build_object(
    'musteri', p_musteri,
    'toplam_is', v_is, 'toplam_ciro', round(v_ciro),
    'ilk_servis', case when v_ilk is not null then to_char(v_ilk,'DD.MM.YYYY') else null end,
    'son_servis', case when v_son is not null then to_char(v_son,'DD.MM.YYYY') else null end,
    'tekrarlar', v_tekrarlar, 'gecmis', v_gecmis, 'benzer_musteriler', v_benzer);
end $$;

revoke all on function public.kurumsal_hafiza(text) from public;
grant execute on function public.kurumsal_hafiza(text) to authenticated;


-- ============================================================================
-- 4) 🧠 KURUMSAL HAFIZA — crane_id ile çalışan sürüm (detay modalı için)
-- ============================================================================
create or replace function public.vinc_hafiza(p_crane_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c jsonb;
  v_musteri text;
begin
  select to_jsonb(c) into v_c from public.cranes c where c.id = p_crane_id;
  if v_c is null then return jsonb_build_object('toplam_is', 0); end if;

  v_musteri := public.jalan(v_c, 'customer_name','firma_adi','musteri_adi');

  -- Aynı müşterinin tüm geçmişi
  return public.kurumsal_hafiza(v_musteri);
end $$;

revoke all on function public.vinc_hafiza(uuid) from public;
grant execute on function public.vinc_hafiza(uuid) to authenticated;


-- ============================================================================
-- 5) TEST — ALSA ÇÖZÜM detayı artık DOLU mu?
-- ============================================================================
do $$
declare
  v_id uuid;
  v_saglik jsonb;
  v_keh jsonb;
  v_haf jsonb;
begin
  raise notice ' ';

  -- En çok servisi olan vincin müşterisini bul
  select c.id into v_id
  from public.cranes c
  where public.parca_adi_normal(c.customer_name) in (
    select public.cs_isim_normal(to_jsonb(cs))
    from public.completed_services cs
    group by 1 order by count(*) desc limit 1)
  limit 1;

  if v_id is null then
    raise notice '⚠️ Test için vinç bulunamadı';
    return;
  end if;

  v_saglik := public.vinc_saglik_skoru(v_id);
  v_keh    := public.ariza_kehanet(v_id);
  v_haf    := public.vinc_hafiza(v_id);

  raise notice '═══════ DETAY TESTİ ═══════';
  raise notice 'Müşteri        : %', coalesce(v_saglik->>'musteri','?');
  raise notice 'Skor           : %', coalesce(v_saglik->>'skor','?');
  raise notice 'Toplam servis  : %  ← ARTIK DOLU OLMALI', coalesce(v_saglik->>'toplam_servis','?');
  raise notice 'Arıza sayısı   : %', coalesce(v_saglik->>'ariza_sayisi','?');
  raise notice 'Son arıza      : %', coalesce(v_saglik->>'son_ariza','yok');
  raise notice '───────────────────────────';
  raise notice 'Risk           : %', coalesce(v_keh->>'risk','?');
  raise notice 'Risk etiketi   : %', coalesce(v_keh->>'risk_etiket','?');
  raise notice 'Riskli parça   : %', coalesce(jsonb_array_length(v_keh->'riskli_parcalar')::text,'0');
  raise notice '═══════════════════════════';
exception when others then
  raise notice '⚠️ Test hatası: %', sqlerrm;
end $$;


-- ============================================================================
-- 6) SONUÇ — sağlık + kehanet + hafıza (ilk 5 vinç)
-- ============================================================================
select
  c.customer_name as musteri,
  (public.vinc_saglik_skoru(c.id) ->> 'skor')          as skor,
  (public.vinc_saglik_skoru(c.id) ->> 'toplam_servis') as toplam_servis,
  (public.vinc_saglik_skoru(c.id) ->> 'ariza_sayisi')  as ariza,
  (public.vinc_saglik_skoru(c.id) ->> 'son_ariza')     as son_ariza,
  (public.ariza_kehanet(c.id) ->> 'risk')              as risk,
  (public.ariza_kehanet(c.id) ->> 'risk_etiket')       as risk_etiket,
  jsonb_array_length(public.ariza_kehanet(c.id) -> 'riskli_parcalar') as riskli_parca
from public.cranes c
where public.parca_adi_normal(c.customer_name) in (
  select public.cs_isim_normal(to_jsonb(cs))
  from public.completed_services cs
  group by 1 order by count(*) desc limit 5)
limit 5;
