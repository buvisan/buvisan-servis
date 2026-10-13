-- ============================================================================
--  🔧 KAZANÇ MOTORU v3 — ARA KATMAN YOK, DOĞRUDAN OKUR (Güncelleme #30)
-- ----------------------------------------------------------------------------
--  SORUN:
--    Admin puantaj sayfası personelin girdiği mesaileri göstermiyordu.
--    Kayıtlar DOĞRU isimle duruyor ("KAYA ALİ TOSUN" · cmt 3 sa · paz 3 sa)
--    ama okuma zinciri kopuktu: personel_kazanc → puantaj_aylik → günlük
--    Ara fonksiyonlardan biri güncellenmemiş olduğu için 0 dönüyordu.
--
--  ÇÖZÜM:
--    personel_kazanc() artık ARA KATMAN KULLANMAZ.
--    Doğrudan okur:
--      1) personel_maas      → maaş
--      2) puantaj_gunluk     → günlük saatler (cmt %50, paz %100)
--      3) puantaj_manuel     → avans, kesinti, yemek, prim
--      4) completed_services → iş sayısı, ciro
--    Böylece hiçbir ara fonksiyona bağımlı DEĞİL → bir daha bozulmaz.
--
--  ⚠️ Veri değiştirmez. Sadece fonksiyonu yeniler.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================

create or replace function public.personel_kazanc(
  p_personel text,
  p_ay       text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ay          text := coalesce(p_ay, to_char(current_date, 'YYYY-MM'));
  v_maas        numeric := 0;
  v_manuel_maas numeric := 0;
  v_normal      numeric := 0;
  v_m50         numeric := 0;
  v_m100        numeric := 0;
  v_m50_manuel  numeric := 0;
  v_m100_manuel numeric := 0;
  v_avans       numeric := 0;
  v_kesinti     numeric := 0;
  v_yemek       numeric := 0;
  v_prim        numeric := 0;
  v_gun_sayisi  integer := 0;
  v_izin_gun    integer := 0;
  v_saatlik     numeric;
  v_mesai_tutar numeric;
  v_isler       record;
begin
  -- 🔒 YETKİ: kendi kazancı veya yönetici
  if not (
    public.buvisan_admin_mi()
    or public.parca_adi_normal(p_personel) = public.parca_adi_normal(public.benim_adim())
  ) then
    return jsonb_build_object('yetki_yok', true, 'mesaj', 'Sadece kendi kazanç bilginizi görebilirsiniz.');
  end if;

  -- 1) MAAŞ — personel_maas tablosundan
  select coalesce(max(pm.maas), 0) into v_maas
  from public.personel_maas pm
  where public.parca_adi_normal(pm.personel) = public.parca_adi_normal(p_personel);

  -- 2) GÜNLÜK MESAİ KAYITLARI (personelin kendi girdiği saatler)
  select
    count(*) filter (where not coalesce(g.izin_mi, false)),
    count(*) filter (where coalesce(g.izin_mi, false)),
    coalesce(sum(g.normal_saat), 0),
    coalesce(sum(g.mesai50_saat), 0),
    coalesce(sum(g.mesai100_saat), 0)
  into v_gun_sayisi, v_izin_gun, v_normal, v_m50, v_m100
  from public.puantaj_gunluk g
  where public.parca_adi_normal(g.personel) = public.parca_adi_normal(p_personel)
    and to_char(g.tarih, 'YYYY-MM') = v_ay;

  -- 3) AYLIK KAYIT (avans, kesinti, yemek, prim + eski mesai saatleri)
  select
    coalesce(max(maas), 0),
    coalesce(max(avans), 0),
    coalesce(max(kesinti), 0),
    coalesce(max(yemek), 0),
    coalesce(max(prim), 0),
    coalesce(max(mesai50_saat), 0),
    coalesce(max(mesai100_saat), 0)
  into v_manuel_maas, v_avans, v_kesinti, v_yemek, v_prim, v_m50_manuel, v_m100_manuel
  from public.puantaj_manuel
  where public.parca_adi_normal(personel) = public.parca_adi_normal(p_personel)
    and ay = v_ay;

  -- Maaş: personel_maas boşsa aylık kayıttan al
  if v_maas = 0 then v_maas := v_manuel_maas; end if;

  -- Mesai: günlük kayıt varsa O kullanılır, yoksa aylık kayıttan
  if v_m50 = 0 then v_m50 := v_m50_manuel; end if;
  if v_m100 = 0 then v_m100 := v_m100_manuel; end if;

  -- 4) HESAP
  v_saatlik     := round(v_maas / 225.0, 2);
  v_mesai_tutar := round(v_saatlik * v_m50 * 1.5 + v_saatlik * v_m100 * 2.0, 2);

  -- 5) İŞ İSTATİSTİKLERİ
  select
    count(*)                                                      as adet,
    coalesce(sum(cs.price), 0)                                    as ciro,
    coalesce(sum(cs.work_hours), 0)                               as saat,
    count(*) filter (where extract(dow from cs.service_date) = 6) as cmt,
    count(*) filter (where extract(dow from cs.service_date) = 0) as paz
  into v_isler
  from public.completed_services cs
  where to_char(cs.service_date, 'YYYY-MM') = v_ay
    and coalesce(cs.technician, '') <> ''
    and public.parca_adi_normal(cs.technician) like '%' || public.parca_adi_normal(p_personel) || '%';

  return jsonb_build_object(
    'personel',       p_personel,
    'ay',             v_ay,
    'kayit_var',      (v_maas > 0 or v_m50 > 0 or v_m100 > 0 or v_gun_sayisi > 0),
    'maas',           v_maas,
    'saatlik_ucret',  v_saatlik,
    'normal_saat',    round(v_normal, 1),
    'gun_sayisi',     v_gun_sayisi,
    'izin_gun',       v_izin_gun,
    'mesai50_saat',   round(v_m50, 1),
    'mesai50_tutar',  round(v_saatlik * v_m50 * 1.5, 2),
    'mesai100_saat',  round(v_m100, 1),
    'mesai100_tutar', round(v_saatlik * v_m100 * 2.0, 2),
    'toplam_mesai',   v_mesai_tutar,
    'prim',           v_prim,
    'yemek',          v_yemek,
    'avans',          v_avans,
    'kesinti',        v_kesinti,
    'net_ele_gecen',  round(v_maas + v_mesai_tutar + v_prim + v_yemek - v_avans - v_kesinti, 2),
    'is_sayisi',      v_isler.adet,
    'toplam_ciro',    round(v_isler.ciro, 0),
    'calisma_saati',  v_isler.saat,
    'cumartesi_is',   v_isler.cmt,
    'pazar_is',       v_isler.paz,
    'kaynak',         case when v_gun_sayisi > 0 then 'günlük kayıtlar' else 'aylık kayıt' end
  );
end;
$$;

revoke all on function public.personel_kazanc(text, text) from public;
grant execute on function public.personel_kazanc(text, text) to authenticated;


-- ============================================================================
-- PUANTAJ AYLIK — aynı şekilde doğrudan okur (ara katman yok)
-- ============================================================================
create or replace function public.puantaj_aylik(
  p_personel text,
  p_ay       text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ay text := coalesce(p_ay, to_char(current_date, 'YYYY-MM'));
  k    jsonb;
begin
  if not (
    public.buvisan_admin_mi()
    or public.parca_adi_normal(p_personel) = public.parca_adi_normal(public.benim_adim())
  ) then
    return jsonb_build_object('yetki_yok', true, 'mesaj', 'Sadece kendi puantajınızı görebilirsiniz.');
  end if;

  k := public.personel_kazanc(p_personel, v_ay);

  return jsonb_build_object(
    'personel',      p_personel,
    'ay',            v_ay,
    'normal_saat',   k ->> 'normal_saat',
    'gun_sayisi',    k ->> 'gun_sayisi',
    'izin_gun',      k ->> 'izin_gun',
    'mesai50_saat',  k ->> 'mesai50_saat',
    'mesai100_saat', k ->> 'mesai100_saat',
    'maas',          k ->> 'maas',
    'avans',         k ->> 'avans',
    'kesinti',       k ->> 'kesinti',
    'yemek',         k ->> 'yemek',
    'prim',          k ->> 'prim',
    'kaynak',        k ->> 'kaynak'
  );
end;
$$;

revoke all on function public.puantaj_aylik(text, text) from public;
grant execute on function public.puantaj_aylik(text, text) to authenticated;


-- ============================================================================
-- KONTROL — her personel için ne görünüyor?
-- ============================================================================
with kisiler as (
  select unnest(array[
    'Kaya Ali TOSUN','Veysel ÇARKLI','Gökhan GÖK','Kerim AKDOĞAN','Okan ARAN'
  ]) as ad
)
select
  k.ad,
  (public.personel_kazanc(k.ad) ->> 'maas')          as maas,
  (public.personel_kazanc(k.ad) ->> 'normal_saat')   as normal_saat,
  (public.personel_kazanc(k.ad) ->> 'mesai50_saat')  as cmt50,
  (public.personel_kazanc(k.ad) ->> 'mesai100_saat') as paz100,
  (public.personel_kazanc(k.ad) ->> 'toplam_mesai')  as mesai_tutari,
  (public.personel_kazanc(k.ad) ->> 'net_ele_gecen') as net,
  (public.personel_kazanc(k.ad) ->> 'kaynak')        as kaynak
from kisiler k;
