-- ============================================================================
--  💰 SÖZLEŞME TUTAR FORMÜLÜ DÜZELTMESİ (Güncelleme #171)
--  DOĞRU: (makine_fiyat + servis_fiyat) × makine_sayısı × yılda_kez
--  KULLANIM: 198'den SONRA çalıştır.
-- ============================================================================

create or replace function public.sozlesme_tutar_hesapla(
  p_makine integer, p_makine_fiyat numeric, p_servis_fiyat numeric, p_yilda integer
)
returns numeric
language sql
immutable
as $$
  select coalesce(p_makine,0) * (coalesce(p_makine_fiyat,0) + coalesce(p_servis_fiyat,0)) * greatest(1, coalesce(p_yilda,1));
$$;

revoke all on function public.sozlesme_tutar_hesapla(integer, numeric, numeric, integer) from public;
grant execute on function public.sozlesme_tutar_hesapla(integer, numeric, numeric, integer) to authenticated;

-- Mevcut sözleşmelerin yıllık toplamını yeniden hesapla
do $$
declare
  v_s record;
  v_yeni numeric;
  v_sayi integer := 0;
begin
  for v_s in select * from public.maintenance_contracts loop
    v_yeni := public.sozlesme_tutar_hesapla(
      coalesce(v_s.machine_count,1),
      coalesce(v_s.price_per_machine,0),
      coalesce(v_s.service_price,0),
      coalesce(v_s.visits_per_year, floor(12.0/greatest(1,coalesce(v_s.maintenance_period_months,3)))::integer, 4)
    );
    update public.maintenance_contracts set yearly_total = v_yeni where id = v_s.id;
    v_sayi := v_sayi + 1;
  end loop;
  raise notice '✅ % sözleşme tutarı güncellendi', v_sayi;
end $$;

select company_name, machine_count, price_per_machine, service_price,
       visits_per_year, yearly_total
from public.maintenance_contracts order by company_name;
