-- ============================================================================
--  📄 TEKLİF BEKLEYENLER MOTORU (Güncelleme #40)
-- ----------------------------------------------------------------------------
--  SENİN İSTEĞİN:
--    "Periyodik kontrol sonrası çıkan arızaları yaptırtmak için teklif
--     isteniyor. Bunları bana hatırlatsın."
--
--  ÖNEMLİ AYRIM (senin uyardığın detay):
--    🔄 SÖZLEŞMELİ periyodik bakım  → maintenance_contracts kaydı VAR
--    1️⃣ TEK SEFERLİK periyodik kontrol → sözleşme YOK, iş "Periyodik" içeriyor
--    İKİSİ DE yakalanır, asistan mesajında farklı sözlerle söylenir.
--
--  ÇALIŞMA ŞEKLİ (Senaryo B):
--    1) OTOMATİK: Periyodik işler taranır → arıza varsa listeye girer
--    2) ELLE: Personel raporda "TEKLİF GEREKLİ" butonuna basar
--    3) KAPANIŞ: Teklif kesilince VEYA "gerekmiyor" denince listeden çıkar
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) TABLO — teklif bekleyen işler
-- ============================================================================
create table if not exists public.teklif_bekleyenler (
  id             uuid primary key default gen_random_uuid(),
  musteri_adi    text not null,
  kaynak         text not null default 'manuel',   -- sozlesmeli | tek_seferlik | manuel
  ariza_ozeti    text,
  tespit_tarihi  date not null default current_date,
  durum          text not null default 'BEKLIYOR', -- BEKLIYOR | TEKLIF_VERILDI | GEREKMIYOR
  teklif_notu    text,
  is_emri_no     text,
  olusturan      text,
  olusturma      timestamptz not null default now(),
  guncelleme     timestamptz not null default now()
);

create index if not exists idx_teklif_bekleyen_durum
  on public.teklif_bekleyenler (durum, tespit_tarihi desc);

alter table public.teklif_bekleyenler enable row level security;

-- Yönetici okur/yazar
drop policy if exists teklif_bekleyen_admin on public.teklif_bekleyenler;
create policy teklif_bekleyen_admin on public.teklif_bekleyenler
  for all to authenticated
  using (public.buvisan_admin_mi())
  with check (public.buvisan_admin_mi());

-- Personel kendi işareti için ekleyebilir (sadece ekleme)
drop policy if exists teklif_bekleyen_personel_ekle on public.teklif_bekleyenler;
create policy teklif_bekleyen_personel_ekle on public.teklif_bekleyenler
  for insert to authenticated
  with check (true);

-- Rapor tarafında "elle işaret" sütunu
alter table public.service_reports
  add column if not exists teklif_gerekli boolean default false;


-- ============================================================================
-- 2) OTOMATİK TARAMA — periyodik işlerden teklif bekleyenleri bul
--    (sözleşmeli ve tek seferlik AYRI etiketlenir)
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
    cs.customer_name,
    case
      when exists (
        select 1 from public.cranes c
        join public.maintenance_contracts mc on mc.crane_id = c.id
        where public.parca_adi_normal(c.customer_name) =
              public.parca_adi_normal(cs.customer_name)
      ) then 'sozlesmeli'
      else 'tek_seferlik'
    end,
    coalesce(nullif(trim(cs.description), ''),
             nullif(trim(cs.materials_text), ''),
             'Periyodik kontrol sonrası arıza tespit edildi'),
    coalesce(cs.service_date::date, current_date),
    cs.id::text,
    'otomatik tarama'
  from public.completed_services cs
  where cs.customer_name is not null
    -- Periyodik iş mi? (tür, açıklama veya iş adı içinde geçiyor mu)
    and (
      coalesce(cs.service_type, '') ilike '%periyodik%'
      or coalesce(cs.description, '') ilike '%periyodik%'
    )
    -- Son 90 gün (eski kayıtları doldurmasın)
    and coalesce(cs.service_date::date, current_date) > current_date - 90
    -- Arıza/tespit içeriği var mı? (boş işler girmesin)
    and coalesce(trim(cs.description), '') <> ''
    -- Zaten listede değil mi?
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
-- 3) ELLE İŞARETLEME — raporda "TEKLİF GEREKLİ" butonu için
-- ============================================================================
create or replace function public.teklif_gerekli_isaretle(
  p_musteri     text,
  p_ariza       text default null,
  p_is_emri_no  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_musteri), '') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Müşteri adı gerekli.');
  end if;

  -- Aynı iş emri zaten listede mi?
  if coalesce(p_is_emri_no, '') <> '' and exists (
    select 1 from public.teklif_bekleyenler
    where is_emri_no = p_is_emri_no and durum = 'BEKLIYOR'
  ) then
    return jsonb_build_object('ok', true, 'mesaj', 'Bu iş zaten teklif listesinde.');
  end if;

  insert into public.teklif_bekleyenler
    (musteri_adi, kaynak, ariza_ozeti, is_emri_no, olusturan)
  values (
    trim(p_musteri),
    'manuel',
    nullif(trim(coalesce(p_ariza, '')), ''),
    nullif(trim(coalesce(p_is_emri_no, '')), ''),
    public.benim_adim()
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id,
    'mesaj', 'Teklif listesine eklendi. Asistan hatırlatacak.');
end $$;

revoke all on function public.teklif_gerekli_isaretle(text, text, text) from public;
grant execute on function public.teklif_gerekli_isaretle(text, text, text) to authenticated;


-- ============================================================================
-- 4) DURUM GÜNCELLE — teklif verildi / gerekmiyor
-- ============================================================================
create or replace function public.teklif_durum_guncelle(
  p_id    uuid,
  p_durum text,
  p_not   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.buvisan_admin_mi() then
    return jsonb_build_object('yetki_yok', true, 'mesaj', 'Sadece yönetici değiştirebilir.');
  end if;

  if p_durum not in ('BEKLIYOR','TEKLIF_VERILDI','GEREKMIYOR') then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçersiz durum.');
  end if;

  update public.teklif_bekleyenler
     set durum = p_durum,
         teklif_notu = p_not,
         guncelleme = now()
   where id = p_id;

  return jsonb_build_object('ok', true,
    'mesaj', case p_durum
      when 'TEKLIF_VERILDI' then '✅ Teklif verildi olarak işaretlendi — hatırlatma bitti.'
      when 'GEREKMIYOR'     then '✅ Gerekmiyor olarak işaretlendi — hatırlatma bitti.'
      else 'Tekrar bekliyor.' end);
end $$;

revoke all on function public.teklif_durum_guncelle(uuid, text, text) from public;
grant execute on function public.teklif_durum_guncelle(uuid, text, text) to authenticated;


-- ============================================================================
-- 5) LİSTE — ekranda göstermek için
-- ============================================================================
create or replace function public.teklif_bekleyen_listesi(p_durum text default 'BEKLIYOR')
returns table (
  id            uuid,
  musteri_adi   text,
  kaynak        text,
  kaynak_etiket text,
  ariza_ozeti   text,
  tespit_tarihi date,
  gun_gecmis    integer,
  durum         text,
  is_emri_no    text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id, t.musteri_adi, t.kaynak,
    case t.kaynak
      when 'sozlesmeli'   then '🔄 Sözleşmeli bakım'
      when 'tek_seferlik' then '1️⃣ Tek seferlik kontrol'
      else '✍️ Elle işaretlendi' end,
    t.ariza_ozeti, t.tespit_tarihi,
    (current_date - t.tespit_tarihi)::int,
    t.durum, t.is_emri_no
  from public.teklif_bekleyenler t
  where (p_durum is null or t.durum = p_durum)
  order by
    case t.durum when 'BEKLIYOR' then 1 else 2 end,
    t.tespit_tarihi asc;
$$;

revoke all on function public.teklif_bekleyen_listesi(text) from public;
grant execute on function public.teklif_bekleyen_listesi(text) to authenticated;


-- ============================================================================
-- 6) ASİSTAN ENTEGRASYONU — hatırlatma kaynağı ekle
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
  -- 0) 📄 TEKLİF BEKLEYENLER (periyodik kontrol sonrası arızalar)
  begin
    -- Önce otomatik tarama yap (yeni işler listeye girsin)
    perform public.teklif_bekleyen_tara();

    select count(*) into v_adet
    from public.teklif_bekleyenler
    where durum = 'BEKLIYOR';

    if coalesce(v_adet, 0) > 0 then
      select string_agg(distinct musteri_adi, ', ') into v_detay
      from (select musteri_adi from public.teklif_bekleyenler
             where durum = 'BEKLIYOR' order by tespit_tarihi limit 3) x;

      anahtar := 'teklif_bekleyen_is'; baslik := 'Periyodik kontrolden çıkan arıza — teklif bekliyor';
      adet := v_adet; detay := v_detay; aciliyet := 2; return next;
    end if;
  exception when others then null; end;

  -- 1) 🔴 KRİTİK servis talepleri
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
      adet := v_adet; detay := null; aciliyet := 3; return next;
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
      adet := v_adet; detay := null; aciliyet := 4; return next;
    end if;
  exception when others then null; end;

  -- 4) 📦 Depoda kritik stok
  begin
    select count(*) into v_adet
    from public.materials m
    where coalesce(m.stock_quantity, 0) <= coalesce(m.min_stock, 0)
      and coalesce(m.min_stock, 0) > 0;
    if coalesce(v_adet, 0) > 0 then
      select string_agg(x.name, ', ') into v_detay
      from (select name from public.materials
             where coalesce(stock_quantity,0) <= coalesce(min_stock,0) and coalesce(min_stock,0) > 0
             limit 3) x;
      anahtar := 'kritik_stok'; baslik := 'Depoda kritik seviyede malzeme';
      adet := v_adet; detay := v_detay; aciliyet := 5; return next;
    end if;
  exception when others then null; end;

  -- 5) 👤 Onay bekleyen personel talepleri
  begin
    select count(*) into v_adet from public.personel_talepler where durum = 'BEKLEMEDE';
    if coalesce(v_adet, 0) > 0 then
      anahtar := 'personel_talep'; baslik := 'Personel talebi onay bekliyor';
      adet := v_adet; detay := null; aciliyet := 6; return next;
    end if;
  exception when others then null; end;

  -- 6) 💵 Tahsilatı geciken cariler
  begin
    select count(*) into v_adet from public.cari_hesaplar c
    where coalesce(c.bakiye, 0) > 0 and c.vade_tarihi is not null
      and c.vade_tarihi < (now() at time zone 'Europe/Istanbul')::date;
    if coalesce(v_adet, 0) > 0 then
      anahtar := 'geciken_tahsilat'; baslik := 'Vadesi geçen tahsilat';
      adet := v_adet; detay := null; aciliyet := 7; return next;
    end if;
  exception when others then null; end;

  -- 7) 🔧 Bakım zamanı gelen vinçler
  begin
    select count(*) into v_adet from public.cranes c
    where c.next_maintenance_date is not null
      and c.next_maintenance_date <= (now() at time zone 'Europe/Istanbul')::date;
    if coalesce(v_adet, 0) > 0 then
      anahtar := 'bakim_zamani'; baslik := 'Bakım zamanı gelen vinç';
      adet := v_adet; detay := null; aciliyet := 8; return next;
    end if;
  exception when others then null; end;

  -- 8) ⭐ Memnuniyetsiz müşteri
  begin
    select count(*) into v_adet from public.service_reports r
    where coalesce(r.musteri_puani, 5) <= 2 and r.created_at > now() - interval '14 days';
    if coalesce(v_adet, 0) > 0 then
      anahtar := 'memnuniyetsiz'; baslik := 'Düşük puan veren müşteri (son 14 gün)';
      adet := v_adet; detay := null; aciliyet := 3; return next;
    end if;
  exception when others then null; end;
end $$;


-- ============================================================================
-- 7) ASİSTAN MESAJ ŞABLONLARINA YENİ SÖZLER
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
      '📄 Kanka <b>%s periyodik kontrol</b> var, arıza çıkmış. Teklif hazırlamayı unutma!',
      '💼 <b>%s işte</b> arıza tespit edilmiş. Müşteri teklif bekliyor olabilir, bir bak.',
      '🔧 <b>%s periyodik kontrolden</b> arıza çıkmış kanka. Teklifi atsana, para bekliyor.',
      '💰 <b>%s iş</b> teklif bekliyor. Yapılan kontrolün karşılığını alalım.',
      '📋 Kanka <b>%s müşteride</b> arıza bulunmuş. Teklif verilmezse unutulur gider.'
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
-- 8) KONTROL — teklif bekleyenler
-- ============================================================================
select * from public.teklif_bekleyen_listesi('BEKLIYOR');

-- Özet
select
  (select count(*) from public.teklif_bekleyenler where durum = 'BEKLIYOR')     as bekleyen,
  (select count(*) from public.teklif_bekleyenler where kaynak = 'sozlesmeli')  as sozlesmeli,
  (select count(*) from public.teklif_bekleyenler where kaynak = 'tek_seferlik')as tek_seferlik,
  (select count(*) from public.teklif_bekleyenler where kaynak = 'manuel')      as elle_isaretlenen;
