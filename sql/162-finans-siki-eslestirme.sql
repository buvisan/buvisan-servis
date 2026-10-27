-- ============================================================================
--  🎯 FİNANSTA — SIFIRLA + TARİHLİ DOĞRU EŞLEŞTİRME (Güncelleme #134)
-- ----------------------------------------------------------------------------
--  HATA: 47/53 form "FİNANSTA" işaretlendi ama çoğu YANLIŞ.
--        26.10 formu finansa girilmemiş ama işaretli görünüyor.
--
--  SEBEP: Tarih kontrolü YOKTU. İsim benzerliği 60 yeterliydi.
--         661 iş kaydı × 53 form → her form bir eşleşme buldu.
--
--  ÇÖZÜM:
--    1) TÜM işaretleri SIFIRLA
--    2) SIKI kural: isim ≥ 85 VE tarih ±3 gün VE 1:1
--
--  KULLANIM: 161'den SONRA çalıştır.
-- ============================================================================


-- ============================================================================
-- 1) 🧹 TÜM İŞARETLERİ SIFIRLA
-- ============================================================================
do $$
declare
  v_sr integer := 0;
  v_bf integer := 0;
begin
  update public.service_reports set finans_kaydedildi = false, finans_kayit_id = null
   where coalesce(finans_kaydedildi,false) = true;
  get diagnostics v_sr = row_count;

  update public.bakim_formlari set finans_kaydedildi = false, finans_kayit_id = null
   where coalesce(finans_kaydedildi,false) = true;
  get diagnostics v_bf = row_count;

  raise notice '🧹 Sıfırlanan: % servis + % bakım', v_sr, v_bf;
end $$;


-- ============================================================================
-- 2) 🎯 SIKI EŞLEŞTİRME — isim ≥ 85 + tarih ±3 gün + 1:1
-- ============================================================================
create or replace function public.finans_siki_eslestir(
  p_esik integer default 85,
  p_gun integer default 3
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
  -- ═══ SERVİS RAPORLARI ═══
  begin
    with adaylar as (
      select
        sr.id as sr_id,
        cs.id as cs_id,
        public.firma_benzerlik(
          coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
          coalesce(cs.customer_text,'')
        ) as skor,
        abs(extract(epoch from (sr.created_at::date - cs.service_date::date))) as gun_fark
      from public.service_reports sr
      join public.completed_services cs
        on cs.service_date is not null
       and abs(extract(epoch from (sr.created_at::date - cs.service_date::date))) <= (p_gun * 86400)
      where coalesce(public.firma_benzerlik(
              coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
              coalesce(cs.customer_text,'')
            ), 0) >= p_esik
    ),
    secilen as (
      select distinct on (sr_id) sr_id, cs_id, skor
      from adaylar
      order by sr_id, skor desc, gun_fark asc
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
        public.firma_benzerlik(coalesce(bf.musteri,''), coalesce(cs.customer_text,'')) as skor,
        abs(extract(epoch from (bf.created_at::date - cs.service_date::date))) as gun_fark
      from public.bakim_formlari bf
      join public.completed_services cs
        on cs.service_date is not null
       and abs(extract(epoch from (bf.created_at::date - cs.service_date::date))) <= (p_gun * 86400)
      where coalesce(public.firma_benzerlik(coalesce(bf.musteri,''), coalesce(cs.customer_text,'')), 0) >= p_esik
    ),
    secilen as (
      select distinct on (bf_id) bf_id, cs_id, skor
      from adaylar
      order by bf_id, skor desc, gun_fark asc
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
    'kural', 'isim ≥ ' || p_esik || ' + tarih ±' || p_gun || ' gün',
    'mesaj', '🎯 ' || v_servis || ' servis + ' || v_bakim || ' bakım formu FİNANSTA işaretlendi (sıkı kural).'
  );
exception when others then
  return jsonb_build_object('servis_isaretlenen', 0, 'bakim_isaretlenen', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.finans_siki_eslestir(integer, integer) from public;
grant execute on function public.finans_siki_eslestir(integer, integer) to authenticated;


-- ============================================================================
-- 3) 🧪 ÇALIŞTIR — sıkı kural
-- ============================================================================
select public.finans_siki_eslestir(85, 3) as sonuc;


-- ============================================================================
-- 4) 📋 KONTROL — hangi formlar işaretlendi?
-- ============================================================================
select
  coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'—') as form_firma,
  to_char(sr.created_at,'DD.MM.YYYY') as form_tarih,
  coalesce(cs.customer_text,'—') as finans_musteri,
  to_char(cs.service_date,'DD.MM.YYYY') as finans_tarih,
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
