-- ============================================================================
--  👤 MÜŞTERİ PORTALI GENİŞLETME (Güncelleme #140)
-- ----------------------------------------------------------------------------
--  Yeni özellikler:
--    • Müşteri servis talebi açabilsin (portaldan)
--    • Teklifleri onaylayabilsin
--    • Memnuniyet değerlendirmesi yapabilsin
--    • Fatura/geçmiş detayı
--
--  KULLANIM: 167'den SONRA çalıştır. Veri silmez.
-- ============================================================================


-- ============================================================================
-- 1) 📝 musteri_talepler — portaldan açılan talepler
-- ============================================================================
create table if not exists public.musteri_talepler (
  id            uuid primary key default gen_random_uuid(),
  telefon       text not null,
  musteri       text,
  konu          text,
  aciklama      text,
  tip           text default 'ariza',       -- ariza | bakim | kesif | teklif
  durum         text default 'bekliyor',
  ticket_id     uuid,
  created_at    timestamptz default now()
);

alter table public.musteri_talepler enable row level security;
drop policy if exists "musteri_talep_all" on public.musteri_talepler;
create policy "musteri_talep_all" on public.musteri_talepler for all to authenticated using (true) with check (true);


-- ============================================================================
-- 2) ⭐ musteri_memnuniyet — değerlendirmeler
-- ============================================================================
create table if not exists public.musteri_memnuniyet (
  id            uuid primary key default gen_random_uuid(),
  telefon       text not null,
  servis_id     uuid,
  rapor_id      uuid,
  puan          integer check (puan between 1 and 5),
  yorum         text,
  created_at    timestamptz default now()
);

alter table public.musteri_memnuniyet enable row level security;
drop policy if exists "musteri_memnuniyet_all" on public.musteri_memnuniyet;
create policy "musteri_memnuniyet_all" on public.musteri_memnuniyet for all to authenticated using (true) with check (true);


-- ============================================================================
-- 3) 📝 musteri_talep_ac(token, konu, aciklama, tip)
-- ============================================================================
create or replace function public.musteri_talep_ac(
  p_token text,
  p_konu text,
  p_aciklama text,
  p_tip text default 'ariza'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text;
  v_musteri text;
  v_talep_id uuid;
  v_ticket_id uuid;
begin
  -- Token doğrula
  select telefon into v_tel
  from public.musteri_oturumlar
  where token = p_token and token_son > now() and dogrulandi = true
  limit 1;

  if v_tel is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz. Tekrar giriş yapın.');
  end if;

  -- Müşteri adı (telefondan bul)
  begin
    select coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'), 'Müşteri')
      into v_musteri
    from public.cranes c
    where public.temiz_telefon(coalesce(public.jalan(to_jsonb(c),'telefon','phone','musteri_telefon'),'')) like '%' || v_tel || '%'
    limit 1;
  exception when others then v_musteri := 'Müşteri'; end;

  -- Talep kaydı
  insert into public.musteri_talepler (telefon, musteri, konu, aciklama, tip, durum)
  values (v_tel, v_musteri, p_konu, p_aciklama, p_tip, 'bekliyor')
  returning id into v_talep_id;

  -- service_tickets'a da ekle (operasyon takibinde görünsün)
  begin
    insert into public.service_tickets (
      issue_type, description, status, pipeline_status,
      manual_customer_name, manual_phone, priority
    ) values (
      case when p_tip = 'bakim' then 'bakim' when p_tip = 'kesif' then 'kesif' else 'ariza' end,
      coalesce(p_konu,'') || CASE WHEN coalesce(p_aciklama,'') <> '' THEN E'\n\n' || p_aciklama ELSE '' END,
      'bekliyor', 'bekliyor',
      v_musteri, v_tel,
      case when p_tip = 'ariza' then 'Kritik (Makine Durdu)' else 'Normal' end
    ) returning id into v_ticket_id;

    update public.musteri_talepler set ticket_id = v_ticket_id where id = v_talep_id;
  exception when others then null; end;

  -- Admin'e bildirim
  begin
    perform public.bildirim_gonder(
      '👤 Müşteri Portalından Talep',
      v_musteri || ' — ' || left(coalesce(p_konu,''), 80),
      'admin', null, '/admin', 'yuksek'
    );
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'talep_id', v_talep_id,
                            'mesaj', 'Talebiniz alındı. En kısa sürede dönüş yapılacak.');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_talep_ac(text, text, text, text) from public;
grant execute on function public.musteri_talep_ac(text, text, text, text) to anon, authenticated;


-- ============================================================================
-- 4) ⭐ musteri_puan_ver(token, servis_id, puan, yorum)
-- ============================================================================
create or replace function public.musteri_puan_ver(
  p_token text,
  p_servis_id uuid,
  p_puan integer,
  p_yorum text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text;
begin
  select telefon into v_tel
  from public.musteri_oturumlar
  where token = p_token and token_son > now() and dogrulandi = true
  limit 1;

  if v_tel is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz.');
  end if;

  if p_puan < 1 or p_puan > 5 then
    return jsonb_build_object('ok', false, 'mesaj', 'Puan 1-5 arası olmalı.');
  end if;

  insert into public.musteri_memnuniyet (telefon, servis_id, puan, yorum)
  values (v_tel, p_servis_id, p_puan, nullif(trim(coalesce(p_yorum,'')),''));

  -- completed_services'e de yaz
  begin
    update public.completed_services cs
       set description = coalesce(cs.description,'')
     where cs.id = p_servis_id;
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'mesaj', 'Değerlendirmeniz için teşekkürler!');
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_puan_ver(text, uuid, integer, text) from public;
grant execute on function public.musteri_puan_ver(text, uuid, integer, text) to anon, authenticated;


-- ============================================================================
-- 5) 💰 musteri_tekliflerim(token) — müşterinin teklifleri
-- ============================================================================
create or replace function public.musteri_tekliflerim(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tel text;
  v_sonuc jsonb := '[]'::jsonb;
begin
  select telefon into v_tel
  from public.musteri_oturumlar
  where token = p_token and token_son > now() and dogrulandi = true
  limit 1;

  if v_tel is null then return '[]'::jsonb; end if;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', tb.id,
      'musteri', coalesce(tb.musteri,'—'),
      'ariza', coalesce(left(tb.ariza, 200), '—'),
      'is_emri_no', coalesce(tb.is_emri_no,'—'),
      'durum', coalesce(tb.durum,'BEKLIYOR'),
      'tarih', to_char(tb.created_at,'DD.MM.YYYY')
    ) order by tb.created_at desc), '[]'::jsonb)
    into v_sonuc
    from public.teklif_bekleyenler tb
    where public.temiz_telefon(coalesce(tb.musteri,'')) like '%' || v_tel || '%'
       or public.temiz_telefon(coalesce(tb.ariza,'')) like '%' || v_tel || '%'
    limit 20;
  exception when others then v_sonuc := '[]'::jsonb; end;

  return v_sonuc;
end $$;

revoke all on function public.musteri_tekliflerim(text) from public;
grant execute on function public.musteri_tekliflerim(text) to anon, authenticated;


-- ============================================================================
-- 6) 📊 musteri_taleplerim(token)
-- ============================================================================
create or replace function public.musteri_taleplerim(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tel text;
  v_sonuc jsonb := '[]'::jsonb;
begin
  select telefon into v_tel
  from public.musteri_oturumlar
  where token = p_token and token_son > now() and dogrulandi = true
  limit 1;

  if v_tel is null then return '[]'::jsonb; end if;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', mt.id,
      'konu', coalesce(mt.konu,'—'),
      'aciklama', coalesce(left(mt.aciklama,200),''),
      'tip', coalesce(mt.tip,'ariza'),
      'durum', coalesce(mt.durum,'bekliyor'),
      'tarih', to_char(mt.created_at,'DD.MM.YYYY HH24:MI')
    ) order by mt.created_at desc), '[]'::jsonb)
    into v_sonuc
    from public.musteri_talepler mt
    where mt.telefon = v_tel
    limit 20;
  exception when others then v_sonuc := '[]'::jsonb; end;

  return v_sonuc;
end $$;

revoke all on function public.musteri_taleplerim(text) from public;
grant execute on function public.musteri_taleplerim(text) to anon, authenticated;


-- ============================================================================
-- 7) 🧪 TEST
-- ============================================================================
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='musteri_talepler') as talep_tablo,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='musteri_memnuniyet') as memnuniyet_tablo,
  (select count(*) from information_schema.routines
    where routine_schema='public' and routine_name in
      ('musteri_talep_ac','musteri_puan_ver','musteri_tekliflerim','musteri_taleplerim')) as fonksiyon;
