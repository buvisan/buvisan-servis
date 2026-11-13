-- ============================================================================
--  💬 PAZARLIK SİSTEMİ (Güncelleme #159)
-- ----------------------------------------------------------------------------
--  Müşteri teklif için kalem kalem indirim teklif eder →
--  admin görür → onaylar / reddeder / revize eder
--
--  KULLANIM: 186'dan SONRA çalıştır.
-- ============================================================================

-- ─── 1) pazarlik tablosu ───
create table if not exists public.teklif_pazarlik (
  id            uuid primary key default gen_random_uuid(),
  hesap_id      uuid references public.musteri_hesaplar(id) on delete cascade,
  kaynak        text not null,              -- offer | satis | teklif
  kayit_id      uuid not null,
  teklif_tutar  numeric(12,2) default 0,
  istenen_tutar numeric(12,2) default 0,
  fark          numeric(12,2) generated always as (teklif_tutar - istenen_tutar) stored,
  mesaj         text,
  kalemler      jsonb,                      -- kalem kalem istekler
  durum         text default 'bekliyor',    -- bekliyor | kabul | red | revize
  admin_notu    text,
  created_at    timestamptz default now(),
  cevap_tarihi  timestamptz
);

alter table public.teklif_pazarlik enable row level security;
drop policy if exists "pazarlik_all" on public.teklif_pazarlik;
create policy "pazarlik_all" on public.teklif_pazarlik for all to authenticated using (true) with check (true);

create index if not exists idx_pazarlik_hesap on public.teklif_pazarlik(hesap_id, created_at desc);
create index if not exists idx_pazarlik_kayit on public.teklif_pazarlik(kaynak, kayit_id);


-- ─── 2) Müşteri pazarlık gönderir ───
create or replace function public.musteri_pazarlik_gonder(
  p_token text,
  p_kaynak text,
  p_kayit_id uuid,
  p_teklif_tutar numeric,
  p_istenen_tutar numeric,
  p_mesaj text default null,
  p_kalemler jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_h record;
  v_id uuid;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz.'); end if;
  if coalesce(p_istenen_tutar, 0) <= 0 then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçerli bir tutar girin.');
  end if;
  if p_istenen_tutar >= p_teklif_tutar then
    return jsonb_build_object('ok', false, 'mesaj', 'Teklif tutarından düşük bir tutar girin.');
  end if;

  -- Aynı teklif için bekleyen pazarlık var mı?
  if exists (select 1 from public.teklif_pazarlik
             where hesap_id = v_h.id and kaynak = p_kaynak
               and kayit_id = p_kayit_id and durum = 'bekliyor') then
    return jsonb_build_object('ok', false, 'mesaj', 'Bu teklif için zaten bekleyen bir pazarlık teklifiniz var.');
  end if;

  insert into public.teklif_pazarlik (
    hesap_id, kaynak, kayit_id, teklif_tutar, istenen_tutar, mesaj, kalemler
  ) values (
    v_h.id, p_kaynak, p_kayit_id, coalesce(p_teklif_tutar,0),
    p_istenen_tutar, nullif(trim(coalesce(p_mesaj,'')),''), p_kalemler
  ) returning id into v_id;

  begin
    perform public.bildirim_gonder(
      '💬 Pazarlık Teklifi',
      v_h.firma_adi || ' — ' || to_char(p_istenen_tutar, 'FM999G999D00') || ' TL istiyor',
      'admin', null, '/admin/teklifler', 'kritik'
    );
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'id', v_id,
    'mesaj', 'Pazarlık teklifiniz gönderildi. En kısa sürede dönüş yapacağız.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_pazarlik_gonder(text, text, uuid, numeric, numeric, text, jsonb) from public;
grant execute on function public.musteri_pazarlik_gonder(text, text, uuid, numeric, numeric, text, jsonb) to anon, authenticated;


-- ─── 3) Müşteri pazarlıklarını görür ───
create or replace function public.musteri_pazarliklarim(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_h record;
  v_sonuc jsonb;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'kaynak', p.kaynak, 'kayit_id', p.kayit_id,
    'teklif_tutar', p.teklif_tutar, 'istenen_tutar', p.istenen_tutar,
    'fark', p.fark, 'mesaj', coalesce(p.mesaj,''),
    'durum', p.durum, 'admin_notu', coalesce(p.admin_notu,''),
    'tarih', to_char(p.created_at,'DD.MM.YYYY HH24:MI')
  ) order by p.created_at desc), '[]'::jsonb)
  into v_sonuc
  from public.teklif_pazarlik p where p.hesap_id = v_h.id;

  return v_sonuc;
exception when others then return '[]'::jsonb;
end $$;

revoke all on function public.musteri_pazarliklarim(text) from public;
grant execute on function public.musteri_pazarliklarim(text) to anon, authenticated;


-- ─── 4) ADMIN: pazarlık listesi ───
create or replace function public.pazarlik_listesi(p_durum text default 'bekliyor')
returns table (
  id uuid, firma text, kaynak text, kayit_id uuid,
  teklif_tutar numeric, istenen_tutar numeric, fark numeric,
  mesaj text, durum text, admin_notu text, tarih text, hesap_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, h.firma_adi, p.kaynak, p.kayit_id,
         p.teklif_tutar, p.istenen_tutar, p.fark,
         coalesce(p.mesaj,''), p.durum, coalesce(p.admin_notu,''),
         to_char(p.created_at,'DD.MM.YYYY HH24:MI'), p.hesap_id
  from public.teklif_pazarlik p
  join public.musteri_hesaplar h on h.id = p.hesap_id
  where (p_durum = 'hepsi' or p.durum = p_durum)
  order by p.created_at desc;
$$;

revoke all on function public.pazarlik_listesi(text) from public;
grant execute on function public.pazarlik_listesi(text) to authenticated;


-- ─── 5) ADMIN: pazarlığa cevap ───
create or replace function public.pazarlik_cevapla(
  p_id uuid, p_durum text, p_admin_notu text default null, p_yeni_tutar numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p record;
  v_h record;
begin
  if p_durum not in ('kabul','red','revize','bekliyor') then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçersiz durum.');
  end if;

  select * into v_p from public.teklif_pazarlik where id = p_id;
  if v_p.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Pazarlık bulunamadı.'); end if;

  select * into v_h from public.musteri_hesaplar where id = v_p.hesap_id;

  update public.teklif_pazarlik
     set durum = p_durum,
         admin_notu = nullif(trim(coalesce(p_admin_notu,'')),''),
         istenen_tutar = coalesce(p_yeni_tutar, istenen_tutar),
         cevap_tarihi = now()
   where id = p_id;

  -- Onay kaydı
  if p_durum = 'kabul' then
    begin
      insert into public.musteri_teklif_onay (hesap_id, offer_id, satis_id, durum, not_)
      values (v_p.hesap_id,
              case when v_p.kaynak = 'offer' then v_p.kayit_id else null end,
              case when v_p.kaynak = 'satis' then v_p.kayit_id else null end,
              'onaylandi', 'Pazarlık kabul edildi');
    exception when others then null; end;
  end if;

  return jsonb_build_object('ok', true,
    'mesaj', case p_durum
      when 'kabul' then '✅ Pazarlık kabul edildi. Müşteriye bildirim gidecek.'
      when 'red' then '❌ Pazarlık reddedildi.'
      when 'revize' then '📝 Revize teklif gönderildi.'
      else 'Güncellendi.' end);
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.pazarlik_cevapla(uuid, text, text, numeric) from public;
grant execute on function public.pazarlik_cevapla(uuid, text, text, numeric) to authenticated;


-- ─── 6) TEST ───
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='teklif_pazarlik') as tablo_ok,
  (select count(*) from information_schema.routines
    where routine_schema='public' and routine_name in
      ('musteri_pazarlik_gonder','musteri_pazarliklarim','pazarlik_listesi','pazarlik_cevapla')) as fn_ok;
