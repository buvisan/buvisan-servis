-- ============================================================================
--  🧊 GEÇMİŞ MAAŞ KORUMASI — GERÇEK ÇÖZÜM (Güncelleme #35) — KRİTİK
-- ----------------------------------------------------------------------------
--  SENİN TESTİN:
--    Ekim 2026'da maaşı 30.000 yaptın → Nisan 2026'ya döndün → 30.000 ❌
--
--  SEBEP:
--    Dondurma aralığı "gecerli_ay → geçen ay" olarak hesaplanıyordu.
--    Ama gecerli_ay SQL 53'te "2026-10" (bu ay) yapılmıştı.
--    Yani aralık: 2026-10 → 2026-09 = BOŞ → hiçbir ay dondurulmadı.
--
--  ÇÖZÜM (3 parça):
--    1) ESKİ VERİYİ GERİ GETİR: Eski puantaj tablosundaki (personnel_monthly_lists)
--       aylık maaşlar, ait oldukları aylara dondurulur → Nisan gerçek maaşını alır
--    2) DONDURMAYI DÜZELT: Maaş güncellenince, VERİ OLAN TÜM GEÇMİŞ AYLARA
--       eski maaş dondurulur (boş aralık sorunu biter)
--    3) KONTROL: hangi ay hangi maaşla kilitli
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) ESKİ PUANTAJ VERİSİNDEN GEÇMİŞ MAAŞLARI DONDUR
--    (personnel_monthly_lists → puantaj_manuel)
-- ============================================================================
do $$
declare
  v_eklenen integer := 0;
begin
  insert into public.puantaj_manuel (personel, ay, maas, aciklama)
  select
    public.tr_buyuk(trim(p.value ->> 'ad')),
    pml.month_key,
    coalesce((p.value ->> 'maas')::numeric, 0),
    'Geçmiş maaş (eski puantaj kaydından)'
  from public.personnel_monthly_lists pml
  cross join lateral jsonb_array_elements(coalesce(pml.personnel_data, '[]'::jsonb)) p
  where coalesce(trim(p.value ->> 'ad'), '') <> ''
    and coalesce((p.value ->> 'maas')::numeric, 0) > 0
    and pml.month_key < to_char(current_date, 'YYYY-MM')
  on conflict (personel, ay) do update
    set maas = case when coalesce(public.puantaj_manuel.maas, 0) = 0
                    then excluded.maas
                    else public.puantaj_manuel.maas end;

  get diagnostics v_eklenen = row_count;
  raise notice 'Eski puantajdan dondurulan kayıt: %', v_eklenen;
end $$;


-- ============================================================================
-- 2) MAAŞ GÜNCELLE v4 — DONDURMA ARTIK BOŞ ARALIK VERMEZ
-- ============================================================================
create or replace function public.maas_guncelle(
  p_personel   text,
  p_maas       numeric,
  p_kullanici  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mevcut     text;
  v_eski       numeric := 0;
  v_bu_ay      text := to_char(current_date, 'YYYY-MM');
  v_dondurulan integer := 0;
  v_resmi      text;
begin
  if not public.buvisan_admin_mi() then
    return jsonb_build_object('yetki_yok', true, 'mesaj', 'Maaş güncellemek için yönetici girişi gerekir.');
  end if;

  if coalesce(trim(p_personel), '') = '' then
    return jsonb_build_object('ok', false, 'mesaj', 'Personel adı gerekli.');
  end if;

  if coalesce(p_maas, -1) < 0 then
    return jsonb_build_object('ok', false, 'mesaj', 'Maaş negatif olamaz.');
  end if;

  -- Mevcut kaydı bul (yazım farkı duyarsız)
  select pm.personel, coalesce(pm.maas, 0)
    into v_mevcut, v_eski
  from public.personel_maas pm
  where public.parca_adi_normal(pm.personel) = public.parca_adi_normal(p_personel)
  order by coalesce(pm.maas, 0) desc, pm.guncelleme desc nulls last
  limit 1;

  v_resmi := coalesce(v_mevcut, public.personel_eslestir(p_personel), public.tr_buyuk(trim(p_personel)));

  -- ⭐ ESKİ MAAŞI TÜM GEÇMİŞ AYLARA DONDUR
  --    Kaynak: puantaj_gunluk (günlük mesai), puantaj_manuel (aylık kayıt),
  --            completed_services (iş kaydı) → hangisinde veri varsa o ay dondurulur
  if v_eski > 0 and v_eski <> p_maas then
    insert into public.puantaj_manuel (personel, ay, maas, aciklama)
    select distinct
      v_resmi,
      m.ay,
      v_eski,
      'Maaş donduruldu (' || to_char(v_eski, 'FM999G999G999') || ' ₺)'
    from (
      -- Günlük mesai kaydı olan aylar
      select to_char(g.tarih, 'YYYY-MM') as ay
      from public.puantaj_gunluk g
      where public.parca_adi_normal(g.personel) = public.parca_adi_normal(p_personel)
        and to_char(g.tarih, 'YYYY-MM') < v_bu_ay
      union
      -- Aylık puantaj kaydı olan aylar
      select m2.ay from public.puantaj_manuel m2
      where public.parca_adi_normal(m2.personel) = public.parca_adi_normal(p_personel)
        and m2.ay < v_bu_ay
      union
      -- İş yaptığı aylar
      select to_char(cs.service_date, 'YYYY-MM') as ay
      from public.completed_services cs
      where coalesce(cs.technician, '') <> ''
        and public.parca_adi_normal(cs.technician) like '%' || public.parca_adi_normal(p_personel) || '%'
        and to_char(cs.service_date, 'YYYY-MM') < v_bu_ay
    ) m
    on conflict (personel, ay) do update
      -- Sadece BOŞ veya kendi dondurmamız olan kayıtları güncelle (eski değeri koru)
      set maas = excluded.maas
      where coalesce(public.puantaj_manuel.maas, 0) = 0
         or coalesce(public.puantaj_manuel.aciklama, '') like 'Maaş donduruldu%';

    get diagnostics v_dondurulan = row_count;
  end if;

  -- Güncelle veya ekle
  if v_mevcut is not null then
    update public.personel_maas
       set maas = p_maas, aktif = true,
           gecerli_ay = v_bu_ay, guncelleyen = p_kullanici, guncelleme = now()
     where personel = v_mevcut;
  else
    insert into public.personel_maas (personel, maas, aktif, gecerli_ay, guncelleyen, guncelleme)
    values (v_resmi, p_maas, true, v_bu_ay, p_kullanici, now());
  end if;

  return jsonb_build_object(
    'ok', true,
    'eski_maas', v_eski,
    'yeni_maas', p_maas,
    'dondurulan_ay', v_dondurulan,
    'mesaj', v_resmi || ' maaşı güncellendi: ' || to_char(p_maas, 'FM999G999G999') || ' ₺'
             || case when v_dondurulan > 0
                     then ' (' || v_dondurulan || ' geçmiş ay eski maaşla donduruldu.)'
                     else '' end
  );
end;
$$;

revoke all on function public.maas_guncelle(text, numeric, text) from public;
grant execute on function public.maas_guncelle(text, numeric, text) to authenticated;


-- ============================================================================
-- 3) KONTROL — Kaya Ali'nin AYLIK MAAŞ GEÇMİŞİ
-- ============================================================================
select
  m.ay,
  m.maas                     as dondurulmus_maas,
  m.aciklama
from public.puantaj_manuel m
where public.parca_adi_normal(m.personel) = public.parca_adi_normal('KAYA ALİ TOSUN')
order by m.ay desc
limit 24;


-- ============================================================================
-- 4) KONTROL — güncel maaş + kaç ay dondurulmuş
-- ============================================================================
select
  pm.personel,
  pm.maas                                          as guncel_maas,
  (select count(*) from public.puantaj_manuel m
    where public.parca_adi_normal(m.personel) = public.parca_adi_normal(pm.personel)
      and m.maas > 0)                              as dondurulmus_ay_sayisi
from public.personel_maas pm
where pm.aktif
order by pm.maas desc;
