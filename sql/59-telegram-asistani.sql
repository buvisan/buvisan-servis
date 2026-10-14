-- ============================================================================
--  🤖 AKILLI TELEGRAM ASİSTANI (Güncelleme #39)
-- ----------------------------------------------------------------------------
--  SENİN İSTEĞİN:
--    • Her 5 dakikada bir hatırlatma (farklı sözlerle, tek tek)
--    • Her 2 saatte bir tüm yapılacakların özeti
--    • Hafta içi 07:30 - 18:00 arası
--    • AKILLI: yaptığın şeyi bir daha hatırlatmasın
--
--  NASIL AKILLI ÇALIŞIR?
--    Her hatırlatma bir VERİ KOŞULUNA bağlıdır. Örnek:
--      "Depoda X malzemesi azaldı" → stok gerçekten azaldıysa söyler
--      Stok tamamlanınca → o hatırlatma KENDİLİĞİNDEN BİTER (tek satır kod yok)
--    + Aynı hatırlatma belirli süre tekrarlanmaz (spam koruması)
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================

-- ============================================================================
-- 0) AYAR TABLOSU
-- ============================================================================
create table if not exists public.asistan_ayar (
  anahtar text primary key,
  deger   text,
  aciklama text
);

insert into public.asistan_ayar (anahtar, deger, aciklama) values
  ('aktif',        'true',                 'Asistan açık mı? (true/false)'),
  ('bot_token',    '8567697885:AAGCSyckJKLG11HwTQaMGGUwMyXIm0UqAK0', 'Telegram bot token'),
  ('chat_id',      '-5079408473',          'Telegram grup/kanal ID'),
  ('baslangic',    '07:30',                'Günlük başlangıç saati'),
  ('bitis',        '18:00',                'Günlük bitiş saati'),
  ('tekrar_dk',    '15',                   'Aynı hatırlatmanın tekrar aralığı (dakika)'),
  ('ozet_saat',    '2',                    'Özet kaç saatte bir gönderilsin')
on conflict (anahtar) do nothing;


-- ============================================================================
-- 1) GÖNDERİM KAYDI (spam koruması + akıllı tekrar yönetimi)
-- ============================================================================
create table if not exists public.asistan_hatirlatmalar (
  id        bigserial primary key,
  anahtar   text not null,
  mesaj     text,
  gonderim  timestamptz not null default now()
);

create index if not exists idx_asistan_hatirlatma_anahtar
  on public.asistan_hatirlatmalar (anahtar, gonderim desc);

alter table public.asistan_hatirlatmalar enable row level security;
alter table public.asistan_ayar enable row level security;


-- ============================================================================
-- 2) TELEGRAM GÖNDERME
-- ============================================================================
create or replace function public.asistan_telegram(p_mesaj text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_chat  text;
begin
  select deger into v_token from public.asistan_ayar where anahtar = 'bot_token';
  select deger into v_chat  from public.asistan_ayar where anahtar = 'chat_id';

  if coalesce(v_token, '') = '' or coalesce(v_chat, '') = '' then
    return false;
  end if;

  perform net.http_post(
    url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
                 'chat_id', v_chat,
                 'text', p_mesaj,
                 'parse_mode', 'HTML',
                 'disable_web_page_preview', true
               )
  );

  insert into public.asistan_hatirlatmalar (anahtar, mesaj) values ('__gonderim__', left(p_mesaj, 200));
  return true;
end $$;


-- ============================================================================
-- 3) BEKLEYEN İŞLERİ TOPLA (her hatırlatma bir VERİ KOŞULU)
--    İş yapılınca koşul ortadan kalkar → hatırlatma kendiliğinden biter
-- ============================================================================
create or replace function public.asistan_bekleyenler()
returns table (
  anahtar   text,
  baslik    text,
  adet      integer,
  detay     text,
  aciliyet  integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_adet integer;
  v_detay text;
begin
  -- 1) 🔴 KRİTİK servis talepleri (makine durmuş)
  begin
    select count(*), string_agg(distinct coalesce(customer_name, 'İsimsiz'), ', ')
      into v_adet, v_detay
    from public.service_tickets
    where coalesce(status, '') ilike '%kritik%'
      and coalesce(pipeline_status, '') not in ('tamamlandi', 'iptal');
    if coalesce(v_adet, 0) > 0 then
      anahtar := 'kritik_talep'; baslik := 'KRİTİK servis talebi bekliyor';
      adet := v_adet; detay := v_detay; aciliyet := 1; return next;
    end if;
  exception when others then null; end;

  -- 2) 📝 Raporu girilmemiş tamamlanmış işler
  begin
    select count(*) into v_adet
    from public.service_tickets t
    where coalesce(t.pipeline_status, '') = 'tamamlandi'
      and not exists (select 1 from public.service_reports r where r.ticket_id = t.id);
    if coalesce(v_adet, 0) > 0 then
      anahtar := 'rapor_bekleyen'; baslik := 'Servis raporu girilmemiş iş var';
      adet := v_adet; detay := null; aciliyet := 2; return next;
    end if;
  exception when others then null; end;

  -- 3) 📅 Bugünkü randevular
  begin
    select count(*) into v_adet
    from public.appointments a
    where a.appointment_date = (now() at time zone 'Europe/Istanbul')::date
      and coalesce(a.status, '') not in ('tamamlandi', 'iptal', 'Yapıldı');
    if coalesce(v_adet, 0) > 0 then
      anahtar := 'bugun_randevu'; baslik := 'Bugünkü randevular';
      adet := v_adet; detay := null; aciliyet := 3; return next;
    end if;
  exception when others then null; end;

  -- 4) 📦 Depoda kritik stok
  begin
    select count(*) into v_adet
    from public.materials m
    where coalesce(m.stock_quantity, 0) <= coalesce(m.min_stock, 0)
      and coalesce(m.min_stock, 0) > 0;
    if coalesce(v_adet, 0) > 0 then
      select string_agg(m.name, ', ') into v_detay
      from (select name from public.materials
             where coalesce(stock_quantity,0) <= coalesce(min_stock,0) and coalesce(min_stock,0) > 0
             limit 3) m;
      anahtar := 'kritik_stok'; baslik := 'Depoda kritik seviyede malzeme';
      adet := v_adet; detay := v_detay; aciliyet := 4; return next;
    end if;
  exception when others then null; end;

  -- 5) 💰 Onay bekleyen personel talepleri
  begin
    select count(*) into v_adet from public.personel_talepler where durum = 'BEKLEMEDE';
    if coalesce(v_adet, 0) > 0 then
      anahtar := 'personel_talep'; baslik := 'Personel talebi onay bekliyor';
      adet := v_adet; detay := null; aciliyet := 5; return next;
    end if;
  exception when others then null; end;

  -- 6) 📄 Cevap bekleyen teklifler
  begin
    select count(*) into v_adet
    from public.quotes q
    where coalesce(q.status, '') in ('Beklemede', 'beklemede', 'Gönderildi');
    if coalesce(v_adet, 0) > 0 then
      anahtar := 'teklif_bekleyen'; baslik := 'Cevap bekleyen teklif';
      adet := v_adet; detay := null; aciliyet := 6; return next;
    end if;
  exception when others then null; end;

  -- 7) 💵 Tahsilatı geciken cariler
  begin
    select count(*), string_agg(distinct c.firma_adi, ', ')
      into v_adet, v_detay
    from public.cari_hesaplar c
    where coalesce(c.bakiye, 0) > 0
      and c.vade_tarihi is not null
      and c.vade_tarihi < (now() at time zone 'Europe/Istanbul')::date;
    if coalesce(v_adet, 0) > 0 then
      anahtar := 'geciken_tahsilat'; baslik := 'Vadesi geçen tahsilat';
      adet := v_adet; detay := v_detay; aciliyet := 7; return next;
    end if;
  exception when others then null; end;

  -- 8) 🔧 Bakım zamanı gelen vinçler
  begin
    select count(*) into v_adet
    from public.cranes c
    where c.next_maintenance_date is not null
      and c.next_maintenance_date <= (now() at time zone 'Europe/Istanbul')::date;
    if coalesce(v_adet, 0) > 0 then
      anahtar := 'bakim_zamani'; baslik := 'Bakım zamanı gelen vinç';
      adet := v_adet; detay := null; aciliyet := 8; return next;
    end if;
  exception when others then null; end;

  -- 9) 🏗️ Sözleşmesiz vinçler (abonelik fırsatı)
  begin
    select count(*) into v_adet
    from public.cranes c
    where not exists (select 1 from public.maintenance_contracts mc where mc.crane_id = c.id);
    if coalesce(v_adet, 0) > 100 then
      anahtar := 'abonelik_firsat'; baslik := 'Bakım sözleşmesi olmayan vinç';
      adet := v_adet; detay := null; aciliyet := 9; return next;
    end if;
  exception when others then null; end;

  -- 10) ⭐ Memnuniyetsiz müşteri (düşük puan)
  begin
    select count(*) into v_adet
    from public.service_reports r
    where coalesce(r.musteri_puani, 5) <= 2
      and r.created_at > now() - interval '14 days';
    if coalesce(v_adet, 0) > 0 then
      anahtar := 'memnuniyetsiz'; baslik := 'Düşük puan veren müşteri (son 14 gün)';
      adet := v_adet; detay := null; aciliyet := 2; return next;
    end if;
  exception when others then null; end;
end $$;


-- ============================================================================
-- 4) MESAJ ŞABLONLARI — her hatırlatma için FARKLI SÖZLER
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
    when 'teklif_bekleyen' then array[
      '📄 <b>%s teklif</b> cevap bekliyor. Peşine düşsene, soğumasın.',
      '💼 Kanka <b>%s teklif</b> yanıtsız. Bir telefon et, hatırlat.',
      '📞 <b>%s teklif</b> hâlâ beklemede. Fırsat kaçmasın.'
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
    when 'abonelik_firsat' then array[
      '🏗️ <b>%s vinçte bakım sözleşmesi yok</b>. Abonelik teklif et, düzenli gelir olsun.',
      '💡 Kanka <b>%s vinç</b> sözleşmesiz. Bir teklif atsana.'
    ]
    when 'memnuniyetsiz' then array[
      '⭐ <b>%s müşteri düşük puan verdi</b> (son 14 gün). Ara, gönlünü al.',
      '😐 Kanka <b>%s memnuniyetsiz müşteri</b> var. İtibar önemli, bir ara.'
    ]
    else array['🔔 Kanka bir bakman gereken şey var: <b>%s</b>'];
  end;

  v_secim := 1 + floor(random() * array_length(v_sablonlar, 1))::int;
  v_mesaj := format(v_sablonlar[v_secim], p_adet);

  if coalesce(p_detay, '') <> '' then
    v_mesaj := v_mesaj || E'\n<i>' || left(p_detay, 120) || '</i>';
  end if;

  return v_mesaj;
end $$;


-- ============================================================================
-- 5) TEK HATIRLATMA GÖNDER (5 dakikada bir) — sırayla, tekrarsız
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
begin
  select coalesce(deger, '15')::int into v_tekrar_dk
  from public.asistan_ayar where anahtar = 'tekrar_dk';

  -- Aciliyete göre sırala; son gönderimden yeterince zaman geçmiş olanı seç
  for v_bekleyen in
    select * from public.asistan_bekleyenler() order by aciliyet
  loop
    select max(gonderim) into v_son
    from public.asistan_hatirlatmalar
    where anahtar = v_bekleyen.anahtar;

    if v_son is null or v_son < now() - (v_tekrar_dk || ' minutes')::interval then
      v_mesaj := public.asistan_mesaj(v_bekleyen.anahtar, v_bekleyen.baslik,
                                      v_bekleyen.adet, v_bekleyen.detay);
      perform public.asistan_telegram(v_mesaj);

      insert into public.asistan_hatirlatmalar (anahtar, mesaj) values (v_bekleyen.anahtar, v_mesaj);
      return v_mesaj;
    end if;
  end loop;

  return null;  -- Bekleyen iş yok → sessiz kal (akıllı asistan!)
end $$;


-- ============================================================================
-- 6) TAM ÖZET (2 saatte bir)
-- ============================================================================
create or replace function public.asistan_ozet_gonder()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b record;
  v_satir text := '';
  v_toplam integer := 0;
  v_mesaj text;
  v_saat text;
begin
  v_saat := to_char(now() at time zone 'Europe/Istanbul', 'HH24:MI');

  for v_b in select * from public.asistan_bekleyenler() order by aciliyet loop
    v_satir := v_satir || E'\n' || case v_b.aciliyet
        when 1 then '🔴' when 2 then '🟠' when 3 then '📅' when 4 then '📦'
        when 5 then '👤' when 6 then '📄' when 7 then '💵' when 8 then '🔧'
        else '•' end
      || ' <b>' || v_b.baslik || '</b> — ' || v_b.adet
      || case when coalesce(v_b.detay,'') <> '' then E'\n     <i>' || left(v_b.detay, 90) || '</i>' else '' end;
    v_toplam := v_toplam + 1;
  end loop;

  if v_toplam = 0 then
    v_mesaj := '✅ <b>ASİSTAN ÖZETİ</b> (' || v_saat || ')' || E'\n\n'
            || 'Kanka şu an <b>bekleyen iş yok</b>! Her şey yolunda, eline sağlık 👏';
  else
    v_mesaj := '📊 <b>ASİSTAN ÖZETİ</b> (' || v_saat || ')' || E'\n'
            || '━━━━━━━━━━━━━━━━━━━'
            || v_satir || E'\n'
            || '━━━━━━━━━━━━━━━━━━━' || E'\n'
            || 'Toplam <b>' || v_toplam || ' başlık</b> bekliyor kanka.';
  end if;

  perform public.asistan_telegram(v_mesaj);
  insert into public.asistan_hatirlatmalar (anahtar, mesaj) values ('__ozet__', left(v_mesaj, 200));
  return v_mesaj;
end $$;


-- ============================================================================
-- 7) ANA ZAMANLAYICI — cron bunu her 5 dakikada çağırır
-- ============================================================================
create or replace function public.asistan_calistir()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aktif boolean;
  v_bas text; v_bit text;
  v_simdi timestamp;
  v_dk integer; v_saat integer; v_dakika integer;
  v_bas_dk integer; v_bit_dk integer;
  v_suanki integer;
  v_ozet_saat integer;
  v_son_ozet timestamptz;
begin
  select coalesce(deger,'true')::boolean into v_aktif from public.asistan_ayar where anahtar='aktif';
  if not coalesce(v_aktif, true) then return; end if;

  v_simdi := now() at time zone 'Europe/Istanbul';

  -- Hafta sonu hariç (0=Pazar, 6=Cumartesi)
  if extract(dow from v_simdi) in (0, 6) then return; end if;

  select deger into v_bas from public.asistan_ayar where anahtar='baslangic';
  select deger into v_bit from public.asistan_ayar where anahtar='bitis';
  select coalesce(deger,'2')::int into v_ozet_saat from public.asistan_ayar where anahtar='ozet_saat';

  v_saat   := extract(hour from v_simdi)::int;
  v_dakika := extract(minute from v_simdi)::int;
  v_suanki := v_saat * 60 + v_dakika;

  v_bas_dk := split_part(coalesce(v_bas,'07:30'), ':', 1)::int * 60
            + split_part(coalesce(v_bas,'07:30'), ':', 2)::int;
  v_bit_dk := split_part(coalesce(v_bit,'18:00'), ':', 1)::int * 60
            + split_part(coalesce(v_bit,'18:00'), ':', 2)::int;

  -- Çalışma saatleri dışında sessiz
  if v_suanki < v_bas_dk or v_suanki > v_bit_dk then return; end if;

  -- ⏰ 2 SAATTE BİR ÖZET (çift saatlerin ilk 5 dakikası)
  if v_dakika < 5 and (v_saat % v_ozet_saat = 0) then
    select max(gonderim) into v_son_ozet
    from public.asistan_hatirlatmalar where anahtar = '__ozet__';

    if v_son_ozet is null or v_son_ozet < now() - interval '100 minutes' then
      perform public.asistan_ozet_gonder();
      return;
    end if;
  end if;

  -- 🔔 HER 5 DAKİKADA BİR TEK HATIRLATMA
  perform public.asistan_tek_hatirlat();
end $$;


-- ============================================================================
-- 8) CRON — her 5 dakikada bir çalıştır
-- ============================================================================
do $$
begin
  if exists (select 1 from cron.job where jobname = 'buvisan-asistan') then
    perform cron.unschedule('buvisan-asistan');
  end if;
exception when others then null;
end $$;

select cron.schedule('buvisan-asistan', '*/5 * * * *', $$select public.asistan_calistir();$$);


-- ============================================================================
-- 9) KONTROL — şu an ne bekliyor?
-- ============================================================================
select anahtar, baslik, adet, aciliyet
from public.asistan_bekleyenler()
order by aciliyet;

-- Ayar durumu
select anahtar, deger from public.asistan_ayar order by anahtar;

-- Cron kaydı
select jobname, schedule, active from cron.job where jobname = 'buvisan-asistan';
