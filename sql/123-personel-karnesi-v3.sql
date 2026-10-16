-- ============================================================================
--  ✅ PERSONEL KARNESİ v3 — GERÇEK ALAN ADLARI (Güncelleme #95)
-- ----------------------------------------------------------------------------
--  HATA: 122'de yanlış alan adları kullandım → NaN, undefined, 0 ₺
--
--  ARAYÜZDEN OKUNAN GERÇEK ALANLAR (personel-performans/page.tsx):
--    karne.performans          (performans_puani DEĞİL)
--    karne.performans_etiket   (etiket DEĞİL)
--    karne.sira · karne.toplam_personel
--    karne.is_sayisi
--    karne.ciro                (toplam_ciro DEĞİL)
--    karne.ortalama_sure       (ort_sure DEĞİL)
--    karne.musteri_puani
--    karne.rapor_orani         (rapor_duzeni DEĞİL)
--    karne.isg_uyum            (isg_uyumu DEĞİL)
--    karne.mesai_gun · karne.izin_gun
--    karne.trend               (aylik_trend DEĞİL)  → [{ciro, ...}]
--    karne.son_isler           → [{tarih, musteri, tur, saat, ucret}]
--
--  AYRICA: son_isler AY FİLTRESİ eklendi (Eylül işleri görünüyordu)
--
--  KULLANIM: 122'den SONRA çalıştır. Hata vermez.
-- ============================================================================

drop function if exists public.personel_karnesi(text, text);

create function public.personel_karnesi(
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

  v_is integer := 0;
  v_ciro numeric := 0;
  v_sure numeric := 0;
  v_rapor integer := 0;
  v_isg_tam integer := 0;
  v_memnuniyet numeric := null;

  v_mesai numeric := 0;
  v_izin integer := 0;
  v_puan numeric := 0;
  v_sira integer := 1;
  v_toplam_personel integer := 0;

  v_son_isler jsonb := '[]'::jsonb;
  v_trend jsonb := '[]'::jsonb;
begin
  -- ══ İŞ İSTATİSTİKLERİ (ay filtreli) ══
  begin
    select count(*), coalesce(sum(cs.price),0), coalesce(avg(nullif(cs.work_hours,0)),0)
      into v_is, v_ciro, v_sure
    from public.completed_services cs
    where to_char(cs.service_date::date,'YYYY-MM') = v_ay
      and coalesce(cs.technician,'') <> ''
      and public.parca_adi_normal(cs.technician) like '%' || v_nm || '%';
  exception when others then null; end;

  -- ══ RAPOR DÜZENİ + İSG ══
  begin
    select count(*), count(*) filter (where nullif(trim(coalesce(to_jsonb(sr)->>'isg_kontrol','')),'') is not null)
      into v_rapor, v_isg_tam
    from public.service_reports sr
    where to_char(sr.created_at::date,'YYYY-MM') = v_ay
      and public.parca_adi_normal(public.jalan(to_jsonb(sr),'personel','teknisyen','personel_adi','imza_atan'))
          like '%' || v_nm || '%';
  exception when others then null; end;

  -- ══ MÜŞTERİ MEMNUNİYETİ ══
  begin
    select round(avg((to_jsonb(sr)->>'musteri_puani')::numeric), 1) into v_memnuniyet
    from public.service_reports sr
    where nullif(trim(coalesce(to_jsonb(sr)->>'musteri_puani','')),'') is not null
      and to_char(sr.created_at::date,'YYYY-MM') = v_ay
      and public.parca_adi_normal(public.jalan(to_jsonb(sr),'personel','teknisyen','personel_adi','imza_atan'))
          like '%' || v_nm || '%';
  exception when others then v_memnuniyet := null; end;

  -- ══ MESAİ + İZİN ══
  begin
    select coalesce(sum(coalesce(g.normal_saat,0)+coalesce(g.mesai50_saat,0)+coalesce(g.mesai100_saat,0)),0),
           count(*) filter (where g.izin_mi)
      into v_mesai, v_izin
    from public.puantaj_gunluk g
    where to_char(g.tarih,'YYYY-MM') = v_ay
      and public.parca_adi_normal(g.personel) = v_nm;
  exception when others then null; end;

  -- ══ SON İŞLER (⭐ AY FİLTRELİ + doğru alan adları) ══
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'tarih', to_char(x.tarih,'DD.MM.YYYY'),
             'musteri', x.musteri,
             'tur', x.tur,
             'saat', x.saat,
             'ucret', x.ucret)), '[]'::jsonb)
      into v_son_isler
    from (
      select
        cs.service_date::date as tarih,
        coalesce(nullif(public.cs_isim(to_jsonb(cs)),''), 'Müşteri') as musteri,
        coalesce(nullif(cs.service_type,''), 'Servis') as tur,
        round(coalesce(cs.work_hours,0), 1) as saat,
        round(coalesce(cs.price,0)) as ucret
      from public.completed_services cs
      where coalesce(cs.technician,'') <> ''
        and public.parca_adi_normal(cs.technician) like '%' || v_nm || '%'
        -- ⭐ AY FİLTRESİ (Eylül işleri görünmesin)
        and to_char(cs.service_date::date,'YYYY-MM') = v_ay
      order by cs.service_date desc
      limit 8
    ) x;
  exception when others then v_son_isler := '[]'::jsonb; end;

  -- ══ 6 AYLIK TREND ══
  begin
    select coalesce(jsonb_agg(jsonb_build_object('ay', ay_ad, 'ciro', ciro) order by ay_bas), '[]'::jsonb)
      into v_trend
    from (
      select
        to_char(date_trunc('month', cs.service_date::date),'YYYY-MM') as ay_bas,
        to_char(cs.service_date::date,'TMMon') as ay_ad,
        round(coalesce(sum(cs.price),0)) as ciro
      from public.completed_services cs
      where coalesce(cs.technician,'') <> ''
        and public.parca_adi_normal(cs.technician) like '%' || v_nm || '%'
        and cs.service_date::date >= date_trunc('month', current_date) - interval '5 months'
      group by 1, 2
    ) t;
  exception when others then v_trend := '[]'::jsonb; end;

  -- ══ PERFORMANS PUANI (0-100) ══
  v_puan := round(
      least(35, (v_ciro / 20000.0) * 35)
    + least(20, v_is * 1.6)
    + case when v_is > 0 then least(25, (v_rapor::numeric / v_is) * 25) else 15 end
    + case when v_memnuniyet is not null then least(20, v_memnuniyet * 4) else 12 end
  , 0);
  v_puan := greatest(0, least(100, coalesce(v_puan, 0)));

  -- ══ SIRA ══
  begin
    select count(*) into v_toplam_personel from public.personel_maas where aktif;
    select count(*) + 1 into v_sira
    from (
      select public.parca_adi_normal(pm.personel) as nm,
             coalesce((select sum(cs2.price) from public.completed_services cs2
               where to_char(cs2.service_date::date,'YYYY-MM') = v_ay
                 and coalesce(cs2.technician,'') <> ''
                 and public.parca_adi_normal(cs2.technician) like '%' || public.parca_adi_normal(pm.personel) || '%'), 0) as c
      from public.personel_maas pm where pm.aktif
    ) p
    where p.c > v_ciro;
  exception when others then v_sira := 1; end;

  -- ══ DÖNÜŞ — GERÇEK ALAN ADLARIYLA ══
  return jsonb_build_object(
    'personel', p_personel,
    'ay', v_ay,
    'performans', v_puan,                                          -- ⭐
    'performans_etiket', case                                        -- ⭐
      when v_puan >= 90 then '🏆 YILDIZ'
      when v_puan >= 75 then '🥇 ÇOK İYİ'
      when v_puan >= 60 then '🥈 İYİ'
      when v_puan >= 45 then '🥉 ORTA'
      else '📈 GELİŞMELİ' end,
    'sira', v_sira,
    'toplam_personel', v_toplam_personel,
    'is_sayisi', v_is,
    'ciro', round(v_ciro),                                         -- ⭐
    'ortalama_sure', round(v_sure, 1),                              -- ⭐
    'musteri_puani', v_memnuniyet,
    'rapor_orani', case when v_is > 0 then round((v_rapor::numeric / v_is) * 100) else 0 end,  -- ⭐
    'isg_uyum', case when v_rapor > 0 then round((v_isg_tam::numeric / v_rapor) * 100) else 100 end,  -- ⭐
    'mesai_gun', round(v_mesai / 8.0, 1),
    'izin_gun', v_izin,
    'trend', v_trend,                                              -- ⭐
    'son_isler', v_son_isler);
end $$;

revoke all on function public.personel_karnesi(text, text) from public;
grant execute on function public.personel_karnesi(text, text) to authenticated;


-- ============================================================================
-- 🧪 TEST — tüm alanlar dolu mu?
-- ============================================================================
select
  public.personel_karnesi('VEYSEL ÇARKLI') ->> 'performans'         as performans,
  public.personel_karnesi('VEYSEL ÇARKLI') ->> 'performans_etiket' as etiket,
  public.personel_karnesi('VEYSEL ÇARKLI') ->> 'sira'              as sira,
  public.personel_karnesi('VEYSEL ÇARKLI') ->> 'is_sayisi'          as is_sayisi,
  public.personel_karnesi('VEYSEL ÇARKLI') ->> 'ciro'               as ciro,
  public.personel_karnesi('VEYSEL ÇARKLI') ->> 'ortalama_sure'      as ortalama_sure,
  public.personel_karnesi('VEYSEL ÇARKLI') ->> 'musteri_puani'      as musteri_puani,
  public.personel_karnesi('VEYSEL ÇARKLI') ->> 'rapor_orani'        as rapor_orani,
  public.personel_karnesi('VEYSEL ÇARKLI') ->> 'isg_uyum'           as isg_uyum,
  public.personel_karnesi('VEYSEL ÇARKLI') ->> 'mesai_gun'          as mesai_gun,
  public.personel_karnesi('VEYSEL ÇARKLI') ->> 'izin_gun'           as izin_gun;

-- SON İŞLER — sadece BU AY olmalı
select
  (s->>'tarih')   as tarih,
  (s->>'musteri') as musteri,
  (s->>'tur')     as tur,
  (s->>'saat')    as saat,
  (s->>'ucret')   as ucret
from jsonb_array_elements(public.personel_karnesi('VEYSEL ÇARKLI') -> 'son_isler') s;

-- TREND — 6 ay
select (t->>'ay') as ay, (t->>'ciro') as ciro
from jsonb_array_elements(public.personel_karnesi('VEYSEL ÇARKLI') -> 'trend') t;
