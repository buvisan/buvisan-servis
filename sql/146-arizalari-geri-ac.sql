-- ============================================================================
--  🔓 ARIZALARI GERİ AÇ — KESİN VERSİYON (Güncelleme #118)
-- ----------------------------------------------------------------------------
--  DURUM: 145 çalıştı ama acik_ariza=3 kaldı (36 olması gerekirken)
--         yanlis_kapananlari_ac() çalışmadı (muhtemelen updated_at yok)
--
--  BU SCRIPT:
--    1) service_tickets kolonlarını göster (updated_at var mı?)
--    2) Tarih filtresi OLMADAN geri aç
--    3) KESİN kural: bağlı formu olmayan TÜM tamamlandi arızaları aç
--
--  KULLANIM: 145'ten SONRA çalıştır. VERİ SİLMEZ.
-- ============================================================================


-- ============================================================================
-- 1) 🔍 service_tickets DURUMU
-- ============================================================================
select string_agg(column_name || ' (' || data_type || ')', ', ' order by ordinal_position) as kolonlar
from information_schema.columns
where table_schema='public' and table_name='service_tickets';

-- pipeline_status dağılımı
select coalesce(to_jsonb(st)->>'pipeline_status','(boş)') as durum, count(*) as adet
from public.service_tickets st
group by 1
order by 2 desc;


-- ============================================================================
-- 2) 🔓 GERİ AÇ — tarih filtresi YOK, exception-güvenli
-- ============================================================================
create or replace function public.arizalari_geri_ac(p_bosluk_dk integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acilan integer := 0;
  v_toplam integer := 0;
begin
  begin
    select count(*) into v_toplam from public.service_tickets;
  exception when others then v_toplam := 0; end;

  -- Bağlı formu OLMAYAN tamamlandi arızaları aç
  begin
    with hedefler as (
      select st.id
      from public.service_tickets st
      where coalesce(to_jsonb(st)->>'pipeline_status','') in ('tamamlandi','cozuldu')
        and not exists (
          select 1 from public.service_reports sr
          where coalesce(public.jalan(to_jsonb(sr),'ticket_id'),'') = st.id::text
        )
        and not exists (
          select 1 from public.bakim_formlari bf
          where coalesce(public.jalan(to_jsonb(bf),'ticket_id'),'') = st.id::text
        )
    )
    update public.service_tickets st
       set pipeline_status = 'acil_cozum_bekliyor',
           status = 'acil_cozum_bekliyor'
     from hedefler h
     where st.id = h.id;

    get diagnostics v_acilan = row_count;
  exception when others then
    v_acilan := -1;
  end;

  return jsonb_build_object(
    'acilan', v_acilan,
    'toplam_ticket', v_toplam,
    'mesaj', case
      when v_acilan < 0 then '❌ HATA — fonksiyon çalışmadı'
      else '🔓 ' || v_acilan || ' arıza geri açıldı.'
    end
  );
end $$;

revoke all on function public.arizalari_geri_ac(integer) from public;
grant execute on function public.arizalari_geri_ac(integer) to authenticated;


-- ============================================================================
-- 3) 🧪 ÇALIŞTIR
-- ============================================================================
select public.arizalari_geri_ac(0) as geri_acma_sonucu;

-- Son durum
select
  coalesce(to_jsonb(st)->>'pipeline_status','(boş)') as durum,
  count(*) as adet
from public.service_tickets st
group by 1
order by 2 desc;


-- ============================================================================
-- 4) 🔍 BAĞLI FORMLAR — hangi arızaya bağlanmış?
-- ============================================================================
select
  st.id as ariza_id,
  coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'—') as ariza_firma,
  coalesce(to_jsonb(st)->>'pipeline_status','?') as durum,
  (select count(*) from public.service_reports sr
    where coalesce(public.jalan(to_jsonb(sr),'ticket_id'),'') = st.id::text) as servis_form,
  (select count(*) from public.bakim_formlari bf
    where coalesce(public.jalan(to_jsonb(bf),'ticket_id'),'') = st.id::text) as bakim_form
from public.service_tickets st
where coalesce(to_jsonb(st)->>'pipeline_status','') in ('tamamlandi','cozuldu')
order by 4 desc, 5 desc
limit 20;
