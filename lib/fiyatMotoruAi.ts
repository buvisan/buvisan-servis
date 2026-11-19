// ============================================================================
//  💰 MALZEME FİYAT ARAŞTIRMASI — Google Search grounding + tahmin yedeği
// ----------------------------------------------------------------------------
//  NEDEN BU DOSYA VAR?
//    "Fiyat Önerisi" ekranı sadece geçmiş işlerin medyanına bakıyordu; malzeme
//    maliyeti, işçilik ve kâr marjı hesaba katılmadığı için YANLIŞ fiyat
//    çıkarıyordu. Artık her malzeme için GERÇEK piyasa fiyatı araştırılır.
//
//  NASIL ÇALIŞIR? (iki kademe)
//    1) GEMINI + google_search grounding → model web'de arar, fiyatı kaynağa
//       dayandırır. Cevapta groundingChunks (kaynak URL) varsa satır 'google'.
//    2) Grounding çalışmazsa (anahtar yok / kota / model kapalı / kaynak yok)
//       modelin kendi bilgisiyle TAHMİNİ fiyat üretilir → satır 'tahmini'.
//    Hiçbiri olmazsa satır "fiyat bulunamadı" (birim_fiyat: null) döner;
//    ekran 0 göstermez, kullanıcı elle girer.
//
//  KURALLAR
//    • Tüm fiyatlar TL ve KDV HARİÇ'tir (istekte de böyle istenir).
//    • Anahtar koda yazılmaz → GOOGLE_GENERATIVE_AI_API_KEY / GEMINI_API_KEY
//      (yedekler: OPENROUTER/GROQ/OPENAI/MISTRAL) process.env'den okunur.
//    • TOPLAM süre 38 sn'yi geçmez (ekran 40 sn'de kesiyor). Malzeme satırları
//      GRUP_BOYUT'lu gruplara bölünür ve gruplar PARALEL (Promise.all) aranır.
//    • Model adı MALZEME_FIYAT_MODEL / FIYAT_MODEL / GEMINI_MODEL ile
//      değiştirilebilir. Varsayılan sıra "flash-lite" ailesidir: kota ve hız
//      açısından en dayanıklı olanlar (3.8-flash bazı anahtarlarda 429 veriyor).
// ============================================================================

// Anahtar okuma, hata çevirisi ve model adları fotoğraf analiziyle AYNI
// kaynaktan gelir (tek doğru kaynak: lib/fotoAnalizAi.ts).
import { geminiAnahtari, hataCevirisi } from './fotoAnalizAi';

// ─── TİPLER ─────────────────────────────────────────────────────────────────

export type MalzemeGirdi = { ad: string; adet: number };

export type FiyatKaynagi = 'google' | 'tahmini';

export type FiyatSatiri = {
  ad: string;
  adet: number;
  /** KDV hariç birim fiyat (TL). Bulunamadıysa null — 0 DEĞİL. */
  birim_fiyat: number | null;
  /** KDV hariç satır toplamı. Bulunamadıysa null. */
  toplam: number | null;
  kaynak: FiyatKaynagi;
  /** kaynak='tahmini' ise true (ekran "TAHMİNİ %85" rozeti basar) */
  tahmini: boolean;
  /** 0-100 */
  guven: number;
  /** false → ekran "fiyat bulunamadı" yazar, elle düzenleme ister */
  bulundu: boolean;
  kaynak_notu: string | null;
  kaynak_url: string | null;
};

export type FiyatArastirmaSonucu = {
  satirlar: FiyatSatiri[];
  saglayici: string;
  model: string;
  /** en az bir satır gerçek web kaynağına dayandı mı? */
  google_grounding: boolean;
  sure_ms: number;
  uyari: string | null;
};

export type FiyatHataKodu = 'anahtar-yok' | 'gecersiz' | 'saglayici';

/** Fiyat araştırması yapılamadığında fırlatılır (mesajı ekrana gider). */
export class FiyatHatasi extends Error {
  kod: FiyatHataKodu;
  ayrinti: string[];

  constructor(mesaj: string, kod: FiyatHataKodu = 'saglayici', ayrinti: string[] = []) {
    super(mesaj);
    this.name = 'FiyatHatasi';
    this.kod = kod;
    this.ayrinti = ayrinti;
  }
}

// ─── SINIRLAR ───────────────────────────────────────────────────────────────

/** Ekran 40 sn'de kesiyor → sunucu 38 sn'de kendini durdurur. */
export const TOPLAM_BUTCE_MS = 38_000;
/** Grounding denemesi uzun sürerse tahmine kalan süre kalsın. */
const GROUNDING_SINIRI_MS = 20_000;
/** Tek tahmin çağrısı. */
const TAHMIN_SINIRI_MS = 20_000;
/** Aynı istekte kaç malzeme sorulur (paralel grup boyu). */
const GRUP_BOYUT = 4;
/** Ekranın kabul ettiği en fazla satır. */
export const MAKS_MALZEME = 24;
/** Birim fiyat üst sınırı (yanlış model çıktısı hesabı uçurmasın). */
const MAKS_BIRIM_FIYAT = 5_000_000;

const VARSAYILAN_MODELLER = [
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
];

const MAKS_MODEL_DENEMESI = 4;

const env = (ad: string): string => String(process.env[ad] || '').trim();

/**
 * Fiyat araştırmasında kullanılacak Gemini modelleri.
 * MALZEME_FIYAT_MODEL → FIYAT_MODEL → GEMINI_MODEL → yerleşik liste.
 */
export function fiyatModelleri(): string[] {
  const ham = env('MALZEME_FIYAT_MODEL') || env('FIYAT_MODEL') || env('GEMINI_MODEL');
  const liste = ham ? ham.split(',') : VARSAYILAN_MODELLER;
  return Array.from(new Set(liste.map((m) => m.trim()).filter(Boolean))).slice(0, MAKS_MODEL_DENEMESI);
}

type OpenAiUyumlu = { saglayici: string; url: string; anahtarEnv: string; modelEnv: string };

// Gemini hiç yoksa tahmin için OpenAI uyumlu sağlayıcılar denenir
// (anahtar VE model tanımlıysa). Model adı uydurulmaz.
const OPENAI_UYUMLU: OpenAiUyumlu[] = [
  { saglayici: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions', anahtarEnv: 'OPENROUTER_API_KEY', modelEnv: 'OPENROUTER_MODEL' },
  { saglayici: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', anahtarEnv: 'GROQ_API_KEY', modelEnv: 'GROQ_MODEL' },
  { saglayici: 'openai', url: 'https://api.openai.com/v1/chat/completions', anahtarEnv: 'OPENAI_API_KEY', modelEnv: 'OPENAI_MODEL' },
  { saglayici: 'mistral', url: 'https://api.mistral.ai/v1/chat/completions', anahtarEnv: 'MISTRAL_API_KEY', modelEnv: 'MISTRAL_MODEL' },
];

function kullanilabilirYedekler(): OpenAiUyumlu[] {
  return OPENAI_UYUMLU.filter((t) => env(t.anahtarEnv) && env(t.modelEnv));
}

/** Anahtar hiç tanımlı değilse ekrana gidecek Türkçe yönlendirme. */
export function fiyatYapilandirmaMesaji(): string {
  return [
    'API anahtarı tanımlı değil — malzeme fiyat araştırması yapılamıyor.',
    'Vercel → Settings → Environment Variables bölümüne şunlardan birini ekleyin:',
    '• GOOGLE_GENERATIVE_AI_API_KEY (Gemini — önerilen; GEMINI_API_KEY de kabul edilir)',
    '• OPENROUTER_API_KEY + OPENROUTER_MODEL (yalnızca TAHMİNİ fiyat üretebilir)',
    '• GROQ_API_KEY + GROQ_MODEL · OPENAI_API_KEY + OPENAI_MODEL · MISTRAL_API_KEY + MISTRAL_MODEL',
    'Anahtarı ekledikten sonra yeniden deploy edin. Bu süre boyunca fiyatları elle girebilirsiniz.',
  ].join(' ');
}

// ─── PROMPT ─────────────────────────────────────────────────────────────────

/** YYYY-MM-DD (Türkiye saati) — modelin "güncel fiyat" bağlamı için. */
function bugun(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
}

/**
 * Fiyat araştırma promptu. `grounding: true` → modelin web araması yapması
 * istenir; false → kendi bilgisiyle tahmin etmesi istenir.
 */
export function fiyatPromptu(
  malzemeler: MalzemeGirdi[],
  baglam: { is_tipi?: string | null; musteri?: string | null; grounding: boolean }
): string {
  const liste = malzemeler
    .map((m, i) => `${i + 1}) ${String(m.ad || '').trim()}${m.adet > 1 ? ` (${m.adet} adet)` : ''}`)
    .join('\n');

  const baglamSatiri = [
    baglam.is_tipi ? `İş tipi: ${baglam.is_tipi}` : '',
    baglam.musteri ? `Müşteri: ${baglam.musteri}` : '',
  ].filter(Boolean).join(' · ');

  return `Sen BUVİSAN Vinç & Asansör Servisi'nin satın alma / fiyatlandırma uzmanısın.
Bugünün tarihi: ${bugun()}.${baglamSatiri ? `\n${baglamSatiri}.` : ''}
Aşağıdaki malzemelerin TÜRKİYE piyasasındaki GÜNCEL birim alış fiyatını TL olarak belirle.

KURALLAR:
- Tüm tutarlar KDV HARİÇ ve 1 ADET içindir (adet bilgisi sadece bağlam içindir).
- Sanayi / hırdavat / online tedarikçilerdeki GERÇEK fiyat seviyesini yansıt.
- Emin değilsen "guven" değerini 0-45 arasında ver; eminsen 70-95.
- Fiyat tahmin edemiyorsan "birim_fiyat": null ve "guven": 0 ver (uydurma).
- Vinç parçası olmayan/çok belirsiz adlarda da düşük güven ver, 0 yazma.
${baglam.grounding
    ? '- Fiyatları web aramasıyla doğrula ve "kaynak_notu" alanına bulduğun site/mağaza adını yaz.'
    : '- "kaynak_notu" alanına fiyatı neye dayandırdığını kısaca yaz (ör. "piyasa ortalaması").'}
- SADECE şu JSON'u döndür, başka hiçbir şey yazma:
{"fiyatlar":[{"ad":"verilen ad AYNEN","birim_fiyat":1234.5,"guven":80,"kaynak_notu":"kısa not"}]}
- Sırayı KORU ve "ad" alanına verilen adı AYNEN yaz.

MALZEMELER:
${liste}`;
}

// ─── YARDIMCILAR ────────────────────────────────────────────────────────────

/** "12.500,75" / "12500.75" / "12 500" / 12500.75 → 12500.75 */
export function fiyatSayi(deger: any): number | null {
  if (typeof deger === 'number') return Number.isFinite(deger) ? deger : null;
  const ham = String(deger ?? '').trim();
  if (!ham) return null;
  // Türkçe biçim: binlik nokta, ondalık virgül
  let temiz = ham.replace(/[^\d.,-]/g, '');
  if (temiz.includes(',') && temiz.includes('.')) {
    temiz = temiz.lastIndexOf(',') > temiz.lastIndexOf('.')
      ? temiz.replace(/\./g, '').replace(',', '.')
      : temiz.replace(/,/g, '');
  } else if (temiz.includes(',')) {
    temiz = temiz.replace(',', '.');
  }
  const sayi = Number(temiz);
  return Number.isFinite(sayi) ? sayi : null;
}

const yuzdeSinirla = (n: any): number => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
};

const kurus = (n: number): number => Math.round(n * 100) / 100;

/** Metindeki JSON'u çıkarır (```json sarmalı / baştaki-sondaki metin toleranslı). */
function jsonCikar(metin: string): any | null {
  const temiz = String(metin || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(temiz);
  } catch {
    /* sarmalayıcı metin olabilir */
  }
  const ilk = temiz.indexOf('{');
  const son = temiz.lastIndexOf('}');
  if (ilk >= 0 && son > ilk) {
    try {
      return JSON.parse(temiz.slice(ilk, son + 1));
    } catch {
      /* JSON değil */
    }
  }
  return null;
}

/** İsim karşılaştırması için sadeleştirme (Türkçe harf + noktalama farkı yok). */
const adNormal = (s: any): string =>
  String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/â/g, 'a')
    .replace(/[^a-z0-9]/g, '');

type HamFiyat = { ad?: any; birim_fiyat?: any; birimFiyat?: any; fiyat?: any; guven?: any; kaynak_notu?: any; not?: any };

function hamListe(ham: any): HamFiyat[] {
  const adaylar = [ham?.fiyatlar, ham?.malzemeler, ham?.items, ham?.sonuc, ham?.data];
  for (const a of adaylar) if (Array.isArray(a)) return a as HamFiyat[];
  if (Array.isArray(ham)) return ham as HamFiyat[];
  return [];
}

/**
 * Modelin döndürdüğü JSON'u satırlara çevirir.
 * Eşleştirme: önce sıra (model sırayı korumak zorunda), sonra ad benzerliği.
 */
function satirlariCoz(
  ham: any,
  girdi: MalzemeGirdi[],
  kaynak: FiyatKaynagi,
  kaynakUrl: string | null
): FiyatSatiri[] {
  const liste = hamListe(ham);

  return girdi.map((m, i) => {
    const adet = Math.max(1, Math.round(Number(m.adet) || 1));
    let eslesme: HamFiyat | undefined = liste[i];

    // Sıradaki kayıt adı tutmuyorsa ada göre ara (model sırayı bozmuş olabilir)
    const aranan = adNormal(m.ad);
    if (!eslesme || (aranan && adNormal(eslesme.ad) && !adNormal(eslesme.ad).includes(aranan.slice(0, 12)))) {
      const bulunan = liste.find((x) => {
        const xn = adNormal(x?.ad);
        return xn && aranan && (xn.includes(aranan.slice(0, 12)) || aranan.includes(xn.slice(0, 12)));
      });
      if (bulunan) eslesme = bulunan;
    }

    const hamFiyat = fiyatSayi(eslesme?.birim_fiyat ?? eslesme?.birimFiyat ?? eslesme?.fiyat);
    const gecerli = hamFiyat !== null && hamFiyat > 0 && hamFiyat <= MAKS_BIRIM_FIYAT;
    const birim = gecerli ? kurus(hamFiyat as number) : null;
    const guven = gecerli ? yuzdeSinirla(eslesme?.guven) : 0;
    const notu = eslesme?.kaynak_notu ?? eslesme?.not;

    return {
      ad: String(m.ad || '').trim(),
      adet,
      birim_fiyat: birim,
      toplam: birim === null ? null : kurus(birim * adet),
      kaynak,
      tahmini: kaynak === 'tahmini',
      guven,
      bulundu: birim !== null,
      kaynak_notu: notu ? String(notu).replace(/\s+/g, ' ').trim().slice(0, 160) : null,
      kaynak_url: kaynakUrl,
    } satisfies FiyatSatiri;
  });
}

const fiyatliSayi = (satirlar: FiyatSatiri[]): number => satirlar.filter((s) => s.bulundu).length;

// ─── SAĞLAYICI ÇAĞRILARI ────────────────────────────────────────────────────

type GeminiSonuc = {
  metin: string | null;
  /** gerçek web kaynağı var mı (groundingChunks) */
  grounding: boolean;
  kaynakUrl: string | null;
  aramaYapildi: boolean;
  hata: string | null;
};

/**
 * Gemini generateContent çağrısı.
 * grounding=true → tools:[{google_search:{}}] ile web araması ister.
 * Anahtar adres çubuğunda DEĞİL, başlıkta (loglara sızmaz).
 */
async function geminiCagri(opts: {
  anahtar: string;
  envAdi: string;
  model: string;
  prompt: string;
  grounding: boolean;
  sureMs: number;
}): Promise<GeminiSonuc> {
  const { anahtar, envAdi, model, prompt, grounding, sureMs } = opts;
  const bos = (hata: string): GeminiSonuc => ({
    metin: null, grounding: false, kaynakUrl: null, aramaYapildi: false, hata,
  });

  const govde: any = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.15, maxOutputTokens: 2048 },
  };
  if (grounding) govde.tools = [{ google_search: {} }];

  let yanit: Response;
  try {
    yanit = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': anahtar },
        body: JSON.stringify(govde),
        signal: AbortSignal.timeout(Math.max(3_000, sureMs)),
      }
    );
  } catch (e: any) {
    const ad = String(e?.name || '');
    return bos(
      ad === 'TimeoutError' || ad === 'AbortError'
        ? `Gemini ${Math.round(sureMs / 1000)} sn içinde cevap vermedi (${model}).`
        : `Gemini'ye ulaşılamadı (${model}): ${String(e?.message || e).slice(0, 120)}`
    );
  }

  const ham = await yanit.text();

  if (!yanit.ok) {
    const mesaj = hataCevirisi({ saglayici: 'gemini', model, envAdi, durum: yanit.status, ham });
    // Grounding'e özel ipucu: Google Search grounding ücretli planda açık olabilir
    const ipucu = grounding && (yanit.status === 429 || yanit.status === 403)
      ? ' Google Search grounding bu API anahtarında kapalı/limitsiz olabilir.'
      : '';
    console.error(`[malzeme-fiyat] gemini/${model}${grounding ? ' (grounding)' : ''} → ${yanit.status}`);
    return bos(mesaj + ipucu);
  }

  let govdeJson: any;
  try {
    govdeJson = JSON.parse(ham);
  } catch {
    return bos(`Gemini beklenmeyen bir cevap döndürdü (JSON değil, ${model}).`);
  }

  const metin = Array.isArray(govdeJson?.candidates?.[0]?.content?.parts)
    ? govdeJson.candidates[0].content.parts
        .filter((p: any) => p?.text && p?.thought !== true)
        .map((p: any) => String(p.text))
        .join('')
        .trim()
    : '';

  if (!metin) {
    const neden = govdeJson?.candidates?.[0]?.finishReason || govdeJson?.promptFeedback?.blockReason;
    return bos(`Gemini boş cevap döndü${neden ? ` (${neden})` : ''} (${model}).`);
  }

  const gm = govdeJson?.candidates?.[0]?.groundingMetadata || {};
  const parcalar: any[] = Array.isArray(gm?.groundingChunks) ? gm.groundingChunks : [];
  const urller = parcalar.map((c: any) => String(c?.web?.uri || '').trim()).filter(Boolean);
  const sozler: any[] = Array.isArray(gm?.webSearchQueries) ? gm.webSearchQueries : [];

  return {
    metin,
    grounding: urller.length > 0,
    kaynakUrl: urller[0] || null,
    aramaYapildi: urller.length > 0 || sozler.length > 0,
    hata: null,
  };
}

type YedekSonuc = { metin: string | null; hata: string | null };

/** OpenAI uyumlu sağlayıcı (yalnızca TAHMİN — web araması yok). */
async function yedekCagri(opts: {
  tanim: OpenAiUyumlu;
  anahtar: string;
  model: string;
  prompt: string;
  sureMs: number;
}): Promise<YedekSonuc> {
  const { tanim, anahtar, model, prompt, sureMs } = opts;
  let yanit: Response;
  try {
    yanit = await fetch(tanim.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anahtar}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.15,
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(Math.max(3_000, sureMs)),
    });
  } catch (e: any) {
    return { metin: null, hata: `${tanim.saglayici} isteği başarısız: ${String(e?.message || e).slice(0, 120)}` };
  }

  const ham = await yanit.text();
  if (!yanit.ok) {
    return {
      metin: null,
      hata: hataCevirisi({ saglayici: tanim.saglayici, model, envAdi: tanim.anahtarEnv, durum: yanit.status, ham }),
    };
  }

  let govde: any;
  try {
    govde = JSON.parse(ham);
  } catch {
    return { metin: null, hata: `${tanim.saglayici} JSON dışı cevap döndü.` };
  }

  const icerik = govde?.choices?.[0]?.message?.content;
  const metin = String(
    Array.isArray(icerik) ? icerik.map((p: any) => p?.text || '').join('') : icerik || ''
  ).trim();

  return metin ? { metin, hata: null } : { metin: null, hata: `${tanim.saglayici} boş cevap döndü.` };
}

// ─── GRUP İŞLEME ────────────────────────────────────────────────────────────

type GrupSonuc = {
  satirlar: FiyatSatiri[];
  saglayici: string;
  model: string;
  grounding: boolean;
  uyari: string | null;
};

/** Kalan süre (ms) — bitiş zamanına göre. */
const kalanSure = (bitis: number): number => bitis - Date.now();

/**
 * Bir malzeme grubunu fiyatlar.
 * 1) google_search grounding, 2) grounding olmadan tahmin, 3) yedek sağlayıcı.
 * `sadeceTahmin: true` → grounding HİÇ denenmez (ücretsiz planda 429 veriyor;
 * ücretsiz web araması zaten lib/malzemeFiyatWeb.ts içinde yapılıyor).
 */
async function grupFiyatla(
  girdi: MalzemeGirdi[],
  baglam: { is_tipi?: string | null; musteri?: string | null },
  bitis: number,
  sadeceTahmin = false
): Promise<GrupSonuc> {
  const hatalar: string[] = [];
  const anahtar = geminiAnahtari();
  const modeller = fiyatModelleri();

  let groundingUyari: string | null = null;

  // ─── 1) GERÇEK FİYAT: google_search grounding ───
  if (anahtar && !sadeceTahmin) {
    const model = modeller[0];
    const sure = Math.min(GROUNDING_SINIRI_MS, Math.max(0, kalanSure(bitis)) - 6_000);
    if (sure >= 4_000) {
      const cevap = await geminiCagri({
        anahtar: anahtar.anahtar,
        envAdi: anahtar.envAdi,
        model,
        prompt: fiyatPromptu(girdi, { ...baglam, grounding: true }),
        grounding: true,
        sureMs: sure,
      });

      if (cevap.metin) {
        const json = jsonCikar(cevap.metin);
        if (json) {
          const satirlar = satirlariCoz(json, girdi, cevap.grounding ? 'google' : 'tahmini', cevap.kaynakUrl);
          if (cevap.grounding && fiyatliSayi(satirlar) > 0) {
            // Gerçek web kaynağına dayanan fiyatlar → en iyi sonuç
            return { satirlar, saglayici: 'gemini', model, grounding: true, uyari: null };
          }
          // Model cevap verdi ama kaynak yok → "tahmini" say, yine de kullanılabilir
          if (fiyatliSayi(satirlar) > 0 && cevap.aramaYapildi) {
            groundingUyari = 'Google araması yapıldı ama kaynak bağlantısı dönmedi — fiyatlar TAHMİNİ.';
            return { satirlar, saglayici: 'gemini', model, grounding: false, uyari: groundingUyari };
          }
          if (fiyatliSayi(satirlar) > 0) {
            // Grounding'siz cevap gibi davran (yine de tahmin)
            groundingUyari = 'Google Search grounding sonuç vermedi — fiyatlar TAHMİNİ.';
            return { satirlar, saglayici: 'gemini', model, grounding: false, uyari: groundingUyari };
          }
          hatalar.push(`Google aramasında fiyat çıkmadı (${model}).`);
        } else {
          hatalar.push(`Google araması cevabı okunamadı (${model}).`);
        }
      } else if (cevap.hata) {
        hatalar.push(cevap.hata);
      }
    } else {
      hatalar.push('Grounding için süre kalmadı.');
    }
  } else if (!anahtar) {
    hatalar.push('Gemini anahtarı yok.');
  }

  // ─── 2) TAHMİNİ FİYAT: grounding olmadan aynı model(ler) ───
  if (anahtar) {
    for (const model of modeller) {
      const sure = Math.min(TAHMIN_SINIRI_MS, kalanSure(bitis) - 2_000);
      if (sure < 3_000) { hatalar.push('Tahmin için süre kalmadı.'); break; }

      const cevap = await geminiCagri({
        anahtar: anahtar.anahtar,
        envAdi: anahtar.envAdi,
        model,
        prompt: fiyatPromptu(girdi, { ...baglam, grounding: false }),
        grounding: false,
        sureMs: sure,
      });

      if (cevap.metin) {
        const json = jsonCikar(cevap.metin);
        if (json) {
          const satirlar = satirlariCoz(json, girdi, 'tahmini', null);
          if (fiyatliSayi(satirlar) > 0) {
            return {
              satirlar,
              saglayici: 'gemini',
              model,
              grounding: false,
              uyari: groundingUyari || (hatalar.length ? 'Google fiyat araştırması yapılamadı — fiyatlar TAHMİNİ.' : null),
            };
          }
          hatalar.push(`Tahmini fiyat üretilemedi (${model}).`);
        } else {
          hatalar.push(`Tahmin cevabı okunamadı (${model}).`);
        }
      } else if (cevap.hata) {
        hatalar.push(cevap.hata);
      }
    }
  }

  // ─── 3) YEDEK SAĞLAYICILAR (yalnızca tahmin) ───
  for (const tanim of kullanilabilirYedekler()) {
    const sure = Math.min(TAHMIN_SINIRI_MS, kalanSure(bitis) - 2_000);
    if (sure < 3_000) break;

    const model = env(tanim.modelEnv);
    const cevap = await yedekCagri({
      tanim,
      anahtar: env(tanim.anahtarEnv),
      model,
      prompt: fiyatPromptu(girdi, { ...baglam, grounding: false }),
      sureMs: sure,
    });

    if (cevap.metin) {
      const json = jsonCikar(cevap.metin);
      if (json) {
        const satirlar = satirlariCoz(json, girdi, 'tahmini', null);
        if (fiyatliSayi(satirlar) > 0) {
          return {
            satirlar,
            saglayici: tanim.saglayici,
            model,
            grounding: false,
            uyari: 'Fiyatlar yedek sağlayıcıdan TAHMİNİ olarak alındı.',
          };
        }
      }
      hatalar.push(`${tanim.saglayici} fiyat üretemedi.`);
    } else if (cevap.hata) {
      hatalar.push(cevap.hata);
    }
  }

  throw new FiyatHatasi(
    hatalar[0] || 'Malzeme fiyatı araştırılamadı.',
    'saglayici',
    hatalar.slice(0, 6)
  );
}

// ─── ANA GİRİŞ ──────────────────────────────────────────────────────────────

function girdiTemizle(malzemeler: MalzemeGirdi[]): MalzemeGirdi[] {
  return (Array.isArray(malzemeler) ? malzemeler : [])
    .map((m) => ({
      ad: String(m?.ad || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      adet: Math.max(1, Math.min(999, Math.round(Number(m?.adet) || 1))),
    }))
    .filter((m) => m.ad.length > 1)
    .slice(0, MAKS_MALZEME);
}

/**
 * Malzemeler için gerçek/tahmini birim fiyatları araştırır.
 * Satırlar GRUP_BOYUT'lu gruplara bölünür, gruplar PARALEL aranır.
 * Hiçbir sağlayıcı çalışmazsa FiyatHatasi fırlatır (ekran elle girişe düşer).
 *
 * `sadeceTahmin: true` → yalnızca model TAHMİNİ üretilir (grounding atlanır).
 * Fiyat motoru önce ücretsiz web aramasını + fiyat kitabını dener; AI yalnızca
 * son çare olduğu için bu mod kullanılır (grounding ücretsiz planda 429 veriyor).
 */
export async function malzemeFiyatlariArastir(girdi: {
  malzemeler: MalzemeGirdi[];
  is_tipi?: string | null;
  musteri?: string | null;
  butceMs?: number;
  sadeceTahmin?: boolean;
}): Promise<FiyatArastirmaSonucu> {
  const baslangic = Date.now();
  const bitis = baslangic + Math.max(8_000, Math.min(girdi.butceMs ?? TOPLAM_BUTCE_MS, TOPLAM_BUTCE_MS));

  const temiz = girdiTemizle(girdi.malzemeler);
  if (temiz.length === 0) {
    throw new FiyatHatasi('Fiyatı araştırılacak malzeme yok (en az 2 karakterlik bir ad girin).', 'gecersiz');
  }

  // Anahtar hiç yoksa boşuna denemeyelim → net yönlendirme
  if (!geminiAnahtari() && kullanilabilirYedekler().length === 0) {
    throw new FiyatHatasi(fiyatYapilandirmaMesaji(), 'anahtar-yok');
  }

  const baglam = { is_tipi: girdi.is_tipi ?? null, musteri: girdi.musteri ?? null };

  // Gruplar paralel → toplam süre ≈ en yavaş grup
  const gruplar: MalzemeGirdi[][] = [];
  for (let i = 0; i < temiz.length; i += GRUP_BOYUT) gruplar.push(temiz.slice(i, i + GRUP_BOYUT));

  const sonuclar = await Promise.allSettled(
    gruplar.map((grup) => grupFiyatla(grup, baglam, bitis, girdi.sadeceTahmin === true))
  );

  const satirlar: FiyatSatiri[] = [];
  const hatalar: string[] = [];
  const uyarilar: string[] = [];
  let saglayici = 'gemini';
  let model = fiyatModelleri()[0] || 'gemini';
  let groundingVar = false;

  sonuclar.forEach((sonuc, i) => {
    const grup = gruplar[i];
    if (sonuc.status === 'fulfilled') {
      satirlar.push(...sonuc.value.satirlar);
      saglayici = sonuc.value.saglayici;
      model = sonuc.value.model;
      if (sonuc.value.grounding) groundingVar = true;
      if (sonuc.value.uyari && !uyarilar.includes(sonuc.value.uyari)) uyarilar.push(sonuc.value.uyari);
      return;
    }

    // Grup başarısız → o satırlar "fiyat bulunamadı" olarak döner (0 gösterilmez)
    const hata = sonuc.reason;
    const mesaj = hata instanceof FiyatHatasi
      ? hata.message
      : String(hata?.message || 'Fiyat araştırması başarısız.');
    hatalar.push(mesaj);

    grup.forEach((m) => {
      satirlar.push({
        ad: m.ad,
        adet: m.adet,
        birim_fiyat: null,
        toplam: null,
        kaynak: 'tahmini',
        tahmini: true,
        guven: 0,
        bulundu: false,
        kaynak_notu: null,
        kaynak_url: null,
      });
    });
  });

  // Hiçbir satır fiyatlanamadıysa: çağıran taraf nedeni gösterebilsin
  if (fiyatliSayi(satirlar) === 0) {
    const tumAnahtarsiz = hatalar.some((h) => /API anahtarı tanımlı değil/i.test(h));
    throw new FiyatHatasi(
      hatalar[0] || 'Hiçbir malzeme için fiyat bulunamadı.',
      tumAnahtarsiz ? 'anahtar-yok' : 'saglayici',
      hatalar.slice(0, 6)
    );
  }

  const bulunamayan = satirlar.filter((s) => !s.bulundu).length;
  const uyariListesi = [...uyarilar];
  if (bulunamayan > 0) uyariListesi.push(`${bulunamayan} malzeme için fiyat bulunamadı — elle girin.`);

  return {
    satirlar,
    saglayici,
    model,
    google_grounding: groundingVar,
    sure_ms: Date.now() - baslangic,
    uyari: uyariListesi.length ? uyariListesi.join(' ') : null,
  };
}
