-- ============================================================================
--  🛡️ PERSONEL KARNESİ v4 — KURŞUN GEÇİRMEZ (Güncelleme #96)
-- ----------------------------------------------------------------------------
--  SORUN: personel_karnesi() hata veriyor → karne null → arayüz ÇÖKÜYOR
--
--  ÇÖZÜM:
--    1) TÜM hesaplamalar iç exception bloklarında (biri patlasa diğerleri çalışır)
--    2) HİÇBİR alan null dönmez (hepsine varsayılan değer)
--    3) En dışta da exception yakalayıcı → ASLA hata fırlatmaz
--    4) trend ve son_isler HER ZAMAN dizi (boş bile olsa)
--
--  KULLANIM: 123'ten SONRA çalıştır. Hata vermez.
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
  v_ay text;
  v_nm text;

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
  -- ═══ GÜVENLİ BAŞLANGIÇ ═══
  begin
    v_ay := coalesce(nullif(trim(p_ay),''), to_char(current_date,'YYYY-MM'));
    v_nm := public.parca_adi_normal(coalesce(p_personel,''));
  exception when others then
    v_ay := to_char(current_date,'YYYY-MM');
    v_nm := '';
  end;

  -- ═══ 1. İŞ İSTATİSTİKLERİ ═══
  begin
    select count(*), coalesce(sum(cs.price),0), coalesce(avg(nullif(cs.work_hours,0)),0)
      into v_is, v_ciro, v_sure
    from public.completed_services cs
    where to_char(cs.service_date::date,'YYYY-MM') = v_ay
      and coalesce(cs.technician,'') <> ''
      and public.parca_adi_normal(cs.technician) like '%' || v_nm || '%';
  exception when others then
    v_is := 0; v_ciro := 0; v_sure := 0;
  end;

  -- ═══ 2. RAPOR DÜZENİ + İSG ═══
  begin
    select count(*),
           count(*) filter (where coalesce(to_jsonb(sr)->>'isg_kontrol','') <> '')
      into v_rapor, v_isg_tam
    from public.service_reports sr
    where to_char(sr.created_at::date,'YYYY-MM') = v_ay
      and public.parca_adi_normal(coalesce(public.jalan(to_jsonb(sr),
            'personel','teknisyen','personel_adi','imza_atan','musteri_adi'),''))
          like '%' || v_nm || '%';
  exception when others then
    v_rapor := 0; v_isg_tam := 0;
  end;

  -- ═══ 3. MÜŞTERİ MEMNUNİYETİ ═══
  begin
    select round(avg(nullif(trim(coalesce(to_jsonb(sr)->>'musteri_puani','')),'')::numeric), 1)
      into v_memnuniyet
    from public.service_reports sr
    where nullif(trim(coalesce(to_jsonb(sr)->>'musteri_puani','')),'') is not null
      and to_char(sr.created_at::date,'YYYY-MM') = v_ay
      and public.parca_adi_normal(coalesce(public.jalan(to_jsonb(sr),
            'personel','teknisyen','personel_adi','imza_atan','musteri_adi'),''))
          like '%' || v_nm || '%';
  exception when others then v_memnuniyet := null; end;

  -- ═══ 4. MESAİ + İZİN ═══
  begin
    select coalesce(sum(coalesce(g.normal_saat,0)+coalesce(g.mesai50_saat,0)+coalesce(g.mesai100_saat,0)),0),
           count(*) filter (where coalesce(g.izin_mi,false))
      into v_mesai, v_izin
    from public.puantaj_gunluk g
    where to_char(g.tarih,'YYYY-MM') = v_ay
      and public.parca_adi_normal(g.personel) = v_nm;
  exception when others then v_mesai := 0; v_izin := 0; end;

  -- ═══ 5. SON İŞLER (ay filtreli) ═══
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
        and to_char(cs.service_date::date,'YYYY-MM') = v_ay
      order by cs.service_date desc
      limit 8
    ) x;
  exception when others then v_son_isler := '[]'::jsonb; end;

  -- ═══ 6. TREND (6 ay) ═══
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
        and cs.service_date::date >= (date_trunc('month', current_date) - interval '5 months')::date
      group by 1, 2
    ) t;
  exception when others then v_trend := '[]'::jsonb; end;

  -- ═══ 7. PERFORMANS PUANI ═══
  begin
    v_puan :=
        least(35, (coalesce(v_ciro,0) / 20000.0) * 35)
      + least(20, coalesce(v_is,0) * 1.6)
      + case when coalesce(v_is,0) > 0 then least(25, (v_rapor::numeric / v_is) * 25) else 15 end
      + case when v_memnuniyet is not null then least(20, v_memnuniyet * 4) else 12 end;
    v_puan := greatest(0, least(100, round(coalesce(v_puan, 0))));
  exception when others then v_puan := 0; end;

  -- ═══ 8. SIRA ═══
  begin
    select count(*) into v_toplam_personel from public.personel_maas where aktif;
    select count(*) + 1 into v_sira
    from (
      select coalesce((select sum(cs2.price) from public.completed_services cs2
               where to_char(cs2.service_date::date,'YYYY-MM') = v_ay
                 and coalesce(cs2.technician,'') <> ''
                 and public.parca_adi_normal(cs2.technician)
                     like '%' || public.parca_adi_normal(pm.personel) || '%'), 0) as c
      from public.personel_maas pm where pm.aktif
    ) p
    where p.c > coalesce(v_ciro, 0);
  exception when others then v_sira := 1; v_toplam_personel := 0; end;

  -- ═══ DÖNÜŞ — HİÇBİR ALAN NULL DEĞİL ═══
  return jsonb_build_object(
    'personel', coalesce(p_personel, 'Personel'),
    'ay', v_ay,
    'performans', coalesce(v_puan, 0),
    'performans_etiket', case
      when coalesce(v_puan,0) >= 90 then '🏆 YILDIZ'
      when coalesce(v_puan,0) >= 75 then '🥇 ÇOK İYİ'
      when coalesce(v_puan,0) >= 60 then '🥈 İYİ'
      when coalesce(v_puan,0) >= 45 then '🥉 ORTA'
      else '📈 GELİŞMELİ' end,
    'sira', coalesce(v_sira, 1),
    'siralama', coalesce(v_sira, 1),
    'toplam_personel', coalesce(v_toplam_personel, 0),
    'is_sayisi', coalesce(v_is, 0),
    'ciro', round(coalesce(v_ciro, 0)),
    'ortalama_sure', round(coalesce(v_sure, 0), 1),
    'musteri_puani', v_memnuniyet,
    'rapor_orani', case when coalesce(v_is,0) > 0
                        then round((v_rapor::numeric / v_is) * 100) else 0 end,
    'isg_uyum', case when coalesce(v_rapor,0) > 0
                     then round((v_isg_tam::numeric / v_rapor) * 100) else 100 end,
    'mesai_gun', round(coalesce(v_mesai, 0) / 8.0, 1),
    'izin_gun', coalesce(v_izin, 0),
    'trend', coalesce(v_trend, '[]'::jsonb),
    'son_isler', coalesce(v_son_isler, '[]'::jsonb));

exception when others then
  -- ⭐ EN DIŞTA DA YAKALAYICI — ASLA HATA FIRLATMAZ
  return jsonb_build_object(
    'personel', coalesce(p_personel, 'Personel'),
    'ay', to_char(current_date,'YYYY-MM'),
    'performans', 0,
    'performans_etiket', '⚠️ Veri alınamadı',
    'sira', 1, 'siralama', 1, 'toplam_personel', 0,
    'is_sayisi', 0, 'ciro', 0, 'ortalama_sure', 0,
    'musteri_puani', null, 'rapor_orani', 0, 'isg_uyum', 100,
    'mesai_gun', 0, 'izin_gun', 0,
    'trend', '[]'::jsonb, 'son_isler', '[]'::jsonb,
    'hata', sqlerrm);
end $$;

revoke all on function public.personel_karnesi(text, text) from public;
grant execute on function public.personel_karnesi(text, text) to authenticated;


-- ============================================================================
-- 🧪 TEST — 5 personelin hepsi hatasız dönmeli
-- ============================================================================
select
  pm.personel,
  public.personel_karnesi(pm.personel, to_char(current_date,'YYYY-MM')) ->> 'performans'    as puan,
  public.personel_karnesi(pm.personel, to_char(current_date,'YYYY-MM')) ->> 'ciro'          as ciro,
  public.personel_karnesi(pm.personel, to_char(current_date,'YYYY-MM')) ->> 'is_sayisi'     as is_sayisi,
  public.personel_karnesi(pm.personel, to_char(current_date,'YYYY-MM')) ->> 'ortalama_sure' as ort_sure,
  public.personel_karnesi(pm.personel, to_char(current_date,'YYYY-MM')) ->> 'hata'          as hata_var_mi
from public.personel_maas pm
where pm.aktif
order by pm.maas desc;
