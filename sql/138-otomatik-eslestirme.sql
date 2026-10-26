-- ============================================================================
--  🔗 OTOMATİK EŞLEŞTİRME (Güncelleme #110)
-- ----------------------------------------------------------------------------
--  GÜNCELLEME 1: Finans'a iş eklenince ilgili form "FİNANSA KAYDEDİLDİ" olsun
--  GÜNCELLEME 2: Form doldurulunca Operasyon Takibi'ndeki arıza "ÇÖZÜLDÜ" olsun
--
--  ⚠️ Firma isimleri BİREBİR AYNI DEĞİL:
--     Form:    "DENKEN MAKİNA SAN. VE TİC. LTD ŞTİ"
--     Finans:  "DENKEN METAL"
--     Arıza:   "KARESİ"
--     Form:    "RB KARESİ POLYSTER SANAYİ"
--     → BULANIK EŞLEŞTİRME gerekli (kelime örtüşmesi)
--
--  KULLANIM: 137'den SONRA çalıştır. Hata vermez, veri silmez.
-- ============================================================================


-- ============================================================================
-- 1) 🔤 FİRMA ADI NORMALİZASYONU
-- ============================================================================
create or replace function public.firma_normal(p_ad text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
    regexp_replace(
      lower(public.parca_adi_normal(coalesce(p_ad,''))),
      '(a\.?s\.?|ltd\.?|sti\.?|şti\.?|san\.?|tic\.?|ve|inc\.?|co\.?|gmbh|corp\.?)',
      ' ', 'gi'),
    '[^a-z0-9 ]+', ' ', 'g')
  );
$$;


-- ============================================================================
-- 2) 🎯 FİRMA BENZERLİK PUANI (0-100)
--    Kelime örtüşmesine bakar: "denken makina" ↔ "denken metal" = 50
-- ============================================================================
create or replace function public.firma_benzerlik(p_a text, p_b text)
returns integer
language plpgsql
immutable
as $$
declare
  v_a text := public.firma_normal(p_a);
  v_b text := public.firma_normal(p_b);
  v_kelime_a text[];
  v_kelime_b text[];
  v_ortak integer := 0;
  v_toplam integer := 0;
  v_k text;
begin
  if v_a = '' or v_b = '' then return 0; end if;
  if v_a = v_b then return 100; end if;

  v_kelime_a := string_to_array(v_a, ' ');
  v_kelime_b := string_to_array(v_b, ' ');

  -- Boş kelimeleri temizle
  v_kelime_a := array(select x from unnest(v_kelime_a) x where length(x) >= 3);
  v_kelime_b := array(select x from unnest(v_kelime_b) x where length(x) >= 3);

  v_toplam := greatest(array_length(v_kelime_a,1), array_length(v_kelime_b,1));
  if coalesce(v_toplam,0) = 0 then return 0; end if;

  -- Ortak kelime say
  foreach v_k in array coalesce(v_kelime_a, array[]::text[]) loop
    if v_k = any(coalesce(v_kelime_b, array[]::text[])) then
      v_ortak := v_ortak + 1;
    end if;
  end loop;

  -- İlk kelime eşleşmesi büyük bonus (genelde marka adı)
  if coalesce(v_kelime_a[1],'') <> '' and coalesce(v_kelime_a[1],'') = coalesce(v_kelime_b[1],'') then
    v_ortak := v_ortak + 1;
    v_toplam := v_toplam + 1;
  end if;

  -- İçerme bonusu (biri diğerini içeriyorsa)
  if position(v_a in v_b) > 0 or position(v_b in v_a) > 0 then
    v_ortak := v_ortak + 2;
    v_toplam := v_toplam + 2;
  end if;

  return least(100, round((v_ortak::numeric / v_toplam::numeric) * 100));
end $$;


-- ============================================================================
-- 3) 💰 FİNANS İŞARETLEME KOLONLARI
-- ============================================================================
do $$
begin
  begin
    alter table public.service_reports add column if not exists finans_kaydedildi boolean default false;
    raise notice 'service_reports.finans_kaydedildi OK';
  exception when others then raise notice 'service_reports.finans_kaydedildi: %', sqlerrm; end;

  begin
    alter table public.service_reports add column if not exists finans_kayit_id uuid;
    raise notice 'service_reports.finans_kayit_id OK';
  exception when others then raise notice 'service_reports.finans_kayit_id: %', sqlerrm; end;

  begin
    alter table public.bakim_formlari add column if not exists finans_kaydedildi boolean default false;
    raise notice 'bakim_formlari.finans_kaydedildi OK';
  exception when others then raise notice 'bakim_formlari.finans_kaydedildi: %', sqlerrm; end;

  begin
    alter table public.bakim_formlari add column if not exists finans_kayit_id uuid;
    raise notice 'bakim_formlari.finans_kayit_id OK';
  exception when others then raise notice 'bakim_formlari.finans_kayit_id: %', sqlerrm; end;
end $$;


-- ============================================================================
-- 4) 🎯 GÜNCELLEME 2: FORM → OPERASYON OTOMATİK ÇÖZME
--    Form kaydedilince, AYNI firmaya ait EN ESKİ açık arızayı çöz
-- ============================================================================
create or replace function public.operasyon_otomatik_coz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_musteri text;
  v_hedef_id uuid;
  v_skor integer;
  v_en_iyi integer := 0;
  v_t record;
begin
  begin
    v_musteri := coalesce(
      nullif(trim(coalesce(to_jsonb(NEW)->>'firma_adi','')),''),
      nullif(trim(coalesce(to_jsonb(NEW)->>'musteri_adi','')),''),
      '');
    if v_musteri = '' then return NEW; end if;

    -- Açık arızaları tara, en iyi eşleşmeyi bul
    for v_r in
      select st.id,
             coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'') as ad,
             st.created_at
      from public.service_tickets st
      where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
      order by st.created_at asc
    loop
      v_skor := public.firma_benzerlik(v_musteri, v_r.ad);
      -- En eski + en yüksek skorlu
      if v_skor >= 60 and v_skor > v_en_iyi then
        v_en_iyi := v_skor;
        v_hedef_id := v_r.id;
      end if;
    end loop;

    if v_hedef_id is not null then
      update public.service_tickets
         set pipeline_status = 'tamamlandi',
             status = 'tamamlandi'
       where id = v_hedef_id;
      raise notice '✅ Operasyon çözüldü: % (skor %)', v_hedef_id, v_en_iyi;
    end if;
  exception when others then
    raise notice 'operasyon_otomatik_coz: %', sqlerrm;
  end;

  return NEW;
end $$;

drop trigger if exists trg_operasyon_coz on public.service_reports;
create trigger trg_operasyon_coz
  after insert on public.service_reports
  for each row execute function public.operasyon_otomatik_coz();


-- ============================================================================
-- 5) 💰 GÜNCELLEME 1: FİNANS KAYDI → FORM İŞARETLEME
--    Finans'a iş eklenince, AYNI firmaya ait EN ESKİ işaretsiz formu işaretle
-- ============================================================================
create or replace function public.finans_form_islaretle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_firma text;
  v_skor integer;
  v_en_iyi integer := 0;
  v_hedef_id uuid;
  v_hedef_tip text;
  v_r record;
begin
  begin
    v_firma := coalesce(
      nullif(trim(coalesce(to_jsonb(NEW)->>'firma_adi','')),''),
      nullif(trim(coalesce(to_jsonb(NEW)->>'musteri','')),''),
      nullif(trim(coalesce(to_jsonb(NEW)->>'musteri_adi','')),''),
      '');
    if v_firma = '' then return NEW; end if;

    -- EN ESKİ işaretsiz SERVİS raporunu bul
    for v_r in
      select sr.id,
             coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'') as ad,
             sr.created_at
      from public.service_reports sr
      where coalesce((to_jsonb(sr)->>'finans_kaydedildi')::boolean, false) = false
      order by sr.created_at asc
    loop
      v_skor := public.firma_benzerlik(v_firma, v_r.ad);
      if v_skor >= 60 and v_skor > v_en_iyi then
        v_en_iyi := v_skor;
        v_hedef_id := v_r.id;
        v_hedef_tip := 'servis';
      end if;
    end loop;

    -- Servis bulunamadıysa BAKIM formu ara
    if v_hedef_id is null then
      for v_r in
        select f.id, coalesce(f.musteri,'') as ad, f.created_at
        from public.bakim_formlari f
        where coalesce(f.finans_kaydedildi, false) = false
        order by f.created_at asc
      loop
        v_skor := public.firma_benzerlik(v_firma, v_r.ad);
        if v_skor >= 60 and v_skor > v_en_iyi then
          v_en_iyi := v_skor;
          v_hedef_id := v_r.id;
          v_hedef_tip := 'bakim';
        end if;
      end loop;
    end if;

    -- İşaretle
    if v_hedef_id is not null then
      if v_hedef_tip = 'servis' then
        update public.service_reports
           set finans_kaydedildi = true,
               finans_kayit_id = NEW.id
         where id = v_hedef_id;
      else
        update public.bakim_formlari
           set finans_kaydedildi = true,
               finans_kayit_id = NEW.id
         where id = v_hedef_id;
      end if;
      raise notice '✅ Form finansa işaretlendi: % (% skor %)', v_hedef_id, v_hedef_tip, v_en_iyi;
    end if;
  exception when others then
    raise notice 'finans_form_islaretle: %', sqlerrm;
  end;

  return NEW;
end $$;

drop trigger if exists trg_finans_form on public.financial_records;
create trigger trg_finans_form
  after insert on public.financial_records
  for each row execute function public.finans_form_islaretle();


-- ============================================================================
-- 6) 📋 EŞLEŞTİRME TESTİ
-- ============================================================================
select
  'DENKEN METAL' as finans, 'DENKEN MAKİNA SAN. VE TİC. LTD ŞTİ' as form,
  public.firma_benzerlik('DENKEN METAL', 'DENKEN MAKİNA SAN. VE TİC. LTD ŞTİ') as skor
union all
select 'KARESİ', 'RB KARESİ POLYSTER SANAYİ',
  public.firma_benzerlik('KARESİ', 'RB KARESİ POLYSTER SANAYİ')
union all
select 'BUVİSAN', 'KARAS ALTYAPI İNŞ. A.Ş.',
  public.firma_benzerlik('BUVİSAN', 'KARAS ALTYAPI İNŞ. A.Ş.')
union all
select 'ZM METAL', 'ZM METAL MAKİNA İMALAT SAN. VE TİC. LTD. ŞTİ.',
  public.firma_benzerlik('ZM METAL', 'ZM METAL MAKİNA İMALAT SAN. VE TİC. LTD. ŞTİ.');
