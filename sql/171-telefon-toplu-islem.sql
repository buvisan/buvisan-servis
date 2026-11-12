-- ============================================================================
--  🎨 TELEFON İZİN — TOPLU SİLME + DÜZENLEME (Güncelleme #143)
--  KULLANIM: 170'ten SONRA çalıştır.
-- ============================================================================

-- 1) TOPLU SİLME
create or replace function public.telefon_izni_toplu_sil(p_idler uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sayi integer;
begin
  if p_idler is null or array_length(p_idler, 1) is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Seçim yapılmadı.');
  end if;

  delete from public.musteri_telefon_izinleri where id = any(p_idler);
  get diagnostics v_sayi = row_count;

  return jsonb_build_object('ok', true, 'silinen', v_sayi,
    'mesaj', v_sayi || ' kayıt silindi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.telefon_izni_toplu_sil(uuid[]) from public;
grant execute on function public.telefon_izni_toplu_sil(uuid[]) to authenticated;


-- 2) TÜMÜNÜ SİL
create or replace function public.telefon_izni_tumunu_sil()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sayi integer;
begin
  delete from public.musteri_telefon_izinleri;
  get diagnostics v_sayi = row_count;
  return jsonb_build_object('ok', true, 'silinen', v_sayi,
    'mesaj', v_sayi || ' kayıt silindi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.telefon_izni_tumunu_sil() from public;
grant execute on function public.telefon_izni_tumunu_sil() to authenticated;


-- 3) DÜZENLE
create or replace function public.telefon_izni_guncelle(
  p_id uuid,
  p_telefon text,
  p_firma text default null,
  p_yetkili text default null,
  p_notlar text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := public.temiz_telefon(p_telefon);
begin
  if length(v_tel) < 10 then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçerli telefon girin.');
  end if;

  update public.musteri_telefon_izinleri
     set telefon = v_tel,
         firma_adi = nullif(trim(coalesce(p_firma,'')),''),
         yetkili = nullif(trim(coalesce(p_yetkili,'')),''),
         notlar = nullif(trim(coalesce(p_notlar,'')),'')
   where id = p_id;

  if not found then
    return jsonb_build_object('ok', false, 'mesaj', 'Kayıt bulunamadı.');
  end if;

  return jsonb_build_object('ok', true, 'mesaj', '✅ Güncellendi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.telefon_izni_guncelle(uuid, text, text, text, text) from public;
grant execute on function public.telefon_izni_guncelle(uuid, text, text, text, text) to authenticated;


-- 4) İSTATİSTİK
create or replace function public.telefon_izin_istatistik()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'toplam', count(*),
    'kullanilan', count(*) filter (where kullanildi = true),
    'isimli', count(*) filter (where coalesce(yetkili,'') <> ''),
    'firmali', count(*) filter (where coalesce(firma_adi,'') <> ''),
    'bozuk_isim', count(*) filter (where yetkili ~ '^[=%0-9A-F]{4}')
  )
  from public.musteri_telefon_izinleri;
$$;

revoke all on function public.telefon_izin_istatistik() from public;
grant execute on function public.telefon_izin_istatistik() to authenticated;


-- 5) BOZUK İSİMLERİ TEMİZLE
create or replace function public.telefon_bozuk_isim_temizle()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sayi integer;
begin
  update public.musteri_telefon_izinleri
     set yetkili = null
   where yetkili ~ '^[=%0-9A-F]{4}';
  get diagnostics v_sayi = row_count;

  return jsonb_build_object('ok', true, 'temizlenen', v_sayi,
    'mesaj', v_sayi || ' bozuk isim temizlendi.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.telefon_bozuk_isim_temizle() from public;
grant execute on function public.telefon_bozuk_isim_temizle() to authenticated;


-- 6) TEST
select public.telefon_izin_istatistik() as istatistik;
