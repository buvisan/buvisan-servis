-- ============================================================================
--  📄 TEKLİF MOTORU v3 — ÜRÜN ADINDAN YAKALAMA (Güncelleme #44)
-- ----------------------------------------------------------------------------
--  SENİN BİLGİN:
--    "Teklif ürünü eklerken '(1 MAKİNE İÇİN PERİYODİK BAKIM VEYA KONTROL)'
--     isimli ürünü seçip fiyat yazıyorum, PDF indirip müşteriye atıyorum."
--
--  YANİ: Periyodik kontrol bağlantısı TEKLİFİN ÜRÜN ADINDA.
--        Servis türünde değil!
--
--  v2 SORUNU: 129 kayıt buldu (125'i "servis_ariza") → SPAM olur.
--
--  v3 ÇÖZÜMÜ:
--    1) TEKLİF KONTROLÜ: Müşteriye kontrol tarihinden SONRA teklif
--       kesilmişse (ürün adında "periyodik" geçen) → hatırlatma BİTER
--    2) FIRSAT PENCERESİ: Sadece son 30 gün (eski işler spam yapmasın)
--    3) GÜÇLÜ SİNYAL: Açıklamada net arıza ifadesi olan işler
--    4) ÜST SINIR: Asistan en fazla 10 işi hatırlatır (bunalmaz)
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) TEKLİF VERİLMİŞ Mİ? (müşteri + tarih sonrası, ürün adı dahil)
-- ============================================================================
create or replace function public.teklif_verilmis_mi(
  p_musteri text,
  p_tarih   date
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_var boolean := false;
begin
  -- quotes tablosunda müşteriye ait, tarihten sonra teklif var mı?
  begin
    execute $q$
      select exists (
        select 1 from public.quotes q
        where public.parca_adi_normal(
                coalesce(to_jsonb(q) ->> 'customer_name',
                         to_jsonb(q) ->> 'firma_adi',
                         to_jsonb(q) ->> 'musteri_adi', ''))
              = public.parca_adi_normal($1)
          and coalesce(
                (to_jsonb(q) ->> 'created_at')::timestamptz,
                (to_jsonb(q) ->> 'quote_date')::timestamptz,
                now()
              )::date >= $2
      )
    $q$ into v_var using p_musteri, p_tarih;
    return v_var;
  exception when others then
    null;  -- quotes tablosu farklıysa sessizce geç
  end;

  -- quote_items gibi ayrı tablo varsa (ürün adıyla)
  begin
    execute $q$
      select exists (
        select 1 from public.quote_items qi
        join public.quotes q on q.id = qi.quote_id
        where public.parca_adi_normal(
                coalesce(to_jsonb(q) ->> 'customer_name',
                         to_jsonb(q) ->> 'firma_adi', ''))
              = public.parca_adi_normal($1)
          and coalesce(qi.product_name, qi.name, '') ilike '%periyodik%'
      )
    $q$ into v_var using p_musteri;
    return v_var;
  exception when others then null; end;

  return false;
end $$;

revoke all on function public.teklif_verilmis_mi(text, date) from public;
grant execute on function public.teklif_verilmis_mi(text, date) to authenticated;


-- ============================================================================
-- 2) TARAMA v3 — dar, anlamlı, spam yapmayan
-- ============================================================================
create or replace function public.teklif_bekleyen_tara()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eklenen integer := 0;
  v_musteri text;
  r record;
begin
  for r in
    select
      cs.id,
      cs.service_date::date as tarih,
      cs.description,
      cs.service_type,
      coalesce(
        nullif(trim(coalesce(to_jsonb(cs) ->> 'customer_name', '')), ''),
        nullif(trim(coalesce(to_jsonb(cs) ->> 'firm_name', '')), ''),
        nullif(trim(coalesce(to_jsonb(cs) ->> 'customer', '')), ''),
        nullif(trim(coalesce(to_jsonb(cs) ->> 'company_name', '')), '')
      ) as musteri
    from public.completed_services cs
    where cs.service_date::date > current_date - 30        -- ⏱️ son 30 gün
      and coalesce(trim(cs.description), '') <> ''
      -- 🎯 GÜÇLÜ SİNYAL: net arıza/yapılması gereken ifadeler
      and coalesce(cs.description, '') ~* '(de[ğg]i[şs]meli|de[ğg]i[şs]ecek|yenilenmeli|tamir edilmeli|bak[ıi]m gerek|ka[çc]ak var|patlak|k[ıi]r[ıi]k|a[şs][ıi]nm[ıi][şs]|çalışmıyor|calismiyor|bozuk|ar[ıi]zal[ıi])'
      -- Zaten listede değil
      and not exists (
        select 1 from public.teklif_bekleyenler tb where tb.is_emri_no = cs.id::text
      )
    order by cs.service_date desc
    limit 60
  loop
    v_musteri := r.musteri;

    -- Müşteri bilinmiyorsa atla (hatırlatma anlamsız)
    if coalesce(v_musteri, '') = '' then continue; end if;

    -- ⭐ TEKLİF ZATEN VERİLMİŞSE EKLEME (akıllı kapanış)
    if public.teklif_verilmis_mi(v_musteri, r.tarih) then continue; end if;

    insert into public.teklif_bekleyenler
      (musteri_adi, kaynak, ariza_ozeti, tespit_tarihi, is_emri_no, olusturan)
    values (
      v_musteri,
      case when coalesce(r.service_type,'') ilike '%periyodik%' then 'tek_seferlik'
           when coalesce(r.service_type,'') ilike '%garanti%'   then 'garanti'
           else 'servis_ariza' end,
      left(coalesce(nullif(trim(r.description), ''), 'Arıza tespit edildi'), 300),
      r.tarih,
      r.id::text,
      'otomatik tarama (30 gün)'
    )
    on conflict do nothing;

    v_eklenen := v_eklenen + 1;
  end loop;

  return v_eklenen;
end $$;

revoke all on function public.teklif_bekleyen_tara() from public;
grant execute on function public.teklif_bekleyen_tara() to authenticated;


-- ============================================================================
-- 3) ESKİ GENİŞ KAYITLARI TEMİZLE (30 günden eski olanları listeden çıkar)
-- ============================================================================
update public.teklif_bekleyenler
   set durum = 'GEREKMIYOR',
       teklif_notu = 'Otomatik kapatıldı (30 günden eski / çok geniş tarama)',
       guncelleme = now()
 where durum = 'BEKLIYOR'
   and kaynak = 'servis_ariza'
   and tespit_tarihi < current_date - 30;


-- ============================================================================
-- 4) TARAMAYI ÇALIŞTIR
-- ============================================================================
select public.teklif_bekleyen_tara() as bulunan_yeni_is;


-- ============================================================================
-- 5) KONTROL
-- ============================================================================
select * from public.teklif_bekleyen_listesi('BEKLIYOR') limit 25;

select
  (select count(*) from public.teklif_bekleyenler where durum = 'BEKLIYOR')       as bekleyen,
  (select count(*) from public.teklif_bekleyenler where durum = 'GEREKMIYOR')     as kapatilan,
  (select count(*) from public.teklif_bekleyenler where kaynak = 'servis_ariza')  as servis_ariza,
  (select count(*) from public.teklif_bekleyenler where kaynak = 'garanti')       as garanti;
