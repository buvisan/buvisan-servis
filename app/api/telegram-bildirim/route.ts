import { NextResponse } from "next/server";

// ----------------------------------------------------------------------------
// TELEGRAM BİLDİRİM UCU (sunucu tarafı)
// ----------------------------------------------------------------------------
// Bot anahtarı ARTIK İSTEMCİDE DEĞİL. Müşteri sayfaları sadece mesaj metnini
// buraya gönderir; anahtarı sunucu ekler. Böylece anahtar tarayıcı paketinden
// (herkesin indirdiği JS) tamamen çıkar.
//
// ⚠️ ÖNEMLİ: Mevcut bot anahtarı bu zamana kadar herkese açık pakette yayınlandı,
//    bu yüzden YAKILMIŞ sayılır. BotFather'dan /revoke ile YENİLENMELİ ve
//    Vercel'e TELEGRAM_BOT_TOKEN olarak eklenmelidir.
// ----------------------------------------------------------------------------

// Basit koruma: aynı IP'den dakikada en fazla 5 bildirim (sunucu örneği başına)
const sonGonderimler = new Map<string, number[]>();

function izinVarMi(ip: string): boolean {
  const simdi = Date.now();
  const gecmis = (sonGonderimler.get(ip) || []).filter((t) => simdi - t < 60_000);
  if (gecmis.length >= 5) return false;
  gecmis.push(simdi);
  sonGonderimler.set(ip, gecmis);
  return true;
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "bilinmeyen";

    if (!izinVarMi(ip)) {
      return NextResponse.json({ hata: "Çok fazla istek, biraz sonra tekrar deneyin." }, { status: 429 });
    }

    const { mesaj } = await req.json();

    if (!mesaj || typeof mesaj !== "string") {
      return NextResponse.json({ hata: "Mesaj boş" }, { status: 400 });
    }
    if (mesaj.length > 4000) {
      return NextResponse.json({ hata: "Mesaj çok uzun" }, { status: 400 });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN || "8567697885:AAGCSyckJKLG11HwTQaMGGUwMyXIm0UqAK0";
    const grup = process.env.TELEGRAM_GRUP_ID || "-5079408473";

    const gonder = async (parseMode?: string) => {
      const govde: any = { chat_id: grup, text: mesaj, disable_web_page_preview: true };
      if (parseMode) govde.parse_mode = parseMode;
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(govde),
      });
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok && j?.ok !== false, detay: j };
    };

    // Önce biçimli gönder; Markdown hatası olursa düz metin olarak tekrar dene
    // (müşteri adında _ veya * varsa Markdown 400 veriyordu → bildirim kayboluyordu)
    let sonuc = await gonder("Markdown");
    if (!sonuc.ok) {
      console.warn("Markdown ile gönderilemedi, düz metin deneniyor:", sonuc.detay?.description);
      sonuc = await gonder();
    }

    if (!sonuc.ok) {
      console.error("Telegram gönderim hatası:", sonuc.detay);
      return NextResponse.json({ hata: "Telegram'a gönderilemedi" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Telegram ucu hatası:", e);
    return NextResponse.json({ hata: "Sunucu hatası" }, { status: 500 });
  }
}
