-- ============================================================================
--  📦 SATIŞTA STOK DÜŞÜMÜ (Güncelleme #164)
-- ----------------------------------------------------------------------------
--  satis_kaydet() → kalemler kaydedildikten sonra stok azaltır
--  Stok biterse 0'da durur (negatife düşmez)
--
--  KULLANIM: 191'den SONRA çalıştır.
-- ============================================================================

create or replace function public.satis_kaydet(
  p_musteri text,
  p_kalemler jsonb,
  p_yetkili text default null,
  p_telefon text default null,
  p_adres text default null,
  p_odeme_tipi text default null,
  p_iskonto numeric default 0,
  p_kdv_orani numeric default 20,
  p_belge_tipi text default 'satis',
  p_notlar text default null,
  p_olusturan text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_no text;
  v_ara numeric(12,2) := 0;
  v_kdv numeric(12,2);
  v_genel numeric(12,2);
  v_kalem record;
  v_adet numeric;
  v_bf numeric;
  v_stok_id uuid;
  v_stok_kolonu text;
begin
  if coalesce(trim(p_musteri),'') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Müşteri adı zorunludur.');
  end if;
  if p_kalemler is null or jsonb_array_length(p_kalemler) = 0 then
    return jsonb_build_object('ok', false, 'mesaj', 'En az bir malzeme ekleyin.');
  end if;

  for v_kalem in select * from jsonb_array_elements(p_kalemler) loop
    v_adet := coalesce((v_kalem.value->>'adet')::numeric, 1);
    v_bf := coalesce((v_kalem.value->>'birim_fiyat')::numeric, 0);
    v_ara := v_ara + (v_adet * v_bf);
  end loop;

  v_ara := greatest(0, v_ara - coalesce(p_iskonto, 0));
  v_kdv := round(v_ara * coalesce(p_kdv_orani, 20) / 100, 2);
  v_genel := v_ara + v_kdv;
  v_no := public.satis_no_uret();

  insert into public.satislar (
    satis_no, musteri, yetkili, telefon, adres, satis_tarihi,
    belge_tipi, ara_toplam, iskonto, kdv_orani, kdv_tutar, genel_toplam,
    odeme_tipi, notlar, olusturan
  ) values (
    v_no, trim(p_musteri), nullif(trim(coalesce(p_yetkili,'')),''),
    nullif(trim(coalesce(p_telefon,'')),''), nullif(trim(coalesce(p_adres,'')),''),
    current_date, coalesce(p_belge_tipi,'satis'), v_ara, coalesce(p_iskonto,0),
    coalesce(p_kdv_orani,20), v_kdv, v_genel, nullif(trim(coalesce(p_odeme_tipi,'')),''),
    nullif(trim(coalesce(p_notlar,'')),''), p_olusturan
  ) returning id into v_id;

  for v_kalem in select * from jsonb_array_elements(p_kalemler) loop
    v_adet := coalesce((v_kalem.value->>'adet')::numeric, 1);
    v_bf := coalesce((v_kalem.value->>'birim_fiyat')::numeric, 0);
    v_stok_id := nullif(v_kalem.value->>'stok_id','')::uuid;

    insert into public.satis_kalemleri (
      satis_id, stok_id, parca_adi, parca_kodu, birim, adet, birim_fiyat, toplam
    ) values (
      v_id, v_stok_id,
      coalesce(v_kalem.value->>'parca_adi', 'Malzeme'),
      nullif(v_kalem.value->>'parca_kodu',''),
      coalesce(nullif(v_kalem.value->>'birim',''), 'Adet'),
      v_adet, v_bf, v_adet * v_bf
    );

    -- ⭐ STOK DÜŞÜMÜ
    if v_stok_id is not null then
      begin
        -- materials.stock alanını bul (şema bağımsız: hangi kolon varsa)
        update public.materials m
           set stock = greatest(0, coalesce(m.stock, 0) - v_adet)
         where m.id = v_stok_id
           and exists (select 1 from information_schema.columns
                       where table_schema='public' and table_name='materials'
                         and column_name='stock');
      exception when others then null; end;

      -- "stock" yoksa diğer olası kolonları dene
      begin
        update public.materials m
           set quantity = greatest(0, coalesce(m.quantity, 0) - v_adet)
         where m.id = v_stok_id
           and exists (select 1 from information_schema.columns
                       where table_schema='public' and table_name='materials'
                         and column_name='quantity');
      exception when others then null; end;

      begin
        update public.materials m
           set stok = greatest(0, coalesce(m.stok, 0) - v_adet)
         where m.id = v_stok_id
           and exists (select 1 from information_schema.columns
                       where table_schema='public' and table_name='materials'
                         and column_name='stok');
      exception when others then null; end;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'satis_no', v_no,
    'ara_toplam', v_ara, 'kdv', v_kdv, 'genel_toplam', v_genel,
    'mesaj', 'Satış kaydedildi: ' || v_no
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.satis_kaydet(text, jsonb, text, text, text, text, numeric, numeric, text, text, text) from public;
grant execute on function public.satis_kaydet(text, jsonb, text, text, text, text, numeric, numeric, text, text, text) to authenticated;


-- ─── Kritik stok listesi ───
create or replace function public.kritik_stoklar(p_esik integer default 5)
returns table (id uuid, ad text, stok numeric, birim text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select m.id,
         coalesce(public.jalan(to_jsonb(m),'name','parca_adi','ad'),'—')::text,
         coalesce(
           nullif(public.jalan(to_jsonb(m),'stock'),'')::numeric,
           nullif(public.jalan(to_jsonb(m),'quantity'),'')::numeric,
           nullif(public.jalan(to_jsonb(m),'stok'),'')::numeric,
           nullif(public.jalan(to_jsonb(m),'adet'),'')::numeric, 0),
         coalesce(public.jalan(to_jsonb(m),'unit','birim'),'Adet')::text
  from public.materials m
  where coalesce(
          nullif(public.jalan(to_jsonb(m),'stock'),'')::numeric,
          nullif(public.jalan(to_jsonb(m),'quantity'),'')::numeric,
          nullif(public.jalan(to_jsonb(m),'stok'),'')::numeric,
          nullif(public.jalan(to_jsonb(m),'adet'),'')::numeric, 0) <= p_esik
  order by 3 asc
  limit 50;
end $$;

revoke all on function public.kritik_stoklar(integer) from public;
grant execute on function public.kritik_stoklar(integer) to authenticated;


-- ─── Test ───
select count(*) as kritik_stok from public.kritik_stoklar(5);
