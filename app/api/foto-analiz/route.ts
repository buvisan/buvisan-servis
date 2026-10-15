import { NextRequest, NextResponse } from 'next/server';
import { adminMi, yetkiYok } from '@/lib/api-yetki';

// ----------------------------------------------------------------------------
// 📸 FOTOĞRAFTAN ARIZA TESPİTİ (Yapay Zeka)
// ----------------------------------------------------------------------------
//  Personel arızalı parçanın fotoğrafını çeker → Gemini Vision analiz eder:
//    • Ne olduğu (arıza tespiti)
//    • Hangi parçanın değişmesi gerektiği
//    • Tahmini iş süresi
//    • Aciliyet seviyesi
//    • Güven yüzdesi
//
//  ⚠️ Sadece yönetici/oturum sahibi çağırabilir. Fotoğraf sunucuda SAKLANMAZ.
//  ⚠️ Model: gemini-2.0-flash (mevcut ses çeviri API'siyle aynı)
// ----------------------------------------------------------------------------

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'gemini-2.0-flash';

export async function POST(req: NextRequest) {
  // ⚠️ DİKKAT: adminMi() bir NESNE döndürür ({ ok: true/false })
  const yetki = await adminMi(req);
  if (!yetki.ok) return yetkiYok();

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, mesaj: 'GOOGLE_GENERATIVE_AI_API_KEY tanımlı değil.' },
      { status: 500 }
    );
  }

  let govde: any;
  try {
    govde = await req.json();
  } catch {
    return NextResponse.json({ ok: false, mesaj: 'Geçersiz istek.' }, { status: 400 });
  }

  const { gorsel, mimeType, musteri, is_tipi, aciklama } = govde || {};

  if (!gorsel || typeof gorsel !== 'string') {
    return NextResponse.json({ ok: false, mesaj: 'Fotoğraf gönderilmedi.' }, { status: 400 });
  }

  // Base64 veri URI'sini ayıkla (data:image/jpeg;base64,...)
  let temizBase64 = gorsel;
  let tip = mimeType || 'image/jpeg';
  if (gorsel.startsWith('data:')) {
    const eslesme = gorsel.match(/^data:([^;]+);base64,(.+)$/);
    if (eslesme) {
      tip = eslesme[1];
      temizBase64 = eslesme[2];
    }
  }

  // Boyut kontrolü (yaklaşık 8 MB sınırı)
  if (temizBase64.length > 11_000_000) {
    return NextResponse.json(
      { ok: false, mesaj: 'Fotoğraf çok büyük. Lütfen daha küçük bir fotoğraf çekin.' },
      { status: 413 }
    );
  }

  const baglam = [
    musteri ? `Müşteri: ${musteri}` : '',
    is_tipi ? `İş tipi: ${is_tipi}` : '',
    aciklama ? `Personelin notu: ${aciklama}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `Sen BUVİSAN Vinç Servisi'nde çalışan DENEYİMLİ bir vinç/asansör teknisyenisin.
Aşağıdaki fotoğraf bir vinç veya asansör arızasını gösteriyor.${baglam ? `\n\nBAĞLAM:\n${baglam}` : ''}

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

  try {
    const yanit = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: tip, data: temizBase64 } },
            ],
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1200,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!yanit.ok) {
      const hataMetni = await yanit.text();
      console.error('Gemini fotoğraf hatası:', yanit.status, hataMetni.slice(0, 300));
      return NextResponse.json(
        { ok: false, mesaj: `Yapay zeka servisi hata verdi (${yanit.status}).` },
        { status: 502 }
      );
    }

    const sonuc = await yanit.json();
    const metin: string =
      sonuc?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('') || '';

    if (!metin) {
      return NextResponse.json(
        { ok: false, mesaj: 'Yapay zeka boş cevap döndü. Tekrar deneyin.' },
        { status: 502 }
      );
    }

    // JSON'u ayrıştır (model bazen ```json ... ``` sarmalayabilir)
    let analiz: any;
    try {
      const temiz = metin.replace(/```json/gi, '').replace(/```/g, '').trim();
      analiz = JSON.parse(temiz);
    } catch {
      console.warn('JSON ayrıştırılamadı, ham metin dönülüyor:', metin.slice(0, 200));
      analiz = {
        tespit: metin.slice(0, 400),
        parcalar: [],
        is_suresi_saat: 0,
        aciliyet: 'ORTA',
        guven: 30,
        oneriler: ['Sonuç metin olarak geldi'],
        guvenlik: null,
      };
    }

    return NextResponse.json({
      ok: true,
      analiz: {
        tespit: analiz.tespit || 'Tespit yapılamadı',
        parcalar: Array.isArray(analiz.parcalar) ? analiz.parcalar : [],
        is_suresi_saat: Number(analiz.is_suresi_saat) || 0,
        aciliyet: analiz.aciliyet || 'ORTA',
        guven: Math.max(0, Math.min(100, Number(analiz.guven) || 0)),
        oneriler: Array.isArray(analiz.oneriler) ? analiz.oneriler : [],
        guvenlik: analiz.guvenlik || null,
      },
      model: MODEL,
    });
  } catch (e: any) {
    console.error('Fotoğraf analizi hatası:', e?.message);
    return NextResponse.json(
      { ok: false, mesaj: 'Analiz sırasında hata oluştu: ' + (e?.message || 'bilinmeyen') },
      { status: 500 }
    );
  }
}
