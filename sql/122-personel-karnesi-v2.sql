-- ============================================================================
--  🎯 PERSONEL KARNESİ v2 — "isimsiz" SORUNU ÇÖZÜLDÜ (Güncelleme #94)
-- ----------------------------------------------------------------------------
--  SORUN: Personel performans modalındaki "SON İŞLER" listesinde müşteri adı
--         "isimsiz" görünüyordu → fonksiyon customer_name okuyordu (BOŞ!)
--
--  ÇÖZÜM: cs_isim() fonksiyonu kullanılıyor (customer_text → doğru ad)
--
--  DOĞRU SONUÇ (121 testinden):
--    2026-10-12 │ BURSALI                      │ 14.000 ₺
--    2026-10-09 │ KARAS ALTYAPI İNŞAAT (BUSKİ) │ 45.880 ₺
--    2026-10-08 │ ERKASAN                      │ 14.300 ₺
--
--  KULLANIM: 121'den SONRA çalıştır. Hata vermez.
-- ============================================================================

-- ⚠️ Dönüş tipi değişebilir → önce DROP
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
  v_r record;

  v_is integer := 0;
  v_ciro numeric := 0;
  v_sure numeric := 0;
  v_rapor integer := 0;
  v_memnuniyet numeric;
  v_isg integer := 0;
  v_isg_tam integer := 0;

  v_mesai numeric := 0;
  v_izin integer := 0;
  v_puan numeric := 0;
  v_sira integer := 0;
  v_toplam_personel integer := 0;
  v_etiket text;

  v_son_isler jsonb := '[]'::jsonb;
  v_trend jsonb := '[]'::jsonb;
begin
  -- ── İŞ İSTATİSTİKLERİ (cs_isim ile) ──
  begin
    select
      count(*),
      coalesce(sum(cs.price), 0),
      coalesce(avg(nullif(cs.work_hours,0)), 0)
    into v_is, v_ciro, v_sure
    from public.completed_services cs
    where to_char(cs.service_date::date, 'YYYY-MM') = v_ay
      and coalesce(cs.technician,'') <> ''
      and public.parca_adi_normal(cs.technician) like '%' || v_nm || '%';
  exception when others then null; end;

  -- ── RAPOR + İSG (service_reports) ──
  begin
    select count(*),
           count(*) filter (where (to_jsonb(sr)->>'isg_kontrol') is not null)
      into v_rapor, v_isg_tam
    from public.service_reports sr
    where to_char(sr.created_at::date, 'YYYY-MM') = v_ay
      and (
        public.parca_adi_normal(public.jalan(to_jsonb(sr),'personel','teknisyen','personel_adi')) like '%' || v_nm || '%'
        or public.parca_adi_normal(public.jalan(to_jsonb(sr),'imza_atan','imzalayan')) like '%' || v_nm || '%'
      );
  exception when others then null; end;

  -- ── MÜŞTERİ MEMNUNİYETİ ──
  begin
    select round(avg((to_jsonb(sr)->>'musteri_puani')::numeric), 1)
      into v_memnuniyet
    from public.service_reports sr
    where nullif(trim(coalesce(to_jsonb(sr)->>'musteri_puani','')),'') is not null
      and to_char(sr.created_at::date, 'YYYY-MM') = v_ay
      and public.parca_adi_normal(public.jalan(to_jsonb(sr),'personel','teknisyen','personel_adi')) like '%' || v_nm || '%';
  exception when others then v_memnuniyet := null; end;

  -- ── MESAİ + İZİN (puantaj) ──
  begin
    select coalesce(sum(coalesce(g.normal_saat,0) + coalesce(g.mesai50_saat,0) + coalesce(g.mesai100_saat,0)), 0),
           count(*) filter (where g.izin_mi)
      into v_mesai, v_izin
    from public.puantaj_gunluk g
    where to_char(g.tarih, 'YYYY-MM') = v_ay
      and public.parca_adi_normal(g.personel) = v_nm;
  exception when others then null; end;

  -- ── SON İŞLER (⭐ cs_isim ile DOĞRU müşteri adı) ──
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'tarih', to_char(tarih,'DD.MM.YYYY'),
             'musteri', musteri,
             'tip', tip,
             'sure', sure,
             'ucret', ucret)), '[]'::jsonb)
      into v_son_isler
    from (
      select
        cs.service_date::date as tarih,
        coalesce(nullif(public.cs_isim(to_jsonb(cs)),''), 'Müşteri') as musteri,
        coalesce(nullif(cs.service_type,''), 'Servis') as tip,
        round(coalesce(cs.work_hours, 0), 1) as sure,
        round(coalesce(cs.price, 0)) as ucret
      from public.completed_services cs
      where coalesce(cs.technician,'') <> ''
        and public.parca_adi_normal(cs.technician) like '%' || v_nm || '%'
      order by cs.service_date desc
      limit 8
    ) x;
  exception when others then v_son_isler := '[]'::jsonb; end;

  -- ── 6 AYLIK TREND (ciro) ──
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'ay', ay_ad,
             'ciro', ciro
           ) order by ay_bas), '[]'::jsonb)
      into v_trend
    from (
      select
        to_char(date_trunc('month', cs.service_date::date), 'YYYY-MM') as ay_bas,
        to_char(cs.service_date::date, 'TMMon') as ay_ad,
        round(coalesce(sum(cs.price),0)) as ciro
      from public.completed_services cs
      where coalesce(cs.technician,'') <> ''
        and public.parca_adi_normal(cs.technician) like '%' || v_nm || '%'
        and cs.service_date::date >= date_trunc('month', current_date) - interval '5 months'
      group by 1, 2
    ) t;
  exception when others then v_trend := '[]'::jsonb; end;

  -- ── PERFORMANS PUANI (0-100) ──
  v_puan := round(
      least(30, v_ciro / 20000.0 * 30)                        -- ciro
    + least(20, v_is * 1.5)                                    -- iş sayısı
    + least(25, (v_rapor::numeric / greatest(v_is,1)) * 25)    -- rapor düzeni
    + least(25, 12 + coalesce(v_memnuniyet, 3) * 2.6)          -- memnuniyet
  , 0);
  v_puan := greatest(0, least(100, v_puan));

  v_etiket := case
    when v_puan >= 90 then '🏆 YILDIZ'
    when v_puan >= 75 then '🥇 ÇOK İYİ'
    when v_puan >= 60 then '🥈 İYİ'
    when v_puan >= 45 then '🥉 ORTA'
    else '📈 GELİŞMELİ' end;

  -- ── SIRA (aktif personel içinde) ──
  begin
    select count(*) into v_toplam_personel from public.personel_maas where aktif;
    select count(*) + 1 into v_sira
    from (
      select pm.personel as ad,
             coalesce((select sum(cs2.price) from public.completed_services cs2
               where to_char(cs2.service_date::date,'YYYY-MM') = v_ay
                 and public.parca_adi_normal(cs2.technician) like '%' || public.parca_adi_normal(pm.personel) || '%'), 0) as c
      from public.personel_maas pm where pm.aktif
    ) p
    where p.c > v_ciro;
  exception when others then v_sira := 1; end;

  return jsonb_build_object(
    'personel', p_personel,
    'ay', v_ay,
    'performans_puani', v_puan,
    'etiket', v_etiket,
    'sira', v_sira,
    'toplam_personel', v_toplam_personel,
    'is_sayisi', v_is,
    'toplam_ciro', round(v_ciro),
    'ort_sure', round(v_sure, 1),
    'musteri_puani', v_memnuniyet,
    'rapor_duzeni', case when v_is > 0 then round((v_rapor::numeric / v_is) * 100) else 0 end,
    'isg_uyumu', case when v_rapor > 0 then round((v_isg_tam::numeric / v_rapor) * 100) else 100 end,
    'mesai_gun', round(v_mesai / 8.0, 1),
    'izin_gun', v_izin,
    'aylik_trend', v_trend,
    'son_isler', v_son_isler);
end $$;

revoke all on function public.personel_karnesi(text, text) from public;
grant execute on function public.personel_karnesi(text, text) to authenticated;


-- ============================================================================
-- 🧪 TEST — Veysel'in karnesi (müşteri adları DOLU olmalı)
-- ============================================================================
select
  public.personel_karnesi('VEYSEL ÇARKLI') ->> 'performans_puani' as puan,
  public.personel_karnesi('VEYSEL ÇARKLI') ->> 'is_sayisi'         as is_sayisi,
  public.personel_karnesi('VEYSEL ÇARKLI') ->> 'toplam_ciro'       as ciro,
  public.personel_karnesi('VEYSEL ÇARKLI') ->> 'musteri_puani'     as memnuniyet;

-- SON İŞLER — müşteri adları DOLU mu?
select
  (s->>'tarih')   as tarih,
  (s->>'musteri') as musteri,
  (s->>'tip')     as tip,
  (s->>'sure')    as sure,
  (s->>'ucret')   as ucret
from jsonb_array_elements(public.personel_karnesi('VEYSEL ÇARKLI') -> 'son_isler') s;
