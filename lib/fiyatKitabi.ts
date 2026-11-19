// ============================================================================
//  📚 FİYAT KİTABI — sunucu tarafı yardımcıları (öğrenen sistem, KDV HARİÇ)
// ----------------------------------------------------------------------------
//  Tablo: public.malzeme_fiyat_kitabi  (sql/209-malzeme-fiyat-kitabi.sql)
//  RPC  : public.malzeme_fiyat_kitabi(p_adlar text[])        → toplu arama
//         public.malzeme_fiyat_kitabi_yaz(ad, fiyat, ...)     → upsert
//
//  AKIŞ:
//    1) Arama başında kitaba bakılır → bulunan malzeme ANINDA ve ÜCRETSİZ gelir
//       (kaynak: 'kitap', yüksek güven) → web'e hiç çıkılmaz.
//    2) Web'den gerçek fiyat bulunursa kitaba yazılır (kaynak: 'web').
//    3) Kullanıcı "✔ Bu fiyatı kaydet" derse kitap ELLE düzeltilmiş olur
//       (kaynak: 'elle') → sonraki aramalarda bu fiyat gelir.
//
//  ⚠️ Tablo/RPC yoksa (209 çalıştırılmamış) hiçbir şey ÇÖKMEZ: boş sonuç döner,
//     fiyat motoru web aramasına devam eder.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { adAnahtar } from './malzemeFiyatWeb';

export type KitapKaynagi = 'kitap' | 'web' | 'elle';

export type KitapKaydi = {
  ad: string;
  ad_normal: string;
  /** KDV HARİÇ birim fiyat (TL) */
  birim_fiyat: number;
  kaynak: KitapKaynagi;
  kaynak_url: string | null;
  adet_birimi: string | null;
  guncelleme: string | null;
  kullanim_sayisi: number;
};

/** Kullanıcının jetonuyla (RLS: authenticated) Supabase istemcisi. */
function istemci(token?: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anahtar = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anahtar) return null;

  return createClient(url, anahtar, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  });
}

const sayi = (n: any): number => {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
};

/**
 * Malzemeleri fiyat kitabında toplar (tek RPC çağrısı).
 * Dönen Map anahtarı: `adAnahtar(malzeme adı)`.
 * Tablo yoksa / hata olursa boş Map döner (akış devam eder).
 */
export async function kitapAra(
  adlar: string[],
  token?: string | null
): Promise<Map<string, KitapKaydi>> {
  const cikti = new Map<string, KitapKaydi>();
  const temiz = Array.from(
    new Set((Array.isArray(adlar) ? adlar : []).map((a) => String(a || '').trim()).filter((a) => a.length > 1))
  ).slice(0, 40);

  if (temiz.length === 0) return cikti;

  const supabase = istemci(token);
  if (!supabase) return cikti;

  try {
    const { data, error } = await supabase.rpc('malzeme_fiyat_kitabi', { p_adlar: temiz });
    if (error) {
      // 209 çalıştırılmamış olabilir → sessizce devam (web araması yapılır)
      console.warn('[fiyat-kitabi] arama atlandı →', String(error.message || error).slice(0, 140));
      return cikti;
    }

    const liste: any[] = Array.isArray(data) ? data : [];
    for (const satir of liste) {
      const fiyat = sayi(satir?.birim_fiyat);
      if (fiyat <= 0) continue;
      const ad = String(satir?.ad || '').trim();
      const normal = String(satir?.ad_normal || '').trim() || adAnahtar(ad);
      if (!normal) continue;

      cikti.set(normal, {
        ad,
        ad_normal: normal,
        birim_fiyat: Math.round(fiyat * 100) / 100,
        kaynak: (['kitap', 'web', 'elle'].includes(String(satir?.kaynak))
          ? String(satir?.kaynak)
          : 'web') as KitapKaynagi,
        kaynak_url: satir?.kaynak_url ? String(satir.kaynak_url) : null,
        adet_birimi: satir?.adet_birimi ? String(satir.adet_birimi) : null,
        guncelleme: satir?.guncelleme ? String(satir.guncelleme) : null,
        kullanim_sayisi: Math.max(0, Math.round(sayi(satir?.kullanim_sayisi))),
      });
    }
  } catch (e: any) {
    console.warn('[fiyat-kitabi] arama hatası →', String(e?.message || e).slice(0, 140));
  }

  return cikti;
}

/** Tek malzemeyi kitaba yazar (upsert). Başarılıysa true. */
export async function kitapYaz(
  kayit: {
    ad: string;
    birim_fiyat: number;
    kaynak: KitapKaynagi;
    kaynak_url?: string | null;
    adet_birimi?: string | null;
  },
  token?: string | null
): Promise<{ ok: boolean; mesaj?: string }> {
  const ad = String(kayit?.ad || '').trim().slice(0, 160);
  const fiyat = Math.round(sayi(kayit?.birim_fiyat) * 100) / 100;
  if (ad.length < 2) return { ok: false, mesaj: 'Malzeme adı çok kısa.' };
  if (fiyat <= 0) return { ok: false, mesaj: 'Birim fiyat 0 olamaz.' };

  const supabase = istemci(token);
  if (!supabase) return { ok: false, mesaj: 'Veritabanı yapılandırması eksik.' };

  try {
    const { data, error } = await supabase.rpc('malzeme_fiyat_kitabi_yaz', {
      p_ad: ad,
      p_birim_fiyat: fiyat,
      p_kaynak: kayit.kaynak,
      p_kaynak_url: kayit.kaynak_url ? String(kayit.kaynak_url).slice(0, 500) : null,
      p_adet_birimi: kayit.adet_birimi ? String(kayit.adet_birimi).slice(0, 20) : 'adet',
    });

    if (error) {
      return { ok: false, mesaj: String(error.message || error).slice(0, 200) };
    }
    const ok = Boolean((data as any)?.ok);
    return { ok, mesaj: ok ? undefined : String((data as any)?.mesaj || 'Kaydedilemedi.') };
  } catch (e: any) {
    return { ok: false, mesaj: String(e?.message || e).slice(0, 200) };
  }
}
