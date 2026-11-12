-- ============================================================================
--  🔧 SATIŞ → FİNANS DÜZELTMESİ (Güncelleme #147)
-- ----------------------------------------------------------------------------
--  1) Finansa KDV'SİZ tutar gitsin (ara_toplam - iskonto)
--  2) Malzeme listesi finans DETAY alanında görünsün
--
--  KULLANIM: 174'ten SONRA çalıştır.
-- ============================================================================

create or replace function public.satisi_finansa_kaydet(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s record;
  v_kalemler text;
  v_detay text;
  v_yeni_id uuid;
  v_kdvsiz numeric(12,2);
begin
  select * into v_s from public.satislar where id = p_id;
  if v_s.id is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Satış bulunamadı.');
  end if;
  if v_s.finans_kaydedildi then
    return jsonb_build_object('ok', false, 'mesaj', 'Bu satış zaten finansa kaydedilmiş.');
  end if;

  -- Malzeme listesi
  select coalesce(string_agg(
    k.adet::text || ' ' || coalesce(k.birim,'Adet') || ' ' ||
    k.parca_adi || ' @ ' || to_char(k.birim_fiyat, 'FM999G999D00') || ' TL',
    E'\n' order by k.created_at), '')
  into v_kalemler
  from public.satis_kalemleri k where k.satis_id = p_id;

  -- ⭐ DETAY: malzemeler + KDV bilgisi
  v_detay := 'MALZEME SATIŞI - ' || coalesce(v_s.satis_no, '') || E'\n\n'
          || 'MALZEMELER:' || E'\n' || coalesce(v_kalemler, '-') || E'\n\n'
          || 'Ara Toplam (KDV hariç): ' || to_char(coalesce(v_s.ara_toplam,0), 'FM999G999D00') || ' TL' || E'\n'
          || case when coalesce(v_s.iskonto,0) > 0
                  then 'İskonto: -' || to_char(v_s.iskonto, 'FM999G999D00') || ' TL' || E'\n'
                  else '' end
          || 'KDV (%' || coalesce(v_s.kdv_orani,20)::text || '): ' || to_char(coalesce(v_s.kdv_tutar,0), 'FM999G999D00') || ' TL' || E'\n'
          || 'GENEL TOPLAM: ' || to_char(coalesce(v_s.genel_toplam,0), 'FM999G999D00') || ' TL';

  -- ⭐ KDV'SİZ TUTAR (finansa bu gider)
  v_kdvsiz := greatest(0, coalesce(v_s.ara_toplam, 0) - coalesce(v_s.iskonto, 0));

  insert into public.completed_services (
    customer_text, service_date, description, price, currency,
    technician, service_type, materials_text, makine_tipi, form_number
  ) values (
    v_s.musteri,
    v_s.satis_tarihi,
    v_detay,
    v_kdvsiz,
    'TRY',
    upper(coalesce(v_s.olusturan, 'BUVISAN')),
    case when v_s.belge_tipi = 'irsaliye' then 'İrsaliye' else 'Malzeme Satışı' end,
    nullif(coalesce(v_kalemler,''), ''),
    'Malzeme',
    v_s.satis_no
  ) returning id into v_yeni_id;

  update public.satislar
     set finans_kaydedildi = true, finans_kayit_id = v_yeni_id
   where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'finans_id', v_yeni_id,
    'kdvsiz_tutar', v_kdvsiz,
    'mesaj', '✅ Finansa kaydedildi (KDV hariç ' || to_char(v_kdvsiz, 'FM999G999D00') || ' TL)'
  );
exception when others then
  return jsonb_build_object('ok', false, 'mesaj', sqlerrm);
end $$;

revoke all on function public.satisi_finansa_kaydet(uuid) from public;
grant execute on function public.satisi_finansa_kaydet(uuid) to authenticated;

-- TEST
select public.satis_no_uret() as satis_no_hazir;
