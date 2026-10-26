-- ============================================================================
--  🔧 DÜZELTME PAKETİ (Güncelleme #112)
-- ----------------------------------------------------------------------------
--  HATA 1: finans_trend hep 0 dönüyordu (malzeme/toplam/net hesaplanmamış)
--  HATA 2: "loop variable of loop over rows must be a record variable"
--          → DÖNGÜLER KALDIRILDI, tek sorgu + ORDER BY kullanıldı
--  HATA 3: SQL 138 hata verince ALTER TABLE geri alındı
--          → KOLONLAR bu scriptte yeniden ekleniyor
--
--  KULLANIM: 137'den sonra çalıştır. Hata vermez, veri silmez.
-- ============================================================================


-- ============================================================================
-- 0) KOLONLARI GÜVENCEYE AL (her biri ayrı exception bloğunda)
-- ============================================================================
do $$
begin
  begin
    alter table public.service_reports add column if not exists finans_kaydedildi boolean default false;
    raise notice '✅ service_reports.finans_kaydedildi';
  exception when others then raise notice '⚠️ service_reports.finans_kaydedildi: %', sqlerrm; end;

  begin
    alter table public.service_reports add column if not exists finans_kayit_id uuid;
    raise notice '✅ service_reports.finans_kayit_id';
  exception when others then raise notice '⚠️ service_reports.finans_kayit_id: %', sqlerrm; end;

  begin
    alter table public.bakim_formlari add column if not exists finans_kaydedildi boolean default false;
    raise notice '✅ bakim_formlari.finans_kaydedildi';
  exception when others then raise notice '⚠️ bakim_formlari.finans_kaydedildi: %', sqlerrm; end;

  begin
    alter table public.bakim_formlari add column if not exists finans_kayit_id uuid;
    raise notice '✅ bakim_formlari.finans_kayit_id';
  exception when others then raise notice '⚠️ bakim_formlari.finans_kayit_id: %', sqlerrm; end;
end $$;


-- ============================================================================
-- 1) FONKSİYONLAR (137'de kurulmuş olabilir — güvenceye al)
-- ============================================================================
create or replace function public.firma_normal(p_ad text)
returns text language sql immutable as $$
  select trim(regexp_replace(
    regexp_replace(
      lower(public.parca_adi_normal(coalesce(p_ad,''))),
      '(a\.?s\.?|ltd\.?|sti\.?|şti\.?|san\.?|tic\.?|ve|inc\.?|co\.?|gmbh|corp\.?)',
      ' ', 'gi'),
    '[^a-z0-9 ]+', ' ', 'g')
  );
$$;

create or replace function public.firma_benzerlik(p_a text, p_b text)
returns integer language plpgsql immutable as $$
declare
  v_a text := public.firma_normal(p_a);
  v_b text := public.firma_normal(p_b);
  v_ka text[];
  v_kb text[];
  v_ortak integer := 0;
  v_toplam integer := 0;
  v_k text;
begin
  if v_a = '' or v_b = '' then return 0; end if;
  if v_a = v_b then return 100; end if;

  v_ka := array(select x from unnest(string_to_array(v_a,' ')) x where length(x) >= 3);
  v_kb := array(select x from unnest(string_to_array(v_b,' ')) x where length(x) >= 3);

  v_toplam := greatest(coalesce(array_length(v_ka,1),0), coalesce(array_length(v_kb,1),0));
  if v_toplam = 0 then return 0; end if;

  foreach v_k in array coalesce(v_ka, array[]::text[]) loop
    if v_k = any(coalesce(v_kb, array[]::text[])) then v_ortak := v_ortak + 1; end if;
  end loop;

  if coalesce(v_ka[1],'') <> '' and coalesce(v_ka[1],'') = coalesce(v_kb[1],'') then
    v_ortak := v_ortak + 1; v_toplam := v_toplam + 1;
  end if;

  if position(v_a in v_b) > 0 or position(v_b in v_a) > 0 then
    v_ortak := v_ortak + 2; v_toplam := v_toplam + 2;
  end if;

  return least(100, round((v_ortak::numeric / v_toplam::numeric) * 100));
end $$;


-- ============================================================================
-- 2) 🔧 finans_trend — HESAPLAMALAR DÜZELTİLDİ
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
  with aylar as (
    select to_char((date_trunc('month', current_date) - (n || ' months')::interval), 'YYYY-MM') as ay
    from generate_series(0, v_adet - 1) as n
  ),
  ciro_s as (
    select to_char(cs.service_date::date,'YYYY-MM') as ay,
           coalesce(sum(cs.price),0) as ciro, count(*) as adet
    from public.completed_services cs
    where cs.service_date is not null
    group by 1
  ),
  malzeme_s as (
    select to_char(sr.created_at,'YYYY-MM') as ay,
           coalesce(sum(
             coalesce(
               nullif(p ->> 'birim_maliyet','')::numeric,
               (select m.buy_price from public.materials m where m.id::text = coalesce(p ->> 'malzeme_id','')),
               0
             ) * coalesce(nullif(p ->> 'adet','')::numeric, 0)
           ),0) as malzeme
    from public.service_reports sr
    cross join lateral jsonb_array_elements(coalesce(sr.degishen_parcalar,'[]'::jsonb)) as p
    group by 1
  ),
  personel_s as (
    select coalesce(sum(coalesce(nullif(trim(coalesce(to_jsonb(pm)->>'maas','')),'')::numeric,0)),0) as personel
    from public.personel_maas pm
    where coalesce(to_jsonb(pm)->>'aktif','false')::boolean
  ),
  sabit_s as (
    select coalesce(sum(coalesce(nullif(trim(coalesce(to_jsonb(fg)->>'tutar','')),'')::numeric,0)),0) as sabit
    from public.fixed_expenses fg
    where coalesce(to_jsonb(fg)->>'aktif','true')::boolean
  )
  select
    a.ay,
    coalesce(c.ciro,0)::numeric,
    coalesce(c.adet,0)::integer,
    coalesce(m.malzeme,0)::numeric,
    (select personel from personel_s)::numeric,
    (coalesce(m.malzeme,0) + (select personel from personel_s) + (select sabit from sabit_s))::numeric,
    (coalesce(c.ciro,0) - (coalesce(m.malzeme,0) + (select personel from personel_s) + (select sabit from sabit_s)))::numeric,
    (case when coalesce(c.ciro,0) > 0
          then round(((coalesce(c.ciro,0) - (coalesce(m.malzeme,0) + (select personel from personel_s) + (select sabit from sabit_s))) / c.ciro) * 100, 1)
          else 0 end)::numeric
  from aylar a
  left join ciro_s c on c.ay = a.ay
  left join malzeme_s m on m.ay = a.ay
  order by a.ay asc;
end $$;

revoke all on function public.finans_trend(integer) from public;
grant execute on function public.finans_trend(integer) to authenticated;


-- ============================================================================
-- 3) 🔧 operasyon_otomatik_coz — DÖNGÜSÜZ
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
      raise notice '✅ Operasyon çözüldü: % (benzerlik %)', v_hedef_id, v_skor;
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
-- 4) 🔧 finans_form_islaretle — DÖNGÜSÜZ
-- ============================================================================
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

    -- Önce işaretsiz SERVİS raporu ara
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
      -- Servis yoksa BAKIM formu ara
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
      raise notice '✅ Form finansa işaretlendi: % (% — benzerlik %)', v_hedef_id, v_hedef_tip, v_skor;
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
-- 5) 🧪 TEST
-- ============================================================================
select 'DENKEN METAL' as finans,
       'DENKEN MAKİNA SAN. VE TİC. LTD ŞTİ' as form,
       public.firma_benzerlik('DENKEN METAL','DENKEN MAKİNA SAN. VE TİC. LTD ŞTİ') as skor,
       case when public.firma_benzerlik('DENKEN METAL','DENKEN MAKİNA SAN. VE TİC. LTD ŞTİ') >= 60
            then 'EŞLEŞİR' else 'EŞLEŞMEZ' end as sonuc
union all
select 'KARESİ', 'RB KARESİ POLYSTER SANAYİ',
       public.firma_benzerlik('KARESİ','RB KARESİ POLYSTER SANAYİ'),
       case when public.firma_benzerlik('KARESİ','RB KARESİ POLYSTER SANAYİ') >= 60 then 'EŞLEŞİR' else 'EŞLEŞMEZ' end
union all
select 'BUVİSAN', 'KARAS ALTYAPI İNŞ. A.Ş.',
       public.firma_benzerlik('BUVİSAN','KARAS ALTYAPI İNŞ. A.Ş.'),
       case when public.firma_benzerlik('BUVİSAN','KARAS ALTYAPI INŞ. A.Ş.') >= 60 then 'EŞLEŞİR' else 'EŞLEŞMEZ' end;

select * from public.finans_trend(3);
