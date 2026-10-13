import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ----------------------------------------------------------------------------
// 🎤 SESLİ RAPOR — konuşulan metni rapor alanlarına ayırır
// ----------------------------------------------------------------------------
//  Teknisyen ses kaydeder → Google Gemini'ye gider → şu alanlar çıkar:
//    • arizanin_cinsi  (arıza tanımı)
//    • yapilan_isler   (yapılan işler)
//    • sure_dakika     (tahmini süre)
//    • parcalar        (kullanılan parçalar — dizi)
//
//  ⚠️ YETKİ: adminMi() KULLANILMAZ — çünkü saha personeli yönetici değil.
//     Bunun yerine "geçerli oturum" kontrolü yapılır (her giriş yapmış
//     kullanıcı kendi raporunu sesle doldurabilir).
// ----------------------------------------------------------------------------

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'gemini-2.0-flash';

export async function POST(req: NextRequest) {
  // --- Yetki: geçerli oturum yeterli (personel de kullanacak) ---
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!token) {
    return NextResponse.json({ ok: false, mesaj: 'Giriş gerekli.' }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ ok: false, mesaj: 'Sunucu yapılandırması eksik.' }, { status: 500 });
  }

  const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) {
    return NextResponse.json({ ok: false, mesaj: 'Oturum geçersiz.' }, { status: 403 });
  }

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

  const sesBase64: string = govde?.ses || '';
  const mime: string = govde?.mime || 'audio/webm';
  const baglam: string = govde?.baglam || '';

  if (!sesBase64 || sesBase64.length < 100) {
    return NextResponse.json({ ok: false, mesaj: 'Ses kaydı boş görünüyor.' }, { status: 400 });
  }

  try {
    const istek = {
      contents: [{
        parts: [
          {
            text:
              'Bir vinç/asansör servis teknisyeni, yaptığı işi SESLİ olarak anlattı. ' +
              'Türkçe konuşuyor. Anlattıklarını rapor alanlarına ayır.\n\n' +
              (baglam ? 'BİLİNEN BİLGİLER: ' + baglam + '\n\n' : '') +
              'KURALLAR:\n' +
              '- arizanin_cinsi: makinede ne arıza olduğu (kısa, net)\n' +
              '- yapilan_isler: ne yapıldığı (teknisyenin ağzından, resmi dille, 2-4 cümle)\n' +
              '- sure_dakika: konuşulan süre (sayı, dakika). Belirtilmemişse null\n' +
              '- parcalar: kullanılan/değişen parçaların adları (dizi). Yoksa boş dizi\n\n' +
              'SADECE şu JSON ile cevap ver, başka hiçbir şey yazma:\n' +
              '{"arizanin_cinsi":"...","yapilan_isler":"...","sure_dakika":null,"parcalar":[]}',
          },
          { inline_data: { mime_type: mime, data: sesBase64 } },
        ],
      }],
      generationConfig: { temperature: 0.15, maxOutputTokens: 1024 },
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

    let veri: any = {};
    try {
      const eslesme = ham.match(/\{[\s\S]*\}/);
      veri = eslesme ? JSON.parse(eslesme[0]) : {};
    } catch {
      return NextResponse.json(
        { ok: false, mesaj: 'Konuşma çözümlenemedi, tekrar deneyin.' },
        { status: 422 }
      );
    }

    if (!veri.arizanin_cinsi && !veri.yapilan_isler) {
      return NextResponse.json(
        { ok: false, mesaj: 'Konuşmadan rapor çıkarılamadı. Daha net konuşup tekrar deneyin.' },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      arizanin_cinsi: veri.arizanin_cinsi || '',
      yapilan_isler: veri.yapilan_isler || '',
      sure_dakika: veri.sure_dakika ?? null,
      parcalar: Array.isArray(veri.parcalar) ? veri.parcalar.filter((x: any) => typeof x === 'string' && x.trim()) : [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, mesaj: 'Sesli rapor sırasında hata oluştu.', detay: String(e?.message || e).slice(0, 300) },
      { status: 500 }
    );
  }
}
