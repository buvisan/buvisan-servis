-- ============================================================================
--  🔗 OTOMATİK TEKLİF KAPANIŞI — SON BAĞLANTI (Güncelleme #45)
-- ----------------------------------------------------------------------------
--  BULGU: Teklif tablosunun adı "offers" (İngilizce!)
--         Bu yüzden "%teklif%" aramasında çıkmadı.
--
--  NE YAPAR?
--    Teklif verildi mi kontrolü artık "offers" tablosuna bakar.
--    Müşteriye kontrol tarihinden sonra teklif kesilmişse →
--    o hatırlatma KENDİLİĞİNDEN BİTER.
--
--  GÜVENLİ: Sütun adlarını to_jsonb ile okur → hangi isim olursa olsun çalışır.
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) OFFERS TABLOSUNUN SÜTUNLARI (kontrol için)
-- ============================================================================
select string_agg(column_name, ', ' order by ordinal_position) as offers_sutunlari
from information_schema.columns
where table_schema = 'public' and table_name = 'offers';


-- ============================================================================
-- 2) TEKLİF KONTROLÜ — artık "offers" tablosuna bakıyor
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
  if coalesce(trim(p_musteri), '') = '' then return false; end if;

  begin
    execute $q$
      select exists (
        select 1
        from public.offers o
        where public.parca_adi_normal(
                coalesce(
                  to_jsonb(o) ->> 'customer_name',
                  to_jsonb(o) ->> 'firma_adi',
                  to_jsonb(o) ->> 'musteri_adi',
                  to_jsonb(o) ->> 'company_name',
                  to_jsonb(o) ->> 'customer',
                  ''
                )
              ) = public.parca_adi_normal($1)
          and coalesce(
                (to_jsonb(o) ->> 'created_at')::timestamptz,
                (to_jsonb(o) ->> 'offer_date')::timestamptz,
                (to_jsonb(o) ->> 'quote_date')::timestamptz,
                (to_jsonb(o) ->> 'date')::timestamptz,
                now()
              )::date >= $2
      )
    $q$ into v_var using p_musteri, p_tarih;
    return coalesce(v_var, false);
  exception when others then
    return false;   -- tablo/sütun farklıysa sessizce geç (hata vermez)
  end;
end $$;

revoke all on function public.teklif_verilmis_mi(text, date) from public;
grant execute on function public.teklif_verilmis_mi(text, date) to authenticated;


-- ============================================================================
-- 3) TEST — teklif kontrolü çalışıyor mu?
-- ============================================================================
do $$
declare
  v_adet bigint;
begin
  begin
    execute 'select count(*) from public.offers' into v_adet;
    raise notice '✅ offers tablosu okunuyor — % kayıt var', v_adet;
  exception when others then
    raise notice '❌ offers okunamadı: %', sqlerrm;
  end;

  begin
    execute $q$select count(*) from public.offers o
      where public.parca_adi_normal(coalesce(to_jsonb(o)->>'customer_name', to_jsonb(o)->>'firma_adi','')) <> ''$q$
    into v_adet;
    raise notice '✅ Müşteri adı eşleşmesi çalışıyor — % kayıtta isim var', v_adet;
  exception when others then
    raise notice '⚠️ Müşteri adı okunamadı: %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 4) TEKLİF VERİLMİŞ OLANLARI OTOMATİK KAPAT
--    (offers'ta teklifi olan müşterilerin bekleyen kayıtları kapanır)
-- ============================================================================
do $$
declare
  v_kapatilan integer := 0;
  r record;
begin
  for r in
    select id, musteri_adi, tespit_tarihi
    from public.teklif_bekleyenler
    where durum = 'BEKLIYOR'
  loop
    if public.teklif_verilmis_mi(r.musteri_adi, r.tespit_tarihi) then
      update public.teklif_bekleyenler
         set durum = 'TEKLIF_VERILDI',
             teklif_notu = 'Otomatik kapatıldı (offers tablosunda teklif bulundu)',
             guncelleme = now()
       where id = r.id;
      v_kapatilan := v_kapatilan + 1;
    end if;
  end loop;

  raise notice '🎯 Otomatik kapatılan teklif kaydı: %', v_kapatilan;
end $$;


-- ============================================================================
-- 5) SON DURUM
-- ============================================================================
select * from public.teklif_bekleyen_listesi('BEKLIYOR') limit 25;

select
  (select count(*) from public.teklif_bekleyenler where durum = 'BEKLIYOR')     as bekleyen,
  (select count(*) from public.teklif_bekleyenler where durum = 'TEKLIF_VERILDI')as teklif_verilen,
  (select count(*) from public.teklif_bekleyenler where durum = 'GEREKMIYOR')   as gerekmiyor,
  (select count(*) from public.offers)                                          as toplam_teklif;
