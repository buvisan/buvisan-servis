-- ============================================================================
--  📨 TEKLİF TAKİBİ — hatırlatma motoru v2 (Güncelleme #206)
-- ----------------------------------------------------------------------------
--  YENİ KURAL: 3 gündür cevapsız teklif → MÜŞTERİYE hatırlatma
--    • portal SOHBET'ine mesaj ("Teklifiniz onayınızı bekliyor")
--    • push bildirimi → /teklif-odasi/<id> (müşteri tek dokunuşla teklifi açar)
--    • ADMIN'e tek özet bildirim ("X teklif 3 gündür cevapsız")
--
--  Bu dosya hatirlatma_uret() fonksiyonunu TAMAMEN yeniler (204'ün yerine):
--    bakım 7/1 gün + teklif 3 gün + haftalık admin özeti
--
--  ⚠️ TUTAR KURALI: sistemdeki tüm tutarlar KDV HARİÇTİR. Mesajda belirtilir.
--  ⚠️ TEKRAR KORUMASI: hatirlatma_gonderim.anahtar → 'teklif:3:<offer_id>'
--
--  KULLANIM: Supabase SQL Editor'de 205'ten sonra bir kez çalıştır.
-- ============================================================================


create or replace function public.hatirlatma_uret()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p record;
  v_t record;
  v_anahtar text;
  v_mesaj text;
  v_baslik text;
  v_tutar_yazi text;
  v_gun integer;
  v_hesap_id uuid;
  v_hesap_firma text;
  v_bakim integer := 0;
  v_teklif_adet integer := 0;
  v_ozet integer := 0;
  v_gecikmis integer;
  v_teklif_bekleyen integer;
  v_sozlesme integer;
begin
  -- ═══ 1) BAKIM HATIRLATMASI (7 gün / 1 gün kala) — MÜŞTERİYE ═══
  for v_p in
    select b.id, b.tarih, b.sira, s.company_name, s.hitap_adi
    from public.bakim_plani b
    join public.maintenance_contracts s on s.id = b.sozlesme_id
    where b.durum = 'planlandi'
      and (b.tarih = current_date + 7 or b.tarih = current_date + 1)
    order by b.tarih
  loop
    v_gun := v_p.tarih - current_date;
    v_anahtar := 'bakim:' || v_gun::text || ':' || v_p.id::text;

    if exists (select 1 from public.hatirlatma_gonderim g where g.anahtar = v_anahtar) then
      continue;
    end if;

    v_mesaj := 'Periyodik bakımınız ' || to_char(v_p.tarih, 'DD.MM.YYYY') ||
               ' tarihinde (' || v_gun || ' gün sonra). Uygun değilse müşteri portalı → ' ||
               'BAKIM sekmesinden tarih değişikliği talep edebilirsiniz.';

    -- Portal hesabı var mı? (sözleşme tam ünvanı VEYA hitap ile eşleşme)
    v_hesap_id := null;
    v_hesap_firma := null;

    select h.id, h.firma_adi
      into v_hesap_id, v_hesap_firma
    from public.musteri_hesaplar h
    where h.durum = 'onaylandi'
      and (public.firma_eslestir(v_p.company_name, h.firma_adi) >= 75
        or public.firma_eslestir(coalesce(v_p.hitap_adi, ''), h.firma_adi) >= 75)
    order by h.id
    limit 1;

    if v_hesap_id is not null then
      begin
        insert into public.musteri_sohbet (hesap_id, gonderen, mesaj, okundu)
        values (v_hesap_id, 'admin', v_mesaj, false);
      exception when others then null; end;

      insert into public.bildirim_kuyrugu (hedef_rol, hedef_kisi, baslik, mesaj, url, oncelik)
      values ('musteri', v_hesap_firma, 'Bakım hatırlatma', v_mesaj, '/musteri', 'normal');
    else
      insert into public.bildirim_kuyrugu (hedef_rol, baslik, mesaj, url, oncelik)
      values ('admin', 'Bakım hatırlatma (müşteri hesabı yok)',
              v_p.company_name || ' — ' || v_mesaj, '/admin/bakim-takvimi', 'normal');
    end if;

    insert into public.hatirlatma_gonderim (anahtar, tip, kaynak_id)
    values (v_anahtar, 'bakim', v_p.id)
    on conflict (anahtar) do nothing;

    v_bakim := v_bakim + 1;
  end loop;

  -- ═══ 2) TEKLİF TAKİBİ (3 gündür cevapsız) — MÜŞTERİYE ═══
  for v_t in
    select o.id,
           coalesce(public.jalan(to_jsonb(o), 'customer_name', 'musteri', 'firma_adi'), '') as firma,
           coalesce(public.jalan(to_jsonb(o), 'template_type'), '') as tip,
           coalesce(nullif(public.jalan(to_jsonb(o), 'total_price'), '')::numeric,
                    nullif(public.jalan(to_jsonb(o), 'genel_toplam'), '')::numeric, 0) as tutar,
           coalesce(nullif(public.jalan(to_jsonb(o), 'offer_date'), '')::date,
                    o.created_at::date) as teklif_tarihi
    from public.offers o
    where lower(coalesce(public.jalan(to_jsonb(o), 'status'), 'bekliyor'))
            in ('bekliyor', 'beklemede', '')
      and coalesce(nullif(public.jalan(to_jsonb(o), 'offer_date'), '')::date,
                   o.created_at::date) <= current_date - 3
    order by o.created_at
    limit 60
  loop
    v_anahtar := 'teklif:3:' || v_t.id::text;

    if exists (select 1 from public.hatirlatma_gonderim g where g.anahtar = v_anahtar) then
      continue;
    end if;

    -- Portal hesabı var mı?
    v_hesap_id := null;
    v_hesap_firma := null;

    select h.id, h.firma_adi
      into v_hesap_id, v_hesap_firma
    from public.musteri_hesaplar h
    where h.durum = 'onaylandi'
      and public.firma_eslestir(v_t.firma, h.firma_adi) >= 75
    order by h.id
    limit 1;

    v_baslik := case
                  when v_t.tip = 'bakim' then 'Periyodik Bakım Teklifi'
                  when v_t.tip = 'siparis' then 'Sipariş Formu'
                  else 'Fiyat Teklifi'
                end;

    -- 12.500,00 → 12.500 biçimi (İngilizce ayraçları Türkçeye çevir)
    v_tutar_yazi := translate(to_char(round(coalesce(v_t.tutar, 0)), 'FM999G999G999'), ',.', '.,');

    if v_hesap_id is not null then
      v_mesaj := v_baslik || ' (' || v_tutar_yazi || ' TL, KDV hariç) onayınızı bekliyor. ' ||
                 'Müşteri portalı → TEKLİF sekmesinden görüntüleyebilir veya ' ||
                 'tek dokunuşla teklif sayfasını açabilirsiniz.';

      begin
        insert into public.musteri_sohbet (hesap_id, gonderen, mesaj, okundu)
        values (v_hesap_id, 'admin', v_mesaj, false);
      exception when others then null; end;

      insert into public.bildirim_kuyrugu (hedef_rol, hedef_kisi, baslik, mesaj, url, oncelik)
      values ('musteri', v_hesap_firma, 'Teklifiniz onay bekliyor', v_mesaj,
              '/teklif-odasi/' || v_t.id::text, 'normal');

      v_teklif_adet := v_teklif_adet + 1;
    end if;

    insert into public.hatirlatma_gonderim (anahtar, tip, kaynak_id)
    values (v_anahtar, 'teklif', v_t.id)
    on conflict (anahtar) do nothing;
  end loop;

  -- Teklif hatırlatması gittiyse ADMIN'e tek özet (push spam'i olmasın)
  if v_teklif_adet > 0 then
    insert into public.bildirim_kuyrugu (hedef_rol, baslik, mesaj, url, oncelik)
    values ('admin', 'Teklif takibi',
            v_teklif_adet || ' teklif 3 gündür cevapsız — müşterilere hatırlatma gönderildi.',
            '/admin/teklifler', 'normal');
  end if;

  -- ═══ 3) HAFTALIK ÖZET (pazartesi) — ADMIN'E ═══
  if extract(isodow from current_date) = 1 then
    v_anahtar := 'ozet:' || current_date::text;

    if not exists (select 1 from public.hatirlatma_gonderim g where g.anahtar = v_anahtar) then
      select count(*) into v_gecikmis
      from public.bakim_plani b
      where b.durum = 'planlandi' and b.tarih < current_date;

      select count(*) into v_teklif_bekleyen
      from public.offers o
      where lower(coalesce(public.jalan(to_jsonb(o), 'status'), 'bekliyor'))
              in ('bekliyor', 'beklemede', '')
        and o.created_at < now() - interval '3 days';

      select count(*) into v_sozlesme
      from public.maintenance_contracts s
      where coalesce(s.status, 'aktif') <> 'bitti'
        and coalesce(s.asama, 'anlasildi') <> 'teklif'
        and s.end_date between current_date and current_date + 60;

      if (v_gecikmis + v_teklif_bekleyen + v_sozlesme) > 0 then
        v_mesaj := 'Bu hafta: ' || v_gecikmis || ' gecikmiş bakım · ' ||
                   v_teklif_bekleyen || ' cevapsız teklif · ' ||
                   v_sozlesme || ' yenilenecek sözleşme.';

        insert into public.bildirim_kuyrugu (hedef_rol, baslik, mesaj, url, oncelik)
        values ('admin', 'Haftalık hatırlatma özeti', v_mesaj, '/admin/hatirlatmalar', 'yuksek');

        insert into public.hatirlatma_gonderim (anahtar, tip)
        values (v_anahtar, 'ozet')
        on conflict (anahtar) do nothing;

        v_ozet := 1;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'bakim', v_bakim,
    'teklif', v_teklif_adet,
    'ozet', v_ozet,
    'toplam', v_bakim + v_teklif_adet + v_ozet,
    'mesaj', case when (v_bakim + v_teklif_adet + v_ozet) = 0
               then 'Yeni hatırlatma yok.'
               else (v_bakim + v_teklif_adet + v_ozet) || ' yeni hatırlatma oluşturuldu.' end
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.hatirlatma_uret() from public;
grant execute on function public.hatirlatma_uret() to authenticated, service_role;


-- ─── MIGRATION KAYDI ───
do $$
begin
  perform public.migration_isaretle('206-teklif-takip.sql', 'teklif 3 gün takibi (motor v2)');
  raise notice '✅ 206 kaydedildi';
exception when others then
  raise notice 'migration kaydı atlandı (205 çalıştırılmamış olabilir)';
end $$;


-- ─── KONTROL ───
select
  (select count(*) from public.offers
    where lower(coalesce(public.jalan(to_jsonb(o), 'status'), 'bekliyor'))
            in ('bekliyor', 'beklemede', '')
      and coalesce(nullif(public.jalan(to_jsonb(o), 'offer_date'), '')::date,
                   o.created_at::date) <= current_date - 3) as uc_gun_bekleyen,
  (select count(*) from information_schema.routines
    where routine_schema = 'public' and routine_name = 'hatirlatma_uret') as fonksiyon_ok;
