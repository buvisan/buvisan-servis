-- ============================================================================
--  🔧 SÖZLEŞME TUTAR + YILDA KEZ TUTARLILIĞI (Güncelleme #172)
-- ----------------------------------------------------------------------------
--  SORUN: visits_per_year ile maintenance_period_months tutarsız
--         (COATS: 6 ayda 1 ama yılda 4 görünüyor → 224.000 yanlış)
--
--  DOĞRU: yilda = 12 / period
--         toplam = makine × bakim_fiyati × yilda  (servis DAHİL DEĞİL)
--
--  KULLANIM: 199'dan SONRA çalıştır.
-- ============================================================================

-- ─── 1) Tutarlılığı sağla ───
do $$
declare
  v_s record;
  v_yilda integer;
  v_toplam numeric;
  v_sayi integer := 0;
begin
  for v_s in select * from public.maintenance_contracts loop
    -- yilda = 12 / period (period öncelikli)
    v_yilda := greatest(1, least(12, round(12.0 / greatest(1, coalesce(v_s.maintenance_period_months, 3)))::integer));

    -- toplam = makine × bakim_fiyati × yilda
    v_toplam := coalesce(v_s.machine_count, 1) * coalesce(v_s.price_per_machine, 0) * v_yilda;

    update public.maintenance_contracts
       set visits_per_year = v_yilda,
           visit_count = v_yilda,
           yearly_total = v_toplam
     where id = v_s.id;

    v_sayi := v_sayi + 1;
    raise notice '  % → period=% ay, yilda=%, toplam=%',
      v_s.company_name, v_s.maintenance_period_months, v_yilda, v_toplam;
  end loop;

  raise notice '✅ % sözleşme düzeltildi', v_sayi;
end $$;


-- ─── 2) Takvimleri bu sayıya göre yenile ───
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
  v_toplam numeric;
begin
  select * into v_s from public.maintenance_contracts where id = p_sozlesme_id;
  if v_s.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Sözleşme bulunamadı.'); end if;

  delete from public.bakim_plani
   where sozlesme_id = p_sozlesme_id and durum <> 'yapildi';

  if coalesce(v_s.asama,'anlasildi') = 'teklif' then
    return jsonb_build_object('ok', true, 'yilda', 0, 'kayit', 0,
      'mesaj', 'Teklif aşamasında — takvim oluşturulmadı.');
  end if;

  -- ⭐ period ÖNCELİKLİ (tek doğru kaynak)
  v_yilda := greatest(1, least(12, round(12.0 / greatest(1, coalesce(v_s.maintenance_period_months, 3)))::integer));
  v_adim := ((12.0 / v_yilda) || ' months')::interval;
  v_toplam := coalesce(v_s.machine_count,1) * coalesce(v_s.price_per_machine,0) * v_yilda;

  v_tarih := coalesce(v_s.start_date, current_date);
  while v_tarih < coalesce(v_s.end_date, (v_tarih + interval '1 year')::date) and v_i < 60 loop
    insert into public.bakim_plani (sozlesme_id, musteri, tarih, sira, yil, durum)
    values (p_sozlesme_id, v_s.company_name, v_tarih, v_i + 1, extract(year from v_tarih)::integer, 'planlandi');
    v_i := v_i + 1;
    v_tarih := (v_tarih + v_adim)::date;
  end loop;

  update public.maintenance_contracts
     set visits_per_year = v_yilda,
         visit_count = v_yilda,
         yearly_total = v_toplam
   where id = p_sozlesme_id;

  return jsonb_build_object('ok', true, 'yilda', v_yilda, 'kayit', v_i,
    'toplam', v_toplam,
    'mesaj', 'Takvim yenilendi: yılda ' || v_yilda || ' bakım, toplam ' || to_char(v_toplam,'FM999G999D00') || ' TL.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.takvim_yenile(uuid) from public;
grant execute on function public.takvim_yenile(uuid) to authenticated;


-- ─── 3) Tüm takvimleri yenile ───
do $$
declare r jsonb;
begin
  r := public.tum_takvimleri_yenile();
  raise notice '🔄 %', r::text;
end $$;


-- ─── 4) SONUÇ ───
select
  company_name,
  maintenance_period_months as periyot_ay,
  visits_per_year as yilda,
  machine_count as makine,
  price_per_machine as bakim_fiyat,
  service_price as servis,
  yearly_total as toplam,
  (select count(*) from public.bakim_plani b where b.sozlesme_id = s.id) as takvim_kayit
from public.maintenance_contracts s
order by company_name;
