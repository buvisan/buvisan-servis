-- ============================================================================
--  🔗 AKILLI 1:1 EŞLEŞTİRME (Güncelleme #122)
-- ----------------------------------------------------------------------------
--  DURUM: SQL 148'de tüm ticket_id'ler silindi.
--         Formlar var ama arızalara bağlı değil → arızalar açık kalıyor.
--         Gerçekte 5 iş var, 33 görünüyor.
--
--  ÇÖZÜM: SIKI KURALLARLA 1:1 eşleştirme
--    1) SADECE SERVİS raporları (bakım formları arıza kapatmaz)
--    2) İsim benzerliği ≥ 70
--    3) Rapor tarihi ≥ arıza tarihi (max 30 gün sonra)
--    4) Her arıza EN FAZLA 1 form, her form EN FAZLA 1 arıza
--
--  KULLANIM: 149'dan SONRA çalıştır. Veri silmez.
-- ============================================================================


-- ============================================================================
-- 1) 🔍 EŞLEŞME ADAYLARINI GÖR (çalıştırmadan önce kontrol)
-- ============================================================================
select
  st.id as ariza_id,
  coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'—') as ariza_firma,
  to_char(st.created_at,'DD.MM') as ariza_tarih,
  sr.id as rapor_id,
  coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'—') as rapor_firma,
  to_char(sr.created_at,'DD.MM') as rapor_tarih,
  public.firma_benzerlik(
    coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
    coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
  ) as skor
from public.service_tickets st
cross join lateral (
  select sr2.id, sr2.created_at,
         public.firma_benzerlik(
           coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
           coalesce(public.jalan(to_jsonb(sr2),'firma_adi','musteri_adi','customer_name'),'')
         ) as skor2
  from public.service_reports sr2
  where coalesce(public.jalan(to_jsonb(sr2),'ticket_id'),'') = ''
    and sr2.created_at >= st.created_at - interval '1 day'
    and sr2.created_at <= st.created_at + interval '30 days'
  order by skor2 desc, sr2.created_at asc
  limit 1
) sr
where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
  and sr.skor2 >= 70
order by sr.skor2 desc
limit 40;


-- ============================================================================
-- 2) 🔗 1:1 EŞLEŞTİR VE KAPAT
-- ============================================================================
create or replace function public.formlari_akilli_bagla(p_esik integer default 70)
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
  -- Aday tablosu: her arıza için en iyi eşleşen raporu bul
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
      and coalesce(public.jalan(to_jsonb(sr),'ticket_id'),'') = ''
      and sr.created_at >= st.created_at - interval '1 day'
      and sr.created_at <= st.created_at + interval '30 days'
  ),
  eslesen as (
    select t_id, r_id, skor
    from adaylar
    where skor >= p_esik
      and t_sira = 1     -- her arıza için 1 form
      and r_sira = 1     -- her form için 1 arıza
  )
  update public.service_reports sr
     set ticket_id = e.t_id
    from eslesen e
   where sr.id = e.r_id;

  get diagnostics v_baglanan = row_count;

  -- Eşleşen arızaları kapat
  update public.service_tickets st
     set pipeline_status = 'tamamlandi',
         status = 'tamamlandi'
   where st.id in (
     select distinct sr.ticket_id
     from public.service_reports sr
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
    'baglanan_form', v_baglanan,
    'kapatilan_ariza', v_kapatilan,
    'kalan_acik', v_kalan,
    'mesaj', '🔗 ' || v_baglanan || ' form bağlandı, ' ||
             v_kapatilan || ' arıza kapatıldı. ' ||
             v_kalan || ' iş kaldı.'
  );
exception when others then
  return jsonb_build_object('baglanan_form', 0, 'kapatilan_ariza', 0, 'kalan_acik', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.formlari_akilli_bagla(integer) from public;
grant execute on function public.formlari_akilli_bagla(integer) to authenticated;


-- ============================================================================
-- 3) 🧪 ÇALIŞTIR
-- ============================================================================
select public.formlari_akilli_bagla(70) as eslestirme_sonucu;

-- Kalan açık işler
select
  coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'—') as firma,
  to_char(st.created_at,'DD.MM.YYYY HH24:MI') as tarih
from public.service_tickets st
where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
order by st.created_at desc;
