-- ============================================================================
--  💰 KADEMELİ ABONELİK FİYATLANDIRMA (Güncelleme #13)
-- ----------------------------------------------------------------------------
--  SENİN İSTEĞİN:
--    "Çok fazla asansörü olan firmalara indirim yapalım, çok pahalı oluyor.
--     Vinçli firmalara da aynısını yapalım.
--     Mesela 10 makinesi olan firmaya makine başı 4.500 + KDV."
--
--  MANTIK:
--    Makine sayısı arttıkça MAKİNE BAŞI fiyat düşer (filo indirimi).
--    Kademeler TABLODA tutulur → istediğin zaman fiyatları değiştirebilirsin.
--
--  ⚠️ Sadece yeni tablo + fonksiyon güncellemesi. Veri silmez.
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================


-- ============================================================================
-- 1) KADEME TABLOSU (fiyatları buradan yönetirsin)
-- ============================================================================
create table if not exists public.abonelik_kademeleri (
  id            uuid primary key default gen_random_uuid(),
  min_makine    integer not null,
  max_makine    integer,                    -- NULL = sınırsız
  makine_fiyat  numeric not null,           -- makine başı (KDV hariç)
  aciklama      text,
  created_at    timestamptz default now()
);

comment on table public.abonelik_kademeleri is
  'Abonelik filo indirimi kademeleri: makine sayısına göre makine başı fiyat';

create index if not exists idx_abonelik_kademe on public.abonelik_kademeleri (min_makine);

-- Varsayılan kademeler (senin verdiğin 10 makine = 4.500 ₺ merkezde)
insert into public.abonelik_kademeleri (min_makine, max_makine, makine_fiyat, aciklama)
select * from (values
  (1,  1,    8500::numeric, 'Tek makine'),
  (2,  3,    7500::numeric, '2-3 makine'),
  (4,  6,    6500::numeric, '4-6 makine'),
  (7,  9,    5500::numeric, '7-9 makine'),
  (10, 14,   4500::numeric, '10-14 makine'),
  (15, 24,   4000::numeric, '15-24 makine'),
  (25, null, 3500::numeric, '25+ makine (filo anlaşması)')
) v
where not exists (select 1 from public.abonelik_kademeleri);


-- ============================================================================
-- 2) MAKİNE SAYISINA GÖRE KADEME BUL
-- ============================================================================
create or replace function public.abonelik_kademesi(p_makine_sayisi integer)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'makine_sayisi',  p_makine_sayisi,
    'makine_fiyat',   k.makine_fiyat,
    'kademe',         k.aciklama,
    'liste_fiyat',    8500,
    'indirim_yuzde',  round((1 - (k.makine_fiyat / 8500.0)) * 100),
    'makine_basi_tasarruf', (8500 - k.makine_fiyat)
  )
  from public.abonelik_kademeleri k
  where p_makine_sayisi >= k.min_makine
    and (k.max_makine is null or p_makine_sayisi <= k.max_makine)
  order by k.min_makine desc
  limit 1;
$$;

revoke all on function public.abonelik_kademesi(integer) from public;
grant execute on function public.abonelik_kademesi(integer) to authenticated;


-- ============================================================================
-- 3) TEKLİF HESABI v2 — kademe fiyatı OTOMATİK uygulanır
-- ============================================================================
create or replace function public.abonelik_teklifi(
  p_makine_sayisi   integer,
  p_periyot_ay      integer default 6,
  p_iskonto_yuzde   numeric default 0,
  p_makine_fiyat    numeric default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_paket       record;
  v_kademe      jsonb;
  v_birim       numeric;
  v_liste       numeric := 8500;
  v_yillik_adet integer;
  v_brut_liste  numeric;
  v_brut        numeric;
  v_kademe_ind  numeric;
  v_iskonto     numeric;
  v_net         numeric;
  v_kdv         numeric;
  v_toplam      numeric;
begin
  if coalesce(p_makine_sayisi, 0) <= 0 then
    return jsonb_build_object('ok', false, 'mesaj', 'Makine sayısı 0 dan büyük olmalı.');
  end if;

  select * into v_paket from public.bakim_paketleri
   where periyot_ay = p_periyot_ay and aktif
   order by created_at limit 1;

  if v_paket is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Bu periyotta aktif paket yok.');
  end if;

  -- ⭐ KADEME FİYATI: makine sayısına göre otomatik indirim
  v_kademe := public.abonelik_kademesi(p_makine_sayisi);
  v_birim  := coalesce(p_makine_fiyat, (v_kademe ->> 'makine_fiyat')::numeric, v_paket.makine_fiyat);

  v_yillik_adet := greatest(round(12.0 / v_paket.periyot_ay), 1);

  v_brut_liste  := v_liste * p_makine_sayisi * v_yillik_adet;   -- indirimsiz
  v_brut        := v_birim * p_makine_sayisi * v_yillik_adet;   -- kademeli
  v_kademe_ind  := v_brut_liste - v_brut;                       -- kademeden gelen indirim

  v_iskonto     := round(v_brut * (coalesce(p_iskonto_yuzde, 0) / 100.0), 2);
  v_net         := v_brut - v_iskonto;
  v_kdv         := round(v_net * (v_paket.kdv_orani / 100.0), 2);
  v_toplam      := v_net + v_kdv;

  return jsonb_build_object(
    'ok',                  true,
    'paket',               v_paket.ad,
    'periyot_ay',          v_paket.periyot_ay,
    'makine_sayisi',       p_makine_sayisi,
    'makine_birim_fiyat',  v_birim,
    'liste_birim_fiyat',   v_liste,
    'kademe',              coalesce(v_kademe ->> 'kademe', '-'),
    'kademe_indirim_yuzde', coalesce((v_kademe ->> 'indirim_yuzde')::numeric, 0),
    'kademe_indirimi',     v_kademe_ind,
    'yillik_bakim_adedi',  v_yillik_adet,
    'yillik_bakim_toplam', (p_makine_sayisi * v_yillik_adet),
    'brut_liste_tutar',    v_brut_liste,
    'brut_tutar',          v_brut,
    'iskonto_yuzde',       coalesce(p_iskonto_yuzde, 0),
    'iskonto_tutar',       v_iskonto,
    'toplam_indirim',      v_kademe_ind + v_iskonto,
    'net_tutar',           v_net,
    'kdv_orani',           v_paket.kdv_orani,
    'kdv_tutar',           v_kdv,
    'genel_toplam',        v_toplam,
    'aylik_esdeger',       round(v_toplam / 12.0, 0),
    'makine_basi_yillik',  round(v_net / p_makine_sayisi, 0),
    'ozet', 'Yılda ' || v_yillik_adet || ' bakım × ' || p_makine_sayisi || ' makine · ' ||
            'makine başı ' || to_char(v_birim, 'FM999G999') || ' ₺ · ' ||
            'toplam ' || to_char(v_toplam, 'FM999G999G999') || ' ₺ (KDV dahil)'
  );
end;
$$;

revoke all on function public.abonelik_teklifi(integer, integer, numeric, numeric) from public;
grant execute on function public.abonelik_teklifi(integer, integer, numeric, numeric) to authenticated;


-- ============================================================================
-- 4) TEKLİF METNİ v2 — kademe indirimi açıkça yazılır
-- ============================================================================
create or replace function public.abonelik_teklif_metni(
  p_musteri        text,
  p_periyot_ay     integer default 6,
  p_makine_sayisi  integer default null,
  p_iskonto_yuzde  numeric default 0
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_m      jsonb;
  v_adet   integer;
  v_hesap  jsonb;
  v_metin  text;
  v_makine text;
  v_kademe numeric;
begin
  v_m := public.musteri_makine_sayisi(p_musteri);

  -- Makine sayısı: VİNÇ + ASANSÖR toplamı (senin isteğin: ikisi de dahil)
  v_adet := coalesce(
    p_makine_sayisi,
    greatest(
      coalesce((v_m ->> 'filo_asansor')::int, 0) + coalesce((v_m ->> 'filo_vinc')::int, 0),
      coalesce((v_m ->> 'servis_asansor')::int, 0),
      1
    )
  );

  v_hesap  := public.abonelik_teklifi(v_adet, p_periyot_ay, p_iskonto_yuzde);
  if not coalesce((v_hesap ->> 'ok')::boolean, false) then
    return 'Teklif hesaplanamadı: ' || coalesce(v_hesap ->> 'mesaj', 'bilinmeyen hata');
  end if;

  v_kademe := coalesce((v_hesap ->> 'kademe_indirimi')::numeric, 0);

  v_makine := case
    when coalesce((v_m ->> 'filo_asansor')::int, 0) > 0 and coalesce((v_m ->> 'filo_vinc')::int, 0) > 0
      then (v_m ->> 'filo_asansor') || ' asansör ve ' || (v_m ->> 'filo_vinc') || ' vinç'
    when coalesce((v_m ->> 'filo_asansor')::int, 0) > 0
      then (v_m ->> 'filo_asansor') || ' adet asansör'
    when coalesce((v_m ->> 'filo_vinc')::int, 0) > 0
      then (v_m ->> 'filo_vinc') || ' adet vinç'
    else v_adet || ' adet makine'
  end;

  v_metin := 'Sayın ' || p_musteri || ',' || E'\n\n' ||
    'Tesisinizde bulunan ' || v_makine || ' için YILLIK PERİYODİK BAKIM ANLAŞMASI teklifimiz:' || E'\n\n' ||
    '📋 ' || (v_hesap ->> 'paket') || E'\n' ||
    '• Yılda ' || (v_hesap ->> 'yillik_bakim_adedi') || ' periyodik bakım' || E'\n' ||
    '• Toplam bakım: ' || (v_hesap ->> 'yillik_bakim_toplam') || ' adet/yıl' || E'\n\n' ||
    '💰 FİYATLANDIRMA' || E'\n' ||
    '• Liste fiyatı: ' || to_char((v_hesap ->> 'liste_birim_fiyat')::numeric, 'FM999G999') || ' ₺/makine' || E'\n';

  -- Kademe indirimi varsa göster
  if v_kademe > 0 then
    v_metin := v_metin ||
      '• 🎁 FİLO İNDİRİMİ (' || (v_hesap ->> 'kademe') || '): ' ||
        to_char((v_hesap ->> 'makine_birim_fiyat')::numeric, 'FM999G999') || ' ₺/makine' ||
        ' (-%' || (v_hesap ->> 'kademe_indirim_yuzde') || ')' || E'\n' ||
      '• Kademe indirimi tutarı: −' ||
        to_char(v_kademe, 'FM999G999G999') || ' ₺' || E'\n';
  else
    v_metin := v_metin ||
      '• Makine başı: ' || to_char((v_hesap ->> 'makine_birim_fiyat')::numeric, 'FM999G999') || ' ₺' || E'\n';
  end if;

  if coalesce(p_iskonto_yuzde, 0) > 0 then
    v_metin := v_metin ||
      '• İlave iskonto (%' || p_iskonto_yuzde || '): −' ||
        to_char((v_hesap ->> 'iskonto_tutar')::numeric, 'FM999G999G999') || ' ₺' || E'\n';
  end if;

  v_metin := v_metin ||
    E'\n' ||
    '🧾 Net: ' || to_char((v_hesap ->> 'net_tutar')::numeric, 'FM999G999G999') || ' ₺ + KDV' || E'\n' ||
    '🧾 KDV dahil toplam: ' || to_char((v_hesap ->> 'genel_toplam')::numeric, 'FM999G999G999') || ' ₺' || E'\n' ||
    '📅 Aylık eşdeğer: ' || to_char((v_hesap ->> 'aylik_esdeger')::numeric, 'FM999G999G999') || ' ₺' || E'\n' ||
    '🔧 Makine başı yıllık: ' || to_char((v_hesap ->> 'makine_basi_yillik')::numeric, 'FM999G999') || ' ₺ + KDV' || E'\n\n' ||
    'ANLAŞMA KAPSAMI:' || E'\n' ||
    '✓ Periyodik bakımlar (planlanmış tarihlerde)' || E'\n' ||
    '✓ Acil servis önceliği' || E'\n' ||
    '✓ Her bakım sonrası rapor' || E'\n' ||
    '✓ Arıza öncesi tespit ve bilgilendirme' || E'\n\n' ||
    'Anlaşma sayesinde makineleriniz arıza yapmadan kontrol edilir;' || E'\n' ||
    'üretim duruşu riski azalır.' || E'\n\n' ||
    'Detaylı görüşme için bize ulaşabilirsiniz.' || E'\n\n' ||
    'BUVİSAN VİNÇ SERVİS';

  return v_metin;
end;
$$;

revoke all on function public.abonelik_teklif_metni(text, integer, integer, numeric) from public;
grant execute on function public.abonelik_teklif_metni(text, integer, integer, numeric) to authenticated;


-- ============================================================================
-- 5) GÜVENLİK (kademe tablosu sadece yönetici)
-- ============================================================================
alter table public.abonelik_kademeleri enable row level security;

drop policy if exists abonelik_kademe_yonetici on public.abonelik_kademeleri;
create policy abonelik_kademe_yonetici on public.abonelik_kademeleri
  for all to authenticated
  using (public.buvisan_admin_mi())
  with check (public.buvisan_admin_mi());

revoke all on public.abonelik_kademeleri from anon;


-- ============================================================================
-- 6) KONTROL: KADEMELER VE ÖRNEK HESAPLAR
-- ============================================================================
select min_makine, max_makine, makine_fiyat, aciklama,
       round((1 - makine_fiyat/8500.0) * 100) as indirim_yuzde
from public.abonelik_kademeleri
order by min_makine;

-- Örnek hesaplar (senin verdiğin örnek dahil)
select
  m as makine_sayisi,
  (public.abonelik_kademesi(m) ->> 'kademe')             as kademe,
  (public.abonelik_kademesi(m) ->> 'makine_fiyat')       as makine_basi,
  (public.abonelik_teklifi(m, 6, 0) ->> 'genel_toplam')  as yillik_6ay_kdvli,
  (public.abonelik_teklifi(m, 3, 0) ->> 'genel_toplam')  as yillik_3ay_kdvli
from unnest(array[1, 2, 5, 10, 22, 30]) as m;
