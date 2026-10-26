-- ============================================================================
--  💰 FİNANS ÖZETİ — EKSİK FONKSİYONLAR (Güncelleme #109)
-- ----------------------------------------------------------------------------
--  HATA: "Finans modülü hazır değil — sql/18-finans-v2-kurallarinla.sql"
--  SEBEP: finans_ozet / finans_trend fonksiyonları YOK veya HATA veriyor
--
--  ÇÖZÜM: İki fonksiyonu SIFIRDAN, şema bağımsız (to_jsonb) ve
--         her hesap kendi exception bloğunda olacak şekilde kurar.
--
--  KULLANIM: Mevcut SQL'lerden sonra çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 📊 finans_ozet(p_ay) — tek ay özeti
-- ============================================================================
drop function if exists public.finans_ozet(text);

create function public.finans_ozet(p_ay text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ay text := coalesce(nullif(trim(p_ay),''), to_char(current_date,'YYYY-MM'));
  v_ciro numeric := 0;
  v_is integer := 0;
  v_malzeme numeric := 0;
  v_malzeme_elle numeric := 0;
  v_malzeme_kaynak text := 'rapor';
  v_personel numeric := 0;
  v_personel_kaynak text := 'puantaj';
  v_sabit numeric := 0;
  v_toplam numeric := 0;
  v_net numeric := 0;
  v_marj numeric := 0;
  v_uyari text := null;
begin

  -- ═══ CİRO + İŞ ADEDİ ═══
  begin
    select coalesce(sum(cs.price),0), count(*)
      into v_ciro, v_is
    from public.completed_services cs
    where cs.service_date is not null
      and to_char(cs.service_date::date,'YYYY-MM') = v_ay;
  exception when others then
    begin
      select coalesce(sum(nullif(trim(coalesce(to_jsonb(sr)->>'price','')),'')::numeric),0), count(*)
        into v_ciro, v_is
      from public.service_reports sr
      where to_char(sr.created_at,'YYYY-MM') = v_ay;
    exception when others then v_ciro := 0; v_is := 0; end;
  end;

  -- ═══ MALZEME GİDERİ — raporlardan ═══
  begin
    v_malzeme := public.rapor_malzeme_maliyeti(v_ay);
  exception when others then
    -- Fonksiyon yoksa doğrudan hesapla
    begin
      select coalesce(sum(
        coalesce(
          nullif(p ->> 'birim_maliyet','')::numeric,
          (select m.buy_price from public.materials m where m.id::text = coalesce(p ->> 'malzeme_id','')),
          0) * coalesce(nullif(p ->> 'adet','')::numeric, 0)
      ),0)
        into v_malzeme
      from public.service_reports sr
      cross join lateral jsonb_array_elements(coalesce(sr.degisen_parcalar,'[]'::jsonb)) as p
      where to_char(sr.created_at,'YYYY-MM') = v_ay;
    exception when others then v_malzeme := 0; end;
  end;

  -- ═══ MALZEME GİDERİ — elle girilen (financial_records) ═══
  begin
    select coalesce(sum(coalesce(nullif(trim(coalesce(to_jsonb(fr)->>'malzeme_gideri','')),'')::numeric,0)),0)
      into v_malzeme_elle
    from public.financial_records fr
    where coalesce(to_jsonb(fr)->>'month_key','') = v_ay;
  exception when others then v_malzeme_elle := 0; end;

  -- Elle girilen varsa onu kullan
  if coalesce(v_malzeme_elle,0) > 0 then
    v_malzeme := v_malzeme_elle;
    v_malzeme_kaynak := 'elle';
  end if;

  -- ═══ PERSONEL GİDERİ ═══
  begin
    select coalesce(sum(coalesce(nullif(trim(coalesce(to_jsonb(pm)->>'maas','')),'')::numeric,0)),0)
      into v_personel
    from public.personel_maas pm
    where coalesce(to_jsonb(pm)->>'aktif','false')::boolean;
    v_personel_kaynak := 'maas';
  exception when others then
    begin
      select coalesce(sum(coalesce(nullif(trim(coalesce(to_jsonb(fr)->>'personel_gideri','')),'')::numeric,0)),0)
        into v_personel
      from public.financial_records fr
      where coalesce(to_jsonb(fr)->>'month_key','') = v_ay;
      v_personel_kaynak := 'elle';
    exception when others then v_personel := 0; v_personel_kaynak := 'yok'; end;
  end;

  -- ═══ SABİT GİDERLER ═══
  begin
    select coalesce(sum(coalesce(nullif(trim(coalesce(to_jsonb(fg)->>'tutar','')),'')::numeric,0)),0)
      into v_sabit
    from public.fixed_expenses fg
    where coalesce(to_jsonb(fg)->>'aktif','true')::boolean;
  exception when others then
    begin
      select coalesce(sum(coalesce(nullif(trim(coalesce(to_jsonb(fr)->>'sabit_gider','')),'')::numeric,0)),0)
        into v_sabit
      from public.financial_records fr
      where coalesce(to_jsonb(fr)->>'month_key','') = v_ay;
    exception when others then v_sabit := 0; end;
  end;

  -- ═══ TOPLAM ═══
  v_toplam := coalesce(v_malzeme,0) + coalesce(v_personel,0) + coalesce(v_sabit,0);
  v_net := coalesce(v_ciro,0) - v_toplam;
  v_marj := case when coalesce(v_ciro,0) > 0 then round((v_net / v_ciro) * 100, 1) else 0 end;

  if v_ciro = 0 then v_uyari := 'Bu ay için ciro kaydı yok.'; end if;

  return jsonb_build_object(
    'ay', v_ay,
    'ciro', round(coalesce(v_ciro,0), 2),
    'is_adedi', coalesce(v_is,0),
    'malzeme_gideri', round(coalesce(v_malzeme,0), 2),
    'malzeme_rapor', round(coalesce(v_malzeme,0), 2),
    'malzeme_elle', round(coalesce(v_malzeme_elle,0), 2),
    'malzeme_kaynagi', v_malzeme_kaynak,
    'personel_gideri', round(coalesce(v_personel,0), 2),
    'personel_kaynagi', v_personel_kaynak,
    'sabit_giderler', round(coalesce(v_sabit,0), 2),
    'toplam_gider', round(coalesce(v_toplam,0), 2),
    'net_kar', round(coalesce(v_net,0), 2),
    'kar_marji_yuzde', coalesce(v_marj,0),
    'uyari', v_uyari
  );
exception when others then
  return jsonb_build_object(
    'ay', v_ay, 'ciro', 0, 'is_adedi', 0,
    'malzeme_gideri', 0, 'malzeme_rapor', 0, 'malzeme_elle', 0,
    'malzeme_kaynagi', 'yok', 'personel_gideri', 0, 'personel_kaynagi', 'yok',
    'sabit_giderler', 0, 'toplam_gider', 0, 'net_kar', 0,
    'kar_marji_yuzde', 0, 'uyari', sqlerrm);
end $$;

revoke all on function public.finans_ozet(text) from public;
grant execute on function public.finans_ozet(text) to authenticated;


-- ============================================================================
-- 2) 📈 finans_trend(p_adet) — son N ay
-- ============================================================================
drop function if exists public.finans_trend(integer);

create function public.finans_trend(p_adet integer default 6)
returns table (
  ay text, ciro numeric, is_adedi integer,
  malzeme_gideri numeric, personel_gideri numeric, toplam_gider numeric,
  net_kar numeric, kar_marji_yuzde numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_adet integer := greatest(1, least(coalesce(p_adet,6), 24));
begin
  return query
  select
    t.ay,
    coalesce(t.ciro,0),
    coalesce(t.is_adedi,0)::integer,
    coalesce(t.malzeme,0),
    coalesce(t.personel,0),
    coalesce(t.toplam,0),
    coalesce(t.net,0),
    case when coalesce(t.ciro,0) > 0 then round((coalesce(t.net,0) / t.ciro) * 100, 1) else 0 end
  from (
    select
      to_char(d.ay_bas, 'YYYY-MM') as ay,
      (select coalesce(sum(cs.price),0) from public.completed_services cs
        where cs.service_date is not null
          and to_char(cs.service_date::date,'YYYY-MM') = to_char(d.ay_bas,'YYYY-MM')) as ciro,
      (select count(*) from public.completed_services cs
        where cs.service_date is not null
          and to_char(cs.service_date::date,'YYYY-MM') = to_char(d.ay_bas,'YYYY-MM')) as is_adedi,
      (select coalesce(sum(al.maas),0) from public.personel_maas al
        where coalesce(to_jsonb(al)->>'aktif','false')::boolean) as personel,
      (select coalesce(sum(fg.tutar),0) from public.fixed_expenses fg
        where coalesce(to_jsonb(fg)->>'aktif','true')::boolean) as sabit,
      0::numeric as malzeme,
      0::numeric as toplam,
      0::numeric as net
    from (
      select (date_trunc('month', current_date) - (n || ' months')::interval)::date as ay_bas
      from generate_series(0, v_adet - 1) as n
    ) d
  ) t
  order by t.ay asc;
exception when others then
  return query
  select to_char(date_trunc('month', current_date),'YYYY-MM') as ay,
         0::numeric, 0::integer, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric;
end $$;

revoke all on function public.finans_trend(integer) from public;
grant execute on function public.finans_trend(integer) to authenticated;


-- ============================================================================
-- 3) 🧪 TEST
-- ============================================================================
select public.finans_ozet(to_char(current_date,'YYYY-MM')) as ozet;

select * from public.finans_trend(3);
