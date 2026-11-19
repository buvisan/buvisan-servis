// ============================================================================
//  🌐 MALZEME FİYATI — ÜCRETSİZ WEB ARAŞTIRMASI (API anahtarı / ücretli servis YOK)
// ----------------------------------------------------------------------------
//  NEDEN BU DOSYA VAR?
//    Fiyat motoru malzeme fiyatını Gemini "Google Search grounding" ile arıyordu.
//    Grounding ücretsiz planda 429 (ücretli plan gerekli) döndüğü için fiyatlar
//    modelin TAHMİNİ oluyordu (ör. "100 gövde fren" → 3.750 ₺). Bu dosya fiyatı
//    gerçek, ücretsiz kaynaklardan bulur:
//
//      1) SearXNG (açık kaynak arama motoru, anahtar YOK) — Google/Bing/DDG
//         sonuçlarını birleştirir. Birden fazla örnek denenir, çalışan hatırlanır.
//      2) DuckDuckGo HTML + Lite (html.duckduckgo.com · lite.duckduckgo.com)
//      3) Bing HTML (www.bing.com/search) — son yedek
//      4) Türkçe pazaryeri arama (n11.com) — güncel perakende fiyatı
//      5) Sonuç SAYFALARININ kendisi (JSON-LD / itemprop="price" / og:price)
//         → arama özetinde fiyat yoksa ürün sayfasından gerçek fiyat çekilir
//
//    Engellenen siteler (403 / captcha / challenge / DNS) SESSİZCE atlanır;
//    hiçbir dış istek hatası ekranı çökertmez.
//
//  FİYAT AYRIŞTIRMA (Türkiye biçimi)
//    "3.750,00 TL" · "3750 TL" · "3.750 ₺" · "1.234,56₺" · "3750.00 TL" · "₺3.750"
//    Nokta = binlik, virgül = ondalık. EUR/USD/GBP gördüğümüz tutar ATILIR
//    (kur çevirisi yapılmaz — yanlış fiyat üretmemek için).
//
//  KDV KURALI (sistemdeki TÜM tutarlar KDV HARİÇ)
//    Perakende/pazaryeri fiyatı KDV DAHİLdir → 1,20'ye BÖLÜNÜR  ('perakende')
//    Sayfada "KDV hariç" yazan / toptan-site fiyatı → olduğu gibi alınır ('toptan')
//    Emin olamıyorsak perakende varsayılır ve ekranda not gösterilir.
//
//  AYKIRI DEĞER
//    Bulunan fiyatların MEDYANI alınır; medyandan %60'tan fazla sapanlar atılır.
//    En az 2 kaynak kalırsa min–maks aralığı da döner.
//
//  ⚠️ Bu dosya BAĞIMSIZDIR (hiçbir proje modülü import etmez) → izole test
//     edilebilir. Sunucu tarafında çalışır (app/api/malzeme-fiyat/route.ts).
// ============================================================================

// ─── TİPLER ─────────────────────────────────────────────────────────────────

/** 'perakende' → kaynaktaki fiyat KDV DAHİL (1,20'ye bölündü) · 'toptan' → KDV hariç */
export type FiyatTipi = 'perakende' | 'toptan';

export type WebKaynak = {
  /** ör. "hepsiburada.com" · "n11.com" · "motorreduktor.com.tr" */
  site: string;
  /** sonuç başlığı / ürün adı (kısaltılmış) */
  baslik: string;
  url: string | null;
  /** KDV HARİÇ birim fiyat (TL) */
  fiyat: number;
  /** kaynakta görülen ham tutar (KDV durumuna göre) */
  ham_fiyat: number;
  /** true → ham tutar KDV dahildi, 1,20'ye bölündü */
  kdv_dahil: boolean;
  tip: FiyatTipi;
  /** fiyatın bulunduğu yer: 'searxng' · 'duckduckgo' · 'bing' · 'n11' · 'json-ld' … */
  kaynak_adi: string;
  /** "perakende fiyatı KDV hariçe çevrildi" gibi kısa not */
  not: string | null;
  /** true → ölçü/model tam eşleşmedi (gevşek eşleşme, düşük güven) */
  gevsek?: boolean;
};

export type WebArastirma = {
  ad: string;
  bulundu: boolean;
  /** KDV hariç, aykırı değerler atıldıktan sonraki MEDYAN fiyat */
  birim_fiyat: number | null;
  /** en az 2 kaynak varsa aralık (KDV hariç) */
  min: number | null;
  maks: number | null;
  kaynak_sayisi: number;
  /** ekranda açılır listede gösterilecek 2-3 kaynak */
  kaynaklar: WebKaynak[];
  /** 0-100 güven: ürün sayfasından okunan + birden çok kaynak = yüksek */
  guven: number;
  kdv_notu: string | null;
  /** denenen kaynak adları (log/şeffaflık) */
  denenen: string[];
  /** gerçekten cevap veren kaynaklar */
  cevap_veren: string[];
  uyari: string | null;
  sure_ms: number;
};

export type AramaSecenekleri = {
  /** bu malzeme için ayrılacak toplam süre (ms) — varsayılan 20 sn */
  butceMs?: number;
  /** sonuç sayfalarından fiyat çekme (deep fetch) açık mı — varsayılan açık */
  sayfaGetir?: boolean;
};

// ─── SINIRLAR ───────────────────────────────────────────────────────────────

/** Tek kaynak isteği en fazla bu kadar bekler (istek: 12 sn/kaynak). */
const KAYNAK_SINIRI_MS = 12_000;
/** Sonuç sayfası indirme sınırı (12 sn/kaynak kuralının altında). */
const SAYFA_SINIRI_MS = 9_000;
/** HTML gövdesinden en fazla bu kadar bayt okunur (3 MB'lık sayfalar var). */
const MAKS_BAYT = 900_000;
/** Sonuç sayfasından fiyat çekmek için en fazla kaç sayfa açılır. */
const MAKS_SAYFA = 3;
/** Ekranda gösterilecek en fazla kaynak. */
const MAKS_KAYNAK = 3;
/** Güvenli fiyat aralığı (bunun dışı çöp veridir). */
const MIN_FIYAT = 1;
const MAKS_FIYAT = 5_000_000;
/** KDV oranı — tüm tutarlar KDV hariç tutulur. */
export const KDV_ORANI = 1.2;
/** Medyandan bu orandan fazla sapan fiyat atılır. */
const SAPMA_ORANI = 0.6;
/** Sonuç sayfası indirmenin anlamsız olduğu (engelleyen) alan adları. */
const SAYFA_ENGEL: string[] = ['trendyol.com', 'cimri.com', 'pttavm.com', 'sahibinden.com'];

const TARAYICI_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Açık kaynak SearXNG örnekleri — çalışan hatırlanır, ölü olan sessizce atlanır. */
const SEARX_INSTANCELERI = [
  'https://paulgo.io',
  'https://opnxng.com',
  'https://priv.au',
  'https://baresearch.org',
  'https://search.inetol.net',
  'https://searx.tiekoetter.com',
];

/**
 * Tüketici/hobi ürünü işaretleri.
 * "100 gövde fren" gibi SANAYİ malzemelerinde bisiklet/motosiklet parçaları
 * fiyat olarak kullanılmaz (yanlış fiyat üretmemek için). Sorgunun kendisinde
 * bu kelime geçiyorsa filtre uygulanmaz.
 */
const TUKETICI_ISARETLER = [
  'bisiklet', 'motosiklet', 'scooter', 'mobilet', 'kask', 'oyuncak', 'bebek',
  'mutfak', 'tencere', 'kahve', 'kolye', 'saat', 'kılıf', 'kilif', 'ayakkabı',
  'ayakkabi', 'giyim', 'tişört', 'tisort', 'parfüm', 'parfum', 'kitap', 'koltuk',
  'yatak', 'perde', 'halı', 'hali', 'çanta', 'canta', 'kulaklık', 'kulaklik',
  'hoparlör', 'hoparlor', 'konsol', 'oyun', 'bebek', 'cüzdan', 'cuzdan',
  'tıraş', 'tiras', 'makyaj', 'şampuan', 'sampuan', 'evcil', 'kedi', 'köpek',
];

/** Pazaryeri/perakende siteler — fiyatları KDV DAHİL yayınlarlar. */
const PERAKENDE_SITELER: string[] = [
  'n11.com', 'hepsiburada', 'trendyol.com', 'amazon.com.tr', 'amazon.',
  'cimri.com', 'akakce.com', 'pttavm.com', 'gittigidiyor.com', 'idefix.com',
  'mediamarkt', 'teknosa.com', 'vatanbilgisayar.com', 'koctas.com.tr',
  'bauhaus.com.tr', 'boyner.com.tr', 'morhipo.com', 'ciceksepeti.com',
  'migros.com.tr', 'carrefoursa.com', 'a101.com.tr', 'sokmarket.com.tr',
  'decathlon.com.tr', 'arcelik.com.tr', 'beko.com.tr', 'arcelik',
];

/** Endüstriyel / toptan (B2B) alan adları — fiyatlar genelde KDV HARİÇtir. */
const TOPTAN_ISARETLER = [
  'sanayi', 'endustri', 'makine', 'makina', 'reduktor', 'otomasyon',
  'hirdavat', 'teknik', 'muhendislik', 'tedarik', 'toptan', 'imalat',
  'dokum', 'celik', 'elektrikmalzeme', 'kablo', 'market',
];

/** Arama sonuçlarında atılan (reklam) işaretleri. */
const REKLAM_ISARET = /sponsored|reklam|gclid=|yclid|utm_source=ad/i;
/** DDG / SearXNG bot koruması metinleri (⛔ "substation" YAZILMAZ: SearXNG tema adı). */
const BOT_KORUMA = /bots use DuckDuckGo|complete the following challenge|just a moment|security check|bot olmad|verify you are human|çok fazla istek|too many requests/i;

// ─── METİN YARDIMCILARI ─────────────────────────────────────────────────────

/** Türkçe harfleri ASCII'ye indirger (arama/eşleştirme için). */
const trAscii = (s: string): string =>
  String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
    .replace(/i̇/g, 'i');

/** Veritabanı anahtarı: sadece [a-z0-9] (fiyat kitabı `ad_normal` ile aynı). */
export function adAnahtar(s: any): string {
  return trAscii(String(s || '')).replace(/[^a-z0-9]/g, '');
}

/** Metni boşluksuz havuzda aranabilir hale getirir ("8 mm" = "8mm"). */
const metinHavuzu = (s: string): string => adAnahtar(s);

/** Arama için anlamlı kelimeler (Türkçe dolgu kelimeler atılır). */
const DOLGU = new Set([
  'fiyat', 'fiyati', 'fiyatlar', 'fiyatlari', 'kac', 'satin', 'al',
  'tl', 'kdv', 'haric', 'dahil', 'adet', 'icin', 've', 'ile',
  'bir', 'bu', 'en', 'ucuz', 'ucuzu', 'orjinal', 'orijinal', 'urun',
  'model', 'marka', 'sifir', 'stok', 'kargo', 'bedava', 'kampanya',
]);

function tokenler(s: string): string[] {
  const ham = trAscii(String(s || '')).split(/[^a-z0-9]+/).filter(Boolean);
  const anlamli = ham.filter((t) => t.length >= 2 && !DOLGU.has(t));
  return Array.from(new Set(anlamli.length ? anlamli : ham));
}

/** HTML → düz metin (entity çözümü dahil). */
function htmlCoz(ham: string): string {
  return String(ham || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_t, h) => {
      const kod = parseInt(String(h), 16);
      return Number.isFinite(kod) ? String.fromCharCode(kod) : ' ';
    })
    .replace(/&#(\d+);/g, (_t, d) => {
      const kod = parseInt(String(d), 10);
      return Number.isFinite(kod) ? String.fromCharCode(kod) : ' ';
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const kisalt = (s: string, n = 110): string => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const siteAdi = (url: string | null): string => {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
};

// ─── FİYAT AYRIŞTIRMA (TÜRKİYE BİÇİMİ) ──────────────────────────────────────

/**
 * Türkçe sayı biçimini çözer: nokta binlik, virgül ondalık.
 *  "3.750" → 3750 · "3.750,00" → 3750 · "3750.00" → 3750 · "12 500,75" → 12500.75
 */
export function sayiCoz(ham: string): number | null {
  const s = String(ham || '').replace(/[\s\u00a0]/g, '');
  if (!s) return null;

  const nokta = (s.match(/\./g) || []).length;
  const virgul = (s.match(/,/g) || []).length;

  let sayi: number;
  if (nokta > 0 && virgul > 0) {
    // Son görülen ayırıcı ondalıktır
    sayi = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? Number(s.replace(/\./g, '').replace(/,/g, '.'))
      : Number(s.replace(/,/g, ''));
  } else if (virgul > 0) {
    const parcalar = s.split(',');
    if (parcalar.length > 2) {
      const ondalik = parcalar.pop() as string;
      sayi = Number(parcalar.join('') + '.' + ondalik);
    } else {
      const ondalik = parcalar[1] || '';
      // Para ondalığı 1-2 hanedir; 3 hane → binlik ayırıcı kabul edilir
      sayi = ondalik.length === 3 ? Number(parcalar[0] + ondalik) : Number(parcalar[0] + '.' + ondalik);
    }
  } else if (nokta > 0) {
    const parcalar = s.split('.');
    if (parcalar.length > 2) {
      sayi = Number(parcalar.join(''));
    } else {
      const ondalik = parcalar[1] || '';
      sayi = ondalik.length === 3 ? Number(parcalar[0] + ondalik) : Number(parcalar[0] + '.' + ondalik);
    }
  } else {
    sayi = Number(s);
  }

  return Number.isFinite(sayi) ? sayi : null;
}

/** Tutarın yanında yabancı para birimi var mı? (varsa fiyat KULLANILMAZ) */
const yabanciPara = (metin: string, bas: number, son: number): boolean => {
  const pencere = metin.slice(Math.max(0, bas - 14), Math.min(metin.length, son + 14));
  return /(?:€|\$|£|¥|\bEUR\b|\bUSD\b|\bGBP\b|\bAVRO\b|\bDOLAR\b|\bEURO\b)/i.test(pencere);
};

// "3.750,00 TL" · "3750 TL" · "3.750 ₺" · "1.234,56₺" · "3750.00 TL"
const SONEK_RE = /((?:\d{1,3}(?:[.\s\u00a0]\d{3})+|\d+)(?:[.,]\d{1,2})?)\s*(?:₺|TL|TRY|Tl|tl)(?![a-zçğıöşü])/g;
// "₺3.750" · "TL 3.750" · "TRY 1.234,56"
const ONEK_RE = /(?:₺|TL|TRY)\s*[:.]?\s*((?:\d{1,3}(?:[.\s\u00a0]\d{3})+|\d+)(?:[.,]\d{1,2})?)/g;

/**
 * Metindeki TÜM TL tutarlarını çıkarır (yabancı para birimliler atılır).
 * Dönen değerler ham tutarlardır (KDV dönüşümü YAPILMAZ).
 */
export function fiyatlarAyristir(metin: string): number[] {
  const m = String(metin || '');
  const sonuc: number[] = [];

  const topla = (re: RegExp) => {
    re.lastIndex = 0;
    let eslesme: RegExpExecArray | null;
    while ((eslesme = re.exec(m)) !== null) {
      const tutar = sayiCoz(eslesme[1]);
      if (tutar === null) continue;
      if (yabanciPara(m, eslesme.index, eslesme.index + eslesme[0].length)) continue;
      sonuc.push(tutar);
    }
  };

  topla(SONEK_RE);
  topla(ONEK_RE);
  return sonuc;
}

/** Metindeki ilk geçerli TL tutarı (yoksa null). */
export function fiyatAyristir(metin: string): number | null {
  const liste = fiyatlarAyristir(metin).filter((f) => f >= MIN_FIYAT && f <= MAKS_FIYAT);
  return liste.length ? liste[0] : null;
}

const gecerliFiyat = (f: number | null): f is number =>
  f !== null && Number.isFinite(f) && f >= MIN_FIYAT && f <= MAKS_FIYAT;

/** KDV hariçe çevirir: perakende → 1,20'ye böler, toptan → olduğu gibi. */
export function kdvHaricYap(fiyat: number, tip: FiyatTipi): number {
  const v = tip === 'perakende' ? fiyat / KDV_ORANI : fiyat;
  return Math.round(v * 100) / 100;
}

export function medyan(degerler: number[]): number {
  if (!degerler.length) return 0;
  const sirali = [...degerler].sort((a, b) => a - b);
  const orta = Math.floor(sirali.length / 2);
  return sirali.length % 2 ? sirali[orta] : (sirali[orta - 1] + sirali[orta]) / 2;
}

/** Medyandan %60'tan fazla sapan fiyatları çıkarır. */
export function aykiriTemizle(fiyatlar: number[]): number[] {
  if (fiyatlar.length < 3) return [...fiyatlar];
  const med = medyan(fiyatlar);
  if (med <= 0) return [...fiyatlar];
  const kalan = fiyatlar.filter((f) => Math.abs(f - med) / med <= SAPMA_ORANI);
  return kalan.length >= 2 ? kalan : [...fiyatlar];
}

// ─── SİTE TİPİ (KDV VARSAYIMI) ──────────────────────────────────────────────

/**
 * Fiyatın KDV dahil mi hariç mi olduğunu tahmin eder.
 * Öncelik: sayfadaki açık ifade → bilinen pazaryeri listesi → B2B ipuçları → perakende.
 */
export function siteTipi(site: string, sayfaMetni?: string | null): FiyatTipi {
  const s = trAscii(String(site || ''));
  const metin = trAscii(String(sayfaMetni || '')).slice(0, 200_000);

  const haric = /kdv\s*haric|\+\s*kdv|kdv\s*musterek/.test(metin);
  const dahil = /kdv\s*dahil/.test(metin);

  // İkisi birlikte yazılıysa (perakende listesi + KDV hariç satır) → perakende kabul et
  if (haric && !dahil) return 'toptan';
  if (dahil) return 'perakende';

  if (PERAKENDE_SITELER.some((p) => s.includes(trAscii(p)))) return 'perakende';
  if (TOPTAN_ISARETLER.some((p) => s.includes(trAscii(p)))) return 'toptan';

  // Bilinmeyen site → perakende varsay (KDV dahil kabul edilip bölünür).
  return 'perakende';
}

// ─── HTTP ───────────────────────────────────────────────────────────────────

type GetirSonuc = { durum: number; metin: string; hata: string | null };

/** HTML'i indirir; gövde en fazla MAKS_BAYT bayt okunur (dev sayfalar için). */
async function htmlGetir(url: string, sureMs: number): Promise<GetirSonuc> {
  let yanit: Response;
  try {
    yanit = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': TARAYICI_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.7',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(Math.max(2_000, sureMs)),
    });
  } catch (e: any) {
    const ad = String(e?.name || '');
    return {
      durum: 0,
      metin: '',
      hata: ad === 'TimeoutError' || ad === 'AbortError'
        ? 'zaman aşımı'
        : String(e?.message || e).slice(0, 120),
    };
  }

  if (!yanit.ok) return { durum: yanit.status, metin: '', hata: `HTTP ${yanit.status}` };

  const govde = yanit.body;
  if (!govde) {
    const metin = (await yanit.text()).slice(0, MAKS_BAYT);
    return { durum: yanit.status, metin, hata: null };
  }

  const okuyucu = govde.getReader();
  const cozucu = new TextDecoder('utf-8');
  let metin = '';
  let bayt = 0;
  try {
    while (bayt < MAKS_BAYT) {
      const { done, value } = await okuyucu.read();
      if (done) break;
      if (value) {
        bayt += value.length;
        metin += cozucu.decode(value, { stream: true });
      }
    }
  } catch {
    /* akış kesildi → eldeki metinle devam */
  } finally {
    try { await okuyucu.cancel(); } catch { /* yoksay */ }
  }

  return { durum: yanit.status, metin, hata: null };
}

// ─── ARAMA MOTORLARI ────────────────────────────────────────────────────────

export type AramaSonucu = {
  site: string;
  baslik: string;
  ozet: string;
  url: string | null;
  motor: string;
};

const sorgu = (s: string): string => encodeURIComponent(s);

/** DDG yönlendirme bağlantısını çözer (`uddg=<encoded>`). */
function ddgUrlCoz(ham: string): string | null {
  if (!ham) return null;
  let url = String(ham).replace(/&amp;/g, '&');
  const uddg = url.match(/[?&]uddg=([^&"]+)/);
  if (uddg) {
    try { url = decodeURIComponent(uddg[1]); } catch { /* ham bırak */ }
  }
  if (url.startsWith('//')) url = 'https:' + url;
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

/** Bing yönlendirme bağlantısını çözer (`u=a1<base64url>`). */
function bingUrlCoz(ham: string): string | null {
  const temiz = String(ham || '').replace(/&amp;/g, '&');
  if (/^https?:\/\//i.test(temiz) && !/bing\.com\/ck\//i.test(temiz)) return temiz;
  const u = temiz.match(/[?&]u=a1([^&"]+)/);
  if (u) {
    try {
      const b64 = u[1].replace(/-/g, '+').replace(/_/g, '/');
      const cozulen = Buffer.from(b64, 'base64').toString('utf-8');
      if (/^https?:\/\//i.test(cozulen)) return cozulen;
    } catch { /* yoksay */ }
  }
  return null;
}

/** SearXNG sonuç sayfasını ayrıştırır (`<article class="result">`). */
export function searxSonuclari(html: string): AramaSonucu[] {
  const sonuclar: AramaSonucu[] = [];
  const bloklar = String(html || '').split(/<article[^>]*class="result/i).slice(1);

  for (const blok of bloklar) {
    const kirpik = blok.slice(0, 4_000);
    if (REKLAM_ISARET.test(kirpik.slice(0, 600))) continue;

    const bas = kirpik.match(/<h3[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!bas) continue;
    const url = bas[1].replace(/&amp;/g, '&');
    if (!/^https?:\/\//i.test(url)) continue;

    const oz = kirpik.match(/<p[^>]*class="content"[^>]*>([\s\S]*?)<\/p>/i);
    sonuclar.push({
      site: siteAdi(url),
      baslik: htmlCoz(bas[2]),
      ozet: oz ? htmlCoz(oz[1]) : '',
      url,
      motor: 'searxng',
    });
  }

  return sonuclar;
}

/** html.duckduckgo.com sonuç sayfasını ayrıştırır. */
export function ddgSonuclari(html: string): AramaSonucu[] {
  const sonuclar: AramaSonucu[] = [];
  const bloklar = String(html || '').split(/class="result\s+results_links/i).slice(1);

  for (const blok of bloklar) {
    const kirpik = blok.slice(0, 4_000);
    if (REKLAM_ISARET.test(kirpik.slice(0, 1_200))) continue;

    const bas = kirpik.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!bas) continue;
    const url = ddgUrlCoz(bas[1]);
    const baslik = htmlCoz(bas[2]);
    if (!baslik) continue;

    const oz = kirpik.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
    sonuclar.push({
      site: siteAdi(url),
      baslik,
      ozet: oz ? htmlCoz(oz[1]) : '',
      url,
      motor: 'duckduckgo',
    });
  }

  return sonuclar;
}

/** lite.duckduckgo.com sonuç sayfasını ayrıştırır. */
export function ddgLiteSonuclari(html: string): AramaSonucu[] {
  const sonuclar: AramaSonucu[] = [];
  const metin = String(html || '');
  const baglantilar: { url: string | null; baslik: string; indeks: number }[] = [];

  const re = /<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(metin)) !== null) {
    baglantilar.push({ url: ddgUrlCoz(m[1]), baslik: htmlCoz(m[2]), indeks: m.index });
  }

  const ozetRe = /class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;
  const ozetler: { metin: string; indeks: number }[] = [];
  while ((m = ozetRe.exec(metin)) !== null) {
    ozetler.push({ metin: htmlCoz(m[1]), indeks: m.index });
  }

  for (const b of baglantilar) {
    const ozet = ozetler.find((o) => o.indeks > b.indeks);
    sonuclar.push({
      site: siteAdi(b.url),
      baslik: b.baslik,
      ozet: ozet ? ozet.metin : '',
      url: b.url,
      motor: 'duckduckgo-lite',
    });
  }

  return sonuclar;
}

/** www.bing.com sonuç sayfasını ayrıştırır (son yedek motor). */
export function bingSonuclari(html: string): AramaSonucu[] {
  const sonuclar: AramaSonucu[] = [];
  const bloklar = String(html || '').split(/<li class="b_algo"/i).slice(1);

  for (const blok of bloklar) {
    const kirpik = blok.slice(0, 12_000);
    const bas = kirpik.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!bas) continue;
    const url = bingUrlCoz(bas[1]);
    if (!url) continue;

    const oz = kirpik.match(/<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
      || kirpik.match(/<p[^>]*>([\s\S]*?)<\/p>/i);

    sonuclar.push({
      site: siteAdi(url),
      baslik: htmlCoz(bas[2]),
      ozet: oz ? htmlCoz(oz[1]) : '',
      url,
      motor: 'bing',
    });
  }

  return sonuclar;
}

type MotorCevap = { ad: string; sonuclar: AramaSonucu[]; hata: string | null };

/** Çalışan SearXNG örneği (ilk başarılı istekten sonra hatırlanır). */
let iyiSearx: string | null = null;
/** Tüm örnekler başarısız olduysa bu zaman damgasına kadar yeniden denenmez. */
let searxSonHata = 0;
const SEARX_BEKLEME_MS = 10 * 60_000;

/** Tek bir SearXNG örneğinden arama. */
async function searxTek(instance: string, q: string, sureMs: number): Promise<MotorCevap> {
  // ⚠️ "language=" parametresi bazı örneklerde aramayı düşürüp ana sayfaya atıyor
  const cevap = await htmlGetir(`${instance}/search?q=${sorgu(q)}`, sureMs);
  if (cevap.durum !== 200 || !cevap.metin) {
    return { ad: 'searxng', sonuclar: [], hata: `${instance}: ${cevap.hata || 'HTTP ' + cevap.durum}` };
  }
  if (BOT_KORUMA.test(cevap.metin.slice(0, 3_000))) {
    return { ad: 'searxng', sonuclar: [], hata: `${instance}: bot koruması` };
  }
  const sonuclar = searxSonuclari(cevap.metin);
  return { ad: 'searxng', sonuclar, hata: sonuclar.length ? null : `${instance}: sonuç yok` };
}

/**
 * SearXNG araması: bilinen iyi örnek varsa onu dener, olmazsa örnekleri
 * ikişer ikişer dener (ilk cevap veren kazanır). Hepsi ölüyse boş döner.
 */
async function searxAra(q: string, bitis: number): Promise<MotorCevap> {
  const sure = () => Math.min(KAYNAK_SINIRI_MS, Math.max(3_000, bitis - Date.now()));

  // Tüm örnekler yakın zamanda öldüyse her istekte yeniden denemeyiz (süre kaybı)
  if (!iyiSearx && Date.now() - searxSonHata < SEARX_BEKLEME_MS) {
    return { ad: 'searxng', sonuclar: [], hata: 'SearXNG örnekleri şu an cevapsız (beklemede)' };
  }

  if (iyiSearx) {
    const cevap = await searxTek(iyiSearx, q, sure());
    if (cevap.sonuclar.length) return cevap;
    iyiSearx = null;
  }

  const adaylar = SEARX_INSTANCELERI.slice();
  for (let i = 0; i < adaylar.length; i += 2) {
    if (bitis - Date.now() < 4_000) break;
    const grup = adaylar.slice(i, i + 2);
    const cevaplar = await Promise.all(grup.map((u) => searxTek(u, q, sure())));
    const basarili = cevaplar.find((c) => c.sonuclar.length > 0);
    if (basarili) {
      iyiSearx = grup[cevaplar.indexOf(basarili)] || null;
      return basarili;
    }
  }

  searxSonHata = Date.now();
  return { ad: 'searxng', sonuclar: [], hata: 'SearXNG örnekleri cevap vermedi' };
}

/** DDG (html veya lite) araması — bot koruması görülürse sessizce boş döner. */
async function ddgAra(tur: 'duckduckgo' | 'duckduckgo-lite', q: string, sureMs: number): Promise<MotorCevap> {
  const adres = tur === 'duckduckgo'
    ? `https://html.duckduckgo.com/html/?q=${sorgu(q)}`
    : `https://lite.duckduckgo.com/lite/?q=${sorgu(q)}`;

  const cevap = await htmlGetir(adres, sureMs);
  if (cevap.durum !== 200 || !cevap.metin) {
    return { ad: tur, sonuclar: [], hata: cevap.hata || `HTTP ${cevap.durum}` };
  }
  if (BOT_KORUMA.test(cevap.metin.slice(0, 3_000))) {
    return { ad: tur, sonuclar: [], hata: 'bot koruması (challenge)' };
  }

  const sonuclar = tur === 'duckduckgo' ? ddgSonuclari(cevap.metin) : ddgLiteSonuclari(cevap.metin);
  return { ad: tur, sonuclar, hata: sonuclar.length ? null : 'sonuç yok' };
}

/** Bing araması (son yedek). */
async function bingAra(q: string, sureMs: number): Promise<MotorCevap> {
  const cevap = await htmlGetir(`https://www.bing.com/search?q=${sorgu(q)}&setlang=tr&cc=TR`, sureMs);
  if (cevap.durum !== 200 || !cevap.metin) {
    return { ad: 'bing', sonuclar: [], hata: cevap.hata || `HTTP ${cevap.durum}` };
  }
  const sonuclar = bingSonuclari(cevap.metin);
  return { ad: 'bing', sonuclar, hata: sonuclar.length ? null : 'sonuç yok' };
}

// ─── PAZARYERİ DOĞRUDAN ARAMA ───────────────────────────────────────────────

/** n11 arama sayfası: ürün kartı (başlık + güncel fiyat) çiftlerini çıkarır. */
export function n11Sonuclari(html: string): AramaSonucu[] {
  const sonuclar: AramaSonucu[] = [];
  // ⚠️ Sadece tam "product-item" sınıfı ve kart başlangıcı (<a ... product-item>)
  //    baz alınır. "product-item-title" gibi alt sınıflardan bölünürse başlık ile
  //    fiyat farklı kartlardan gelir → YANLIŞ FİYAT gösterir.
  const bloklar = String(html || '').split(/(?=<a\s[^>]*class="product-item"[\s>])/i).slice(1);

  for (const blok of bloklar) {
    // Kart ~20 KB olabiliyor (görsel/kargo/açıklama). Kısa kesilirse fiyat
    // BİR SONRAKİ karttan gelir → yanlış fiyat. Bol pay bırakılır.
    const kirpik = blok.slice(0, 40_000);
    const bas = kirpik.match(/class="product-item-title[^"]*"[^>]*>([\s\S]*?)<\/h[23]>/i)
      || kirpik.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if (!bas || bas.index === undefined) continue;

    // Fiyat, başlıktan SONRA gelen ilk price-currency'dir
    const fiyat = kirpik.slice(bas.index).match(/class="price-currency"[^>]*>([\s\S]*?)<\/h3>/i);
    if (!fiyat) continue;

    const blokUrl = kirpik.match(/href="(\/urun\/[^"]+)"/i);
    const tutar = fiyatAyristir(htmlCoz(fiyat[1]));
    if (!gecerliFiyat(tutar)) continue;

    sonuclar.push({
      site: 'n11.com',
      baslik: htmlCoz(bas[1]),
      // Özet alanına fiyatı yazıyoruz: aynı ayrıştırıcı özetten de okuyabilir
      ozet: `${tutar} TL`,
      url: blokUrl ? `https://www.n11.com${blokUrl[1]}` : 'https://www.n11.com',
      motor: 'n11',
    });
  }

  return sonuclar;
}

/**
 * Akakçe arama sayfası (fiyat karşılaştırma): "ÜRÜN ADI En Ucuz 1.234,56 TL".
 * Fiyatlar JS içine kaçışlı (escaped) HTML olarak gömülü → önce entity çözülür.
 */
export function akakceSonuclari(html: string): AramaSonucu[] {
  const sonuclar: AramaSonucu[] = [];
  const cozulen = String(html || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;|\\&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\\n/g, ' ');

  const parcalar = cozulen.split(/En Ucuz/i);
  for (let i = 1; i < parcalar.length; i++) {
    const onceki = parcalar[i - 1];
    const sonraki = parcalar[i].slice(0, 400);

    const fiyatMetni = sonraki.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const fiyatEslesme = fiyatMetni.match(/^\s*([\d][\d.,\s]{0,14}?)\s*TL/i);
    if (!fiyatEslesme) continue;

    // "1.395 ,00" → "1.395,00" (etiketler araya girmiş olabilir)
    const ham = fiyatEslesme[1].replace(/\s+([.,])/g, '$1').trim();
    const tutar = sayiCoz(ham);
    if (!gecerliFiyat(tutar)) continue;

    const kirpik = onceki.slice(-700);
    const linkler = [...kirpik.matchAll(/href="([^"]+)"/g)];
    const link = linkler.length ? linkler[linkler.length - 1][1] : '';
    const url = /^https?:\/\//i.test(link)
      ? link
      : (/^\//.test(link) ? `https://www.akakce.com${link}` : null);

    const duz = kirpik.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    // Etiket kalıntılarını temizle: bazen attribute içindeki ">" yüzünden
    // başlıkta `" data-g="1"> Ürün adı` gibi artıklar kalabiliyor.
    const baslik = (duz.split(/F[İI]YAT/i).pop() || duz)
      .replace(/^[\s\S]*?">\s*/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(-110);
    if (!baslik) continue;

    sonuclar.push({
      site: 'akakce.com',
      baslik,
      ozet: `${tutar} TL`,
      url,
      motor: 'akakce',
    });
  }

  return sonuclar;
}

/**
 * Doğrudan pazaryeri aramaları.
 * ⚠️ Engellenen siteler (403 / challenge / DNS) SESSİZCE atlanır — ekrana hata gitmez.
 *    Buraya yeni site eklemek için: url + ayristirici yaz, yoksa boş liste döndür.
 */
const PAZARYERLERI: { ad: string; url: (q: string) => string; ayristir: (html: string) => AramaSonucu[] }[] = [
  { ad: 'n11', url: (q) => `https://www.n11.com/arama?q=${sorgu(q)}`, ayristir: n11Sonuclari },
  { ad: 'akakce', url: (q) => `https://www.akakce.com/arama/?q=${sorgu(q)}`, ayristir: akakceSonuclari },
];

async function pazaryeriAra(q: string, sureMs: number): Promise<MotorCevap> {
  const cevaplar = await Promise.all(PAZARYERLERI.map(async (p) => {
    const cevap = await htmlGetir(p.url(q), sureMs);
    if (cevap.durum !== 200 || !cevap.metin) {
      return { ad: p.ad, sonuclar: [] as AramaSonucu[], hata: `${p.ad}: ${cevap.hata || 'HTTP ' + cevap.durum}` };
    }
    const sonuclar = p.ayristir(cevap.metin);
    return { ad: p.ad, sonuclar, hata: sonuclar.length ? null : `${p.ad}: fiyat yok` };
  }));

  const birlesik = cevaplar.flatMap((c) => c.sonuclar);
  const hatalar = cevaplar.filter((c) => !c.sonuclar.length).map((c) => c.hata || 'cevap yok');
  return {
    ad: 'pazaryeri',
    sonuclar: birlesik,
    hata: birlesik.length ? null : hatalar.join(', '),
  };
}

// ─── SONUÇ SAYFASINDAN FİYAT ÇEKME ──────────────────────────────────────────

/** JSON içinden ilk geçerli TL fiyatını bulur (Product/Offer). */
function jsonFiyat(deger: any, derinlik = 0): number | null {
  if (!deger || derinlik > 6) return null;

  if (Array.isArray(deger)) {
    for (const x of deger) {
      const f = jsonFiyat(x, derinlik + 1);
      if (f !== null) return f;
    }
    return null;
  }

  if (typeof deger === 'object') {
    const para = String((deger as any).priceCurrency || (deger as any).currency || '').toUpperCase();
    if (para && !/TRY|TL|YTL/.test(para)) return null;

    const adaylar = [
      (deger as any).price,
      (deger as any).lowPrice,
      (deger as any).salePrice,
      (deger as any).priceValue,
      (deger as any).offers?.price,
      (deger as any).offers?.lowPrice,
    ];
    for (const aday of adaylar) {
      if (typeof aday === 'number' && gecerliFiyat(aday)) return Math.round(aday * 100) / 100;
      if (typeof aday === 'string' && aday.trim()) {
        const s = sayiCoz(aday.trim());
        if (gecerliFiyat(s)) return Math.round((s as number) * 100) / 100;
      }
    }

    for (const anahtar of Object.keys(deger)) {
      const alt = (deger as any)[anahtar];
      if (alt && typeof alt === 'object') {
        const f = jsonFiyat(alt, derinlik + 1);
        if (f !== null) return f;
      }
    }
  }

  return null;
}

/** Ürün sayfasındaki fiyatı çıkarır (JSON-LD → itemprop → og → .price sınıfı). */
export function sayfaFiyati(html: string): { fiyat: number; kaynak: string } | null {
  const metin = String(html || '');

  // 1) JSON-LD
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = ldRe.exec(metin)) !== null) {
    const ham = m[1].trim();
    try {
      const json = JSON.parse(ham);
      const fiyat = jsonFiyat(json);
      if (gecerliFiyat(fiyat)) return { fiyat: fiyat as number, kaynak: 'json-ld' };
    } catch {
      /* bozuk JSON-LD → devam */
    }
  }

  // 2) itemprop="price"
  const item = metin.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)
    || metin.match(/content=["']([^"']+)["'][^>]*itemprop=["']price["']/i);
  if (item) {
    const f = sayiCoz(item[1]);
    if (gecerliFiyat(f)) return { fiyat: Math.round((f as number) * 100) / 100, kaynak: 'itemprop' };
  }

  // 3) og:price:amount / product:price:amount
  const og = metin.match(/(?:property|name)=["'](?:product|og):price:amount["'][^>]*content=["']([^"']+)["']/i)
    || metin.match(/content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:product|og):price:amount["']/i);
  if (og) {
    const f = sayiCoz(og[1]);
    if (gecerliFiyat(f)) return { fiyat: Math.round((f as number) * 100) / 100, kaynak: 'og:price' };
  }

  // 4) class'ında "price" geçen ilk blok (çok genel bir kural — son çare)
  const sinifRe = /<(?:span|div|strong|b|p)[^>]*class=["'][^"']*price[^"']*["'][^>]*>([\s\S]{0,120}?)<\//gi;
  while ((m = sinifRe.exec(metin)) !== null) {
    const f = fiyatAyristir(htmlCoz(m[1]));
    if (gecerliFiyat(f)) return { fiyat: Math.round((f as number) * 100) / 100, kaynak: 'fiyat-sinifi' };
  }

  return null;
}

// ─── TOPLAMA / PUANLAMA ─────────────────────────────────────────────────────

/** Sonuç, istenen malzemeyle ilgili mi? (ölçü/model tutmalı + kelimelerin çoğu) */
const ilgiliMi = (metin: string, istenen: string[]): boolean => {
  if (!istenen.length) return true;
  const havuz = metinHavuzu(metin);
  if (!havuz) return false;

  // Kelime listesi: sayı/ölçü eşleşmesi TAM kelime olmalı
  //  "100 gövde fren" → "H100" / "994.100" sonuçları ELENİR (yanlış fiyat üretmesin)
  const kelimeler = trAscii(String(metin || '')).split(/[^a-z0-9]+/).filter(Boolean);
  const kelimeKumesi = new Set(kelimeler);
  const ikiliKume = new Set<string>();
  for (let i = 0; i < kelimeler.length - 1; i += 1) {
    ikiliKume.add(kelimeler[i] + kelimeler[i + 1]);   // "8" + "mm" = "8mm"
  }

  let bulunan = 0;
  let sayisal = 0;
  let sayisalBulunan = 0;

  for (const t of istenen) {
    const sayisalMi = /\d/.test(t);
    const var_ = sayisalMi
      ? (kelimeKumesi.has(t) || ikiliKume.has(t))
      : havuz.includes(t);

    if (var_) bulunan += 1;
    if (sayisalMi) {
      sayisal += 1;
      if (var_) sayisalBulunan += 1;
    }
  }

  // Ölçü/model belirten sayı (8mm · 40a · 100) tutmuyorsa sonuç ilgisizdir
  if (sayisal > 0 && sayisalBulunan < sayisal) return false;

  // Kısa adlarda (≤3 kelime) TÜM kelimeler aranır: "100 gövde fren" için
  // "conta termostat gövdesi" gibi ilgisiz ürünler elenir.
  if (istenen.length <= 3) return bulunan === istenen.length;
  return bulunan >= Math.ceil(istenen.length * 0.7);
};

/**
 * GEVŞEK eşleşme: ölçü/model belirten sayı aranmaz, yalnızca kelimelerin
 * çoğunluğu tutmalı. Tam eşleşme bulunamazsa "yakın sonuç" olarak kullanılır
 * ve DAIMA düşük güvenle + uyarıyla gösterilir.
 */
const ilgiliGevsekMi = (metin: string, istenen: string[]): boolean => {
  const alfa = istenen.filter((t) => !/\d/.test(t));
  if (!alfa.length) return false;
  const havuz = metinHavuzu(metin);
  if (!havuz) return false;
  const bulunan = alfa.filter((t) => havuz.includes(t)).length;
  return bulunan >= Math.max(1, Math.ceil(alfa.length * 0.6));
};

/** Tüketici/hobi ürünü mü? (sanayi malzemesinde bisiklet parçası fiyatı kullanılmaz) */
const tuketiciUrunu = (baslik: string, istenen: string[]): boolean => {
  const havuz = trAscii(String(baslik || ''));
  if (!havuz) return false;
  const istenenMetin = istenen.join(' ');
  return TUKETICI_ISARETLER.some((t) => {
    const anahtar = trAscii(t);
    return anahtar.length >= 4 && havuz.includes(anahtar) && !istenenMetin.includes(anahtar);
  });
};

/** Alan adı sorgu kelimesini taşıyor mu? (derelifren.com.tr ↔ "fren") */
const alanAdiIlgili = (url: string | null, istenen: string[]): boolean => {
  const site = adAnahtar(siteAdi(url));
  if (!site) return false;
  return istenen.some((t) => t.length >= 4 && site.includes(t));
};

/** Sonuç sayfası açmaya değer mi? (ürün sayfası görünümlü + site engelli değil) */
const sayfaAcilir = (s: AramaSonucu): boolean => {
  if (!s.url) return false;
  const site = siteAdi(s.url);
  if (!site) return false;
  if (SAYFA_ENGEL.some((e) => site.includes(e))) return false;
  return /\/urun|\/product|\/p-|\/magaza|\/shop|\/katalog|\.html?$|\/item|\/guc-|\/kategori/i.test(s.url);
};

/** Ürün sayfası olma olasılığı yüksek olanlar önce denenir. */
const sayfaOnceligi = (s: AramaSonucu): number => {
  const url = String(s.url || '');
  if (/\/urun|\/product|\/p-|\/item/.test(url)) return 0;
  if (/-p-|\/pm-|\.html?$/.test(url)) return 1;
  return 2;
};

/** Fiyat adayı üretir (ham tutar + KDV bilgisi). */
function kaynakUret(opts: {
  site: string;
  baslik: string;
  url: string | null;
  hamFiyat: number;
  kaynakAdi: string;
  sayfaMetni?: string | null;
}): WebKaynak | null {
  if (!gecerliFiyat(opts.hamFiyat)) return null;
  const tip = siteTipi(opts.site, opts.sayfaMetni || null);
  const fiyat = kdvHaricYap(opts.hamFiyat, tip);
  if (!gecerliFiyat(fiyat)) return null;

  return {
    site: opts.site || 'kaynak',
    baslik: kisalt(opts.baslik),
    url: opts.url,
    fiyat,
    ham_fiyat: Math.round(opts.hamFiyat * 100) / 100,
    kdv_dahil: tip === 'perakende',
    tip,
    kaynak_adi: opts.kaynakAdi,
    not: tip === 'perakende' ? 'perakende fiyatı KDV hariçe çevrildi (÷1,20)' : 'KDV hariç fiyat (olduğu gibi)',
  };
}

/** Ürün sayfasının kendisinden okunan fiyat türleri (en kesin kanıt). */
const SAYFA_KAYNAK_ADLARI = ['json-ld', 'itemprop', 'og:price', 'fiyat-sinifi'];

/** Aynı URL/site + aynı tutar tekrarını atar; ürün sayfası fiyatı önceliklidir. */
function kaynakTekillestir(liste: WebKaynak[]): WebKaynak[] {
  const gorulen = new Set<string>();
  const cikti: WebKaynak[] = [];

  // Ürün sayfasından okunan fiyat aynı URL'de daha güvenilirdir → önce o
  const sirali = [...liste].sort(
    (a, b) => Number(SAYFA_KAYNAK_ADLARI.includes(b.kaynak_adi))
      - Number(SAYFA_KAYNAK_ADLARI.includes(a.kaynak_adi))
  );

  for (const k of sirali) {
    const anahtar = k.url
      ? `url:${k.url}`
      : `sf:${adAnahtar(k.site)}:${k.ham_fiyat}`;
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    cikti.push(k);
  }
  return cikti;
}

/**
 * Aynı siteden çok sayıda fiyat gelirse (ör. n11'de 9 ürün) hepsi medyana
 * girmesin: sitenin kendi medyanına en yakın 2 tanesi tutulur.
 */
function siteDengele(liste: WebKaynak[]): WebKaynak[] {
  const gruplar = new Map<string, WebKaynak[]>();
  for (const k of liste) {
    const anahtar = adAnahtar(k.site);
    const dizi = gruplar.get(anahtar) || [];
    dizi.push(k);
    gruplar.set(anahtar, dizi);
  }

  const cikti: WebKaynak[] = [];
  for (const dizi of gruplar.values()) {
    if (dizi.length <= 2) {
      cikti.push(...dizi);
      continue;
    }
    const med = medyan(dizi.map((d) => d.fiyat));
    cikti.push(...[...dizi].sort((a, b) => Math.abs(a.fiyat - med) - Math.abs(b.fiyat - med)).slice(0, 2));
  }
  return cikti;
}

const kalanSure = (bitis: number): number => bitis - Date.now();

// ─── ANA GİRİŞ ──────────────────────────────────────────────────────────────

/**
 * Bir malzeme adı için ÜCRETSİZ kaynaklardan KDV hariç birim fiyat araştırır.
 * Hiçbir kaynak cevap vermezse `bulundu:false` döner (0 ₺ DEĞİL → ekran elle giriş ister).
 */
export async function webFiyatArastir(ad: string, secenek: AramaSecenekleri = {}): Promise<WebArastirma> {
  const baslangic = Date.now();
  const bitis = baslangic + Math.max(6_000, secenek.butceMs ?? 20_000);
  const sayfaGetir = secenek.sayfaGetir !== false;

  const temizAd = String(ad || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const bos = (uyari: string | null, denenen: string[], cevapVeren: string[]): WebArastirma => ({
    ad: temizAd,
    bulundu: false,
    birim_fiyat: null,
    min: null,
    maks: null,
    kaynak_sayisi: 0,
    kaynaklar: [],
    guven: 0,
    kdv_notu: null,
    denenen,
    cevap_veren: cevapVeren,
    uyari,
    sure_ms: Date.now() - baslangic,
  });

  if (temizAd.length < 2) return bos('Malzeme adı çok kısa.', [], []);

  const istenen = tokenler(temizAd);
  const denenen: string[] = [];
  const cevapVeren: string[] = [];
  const hatalar: string[] = [];
  const kaynaklar: WebKaynak[] = [];

  // ─── 1) ARAMA MOTORLARI + PAZARYERİ (paralel) ───
  const denemeSuresi = () => Math.min(KAYNAK_SINIRI_MS, Math.max(3_000, kalanSure(bitis)));

  const ilkTur = await Promise.all([
    searxAra(`${temizAd} fiyat`, bitis),
    ddgAra('duckduckgo', `${temizAd} fiyat`, denemeSuresi()),
    ddgAra('duckduckgo-lite', `${temizAd} fiyat`, denemeSuresi()),
    pazaryeriAra(temizAd, denemeSuresi()),
  ]);
  denenen.push('searxng', 'duckduckgo', 'duckduckgo-lite', ...PAZARYERLERI.map((p) => p.ad));

  const aramaSonuclari: AramaSonucu[] = [];
  for (const cevap of ilkTur) {
    if (cevap.sonuclar.length) {
      if (!cevapVeren.includes(cevap.ad)) cevapVeren.push(cevap.ad);
      aramaSonuclari.push(...cevap.sonuclar);
    } else if (cevap.hata) {
      hatalar.push(cevap.hata);
    }
  }

  // İlk tur zayıfsa: Bing + farklı sorgu + site: denemesi
  if (aramaSonuclari.length < 4 && kalanSure(bitis) > 7_000) {
    denenen.push('bing', 'duckduckgo(sorgu2)');
    const ikinciTur = await Promise.all([
      bingAra(`${temizAd} fiyat`, denemeSuresi()),
      ddgAra('duckduckgo', `${temizAd} KDV hariç fiyat`, denemeSuresi()),
    ]);
    for (const cevap of ikinciTur) {
      if (cevap.sonuclar.length) {
        if (!cevapVeren.includes(cevap.ad)) cevapVeren.push(cevap.ad);
        aramaSonuclari.push(...cevap.sonuclar);
      } else if (cevap.hata) {
        hatalar.push(cevap.hata);
      }
    }
  }

  // ─── 2) SONUÇLARIN İÇİNDEKİ FİYATLAR (yalnızca ÖZET metninden) ───
  //  ⚠️ Başlık + fiyat bitiştirilerek ayrıştırılmaz: ürün kodu ile fiyat
  //     birleşip "55492940 549,54 TL" → 940549,54 gibi uydurma tutar üretiyordu.
  for (const s of aramaSonuclari) {
    const havuz = `${s.baslik} ${s.ozet}`;
    if (tuketiciUrunu(s.baslik, istenen)) continue;

    const sikiMi = ilgiliMi(havuz, istenen);
    const gevsekMi = !sikiMi && ilgiliGevsekMi(havuz, istenen);
    if (!sikiMi && !gevsekMi) continue;

    for (const tutar of fiyatlarAyristir(s.ozet)) {
      const k = kaynakUret({
        site: s.site || s.motor,
        baslik: s.baslik,
        url: s.url,
        hamFiyat: tutar,
        kaynakAdi: s.motor,
      });
      if (k) kaynaklar.push({ ...k, gevsek: gevsekMi });
    }
  }

  // ─── 3) SONUÇ SAYFALARINDAN FİYAT (deep fetch) ───
  if (sayfaGetir && kalanSure(bitis) > 4_000) {
    const sayisalVar = istenen.some((t) => /\d/.test(t));

    /** Sayfa adayı ilgili mi? (ölçü varsa başlık eşleşmesi ZORUNLU) */
    const sayfaIlgili = (s: AramaSonucu): boolean => {
      if (ilgiliMi(`${s.baslik} ${s.ozet}`, istenen)) return true;
      // Alan adı malzemeyi taşıyorsa (derelifren.com.tr ↔ "fren") sayfa açılır,
      // ancak ölçü/model istenmişse bu gevşetme UYGULANMAZ.
      return !sayisalVar && alanAdiIlgili(s.url, istenen);
    };

    const uygun = aramaSonuclari.filter(
      (s) => !tuketiciUrunu(s.baslik, istenen) && sayfaAcilir(s)
    );
    const sikiAdaylar = uygun.filter(sayfaIlgili);
    // Tam eşleşme yoksa GEVŞEK adaylar denenir (düşük güven + uyarı ile)
    const gevsekAdaylar = uygun.filter(
      (s) => !sayfaIlgili(s) && ilgiliGevsekMi(`${s.baslik} ${s.ozet}`, istenen)
    );

    const gevsekMod = sikiAdaylar.length === 0 && gevsekAdaylar.length > 0;
    const adaylar = (gevsekMod ? gevsekAdaylar : sikiAdaylar)
      .sort((a, b) => sayfaOnceligi(a) - sayfaOnceligi(b));

    // Aynı siteden en fazla 1 sayfa
    const secilen: AramaSonucu[] = [];
    const gorulenSite = new Set<string>();
    for (const a of adaylar) {
      const site = siteAdi(a.url);
      if (!site || gorulenSite.has(site)) continue;
      gorulenSite.add(site);
      secilen.push(a);
      if (secilen.length >= MAKS_SAYFA) break;
    }

    if (secilen.length) {
      denenen.push('sonuç-sayfası');
      const sayfaSonuclari = await Promise.all(secilen.map(async (a) => {
        const sure = Math.min(SAYFA_SINIRI_MS, Math.max(3_000, kalanSure(bitis) - 2_000));
        const cevap = await htmlGetir(a.url as string, sure);
        if (cevap.durum !== 200 || !cevap.metin) return null;

        const fiyat = sayfaFiyati(cevap.metin);
        if (!fiyat) return null;

        // Sayfadaki açık "KDV hariç" ifadesi varsayımı ezer
        const sayfaMetni = htmlCoz(cevap.metin).slice(0, 20_000);
        const kaynak = kaynakUret({
          site: siteAdi(a.url) || a.site,
          baslik: a.baslik,
          url: a.url,
          hamFiyat: fiyat.fiyat,
          kaynakAdi: fiyat.kaynak,
          sayfaMetni,
        });
        // Gevşek modda bulunduysa bunu ETİKETLE (düşük güven, kitaba yazılmaz)
        return kaynak ? { ...kaynak, gevsek: gevsekMod } : null;
      }));

      for (const k of sayfaSonuclari) {
        if (k) {
          kaynaklar.push(k);
          if (!cevapVeren.includes('sonuç-sayfası')) cevapVeren.push('sonuç-sayfası');
        }
      }
    }
  }

  // ─── 4) MEDYAN + AYKIRI TEMİZLEME ───
  const tumKaynaklar = siteDengele(kaynakTekillestir(kaynaklar).filter((k) => gecerliFiyat(k.fiyat)));
  if (!tumKaynaklar.length) {
    const uyari = hatalar.length
      ? `Ücretsiz kaynaklardan fiyat çıkmadı (${hatalar.slice(0, 2).join('; ')}).`
      : 'Ücretsiz kaynaklarda bu malzeme için fiyat bulunamadı.';
    return bos(uyari, denenen, cevapVeren);
  }

  // Tam eşleşen kaynak varsa yalnızca onlar kullanılır; yoksa "yakın sonuç"
  const sikiKaynaklar = tumKaynaklar.filter((k) => !k.gevsek);
  const gevsekMod = sikiKaynaklar.length === 0;
  const tekil = gevsekMod ? tumKaynaklar : sikiKaynaklar;

  // Ürün sayfasından okunan fiyat (JSON-LD) en kesinidir: 2+ taneyse onları kullan
  const sayfaKaynakli = tekil.filter((k) => SAYFA_KAYNAK_ADLARI.includes(k.kaynak_adi));
  const havuz = sayfaKaynakli.length >= 2 ? sayfaKaynakli : tekil;

  const temiz = aykiriTemizle(havuz.map((k) => k.fiyat));
  const med = Math.round(medyan(temiz) * 100) / 100;

  // Medyana en yakın kaynaklar (en fazla 3) — temsil edici liste
  const secilenKaynaklar = [...havuz]
    .sort((a, b) => Math.abs(a.fiyat - med) - Math.abs(b.fiyat - med))
    .slice(0, MAKS_KAYNAK);

  const minHam = temiz.length >= 2 ? Math.min(...temiz) : 0;
  const maksHam = temiz.length >= 2 ? Math.max(...temiz) : 0;
  const min = temiz.length >= 2 ? Math.round(minHam * 100) / 100 : null;
  const maks = temiz.length >= 2 ? Math.round(maksHam * 100) / 100 : null;
  const yayilim = minHam > 0 ? maksHam / minHam : 1;

  const kdvDonusen = secilenKaynaklar.filter((k) => k.kdv_dahil).length;
  const kdvNotu = kdvDonusen === 0
    ? 'Kaynaklar KDV hariç fiyat veriyor (toptan/endüstriyel) — dönüşüm yapılmadı.'
    : (kdvDonusen === secilenKaynaklar.length
      ? "Tüm kaynaklar perakende (KDV dahil) → 1,20'ye bölündü, tutar KDV hariçtir."
      : `${kdvDonusen}/${secilenKaynaklar.length} kaynak perakende (KDV dahil) → 1,20'ye bölündü; diğerleri KDV hariç alındı.`);

  // Güven: kaynak çokluğu + ürün sayfası kanıtı + fiyat yayılımı
  let guven = 55;
  if (temiz.length >= 2) guven = 70;
  if (sayfaKaynakli.length >= 1) guven = Math.max(guven, 72);
  if (sayfaKaynakli.length >= 1 && tekil.length >= 2) guven = 78;
  if (yayilim > 5) guven = Math.min(guven, 45);
  // Ölçü/model tutmayan yakın sonuç → daima düşük güven
  if (gevsekMod) guven = Math.min(guven, 40);

  const uyarilar: string[] = [];
  if (gevsekMod) {
    uyarilar.push('Tam eşleşme (ölçü/model) bulunamadı — yakın sonuçlar gösteriliyor, düşük güven: fiyatı doğrulayın.');
  }
  if (tumKaynaklar.length > temiz.length) {
    uyarilar.push(`${tumKaynaklar.length - temiz.length} aykırı fiyat (medyandan %60+ sapma) elendi.`);
  }
  if (yayilim > 5) {
    uyarilar.push(`Kaynaklar arasında ${Math.round(yayilim)} kat fark var (paket/adet farkı olabilir) — fiyatı doğrulayın.`);
  }

  return {
    ad: temizAd,
    bulundu: true,
    birim_fiyat: med,
    min,
    maks,
    kaynak_sayisi: temiz.length,
    kaynaklar: secilenKaynaklar,
    guven,
    kdv_notu: kdvNotu,
    denenen: Array.from(new Set(denenen)),
    cevap_veren: Array.from(new Set(cevapVeren)),
    uyari: uyarilar.length ? uyarilar.join(' ') : null,
    sure_ms: Date.now() - baslangic,
  };
}
