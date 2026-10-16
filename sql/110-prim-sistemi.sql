-- ============================================================================
--  💰 PERSONEL PRİM SİSTEMİ (Güncelleme #82)
-- ----------------------------------------------------------------------------
--  MANTIK:
--    Prim = İş Ağırlık Puanı (0-100) × Prim Katsayısı
--
--    AĞIR İŞ  (85 puan) → ~1020 ₺   (2 gün arıza, makine sökme, fabrikada tamir)
--    ORTA İŞ  (50 puan) → ~600 ₺
--    KOLAY İŞ (15 puan) → ~180 ₺    (10 dakikada biten basit iş)
--
--  AĞIRLIK PUANI — 5 KRİTER:
--    1) Çalışma süresi        (max 35) — work_hours
--    2) Parça karmaşıklığı    (max 25) — materials dizisi
--    3) İş tipi               (max 15) — arıza/montaj/bakım
--    4) İş büyüklüğü          (max 15) — price
--    5) Müşteri memnuniyeti   (max 10) — service_reports.musteri_puani
--
--  ⭐ SADECE BİTEN İŞLER: finans ekranında PARA GİRİLEN işler (price > 0)
--     "36 işe gitti" değil → "36 işten kaçını bitirdi"
--
--  KULLANIM: 109'dan SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) ⚙️ PRİM AYARLARI (kendin değiştirebilirsin)
-- ============================================================================
create table if not exists public.prim_ayarlari (
  id                integer primary key default 1,
  maks_prim         numeric default 1200,   -- 100 puan = kaç ₺
  min_prim          numeric default 50,     -- en düşük prim (0 puan bile)
  sure_puan         numeric default 35,     -- çalışma süresi max puan
  parca_puan        numeric default 25,     -- parça karmaşıklığı max puan
  tip_puan          numeric default 15,     -- iş tipi max puan
  bedel_puan        numeric default 15,     -- iş büyüklüğü max puan
  memnuniyet_puan   numeric default 10,     -- memnuniyet max puan
  aylik_hedef_is    integer default 20,     -- aylık beklenen iş sayısı
  guncelleme        timestamptz default now(),
  constraint prim_tek_satir check (id = 1)
);

insert into public.prim_ayarlari (id) values (1) on conflict (id) do nothing;

alter table public.prim_ayarlari enable row level security;

drop policy if exists "prim_ayar_oku" on public.prim_ayarlari;
create policy "prim_ayar_oku" on public.prim_ayarlari
  for select to authenticated using (true);

drop policy if exists "prim_ayar_yaz" on public.prim_ayarlari;
create policy "prim_ayar_yaz" on public.prim_ayarlari
  for all to authenticated using (public.buvisan_admin_mi()) with check (public.buvisan_admin_mi());


-- ============================================================================
-- 2) 📊 İŞ AĞIRLIK PUANI (0-100)
-- ============================================================================
create or replace function public.is_agirlik_puani(p_cs jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_a record;
  v_sure numeric := 0;
  v_parca integer := 0;
  v_tip text;
  v_bedel numeric := 0;
  v_puan numeric := 0;

  v_sure_p numeric := 0;
  v_parca_p numeric := 0;
  v_tip_p numeric := 0;
  v_bedel_p numeric := 0;
  v_etiket text;
begin
  select * into v_a from public.prim_ayarlari where id = 1;

  -- 1) ÇALIŞMA SÜRESİ
  begin
    v_sure := coalesce(
      nullif(trim(coalesce(p_cs->>'work_hours','')),'')::numeric,
      nullif(trim(coalesce(p_cs->>'sure_saat','')),'')::numeric, 0);
  exception when others then v_sure := 0; end;

  -- Süre yoksa parça sayısından tahmin et (her parça ~0.6 saat)
  if v_sure <= 0 then
    begin
      v_parca := coalesce(jsonb_array_length(
        case when jsonb_typeof(p_cs->'materials') = 'array' then p_cs->'materials' else '[]'::jsonb end), 0);
      v_sure := v_parca * 0.6;
    exception when others then v_sure := 0; end;
  end if;

  -- Süre puanı: 8 saat ve üzeri = tam puan (lineer)
  v_sure_p := least(coalesce(v_a.sure_puan, 35), (v_sure / 8.0) * coalesce(v_a.sure_puan, 35));

  -- 2) PARÇA KARMAŞIKLIĞI
  begin
    v_parca := coalesce(jsonb_array_length(
      case when jsonb_typeof(p_cs->'materials') = 'array' then p_cs->'materials' else '[]'::jsonb end), 0);
    -- İşçilik kalemlerini sayma
    if v_parca > 0 then
      select count(*) into v_parca from (
        select 1 from jsonb_array_elements(p_cs->'materials') m
        where not public.iscilik_mi(coalesce(m->>'ad', m->>'name',''))
      ) x;
    end if;
  exception when others then v_parca := 0; end;

  v_parca_p := case
    when v_parca = 0 then 0
    when v_parca <= 2 then coalesce(v_a.parca_puan,25) * 0.32
    when v_parca <= 5 then coalesce(v_a.parca_puan,25) * 0.60
    when v_parca <= 9 then coalesce(v_a.parca_puan,25) * 0.84
    else coalesce(v_a.parca_puan,25) end;

  -- 3) İŞ TİPİ
  v_tip := public.parca_adi_normal(coalesce(p_cs->>'service_type',''));
  v_tip_p := case
    when v_tip like '%ariza%' or v_tip like '%arıza%' then coalesce(v_a.tip_puan,15)
    when v_tip like '%montaj%' then coalesce(v_a.tip_puan,15) * 0.8
    when v_tip like '%bakim%' or v_tip like '%bakım%' then coalesce(v_a.tip_puan,15) * 0.4
    when v_tip like '%garanti%' then coalesce(v_a.tip_puan,15) * 0.5
    when v_tip like '%yarim%' or v_tip like '%yarım%' then coalesce(v_a.tip_puan,15) * 0.3
    else coalesce(v_a.tip_puan,15) * 0.55 end;

  -- 4) İŞ BÜYÜKLÜĞÜ (bedel)
  begin
    v_bedel := coalesce(nullif(trim(coalesce(p_cs->>'price','')),'')::numeric, 0);
  exception when others then v_bedel := 0; end;

  v_bedel_p := case
    when v_bedel <= 0 then 0
    when v_bedel < 2000 then coalesce(v_a.bedel_puan,15) * 0.15
    when v_bedel < 6000 then coalesce(v_a.bedel_puan,15) * 0.35
    when v_bedel < 15000 then coalesce(v_a.bedel_puan,15) * 0.60
    when v_bedel < 40000 then coalesce(v_a.bedel_puan,15) * 0.82
    else coalesce(v_a.bedel_puan,15) end;

  -- 5) MÜŞTERİ MEMNUNİYETİ (service_reports'tan — ayrı hesaplanır, burada 0)
  -- (dışarıdan eklenir)

  v_puan := round(v_sure_p + v_parca_p + v_tip_p + v_bedel_p, 1);

  v_etiket := case
    when v_puan >= 80 then '🔴 ÇOK AĞIR'
    when v_puan >= 60 then '🟠 AĞIR'
    when v_puan >= 40 then '🟡 ORTA'
    when v_puan >= 20 then '🔵 HAFİF'
    else '⚪ ÇOK KOLAY' end;

  return jsonb_build_object(
    'puan', v_puan, 'etiket', v_etiket,
    'sure', round(v_sure, 2), 'sure_puan', round(v_sure_p, 1),
    'parca', v_parca, 'parca_puan', round(v_parca_p, 1),
    'tip', coalesce(p_cs->>'service_type','-'), 'tip_puan', round(v_tip_p, 1),
    'bedel', v_bedel, 'bedel_puan', round(v_bedel_p, 1));
end $$;

revoke all on function public.is_agirlik_puani(jsonb) from public;
grant execute on function public.is_agirlik_puani(jsonb) to authenticated;


-- ============================================================================
-- 3) 💰 PERSONEL PRİM DETAYI (aylık, iş iş)
-- ============================================================================
create or replace function public.personel_prim_detay(
  p_personel text,
  p_ay text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ay text := coalesce(p_ay, to_char(current_date,'YYYY-MM'));
  v_nm text := public.parca_adi_normal(p_personel);
  v_a record;
  v_isler jsonb := '[]'::jsonb;
  v_r record;
  v_toplam_prim numeric := 0;
  v_is_sayisi integer := 0;
  v_ort_puan numeric := 0;
  v_ort_memnuniyet numeric;
begin
  select * into v_a from public.prim_ayarlari where id = 1;

  for v_r in
    select
      cs.id,
      cs.service_date::date as tarih,
      public.cs_isim(to_jsonb(cs)) as musteri,
      coalesce(cs.service_type,'Servis') as tip,
      coalesce(cs.work_hours,0) as sure,
      coalesce(cs.price,0) as bedel,
      public.is_agirlik_puani(to_jsonb(cs)) as agirlik,
      -- Müşteri memnuniyeti (aynı müşteri + aynı gün rapor)
      (select round(avg((to_jsonb(sr)->>'musteri_puani')::numeric),1)
         from public.service_reports sr
        where nullif(trim(coalesce(to_jsonb(sr)->>'musteri_puani','')),'') is not null
          and public.parca_adi_normal(public.jalan(to_jsonb(sr),'musteri_adi','customer_name')) = public.cs_isim_normal(to_jsonb(cs))
          and sr.created_at::date between cs.service_date::date - 7 and cs.service_date::date + 7
      ) as memnuniyet
    from public.completed_services cs
    where to_char(cs.service_date::date,'YYYY-MM') = v_ay
      -- ⭐ SADECE BİTEN İŞLER: para girilmiş (price > 0)
      and coalesce(cs.price, 0) > 0
      -- ⭐ Personel eşleşmesi (tam isim)
      and coalesce(trim(cs.technician),'') <> ''
      and public.parca_adi_normal(cs.technician) like '%' || v_nm || '%'
    order by cs.service_date
  loop
    declare
      v_puan numeric := coalesce((v_r.agirlik->>'puan')::numeric, 0);
      v_memn_puan numeric := 0;
      v_toplam_puan numeric;
      v_prim numeric;
      v_memn numeric := v_r.memnuniyet;
    begin
      -- Memnuniyet puanı
      if v_memn is not null then
        v_memn_puan := case
          when v_memn >= 4.5 then coalesce(v_a.memnuniyet_puan,10)
          when v_memn >= 3.5 then coalesce(v_a.memnuniyet_puan,10) * 0.7
          when v_memn >= 2.5 then coalesce(v_a.memnuniyet_puan,10) * 0.4
          when v_memn >= 1.5 then coalesce(v_a.memnuniyet_puan,10) * 0.15
          else 0 end;
      end if;

      v_toplam_puan := least(100, v_puan + v_memn_puan);
      v_prim := greatest(coalesce(v_a.min_prim,50),
                         round((v_toplam_puan / 100.0) * coalesce(v_a.maks_prim,1200)));

      v_toplam_prim := v_toplam_prim + v_prim;
      v_is_sayisi := v_is_sayisi + 1;
      v_ort_puan := v_ort_puan + v_toplam_puan;

      v_isler := v_isler || jsonb_build_object(
        'tarih', to_char(v_r.tarih,'DD.MM.YYYY'),
        'musteri', v_r.musteri,
        'tip', v_r.tip,
        'sure', round(v_r.sure, 1),
        'bedel', round(v_r.bedel),
        'agirlik_puan', v_toplam_puan,
        'etiket', v_r.agirlik->>'etiket',
        'memnuniyet', v_memn,
        'prim', v_prim);
    end;
  end loop;

  if v_is_sayisi > 0 then v_ort_puan := round(v_ort_puan / v_is_sayisi, 1); end if;

  return jsonb_build_object(
    'personel', p_personel,
    'ay', v_ay,
    'is_sayisi', v_is_sayisi,
    'ortalama_agirlik', v_ort_puan,
    'toplam_prim', round(v_toplam_prim),
    'maks_prim', coalesce(v_a.maks_prim, 1200),
    'isler', v_isler);
end $$;

revoke all on function public.personel_prim_detay(text, text) from public;
grant execute on function public.personel_prim_detay(text, text) to authenticated;


-- ============================================================================
-- 4) 📊 PRİM ÖZETİ — tüm personel (aylık toplam)
-- ============================================================================
create or replace function public.prim_ozet(p_ay text default null)
returns table (
  personel text, maas numeric, is_sayisi integer, ortalama_agirlik numeric,
  toplam_prim numeric, prim_orani numeric, toplam_maliyet numeric, zor_is integer, kolay_is integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ay text := coalesce(p_ay, to_char(current_date,'YYYY-MM'));
  v_r record;
  v_detay jsonb;
begin
  for v_r in
    select pm.personel as ad, pm.maas as maas
    from public.personel_maas pm where pm.aktif
    order by pm.maas desc
  loop
    v_detay := public.personel_prim_detay(v_r.ad, v_ay);

    personel := v_r.ad;
    maas := coalesce(v_r.maas, 0);
    is_sayisi := coalesce((v_detay->>'is_sayisi')::int, 0);
    ortalama_agirlik := coalesce((v_detay->>'ortalama_agirlik')::numeric, 0);
    toplam_prim := coalesce((v_detay->>'toplam_prim')::numeric, 0);
    prim_orani := case when coalesce(v_r.maas,0) > 0
                       then round((toplam_prim / v_r.maas) * 100, 1) else 0 end;
    toplam_maliyet := coalesce(v_r.maas, 0) + toplam_prim;

    -- Zor/kolay iş sayısı
    zor_is := coalesce((
      select count(*)::int from jsonb_array_elements(v_detay->'isler') i
      where (i->>'agirlik_puan')::numeric >= 60), 0);
    kolay_is := coalesce((
      select count(*)::int from jsonb_array_elements(v_detay->'isler') i
      where (i->>'agirlik_puan')::numeric < 40), 0);

    return next;
  end loop;
end $$;

revoke all on function public.prim_ozet(text) from public;
grant execute on function public.prim_ozet(text) to authenticated;


-- ============================================================================
-- 5) ⚙️ AYAR KAYDET
-- ============================================================================
create or replace function public.prim_ayar_kaydet(
  p_maks numeric default null, p_min numeric default null,
  p_hedef integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.buvisan_admin_mi() then
    return jsonb_build_object('ok', false, 'mesaj', 'Yetkiniz yok.');
  end if;

  update public.prim_ayarlari
     set maks_prim = coalesce(p_maks, maks_prim),
         min_prim  = coalesce(p_min, min_prim),
         aylik_hedef_is = coalesce(p_hedef, aylik_hedef_is),
         guncelleme = now()
   where id = 1;

  return jsonb_build_object('ok', true, 'mesaj', 'Prim ayarları kaydedildi.');
end $$;

revoke all on function public.prim_ayar_kaydet(numeric, numeric, integer) from public;
grant execute on function public.prim_ayar_kaydet(numeric, numeric, integer) to authenticated;


-- ============================================================================
-- 6) 🧪 TEST — bu ayki prim tablosu
-- ============================================================================
select * from public.prim_ozet();

-- Örnek iş ağırlık puanları
select
  'AĞIR: 8 saat + 6 parça + arıza + 25.000 ₺' as senaryo,
  (public.is_agirlik_puani(
    '{"work_hours":8,"price":25000,"service_type":"Arıza","materials":[{"ad":"Rulman"},{"ad":"Keçe"},{"ad":"Halat"},{"ad":"Dişli"},{"ad":"Motor"},{"ad":"Sensör"}]}'::jsonb
  ) ->> 'puan') as puan,
  (public.is_agirlik_puani(
    '{"work_hours":8,"price":25000,"service_type":"Arıza","materials":[{"ad":"Rulman"},{"ad":"Keçe"},{"ad":"Halat"},{"ad":"Dişli"},{"ad":"Motor"},{"ad":"Sensör"}]}'::jsonb
  ) ->> 'etiket') as etiket
union all
select
  'KOLAY: 0.2 saat + 0 parça + bakım + 800 ₺',
  (public.is_agirlik_puani('{"work_hours":0.2,"price":800,"service_type":"Servis","materials":[]}'::jsonb) ->> 'puan'),
  (public.is_agirlik_puani('{"work_hours":0.2,"price":800,"service_type":"Servis","materials":[]}'::jsonb) ->> 'etiket')
union all
select
  'ORTA: 3 saat + 2 parça + arıza + 6.000 ₺',
  (public.is_agirlik_puani('{"work_hours":3,"price":6000,"service_type":"Arıza","materials":[{"ad":"Conta"},{"ad":"Vida"}]}'::jsonb) ->> 'puan'),
  (public.is_agirlik_puani('{"work_hours":3,"price":6000,"service_type":"Arıza","materials":[{"ad":"Conta"},{"ad":"Vida"}]}'::jsonb) ->> 'etiket');
