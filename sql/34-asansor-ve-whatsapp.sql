-- ============================================================================
--  🏢 ASANSÖR ENTEGRASYONU + 📱 WHATSAPP MESAJ MOTORU (Güncelleme #10)
-- ----------------------------------------------------------------------------
--  SENİN İSTEKLERİN:
--    1) "Bütün sisteme asansörleri entegre edelim"
--       → 64 asansör servisi var ama filo kaydında görünmüyor.
--         Filo kaydına MAKİNE TİPİ (Vinç / Asansör) eklenir.
--    2) "Takip linkini WhatsApp'tan elle atarım, hazır mesaj metni üret"
--       → takip_mesaji() fonksiyonu kopyala-yapıştır mesaj üretir.
--
--  ⚠️ Sadece YENİ SÜTUN ekler (makine_tipi). Veri silmez.
--     Mevcut vinç kayıtları 'Vinç' olarak işaretlenir.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) MAKİNE TİPİ SÜTUNU (Vinç / Asansör / Diğer)
-- ============================================================================
alter table public.cranes
  add column if not exists makine_tipi text default 'Vinç';

create index if not exists idx_cranes_makine_tipi on public.cranes (makine_tipi);

comment on column public.cranes.makine_tipi is 'Makine tipi: Vinç / Asansör / Diğer (QR ve bakım motoru bunu kullanır)';

-- Model adında "asansör" geçen kayıtları otomatik sınıflandır (sadece boş/varsayılan olanlar)
update public.cranes
   set makine_tipi = 'Asansör'
 where coalesce(makine_tipi, 'Vinç') = 'Vinç'
   and (
     public.parca_adi_normal(model_name) like '%asansor%'
     or public.parca_adi_normal(model_name) like '%asansör%'
     or public.parca_adi_normal(model_name) like '%elevator%'
   );


-- ============================================================================
-- 2) MAKİNE TİPİ ÖZETİ (filo dağılımı)
-- ============================================================================
create or replace function public.makine_tipi_ozeti()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with v as (select * from public.cranes)
  select jsonb_build_object(
    'toplam',        (select count(*) from v),
    'vinc',          (select count(*) from v where coalesce(makine_tipi,'Vinç') = 'Vinç'),
    'asansor',       (select count(*) from v where makine_tipi = 'Asansör'),
    'diger',         (select count(*) from v where makine_tipi not in ('Vinç','Asansör')),
    'asansor_musteri',(select count(distinct public.parca_adi_normal(customer_name))
                        from v where makine_tipi = 'Asansör'),
    'asansor_servisi',(select count(*) from public.completed_services cs
                        where public.parca_adi_normal(cs.description) like '%asansor%'
                           or public.parca_adi_normal(cs.service_type) like '%asansor%')
  );
$$;

revoke all on function public.makine_tipi_ozeti() from public;
grant execute on function public.makine_tipi_ozeti() to authenticated;


-- ============================================================================
-- 3) TİP GÜNCELLE (ofis bir kaydı vinç/asansör yapabilsin)
-- ============================================================================
create or replace function public.makine_tipi_ayarla(p_crane_id uuid, p_tip text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tip not in ('Vinç','Asansör','Diğer') then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçersiz tip. Vinç / Asansör / Diğer olmalı.');
  end if;

  update public.cranes set makine_tipi = p_tip where id = p_crane_id;
  if not found then
    return jsonb_build_object('ok', false, 'mesaj', 'Vinç kaydı bulunamadı.');
  end if;

  return jsonb_build_object('ok', true, 'mesaj', 'Makine tipi güncellendi: ' || p_tip);
end;
$$;

revoke all on function public.makine_tipi_ayarla(uuid, text) from public;
grant execute on function public.makine_tipi_ayarla(uuid, text) to authenticated;


-- ============================================================================
-- 4) WHATSAPP HAZIR MESAJ METNİ (kopyala-yapıştır)
--    Duruma göre otomatik metin üretir.
-- ============================================================================
create or replace function public.takip_mesaji(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t record;
  v_saat text;
  v_metin text;
begin
  select * into t from public.is_takip where id = p_id;
  if t.id is null then
    return 'Takip kaydı bulunamadı.';
  end if;

  v_saat := case when t.tahmini_varis is not null
                 then to_char(t.tahmini_varis at time zone 'Europe/Istanbul', 'HH24:MI')
                 else null end;

  v_metin := 'Sayın ' || coalesce(t.musteri, 'Müşterimiz') || ',' || E'\n\n';

  v_metin := v_metin || case t.durum
    when 'PLANLANDI' then
      'Servis talebiniz planlanmıştır.' ||
      case when t.teknisyen is not null then E'\n' || 'Görevli teknisyen: ' || t.teknisyen else '' end
    when 'YOLDA' then
      'Teknisyenimiz' ||
      case when t.teknisyen is not null then ' (' || t.teknisyen || ')' else '' end ||
      ' servis için yola çıkmıştır.' ||
      case when v_saat is not null then E'\n' || 'Tahmini varış saatimiz: ' || v_saat else '' end
    when 'VARDI' then
      'Teknisyenimiz adresinize ulaşmıştır.'
    when 'CALISIYOR' then
      'Makinenizde çalışma devam etmektedir.'
    when 'BITTI' then
      'Servis işleminiz tamamlanmıştır. Bizi tercih ettiğiniz için teşekkür ederiz.'
    when 'IPTAL' then
      'Servis kaydınız iptal edilmiştir. Bilgi için bize ulaşabilirsiniz.'
    else 'Servis kaydınız güncellenmiştir.'
  end;

  if t.durum not in ('BITTI','IPTAL') then
    v_metin := v_metin || E'\n\n' || '📱 Canlı takip: https://servis.buvisan.com/takip/' || t.id::text;
    v_metin := v_metin || E'\n' || '(Bu sayfadan teknisyenin durumunu ve tahmini varış saatini görebilirsiniz.)';
  end if;

  if coalesce(trim(t.musteri_notu), '') <> '' then
    v_metin := v_metin || E'\n\n' || 'ℹ️ ' || t.musteri_notu;
  end if;

  v_metin := v_metin || E'\n\n' || 'BUVİSAN VİNÇ SERVİS';

  return v_metin;
end;
$$;

revoke all on function public.takip_mesaji(uuid) from public;
grant execute on function public.takip_mesaji(uuid) to authenticated;


-- ============================================================================
-- 5) AKTİF TAKİPLER (ofis ekranı için)
-- ============================================================================
create or replace function public.aktif_takipler()
returns table (
  id            uuid,
  musteri       text,
  teknisyen     text,
  vinc_bilgi    text,
  durum         text,
  tahmini_varis timestamptz,
  link          text,
  guncelleme    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id, t.musteri, t.teknisyen, t.vinc_bilgi, t.durum, t.tahmini_varis,
    'https://servis.buvisan.com/takip/' || t.id::text,
    t.guncelleme
  from public.is_takip t
  where t.durum not in ('BITTI','IPTAL')
  order by t.guncelleme desc;
$$;

revoke all on function public.aktif_takipler() from public;
grant execute on function public.aktif_takipler() to authenticated;


-- ============================================================================
-- 6) KONTROL
-- ============================================================================
select
  (public.makine_tipi_ozeti() ->> 'toplam')          as toplam_kayit,
  (public.makine_tipi_ozeti() ->> 'vinc')            as vinc,
  (public.makine_tipi_ozeti() ->> 'asansor')         as asansor,
  (public.makine_tipi_ozeti() ->> 'asansor_servisi') as asansor_servis_kaydi;

-- Mastar: makine tipi dağılımı
select coalesce(makine_tipi, 'Vinç') as tip, count(*) as adet
from public.cranes
group by 1
order by 2 desc;
