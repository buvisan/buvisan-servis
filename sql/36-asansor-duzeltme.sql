-- ============================================================================
--  🔧 ASANSÖR DÜZELTMESİ — neden 0 çıktı?
-- ----------------------------------------------------------------------------
--  SORUN:
--    "alter table ... add column makine_tipi text default 'Vinç'"
--    komutu TÜM mevcut kayıtları 'Vinç' olarak doldurdu.
--    Sonraki güncelleme "where makine_tipi = '' (boş olanlar)" dediği için
--    HİÇBİR kaydı yakalayamadı → asansör işi 0 göründü.
--
--    Aynı tuzak tetikleyicide de var: varsayılan değer tetikleyiciden ÖNCE
--    uygulandığı için "boşsa sınıflandır" kontrolü hiç çalışmıyor.
--
--  ÇÖZÜM:
--    • Mevcut kayıtlar DESENE GÖRE yeniden sınıflandırılır (idempotent)
--    • Tetikleyici 'Vinç' veya boş olan her durumda çalışır
--
--  ⚠️ Veri silmez. Sadece makine_tipi alanını DOĞRU doldurur.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) MEVCUT KAYITLARI DESENE GÖRE YENİDEN SINIFLANDIR
--    (kapasite / açıklama / iş türü / malzeme metninde "asansör" geçiyorsa)
-- ============================================================================
update public.completed_services
   set makine_tipi = 'Asansör'
 where public.parca_adi_normal(crane_capacity) like '%asansor%'
    or public.parca_adi_normal(description)    like '%asansor%'
    or public.parca_adi_normal(service_type)   like '%asansor%'
    or public.parca_adi_normal(materials_text) like '%asansor%';

-- Asansör desenine UYMAYANLAR vinç kalır (varsayılan zaten 'Vinç')
update public.completed_services
   set makine_tipi = 'Vinç'
 where coalesce(trim(makine_tipi), '') = '';


-- ============================================================================
-- 2) TETİKLEYİCİYİ DÜZELT ('Vinç' veya boşsa yeniden sınıflandır)
-- ============================================================================
create or replace function public.makine_tipi_etiketi()
returns trigger
language plpgsql
as $$
begin
  -- ⚠️ Varsayılan değer tetikleyiciden ÖNCE uygulanır → 'Vinç' de kontrol edilir
  if coalesce(trim(new.makine_tipi), '') in ('', 'Vinç') then
    new.makine_tipi := case
      when public.parca_adi_normal(new.crane_capacity) like '%asansor%'
        or public.parca_adi_normal(new.description)    like '%asansor%'
        or public.parca_adi_normal(new.service_type)   like '%asansor%'
        or public.parca_adi_normal(new.materials_text) like '%asansor%'
      then 'Asansör'
      else 'Vinç'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_makine_tipi_etiketi on public.completed_services;
create trigger trg_makine_tipi_etiketi
  before insert or update on public.completed_services
  for each row execute function public.makine_tipi_etiketi();


-- ============================================================================
-- 3) VİNÇ FİLOSUNDA DA AYNI DÜZELTME (model adına göre)
-- ============================================================================
update public.cranes
   set makine_tipi = 'Asansör'
 where public.parca_adi_normal(model_name) like '%asansor%'
    or public.parca_adi_normal(model_name) like '%elevator%';


-- ============================================================================
-- 4) KONTROL — ARTIK DOĞRU RAKAMLARI GÖRMELİSİN
-- ============================================================================
select
  (public.makine_tipi_ozeti() ->> 'servis_asansor')           as asansor_isi,
  (public.makine_tipi_ozeti() ->> 'asansor_ciro')             as asansor_cirosu,
  (public.makine_tipi_ozeti() ->> 'asansor_musteri')          as asansor_musterisi,
  (public.makine_tipi_ozeti() ->> 'asansor_cesidi')           as farkli_asansor,
  (public.makine_tipi_ozeti() ->> 'en_buyuk_asansor_musteri') as en_buyuk;

-- Asansör müşterileri
select musteri, asansor_cesidi, servis_sayisi, toplam_tutar, gecen_gun, abonelik_6ay
from public.asansor_musterileri()
limit 15;
