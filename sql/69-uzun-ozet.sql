-- ============================================================================
--  📊 UZUN ASİSTAN ÖZETİ — YAPILANLAR + YAPILACAKLAR (Güncelleme #49)
-- ----------------------------------------------------------------------------
--  SENİN İSTEĞİN:
--    "Özet sadece 1 mesaj. Bana programdaki BÜTÜN yapılacak ve YAPILAN işleri
--     anlatsın, uzun bir özet istiyorum."
--
--  YENİ ÖZET İÇERİĞİ:
--    1) 📌 BEKLEYEN İŞLER    (tüm konular, aciliyet sırasıyla)
--    2) ✅ BUGÜN YAPILANLAR  (tamamlanan iş, rapor, teklif, tahsilat)
--    3) 📈 BUGÜNÜN RAKAMLARI (ciro, randevu, iş sayısı)
--    4) 📅 YARIN             (planlanan işler)
--
--  KULLANIM: Supabase → SQL Editor → New query → tamamını yapıştır → RUN
-- ============================================================================

create or replace function public.asistan_ozet_gonder()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b           record;
  v_satir       text := '';
  v_toplam      integer := 0;
  v_mesaj       text;
  v_saat        text;
  v_bugun       date := (now() at time zone 'Europe/Istanbul')::date;
  -- Yapılanlar
  v_is          integer := 0;
  v_ciro        numeric := 0;
  v_rapor       integer := 0;
  v_teklif      integer := 0;
  v_tahsilat    integer := 0;
  v_tahsilat_tl numeric := 0;
  v_randevu     integer := 0;
  v_randevu_ok  integer := 0;
  -- Yarın
  v_yarin       integer := 0;
begin
  v_saat := to_char(now() at time zone 'Europe/Istanbul', 'HH24:MI');

  -- ═══════════════ 1) BEKLEYEN İŞLER ═══════════════
  for v_b in select * from public.asistan_bekleyenler() order by aciliyet loop
    v_satir := v_satir || E'\n' || case v_b.aciliyet
        when 1 then '🔴' when 2 then '🟠' when 3 then '📋' when 4 then '📅'
        when 5 then '📦' when 6 then '👤' when 7 then '🔧' when 8 then '⚠️'
        else '•' end
      || ' <b>' || v_b.baslik || '</b> — <b>' || v_b.adet || '</b>'
      || case when coalesce(v_b.detay,'') <> '' then E'\n     <i>' || left(v_b.detay, 100) || '</i>' else '' end;
    v_toplam := v_toplam + 1;
  end loop;

  -- ═══════════════ 2) BUGÜN YAPILANLAR ═══════════════
  begin
    select count(*), coalesce(sum(price),0) into v_is, v_ciro
    from public.completed_services where service_date::date = v_bugun;
  exception when others then null; end;

  begin
    select count(*) into v_rapor from public.service_reports where created_at::date = v_bugun;
  exception when others then null; end;

  begin
    select count(*) into v_teklif from public.offers
    where coalesce((to_jsonb(offers)->>'created_at')::timestamptz, now())::date = v_bugun;
  exception when others then null; end;

  begin
    select count(*), coalesce(sum(tutar),0) into v_tahsilat, v_tahsilat_tl
    from public.cari_tahsilatlar where created_at::date = v_bugun;
  exception when others then null; end;

  begin
    select count(*), count(*) filter (where coalesce(status,'') in ('tamamlandi','Yapıldı'))
      into v_randevu, v_randevu_ok
    from public.appointments where appointment_date = v_bugun;
  exception when others then null; end;

  begin
    select count(*) into v_yarin from public.appointments
    where appointment_date = v_bugun + 1 and coalesce(status,'') not in ('iptal');
  exception when others then null; end;

  -- ═══════════════ MESAJI OLUŞTUR ═══════════════
  v_mesaj := '📊 <b>ASİSTAN ÖZETİ</b> — ' || v_saat || E'\n'
          || '━━━━━━━━━━━━━━━━━━━━━━' || E'\n'
          || E'\n<b>📌 BEKLEYEN İŞLER (' || v_toplam || ' başlık)</b>';

  if v_toplam = 0 then
    v_mesaj := v_mesaj || E'\n✅ Bekleyen iş yok, her şey yolunda! 👏';
  else
    v_mesaj := v_mesaj || v_satir;
  end if;

  v_mesaj := v_mesaj || E'\n\n<b>✅ BUGÜN YAPILANLAR</b>';
  if v_is = 0 and v_rapor = 0 and v_teklif = 0 and v_tahsilat = 0 then
    v_mesaj := v_mesaj || E'\n• Henüz kayıt yok';
  else
    if v_is > 0 then
      v_mesaj := v_mesaj || E'\n• 🔧 Tamamlanan iş: <b>' || v_is || '</b>';
    end if;
    if v_rapor > 0 then
      v_mesaj := v_mesaj || E'\n• 📝 Girilen rapor: <b>' || v_rapor || '</b>';
    end if;
    if v_teklif > 0 then
      v_mesaj := v_mesaj || E'\n• 📄 Oluşturulan teklif: <b>' || v_teklif || '</b>';
    end if;
    if v_tahsilat > 0 then
      v_mesaj := v_mesaj || E'\n• 💵 Tahsilat: <b>' || v_tahsilat || '</b> adet · <b>'
              || to_char(v_tahsilat_tl, 'FM999G999G999') || ' ₺</b>';
    end if;
  end if;

  v_mesaj := v_mesaj || E'\n\n<b>📈 BUGÜNÜN RAKAMLARI</b>'
          || E'\n• 💰 Günlük ciro: <b>' || to_char(coalesce(v_ciro,0), 'FM999G999G999') || ' ₺</b>'
          || E'\n• 📅 Randevu: <b>' || v_randevu || '</b>'
          || case when v_randevu > 0 then ' (' || v_randevu_ok || ' tamamlandı)' else '' end;

  if v_yarin > 0 then
    v_mesaj := v_mesaj || E'\n\n<b>📆 YARIN</b>'
            || E'\n• Planlanan iş: <b>' || v_yarin || '</b> — hazırlık yap!';
  end if;

  v_mesaj := v_mesaj || E'\n━━━━━━━━━━━━━━━━━━━━━━';

  perform public.asistan_telegram(v_mesaj);
  insert into public.asistan_hatirlatmalar (anahtar, mesaj) values ('__ozet__', left(v_mesaj, 300));
  return v_mesaj;
end $$;

revoke all on function public.asistan_ozet_gonder() from public;
grant execute on function public.asistan_ozet_gonder() to authenticated;


-- ============================================================================
-- TEST — özeti hemen gönder
-- ============================================================================
select public.asistan_ozet_gonder();
