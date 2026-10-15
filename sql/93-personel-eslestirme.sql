-- ============================================================================
--  🏆 PERSONEL SIRALAMASI DÜZELTMESİ (Güncelleme #67)
-- ----------------------------------------------------------------------------
--  SORUN (92 sonucundan):
--    Toplam sadece 31 iş bulundu (gerçekte 78+) · KERİM AKDOĞAN 1 iş göründü
--    (25 işi vardı) · madalyalar kaydı
--
--  SEBEP:
--    92'de basit LIKE '%isim%' eşleştirmesi kullandım.
--    AMA servis kayıtlarında teknisyen adı farklı yazılıyor:
--      "Kerim" · "KERIM" · "Kerim Akdogan" · "kerim akdoğan"
--    → Senin sistemde bunun için personel_eslestir() çözücüsü VAR.
--
--  ÇÖZÜM:
--    personel_eslestir() kullan (kanonik isim çözücü) + madalya sırası düzeltildi
--
--  KULLANIM: 92'den SONRA çalıştır. Hata vermez.
-- ============================================================================

drop function if exists public.personel_siralama(text);

create or replace function public.personel_siralama(p_ay text default null)
returns table (
  sira integer, personel text, is_sayisi integer, ciro numeric,
  ortalama_sure numeric, musteri_puani numeric, performans numeric, madalya text
)
language sql
stable
security definer
set search_path = public
as $$
  with ay as (select coalesce(p_ay, to_char(current_date,'YYYY-MM')) as a),
  aktif as (
    select pm.personel as ad,
           public.parca_adi_normal(pm.personel) as nm
    from public.personel_maas pm
    where pm.aktif
  ),
  -- ⭐ personel_eslestir() ile KANONİK eşleştirme
  isler as (
    select
      a.ad,
      count(*)::int as adet,
      coalesce(sum(cs.price),0) as ciro,
      coalesce(avg(nullif(cs.work_hours,0)),0) as ort
    from public.completed_services cs
    cross join ay
    cross join aktif a
    where to_char(cs.service_date::date,'YYYY-MM') = ay.a
      and coalesce(trim(cs.technician),'') <> ''
      and public.parca_adi_normal(public.personel_eslestir(trim(cs.technician))) = a.nm
    group by a.ad
  ),
  -- Eşleşmeyen teknisyenleri de göster (isim varyasyonları için)
  eslesmeyen as (
    select
      public.personel_eslestir(trim(cs.technician)) as cozulen,
      trim(cs.technician) as ham,
      count(*)::int as adet
    from public.completed_services cs
    cross join ay
    where to_char(cs.service_date::date,'YYYY-MM') = ay.a
      and coalesce(trim(cs.technician),'') <> ''
      and public.parca_adi_normal(public.personel_eslestir(trim(cs.technician))) not in
          (select nm from aktif)
    group by 1, 2
    order by 3 desc
    limit 10
  ),
  puanli as (
    select
      i.ad, i.adet, i.ciro, i.ort,
      round(
        least(30, i.ciro / 20000.0 * 30)
        + least(20, i.adet * 1.5)
        + 25 + 25
      , 1) as perf
    from isler i
  ),
  sirali as (
    select p.*, row_number() over (order by p.ciro desc, p.adet desc) as s
    from puanli p
  )
  select
    s.s::int, s.ad, s.adet, round(s.ciro), round(s.ort, 1),
    null::numeric, s.perf,
    case s.s when 1 then '🥇' when 2 then '🥈' when 3 then '🥉' else '' end
  from sirali s
  order by s.s;
$$;

revoke all on function public.personel_siralama(text) from public;
grant execute on function public.personel_siralama(text) to authenticated;


-- ============================================================================
-- TEST — eşleşme oranı + eşleşmeyen isimler
-- ============================================================================
do $$
declare
  v_toplam integer; v_eslesen integer; v_r record;
begin
  raise notice ' ';
  raise notice '═══════ PERSONEL EŞLEŞTİRME TESTİ ═══════';

  begin
    select count(*) into v_toplam
    from public.completed_services cs
    where to_char(cs.service_date::date,'YYYY-MM') = to_char(current_date,'YYYY-MM')
      and coalesce(trim(cs.technician),'') <> '';

    select count(*) into v_eslesen
    from public.completed_services cs
    where to_char(cs.service_date::date,'YYYY-MM') = to_char(current_date,'YYYY-MM')
      and coalesce(trim(cs.technician),'') <> ''
      and public.parca_adi_normal(public.personel_eslestir(trim(cs.technician))) in (
        select public.parca_adi_normal(pm.personel) from public.personel_maas pm where pm.aktif);

    raise notice 'Bu ay toplam servis kaydı : %', v_toplam;
    raise notice 'Eşleşen (aktif personele) : %', v_eslesen;
    raise notice 'Eşleşmeyen                : %', greatest(0, v_toplam - v_eslesen);
  exception when others then
    raise notice '⚠️ Test hatası → %', sqlerrm;
  end;

  raise notice '─────────';
  raise notice 'EŞLEŞMEYEN TEKNİSYEN İSİMLERİ:';
  begin
    for v_r in
      select distinct trim(cs.technician) as ham,
             public.personel_eslestir(trim(cs.technician)) as cozulen,
             count(*) as adet
      from public.completed_services cs
      where coalesce(trim(cs.technician),'') <> ''
        and public.parca_adi_normal(public.personel_eslestir(trim(cs.technician))) not in (
          select public.parca_adi_normal(pm.personel) from public.personel_maas pm where pm.aktif)
      group by 1, 2
      order by 3 desc limit 12
    loop
      raise notice '  • "%" → "%" (% iş)', v_r.ham, v_r.cozulen, v_r.adet;
    end loop;
  exception when others then
    raise notice '  (okunamadı → %)', sqlerrm;
  end;
  raise notice '════════════════════════════════════════';
end $$;


-- ============================================================================
-- SONUÇ — düzeltilmiş sıralama
-- ============================================================================
select * from public.personel_siralama();

-- Geçen ayın sıralaması (karşılaştırma)
select * from public.personel_siralama(to_char(current_date - interval '1 month','YYYY-MM'));
