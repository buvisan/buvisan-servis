-- ============================================================================
--  💰 TEK DOĞRULUK KAYNAĞI: finans_ozet()
-- ----------------------------------------------------------------------------
--  SORUN (denetimde kanıtlandı):
--    Aynı ay için ÜÇ FARKLI kâr rakamı çıkıyordu:
--      • Panel (Depo sayfası)  → bir hesap
--      • Analiz sayfası        → başka hesap
--      • Yapay zeka asistanı   → daha başka hesap
--
--    Sebepleri:
--      1) Personel gideri İKİ yerde: financial_records.maas (elle)
--         ve personnel_monthly_lists.total_expense (puantajdan). Panel birini,
--         AI diğerini kullanıyordu.
--      2) Depo boşsa ciro/kâr 0 ₺ görünüyordu (erken çıkış hatası)
--      3) Malzeme adı depoda bulunamazsa alış fiyatı 0 alınıyordu → kâr şişiyordu
--      4) Geçmiş kâr GÜNCEL katalog fiyatıyla hesaplanıyordu → fiyat değişince
--         geçmiş ayın kârı da değişiyordu
--      5) TL dışı işlemler (currency) yok sayılıyordu
--
--  ÇÖZÜM:
--    Tek bir fonksiyon: finans_ozet('2026-01') → herkes aynı rakamı görür.
--    Panel, analiz sayfası ve yapay zeka BU fonksiyonu kullanacak.
--
--  KURALLAR (netleştirildi):
--    • Ciro         : completed_services.price (sadece TL işlemler)
--    • Personel     : puantaj varsa personnel_monthly_lists.total_expense,
--                     yoksa financial_records.maas
--    • Sabit gider  : kira + yakıt + yemek + mesai yemeği + araç yıpranma
--                     + araç sigorta + araç bakım + tazminat
--    • Malzeme      : financial_records.malzeme (elle girilen aylık depo gideri)
--    • Net kâr      : ciro − (personel + sabit + malzeme)
--
--  ⚠️ Hiçbir veriyi değiştirmez. Sadece okur ve hesaplar.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================

create or replace function public.finans_ozet(p_ay text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ciro as (
    select
      coalesce(sum(cs.price), 0)::numeric as toplam,
      count(*)::int                       as is_adedi,
      count(*) filter (where coalesce(cs.currency, 'TL') <> 'TL')::int as tl_disi_is
    from public.completed_services cs
    where to_char(cs.service_date, 'YYYY-MM') = p_ay
      and coalesce(cs.currency, 'TL') = 'TL'
  ),
  gider as (
    select
      coalesce(pt.total_expense, fr.maas, 0)::numeric as personel,
      (coalesce(fr.kira, 0) + coalesce(fr.yakit, 0) + coalesce(fr.yemek, 0)
       + coalesce(fr.mesai_yemek, 0) + coalesce(fr.arac_yipranma, 0)
       + coalesce(fr.arac_sigorta, 0) + coalesce(fr.arac_bakim, 0)
       + coalesce(fr.tazminat, 0))::numeric            as sabit,
      coalesce(fr.malzeme, 0)::numeric                 as malzeme,
      (fr.month_key is not null)                       as gider_girilmis,
      (pt.month_key is not null)                       as puantaj_var
    from (select 1) x
    left join public.financial_records       fr on fr.month_key = p_ay
    left join public.personnel_monthly_lists pt on pt.month_key = p_ay
    limit 1
  )
  select jsonb_build_object(
    'ay',                p_ay,
    'ciro',              (select toplam from ciro),
    'is_adedi',          (select is_adedi from ciro),
    'tl_disi_is',        (select tl_disi_is from ciro),
    'personel_gideri',   g.personel,
    'sabit_giderler',    g.sabit,
    'malzeme_gideri',    g.malzeme,
    'toplam_gider',      (g.personel + g.sabit + g.malzeme),
    'net_kar',           ((select toplam from ciro) - (g.personel + g.sabit + g.malzeme)),
    'kar_marji_yuzde',   case when (select toplam from ciro) > 0
                              then round((((select toplam from ciro) - (g.personel + g.sabit + g.malzeme))
                                          / (select toplam from ciro) * 100)::numeric, 1)
                              else 0 end,
    'gider_girilmis',    g.gider_girilmis,
    'personel_kaynagi',  case when g.puantaj_var then 'puantaj' else 'elle girilen' end,
    'uyari',             case
                           when not g.gider_girilmis then 'Bu ay için gider kaydı girilmemiş — kâr rakamı eksik olabilir.'
                           else null
                         end
  )
  from gider g;
$$;

revoke all on function public.finans_ozet(text) from public;
grant execute on function public.finans_ozet(text) to authenticated;


-- ============================================================================
-- AYLIK TREND (son 12 ay — panelde grafik için)
-- ============================================================================
create or replace function public.finans_trend(p_adet integer default 12)
returns table (
  ay text, ciro numeric, toplam_gider numeric, net_kar numeric, is_adedi integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.ay,
    (public.finans_ozet(a.ay) ->> 'ciro')::numeric          as ciro,
    (public.finans_ozet(a.ay) ->> 'toplam_gider')::numeric  as toplam_gider,
    (public.finans_ozet(a.ay) ->> 'net_kar')::numeric       as net_kar,
    (public.finans_ozet(a.ay) ->> 'is_adedi')::integer      as is_adedi
  from (
    select to_char(d, 'YYYY-MM') as ay
    from generate_series(
      date_trunc('month', current_date) - ((p_adet - 1) || ' months')::interval,
      date_trunc('month', current_date),
      interval '1 month'
    ) d
  ) a
  order by a.ay;
$$;

revoke all on function public.finans_trend(integer) from public;
grant execute on function public.finans_trend(integer) to authenticated;


-- ============================================================================
-- KONTROL: son 3 ayın özeti (herkesin göreceği rakamlar)
-- ============================================================================
select
  (public.finans_ozet(to_char(current_date - interval '2 month', 'YYYY-MM')) ->> 'ay')          as ay_1,
  (public.finans_ozet(to_char(current_date - interval '2 month', 'YYYY-MM')) ->> 'ciro')        as ciro_1,
  (public.finans_ozet(to_char(current_date - interval '2 month', 'YYYY-MM')) ->> 'net_kar')     as net_kar_1,

  (public.finans_ozet(to_char(current_date - interval '1 month', 'YYYY-MM')) ->> 'ay')          as ay_2,
  (public.finans_ozet(to_char(current_date - interval '1 month', 'YYYY-MM')) ->> 'ciro')        as ciro_2,
  (public.finans_ozet(to_char(current_date - interval '1 month', 'YYYY-MM')) ->> 'net_kar')     as net_kar_2,

  (public.finans_ozet(to_char(current_date, 'YYYY-MM')) ->> 'ay')                               as ay_3,
  (public.finans_ozet(to_char(current_date, 'YYYY-MM')) ->> 'ciro')                             as ciro_3,
  (public.finans_ozet(to_char(current_date, 'YYYY-MM')) ->> 'net_kar')                          as net_kar_3;
