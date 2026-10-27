-- ============================================================================
--  🎯 FİNANSTA EŞLEŞTİRME DÜZELTMESİ + BACKFILL (Güncelleme #130)
-- ----------------------------------------------------------------------------
--  SORUN: FİNANSTA etiketi görünmüyor.
--  SEBEP: firma_benzerlik() çok katı:
--          "KARAS ALTYAPI İNŞ. A.Ş. BARANKAYA..." (7 kelime)
--          "KARAS İNŞAAT" (2 kelime)
--          → ortak 1 kelime → skor 14% → eşleşmez ❌
--
--  ÇÖZÜM: İlk kelime prefix eşleşmesi → 80 puan
--          "KARAS..." vs "KARAS..." → EŞLEŞİR ✓
--
--  KULLANIM: 157'den SONRA çalıştır.
-- ============================================================================


-- ============================================================================
-- 1) 🔤 firma_benzerlik v2 — PREFIX DESTEKLİ
-- ============================================================================
create or replace function public.firma_benzerlik(p_a text, p_b text)
returns integer
language plpgsql
immutable
as $$
declare
  v_a text := public.firma_normal(p_a);
  v_b text := public.firma_normal(p_b);
  v_ka text[];
  v_kb text[];
  v_ortak integer := 0;
  v_toplam integer := 0;
  v_k text;
  v_p1 text;
  v_p2 text;
begin
  if coalesce(v_a,'') = '' or coalesce(v_b,'') = '' then return 0; end if;
  if v_a = v_b then return 100; end if;

  v_ka := array(select x from unnest(string_to_array(v_a,' ')) x where length(x) >= 3);
  v_kb := array(select x from unnest(string_to_array(v_b,' ')) x where length(x) >= 3);

  -- ⭐ YENİ: İLK KELİME PREFIX EŞLEŞMESİ (marka adı)
  v_p1 := left(coalesce(v_ka[1],''), 4);
  v_p2 := left(coalesce(v_kb[1],''), 4);
  if length(v_p1) >= 3 and v_p1 = v_p2 then
    return 80;   -- "karas..." vs "karas..." → 80
  end if;

  -- ⭐ YENİ: Herhangi bir kelime prefix eşleşmesi
  foreach v_k in array coalesce(v_ka, array[]::text[]) loop
    if length(v_k) >= 4 and exists (
      select 1 from unnest(coalesce(v_kb, array[]::text[])) x
      where left(x, 4) = left(v_k, 4)
    ) then
      v_ortak := v_ortak + 1;
    end if;
  end loop;

  v_toplam := greatest(coalesce(array_length(v_ka,1),0), coalesce(array_length(v_kb,1),0));
  if coalesce(v_toplam,0) = 0 then return 0; end if;

  -- İçerme bonusu
  if position(v_a in v_b) > 0 or position(v_b in v_a) > 0 then
    v_ortak := v_ortak + 2;
    v_toplam := v_toplam + 2;
  end if;

  return least(100, round((v_ortak::numeric / v_toplam::numeric) * 100));
end $$;

revoke all on function public.firma_benzerlik(text, text) from public;
grant execute on function public.firma_benzerlik(text, text) to authenticated;


-- ============================================================================
-- 2) 🧪 TEST — gerçek örneklerle
-- ============================================================================
select 'Gent kalıp' as form, 'GENT KALIP' as finans,
       public.firma_benzerlik('Gent kalıp','GENT KALIP') as skor
union all
select 'KARAS ALTYAPI İNŞ. A.Ş. BARANKAYA İNŞ. A.Ş.', 'KARAS İNŞAAT',
       public.firma_benzerlik('KARAS ALTYAPI İNŞ. A.Ş. BARANKAYA İNŞ. A.Ş.','KARAS İNŞAAT')
union all
select 'DENKEN MAKİNA SAN. VE TİC. LTD ŞTİ', 'DENKEN METAL',
       public.firma_benzerlik('DENKEN MAKİNA SAN. VE TİC. LTD ŞTİ','DENKEN METAL')
union all
select 'ZM ÇELİK', 'ZM METAL',
       public.firma_benzerlik('ZM ÇELİK','ZM METAL')
union all
select 'HES METAL', 'HES METAL',
       public.firma_benzerlik('HES METAL','HES METAL')
union all
select 'BUVİSAN', 'AKSANTAŞ',
       public.firma_benzerlik('BUVİSAN','AKSANTAŞ');


-- ============================================================================
-- 3) 💰 FİNANS KAYITLARINI GÖR
-- ============================================================================
select count(*) as finans_kayit_sayisi from public.financial_records;

select
  coalesce(public.jalan(to_jsonb(fr),'firma_adi','musteri','musteri_adi','aciklama','description'),'—') as firma,
  coalesce(to_jsonb(fr)->>'month_key','—') as ay,
  coalesce(to_jsonb(fr)->>'tutar','0') as tutar
from public.financial_records fr
order by coalesce(to_jsonb(fr)->>'month_key','') desc
limit 10;


-- ============================================================================
-- 4) 🔗 BACKFILL — mevcut finans kayıtlarını formlara bağla
-- ============================================================================
create or replace function public.finans_backfill(p_esik integer default 60)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servis integer := 0;
  v_bakim integer := 0;
begin
  -- SERVİS raporları
  begin
    with eslesen as (
      select distinct on (fr.id)
        fr.id as fr_id, sr.id as sr_id,
        public.firma_benzerlik(
          coalesce(public.jalan(to_jsonb(fr),'firma_adi','musteri','musteri_adi','aciklama','description'),''),
          coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
        ) as skor
      from public.financial_records fr
      cross join public.service_reports sr
      where coalesce((to_jsonb(sr)->>'finans_kaydedildi')::boolean, false) = false
      order by fr.id,
        public.firma_benzerlik(
          coalesce(public.jalan(to_jsonb(fr),'firma_adi','musteri','musteri_adi','aciklama','description'),''),
          coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
        ) desc,
        sr.created_at asc
    )
    update public.service_reports sr
       set finans_kaydedildi = true,
           finans_kayit_id = e.fr_id
      from eslesen e
     where sr.id = e.sr_id
       and e.skor >= p_esik;
    get diagnostics v_servis = row_count;
  exception when others then v_servis := -1; end;

  -- BAKIM formları
  begin
    with eslesen as (
      select distinct on (fr.id)
        fr.id as fr_id, bf.id as bf_id,
        public.firma_benzerlik(
          coalesce(public.jalan(to_jsonb(fr),'firma_adi','musteri','musteri_adi','aciklama','description'),''),
          coalesce(bf.musteri,'')
        ) as skor
      from public.financial_records fr
      cross join public.bakim_formlari bf
      where coalesce(bf.finans_kaydedildi, false) = false
      order by fr.id,
        public.firma_benzerlik(
          coalesce(public.jalan(to_jsonb(fr),'firma_adi','musteri','musteri_adi','aciklama','description'),''),
          coalesce(bf.musteri,'')
        ) desc,
        bf.created_at asc
    )
    update public.bakim_formlari bf
       set finans_kaydedildi = true,
           finans_kayit_id = e.fr_id
      from eslesen e
     where bf.id = e.bf_id
       and e.skor >= p_esik;
    get diagnostics v_bakim = row_count;
  exception when others then v_bakim := -1; end;

  return jsonb_build_object(
    'servis_isaretlenen', v_servis,
    'bakim_isaretlenen', v_bakim,
    'mesaj', '💰 ' || v_servis || ' servis + ' || v_bakim || ' bakım formu FİNANSTA olarak işaretlendi.'
  );
exception when others then
  return jsonb_build_object('servis_isaretlenen', 0, 'bakim_isaretlenen', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.finans_backfill(integer) from public;
grant execute on function public.finans_backfill(integer) to authenticated;


-- ============================================================================
-- 5) 🧪 ÇALIŞTIR
-- ============================================================================
select public.finans_backfill(60) as backfill_sonucu;

select
  (select count(*) from public.service_reports
    where coalesce((to_jsonb(service_reports)->>'finans_kaydedildi')::boolean,false)) as finansa_isaretli_servis,
  (select count(*) from public.bakim_formlari where coalesce(finans_kaydedildi,false)) as finansa_isaretli_bakim,
  (select count(*) from public.financial_records) as toplam_finans_kaydi;
