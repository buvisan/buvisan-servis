-- ============================================================================
--  🔧 MÜŞTERİ BAKIM VERİSİ DÜZELTMESİ (Güncelleme #174)
-- ----------------------------------------------------------------------------
--  SORUN: Sözleşmesi olmayan/teklif aşamasındaki müşteride bakım verisi
--         yanlış/eksik geliyordu
--
--  KURAL: SADECE "anlasildi" aşamasındaki aktif sözleşme → bakım verisi
--         Sözleşme yoksa → BOŞ döner
--
--  KULLANIM: 201'den SONRA çalıştır.
-- ============================================================================

-- ─── 1) musteri_sozlesmem — sadece anlaşılmış ───
create or replace function public.musteri_sozlesmem(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_h record;
  v_s record;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz.'); end if;

  select * into v_s from public.maintenance_contracts s
  where public.firma_eslestir(s.company_name, v_h.firma_adi) >= 75
    and coalesce(s.asama,'anlasildi') = 'anlasildi'
    and coalesce(s.status,'aktif') <> 'bitti'
  order by s.start_date desc limit 1;

  if v_s.id is null then
    return jsonb_build_object('ok', true, 'var', false);
  end if;

  return jsonb_build_object('ok', true, 'var', true,
    'id', v_s.id,
    'firma', v_s.company_name,
    'hitap', coalesce(v_s.hitap_adi,''),
    'makine_sayisi', coalesce(v_s.machine_count,0),
    'makine_tipi', coalesce(v_s.machine_type,'vinç'),
    'makine_fiyat', coalesce(v_s.price_per_machine,0),
    'servis_fiyat', coalesce(v_s.service_price,0),
    'periyot', coalesce(v_s.maintenance_period_months,0),
    'yilda', greatest(1, round(12.0 / greatest(1, coalesce(v_s.maintenance_period_months,3)))::integer),
    'baslangic', to_char(v_s.start_date,'DD.MM.YYYY'),
    'bitis', to_char(v_s.end_date,'DD.MM.YYYY'),
    'yillik_toplam', coalesce(v_s.yearly_total,0),
    'visit_count', coalesce(v_s.visit_count,0),
    'dosya_url', coalesce(v_s.contract_file_url,''),
    'gun_kaldi', (v_s.end_date - current_date)::integer
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_sozlesmem(text) from public;
grant execute on function public.musteri_sozlesmem(text) to anon, authenticated;


-- ─── 2) musteri_bakim_takvimi — sadece anlaşılmış + takvimi olan ───
create or replace function public.musteri_bakim_takvimi(p_token text, p_yil integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_h record;
  v_sonuc jsonb;
  v_sozlesme_var boolean := false;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz.', 'sozlesme_var', false, 'takvim', '[]'::jsonb); end if;

  -- Aktif anlaşılmış sözleşme var mı?
  select exists(
    select 1 from public.maintenance_contracts s
    where public.firma_eslestir(s.company_name, v_h.firma_adi) >= 75
      and coalesce(s.asama,'anlasildi') = 'anlasildi'
      and coalesce(s.status,'aktif') <> 'bitti'
  ) into v_sozlesme_var;

  if not v_sozlesme_var then
    return jsonb_build_object('ok', true, 'firma', v_h.firma_adi,
      'sozlesme_var', false, 'takvim', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'tarih', to_char(b.tarih,'DD.MM.YYYY'),
    'tarih_iso', to_char(b.tarih,'YYYY-MM-DD'),
    'sira', b.sira, 'durum', b.durum,
    'gun_kaldi', (b.tarih - current_date)::integer,
    'makine_sayisi', coalesce(s.machine_count,0),
    'makine_tipi', coalesce(s.machine_type,'vinç'),
    'periyot', coalesce(s.maintenance_period_months,0),
    'yilda', greatest(1, round(12.0 / greatest(1, coalesce(s.maintenance_period_months,3)))::integer)
  ) order by b.tarih), '[]'::jsonb)
  into v_sonuc
  from public.bakim_plani b
  join public.maintenance_contracts s on s.id = b.sozlesme_id
  where public.firma_eslestir(b.musteri, v_h.firma_adi) >= 75
    and coalesce(s.asama,'anlasildi') = 'anlasildi'
    and (p_yil is null or b.yil = p_yil);

  return jsonb_build_object('ok', true,
    'firma', v_h.firma_adi,
    'sozlesme_var', true,
    'takvim', v_sonuc,
    'toplam', jsonb_array_length(v_sonuc),
    'yapilan', (select count(*) from jsonb_array_elements(v_sonuc) e where e->>'durum' = 'yapildi')
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm, 'sozlesme_var', false, 'takvim', '[]'::jsonb);
end $$;

revoke all on function public.musteri_bakim_takvimi(text, integer) from public;
grant execute on function public.musteri_bakim_takvimi(text, integer) to anon, authenticated;


-- ─── 3) TEŞHİS: KARESİ ───
select
  h.firma_adi,
  (select count(*) from public.maintenance_contracts s
   where public.firma_eslestir(s.company_name, h.firma_adi) >= 75) as sozlesme_sayisi,
  (select count(*) from public.maintenance_contracts s
   where public.firma_eslestir(s.company_name, h.firma_adi) >= 75
     and coalesce(s.asama,'anlasildi') = 'anlasildi') as anlasilmis,
  (select count(*) from public.bakim_plani b
   where public.firma_eslestir(b.musteri, h.firma_adi) >= 75) as takvim_kayit
from public.musteri_hesaplar h
where h.durum = 'onaylandi';

-- Tüm sözleşmelerin aşama durumu
select company_name, asama, status,
       (select count(*) from public.bakim_plani b where b.sozlesme_id = s.id) as takvim
from public.maintenance_contracts s order by company_name;
