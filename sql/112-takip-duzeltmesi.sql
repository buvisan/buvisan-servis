-- ============================================================================
--  📍 MÜŞTERİ TAKİP SİSTEMİ DÜZELTMESİ (Güncelleme #84)
-- ----------------------------------------------------------------------------
--  SORUN (servis.buvisan.com/takip/<id>):
--    1) Sayfa "İş durumu yükleniyor..." yazısında TAKILI KALIYOR
--       → is_durumu() fonksiyonu veri döndürmüyor
--    2) Müşteri VARIŞ SAATİNİ göremiyor
--       → varis / tahmini_varis alanları yok
--
--  ÇÖZÜM:
--    1) randevular'a takip sütunları ekle (yola_cikis, varis, tahmini_varis)
--    2) is_durumu() fonksiyonunu YENİDEN yaz (anon erişimli, girişsiz)
--    3) Telefon/fiyat/iç not ASLA paylaşılmaz
--
--  KULLANIM: 111'den SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) ➕ TAKİP SÜTUNLARI
-- ============================================================================
do $$
declare
  v_eklenen integer := 0;
begin
  begin
    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='randevular' and column_name='yola_cikis') then
      alter table public.randevular add column yola_cikis timestamptz;
      v_eklenen := v_eklenen + 1;
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='randevular' and column_name='varis') then
      alter table public.randevular add column varis timestamptz;
      v_eklenen := v_eklenen + 1;
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='randevular' and column_name='tahmini_varis') then
      alter table public.randevular add column tahmini_varis timestamptz;
      v_eklenen := v_eklenen + 1;
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='randevular' and column_name='bitis') then
      alter table public.randevular add column bitis timestamptz;
      v_eklenen := v_eklenen + 1;
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='randevular' and column_name='musteri_notu') then
      alter table public.randevular add column musteri_notu text;
      v_eklenen := v_eklenen + 1;
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='randevular' and column_name='guncelleme') then
      alter table public.randevular add column guncelleme timestamptz;
      v_eklenen := v_eklenen + 1;
    end if;

    raise notice '✅ Takip sütunları eklendi: %', v_eklenen;
  exception when others then
    raise notice '⚠️ Sütun ekleme → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 2) 📍 is_durumu() — MÜŞTERİ TAKİP FONKSİYONU (girişsiz erişim)
--    Sadece güvenli alanlar: telefon/fiyat/iç not YOK
-- ============================================================================
create or replace function public.is_durumu(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_r jsonb;
  v_durum text;
  v_musteri text;
  v_bulundu boolean := false;
begin
  -- RANDEVU olarak ara
  begin
    select to_jsonb(r) into v_r from public.randevular r where r.id = p_id;
    if v_r is not null then v_bulundu := true; end if;
  exception when others then v_r := null; end;

  -- Bulunamadıysa SERVİS TALEBİ olarak ara
  if not v_bulundu then
    begin
      select to_jsonb(t) into v_r from public.service_tickets t where t.id = p_id;
      if v_r is not null then v_bulundu := true; end if;
    exception when others then v_r := null; end;
  end if;

  if not v_bulundu or v_r is null then
    return jsonb_build_object('bulundu', false);
  end if;

  v_musteri := public.randevu_isim(v_r);

  -- Durum eşlemesi
  v_durum := case public.parca_adi_normal(coalesce(v_r->>'durum', v_r->>'status',''))
    when 'planlandi' then 'PLANLANDI'
    when 'yolda' then 'YOLDA'
    when 'vardi' then 'VARDI'
    when 'calisiyor' then 'CALISIYOR'
    when 'yapildi' then 'BITTI'
    when 'tamamlandi' then 'BITTI'
    when 'iptal' then 'IPTAL'
    else 'PLANLANDI' end;

  return jsonb_build_object(
    'bulundu', true,
    'durum', v_durum,
    'musteri', coalesce(nullif(v_musteri,''), 'Müşteri'),
    'vinc', coalesce(nullif(trim(coalesce(v_r->>'vinc_bilgisi','')),''), ''),
    'teknisyen', coalesce(nullif(trim(coalesce(v_r->>'atanan_personel','')),''),
                         nullif(trim(coalesce(v_r->>'personel','')),''), ''),
    -- ⭐ VARIŞ SAATLERİ
    'tahmini_varis', coalesce(v_r->>'tahmini_varis', v_r->>'randevu_saati'),
    'yola_cikis', v_r->>'yola_cikis',
    'varis', v_r->>'varis',
    'bitis', coalesce(v_r->>'bitis', v_r->>'tamamlanma_tarihi'),
    'konum_guncelleme', coalesce(v_r->>'guncelleme', v_r->>'updated_at'),
    'guncelleme', coalesce(v_r->>'guncelleme', v_r->>'updated_at', v_r->>'created_at'),
    'musteri_notu', coalesce(nullif(trim(coalesce(v_r->>'musteri_notu','')),''), ''),
    'randevu_tarihi', v_r->>'randevu_tarihi'
    -- ⚠️ telefon / fiyat / admin_notu ASLA paylaşılmaz
  );
end $$;

-- ⭐ GİRİŞSİZ ERİŞİM (müşteri linki için)
revoke all on function public.is_durumu(uuid) from public;
grant execute on function public.is_durumu(uuid) to anon;
grant execute on function public.is_durumu(uuid) to authenticated;


-- ============================================================================
-- 3) 🔄 DURUM GÜNCELLE — personel "YOLDA"/"VARDI" işaretlerse saat yazılsın
-- ============================================================================
create or replace function public.randevu_durum_saatleri()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yeni text;
  v_eski text;
begin
  v_yeni := public.parca_adi_normal(coalesce(to_jsonb(new)->>'durum',''));
  v_eski := case when tg_op = 'UPDATE' then public.parca_adi_normal(coalesce(to_jsonb(old)->>'durum','')) else '' end;

  -- YOLDA → yola çıkış saati
  if v_yeni = 'yolda' and v_eski <> 'yolda' then
    begin new.yola_cikis := coalesce(new.yola_cikis, now()); exception when others then null; end;
    begin new.tahmini_varis := coalesce(new.tahmini_varis, now() + interval '30 minutes'); exception when others then null; end;
  end if;

  -- VARDI → varış saati
  if v_yeni = 'vardi' and v_eski <> 'vardi' then
    begin new.varis := coalesce(new.varis, now()); exception when others then null; end;
  end if;

  -- YAPILDI/TAMAMLANDI → bitiş saati
  if v_yeni in ('yapildi','tamamlandi','tamamlandı') and v_eski not in ('yapildi','tamamlandi','tamamlandı') then
    begin new.bitis := coalesce(new.bitis, now()); exception when others then null; end;
  end if;

  -- Her güncellemede zaman damgası
  begin new.guncelleme := now(); exception when others then null; end;

  return new;
end $$;

do $$
begin
  begin
    drop trigger if exists tr_randevu_durum_saat on public.randevular;
    create trigger tr_randevu_durum_saat
      before insert or update on public.randevular
      for each row execute function public.randevu_durum_saatleri();
    raise notice '✅ Trigger: randevular → durum saatleri (yola çıkış/varış/bitiş)';
  exception when others then
    raise notice '⚠️ Trigger → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 4) 🧪 TEST — takip linki verisi geliyor mu?
-- ============================================================================
-- Mevcut randevulardan örnek id ile test
select
  public.is_durumu(r.id) ->> 'bulundu'   as bulundu,
  public.is_durumu(r.id) ->> 'musteri'   as musteri,
  public.is_durumu(r.id) ->> 'durum'     as durum,
  public.is_durumu(r.id) ->> 'teknisyen' as teknisyen,
  public.is_durumu(r.id) ->> 'varis'     as varis_saati
from public.randevular r
order by coalesce(to_jsonb(r)->>'created_at','') desc
limit 5;

-- Senin verdiğin takip linki
select public.is_durumu('e95816ec-e74f-4587-88dd-82a10c5647e0'::uuid) as takip_linki_verisi;
