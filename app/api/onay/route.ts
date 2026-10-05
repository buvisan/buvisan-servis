import { NextResponse } from "next/server";
import { db, mimliBul } from "@/lib/agent-tools";

async function adminKullanici(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return null;
  const { data: prof } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  return prof?.role === "admin" ? u.user : null;
}

export async function GET(req: Request) {
  if (!(await adminKullanici(req))) return NextResponse.json({ hata: "Yetki yok" }, { status: 403 });
  const { data } = await db
    .from("bekleyen_onaylar")
    .select("id, created_at, tur, ozet, veri")
    .eq("durum", "bekliyor")
    .order("created_at", { ascending: false })
    .limit(20);
  return NextResponse.json({ onaylar: data ?? [] });
}

export async function POST(req: Request) {
  const user = await adminKullanici(req);
  if (!user) return NextResponse.json({ hata: "Yetki yok" }, { status: 403 });

  const { id, karar } = await req.json();
  if (!id || !["onayla", "reddet"].includes(karar))
    return NextResponse.json({ hata: "Geçersiz istek" }, { status: 400 });

  // Kaydı "sahiplen": çift tıklamada iki kez işlenmesin
  const { data: kayit } = await db
    .from("bekleyen_onaylar")
    .update({
      durum: karar === "onayla" ? "isleniyor" : "reddedildi",
      karar_veren: user.email,
      karar_zamani: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("durum", "bekliyor")
    .select("*")
    .maybeSingle();
  if (!kayit) return NextResponse.json({ hata: "Bu kayıt zaten işlenmiş ya da yok." }, { status: 409 });

  if (karar === "reddet") return NextResponse.json({ mesaj: "Taslak reddedildi, hiçbir şey kaydedilmedi." });

  try {
    if (kayit.tur !== "teklif") throw new Error("Bilinmeyen işlem türü");
    const t = kayit.veri.teklif;

    const mimli = await mimliBul(t.customer_name);
    if (mimli.length) throw new Error("Firma mimli listede, kayıt yapılmadı.");

    const gun = (ek: number) =>
      new Date(Date.now() + ek * 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });

    const { error } = await db.from("offers").insert({ ...t, offer_date: gun(0), valid_until: gun(15) });
    if (error) throw new Error(error.message);

    await db.from("bekleyen_onaylar").update({ durum: "onaylandi" }).eq("id", id);
    return NextResponse.json({ mesaj: `Teklif kaydedildi: ${t.customer_name}. Teklifler sayfasında "beklemede" görünür.` });
  } catch (e: any) {
    // Hata olursa kayıt tekrar beklemeye döner
    await db.from("bekleyen_onaylar").update({ durum: "bekliyor", karar_veren: null, karar_zamani: null }).eq("id", id);
    return NextResponse.json({ hata: "Kaydedilemedi: " + e.message }, { status: 500 });
  }
}