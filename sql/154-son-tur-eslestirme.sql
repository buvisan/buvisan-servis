-- ============================================================================
--  🔄 SON TUR: FORMLARI AÇIK ARIZALARA YENİDEN ATA (Güncelleme #126)
-- ----------------------------------------------------------------------------
--  SORUN: Skor 100 olan formlar var ama eşleşmemiş
--         Çünkü 1:1 eşleştirmede MÜKERRER arızalara bağlanmışlar.
--
--  ÇÖZÜM: AÇIK arızalara göre YENİDEN eşleştir.
--         Bağlı formlar da yeniden atanabilir (mükerrer arızalar kapandı).
--
--  KURAL: Skor ≥ 65 + tarih sırası + 1:1
--
--  KULLANIM: 153'ten SONRA çalıştır. Veri silmez.
-- ============================================================================

create or replace function public.formlari_yeniden_ata(p_esik integer default 65)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_baglanan integer := 0;
  v_kapatilan integer := 0;
  v_kalan integer := 0;
begin
  -- Önce açık arızaların form bağlarını kopar (yeniden atama için)
  begin
    update public.service_reports sr
       set ticket_id = null
     where sr.ticket_id in (
       select st.id from public.service_tickets st
       where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
     );
  exception when others then null; end;

  -- Yeniden 1:1 ata (sadece AÇIK arızalar)
  with adaylar as (
    select
      st.id as t_id,
      sr.id as r_id,
      public.firma_benzerlik(
        coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
        coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
      ) as skor,
      row_number() over (partition by st.id order by
        public.firma_benzerlik(
          coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
          coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
        ) desc, sr.created_at asc
      ) as t_sira,
      row_number() over (partition by sr.id order by
        public.firma_benzerlik(
          coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
          coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
        ) desc, st.created_at asc
      ) as r_sira
    from public.service_tickets st
    cross join public.service_reports sr
    where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
      and sr.created_at >= st.created_at - interval '1 day'
      and sr.created_at <= st.created_at + interval '30 days'
  ),
  eslesen as (
    select t_id, r_id, skor
    from adaylar
    where skor >= p_esik
      and t_sira = 1
      and r_sira = 1
  )
  update public.service_reports sr
     set ticket_id = e.t_id
    from eslesen e
   where sr.id = e.r_id;

  get diagnostics v_baglanan = row_count;

  -- Bağlanan arızaları kapat
  update public.service_tickets st
     set pipeline_status = 'tamamlandi',
         status = 'tamamlandi'
   where st.id in (
     select distinct sr.ticket_id from public.service_reports sr
     where sr.ticket_id is not null
   )
     and coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu');

  get diagnostics v_kapatilan = row_count;

  begin
    select count(*) into v_kalan
    from public.service_tickets st
    where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu');
  exception when others then v_kalan := 0; end;

  return jsonb_build_object(
    'baglanan', v_baglanan,
    'kapatilan', v_kapatilan,
    'kalan_acik', v_kalan,
    'mesaj', '🔄 ' || v_baglanan || ' form yeniden atandı, ' ||
             v_kapatilan || ' arıza kapatıldı. ' ||
             v_kalan || ' iş kaldı.'
  );
exception when others then
  return jsonb_build_object('baglanan', 0, 'kapatilan', 0, 'kalan_acik', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.formlari_yeniden_ata(integer) from public;
grant execute on function public.formlari_yeniden_ata(integer) to authenticated;


-- ============================================================================
-- 🧪 ÇALIŞTIR
-- ============================================================================
select public.formlari_yeniden_ata(65) as sonuc;

-- Kalan işler
select
  coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'—') as firma,
  to_char(st.created_at,'DD.MM.YYYY HH24:MI') as tarih
from public.service_tickets st
where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
order by st.created_at desc;
