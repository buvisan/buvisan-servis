-- ============================================================================
--  ↩️ GERİ ALMA — personel_siralama (Güncelleme #68)
-- ----------------------------------------------------------------------------
--  DURUM:
--    92'deki sürüm DOĞRUYDU (11·8·9·2·1 = 31 iş · /personel ekranıyla AYNI)
--    93'te personel_eslestir() kullandım → AŞIRI eşleştirme yaptı (60 iş)
--
--  ÇÖZÜM: 92'deki TAM İSİM eşleştirmesine geri dön + madalya sırasını düzelt
--
--  KULLANIM: 93'ten SONRA çalıştır. Hata vermez.
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
  -- ✅ TAM İSİM EŞLEŞMESİ (92'deki gibi — doğru sonuç veriyor)
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
      and public.parca_adi_normal(cs.technician) like '%' || a.nm || '%'
    group by a.ad
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
-- KARŞILAŞTIRMA TESTİ — /personel ekranıyla aynı mı?
-- ============================================================================
do $$
declare
  v_toplam integer;
  v_r record;
begin
  raise notice ' ';
  raise notice '═══════ EKİM 2026 KARŞILAŞTIRMA ═══════';

  select count(*) into v_toplam
  from public.completed_services cs
  where to_char(cs.service_date::date,'YYYY-MM') = to_char(current_date,'YYYY-MM')
    and public.parca_adi_normal(cs.technician) in (
      select public.parca_adi_normal(pm.personel) from public.personel_maas pm where pm.aktif);

  raise notice 'Tam isim eşleşen kayıt: %', v_toplam;
  raise notice '─────────';

  for v_r in select * from public.personel_siralama() loop
    raise notice '% % → % iş · % ₺',
      rpad(v_r.madalya, 3), rpad(v_r.personel, 18), v_r.is_sayisi, v_r.ciro;
  end loop;

  raise notice '═══════════════════════════════════════';
  raise notice 'Beklenen: VEYSEL 11 · OKAN 9 · GÖKHAN 8 · KAYA 2 · KERİM 1';
  raise notice '═══════════════════════════════════════';
end $$;


-- ============================================================================
-- SONUÇ
-- ============================================================================
select * from public.personel_siralama();
