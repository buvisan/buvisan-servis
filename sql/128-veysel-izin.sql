-- ============================================================================
--  🔍 VEYSEL'İN İZİN KAYDI — FİLTRESİZ İNCELEME (Güncelleme #100)
-- ----------------------------------------------------------------------------
--  SORUN: Veysel bugün izin açtı ama karnede görünmüyor
--         (diğer personellerde çalışıyor)
--
--  MUHTEMEL SEBEP:
--    • personel adı farklı yazılmış
--    • durum değeri farklı (bekliyor? onay bekliyor?)
--    • talep_tipi farklı
--    • baslangic/bitis alanı boş veya farklı tipte
--
--  KULLANIM: 127'den SONRA çalıştır.
-- ============================================================================

-- 1) ⭐ VEYSEL'İN TÜM TALEPLERİ (hiç filtre yok)
select
  pt.id,
  coalesce(pt.personel,'(boş)')       as personel_ham,
  public.parca_adi_normal(coalesce(pt.personel,'')) as personel_normal,
  coalesce(pt.talep_tipi,'(boş)')     as talep_tipi,
  coalesce(pt.baslik,'')              as baslik,
  coalesce(pt.baslangic::text,'(boş)') as baslangic,
  coalesce(pt.bitis::text,'(boş)')     as bitis,
  coalesce(pt.durum,'(boş)')           as durum,
  coalesce(pt.ucretli::text,'-')       as ucretli,
  left(coalesce(pt.created_at::text,''), 16) as olusturma
from public.personel_talepler pt
where public.parca_adi_normal(coalesce(pt.personel,'')) like '%veysel%'
   or public.parca_adi_normal(coalesce(pt.personel,'')) like '%carkli%'
order by pt.created_at desc nulls last
limit 30;


-- 2) 📋 TÜM TALEPLER — son 20 (isim nasıl yazılmış görmek için)
select
  coalesce(pt.personel,'(boş)')   as personel_ham,
  coalesce(pt.talep_tipi,'(boş)') as talep_tipi,
  coalesce(pt.durum,'(boş)')      as durum,
  coalesce(pt.baslangic::text,'') as baslangic,
  coalesce(pt.bitis::text,'')     as bitis,
  left(coalesce(pt.created_at::text,''), 16) as olusturma
from public.personel_talepler pt
order by pt.created_at desc nulls last
limit 20;


-- 3) 📊 TALEP_TIPI VE DURUM DEĞERLERİ (hangi değerler var?)
do $$
declare v_r record;
begin
  raise notice ' ';
  raise notice '═══════ TALEP_TIPI DEĞERLERİ ═══════';
  for v_r in
    select coalesce(talep_tipi,'(boş)') as v, count(*) as adet
    from public.personel_talepler group by 1 order by 2 desc
  loop
    raise notice '  % → % kayıt', rpad(v_r.v, 28), v_r.adet;
  end loop;

  raise notice '─────────';
  raise notice '═══════ DURUM DEĞERLERİ ═══════';
  for v_r in
    select coalesce(durum,'(boş)') as v, count(*) as adet
    from public.personel_talepler group by 1 order by 2 desc
  loop
    raise notice '  % → % kayıt', rpad(v_r.v, 28), v_r.adet;
  end loop;

  raise notice '─────────';
  raise notice '═══════ PERSONEL İSİMLERİ ═══════';
  for v_r in
    select coalesce(personel,'(boş)') as v, count(*) as adet
    from public.personel_talepler group by 1 order by 2 desc limit 15
  loop
    raise notice '  % → % kayıt', rpad(v_r.v, 28), v_r.adet;
  end loop;
  raise notice '══════════════════════════════════';
end $$;


-- 4) 🔍 İZİN BENZERİ TÜM KAYITLAR
select
  coalesce(pt.personel,'(boş)')   as personel,
  coalesce(pt.talep_tipi,'')      as tip,
  coalesce(pt.durum,'')           as durum,
  coalesce(pt.baslangic::text,'') as baslangic,
  coalesce(pt.bitis::text,'')     as bitis,
  greatest(1, coalesce((pt.bitis::date - pt.baslangic::date), 0) + 1) as gun
from public.personel_talepler pt
where public.parca_adi_normal(coalesce(pt.talep_tipi,'')) like '%izin%'
   or public.parca_adi_normal(coalesce(pt.talep_tipi,'')) like '%yillik%'
   or public.parca_adi_normal(coalesce(pt.baslik,'')) like '%izin%'
   or public.parca_adi_normal(coalesce(pt.aciklama,'')) like '%izin%'
order by pt.created_at desc nulls last
limit 20;


-- 5) 🧪 izin_gun_sayisi TESTİ — Veysel ve diğerleri
select
  pm.personel,
  public.izin_gun_sayisi(pm.personel, to_char(current_date,'YYYY-MM')) as izin_gun,
  public.izin_gun_sayisi(pm.personel, null)                            as izin_tum_aylar
from public.personel_maas pm
where pm.aktif
order by pm.maas desc;
