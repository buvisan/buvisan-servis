import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
const webpush = require("web-push");

// ----------------------------------------------------------------------------
// BUVİSAN - PUSH BİLDİRİM GÖNDERİM API'si 🔔
// Env: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (mailto:...)
// ----------------------------------------------------------------------------

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const VAPID_PUBLIC = process.env.VAPID_PUBLIC
  || "BCR-gpY1Syhdjl2ZRynMJJdN1mFAnRl1FURCLcVZPPrn7e2_tFA5gpxPrSS-59kBajrgFeHgGtnFlT3tI286hFI";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE
  || "7avoa1QJz2jWDnVOFhQM1BxrLXnha_BNGjg8aJRq_hQ";

try {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:info@zmmetal.com.tr",
    VAPID_PUBLIC,
    VAPID_PRIVATE
  );
} catch { /* yoksay */ }

// POST → bekleyen bildirimleri gönder
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
    const limit = Math.min(Number(body.limit) || 30, 100);

    // Bekleyen bildirimler
    const { data: kuyruk, error } = await supabase
      .from("bildirim_kuyrugu")
      .select("*")
      .eq("durum", "bekliyor")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) return NextResponse.json({ ok: false, mesaj: error.message }, { status: 500 });
    if (!kuyruk || kuyruk.length === 0) {
      return NextResponse.json({ ok: true, gonderilen: 0, mesaj: "Bekleyen bildirim yok." });
    }

    // Aktif abonelikler
    const { data: abonelikler } = await supabase
      .from("push_abonelikler")
      .select("*")
      .eq("aktif", true);

    let basarili = 0;
    let hatali = 0;
    let olu = 0;

    for (const bildirim of kuyruk) {
      // Hedef abonelikleri filtrele
      const hedefler = (abonelikler || []).filter((a: any) => {
        if (bildirim.hedef_rol === "hepsi") return true;
        if (bildirim.hedef_rol === a.rol) {
          if (!bildirim.hedef_kisi) return true;
          return String(a.kullanici || "").toUpperCase().includes(String(bildirim.hedef_kisi).toUpperCase());
        }
        return false;
      });

      if (hedefler.length === 0) {
        await supabase.from("bildirim_kuyrugu")
          .update({ durum: "gonderildi", gonderim: new Date().toISOString() })
          .eq("id", bildirim.id);
        continue;
      }

      const payload = JSON.stringify({
        baslik: bildirim.baslik,
        mesaj: bildirim.mesaj,
        url: bildirim.url || "/",
        oncelik: bildirim.oncelik || "normal",
      });

      let bildirimBasarili = false;

      for (const ab of hedefler) {
        try {
          const abonelik = {
            endpoint: ab.endpoint,
            keys: { p256dh: ab.p256dh, auth: ab.auth },
          };
          await webpush.sendNotification(abonelik, payload);
          bildirimBasarili = true;
          basarili++;
        } catch (e: any) {
          // 404/410 → abonelik ölü, deaktive et
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            olu++;
            await supabase.from("push_abonelikler").update({ aktif: false }).eq("id", ab.id);
          } else {
            hatali++;
          }
        }
      }

      if (bildirimBasarili) {
        await supabase.from("bildirim_kuyrugu")
          .update({ durum: "gonderildi", gonderim: new Date().toISOString() })
          .eq("id", bildirim.id);
      }
    }

    return NextResponse.json({
      ok: true,
      gonderilen: basarili,
      hatali,
      olu_abonelik: olu,
      bildirim_sayisi: kuyruk.length,
      abonelik_sayisi: (abonelikler || []).length,
      mesaj: `${basarili} push gönderildi (${kuyruk.length} bildirim · ${(abonelikler || []).length} cihaz)`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, mesaj: e?.message || "Sunucu hatası" }, { status: 500 });
  }
}

// GET → durum
export async function GET() {
  try {
    const { count: bekleyen } = await supabase
      .from("bildirim_kuyrugu").select("id", { count: "exact", head: true }).eq("durum", "bekliyor");
    const { count: abonelik } = await supabase
      .from("push_abonelikler").select("id", { count: "exact", head: true }).eq("aktif", true);

    return NextResponse.json({
      ok: true,
      vapid_public: VAPID_PUBLIC,
      bekleyen_bildirim: bekleyen || 0,
      aktif_abonelik: abonelik || 0,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, mesaj: e?.message }, { status: 500 });
  }
}
