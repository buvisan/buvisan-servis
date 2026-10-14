-- ============================================================================
--  ⚙️ ASİSTAN AYARLARI + VERİ TEMİZLİĞİ (Güncelleme #46)
-- ----------------------------------------------------------------------------
--  SENİN GERİ BİLDİRİMİN:
--    1) "Müşteri belirtilmemiş" diye mesaj geldi → isimsiz kayıt var
--    2) 5 dakikada bir gelmiyor → tekrar aralığı 15 dk + tek konu
--    3) "bütün raporları 1 saatte bir atsın" → özet 2 saatte birdi
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) AYARLAR — 1 saatte özet, 4 dakikada tekrar
-- ============================================================================
update public.asistan_ayar set deger = '1' where anahtar = 'ozet_saat';
update public.asistan_ayar set deger = '4' where anahtar = 'tekrar_dk';

insert into public.asistan_ayar (anahtar, deger, aciklama) values
  ('ozet_saat', '1', 'Özet kaç saatte bir'),
  ('tekrar_dk', '4', 'Aynı hatırlatmanın tekrar aralığı (dakika)')
on conflict (anahtar) do update set deger = excluded.deger;


-- ============================================================================
-- 2) İSİMSİZ KAYITLARI TEMİZLE
-- ============================================================================
-- 2a) Önce gerçek müşteri adını bul (iş emri numarasından)
update public.teklif_bekleyenler t
   set musteri_adi = coalesce(
         nullif(trim(coalesce(to_jsonb(cs) ->> 'customer_name', '')), ''),
         nullif(trim(coalesce(to_jsonb(cs) ->> 'firm_name', '')), ''),
         nullif(trim(coalesce(to_jsonb(cs) ->> 'customer', '')), ''),
         t.musteri_adi
       ),
       guncelleme = now()
from public.completed_services cs
where cs.id::text = t.is_emri_no
  and (t.musteri_adi = 'Müşteri belirtilmemiş' or coalesce(trim(t.musteri_adi), '') = '');

-- 2b) Hâlâ isimsiz kalanları KAPAT (hatırlatma anlamsız)
update public.teklif_bekleyenler
   set durum = 'GEREKMIYOR',
       teklif_notu = 'Kapatıldı — müşteri bilgisi bulunamadı',
       guncelleme = now()
 where durum = 'BEKLIYOR'
   and (musteri_adi = 'Müşteri belirtilmemiş' or coalesce(trim(musteri_adi), '') = '');

-- 2c) Boş/çok kısa açıklamaları da kapat
update public.teklif_bekleyenler
   set durum = 'GEREKMIYOR',
       teklif_notu = 'Kapatıldı — arıza açıklaması yetersiz',
       guncelleme = now()
 where durum = 'BEKLIYOR'
   and (coalesce(trim(ariza_ozeti), '') = '' or length(trim(ariza_ozeti)) < 10);


-- ============================================================================
-- 3) MESAJ ŞABLONLARI — kaynağa göre DOĞRU söz
--    (düz "Servis" işine "periyodik" demesin)
-- ============================================================================
create or replace function public.asistan_mesaj(
  p_anahtar text,
  p_baslik  text,
  p_adet    integer,
  p_detay   text
)
returns text
language plpgsql
immutable
as $$
declare
  v_sablonlar text[];
  v_secim integer;
  v_mesaj text;
begin
  v_sablonlar := case p_anahtar
    when 'teklif_bekleyen_is' then array[
      '📄 Kanka <b>%s işte</b> arıza tespit edilmiş. Müşteri teklif bekliyor olabilir, bir bak.',
      '🔧 <b>%s işten</b> arıza çıkmış kanka. Teklifi atsana, para bekliyor.',
      '💰 <b>%s iş</b> teklif bekliyor. Yapılan işin karşılığını alalım.',
      '📋 Kanka <b>%s müşteride</b> arıza bulunmuş. Teklif verilmezse unutulur gider.',
      '🛠️ <b>%s işte</b> yapılacak bir şeyler var. Teklif hazırlamayı unutma.'
    ]
    when 'kritik_talep' then array[
      '🔴 <b>%s KRİTİK talep</b> bekliyor kanka! Makine durmuş olabilir, hemen bak.',
      '🚨 <b>%s kritik servis</b> sırada! Müşteri bekliyor, bir el at.',
      '⚠️ <b>%s kritik iş</b> hâlâ açık. Bugün çözülmeli.',
      '🔔 Kanka <b>%s KRİTİK talep</b> var, atlanmasın!'
    ]
    when 'rapor_bekleyen' then array[
      '📝 <b>%s işin raporu</b> girilmemiş. Kaydetmeyi unutma, sonra karışır.',
      '✍️ <b>%s servis raporu</b> bekliyor. Bugün girsene, puantaj da etkileniyor.',
      '📋 Kanka <b>%s rapor</b> eksik. Yarın hatırlamak zorunda kalmayalım.',
      '🗂️ <b>%s tamamlanan işin</b> raporu yok. Bir ara giriver.'
    ]
    when 'bugun_randevu' then array[
      '📅 Bugün <b>%s randevu</b> var. Planı bir kontrol et.',
      '🗓️ Kanka bugün <b>%s randevu</b> görünüyor. Hazırlıklı git.',
      '⏰ <b>%s randevu</b> bugün. Adreslere önceden bak, yol uzun olabilir.'
    ]
    when 'kritik_stok' then array[
      '📦 Depoda <b>%s malzeme kritik seviyede</b>. Sipariş vermeyi unutma.',
      '🛒 <b>%s parça</b> azalmış kanka. Sipariş geç, iş ortasında kalma.',
      '⚠️ <b>%s malzeme</b> bitmek üzere. Bugün halledelim.'
    ]
    when 'personel_talep' then array[
      '👤 <b>%s personel talebi</b> onay bekliyor. Personel cevap bekliyor.',
      '📨 Kanka <b>%s talep</b> birikmiş. Onayla da iş yürüsün.'
    ]
    when 'geciken_tahsilat' then array[
      '💵 <b>%s caride vade geçmiş</b>. Tahsilatı unutma kanka.',
      '🧾 <b>%s müşterinin vadesi geçti</b>. Bir ara ödeme hatırlat.',
      '💰 Kanka <b>%s tahsilat</b> gecikmiş. Nakit akışı önemli.'
    ]
    when 'bakim_zamani' then array[
      '🔧 <b>%s vincin bakım zamanı</b> gelmiş. Müşteriyi ara, randevu ver.',
      '🛠️ <b>%s vinç</b> bakım bekliyor. Arıza çıkmadan gitmek daha iyi.'
    ]
    when 'memnuniyetsiz' then array[
      '⭐ <b>%s müşteri düşük puan verdi</b> (son 14 gün). Ara, gönlünü al.',
      '😐 Kanka <b>%s memnuniyetsiz müşteri</b> var. İtibar önemli, bir ara.'
    ]
    else array['🔔 Kanka bir bakman gereken şey var: <b>%s</b>']
  end;

  v_secim := 1 + floor(random() * array_length(v_sablonlar, 1))::int;
  v_mesaj := format(v_sablonlar[v_secim], p_adet);

  if coalesce(p_detay, '') <> '' then
    v_mesaj := v_mesaj || E'\n<i>' || left(p_detay, 120) || '</i>';
  end if;

  return v_mesaj;
end $$;


-- ============================================================================
-- 4) TEK HATIRLATMA — her seferinde MUTLAKA BİR MESAJ gönder
--    (bekleyen varsa sırayla döner, hepsi beklemedeyse en eskisini tekrarlar)
-- ============================================================================
create or replace function public.asistan_tek_hatirlat()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bekleyen record;
  v_tekrar_dk integer;
  v_mesaj text;
  v_son timestamptz;
  v_yedek record;
  v_toplam integer := 0;
begin
  select coalesce(deger, '4')::int into v_tekrar_dk
  from public.asistan_ayar where anahtar = 'tekrar_dk';

  -- Bekleyen konuları aciliyete göre tara
  for v_bekleyen in
    select * from public.asistan_bekleyenler() order by aciliyet
  loop
    v_toplam := v_toplam + 1;

    select max(gonderim) into v_son
    from public.asistan_hatirlatmalar
    where anahtar = v_bekleyen.anahtar;

    -- Bu konu için süre dolmuşsa → gönder
    if v_son is null or v_son < now() - (v_tekrar_dk || ' minutes')::interval then
      v_mesaj := public.asistan_mesaj(v_bekleyen.anahtar, v_bekleyen.baslik,
                                      v_bekleyen.adet, v_bekleyen.detay);
      perform public.asistan_telegram(v_mesaj);
      insert into public.asistan_hatirlatmalar (anahtar, mesaj) values (v_bekleyen.anahtar, v_mesaj);
      return v_mesaj;
    end if;

    -- Yedek: süresi dolmamış olsa bile en acil konuyu hatırla
    if v_yedek.anahtar is null then
      v_yedek := v_bekleyen;
    end if;
  end loop;

  -- Hiçbiri süresi dolmamışsa → en acil konuyu tekrar hatırlat (sessiz kalma)
  if v_yedek.anahtar is not null then
    v_mesaj := public.asistan_mesaj(v_yedek.anahtar, v_yedek.baslik,
                                    v_yedek.adet, v_yedek.detay);
    perform public.asistan_telegram(v_mesaj);
    insert into public.asistan_hatirlatmalar (anahtar, mesaj) values (v_yedek.anahtar, v_mesaj);
    return v_mesaj;
  end if;

  return null;  -- Gerçekten bekleyen iş yok
end $$;


-- ============================================================================
-- 5) KONTROL
-- ============================================================================
select anahtar, deger from public.asistan_ayar
where anahtar in ('ozet_saat','tekrar_dk','baslangic','bitis','aktif') order by anahtar;

select
  (select count(*) from public.teklif_bekleyenler where durum = 'BEKLIYOR')      as bekleyen,
  (select count(*) from public.teklif_bekleyenler where durum = 'GEREKMIYOR')    as kapatilan,
  (select count(*) from public.teklif_bekleyenler
    where durum = 'BEKLIYOR' and musteri_adi = 'Müşteri belirtilmemiş')          as isimsiz_kalan;

select * from public.teklif_bekleyen_listesi('BEKLIYOR') limit 25;
