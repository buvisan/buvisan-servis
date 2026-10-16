-- ============================================================================
--  🏗️ VİNÇ İŞLERİ KARTI — VERİ KATMANI (Güncelleme #91)
-- ----------------------------------------------------------------------------
--  Asansör kartının VİNÇ karşılığı (admin panelinde tekrar gösterilecek)
--
--  FONKSİYONLAR:
--    vinc_ozeti()        → vinç işi · ciro · abonelik potansiyeli · gecikmiş
--    vinc_musterileri()  → vinç müşterileri (ciro, son servis, gecikme)
--    vinc_envanteri()    → vinç listesi (kapasite, marka, son bakım)
--    vinc_teklif_metni() → abonelik teklif metni (WhatsApp için)
--
--  AYRIM: makine_tipi = 'Asansör' DEĞİL olanlar vinç sayılır
--
--  KULLANIM: 118'den SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 📊 vinc_ozeti() — özet rakamlar
-- ============================================================================
create or replace function public.vinc_ozeti()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is integer := 0;
  v_ciro numeric := 0;
  v_vinc integer := 0;
  v_musteri integer := 0;
  v_gecikmis integer := 0;
  v_temiz integer := 0;
  v_abonelik numeric := 0;
begin
  -- Vinç sayısı (asansör hariç)
  begin
    select count(*), count(distinct public.parca_adi_normal(
             public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi')))
      into v_vinc, v_musteri
    from public.cranes c
    where public.parca_adi_normal(coalesce(public.jalan(to_jsonb(c),'makine_tipi','machine_type'),''))
          not like '%asansor%'
      and public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> '';
  exception when others then null; end;

  -- Vinç işleri (asansör müşterisi OLMAYAN işler) + ciro
  begin
    select count(*), coalesce(sum(cs.price),0)
      into v_is, v_ciro
    from public.completed_services cs
    where coalesce(cs.price,0) > 0
      and not exists (
        select 1 from public.cranes c2
        where public.parca_adi_normal(coalesce(public.jalan(to_jsonb(c2),'makine_tipi','machine_type'),'')) like '%asansor%'
          and public.parca_adi_normal(public.jalan(to_jsonb(c2),'customer_name','firma_adi','musteri_adi'))
              = public.cs_isim_normal(to_jsonb(cs))
      );
  exception when others then null; end;

  -- Bakımı gecikmiş / temiz
  begin
    select
      count(*) filter (where nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date < current_date),
      count(*) filter (where nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date >= current_date)
    into v_gecikmis, v_temiz
    from public.cranes c
    where public.parca_adi_normal(coalesce(public.jalan(to_jsonb(c),'makine_tipi','machine_type'),''))
          not like '%asansor%'
      and public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> '';
  exception when others then null; end;

  -- Abonelik potansiyeli: 150+ gündür servis yok (vinç müşterisi)
  begin
    select count(*) * 6000 into v_abonelik
    from (
      select public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi')) as mnorm
      from public.cranes c
      where public.parca_adi_normal(coalesce(public.jalan(to_jsonb(c),'makine_tipi','machine_type'),''))
            not like '%asansor%'
        and public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
      group by 1
    ) m
    where not exists (
      select 1 from public.completed_services cs
      where public.cs_isim_normal(to_jsonb(cs)) = m.mnorm
        and cs.service_date::date > current_date - 150
    );
  exception when others then v_abonelik := 0; end;

  return jsonb_build_object(
    'vinc_is', v_is,
    'vinc_ciro', round(v_ciro),
    'vinc_sayisi', v_vinc,
    'musteri_sayisi', v_musteri,
    'bakimi_gecikmis', v_gecikmis,
    'bakimi_temiz', v_temiz,
    'abonelik_potansiyeli', round(v_abonelik));
end $$;

revoke all on function public.vinc_ozeti() from public;
grant execute on function public.vinc_ozeti() to authenticated;


-- ============================================================================
-- 2) 👥 vinc_musterileri() — vinç müşterileri listesi
-- ============================================================================
create or replace function public.vinc_musterileri()
returns table (
  musteri text, vinc_sayisi integer, toplam_ciro numeric,
  son_servis text, gun_once integer, bakim_durumu text, abonelik_uygun boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with vincler as (
    select
      public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') as ad,
      public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi')) as mnorm,
      nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date as bakim
    from public.cranes c
    where public.parca_adi_normal(coalesce(public.jalan(to_jsonb(c),'makine_tipi','machine_type'),''))
          not like '%asansor%'
      and public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
  ),
  ozet as (
    select v.ad, v.mnorm, count(*)::int as vinc_sayisi,
           min(v.bakim) as ilk_bakim
    from vincler v group by v.ad, v.mnorm
  ),
  servis as (
    select public.cs_isim_normal(to_jsonb(cs)) as mnorm,
           coalesce(sum(cs.price),0) as ciro,
           max(cs.service_date::date) as son
    from public.completed_services cs
    group by 1
  )
  select
    o.ad,
    o.vinc_sayisi,
    round(coalesce(s.ciro,0)),
    case when s.son is not null then to_char(s.son,'DD.MM.YYYY') else null end,
    case when s.son is not null then (current_date - s.son)::int else null end,
    case when o.ilk_bakim is null then 'tarihsiz'
         when o.ilk_bakim < current_date then 'gecikmis'
         when o.ilk_bakim <= current_date + 30 then 'yaklasan'
         else 'planli' end,
    (s.son is null or s.son < current_date - 150)
  from ozet o
  left join servis s on s.mnorm = o.mnorm
  order by coalesce(s.ciro,0) desc, o.vinc_sayisi desc
  limit 100;
$$;

revoke all on function public.vinc_musterileri() from public;
grant execute on function public.vinc_musterileri() to authenticated;


-- ============================================================================
-- 3) 🏗️ vinc_envanteri() — vinç listesi
-- ============================================================================
create or replace function public.vinc_envanteri()
returns table (
  musteri text, kapasite text, makine_tipi text, marka text,
  son_bakim text, sonraki_bakim text, gecikme integer, durum text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi'),
    coalesce(nullif(public.jalan(to_jsonb(c),'crane_capacity','capacity','kapasite'),''), '—'),
    coalesce(nullif(public.jalan(to_jsonb(c),'makine_tipi','machine_type'),''), 'Vinç'),
    coalesce(nullif(public.jalan(to_jsonb(c),'marka','brand'),''), '—'),
    (select to_char(max(cs.service_date::date),'DD.MM.YYYY')
     from public.completed_services cs
     where public.cs_isim_normal(to_jsonb(cs))
           = public.parca_adi_normal(public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi'))),
    case when nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'') is not null
         then to_char(nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date,'DD.MM.YYYY')
         else null end,
    case when nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'') is not null
         then (current_date - nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date)
         else null end,
    case when nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'') is null then 'tarihsiz'
         when nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date < current_date then 'gecikmis'
         when nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date <= current_date + 30 then 'yaklasan'
         else 'planli' end
  from public.cranes c
  where public.parca_adi_normal(coalesce(public.jalan(to_jsonb(c),'makine_tipi','machine_type'),''))
        not like '%asansor%'
    and public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi') <> ''
  order by
    case when nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'') is null then 3
         when nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date < current_date then 1
         else 2 end,
    public.jalan(to_jsonb(c),'customer_name','firma_adi','musteri_adi')
  limit 120;
$$;

revoke all on function public.vinc_envanteri() from public;
grant execute on function public.vinc_envanteri() to authenticated;


-- ============================================================================
-- 4) 📄 vinc_teklif_metni() — WhatsApp abonelik teklifi
-- ============================================================================
create or replace function public.vinc_teklif_metni(
  p_musteri text,
  p_makine_sayisi integer default null,
  p_periyot_ay integer default 6
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_adet integer := coalesce(p_makine_sayisi, 1);
  v_birim numeric;
  v_toplam numeric;
  v_normal numeric;
begin
  -- Filo indirimi (vinç fiyatları)
  v_normal := 9500;
  v_birim := case
    when v_adet >= 25 then 3500
    when v_adet >= 16 then 4000
    when v_adet >= 10 then 4500
    when v_adet >= 7  then 5000
    when v_adet >= 4  then 6500
    when v_adet >= 2  then 7500
    else 9500 end;
  v_toplam := v_birim * v_adet;

  return
    'Sayın ' || coalesce(p_musteri,'Yetkili') || ',' || E'\n\n' ||
    'Vinçlerinizin periyodik bakımını ' || p_periyot_ay || ' aylık abonelik paketiyle ' ||
    'güvence altına alıyoruz.' || E'\n\n' ||
    '📦 PAKET İÇERİĞİ' || E'\n' ||
    '• Hidrolik sistem kontrolü' || E'\n' ||
    '• Halat ve kanca muayenesi' || E'\n' ||
    '• Elektrik tesisatı kontrolü' || E'\n' ||
    '• Fren sistemi testi' || E'\n' ||
    '• Acil arızaya öncelikli müdahale' || E'\n' ||
    '• Yıllık periyodik kontrol raporu' || E'\n\n' ||
    '💰 FİYAT' || E'\n' ||
    case when v_adet > 1
      then '• Makine başı: ' || to_char(v_birim,'FM999G999') || ' ₺ (filo indirimi uygulandı)' || E'\n' ||
           '• ' || v_adet || ' makine toplam: ' || to_char(v_toplam,'FM999G999') || ' ₺'
      else '• Makine başı: ' || to_char(v_birim,'FM999G999') || ' ₺' end || E'\n' ||
    '• Ödeme: ' || p_periyot_ay || ' aylık dönem' || E'\n\n' ||
    '📞 Detaylı bilgi ve sözleşme için bize ulaşabilirsiniz.' || E'\n\n' ||
    'BUVİSAN VİNÇ SERVİS';
end $$;

revoke all on function public.vinc_teklif_metni(text, integer, integer) from public;
grant execute on function public.vinc_teklif_metni(text, integer, integer) to authenticated;


-- ============================================================================
-- 5) 🧪 TEST
-- ============================================================================
select public.vinc_ozeti() as vinc_ozeti;

select musteri, vinc_sayisi, toplam_ciro, son_servis, gun_once, bakim_durumu, abonelik_uygun
from public.vinc_musterileri()
limit 8;

select musteri, kapasite, makine_tipi, marka, sonraki_bakim, durum
from public.vinc_envanteri()
limit 8;

select public.vinc_teklif_metni('ÖRNEK MÜŞTERİ', 5, 6) as teklif_ornegi;
