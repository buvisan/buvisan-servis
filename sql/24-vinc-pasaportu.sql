-- ============================================================================
--  🏗️ VİNÇ PASAPORTU + VERİ TEMİZLİĞİ (Büyük Güncelleme #1)
-- ----------------------------------------------------------------------------
--  SORUNLAR (analizde kanıtlandı):
--    1) 624 servis kaydının HİÇBİRİ vinç kimliğine bağlı değil (crane_id boş)
--       → QR okutulduğunda "Servis Geçmişi: 0 kayıt" görünüyor
--    2) Aynı müşteri farklı yazımlarla kayıtlı:
--         "Metal World Structures for Contracting" + "  Metal World..." (başında boşluk)
--         "ARMATECH MAKİNA" + "ARMATECH"      → raporlar bölünüyor
--         "TİMAK MÜHENDİSLİK" + "TİMAK"
--
--  ÇÖZÜM (VERİYE ZARAR VERMEDEN):
--    Servis kayıtlarını vinçlere yazmak yerine, MÜŞTERİ ADINDAN eşleştiren
--    fonksiyonlar kurulur. Böylece:
--      • Vinç kaydı DEĞİŞMEZ (QR'lar aynı kalır — kırmızı çizgi korunur)
--      • QR sayfası vincin gerçek servis geçmişini gösterebilir
--      • Yazım ikizleri tespit edilir ve TEK TEK onayına sunulur
--
--  ⚠️ BU SCRIPT HİÇBİR VERİYİ DEĞİŞTİRMEZ. Sadece okur, raporlar, öneri sunar.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) VİNCİN SERVİS GEÇMİŞİ (müşteri adından eşleştirme)
--    QR pasaportunun motoru — vinç kaydına dokunmaz.
-- ============================================================================
create or replace function public.vinc_servis_gecmisi(p_crane_id uuid)
returns table (
  servis_tarihi   date,
  aciklama        text,
  tutar           numeric,
  teknisyen       text,
  servis_turu     text,
  kullanilan_parca text,
  form_no         text,
  calisma_saati   numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with vinc as (
    select public.parca_adi_normal(customer_name) as firma_norm
    from public.cranes
    where id = p_crane_id
  )
  select
    cs.service_date,
    cs.description,
    coalesce(cs.price, 0)::numeric,
    cs.technician,
    cs.service_type,
    coalesce(nullif(trim(cs.materials_text), ''), cs.materials::text),
    cs.form_number,
    coalesce(cs.work_hours, 0)::numeric
  from public.completed_services cs
  cross join vinc v
  where v.firma_norm is not null
    and public.parca_adi_normal(cs.customer_text) = v.firma_norm
  order by cs.service_date desc;
$$;

revoke all on function public.vinc_servis_gecmisi(uuid) from public;
grant execute on function public.vinc_servis_gecmisi(uuid) to authenticated, anon;


-- ============================================================================
-- 2) VİNÇ PASAPORT ÖZETİ (QR sayfası için tek çağrı)
-- ============================================================================
create or replace function public.vinc_pasaportu(p_crane_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with vinc as (
    select id, customer_name, serial_number, model_name, capacity,
           public.parca_adi_normal(customer_name) as firma_norm
    from public.cranes where id = p_crane_id
  ),
  gecmis as (
    select * from public.vinc_servis_gecmisi(p_crane_id)
  )
  select jsonb_build_object(
    'vinc_id',        (select id from vinc),
    'musteri',        (select customer_name from vinc),
    'seri_no',        (select serial_number from vinc),
    'model',          (select model_name from vinc),
    'kapasite',       (select capacity from vinc),
    'servis_sayisi',  (select count(*) from gecmis),
    'toplam_servis_tutari', (select coalesce(sum(tutar), 0) from gecmis),
    'ilk_servis',     (select min(servis_tarihi) from gecmis),
    'son_servis',     (select max(servis_tarihi) from gecmis),
    'son_servis_gun_once',
      (select case when max(servis_tarihi) is null then null
                   else (current_date - max(servis_tarihi))::int end from gecmis),
    'toplam_calisma_saati', (select coalesce(sum(calisma_saati), 0) from gecmis),
    'bakim_durumu',
      case
        when (select count(*) from gecmis) = 0 then 'KAYIT YOK'
        when (select max(servis_tarihi) from gecmis) < current_date - interval '8 months' then 'BAKIM GECİKMİŞ'
        when (select max(servis_tarihi) from gecmis) < current_date - interval '5 months' then 'BAKIM YAKLAŞIYOR'
        else 'GÜNCEL'
      end,
    'kullanilan_parcalar',
      (select coalesce(jsonb_agg(distinct kullanilan_parca), '[]'::jsonb)
         from gecmis where coalesce(kullanilan_parca, '') <> '')
  );
$$;

revoke all on function public.vinc_pasaportu(uuid) from public;
grant execute on function public.vinc_pasaportu(uuid) to authenticated, anon;


-- ============================================================================
-- 3) MÜŞTERİ YAZIM İKİZLERİ (temizlenecek liste)
-- ============================================================================
create or replace function public.musteri_ikizleri()
returns table (
  vinc_sayisi   bigint,
  varyantlar    text,
  onerilen_ad   text,
  servis_sayisi bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with gruplar as (
    select
      public.parca_adi_normal(customer_name) as norm,
      trim(customer_name)                    as ad,
      count(*)                               as vinc
    from public.cranes
    where coalesce(trim(customer_name), '') <> ''
    group by 1, 2
  )
  select
    sum(g.vinc),
    string_agg(g.ad || ' (' || g.vinc || ')', '  |  ' order by g.vinc desc),
    (array_agg(g.ad order by g.vinc desc))[1],
    (select count(*) from public.completed_services cs
      where public.parca_adi_normal(cs.customer_text) = g.norm)
  from gruplar g
  group by g.norm
  having count(*) > 1
  order by sum(g.vinc) desc;
$$;

revoke all on function public.musteri_ikizleri() from public;
grant execute on function public.musteri_ikizleri() to authenticated;


-- ============================================================================
-- 4) EŞLEŞTİRME ÖZETİ (kaç servis vincine bağlanabiliyor?)
-- ============================================================================
create or replace function public.pasaport_ozeti()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with vinc_firmalari as (
    select distinct public.parca_adi_normal(customer_name) as norm
    from public.cranes
    where coalesce(trim(customer_name), '') <> ''
  ),
  servisler as (
    select
      public.parca_adi_normal(customer_text) as norm,
      service_date, coalesce(price, 0) as price
    from public.completed_services
    where coalesce(trim(customer_text), '') <> ''
  )
  select jsonb_build_object(
    'toplam_vinc',          (select count(*) from public.cranes),
    'toplam_servis',        (select count(*) from public.completed_services),
    'eslesen_servis',       (select count(*) from servisler s
                              where exists (select 1 from vinc_firmalari v where v.norm = s.norm)),
    'eslesmeyen_servis',    (select count(*) from servisler s
                              where not exists (select 1 from vinc_firmalari v where v.norm = s.norm)),
    'eslesen_tutar',        (select coalesce(sum(s.price), 0) from servisler s
                              where exists (select 1 from vinc_firmalari v where v.norm = s.norm)),
    'servisi_olan_vinc',    (select count(*) from public.cranes c
                              where exists (select 1 from servisler s
                                             where s.norm = public.parca_adi_normal(c.customer_name))),
    'ikiz_musteri_grubu',   (select count(*) from public.musteri_ikizleri())
  );
$$;

revoke all on function public.pasaport_ozeti() from public;
grant execute on function public.pasaport_ozeti() to authenticated;


-- ============================================================================
-- 5) KONTROL: DURUM NE?
-- ============================================================================
select
  (public.pasaport_ozeti() ->> 'toplam_vinc')        as toplam_vinc,
  (public.pasaport_ozeti() ->> 'toplam_servis')      as toplam_servis,
  (public.pasaport_ozeti() ->> 'eslesen_servis')     as eslesen_servis,
  (public.pasaport_ozeti() ->> 'servisi_olan_vinc')  as servisi_olan_vinc,
  (public.pasaport_ozeti() ->> 'ikiz_musteri_grubu') as ikiz_grup;

-- Temizlenecek yazım ikizleri
select vinc_sayisi, onerilen_ad, servis_sayisi, varyantlar
from public.musteri_ikizleri()
limit 20;
