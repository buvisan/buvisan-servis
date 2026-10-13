-- ============================================================================
--  🧹 ÇİFT KAYIT TEMİZLEME + MAAŞ DONDURMA (Düzeltilmiş) (Güncelleme #33)
-- ----------------------------------------------------------------------------
--  HATA: "more than one row returned by a subquery used as an expression"
--
--  SEBEP:
--    maas_guncelle() maaşı GÖNDERİLEN YAZIMLA kaydediyordu.
--    Tabloda "KAYA ALİ TOSUN" varken, uygulama "Kaya Ali TOSUN" gönderdi
--    → on conflict (personel) TUTMADI (yazımlar farklı) → İKİNCİ SATIR eklendi
--    → aynı kişi iki kayıt → "tek satır bekleniyordu, iki geldi" hatası
--
--  ÇÖZÜM:
--    1) Çift kayıtlar temizlenir (en doğru olan kalır)
--    2) maas_guncelle() artık YAZIM FARKINI yok sayarak günceller
--       → bir daha çift kayıt OLUŞMAZ
--    3) Geçmiş aylara maaş dondurma (güvenli şekilde)
--
--  ⚠️ Sadece TEKRAR EDEN kayıtları birleştirir — gerçek veri silinmez.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 0) ÖNCE GEREKLİ SÜTUNU EKLE
--    (SQL 52 hata verince tüm değişiklikleri geri aldı → bu sütun oluşmamıştı)
-- ============================================================================
alter table public.personel_maas
  add column if not exists gecerli_ay text;

update public.personel_maas
   set gecerli_ay = to_char(current_date, 'YYYY-MM')
 where coalesce(gecerli_ay, '') = '';


-- ============================================================================
-- 1) ÖNCE: çift kayıtları GÖSTER (ne silinecek, gözünle gör)
-- ============================================================================
select
  public.parca_adi_normal(personel)  as ayni_kisi,
  string_agg(personel || ' (' || maas || ' ₺)', '  |  ' order by maas desc) as kayitlar,
  count(*)                           as kac_kayit
from public.personel_maas
group by public.parca_adi_normal(personel)
having count(*) > 1
order by count(*) desc;


-- ============================================================================
-- 2) ÇİFT KAYITLARI TEMİZLE (en doğru olan kalır)
--    Kural: maaşı dolu olan > maaşı büyük olan > son güncellenen
-- ============================================================================
with sirali as (
  select
    id,
    row_number() over (
      partition by public.parca_adi_normal(personel)
      order by (coalesce(maas, 0) > 0) desc,
               coalesce(maas, 0) desc,
               guncelleme desc nulls last,
               id
    ) as sira
  from public.personel_maas
)
delete from public.personel_maas
where id in (select id from sirali where sira > 1);


-- ============================================================================
-- 3) MAAŞ GÜNCELLE v3 — YAZIM FARKINI YOK SAYAR (çift kayıt önleyici)
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
  v_eski_bas   text;
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

  -- ⭐ MEVCUT KAYDI YAZIM FARKINI YOK SAYARAK BUL (çift kayıt önlenir)
  select pm.personel, pm.maas, coalesce(pm.gecerli_ay, v_bu_ay)
    into v_mevcut, v_eski, v_eski_bas
  from public.personel_maas pm
  where public.parca_adi_normal(pm.personel) = public.parca_adi_normal(p_personel)
  order by coalesce(pm.maas, 0) desc, pm.guncelleme desc nulls last
  limit 1;

  -- Resmî isim: varsa mevcut kaydın adı, yoksa eşleştirici, yoksa gönderilen ad
  v_resmi := coalesce(v_mevcut, public.personel_eslestir(p_personel), trim(p_personel));

  -- ⭐ ESKİ MAAŞI GEÇMİŞ AYLARA DONDUR
  if v_eski > 0 and v_eski <> p_maas then
    insert into public.puantaj_manuel (personel, ay, maas, aciklama)
    select
      v_resmi,
      to_char(d, 'YYYY-MM'),
      v_eski,
      'Maaş donduruldu (' || to_char(v_eski, 'FM999G999G999') || ' ₺)'
    from generate_series(
      to_date(coalesce(v_eski_bas, v_bu_ay) || '-01', 'YYYY-MM-DD'),
      (to_date(v_bu_ay || '-01', 'YYYY-MM-DD') - interval '1 month'),
      interval '1 month'
    ) d
    on conflict (personel, ay) do nothing;

    get diagnostics v_dondurulan = row_count;
  end if;

  -- Güncelle veya ekle
  if v_mevcut is not null then
    update public.personel_maas
       set maas = p_maas,
           aktif = true,
           gecerli_ay = v_bu_ay,
           guncelleyen = p_kullanici,
           guncelleme = now()
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
    'mesaj', v_resmi || ' maaşı güncellendi: ' ||
             to_char(p_maas, 'FM999G999G999') || ' ₺'
             || case when v_dondurulan > 0
                     then ' (' || v_dondurulan || ' geçmiş ay eski maaşla donduruldu.)'
                     else '' end
  );
end;
$$;

revoke all on function public.maas_guncelle(text, numeric, text) from public;
grant execute on function public.maas_guncelle(text, numeric, text) to authenticated;


-- ============================================================================
-- 4) GEÇMİŞ AYLARA MAAŞ DONDUR (güvenli — max() ile)
-- ============================================================================
do $$
declare
  v_eklenen integer := 0;
begin
  insert into public.puantaj_manuel (personel, ay, maas, aciklama)
  select distinct
    g.personel,
    to_char(g.tarih, 'YYYY-MM'),
    coalesce((select max(pm.maas) from public.personel_maas pm
               where public.parca_adi_normal(pm.personel) = public.parca_adi_normal(g.personel)), 0),
    'Maaş donduruldu (geçmiş ay)'
  from public.puantaj_gunluk g
  where not exists (
    select 1 from public.puantaj_manuel m
    where public.parca_adi_normal(m.personel) = public.parca_adi_normal(g.personel)
      and m.ay = to_char(g.tarih, 'YYYY-MM')
  )
  on conflict (personel, ay) do nothing;

  get diagnostics v_eklenen = row_count;
  raise notice 'Dondurulan kayıt: %', v_eklenen;
end $$;


-- ============================================================================
-- 5) KONTROL — çift kayıt kaldı mı?
-- ============================================================================
select
  (select count(*) from public.personel_maas)                     as toplam_kayit,
  (select count(distinct public.parca_adi_normal(personel))
     from public.personel_maas)                                   as farkli_kisi,
  case when (select count(*) from public.personel_maas) =
            (select count(distinct public.parca_adi_normal(personel)) from public.personel_maas)
       then '✅ ÇİFT KAYIT YOK' else '⚠️ Hala çift kayıt var' end as sonuc;

-- Personel listesi
select personel, maas, aktif, gecerli_ay, guncelleme
from public.personel_maas
order by aktif desc, maas desc;
