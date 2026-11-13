-- ============================================================================
--  ⚡ HIZLI ALIAS OLUŞTURMA (Güncelleme #155)
-- ----------------------------------------------------------------------------
--  SORUN: Döngüyle 250.000 karşılaştırma → TIMEOUT
--
--  ÇÖZÜM:
--    1) firma_eslestir_saf() — alias tablosuna BAKMAZ (hızlı)
--    2) Tek INSERT...SELECT (set-based, döngü yok)
--    3) Ön filtre: sadece ilk harfi aynı olanları karşılaştır
--
--  KULLANIM: 182'den SONRA çalıştır. 10-30 saniye sürer.
-- ============================================================================


-- ─── 1) SAF eşleştirme (alias lookup YOK — hızlı) ───
create or replace function public.firma_eslestir_saf(p_a text, p_b text)
returns integer
language plpgsql
immutable
as $$
declare
  v_a text := public.firma_normal(coalesce(p_a,''));
  v_b text := public.firma_normal(coalesce(p_b,''));
  v_ilk_a text;
  v_ilk_b text;
  v_kisa text;
  v_uzun text;
  v_ortak integer := 0;
  v_toplam integer := 0;
  v_kelime text;
begin
  if v_a = '' or v_b = '' then return 0; end if;
  if v_a = v_b then return 100; end if;

  v_kisa := case when length(v_a) <= length(v_b) then v_a else v_b end;
  v_uzun := case when length(v_a) <= length(v_b) then v_b else v_a end;

  -- Kapsama (başta)
  if length(v_kisa) >= 3
     and left(v_uzun, length(v_kisa)) = v_kisa
     and length(v_kisa)::numeric / length(v_uzun) >= 0.3 then
    return 96;
  end if;

  -- Kapsama (herhangi yerde, oran ≥ 0.5)
  if length(v_kisa) >= 4
     and v_uzun like '%' || v_kisa || '%'
     and length(v_kisa)::numeric / length(v_uzun) >= 0.5 then
    return 95;
  end if;

  v_ilk_a := split_part(v_a, ' ', 1);
  v_ilk_b := split_part(v_b, ' ', 1);

  -- İlk kelime aynı
  if length(v_ilk_a) >= 3 and v_ilk_a = v_ilk_b then return 92; end if;

  -- Kısa ismin bütün kelimeleri uzunda
  for v_kelime in select unnest(string_to_array(v_kisa, ' ')) loop
    if length(v_kelime) >= 3 then
      v_toplam := v_toplam + 1;
      if v_uzun like '%' || v_kelime || '%' then v_ortak := v_ortak + 1; end if;
    end if;
  end loop;

  if v_toplam >= 2 and v_ortak = v_toplam then return 85; end if;
  if v_toplam >= 2 and v_ortak >= 2 and (v_ortak::numeric / v_toplam) >= 0.8 then return 75; end if;

  return 0;
end $$;

revoke all on function public.firma_eslestir_saf(text, text) from public;
grant execute on function public.firma_eslestir_saf(text, text) to anon, authenticated;


-- ─── 2) Ana fonksiyon: alias + saf ───
create or replace function public.firma_eslestir(p_a text, p_b text)
returns integer
language plpgsql
stable
as $$
declare
  v_a text := public.firma_normal(coalesce(p_a,''));
  v_b text := public.firma_normal(coalesce(p_b,''));
  v_hit boolean := false;
begin
  if v_a = '' or v_b = '' then return 0; end if;
  if v_a = v_b then return 100; end if;

  begin
    select exists(
      select 1 from public.firma_alias fa
      where public.firma_normal(fa.alias) in (v_a, v_b)
        and public.firma_normal(fa.kanonik) in (v_a, v_b)
    ) into v_hit;
  exception when others then v_hit := false; end;

  if v_hit then return 100; end if;

  return public.firma_eslestir_saf(p_a, p_b);
end $$;

revoke all on function public.firma_eslestir(text, text) from public;
grant execute on function public.firma_eslestir(text, text) to anon, authenticated;


-- ─── 3) ⚡ TEK SORGUDA ALIAS (döngü YOK) ───
create or replace function public.toplu_alias_olustur(p_esik integer default 92)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sayi integer := 0;
  v_oncesi integer := 0;
begin
  select count(*) into v_oncesi from public.firma_alias;

  -- ⭐ TEK INSERT...SELECT — ön filtreli self-join
  insert into public.firma_alias (alias, kanonik, kaynak, guven)
  select distinct on (a.ad, b.ad)
    a.ad, b.ad, 'otomatik', public.firma_eslestir_saf(a.ad, b.ad)
  from public.tum_firma_adlari() a
  join public.tum_firma_adlari() b
    on  left(public.firma_normal(a.ad), 1) = left(public.firma_normal(b.ad), 1)
    and length(a.ad) < length(b.ad)                       -- a kısa, b uzun (kanonik)
    and length(a.ad) >= 2
    and length(b.ad) <= length(a.ad) * 5                   -- aşırı fark olmasın
  where public.firma_eslestir_saf(a.ad, b.ad) >= p_esik
    and public.firma_normal(a.ad) <> public.firma_normal(b.ad)
  on conflict (alias, kanonik) do nothing;

  get diagnostics v_sayi = row_count;

  return jsonb_build_object(
    'ok', true,
    'yeni_alias', v_sayi,
    'toplam_alias', v_oncesi + v_sayi,
    'esik', p_esik
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.toplu_alias_olustur(integer) from public;
grant execute on function public.toplu_alias_olustur(integer) to authenticated;


-- ─── 4) ESKİ YANLIŞ ALIASLARI TEMİZLE ───
do $$
declare v integer;
begin
  delete from public.firma_alias where guven < 92;
  get diagnostics v = row_count;
  raise notice '🗑️ % düşük güvenli silindi', v;

  delete from public.firma_alias fa
  where public.firma_eslestir_saf(fa.alias, fa.kanonik) < 92;
  get diagnostics v = row_count;
  raise notice '🗑️ % yanlış silindi', v;
end $$;


-- ─── 5) ÇALIŞTIR ───
do $$
declare r jsonb;
begin
  r := public.toplu_alias_olustur(92);
  raise notice '⚡ %', r::text;
end $$;


-- ─── 6) SONUÇ ───
select count(*) as alias_sayisi from public.firma_alias;

select
  public.firma_eslestir('ZM METAL', 'Metal World Structures') as zm_olmali_0,
  public.firma_eslestir('KARESI POLYESTER', 'Karas Altyapi') as karesi_olmali_0,
  public.firma_eslestir('KAYASAN', 'Karas Altyapi') as kayasan_olmali_0,
  public.firma_eslestir('Karen sac', 'KARAS ALTYAPI') as karen_olmali_0,
  public.firma_eslestir('ER-VO METAL', 'Metal World') as ervo_olmali_0;

select
  public.firma_eslestir('OMSA', 'OMSA OTOMOTIV') as omsa_olmali_96,
  public.firma_eslestir('KPS', 'KPS OTOMOTIV') as kps_olmali_96;

select alias, kanonik, guven from public.firma_alias
order by guven desc, length(kanonik) desc limit 25;
