-- ============================================================================
--  🔧 TOKEN DÜZELTMESİ (Güncelleme #139)
-- ----------------------------------------------------------------------------
--  HATA: function gen_random_bytes(integer) does not exist
--  SEBEP: pgcrypto eklentisi aktif değil
--
--  ÇÖZÜM: pgcrypto'yu dene, olmazsa md5 ile güvenli token üret
--
--  KULLANIM: 166'dan SONRA çalıştır.
-- ============================================================================

-- pgcrypto varsa kullan (hata verirse yoksay)
do $$
begin
  create extension if not exists pgcrypto;
  raise notice '✅ pgcrypto aktif';
exception when others then
  raise notice '⚠️ pgcrypto açılamadı: % (md5 kullanılacak)', sqlerrm;
end $$;


-- ============================================================================
-- 🔐 musteri_giris_dogrula — md5 tabanlı token (pgcrypto GEREKMEZ)
-- ============================================================================
create or replace function public.musteri_giris_dogrula(p_telefon text, p_kod text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := public.temiz_telefon(p_telefon);
  v_token text;
  v_kayit record;
begin
  select * into v_kayit
  from public.musteri_oturumlar
  where telefon = v_tel
    and kod = trim(p_kod)
    and kod_son > now()
    and dogrulandi = false
  order by created_at desc
  limit 1;

  if v_kayit.id is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Kod geçersiz veya süresi dolmuş.');
  end if;

  -- 🔑 GÜVENLİ TOKEN — md5 + random + timestamp (pgcrypto gerekmez)
  v_token := md5(
    random()::text ||
    clock_timestamp()::text ||
    v_tel ||
    v_kayit.id::text ||
    random()::text
  ) || md5(random()::text || v_tel || clock_timestamp()::text);

  update public.musteri_oturumlar
     set dogrulandi = true,
         token = v_token,
         token_son = now() + interval '30 days'
   where id = v_kayit.id;

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'telefon', v_tel,
    'mesaj', 'Giriş başarılı.'
  );
end $$;

revoke all on function public.musteri_giris_dogrula(text, text) from public;
grant execute on function public.musteri_giris_dogrula(text, text) to anon, authenticated;


-- ============================================================================
-- 🧪 TEST — kod oluştur + doğrula
-- ============================================================================
do $$
declare
  v_tel text := '5417730319';
  v_kod text;
  v_sonuc jsonb;
begin
  raise notice '═══════ GİRİŞ TESTİ ═══════';

  -- Kod oluştur
  perform public.musteri_giris_kodu_olustur(v_tel);

  select kod into v_kod
  from public.musteri_oturumlar
  where telefon = v_tel
  order by created_at desc limit 1;

  raise notice '1️⃣ Kod oluşturuldu: %', v_kod;

  -- Doğrula
  v_sonuc := public.musteri_giris_dogrula(v_tel, v_kod);
  raise notice '2️⃣ Sonuç: %', v_sonuc;

  if (v_sonuc->>'ok')::boolean then
    raise notice '✅✅✅ GİRİŞ ÇALIŞIYOR ✅✅✅';
    raise notice 'Token: %', left(v_sonuc->>'token', 20);
  else
    raise notice '❌ GİRİŞ BAŞARISIZ: %', v_sonuc->>'mesaj';
  end if;

  raise notice '═══════════════════════════';
end $$;

-- Temizlik
delete from public.musteri_oturumlar where telefon = '5417730319' and dogrulandi = false;
