import { NextRequest, NextResponse } from 'next/server';
import { adminMi, yetkiYok } from '@/lib/api-yetki';
import {
  AiHatasi,
  fotoAnalizPromptu,
  fotoAnaliziCalistir,
} from '@/lib/fotoAnalizAi';

// ----------------------------------------------------------------------------
// 📸 FOTOĞRAFTAN ARIZA TESPİTİ (Yapay Zeka)
// ----------------------------------------------------------------------------
//  Personel arızalı parçanın fotoğrafını çeker → yapay zeka analiz eder:
//    • Ne olduğu (arıza tespiti)      • Değişmesi gereken parça
//    • Tahmini iş süresi              • Aciliyet seviyesi
//    • Güven yüzdesi                  • İş güvenliği uyarısı
//
//  ⚠️ Sadece yönetici/oturum sahibi çağırabilir. Fotoğraf sunucuda SAKLANMAZ.
//  ⚠️ Sağlayıcı/model seçimi, zaman aşımı ve hata çevirisi: lib/fotoAnalizAi.ts
//     2026: Google gemini-2.0-flash'ı kapattı → API 404 NOT_FOUND döndürüyordu
//     ("Yapay zeka servisi hata verdi (404)"). Artık model adı env'den okunur
//     ve zincirde birden fazla model/sağlayıcı denenir.
// ----------------------------------------------------------------------------

export const runtime = 'nodejs';
export const maxDuration = 60;

// ~8 MB fotoğraf (base64 ~%33 büyür). Vercel gövde sınırının altında kalır.
const MAKS_BASE64 = 11_000_000;

export async function POST(req: NextRequest) {
  // ⚠️ DİKKAT: adminMi() bir NESNE döndürür ({ ok: true/false })
  const yetki = await adminMi(req);
  if (!yetki.ok) return yetkiYok();

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
  let tip = typeof mimeType === 'string' && mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
  if (gorsel.startsWith('data:')) {
    const eslesme = gorsel.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (eslesme) {
      tip = eslesme[1];
      temizBase64 = eslesme[2];
    }
  }

  // Boyut kontrolü (yaklaşık 8 MB sınırı)
  if (temizBase64.length > MAKS_BASE64) {
    return NextResponse.json(
      { ok: false, mesaj: 'Fotoğraf çok büyük. Lütfen daha küçük bir fotoğraf çekin.' },
      { status: 413 }
    );
  }

  try {
    const sonuc = await fotoAnaliziCalistir({
      gorsel: { tip, base64: temizBase64 },
      prompt: fotoAnalizPromptu({ musteri, is_tipi, aciklama }),
    });

    console.log(
      `[foto-analiz] başarılı · ${sonuc.saglayici}/${sonuc.model} · güven=${sonuc.analiz.guven}`
    );

    return NextResponse.json({
      ok: true,
      analiz: sonuc.analiz,
      saglayici: sonuc.saglayici,
      model: sonuc.model,
    });
  } catch (e: any) {
    // Beklenen hata: tüm sağlayıcılar denendi, mesaj Türkçe ve ekrana gider
    if (e instanceof AiHatasi) {
      console.error('[foto-analiz] başarısız →', e.message);
      if (e.hatalar.length) console.error('[foto-analiz] denemeler →', JSON.stringify(e.hatalar));

      // Anahtar hiç tanımlı değilse 500 (yapılandırma), aksi halde 502 (dış servis)
      const durum = e.hatalar.length === 0 ? 500 : 502;
      return NextResponse.json({ ok: false, mesaj: e.message, hatalar: e.hatalar }, { status: durum });
    }

    console.error('[foto-analiz] beklenmeyen hata →', e);
    return NextResponse.json(
      { ok: false, mesaj: 'Analiz sırasında beklenmeyen bir hata oluştu. Tekrar deneyin.' },
      { status: 500 }
    );
  }
}
