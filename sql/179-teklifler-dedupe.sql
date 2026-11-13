-- ============================================================================
--  🔧 TEKLİFLER + MAKİNE DEDUPE (Güncelleme #151)
-- ----------------------------------------------------------------------------
--  1) offers tablosundaki teklifler de müşteri portalına düşsün
--  2) Firma eşleştirme eşiği 75 (çok kelimeli firmalar için)
--  3) Makine tekrarlarını önle
--
--  KULLANIM: 178'den SONRA çalıştır.
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

    -- ⭐ 1) OFFERS (admin teklifler ekranı)
    select jsonb_build_object(
      'kaynak', 'offer',
      'id', o.id,
      'no', left(o.id::text, 6),
      'baslik', case
        when coalesce(public.jalan(to_jsonb(o),'template_type'),'') = 'bakim' then 'Periyodik Bakım Teklifi'
        when coalesce(public.jalan(to_jsonb(o),'template_type'),'') = 'siparis' then 'Sipariş Formu'
        else 'Fiyat Teklifi' end,
      'aciklama', coalesce(left(public.jalan(to_jsonb(o),'description','notlar'),300),''),
      'tutar', coalesce(
        nullif(public.jalan(to_jsonb(o),'total_price'),'')::numeric,
        nullif(public.jalan(to_jsonb(o),'genel_toplam'),'')::numeric,
        0),
      'tarih', to_char(coalesce(
        nullif(public.jalan(to_jsonb(o),'offer_date'),'')::date,
        nullif(public.jalan(to_jsonb(o),'created_at'),'')::timestamptz::date,
        current_date), 'DD.MM.YYYY'),
      'tarih_iso', to_char(coalesce(
        nullif(public.jalan(to_jsonb(o),'offer_date'),'')::date,
        nullif(public.jalan(to_jsonb(o),'created_at'),'')::timestamptz::date,
        current_date), 'YYYY-MM-DD'),
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

    -- 2) SATIŞLAR (malzeme satışı)
    select jsonb_build_object(
      'kaynak', 'satis', 'id', s.id, 'no', s.satis_no,
      'baslik', 'Malzeme Satışı',
      'aciklama', coalesce(s.notlar,''),
      'tutar', s.genel_toplam,
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

    -- 3) TEKLİF BEKLEYENLER
    select jsonb_build_object(
      'kaynak', 'teklif', 'id', tb.id,
      'no', coalesce(tb.is_emri_no,'—'), 'baslik', 'Fiyat Teklifi',
      'aciklama', coalesce(left(tb.ariza,300),''),
      'tutar', 0,
      'tarih', to_char(tb.created_at,'DD.MM.YYYY'),
      'tarih_iso', to_char(tb.created_at,'YYYY-MM-DD'),
      'durum', lower(coalesce(tb.durum,'bekliyor'))
    )
    from public.teklif_bekleyenler tb
    where public.firma_eslestir(coalesce(public.jalan(to_jsonb(tb),'musteri','musteri_adi','firma','firma_adi'),''), v_h.firma_adi) >= 75

  ) x;

  return v_sonuc;
exception when others then
  return '[]'::jsonb;
end $$;

revoke all on function public.musteri_teklifleri(text) from public;
grant execute on function public.musteri_teklifleri(text) to anon, authenticated;


-- ─── Makine listesi: Tekrarsiz (model adina gore) ───
create or replace function public.musteri_makineleri(p_token text)
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'key', model_norm,
    'model', model_goster,
    'kaynaklar', kaynaklar,
    'id', kendi_id
  )), '[]'::jsonb) into v_sonuc
  from (
    select
      public.parca_adi_normal(model) as model_norm,
      max(model) as model_goster,
      string_agg(distinct kaynak, ',') as kaynaklar,
      max(kendi_id) as kendi_id
    from (
      -- SISTEM VINCLERI
      select coalesce(public.jalan(to_jsonb(c),'model','makine_modeli'),'—') as model,
             'sistem' as kaynak, null::uuid as kendi_id
      from public.cranes c
      where public.firma_eslestir(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),''), v_h.firma_adi) >= 75
         or public.temiz_telefon(coalesce(public.jalan(to_jsonb(c),'telefon','phone','musteri_telefon'),'')) like '%' || v_h.telefon || '%'

      union all

      -- KENDI EKLEDIKLERI
      select mv.model, 'kendi' as kaynak, mv.id
      from public.musteri_vincler mv where mv.hesap_id = v_h.id

      union all

      -- TALEPLERDEN
      select public.jalan(to_jsonb(st),'manual_crane_info','vinc_bilgisi'),
             'talep' as kaynak, null::uuid
      from public.service_tickets st
      where (public.firma_eslestir(coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),''), v_h.firma_adi) >= 75
          or public.temiz_telefon(coalesce(public.jalan(to_jsonb(st),'manual_phone','telefon'),'')) like '%' || v_h.telefon || '%')
        and coalesce(public.jalan(to_jsonb(st),'manual_crane_info','vinc_bilgisi'),'') <> ''
    ) raw
    where coalesce(trim(model),'') not in ('','—')
    group by public.parca_adi_normal(model)
  ) g;

  return v_sonuc;
exception when others then
  return '[]'::jsonb;
end $$;

revoke all on function public.musteri_makineleri(text) from public;
grant execute on function public.musteri_makineleri(text) to anon, authenticated;


-- ─── TEST ───
select
  public.firma_eslestir('OMSA', 'OMSA OTOMOTİV') as omsa_kisa,
  public.firma_eslestir('OMSA OTOMOTİV', 'omsa otomotiv san. ltd.') as omsa_uzun,
  public.firma_eslestir('OMSA', 'MATAY') as farkli;
