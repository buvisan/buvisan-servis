-- ============================================================================
--  🎯 FİNANSTA — TEŞHİS + AYARLANABİLİR EŞLEŞTİRME (Güncelleme #135)
-- ----------------------------------------------------------------------------
--  DURUM: Skor 85 → 0 eşleşme (çok sıkı)
--         Skor 60 → 47 eşleşme (çok gevşek, yanlış)
--
--  BU SCRIPT:
--    1) ADAYLARI GÖSTER (skor + tarih farkı) → doğru eşiği seçelim
--    2) Ayarlanabilir eşleştirme (varsayılan: 75 + ±7 gün + çift yönlü 1:1)
--
--  KULLANIM: 162'den SONRA çalıştır.
-- ============================================================================


-- ============================================================================
-- 1) 🔍 ADAYLARI GÖR — her form için en iyi 1 eşleşme
-- ============================================================================
select
  coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'—') as form_firma,
  to_char(sr.created_at,'DD.MM.YYYY') as form_tarih,
  coalesce(cs.customer_text,'—') as finans_firma,
  to_char(cs.service_date,'DD.MM.YYYY') as finans_tarih,
  public.firma_benzerlik(
    coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
    coalesce(cs.customer_text,'')
  ) as skor,
  abs((sr.created_at::date - cs.service_date::date)) as gun_fark
from public.service_reports sr
cross join lateral (
  select cs2.customer_text, cs2.service_date, cs2.id
  from public.completed_services cs2
  where cs2.service_date is not null
  order by public.firma_benzerlik(
    coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
    coalesce(cs2.customer_text,'')
  ) desc,
  abs((sr.created_at::date - cs2.service_date::date)) asc
  limit 1
) cs
order by sr.created_at desc
limit 30;


-- ============================================================================
-- 2) 🎯 AYARLANABİLİR EŞLEŞTİRME
-- ============================================================================
create or replace function public.finans_eslestir_ayarli(
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

  -- ═══ SERVİS — çift yönlü 1:1 ═══
  begin
    with adaylar as (
      select
        sr.id as sr_id,
        cs.id as cs_id,
        public.firma_benzerlik(
          coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
          coalesce(cs.customer_text,'')
        ) as skor,
        abs((sr.created_at::date - cs.service_date::date)) as gun_fark,
        row_number() over (partition by sr.id order by
          public.firma_benzerlik(
            coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
            coalesce(cs.customer_text,'')
          ) desc,
          abs((sr.created_at::date - cs.service_date::date)) asc
        ) as sr_sira,
        row_number() over (partition by cs.id order by
          public.firma_benzerlik(
            coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
            coalesce(cs.customer_text,'')
          ) desc,
          abs((sr.created_at::date - cs.service_date::date)) asc
        ) as cs_sira
      from public.service_reports sr
      join public.completed_services cs
        on cs.service_date is not null
       and abs((sr.created_at::date - cs.service_date::date)) <= p_gun
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
        abs((bf.created_at::date - cs.service_date::date)) as gun_fark,
        row_number() over (partition by bf.id order by
          public.firma_benzerlik(coalesce(bf.musteri,''), coalesce(cs.customer_text,'')) desc,
          abs((bf.created_at::date - cs.service_date::date)) asc
        ) as bf_sira,
        row_number() over (partition by cs.id order by
          public.firma_benzerlik(coalesce(bf.musteri,''), coalesce(cs.customer_text,'')) desc,
          abs((bf.created_at::date - cs.service_date::date)) asc
        ) as cs_sira
      from public.bakim_formlari bf
      join public.completed_services cs
        on cs.service_date is not null
       and abs((bf.created_at::date - cs.service_date::date)) <= p_gun
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
    'kural', 'isim ≥ ' || p_esik || ' + tarih ±' || p_gun || ' gün + çift yönlü 1:1',
    'mesaj', '🎯 ' || v_servis || ' servis + ' || v_bakim || ' bakım işaretlendi.'
  );
exception when others then
  return jsonb_build_object('servis_isaretlenen', 0, 'bakim_isaretlenen', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.finans_eslestir_ayarli(integer, integer) from public;
grant execute on function public.finans_eslestir_ayarli(integer, integer) to authenticated;


-- ============================================================================
-- 3) 🧪 ÇALIŞTIR — varsayılan 75 + ±7 gün
-- ============================================================================
select public.finans_eslestir_ayarli(75, 7) as sonuc;


-- ============================================================================
-- 4) 📋 İŞARETLENENLER — doğru mu?
-- ============================================================================
select
  coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'—') as form_firma,
  to_char(sr.created_at,'DD.MM') as form_t,
  coalesce(cs.customer_text,'—') as finans_firma,
  to_char(cs.service_date,'DD.MM') as finans_t,
  abs((sr.created_at::date - cs.service_date::date)) as gun,
  public.firma_benzerlik(
    coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
    coalesce(cs.customer_text,'')
  ) as skor
from public.service_reports sr
left join public.completed_services cs on cs.id = sr.finans_kayit_id
where coalesce(sr.finans_kaydedildi,false) = true
order by sr.created_at desc
limit 30;


-- ============================================================================
-- 5) 📊 ÖZET
-- ============================================================================
select
  (select count(*) from public.service_reports
    where coalesce((to_jsonb(service_reports)->>'finans_kaydedildi')::boolean,false)) as isaretli_servis,
  (select count(*) from public.bakim_formlari where coalesce(finans_kaydedildi,false)) as isaretli_bakim,
  (select count(*) from public.service_reports) as toplam_servis;
