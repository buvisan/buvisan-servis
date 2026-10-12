-- ============================================================================
--  🛡️ QR KORUMA KALKANI
-- ----------------------------------------------------------------------------
--  NEDEN?
--    Bastırılmış QR kodlarının içinde şu adres var:
--        https://servis.buvisan.com/vinc/<vincin-kimliği>
--    Yani QR kodun ömrü, vincin KİMLİK NUMARASINA (UUID) bağlıdır.
--    Kimlik değişirse veya kayıt silinip yeniden oluşturulursa
--    O QR KOD ÖLÜR → bastırılan etiket çöp olur.
--
--  NE YAPAR?
--    1) Vincin kimlik numarasının DEĞİŞTİRİLMESİNİ veritabanı seviyesinde yasaklar.
--    2) Vinç kaydının SİLİNMESİNİ yasaklar (yanlışlıkla silme = QR çöp).
--
--  ⚠️ Bu kalkan SADECE vinç tablosunu korur. Başka hiçbir şeye dokunmaz.
--  ⚠️ Veri silmez/değiştirmez, sadece yanlış işlemi engeller.
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) KİMLİK DEĞİŞİKLİĞİNİ YASAKLA
-- ============================================================================
create or replace function public.vinc_kimlik_koru()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id then
    raise exception
      'QR KORUMASI: Vinç kimliği değiştirilemez. Basılmış QR kodları bu kimliğe bağlıdır. (Eski: % / Yeni: %)',
      old.id, new.id
      using hint = 'Vinç bilgilerini düzenleyebilirsiniz; kimlik asla değişmemeli.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vinc_kimlik_koru on public.cranes;
create trigger trg_vinc_kimlik_koru
  before update on public.cranes
  for each row execute function public.vinc_kimlik_koru();


-- ============================================================================
-- 2) YANLIŞLIKLA SİLMEYİ YASAKLA
--    Vinç satıldı/hurdaya çıktı diye silmek isterseniz: silmeyin,
--    düzenleyip müşteri adını "SATILDI / HURDA" yazın.
--    QR etiketi hâlâ o makinenin kimliği olarak kalır.
-- ============================================================================
create or replace function public.vinc_silme_koru()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'QR KORUMASI: Vinç kaydı silinemez. Basılmış QR kodu bu kimliğe bağlıdır.'
    using hint = 'Kaydı düzenleyerek pasife alabilirsiniz (örn. müşteri adına "SATILDI" yazın).';
end;
$$;

drop trigger if exists trg_vinc_silme_koru on public.cranes;
create trigger trg_vinc_silme_koru
  before delete on public.cranes
  for each row execute function public.vinc_silme_koru();


-- ============================================================================
-- 3) KONTROL: kalkanlar aktif mi + kaç vinç koruma altında?
-- ============================================================================
select
  (select count(*) from pg_trigger
    where tgname in ('trg_vinc_kimlik_koru','trg_vinc_silme_koru')
      and not tgisinternal)                     as aktif_kalkan_sayisi,
  (select count(*) from public.cranes)          as korunan_vinc_sayisi,
  (select count(*) from public.cranes where lat is null or lng is null) as konumu_eksik_vinc,
  'Beklenen: kalkan 2, korunan vinç = toplam vinç' as aciklama;
