-- ============================================================================
--  🔧 SÖZLEŞME AŞAMASI + FAZLA BAKIM DÜZELTMESİ (Güncelleme #170)
-- ----------------------------------------------------------------------------
--  1) Fazla bakım: bitiş tarihi dahil değildi → 5. bakım oluşuyordu
--  2) Aşama: teklif | anlasildi → teklif aşamasındakiler takvime GİRMEZ
--
--  KULLANIM: 197'den SONRA çalıştır.
-- ============================================================================

-- ─── 1) aşama alanı ───
alter table public.maintenance_contracts
  add column if not exists asama text default 'anlasildi';   -- teklif | anlasildi

update public.maintenance_contracts set asama = 'anlasildi' where asama is null;


-- ─── 2) sozlesme_kaydet — aşama + doğru bakım sayısı ───
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
  p_yilda integer default null,
  p_asama text default 'anlasildi'            -- ⭐ teklif | anlasildi
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
  v_i integer := 0;
  v_tarih date;
  v_adim interval;
  v_asama text := coalesce(p_asama, 'anlasildi');
begin
  if coalesce(trim(p_firma),'') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Firma adı zorunludur.');
  end if;

  v_yilda := greatest(1, least(12, coalesce(p_yilda, floor(12.0 / greatest(1, coalesce(p_periyot,3)))::integer, 4)));
  v_periyot := greatest(1, round(12.0 / v_yilda)::integer);

  v_bitis := (coalesce(p_baslangic, current_date)::date + (greatest(1, coalesce(p_sure_yil,1)) * interval '1 year'))::date;
  v_yillik := coalesce(p_makine_sayisi,1) * coalesce(p_makine_fiyat,0) * v_yilda;

  insert into public.maintenance_contracts (
    company_name, hitap_adi, machine_count, price_per_machine, service_price,
    maintenance_period_months, machine_type, start_date, end_date,
    status, contract_file_url, yearly_total, visit_count, visits_per_year, notes, asama
  ) values (
    trim(p_firma), nullif(trim(coalesce(p_hitap,'')),''),
    greatest(1, coalesce(p_makine_sayisi,1)), coalesce(p_makine_fiyat,0), coalesce(p_servis_fiyat,0),
    v_periyot, coalesce(p_makine_tipi,'vinç'),
    coalesce(p_baslangic, current_date)::date, v_bitis,
    'aktif', nullif(trim(coalesce(p_dosya_url,'')),''), v_yillik, v_yilda, v_yilda,
    nullif(trim(coalesce(p_notlar,'')),''), v_asama
  ) returning id into v_id;

  -- ⭐ TAKVİM: SADECE "anlasildi" ise, bitiş tarihi HARİÇ
  if v_asama = 'anlasildi' then
    v_adim := ((12.0 / v_yilda) || ' months')::interval;
    v_tarih := coalesce(p_baslangic, current_date)::date;

    while v_tarih < v_bitis and v_i < 60 loop
      insert into public.bakim_plani (sozlesme_id, musteri, tarih, sira, yil, durum)
      values (v_id, trim(p_firma), v_tarih, v_i + 1, extract(year from v_tarih)::integer, 'planlandi');
      v_i := v_i + 1;
      v_tarih := (v_tarih + v_adim)::date;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id,
    'bitis', v_bitis, 'yillik_toplam', v_yillik,
    'yilda', v_yilda, 'periyot_ay', v_periyot,
    'asama', v_asama, 'takvim_kayit', v_i,
    'mesaj', case when v_asama = 'teklif'
      then 'Teklif aşamasında kaydedildi. Anlaşma sağlanınca takvime eklenecek.'
      else 'Sözleşme kaydedildi. Yılda ' || v_yilda || ' bakım takvime eklendi.' end);
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.sozlesme_kaydet(text,text,integer,numeric,numeric,integer,text,date,integer,text,text,integer,text) from public;
grant execute on function public.sozlesme_kaydet(text,text,integer,numeric,numeric,integer,text,date,integer,text,text,integer,text) to authenticated;


-- ─── 3) takvim_yenile — bitiş hariç ───
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

  -- Yapılmışları KORU, planlanmışları sil
  delete from public.bakim_plani
   where sozlesme_id = p_sozlesme_id and durum <> 'yapildi';

  -- Teklif aşamasındaysa takvim oluşturma
  if coalesce(v_s.asama,'anlasildi') = 'teklif' then
    return jsonb_build_object('ok', true, 'yilda', 0, 'kayit', 0,
      'mesaj', 'Teklif aşamasında — takvim oluşturulmadı.');
  end if;

  v_yilda := greatest(1, least(12, coalesce(v_s.visits_per_year,
    floor(12.0 / greatest(1, coalesce(v_s.maintenance_period_months,3)))::integer, 4)));
  v_adim := ((12.0 / v_yilda) || ' months')::interval;

  v_tarih := coalesce(v_s.start_date, current_date);
  while v_tarih < coalesce(v_s.end_date, (v_tarih + interval '1 year')::date) and v_i < 60 loop
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


-- ─── 4) aşama değiştir ───
create or replace function public.sozlesme_asama_degistir(p_id uuid, p_asama text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_asama not in ('teklif','anlasildi') then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçersiz aşama.');
  end if;

  update public.maintenance_contracts set asama = p_asama where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'mesaj', 'Sözleşme bulunamadı.'); end if;

  if p_asama = 'anlasildi' then
    perform public.takvim_yenile(p_id);
    return jsonb_build_object('ok', true, 'mesaj', '✅ Anlaşma sağlandı — takvim oluşturuldu.');
  else
    delete from public.bakim_plani where sozlesme_id = p_id and durum <> 'yapildi';
    return jsonb_build_object('ok', true, 'mesaj', 'Teklif aşamasına alındı — takvim kaldırıldı.');
  end if;
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.sozlesme_asama_degistir(uuid, text) from public;
grant execute on function public.sozlesme_asama_degistir(uuid, text) to authenticated;


-- ─── 5) sozlesme_listesi: aşama ekle ───
drop function if exists public.sozlesme_listesi() cascade;

create function public.sozlesme_listesi()
returns table (
  id uuid, company_name text, hitap text, machine_count integer,
  machine_type text, price_per_machine numeric, service_price numeric,
  periyot integer, yilda integer, start_date text, end_date text,
  yearly_total numeric, status text, dosya_url text, gun_kaldi integer,
  yapilan integer, planlanan integer, asama text
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
    (select count(*)::integer from public.bakim_plani b where b.sozlesme_id = s.id and b.durum = 'planlandi'),
    coalesce(s.asama,'anlasildi')
  from public.maintenance_contracts s
  order by s.end_date asc nulls last;
$$;

revoke all on function public.sozlesme_listesi() from public;
grant execute on function public.sozlesme_listesi() to authenticated;


-- ─── 6) MEVCUT TAKVİMLERİ DÜZELT (fazla bakımları sil) ───
do $$
declare r jsonb;
begin
  r := public.tum_takvimleri_yenile();
  raise notice '🔄 %', r::text;
end $$;

-- ─── 7) SONUÇ ───
select company_name, asama, visits_per_year,
       (select count(*) from public.bakim_plani b where b.sozlesme_id = s.id) as takvim_kayit
from public.maintenance_contracts s order by company_name;
