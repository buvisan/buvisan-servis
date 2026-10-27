-- ============================================================================
--  🧹 TEMİZ RESET (Güncelleme #119)
-- ----------------------------------------------------------------------------
--  DURUM: formlari_arizaya_bagla() çok cömert bağladı
--         (BUVİSER'e 2 servis + 8 bakım form bağlanmış)
--         → arızalar "form var" diye kapanık kaldı
--
--  3 ADIM — sırayla çalıştır, her adımın sonucunu gör:
--    ADIM 1: Otomatik bağlanan ticket_id'leri TEMİZLE
--    ADIM 2: Bağsız kalan arızaları GERİ AÇ
--    ADIM 3: Son durumu gör
--
--  ⚠️ VERİ SİLMEZ — sadece bağlantıları ve durumları düzeltir
-- ============================================================================


-- ============================================================================
-- ADIM 1) 🧹 OTOMATİK BAĞLANTILARI TEMİZLE
--         Kural: Bir formun ticket_id'si VAR AMA o ticket'ta
--                o formun tarihine yakın randevu YOKSA → temizle
-- ============================================================================
create or replace function public.otomatik_baglantilari_temizle()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servis integer := 0;
  v_bakim integer := 0;
begin
  -- SERVİS: ticket_id'yi temizle (kesin randevu eşleşmesi yoksa)
  begin
    update public.service_reports sr
       set ticket_id = null
     where coalesce(public.jalan(to_jsonb(sr),'ticket_id'),'') <> ''
       -- Bu ticket'a ait, form tarihine ±1 gün yakın randevu YOK
       and not exists (
         select 1 from public.randevular r
         where r.ticket_id::text = public.jalan(to_jsonb(sr),'ticket_id')
           and abs(extract(epoch from (sr.created_at::date - r.randevu_tarihi::date))) <= 86400
       );
    get diagnostics v_servis = row_count;
  exception when others then v_servis := -1; end;

  -- BAKIM
  begin
    update public.bakim_formlari bf
       set ticket_id = null
     where bf.ticket_id is not null
       and not exists (
         select 1 from public.randevular r
         where r.ticket_id = bf.ticket_id
           and abs(extract(epoch from (bf.created_at::date - r.randevu_tarihi::date))) <= 86400
       );
    get diagnostics v_bakim = row_count;
  exception when others then v_bakim := -1; end;

  return jsonb_build_object(
    'servis_temizlenen', v_servis,
    'bakim_temizlenen', v_bakim,
    'mesaj', '🧹 ' || v_servis || ' servis + ' || v_bakim || ' bakım bağlantısı temizlendi.'
  );
end $$;

revoke all on function public.otomatik_baglantilari_temizle() from public;
grant execute on function public.otomatik_baglantilari_temizle() to authenticated;


-- ============================================================================
-- ADIM 2) 🔓 BAĞSIZ ARIZALARI GERİ AÇ
-- ============================================================================
create or replace function public.bagsiz_arizalari_ac()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acilan integer := 0;
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

  return jsonb_build_object(
    'acilan', v_acilan,
    'mesaj', '🔓 ' || v_acilan || ' bağsız arıza geri açıldı.'
  );
exception when others then
  return jsonb_build_object('acilan', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.bagsiz_arizalari_ac() from public;
grant execute on function public.bagsiz_arizalari_ac() to authenticated;


-- ============================================================================
-- ADIM 3) 🧪 ÇALIŞTIR
-- ============================================================================
select public.otomatik_baglantilari_temizle() as adim1_temizlik;
select public.bagsiz_arizalari_ac() as adim2_geri_acma;

-- Son durum
select
  coalesce(to_jsonb(st)->>'pipeline_status','(boş)') as durum,
  count(*) as adet
from public.service_tickets st
group by 1
order by 2 desc;

-- Bağlı form sayıları
select
  (select count(*) from public.service_reports
    where coalesce(public.jalan(to_jsonb(service_reports),'ticket_id'),'') <> '') as bagli_servis,
  (select count(*) from public.bakim_formlari where ticket_id is not null) as bagli_bakim,
  (select count(*) from public.service_reports) as toplam_servis,
  (select count(*) from public.bakim_formlari) as toplam_bakim;
