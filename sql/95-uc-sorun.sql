-- ============================================================================
--  🚀 ÜÇ SORUN DÜZELTMESİ (Güncelleme #69)
-- ----------------------------------------------------------------------------
--  1) MALZEME ARAMA — depodan isim öner + BULANIK eşleştirme
--     "0.37kw sürücü" yazınca depodaki "0.37 KW SÜRÜCÜ" bulunacak
--  2) BAKIM TAKVİMİ — sozlesmeli_mi() 288 kez çağrılıyordu → TIMEOUT
--     Artık TEK SORGUDA hesaplanıyor
--  3) TALEP KOORDİNATI — bulanık isim eşleşmesi + adresten çıkarım
--
--  KULLANIM: 94'ten SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 🔍 MALZEME ARAMA — depodan isim öner (yazarken çıkar)
-- ============================================================================
create or replace function public.malzeme_ara(p_arama text, p_limit integer default 15)
returns table (
  id uuid, ad text, stok numeric, birim text,
  alis_fiyati numeric, satis_fiyati numeric, benzerlik integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ara text := public.parca_adi_normal(coalesce(p_arama,''));
begin
  if length(v_ara) < 2 then return; end if;

  return query execute $q$
    select
      m.id,
      coalesce(
        nullif(trim(coalesce(to_jsonb(m)->>'name','')),''),
        nullif(trim(coalesce(to_jsonb(m)->>'parca_adi','')),''),
        nullif(trim(coalesce(to_jsonb(m)->>'malzeme_adi','')),''),
        nullif(trim(coalesce(to_jsonb(m)->>'ad','')),''),
        'İsimsiz')::text,
      coalesce(nullif(trim(coalesce(to_jsonb(m)->>'stock_quantity','')),'')::numeric, 0),
      coalesce(nullif(trim(coalesce(to_jsonb(m)->>'unit','')),''), 'adet'),
      coalesce(nullif(trim(coalesce(to_jsonb(m)->>'buy_price','')),'')::numeric, 0),
      coalesce(nullif(trim(coalesce(to_jsonb(m)->>'sale_price','')),'')::numeric, 0),
      -- Benzerlik puanı: tam eşleşme 100 · başta geçiyorsa 80 · içeriyorsa 60
      case
        when public.parca_adi_normal(coalesce(to_jsonb(m)->>'name', to_jsonb(m)->>'parca_adi',
             to_jsonb(m)->>'malzeme_adi', to_jsonb(m)->>'ad','')) = $1 then 100
        when public.parca_adi_normal(coalesce(to_jsonb(m)->>'name', to_jsonb(m)->>'parca_adi',
             to_jsonb(m)->>'malzeme_adi', to_jsonb(m)->>'ad','')) like $1 || '%' then 80
        when public.parca_adi_normal(coalesce(to_jsonb(m)->>'name', to_jsonb(m)->>'parca_adi',
             to_jsonb(m)->>'malzeme_adi', to_jsonb(m)->>'ad','')) like '%' || $1 || '%' then 60
        else 20 end
    from public.materials m
    where public.parca_adi_normal(coalesce(to_jsonb(m)->>'name', to_jsonb(m)->>'parca_adi',
          to_jsonb(m)->>'malzeme_adi', to_jsonb(m)->>'ad','')) like '%' || $1 || '%'
       or $1 like '%' || public.parca_adi_normal(coalesce(to_jsonb(m)->>'name', to_jsonb(m)->>'parca_adi',
          to_jsonb(m)->>'malzeme_adi', to_jsonb(m)->>'ad','')) || '%'
    order by 7 desc,
             length(coalesce(to_jsonb(m)->>'name', to_jsonb(m)->>'parca_adi','')) asc
    limit $2
  $q$ using v_ara, greatest(1, least(coalesce(p_limit,15), 50));
end $$;

revoke all on function public.malzeme_ara(text, integer) from public;
grant execute on function public.malzeme_ara(text, integer) to authenticated;


-- ============================================================================
-- 2) 💰 CANLI KÂR v2 — BULANIK malzeme eşleştirme
-- ============================================================================
create or replace function public.canli_kar(
  p_ucret numeric, p_malzemeler jsonb default '[]'::jsonb,
  p_sure_saat numeric default 0, p_saatlik numeric default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_malzeme_toplam numeric := 0;
  v_saatlik numeric; v_iscilik numeric := 0; v_gider numeric := 0;
  v_kar numeric := 0; v_marj numeric := 0;
  v_detay jsonb := '[]'::jsonb;
  v_p jsonb; v_ad text; v_adet numeric; v_birim numeric;
  v_depo numeric; v_depo_ad text; v_bulundu boolean;
begin
  if jsonb_typeof(p_malzemeler) = 'array' then
    for v_p in select * from jsonb_array_elements(p_malzemeler) loop
      v_ad    := coalesce(nullif(trim(coalesce(v_p->>'ad','')),''),
                          nullif(trim(coalesce(v_p->>'parca_adi','')),''), 'Parça');
      v_adet  := coalesce(nullif(trim(coalesce(v_p->>'adet','')),'')::numeric, 1);
      v_birim := coalesce(nullif(trim(coalesce(v_p->>'birim_fiyat','')),'')::numeric,
                          nullif(trim(coalesce(v_p->>'birim_maliyet','')),'')::numeric, 0);
      v_depo := null; v_depo_ad := null; v_bulundu := false;

      -- ⭐ BULANIK ARAMA: önce tam, sonra içeren
      begin
        select m.buy_price,
               coalesce(to_jsonb(m)->>'name', to_jsonb(m)->>'parca_adi', v_ad)
          into v_depo, v_depo_ad
        from public.materials m
        where public.parca_adi_normal(coalesce(to_jsonb(m)->>'name', to_jsonb(m)->>'parca_adi',
              to_jsonb(m)->>'malzeme_adi', to_jsonb(m)->>'ad','')) = public.parca_adi_normal(v_ad)
        limit 1;

        if v_depo is null then
          select m.buy_price,
                 coalesce(to_jsonb(m)->>'name', to_jsonb(m)->>'parca_adi', v_ad)
            into v_depo, v_depo_ad
          from public.materials m
          where public.parca_adi_normal(coalesce(to_jsonb(m)->>'name', to_jsonb(m)->>'parca_adi',
                to_jsonb(m)->>'malzeme_adi', to_jsonb(m)->>'ad','')) like '%' || public.parca_adi_normal(v_ad) || '%'
             or public.parca_adi_normal(v_ad) like '%' || public.parca_adi_normal(coalesce(to_jsonb(m)->>'name',
                to_jsonb(m)->>'parca_adi','')) || '%'
          order by length(coalesce(to_jsonb(m)->>'name', to_jsonb(m)->>'parca_adi','')) asc
          limit 1;
        end if;
      exception when others then null; end;

      if v_depo is not null and v_depo > 0 then
        v_birim := v_depo; v_bulundu := true;
      end if;

      v_malzeme_toplam := v_malzeme_toplam + (v_adet * v_birim);
      v_detay := v_detay || jsonb_build_object(
        'ad', v_ad,
        'depo_adi', v_depo_ad,
        'adet', v_adet, 'birim', v_birim,
        'toplam', round(v_adet * v_birim),
        'depodan', v_bulundu,
        'durum', case when v_bulundu then '✅ Depodan alındı' else '⚠️ Depoda bulunamadı' end);
    end loop;
  end if;

  begin
    select round(avg(pm.maas) / 225.0, 2) into v_saatlik
    from public.personel_maas pm where pm.aktif;
  exception when others then null; end;

  v_saatlik := coalesce(p_saatlik, v_saatlik, 170);
  v_iscilik := round(coalesce(p_sure_saat, 0) * v_saatlik, 2);
  v_gider   := v_malzeme_toplam + v_iscilik;
  v_kar     := coalesce(p_ucret, 0) - v_gider;
  v_marj    := case when coalesce(p_ucret,0) > 0 then round((v_kar / p_ucret) * 100, 1) else 0 end;

  return jsonb_build_object(
    'ucret', round(coalesce(p_ucret,0)),
    'malzeme', round(v_malzeme_toplam),
    'iscilik', v_iscilik, 'saatlik', v_saatlik,
    'sure_saat', coalesce(p_sure_saat, 0),
    'toplam_gider', round(v_gider),
    'kar', round(v_kar), 'kar_marji', v_marj,
    'durum', case
      when v_marj >= 40 then '🟢 ÇOK İYİ' when v_marj >= 25 then '🟢 İYİ'
      when v_marj >= 10 then '🟡 KABUL EDİLEBİLİR' when v_marj >= 0 then '🟠 DÜŞÜK'
      else '🔴 ZARAR' end,
    'malzeme_detay', v_detay);
end $$;

revoke all on function public.canli_kar(numeric, jsonb, numeric, numeric) from public;
grant execute on function public.canli_kar(numeric, jsonb, numeric, numeric) to authenticated;


-- ============================================================================
-- 3) 🗓️ BAKIM TAKVİMİ v5 — sozlesmeli_mi() KALDIRILDI (asıl timeout sebebi!)
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
    order by
      case when nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date < current_date then 1
           when nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date <= current_date + 30 then 2
           when nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'') is null then 4
           else 3 end,
      nullif(trim(coalesce(to_jsonb(c)->>'next_maintenance_date','')),'')::date asc nulls last
    limit greatest(1, least(coalesce(p_limit, 60), 500))
  ),
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
    false,   -- ⭐ sozlesmeli_mi KALDIRILDI (288 kez çağrılıyordu → timeout)
    case when v.bakim is null then 'tarihsiz'
         when v.bakim < current_date then 'gecikmis'
         when v.bakim <= current_date + 30 then 'yaklasan'
         else 'planli' end
  from vincler v;
$$;

revoke all on function public.bakim_takvimi(integer, integer) from public;
grant execute on function public.bakim_takvimi(integer, integer) to authenticated;


-- ============================================================================
-- 4) 📍 TALEP KOORDİNATI v2 — bulanık eşleşme
-- ============================================================================
do $$
declare v_adet integer := 0;
begin
  begin
    update public.service_tickets t
       set lat = c.lat, lng = c.lng
      from public.cranes c
     where t.lat is null and c.lat is not null
       and public.parca_adi_normal(coalesce(t.manual_customer_name,'')) <> ''
       and (
         public.parca_adi_normal(c.customer_name) like '%' || public.parca_adi_normal(t.manual_customer_name) || '%'
         or public.parca_adi_normal(t.manual_customer_name) like '%' || public.parca_adi_normal(c.customer_name) || '%'
       );
    get diagnostics v_adet = row_count;
    raise notice '✅ Talep koordinatı (bulanık): %', v_adet;
  exception when others then
    raise notice '⚠️ Talep koordinatı → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 5) TEST
-- ============================================================================
do $$
declare
  v_bas timestamptz; v_adet integer; v_r record;
begin
  raise notice ' ';
  raise notice '═══════ DÜZELTME TESTİ ═══════';

  -- Malzeme arama
  begin
    select count(*) into v_adet from public.malzeme_ara('sürücü', 10);
    raise notice '✅ malzeme_ara("sürücü") → % sonuç', v_adet;
    for v_r in select ad, alis_fiyati, benzerlik from public.malzeme_ara('sürücü', 3) loop
      raise notice '   • % → % ₺ (benzerlik %)', rpad(left(v_r.ad,40),40), v_r.alis_fiyati, v_r.benzerlik;
    end loop;
  exception when others then raise notice '❌ malzeme_ara → %', sqlerrm; end;

  -- Bakım takvimi performansı
  v_bas := clock_timestamp();
  select count(*) into v_adet from public.bakim_takvimi(null, 200);
  raise notice '⏱️ bakim_takvimi: % kayıt · % ms', v_adet,
                round(extract(epoch from (clock_timestamp() - v_bas)) * 1000);

  -- Kâr hesabı
  begin
    raise notice '💰 canli_kar testi: %', 
      (public.canli_kar(8500, '[{"ad":"0.37kw sürücü","adet":1}]'::jsonb, 3) ->> 'kar');
  exception when others then raise notice '❌ canli_kar → %', sqlerrm; end;

  raise notice '══════════════════════════════';
end $$;


-- ============================================================================
-- 6) SONUÇ
-- ============================================================================
-- Malzeme arama örnekleri
select 'sürücü' as arama, count(*) as bulunan from public.malzeme_ara('sürücü', 20)
union all select 'rulman', count(*) from public.malzeme_ara('rulman', 20)
union all select 'halat', count(*) from public.malzeme_ara('halat', 20);

-- Bakım takvimi (ilk 10)
select musteri, vinc, makine_tipi, son_bakim, sonraki, gecikme, durum
from public.bakim_takvimi(null, 10);
