-- ============================================================================
--  🎯 EVRENSEL FİRMA EŞLEŞTİRME (Güncelleme #152)
-- ----------------------------------------------------------------------------
--  AMAÇ: Hangi isimle kayıt olursa olsun (A, A İNŞAAT, A İnş. Mak. San.)
--        sistem AYNI firmayı tanısın ve TÜM geçmişini göstersin.
--
--  YÖNTEM:
--    1) firma_alias tablosu (takma adlar — otomatik + elle)
--    2) firma_eslestir() artık alias'a bakar
--    3) Otomatik alias öğrenme (kayıt sırasında)
--    4) TÜM kaynaklardan veri: offers, satislar, completed_services,
--       service_reports, bakim_formlari, cranes, service_tickets,
--       financial_records, teklif_bekleyenler
--
--  KULLANIM: 179'dan SONRA çalıştır.
-- ============================================================================


-- ============================================================================
-- 1) 🔗 firma_alias — takma ad tablosu
-- ============================================================================
create table if not exists public.firma_alias (
  id            uuid primary key default gen_random_uuid(),
  alias         text not null,              -- "A İNŞAAT", "A İnş. Mak. San."
  kanonik       text not null,              -- "A" (ana isim)
  kaynak        text default 'elle',        -- elle | otomatik
  guven         integer default 100,
  created_at    timestamptz default now(),
  unique(alias, kanonik)
);

alter table public.firma_alias enable row level security;
drop policy if exists "firma_alias_all" on public.firma_alias;
create policy "firma_alias_all" on public.firma_alias for all to authenticated using (true) with check (true);

create index if not exists idx_alias_norm
  on public.firma_alias(public.firma_normal(alias));


-- ============================================================================
-- 2) 🎯 firma_eslestir — ALIAS DESTEKLİ
-- ============================================================================
create or replace function public.firma_eslestir(p_a text, p_b text)
returns integer
language plpgsql
stable
as $$
declare
  v_a text := public.firma_normal(coalesce(p_a,''));
  v_b text := public.firma_normal(coalesce(p_b,''));
  v_ilk_a text;
  v_ilk_b text;
  v_ortak integer := 0;
  v_toplam integer := 0;
  v_kelime text;
  v_alias_hit boolean := false;
begin
  if v_a = '' or v_b = '' then return 0; end if;
  if v_a = v_b then return 100; end if;

  -- ⭐ 1) ALIAS KONTROLÜ (en güvenilir)
  begin
    select exists(
      select 1 from public.firma_alias fa
      where public.firma_normal(fa.alias) in (v_a, v_b)
        and public.firma_normal(fa.kanonik) in (v_a, v_b)
    ) into v_alias_hit;
  exception when others then v_alias_hit := false; end;

  if v_alias_hit then return 100; end if;

  -- Aynı kanonik isme bağlı mı?
  begin
    select exists(
      select 1 from public.firma_alias f1
      join public.firma_alias f2
        on public.firma_normal(f1.kanonik) = public.firma_normal(f2.kanonik)
      where public.firma_normal(f1.alias) = v_a
        and public.firma_normal(f2.alias) = v_b
    ) into v_alias_hit;
  exception when others then v_alias_hit := false; end;

  if v_alias_hit then return 98; end if;

  -- ⭐ 2) KAPSAMA
  if v_a like '%' || v_b || '%' or v_b like '%' || v_a || '%' then return 96; end if;

  v_ilk_a := split_part(v_a, ' ', 1);
  v_ilk_b := split_part(v_b, ' ', 1);

  -- ⭐ 3) İLK KELİME
  if length(v_ilk_a) >= 2 and v_ilk_a = v_ilk_b then return 92; end if;

  -- ⭐ 4) İLK 3 HARF
  if length(v_ilk_a) >= 3 and length(v_ilk_b) >= 3
     and left(v_ilk_a, 3) = left(v_ilk_b, 3) then return 88; end if;

  -- ⭐ 5) KISA İSİM PREFIX
  if length(v_a) between 2 and 6 and left(v_b, length(v_a)) = v_a then return 90; end if;
  if length(v_b) between 2 and 6 and left(v_a, length(v_b)) = v_b then return 90; end if;

  -- ⭐ 6) KELİME KAPSAMA
  for v_kelime in select unnest(string_to_array(v_a, ' ')) loop
    if length(v_kelime) >= 3 then
      v_toplam := v_toplam + 1;
      if v_b like '%' || v_kelime || '%' then v_ortak := v_ortak + 1; end if;
    end if;
  end loop;

  if v_toplam > 0 and v_ortak > 0 then
    return greatest(55, (v_ortak * 100 / v_toplam));
  end if;

  v_ortak := 0; v_toplam := 0;
  for v_kelime in select unnest(string_to_array(v_b, ' ')) loop
    if length(v_kelime) >= 3 then
      v_toplam := v_toplam + 1;
      if v_a like '%' || v_kelime || '%' then v_ortak := v_ortak + 1; end if;
    end if;
  end loop;

  if v_toplam > 0 and v_ortak > 0 then
    return greatest(55, (v_ortak * 100 / v_toplam));
  end if;

  return 0;
end $$;

revoke all on function public.firma_eslestir(text, text) from public;
grant execute on function public.firma_eslestir(text, text) to anon, authenticated;


-- ============================================================================
-- 3) 🧠 otomatik_alias_ogren(firma) — sistemdeki benzer isimleri bağla
-- ============================================================================
create or replace function public.otomatik_alias_ogren(p_firma text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_firma text := trim(coalesce(p_firma,''));
  v_sayi integer := 0;
  v_aday text;
begin
  if length(v_firma) < 2 then return 0; end if;

  -- TÜM kaynaklardan firma adlarını topla, benzer olanları alias yap
  for v_aday in
    select distinct ad from (
      select coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),'') as ad
      from public.cranes c
      union all select coalesce(cs.customer_text,'') from public.completed_services cs
      union all select coalesce(public.jalan(to_jsonb(o),'customer_name','musteri','firma_adi'),'') from public.offers o
      union all select coalesce(s.musteri,'') from public.satislar s
      union all select coalesce(tb.musteri,'') from public.teklif_bekleyenler tb
      union all select coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),'') from public.service_tickets st
    ) t
    where trim(coalesce(ad,'')) <> ''
  loop
    -- Benzerlik 88+ ise alias olarak bağla
    if public.firma_eslestir(v_aday, v_firma) >= 88
       and public.firma_normal(v_aday) <> public.firma_normal(v_firma) then
      begin
        insert into public.firma_alias (alias, kanonik, kaynak, guven)
        values (v_aday, v_firma, 'otomatik', public.firma_eslestir(v_aday, v_firma))
        on conflict (alias, kanonik) do nothing;
        v_sayi := v_sayi + 1;
      exception when others then null; end;
    end if;
  end loop;

  return v_sayi;
end $$;

revoke all on function public.otomatik_alias_ogren(text) from public;
grant execute on function public.otomatik_alias_ogren(text) to authenticated;


-- ============================================================================
-- 4) 📋 firma_benzerleri(firma) — admin için aday listesi
-- ============================================================================
create or replace function public.firma_benzerleri(p_firma text)
returns table (ad text, kaynak text, benzerlik integer, alias_var boolean)
language sql
stable
security definer
set search_path = public
as $$
  with adlar as (
    select 'vinç'::text as kaynak, coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),'') as ad from public.cranes c
    union all select 'finans', coalesce(cs.customer_text,'') from public.completed_services cs
    union all select 'teklif', coalesce(public.jalan(to_jsonb(o),'customer_name','musteri','firma_adi'),'') from public.offers o
    union all select 'satış', coalesce(s.musteri,'') from public.satislar s
    union all select 'teklif-bekleyen', coalesce(tb.musteri,'') from public.teklif_bekleyenler tb
    union all select 'talep', coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),'') from public.service_tickets st
    union all select 'form', coalesce(sr.firma_adi,'') from public.service_reports sr
  )
  select distinct on (ad)
    ad, kaynak,
    public.firma_eslestir(ad, p_firma) as benzerlik,
    exists(select 1 from public.firma_alias fa
           where public.firma_normal(fa.alias)=public.firma_normal(ad)
             and public.firma_normal(fa.kanonik)=public.firma_normal(p_firma)) as alias_var
  from adlar
  where trim(coalesce(ad,'')) <> ''
    and public.firma_eslestir(ad, p_firma) >= 60
  order by ad, public.firma_eslestir(ad, p_firma) desc;
$$;

revoke all on function public.firma_benzerleri(text) from public;
grant execute on function public.firma_benzerleri(text) to authenticated;


-- ============================================================================
-- 5) 📊 musteri_portal_v6 — TÜM KAYNAKLAR
-- ============================================================================
create or replace function public.musteri_portal_v6(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_h record;
  v_vincler jsonb := '[]'::jsonb;
  v_kendi jsonb := '[]'::jsonb;
  v_servisler jsonb := '[]'::jsonb;
  v_aktif jsonb := '[]'::jsonb;
  v_bakim jsonb := '[]'::jsonb;
  v_okunmamis integer := 0;
  v_makine_sayisi integer := 0;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz. Tekrar giriş yapın.');
  end if;

  -- SİSTEM VİNÇLERİ
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'model', coalesce(public.jalan(to_jsonb(c),'model','makine_modeli'),'—'),
      'seri_no', coalesce(public.jalan(to_jsonb(c),'serial_number','seri_no'),'—'),
      'kapasite', coalesce(public.jalan(to_jsonb(c),'crane_capacity','kapasite'),'—'),
      'makine_tipi', coalesce(public.jalan(to_jsonb(c),'makine_tipi','type'),'—'),
      'adres', coalesce(public.jalan(to_jsonb(c),'address','adres'),'—'),
      'sonraki_bakim', public.jalan(to_jsonb(c),'next_maintenance_date')
    )), '[]'::jsonb)
    into v_vincler
    from public.cranes c
    where public.firma_eslestir(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),''), v_h.firma_adi) >= 75
       or public.temiz_telefon(coalesce(public.jalan(to_jsonb(c),'telefon','phone','musteri_telefon'),'')) like '%' || v_h.telefon || '%';
  exception when others then v_vincler := '[]'::jsonb; end;

  -- MÜŞTERİNİN EKLEDİĞİ
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', mv.id, 'model', mv.model, 'seri_no', coalesce(mv.seri_no,'—'),
      'kapasite', coalesce(mv.kapasite,'—'), 'makine_tipi', mv.makine_tipi,
      'konum', coalesce(mv.konum,'—'), 'durum', mv.durum,
      'tarih', to_char(mv.created_at,'DD.MM.YYYY')
    ) order by mv.created_at desc), '[]'::jsonb)
    into v_kendi
    from public.musteri_vincler mv where mv.hesap_id = v_h.id;
  exception when others then v_kendi := '[]'::jsonb; end;

  -- ⭐ SERVİS GEÇMİŞİ — 3 KAYNAK
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'tarih', t.tarih, 'aciklama', t.aciklama, 'tur', t.tur,
      'personel', t.personel, 'tutar', t.tutar, 'malzeme', t.malzeme, 'form_no', t.form_no
    ) order by t.tarih_iso desc), '[]'::jsonb)
    into v_servisler
    from (
      -- Finans
      select to_char(cs.service_date,'DD.MM.YYYY') as tarih,
             to_char(cs.service_date,'YYYY-MM-DD') as tarih_iso,
             coalesce(left(cs.description,300),'—') as aciklama,
             coalesce(cs.service_type,'Servis') as tur,
             coalesce(cs.technician,'—') as personel,
             coalesce(cs.price,0) as tutar,
             coalesce(left(cs.materials_text,200),'') as malzeme,
             coalesce(cs.form_number,'') as form_no
      from public.completed_services cs
      where public.firma_eslestir(coalesce(cs.customer_text,''), v_h.firma_adi) >= 75
         or public.temiz_telefon(coalesce(cs.customer_text,'')) like '%' || v_h.telefon || '%'

      union all

      -- Servis formları
      select to_char(sr.created_at,'DD.MM.YYYY'),
             to_char(sr.created_at,'YYYY-MM-DD'),
             coalesce(left(sr.arizanin_cinsi || ' — ' || sr.yapilan_isler, 300),'—'),
             coalesce(sr.islem_turu,'Servis'),
             coalesce(sr.personel_adi,'—'),
             0,
             coalesce(left(sr.degisen_parcalar::text,200),''),
             upper(left(sr.id::text,6))
      from public.service_reports sr
      where public.firma_eslestir(coalesce(sr.firma_adi,''), v_h.firma_adi) >= 75

      union all

      -- Bakım formları
      select to_char(bf.kontrol_tarihi,'DD.MM.YYYY'),
             to_char(bf.kontrol_tarihi,'YYYY-MM-DD'),
             coalesce('Periyodik bakım — ' || (bf.onay_sayisi)::text || ' onay, ' || (bf.ret_sayisi)::text || ' ret','—'),
             'Bakım',
             coalesce(bf.personel,'—'),
             0, '', coalesce(bf.seri_no,'')
      from public.bakim_formlari bf
      where public.firma_eslestir(coalesce(bf.musteri,''), v_h.firma_adi) >= 75
    ) t
    limit 120;
  exception when others then v_servisler := '[]'::jsonb; end;

  -- AKTİF İŞLER
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', st.id,
      'firma', coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),'—'),
      'aciklama', coalesce(left(public.jalan(to_jsonb(st),'description','aciklama'), 250), '—'),
      'durum', coalesce(to_jsonb(st)->>'pipeline_status','bekliyor'),
      'tarih', to_char(st.created_at,'DD.MM.YYYY HH24:MI')
    ) order by st.created_at desc), '[]'::jsonb)
    into v_aktif
    from public.service_tickets st
    where (public.firma_eslestir(coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),''), v_h.firma_adi) >= 75
        or public.temiz_telefon(coalesce(public.jalan(to_jsonb(st),'manual_phone','telefon'),'')) like '%' || v_h.telefon || '%')
      and coalesce(to_jsonb(st)->>'pipeline_status','') not in ('tamamlandi','iptal','cozuldu');
  exception when others then v_aktif := '[]'::jsonb; end;

  -- BAKIM TAKVİMİ
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'model', coalesce(public.jalan(to_jsonb(c),'model','makine_modeli'),'—'),
      'tarih', to_char(nullif(trim(coalesce(public.jalan(to_jsonb(c),'next_maintenance_date'),'')),'')::date, 'DD.MM.YYYY'),
      'gun_kaldi', (nullif(trim(coalesce(public.jalan(to_jsonb(c),'next_maintenance_date'),'')),'')::date - current_date)
    ) order by 2), '[]'::jsonb)
    into v_bakim
    from public.cranes c
    where public.firma_eslestir(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),''), v_h.firma_adi) >= 75
      and nullif(trim(coalesce(public.jalan(to_jsonb(c),'next_maintenance_date'),'')),'') is not null;
  exception when others then v_bakim := '[]'::jsonb; end;

  begin
    select count(*) into v_okunmamis from public.musteri_sohbet
    where hesap_id = v_h.id and gonderen = 'admin' and okundu = false;
  exception when others then v_okunmamis := 0; end;

  -- Tekrarsız makine sayısı
  begin
    select count(distinct public.parca_adi_normal(m)) into v_makine_sayisi from (
      select coalesce(public.jalan(to_jsonb(c),'model','makine_modeli'),'') as m
      from public.cranes c
      where public.firma_eslestir(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),''), v_h.firma_adi) >= 75
         or public.temiz_telefon(coalesce(public.jalan(to_jsonb(c),'telefon','phone'),'')) like '%' || v_h.telefon || '%'
      union all
      select mv.model from public.musteri_vincler mv where mv.hesap_id = v_h.id
      union all
      select public.jalan(to_jsonb(st),'manual_crane_info','vinc_bilgisi') from public.service_tickets st
      where (public.firma_eslestir(coalesce(public.jalan(to_jsonb(st),'firma_adi','manual_customer_name'),''), v_h.firma_adi) >= 75
          or public.temiz_telefon(coalesce(public.jalan(to_jsonb(st),'manual_phone','telefon'),'')) like '%' || v_h.telefon || '%')
        and coalesce(public.jalan(to_jsonb(st),'manual_crane_info','vinc_bilgisi'),'') <> ''
    ) x where coalesce(trim(m),'') not in ('','—');
  exception when others then v_makine_sayisi := 0; end;

  return jsonb_build_object(
    'ok', true, 'firma', v_h.firma_adi, 'ad_soyad', v_h.ad_soyad, 'telefon', v_h.telefon,
    'vincler', v_vincler, 'kendi_makineler', v_kendi,
    'servisler', v_servisler, 'aktif_isler', v_aktif,
    'bakim_takvimi', v_bakim, 'okunmamis_mesaj', v_okunmamis,
    'makine_sayisi', v_makine_sayisi
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_portal_v6(text) from public;
grant execute on function public.musteri_portal_v6(text) to anon, authenticated;


-- ============================================================================
-- 6) 🧪 TEST
-- ============================================================================
select
  public.firma_eslestir('OMSA', 'OMSA OTOMOTİV') as omsa,
  public.firma_eslestir('A', 'A İNŞAAT') as a_insaat,
  public.firma_eslestir('A İnş. Mak. San.', 'A İNŞAAT') as a_uzun,
  public.firma_eslestir('MATAY', 'OMSA OTOMOTİV') as farkli;

-- Mevcut müşteri hesapları için alias öğren
do $$
declare r record; n integer;
begin
  for r in select firma_adi from public.musteri_hesaplar where durum = 'onaylandi' loop
    n := public.otomatik_alias_ogren(r.firma_adi);
    raise notice '✅ % → % alias öğrenildi', r.firma_adi, n;
  end loop;
end $$;

select count(*) as alias_sayisi from public.firma_alias;
