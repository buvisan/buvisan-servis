-- ============================================================================
--  🧩 EKSİK PARÇALAR (Güncelleme #115)
-- ----------------------------------------------------------------------------
--  SEBEP: SQL 140 "9 adet" hatası verince TÜM script geri alındı:
--         ❌ firma_benzerlik() oluşmadı
--         ❌ finans_kaydedildi kolonları eklenmedi
--         ❌ triggerlar kurulmadı
--
--  BU SCRIPT sadece EKSİK PARÇALARI kurar (finans_trend 141'de halledildi).
--  Her blok ayrı exception'da → biri patlasa diğerleri çalışır.
--
--  KULLANIM: 141'den SONRA, 142'den ÖNCE çalıştır.
-- ============================================================================


-- ============================================================================
-- 1) 🔤 firma_normal()
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

revoke all on function public.firma_normal(text) from public;
grant execute on function public.firma_normal(text) to authenticated;


-- ============================================================================
-- 2) 🎯 firma_benzerlik() — 0-100 puan
-- ============================================================================
create or replace function public.firma_benzerlik(p_a text, p_b text)
returns integer
language plpgsql
immutable
as $$
declare
  v_a text := public.firma_normal(p_a);
  v_b text := public.firma_normal(p_b);
  v_ka text[];
  v_kb text[];
  v_ortak integer := 0;
  v_toplam integer := 0;
  v_k text;
begin
  if coalesce(v_a,'') = '' or coalesce(v_b,'') = '' then return 0; end if;
  if v_a = v_b then return 100; end if;

  v_ka := array(select x from unnest(string_to_array(v_a,' ')) x where length(x) >= 3);
  v_kb := array(select x from unnest(string_to_array(v_b,' ')) x where length(x) >= 3);

  v_toplam := greatest(coalesce(array_length(v_ka,1),0), coalesce(array_length(v_kb,1),0));
  if coalesce(v_toplam,0) = 0 then return 0; end if;

  foreach v_k in array coalesce(v_ka, array[]::text[]) loop
    if v_k = any(coalesce(v_kb, array[]::text[])) then
      v_ortak := v_ortak + 1;
    end if;
  end loop;

  if coalesce(v_ka[1],'') <> '' and coalesce(v_ka[1],'') = coalesce(v_kb[1],'') then
    v_ortak := v_ortak + 1;
    v_toplam := v_toplam + 1;
  end if;

  if position(v_a in v_b) > 0 or position(v_b in v_a) > 0 then
    v_ortak := v_ortak + 2;
    v_toplam := v_toplam + 2;
  end if;

  return least(100, round((v_ortak::numeric / v_toplam::numeric) * 100));
end $$;

revoke all on function public.firma_benzerlik(text, text) from public;
grant execute on function public.firma_benzerlik(text, text) to authenticated;


-- ============================================================================
-- 3) 💰 KOLONLAR (her biri ayrı exception'da)
-- ============================================================================
do $$
begin
  begin
    alter table public.service_reports add column if not exists finans_kaydedildi boolean default false;
    raise notice '✅ service_reports.finans_kaydedildi';
  exception when others then raise notice '⚠️ sr.finans_kaydedildi: %', sqlerrm; end;

  begin
    alter table public.service_reports add column if not exists finans_kayit_id uuid;
    raise notice '✅ service_reports.finans_kayit_id';
  exception when others then raise notice '⚠️ sr.finans_kayit_id: %', sqlerrm; end;

  begin
    alter table public.bakim_formlari add column if not exists finans_kaydedildi boolean default false;
    raise notice '✅ bakim_formlari.finans_kaydedildi';
  exception when others then raise notice '⚠️ bf.finans_kaydedildi: %', sqlerrm; end;

  begin
    alter table public.bakim_formlari add column if not exists finans_kayit_id uuid;
    raise notice '✅ bakim_formlari.finans_kayit_id';
  exception when others then raise notice '⚠️ bf.finans_kayit_id: %', sqlerrm; end;
end $$;


-- ============================================================================
-- 4) 🔗 TRIGGER FONKSİYONLARI (döngüsüz)
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
  v_skor integer := 0;
begin
  begin
    v_musteri := coalesce(
      nullif(trim(coalesce(to_jsonb(NEW)->>'firma_adi','')),''),
      nullif(trim(coalesce(to_jsonb(NEW)->>'musteri_adi','')),''),
      '');
    if v_musteri = '' then return NEW; end if;

    select st.id,
           public.firma_benzerlik(v_musteri,
             coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''))
      into v_hedef_id, v_skor
    from public.service_tickets st
    where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
      and public.firma_benzerlik(v_musteri,
            coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'')) >= 60
    order by
      public.firma_benzerlik(v_musteri,
        coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'')) desc,
      st.created_at asc
    limit 1;

    if v_hedef_id is not null then
      update public.service_tickets
         set pipeline_status = 'tamamlandi', status = 'tamamlandi'
       where id = v_hedef_id;
    end if;
  exception when others then null; end;
  return NEW;
end $$;

create or replace function public.finans_form_islaretle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_firma text;
  v_hedef_id uuid;
  v_hedef_tip text;
  v_skor integer := 0;
begin
  begin
    v_firma := coalesce(
      nullif(trim(coalesce(to_jsonb(NEW)->>'firma_adi','')),''),
      nullif(trim(coalesce(to_jsonb(NEW)->>'musteri','')),''),
      nullif(trim(coalesce(to_jsonb(NEW)->>'musteri_adi','')),''),
      '');
    if v_firma = '' then return NEW; end if;

    select sr.id,
           public.firma_benzerlik(v_firma,
             coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''))
      into v_hedef_id, v_skor
    from public.service_reports sr
    where coalesce((to_jsonb(sr)->>'finans_kaydedildi')::boolean, false) = false
      and public.firma_benzerlik(v_firma,
            coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')) >= 60
    order by
      public.firma_benzerlik(v_firma,
        coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')) desc,
      sr.created_at asc
    limit 1;

    if v_hedef_id is not null then
      v_hedef_tip := 'servis';
    else
      select f.id,
             public.firma_benzerlik(v_firma, coalesce(f.musteri,''))
        into v_hedef_id, v_skor
      from public.bakim_formlari f
      where coalesce(f.finans_kaydedildi, false) = false
        and public.firma_benzerlik(v_firma, coalesce(f.musteri,'')) >= 60
      order by
        public.firma_benzerlik(v_firma, coalesce(f.musteri,'')) desc,
        f.created_at asc
      limit 1;

      if v_hedef_id is not null then v_hedef_tip := 'bakim'; end if;
    end if;

    if v_hedef_id is not null then
      if v_hedef_tip = 'servis' then
        update public.service_reports
           set finans_kaydedildi = true, finans_kayit_id = NEW.id
         where id = v_hedef_id;
      else
        update public.bakim_formlari
           set finans_kaydedildi = true, finans_kayit_id = NEW.id
         where id = v_hedef_id;
      end if;
    end if;
  exception when others then null; end;
  return NEW;
end $$;


-- ============================================================================
-- 5) 🔗 TRIGGERLARI BAĞLA
-- ============================================================================
do $$
begin
  begin
    drop trigger if exists trg_operasyon_coz on public.service_reports;
    create trigger trg_operasyon_coz
      after insert on public.service_reports
      for each row execute function public.operasyon_otomatik_coz();
    raise notice '✅ trg_operasyon_coz';
  exception when others then raise notice '⚠️ trg_operasyon_coz: %', sqlerrm; end;

  begin
    drop trigger if exists trg_finans_form on public.financial_records;
    create trigger trg_finans_form
      after insert on public.financial_records
      for each row execute function public.finans_form_islaretle();
    raise notice '✅ trg_finans_form';
  exception when others then raise notice '⚠️ trg_finans_form: %', sqlerrm; end;
end $$;


-- ============================================================================
-- 6) 🧪 TEST — Benzerlik skorları
-- ============================================================================
select 'DENKEN METAL' as finans, 'DENKEN MAKİNA SAN. VE TİC. LTD ŞTİ' as form,
       public.firma_benzerlik('DENKEN METAL','DENKEN MAKİNA SAN. VE TİC. LTD ŞTİ') as skor
union all
select 'KARESİ', 'RB KARESİ POLYSTER SANAYİ',
       public.firma_benzerlik('KARESİ','RB KARESİ POLYSTER SANAYİ')
union all
select 'HES METAL', 'HES METAL',
       public.firma_benzerlik('HES METAL','HES METAL')
union all
select 'DEMİRÖZ SAÇ METAL', 'DEMİRÖZ SAÇ METAL SAN.',
       public.firma_benzerlik('DEMİRÖZ SAÇ METAL','DEMİRÖZ SAÇ METAL SAN.')
union all
select 'BUVİSAN', 'KARAS ALTYAPI',
       public.firma_benzerlik('BUVİSAN','KARAS ALTYAPI');

-- Kolon kontrolü
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='service_reports' and column_name='finans_kaydedildi') as sr_kolon,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='bakim_formlari' and column_name='finans_kaydedildi') as bf_kolon;
