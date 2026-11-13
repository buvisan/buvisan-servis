-- ============================================================================
--  🔧 musteri_hesap_listesi — DROP + CREATE (Güncelleme #161)
-- ----------------------------------------------------------------------------
--  HATA: 42P13 cannot change return type of existing function
--  SEBEP: 2 yeni kolon eklendi (okunmamis, pazarlik)
--  ÇÖZÜM: DROP FUNCTION önce
--
--  KULLANIM: 188'den SONRA çalıştır.
-- ============================================================================

-- Bağımlılıkları temizle
drop function if exists public.musteri_hesap_listesi(text) cascade;

create function public.musteri_hesap_listesi(p_durum text default 'bekliyor')
returns table (
  id uuid, firma_adi text, kullanici_adi text, ad_soyad text,
  telefon text, email text, durum text, ret_sebebi text,
  onaylayan text, onay_tarihi text, son_giris text, olusturma text,
  vinç_sayisi bigint, okunmamis integer, pazarlik integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.id, h.firma_adi, h.kullanici_adi, h.ad_soyad,
    h.telefon, h.email, h.durum, h.ret_sebebi,
    h.onaylayan, to_char(h.onay_tarihi,'DD.MM.YYYY HH24:MI'),
    to_char(h.son_giris,'DD.MM.YYYY HH24:MI'),
    to_char(h.created_at,'DD.MM.YYYY HH:MI'),
    (select count(*) from public.cranes c
      where public.firma_normal(coalesce(public.jalan(to_jsonb(c),'customer_name','firma_adi'),''))
            like '%' || public.firma_normal(h.firma_adi) || '%'),
    (select count(*)::int from public.musteri_sohbet s
      where s.hesap_id = h.id and s.gonderen = 'musteri' and s.okundu = false),
    (select count(*)::int from public.teklif_pazarlik p
      where p.hesap_id = h.id and p.durum = 'bekliyor')
  from public.musteri_hesaplar h
  where (p_durum = 'hepsi' or h.durum = p_durum)
  order by
    (select count(*) from public.musteri_sohbet s
      where s.hesap_id = h.id and s.gonderen = 'musteri' and s.okundu = false) desc,
    h.created_at desc;
$$;

revoke all on function public.musteri_hesap_listesi(text) from public;
grant execute on function public.musteri_hesap_listesi(text) to authenticated;


-- ─── TEST ───
select firma_adi, durum, okunmamis, pazarlik
from public.musteri_hesap_listesi('hepsi') limit 10;

select count(*) as toplam_hesap from public.musteri_hesap_listesi('hepsi');
