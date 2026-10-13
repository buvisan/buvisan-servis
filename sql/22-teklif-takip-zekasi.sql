-- ============================================================================
--  💰 TEKLİF TAKİP & KAZANMA ZEKASI (Büyük Güncelleme #4)
-- ----------------------------------------------------------------------------
--  VERİDEN ÇIKAN GERÇEK:
--    • 220 teklifin 102'si onaylanmış, 51'i reddedilmiş, 67'si YANIT BEKLİYOR
--    • Kazanma oranı %67 (çok yüksek!)
--    • Yani yeni müşteri bulmaya gerek yok — MASADAKİ 67 TEKLİFİ kovalamak yeter
--
--  BU SCRIPT NE KURAR:
--    1) teklif_bekleyenler()      → kaç gündür yanıt bekliyor, süresi geçti mi
--    2) teklif_kazanma_analizi()  → hangi fiyat aralığı kazanıyor, hangi müşteri
--    3) Sabah bildirimine "bekleyen teklif" hatırlatması
--
--  ⚠️ Veri değiştirmez. Sadece okur ve hesaplar.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) BEKLEYEN TEKLİFLER (öncelik sırasıyla)
--    Aciliyet: süresi geçmiş > 14 gün > 7 gün > yeni
-- ============================================================================
create or replace function public.teklif_bekleyenler()
returns table (
  id            uuid,
  musteri       text,
  yetkili       text,
  tutar         numeric,
  olusturma     date,
  gecerlilik    date,
  bekleyen_gun  integer,
  sure_gecmis   boolean,
  aciliyet      text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    coalesce(o.customer_name, 'Bilinmiyor'),
    coalesce(o.customer_rep, '-'),
    coalesce(o.final_price, o.total_price, 0)::numeric,
    o.offer_date,
    o.valid_until,
    (current_date - coalesce(o.offer_date, o.created_at::date))::int as bekleyen_gun,
    (o.valid_until is not null and o.valid_until < current_date)     as sure_gecmis,
    case
      when o.valid_until is not null and o.valid_until < current_date            then 'SÜRESİ GEÇTİ'
      when (current_date - coalesce(o.offer_date, o.created_at::date)) >= 14     then 'ACİL'
      when (current_date - coalesce(o.offer_date, o.created_at::date)) >= 7      then 'TAKİP ET'
      else 'YENİ'
    end as aciliyet
  from public.offers o
  where coalesce(o.status, '') not in ('onaylandi', 'reddedildi')
  order by
    (o.valid_until is not null and o.valid_until < current_date) desc,
    (current_date - coalesce(o.offer_date, o.created_at::date)) desc;
$$;

revoke all on function public.teklif_bekleyenler() from public;
grant execute on function public.teklif_bekleyenler() to authenticated;


-- ============================================================================
-- 2) KAZANMA ANALİZİ (hangi fiyat aralığı kazanıyor?)
-- ============================================================================
create or replace function public.teklif_kazanma_analizi()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with temel as (
    select
      count(*) filter (where status = 'onaylandi')                        as onaylanan,
      count(*) filter (where status = 'reddedildi')                       as reddedilen,
      count(*) filter (where coalesce(status,'') not in ('onaylandi','reddedildi')) as bekleyen,
      count(*)                                                            as toplam,
      coalesce(sum(coalesce(final_price, total_price, 0)) filter (where status = 'onaylandi'), 0)  as kazanilan_tutar,
      coalesce(sum(coalesce(final_price, total_price, 0)) filter (where coalesce(status,'') not in ('onaylandi','reddedildi')), 0) as bekleyen_tutar,
      coalesce(avg(coalesce(final_price, total_price, 0)) filter (where status = 'onaylandi'), 0)  as ort_kazanan,
      coalesce(avg(coalesce(final_price, total_price, 0)) filter (where status = 'reddedildi'), 0) as ort_kaybeden
    from public.offers
  ),
  bantlar as (
    select
      case
        when coalesce(final_price, total_price, 0) < 10000  then '0 - 10.000 ₺'
        when coalesce(final_price, total_price, 0) < 25000  then '10.000 - 25.000 ₺'
        when coalesce(final_price, total_price, 0) < 50000  then '25.000 - 50.000 ₺'
        when coalesce(final_price, total_price, 0) < 100000 then '50.000 - 100.000 ₺'
        else '100.000 ₺ +'
      end as bant,
      count(*) filter (where status = 'onaylandi')  as onay,
      count(*) filter (where status = 'reddedildi') as ret
    from public.offers
    where coalesce(status, '') in ('onaylandi', 'reddedildi')
    group by 1
  ),
  bant_json as (
    select jsonb_agg(
      jsonb_build_object(
        'bant', bant,
        'onay', onay,
        'ret', ret,
        'oran', case when (onay + ret) > 0 then round((onay::numeric / (onay + ret) * 100), 1) else 0 end
      ) order by bant
    ) as veri
    from bantlar
  )
  select jsonb_build_object(
    'onaylanan',      t.onaylanan,
    'reddedilen',     t.reddedilen,
    'bekleyen',       t.bekleyen,
    'toplam',         t.toplam,
    'kazanma_orani',  case when (t.onaylanan + t.reddedilen) > 0
                           then round((t.onaylanan::numeric / (t.onaylanan + t.reddedilen) * 100), 1) else 0 end,
    'kazanilan_tutar', round(t.kazanilan_tutar, 0),
    'bekleyen_tutar',  round(t.bekleyen_tutar, 0),
    'ort_kazanan',     round(t.ort_kazanan, 0),
    'ort_kaybeden',    round(t.ort_kaybeden, 0),
    'fiyat_araliklari', coalesce((select veri from bant_json), '[]'::jsonb)
  )
  from temel t;
$$;

revoke all on function public.teklif_kazanma_analizi() from public;
grant execute on function public.teklif_kazanma_analizi() to authenticated;


-- ============================================================================
-- 3) SABAH BİLDİRİMİNE TEKLİF HATIRLATMASI EKLE
--    (7+ gündür yanıt bekleyen teklifler her sabah hatırlatılır)
-- ============================================================================
create or replace function public.gunluk_plan_gonder()
returns text
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_bot    text := '8567697885:AAGCSyckJKLG11HwTQaMGGUwMyXIm0UqAK0';
  v_grup   text := '-5079408473';
  v_metin  text;
  v_stok   text;
  v_teklif text;
  v_adet   integer;
  v_tk_adet integer;
  v_tk_tutar numeric;
begin
  -- Günün planı
  v_metin := public.gunluk_plan_metni(current_date, '🌅 BUGÜNÜN SERVİS PLANI');

  -- Yarının planı
  if exists (select 1 from public.randevular
              where randevu_tarihi = current_date + 1 and durum <> 'iptal') then
    v_metin := v_metin || E'\n\n\n' || public.gunluk_plan_metni(current_date + 1, '📌 YARININ PLANI');
  end if;

  -- 📦 KRİTİK STOK
  begin
    select count(*) into v_adet from public.kritik_stoklar();
    if v_adet > 0 then
      select string_agg('   • ' || name || ' (' || stok_adet || ' ' || coalesce(unit, 'adet') || ' kaldı)', E'\n')
        into v_stok
      from (select name, stok_adet, unit from public.kritik_stoklar() limit 10) x;

      v_metin := v_metin || E'\n\n\n⚠️ KRİTİK STOK: ' || v_adet || ' parça kritik seviyede' || E'\n' || coalesce(v_stok, '');
    end if;
  exception when others then null;
  end;

  -- 💰 BEKLEYEN TEKLİFLER (para masada!)
  begin
    select count(*), coalesce(sum(tutar), 0)
      into v_tk_adet, v_tk_tutar
    from public.teklif_bekleyenler()
    where aciliyet in ('ACİL', 'SÜRESİ GEÇTİ');

    if v_tk_adet > 0 then
      select string_agg('   • ' || musteri || ' — ' || to_char(tutar, 'FM999G999G999') || ' ₺ (' ||
                        bekleyen_gun || ' gündür bekliyor' ||
                        case when sure_gecmis then ' · SÜRESİ GEÇTİ' else '' end || ')', E'\n')
        into v_teklif
      from (select musteri, tutar, bekleyen_gun, sure_gecmis
              from public.teklif_bekleyenler()
             where aciliyet in ('ACİL', 'SÜRESİ GEÇTİ')
             limit 8) y;

      v_metin := v_metin || E'\n\n\n💰 TAKİP EDİLMESİ GEREKEN TEKLİFLER: ' || v_tk_adet || ' adet · ' ||
                 to_char(v_tk_tutar, 'FM999G999G999') || ' ₺' || E'\n' || coalesce(v_teklif, '');
    end if;
  exception when others then null;
  end;

  perform net.http_post(
    url     := 'https://api.telegram.org/bot' || v_bot || '/sendMessage',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('chat_id', v_grup, 'text', v_metin, 'disable_web_page_preview', true)
  );

  return v_metin;
end;
$$;


-- ============================================================================
-- 4) KONTROL: ŞU ANKİ DURUM (para masada!)
-- ============================================================================
select
  (public.teklif_kazanma_analizi() ->> 'toplam')         as toplam_teklif,
  (public.teklif_kazanma_analizi() ->> 'bekleyen')       as bekleyen_teklif,
  (public.teklif_kazanma_analizi() ->> 'kazanma_orani')  as kazanma_orani,
  (public.teklif_kazanma_analizi() ->> 'bekleyen_tutar') as masadaki_para,
  (select count(*) from public.teklif_bekleyenler() where aciliyet in ('ACİL','SÜRESİ GEÇTİ')) as takip_gereken;

-- Fiyat aralığı analizi
select
  (b ->> 'bant')  as fiyat_araligi,
  (b ->> 'onay')  as onaylanan,
  (b ->> 'ret')   as reddedilen,
  (b ->> 'oran')  as kazanma_orani
from jsonb_array_elements(public.teklif_kazanma_analizi() -> 'fiyat_araliklari') b;
