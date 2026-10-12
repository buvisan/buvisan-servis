-- ============================================================================
--  BUVISAN TEKNIK SERVIS - RANDEVU / PLANLAYICI MODULU  (v1.0)
-- ----------------------------------------------------------------------------
--  BU SCRIPT HICBIR MEVCUT TABLOYU SILMEZ, DEGISTIRMEZ, VERI KAYBETMEZ.
--  Sadece SU YENILERI ekler:
--    1) public.randevu_ayarlari   -> gunluk kapasite / acik gun kurallari
--    2) public.randevular         -> randevu kayitlari
--    3) public.randevu_doluluk()  -> musteri takvimi icin "hangi gun dolu" bilgisi
--    4) public.randevu_al()       -> musteri randevu alirken kapasiteyi kilitleyen
--                                    ve ayni anda Operasyon Takibi kaydini acan fonksiyon
--    5) RLS guvenlik politikalari -> musteri sadece doluluk gorebilir, isim/telefon goremez
--
--  Kurallar (senin sectigin):
--    * Gunde en fazla 3 randevu
--    * Sadece hafta ici (Cumartesi + Pazar KAPALI)
--    * Bugunden itibaren 60 gun ileriye kadar
--    * Randevu aninda kesinlesir
--    * Randevu, Operasyon Takibi'ndeki ariza kaydiyla baglantili olur
--
--  KULLANIM: Supabase -> SQL Editor -> New query -> bu dosyanin tamamini
--            yapistir -> RUN.  (Tek seferde calisir, tekrar calistirilsa da bozmaz)
-- ============================================================================


-- ============================================================================
-- 1) AYAR TABLOSU  (kapasite/gun kurallari buradan yonetilir)
-- ============================================================================
create table if not exists public.randevu_ayarlari (
  id               integer  primary key default 1,
  gunluk_kapasite  smallint not null default 3,
  ileri_gun        smallint not null default 60,
  cumartesi_acik   boolean  not null default false,
  pazar_acik       boolean  not null default false,
  tatil_gunleri    date[]   not null default '{}'::date[],
  guncelleme       timestamptz not null default now(),
  constraint randevu_ayarlari_tek_satir check (id = 1),
  constraint randevu_ayarlari_kapasite_araligi check (gunluk_kapasite between 1 and 20)
);

insert into public.randevu_ayarlari (id, gunluk_kapasite, ileri_gun, cumartesi_acik, pazar_acik, tatil_gunleri)
values (1, 3, 60, false, false, array[
  -- Resmi tatiller (sabit gunler)
  date '2026-01-01', date '2026-04-23', date '2026-05-01', date '2026-05-19',
  date '2026-07-15', date '2026-08-30', date '2026-10-29',
  date '2027-01-01', date '2027-04-23', date '2027-05-01', date '2027-05-19',
  date '2027-07-15', date '2027-08-30', date '2027-10-29',
  -- Dini bayramlar (TAHMINI - lutfen kendi takviminizle dogrulayin)
  date '2026-03-20', date '2026-03-21', date '2026-03-22',        -- Ramazan Bayrami 2026
  date '2026-05-27', date '2026-05-28', date '2026-05-29', date '2026-05-30',  -- Kurban Bayrami 2026
  date '2027-03-09', date '2027-03-10', date '2027-03-11',        -- Ramazan Bayrami 2027
  date '2027-05-16', date '2027-05-17', date '2027-05-18', date '2027-05-19'   -- Kurban Bayrami 2027
]::date[])
on conflict (id) do nothing;


-- ============================================================================
-- 2) RANDEVU TABLOSU
-- ============================================================================
create table if not exists public.randevular (
  id               uuid primary key default gen_random_uuid(),
  ticket_id        uuid references public.service_tickets(id) on delete set null,
  musteri_adi      text not null,
  yetkili          text,
  telefon          text,
  adres            text,
  vinc_bilgisi     text,
  is_tipi          text not null default 'ariza'
                     check (is_tipi in ('ariza','kesif','bakim')),
  randevu_tarihi   date not null,
  slot             smallint not null check (slot between 1 and 20),
  durum            text not null default 'planlandi'
                     check (durum in ('planlandi','yapildi','iptal','ertelendi')),
  atanan_personel  text,
  admin_notu       text,
  kaynak           text not null default 'musteri'
                     check (kaynak in ('musteri','admin')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Ayni gune ayni slot numarasi iki kez yazilamaz.
-- Iptal edilen kayitlar slotu serbest birakir (where durum <> 'iptal').
-- Bu kisit sayesinde iki musteri AYNI SANIYEDE gonderirse bile 3'u gecmez.
create unique index if not exists randevular_kapasite_kilidi
  on public.randevular (randevu_tarihi, slot)
  where durum <> 'iptal';

create index if not exists randevular_tarih_idx   on public.randevular (randevu_tarihi);
create index if not exists randevular_durum_idx   on public.randevular (durum);
create index if not exists randevular_ticket_idx  on public.randevular (ticket_id);


-- ============================================================================
-- 3) updated_at OTOMATIK GUNCELLEME
-- ============================================================================
create or replace function public.randevu_zaman_damgasi()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_randevu_zaman_damgasi on public.randevular;
create trigger trg_randevu_zaman_damgasi
  before update on public.randevular
  for each row execute function public.randevu_zaman_damgasi();


-- ============================================================================
-- 4) ADMIN YARDIMCI FONKSIYONU
-- ============================================================================
create or replace function public.buvisan_admin_mi()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

revoke all on function public.buvisan_admin_mi() from public;
grant execute on function public.buvisan_admin_mi() to authenticated;


-- ============================================================================
-- 5) MUSTERI TAKVIMI: HANGI GUN DOLU?  (kisisel veri DONMEZ, sadece sayi)
-- ============================================================================
create or replace function public.randevu_doluluk(p_bas date, p_bit date)
returns table (tarih date, dolu integer, kapasite integer, acik boolean)
language sql
stable
security definer
set search_path = public
as $$
  with a as (select * from public.randevu_ayarlari where id = 1)
  select
    g::date as tarih,
    coalesce((
      select count(*) from public.randevular r
      where r.randevu_tarihi = g::date and r.durum <> 'iptal'
    ), 0)::int as dolu,
    coalesce((select gunluk_kapasite from a), 3)::int as kapasite,
    case
      when g::date < current_date then false
      when extract(dow from g) = 6 and not coalesce((select cumartesi_acik from a), false) then false
      when extract(dow from g) = 0 and not coalesce((select pazar_acik     from a), false) then false
      when g::date > current_date + coalesce((select ileri_gun from a), 60) then false
      when g::date = any(coalesce((select tatil_gunleri from a), '{}'::date[])) then false
      else true
    end as acik
  from generate_series(p_bas, p_bit, interval '1 day') g;
$$;

grant execute on function public.randevu_doluluk(date, date) to anon, authenticated;


-- ============================================================================
-- 6) MUSTERI RANDEVU ALMA  (kapasite kilidi + Operasyon Takibi kaydi = tek islem)
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
  -- Her deneme ayri bir alt-islemdir; slot doluysa unique index hata verir,
  -- biz yakalar ve siradaki slotu deneriz. Boylece asla 3'u gecmeyiz.
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

  -- --- Operasyon Takibi kaydi (mevcut sistemle birebir ayni alanlar) ---
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
    coalesce(to_jsonb(p_medya_urls), '[]'::jsonb),  -- media_urls kolonu jsonb tipinde
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
-- 7) GUVENLIK (RLS)
--    - Musteri (anon): randevular tablosunu DOGRUDAN OKUYAMAZ/YAZAMAZ.
--      Sadece randevu_doluluk() ve randevu_al() fonksiyonlarini kullanabilir.
--      Yani musteri isimlerini/telefonlarini kimse disaridan cekemez.
--    - Admin: tam yetki.
-- ============================================================================
alter table public.randevular        enable row level security;
alter table public.randevu_ayarlari  enable row level security;

drop policy if exists randevular_admin_politikasi on public.randevular;
create policy randevular_admin_politikasi on public.randevular
  for all to authenticated
  using (public.buvisan_admin_mi())
  with check (public.buvisan_admin_mi());

drop policy if exists randevu_ayarlari_admin_politikasi on public.randevu_ayarlari;
create policy randevu_ayarlari_admin_politikasi on public.randevu_ayarlari
  for all to authenticated
  using (public.buvisan_admin_mi())
  with check (public.buvisan_admin_mi());


-- ============================================================================
-- 8) KONTROL: her sey yerinde mi?
-- ============================================================================
select
  (select count(*) from public.randevu_ayarlari)                as ayar_satiri,
  (select gunluk_kapasite from public.randevu_ayarlari where id = 1) as gunluk_kapasite,
  (select ileri_gun       from public.randevu_ayarlari where id = 1) as ileri_gun,
  (select count(*) from public.randevular)                      as mevcut_randevu,
  (select count(*) from public.randevu_doluluk(current_date, current_date + 7)) as takvim_gun_sayisi;
