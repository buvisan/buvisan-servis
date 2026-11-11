import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ----------------------------------------------------------------------------
// BUVİSAN - SMS GÖNDERİM API'si 📨
// Netgsm / İletimerkezi desteği
// Env değişkenleri:
//   NETGSM_USERCODE  (örn: 8501234567)
//   NETGSM_PASSWORD
//   NETGSM_MSGHEADER (örn: BUVISAN)
//   SMS_SAĞLAYICI    (netgsm | iletimerkezi)
// ----------------------------------------------------------------------------

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

function netgsmVar(): boolean {
  return !!(process.env.NETGSM_USERCODE && process.env.NETGSM_PASSWORD && process.env.NETGSM_MSGHEADER);
}

// Netgsm ile tek SMS gönder
async function netgsmGonder(telefon: string, mesaj: string): Promise<{ ok: boolean; hata?: string }> {
  try {
    const tel = telefon.replace(/[^0-9]/g, "").replace(/^(90|0)/, "");
    if (tel.length < 10) return { ok: false, hata: "Geçersiz telefon" };

    const url = new URL("https://api.netgsm.com.tr/sms/send/get");
    url.searchParams.set("usercode", process.env.NETGSM_USERCODE || "");
    url.searchParams.set("password", process.env.NETGSM_PASSWORD || "");
    url.searchParams.set("gsmno", tel);
    url.searchParams.set("message", mesaj);
    url.searchParams.set("msgheader", process.env.NETGSM_MSGHEADER || "");

    const res = await fetch(url.toString(), { method: "GET", signal: AbortSignal.timeout(15000) });
    const text = (await res.text()).trim();

    // Netgsm: "00 <id>" başarılı, "20/30/40/..." hata
    if (text.startsWith("00")) return { ok: true };
    return { ok: false, hata: "Netgsm: " + text };
  } catch (e: any) {
    return { ok: false, hata: e?.message || "Ağ hatası" };
  }
}

// İletimerkezi
async function iletimerkeziGonder(telefon: string, mesaj: string): Promise<{ ok: boolean; hata?: string }> {
  try {
    const tel = telefon.replace(/[^0-9]/g, "").replace(/^(90|0)/, "");
    const body = {
      request: {
        authentication: {
          key: process.env.ILETIMERKEZI_KEY || "",
          hash: process.env.ILETIMERKEZI_HASH || "",
        },
        order: {
          sender: process.env.ILETIMERKEZI_SENDER || "BUVISAN",
          sendDateTime: [],
          iys: "1",
          message: {
            text: mesaj,
            receivers: { number: [tel] },
          },
        },
      },
    };
    const res = await fetch("https://api.iletimerkezi.com/v1/send-sms/json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data: any = await res.json();
    if (data?.response?.status?.code === 200) return { ok: true };
    return { ok: false, hata: "İletimerkezi: " + JSON.stringify(data?.response?.status) };
  } catch (e: any) {
    return { ok: false, hata: e?.message || "Ağ hatası" };
  }
}

function yetkiliMi(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return true;
  const header = req.headers.get("authorization") || "";
  const q = req.nextUrl.searchParams.get("secret") || "";
  return header === `Bearer ${secret}` || q === secret;
}
export async function POST(req: NextRequest) {
  if (!yetkiliMi(req)) return NextResponse.json({ ok: false, mesaj: "Yetkisiz" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 20, 50);

    // Sağlayıcı seç
    const saglayici = (process.env.SMS_SAĞLAYICI || "netgsm").toLowerCase();
    const hazir = saglayici === "iletimerkezi"
      ? !!(process.env.ILETIMERKEZI_KEY && process.env.ILETIMERKEZI_HASH)
      : netgsmVar();

    if (!hazir) {
      // Sağlayıcı yok — sadece bilgi dön (kuyruk durur)
      const { count } = await supabase
        .from("sms_kuyrugu")
        .select("id", { count: "exact", head: true })
        .eq("durum", "bekliyor");

      return NextResponse.json({
        ok: false,
        saglayici_yok: true,
        bekleyen: count || 0,
        mesaj: "SMS sağlayıcı yapılandırılmamış. Env değişkenlerini ekleyin: NETGSM_USERCODE, NETGSM_PASSWORD, NETGSM_MSGHEADER",
      });
    }

    // Bekleyen SMS'leri al
    const { data: kuyruk, error } = await supabase
      .from("sms_kuyrugu")
      .select("*")
      .eq("durum", "bekliyor")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) return NextResponse.json({ ok: false, mesaj: error.message }, { status: 500 });
    if (!kuyruk || kuyruk.length === 0) {
      return NextResponse.json({ ok: true, gonderilen: 0, mesaj: "Bekleyen SMS yok." });
    }

    let basarili = 0;
    let hatali = 0;

    for (const sms of kuyruk) {
      const sonuc = saglayici === "iletimerkezi"
        ? await iletimerkeziGonder(sms.telefon, sms.mesaj)
        : await netgsmGonder(sms.telefon, sms.mesaj);

      if (sonuc.ok) {
        basarili++;
        await supabase.from("sms_kuyrugu")
          .update({ durum: "gonderildi", gonderim: new Date().toISOString() })
          .eq("id", sms.id);
      } else {
        hatali++;
        await supabase.from("sms_kuyrugu")
          .update({ durum: "hata", hata_mesaji: sonuc.hata || "Bilinmeyen hata" })
          .eq("id", sms.id);
      }
    }

    return NextResponse.json({
      ok: true,
      gonderilen: basarili,
      hatali,
      toplam: kuyruk.length,
      mesaj: `${basarili} SMS gönderildi, ${hatali} hata.`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, mesaj: e?.message || "Sunucu hatası" }, { status: 500 });
  }
}

// GET → kuyruk durumu
export async function GET() {
  try {
    const saglayici = (process.env.SMS_SAĞLAYICI || "netgsm").toLowerCase();
    const hazir = saglayici === "iletimerkezi"
      ? !!(process.env.ILETIMERKEZI_KEY && process.env.ILETIMERKEZI_HASH)
      : netgsmVar();

    const { data: bekleyen } = await supabase
      .from("sms_kuyrugu").select("id,telefon,mesaj,created_at")
      .eq("durum", "bekliyor").order("created_at", { ascending: true }).limit(10);

    const { count: toplamBekleyen } = await supabase
      .from("sms_kuyrugu").select("id", { count: "exact", head: true }).eq("durum", "bekliyor");

    return NextResponse.json({
      ok: true,
      saglayici,
      hazir,
      bekleyen_sayi: toplamBekleyen || 0,
      bekleyen: bekleyen || [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, mesaj: e?.message }, { status: 500 });
  }
}
