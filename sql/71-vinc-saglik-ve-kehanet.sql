-- ============================================================================
--  🏗️ FAZ 2 — VİNÇ SAĞLIK SKORU + ARIZA KEHANETİ + KURUMSAL HAFIZA
-- ----------------------------------------------------------------------------
--  NE YAPAR?
--    1) vinc_saglik_skoru()    → her vincin 0-100 sağlık puanı
--    2) vinc_saglik_listesi()  → tüm vinçler, en riskliden başlayarak
--    3) ariza_kehanet()        → "60 gün içinde arıza riski %68"
--    4) parca_omur_analizi()   → "Rulman ortalama 8 ayda değişiyor"
--    5) kurumsal_hafiza()      → "Bu vinçte 3 kez aynı arıza oldu"
--    6) model_analizi()        → model bazlı arıza desenleri
--
--  TASARIM İLKELERİ:
--    • Veri yoksa ÇÖKMEZ → makul varsayılan puan döner
--    • Servis kayıtları vinç kimliğiyle bağlı değil → MÜŞTERİ ADIYLA eşleşir
--    • Türkçe harf toleranslı (parca_adi_normal)
--    • jsonb döner → yeni alan eklemek kodu bozmaz
--    • stable + security definer → hızlı ve güvenli
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 0) YARDIMCI: bölme (sıfıra bölme korumalı)
-- ============================================================================
create or replace function public.guvenli_bol(pay numeric, payda numeric, varsayilan numeric default 0)
returns numeric
language sql
immutable
as $$
  select case when coalesce(payda, 0) = 0 then coalesce(varsayilan, 0)
              else coalesce(pay, 0) / payda end;
$$;


-- ============================================================================
-- 1) 🏗️ VİNÇ SAĞLIK SKORU — 0-100
--    Ağırlıklar: Bakım %40 · Arıza sıklığı %25 · Son arıza %20 · Memnuniyet %15
-- ============================================================================
create or replace function public.vinc_saglik_skoru(p_crane_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c            record;
  v_musteri      text;
  v_bakim_puan   numeric := 20;   -- varsayılan: bilgi yok
  v_ariza_puan   numeric := 15;
  v_tazelik_puan numeric := 15;
  v_memnun_puan  numeric := 12;
  v_skor         numeric;
  v_ariza_sayisi integer := 0;
  v_is_sayisi    integer := 0;
  v_son_ariza    date;
  v_gun_once     integer;
  v_ort_ariza    numeric := 0;
  v_puan_ort     numeric;
  v_bakim_gun    integer;
  v_seviye       text;
  v_renk         text;
begin
  select * into v_c from public.cranes where id = p_crane_id;
  if v_c.id is null then
    return jsonb_build_object('skor', 0, 'seviye', 'Bulunamadı', 'renk', 'slate');
  end if;

  v_musteri := coalesce(nullif(trim(coalesce(v_c.customer_name, '')), ''), '');

  -- ─── Müşterinin servis geçmişi (ad üzerinden eşleşir) ───
  if v_musteri <> '' then
    begin
      select count(*) into v_is_sayisi
      from public.completed_services cs
      where public.parca_adi_normal(
              coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                       nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
            = public.parca_adi_normal(v_musteri);

      select count(*), max(cs.service_date::date) into v_ariza_sayisi, v_son_ariza
      from public.completed_services cs
      where public.parca_adi_normal(
              coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                       nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
            = public.parca_adi_normal(v_musteri)
        and (
          coalesce(cs.service_type,'') ilike '%arıza%'
          or coalesce(cs.service_type,'') ilike '%ariza%'
          or coalesce(cs.description,'') ~* '(ar[ıi]za|bozuk|de[ğg]i[şs]meli|ka[çc]ak|çalışmıyor|patlak|k[ıi]r[ıi]k)'
        );
    exception when others then null; end;
  end if;

  -- ─── 1) BAKIM UYUMU (0-40) ───
  begin
    if v_c.next_maintenance_date is not null then
      v_bakim_gun := (v_c.next_maintenance_date - current_date);
      if v_bakim_gun < 0 then
        -- GECİKMİŞ → ceza (her 30 gün için -8 puan, en az 5)
        v_bakim_puan := greatest(5, 40 - (abs(v_bakim_gun) / 30.0 * 8));
      elsif v_bakim_gun <= 30 then
        v_bakim_puan := 34;   -- yakında bakım var (planlı)
      else
        v_bakim_puan := 40;   -- bakımı düzenli
      end if;
    else
      v_bakim_puan := 15;     -- bakım tarihi girilmemiş
    end if;
  exception when others then v_bakim_puan := 15; end;

  -- ─── 2) ARIZA SIKLIĞI (0-25) ───
  -- Müşteri başına ortalama arıza ~1.8/yıl → bunun üstü riskli
  begin
    if v_is_sayisi > 0 then
      v_ort_ariza := round(v_ariza_sayisi::numeric / greatest(1, (v_is_sayisi / 12.0) ), 2);
      if v_ariza_sayisi = 0 then
        v_ariza_puan := 25;
      elsif v_ariza_sayisi <= 2 then
        v_ariza_puan := 20;
      elsif v_ariza_sayisi <= 5 then
        v_ariza_puan := 13;
      elsif v_ariza_sayisi <= 10 then
        v_ariza_puan := 7;
      else
        v_ariza_puan := 3;
      end if;
    else
      v_ariza_puan := 18;    -- hiç servis kaydı yok → bilinmiyor
    end if;
  exception when others then v_ariza_puan := 15; end;

  -- ─── 3) SON ARIZA TAZELİĞİ (0-20) ───
  begin
    if v_son_ariza is not null then
      v_gun_once := (current_date - v_son_ariza);
      if v_gun_once <= 30 then
        v_tazelik_puan := 4;    -- çok yakın → riskli
      elsif v_gun_once <= 90 then
        v_tazelik_puan := 9;
      elsif v_gun_once <= 180 then
        v_tazelik_puan := 14;
      else
        v_tazelik_puan := 20;   -- uzun süredir sorun yok
      end if;
    else
      v_tazelik_puan := 16;
    end if;
  exception when others then v_tazelik_puan := 15; end;

  -- ─── 4) MÜŞTERİ MEMNUNİYETİ (0-15) ───
  begin
    select round(avg(r.musteri_puani), 1) into v_puan_ort
    from public.service_reports r
    where r.musteri_puani is not null
      and public.parca_adi_normal(coalesce(to_jsonb(r)->>'musteri_adi','')) = public.parca_adi_normal(v_musteri);
    if v_puan_ort is not null then
      v_memnun_puan := round((v_puan_ort / 5.0) * 15, 1);
    end if;
  exception when others then null; end;

  v_skor := round(v_bakim_puan + v_ariza_puan + v_tazelik_puan + v_memnun_puan, 1);
  v_skor := greatest(0, least(100, v_skor));

  v_seviye := case when v_skor >= 80 then '🟢 İYİ'
                   when v_skor >= 60 then '🟡 ORTA'
                   when v_skor >= 40 then '🟠 ZAYIF'
                   else '🔴 KÖTÜ' end;
  v_renk   := case when v_skor >= 80 then 'emerald'
                   when v_skor >= 60 then 'amber'
                   when v_skor >= 40 then 'orange'
                   else 'rose' end;

  return jsonb_build_object(
    'crane_id', v_c.id,
    'musteri', v_musteri,
    'vinç', coalesce(nullif(trim(coalesce(v_c.crane_capacity,'')),''), 'Belirsiz'),
    'makine_tipi', coalesce(nullif(trim(coalesce(v_c.makine_tipi,'')),''), 'Vinç'),
    'skor', v_skor,
    'seviye', v_seviye,
    'renk', v_renk,
    'bakim_puan', round(v_bakim_puan,1),
    'ariza_puan', round(v_ariza_puan,1),
    'tazelik_puan', round(v_tazelik_puan,1),
    'memnuniyet_puan', round(v_memnun_puan,1),
    'toplam_servis', v_is_sayisi,
    'ariza_sayisi', v_ariza_sayisi,
    'son_ariza', case when v_son_ariza is not null then to_char(v_son_ariza,'DD.MM.YYYY') else null end,
    'gun_once', v_gun_once,
    'yillik_ariza', v_ort_ariza,
    'bakim_tarihi', case when v_c.next_maintenance_date is not null then to_char(v_c.next_maintenance_date,'DD.MM.YYYY') else null end,
    'bakim_gecikme_gun', case when v_c.next_maintenance_date is not null then (current_date - v_c.next_maintenance_date) else null end,
    'musteri_puani', v_puan_ort
  );
end $$;

revoke all on function public.vinc_saglik_skoru(uuid) from public;
grant execute on function public.vinc_saglik_skoru(uuid) to authenticated;


-- ============================================================================
-- 2) 📋 SAĞLIK LİSTESİ — en riskliden başlayarak
-- ============================================================================
create or replace function public.vinc_saglik_listesi(
  p_limit  integer default 50,
  p_siralama text default 'riskli'   -- riskli | iyi | musteri
)
returns table (
  crane_id      uuid,
  musteri       text,
  vinc          text,
  makine_tipi   text,
  skor          numeric,
  seviye        text,
  renk          text,
  toplam_servis integer,
  ariza_sayisi  integer,
  son_ariza     text,
  bakim_tarihi  text,
  gecikme_gun   integer
)
language sql
stable
security definer
set search_path = public
as $$
  with skorlar as (
    -- ⚡ PERFORMANS: fonksiyon her vinç için SADECE BİR KEZ çağrılır
    select c.id, c.customer_name, public.vinc_saglik_skoru(c.id) as s
    from public.cranes c
    where coalesce(c.customer_name,'') <> ''
  )
  select
    (s ->> 'crane_id')::uuid,
    s ->> 'musteri',
    s ->> 'vinç',
    s ->> 'makine_tipi',
    (s ->> 'skor')::numeric,
    s ->> 'seviye',
    s ->> 'renk',
    (s ->> 'toplam_servis')::int,
    (s ->> 'ariza_sayisi')::int,
    s ->> 'son_ariza',
    s ->> 'bakim_tarihi',
    (s ->> 'bakim_gecikme_gun')::int
  from skorlar
  order by
    case when p_siralama = 'iyi'     then -(s ->> 'skor')::numeric
         when p_siralama = 'musteri' then 0
         else (s ->> 'skor')::numeric end asc,
    coalesce(customer_name,'') asc
  limit greatest(1, least(coalesce(p_limit, 50), 500));
$$;

revoke all on function public.vinc_saglik_listesi(integer, text) from public;
grant execute on function public.vinc_saglik_listesi(integer, text) to authenticated;


-- ============================================================================
-- 3) 🔮 ARIZA KEHANETİ — "60 gün içinde risk %68"
-- ============================================================================
create or replace function public.ariza_kehanet(p_crane_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c         record;
  v_musteri   text;
  v_saglik    jsonb;
  v_skor      numeric;
  v_risk      numeric := 0;
  v_ariza     integer := 0;
  v_gun_once  integer;
  v_gecikme   integer;
  v_riskli    jsonb := '[]'::jsonb;
  v_oneri     text;
  v_parcalar  record;
begin
  select * into v_c from public.cranes where id = p_crane_id;
  if v_c.id is null then
    return jsonb_build_object('risk', 0, 'mesaj', 'Vinç bulunamadı');
  end if;

  v_musteri := coalesce(nullif(trim(coalesce(v_c.customer_name,'')),''), '');
  v_saglik  := public.vinc_saglik_skoru(p_crane_id);
  v_skor    := coalesce((v_saglik ->> 'skor')::numeric, 50);
  v_ariza   := coalesce((v_saglik ->> 'ariza_sayisi')::int, 0);
  v_gun_once:= coalesce((v_saglik ->> 'gun_once')::int, 999);
  v_gecikme := coalesce((v_saglik ->> 'bakim_gecikme_gun')::int, 0);

  -- ─── RİSK HESABI ───
  -- Sağlık skoru düştükçe risk artar (max 50 puan)
  v_risk := (100 - v_skor) * 0.5;

  -- Geçmiş arıza sayısı (max 20 puan)
  v_risk := v_risk + least(20, v_ariza * 2.5);

  -- Son arıza yakınlığı (max 20 puan)
  v_risk := v_risk + case
    when v_gun_once <= 30 then 20
    when v_gun_once <= 60 then 15
    when v_gun_once <= 120 then 8
    else 0 end;

  -- Bakım gecikmesi (max 10 puan)
  v_risk := v_risk + case
    when v_gecikme > 60 then 10
    when v_gecikme > 0  then 6
    else 0 end;

  v_risk := round(greatest(0, least(100, v_risk)), 0);

  -- ─── RİSKLİ PARÇALAR (müşterinin geçmişinde sık değişenler) ───
  begin
    for v_parcalar in
      select p.ad, count(*) as adet, max(p.tarih) as son
      from (
        select
          coalesce(nullif(trim(coalesce(to_jsonb(m)->>'ad','')), ''),
                   nullif(trim(coalesce(to_jsonb(m)->>'name','')), '')) as ad,
          cs.service_date::date as tarih
        from public.completed_services cs
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(cs.materials) = 'array' then cs.materials else '[]'::jsonb end
        ) m
        where public.parca_adi_normal(
                coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                         nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
              = public.parca_adi_normal(v_musteri)
      ) p
      where coalesce(p.ad,'') <> ''
      group by p.ad
      having count(*) >= 2
      order by count(*) desc
      limit 5
    loop
      v_riskli := v_riskli || jsonb_build_object(
        'parca', v_parcalar.ad,
        'adet', v_parcalar.adet,
        'son', to_char(v_parcalar.son, 'DD.MM.YYYY')
      );
    end loop;
  exception when others then null; end;

  -- ─── ÖNERİ ───
  v_oneri := case
    when v_risk >= 70 then '🔴 ACİL: Önleyici bakım planla, riskli parçaları stokla'
    when v_risk >= 50 then '🟠 Bu ay içinde kontrol et, parça hazırlığı yap'
    when v_risk >= 30 then '🟡 Rutin bakımda kontrol listesine ekle'
    else '🟢 Şu an risk yok, normal takip yeterli' end;

  return jsonb_build_object(
    'crane_id', p_crane_id,
    'musteri', v_musteri,
    'risk', v_risk,
    'risk_etiket', case when v_risk >= 70 then '🔴 YÜKSEK'
                        when v_risk >= 50 then '🟠 ORTA-YÜKSEK'
                        when v_risk >= 30 then '🟡 ORTA'
                        else '🟢 DÜŞÜK' end,
    'saglik_skoru', v_skor,
    'ariza_sayisi', v_ariza,
    'son_ariza_gun', case when v_gun_once < 999 then v_gun_once else null end,
    'bakim_gecikme', v_gecikme,
    'riskli_parcalar', v_riskli,
    'oneri', v_oneri,
    'tahmin_metni', case
      when v_risk >= 70 then '60 gün içinde arıza riski yüksek'
      when v_risk >= 50 then '90 gün içinde kontrol edilmeli'
      else 'Yakın vadede risk düşük' end
  );
end $$;

revoke all on function public.ariza_kehanet(uuid) from public;
grant execute on function public.ariza_kehanet(uuid) to authenticated;


-- ============================================================================
-- 4) 🔧 PARÇA ÖMÜR ANALİZİ — "Rulman ortalama 8 ayda değişiyor"
-- ============================================================================
create or replace function public.parca_omur_analizi(p_limit integer default 15)
returns table (
  parca        text,
  kac_kez      integer,
  kac_vinç     integer,
  ortalama_gun numeric,
  ortalama_ay  numeric,
  son_kullanim text
)
language sql
stable
security definer
set search_path = public
as $$
  with kullanim as (
    select
      coalesce(nullif(trim(coalesce(to_jsonb(m)->>'ad','')), ''),
               nullif(trim(coalesce(to_jsonb(m)->>'name','')), '')) as parca,
      cs.service_date::date as tarih,
      public.parca_adi_normal(
        coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                 nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),'')) as musteri
    from public.completed_services cs
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(cs.materials) = 'array' then cs.materials else '[]'::jsonb end
    ) m
    where coalesce(cs.service_date,'') is not null
  )
  select
    k.parca,
    count(*)::int,
    count(distinct k.musteri)::int,
    round(avg(fark))::numeric,
    round(avg(fark) / 30.0, 1),
    to_char(max(k.tarih), 'DD.MM.YYYY')
  from (
    select parca, musteri, tarih,
           tarih - lag(tarih) over (partition by parca, musteri order by tarih) as fark
    from kullanim
    where coalesce(parca,'') <> ''
  ) k
  where k.fark is not null and k.fark > 0
  group by k.parca
  having count(*) >= 3
  order by count(*) desc
  limit greatest(1, least(coalesce(p_limit, 15), 100));
$$;

revoke all on function public.parca_omur_analizi(integer) from public;
grant execute on function public.parca_omur_analizi(integer) to authenticated;


-- ============================================================================
-- 5) 🧠 KURUMSAL HAFIZA — "Bu müşteride 3 kez aynı arıza oldu"
-- ============================================================================
create or replace function public.kurumsal_hafiza(p_musteri text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tekrarlar jsonb := '[]'::jsonb;
  v_gecmis    jsonb := '[]'::jsonb;
  v_benzer    jsonb := '[]'::jsonb;
  v_sayilar   jsonb := '{}'::jsonb;
  v_r         record;
  v_is        integer := 0;
  v_ciro      numeric := 0;
  v_ilk       date;
  v_son       date;
begin
  if coalesce(trim(p_musteri),'') = '' then
    return jsonb_build_object('tekrarlar','[]'::jsonb,'gecmis','[]'::jsonb);
  end if;

  -- Servis istatistikleri
  begin
    select count(*), coalesce(sum(cs.price),0), min(cs.service_date::date), max(cs.service_date::date)
      into v_is, v_ciro, v_ilk, v_son
    from public.completed_services cs
    where public.parca_adi_normal(
            coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                     nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
          = public.parca_adi_normal(p_musteri);
  exception when others then null; end;

  -- Son 10 servis
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'tarih', to_char(tarih,'DD.MM.YYYY'),
             'tur', tur, 'aciklama', aciklama, 'ucret', ucret
           )), '[]'::jsonb)
      into v_gecmis
    from (
      select cs.service_date::date as tarih,
             coalesce(cs.service_type,'Servis') as tur,
             left(coalesce(nullif(trim(coalesce(cs.description,'')),''), '-'), 120) as aciklama,
             round(coalesce(cs.price,0)) as ucret
      from public.completed_services cs
      where public.parca_adi_normal(
              coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                       nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
            = public.parca_adi_normal(p_musteri)
      order by cs.service_date desc limit 10
    ) g;
  exception when others then null; end;

  -- TEKRARLAYAN PARÇALAR (3+ kez)
  begin
    for v_r in
      select p.ad, count(*) as adet, min(p.tarih) as ilk, max(p.tarih) as son
      from (
        select coalesce(nullif(trim(coalesce(to_jsonb(m)->>'ad','')), ''),
                        nullif(trim(coalesce(to_jsonb(m)->>'name','')), '')) as ad,
               cs.service_date::date as tarih
        from public.completed_services cs
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(cs.materials) = 'array' then cs.materials else '[]'::jsonb end
        ) m
        where public.parca_adi_normal(
                coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                         nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
              = public.parca_adi_normal(p_musteri)
      ) p
      where coalesce(p.ad,'') <> ''
      group by p.ad having count(*) >= 3
      order by count(*) desc limit 5
    loop
      v_tekrarlar := v_tekrarlar || jsonb_build_object(
        'parca', v_r.ad, 'adet', v_r.adet,
        'ilk', to_char(v_r.ilk,'DD.MM.YYYY'), 'son', to_char(v_r.son,'DD.MM.YYYY'),
        'uyari', case when v_r.adet >= 4 then '🔴 Kronik sorun — kök sebep araştır'
                      else '🟠 Tekrarlıyor — takibe al' end
      );
    end loop;
  exception when others then null; end;

  -- AYNI PARÇAYI KULLANAN DİĞER MÜŞTERİLER (benzer vakalar)
  begin
    select coalesce(jsonb_agg(distinct jsonb_build_object('musteri', m2.musteri)), '[]'::jsonb)
      into v_benzer
    from (
      select distinct
        coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                 nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),'') as musteri
      from public.completed_services cs
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(cs.materials) = 'array' then cs.materials else '[]'::jsonb end
      ) m
      where coalesce(nullif(trim(coalesce(to_jsonb(m)->>'ad','')), ''),
                     nullif(trim(coalesce(to_jsonb(m)->>'name','')), '')) in (
        select coalesce(nullif(trim(coalesce(to_jsonb(m3)->>'ad','')), ''),
                        nullif(trim(coalesce(to_jsonb(m3)->>'name','')), ''))
        from public.completed_services cs3
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(cs3.materials) = 'array' then cs3.materials else '[]'::jsonb end
        ) m3
        where public.parca_adi_normal(
                coalesce(nullif(trim(coalesce(to_jsonb(cs3)->>'customer_name','')),''),
                         nullif(trim(coalesce(to_jsonb(cs3)->>'firm_name','')),''),''))
              = public.parca_adi_normal(p_musteri)
      )
      and public.parca_adi_normal(
            coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'customer_name','')),''),
                     nullif(trim(coalesce(to_jsonb(cs)->>'firm_name','')),''),''))
          <> public.parca_adi_normal(p_musteri)
      limit 5
    ) m2;
  exception when others then null; end;

  return jsonb_build_object(
    'musteri', p_musteri,
    'toplam_is', v_is,
    'toplam_ciro', round(v_ciro),
    'ilk_servis', case when v_ilk is not null then to_char(v_ilk,'DD.MM.YYYY') else null end,
    'son_servis', case when v_son is not null then to_char(v_son,'DD.MM.YYYY') else null end,
    'tekrarlar', v_tekrarlar,
    'gecmis', v_gecmis,
    'benzer_musteriler', v_benzer
  );
end $$;

revoke all on function public.kurumsal_hafiza(text) from public;
grant execute on function public.kurumsal_hafiza(text) to authenticated;


-- ============================================================================
-- 6) 📊 MODEL ANALİZİ — hangi vinç tipi ne sıklıkla arızalanıyor?
-- ============================================================================
create or replace function public.model_analizi()
returns table (
  model          text,
  vinc_sayisi    integer,
  servis_sayisi  integer,
  ariza_sayisi   integer,
  toplam_ciro    numeric,
  ortalama_ucret numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with vincler as (
    select coalesce(nullif(trim(coalesce(crane_capacity,'')),''), 'Belirsiz') as model,
           count(*)::int as vinc_sayisi
    from public.cranes
    group by 1
  ),
  servisler as (
    select
      coalesce(nullif(trim(coalesce(to_jsonb(cs)->>'crane_capacity','')),''), 'Belirsiz') as model,
      count(*)::int as servis_sayisi,
      count(*) filter (where
        coalesce(cs.service_type,'') ilike '%arıza%'
        or coalesce(cs.service_type,'') ilike '%ariza%'
        or coalesce(cs.description,'') ~* '(ar[ıi]za|bozuk|de[ğg]i[şs]meli|ka[çc]ak|çalışmıyor|patlak|k[ıi]r[ıi]k)'
      )::int as ariza_sayisi,
      round(coalesce(sum(cs.price),0)) as ciro
    from public.completed_services cs
    group by 1
  )
  select
    v.model,
    v.vinc_sayisi,
    coalesce(s.servis_sayisi, 0),
    coalesce(s.ariza_sayisi, 0),
    coalesce(s.ciro, 0),
    case when coalesce(s.servis_sayisi,0) > 0
         then round(s.ciro / s.servis_sayisi) else 0 end
  from vincler v
  left join servisler s on s.model = v.model
  order by v.vinc_sayisi desc
  limit 25;
$$;

revoke all on function public.model_analizi() from public;
grant execute on function public.model_analizi() to authenticated;


-- ============================================================================
-- 7) TEST
-- ============================================================================
-- Sağlık skoru testi (ilk 10 vinç)
select * from public.vinc_saglik_listesi(10, 'riskli');

-- Parça ömür analizi
select * from public.parca_omur_analizi(10);

-- En riskli vincin kehaneti
select public.ariza_kehanet(
  (select id from public.cranes where coalesce(customer_name,'') <> '' limit 1)
);
