-- ============================================================================
--  🔢 GÜVENLİ SAYI ÇEVİRİCİ + FİNANS FONKSİYONLARI (Güncelleme #113)
-- ----------------------------------------------------------------------------
--  HATA: invalid input syntax for type numeric: "9 adet"
--  SEBEP: degisen_parcalar.adet alanı "9 adet" gibi METİN içeriyor
--
--  ÇÖZÜM: guvenli_sayi() — metinden sadece rakamları çıkarır
--         "9 adet" → 9 · "2,5" → 2.5 · "" → 0 · "abc" → 0
--
--  KULLANIM: 140'tan SONRA çalıştır. Hata vermez, veri silmez.
-- ============================================================================


-- ============================================================================
-- 1) 🔢 guvenli_sayi(text) → numeric
-- ============================================================================
create or replace function public.guvenli_sayi(p_metin text)
returns numeric
language plpgsql
immutable
as $$
declare
  v_temiz text;
begin
  if p_metin is null then return 0; end if;
  v_temiz := trim(coalesce(p_metin,''));

  -- Virgülü noktaya çevir (Türkçe ondalık)
  v_temiz := replace(v_temiz, ',', '.');

  -- Sadece rakam, nokta ve eksi bırak
  v_temiz := regexp_replace(v_temiz, '[^0-9.\-]', '', 'g');

  -- Birden fazla nokta varsa ilkini tut
  if (length(v_temiz) - length(replace(v_temiz, '.', ''))) > 1 then
    v_temiz := split_part(v_temiz, '.', 1) || '.' || replace(split_part(v_temiz, '.', 2), '.', '');
  end if;

  if v_temiz = '' or v_temiz = '.' or v_temiz = '-' then return 0; end if;

  begin
    return v_temiz::numeric;
  exception when others then return 0; end;
end $$;

revoke all on function public.guvenli_sayi(text) from public;
grant execute on function public.guvenli_sayi(text) to authenticated;


-- ============================================================================
-- 2) 📊 finans_ozet — GÜVENLİ SAYI İLE
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
  v_personel_kaynak text := 'maas';
  v_sabit numeric := 0;
  v_toplam numeric := 0;
  v_net numeric := 0;
  v_marj numeric := 0;
  v_uyari text := null;
begin
  -- CİRO
  begin
    select coalesce(sum(public.guvenli_sayi(to_jsonb(cs)->>'price')),0), count(*)
      into v_ciro, v_is
    from public.completed_services cs
    where cs.service_date is not null
      and to_char(cs.service_date::date,'YYYY-MM') = v_ay;
  exception when others then v_ciro := 0; v_is := 0; end;

  -- MALZEME (raporlardan) — GÜVENLİ
  begin
    select coalesce(sum(
      case
        when public.guvenli_sayi(p ->> 'birim_maliyet') > 0
          then public.guvenli_sayi(p ->> 'birim_maliyet')
        else coalesce(
          (select m.buy_price from public.materials m where m.id::text = coalesce(p ->> 'malzeme_id','')),
          0)
      end * public.guvenli_sayi(p ->> 'adet')
    ),0)
      into v_malzeme
    from public.service_reports sr
    cross join lateral jsonb_array_elements(coalesce(sr.degisen_parcalar,'[]'::jsonb)) as p
    where to_char(sr.created_at,'YYYY-MM') = v_ay;
  exception when others then v_malzeme := 0; end;

  -- MALZEME (elle)
  begin
    select coalesce(sum(public.guvenli_sayi(to_jsonb(fr)->>'malzeme_gideri')),0)
      into v_malzeme_elle
    from public.financial_records fr
    where coalesce(to_jsonb(fr)->>'month_key','') = v_ay;
  exception when others then v_malzeme_elle := 0; end;

  if coalesce(v_malzeme_elle,0) > 0 then
    v_malzeme := v_malzeme_elle;
    v_malzeme_kaynak := 'elle';
  end if;

  -- PERSONEL
  begin
    select coalesce(sum(public.guvenli_sayi(to_jsonb(pm)->>'maas')),0)
      into v_personel
    from public.personel_maas pm
    where coalesce(to_jsonb(pm)->>'aktif','false')::boolean;
    v_personel_kaynak := 'maas';
  exception when others then
    begin
      select coalesce(sum(public.guvenli_sayi(to_jsonb(fr)->>'personel_gideri')),0)
        into v_personel
      from public.financial_records fr
      where coalesce(to_jsonb(fr)->>'month_key','') = v_ay;
      v_personel_kaynak := 'elle';
    exception when others then v_personel := 0; v_personel_kaynak := 'yok'; end;
  end;

  -- SABİT
  begin
    select coalesce(sum(public.guvenli_sayi(to_jsonb(fg)->>'tutar')),0)
      into v_sabit
    from public.fixed_expenses fg
    where coalesce(to_jsonb(fg)->>'aktif','true')::boolean;
  exception when others then
    begin
      select coalesce(sum(public.guvenli_sayi(to_jsonb(fr)->>'sabit_gider')),0)
        into v_sabit
      from public.financial_records fr
      where coalesce(to_jsonb(fr)->>'month_key','') = v_ay;
    exception when others then v_sabit := 0; end;
  end;

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
-- 3) 📈 finans_trend — GÜVENLİ SAYI İLE
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
  v_personel numeric := 0;
  v_sabit numeric := 0;
begin
  -- Personel (tablo yoksa 0)
  begin
    select coalesce(sum(public.guvenli_sayi(to_jsonb(pm)->>'maas')),0)
      into v_personel
    from public.personel_maas pm
    where coalesce(to_jsonb(pm)->>'aktif','false')::boolean;
  exception when others then v_personel := 0; end;

  -- Sabit (tablo yoksa 0)
  begin
    select coalesce(sum(public.guvenli_sayi(to_jsonb(fg)->>'tutar')),0)
      into v_sabit
    from public.fixed_expenses fg
    where coalesce(to_jsonb(fg)->>'aktif','true')::boolean;
  exception when others then v_sabit := 0; end;

  return query
  with aylar as (
    select to_char((date_trunc('month', current_date) - (n || ' months')::interval), 'YYYY-MM') as ay
    from generate_series(0, v_adet - 1) as n
  ),
  ciro_s as (
    select to_char(cs.service_date::date,'YYYY-MM') as ay,
           coalesce(sum(public.guvenli_sayi(to_jsonb(cs)->>'price')),0) as ciro,
           count(*) as adet
    from public.completed_services cs
    where cs.service_date is not null
    group by 1
  ),
  malzeme_s as (
    select to_char(sr.created_at,'YYYY-MM') as ay,
           coalesce(sum(
             case
               when public.guvenli_sayi(p ->> 'birim_maliyet') > 0
                 then public.guvenli_sayi(p ->> 'birim_maliyet')
               else coalesce(
                 (select m.buy_price from public.materials m where m.id::text = coalesce(p ->> 'malzeme_id','')),
                 0)
             end * public.guvenli_sayi(p ->> 'adet')
           ),0) as malzeme
    from public.service_reports sr
    cross join lateral jsonb_array_elements(coalesce(sr.degisen_parcalar,'[]'::jsonb)) as p
    group by 1
  )
  select
    a.ay,
    coalesce(c.ciro,0)::numeric,
    coalesce(c.adet,0)::integer,
    coalesce(m.malzeme,0)::numeric,
    v_personel,
    (coalesce(m.malzeme,0) + v_personel + v_sabit)::numeric,
    (coalesce(c.ciro,0) - (coalesce(m.malzeme,0) + v_personel + v_sabit))::numeric,
    (case when coalesce(c.ciro,0) > 0
          then round(((coalesce(c.ciro,0) - (coalesce(m.malzeme,0) + v_personel + v_sabit)) / c.ciro) * 100, 1)
          else 0 end)::numeric
  from aylar a
  left join ciro_s c on c.ay = a.ay
  left join malzeme_s m on m.ay = a.ay
  order by a.ay asc;
exception when others then
  return query
  select to_char(date_trunc('month', current_date),'YYYY-MM') as ay,
         0::numeric, 0::integer, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric;
end $$;

revoke all on function public.finans_trend(integer) from public;
grant execute on function public.finans_trend(integer) to authenticated;


-- ============================================================================
-- 4) 🧪 TEST
-- ============================================================================
select '9 adet'     as girdi, public.guvenli_sayi('9 adet')     as sayi
union all select '2,5 metre',   public.guvenli_sayi('2,5 metre')
union all select '14MM',        public.guvenli_sayi('14MM')
union all select '',            public.guvenli_sayi('')
union all select 'abc',         public.guvenli_sayi('abc')
union all select '1.500,75',    public.guvenli_sayi('1.500,75');

select * from public.finans_trend(6);
