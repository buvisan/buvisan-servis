-- ============================================================================
--  BUVISAN RANDEVU MODULU - DUZELTME + DOGRULAMA  (tek seferde calisir)
-- ----------------------------------------------------------------------------
--  SORUN  : service_tickets.media_urls kolonu JSONB tipinde.
--           randevu_al fonksiyonu text[] gonderiyordu -> hata veriyordu.
--  COZUM  : fonksiyon media_urls'i jsonb'ye cevirerek yaziyor.
--
--  BU SCRIPT:
--    1) randevu_al fonksiyonunu duzeltilmis haliyle yeniler (veri kaybi YOK)
--    2) media_urls / audio_url kolon tiplerini ekrana yazar (kesin dogrulama)
--    3) 3+1 kapasite kuralini ve ariza kaydi baglantisini test eder
--    4) actigi tum test kayitlarini siler  ->  sistemde kalinti birakmaz
--
--  KULLANIM: Supabase -> SQL Editor -> New query -> tamamini yapistir -> RUN
-- ============================================================================


-- ============================================================================
-- 1) DUZELTILMIS FONKSIYON
-- ============================================================================
create or replace function public.randevu_al(
  p_musteri_adi  text,
  p_telefon      text,
  p_is_tipi      text,
  p_tarih        date,
  p_yetkili      text   default null,
  p_adres        text   default null,
  p_vinc_bilgisi text   default null,
  p_aciklama     text   default null,
  p_medya_urls   text[] default null,
  p_ses_url      text   default null,
  p_bolge        text   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ayar       public.randevu_ayarlari;
  v_slot       smallint;
  v_randevu_id uuid;
  v_ticket_id  uuid;
  v_issue      text;
  v_pipeline   text;
  v_priority   text;
  i            integer;
begin
  -- --- Zorunlu alan kontrolu ---
  if coalesce(trim(p_musteri_adi), '') = '' or coalesce(trim(p_telefon), '') = '' then
    raise exception 'RANDEVU_EKSIK_BILGI';
  end if;
  if p_tarih is null then
    raise exception 'RANDEVU_TARIH_YOK';
  end if;

  -- --- Ayarlari oku ---
  select * into v_ayar from public.randevu_ayarlari where id = 1;
  if not found then
    insert into public.randevu_ayarlari (id) values (1) returning * into v_ayar;
  end if;

  -- --- Tarih kurallari ---
  if p_tarih < current_date then
    raise exception 'RANDEVU_GECMIS_TARIH';
  end if;
  if p_tarih > current_date + v_ayar.ileri_gun then
    raise exception 'RANDEVU_ILERI_TARIH';
  end if;
  if extract(dow from p_tarih) = 6 and not v_ayar.cumartesi_acik then
    raise exception 'RANDEVU_KAPALI_GUN';
  end if;
  if extract(dow from p_tarih) = 0 and not v_ayar.pazar_acik then
    raise exception 'RANDEVU_KAPALI_GUN';
  end if;
  if p_tarih = any(v_ayar.tatil_gunleri) then
    raise exception 'RANDEVU_KAPALI_GUN';
  end if;

  -- --- BOS YER BUL (1..kapasite) : yaris kosuluna dayanikli ---
  v_randevu_id := null;
  for i in 1..v_ayar.gunluk_kapasite loop
    begin
      insert into public.randevular (
        randevu_tarihi, slot, musteri_adi, yetkili, telefon, adres,
        vinc_bilgisi, is_tipi, durum, kaynak
      ) values (
        p_tarih, i::smallint, trim(p_musteri_adi), p_yetkili, trim(p_telefon), p_adres,
        p_vinc_bilgisi, coalesce(nullif(p_is_tipi,''), 'ariza'), 'planlandi', 'musteri'
      ) returning id into v_randevu_id;
      v_slot := i::smallint;
      exit;
    exception when unique_violation then
      v_randevu_id := null;
    end;
  end loop;

  if v_randevu_id is null then
    raise exception 'RANDEVU_DOLU';
  end if;

  -- --- Operasyon Takibi kaydi (mevcut sistemle ayni alanlar) ---
  if p_is_tipi = 'kesif' then
    v_issue    := 'Keşif Talebi';
    v_pipeline := 'kesif_bekliyor';
    v_priority := 'Normal';
  elsif p_is_tipi = 'bakim' then
    v_issue    := 'Bakım Sözleşmesi Talebi';
    v_pipeline := 'teklif_hazirlanacak';
    v_priority := 'Normal';
  else
    v_issue    := 'Arıza Bildirimi' ||
                  case when coalesce(trim(p_bolge), '') <> '' then ' (' || trim(p_bolge) || ')' else '' end;
    v_pipeline := 'acil_cozum';
    v_priority := 'Kritik (Makine Durdu)';
  end if;

  insert into public.service_tickets (
    issue_type, description, status, pipeline_status,
    manual_customer_name, manual_customer_rep, manual_phone,
    manual_location, manual_crane_info, priority, media_urls, audio_url
  ) values (
    v_issue,
    coalesce(nullif(trim(p_aciklama), ''), 'Randevu talebi ile bildirildi.'),
    'bekliyor',
    v_pipeline,
    trim(p_musteri_adi),
    p_yetkili,
    trim(p_telefon),
    p_adres,
    p_vinc_bilgisi,
    v_priority,
    coalesce(to_jsonb(p_medya_urls), '[]'::jsonb),  -- media_urls = jsonb
    p_ses_url
  ) returning id into v_ticket_id;

  update public.randevular set ticket_id = v_ticket_id where id = v_randevu_id;

  return jsonb_build_object(
    'randevu_id', v_randevu_id,
    'ticket_id',  v_ticket_id,
    'tarih',      p_tarih,
    'slot',       v_slot
  );
end;
$$;

grant execute on function public.randevu_al(text, text, text, date, text, text, text, text, text[], text, text)
  to anon, authenticated;


-- ============================================================================
-- 2) TEST + RAPOR
-- ============================================================================
delete from public.randevular        where musteri_adi like 'ZZ OTOMATIK TEST%';
delete from public.service_tickets   where manual_customer_name like 'ZZ OTOMATIK TEST%'
                                       and created_at > now() - interval '1 day';

drop table if exists _test_sonuc;
create temp table _test_sonuc (sira serial, adim text, sonuc text);

-- 2a) Kolon tipleri (kesin dogrulama)
insert into _test_sonuc (adim, sonuc)
select 'KOLON TIPI: ' || column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'service_tickets'
  and column_name in ('media_urls', 'audio_url')
order by column_name;

-- 2b) Fonksiyon testi
do $$
declare
  v_tarih  date;
  v_gun    text;
  v_sonuc  jsonb;
  v_ticket uuid;
  v_hata   text;
  i        int;
begin
  select g::date into v_tarih
  from generate_series(current_date + 1, current_date + 60, interval '1 day') g
  where extract(dow from g) between 1 and 5
    and g::date <> all (coalesce((select tatil_gunleri from public.randevu_ayarlari where id = 1), '{}'::date[]))
    and (select count(*) from public.randevular r
          where r.randevu_tarihi = g::date and r.durum <> 'iptal') = 0
  order by g limit 1;

  if v_tarih is null then
    insert into _test_sonuc (adim, sonuc)
    values ('TEST', 'ATLANDI - 60 gun icinde tamamen bos gun yok');
    return;
  end if;

  v_gun := case extract(dow from v_tarih)
             when 1 then 'Pazartesi' when 2 then 'Sali'    when 3 then 'Carsamba'
             when 4 then 'Persembe'  when 5 then 'Cuma'    when 6 then 'Cumartesi'
             else 'Pazar' end;

  insert into _test_sonuc (adim, sonuc)
  values ('1) Test gunu', v_tarih::text || ' (' || v_gun || ')');

  -- 3 randevu al (medya ve ses URL'i de gonderiliyor ki tip hatasi varsa ciksin)
  for i in 1..3 loop
    v_sonuc := public.randevu_al(
                 p_musteri_adi  => 'ZZ OTOMATIK TEST ' || i,
                 p_telefon      => '000000000' || i,
                 p_is_tipi      => 'ariza',
                 p_tarih        => v_tarih,
                 p_bolge        => 'Genel',
                 p_adres        => 'Test adresi ' || i,
                 p_vinc_bilgisi => i || ' Ton Test Vinci',
                 p_medya_urls   => array['https://ornek.com/foto' || i || '.jpg'],
                 p_ses_url      => 'https://ornek.com/ses' || i || '.mp3'
               );
    v_ticket := (v_sonuc ->> 'ticket_id')::uuid;

    insert into _test_sonuc (adim, sonuc)
    values (
      (i + 1) || ') Randevu ' || i,
      'OK · slot ' || (v_sonuc ->> 'slot') ||
      ' · ariza kaydi: ' || case when v_ticket is null then 'BAGLANMADI (HATA!)' else 'olustu ve baglandi' end
    );
  end loop;

  -- 4. randevu REDDEDILMELI
  begin
    v_sonuc := public.randevu_al('ZZ OTOMATIK TEST 4', '0000000004', 'ariza', v_tarih, p_bolge => 'Genel');
    insert into _test_sonuc (adim, sonuc)
    values ('5) 4. randevu denemesi', 'HATA! KABUL EDILDI - kapasite siniri calismiyor!');
  exception when others then
    v_hata := sqlerrm;
    insert into _test_sonuc (adim, sonuc)
    values ('5) 4. randevu denemesi',
            case when v_hata = 'RANDEVU_DOLU'
                 then 'DOGRU · reddedildi (RANDEVU_DOLU) - gun doldu, yer verilmedi'
                 else 'BEKLENMEYEN HATA: ' || v_hata end);
  end;

  -- Medya/ses gercekten yazildi mi?
  insert into _test_sonuc (adim, sonuc)
  values ('6) Medya kaydi',
          (select case when media_urls is null then 'YAZILMADI (HATA!)'
                       else 'jsonb olarak yazildi: ' || media_urls::text end
             from public.service_tickets
            where manual_customer_name = 'ZZ OTOMATIK TEST 1'
            limit 1));

  insert into _test_sonuc (adim, sonuc)
  values ('7) Operasyon Takibi kayitlari',
          (select count(*)::text from public.service_tickets
            where manual_customer_name like 'ZZ OTOMATIK TEST%') || ' adet acildi (3 olmali)');

  insert into _test_sonuc (adim, sonuc)
  values ('8) Planlayici kayitlari',
          (select count(*)::text from public.randevular
            where musteri_adi like 'ZZ OTOMATIK TEST%') || ' adet olustu (3 olmali)');

exception when others then
  insert into _test_sonuc (adim, sonuc) values ('GENEL HATA', sqlerrm);
end $$;

-- ============================================================================
-- 3) TEMIZLIK
-- ============================================================================
delete from public.randevular      where musteri_adi like 'ZZ OTOMATIK TEST%';
delete from public.service_tickets where manual_customer_name like 'ZZ OTOMATIK TEST%';

insert into _test_sonuc (adim, sonuc)
values ('9) TEMIZLIK',
        'Test kayitlari silindi · sistemde kalan test kaydi: ' ||
        (select count(*)::text from public.randevular where musteri_adi like 'ZZ OTOMATIK TEST%') || ' adet');

-- ============================================================================
-- SONUC
-- ============================================================================
select adim, sonuc from _test_sonuc order by sira;
