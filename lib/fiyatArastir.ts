// ============================================================================
//  💰 MALZEME FİYAT MOTORU — ZİNCİR: FİYAT KİTABI → ÜCRETSİZ WEB → AI TAHMİNİ
// ----------------------------------------------------------------------------
//  Bu dosya /api/malzeme-fiyat ucunun İŞ MANTIĞIDIR (HTTP katmanı route'ta).
//  Bağımlılıklar DIŞARIDAN verilir (kitap okuma/yazma, AI tahmini) → izole test
//  edilebilir. Tek zorunlu iç bağımlılık: lib/malzemeFiyatWeb.ts (bağımsız).
//
//  SIRA VE GEREKÇE:
//    1) KİTAP  : aynı malzeme daha önce bulunduysa ANINDA ve ÜCRETSİZ gelir.
//                (kaynak: 'kitap', güven 92 — web'e hiç çıkılmaz)
//    2) WEB    : SearXNG · DuckDuckGo · Bing · n11 · Akakçe + ürün sayfası
//                JSON-LD. Medyan + %60 aykırı eleme + KDV dönüşümü. (kaynak: 'web')
//    3) AI     : yalnızca yukarıdakiler sonuç vermezse, model TAHMİNİ.
//                (kaynak: 'tahmini', güven ≤60 — kullanıcıya "güvenmeyin" denir)
//
//  ⚠️ TÜM TUTARLAR KDV HARİÇ. Bulunamayan satır 0 DEĞİL → birim_fiyat: null.
//  ⚠️ Satırlar 4'lü gruplar halinde PARALEL aranır; toplam süre bütçeyi aşmaz.
//  ⚠️ Dış kaynak/AI hatası akışı bozmaz (satır "fiyat bulunamadı" olur).
// ============================================================================

import { webFiyatArastir, adAnahtar, type WebArastirma, type WebKaynak } from './malzemeFiyatWeb';

// ─── TİPLER ─────────────────────────────────────────────────────────────────

export type FiyatKaynagi = 'kitap' | 'web' | 'tahmini';

export type KaynakOzeti = {
  site: string;
  baslik: string;
  url: string | null;
  /** KDV hariç fiyat */
  fiyat: number;
  kaynak_adi: string;
};

export type KitapSatiri = {
  birim_fiyat: number;
  kaynak: string;
  kaynak_url: string | null;
  guncelleme: string | null;
  kullanim_sayisi: number;
};

export type FiyatSatiri = {
  ad: string;
  adet: number;
  /** KDV hariç — bulunamadıysa null (0 DEĞİL) */
  birim_fiyat: number | null;
  toplam: number | null;
  kaynak: FiyatKaynagi | null;
  guven: number;
  bulundu: boolean;
  kaynak_notu: string | null;
  kaynak_url: string | null;
  /** ekrandaki "kaynaklar" açılır listesi */
  kaynaklar: KaynakOzeti[];
  min: number | null;
  maks: number | null;
  kaynak_sayisi: number;
  kdv_notu: string | null;
  kitap_kaydi: { kaynak: string; guncelleme: string | null; kullanim: number } | null;
};

export type ArastirmaSonucu = {
  satirlar: FiyatSatiri[];
  kitap: { aranan: number; bulunan: number; yazilan: number; hata: string | null };
  web: {
    aranan: number;
    bulunan: number;
    denenen: string[];
    cevap_veren: string[];
    sure_ms: number;
  };
  ai: {
    calisti: boolean;
    satir: number;
    saglayici: string | null;
    model: string | null;
    hata: string | null;
  };
  sure_ms: number;
  uyari: string | null;
};

export type AiTahminSatiri = {
  ad: string;
  birim_fiyat: number | null;
  guven: number;
  bulundu: boolean;
};

/** Dışarıdan verilen bağımlılıklar (route gerçeklerini, test sahtelerini verir). */
export type ArastirBagimliliklari = {
  /** fiyat kitabı toplu arama — anahtar: adAnahtar(ad) */
  kitapOku?: (adlar: string[]) => Promise<Map<string, KitapSatiri>>;
  /** fiyat kitabına yazma */
  kitapYaz?: (kayit: {
    ad: string;
    birim_fiyat: number;
    kaynak: 'web' | 'elle' | 'kitap';
    kaynak_url?: string | null;
  }) => Promise<{ ok: boolean; mesaj?: string }>;
  /** ücretsiz web araması (varsayılan: lib/malzemeFiyatWeb) */
  webAra?: (ad: string, secenek: { butceMs: number }) => Promise<WebArastirma>;
  /** AI tahmini (yalnızca son çare) */
  aiAra?: (girdi: {
    malzemeler: { ad: string; adet: number }[];
    is_tipi: string | null;
    musteri: string | null;
    butceMs: number;
  }) => Promise<{ satirlar: AiTahminSatiri[]; saglayici: string; model: string }>;
};

export type ArastirGirdi = {
  malzemeler: { ad: string; adet: number }[];
  is_tipi?: string | null;
  musteri?: string | null;
  /** toplam bütçe (ms) — varsayılan 30 sn */
  butceMs?: number;
};

// ─── SINIRLAR ───────────────────────────────────────────────────────────────

export const TOPLAM_BUTCE_MS = 30_000;
const MALZEME_BUTCE_MS = 18_000;
const GRUP_BOYUT = 4;
const AI_MIN_SURE_MS = 6_000;
/** Kitaba yazmak için gereken en düşük güven (çöp fiyat öğrenilmesin). */
const KITAP_GUVEN_ESIGI = 65;
export const MAKS_MALZEME = 24;

// ─── YARDIMCILAR ────────────────────────────────────────────────────────────

const sayi = (n: any): number => {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
};
const kurus = (n: number): number => Math.round(n * 100) / 100;

const bosSatir = (ad: string, adet: number): FiyatSatiri => ({
  ad,
  adet,
  birim_fiyat: null,
  toplam: null,
  kaynak: null,
  guven: 0,
  bulundu: false,
  kaynak_notu: null,
  kaynak_url: null,
  kaynaklar: [],
  min: null,
  maks: null,
  kaynak_sayisi: 0,
  kdv_notu: null,
  kitap_kaydi: null,
});

const kaynaklariOzetle = (liste: WebKaynak[]): KaynakOzeti[] =>
  (Array.isArray(liste) ? liste : []).slice(0, 3).map((k) => ({
    site: String(k.site || 'kaynak'),
    baslik: String(k.baslik || ''),
    url: k.url ? String(k.url) : null,
    fiyat: kurus(sayi(k.fiyat)),
    kaynak_adi: String(k.kaynak_adi || ''),
  }));

// ─── ANA GİRİŞ ──────────────────────────────────────────────────────────────

/**
 * Malzemeler için KDV hariç birim fiyatları bulur: kitap → web → AI tahmini.
 * Hiçbir aşama sonuç vermezse satır "fiyat bulunamadı" kalır (elle giriş).
 */
export async function malzemeFiyatlariniArastir(
  girdi: ArastirGirdi,
  bag: ArastirBagimliliklari = {}
): Promise<ArastirmaSonucu> {
  const baslangic = Date.now();
  const bitis = baslangic + Math.max(10_000, Math.min(sayi(girdi.butceMs) || TOPLAM_BUTCE_MS, TOPLAM_BUTCE_MS));
  const webAra = bag.webAra || ((ad: string, secenek: { butceMs: number }) => webFiyatArastir(ad, secenek));

  const malzemeler = (Array.isArray(girdi.malzemeler) ? girdi.malzemeler : [])
    .map((m) => ({
      ad: String(m?.ad || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      adet: Math.max(1, Math.min(999, Math.round(sayi(m?.adet) || 1))),
    }))
    .filter((m) => m.ad.length > 1)
    .slice(0, MAKS_MALZEME);

  const satirlar: FiyatSatiri[] = malzemeler.map((m) => bosSatir(m.ad, m.adet));
  const uyarilar: string[] = [];

  const kitapBilgi = { aranan: malzemeler.length, bulunan: 0, yazilan: 0, hata: null as string | null };
  const webBilgi = { aranan: 0, bulunan: 0, denenen: [] as string[], cevap_veren: [] as string[], sure_ms: 0 };
  const aiBilgi = {
    calisti: false,
    satir: 0,
    saglayici: null as string | null,
    model: null as string | null,
    hata: null as string | null,
  };

  // ─── 1) FİYAT KİTABI (anında, ücretsiz, doğru) ───
  if (bag.kitapOku) {
    try {
      const kitap = await bag.kitapOku(malzemeler.map((m) => m.ad));
      satirlar.forEach((satir) => {
        const kayit = kitap.get(adAnahtar(satir.ad));
        if (!kayit || !(sayi(kayit.birim_fiyat) > 0)) return;

        const birim = kurus(sayi(kayit.birim_fiyat));
        kitapBilgi.bulunan += 1;
        satir.birim_fiyat = birim;
        satir.toplam = kurus(birim * satir.adet);
        satir.kaynak = 'kitap';
        satir.guven = 92;
        satir.bulundu = true;
        satir.kaynak_notu = 'Fiyat kitabından geldi — KDV hariç (daha önce bulunup saklandı)';
        satir.kaynak_url = kayit.kaynak_url;
        satir.kdv_notu = 'Kitaptaki tutar KDV hariçtir (dönüşüm yapılmadı).';
        satir.kitap_kaydi = {
          kaynak: String(kayit.kaynak || 'web'),
          guncelleme: kayit.guncelleme,
          kullanim: Math.max(0, Math.round(sayi(kayit.kullanim_sayisi))),
        };
      });
    } catch (e: any) {
      kitapBilgi.hata = String(e?.message || e).slice(0, 160);
    }
  }

  // ─── 2) ÜCRETSİZ WEB ARAMASI (4'lü paralel gruplar) ───
  const webBekleyenler = satirlar.filter((s) => !s.bulundu);
  webBilgi.aranan = webBekleyenler.length;

  const yazilacaklar: { satir: FiyatSatiri; guven: number }[] = [];

  for (let i = 0; i < webBekleyenler.length; i += GRUP_BOYUT) {
    const grup = webBekleyenler.slice(i, i + GRUP_BOYUT);
    if (bitis - Date.now() < 4_000) break;

    const grupSonuc = await Promise.all(grup.map(async (satir) => {
      const kalan = bitis - Date.now();
      const butce = Math.max(6_000, Math.min(MALZEME_BUTCE_MS, kalan - 2_000));
      try {
        const web = await webAra(satir.ad, { butceMs: butce });
        return { satir, web };
      } catch (e: any) {
        return {
          satir,
          web: {
            ad: satir.ad,
            bulundu: false,
            birim_fiyat: null,
            min: null,
            maks: null,
            kaynak_sayisi: 0,
            kaynaklar: [] as WebKaynak[],
            guven: 0,
            kdv_notu: null,
            denenen: [] as string[],
            cevap_veren: [] as string[],
            uyari: `Web araması hatası: ${String(e?.message || e).slice(0, 100)}`,
            sure_ms: 0,
          } as WebArastirma,
        };
      }
    }));

    for (const { satir, web } of grupSonuc) {
      webBilgi.sure_ms = Math.max(webBilgi.sure_ms, sayi(web.sure_ms));
      for (const d of web.denenen || []) if (!webBilgi.denenen.includes(d)) webBilgi.denenen.push(d);
      for (const c of web.cevap_veren || []) if (!webBilgi.cevap_veren.includes(c)) webBilgi.cevap_veren.push(c);

      if (!web.bulundu || !(sayi(web.birim_fiyat) > 0)) continue;

      const birim = kurus(sayi(web.birim_fiyat));
      webBilgi.bulunan += 1;
      satir.birim_fiyat = birim;
      satir.toplam = kurus(birim * satir.adet);
      satir.kaynak = 'web';
      satir.guven = Math.max(0, Math.min(100, Math.round(sayi(web.guven) || 60)));
      satir.bulundu = true;
      satir.kaynaklar = kaynaklariOzetle(web.kaynaklar);
      satir.min = web.min === null ? null : kurus(sayi(web.min));
      satir.maks = web.maks === null ? null : kurus(sayi(web.maks));
      satir.kaynak_sayisi = sayi(web.kaynak_sayisi);
      satir.kdv_notu = web.kdv_notu ? String(web.kdv_notu) : null;
      satir.kaynak_url = satir.kaynaklar[0]?.url || null;
      satir.kaynak_notu = [
        `${satir.kaynak_sayisi} kaynaktan medyan (ücretsiz web araması)`,
        web.uyari ? String(web.uyari) : '',
      ].filter(Boolean).join(' · ');

      yazilacaklar.push({ satir, guven: satir.guven });
    }
  }

  if (webBilgi.aranan > 0 && webBilgi.bulunan === 0) {
    uyarilar.push('Ücretsiz kaynaklarda (SearXNG/DDG/Bing/n11/Akakçe) fiyat bulunamadı — kalan satırlar için AI tahmini denenecek.');
  }

  // ─── 3) AI TAHMİNİ — yalnızca SON ÇARE ───
  const tahminBekleyenler = satirlar.filter((s) => !s.bulundu);
  if (bag.aiAra && tahminBekleyenler.length > 0 && bitis - Date.now() > AI_MIN_SURE_MS) {
    try {
      const cevap = await bag.aiAra({
        malzemeler: tahminBekleyenler.map((s) => ({ ad: s.ad, adet: s.adet })),
        is_tipi: girdi.is_tipi ?? null,
        musteri: girdi.musteri ?? null,
        butceMs: Math.max(AI_MIN_SURE_MS, bitis - Date.now() - 1_000),
      });

      aiBilgi.calisti = true;
      aiBilgi.saglayici = cevap.saglayici || null;
      aiBilgi.model = cevap.model || null;

      for (const t of cevap.satirlar || []) {
        const satir = tahminBekleyenler.find((s) => adAnahtar(s.ad) === adAnahtar(t.ad));
        if (!satir || !t.bulundu || !(sayi(t.birim_fiyat) > 0)) continue;

        const birim = kurus(sayi(t.birim_fiyat));
        aiBilgi.satir += 1;
        satir.birim_fiyat = birim;
        satir.toplam = kurus(birim * satir.adet);
        satir.kaynak = 'tahmini';
        satir.guven = Math.min(60, Math.max(0, Math.round(sayi(t.guven) || 35)));
        satir.bulundu = true;
        satir.kaynak_notu = 'AI TAHMİNİ — gerçek kaynak YOK. Kullanmadan önce doğrulayın (KDV hariç).';
        satir.kdv_notu = 'AI tahmini: tutar KDV hariç olarak istenir, kaynak doğrulaması yoktur.';
      }

      if (aiBilgi.satir > 0) {
        uyarilar.push(`${aiBilgi.satir} satır TAHMİNİ fiyatla dolduruldu (gerçek kaynak yok) — kullanmadan önce doğrulayın.`);
      }
    } catch (e: any) {
      aiBilgi.hata = String(e?.message || e).slice(0, 200);
    }
  }

  // ─── 4) WEB'DEN BULUNAN FİYATLARI KİTABA YAZ (öğrenme) ───
  if (bag.kitapYaz) {
    const secilen = yazilacaklar.filter((w) => w.guven >= KITAP_GUVEN_ESIGI).slice(0, 12);
    await Promise.all(secilen.map(async (w) => {
      try {
        const sonuc = await bag.kitapYaz?.({
          ad: w.satir.ad,
          birim_fiyat: kurus(sayi(w.satir.birim_fiyat)),
          kaynak: 'web',
          kaynak_url: w.satir.kaynak_url,
        });
        if (sonuc?.ok) kitapBilgi.yazilan += 1;
      } catch { /* kitap yazılamazsa akış bozulmaz */ }
    }));
  }

  // ─── 5) ÖZET ───
  const bulunan = satirlar.filter((s) => s.bulundu).length;
  if (bulunan < satirlar.length) {
    uyarilar.push(`${satirlar.length - bulunan} malzeme için fiyat bulunamadı — elle girin.`);
  }

  return {
    satirlar,
    kitap: kitapBilgi,
    web: webBilgi,
    ai: aiBilgi,
    sure_ms: Date.now() - baslangic,
    uyari: uyarilar.length ? uyarilar.join(' ') : null,
  };
}
