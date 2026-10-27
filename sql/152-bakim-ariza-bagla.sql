-- ============================================================================
--  🔧 BAKIM FORMLARI DA ARIZAYI KAPATSIN (Güncelleme #124)
-- ----------------------------------------------------------------------------
--  DURUM: DEVLET SU İŞLERİ'ne periyodik bakım formu doldurulmuş
--         ama arıza açık kalmış (servis raporu yok).
--
--  İSTEK: Bakım formu doldurulmuşsa arıza da çözüldü sayılsın.
--
--  KURAL (sıkı, 1:1):
--    1) Bakım formunun ticket_id'si BOŞ
--    2) İsim benzerliği ≥ 65
--    3) Bakım formu tarihi ≥ arıza tarihi (max 30 gün)
--    4) Her bakım formu → EN FAZLA 1 arıza
--    5) Her arıza → EN FAZLA 1 bakım formu
--
--  KULLANIM: 151'den SONRA çalıştır. Veri silmez.
-- ============================================================================


-- ============================================================================
-- 1) 🔍 ADAYLARI GÖR
-- ============================================================================
select
  coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'—') as ariza_firma,
  to_char(st.created_at,'DD.MM') as ariza_tarih,
  bf.seri_no as bakim_formu,
  coalesce(bf.musteri,'—') as bakim_firma,
  to_char(bf.created_at,'DD.MM') as bakim_tarih,
  public.firma_benzerlik(
    coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
    coalesce(bf.musteri,'')
  ) as skor
from public.service_tickets st
cross join lateral (
  select f.id, f.seri_no, f.musteri, f.created_at,
         public.firma_benzerlik(
           coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
           coalesce(f.musteri,'')
         ) as skor2
  from public.bakim_formlari f
  where f.ticket_id is null
    and f.created_at >= st.created_at - interval '1 day'
    and f.created_at <= st.created_at + interval '30 days'
  order by skor2 desc, f.created_at asc
  limit 1
) bf
where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
  and bf.skor2 >= 65
order by bf.skor2 desc
limit 30;


-- ============================================================================
-- 2) 🔧 BAKIM FORMLARINI ARIZALARA BAĞLA + KAPAT
-- ============================================================================
create or replace function public.bakim_formlari_arizaya_bagla(p_esik integer default 65)
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
  with adaylar as (
    select
      st.id as t_id,
      bf.id as f_id,
      public.firma_benzerlik(
        coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
        coalesce(bf.musteri,'')
      ) as skor,
      row_number() over (partition by st.id order by
        public.firma_benzerlik(
          coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
          coalesce(bf.musteri,'')
        ) desc, bf.created_at asc
      ) as t_sira,
      row_number() over (partition by bf.id order by
        public.firma_benzerlik(
          coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
          coalesce(bf.musteri,'')
        ) desc, st.created_at asc
      ) as f_sira
    from public.service_tickets st
    cross join public.bakim_formlari bf
    where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
      and bf.ticket_id is null
      and bf.created_at >= st.created_at - interval '1 day'
      and bf.created_at <= st.created_at + interval '30 days'
  ),
  eslesen as (
    select t_id, f_id, skor
    from adaylar
    where skor >= p_esik
      and t_sira = 1
      and f_sira = 1
  )
  update public.bakim_formlari bf
     set ticket_id = e.t_id
    from eslesen e
   where bf.id = e.f_id;

  get diagnostics v_baglanan = row_count;

  -- Bağlanan arızaları kapat
  update public.service_tickets st
     set pipeline_status = 'tamamlandi',
         status = 'tamamlandi'
   where st.id in (
     select distinct bf.ticket_id
     from public.bakim_formlari bf
     where bf.ticket_id is not null
   )
     and coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu');

  get diagnostics v_kapatilan = row_count;

  begin
    select count(*) into v_kalan
    from public.service_tickets st
    where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu');
  exception when others then v_kalan := 0; end;

  return jsonb_build_object(
    'baglanan_bakim', v_baglanan,
    'kapatilan_ariza', v_kapatilan,
    'kalan_acik', v_kalan,
    'mesaj', '🔧 ' || v_baglanan || ' bakım formu bağlandı, ' ||
             v_kapatilan || ' arıza kapatıldı. ' ||
             v_kalan || ' iş kaldı.'
  );
exception when others then
  return jsonb_build_object('baglanan_bakim', 0, 'kapatilan_ariza', 0, 'kalan_acik', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.bakim_formlari_arizaya_bagla(integer) from public;
grant execute on function public.bakim_formlari_arizaya_bagla(integer) to authenticated;


-- ============================================================================
-- 3) 🧪 ÇALIŞTIR
-- ============================================================================
select public.bakim_formlari_arizaya_bagla(65) as bakim_eslestirme;

-- Kalan işler
select
  coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'—') as firma,
  to_char(st.created_at,'DD.MM.YYYY HH24:MI') as tarih
from public.service_tickets st
where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
order by st.created_at desc;
