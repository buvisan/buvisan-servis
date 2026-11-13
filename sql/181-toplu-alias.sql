-- ============================================================================
--  🕸️ TOPLU ALIAS OLUŞTURMA (Güncelleme #153)
-- ----------------------------------------------------------------------------
--  TÜM kaynaklardaki bütün firma adlarını birbirleriyle karşılaştırır,
--  benzer olanları (≥88) tek kanonik isim altında birleştirir.
--
--  KULLANIM: 180'den SONRA çalıştır.
-- ============================================================================

-- ─── 1) BÜTÜN FİRMA ADLARINI TOPLA ───
create or replace function public.tum_firma_adlari()
returns table (ad text, kaynak text, adet bigint)
language sql
stable
security definer
set search_path = public
as $$
  with hepsi as (
    select coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),'') as ad, 'vinç'::text as kaynak
    from public.cranes c
    union all
    select coalesce(public.jalan(to_jsonb(cs),'customer_text','musteri','firma_adi'),''), 'finans'
    from public.completed_services cs
    union all
    select coalesce(public.jalan(to_jsonb(o),'customer_name','musteri','firma_adi'),''), 'teklif'
    from public.offers o
    union all
    select coalesce(public.jalan(to_jsonb(s),'musteri','customer_name','firma_adi'),''), 'satış'
    from public.satislar s
    union all
    select coalesce(public.jalan(to_jsonb(tb),'musteri','musteri_adi','firma','firma_adi'),''), 'teklif-bekleyen'
    from public.teklif_bekleyenler tb
    union all
    select coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),''), 'talep'
    from public.service_tickets st
    union all
    select coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri','customer_text'),''), 'form'
    from public.service_reports sr
    union all
    select coalesce(public.jalan(to_jsonb(bf),'musteri','musteri_adi','firma_adi'),''), 'bakım'
    from public.bakim_formlari bf
    union all
    select firma_adi, 'hesap'
    from public.musteri_hesaplar
  )
  select trim(ad) as ad, min(kaynak) as kaynak, count(*)::bigint as adet
  from hepsi
  where length(trim(coalesce(ad,''))) >= 2
  group by trim(ad)
  order by count(*) desc;
$$;

revoke all on function public.tum_firma_adlari() from public;
grant execute on function public.tum_firma_adlari() to authenticated;


-- ─── 2) TOPLU ALIAS ÖĞREN ───
create or replace function public.toplu_alias_olustur(p_esik integer default 88)
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
  v_kanonik text;
begin
  select array_agg(ad order by length(ad) desc) into v_adlar
  from public.tum_firma_adlari();

  if v_adlar is null or array_length(v_adlar, 1) < 2 then
    return jsonb_build_object('ok', false, 'mesaj', 'Yeterli firma adı yok.', 'alias', 0);
  end if;

  -- En uzun isim kanonik olur (daha açıklayıcı)
  for i in 1..array_length(v_adlar, 1) loop
    v_a := v_adlar[i];
    if length(v_a) < 2 then continue; end if;

    for j in 1..array_length(v_adlar, 1) loop
      if i = j then continue; end if;
      v_b := v_adlar[j];
      if length(v_b) < 2 then continue; end if;

      -- v_a uzun (kanonik), v_b kısa (alias) olacak
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

  return jsonb_build_object(
    'ok', true,
    'alias', v_sayi,
    'karsilastirma', v_cift,
    'firma_cesidi', array_length(v_adlar, 1),
    'mesaj', v_sayi || ' alias bağlantısı kuruldu'
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.toplu_alias_olustur(integer) from public;
grant execute on function public.toplu_alias_olustur(integer) to authenticated;


-- ─── 3) ÇALIŞTIR ───
do $$
declare r jsonb;
begin
  r := public.toplu_alias_olustur(88);
  raise notice '🕸️ %', r::text;
end $$;


-- ─── 4) TEŞHİS ───
select
  (select count(*) from public.tum_firma_adlari()) as firma_cesidi,
  (select count(*) from public.firma_alias) as alias_sayisi,
  (select count(*) from public.musteri_hesaplar where durum = 'onaylandi') as onayli_hesap;

-- En çok geçen 15 firma
select ad, adet, kaynak from public.tum_firma_adlari() limit 15;

-- Oluşan aliaslar
select alias, kanonik, guven from public.firma_alias order by guven desc limit 20;
