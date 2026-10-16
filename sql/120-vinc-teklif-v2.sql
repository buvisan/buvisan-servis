-- ============================================================================
--  📋 VİNÇ ABONELİK TEKLİFİ v2 — TAM KONTROL LİSTESİ (Güncelleme #92)
-- ----------------------------------------------------------------------------
--  EKLENENLER:
--    • 22 maddelik PERİYODİK KONTROL LİSTESİ
--    • ⚠️ ÖNEMLİ NOT: Kontrol sonrası arızalar AYRI ücretlendirilir
--    • Periyot bilgisi (6 ay / 12 ay)
--    • Kapsam dışı hizmetler açıkça yazılı
--
--  KULLANIM: 119'dan SONRA çalıştır. Hata vermez.
-- ============================================================================

create or replace function public.vinc_teklif_metni(
  p_musteri text,
  p_makine_sayisi integer default null,
  p_periyot_ay integer default 6
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_adet integer := greatest(1, coalesce(p_makine_sayisi, 1));
  v_birim numeric;
  v_toplam numeric;
  v_liste text;
begin
  -- Filo indirimi (vinç fiyatları)
  v_birim := case
    when v_adet >= 25 then 3500
    when v_adet >= 16 then 4000
    when v_adet >= 10 then 4500
    when v_adet >= 7  then 5000
    when v_adet >= 4  then 6500
    when v_adet >= 2  then 7500
    else 9500 end;
  v_toplam := v_birim * v_adet;

  -- 22 MADDELİK PERİYODİK KONTROL LİSTESİ
  v_liste :=
    '1.  Fren fonksiyon kontrol ve bakımları' || E'\n' ||
    '2.  Limit şalter fonksiyon kontrol ve bakımı' || E'\n' ||
    '3.  Halat hasarı, lif kontrol ve bakımları' || E'\n' ||
    '4.  Yağlama ve seviye tespit kontrol ve bakımları' || E'\n' ||
    '5.  Yağ keçelerinin sızdırmazlık kontrol ve bakımları' || E'\n' ||
    '6.  Bağlantı cıvataları, kaynak kontrol ve bakımları' || E'\n' ||
    '7.  Kiriş ve kaldırma makinası sistemlerinin kontrol ve bakımları' || E'\n' ||
    '8.  Yürüyüş takımı sistemlerinin kontrol ve bakımları' || E'\n' ||
    '9.  Kanca bloğu ve çatlak kontrol bakımları' || E'\n' ||
    '10. Halat kılavuzu kontrol ve bakımları' || E'\n' ||
    '11. Kumanda panosu genel kontrol ve bakımları' || E'\n' ||
    '12. Enerji alma sistemleri kontrol ve bakımları' || E'\n' ||
    '13. Enerji taşıma sistemleri kontrol ve bakımları' || E'\n' ||
    '14. Bara ve bara ekipmanları kontrol ve bakımları' || E'\n' ||
    '15. Kablo ve enerji taşıyıcı sistemlerin kontrol ve bakımları' || E'\n' ||
    '16. Durdurucu tampon kontrol ve bakımları' || E'\n' ||
    '17. Çelik konstrüksiyon çatlak kontrol ve bakımları' || E'\n' ||
    '18. Uyarı levha kontrolleri' || E'\n' ||
    '19. Kumanda tuş butonları kontrol ve bakımları' || E'\n' ||
    '20. Tambur, makara blokları kontrol ve emniyeti' || E'\n' ||
    '21. Vinç alt ve üst sınırlayıcı kontrol ve bakımları' || E'\n' ||
    '22. Vinç çalışma esnasında ses ve lamba ikaz kontrol ve bakımları';

  return
    'Sayın ' || coalesce(p_musteri,'Yetkili') || ',' || E'\n\n' ||
    'Vinçlerinizin periyodik bakımını ' || p_periyot_ay || ' aylık abonelik paketiyle güvence altına alıyoruz.' || E'\n\n' ||
    '📦 PAKET İÇERİĞİ — PERİYODİK KONTROL LİSTESİ' || E'\n' ||
    v_liste || E'\n\n' ||
    '⚠️ ÖNEMLİ — KAPSAM DIŞI' || E'\n' ||
    'Bu paket, yukarıdaki KONTROL ve BAKIM hizmetlerini kapsar.' || E'\n' ||
    'Kontrol sırasında tespit edilen ARIZALARIN ONARIMI ve' || E'\n' ||
    'değişmesi gereken PARÇA bedelleri pakete DAHİL DEĞİLDİR;' || E'\n' ||
    'ayrıca fiyatlandırılır ve onayınız alınarak yapılır.' || E'\n\n' ||
    '💰 FİYAT' || E'\n' ||
    case when v_adet > 1
      then '• Makine başı: ' || to_char(v_birim,'FM999G999') || ' ₺ (filo indirimi uygulandı)' || E'\n' ||
           '• ' || v_adet || ' makine toplam: ' || to_char(v_toplam,'FM999G999') || ' ₺'
      else '• Makine başı: ' || to_char(v_birim,'FM999G999') || ' ₺' end || E'\n' ||
    '• Ödeme: ' || p_periyot_ay || ' aylık dönem' || E'\n' ||
    '• Fiyatlara KDV dahil değildir' || E'\n\n' ||
    '✅ AVANTAJLAR' || E'\n' ||
    '• Arıza kaynaklı duruşlar azalır' || E'\n' ||
    '• Acil müdahaleye öncelik tanınır' || E'\n' ||
    '• Yasal periyodik kontrol yükümlülüğü karşılanır' || E'\n' ||
    '• Bakım kayıtları düzenli tutulur' || E'\n\n' ||
    '📞 Detaylı bilgi ve sözleşme için bize ulaşabilirsiniz.' || E'\n\n' ||
    'BUVİSAN VİNÇ SERVİS';
end $$;

revoke all on function public.vinc_teklif_metni(text, integer, integer) from public;
grant execute on function public.vinc_teklif_metni(text, integer, integer) to authenticated;


-- ============================================================================
-- 🧪 TEST — 5 makineli müşteri örneği
-- ============================================================================
select public.vinc_teklif_metni('ÖRNEK MÜŞTERİ', 5, 6) as teklif_ornegi;
