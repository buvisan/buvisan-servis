-- ============================================================================
--  📅 BAKIM HATIRLATMA MESAJI (Güncelleme #15)
-- ----------------------------------------------------------------------------
--  SENİN İSTEĞİN:
--    "Admin panelindeki bakım fırsatları kartına da asansörlerdeki gibi
--     otomatik kopyala-yapıştır mesajı çıkartan sistem yapalım."
--
--  MANTIK:
--    Bakım Fırsatları kartındaki her müşteri için, makinesinin bakımının
--    GECİKTİĞİNİ nazikçe hatırlatan + abonelik teklifini içeren hazır mesaj.
--
--  ⚠️ Sadece fonksiyon kurar. Veri değiştirmez.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================

create or replace function public.bakim_hatirlatma_metni(
  p_musteri     text,
  p_periyot_ay  integer default 6
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_m        jsonb;
  v_hesap    jsonb;
  v_metin    text;
  v_gun      integer;
  v_ay       integer;
  v_makine   text;
  v_son      date;
  v_adet     integer;
begin
  v_m  := public.musteri_makine_sayisi(p_musteri);
  v_son := (v_m ->> 'son_servis')::date;
  v_gun := case when v_son is null then null else (current_date - v_son)::int end;
  v_ay  := case when v_gun is null then null else greatest(v_gun / 30, 0) end;

  v_adet := greatest(
    coalesce((v_m ->> 'filo_asansor')::int, 0) + coalesce((v_m ->> 'filo_vinc')::int, 0),
    coalesce((v_m ->> 'servis_asansor')::int, 0),
    1
  );

  v_hesap := public.abonelik_teklifi(v_adet, p_periyot_ay, 0);
  if not coalesce((v_hesap ->> 'ok')::boolean, false) then
    return 'Teklif hesaplanamadı: ' || coalesce(v_hesap ->> 'mesaj', 'bilinmeyen hata');
  end if;

  v_makine := case
    when coalesce((v_m ->> 'filo_asansor')::int, 0) > 0 and coalesce((v_m ->> 'filo_vinc')::int, 0) > 0
      then (v_m ->> 'filo_asansor') || ' asansörünüz ve ' || (v_m ->> 'filo_vinc') || ' vinciniz'
    when coalesce((v_m ->> 'filo_asansor')::int, 0) > 0
      then (v_m ->> 'filo_asansor') || ' adet asansörünüz'
    when coalesce((v_m ->> 'filo_vinc')::int, 0) > 0
      then (v_m ->> 'filo_vinc') || ' adet vinciniz'
    else 'makineniz'
  end;

  v_metin := 'Sayın ' || p_musteri || ',' || E'\n\n';

  -- Gecikme varsa nazik hatırlatma
  if v_gun is not null and v_gun >= 150 then
    v_metin := v_metin ||
      'Tesisinizdeki ' || v_makine || ' için son servisimiz ' ||
      to_char(v_son, 'DD.MM.YYYY') || ' tarihindeydi (' || v_ay || ' ay önce).' || E'\n' ||
      'Periyodik bakım zamanı geçmiş görünüyor.' || E'\n\n';
  elsif v_gun is not null then
    v_metin := v_metin ||
      'Tesisinizdeki ' || v_makine || ' için son servisimiz ' ||
      to_char(v_son, 'DD.MM.YYYY') || ' tarihindeydi.' || E'\n' ||
      'Periyodik bakım zamanı yaklaşıyor.' || E'\n\n';
  else
    v_metin := v_metin ||
      'Tesisinizdeki ' || v_makine || ' için periyodik bakım hizmetimizi hatırlatmak isteriz.' || E'\n\n';
  end if;

  v_metin := v_metin ||
    '📋 ÖNERİMİZ: ' || (v_hesap ->> 'paket') || E'\n' ||
    '• Yılda ' || (v_hesap ->> 'yillik_bakim_adedi') || ' periyodik bakım' || E'\n' ||
    '• Toplam bakım: ' || (v_hesap ->> 'yillik_bakim_toplam') || ' adet/yıl' || E'\n\n' ||
    '💰 FİYATLANDIRMA' || E'\n' ||
    '• Liste fiyatı: ' || to_char((v_hesap ->> 'liste_birim_fiyat')::numeric, 'FM999G999') || ' ₺/makine' || E'\n';

  if coalesce((v_hesap ->> 'kademe_indirimi')::numeric, 0) > 0 then
    v_metin := v_metin ||
      '• 🎁 FİLO İNDİRİMİ (' || (v_hesap ->> 'kademe') || '): ' ||
        to_char((v_hesap ->> 'makine_birim_fiyat')::numeric, 'FM999G999') || ' ₺/makine (-%' ||
        (v_hesap ->> 'kademe_indirim_yuzde') || ')' || E'\n';
  else
    v_metin := v_metin ||
      '• Makine başı: ' || to_char((v_hesap ->> 'makine_birim_fiyat')::numeric, 'FM999G999') || ' ₺' || E'\n';
  end if;

  v_metin := v_metin ||
    '🧾 KDV dahil toplam: ' || to_char((v_hesap ->> 'genel_toplam')::numeric, 'FM999G999G999') || ' ₺' || E'\n' ||
    '📅 Aylık eşdeğer: ' || to_char((v_hesap ->> 'aylik_esdeger')::numeric, 'FM999G999G999') || ' ₺' || E'\n\n' ||
    'ANLAŞMA KAPSAMI:' || E'\n' ||
    '✓ Planlanmış tarihlerde periyodik bakım' || E'\n' ||
    '✓ Acil servis önceliği' || E'\n' ||
    '✓ Her bakım sonrası detaylı rapor' || E'\n' ||
    '✓ Arıza öncesi tespit ve bilgilendirme' || E'\n\n' ||
    'Düzenli bakım sayesinde makineniz arıza yapmadan kontrol edilir;' || E'\n' ||
    'üretim duruşu ve acil müdahale maliyeti ortadan kalkar.' || E'\n\n' ||
    'Uygun bir zamanda görüşmek üzere,' || E'\n\n' ||
    'BUVİSAN VİNÇ SERVİS';

  return v_metin;
end;
$$;

revoke all on function public.bakim_hatirlatma_metni(text, integer) from public;
grant execute on function public.bakim_hatirlatma_metni(text, integer) to authenticated;


-- ============================================================================
-- KONTROL — örnek mesaj
-- ============================================================================
select public.bakim_hatirlatma_metni(
  coalesce((select musteri from public.abonelik_aday_musteriler() limit 1), 'ÖRNEK FİRMA'),
  6
) as ornek_mesaj;
