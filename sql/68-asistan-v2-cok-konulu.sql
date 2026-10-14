-- ============================================================================
--  🤖 ASİSTAN v2 — ÇOK KONULU, TEKRARSIZ (Güncelleme #48) — BÜYÜK GÜNCELLEME
-- ----------------------------------------------------------------------------
--  SENİN GERİ BİLDİRİMLERİN:
--    1) "6 oldu hâlâ aynı mesajı atıyor" → tekrar mantığı bozuktu
--    2) "Programdaki HER ŞEYİN eksiğini hatırlatsın" → konu sayısı azdı
--    3) Müşteri adı "İsimsiz" → doğru sütun: manual_customer_name
--
--  ÇÖZÜM:
--    • 20+ HATIRLATMA KONUSU (her 5 dakikada farklı konu)
--    • Aynı konu 4 SAAT içinde tekrarlanmaz
--    • Üst üste AYNI mesaj ASLA gitmez
--    • Konular gerçek tablolara bağlı → düzeltince hatırlatma biter
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) AYARLAR — 4 saatlik konu tekrarı
-- ============================================================================
update public.asistan_ayar set deger = '240' where anahtar = 'tekrar_dk';
insert into public.asistan_ayar (anahtar, deger, aciklama)
values ('tekrar_dk', '240', 'Aynı konunun tekrar aralığı (dakika) — 4 saat')
on conflict (anahtar) do update set deger = excluded.deger;


-- ============================================================================
-- 2) BEKLEYENLER v3 — 20+ KONU (müşteri adı düzeltildi)
-- ============================================================================
create or replace function public.asistan_bekleyenler()
returns table (anahtar text, baslik text, adet integer, detay text, aciliyet integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_adet integer;
  v_detay text;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
begin
  -- ─────────────── 1. TEKLİF BEKLEYENLER ───────────────
  begin
    perform public.teklif_bekleyen_tara();
    select count(*) into v_adet from public.teklif_bekleyenler where durum = 'BEKLIYOR';
    if coalesce(v_adet,0) > 0 then
      select string_agg(musteri_adi, ', ') into v_detay from (
        select musteri_adi from public.teklif_bekleyenler
        where durum='BEKLIYOR' order by tespit_tarihi limit 3) x;
      anahtar:='teklif_bekleyen'; baslik:='Arıza çıkan iş — teklif bekliyor';
      adet:=v_adet; detay:=v_detay; aciliyet:=2; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 2. KRİTİK SERVİS TALEPLERİ ───────────────
  begin
    select count(*), string_agg(distinct coalesce(manual_customer_name,'İsimsiz'), ', ')
      into v_adet, v_detay
    from public.service_tickets
    where coalesce(priority,'') ilike '%kritik%'
      and coalesce(pipeline_status,'') not in ('tamamlandi','iptal');
    if coalesce(v_adet,0) > 0 then
      anahtar:='kritik_talep'; baslik:='KRİTİK servis talebi bekliyor';
      adet:=v_adet; detay:=v_detay; aciliyet:=1; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 3. RAPORU GİRİLMEMİŞ İŞLER (90 gün) ───────────────
  begin
    select count(*) into v_adet
    from public.service_tickets t
    where coalesce(t.pipeline_status,'')='tamamlandi'
      and t.created_at::date > v_bugun - 90
      and not exists (select 1 from public.service_reports r where r.ticket_id=t.id);
    if coalesce(v_adet,0) > 0 then
      select string_agg(coalesce(manual_customer_name,'İsimsiz'), ', ') into v_detay
      from (select manual_customer_name from public.service_tickets t2
             where coalesce(t2.pipeline_status,'')='tamamlandi'
               and t2.created_at::date > v_bugun - 90
               and not exists (select 1 from public.service_reports r where r.ticket_id=t2.id)
             limit 3) y;
      anahtar:='rapor_bekleyen'; baslik:='Servis raporu girilmemiş iş var';
      adet:=v_adet; detay:=v_detay; aciliyet:=3; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 4. AÇIK SERVİS TALEPLERİ (bekleyen işler) ───────────────
  begin
    select count(*), string_agg(distinct coalesce(manual_customer_name,'İsimsiz'), ', ')
      into v_adet, v_detay
    from public.service_tickets
    where coalesce(pipeline_status,'') not in ('tamamlandi','iptal')
      and created_at::date < v_bugun - 2;
    if coalesce(v_adet,0) > 0 then
      anahtar:='acik_talep'; baslik:='2 günden fazla açık servis talebi';
      adet:=v_adet; detay:=v_detay; aciliyet:=2; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 5. EKİP ATANMAMIŞ TALEPLER ───────────────
  begin
    select count(*), string_agg(distinct coalesce(manual_customer_name,'İsimsiz'), ', ')
      into v_adet, v_detay
    from public.service_tickets
    where coalesce(pipeline_status,'') not in ('tamamlandi','iptal')
      and coalesce(assigned_team,'') = '';
    if coalesce(v_adet,0) > 0 then
      anahtar:='ekip_atama'; baslik:='Servis talebine ekip atanmamış';
      adet:=v_adet; detay:=v_detay; aciliyet:=3; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 6. BUGÜNKÜ RANDEVULAR ───────────────
  begin
    select count(*) into v_adet
    from public.appointments a
    where a.appointment_date = v_bugun
      and coalesce(a.status,'') not in ('tamamlandi','iptal','Yapıldı');
    if coalesce(v_adet,0) > 0 then
      anahtar:='bugun_randevu'; baslik:='Bugünkü randevular';
      adet:=v_adet; detay:=null; aciliyet:=4; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 7. YARINKİ RANDEVULAR (hazırlık) ───────────────
  begin
    select count(*) into v_adet from public.appointments
    where appointment_date = v_bugun + 1 and coalesce(status,'') not in ('iptal');
    if coalesce(v_adet,0) > 0 then
      anahtar:='yarin_randevu'; baslik:='Yarınki randevular (hazırlık yap)';
      adet:=v_adet; detay:=null; aciliyet:=6; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 8. DEPODA KRİTİK STOK ───────────────
  begin
    select count(*) into v_adet from public.materials m
    where coalesce(m.stock_quantity,0) <= coalesce(m.min_stock,0) and coalesce(m.min_stock,0) > 0;
    if coalesce(v_adet,0) > 0 then
      select string_agg(name, ', ') into v_detay from (
        select name from public.materials
        where coalesce(stock_quantity,0) <= coalesce(min_stock,0) and coalesce(min_stock,0) > 0
        limit 3) z;
      anahtar:='kritik_stok'; baslik:='Depoda kritik seviyede malzeme';
      adet:=v_adet; detay:=v_detay; aciliyet:=5; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 9. FİYATI GİRİLMEMİŞ MALZEME ───────────────
  begin
    select count(*) into v_adet from public.materials
    where coalesce(buy_price,0) = 0 or coalesce(sale_price,0) = 0;
    if coalesce(v_adet,0) > 0 then
      anahtar:='fiyatsiz_malzeme'; baslik:='Fiyatı girilmemiş malzeme';
      adet:=v_adet; detay:=null; aciliyet:=7; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 10. ONAY BEKLEYEN PERSONEL TALEPLERİ ───────────────
  begin
    select count(*) into v_adet from public.personel_talepler where durum='BEKLEMEDE';
    if coalesce(v_adet,0) > 0 then
      anahtar:='personel_talep'; baslik:='Personel talebi onay bekliyor';
      adet:=v_adet; detay:=null; aciliyet:=6; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 11. BUGÜN MESAİ GİRMEYEN PERSONEL ───────────────
  begin
    select count(*) into v_adet
    from public.personel_maas pm
    where pm.aktif
      and extract(dow from v_bugun) between 1 and 5
      and not exists (select 1 from public.puantaj_gunluk g
                       where public.parca_adi_normal(g.personel)=public.parca_adi_normal(pm.personel)
                         and g.tarih = v_bugun);
    if coalesce(v_adet,0) > 0 and extract(hour from (now() at time zone 'Europe/Istanbul')) >= 17 then
      anahtar:='mesai_girmeyen'; baslik:='Bugün mesai girmeyen personel';
      adet:=v_adet; detay:=null; aciliyet:=6; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 12. VADESİ GEÇEN TAHSİLAT ───────────────
  begin
    select count(*) into v_adet from public.cari_hesaplar c
    where coalesce(c.bakiye,0) > 0 and c.vade_tarihi is not null and c.vade_tarihi < v_bugun;
    if coalesce(v_adet,0) > 0 then
      anahtar:='geciken_tahsilat'; baslik:='Vadesi geçen tahsilat';
      adet:=v_adet; detay:=null; aciliyet:=4; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 13. BAKIM ZAMANI GELEN VİNÇLER ───────────────
  begin
    select count(*) into v_adet from public.cranes c
    where c.next_maintenance_date is not null and c.next_maintenance_date <= v_bugun;
    if coalesce(v_adet,0) > 0 then
      anahtar:='bakim_zamani'; baslik:='Bakım zamanı gelen vinç';
      adet:=v_adet; detay:=null; aciliyet:=5; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 14. YAKINDA BİTECEK BAKIM SÖZLEŞMELERİ ───────────────
  begin
    select count(*) into v_adet from public.maintenance_contracts mc
    where mc.end_date is not null and mc.end_date between v_bugun and v_bugun + 30;
    if coalesce(v_adet,0) > 0 then
      anahtar:='sozlesme_bitiyor'; baslik:='30 gün içinde bitecek bakım sözleşmesi';
      adet:=v_adet; detay:=null; aciliyet:=4; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 15. TELEFONU OLMAYAN MÜŞTERİ ───────────────
  begin
    select count(*) into v_adet from public.cranes
    where coalesce(customer_phone,'') = '' and coalesce(customer_name,'') <> '';
    if coalesce(v_adet,0) > 0 then
      anahtar:='telefonsuz'; baslik:='Telefonu kayıtlı olmayan vinç müşterisi';
      adet:=v_adet; detay:=null; aciliyet:=8; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 16. ADRESİ OLMAYAN VİNÇ ───────────────
  begin
    select count(*) into v_adet from public.cranes
    where coalesce(location_address,'') = '' and coalesce(customer_name,'') <> '';
    if coalesce(v_adet,0) > 0 then
      anahtar:='adressiz'; baslik:='Adresi kayıtlı olmayan vinç (yol tarifi alınamaz)';
      adet:=v_adet; detay:=null; aciliyet:=8; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 17. ARAÇ BAKIMI / SİGORTA / MUAYENE ───────────────
  begin
    select count(*) into v_adet from public.fleet_vehicles fv
    where fv.next_maintenance_date is not null and fv.next_maintenance_date <= v_bugun + 7;
    if coalesce(v_adet,0) > 0 then
      anahtar:='arac_bakim'; baslik:='Araç bakımı yaklaşan filo';
      adet:=v_adet; detay:=null; aciliyet:=5; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 18. ARAÇ SİGORTA/MUAYENE BİTİŞİ ───────────────
  begin
    select count(*) into v_adet from public.fleet_vehicles fv
    where (fv.inspection_date is not null and fv.inspection_date between v_bugun and v_bugun + 30)
       or (fv.insurance_date is not null and fv.insurance_date between v_bugun and v_bugun + 30);
    if coalesce(v_adet,0) > 0 then
      anahtar:='arac_evrak'; baslik:='Araç muayene/sigorta süresi yaklaşıyor';
      adet:=v_adet; detay:=null; aciliyet:=4; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 19. CEVAP BEKLEYEN TEKLİFLER (offers) ───────────────
  begin
    select count(*) into v_adet from public.offers o
    where coalesce(to_jsonb(o)->>'status','') in ('Beklemede','beklemede','Gönderildi','gonderildi')
      and coalesce((to_jsonb(o)->>'created_at')::timestamptz, now()) < now() - interval '3 days';
    if coalesce(v_adet,0) > 0 then
      anahtar:='teklif_yanitsiz'; baslik:='3 günden fazla yanıtsız teklif';
      adet:=v_adet; detay:=null; aciliyet:=4; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 20. DÜŞÜK MEMNUNİYET PUANI ───────────────
  begin
    select count(*) into v_adet from public.service_reports r
    where coalesce(r.musteri_puani,5) <= 2 and r.created_at > now() - interval '14 days';
    if coalesce(v_adet,0) > 0 then
      anahtar:='memnuniyetsiz'; baslik:='Düşük puan veren müşteri (son 14 gün)';
      adet:=v_adet; detay:=null; aciliyet:=2; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 21. YORUM YAPILMAMIŞ MEMNUNİYET ───────────────
  begin
    select count(*) into v_adet from public.service_reports r
    where r.musteri_puani is not null and coalesce(r.musteri_yorumu,'') = '';
    if coalesce(v_adet,0) > 0 then
      anahtar:='yorumsuz_puan'; baslik:='Müşteri puan verdi ama yorum yazılmamış';
      adet:=v_adet; detay:=null; aciliyet:=9; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 22. İŞARETLENMEMİŞ MAKİNE TİPİ ───────────────
  begin
    select count(*) into v_adet from public.cranes
    where coalesce(makine_tipi,'') = '';
    if coalesce(v_adet,0) > 0 then
      anahtar:='makine_tipi_yok'; baslik:='Makine tipi girilmemiş vinç';
      adet:=v_adet; detay:=null; aciliyet:=9; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 23. SES KAYDI ÇÖZÜLMEMİŞ ───────────────
  begin
    select count(*) into v_adet from public.ses_cozumleri where coalesce(metin,'') = '';
    if coalesce(v_adet,0) > 0 then
      anahtar:='ses_cozulmemis'; baslik:='Metne çevrilmemiş ses kaydı';
      adet:=v_adet; detay:=null; aciliyet:=8; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 24. AKTİF TAKİP LİNKLERİ ───────────────
  begin
    select count(*) into v_adet from public.is_takip where coalesce(durum,'') = 'AKTIF';
    if coalesce(v_adet,0) > 0 then
      anahtar:='aktif_takip'; baslik:='Devam eden canlı iş takibi';
      adet:=v_adet; detay:=null; aciliyet:=7; return next;
    end if;
  exception when others then null; end;

  -- ─────────────── 25. SÖZLEŞMESİZ VİNÇ (abonelik fırsatı) ───────────────
  begin
    select count(*) into v_adet from public.cranes c
    where not exists (select 1 from public.maintenance_contracts mc where mc.crane_id = c.id);
    if coalesce(v_adet,0) > 100 then
      anahtar:='abonelik_firsat'; baslik:='Bakım sözleşmesi olmayan vinç';
      adet:=v_adet; detay:=null; aciliyet:=9; return next;
    end if;
  exception when others then null; end;
end $$;


-- ============================================================================
-- 3) TEKRAR DÜZELTMESİ — üst üste AYNI mesaj ASLA gitmez
-- ============================================================================
create or replace function public.asistan_tek_hatirlat()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bekleyen    record;
  v_tekrar_dk   integer;
  v_mesaj       text;
  v_son         timestamptz;
  v_son_anahtar text;
begin
  select coalesce(deger,'240')::int into v_tekrar_dk
  from public.asistan_ayar where anahtar='tekrar_dk';

  -- En son gönderilen konu (üst üste aynı gitmesin)
  select anahtar into v_son_anahtar
  from public.asistan_hatirlatmalar
  where anahtar not like '\_\_%'
  order by gonderim desc limit 1;

  -- Süresi dolmuş VE son gönderilenden FARKLI konu → gönder
  for v_bekleyen in select * from public.asistan_bekleyenler() order by aciliyet loop
    select max(gonderim) into v_son from public.asistan_hatirlatmalar
    where anahtar = v_bekleyen.anahtar;

    if (v_son is null or v_son < now() - (v_tekrar_dk || ' minutes')::interval)
       and v_bekleyen.anahtar is distinct from v_son_anahtar then
      v_mesaj := public.asistan_mesaj(v_bekleyen.anahtar, v_bekleyen.baslik,
                                      v_bekleyen.adet, v_bekleyen.detay);
      perform public.asistan_telegram(v_mesaj);
      insert into public.asistan_hatirlatmalar (anahtar, mesaj) values (v_bekleyen.anahtar, v_mesaj);
      return v_mesaj;
    end if;
  end loop;

  -- Sıradaki konu yoksa: 30 dakikadan eski olan en acil konuyu tekrarla
  for v_bekleyen in select * from public.asistan_bekleyenler() order by aciliyet loop
    select max(gonderim) into v_son from public.asistan_hatirlatmalar
    where anahtar = v_bekleyen.anahtar;

    if v_son is null or v_son < now() - interval '30 minutes' then
      v_mesaj := public.asistan_mesaj(v_bekleyen.anahtar, v_bekleyen.baslik,
                                      v_bekleyen.adet, v_bekleyen.detay);
      perform public.asistan_telegram(v_mesaj);
      insert into public.asistan_hatirlatmalar (anahtar, mesaj) values (v_bekleyen.anahtar, v_mesaj);
      return v_mesaj;
    end if;
  end loop;

  return null;  -- Her konu yakın zamanda söylendi → sessiz kal
end $$;


-- ============================================================================
-- 4) MESAJ ŞABLONLARI — her konu için 5 farklı söz
-- ============================================================================
create or replace function public.asistan_mesaj(
  p_anahtar text, p_baslik text, p_adet integer, p_detay text
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
    when 'teklif_bekleyen' then array[
      '📄 <b>%s işte</b> arıza tespit edilmiş. Müşteri teklif bekliyor olabilir.',
      '🔧 <b>%s işten</b> arıza çıkmış kanka. Teklifi atsana, para bekliyor.',
      '💰 <b>%s iş</b> teklif bekliyor. Yapılan işin karşılığını alalım.',
      '📋 Kanka <b>%s müşteride</b> arıza bulunmuş. Teklif verilmezse unutulur.',
      '🛠️ <b>%s işte</b> yapılacak bir şeyler var. Teklif hazırla.']
    when 'kritik_talep' then array[
      '🔴 <b>%s KRİTİK talep</b> bekliyor kanka! Makine durmuş olabilir.',
      '🚨 <b>%s kritik servis</b> sırada! Müşteri bekliyor, bir el at.',
      '⚠️ <b>%s kritik iş</b> hâlâ açık. Bugün çözülmeli.',
      '🔔 Kanka <b>%s KRİTİK talep</b> var, atlanmasın!',
      '⛔ <b>%s kritik arıza</b> bekliyor. Vinç çalışmıyor olabilir.']
    when 'rapor_bekleyen' then array[
      '📝 <b>%s işin raporu</b> girilmemiş. Kaydetmeyi unutma.',
      '✍️ <b>%s servis raporu</b> bekliyor. Bugün girsene.',
      '📋 Kanka <b>%s rapor</b> eksik. Sonra karışır.',
      '🗂️ <b>%s tamamlanan işin</b> raporu yok. Bir ara giriver.',
      '📄 <b>%s iş</b> rapor bekliyor — puantaj da etkileniyor.']
    when 'acik_talep' then array[
      '⏳ <b>%s servis talebi</b> 2 günden fazla açık kaldı. Bir bak.',
      '📌 Kanka <b>%s talep</b> bekliyor. Müşteri sıkıştırıyor olabilir.',
      '🕐 <b>%s iş</b> askıda kalmış. Bugün ilgilenelim.']
    when 'ekip_atama' then array[
      '👷 <b>%s talebe ekip atanmamış</b>. Kim gidecek?',
      '🚧 Kanka <b>%s işe</b> personel atanmamış. Açıkta kalmasın.']
    when 'bugun_randevu' then array[
      '📅 Bugün <b>%s randevu</b> var. Planı kontrol et.',
      '🗓️ Kanka bugün <b>%s randevu</b> görünüyor. Hazırlıklı git.',
      '⏰ <b>%s randevu</b> bugün. Adreslere önceden bak.',
      '🚐 Bugün <b>%s işe</b> gidilecek. Malzeme kontrolü yap.']
    when 'yarin_randevu' then array[
      '📆 Yarın <b>%s randevu</b> var. Bugünden hazırlan.',
      '🔧 Kanka yarın <b>%s iş</b> var. Malzeme/araç hazır mı?',
      '📋 Yarınki <b>%s işi</b> planla. Sabah acele etme.']
    when 'kritik_stok' then array[
      '📦 Depoda <b>%s malzeme kritik</b>. Sipariş vermeyi unutma.',
      '🛒 <b>%s parça</b> azalmış kanka. İş ortasında kalma.',
      '⚠️ <b>%s malzeme</b> bitmek üzere. Bugün halledelim.',
      '🚚 <b>%s malzeme</b> için sipariş geç. Stok eriyor.']
    when 'fiyatsiz_malzeme' then array[
      '💲 <b>%s malzemenin fiyatı</b> girilmemiş. Kâr hesabı yanlış çıkar.',
      '🧮 Kanka <b>%s ürüne</b> fiyat gir. Analiz bozuluyor.']
    when 'personel_talep' then array[
      '👤 <b>%s personel talebi</b> onay bekliyor.',
      '📨 Kanka <b>%s talep</b> birikmiş. Onayla da iş yürüsün.',
      '🙋 <b>%s personel isteği</b> cevap bekliyor.']
    when 'mesai_girmeyen' then array[
      '⏱️ <b>%s personel</b> bugün mesai girmemiş. Hatırlat.',
      '📝 Kanka <b>%s kişi</b> saatini yazmamış. Puantaj eksik kalır.']
    when 'geciken_tahsilat' then array[
      '💵 <b>%s caride vade geçmiş</b>. Tahsilatı unutma.',
      '🧾 <b>%s müşterinin vadesi geçti</b>. Ödeme hatırlat.',
      '💰 Kanka <b>%s tahsilat</b> gecikmiş. Nakit akışı önemli.']
    when 'bakim_zamani' then array[
      '🔧 <b>%s vincin bakım zamanı</b> gelmiş. Randevu ver.',
      '🛠️ <b>%s vinç</b> bakım bekliyor. Arıza çıkmadan git.',
      '📅 <b>%s vinç</b> için bakım planla. Müşteriyi ara.']
    when 'sozlesme_bitiyor' then array[
      '📃 <b>%s bakım sözleşmesi</b> 30 gün içinde bitiyor. Yenile.',
      '🔄 Kanka <b>%s sözleşme</b> bitmek üzere. Müşteriyle konuş.',
      '⚠️ <b>%s sözleşme</b> yakında doluyor. Yenileme teklif et.']
    when 'telefonsuz' then array[
      '📞 <b>%s vinç müşterisinin telefonu</b> kayıtlı değil.',
      '☎️ Kanka <b>%s müşteriye</b> telefon ekle. Acil durumda lazım.']
    when 'adressiz' then array[
      '📍 <b>%s vincin adresi</b> yok — yol tarifi alınamaz.',
      '🗺️ Kanka <b>%s vinç</b> için adres gir. Personel zorlanıyor.']
    when 'arac_bakim' then array[
      '🚗 <b>%s aracın bakımı</b> yaklaşıyor. Servise götür.',
      '🔧 Kanka <b>%s filo aracı</b> bakım istiyor.']
    when 'arac_evrak' then array[
      '📄 <b>%s aracın muayene/sigortası</b> bitiyor. Randevu al.',
      '🚨 Kanka <b>%s araç evrakı</b> yakında doluyor. Ceza yeme.']
    when 'teklif_yanitsiz' then array[
      '📄 <b>%s teklif</b> 3 gündür yanıtsız. Peşine düş.',
      '💼 Kanka <b>%s teklif</b> sessiz. Bir telefon et.',
      '📞 <b>%s teklif</b> beklemede. Fırsat kaçmasın.']
    when 'memnuniyetsiz' then array[
      '⭐ <b>%s müşteri düşük puan verdi</b>. Ara, gönlünü al.',
      '😐 Kanka <b>%s memnuniyetsiz müşteri</b> var. İtibar önemli.',
      '📉 <b>%s müşteri</b> memnun kalmamış. Sebebini öğren.']
    when 'yorumsuz_puan' then array[
      '💬 <b>%s müşteri puan verdi</b> ama yorum yok. Sor.',
      '📝 Kanka <b>%s işte</b> yorum alanı boş kalmış.']
    when 'makine_tipi_yok' then array[
      '🏗️ <b>%s vincin makine tipi</b> girilmemiş. Envanter eksik.',
      '📊 Kanka <b>%s vinç</b> sınıflandırılmamış. Asansör/vinç ayrımı bozulur.']
    when 'ses_cozulmemis' then array[
      '🎤 <b>%s ses kaydı</b> metne çevrilmemiş.',
      '🔊 Kanka <b>%s sesli not</b> işlenmemiş.']
    when 'aktif_takip' then array[
      '📍 <b>%s canlı takip</b> devam ediyor. Müşteri linke bakıyor.',
      '🚚 Kanka <b>%s iş takibi</b> açık. Tamamlanınca kapat.']
    when 'abonelik_firsat' then array[
      '🏗️ <b>%s vinçte bakım sözleşmesi yok</b>. Abonelik teklif et.',
      '💡 Kanka <b>%s vinç</b> sözleşmesiz. Düzenli gelir olsun.']
    else array['🔔 Kanka bir bakman gereken şey var: <b>%s</b>']
  end;

  v_secim := 1 + floor(random() * array_length(v_sablonlar, 1))::int;
  v_mesaj := format(v_sablonlar[v_secim], p_adet);

  if coalesce(p_detay, '') <> '' then
    v_mesaj := v_mesaj || E'\n<i>' || left(p_detay, 150) || '</i>';
  end if;

  return v_mesaj;
end $$;


-- ============================================================================
-- 5) KONTROL — şu an kaç KONU bekliyor?
-- ============================================================================
select anahtar, baslik, adet, aciliyet, coalesce(left(detay,50),'-') as detay
from public.asistan_bekleyenler()
order by aciliyet;

select count(*) as toplam_konu from public.asistan_bekleyenler();
select anahtar, deger from public.asistan_ayar where anahtar in ('tekrar_dk','ozet_saat') order by anahtar;
