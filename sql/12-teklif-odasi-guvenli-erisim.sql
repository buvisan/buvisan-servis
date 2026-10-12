-- ============================================================================
--  🔐 TEKLİF ODASI GÜVENLİ ERİŞİM  (son açık kapanıyor)
-- ----------------------------------------------------------------------------
--  SORUN:
--    Müşteri teklif linkini açtığında sayfa  offers?select=*  isteği yapıyordu.
--    Bu istek TÜM 220 teklifin müşteri adı/adresi/fiyatını indiriyordu.
--    Dahası: girişsiz kişi HERHANGİ bir teklifin FİYATINI DEĞİŞTİREBİLİYORDU.
--
--  ÇÖZÜM:
--    • teklif_getir()    → sadece İSTENEN teklifi, güvenli alanlarıyla döndürür
--    • teklif_yanitla()  → müşteri sadece KENDİ teklifini yanıtlar ve
--                          ZATEN YANITLANMIŞ teklifi bir daha değiştiremez
--
--  ⚠️ Müşteri teklif linki DEĞİŞMEZ: /teklif-odasi/<kimlik>
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) TEKLİFİ GETİR (tek kayıt, güvenli alanlar)
-- ============================================================================
create or replace function public.teklif_getir(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',               o.id,
    'customer_name',    o.customer_name,
    'customer_rep',     o.customer_rep,
    'customer_address', o.customer_address,
    'description',      o.description,
    'items',            coalesce(o.items, '[]'::jsonb),
    'total_price',      o.total_price,
    'final_price',      o.final_price,
    'status',           o.status,
    'selected_options', o.selected_options,
    'offer_date',       o.offer_date,
    'valid_until',      o.valid_until,
    'template_type',    o.template_type
  )
  from public.offers o
  where o.id = p_id;
$$;

revoke all on function public.teklif_getir(uuid) from public;
grant execute on function public.teklif_getir(uuid) to anon, authenticated;


-- ============================================================================
-- 2) MÜŞTERİ YANITI (onay / ret)
--    Güvenlik kuralları:
--      • Sadece 'onaylandi' veya 'reddedildi' kabul edilir
--      • ZATEN YANITLANMIŞ teklif bir daha değiştirilemez (fiyat oynanamaz)
--      • Fiyat negatif olamaz
-- ============================================================================
create or replace function public.teklif_yanitla(
  p_id          uuid,
  p_durum       text,
  p_final       numeric,
  p_secenekler  jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etkilenen integer;
  v_final     numeric;
begin
  if p_durum not in ('onaylandi', 'reddedildi') then
    raise exception 'GECERSIZ_DURUM';
  end if;

  v_final := greatest(coalesce(p_final, 0), 0);

  update public.offers
     set status           = p_durum,
         final_price      = v_final,
         selected_options = coalesce(p_secenekler, '{}'::jsonb)
   where id = p_id
     and coalesce(status, '') not in ('onaylandi', 'reddedildi');

  get diagnostics v_etkilenen = row_count;

  if v_etkilenen = 0 then
    return jsonb_build_object('ok', false, 'mesaj', 'Bu teklif zaten yanıtlanmış.');
  end if;

  return jsonb_build_object('ok', true, 'mesaj', 'Teklif kaydedildi.');
end;
$$;

revoke all on function public.teklif_yanitla(uuid, text, numeric, jsonb) from public;
grant execute on function public.teklif_yanitla(uuid, text, numeric, jsonb) to anon, authenticated;


-- ============================================================================
-- 3) KONTROL
-- ============================================================================
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('teklif_getir','teklif_yanitla')) as hazir_fonksiyon,

  (select jsonb_build_object(
      'musteri', (public.teklif_getir((select id from public.offers order by created_at desc limit 1)) ->> 'customer_name'),
      'durum',   (public.teklif_getir((select id from public.offers order by created_at desc limit 1)) ->> 'status'),
      'kalem',   jsonb_array_length(coalesce(public.teklif_getir((select id from public.offers order by created_at desc limit 1)) -> 'items', '[]'::jsonb))
  )) as ornek_teklif;
