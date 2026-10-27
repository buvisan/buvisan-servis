-- ============================================================================
--  🔧 FİNANSTA — TARİH FALLBACK DÜZELTMESİ (Güncelleme #136)
-- ----------------------------------------------------------------------------
--  SORUN: ALPOLİMER formu 16.10, finansa 16.10'da girilmiş ama eşleşmedi.
--  SEBEP: completed_services.service_date NULL olabilir (0₺ kayıtlarda)
--         Benim sorgum "service_date is not null" ile atlıyordu.
--
--  ÇÖZÜM: COALESCE(service_date, created_at::date) kullan
--
--  KULLANIM: 163'ten SONRA çalıştır.
-- ============================================================================


-- ============================================================================
-- 1) 🔍 ALPOLİMER KONTROLÜ — service_date NULL mu?
-- ============================================================================
select
  cs.id,
  coalesce(cs.customer_text,'—') as musteri,
  to_char(cs.service_date,'DD.MM.YYYY') as service_date,
  to_char(cs.created_at,'DD.MM.YYYY') as created_at,
  case when cs.service_date is null then '❌ NULL' else '✅ VAR' end as durum,
  cs.price as tutar
from public.completed_services cs
where public.parca_adi_normal(coalesce(cs.customer_text,'')) like '%alpolimer%'
order by cs.created_at desc
limit 10;


-- ============================================================================
-- 2) 🎯 TARİH FALLBACK İLE EŞLEŞTİRME
-- ============================================================================
create or replace function public.finans_eslestir_v2(
  p_esik integer default 75,
  p_gun integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servis integer := 0;
  v_bakim integer := 0;
begin
  -- Sıfırla
  update public.service_reports set finans_kaydedildi = false, finans_kayit_id = null;
  update public.bakim_formlari set finans_kaydedildi = false, finans_kayit_id = null;

  -- ═══ SERVİS — TARİH FALLBACK ═══
  begin
    with adaylar as (
      select
        sr.id as sr_id,
        cs.id as cs_id,
        public.firma_benzerlik(
          coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
          coalesce(cs.customer_text,'')
        ) as skor,
        abs((sr.created_at::date - coalesce(cs.service_date, cs.created_at::date))) as gun_fark,
        row_number() over (partition by sr.id order by
          public.firma_benzerlik(
            coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
            coalesce(cs.customer_text,'')
          ) desc,
          abs((sr.created_at::date - coalesce(cs.service_date, cs.created_at::date))) asc
        ) as sr_sira,
        row_number() over (partition by cs.id order by
          public.firma_benzerlik(
            coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
            coalesce(cs.customer_text,'')
          ) desc,
          abs((sr.created_at::date - coalesce(cs.service_date, cs.created_at::date))) asc
        ) as cs_sira
      from public.service_reports sr
      join public.completed_services cs
        on abs((sr.created_at::date - coalesce(cs.service_date, cs.created_at::date))) <= p_gun
      where public.firma_benzerlik(
              coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
              coalesce(cs.customer_text,'')
            ) >= p_esik
    ),
    secilen as (
      select sr_id, cs_id from adaylar where sr_sira = 1 and cs_sira = 1
    )
    update public.service_reports sr
       set finans_kaydedildi = true,
           finans_kayit_id = s.cs_id
      from secilen s
     where sr.id = s.sr_id;
    get diagnostics v_servis = row_count;
  exception when others then v_servis := -1; end;

  -- ═══ BAKIM ═══
  begin
    with adaylar as (
      select
        bf.id as bf_id,
        cs.id as cs_id,
        public.firma_benzerlik(coalesce(bf.musteri,''), coalesce(cs.customer_text,'')) as skor,
        abs((bf.created_at::date - coalesce(cs.service_date, cs.created_at::date))) as gun_fark,
        row_number() over (partition by bf.id order by
          public.firma_benzerlik(coalesce(bf.musteri,''), coalesce(cs.customer_text,'')) desc,
          abs((bf.created_at::date - coalesce(cs.service_date, cs.created_at::date))) asc
        ) as bf_sira,
        row_number() over (partition by cs.id order by
          public.firma_benzerlik(coalesce(bf.musteri,''), coalesce(cs.customer_text,'')) desc,
          abs((bf.created_at::date - coalesce(cs.service_date, cs.created_at::date))) asc
        ) as cs_sira
      from public.bakim_formlari bf
      join public.completed_services cs
        on abs((bf.created_at::date - coalesce(cs.service_date, cs.created_at::date))) <= p_gun
      where public.firma_benzerlik(coalesce(bf.musteri,''), coalesce(cs.customer_text,'')) >= p_esik
    ),
    secilen as (
      select bf_id, cs_id from adaylar where bf_sira = 1 and cs_sira = 1
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
    'kural', 'isim ≥ ' || p_esik || ' + tarih ±' || p_gun || ' gün (NULL tarihte created_at)',
    'mesaj', '🎯 ' || v_servis || ' servis + ' || v_bakim || ' bakım işaretlendi.'
  );
exception when others then
  return jsonb_build_object('servis_isaretlenen', 0, 'bakim_isaretlenen', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.finans_eslestir_v2(integer, integer) from public;
grant execute on function public.finans_eslestir_v2(integer, integer) to authenticated;


-- ============================================================================
-- 3) 🧪 ÇALIŞTIR
-- ============================================================================
select public.finans_eslestir_v2(75, 7) as sonuc;


-- ============================================================================
-- 4) 📋 ALPOLİMER EŞLEŞTİ Mİ?
-- ============================================================================
select
  coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'—') as form_firma,
  to_char(sr.created_at,'DD.MM') as form_t,
  coalesce(cs.customer_text,'—') as finans_firma,
  to_char(coalesce(cs.service_date, cs.created_at::date),'DD.MM') as finans_t,
  coalesce(sr.finans_kaydedildi,false) as isaretli
from public.service_reports sr
left join public.completed_services cs on cs.id = sr.finans_kayit_id
where public.parca_adi_normal(coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')) like '%alpolimer%'
order by sr.created_at desc;


-- ============================================================================
-- 5) 📊 ÖZET
-- ============================================================================
select
  (select count(*) from public.service_reports
    where coalesce((to_jsonb(service_reports)->>'finans_kaydedildi')::boolean,false)) as isaretli_servis,
  (select count(*) from public.bakim_formlari where coalesce(finans_kaydedildi,false)) as isaretli_bakim,
  (select count(*) from public.service_reports) as toplam_servis;
