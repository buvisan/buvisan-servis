-- ============================================================================
--  🔍 FİNANS SATIRINI TARAYARAK EŞLEŞTİR (Güncelleme #132)
-- ----------------------------------------------------------------------------
--  SORUN: financial_records'ta müşteri adının hangi alanda olduğu bilinmiyor.
--
--  ÇÖZÜM: Müşteri adını aramak yerine TÜM SATIRI metin olarak tara.
--         Formun ilk 4 harfi satırda geçiyorsa → eşleşme.
--
--  ÖRNEK:
--    Finans satırı: {"month_key":"2026-10","gelir":5000,"aciklama":"gent kalip bakim"}
--    Form: "Gent kalıp" → normal "gent kalip" → ilk 4 "gent"
--    Satırda "gent" var mı? → EVET → EŞLEŞTİ ✓
--
--  KULLANIM: 159'dan SONRA çalıştır.
-- ============================================================================


-- ============================================================================
-- 1) 📄 FİNANS KAYITLARI — JSON (alanları görmek için)
-- ============================================================================
select
  to_jsonb(fr) as tum_alanlar
from public.financial_records fr
order by coalesce(to_jsonb(fr)->>'month_key','') desc
limit 10;


-- ============================================================================
-- 2) 🔍 EŞLEŞME TESTİ — satır metni ile form adı
-- ============================================================================
select
  to_jsonb(fr)->>'month_key' as ay,
  left(public.firma_normal(to_jsonb(fr)::text), 120) as satir_metni,
  sr_form.form_firma,
  case
    when length(public.firma_normal(sr_form.form_firma)) >= 4
     and position(left(public.firma_normal(sr_form.form_firma), 4) in public.firma_normal(to_jsonb(fr)::text)) > 0
    then 'EŞLEŞİR ✓'
    else 'hayır'
  end as sonuc
from public.financial_records fr
cross join lateral (
  select coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'') as form_firma
  from public.service_reports sr
  where coalesce((to_jsonb(sr)->>'finans_kaydedildi')::boolean, false) = false
  order by
    case
      when length(public.firma_normal(coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''))) >= 4
       and position(left(public.firma_normal(coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')), 4) in public.firma_normal(to_jsonb(fr)::text)) > 0
      then 0 else 1
    end
  limit 1
) sr_form
order by 1 desc
limit 20;


-- ============================================================================
-- 3) 🔗 OTOMATİK EŞLEŞTİR VE İŞARETLE
-- ============================================================================
create or replace function public.finans_otomatik_isle(p_min_karakter integer default 4)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servis integer := 0;
  v_bakim integer := 0;
  v_eslesmeyen integer := 0;
begin
  -- ═══ SERVİS RAPORLARI ═══
  begin
    with adaylar as (
      select
        sr.id as sr_id,
        fr.id as fr_id,
        public.firma_benzerlik(
          coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
          to_jsonb(fr)::text
        ) as skor,
        case
          when length(public.firma_normal(coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''))) >= p_min_karakter
           and position(
                 left(public.firma_normal(coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')), p_min_karakter)
                 in public.firma_normal(to_jsonb(fr)::text)
               ) > 0
          then true else false
        end as prefix_var
      from public.service_reports sr
      cross join public.financial_records fr
      where coalesce((to_jsonb(sr)->>'finans_kaydedildi')::boolean, false) = false
    ),
    secilen as (
      select distinct on (sr_id) sr_id, fr_id, skor
      from adaylar
      where prefix_var = true
      order by sr_id, skor desc
    )
    update public.service_reports sr
       set finans_kaydedildi = true,
           finans_kayit_id = s.fr_id
      from secilen s
     where sr.id = s.sr_id;
    get diagnostics v_servis = row_count;
  exception when others then v_servis := -1; end;

  -- ═══ BAKIM FORMLARI ═══
  begin
    with adaylar as (
      select
        bf.id as bf_id,
        fr.id as fr_id,
        public.firma_benzerlik(coalesce(bf.musteri,''), to_jsonb(fr)::text) as skor,
        case
          when length(public.firma_normal(coalesce(bf.musteri,''))) >= p_min_karakter
           and position(
                 left(public.firma_normal(coalesce(bf.musteri,'')), p_min_karakter)
                 in public.firma_normal(to_jsonb(fr)::text)
               ) > 0
          then true else false
        end as prefix_var
      from public.bakim_formlari bf
      cross join public.financial_records fr
      where coalesce(bf.finans_kaydedildi, false) = false
    ),
    secilen as (
      select distinct on (bf_id) bf_id, fr_id, skor
      from adaylar
      where prefix_var = true
      order by bf_id, skor desc
    )
    update public.bakim_formlari bf
       set finans_kaydedildi = true,
           finans_kayit_id = s.fr_id
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

revoke all on function public.finans_otomatik_isle(integer) from public;
grant execute on function public.finans_otomatik_isle(integer) to authenticated;


-- ============================================================================
-- 4) 🧪 ÇALIŞTIR
-- ============================================================================
select public.finans_otomatik_isle(4) as sonuc;

select
  (select count(*) from public.service_reports
    where coalesce((to_jsonb(service_reports)->>'finans_kaydedildi')::boolean,false)) as isaretli_servis,
  (select count(*) from public.bakim_formlari where coalesce(finans_kaydedildi,false)) as isaretli_bakim,
  (select count(*) from public.financial_records) as finans_kayit;
