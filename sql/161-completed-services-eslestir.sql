-- ============================================================================
--  💰 DOĞRU TABLO: completed_services (Güncelleme #133)
-- ----------------------------------------------------------------------------
--  SORUN: financial_records'ta firma adı yok → 0 eşleşme
--
--  GERÇEK: /admin/analiz "Yeni İşlem Ekle" → completed_services tablosuna yazar
--          Bu tabloda: customer_text, price, service_date, technician
--
--  ÇÖZÜM: service_reports.firma_adi ↔ completed_services.customer_text
--         eşleştir → finans_kaydedildi = true
--
--  KULLANIM: 160'tan SONRA çalıştır.
-- ============================================================================


-- ============================================================================
-- 1) 📄 completed_services SON KAYITLAR
-- ============================================================================
select
  cs.id,
  coalesce(cs.customer_text,'—') as musteri,
  cs.price as tutar,
  to_char(cs.service_date,'DD.MM.YYYY') as tarih,
  coalesce(cs.technician,'—') as personel
from public.completed_services cs
order by cs.created_at desc
limit 12;


-- ============================================================================
-- 2) 🎯 EŞLEŞME TESTİ — servis raporu ↔ completed_services
-- ============================================================================
select
  coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'—') as form_firma,
  to_char(sr.created_at,'DD.MM') as form_tarih,
  coalesce(cs.customer_text,'—') as finans_musteri,
  to_char(cs.service_date,'DD.MM') as finans_tarih,
  public.firma_benzerlik(
    coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
    coalesce(cs.customer_text,'')
  ) as skor,
  case
    when public.firma_benzerlik(
      coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
      coalesce(cs.customer_text,'')
    ) >= 60 then 'EŞLEŞİR ✓'
    else 'hayır'
  end as sonuc
from public.service_reports sr
cross join lateral (
  select cs2.customer_text, cs2.service_date, cs2.id
  from public.completed_services cs2
  order by public.firma_benzerlik(
    coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
    coalesce(cs2.customer_text,'')
  ) desc
  limit 1
) cs
where coalesce((to_jsonb(sr)->>'finans_kaydedildi')::boolean, false) = false
order by 5 desc
limit 25;


-- ============================================================================
-- 3) 🔗 İŞARETLE — completed_services ile eşleşen formları FİNANSTA yap
-- ============================================================================
create or replace function public.finans_completed_isle(p_esik integer default 60)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servis integer := 0;
  v_bakim integer := 0;
begin
  -- ═══ SERVİS RAPORLARI ═══
  begin
    with adaylar as (
      select
        sr.id as sr_id,
        cs.id as cs_id,
        public.firma_benzerlik(
          coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
          coalesce(cs.customer_text,'')
        ) as skor
      from public.service_reports sr
      cross join public.completed_services cs
      where coalesce((to_jsonb(sr)->>'finans_kaydedildi')::boolean, false) = false
    ),
    secilen as (
      select distinct on (sr_id) sr_id, cs_id, skor
      from adaylar
      where skor >= p_esik
      order by sr_id, skor desc
    )
    update public.service_reports sr
       set finans_kaydedildi = true,
           finans_kayit_id = s.cs_id
      from secilen s
     where sr.id = s.sr_id;
    get diagnostics v_servis = row_count;
  exception when others then v_servis := -1; end;

  -- ═══ BAKIM FORMLARI ═══
  begin
    with adaylar as (
      select
        bf.id as bf_id,
        cs.id as cs_id,
        public.firma_benzerlik(coalesce(bf.musteri,''), coalesce(cs.customer_text,'')) as skor
      from public.bakim_formlari bf
      cross join public.completed_services cs
      where coalesce(bf.finans_kaydedildi, false) = false
    ),
    secilen as (
      select distinct on (bf_id) bf_id, cs_id, skor
      from adaylar
      where skor >= p_esik
      order by bf_id, skor desc
    )
    update public.bakim_formlari bf
       set finans_kaydedildi = true,
           finans_kayit_id = s.cs_id
      from secilen s
     where bf.id = s.bf_id;
    get diagnostics v_bakim = row_count;
  exception when others then v_bakim := -1; end;

  return jsonb_build_object(
    'servis_isaretlenen', v_servis,
    'bakim_isaretlenen', v_bakim,
    'mesaj', '💰 ' || v_servis || ' servis + ' || v_bakim || ' bakım formu FİNANSTA işaretlendi.'
  );
exception when others then
  return jsonb_build_object('servis_isaretlenen', 0, 'bakim_isaretlenen', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.finans_completed_isle(integer) from public;
grant execute on function public.finans_completed_isle(integer) to authenticated;


-- ============================================================================
-- 4) 🧪 ÇALIŞTIR
-- ============================================================================
select public.finans_completed_isle(60) as sonuc;

select
  (select count(*) from public.service_reports
    where coalesce((to_jsonb(service_reports)->>'finans_kaydedildi')::boolean,false)) as isaretli_servis,
  (select count(*) from public.bakim_formlari where coalesce(finans_kaydedildi,false)) as isaretli_bakim,
  (select count(*) from public.completed_services) as toplam_is;
