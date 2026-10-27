-- ============================================================================
--  📦 ESKİ AÇIK KAYITLARI ARŞİVLE (Güncelleme #121)
-- ----------------------------------------------------------------------------
--  DURUM: Planlayıcıda 5 BEKLİYOR, Operasyon Takibi'nde 72 açık.
--         Fark = geçmişte kapanmamış, randevusu olmayan eski kayıtlar.
--
--  KURAL:
--    7 günden eski
--    VE bu arızaya bağlı AKTİF randevu YOK
--    VE hâlâ açık
--        ↓
--    → TAMAMLANDI olarak arşivle
--
--  ⚠️ VERİ SİLMEZ — sadece durum günceller
--
--  KULLANIM: 148'den SONRA çalıştır.
-- ============================================================================


-- ============================================================================
-- 1) 📊 ÖNCE DURUMU GÖR
-- ============================================================================
select 'TOPLAM' as tip, count(*) as adet from public.service_tickets
union all
select 'AÇIK (tamamlandi değil)', count(*) from public.service_tickets
  where coalesce(to_jsonb(service_tickets)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
union all
select 'AÇIK + son 7 gün', count(*) from public.service_tickets
  where coalesce(to_jsonb(service_tickets)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
    and created_at >= now() - interval '7 days'
union all
select 'AÇIK + aktif randevulu', count(*) from public.service_tickets st
  where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
    and exists (
      select 1 from public.randevular r
      where r.ticket_id = st.id
        and r.durum <> 'yapildi'
    );


-- ============================================================================
-- 2) 📦 ARŞİVLE
-- ============================================================================
create or replace function public.eski_acik_kayitlari_arsivle(p_gun integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_arsivlenen integer := 0;
  v_kalan integer := 0;
begin
  with hedefler as (
    select st.id
    from public.service_tickets st
    where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
      and st.created_at < (now() - (p_gun || ' days')::interval)
      -- Aktif randevusu YOK
      and not exists (
        select 1 from public.randevular r
        where r.ticket_id = st.id
          and r.durum <> 'yapildi'
      )
  )
  update public.service_tickets st
     set pipeline_status = 'tamamlandi',
         status = 'tamamlandi'
   from hedefler h
   where st.id = h.id;

  get diagnostics v_arsivlenen = row_count;

  begin
    select count(*) into v_kalan
    from public.service_tickets st
    where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu');
  exception when others then v_kalan := 0; end;

  return jsonb_build_object(
    'arsivlenen', v_arsivlenen,
    'kalan_acik', v_kalan,
    'mesaj', '📦 ' || v_arsivlenen || ' eski kayıt arşivlendi. ' ||
             v_kalan || ' gerçek aktif iş kaldı.'
  );
exception when others then
  return jsonb_build_object('arsivlenen', 0, 'kalan_acik', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.eski_acik_kayitlari_arsivle(integer) from public;
grant execute on function public.eski_acik_kayitlari_arsivle(integer) to authenticated;


-- ============================================================================
-- 3) 🧪 ÇALIŞTIR
-- ============================================================================
select public.eski_acik_kayitlari_arsivle(7) as arsivleme_sonucu;

-- Kalan açık işler (gerçek güncel işler)
select
  coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'—') as firma,
  coalesce(to_jsonb(st)->>'pipeline_status','?') as durum,
  to_char(st.created_at,'DD.MM.YYYY HH24:MI') as olusturma
from public.service_tickets st
where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
order by st.created_at desc;
