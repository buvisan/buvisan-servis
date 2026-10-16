-- ============================================================================
--  🏖️ İZİN VERİSİ DÜZELTMESİ (Güncelleme #99)
-- ----------------------------------------------------------------------------
--  BULGU: İzin kayıtları personel_talepler tablosunda!
--    Sütunlar: personel, talep_tipi, baslangic, bitis, durum, ucretli
--
--  BENİM HATAM: puantaj_gunluk.izin_mi okuyordum (o alan kullanılmıyor)
--
--  ÇÖZÜM:
--    izin_gun  → personel_talepler (talep_tipi=izin + durum=onaylandi)
--    mesai_gun → puantaj_gunluk (normal_saat toplamı) ✓ doğruydu
--
--  KULLANIM: 126'dan SONRA çalıştır. Hata vermez.
-- ============================================================================

-- Önce personel_talepler'deki izin kayıtlarını gör
select
  public.parca_adi_normal(pt.personel)   as personel,
  coalesce(pt.talep_tipi,'?')             as talep_tipi,
  coalesce(pt.baslangic::text,'')         as baslangic,
  coalesce(pt.bitis::text,'')             as bitis,
  coalesce(pt.durum,'?')                  as durum,
  coalesce(pt.ucretli::text,'?')          as ucretli,
  greatest(1, coalesce((pt.bitis::date - pt.baslangic::date), 0) + 1) as gun
from public.personel_talepler pt
where public.parca_adi_normal(coalesce(pt.talep_tipi,'')) like '%izin%'
order by pt.baslangic desc nulls last
limit 20;


-- ============================================================================
-- 🏖️ İZİN GÜNÜ SAYACI (yardımcı fonksiyon)
-- ============================================================================
create or replace function public.izin_gun_sayisi(
  p_personel text,
  p_ay text default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ay text := coalesce(p_ay, to_char(current_date,'YYYY-MM'));
  v_nm text := public.parca_adi_normal(coalesce(p_personel,''));
  v_gun numeric := 0;
begin
  begin
    select coalesce(sum(
             greatest(1, coalesce((nullif(trim(coalesce(to_jsonb(pt)->>'bitis','')),'')::date
                                 - nullif(trim(coalesce(to_jsonb(pt)->>'baslangic','')),'')::date), 0) + 1)
           ), 0)
      into v_gun
    from public.personel_talepler pt
    where public.parca_adi_normal(coalesce(to_jsonb(pt)->>'personel','')) = v_nm
      -- İZİN talepleri
      and public.parca_adi_normal(coalesce(to_jsonb(pt)->>'talep_tipi','')) like '%izin%'
      -- ONAYLI olanlar
      and public.parca_adi_normal(coalesce(to_jsonb(pt)->>'durum',''))
          in ('onaylandi','onaylı','onaylanmis','kabul','kabul_edildi','tamamlandi','tamamlandı','aktif')
      -- Ay içinde başlayan veya ayı kapsayan
      and (
        to_char(nullif(trim(coalesce(to_jsonb(pt)->>'baslangic','')),'')::date, 'YYYY-MM') = v_ay
        or to_char(nullif(trim(coalesce(to_jsonb(pt)->>'bitis','')),'')::date, 'YYYY-MM') = v_ay
        or (nullif(trim(coalesce(to_jsonb(pt)->>'baslangic','')),'')::date <= (v_ay || '-01')::date + interval '1 month' - interval '1 day'
            and nullif(trim(coalesce(to_jsonb(pt)->>'bitis','')),'')::date >= (v_ay || '-01')::date)
      );
  exception when others then v_gun := 0; end;

  return coalesce(v_gun, 0);
end $$;

revoke all on function public.izin_gun_sayisi(text, text) from public;
grant execute on function public.izin_gun_sayisi(text, text) to authenticated;


-- ============================================================================
-- 🔧 personel_karnesi — İZİN KAYNAĞI DÜZELTİLDİ
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
  v_mesai_gun numeric := 0;
  v_izin numeric := 0;
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
    v_ay := to_char(current_date,'YYYY-MM'); v_nm := '';
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
    select count(*), count(*) filter (where coalesce(to_jsonb(sr)->>'isg_kontrol','') <> '')
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

  -- ⭐ MESAİ (puantaj_gunluk)
  begin
    select coalesce(sum(coalesce(g.normal_saat,0)+coalesce(g.mesai50_saat,0)+coalesce(g.mesai100_saat,0)),0)
      into v_mesai
    from public.puantaj_gunluk g
    where to_char(g.tarih,'YYYY-MM') = v_ay
      and public.parca_adi_normal(g.personel) = v_nm;
    v_mesai_gun := round(coalesce(v_mesai,0) / 8.0, 1);
  exception when others then v_mesai := 0; v_mesai_gun := 0; end;

  -- ⭐ İZİN (personel_talepler — DÜZELTİLDİ!)
  begin
    v_izin := public.izin_gun_sayisi(p_personel, v_ay);
  exception when others then v_izin := 0; end;

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
      order by cs.service_date desc limit 8
    ) x;
  exception when others then v_son_isler := '[]'::jsonb; end;

  -- TREND (ay = TARİH formatı)
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'ay', to_char(date_trunc('month', ay_tarih), 'YYYY-MM-DD'),
             'ciro', ciro) order by ay_tarih), '[]'::jsonb)
      into v_trend
    from (
      select date_trunc('month', cs.service_date::date)::date as ay_tarih,
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
    'mesai_gun', coalesce(v_mesai_gun, 0),
    'izin_gun', round(coalesce(v_izin, 0), 1),
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
    'trend', '[]'::jsonb, 'son_isler', '[]'::jsonb, 'hata', sqlerrm);
end $$;

revoke all on function public.personel_karnesi(text, text) from public;
grant execute on function public.personel_karnesi(text, text) to authenticated;


-- ============================================================================
-- 🧪 TEST
-- ============================================================================
select
  pm.personel,
  public.personel_karnesi(pm.personel, to_char(current_date,'YYYY-MM')) ->> 'mesai_gun' as mesai_gun,
  public.personel_karnesi(pm.personel, to_char(current_date,'YYYY-MM')) ->> 'izin_gun'  as izin_gun,
  public.izin_gun_sayisi(pm.personel, to_char(current_date,'YYYY-MM'))                   as izin_hesap,
  public.personel_karnesi(pm.personel, to_char(current_date,'YYYY-MM')) ->> 'hata'      as hata
from public.personel_maas pm where pm.aktif order by pm.maas desc;
