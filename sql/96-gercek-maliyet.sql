-- ============================================================================
--  💰 GERÇEK MALİYET HESABI (Güncelleme #70)
-- ----------------------------------------------------------------------------
--  SORUN (senin tespitin — %100 haklısın):
--    İşçilik = 3 sa × 212 ₺ = 637 ₺  ← ÇOK DÜŞÜK!
--
--  GERÇEK MALİYET ŞUNLARI İÇERMELİ:
--    1) Eleman saat ücreti × KAÇ ELEMAN gitti (genelde 2)
--    2) SGK + yemek + yol + kıdem  → maaşın ~1,65 katı
--    3) Araç gideri (yakıt + bakım + amortisman) × km
--    4) YOL SÜRESİ de mesai! (gidiş-dönüş)
--
--  AYRICA: Ayarlar ekranı — katsayıları kendin değiştirebilirsin
--
--  KULLANIM: 95'ten SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) ⚙️ MALİYET AYARLARI TABLOSU (kendin değiştirebilirsin)
-- ============================================================================
create table if not exists public.maliyet_ayarlari (
  id                integer primary key default 1,
  sgk_katsayisi     numeric default 1.65,   -- maaş × 1,65 (SGK+yemek+yol+kıdem)
  varsayilan_eleman integer default 2,      -- bir işe kaç eleman gider
  km_birim          numeric default 12,     -- ₺/km (yakıt+bakım+amortisman)
  ortalama_hiz      numeric default 50,     -- km/s (şehir içi ortalama)
  aylik_saat        numeric default 225,    -- aylık çalışma saati
  guncelleme        timestamptz default now(),
  constraint tek_satir check (id = 1)
);

insert into public.maliyet_ayarlari (id) values (1) on conflict (id) do nothing;

alter table public.maliyet_ayarlari enable row level security;

drop policy if exists "maliyet_ayarlari_oku" on public.maliyet_ayarlari;
create policy "maliyet_ayarlari_oku" on public.maliyet_ayarlari
  for select to authenticated using (true);

drop policy if exists "maliyet_ayarlari_yaz" on public.maliyet_ayarlari;
create policy "maliyet_ayarlari_yaz" on public.maliyet_ayarlari
  for all to authenticated using (public.buvisan_admin_mi()) with check (public.buvisan_admin_mi());


-- ============================================================================
-- 2) ⚙️ AYAR OKU / YAZ
-- ============================================================================
create or replace function public.maliyet_ayar()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(a) from public.maliyet_ayarlari a where a.id = 1;
$$;

create or replace function public.maliyet_ayar_kaydet(
  p_sgk numeric default null, p_eleman integer default null,
  p_km numeric default null, p_hiz numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.buvisan_admin_mi() then
    return jsonb_build_object('ok', false, 'mesaj', 'Yetkiniz yok.');
  end if;

  update public.maliyet_ayarlari
     set sgk_katsayisi     = coalesce(p_sgk, sgk_katsayisi),
         varsayilan_eleman = coalesce(p_eleman, varsayilan_eleman),
         km_birim          = coalesce(p_km, km_birim),
         ortalama_hiz      = coalesce(p_hiz, ortalama_hiz),
         guncelleme        = now()
   where id = 1;

  return jsonb_build_object('ok', true, 'mesaj', 'Ayarlar kaydedildi.', 'ayar', public.maliyet_ayar());
end $$;

revoke all on function public.maliyet_ayar() from public;
revoke all on function public.maliyet_ayar_kaydet(numeric, integer, numeric, numeric) from public;
grant execute on function public.maliyet_ayar() to authenticated;
grant execute on function public.maliyet_ayar_kaydet(numeric, integer, numeric, numeric) to authenticated;


-- ============================================================================
-- 3) 👷 GERÇEK ELEMAN SAAT MALİYETİ
-- ============================================================================
create or replace function public.eleman_saat_maliyeti(p_personel text default null)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with a as (select * from public.maliyet_ayarlari where id = 1),
  m as (
    select coalesce(avg(pm.maas), 47000) as maas
    from public.personel_maas pm
    where pm.aktif
      and (p_personel is null or public.parca_adi_normal(pm.personel) = public.parca_adi_normal(p_personel))
  )
  select round((m.maas * a.sgk_katsayisi) / a.aylik_saat, 2)
  from m, a;
$$;

revoke all on function public.eleman_saat_maliyeti(text) from public;
grant execute on function public.eleman_saat_maliyeti(text) to authenticated;


-- ============================================================================
-- 4) 💰 CANLI KÂR v3 — GERÇEK MALİYET (eleman + SGK + araç + yol süresi)
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
  v_a jsonb := public.maliyet_ayar();
  v_sgk numeric := coalesce((v_a->>'sgk_katsayisi')::numeric, 1.65);
  v_eleman integer := coalesce((v_a->>'varsayilan_eleman')::int, 2);
  v_km_birim numeric := coalesce((v_a->>'km_birim')::numeric, 12);
  v_hiz numeric := greatest(10, coalesce((v_a->>'ortalama_hiz')::numeric, 50));

  v_malzeme numeric := 0; v_iscilik numeric := 0; v_arac numeric := 0;
  v_yol_sure numeric := 0; v_yol_ucret numeric := 0;
  v_saatlik numeric; v_toplam_gider numeric; v_kar numeric; v_marj numeric;
  v_detay jsonb := '[]'::jsonb;
  v_p jsonb; v_ad text; v_adet numeric; v_birim numeric;
  v_depo numeric; v_depo_ad text; v_bulundu boolean;
  v_sure numeric := coalesce(p_sure_saat, 0);
begin
  -- MALZEME (depodan bulanık eşleştirme)
  if jsonb_typeof(p_malzemeler) = 'array' then
    for v_p in select * from jsonb_array_elements(p_malzemeler) loop
      v_ad    := coalesce(nullif(trim(coalesce(v_p->>'ad','')),''),
                          nullif(trim(coalesce(v_p->>'parca_adi','')),''), 'Parça');
      v_adet  := coalesce(nullif(trim(coalesce(v_p->>'adet','')),'')::numeric, 1);
      v_birim := coalesce(nullif(trim(coalesce(v_p->>'birim_fiyat','')),'')::numeric,
                          nullif(trim(coalesce(v_p->>'birim_maliyet','')),'')::numeric, 0);
      v_depo := null; v_depo_ad := null; v_bulundu := false;

      begin
        select m.buy_price, coalesce(to_jsonb(m)->>'name', to_jsonb(m)->>'parca_adi', v_ad)
          into v_depo, v_depo_ad
        from public.materials m
        where public.parca_adi_normal(coalesce(to_jsonb(m)->>'name', to_jsonb(m)->>'parca_adi',
              to_jsonb(m)->>'malzeme_adi', to_jsonb(m)->>'ad','')) = public.parca_adi_normal(v_ad)
        limit 1;

        if v_depo is null then
          select m.buy_price, coalesce(to_jsonb(m)->>'name', to_jsonb(m)->>'parca_adi', v_ad)
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

      if v_depo is not null and v_depo > 0 then v_birim := v_depo; v_bulundu := true; end if;

      v_malzeme := v_malzeme + (v_adet * v_birim);
      v_detay := v_detay || jsonb_build_object(
        'ad', v_ad, 'depo_adi', v_depo_ad, 'adet', v_adet, 'birim', v_birim,
        'toplam', round(v_adet * v_birim), 'depodan', v_bulundu,
        'durum', case when v_bulundu then '✅ Depodan' else '⚠️ Bulunamadı' end);
    end loop;
  end if;

  -- ⭐ ELEMAN SAAT MALİYETİ (maaş × SGK katsayısı ÷ 225)
  v_saatlik := coalesce(p_saatlik, public.eleman_saat_maliyeti(null), 350);

  -- İŞÇİLİK = süre × eleman sayısı × saat maliyeti
  v_iscilik := round(v_sure * v_eleman * v_saatlik, 2);

  -- YOL: mesafe tahmini (ortalama 20 km gidiş) × 2 × km birim
  v_arac := round(20 * 2 * v_km_birim, 2);

  -- YOL SÜRESİ = (40 km ÷ 50 km/s) = 0,8 sa × eleman × saat maliyeti
  v_yol_sure := round((20 * 2) / v_hiz, 2);
  v_yol_ucret := round(v_yol_sure * v_eleman * v_saatlik, 2);

  v_toplam_gider := v_malzeme + v_iscilik + v_arac + v_yol_ucret;
  v_kar  := coalesce(p_ucret, 0) - v_toplam_gider;
  v_marj := case when coalesce(p_ucret,0) > 0 then round((v_kar / p_ucret) * 100, 1) else 0 end;

  return jsonb_build_object(
    'ucret', round(coalesce(p_ucret,0)),
    'malzeme', round(v_malzeme),
    'iscilik', v_iscilik,
    'arac', v_arac,
    'yol_ucret', v_yol_ucret,
    'yol_sure', v_yol_sure,
    'saatlik', v_saatlik,
    'eleman', v_eleman,
    'sgk_katsayisi', v_sgk,
    'km_birim', v_km_birim,
    'sure_saat', v_sure,
    'toplam_gider', round(v_toplam_gider),
    'kar', round(v_kar),
    'kar_marji', v_marj,
    'durum', case
      when v_marj >= 40 then '🟢 ÇOK İYİ' when v_marj >= 25 then '🟢 İYİ'
      when v_marj >= 10 then '🟡 KABUL EDİLEBİLİR' when v_marj >= 0 then '🟠 DÜŞÜK'
      else '🔴 ZARAR' end,
    'malzeme_detay', v_detay);
end $$;

revoke all on function public.canli_kar(numeric, jsonb, numeric, numeric) from public;
grant execute on function public.canli_kar(numeric, jsonb, numeric, numeric) to authenticated;


-- ============================================================================
-- 5) TEST — karşılaştırma
-- ============================================================================
do $$
declare v_eski numeric; v_yeni jsonb;
begin
  raise notice ' ';
  raise notice '═══════ MALİYET KARŞILAŞTIRMASI ═══════';
  raise notice 'Senaryo: 3 saat · 8.500 ₺ iş · malzemesiz';
  raise notice '';

  v_yeni := public.canli_kar(8500, '[]'::jsonb, 3);

  raise notice 'ESKİ hesap (tek eleman, SGK yok): 3 × 212 = 637 ₺';
  raise notice '';
  raise notice 'YENİ hesap:';
  raise notice '  Eleman sayısı        : % kişi', v_yeni->>'eleman';
  raise notice '  Saat maliyeti        : % ₺/saat (SGK dahil)', v_yeni->>'saatlik';
  raise notice '  İşçilik (3 sa)       : % ₺', v_yeni->>'iscilik';
  raise notice '  Araç gideri (40 km)  : % ₺', v_yeni->>'arac';
  raise notice '  Yol süresi (%)       : % ₺', v_yeni->>'yol_sure', v_yeni->>'yol_ucret';
  raise notice '  ─────────────────────────────';
  raise notice '  TOPLAM GİDER         : % ₺', v_yeni->>'toplam_gider';
  raise notice '  KÂR (8.500 ₺ iş)     : % ₺', v_yeni->>'kar';
  raise notice '  KÂR MARJI            : yüzde %', v_yeni->>'kar_marji';
  raise notice '  DURUM                : %', v_yeni->>'durum';
  raise notice '═══════════════════════════════════════';
end $$;


-- ============================================================================
-- 6) SONUÇ
-- ============================================================================
select
  (public.canli_kar(8500, '[]'::jsonb, 3) ->> 'iscilik')       as iscilik_3saat,
  (public.canli_kar(8500, '[]'::jsonb, 3) ->> 'arac')          as arac_gideri,
  (public.canli_kar(8500, '[]'::jsonb, 3) ->> 'yol_ucret')     as yol_ucreti,
  (public.canli_kar(8500, '[]'::jsonb, 3) ->> 'toplam_gider')  as toplam_gider,
  (public.canli_kar(8500, '[]'::jsonb, 3) ->> 'kar')           as kar,
  (public.canli_kar(8500, '[]'::jsonb, 3) ->> 'durum')         as durum;

select * from public.maliyet_ayar();
