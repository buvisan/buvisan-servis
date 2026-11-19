// ============================================================================
//  📸 FOTOĞRAF ANALİZİ — SAĞLAYICI ZİNCİRİ (Gemini + OpenAI uyumlu)
// ----------------------------------------------------------------------------
//  NEDEN BU DOSYA VAR?
//  Google, gemini-2.0-flash ve gemini-2.5-flash ailelerini kapattı. API artık
//  bu modeller için 404 NOT_FOUND döndürüyor:
//    "This model models/gemini-2.0-flash is no longer available.
//     Please update your code to use models/gemini-3.8-flash ..."
//  Ekranda görünen "Yapay zeka servisi hata verdi (404)." tam olarak buydu.
//
//  Bu yüzden:
//    • model adı env ile değiştirilebilir (FOTO_ANALIZ_MODEL → GEMINI_MODEL)
//    • sırayla birden fazla model denenir (404/401/429/503 → sıradakine geçilir)
//    • Gemini'ye ek olarak OpenAI uyumlu sağlayıcılar (OpenRouter, Groq,
//      OpenAI, Mistral) anahtar + model tanımlıysa zincire girer
//    • toplam süre 25 sn (istek sonsuza kadar beklemez)
//    • sağlayıcının GERÇEK hata gövdesi konsola yazılır, ekrana Türkçe özet döner
//    • anahtar koda yazılmaz, sadece process.env okunur; loglarda maskelenir
// ============================================================================

export type GorselGirdi = { tip: string; base64: string };

export type FotoAnaliz = {
  tespit: string;
  parcalar: string[];
  is_suresi_saat: number;
  aciliyet: string;
  guven: number;
  oneriler: string[];
  guvenlik: string | null;
};

export type BasariliSonuc = {
  analiz: FotoAnaliz;
  saglayici: string;
  model: string;
};

export type DenemeHatasi = {
  saglayici: string;
  model: string;
  envAdi: string;
  durum?: number;
  mesaj: string;
};

/** Tüm sağlayıcılar başarısız olduğunda fırlatılır (mesaj ekrana gider). */
export class AiHatasi extends Error {
  hatalar: DenemeHatasi[];

  constructor(mesaj: string, hatalar: DenemeHatasi[] = []) {
    super(mesaj);
    this.name = 'AiHatasi';
    this.hatalar = hatalar;
  }
}

// ─── SÜRE SINIRLARI ─────────────────────────────────────────────────────────
// İstek en fazla 25 sn sürer; tek bir model denemesi 18 sn'den uzun sürmez
// (böylece bir model takılırsa yedeğe geçecek süre kalır).
export const TOPLAM_BUTCE_MS = 25_000;
const DENEME_SINIRI_MS = 18_000;
const ASGARI_KALAN_MS = 1_500;

// Google'ın önerdiği güncel model başta; 404/503 alındıkça sıradakine geçilir.
// "gemini-flash-latest" takma adı bilinçli olarak listede yok: aynı (yoğun)
// modele yönlendirdiği için yedeğe geçişi sadece geciktiriyor.
const VARSAYILAN_GEMINI_MODELLERI = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
];

const MAKS_MODEL_DENEMESI = 5;

// ─── ENV OKUMA ──────────────────────────────────────────────────────────────

const env = (ad: string): string => String(process.env[ad] || '').trim();

/** Gemini anahtarı: GOOGLE_GENERATIVE_AI_API_KEY (tercih) veya GEMINI_API_KEY. */
export function geminiAnahtari(): { anahtar: string; envAdi: string } | null {
  for (const ad of ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY']) {
    const deger = env(ad);
    if (deger) return { anahtar: deger, envAdi: ad };
  }
  return null;
}

/** Model adları: FOTO_ANALIZ_MODEL → GEMINI_MODEL → yerleşik liste. */
export function geminiModelleri(): string[] {
  const ham = env('FOTO_ANALIZ_MODEL') || env('GEMINI_MODEL');
  const liste = ham ? ham.split(',') : VARSAYILAN_GEMINI_MODELLERI;
  const temiz = Array.from(new Set(liste.map((m) => m.trim()).filter(Boolean)));
  return temiz.slice(0, MAKS_MODEL_DENEMESI);
}

type OpenAiUyumlu = {
  saglayici: string;
  url: string;
  anahtarEnv: string;
  modelEnv: string;
};

// OpenAI uyumlu sağlayıcılar — anahtar VE model birlikte tanımlıysa zincire girer
// (model adı uydurulmaz; kullanıcı env'de belirtir).
const OPENAI_UYUMLU: OpenAiUyumlu[] = [
  { saglayici: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions', anahtarEnv: 'OPENROUTER_API_KEY', modelEnv: 'OPENROUTER_MODEL' },
  { saglayici: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', anahtarEnv: 'GROQ_API_KEY', modelEnv: 'GROQ_MODEL' },
  { saglayici: 'openai', url: 'https://api.openai.com/v1/chat/completions', anahtarEnv: 'OPENAI_API_KEY', modelEnv: 'OPENAI_MODEL' },
  { saglayici: 'mistral', url: 'https://api.mistral.ai/v1/chat/completions', anahtarEnv: 'MISTRAL_API_KEY', modelEnv: 'MISTRAL_MODEL' },
];

const VARSAYILAN_SIRA = ['gemini', 'openrouter', 'groq', 'openai', 'mistral'];

/**
 * Sağlayıcı önceliği: FOTO_ANALIZ_SAGLAYICI (virgülle) ile değiştirilebilir.
 * Örn: "openrouter,gemini" → önce OpenRouter, sonra Gemini.
 * Liste dışı sağlayıcılar yedek olarak sona eklenir (tek sağlayıcıya kilitlenme yok).
 */
export function saglayiciSirasi(): string[] {
  const ham = env('FOTO_ANALIZ_SAGLAYICI').toLowerCase();
  if (!ham) return VARSAYILAN_SIRA;
  const istenen = Array.from(
    new Set(ham.split(',').map((s) => s.trim()).filter((s) => VARSAYILAN_SIRA.includes(s)))
  );
  const kalan = VARSAYILAN_SIRA.filter((s) => !istenen.includes(s));
  return [...istenen, ...kalan];
}

/** Anahtar hiç tanımlı değilse gösterilecek Türkçe yönlendirme. */
export function yapilandirmaMesaji(): string {
  return [
    'API anahtarı tanımlı değil — fotoğraf analizi yapılamıyor.',
    'Vercel → Settings → Environment Variables bölümüne şunlardan birini ekleyin:',
    '• GOOGLE_GENERATIVE_AI_API_KEY (Gemini — önerilen; GEMINI_API_KEY de kabul edilir)',
    '• OPENROUTER_API_KEY + OPENROUTER_MODEL',
    '• GROQ_API_KEY + GROQ_MODEL',
    '• OPENAI_API_KEY + OPENAI_MODEL',
    '• MISTRAL_API_KEY + MISTRAL_MODEL',
    'Tanımladıktan sonra yeniden deploy edin (env değişikliği eski build\'e yansımaz).',
  ].join(' ');
}

// ─── PROMPT ─────────────────────────────────────────────────────────────────

export function fotoAnalizPromptu(baglam: {
  musteri?: string | null;
  is_tipi?: string | null;
  aciklama?: string | null;
}): string {
  const satirlar = [
    baglam.musteri ? `Müşteri: ${baglam.musteri}` : '',
    baglam.is_tipi ? `İş tipi: ${baglam.is_tipi}` : '',
    baglam.aciklama ? `Personelin notu: ${baglam.aciklama}` : '',
  ].filter(Boolean);
  const ek = satirlar.length ? `\n\nBAĞLAM:\n${satirlar.join('\n')}` : '';

  return `Sen BUVİSAN Vinç Servisi'nde çalışan DENEYİMLİ bir vinç/asansör teknisyenisin.
Aşağıdaki fotoğraf bir vinç veya asansör arızasını gösteriyor.${ek}

Fotoğrafı incele ve SADECE aşağıdaki JSON formatında cevap ver (başka hiçbir şey yazma):

{
  "tespit": "Arızanın ne olduğunu 1-2 cümleyle açıkla (Türkçe, teknik ama anlaşılır)",
  "parcalar": ["Değişmesi gereken parça 1", "Parça 2"],
  "is_suresi_saat": 2.5,
  "aciliyet": "KRİTİK|YÜKSEK|ORTA|DÜŞÜK",
  "guven": 75,
  "oneriler": ["Ek kontrol önerisi 1", "Öneri 2"],
  "guvenlik": "İş güvenliği uyarısı varsa yaz, yoksa null"
}

KURALLAR:
- "guven": fotoğraf net değilse veya emin değilsen DÜŞÜK ver (30-50). Emin olduğunda 80-95.
- "parcalar": vinç parçalarının standart isimlerini kullan (Rulman 6205, Halat, Keçe, Fren balatası, Hidrolik valf, Switch, Sensör, Motor, Redüktör, Kanca, Makara vb.)
- "aciliyet": makine çalışmıyorsa/güvenlik riski varsa KRİTİK, üretim duruyorsa YÜKSEK
- "is_suresi_saat": gerçekçi bir tahmin (0.5 - 16 arası)
- Fotoğrafta vinç/asansörle ilgili bir şey YOKSA: {"tespit":"Fotoğrafta vinç/asansör arızası tespit edilemedi","parcalar":[],"is_suresi_saat":0,"aciliyet":"DÜŞÜK","guven":10,"oneriler":["Daha net bir fotoğraf çekin"],"guvenlik":null}
- Türkçe karakterleri doğru kullan.
- SADECE JSON döndür, açıklama ekleme.`;
}

// ─── HATA ÇEVİRİSİ ──────────────────────────────────────────────────────────

const metinKirp = (metin: string, uzunluk = 300): string => {
  const temiz = String(metin || '').replace(/\s+/g, ' ').trim();
  return temiz.length > uzunluk ? `${temiz.slice(0, uzunluk)}…` : temiz;
};

/** API anahtarı hata mesajlarına/loglara sızmasın. */
const maskele = (metin: string, anahtar?: string): string =>
  anahtar ? String(metin).split(anahtar).join('***') : String(metin);

function saglayiciMesaji(ham: string): string {
  try {
    const j = JSON.parse(ham);
    return metinKirp(
      String(j?.error?.message || j?.message || j?.error || j?.detail || j?.hata || '')
    );
  } catch {
    return metinKirp(ham);
  }
}

function saglayiciKodu(ham: string): string {
  try {
    const j = JSON.parse(ham);
    // Google hata gövdesinde asıl sebep error.details[].reason içinde olabilir
    // (ör. API_KEY_INVALID); OpenAI uyumlular error.code/type kullanır.
    const detaylar = Array.isArray(j?.error?.details)
      ? j.error.details.map((d: any) => String(d?.reason || d?.['@type'] || '')).join(' ')
      : '';
    return `${j?.error?.status || j?.error?.code || j?.error?.type || j?.status || j?.code || ''} ${detaylar}`
      .toUpperCase()
      .trim();
  } catch {
    return '';
  }
}

/**
 * Sağlayıcının döndürdüğü ham hatayı anlaşılır Türkçe mesaja çevirir.
 * Mesajın sonuna sağlayıcının kendi açıklaması eklenir (teşhis için).
 */
export function hataCevirisi(opts: {
  saglayici: string;
  model: string;
  envAdi: string;
  durum: number;
  ham: string;
}): string {
  const { saglayici, model, envAdi, durum, ham } = opts;
  const mesaj = saglayiciMesaji(ham);
  const kod = saglayiciKodu(ham);
  const ek = mesaj ? ` Sağlayıcı: ${mesaj}` : '';

  // Model kullanımdan kaldırılmış / adı yanlış (404 NOT_FOUND)
  if (
    durum === 404 ||
    kod.includes('NOT_FOUND') ||
    /not found|no longer available|is not supported|does not exist|unknown model|model_not_found|deprecated/i.test(mesaj)
  ) {
    return `Model bulunamadı (${saglayici}: ${model}). Model kullanımdan kaldırılmış olabilir — güncel model adını GEMINI_MODEL / FOTO_ANALIZ_MODEL env değişkenine yazın (ör. gemini-3.8-flash).${ek}`;
  }
  // Anahtar geçersiz
  if (
    durum === 401 ||
    kod.includes('UNAUTHENTICATED') ||
    kod.includes('API_KEY_INVALID') ||
    /api key not valid|invalid api key|incorrect api key|api key expired|unauthor|invalid_api_key/i.test(mesaj)
  ) {
    return `API anahtarı geçersiz (${envAdi}). Vercel'de ${envAdi} değerini yenileyip yeniden deploy edin.${ek}`;
  }
  // Yetki / izin
  if (durum === 403 || kod.includes('PERMISSION_DENIED')) {
    return `API anahtarı bu servise yetkili değil veya erişim kapalı (${envAdi}). Anahtarın ${saglayici} için etkin olduğunu kontrol edin.${ek}`;
  }
  // Kota / hız sınırı
  if (
    durum === 429 ||
    kod.includes('RESOURCE_EXHAUSTED') ||
    /quota|rate limit|too many requests|exceeded/i.test(mesaj)
  ) {
    return `Kota doldu / çok fazla istek (${saglayici}). Birkaç dakika sonra tekrar deneyin.${ek}`;
  }
  // Fotoğraf çok büyük
  if (durum === 413 || /inline data|image.{0,12}(large|big)|payload too large|request entity too large/i.test(mesaj)) {
    return `Fotoğraf yapay zeka servisi için çok büyük. Daha düşük çözünürlüklü bir fotoğrafla tekrar deneyin.${ek}`;
  }
  // Sunucu tarafı geçici sorun
  if (
    durum >= 500 ||
    kod.includes('UNAVAILABLE') ||
    kod.includes('INTERNAL') ||
    /overloaded|high demand|temporar|try again later/i.test(mesaj)
  ) {
    return `Yapay zeka servisi geçici olarak yanıt vermiyor (${saglayici} ${durum}). Birkaç dakika sonra tekrar deneyin.${ek}`;
  }
  if (durum === 400) {
    return `Sağlayıcı isteği reddetti (${saglayici} 400) — model görsel desteklemiyor olabilir.${ek}`;
  }
  return `Yapay zeka servisi hata verdi (${saglayici} ${durum}).${ek}`;
}

function agHataMesaji(saglayici: string, hata: any, sureMs: number): string {
  const ad = String(hata?.name || '');
  if (ad === 'TimeoutError' || ad === 'AbortError') {
    return `Yapay zeka ${Math.round(sureMs / 1000)} saniye içinde cevap vermedi (${saglayici}). Tekrar deneyin.`;
  }
  const metin = String(hata?.message || hata || '');
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(metin)) {
    return `Yapay zeka servisine ulaşılamadı (${saglayici}) — ağ/DNS hatası.`;
  }
  return `Yapay zeka isteği yapılamadı (${saglayici}): ${metinKirp(metin, 160)}`;
}

// ─── SAĞLAYICI ÇAĞRILARI ────────────────────────────────────────────────────

type CagriSonucu = { metin?: string; hata?: DenemeHatasi };

async function geminiDene(params: {
  anahtar: string;
  envAdi: string;
  model: string;
  gorsel: GorselGirdi;
  prompt: string;
  sureMs: number;
}): Promise<CagriSonucu> {
  const { anahtar, envAdi, model, gorsel, prompt, sureMs } = params;
  const hataYap = (mesaj: string, durum?: number): CagriSonucu => ({
    hata: { saglayici: 'gemini', model, envAdi, durum, mesaj },
  });

  // Anahtar adres çubuğunda DEĞİL, başlıkta → loglara/URL'lere sızmaz
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  let yanit: Response;
  try {
    yanit = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': anahtar },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: gorsel.tip, data: gorsel.base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1600,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(sureMs),
    });
  } catch (e: any) {
    return hataYap(agHataMesaji('gemini', e, sureMs));
  }

  const ham = await yanit.text();

  if (!yanit.ok) {
    // GERÇEK hata gövdesi burada loglanır (Vercel → Logs)
    console.error(
      `[foto-analiz] gemini/${model} → ${yanit.status} ${maskele(metinKirp(ham, 600), anahtar)}`
    );
    return hataYap(
      hataCevirisi({ saglayici: 'gemini', model, envAdi, durum: yanit.status, ham }),
      yanit.status
    );
  }

  let govde: any;
  try {
    govde = JSON.parse(ham);
  } catch {
    console.error(`[foto-analiz] gemini/${model} JSON dışı cevap: ${maskele(metinKirp(ham, 300), anahtar)}`);
    return hataYap('Yapay zeka servisi beklenmeyen bir cevap döndürdü (JSON değil).');
  }

  // Güvenlik filtresi / boş cevap
  const engel = govde?.promptFeedback?.blockReason || govde?.candidates?.[0]?.finishReason;
  const metin: string = Array.isArray(govde?.candidates?.[0]?.content?.parts)
    ? govde.candidates[0].content.parts
        .filter((p: any) => p?.text && p?.thought !== true)
        .map((p: any) => String(p.text))
        .join('')
        .trim()
    : '';

  if (!metin) {
    if (engel === 'SAFETY' || govde?.promptFeedback?.blockReason) {
      return hataYap('Fotoğraf güvenlik filtresine takıldı. Farklı bir fotoğrafla tekrar deneyin.');
    }
    return hataYap(`Yapay zeka boş cevap döndü${engel ? ` (${engel})` : ''}. Tekrar deneyin.`);
  }

  return { metin };
}

async function openaiDene(params: {
  tanim: OpenAiUyumlu;
  anahtar: string;
  model: string;
  gorsel: GorselGirdi;
  prompt: string;
  sureMs: number;
}): Promise<CagriSonucu> {
  const { tanim, anahtar, model, gorsel, prompt, sureMs } = params;
  const hataYap = (mesaj: string, durum?: number): CagriSonucu => ({
    hata: { saglayici: tanim.saglayici, model, envAdi: tanim.anahtarEnv, durum, mesaj },
  });

  let yanit: Response;
  try {
    yanit = await fetch(tanim.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anahtar}` },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${gorsel.tip};base64,${gorsel.base64}` } },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 1600,
      }),
      signal: AbortSignal.timeout(sureMs),
    });
  } catch (e: any) {
    return hataYap(agHataMesaji(tanim.saglayici, e, sureMs));
  }

  const ham = await yanit.text();

  if (!yanit.ok) {
    console.error(
      `[foto-analiz] ${tanim.saglayici}/${model} → ${yanit.status} ${maskele(metinKirp(ham, 600), anahtar)}`
    );
    return hataYap(
      hataCevirisi({
        saglayici: tanim.saglayici,
        model,
        envAdi: tanim.anahtarEnv,
        durum: yanit.status,
        ham,
      }),
      yanit.status
    );
  }

  let govde: any;
  try {
    govde = JSON.parse(ham);
  } catch {
    console.error(`[foto-analiz] ${tanim.saglayici}/${model} JSON dışı cevap: ${maskele(metinKirp(ham, 300), anahtar)}`);
    return hataYap('Yapay zeka servisi beklenmeyen bir cevap döndürdü (JSON değil).');
  }

  const secim = govde?.choices?.[0];
  const icerik = secim?.message?.content;
  const metin = String(
    Array.isArray(icerik)
      ? icerik.map((p: any) => p?.text || '').join('')
      : icerik || ''
  ).trim();

  if (!metin) {
    const neden = secim?.finish_reason;
    if (neden === 'content_filter') {
      return hataYap('Fotoğraf güvenlik filtresine takıldı. Farklı bir fotoğrafla tekrar deneyin.');
    }
    return hataYap(`Yapay zeka boş cevap döndü${neden ? ` (${neden})` : ''}. Tekrar deneyin.`);
  }

  return { metin };
}

// ─── ZİNCİR ─────────────────────────────────────────────────────────────────

type Deneme = {
  saglayici: string;
  model: string;
  envAdi: string;
  calistir: (sureMs: number) => Promise<CagriSonucu>;
};

function denemeleriKur(gorsel: GorselGirdi, prompt: string): Deneme[] {
  const denemeler: Deneme[] = [];

  for (const saglayici of saglayiciSirasi()) {
    if (saglayici === 'gemini') {
      const anahtar = geminiAnahtari();
      if (!anahtar) continue;
      for (const model of geminiModelleri()) {
        denemeler.push({
          saglayici: 'gemini',
          model,
          envAdi: anahtar.envAdi,
          calistir: (sureMs) =>
            geminiDene({ anahtar: anahtar.anahtar, envAdi: anahtar.envAdi, model, gorsel, prompt, sureMs }),
        });
      }
      continue;
    }

    const tanim = OPENAI_UYUMLU.find((t) => t.saglayici === saglayici);
    if (!tanim) continue;
    const anahtar = env(tanim.anahtarEnv);
    const model = env(tanim.modelEnv);
    if (!anahtar || !model) continue; // anahtar ve model birlikte gerekir

    denemeler.push({
      saglayici: tanim.saglayici,
      model,
      envAdi: tanim.anahtarEnv,
      calistir: (sureMs) => openaiDene({ tanim, anahtar, model, gorsel, prompt, sureMs }),
    });
  }

  return denemeler;
}

/** Hatalar arasından en çok işe yarayanı seçer (anahtar > izin > model > kota). */
function oncelikPuani(hata: DenemeHatasi): number {
  const d = hata.durum ?? 0;
  if (d === 401) return 90;
  if (d === 403) return 80;
  if (d === 404) return 70;
  if (d === 400 || d === 413) return 60;
  if (d === 429) return 50;
  if (d === 0) return 40; // ağ / zaman aşımı
  return 10; // 5xx
}

function ozetHataMesaji(hatalar: DenemeHatasi[]): string {
  if (hatalar.length === 0) return 'Yapay zeka servisi yanıt vermedi.';
  const secili = hatalar.reduce((a, b) => (oncelikPuani(b) > oncelikPuani(a) ? b : a), hatalar[0]);
  if (hatalar.length === 1) return secili.mesaj;

  const denenen = Array.from(new Set(hatalar.map((h) => `${h.saglayici}/${h.model}`))).join(', ');
  return `${secili.mesaj} (${hatalar.length} deneme başarısız: ${denenen})`;
}

// ─── ANALİZ ÇIKARMA ─────────────────────────────────────────────────────────

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

function analizNormallestir(ham: any, yedekMetin: string): FotoAnaliz {
  const a = ham && typeof ham === 'object' ? ham : {};
  const guven = Number(a.guven);
  const sure = Number(a.is_suresi_saat);
  const metinsel = typeof a.tespit === 'string' && a.tespit.trim() ? a.tespit.trim() : '';

  return {
    tespit: metinsel || metinKirp(yedekMetin, 400) || 'Tespit yapılamadı',
    parcalar: Array.isArray(a.parcalar)
      ? a.parcalar.map((p: any) => String(p).trim()).filter(Boolean).slice(0, 20)
      : [],
    is_suresi_saat: Number.isFinite(sure) ? Math.max(0, Math.min(24, sure)) : 0,
    aciliyet: typeof a.aciliyet === 'string' && a.aciliyet.trim() ? a.aciliyet.trim().toUpperCase() : 'ORTA',
    guven: Number.isFinite(guven) ? Math.max(0, Math.min(100, Math.round(guven))) : 0,
    oneriler: Array.isArray(a.oneriler)
      ? a.oneriler.map((o: any) => String(o).trim()).filter(Boolean).slice(0, 20)
      : [],
    guvenlik: typeof a.guvenlik === 'string' && a.guvenlik.trim() ? a.guvenlik.trim() : null,
  };
}

// ─── ANA GİRİŞ ──────────────────────────────────────────────────────────────

/**
 * Fotoğrafı sırayla sağlayıcılara gönderir; ilk başarılı analizi döndürür.
 * Hiçbiri başaramazsa AiHatasi fırlatır (mesajı doğrudan ekrana gösterilebilir).
 */
export async function fotoAnaliziCalistir(girdi: {
  gorsel: GorselGirdi;
  prompt: string;
  butceMs?: number;
}): Promise<BasariliSonuc> {
  const butceMs = Math.max(5_000, girdi.butceMs ?? TOPLAM_BUTCE_MS);
  const baslangic = Date.now();
  const denemeler = denemeleriKur(girdi.gorsel, girdi.prompt);

  // Hiç anahtar yok → uydurma cevap yok, net yönlendirme var
  if (denemeler.length === 0) throw new AiHatasi(yapilandirmaMesaji(), []);

  const hatalar: DenemeHatasi[] = [];

  for (const deneme of denemeler) {
    const kalan = butceMs - (Date.now() - baslangic);
    if (kalan < ASGARI_KALAN_MS) {
      hatalar.push({
        saglayici: deneme.saglayici,
        model: deneme.model,
        envAdi: deneme.envAdi,
        mesaj: 'Süre bütçesi doldu, bu sağlayıcı denenemedi.',
      });
      break;
    }

    const sonuc = await deneme.calistir(Math.min(kalan, DENEME_SINIRI_MS));

    if (sonuc.metin) {
      return {
        analiz: analizNormallestir(jsonCikar(sonuc.metin), sonuc.metin),
        saglayici: deneme.saglayici,
        model: deneme.model,
      };
    }

    hatalar.push(
      sonuc.hata ?? {
        saglayici: deneme.saglayici,
        model: deneme.model,
        envAdi: deneme.envAdi,
        mesaj: 'Bilinmeyen hata.',
      }
    );
    // 404 (model yok) / 401 (anahtar) / 429 / 5xx → sıradaki deneme
  }

  throw new AiHatasi(ozetHataMesaji(hatalar), hatalar);
}
