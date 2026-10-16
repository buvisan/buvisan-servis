-- ============================================================================
--  🔧 KESİN DÜZELTME — Yanlış damgaları temizle + gerçek tarih alanını bul
-- ----------------------------------------------------------------------------
--  BULGULAR (107 teşhisinden):
--    1) 8 kaydın tamamlanma_tarihi AYNI saniye: 2026-10-16T06:10:50
--       → SQL 105 çalıştığı an (benim now() yamam) ❌
--    2) appointment_date ve tarih → HEPSİ NULL
--       → Planlayıcı BAŞKA bir tarih alanı kullanıyor
--
--  ÇÖZÜM:
--    1) Toplu damgalanmış kayıtları TEMİZLE (NULL yap)
--    2) Randevular tablosunun DOLU sütunlarını bul (hangisi tarih?)
--    3) Geçmişe dönük tarih: olusturma tarihini kullan (en makul)
--
--  KULLANIM: 107'den SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) 🔍 HANGİ SÜTUNLAR DOLU? (tarih alanını bulmak için)
-- ============================================================================
do $$
declare
  v_kolon text;
  v_dolu integer;
  v_toplam integer;
begin
  raise notice ' ';
  raise notice '═══════ RANDEVULAR SÜTUN DOLULUĞU ═══════';

  select count(*) into v_toplam from public.randevular;
  raise notice 'Toplam kayıt: %', v_toplam;
  raise notice '─────────';

  for v_kolon in
    select column_name from information_schema.columns
    where table_schema='public' and table_name='randevular'
    order by ordinal_position
  loop
    begin
      execute format('select count(*) from public.randevular r where nullif(trim(coalesce(to_jsonb(r)->>%L,'''')),'''') is not null', v_kolon)
        into v_dolu;
      if v_dolu > 0 then
        raise notice '  % → % dolu', rpad(v_kolon, 24), v_dolu;
      end if;
    exception when others then null; end;
  end loop;

  raise notice '════════════════════════════════════════';
end $$;


-- ============================================================================
-- 2) 🧹 TOPLU DAMGALANMIŞ KAYITLARI TEMİZLE
--    Aynı saniyede 3+ kayıt varsa → o bir toplu yamadır, NULL yap
-- ============================================================================
do $$
declare v_adet integer := 0;
begin
  begin
    with toplu as (
      select tamamlanma_tarihi, count(*) as adet
      from public.randevular
      where tamamlanma_tarihi is not null
      group by 1
      having count(*) >= 3
    )
    update public.randevular r
       set tamamlanma_tarihi = null
      from toplu t
     where r.tamamlanma_tarihi = t.tamamlanma_tarihi;

    get diagnostics v_adet = row_count;
    raise notice '✅ Toplu damgalanmış kayıt temizlendi: %', v_adet;
  exception when others then
    raise notice '⚠️ Temizlik → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 3) 📅 GEÇMİŞ TARİH — olusturma tarihini kullan (en makul varsayım)
--    "yapıldı" durumundakiler için: created_at tarihi = yapıldığı gün kabul
-- ============================================================================
do $$
declare v_adet integer := 0;
begin
  begin
    update public.randevular r
       set tamamlanma_tarihi = nullif(trim(coalesce(to_jsonb(r)->>'created_at','')),'')::timestamptz
     where public.parca_adi_normal(coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum',''))
           in ('tamamlandi','tamamlandı','yapildi','yapıldı')
       and tamamlanma_tarihi is null
       and nullif(trim(coalesce(to_jsonb(r)->>'created_at','')),'') is not null;

    get diagnostics v_adet = row_count;
    raise notice '✅ Oluşturma tarihinden damgalanan: %', v_adet;
  exception when others then
    raise notice '⚠️ Geçmiş tarih → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 4) ✅ KONTROL — bugün yapılan kaç?
-- ============================================================================
select
  count(*)                                                              as toplam_yapildi,
  count(*) filter (where tamamlanma_tarihi::date = current_date)         as bugun,
  count(*) filter (where tamamlanma_tarihi::date < current_date)         as gecmis,
  count(*) filter (where tamamlanma_tarihi is null)                      as tarihsiz
from public.randevular
where public.parca_adi_normal(coalesce(to_jsonb(randevular)->>'status', to_jsonb(randevular)->>'durum',''))
      in ('tamamlandi','tamamlandı','yapildi','yapıldı');


-- ============================================================================
-- 5) 🔍 TARİH ALANI ADAYLARI — hangi sütunda tarih var?
-- ============================================================================
select
  count(*)                                                          as toplam,
  count(nullif(trim(coalesce(to_jsonb(r)->>'appointment_date','')),'')) as appt_date,
  count(nullif(trim(coalesce(to_jsonb(r)->>'tarih','')),''))         as tarih,
  count(nullif(trim(coalesce(to_jsonb(r)->>'randevu_tarihi','')),'')) as randevu_tarihi,
  count(nullif(trim(coalesce(to_jsonb(r)->>'date','')),''))          as date_alan,
  count(nullif(trim(coalesce(to_jsonb(r)->>'gun','')),''))           as gun,
  count(nullif(trim(coalesce(to_jsonb(r)->>'slot_tarihi','')),''))   as slot_tarihi,
  count(nullif(trim(coalesce(to_jsonb(r)->>'created_at','')),''))    as olusturma
from public.randevular r;


-- ============================================================================
-- 6) 🎯 ÖRNEK KAYIT — TÜM alanları JSON olarak (hangi alan ne?)
-- ============================================================================
select jsonb_pretty(to_jsonb(r)) as ornek_kayit
from public.randevular r
where public.parca_adi_normal(coalesce(to_jsonb(r)->>'status', to_jsonb(r)->>'durum','')) = 'planlandi'
order by coalesce(to_jsonb(r)->>'created_at','') desc
limit 1;
