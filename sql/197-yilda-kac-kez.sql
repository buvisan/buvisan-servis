-- ============================================================================
--  🔢 YILDA KAÇ BAKIM (Güncelleme #169)
-- ----------------------------------------------------------------------------
--  SORUN: Sadece "kaç ayda 1" var, "yılda kaç kez" yok
--  ÇÖZÜM: visits_per_year alanı + takvim yenileme
--
--  KULLANIM: 196'dan SONRA çalıştır.
-- ============================================================================

-- ─── 1) Yeni alan ───
alter table public.maintenance_contracts
  add column if not exists visits_per_year integer;

-- Mevcut kayıtları doldur
update public.maintenance_contracts
   set visits_per_year = greatest(1, floor(12.0 / greatest(1, coalesce(maintenance_period_months, 3)))::integer)
 where visits_per_year is null;


-- ─── 2) sozlesme_kaydet — YILDA KAÇ KEZ parametreli ───
create or replace function public.sozlesme_kaydet(
  p_firma text,
  p_hitap text default null,
  p_makine_sayisi integer default 1,
  p_makine_fiyat numeric default 0,
  p_servis_fiyat numeric default 0,
  p_periyot integer default 3,
  p_makine_tipi text default 'vinç',
  p_baslangic date default current_date,
  p_sure_yil integer default 1,
  p_dosya_url text default null,
  p_notlar text default null,
  p_yilda integer default null          -- ⭐ YILDA KAÇ KEZ
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_bitis date;
  v_yilda integer;
  v_periyot integer;
  v_yillik numeric(12,2);
  v_i integer;
  v_tarih date;
  v_adim interval;
begin
  if coalesce(trim(p_firma),'') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Firma adı zorunludur.');
  end if;

  -- ⭐ Öncelik: yılda kaç kez → periyot hesapla
  v_yilda := greatest(1, least(12, coalesce(p_yilda, floor(12.0 / greatest(1, coalesce(p_periyot,3)))::integer, 4)));
  v_periyot := greatest(1, round(12.0 / v_yilda)::integer);

  v_bitis := (coalesce(p_baslangic, current_date)::date + (greatest(1, coalesce(p_sure_yil,1)) * interval '1 year'))::date;
  v_yillik := coalesce(p_makine_sayisi,1) * (coalesce(p_makine_fiyat,0) + coalesce(p_servis_fiyat,0)) * v_yilda;

  insert into public.maintenance_contracts (
    company_name, hitap_adi, machine_count, price_per_machine, service_price,
    maintenance_period_months, machine_type, start_date, end_date,
    status, contract_file_url, yearly_total, visit_count, visits_per_year, notes
  ) values (
    trim(p_firma), nullif(trim(coalesce(p_hitap,'')),''),
    greatest(1, coalesce(p_makine_sayisi,1)), coalesce(p_makine_fiyat,0), coalesce(p_servis_fiyat,0),
    v_periyot, coalesce(p_makine_tipi,'vinç'),
    coalesce(p_baslangic, current_date)::date, v_bitis,
    'aktif', nullif(trim(coalesce(p_dosya_url,'')),''), v_yillik, v_yilda, v_yilda,
    nullif(trim(coalesce(p_notlar,'')),'')
  ) returning id into v_id;

  -- ⭐ TAKVİM: yılda v_yilda kez
  v_adim := ((12.0 / v_yilda) || ' months')::interval;
  v_i := 0;
  v_tarih := coalesce(p_baslangic, current_date)::date;
  while v_tarih <= v_bitis and v_i < 60 loop
    insert into public.bakim_plani (sozlesme_id, musteri, tarih, sira, yil, durum)
    values (v_id, trim(p_firma), v_tarih, v_i + 1, extract(year from v_tarih)::integer, 'planlandi');
    v_i := v_i + 1;
    v_tarih := (v_tarih + v_adim)::date;
  end loop;

  return jsonb_build_object('ok', true, 'id', v_id,
    'bitis', v_bitis, 'yillik_toplam', v_yillik,
    'yilda', v_yilda, 'periyot_ay', v_periyot, 'takvim_kayit', v_i,
    'mesaj', 'Sözleşme kaydedildi. Yılda ' || v_yilda || ' bakım takvime eklendi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.sozlesme_kaydet(text,text,integer,numeric,numeric,integer,text,date,integer,text,text,integer) from public;
grant execute on function public.sozlesme_kaydet(text,text,integer,numeric,numeric,integer,text,date,integer,text,text,integer) to authenticated;


-- ─── 3) takvim_yenile — sözleşmeden takvimi yeniden üret ───
create or replace function public.takvim_yenile(p_sozlesme_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s record;
  v_yilda integer;
  v_adim interval;
  v_i integer := 0;
  v_tarih date;
begin
  select * into v_s from public.maintenance_contracts where id = p_sozlesme_id;
  if v_s.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Sözleşme bulunamadı.'); end if;

  v_yilda := greatest(1, least(12, coalesce(v_s.visits_per_year,
    floor(12.0 / greatest(1, coalesce(v_s.maintenance_period_months,3)))::integer, 4)));
  v_adim := ((12.0 / v_yilda) || ' months')::interval;

  -- Yapılmışları KORU, planlanmışları sil
  delete from public.bakim_plani
   where sozlesme_id = p_sozlesme_id and durum <> 'yapildi';

  v_tarih := coalesce(v_s.start_date, current_date);
  while v_tarih <= coalesce(v_s.end_date, (v_tarih + interval '1 year')::date) and v_i < 60 loop
    insert into public.bakim_plani (sozlesme_id, musteri, tarih, sira, yil, durum)
    values (p_sozlesme_id, v_s.company_name, v_tarih, v_i + 1, extract(year from v_tarih)::integer, 'planlandi');
    v_i := v_i + 1;
    v_tarih := (v_tarih + v_adim)::date;
  end loop;

  update public.maintenance_contracts
     set visits_per_year = v_yilda,
         maintenance_period_months = greatest(1, round(12.0 / v_yilda)::integer),
         visit_count = v_yilda
   where id = p_sozlesme_id;

  return jsonb_build_object('ok', true, 'yilda', v_yilda, 'kayit', v_i,
    'mesaj', 'Takvim yenilendi: yılda ' || v_yilda || ' bakım.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.takvim_yenile(uuid) from public;
grant execute on function public.takvim_yenile(uuid) to authenticated;


-- ─── 4) TÜM sözleşmeleri yenile ───
create or replace function public.tum_takvimleri_yenile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s record;
  v_sayi integer := 0;
  v_toplam integer := 0;
  r jsonb;
begin
  for v_s in select id from public.maintenance_contracts where coalesce(status,'aktif') <> 'bitti' loop
    r := public.takvim_yenile(v_s.id);
    if (r->>'ok')::boolean then
      v_sayi := v_sayi + 1;
      v_toplam := v_toplam + coalesce((r->>'kayit')::integer, 0);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'sozlesme', v_sayi, 'kayit', v_toplam,
    'mesaj', v_sayi || ' sözleşme yenilendi, ' || v_toplam || ' bakım kaydı.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.tum_takvimleri_yenile() from public;
grant execute on function public.tum_takvimleri_yenile() to authenticated;


-- ─── 5) Sözleşme listesi: yılda kaç kez göster ───
drop function if exists public.sozlesme_listesi() cascade;

create function public.sozlesme_listesi()
returns table (
  id uuid, company_name text, hitap text, machine_count integer,
  machine_type text, price_per_machine numeric, service_price numeric,
  periyot integer, yilda integer, start_date text, end_date text,
  yearly_total numeric, status text, dosya_url text, gun_kaldi integer,
  yapilan integer, planlanan integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id, s.company_name, coalesce(s.hitap_adi,''), coalesce(s.machine_count,0),
    coalesce(s.machine_type,'vinç'), coalesce(s.price_per_machine,0), coalesce(s.service_price,0),
    coalesce(s.maintenance_period_months,0),
    coalesce(s.visits_per_year, floor(12.0/greatest(1,coalesce(s.maintenance_period_months,3)))::integer),
    to_char(s.start_date,'DD.MM.YYYY'), to_char(s.end_date,'DD.MM.YYYY'),
    coalesce(s.yearly_total,0), coalesce(s.status,'aktif'),
    coalesce(s.contract_file_url,''),
    (s.end_date - current_date)::integer,
    (select count(*)::integer from public.bakim_plani b where b.sozlesme_id = s.id and b.durum = 'yapildi'),
    (select count(*)::integer from public.bakim_plani b where b.sozlesme_id = s.id and b.durum = 'planlandi')
  from public.maintenance_contracts s
  order by s.end_date asc nulls last;
$$;

revoke all on function public.sozlesme_listesi() from public;
grant execute on function public.sozlesme_listesi() to authenticated;


-- ─── 6) ÇALIŞTIR: tüm takvimleri yenile ───
do $$
declare r jsonb;
begin
  r := public.tum_takvimleri_yenile();
  raise notice '🔄 %', r::text;
end $$;

-- ─── 7) SONUÇ ───
select company_name, visits_per_year, maintenance_period_months
from public.maintenance_contracts order by company_name;

select musteri, tarih, durum from public.bakim_takvimi_detay(null, null) order by tarih limit 20;
