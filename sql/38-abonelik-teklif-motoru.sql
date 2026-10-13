-- ============================================================================
--  🆕 YENİ İKİZ + 📄 ABONELİK TEKLİF MOTORU (Güncelleme #12)
-- ----------------------------------------------------------------------------
--  1) Yeni bulunan ikiz: "Vizyon Makina" / "VİZYON MAKİNA"
--     (Türkçe harf düzeltmesi sayesinde artık otomatik yakalanıyor)
--
--  2) ABONELİK TEKLİFİ ÜRETİCİ:
--     Müşterinin asansör + vinç sayısından hazır teklif METNİ üretir.
--     WhatsApp'tan kopyala-yapıştır gönderilir.
--
--  ⚠️ 1. bölüm veriyi günceller (firma adı birleştirme, geri alınabilir).
--     2. bölüm sadece okur.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) VİZYON MAKİNA İKİZİNİ BİRLEŞTİR
-- ============================================================================
do $$
declare
  v_etkilenen integer := 0;
begin
  insert into public.musteri_gruplari (kanonik_ad, varyant_orijinal, varyant_norm, kaynak_tablo)
  values ('Vizyon Makina', 'VİZYON MAKİNA', public.parca_adi_normal('VİZYON MAKİNA'), 'ikisi')
  on conflict (varyant_norm, kaynak_tablo) do nothing;

  update public.completed_services
     set customer_text = 'Vizyon Makina'
   where public.parca_adi_normal(customer_text) = public.parca_adi_normal('VİZYON MAKİNA');

  get diagnostics v_etkilenen = row_count;

  update public.cranes
     set customer_name = 'Vizyon Makina'
   where public.parca_adi_normal(customer_name) = public.parca_adi_normal('VİZYON MAKİNA');

  raise notice 'Vizyon Makina: % iş kaydı birleştirildi.', v_etkilenen;
end $$;


-- ============================================================================
-- 2) MÜŞTERİ MAKİNE SAYISI (vinç + asansör ayrı ayrı)
-- ============================================================================
create or replace function public.musteri_makine_sayisi(p_musteri text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with n as (select public.parca_adi_normal(p_musteri) as norm)
  select jsonb_build_object(
    'musteri', p_musteri,
    'filo_vinc', (select count(*) from public.cranes c, n
                   where public.parca_adi_normal(c.customer_name) = n.norm
                     and coalesce(c.makine_tipi, 'Vinç') = 'Vinç'),
    'filo_asansor', (select count(*) from public.cranes c, n
                   where public.parca_adi_normal(c.customer_name) = n.norm
                     and c.makine_tipi = 'Asansör'),
    'servis_asansor', (select count(distinct trim(cs.crane_capacity))
                   from public.completed_services cs, n
                   where public.parca_adi_normal(cs.customer_text) = n.norm
                     and cs.makine_tipi = 'Asansör'
                     and coalesce(trim(cs.crane_capacity), '') <> ''),
    'servis_vinc', (select count(distinct trim(cs.crane_capacity))
                   from public.completed_services cs, n
                   where public.parca_adi_normal(cs.customer_text) = n.norm
                     and coalesce(cs.makine_tipi, 'Vinç') = 'Vinç'
                     and coalesce(trim(cs.crane_capacity), '') <> ''),
    'son_servis', (select max(cs.service_date) from public.completed_services cs, n
                   where public.parca_adi_normal(cs.customer_text) = n.norm),
    'toplam_ciro', (select round(coalesce(sum(cs.price), 0), 0)
                   from public.completed_services cs, n
                   where public.parca_adi_normal(cs.customer_text) = n.norm)
  );
$$;

revoke all on function public.musteri_makine_sayisi(text) from public;
grant execute on function public.musteri_makine_sayisi(text) to authenticated;


-- ============================================================================
-- 3) ABONELİK TEKLİF METNİ ÜRET (WhatsApp'tan gönderilmeye hazır)
-- ============================================================================
create or replace function public.abonelik_teklif_metni(
  p_musteri        text,
  p_periyot_ay     integer default 6,
  p_makine_sayisi  integer default null,
  p_iskonto_yuzde  numeric default 0
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_m       jsonb;
  v_adet    integer;
  v_hesap   jsonb;
  v_metin   text;
  v_makine  text;
begin
  v_m := public.musteri_makine_sayisi(p_musteri);

  -- Makine sayısı verilmemişse: asansör + vinç toplamı (asansör öncelikli)
  v_adet := coalesce(
    p_makine_sayisi,
    greatest(
      coalesce((v_m ->> 'filo_asansor')::int, 0) + coalesce((v_m ->> 'filo_vinc')::int, 0),
      coalesce((v_m ->> 'servis_asansor')::int, 0),
      1
    )
  );

  v_hesap := public.abonelik_teklifi(v_adet, p_periyot_ay, p_iskonto_yuzde);
  if not coalesce((v_hesap ->> 'ok')::boolean, false) then
    return 'Teklif hesaplanamadı: ' || coalesce(v_hesap ->> 'mesaj', 'bilinmeyen hata');
  end if;

  v_makine := case
    when coalesce((v_m ->> 'servis_asansor')::int, 0) > 0
      then (v_m ->> 'servis_asansor') || ' adet asansör'
    else v_adet || ' adet makine'
  end;

  v_metin := 'Sayın ' || p_musteri || ',' || E'\n\n' ||
    'Tesisinizde bulunan ' || v_makine || ' için YILLIK PERİYODİK BAKIM ANLAŞMASI teklifimiz:' || E'\n\n' ||
    '📋 ' || (v_hesap ->> 'paket') || E'\n' ||
    '• Makine başı: ' || to_char((v_hesap ->> 'makine_birim_fiyat')::numeric, 'FM999G999G999') || ' ₺ + KDV' || E'\n' ||
    '• Yılda ' || (v_hesap ->> 'yillik_bakim_adedi') || ' periyodik bakım' || E'\n' ||
    '• Toplam bakım: ' || (v_hesap ->> 'yillik_bakim_toplam') || ' adet/yıl' || E'\n\n';

  if coalesce(p_iskonto_yuzde, 0) > 0 then
    v_metin := v_metin ||
      '💰 Tutar: ' || to_char((v_hesap ->> 'brut_tutar')::numeric, 'FM999G999G999') || ' ₺' || E'\n' ||
      '🎁 İskonto (%' || p_iskonto_yuzde || '): −' ||
        to_char((v_hesap ->> 'iskonto_tutar')::numeric, 'FM999G999G999') || ' ₺' || E'\n';
  end if;

  v_metin := v_metin ||
    '💰 Net: ' || to_char((v_hesap ->> 'net_tutar')::numeric, 'FM999G999G999') || ' ₺ + KDV' || E'\n' ||
    '🧾 KDV dahil toplam: ' || to_char((v_hesap ->> 'genel_toplam')::numeric, 'FM999G999G999') || ' ₺' || E'\n' ||
    '📅 Aylık eşdeğer: ' || to_char((v_hesap ->> 'aylik_esdeger')::numeric, 'FM999G999G999') || ' ₺' || E'\n\n' ||
    'ANLAŞMA KAPSAMI:' || E'\n' ||
    '✓ Periyodik bakımlar (planlanmış tarihlerde)' || E'\n' ||
    '✓ Acil servis önceliği' || E'\n' ||
    '✓ Her bakım sonrası rapor' || E'\n' ||
    '✓ Arıza öncesi tespit ve bilgilendirme' || E'\n\n' ||
    'Anlaşma sayesinde makineniz arıza yapmadan kontrol edilir;' || E'\n' ||
    'üretim duruşu riski azalır.' || E'\n\n' ||
    'Detaylı görüşme için bize ulaşabilirsiniz.' || E'\n\n' ||
    'BUVİSAN VİNÇ SERVİS';

  return v_metin;
end;
$$;

revoke all on function public.abonelik_teklif_metni(text, integer, integer, numeric) from public;
grant execute on function public.abonelik_teklif_metni(text, integer, integer, numeric) to authenticated;


-- ============================================================================
-- 4) KONTROL
-- ============================================================================
select
  (public.musteri_makine_sayisi('RB KARESİ') ->> 'servis_asansor') as rbkaresi_asansor,
  (public.musteri_makine_sayisi('RB KARESİ') ->> 'toplam_ciro')    as rbkaresi_ciro,
  (public.musteri_makine_sayisi('SOLOTEX')    ->> 'servis_asansor') as solotex_asansor;

-- ÖRNEK TEKLİF METNİ (kopyala-yapıştır)
select public.abonelik_teklif_metni('RB KARESİ', 6) as teklif_metni;
