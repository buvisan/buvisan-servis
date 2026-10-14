-- ============================================================================
--  📄 TEKLİF MOTORU v2 — GERÇEK VERİYE UYGUN (Güncelleme #43)
-- ----------------------------------------------------------------------------
--  BULGU (senin gönderdiğin veri):
--    • "Periyodik Bakım" sadece 2 kayıt, son 90 günde 0
--    • İşlerin %92'si düz "Servis" olarak kaydedilmiş (547 kayıt)
--    → Sistem periyodik kontrolü VERİDEN ayırt EDEMİYOR
--
--  ÇÖZÜM (3 katman):
--    1) OTOMATİK: Arıza içeren TÜM işler taranır (tür ne olursa olsun)
--       → açıklamada arıza kelimesi geçen işler teklif adayıdır
--    2) ETİKETLEME: "Periyodik Bakım" türü kullanılırsa otomatik yakalanır
--    3) ELLE: Personel raporda "TEKLİF GEREKLİ" işaretler (en güvenilir)
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) TARAMA v2 — arıza içeren tüm işler (tür bağımsız) + 180 gün
-- ============================================================================
create or replace function public.teklif_bekleyen_tara()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eklenen integer := 0;
begin
  insert into public.teklif_bekleyenler
    (musteri_adi, kaynak, ariza_ozeti, tespit_tarihi, is_emri_no, olusturan)
  select
    -- Müşteri adı: tabloda hangi sütun varsa onu kullan (dinamik)
    coalesce(
      nullif(trim(coalesce(to_jsonb(cs) ->> 'customer_name', '')), ''),
      nullif(trim(coalesce(to_jsonb(cs) ->> 'firm_name', '')), ''),
      nullif(trim(coalesce(to_jsonb(cs) ->> 'customer', '')), ''),
      nullif(trim(coalesce(to_jsonb(cs) ->> 'company_name', '')), ''),
      'Müşteri belirtilmemiş'
    ),
    case
      when coalesce(cs.service_type, '') ilike '%periyodik%' then 'tek_seferlik'
      when coalesce(cs.service_type, '') ilike '%garanti%'   then 'garanti'
      else 'servis_ariza'
    end,
    coalesce(nullif(trim(coalesce(cs.description, '')), ''),
             nullif(trim(coalesce(to_jsonb(cs) ->> 'materials_text', '')), ''),
             'Arıza tespit edildi'),
    coalesce(cs.service_date::date, current_date),
    cs.id::text,
    'otomatik tarama'
  from public.completed_services cs
  where cs.service_date::date > current_date - 180
    and coalesce(trim(cs.description), '') <> ''
    -- ARİZA İÇEREN İŞLER (tür ne olursa olsun)
    and (
      coalesce(cs.service_type, '') ilike '%periyodik%'
      or coalesce(cs.description, '') ~* '(ar[ıi]za|bozuk|de[ğg]i[şs]meli|de[ğg]i[şs]ecek|ka[çc]ak|çalışmıyor|calismiyor|titreme|ses geliyor|ya[ğg] eksik|a[şs][ıi]nm[ıi][şs]|patlak|k[ıi]r[ıi]k|tamir edilmeli|yenilenmeli|bak[ıi]m gerek|problem|sorun)'
    )
    -- Zaten listede değil
    and not exists (
      select 1 from public.teklif_bekleyenler tb
      where tb.is_emri_no = cs.id::text
    )
  on conflict do nothing;

  get diagnostics v_eklenen = row_count;
  return v_eklenen;
end $$;

revoke all on function public.teklif_bekleyen_tara() from public;
grant execute on function public.teklif_bekleyen_tara() to authenticated;


-- ============================================================================
-- 2) SERVİS TÜRÜ SEÇENEKLERİ (personel doğru türü seçsin)
--    → "Periyodik Kontrol" seçilirse otomatik yakalanır
-- ============================================================================
create table if not exists public.servis_turleri (
  id      serial primary key,
  tur     text not null unique,
  aktif   boolean default true,
  sira    integer default 100
);

insert into public.servis_turleri (tur, sira) values
  ('Servis',                     10),
  ('Periyodik Bakım',            20),
  ('Periyodik Kontrol',          25),
  ('Montaj',                     30),
  ('Garanti',                    40),
  ('Garanti (ZM METAL)',         45),
  ('Yarım Kalan İş',             50),
  ('Diğer',                      90)
on conflict (tur) do nothing;


-- ============================================================================
-- 3) TARAMAYI ÇALIŞTIR — kaç iş bulundu?
-- ============================================================================
select public.teklif_bekleyen_tara() as bulunan_yeni_is;


-- ============================================================================
-- 4) KONTROL — teklif bekleyenler
-- ============================================================================
select * from public.teklif_bekleyen_listesi('BEKLIYOR') limit 30;


-- ============================================================================
-- 5) ÖZET
-- ============================================================================
select
  (select count(*) from public.teklif_bekleyenler where durum = 'BEKLIYOR')      as bekleyen,
  (select count(*) from public.teklif_bekleyenler where kaynak = 'tek_seferlik')as periyodik,
  (select count(*) from public.teklif_bekleyenler where kaynak = 'garanti')     as garanti,
  (select count(*) from public.teklif_bekleyenler where kaynak = 'servis_ariza')as servis_ariza,
  (select count(*) from public.teklif_bekleyenler where kaynak = 'manuel')      as elle_isaret;
