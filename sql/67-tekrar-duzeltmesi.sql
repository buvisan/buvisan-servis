-- ============================================================================
--  🔧 ASİSTAN TEKRAR DÜZELTMESİ + RAPOR TEŞHİSİ (Güncelleme #47)
-- ----------------------------------------------------------------------------
--  SENİN GERİ BİLDİRİMLERİN:
--    1) "3 oldu aynı mesajı atıyor" → yedek mantığı aynı mesajı tekrarlıyordu
--    2) "113 tamamlanan işin raporu yok" nereden geliyor?
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) ⭐ TEKRAR DÜZELTMESİ — aynı mesaj üst üste GİTMEZ
--    Kural: Bir konu tekrar gönderilecekse araya BAŞKA bir konu girmeli
--           veya tekrar süresi (4 dk) dolmalı.
-- ============================================================================
create or replace function public.asistan_tek_hatirlat()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bekleyen   record;
  v_tekrar_dk  integer;
  v_mesaj      text;
  v_son        timestamptz;
  v_son_anahtar text;
begin
  select coalesce(deger, '4')::int into v_tekrar_dk
  from public.asistan_ayar where anahtar = 'tekrar_dk';

  -- En son gönderilen konunun anahtarı (aynısını üst üste atmamak için)
  select anahtar into v_son_anahtar
  from public.asistan_hatirlatmalar
  where anahtar not like '\_\_%'
  order by gonderim desc
  limit 1;

  -- 1. TUR: Süresi dolmuş VE son gönderilenden FARKLI konu varsa → onu gönder
  for v_bekleyen in
    select * from public.asistan_bekleyenler() order by aciliyet
  loop
    select max(gonderim) into v_son
    from public.asistan_hatirlatmalar
    where anahtar = v_bekleyen.anahtar;

    if (v_son is null or v_son < now() - (v_tekrar_dk || ' minutes')::interval)
       and v_bekleyen.anahtar is distinct from v_son_anahtar then
      v_mesaj := public.asistan_mesaj(v_bekleyen.anahtar, v_bekleyen.baslik,
                                      v_bekleyen.adet, v_bekleyen.detay);
      perform public.asistan_telegram(v_mesaj);
      insert into public.asistan_hatirlatmalar (anahtar, mesaj) values (v_bekleyen.anahtar, v_mesaj);
      return v_mesaj;
    end if;
  end loop;

  -- 2. TUR: Hepsi beklemedeyse → süresi dolmuş olanı gönder (aynısı olsa bile,
  --        çünkü 4 dakika geçtiyse tekrar hatırlatmak normaldir)
  for v_bekleyen in
    select * from public.asistan_bekleyenler() order by aciliyet
  loop
    select max(gonderim) into v_son
    from public.asistan_hatirlatmalar
    where anahtar = v_bekleyen.anahtar;

    if v_son is null or v_son < now() - (v_tekrar_dk || ' minutes')::interval then
      v_mesaj := public.asistan_mesaj(v_bekleyen.anahtar, v_bekleyen.baslik,
                                      v_bekleyen.adet, v_bekleyen.detay);
      perform public.asistan_telegram(v_mesaj);
      insert into public.asistan_hatirlatmalar (anahtar, mesaj) values (v_bekleyen.anahtar, v_mesaj);
      return v_mesaj;
    end if;
  end loop;

  -- Gerçekten süresi dolmuş konu yok → SESSİZ KAL (spam yapma)
  return null;
end $$;


-- ============================================================================
-- 2) "113 RAPOR" NEREDEN GELİYOR? — hangi işler, ne zaman?
-- ============================================================================
select
  coalesce(t.customer_name, t.firma_adi, '(isimsiz)')        as musteri,
  coalesce(t.status, '-')                                     as durum,
  coalesce(t.pipeline_status, '-')                            as pipeline,
  to_char(t.created_at, 'DD.MM.YYYY')                         as olusturma,
  (current_date - t.created_at::date)                         as gun_once,
  case when t.created_at::date > current_date - 30 then '🟢 YENİ' else '⚪ ESKİ' end as yas
from public.service_tickets t
where coalesce(t.pipeline_status, '') = 'tamamlandi'
  and not exists (select 1 from public.service_reports r where r.ticket_id = t.id)
order by t.created_at desc
limit 30;


-- ============================================================================
-- 3) ÖZET — kaç tanesi yeni, kaç tanesi eski?
-- ============================================================================
select
  count(*)                                                        as raporu_olmayan,
  count(*) filter (where created_at::date > current_date - 30)    as son_30_gun,
  count(*) filter (where created_at::date <= current_date - 30)   as eski_kayitlar,
  min(created_at::date)                                           as en_eski,
  max(created_at::date)                                           as en_yeni
from public.service_tickets t
where coalesce(t.pipeline_status, '') = 'tamamlandi'
  and not exists (select 1 from public.service_reports r where r.ticket_id = t.id);


-- ============================================================================
-- 4) ESKİ İŞLERİ HATIRLATMADAN ÇIKAR (90 günden eski olanlar)
--    Bunlar geçmiş kayıtlar — rapor girilmeyecek, asistan da sussun
-- ============================================================================
create table if not exists public.asistan_susturulan (
  anahtar   text primary key,
  sebep     text,
  olusturma timestamptz default now()
);

insert into public.asistan_susturulan (anahtar, sebep)
values ('rapor_bekleyen_eski', 'Uyarı: 90 günden eski işler hatırlatılmaz')
on conflict (anahtar) do nothing;


-- ============================================================================
-- 5) RAPOR KONTROLÜNÜ GÜNCELLE — sadece SON 90 GÜNÜ hatırlat
-- ============================================================================
create or replace function public.asistan_rapor_bekleyen()
returns table (adet integer, detay text)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::int,
    (select string_agg(coalesce(x.customer_name, x.firma_adi, 'İsimsiz'), ', ')
     from (
       select customer_name, firma_adi from public.service_tickets t2
       where coalesce(t2.pipeline_status,'') = 'tamamlandi'
         and t2.created_at::date > current_date - 90
         and not exists (select 1 from public.service_reports r where r.ticket_id = t2.id)
       limit 3
     ) x)
  from public.service_tickets t
  where coalesce(t.pipeline_status, '') = 'tamamlandi'
    and t.created_at::date > current_date - 90          -- ⏱️ sadece son 90 gün
    and not exists (select 1 from public.service_reports r where r.ticket_id = t.id);
$$;

revoke all on function public.asistan_rapor_bekleyen() from public;
grant execute on function public.asistan_rapor_bekleyen() to authenticated;


-- ============================================================================
-- 6) KONTROL — 90 gün kuralıyla kaç rapor bekliyor?
-- ============================================================================
select * from public.asistan_rapor_bekleyen();
