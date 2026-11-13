-- ============================================================================
--  🎯 PAZARLIK SONUCU + TEKLİF DETAY (Güncelleme #163)
-- ----------------------------------------------------------------------------
--  1) Admin revize eder → müşteri KABUL / RED / YENİ PAZARLIK yapar
--  2) Müşteri kendi teklifini PDF olarak açabilir
--
--  KULLANIM: 190'dan SONRA çalıştır.
-- ============================================================================

-- ─── 1) Müşteri pazarlık sonucunu kabul/red eder ───
create or replace function public.musteri_pazarlik_karar(
  p_token text,
  p_pazarlik_id uuid,
  p_onay boolean,
  p_not text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_h record;
  v_p record;
begin
  select * into v_h from public.musteri_hesaplar
  where token = p_token and token_son > now() and durum = 'onaylandi' limit 1;

  if v_h.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz.'); end if;

  select * into v_p from public.teklif_pazarlik
  where id = p_pazarlik_id and hesap_id = v_h.id;

  if v_p.id is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Pazarlık bulunamadı.');
  end if;

  -- Sadece revize edilmiş veya bekleyen pazarlığa karar verilebilir
  if v_p.durum not in ('revize', 'bekliyor') then
    return jsonb_build_object('ok', false, 'mesaj', 'Bu pazarlık zaten sonuçlanmış.');
  end if;

  update public.teklif_pazarlik
     set durum = case when p_onay then 'kabul' else 'red' end,
         admin_notu = coalesce(nullif(trim(coalesce(p_not,'')),''), admin_notu),
         cevap_tarihi = now()
   where id = p_pazarlik_id;

  -- Teklif onay kaydı
  begin
    insert into public.musteri_teklif_onay (hesap_id, offer_id, satis_id, durum, not_)
    values (
      v_h.id,
      case when v_p.kaynak = 'offer' then v_p.kayit_id else null end,
      case when v_p.kaynak = 'satis' then v_p.kayit_id else null end,
      case when p_onay then 'onaylandi' else 'reddedildi' end,
      nullif(trim(coalesce(p_not,'')),'')
    );
  exception when others then null; end;

  -- Admin'e bildirim
  begin
    perform public.bildirim_gonder(
      case when p_onay then '✅ Pazarlık ONAYLANDI' else '❌ Pazarlık REDDEDİLDİ' end,
      v_h.firma_adi || ' — ' || to_char(coalesce(v_p.istenen_tutar,0), 'FM999G999D00') || ' TL',
      'admin', null, '/admin/musteri-hesaplari', 'kritik'
    );
  exception when others then null; end;

  return jsonb_build_object('ok', true,
    'mesaj', case when p_onay
      then 'Anlaşma sağlandı! En kısa sürede sizinle iletişime geçeceğiz.'
      else 'Pazarlık reddedildi.' end);
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.musteri_pazarlik_karar(text, uuid, boolean, text) from public;
grant execute on function public.musteri_pazarlik_karar(text, uuid, boolean, text) to anon, authenticated;


-- ─── 2) Müşteri teklif detayını görür (PDF için) ───
create or replace function public.musteri_teklif_detay(
  p_token text, p_kaynak text, p_id uuid
)
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

  if v_h.id is null then return jsonb_build_object('ok', false, 'mesaj', 'Oturum geçersiz.'); end if;

  if p_kaynak = 'offer' then
    begin
      select to_jsonb(o) || jsonb_build_object(
        'kaynak', 'offer',
        'tarih_tr', to_char(public.guvenli_tarih(public.jalan(to_jsonb(o),'offer_date','created_at')), 'DD.MM.YYYY'),
        'musteri', coalesce(public.jalan(to_jsonb(o),'customer_name','musteri','firma_adi'),''),
        'yetkili', coalesce(public.jalan(to_jsonb(o),'customer_rep'),''),
        'adres', coalesce(public.jalan(to_jsonb(o),'customer_address'),''),
        'aciklama', coalesce(public.jalan(to_jsonb(o),'description','notlar'),''),
        'genel_toplam', coalesce(
          nullif(public.jalan(to_jsonb(o),'total_price'),'')::numeric,
          nullif(public.jalan(to_jsonb(o),'genel_toplam'),'')::numeric, 0)
      ) into v_sonuc
      from public.offers o where o.id = p_id;

      if v_sonuc is null then
        return jsonb_build_object('ok', false, 'mesaj', 'Teklif bulunamadı.');
      end if;

      -- Kalemler
      begin
        v_sonuc := v_sonuc || jsonb_build_object('kalemler',
          coalesce((select jsonb_agg(jsonb_build_object(
            'ad', coalesce(public.jalan(to_jsonb(k),'description','name','ad'),'Kalem'),
            'adet', coalesce(nullif(public.jalan(to_jsonb(k),'quantity','adet'),'')::numeric, 1),
            'birim_fiyat', coalesce(nullif(public.jalan(to_jsonb(k),'unit_price','birim_fiyat'),'')::numeric, 0),
            'toplam', coalesce(nullif(public.jalan(to_jsonb(k),'total','toplam'),'')::numeric, 0)
          ))
          from public.offer_items k where k.offer_id = p_id), '[]'::jsonb));
      exception when others then
        v_sonuc := v_sonuc || jsonb_build_object('kalemler', '[]'::jsonb);
      end;

      -- Müşteri bu teklifin sahibi mi?
      if public.firma_eslestir(v_sonuc->>'musteri', v_h.firma_adi) < 75 then
        return jsonb_build_object('ok', false, 'mesaj', 'Bu teklif size ait değil.');
      end if;

      return jsonb_build_object('ok', true, 'teklif', v_sonuc);
    exception when others then
      return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
    end;
  end if;

  if p_kaynak = 'satis' then
    begin
      return public.satis_getir(p_id);
    exception when others then
      return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
    end;
  end if;

  return jsonb_build_object('ok', false, 'mesaj', 'Desteklenmeyen kaynak.');
end $$;

revoke all on function public.musteri_teklif_detay(text, text, uuid) from public;
grant execute on function public.musteri_teklif_detay(text, text, uuid) to anon, authenticated;


-- ─── 3) Pazarlık tablosuna "musteri_karar" alanı ───
alter table public.teklif_pazarlik
  add column if not exists musteri_karar text,
  add column if not exists musteri_not text;

-- ─── 4) Test ───
select
  (select count(*) from information_schema.routines
    where routine_schema='public' and routine_name in
      ('musteri_pazarlik_karar','musteri_teklif_detay')) as fn_ok,
  (select count(*) from public.teklif_pazarlik) as pazarlik_sayisi;
