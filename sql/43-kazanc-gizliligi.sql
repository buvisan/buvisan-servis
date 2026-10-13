-- ============================================================================
--  🔒 KAZANÇ GİZLİLİĞİ + PUANTAJ GÜVENLİĞİ (Güncelleme #21) — KRİTİK
-- ----------------------------------------------------------------------------
--  AÇIK: personel_kazanc() fonksiyonu "authenticated" rolüne açıktı.
--        Yani giriş yapan HERHANGİ bir personel, başka bir personelin adını
--        yazıp MAAŞINI görebilirdi. Bu kabul edilemez.
--
--  ÇÖZÜM:
--    1) benim_adim() → giriş yapan kişinin adını bulur
--    2) personel_kazanc() → SADECE kendi kazancını görebilir (yönetici hepsini)
--    3) personel_kazanc_listesi() → SADECE yönetici
--    4) personnel_monthly_lists tablosuna RLS → personel başkasının puantajını
--       okuyamasın
--
--  ⚠️ Veri değiştirmez. Sadece yetki kurallarını sıkılaştırır.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) GİRİŞ YAPAN KİŞİNİN ADI
-- ============================================================================
create or replace function public.benim_adim()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.full_name from public.profiles p where p.id = auth.uid()),
    ''
  );
$$;

revoke all on function public.benim_adim() from public;
grant execute on function public.benim_adim() to authenticated;


-- ============================================================================
-- 2) KAZANÇ FONKSİYONU — SADECE KENDİ KAZANCI (yönetici hepsini görür)
-- ============================================================================
create or replace function public.personel_kazanc(
  p_personel text,
  p_ay       text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sonuc jsonb;
begin
  -- 🔒 YETKİ KONTROLÜ: kendi adı VEYA yönetici
  if not (
    public.buvisan_admin_mi()
    or public.parca_adi_normal(p_personel) = public.parca_adi_normal(public.benim_adim())
  ) then
    return jsonb_build_object(
      'yetki_yok', true,
      'mesaj', 'Sadece kendi kazanç bilginizi görebilirsiniz.'
    );
  end if;

  with sec as (
    select coalesce(p_ay, to_char(current_date, 'YYYY-MM')) as ay
  ),
  kayit as (
    select p.value as veri
    from public.personnel_monthly_lists pml
    cross join sec
    cross join lateral jsonb_array_elements(coalesce(pml.personnel_data, '[]'::jsonb)) p
    where pml.month_key = sec.ay
      and public.parca_adi_normal(p.value ->> 'ad') = public.parca_adi_normal(p_personel)
    limit 1
  ),
  isler as (
    select
      count(*)                                  as adet,
      coalesce(sum(cs.price), 0)                as ciro,
      coalesce(sum(cs.work_hours), 0)           as saat,
      count(*) filter (where extract(dow from cs.service_date) = 6) as cumartesi_is,
      count(*) filter (where extract(dow from cs.service_date) = 0) as pazar_is
    from public.completed_services cs
    cross join sec
    where to_char(cs.service_date, 'YYYY-MM') = sec.ay
      and coalesce(cs.technician, '') <> ''
      and public.parca_adi_normal(cs.technician) like '%' || public.parca_adi_normal(p_personel) || '%'
  ),
  h as (
    select
      coalesce((select (veri ->> 'maas')::numeric from kayit), 0)           as maas,
      coalesce((select (veri ->> 'mesai50_saat')::numeric from kayit), 0)   as m50_saat,
      coalesce((select (veri ->> 'mesai100_saat')::numeric from kayit), 0)  as m100_saat,
      coalesce((select (veri ->> 'avans')::numeric from kayit), 0)          as avans,
      coalesce((select (veri ->> 'kesinti')::numeric from kayit), 0)        as kesinti,
      coalesce((select (veri ->> 'yemek')::numeric from kayit), 0)          as yemek,
      coalesce((select (veri ->> 'prim')::numeric from kayit), 0)           as prim,
      coalesce((select (veri ->> 'eksik_saat')::numeric from kayit), 0)     as eksik_saat,
      (select count(*) from kayit)                                          as kayit_var
  ),
  hesap as (
    select
      h.*,
      public.saatlik_ucret(h.maas)                               as saatlik,
      round(public.saatlik_ucret(h.maas) * h.m50_saat * 1.5, 2)  as m50_tutar,
      round(public.saatlik_ucret(h.maas) * h.m100_saat * 2.0, 2) as m100_tutar
    from h
  )
  select jsonb_build_object(
    'personel',       p_personel,
    'ay',             (select ay from sec),
    'kayit_var',      (h.kayit_var > 0),
    'maas',           h.maas,
    'saatlik_ucret',  h.saatlik,
    'mesai50_saat',   h.m50_saat,
    'mesai50_tutar',  h.m50_tutar,
    'mesai100_saat',  h.m100_saat,
    'mesai100_tutar', h.m100_tutar,
    'toplam_mesai',   round(h.m50_tutar + h.m100_tutar, 2),
    'prim',           h.prim,
    'yemek',          h.yemek,
    'avans',          h.avans,
    'kesinti',        h.kesinti,
    'eksik_saat',     h.eksik_saat,
    'net_ele_gecen',  round(h.maas + h.m50_tutar + h.m100_tutar + h.prim + h.yemek - h.avans - h.kesinti, 2),
    'is_sayisi',      (select adet from isler),
    'toplam_ciro',    round((select ciro from isler), 0),
    'calisma_saati',  (select saat from isler),
    'cumartesi_is',   (select cumartesi_is from isler),
    'pazar_is',       (select pazar_is from isler)
  )
  into v_sonuc
  from hesap h;

  return v_sonuc;
end;
$$;

revoke all on function public.personel_kazanc(text, text) from public;
grant execute on function public.personel_kazanc(text, text) to authenticated;


-- ============================================================================
-- 3) LİSTE FONKSİYONU — SADECE YÖNETİCİ
-- ============================================================================
create or replace function public.personel_kazanc_listesi(p_ay text default null)
returns table (
  personel        text,
  maas            numeric,
  mesai50_saat    numeric,
  mesai100_saat   numeric,
  toplam_mesai    numeric,
  avans           numeric,
  kesinti         numeric,
  net_ele_gecen   numeric,
  is_sayisi       bigint,
  toplam_ciro     numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- 🔒 Sadece yönetici tüm personelin kazancını görebilir
  if not public.buvisan_admin_mi() then
    raise exception 'YETKI_YOK: Bu listeyi sadece yönetici görebilir.';
  end if;

  return query
  with sec as (select coalesce(p_ay, to_char(current_date, 'YYYY-MM')) as ay),
  kisiler as (
    select distinct (p.value ->> 'ad') as ad
    from public.personnel_monthly_lists pml
    cross join sec
    cross join lateral jsonb_array_elements(coalesce(pml.personnel_data, '[]'::jsonb)) p
    where pml.month_key = sec.ay and coalesce(trim(p.value ->> 'ad'), '') <> ''
  )
  select
    k.ad,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'maas')::numeric,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'mesai50_saat')::numeric,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'mesai100_saat')::numeric,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'toplam_mesai')::numeric,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'avans')::numeric,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'kesinti')::numeric,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'net_ele_gecen')::numeric,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'is_sayisi')::bigint,
    (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'toplam_ciro')::numeric
  from kisiler k
  order by (public.personel_kazanc(k.ad, (select ay from sec)) ->> 'net_ele_gecen')::numeric desc;
end;
$$;

revoke all on function public.personel_kazanc_listesi(text) from public;
grant execute on function public.personel_kazanc_listesi(text) to authenticated;


-- ============================================================================
-- 4) PUANTAJ TABLOSUNA RLS (maaş verisi doğrudan okunamasın)
-- ============================================================================
alter table public.personnel_monthly_lists enable row level security;

-- Eski gevşek politikaları temizle
do $$
declare
  r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'personnel_monthly_lists'
  loop
    execute format('drop policy if exists %I on public.personnel_monthly_lists', r.policyname);
  end loop;
end $$;

-- Sadece yönetici okuyup yazabilir (personel kendi verisini FONKSİYON üzerinden görür)
create policy puantaj_yonetici on public.personnel_monthly_lists
  for all to authenticated
  using (public.buvisan_admin_mi())
  with check (public.buvisan_admin_mi());

revoke all on public.personnel_monthly_lists from anon;


-- ============================================================================
-- 5) KONTROL
-- ============================================================================
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('benim_adim','personel_kazanc','personel_kazanc_listesi'))   as fonksiyonlar,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'personnel_monthly_lists') as puantaj_politika,
  'Kendi adınız: ' || coalesce(public.benim_adim(), '(bulunamadı)')  as giris_yapan;
