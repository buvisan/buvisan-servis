-- ============================================================================
--  🗺️ RANDEVULAR'A KOORDİNAT SÜTUNU + DOLDUR (Güncelleme #74)
-- ----------------------------------------------------------------------------
--  KÖK SEBEP: randevular tablosunda lat/lng SÜTUNU YOK!
--             SQL 82'de "appointments" tablosuna eklemeye çalışmıştım,
--             ama gerçek tablo "randevular" → hiç eklenmemiş.
--
--  ÇÖZÜM: 1) lat/lng sütunlarını ekle
--         2) Koordinatları doldur (vinç eşleşmesi + adresten ilçe)
--         3) Harita güncellensin
--
--  KULLANIM: 99'dan SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 📋 SÜTUN LİSTESİ (önce öğren)
-- ============================================================================
select table_name, string_agg(column_name, ', ' order by ordinal_position) as sutunlar
from information_schema.columns
where table_schema='public' and table_name in ('randevular','service_tickets')
group by table_name;


-- ============================================================================
-- 2) ➕ lat / lng SÜTUNLARINI EKLE
-- ============================================================================
do $$
declare v_adet integer := 0;
begin
  raise notice ' ';

  -- randevular
  begin
    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='randevular' and column_name='lat') then
      alter table public.randevular add column lat numeric;
      v_adet := v_adet + 1;
      raise notice '✅ randevular.lat eklendi';
    else
      raise notice 'ℹ️ randevular.lat zaten var';
    end if;

    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='randevular' and column_name='lng') then
      alter table public.randevular add column lng numeric;
      v_adet := v_adet + 1;
      raise notice '✅ randevular.lng eklendi';
    else
      raise notice 'ℹ️ randevular.lng zaten var';
    end if;
  exception when others then
    raise notice '❌ randevular → %', sqlerrm;
  end;

  -- randevular: adres sütunu da olsun (yoksa)
  begin
    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='randevular' and column_name='adres') then
      alter table public.randevular add column adres text;
      raise notice '✅ randevular.adres eklendi (yeni alan)';
    end if;
  exception when others then null; end;

  raise notice 'Eklenen sütun: %', v_adet;
  raise notice '════════════════════════════════';
end $$;


-- ============================================================================
-- 3) 📍 KOORDİNATLARI DOLDUR (artık sütun var!)
-- ============================================================================
do $$
declare
  v_adet integer := 0; v_toplam integer := 0; v_hatali integer := 0;
  v_r record; v_adres text; v_isim text; v_k jsonb;
  v_lat numeric; v_lng numeric;
begin
  raise notice ' ';
  raise notice '═══════ KOORDİNAT DOLDURMA ═══════';

  for v_r in select r.id, to_jsonb(r) as j from public.randevular r loop
    v_toplam := v_toplam + 1;
    v_lat := null; v_lng := null;

    -- Zaten varsa atla
    if nullif(trim(coalesce(v_r.j->>'lat','')),'') is not null then continue; end if;

    v_isim  := public.randevu_isim(v_r.j);
    v_adres := public.randevu_adres(v_r.j);

    -- KATMAN 1: Vinç müşteri eşleşmesi
    if coalesce(v_isim,'') <> '' then
      begin
        select c.lat, c.lng into v_lat, v_lng
        from public.cranes c
        where c.lat is not null and public.parca_adi_normal(c.customer_name) <> ''
          and (public.parca_adi_normal(c.customer_name) = public.parca_adi_normal(v_isim)
            or public.parca_adi_normal(c.customer_name) like '%' || public.parca_adi_normal(v_isim) || '%'
            or public.parca_adi_normal(v_isim) like '%' || public.parca_adi_normal(c.customer_name) || '%')
        limit 1;
      exception when others then v_lat := null; end;
    end if;

    -- KATMAN 2: Adresten ilçe
    if v_lat is null and coalesce(v_adres,'') <> '' then
      begin
        v_k := public.adres_koordinat(v_adres);
        if v_k is not null then
          v_lat := (v_k->>'lat')::numeric; v_lng := (v_k->>'lng')::numeric;
        end if;
      exception when others then v_lat := null; end;
    end if;

    if v_lat is not null and v_lng is not null then
      begin
        execute 'update public.randevular set lat = $1, lng = $2 where id = $3'
          using v_lat, v_lng, v_r.id;
        v_adet := v_adet + 1;
      exception when others then v_hatali := v_hatali + 1; end;
    end if;
  end loop;

  raise notice 'İncelenen     : %', v_toplam;
  raise notice 'Koordinatlı   : %', v_adet;
  raise notice 'Hatalı        : %', v_hatali;
  raise notice '══════════════════════════════════';
end $$;


-- ============================================================================
-- 4) 📍 SERVİS TALEPLERİ (lat/lng sütunu var mı kontrol + doldur)
-- ============================================================================
do $$
declare v_adet integer := 0; v_r record; v_adres text; v_isim text;
  v_k jsonb; v_lat numeric; v_lng numeric; v_sutun_var boolean;
begin
  begin
    select exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='service_tickets' and column_name='lat') into v_sutun_var;

    if not v_sutun_var then
      alter table public.service_tickets add column lat numeric;
      alter table public.service_tickets add column lng numeric;
      raise notice '✅ service_tickets.lat/lng eklendi';
    end if;

    for v_r in select t.id, to_jsonb(t) as j from public.service_tickets t loop
      if nullif(trim(coalesce(v_r.j->>'lat','')),'') is not null then continue; end if;
      v_lat := null;
      v_isim := public.randevu_isim(v_r.j);
      v_adres := public.randevu_adres(v_r.j);

      if coalesce(v_isim,'') <> '' then
        begin
          select c.lat, c.lng into v_lat, v_lng from public.cranes c
          where c.lat is not null and public.parca_adi_normal(c.customer_name) <> ''
            and (public.parca_adi_normal(c.customer_name) = public.parca_adi_normal(v_isim)
              or public.parca_adi_normal(c.customer_name) like '%' || public.parca_adi_normal(v_isim) || '%')
          limit 1;
        exception when others then v_lat := null; end;
      end if;

      if v_lat is null and coalesce(v_adres,'') <> '' then
        begin
          v_k := public.adres_koordinat(v_adres);
          if v_k is not null then v_lat := (v_k->>'lat')::numeric; v_lng := (v_k->>'lng')::numeric; end if;
        exception when others then v_lat := null; end;
      end if;

      if v_lat is not null and v_lng is not null then
        begin
          execute 'update public.service_tickets set lat = $1, lng = $2 where id = $3'
            using v_lat, v_lng, v_r.id;
          v_adet := v_adet + 1;
        exception when others then null; end;
      end if;
    end loop;
    raise notice '✅ Servis talebi koordinatı: %', v_adet;
  exception when others then raise notice '⚠️ Servis talebi → %', sqlerrm; end;
end $$;


-- ============================================================================
-- 5) 🎯 TRIGGER'LARI YENİLE (yeni sütunlarla çalışsın)
-- ============================================================================
create or replace function public.randevu_koordinat_doldur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_adres text; v_isim text; v_k jsonb; v_lat numeric; v_lng numeric;
begin
  if new.lat is not null and new.lng is not null then return new; end if;

  v_isim  := public.randevu_isim(to_jsonb(new));
  v_adres := public.randevu_adres(to_jsonb(new));

  if coalesce(v_isim,'') <> '' then
    begin
      select c.lat, c.lng into v_lat, v_lng from public.cranes c
      where c.lat is not null and public.parca_adi_normal(c.customer_name) <> ''
        and (public.parca_adi_normal(c.customer_name) = public.parca_adi_normal(v_isim)
          or public.parca_adi_normal(c.customer_name) like '%' || public.parca_adi_normal(v_isim) || '%'
          or public.parca_adi_normal(v_isim) like '%' || public.parca_adi_normal(c.customer_name) || '%')
      limit 1;
    exception when others then v_lat := null; end;
  end if;

  if v_lat is null and coalesce(v_adres,'') <> '' then
    begin
      v_k := public.adres_koordinat(v_adres);
      if v_k is not null then v_lat := (v_k->>'lat')::numeric; v_lng := (v_k->>'lng')::numeric; end if;
    exception when others then v_lat := null; end;
  end if;

  if v_lat is not null then new.lat := v_lat; new.lng := v_lng; end if;
  return new;
end $$;

do $$
begin
  begin
    drop trigger if exists tr_randevu_koordinat on public.randevular;
    create trigger tr_randevu_koordinat
      before insert on public.randevular
      for each row execute function public.randevu_koordinat_doldur();
    raise notice '✅ Trigger: randevular (insert)';
  exception when others then raise notice '⚠️ Trigger → %', sqlerrm; end;
end $$;


-- ============================================================================
-- 6) SONUÇ
-- ============================================================================
select
  (public.harita_noktalari() -> 'sayilar' ->> 'vinc')    as vinc,
  (public.harita_noktalari() -> 'sayilar' ->> 'randevu') as randevu,
  (public.harita_noktalari() -> 'sayilar' ->> 'talep')   as talep;

-- Randevu koordinat durumu
select
  count(*) as toplam_randevu,
  count(lat) as koordinatli
from public.randevular;
