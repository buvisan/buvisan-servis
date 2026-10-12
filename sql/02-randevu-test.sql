-- ============================================================================
--  BUVISAN RANDEVU MODULU - OTOMATIK DOGRULAMA TESTI
-- ----------------------------------------------------------------------------
--  Bu script su 4 seyi GERCEK veritabani uzerinde test eder:
--    1) Ayni gune 3 randevu alinabiliyor mu?
--    2) 4. musteri DOGRU sekilde reddediliyor mu? (kapasite kilidi)
--    3) Her randevu icin Operasyon Takibi'ne ariza kaydi aciliyor mu?
--    4) Randevu ile ariza kaydi birbirine baglaniyor mu?
--
--  ⚠️ TEST VERISI BIRAKMAZ: script sonunda actigi tum test kayitlarini siler.
--  ⚠️ SCRIPT HICBIR MEVCUT KAYDA DOKUNMAZ (sadece 'ZZ OTOMATIK TEST' ile
--     baslayan kendi actigi kayitlari yonetir).
--
--  KULLANIM: Supabase -> SQL Editor -> New query -> tamamini yapistir -> RUN
-- ============================================================================

-- --- 0) Onceki yarim kalmis test kayitlari varsa temizle (guvenlik) ---
delete from public.randevular
 where musteri_adi like 'ZZ OTOMATIK TEST%';

delete from public.service_tickets
 where manual_customer_name like 'ZZ OTOMATIK TEST%'
   and created_at > now() - interval '1 day';

-- --- Sonuclari toplayacagimiz gecici tablo ---
drop table if exists _test_sonuc;
create temp table _test_sonuc (sira serial, adim text, sonuc text);

-- ============================================================================
--  TEST
-- ============================================================================
do $$
declare
  v_tarih  date;
  v_gun    text;
  v_sonuc  jsonb;
  v_ticket uuid;
  v_hata   text;
  i        int;
begin
  -- 1) Onumuzdeki 60 gun icinde hafta ici + tamamen bos bir gun bul
  select g::date into v_tarih
  from generate_series(current_date + 1, current_date + 60, interval '1 day') g
  where extract(dow from g) between 1 and 5
    and g::date <> all (coalesce((select tatil_gunleri from public.randevu_ayarlari where id = 1), '{}'::date[]))
    and (select count(*) from public.randevular r
          where r.randevu_tarihi = g::date and r.durum <> 'iptal') = 0
  order by g
  limit 1;

  if v_tarih is null then
    insert into _test_sonuc (adim, sonuc)
    values ('0) Test gunu', 'ATLANDI - 60 gun icinde tamamen bos bir gun kalmamis (kapasite testi yapilamadi)');
    return;
  end if;

  v_gun := case extract(dow from v_tarih)
             when 1 then 'Pazartesi' when 2 then 'Sali'   when 3 then 'Carsamba'
             when 4 then 'Persembe'  when 5 then 'Cuma'   when 6 then 'Cumartesi'
             else 'Pazar' end;

  insert into _test_sonuc (adim, sonuc)
  values ('0) Test gunu secildi', v_tarih::text || ' (' || v_gun || ')');

  -- 2) Ayni gune sirayla 3 randevu al
  for i in 1..3 loop
    v_sonuc  := public.randevu_al(
                  p_musteri_adi => 'ZZ OTOMATIK TEST ' || i,
                  p_telefon     => '000000000' || i,
                  p_is_tipi     => 'ariza',
                  p_tarih       => v_tarih,
                  p_bolge       => 'Genel'
                );
    v_ticket := (v_sonuc ->> 'ticket_id')::uuid;

    insert into _test_sonuc (adim, sonuc)
    values (
      i || '. randevu',
      'OK · slot ' || (v_sonuc ->> 'slot') ||
      ' · ariza kaydi: ' || case when v_ticket is null then 'BAGLANMADI (HATA!)' else 'olustu ve baglandi' end
    );
  end loop;

  -- 3) 4. randevu REDDEDILMELI (kapasite kilidi testi)
  begin
    v_sonuc := public.randevu_al(
                 p_musteri_adi => 'ZZ OTOMATIK TEST 4',
                 p_telefon     => '0000000004',
                 p_is_tipi     => 'ariza',
                 p_tarih       => v_tarih,
                 p_bolge       => 'Genel'
               );
    insert into _test_sonuc (adim, sonuc)
    values ('4. randevu denemesi', 'HATA! KABUL EDILDI - kapasite siniri calismiyor!');
  exception when others then
    v_hata := sqlerrm;
    insert into _test_sonuc (adim, sonuc)
    values ('4. randevu denemesi',
            case when v_hata = 'RANDEVU_DOLU'
                 then 'DOGRU · reddedildi (RANDEVU_DOLU) - gun doldu, yer verilmedi'
                 else 'BEKLENMEYEN HATA: ' || v_hata end);
  end;

  -- 4) Operasyon Takibi baglantisi kontrolu
  insert into _test_sonuc (adim, sonuc)
  values ('Operasyon Takibi kayitlari',
          (select count(*)::text from public.service_tickets
            where manual_customer_name like 'ZZ OTOMATIK TEST%') || ' adet ariza kaydi acildi (3 olmali)');

  insert into _test_sonuc (adim, sonuc)
  values ('Planlayici kayitlari',
          (select count(*)::text from public.randevular
            where musteri_adi like 'ZZ OTOMATIK TEST%') || ' adet randevu olustu (3 olmali)');

exception when others then
  insert into _test_sonuc (adim, sonuc) values ('GENEL HATA', sqlerrm);
end $$;

-- ============================================================================
--  TEMIZLIK - test kayitlarini sil (sistemde kalinti birakmaz)
-- ============================================================================
delete from public.randevular
 where musteri_adi like 'ZZ OTOMATIK TEST%';

delete from public.service_tickets
 where manual_customer_name like 'ZZ OTOMATIK TEST%';

insert into _test_sonuc (adim, sonuc)
values ('TEMIZLIK',
        'Test kayitlari silindi · sistemde kalan test kaydi: ' ||
        (select count(*)::text from public.randevular where musteri_adi like 'ZZ OTOMATIK TEST%') || ' adet');

-- ============================================================================
--  SONUC TABLOSU
-- ============================================================================
select adim, sonuc from _test_sonuc order by sira;
