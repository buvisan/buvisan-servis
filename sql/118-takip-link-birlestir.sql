-- ============================================================================
--  🔗 TAKİP LİNKİ BİRLEŞTİRME (Güncelleme #90)
-- ----------------------------------------------------------------------------
--  SORUN:
--    /admin/takip     → is_takip tablosu → varış saati YAZILABİLİYOR ✅
--    /admin/planlayici → randevular.id    → varış saati YOK ❌
--
--  ÇÖZÜM:
--    1) is_takip tablosuna randevu_id sütunu ekle (bağlantı)
--    2) takip_link_al(randevu_id) → is_takip kaydı bulur/oluşturur
--    3) Planlayıcı bu fonksiyonu çağırır → AYNI kayıt → saat görünür
--
--  KULLANIM: 117'den SONRA çalıştır. Hata vermez.
-- ============================================================================


-- ============================================================================
-- 1) ➕ is_takip'e randevu_id BAĞLANTISI
-- ============================================================================
do $$
declare v_eklendi integer := 0;
begin
  begin
    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='is_takip' and column_name='randevu_id') then
      alter table public.is_takip add column randevu_id uuid;
      v_eklendi := v_eklendi + 1;
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='is_takip' and column_name='ticket_id') then
      alter table public.is_takip add column ticket_id uuid;
      v_eklendi := v_eklendi + 1;
    end if;
    raise notice '✅ is_takip bağlantı sütunları eklendi: %', v_eklendi;
  exception when others then
    raise notice '⚠️ Sütun ekleme → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 2) 🔗 takip_link_al() — randevudan CANLI takip kaydı bul/oluştur
-- ============================================================================
create or replace function public.takip_link_al(p_randevu_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r jsonb;
  v_takip_id uuid;
  v_musteri text;
  v_teknisyen text;
  v_tarih date;
  v_link text;
begin
  -- Randevuyu bul
  begin
    select to_jsonb(r) into v_r from public.randevular r where r.id = p_randevu_id limit 1;
  exception when others then v_r := null; end;

  if v_r is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Randevu bulunamadı.');
  end if;

  v_musteri := nullif(trim(coalesce(v_r->>'musteri_adi', v_r->>'customer_name','')),'');
  v_teknisyen := nullif(trim(coalesce(v_r->>'teknisyen', v_r->>'atanan_personel','')),'');
  begin
    v_tarih := nullif(trim(coalesce(v_r->>'randevu_tarihi','')),'')::date;
  exception when others then v_tarih := null; end;

  -- 1) Bu randevuya bağlı takip kaydı var mı?
  begin
    execute 'select id from public.is_takip where randevu_id = $1 limit 1'
      into v_takip_id using p_randevu_id;
  exception when others then v_takip_id := null; end;

  -- 2) Yoksa AYNI MÜŞTERİ + AKTİF tarihli kayıt var mı?
  if v_takip_id is null and v_musteri is not null then
    begin
      execute $q$
        select id from public.is_takip
        where public.parca_adi_normal(coalesce(to_jsonb(is_takip)->>'musteri','')) = public.parca_adi_normal($1)
          and coalesce(to_jsonb(is_takip)->>'durum','') not in ('BITTI','IPTAL')
        order by coalesce(to_jsonb(is_takip)->>'created_at','') desc
        limit 1
      $q$ into v_takip_id using v_musteri;
    exception when others then v_takip_id := null; end;
  end if;

  -- 3) Hiç yoksa YENİ takip kaydı oluştur
  if v_takip_id is null then
    begin
      execute $q$
        insert into public.is_takip (musteri, durum, teknisyen, randevu_id, tahmini_varis, created_at, guncelleme)
        values ($1, 'PLANLANDI', $2, $3,
                case when $4::date is not null then $4::date + time '09:00' else null end,
                now(), now())
        returning id
      $q$ into v_takip_id using v_musteri, v_teknisyen, p_randevu_id, v_tarih;
    exception when others then
      -- Sütun adları farklıysa basit sürüm
      begin
        execute 'insert into public.is_takip (musteri, durum) values ($1, ''PLANLANDI'') returning id'
          into v_takip_id using v_musteri;
      exception when others then
        return jsonb_build_object('ok', false, 'mesaj', 'Takip kaydı oluşturulamadı: ' || sqlerrm);
      end;
    end;
  end if;

  -- Randevu bağlantısını garanti et
  begin
    execute 'update public.is_takip set randevu_id = $1 where id = $2 and randevu_id is null'
      using p_randevu_id, v_takip_id;
  exception when others then null; end;

  v_link := 'https://servis.buvisan.com/takip/' || v_takip_id::text;

  return jsonb_build_object(
    'ok', true,
    'takip_id', v_takip_id,
    'link', v_link,
    'musteri', coalesce(v_musteri,''),
    'tahmini_varis', (select to_jsonb(t)->>'tahmini_varis' from public.is_takip t where t.id = v_takip_id));
end $$;

revoke all on function public.takip_link_al(uuid) from public;
grant execute on function public.takip_link_al(uuid) to authenticated;


-- ============================================================================
-- 3) 📋 MEVCUT is_takip KAYITLARINI RANDEVULARA BAĞLA (isim eşleşmesi)
-- ============================================================================
do $$
declare v_adet integer := 0;
begin
  begin
    update public.is_takip t
       set randevu_id = (
         select r.id from public.randevular r
         where public.randevu_isim(to_jsonb(r)) <> ''
           and public.parca_adi_normal(public.randevu_isim(to_jsonb(r)))
               = public.parca_adi_normal(coalesce(t.musteri,''))
         order by coalesce(to_jsonb(r)->>'randevu_tarihi','') desc
         limit 1)
     where (to_jsonb(t)->>'randevu_id') is null
       and coalesce(t.musteri,'') <> ''
       and exists (
         select 1 from public.randevular r
         where public.parca_adi_normal(public.randevu_isim(to_jsonb(r)))
               = public.parca_adi_normal(coalesce(t.musteri,'')));

    get diagnostics v_adet = row_count;
    raise notice '✅ is_takip → randevu bağlantısı kuruldu: %', v_adet;
  exception when others then
    raise notice '⚠️ Bağlantı → %', sqlerrm;
  end;
end $$;


-- ============================================================================
-- 4) 🧪 TEST — gerçek randevularla
-- ============================================================================
select
  r.id::text                                   as randevu_id,
  public.randevu_isim(to_jsonb(r))              as musteri,
  to_jsonb(r)->>'randevu_tarihi'                as tarih,
  public.takip_link_al(r.id) ->> 'ok'           as ok,
  public.takip_link_al(r.id) ->> 'link'         as takip_linki,
  left(coalesce(public.takip_link_al(r.id) ->> 'tahmini_varis',''), 16) as tahmini_varis
from public.randevular r
where coalesce(to_jsonb(r)->>'durum','') not in ('tamamlandi','iptal','yapildi')
order by coalesce(to_jsonb(r)->>'randevu_tarihi','') desc nulls last
limit 6;
