-- ============================================================================
--  🔐 QR SAYFASI GÜVENLİ ERİŞİM FONKSİYONU
-- ----------------------------------------------------------------------------
--  SORUN:
--    Müşteri, vinçteki QR kodu okuttuğunda sayfa şu isteği yapıyordu:
--        cranes?select=*,service_tickets(*)
--    Bu istek 288 vincin ve 129 iş emrinin TÜM alanlarını (müşteri adı, adres,
--    telefon, iç notlar) tarayıcıya indiriyordu. Üstelik sayfa yalnızca
--    BİR vinci göstermesi gerekirken tüm veri açığa çıkıyordu.
--
--  ÇÖZÜM:
--    Sayfa artık sadece kendi vincini, sadece GÜVENLİ alanlarıyla ister.
--    QR ADRESİ DEĞİŞMEZ:  https://servis.buvisan.com/vinc/<kimlik>
--
--  ⚠️ Bu fonksiyon SADECE OKUR. Veri değiştirmez, silmez.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================

create or replace function public.vinc_kimlik(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    -- Vinç: yalnızca sahada/müşteride görünmesi gereken alanlar
    'vinc', (
      select jsonb_build_object(
        'id',             c.id,
        'model_name',     c.model_name,
        'serial_number',  c.serial_number,
        'capacity',       c.capacity,
        'lifting_height', c.lifting_height,
        'customer_name',  c.customer_name,
        'location_address', c.location_address,
        'pdf_url',   c.pdf_url,
        'pdf_url_2', c.pdf_url_2,
        'pdf_url_3', c.pdf_url_3,
        'pdf_url_4', c.pdf_url_4,
        'lat', c.lat,
        'lng', c.lng
      )
      from public.cranes c
      where c.id = p_id
    ),

    -- Servis geçmişi: sadece gösterilen alanlar
    'gecmis', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',              h.id,
          'event_type',      h.event_type,
          'title',           h.title,
          'description',     h.description,
          'created_at',      h.created_at,
          'technician_name', h.technician_name
        )
        order by h.created_at desc
      )
      from public.crane_history h
      where h.crane_id = p_id
    ), '[]'::jsonb),

    -- Sohbet için: bu vincin DEVAM EDEN iş emri var mı? (yoksa null)
    -- İç notlar, ücretler, ekip bilgisi ASLA dönmez; sadece kimlik.
    'acik_bilet_id', (
      select t.id
      from public.service_tickets t
      where t.crane_id = p_id
        and coalesce(t.status, '') <> 'tamamlandi'
      order by t.created_at desc
      limit 1
    )
  );
$$;

-- Müşteri (girişsiz) ve personel çağırabilsin
revoke all on function public.vinc_kimlik(uuid) from public;
grant execute on function public.vinc_kimlik(uuid) to anon, authenticated;


-- ============================================================================
-- KONTROL: fonksiyon hazır mı? Örnek bir vinçle deneme
-- ============================================================================
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'vinc_kimlik') as fonksiyon_hazir,

  (select jsonb_pretty(public.vinc_kimlik(
      (select id from public.cranes order by created_at desc limit 1)
  ))) as ornek_cikti;
