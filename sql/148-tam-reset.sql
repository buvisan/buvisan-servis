-- ============================================================================
--  🔄 TAM RESET (Güncelleme #120)
-- ----------------------------------------------------------------------------
--  DURUM: Otomatik bağlama denemesi başarısız oldu.
--         53 form "bağlı" görünüyor ama hangisi gerçekten o arıza için
--         dolduruldu bilinmiyor. Tahminle ayırmak imkansız.
--
--  ÇÖZÜM: TEMİZ SAYFA
--    1) TÜM formların ticket_id bağlantısını kaldır
--    2) Son 60 günde kapanan arızaları GERİ AÇ
--    3) Bundan sonra: form → arıza bağı SADECE UI'dan gelir
--
--  ⚠️ VERİ SİLMEZ — formlar, arızalar, randevular hepsi duruyor
--     Sadece "kapatıldı/bağlandı" işaretleri sıfırlanıyor.
--
--  KULLANIM: 147'den SONRA çalıştır.
-- ============================================================================


-- ============================================================================
-- 1) 🧹 TÜM ticket_id BAĞLANTILARINI KALDIR
-- ============================================================================
create or replace function public.tum_baglantilari_sifirla()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servis integer := 0;
  v_bakim integer := 0;
begin
  begin
    update public.service_reports sr set ticket_id = null where ticket_id is not null;
    get diagnostics v_servis = row_count;
  exception when others then v_servis := -1; end;

  begin
    update public.bakim_formlari bf set ticket_id = null where ticket_id is not null;
    get diagnostics v_bakim = row_count;
  exception when others then v_bakim := -1; end;

  return jsonb_build_object(
    'servis_temizlenen', v_servis,
    'bakim_temizlenen', v_bakim,
    'mesaj', '🧹 ' || v_servis || ' servis + ' || v_bakim || ' bakım bağlantısı sıfırlandı.'
  );
end $$;

revoke all on function public.tum_baglantilari_sifirla() from public;
grant execute on function public.tum_baglantilari_sifirla() to authenticated;


-- ============================================================================
-- 2) 🔓 SON 60 GÜNDE KAPANAN ARIZALARI GERİ AÇ
-- ============================================================================
create or replace function public.son_arizalari_geri_ac(p_gun integer default 60)
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
      and st.created_at >= (now() - (p_gun || ' days')::interval)
  )
  update public.service_tickets st
     set pipeline_status = 'acil_cozum_bekliyor',
         status = 'acil_cozum_bekliyor'
   from hedefler h
   where st.id = h.id;

  get diagnostics v_acilan = row_count;

  return jsonb_build_object(
    'acilan', v_acilan,
    'mesaj', '🔓 ' || v_acilan || ' arıza geri açıldı (son ' || p_gun || ' gün).'
  );
exception when others then
  return jsonb_build_object('acilan', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.son_arizalari_geri_ac(integer) from public;
grant execute on function public.son_arizalari_geri_ac(integer) to authenticated;


-- ============================================================================
-- 3) 🧪 ÇALIŞTIR
-- ============================================================================
select public.tum_baglantilari_sifirla() as adim1_sifirlama;
select public.son_arizalari_geri_ac(60) as adim2_geri_acma;

-- Son durum
select
  coalesce(to_jsonb(st)->>'pipeline_status','(boş)') as durum,
  count(*) as adet
from public.service_tickets st
group by 1
order by 2 desc;

select
  (select count(*) from public.service_reports
    where coalesce(public.jalan(to_jsonb(service_reports),'ticket_id'),'') <> '') as bagli_servis,
  (select count(*) from public.bakim_formlari where ticket_id is not null) as bagli_bakim,
  (select count(*) from public.service_reports) as toplam_servis,
  (select count(*) from public.bakim_formlari) as toplam_bakim;
