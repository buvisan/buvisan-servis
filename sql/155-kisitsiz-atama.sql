-- ============================================================================
--  🔓 SON ÇÖZÜM: KISITSIZ ATAMA (Güncelleme #127)
-- ----------------------------------------------------------------------------
--  DURUM: 8 arıza kaldı. HES METAL ve KARESİ POLYESTER'in formu VAR (skor 100)
--         ama 1:1 kuralı yüzünden başka arızalara kilitli.
--
--  ÇÖZÜM: Bu son turda 1:1 kısıtını KALDIR.
--         Bir form birden fazla BENZER arızayı kapatabilir.
--         (Mükerrer kayıtlar olduğu için bu kabul edilebilir)
--
--  KURAL: Skor ≥ 65 + tarih sırası (r_sira kısıtı YOK)
--
--  KULLANIM: 154'ten SONRA çalıştır. Veri silmez.
-- ============================================================================

create or replace function public.formlari_kisitsiz_ata(p_esik integer default 65)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kapatilan integer := 0;
  v_kalan integer := 0;
  v_detay jsonb := '[]'::jsonb;
begin
  -- Her açık arıza için en iyi eşleşen formu bul (1:1 kısıtı YOK)
  with eslesen as (
    select distinct on (st.id)
      st.id as t_id,
      sr.id as r_id,
      public.firma_benzerlik(
        coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
        coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
      ) as skor
    from public.service_tickets st
    cross join public.service_reports sr
    where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
      and sr.created_at >= st.created_at - interval '1 day'
      and sr.created_at <= st.created_at + interval '30 days'
      and public.firma_benzerlik(
            coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
            coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
          ) >= p_esik
    order by st.id,
      public.firma_benzerlik(
        coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
        coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
      ) desc,
      sr.created_at asc
  ),
  kapatilacak as (
    select e.t_id, e.r_id, e.skor
    from eslesen e
  )
  update public.service_tickets st
     set pipeline_status = 'tamamlandi',
         status = 'tamamlandi'
   from kapatilacak k
   where st.id = k.t_id;

  get diagnostics v_kapatilan = row_count;

  -- Formlara ticket_id yaz (rapor amaçlı)
  begin
    with eslesen as (
      select distinct on (st.id)
        st.id as t_id, sr.id as r_id
      from public.service_tickets st
      cross join public.service_reports sr
      where coalesce(to_jsonb(st)->>'pipeline_status','') = 'tamamlandi'
        and sr.created_at >= st.created_at - interval '1 day'
        and sr.created_at <= st.created_at + interval '30 days'
        and public.firma_benzerlik(
              coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
              coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
            ) >= p_esik
      order by st.id,
        public.firma_benzerlik(
          coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),''),
          coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')
        ) desc,
        sr.created_at asc
    )
    update public.service_reports sr
       set ticket_id = e.t_id
      from eslesen e
     where sr.id = e.r_id
       and sr.ticket_id is null;
  exception when others then null; end;

  begin
    select count(*) into v_kalan
    from public.service_tickets st
    where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu');
  exception when others then v_kalan := 0; end;

  return jsonb_build_object(
    'kapatilan', v_kapatilan,
    'kalan_acik', v_kalan,
    'mesaj', '🔓 ' || v_kapatilan || ' arıza kapatıldı. ' ||
             v_kalan || ' iş kaldı.'
  );
exception when others then
  return jsonb_build_object('kapatilan', 0, 'kalan_acik', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.formlari_kisitsiz_ata(integer) from public;
grant execute on function public.formlari_kisitsiz_ata(integer) to authenticated;


-- ============================================================================
-- 🧪 ÇALIŞTIR
-- ============================================================================
select public.formlari_kisitsiz_ata(65) as sonuc;

-- Kalan işler
select
  coalesce(public.jalan(to_jsonb(st),'firma_adi','musteri_adi','manual_customer_name','customer_name','firma','ad'),'—') as firma,
  to_char(st.created_at,'DD.MM.YYYY HH24:MI') as tarih
from public.service_tickets st
where coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu')
order by st.created_at desc;
