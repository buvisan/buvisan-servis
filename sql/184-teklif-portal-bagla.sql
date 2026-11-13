-- ============================================================================
--  💰 TEKLİFLERİ PORTALA BAĞLA (Güncelleme #156)
-- ----------------------------------------------------------------------------
--  SORUN: musteri_teklifleri eski haliyle kaldı → offers görünmüyor
--
--  KULLANIM: 183'ten SONRA çalıştır.
-- ============================================================================

create or replace function public.musteri_teklifleri(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_h record;
  v_sonuc jsonb;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(x order by x->>'tarih_iso' desc), '[]'::jsonb) into v_sonuc from (

    -- ⭐ OFFERS (admin teklifler ekranı)
    select jsonb_build_object(
      'kaynak', 'offer',
      'id', o.id,
      'no', upper(left(o.id::text, 6)),
      'baslik', case
        when coalesce(public.jalan(to_jsonb(o),'template_type'),'') = 'bakim' then 'Periyodik Bakım Teklifi'
        when coalesce(public.jalan(to_jsonb(o),'template_type'),'') = 'siparis' then 'Sipariş Formu'
        else 'Fiyat Teklifi' end,
      'aciklama', coalesce(left(public.jalan(to_jsonb(o),'description','notlar'),300),''),
      'tutar', coalesce(
        nullif(public.jalan(to_jsonb(o),'total_price'),'')::numeric,
        nullif(public.jalan(to_jsonb(o),'genel_toplam'),'')::numeric,
        0),
      'firma', coalesce(public.jalan(to_jsonb(o),'customer_name','musteri','firma_adi'),''),
      'tarih', coalesce(public.jalan(to_jsonb(o),'offer_date'), ''),
      'tarih_iso', coalesce(public.jalan(to_jsonb(o),'offer_date'), '2000-01-01'),
      'durum', coalesce((
        select mo.durum from public.musteri_teklif_onay mo
        where mo.hesap_id = v_h.id and mo.offer_id = o.id limit 1
      ), lower(coalesce(public.jalan(to_jsonb(o),'status'),'bekliyor')))
    )
    from public.offers o
    where public.firma_eslestir(
            coalesce(public.jalan(to_jsonb(o),'customer_name','musteri','firma_adi'),''),
            v_h.firma_adi) >= 75

    union all

    -- SATIŞLAR
    select jsonb_build_object(
      'kaynak', 'satis', 'id', s.id, 'no', s.satis_no,
      'baslik', 'Malzeme Satışı', 'aciklama', coalesce(s.notlar,''),
      'tutar', s.genel_toplam, 'firma', s.musteri,
      'tarih', to_char(s.satis_tarihi,'DD.MM.YYYY'),
      'tarih_iso', to_char(s.satis_tarihi,'YYYY-MM-DD'),
      'durum', coalesce((
        select mo.durum from public.musteri_teklif_onay mo
        where mo.hesap_id = v_h.id and mo.satis_id = s.id limit 1
      ), 'bekliyor')
    )
    from public.satislar s
    where s.durum <> 'iptal'
      and public.firma_eslestir(s.musteri, v_h.firma_adi) >= 75

    union all

    -- TEKLİF BEKLEYENLER
    select jsonb_build_object(
      'kaynak', 'teklif', 'id', tb.id,
      'no', coalesce(public.jalan(to_jsonb(tb),'is_emri_no'),'—'),
      'baslik', 'Fiyat Teklifi',
      'aciklama', coalesce(left(public.jalan(to_jsonb(tb),'ariza'),300),''),
      'tutar', 0,
      'firma', coalesce(public.jalan(to_jsonb(tb),'musteri','musteri_adi','firma','firma_adi'),''),
      'tarih', to_char(tb.created_at,'DD.MM.YYYY'),
      'tarih_iso', to_char(tb.created_at,'YYYY-MM-DD'),
      'durum', lower(coalesce(public.jalan(to_jsonb(tb),'durum'),'bekliyor'))
    )
    from public.teklif_bekleyenler tb
    where public.firma_eslestir(
            coalesce(public.jalan(to_jsonb(tb),'musteri','musteri_adi','firma','firma_adi'),''),
            v_h.firma_adi) >= 75

  ) x;

  return v_sonuc;
exception when others then
  return '[]'::jsonb;
end $$;

revoke all on function public.musteri_teklifleri(text) from public;
grant execute on function public.musteri_teklifleri(text) to anon, authenticated;


-- ============================================================================
-- 🧪 TEŞHİS — hangi firma adları var?
-- ============================================================================
select
  (select count(*) from public.offers) as offers_toplam,
  (select count(*) from public.musteri_hesaplar where durum='onaylandi') as onayli_hesap;

-- Offers tablosundaki firma adları (ilk 15)
select
  coalesce(public.jalan(to_jsonb(o),'customer_name','musteri','firma_adi'),'(bos)') as firma,
  count(*) as adet
from public.offers o
group by 1
order by 2 desc
limit 15;

-- Onaylı müşteriler
select firma_adi, kullanici_adi, durum from public.musteri_hesaplar limit 10;

-- ⭐ EŞLEŞME TESTİ: her onaylı hesap için
select
  h.firma_adi as musteri,
  coalesce(public.jalan(to_jsonb(o),'customer_name','musteri','firma_adi'),'') as teklif_firma,
  public.firma_eslestir(
    coalesce(public.jalan(to_jsonb(o),'customer_name','musteri','firma_adi'),''),
    h.firma_adi) as puan
from public.musteri_hesaplar h
cross join public.offers o
where h.durum = 'onaylandi'
  and public.firma_eslestir(
    coalesce(public.jalan(to_jsonb(o),'customer_name','musteri','firma_adi'),''),
    h.firma_adi) >= 60
order by puan desc
limit 20;
