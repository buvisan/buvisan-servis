-- ============================================================================
--  🛡️ TEKLİF BLOĞU — TAM SAVUNMACI (Güncelleme #158)
-- ----------------------------------------------------------------------------
--  SORUN: offers sorgusunda o.created_at gibi direkt kolon erişimi
--         → kolon yoksa blok exception → teklifler []
--
--  ÇÖZÜM:
--    • guvenli_tarih() — metni tarihe güvenle çevirir
--    • TÜM kolonlar to_jsonb + jalan ile
--    • Her alt sorgu kendi exception bloğunda
--
--  KULLANIM: 185'ten SONRA çalıştır.
-- ============================================================================

-- ─── Güvenli tarih çevirici ───
create or replace function public.guvenli_tarih(p text, p_varsayilan date default current_date)
returns date
language plpgsql
immutable
as $$
begin
  if coalesce(trim(p),'') = '' then return p_varsayilan; end if;
  begin
    return trim(p)::date;
  exception when others then null; end;
  begin
    return trim(p)::timestamptz::date;
  exception when others then null; end;
  return p_varsayilan;
end $$;

revoke all on function public.guvenli_tarih(text, date) from public;
grant execute on function public.guvenli_tarih(text, date) to anon, authenticated;


-- ─── Offers tablosunda hangi kolonlar var? ───
create or replace function public.offers_kolonlari()
returns table (kolon text)
language sql
stable
security definer
set search_path = public
as $$
  select column_name::text from information_schema.columns
  where table_schema = 'public' and table_name = 'offers'
  order by ordinal_position;
$$;

revoke all on function public.offers_kolonlari() from public;
grant execute on function public.offers_kolonlari() to authenticated;


-- ─── TEKLİF BLOĞU: ayrı fonksiyon (izole) ───
create or replace function public.musteri_teklif_bloku(p_hesap_id uuid, p_firma text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sonuc jsonb := '[]'::jsonb;
begin
  -- ═══ 1) OFFERS ═══
  begin
    select coalesce(jsonb_agg(j order by sira desc), '[]'::jsonb) into v_sonuc
    from (
      select
        jsonb_build_object(
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
            nullif(public.jalan(to_jsonb(o),'genel_toplam'),'')::numeric, 0),
          'firma', coalesce(public.jalan(to_jsonb(o),'customer_name','musteri','firma_adi'),''),
          'tarih', to_char(public.guvenli_tarih(
                     public.jalan(to_jsonb(o),'offer_date','created_at')), 'DD.MM.YYYY'),
          'durum', coalesce((
            select mo.durum from public.musteri_teklif_onay mo
            where mo.hesap_id = p_hesap_id and mo.offer_id = o.id limit 1
          ), lower(coalesce(public.jalan(to_jsonb(o),'status'),'bekliyor')))
        ) as j,
        public.guvenli_tarih(public.jalan(to_jsonb(o),'offer_date','created_at')) as sira
      from public.offers o
      where public.firma_eslestir(
              coalesce(public.jalan(to_jsonb(o),'customer_name','musteri','firma_adi'),''),
              p_firma) >= 75
    ) x;
  exception when others then
    v_sonuc := '[]'::jsonb;
  end;

  -- ═══ 2) SATIŞLAR (ekle) ═══
  begin
    v_sonuc := v_sonuc || coalesce((
      select jsonb_agg(jsonb_build_object(
        'kaynak', 'satis', 'id', s.id, 'no', s.satis_no,
        'baslik', 'Malzeme Satışı', 'aciklama', coalesce(s.notlar,''),
        'tutar', coalesce(s.genel_toplam,0), 'firma', s.musteri,
        'tarih', to_char(coalesce(s.satis_tarihi, current_date),'DD.MM.YYYY'),
        'durum', coalesce((
          select mo.durum from public.musteri_teklif_onay mo
          where mo.hesap_id = p_hesap_id and mo.satis_id = s.id limit 1
        ), 'bekliyor')
      ))
      from public.satislar s
      where s.durum <> 'iptal'
        and public.firma_eslestir(coalesce(s.musteri,''), p_firma) >= 75
    ), '[]'::jsonb);
  exception when others then null; end;

  -- ═══ 3) TEKLİF BEKLEYENLER (ekle) ═══
  begin
    v_sonuc := v_sonuc || coalesce((
      select jsonb_agg(jsonb_build_object(
        'kaynak', 'teklif', 'id', tb.id,
        'no', coalesce(public.jalan(to_jsonb(tb),'is_emri_no'),'—'),
        'baslik', 'Fiyat Teklifi',
        'aciklama', coalesce(left(public.jalan(to_jsonb(tb),'ariza'),300),''),
        'tutar', 0,
        'firma', coalesce(public.jalan(to_jsonb(tb),'musteri','musteri_adi','firma','firma_adi'),''),
        'tarih', to_char(coalesce(tb.created_at, current_date),'DD.MM.YYYY'),
        'durum', lower(coalesce(public.jalan(to_jsonb(tb),'durum'),'bekliyor'))
      ))
      from public.teklif_bekleyenler tb
      where public.firma_eslestir(
              coalesce(public.jalan(to_jsonb(tb),'musteri','musteri_adi','firma','firma_adi'),''),
              p_firma) >= 75
    ), '[]'::jsonb);
  exception when others then null; end;

  return v_sonuc;
end $$;

revoke all on function public.musteri_teklif_bloku(uuid, text) from public;
grant execute on function public.musteri_teklif_bloku(uuid, text) to anon, authenticated;


-- ─── ANA PORTAL: teklif bloğunu kullan ───
create or replace function public.musteri_teklifleri(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_h record;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then return '[]'::jsonb; end if;

  return public.musteri_teklif_bloku(v_h.id, v_h.firma_adi);
exception when others then
  return '[]'::jsonb;
end $$;

revoke all on function public.musteri_teklifleri(text) from public;
grant execute on function public.musteri_teklifleri(text) to anon, authenticated;


-- ─── TEŞHİS ───
select string_agg(kolon, ', ') as offers_kolonlari from public.offers_kolonlari();

select
  (select count(*) from public.offers) as offers_toplam,
  jsonb_array_length(
    public.musteri_teklifleri(
      (select token from public.musteri_hesaplar
       where durum='onaylandi' and token is not null and token_son > now()
       order by son_giris desc nulls last limit 1)
    )
  ) as gecerli_token_teklif,

  -- ⭐ Direkt hesap_id ile test (token gerekmez)
  jsonb_array_length(
    public.musteri_teklif_bloku(
      (select id from public.musteri_hesaplar where durum='onaylandi' limit 1),
      (select firma_adi from public.musteri_hesaplar where durum='onaylandi' limit 1)
    )
  ) as direkt_test;

-- Onaylı hesaplar ve token durumu
select firma_adi, durum,
       (token is not null) as token_var,
       (token_son > now()) as token_gecerli,
       son_giris
from public.musteri_hesaplar where durum='onaylandi';


-- ─── PORTAL v6: teklifleri izole fonksiyondan al ───
do $$
declare
  v_fn text;
begin
  v_fn := pg_get_functiondef('public.musteri_portal_v6(text)'::regprocedure);
  -- teklifler bloğunu izole fonksiyona yonlendir
  if v_fn like '%musteri_teklif_bloku%' then
    raise notice '✅ portal v6 zaten bloku kullaniyor';
  else
    raise notice '⚠️ Portal v6 eski teklif blogunu kullaniyor — 187 calistir';
  end if;
exception when others then
  raise notice '⚠️ %', sqlerrm;
end $$;
