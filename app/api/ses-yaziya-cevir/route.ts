import { NextRequest, NextResponse } from 'next/server';
import { adminMi, yetkiYok } from '@/lib/api-yetki';

// ----------------------------------------------------------------------------
// SES KAYDINI YAZIYA ÇEVİR + ÖZETLE + ARIZA TİPİ TESPİT ET
// ----------------------------------------------------------------------------
//  Müşterinin bıraktığı ses kaydını Google Gemini'ye gönderir:
//    • Tam metin (transkript)
//    • Kısa özet (ofis 12 dakika dinlemesin)
//    • Arıza tipi + aciliyet
//  Sonucu ses_cozumleri tablosuna kaydeder → aranabilir olur.
//
//  ⚠️ Sadece yönetici çağırabilir. Ses dosyası sunucuda saklanmaz.
// ----------------------------------------------------------------------------

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'gemini-2.0-flash';

export async function POST(req: NextRequest) {
  // ⚠️ DİKKAT: adminMi() bir NESNE döndürür ({ ok: true/false }).
  //    Doğru kullanım: (await adminMi(req)).ok
  const yetki = await adminMi(req);
  if (!yetki.ok) return yetkiYok();

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, mesaj: 'GOOGLE_GENERATIVE_AI_API_KEY tanımlı değil.' },
      { status: 501 }
    );
  }

  let govde: any;
  try {
    govde = await req.json();
  } catch {
    return NextResponse.json({ ok: false, mesaj: 'Geçersiz istek.' }, { status: 400 });
  }

  const { audio_url, musteri, ticket_id } = govde || {};
  if (!audio_url || typeof audio_url !== 'string') {
    return NextResponse.json({ ok: false, mesaj: 'audio_url gerekli.' }, { status: 400 });
  }

  try {
    // 1) Ses dosyasını indir
    const sesCevap = await fetch(audio_url);
    if (!sesCevap.ok) {
      return NextResponse.json({ ok: false, mesaj: 'Ses dosyası indirilemedi.' }, { status: 502 });
    }
    const buffer = Buffer.from(await sesCevap.arrayBuffer());

    // 2) Gemini'ye gönder
    const istek = {
      contents: [{
        parts: [
          {
            text:
              'Bu ses kaydı, bir vinç servis firmasının müşterisinin bıraktığı arıza bildirimidir. ' +
              'Türkçe konuşuluyor. Şunları yap:\n' +
              '1) Kaydı tam olarak yazıya çevir (transkript).\n' +
              '2) 1-2 cümlelik kısa özet çıkar.\n' +
              '3) Arıza tipini tespit et (örn: switch, halat, kumanda, motor, fren, elektrik).\n' +
              '4) Aciliyet belirle: ACİL (makine durdu) / NORMAL / DÜŞÜK.\n\n' +
              'SADECE şu JSON formatında cevap ver, başka hiçbir şey yazma:\n' +
              '{"metin":"...","ozet":"...","ariza_tipi":"...","aciliyet":"..."}',
          },
          { inline_data: { mime_type: 'audio/mpeg', data: buffer.toString('base64') } },
        ],
      }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    };

    const yanit = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(istek) }
    );

    if (!yanit.ok) {
      const hata = await yanit.text();
      return NextResponse.json(
        { ok: false, mesaj: 'Yapay zeka servisi yanıt vermedi.', detay: hata.slice(0, 300) },
        { status: 502 }
      );
    }

    const sonuc: any = await yanit.json();
    const ham: string = sonuc?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 3) JSON'u ayıkla
    let veri: any = {};
    try {
      const eslesme = ham.match(/\{[\s\S]*\}/);
      veri = eslesme ? JSON.parse(eslesme[0]) : {};
    } catch {
      veri = { metin: ham, ozet: null };
    }

    if (!veri.metin) {
      return NextResponse.json(
        { ok: false, mesaj: 'Kayıt çözümlenemedi (ses boş veya anlaşılmıyor olabilir).' },
        { status: 422 }
      );
    }

    // 4) Sonucu döndür.
    //    Kayıt işlemini SAYFA yapar (ses_cevirisi_kaydet RPC'si ile) —
    //    böylece sunucuda service_role anahtarı taşımaya gerek kalmaz.
    return NextResponse.json({
      ok: true,
      metin: veri.metin,
      ozet: veri.ozet || null,
      ariza_tipi: veri.ariza_tipi || null,
      aciliyet: veri.aciliyet || null,
      musteri: musteri || null,
      ticket_id: ticket_id || null,
      audio_url,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, mesaj: 'Çeviri sırasında hata oluştu.', detay: String(e?.message || e).slice(0, 300) },
      { status: 500 }
    );
  }
}
