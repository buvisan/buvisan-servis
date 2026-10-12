-- ============================================================================
--  BUVISAN - SAHA RAPORU GÜÇLENDİRME (FAZ 2)
-- ----------------------------------------------------------------------------
--  Saha raporuna şunları ekler:
--    medya_urls      -> iş öncesi/sonrası fotoğraf ve videolar
--    imza_url        -> müşterinin parmakla attığı imza görseli
--    imza_atan       -> imzayı atan müşteri yetkilisinin adı
--    lat / lng       -> işin yapıldığı konum (canlı harita ile uyumlu)
--    sure_dakika     -> sahada geçen süre (dakika)
--    malzeme_tutari  -> raporda kullanılan parçaların toplam satış tutarı
--
--  ⚠️ SADECE YENİ KOLON EKLER. Mevcut kolonlar, veriler ve kayıtlar DEĞİŞMEZ.
--     Yeni kolonlar boş gelebilir; eski raporlar etkilenmez.
--
--  KULLANIM: Supabase -> SQL Editor -> New query -> tamamini yapistir -> RUN
-- ============================================================================

alter table public.service_reports
  add column if not exists medya_urls     jsonb   default '[]'::jsonb,
  add column if not exists imza_url       text,
  add column if not exists imza_atan      text,
  add column if not exists lat            double precision,
  add column if not exists lng            double precision,
  add column if not exists sure_dakika    integer,
  add column if not exists malzeme_tutari numeric default 0;

-- Rapor geçmişi sorguları hızlansın (personel adı ve tarih)
create index if not exists service_reports_created_idx  on public.service_reports (created_at desc);
create index if not exists service_reports_personel_idx on public.service_reports (personel_adi);

-- ----------------------------------------------------------------------------
-- KONTROL: kolonlar yerinde mi?
-- ----------------------------------------------------------------------------
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'service_reports'
  and column_name in ('medya_urls','imza_url','imza_atan','lat','lng','sure_dakika','malzeme_tutari')
order by column_name;
