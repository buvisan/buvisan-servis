-- ============================================================================
--  🧹 MÜKERRER ARIZALARI TEMİZLE + KALANLARI EŞLEŞTİR (Güncelleme #123)
-- ----------------------------------------------------------------------------
--  DURUM: 33 → 14'e düştü. Kalanların çoğu MÜKERRER:
--    HES METAL    26.10 07:28 (2 kayıt)
--    RB KARESİ    20.10 05:35-05:39 (4 kayıt)
--    AKSANTAŞ     26.10 07:17 (2 kayıt)
--
--  KURAL: Aynı firma + aynı gün = MÜKERRER
--         → EN ESKİ kayıt kalır, diğerleri kapatılır
--
--  KULLANIM: 150'den SONRA çalıştır. Veri silmez.
-- ============================================================================


-- ============================================================================
-- 1) 🔍 MÜKERRERLERİ GÖR
-- ============================================================================
select
  public.firma_normal(coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'')) as firma_normal,
  count(*) as adet,
  string_agg(to_char(st.created_at,'HH24:MI'), ' | ' order by st.created_at) as saatler
from public.service_tickets st
where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
  and st.created_at >= (now() - interval '30 days')
group by 1
having count(*) > 1
order by 2 desc;


-- ============================================================================
-- 2) 🧹 MÜKERRERLERİ KAPAT (en eski kalır)
-- ============================================================================
create or replace function public.mukerrer_arizalari_kapat()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kapatilan integer := 0;
  v_kalan integer := 0;
begin
  with sirali as (
    select st.id,
           row_number() over (
             partition by public.firma_normal(coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''))
                          , st.created_at::date
             order by st.created_at asc
           ) as sira
    from public.service_tickets st
    where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
      and st.created_at >= (now() - interval '30 days')
  )
  update public.service_tickets st
     set pipeline_status = 'tamamlandi',
         status = 'tamamlandi'
   from sirali s
   where st.id = s.id
     and s.sira > 1;

  get diagnostics v_kapatilan = row_count;

  begin
    select count(*) into v_kalan
    from public.service_tickets st
    where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu');
  exception when others then v_kalan := 0; end;

  return jsonb_build_object(
    'mukerrer_kapatilan', v_kapatilan,
    'kalan_acik', v_kalan,
    'mesaj', '🧹 ' || v_kapatilan || ' mükerrer kayıt kapatıldı. ' || v_kalan || ' iş kaldı.'
  );
exception when others then
  return jsonb_build_object('mukerrer_kapatilan', 0, 'kalan_acik', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.mukerrer_arizalari_kapat() from public;
grant execute on function public.mukerrer_arizalari_kapat() to authenticated;


-- ============================================================================
-- 3) 🧪 ÇALIŞTIR
-- ============================================================================
select public.mukerrer_arizalari_kapat() as mukerrer_sonucu;

-- Kalan tekrar eşleştir
select public.formlari_akilli_bagla(65) as eslestirme_2;

-- Son durum
select
  coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'—') as firma,
  to_char(st.created_at,'DD.MM.YYYY HH24:MI') as tarih
from public.service_tickets st
where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
order by st.created_at desc;
