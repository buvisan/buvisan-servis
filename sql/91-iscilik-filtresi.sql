-- ============================================================================
--  🔧 İŞÇİLİK FİLTRESİ + BAKIM TARİHİ DÜZELTMESİ (Güncelleme #65)
-- ----------------------------------------------------------------------------
--  BULGU 1: "Tekrarlayan sorunlar" İŞÇİLİK kalemlerini gösteriyor:
--             SERVİS İŞÇİLİĞİ ×8 · 2 SAAT SONRASI SAAT BAŞI SERVİS İŞÇİLİĞİ ×3
--           Bunlar PARÇA değil → analiz anlamsız çıkıyor.
--           Gerçek parçalar (Rulman, Keçe, Halat) gizli kalıyor.
--
--  BULGU 2: Bakım tarihleri hep 15.04.2027 (SQL 87 varsayılanı)
--           Gerçek servis geçmişine göre yeniden hesaplanmalı.
--
--  ÇÖZÜM:
--    1) İşçilik kalemlerini filtrele (iscilik_mi yardımcısı)
--    2) ariza_kehanet · kurumsal_hafiza · parca_omur_analizi güncellendi
--    3) Bakım tarihleri = son servis + 12 ay (asansör + 6 ay)
--
--  KULLANIM: 90'dan SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) YARDIMCI: işçilik kalemi mi? (parça değil)
-- ============================================================================
create or replace function public.iscilik_mi(p_ad text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_ad,'') ~* '(i[şs][çc]ilik|servis i[şs][çc]ili|saat ba[şs][ıi]|saatlik|iscilik|işçilik|servis bedeli|yol bedeli|nakliye|ula[şs][ıi]m|mesai|prim|i[şs]letme)';
$$;

revoke all on function public.iscilik_mi(text) from public;
grant execute on function public.iscilik_mi(text) to authenticated;


-- ============================================================================
-- 2) 🔮 ARIZA KEHANETİ v3 — sadece GERÇEK PARÇALAR
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

  v_risk := (100 - v_skor) * 0.5;
  v_risk := v_risk + least(20, v_ariza * 2.5);
  v_risk := v_risk + case
    when v_gun_once <= 30 then 20 when v_gun_once <= 60 then 15
    when v_gun_once <= 120 then 8 else 0 end;
  v_risk := v_risk + case when v_gecikme > 60 then 10 when v_gecikme > 0 then 6 else 0 end;
  v_risk := round(greatest(0, least(100, v_risk)), 0);

  -- ⭐ RİSKLİ PARÇALAR — İŞÇİLİK HARİÇ
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
          and not public.iscilik_mi(p2.ad)        -- ⭐ İŞÇİLİK HARİÇ
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
-- 3) 🧠 KURUMSAL HAFIZA v3 — sadece GERÇEK PARÇALAR
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

  begin
    select count(*), coalesce(sum(cs.price),0),
           min(cs.service_date::date), max(cs.service_date::date)
      into v_is, v_ciro, v_ilk, v_son
    from public.completed_services cs
    where public.cs_isim_normal(to_jsonb(cs)) = v_mnorm;
  exception when others then null; end;

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

  -- ⭐ TEKRARLAYAN GERÇEK PARÇALAR (işçilik hariç, 2+ kez)
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
        and not public.iscilik_mi(p.ad)         -- ⭐ İŞÇİLİK HARİÇ
      group by p.ad having count(*) >= 2
      order by count(*) desc limit 6
    loop
      v_tekrarlar := v_tekrarlar || jsonb_build_object(
        'parca', v_r.ad, 'adet', v_r.adet,
        'ilk', to_char(v_r.ilk,'DD.MM.YYYY'), 'son', to_char(v_r.son,'DD.MM.YYYY'),
        'uyari', case when v_r.adet >= 4 then '🔴 Kronik sorun — kök sebep araştır'
                      when v_r.adet >= 3 then '🟠 Tekrarlıyor — takibe al'
                      else '🟡 İki kez değişmiş — izle' end);
    end loop;
  exception when others then null; end;

  -- AYNI PARÇAYI KULLANAN DİĞER MÜŞTERİLER (işçilik hariç)
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
          and not public.iscilik_mi(coalesce(to_jsonb(m3)->>'ad', to_jsonb(m3)->>'name',''))
      )
      and public.cs_isim_normal(to_jsonb(cs)) <> v_mnorm
      and public.cs_isim(to_jsonb(cs)) <> ''
      and not public.iscilik_mi(coalesce(to_jsonb(m)->>'ad', to_jsonb(m)->>'name',''))
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
-- 4) 📅 BAKIM TARİHİ YENİDEN HESAPLA — son servis + 12 ay (asansör + 6 ay)
-- ============================================================================
do $$
declare v_adet integer := 0;
begin
  begin
    with son_servis as (
      select public.cs_isim_normal(to_jsonb(cs)) as mnorm,
             max(cs.service_date::date) as son_t
      from public.completed_services cs
      where cs.service_date is not null
      group by 1
    )
    update public.cranes c
       set next_maintenance_date =
             case when public.parca_adi_normal(coalesce(c.makine_tipi,'')) like '%asansor%'
                  then ss.son_t + interval '6 months'
                  else ss.son_t + interval '12 months' end
      from son_servis ss
     where ss.mnorm = public.parca_adi_normal(c.customer_name)
       and ss.mnorm <> '';

    get diagnostics v_adet = row_count;
    raise notice '✅ Bakım tarihi GERÇEK servis geçmişine göre hesaplandı: % vinç', v_adet;
  exception when others then
    raise notice '⚠️ Hesaplanamadı → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 5) TEST — parçalar artık GERÇEK mi?
-- ============================================================================
do $$
declare v_id uuid; v_keh jsonb; v_haf jsonb;
begin
  raise notice ' ';
  select c.id into v_id from public.cranes c
  where public.parca_adi_normal(c.customer_name) in (
    select public.cs_isim_normal(to_jsonb(cs)) from public.completed_services cs
    group by 1 order by count(*) desc limit 1) limit 1;

  if v_id is null then raise notice '⚠️ Vinç bulunamadı'; return; end if;

  v_keh := public.ariza_kehanet(v_id);
  v_haf := public.kurumsal_hafiza((select customer_name from public.cranes where id = v_id));

  raise notice '═══════ PARÇA FİLTRESİ TESTİ ═══════';
  raise notice 'Müşteri: %', v_keh->>'musteri';
  raise notice 'Riskli parçalar (%):', jsonb_array_length(v_keh->'riskli_parcalar');
  raise notice '%', v_keh->'riskli_parcalar';
  raise notice '─────────';
  raise notice 'Tekrarlayan sorunlar (%):', jsonb_array_length(v_haf->'tekrarlar');
  raise notice '%', v_haf->'tekrarlar';
  raise notice '═════════════════════════════════════';
end $$;


-- ============================================================================
-- 6) SONUÇ — bakım tarihleri düzeldi mi?
-- ============================================================================
select
  c.customer_name                                        as musteri,
  public.jalan(to_jsonb(c),'makine_tipi')                as makine,
  (select to_char(max(cs.service_date::date),'DD.MM.YYYY')
   from public.completed_services cs
   where public.cs_isim_normal(to_jsonb(cs)) = public.parca_adi_normal(c.customer_name)) as son_servis,
  to_char(c.next_maintenance_date,'DD.MM.YYYY')          as sonraki_bakim,
  (c.next_maintenance_date - current_date)               as kalan_gun
from public.cranes c
where public.parca_adi_normal(c.customer_name) in (
  select public.cs_isim_normal(to_jsonb(cs)) from public.completed_services cs
  group by 1 order by count(*) desc limit 8)
order by 5 asc
limit 8;
