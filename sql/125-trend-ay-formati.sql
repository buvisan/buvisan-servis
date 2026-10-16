-- ============================================================================
--  🔧 TREND AY FORMATI DÜZELTMESİ (Güncelleme #97) — ÇÖKME SEBEBİ
-- ----------------------------------------------------------------------------
--  BULGU: Arayüz kodu (personel-performans/page.tsx satır 405):
--           AYLAR[Number(String(t.ay).slice(5,7)) - 1].slice(0,3)
--         → t.ay'dan 5-7. karakterleri alıyor → "2026-05-01" TARİHİ bekliyor
--
--  BENİM HATAM: trend.ay = "May" (ay adı) gönderiyordum
--         String("May").slice(5,7) = ""  →  Number("") = 0  →  AYLAR[-1] = undefined
--         undefined.slice(0,3) → 💥 ÇÖKME (beyaz sayfa)
--
--  ÇÖZÜM: trend.ay = 'YYYY-MM-01' formatında döndür
--
--  KULLANIM: 124'ten SONRA çalıştır. Hata vermez.
-- ============================================================================

create or replace function public.personel_karnesi(
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
  begin
    v_ay := coalesce(nullif(trim(p_ay),''), to_char(current_date,'YYYY-MM'));
    v_nm := public.parca_adi_normal(coalesce(p_personel,''));
  exception when others then
    v_ay := to_char(current_date,'YYYY-MM');
    v_nm := '';
  end;

  -- İŞ İSTATİSTİKLERİ
  begin
    select count(*), coalesce(sum(cs.price),0), coalesce(avg(nullif(cs.work_hours,0)),0)
      into v_is, v_ciro, v_sure
    from public.completed_services cs
    where to_char(cs.service_date::date,'YYYY-MM') = v_ay
      and coalesce(cs.technician,'') <> ''
      and public.parca_adi_normal(cs.technician) like '%' || v_nm || '%';
  exception when others then v_is := 0; v_ciro := 0; v_sure := 0; end;

  -- RAPOR + İSG
  begin
    select count(*),
           count(*) filter (where coalesce(to_jsonb(sr)->>'isg_kontrol','') <> '')
      into v_rapor, v_isg_tam
    from public.service_reports sr
    where to_char(sr.created_at::date,'YYYY-MM') = v_ay
      and public.parca_adi_normal(coalesce(public.jalan(to_jsonb(sr),
            'personel','teknisyen','personel_adi','imza_atan','musteri_adi'),''))
          like '%' || v_nm || '%';
  exception when others then v_rapor := 0; v_isg_tam := 0; end;

  -- MEMNUNİYET
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

  -- MESAİ + İZİN
  begin
    select coalesce(sum(coalesce(g.normal_saat,0)+coalesce(g.mesai50_saat,0)+coalesce(g.mesai100_saat,0)),0),
           count(*) filter (where coalesce(g.izin_mi,false))
      into v_mesai, v_izin
    from public.puantaj_gunluk g
    where to_char(g.tarih,'YYYY-MM') = v_ay
      and public.parca_adi_normal(g.personel) = v_nm;
  exception when others then v_mesai := 0; v_izin := 0; end;

  -- SON İŞLER
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'tarih', to_char(x.tarih,'DD.MM.YYYY'),
             'musteri', x.musteri, 'tur', x.tur,
             'saat', x.saat, 'ucret', x.ucret)), '[]'::jsonb)
      into v_son_isler
    from (
      select cs.service_date::date as tarih,
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

  -- ⭐ TREND — ay alanı TARİH formatında ('YYYY-MM-01')
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'ay', to_char(date_trunc('month', ay_tarih), 'YYYY-MM-DD'),   -- ⭐ TARİH!
             'ciro', ciro) order by ay_tarih), '[]'::jsonb)
      into v_trend
    from (
      select
        date_trunc('month', cs.service_date::date)::date as ay_tarih,
        round(coalesce(sum(cs.price),0)) as ciro
      from public.completed_services cs
      where coalesce(cs.technician,'') <> ''
        and public.parca_adi_normal(cs.technician) like '%' || v_nm || '%'
        and cs.service_date::date >= (date_trunc('month', current_date) - interval '5 months')::date
      group by 1
    ) t;
  exception when others then v_trend := '[]'::jsonb; end;

  -- PUAN
  begin
    v_puan := least(35, (coalesce(v_ciro,0) / 20000.0) * 35)
            + least(20, coalesce(v_is,0) * 1.6)
            + case when coalesce(v_is,0) > 0 then least(25, (v_rapor::numeric / v_is) * 25) else 15 end
            + case when v_memnuniyet is not null then least(20, v_memnuniyet * 4) else 12 end;
    v_puan := greatest(0, least(100, round(coalesce(v_puan, 0))));
  exception when others then v_puan := 0; end;

  -- SIRA
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
    ) p where p.c > coalesce(v_ciro, 0);
  exception when others then v_sira := 1; v_toplam_personel := 0; end;

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
    'rapor_orani', case when coalesce(v_is,0) > 0 then round((v_rapor::numeric / v_is) * 100) else 0 end,
    'isg_uyum', case when coalesce(v_rapor,0) > 0 then round((v_isg_tam::numeric / v_rapor) * 100) else 100 end,
    'mesai_gun', round(coalesce(v_mesai, 0) / 8.0, 1),
    'izin_gun', coalesce(v_izin, 0),
    'trend', coalesce(v_trend, '[]'::jsonb),
    'son_isler', coalesce(v_son_isler, '[]'::jsonb));

exception when others then
  return jsonb_build_object(
    'personel', coalesce(p_personel, 'Personel'),
    'ay', to_char(current_date,'YYYY-MM'),
    'performans', 0, 'performans_etiket', '⚠️ Veri alınamadı',
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
-- 🧪 TEST — trend ay formatı KONTROLÜ
-- ============================================================================
select
  (t->>'ay')   as ay_formati,
  (t->>'ciro') as ciro
from jsonb_array_elements(public.personel_karnesi('VEYSEL ÇARKLI') -> 'trend') t;

-- Ay formatı doğru mu? (5-7. karakterler ay numarası olmalı)
select
  (t->>'ay')                                   as ay,
  substring((t->>'ay') from 6 for 2)            as ay_numarasi,
  length(t->>'ay')                              as uzunluk
from jsonb_array_elements(public.personel_karnesi('VEYSEL ÇARKLI') -> 'trend') t;

-- Tüm personel — hata var mı?
select
  pm.personel,
  public.personel_karnesi(pm.personel, to_char(current_date,'YYYY-MM')) ->> 'performans' as puan,
  jsonb_array_length(public.personel_karnesi(pm.personel, to_char(current_date,'YYYY-MM')) -> 'trend') as trend_adet,
  public.personel_karnesi(pm.personel, to_char(current_date,'YYYY-MM')) ->> 'hata' as hata
from public.personel_maas pm where pm.aktif order by pm.maas desc;
