-- ============================================================================
--  🏷️ DEPO / MALZEME FİYATLARI ×2 — Güncelleme #210
-- ----------------------------------------------------------------------------
--  NE YAPAR: public.materials tablosundaki ALIŞ (buy_price) ve SATIŞ
--            (sale_price) fiyatlarını 2 ile çarpar. BAŞKA HİÇBİR TABLOYA
--            UPDATE ATMAZ → offers · completed_services · service_reports ·
--            cranes · satislar · satis_kalemleri · stok_hareketleri DOKUNULMAZ.
--
--  ⚠️ "/admin/depo" SAYFASI YOK. Bu projede "depo" = public.materials
--     tablosudur. (app/admin/ altında depo klasörü yok, menüde /admin/depo
--     bağlantısı yok — kodda arandı, bulunamadı.) Depoyu kullanan ekranlar:
--       • app/admin/malzemeler/page.tsx  → malzeme kartı CRUD + kâr analizi
--       • app/admin/stok/page.tsx        → stok adedi / kritik seviye
--       • app/admin/satis/page.tsx       → satışta birim fiyat
--
--  GERÇEK TABLO + KOLON (koddan doğrulandı — uydurma yok):
--    tablo : public.materials
--    alış  : buy_price    numeric default 0  → sql/77-tam-sema-duzeltmesi.sql:68
--    satış : sale_price   numeric default 0  → sql/77-tam-sema-duzeltmesi.sql:69
--    • app/admin/stok/page.tsx:57-59
--        from('materials').select('id, name, unit, buy_price, sale_price, ...')
--    • app/admin/malzemeler/page.tsx:84   from('materials').select('*')
--    • app/admin/malzemeler/page.tsx:297  insert/update paket → buy_price, sale_price
--    • app/admin/satis/page.tsx:73        from('materials') · :27-37 fiyat adayları (sale_price)
--    • app/personel/page.tsx:226-227      select('id, name, sale_price, buy_price, unit')
--    ⇒ "malzemeler.alis_fiyati / satis_fiyati" gibi bir tablo/kolon YOK.
--    ⇒ materials'ta kategori/tür/tip KOLONU YOK; yalnız "name" var
--      (sql/14-stok-takibi-altyapi.sql:29-32 · sql/77:66-70).
--      Yine de ileride eklenirse diye filtre to_jsonb(m)->>'kategori' /
--      'category' / 'tur' / 'tip' / 'type' alanlarını da tarar (kolon yoksa NULL).
--
--  GEÇMİŞ KAYITLAR NEDEN DEĞİŞMEZ — fiyat, KULLANIM ANINDA kopyalanır:
--    • offers.items (jsonb) .......... teklife birim_fiyat kopyalanır
--        app/admin/teklifler/page.tsx:210 (kalem üretimi)
--        app/admin/teklifler/page.tsx:239 (items: kalemler ← kopya yazılıyor)
--        app/admin/teklifler/page.tsx:876 (PDF kopyadan okur)
--    • completed_services.materials .. iş kaydına birim_fiyat/toplam_fiyat kopyalanır
--        app/admin/analiz/page.tsx:288 · :361 (materials: malzemeListesi) · :1032
--    • service_reports.degisen_parcalar → birim_maliyet = O GÜNÜN alış fiyatı
--        app/personel/page.tsx:245-246 · yorum :237-238
--        ("ileride fiyat değişse bile geçmiş ayın kârı değişmez")
--    • satis_kalemleri.birim_fiyat ... satış anında yazılır (sql/174-satis-sistemi.sql:163-175)
--    ⇒ Bu dosya o tablolara UPDATE atmadığı için KAYITLI TUTARLAR aynen kalır.
--
--  ⚠️ TEK İSTİSNA (bilgi amaçlı — veri değil, HESAP):
--     Bazı ekranlar malzeme maliyetini kayıtlı değerden değil, GÜNCEL alış
--     fiyatından yeniden hesaplar:
--        app/admin/malzemeler/page.tsx:120-128 (geçmiş servis kârı, :125 buy_price)
--     → Fiyat ×2 olunca o ekranda GEÇMİŞ ayın maliyeti artar / kârı düşer.
--       Veritabanındaki kayıtlı tutarlar (price, items, materials, birim_maliyet)
--       DEĞİŞMEZ; değişen sadece sonradan yapılan hesaptır.
--
--  KURALLAR:
--    • alış  = round(buy_price  * 2, 2) · satış = round(sale_price * 2, 2)
--    • adı (ve varsa kategori/tür alanı) İŞÇİLİK · HİZMET · SERVİS · LABOR
--      geçen satırlar HARİÇ — Türkçe harf normalizasyonu ile
--      ("İŞÇİLİK" ≡ "işçilik" ≡ "iscilik" ≡ "Isçilik Bedeli")
--    • NULL fiyat NULL kalır (DOKUNULMAZ) · 0 → 0 (değişmez)
--    • İKİ KEZ çalıştırılırsa 4 katına ÇIKMAZ → bölüm 2 (tek seferlik koruma:
--      schema_migrations kaydı + fiyat×2 kanıtı + materials tablo açıklaması)
--    • Geri alma → bölüm 7 (public.depo_fiyat_yedek_210'dan restore)
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
--            (sql/209'dan SONRA · sql/205-migration-kaydi.sql çalışmış olmalı)
--            ⚠️ Bu dosya kod tarafından otomatik çalışmaz — ELLE çalıştırılır.
-- ============================================================================

-- Tek transaction: hata olursa ne yedek yarım kalır ne fiyat yarım çarpılır.
begin;


-- ============================================================================
-- 0) ÖN KONTROL — tablo/kolon gerçekten var mı?
--    Yoksa hiçbir satıra dokunmadan anlaşılır hatayla durur.
-- ============================================================================
do $$
begin
  if to_regclass('public.materials') is null then
    raise exception 'public.materials tablosu bulunamadı — 210 çalıştırılamaz.';
  end if;

  if (select count(*)
        from information_schema.columns
       where table_schema = 'public'
         and table_name   = 'materials'
         and column_name in ('buy_price', 'sale_price')) <> 2 then
    raise exception 'public.materials.buy_price / sale_price kolonu eksik — önce sql/77-tam-sema-duzeltmesi.sql çalıştırılmalı.';
  end if;

  raise notice '✅ ön kontrol: public.materials + buy_price + sale_price hazır';
end $$;


-- ============================================================================
-- 1) YEDEK TABLO (geri dönüş için) — ÇARPMADAN ÖNCEKİ değerler
--    `if not exists` sayesinde 2. çalıştırmada yedeğin üzerine YAZILMAZ;
--    böylece "×2 değerleri yedek sanma" hatası oluşmaz.
--    ⚠️ Yedeği ELLE silersen geri dönüş imkânı da gider (bkz. bölüm 7).
-- ============================================================================
do $$
begin
  perform set_config('buvisan.depo210_yedek_vardi',
    (to_regclass('public.depo_fiyat_yedek_210') is not null)::text, false);
end $$;

create table if not exists public.depo_fiyat_yedek_210 as
select
  id,
  buy_price,
  sale_price,
  now() as yedek_at
from public.materials;

do $$
begin
  execute 'comment on table public.depo_fiyat_yedek_210 is '
       || quote_literal('210 geri dönüş yedeği: materials alış (buy_price) / satış (sale_price) fiyatlarının ×2 ÖNCESİ hâli');
exception when others then
  raise notice 'ℹ️ yedek tablo açıklaması yazılamadı (önemsiz): %', sqlerrm;
end $$;


-- ============================================================================
-- 2) TEK SEFERLİK KORUMA — daha önce uygulandıysa notice basıp ÇIK
--    Üç sinyal (biri yeter):
--      a) public.schema_migrations içinde bu dosya adı VAR MI?  (asıl kayıt)
--      b) Yedek tablo var VE fiyatlar gerçekten 2 katına çıkmış mı?
--         (205 çalıştırılmamış olsa bile korur; yarıda kalmış çalıştırmayı
--          "uygulanmış" saymaz — çünkü o durumda değerler henüz ×2 değildir.)
--      c) public.materials tablosunun açıklamasında "210: fiyatlar" işareti
--         var mı?  → yedek tablo ELLE silinse ve 205 hiç çalıştırılmamış olsa
--         bile "uygulandı" bilgisi kaybolmaz (kalıcı, tablo açıklaması).
--    NOT: plpgsql'de RETURN yalnız bu DO bloğundan çıkar; sonraki top-level
--         ifadeler çalışmaya devam eder. Bu yüzden bölüm 5 aynı kapıyı KENDİ
--         içinde tekrar kurar — asıl güvence orasıdır.
-- ============================================================================
do $$
declare
  v_dosya     text    := '210-depo-malzeme-fiyat-x2.sql';
  v_migration boolean := false;
  v_yedek_var boolean := to_regclass('public.depo_fiyat_yedek_210') is not null;
  v_kanit     boolean := false;
  v_isaret    boolean := false;
begin
  if to_regclass('public.schema_migrations') is not null then
    execute 'select exists(select 1 from public.schema_migrations where dosya = $1)'
      into v_migration using v_dosya;
  end if;

  if not v_migration and v_yedek_var then
    execute $q$
      select exists (
        select 1
          from public.depo_fiyat_yedek_210 y
          join public.materials m on m.id = y.id
         where m.buy_price  is not distinct from round(y.buy_price::numeric  * 2, 2)
           and m.sale_price is not distinct from round(y.sale_price::numeric * 2, 2)
           and (m.buy_price  is distinct from y.buy_price
             or m.sale_price is distinct from y.sale_price)
      )
    $q$ into v_kanit;
  end if;

  v_isaret := position('210: fiyatlar' in
    coalesce(obj_description(to_regclass('public.materials'), 'pg_class'), '')) > 0;

  if v_migration or v_kanit or v_isaret then
    perform set_config('buvisan.depo210_durum', 'zaten', false);
    raise notice '⏭️ zaten uygulandi, atlandi (%): migration kaydı=%, fiyat×2 kanıtı=%, kalıcı işaret=% → bu çalıştırmada UPDATE YOK',
      v_dosya, v_migration, v_kanit, v_isaret;
    return;
  end if;

  perform set_config('buvisan.depo210_durum', 'devam', false);
  raise notice '▶️ ilk uygulama — bölüm 5''te alış ve satış fiyatları ×2 yapılacak';
end $$;

-- Zaten uygulanmışsa ve yedek bu çalıştırmada sıfırdan oluştuysa: içi ×2
-- değerlerle dolar, yani "geri dönüş yedeği" gibi görünen yanıltıcı bir tablo
-- kalır. Böyle bir tabloyu BOŞ bırakıp yüksek sesle uyarıyoruz.
do $$
begin
  if coalesce(current_setting('buvisan.depo210_durum', true), 'devam') = 'zaten'
     and coalesce(current_setting('buvisan.depo210_yedek_vardi', true), 'true') = 'false' then
    execute 'truncate table public.depo_fiyat_yedek_210';
    raise notice '🧹 yedek BOŞ bırakıldı: fiyatlar zaten ×2 idi, ×2 değerleri "yedek" diye saklanmadı';
  end if;
end $$;

do $$
declare
  v_satir bigint := 0;
begin
  if to_regclass('public.depo_fiyat_yedek_210') is not null then
    execute 'select count(*) from public.depo_fiyat_yedek_210' into v_satir;
    if v_satir = 0 then
      raise notice '🗄️ yedek: public.depo_fiyat_yedek_210 → BOŞ (geri alma verisi yok)';
    else
      raise notice '🗄️ yedek: public.depo_fiyat_yedek_210 → % satır (×2 öncesi değerler)', v_satir;
    end if;
  end if;
end $$;


-- ============================================================================
-- 3) ÖNİZLEME (veri DEĞİŞTİRMEZ)
--    • toplam malzeme / güncellenecek / hariç tutulan satır sayısı
--    • hariç tutulanlardan örnek adlar (göz kontrolü)
--    • çarpmadan ÖNCEKİ min–max–toplam (KDV hariç)
-- ============================================================================
do $$
declare
  v_durum   text    := coalesce(current_setting('buvisan.depo210_durum', true), 'devam');
  v_desen   text    := '(iscilik|hizmet|servis|labor)';
  v_alan    text;
  v_filtre  text    := 'true';
  v_dokun   text;
  v_toplam  bigint  := 0;
  v_etki    bigint  := 0;
  v_haric   bigint  := 0;
  v_bos     bigint  := 0;
  v_ornek   text;
  v_alis_min numeric; v_alis_max numeric; v_alis_top numeric;
  v_sat_min  numeric; v_sat_max  numeric; v_sat_top  numeric;
begin
  -- Filtre: ad + (varsa) kategori/tür/tip alanları normalize edilip taranır.
  --   normalize = Türkçe harf sadeleştir + küçült + [a-z0-9] dışını at
  --   to_jsonb(m)->>'kategori' : kolon YOKSA NULL döner → filtreyi bozmaz.
  foreach v_alan in array array[
      'm.name',
      $q$to_jsonb(m)->>'kategori'$q$,
      $q$to_jsonb(m)->>'category'$q$,
      $q$to_jsonb(m)->>'tur'$q$,
      $q$to_jsonb(m)->>'tip'$q$,
      $q$to_jsonb(m)->>'type'$q$
  ] loop
    v_filtre := v_filtre || format(
      $q$ and regexp_replace(lower(translate(coalesce(%s, ''), 'ÇĞİÖŞÜçğıöşü', 'CGIOSUCGIOSU')), '[^a-z0-9]', '', 'g') !~ %L$q$,
      v_alan, v_desen);
  end loop;

  -- NULL fiyatlı satırlar UPDATE'in WHERE'ine de girmez → sayılar birebir tutar.
  v_dokun := v_filtre || ' and (m.buy_price is not null or m.sale_price is not null)';

  select count(*) into v_toplam from public.materials m;
  execute format('select count(*) from public.materials m where %s', v_dokun)  into v_etki;
  execute format('select count(*) from public.materials m where not (%s)', v_filtre) into v_haric;
  execute format('select count(*) from public.materials m where (%s) and m.buy_price is null and m.sale_price is null', v_filtre) into v_bos;

  execute format($q$
    select string_agg(t.x, ', ') from (
      select m.name::text as x
        from public.materials m
       where not (%s)
       order by m.name
       limit 8
    ) t
  $q$, v_filtre) into v_ornek;

  execute format($q$
    select min(m.buy_price::numeric), max(m.buy_price::numeric), sum(m.buy_price::numeric),
           min(m.sale_price::numeric), max(m.sale_price::numeric), sum(m.sale_price::numeric)
      from public.materials m
     where %s
  $q$, v_dokun)
    into v_alis_min, v_alis_max, v_alis_top, v_sat_min, v_sat_max, v_sat_top;

  raise notice '📊 ÖNİZLEME — materials toplam: % satır · GÜNCELLENECEK: % · HARİÇ (işçilik/hizmet/servis/labor): % · NULL fiyatlı (atlanır): %',
    v_toplam, v_etki, v_haric, v_bos;

  raise notice '💰 ÖNCE (güncellenecek satırlarda, KDV hariç) — alış: min=% max=% toplam=% · satış: min=% max=% toplam=%',
    round(v_alis_min, 2), round(v_alis_max, 2), round(v_alis_top, 2),
    round(v_sat_min, 2),  round(v_sat_max, 2),  round(v_sat_top, 2);

  raise notice '🚫 Hariç tutulan örnekler (en fazla 8): %', coalesce(v_ornek, '(yok)');

  if v_durum = 'zaten' then
    raise notice 'ℹ️ zaten uygulanmış → bu çalıştırmada UPDATE YAPILMAYACAK (yukarıdaki sayılar bilgi amaçlı)';
  end if;
end $$;


-- ============================================================================
-- 4) (bilgi) BU DOSYANIN DOKUNMADIĞI TABLOLAR
--    Aşağıdakilere bu script'te TEK BİR UPDATE/INSERT/DELETE yoktur:
--      offers · completed_services · service_reports · cranes ·
--      satislar · satis_kalemleri · stok_hareketleri · teklifler
--    Yalnız: public.materials (UPDATE) + public.depo_fiyat_yedek_210 (yeni tablo)
--            + public.schema_migrations (tek satır kayıt, bölüm 8).
-- ============================================================================


-- ============================================================================
-- 5) GÜNCELLEME — tek DO bloğu = tek transaction (hata olursa hiçbir satır değişmez)
--    • SADECE public.materials
--    • alış  = round(buy_price  * 2, 2)
--    • satış = round(sale_price * 2, 2)
--    • NULL → NULL kalır (NULL*2 = NULL, ayrıca WHERE'te elenir) · 0 → 0
--    • işçilik / hizmet / servis / labor geçen satırlar HARİÇ
-- ============================================================================
do $$
declare
  v_dosya       text    := '210-depo-malzeme-fiyat-x2.sql';
  v_durum       text    := coalesce(current_setting('buvisan.depo210_durum', true), 'devam');
  v_desen       text    := '(iscilik|hizmet|servis|labor)';
  v_alan        text;
  v_filtre      text    := 'true';
  v_dokun       text;
  v_migration   boolean := false;
  v_yedek_var   boolean := to_regclass('public.depo_fiyat_yedek_210') is not null;
  v_kanit       boolean := false;
  v_isaret      boolean := false;
  v_yorum       text;
  v_guncellenen bigint  := 0;
  v_toplam      bigint  := 0;
begin
  -- ── kapı 1: bölüm 2 "zaten" dediyse ──
  if v_durum = 'zaten' then
    raise notice '⏭️ zaten uygulandi, atlandi — fiyatlar TEKRAR çarpılmadı';
    return;
  end if;

  -- ── kapı 2: DB'deki kesin kayıt (oturum değişkeni kaybolsa bile korur) ──
  if to_regclass('public.schema_migrations') is not null then
    execute 'select exists(select 1 from public.schema_migrations where dosya = $1)'
      into v_migration using v_dosya;
  end if;

  if not v_migration and v_yedek_var then
    execute $q$
      select exists (
        select 1
          from public.depo_fiyat_yedek_210 y
          join public.materials m on m.id = y.id
         where m.buy_price  is not distinct from round(y.buy_price::numeric  * 2, 2)
           and m.sale_price is not distinct from round(y.sale_price::numeric * 2, 2)
           and (m.buy_price  is distinct from y.buy_price
             or m.sale_price is distinct from y.sale_price)
      )
    $q$ into v_kanit;
  end if;

  v_isaret := position('210: fiyatlar' in
    coalesce(obj_description(to_regclass('public.materials'), 'pg_class'), '')) > 0;

  if v_migration or v_kanit or v_isaret then
    raise notice '⏭️ zaten uygulandi, atlandi (migration=%, kanıt=%, işaret=%) — fiyatlar TEKRAR çarpılmadı',
      v_migration, v_kanit, v_isaret;
    return;
  end if;

  -- ── filtre: işçilik/hizmet/servis/labor geçenler HARİÇ + NULL fiyatlılar hariç ──
  foreach v_alan in array array[
      'm.name',
      $q$to_jsonb(m)->>'kategori'$q$,
      $q$to_jsonb(m)->>'category'$q$,
      $q$to_jsonb(m)->>'tur'$q$,
      $q$to_jsonb(m)->>'tip'$q$,
      $q$to_jsonb(m)->>'type'$q$
  ] loop
    v_filtre := v_filtre || format(
      $q$ and regexp_replace(lower(translate(coalesce(%s, ''), 'ÇĞİÖŞÜçğıöşü', 'CGIOSUCGIOSU')), '[^a-z0-9]', '', 'g') !~ %L$q$,
      v_alan, v_desen);
  end loop;

  v_dokun := v_filtre || ' and (m.buy_price is not null or m.sale_price is not null)';

  select count(*) into v_toplam from public.materials;

  -- ── UPDATE + GET DIAGNOSTICS: gerçekten etkilenen satır sayısı ──
  execute format($q$
    update public.materials m
       set buy_price  = round(m.buy_price::numeric  * 2, 2),
           sale_price = round(m.sale_price::numeric * 2, 2)
     where %s
  $q$, v_dokun);

  get diagnostics v_guncellenen = row_count;

  -- ── kalıcı işaret: yedek tablo ELLE silinse ve 205 hiç çalıştırılmamış olsa
  --    bile "210 uygulandı" bilgisi kalsın diye tablo açıklamasına not düşülür.
  --    Mevcut açıklama varsa korunur; veriye/kolona DOKUNMAZ.
  v_yorum := coalesce(obj_description(to_regclass('public.materials'), 'pg_class'), '');
  if position('210: fiyatlar' in v_yorum) = 0 then
    execute format('comment on table public.materials is %L',
      nullif(trim(both ' ·' from v_yorum || ' · 210: fiyatlar ×2 uygulandı'), ''));
  end if;

  raise notice '✅ GÜNCELLENDİ: % / % satır — alış ×2, satış ×2 (kuruş: round(...,2), KDV hariç)',
    v_guncellenen, v_toplam;
  raise notice '🛡️ dokunulmayan: % satır (işçilik/hizmet/servis/labor · NULL fiyatlı · 0) · 0 → 0',
    v_toplam - v_guncellenen;
end $$;

commit;


-- ============================================================================
-- 6) DOĞRULAMA — sonrası min–max–toplam · yedek · kaç satır tam 2 katında
-- ============================================================================
do $$
declare
  v_durum    text    := coalesce(current_setting('buvisan.depo210_durum', true), '?');
  v_migration boolean := false;
  v_toplam   bigint  := 0;
  v_yedek    bigint  := 0;
  v_iki_kat  bigint  := 0;
  v_alis_min numeric; v_alis_max numeric; v_alis_top numeric;
  v_sat_min  numeric; v_sat_max  numeric; v_sat_top  numeric;
begin
  select count(*) into v_toplam from public.materials;

  if to_regclass('public.schema_migrations') is not null then
    execute 'select exists(select 1 from public.schema_migrations where dosya = $1)'
      into v_migration using '210-depo-malzeme-fiyat-x2.sql';
  end if;

  if to_regclass('public.depo_fiyat_yedek_210') is not null then
    execute $q$
      select count(*),
             count(*) filter (
               where (m.buy_price  is not distinct from round(y.buy_price::numeric  * 2, 2))
                 and (m.sale_price is not distinct from round(y.sale_price::numeric * 2, 2))
                 and not ( (m.buy_price  is not distinct from y.buy_price)
                       and (m.sale_price is not distinct from y.sale_price) )
             )
        from public.depo_fiyat_yedek_210 y
        join public.materials m on m.id = y.id
    $q$ into v_yedek, v_iki_kat;
  end if;

  select min(buy_price::numeric), max(buy_price::numeric), sum(buy_price::numeric),
         min(sale_price::numeric), max(sale_price::numeric), sum(sale_price::numeric)
    into v_alis_min, v_alis_max, v_alis_top, v_sat_min, v_sat_max, v_sat_top
  from public.materials;

  raise notice '🔎 DOĞRULAMA (bu çalıştırma: % · migration kaydı: %)', v_durum, v_migration;
  raise notice '💵 SONRA (tüm malzemeler, KDV hariç) — alış: min=% max=% toplam=% · satış: min=% max=% toplam=%',
    round(v_alis_min, 2), round(v_alis_max, 2), round(v_alis_top, 2),
    round(v_sat_min, 2),  round(v_sat_max, 2),  round(v_sat_top, 2);
  raise notice '🧾 yedek: public.depo_fiyat_yedek_210 → % satır · materials → % satır', v_yedek, v_toplam;
  raise notice '✖️2 KANITI: % / % satır tam 2 katında (kalanlar: işçilik/hizmet hariç veya 0/NULL fiyat)',
    v_iki_kat, v_yedek;

  if v_durum = 'zaten' or v_migration then
    raise notice 'ℹ️ bu çalıştırmada güncelleme YAPILMADI (210 zaten uygulanmış) — sayılar bilgi amaçlıdır';
  end if;
end $$;


-- ============================================================================
-- 7) GERİ ALMA (ihtiyaç anında yorumdan çıkarıp çalıştır)
-- ----------------------------------------------------------------------------
--  A) Fiyatları yedekten AYNEN geri yükle:
--
--     begin;
--       update public.materials m
--          set buy_price  = y.buy_price,
--              sale_price = y.sale_price
--         from public.depo_fiyat_yedek_210 y
--        where y.id = m.id;
--
--       -- tekrar uygulanabilsin diye kaydı ve kalıcı işareti de sil:
--       delete from public.schema_migrations
--        where dosya = '210-depo-malzeme-fiyat-x2.sql';
--       comment on table public.materials is null;
--     commit;
--
--  B) 210'u YENİDEN uygulamak istersen yedeği de düşür
--     (yoksa "zaten uygulandi" deyip atlar):
--
--     drop table if exists public.depo_fiyat_yedek_210;
--
--  C) Geri alma başarılı olduktan sonra yedeği silmek istersen:
--
--     -- drop table if exists public.depo_fiyat_yedek_210;
-- ============================================================================


-- ─── 8) MIGRATION KAYDI (sql/205 · sql/209 deseni) ───
do $$
begin
  perform public.migration_isaretle('210-depo-malzeme-fiyat-x2.sql', 'depo malzeme fiyatlari 2x');
exception when others then null;   -- 205 çalıştırılmamışsa sessiz geç
end $$;


-- ─── 9) KONTROL (tek satır özet) ───
--  NOT: schema_migrations'a STATİK sorgu atılmaz — 205 çalıştırılmamışsa
--  "relation does not exist" hatası tüm betiği düşürürdü. Bu yüzden dinamik.
do $$
declare
  v_n int := -1;
begin
  if to_regclass('public.schema_migrations') is not null then
    execute 'select count(*) from public.schema_migrations where dosya = $1'
      into v_n using '210-depo-malzeme-fiyat-x2.sql';
  end if;

  if v_n < 0 then
    raise notice '🧾 migration kaydı: schema_migrations YOK (sql/205 çalıştırılmamış) — 210 elle takip edilmeli';
  else
    raise notice '🧾 migration kaydı: % satır', v_n;
  end if;
end $$;

select
  (select count(*) from public.materials)                            as malzeme_satiri,
  (select count(*) from public.depo_fiyat_yedek_210)                 as yedek_satir,
  (select round(min(buy_price::numeric), 2)  from public.materials)  as alis_min,
  (select round(max(buy_price::numeric), 2)  from public.materials)  as alis_max,
  (select round(min(sale_price::numeric), 2) from public.materials)  as satis_min,
  (select round(max(sale_price::numeric), 2) from public.materials)  as satis_max,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'materials'
      and column_name in ('buy_price', 'sale_price'))                as fiyat_kolon_ok;
