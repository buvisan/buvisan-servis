-- ============================================================================
--  🎯 SIKI FİRMA EŞLEŞTİRME (Güncelleme #154)
-- ----------------------------------------------------------------------------
--  SORUN: Eski eşleştirme çok gevşekti
--    "ZM METAL" ↔ "Metal World" = 100 (1 ortak kelime)
--    "KARESI" ↔ "KARAS ALTYAPI" = 88 (ilk 3 harf)
--
--  YENİ KURALLAR (SIKI):
--    100 → Tam aynı
--    100 → Alias bağlı
--     96 → Kapsama (kısa isim UZUN ismin başında + uzunluk oranı ≥ 0.3)
--     92 → İlk kelime AYNI + ikisi de ≥ 3 harf
--     85 → TÜM kelimeler eşleşiyor (kısa ismin bütün kelimeleri uzunda var)
--     75 → Kelime kapsama ≥ %80 VE en az 2 kelime ortak
--      0 → Diğer (EŞLEŞME YOK)
--
--  ALIAS EŞİĞİ: 92 (sadece çok güçlü eşleşmeler)
--
--  KULLANIM: 181'den SONRA çalıştır.
-- ============================================================================

create or replace function public.firma_eslestir(p_a text, p_b text)
returns integer
language plpgsql
stable
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
  v_alias_hit boolean := false;
begin
  if v_a = '' or v_b = '' then return 0; end if;
  if v_a = v_b then return 100; end if;

  -- ─── 1) ALIAS ───
  begin
    select exists(
      select 1 from public.firma_alias f1
      join public.firma_alias f2
        on public.firma_normal(f1.kanonik) = public.firma_normal(f2.kanonik)
      where (public.firma_normal(f1.alias) = v_a and public.firma_normal(f2.alias) = v_b)
         or (public.firma_normal(f1.alias) = v_a and public.firma_normal(f1.kanonik) = v_b)
         or (public.firma_normal(f2.alias) = v_b and public.firma_normal(f2.kanonik) = v_a)
    ) into v_alias_hit;
  exception when others then v_alias_hit := false; end;

  if v_alias_hit then return 100; end if;

  -- ─── 2) KAPSAMA (kısa isim uzun ismin BAŞINDA olmalı) ───
  v_kisa := case when length(v_a) <= length(v_b) then v_a else v_b end;
  v_uzun := case when length(v_a) <= length(v_b) then v_b else v_a end;

  if length(v_kisa) >= 3
     and left(v_uzun, length(v_kisa)) = v_kisa
     and length(v_kisa)::numeric / length(v_uzun) >= 0.3 then
    return 96;
  end if;

  -- Uzun isim kısa ismi İÇERİYOR (herhangi bir yerde, uzunluk oranı ≥ 0.5)
  if length(v_kisa) >= 4
     and v_uzun like '%' || v_kisa || '%'
     and length(v_kisa)::numeric / length(v_uzun) >= 0.5 then
    return 95;
  end if;

  v_ilk_a := split_part(v_a, ' ', 1);
  v_ilk_b := split_part(v_b, ' ', 1);

  -- ─── 3) İLK KELİME AYNI (ikisi de ≥3 harf) ───
  if length(v_ilk_a) >= 3 and v_ilk_a = v_ilk_b then
    return 92;
  end if;

  -- ─── 4) KISA İSMİN BÜTÜN KELİMELERİ UZUNDA VAR ───
  v_ortak := 0; v_toplam := 0;
  for v_kelime in select unnest(string_to_array(v_kisa, ' ')) loop
    if length(v_kelime) >= 3 then
      v_toplam := v_toplam + 1;
      if v_uzun like '%' || v_kelime || '%' then v_ortak := v_ortak + 1; end if;
    end if;
  end loop;

  if v_toplam >= 2 and v_ortak = v_toplam then
    return 85;
  end if;

  -- ─── 5) KELİME KAPSAMA ≥ %80 VE EN AZ 2 KELİME ───
  if v_toplam >= 2 and v_ortak >= 2
     and (v_ortak::numeric / v_toplam) >= 0.8 then
    return 75;
  end if;

  -- ⛔ DİĞER HER ŞEY: EŞLEŞME YOK
  return 0;
end $$;

revoke all on function public.firma_eslestir(text, text) from public;
grant execute on function public.firma_eslestir(text, text) to anon, authenticated;


-- ============================================================================
-- 🧹 YANLIŞ ALIASLARI TEMİZLE
-- ============================================================================
do $$
declare v integer;
begin
  -- Güven < 92 olanları sil
  delete from public.firma_alias where guven < 92;
  get diagnostics v = row_count;
  raise notice '🗑️ % düşük güvenli alias silindi', v;

  -- Yeniden hesapla: yanlış olanları sil
  delete from public.firma_alias fa
  where public.firma_eslestir(fa.alias, fa.kanonik) < 92;
  get diagnostics v = row_count;
  raise notice '🗑️ % yanlış alias silindi', v;

  raise notice '✅ Temizlik tamamlandı';
end $$;


-- ============================================================================
-- 🕸️ ALIAS'LARI YENİDEN OLUŞTUR (eşik 92)
-- ============================================================================
create or replace function public.toplu_alias_olustur(p_esik integer default 92)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adlar text[];
  v_sayi integer := 0;
  v_cift integer := 0;
  i integer;
  j integer;
  v_a text;
  v_b text;
  v_puan integer;
begin
  select array_agg(ad order by length(ad) desc) into v_adlar
  from public.tum_firma_adlari();

  if v_adlar is null or array_length(v_adlar, 1) < 2 then
    return jsonb_build_object('ok', false, 'mesaj', 'Yeterli firma adı yok.', 'alias', 0);
  end if;

  for i in 1..array_length(v_adlar, 1) loop
    v_a := v_adlar[i];
    if length(v_a) < 2 then continue; end if;

    for j in 1..array_length(v_adlar, 1) loop
      if i = j then continue; end if;
      v_b := v_adlar[j];
      if length(v_b) < 2 then continue; end if;
      if length(v_b) > length(v_a) then continue; end if;

      v_puan := public.firma_eslestir(v_b, v_a);
      v_cift := v_cift + 1;

      if v_puan >= p_esik and public.firma_normal(v_a) <> public.firma_normal(v_b) then
        begin
          insert into public.firma_alias (alias, kanonik, kaynak, guven)
          values (v_b, v_a, 'otomatik', v_puan)
          on conflict (alias, kanonik) do update set guven = greatest(public.firma_alias.guven, v_puan);
          v_sayi := v_sayi + 1;
        exception when others then null; end;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'alias', v_sayi,
    'karsilastirma', v_cift, 'firma_cesidi', array_length(v_adlar, 1));
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.toplu_alias_olustur(integer) from public;
grant execute on function public.toplu_alias_olustur(integer) to authenticated;

do $$
declare r jsonb;
begin
  r := public.toplu_alias_olustur(92);
  raise notice '🕸️ %', r::text;
end $$;


-- ============================================================================
-- 🧪 DOĞRULUK TESTİ — yanlış eşleşmeler artık 0 olmalı
-- ============================================================================
select
  public.firma_eslestir('ZM METAL', 'Metal World Structures for Contracting') as zm_metal_YANLIS_olmali,
  public.firma_eslestir('KARESI POLYESTER', 'Karas Altyapı İnş. A.Ş.') as karesi_YANLIS_olmali,
  public.firma_eslestir('KAYASAN', 'Karas Altyapı İnş. A.Ş.') as kayasan_YANLIS_olmali,
  public.firma_eslestir('Karen saç', 'KARAS ALTYAPI İNŞ. A.Ş.') as karen_YANLIS_olmali,
  public.firma_eslestir('ER-VO METAL', 'Metal World Structures') as ervo_YANLIS_olmali;

select
  public.firma_eslestir('OMSA', 'OMSA OTOMOTİV') as omsa_DOGRU,
  public.firma_eslestir('KPS', 'KPS OTOMOTİV') as kps_DOGRU,
  public.firma_eslestir('KARESI POLYESTER', 'Karesi Polyester ve Petrokimya San. A.Ş.') as karesi_DOGRU;

-- Sonuç
select count(*) as alias_sayisi from public.firma_alias;
select alias, kanonik, guven from public.firma_alias order by guven desc, length(kanonik) desc limit 25;
