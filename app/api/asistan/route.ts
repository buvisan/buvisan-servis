import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { db, tools, runTool } from "@/lib/agent-tools";

export const maxDuration = 60;

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
// DÜZELTME 1: Kota sorunu yaşamamak için Flash modelini sabitledik. (Pro modeli limitlere çabuk takılır)
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

const SYSTEM = `Sen Buvisan, Birikiton, ZM Çelik ve ZM Kumlama'nın servis, finans, depo ve operasyon asistanısın. Patronun Kaya.
Tablolar (veri_sorgula ile): blacklisted_companies (mimli), offers (teklifler), materials (depo fiyatları), completed_services (ciro), service_tickets (iş emirleri), service_reports, field_reports, cranes, crane_history, fleet_vehicles, fleet_fines, fleet_fuel, fleet_maintenance, maintenance_contracts, financial_records (month_key örn 2026-09).
Kurallar:
1. Bir firma için teklif/iş emri konuşulursa önce mimli_sirket_kontrol çağır.
2. Birikiton sadece 1 ve 2 tonluk monoray vinçlerdir.
3. Yetkin: okuma, not_kaydet, teklif_taslagi_hazirla. Teklifi doğrudan kaydedemezsin; taslak hazırlarsın.
4. Uydurma. Cevapta hangi veriye dayandığını kısaca belirt.
5. Türkçe, kısa ve net. Para birimi TL.
6. Hazır araç yetmezse veri_sorgula'yı dene.
7. En çok ciro/iş yapan müşteri için musteri_ciro_siralama kullan.
8. Kaya'nın kalıcı notlarına uy.
9. ÇOK ÖNEMLİ: Teklif hazırlarken ÖNCE "depo_fiyat_ara" KULLANMA! Doğrudan "teklif_taslagi_hazirla" aracını çağır, o araç fiyatları veritabanından kendisi otomatik bulacaktır. Tek tek fiyat arayıp sistemi yorma.
Bugünün tarihi: ${new Date().toLocaleDateString("tr-TR")}`;

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));
const gecici = (e: any) => /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|rate limit|timeout/i.test(String(e?.message ?? ""));

async function tekrar<T>(fn: () => Promise<T>): Promise<T> {
  let son: any;
  for (let i = 0; i < 2; i++) {
    try { return await fn(); } 
    catch (e: any) {
      son = e;
      if (!gecici(e)) throw e;
      const m = String(e?.message ?? "").match(/try again in ([\d.]+)\s*(ms|s)/i);
      const ms = m ? (m[2].toLowerCase() === "s" ? Number(m[1]) * 1000 : Number(m[1])) + 500 : 1500 * (i + 1);
      await bekle(Math.min(ms, 6000));
    }
  }
  throw son;
}

const sonucMetni = (out: any) => {
  const s = JSON.stringify(out);
  return s.length > 2000 ? s.slice(0, 2000) + " ...(sonuç kısaltıldı)" : s;
};

function gecmisiKisalt(mesajlar: any[]) {
  const m = mesajlar.slice(-6);
  while (m.length && m[0].role !== "user") m.shift();
  return m;
}

const geminiAraclar = tools.map((t: any) => ({
  name: t.name, description: t.description, parametersJsonSchema: t.input_schema,
}));

async function geminiCalistir(mesajlar: any[], kullanilan: string[], sistem: string): Promise<string> {
  const contents: any[] = gecmisiKisalt(mesajlar).map((m) => ({
    role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }],
  }));

  for (let tur = 0; tur < 4; tur++) {
    const res = await tekrar(() =>
      ai.models.generateContent({
        model: GEMINI_MODEL, contents,
        config: { systemInstruction: sistem, tools: [{ functionDeclarations: geminiAraclar }], maxOutputTokens: 800 },
      })
    );
    const calls = res.functionCalls;
    if (!calls || calls.length === 0) return res.text ?? "Cevap üretemedim.";

    contents.push(res.candidates![0].content);
    const parts: any[] = [];
    for (const c of calls) {
      kullanilan.push(c.name!);
      const out = await runTool(c.name!, c.args ?? {});
      parts.push({ functionResponse: { name: c.name, response: { sonuc: sonucMetni(out) } } });
    }
    contents.push({ role: "user", parts });
  }
  return "Çok fazla adım gerekti, soruyu daha basit sorar mısın?";
}

type Saglayici = { ad: string; url: string; key?: string; model?: string };
const OPENAI_UYUMLU: Saglayici[] = [
  { ad: "mistral", url: "https://api.mistral.ai/v1/chat/completions", key: process.env.MISTRAL_API_KEY, model: process.env.MISTRAL_MODEL },
  { ad: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL },
  { ad: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL },
];

const openaiAraclar = tools.map((t: any) => ({
  type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

async function openaiIstek(sp: Saglayici, messages: any[]) {
  const r = await fetch(sp.url, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sp.key}` },
    body: JSON.stringify({ model: sp.model, messages, tools: openaiAraclar, max_tokens: 800 }),
  });
  if (!r.ok) throw new Error(`${sp.ad} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function openaiCalistir(sp: Saglayici, mesajlar: any[], kullanilan: string[], sistem: string): Promise<string> {
  const messages: any[] = [{ role: "system", content: sistem }, ...gecmisiKisalt(mesajlar)];

  for (let tur = 0; tur < 4; tur++) {
    const j = await tekrar(() => openaiIstek(sp, messages));
    const msg = j.choices?.[0]?.message;
    if (!msg) throw new Error(`${sp.ad} boş cevap döndü`);
    if (!msg.tool_calls || msg.tool_calls.length === 0) return msg.content ?? "Cevap üretemedim.";

    messages.push(msg);
    for (const c of msg.tool_calls) {
      kullanilan.push(c.function.name);
      let args: any = {};
      try { args = JSON.parse(c.function.arguments || "{}"); } catch {}
      const out = await runTool(c.function.name, args);
      messages.push({ role: "tool", tool_call_id: c.id, content: sonucMetni(out) });
    }
  }
  return "Çok fazla adım gerekti, soruyu daha basit sorar mısın?";
}

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ hata: "Giriş yok" }, { status: 401 });
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return NextResponse.json({ hata: "Geçersiz oturum" }, { status: 401 });
  const { data: prof } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (prof?.role !== "admin") return NextResponse.json({ hata: "Yetki yok" }, { status: 403 });

  const { mesajlar } = await req.json();

  const { data: notlar } = await db.from("ajan_notlari").select("konu, not_metni").eq("aktif", true).order("created_at");
  const notMetni = (notlar ?? []).map((n: any) => `- ${n.konu ? n.konu + ": " : ""}${n.not_metni}`).join("\n");
  const SYSTEM_FULL = notMetni ? `${SYSTEM}\n\nKaya'nın kalıcı notları:\n${notMetni}` : SYSTEM;

  const zincir: { ad: string; calistir: (m: any[], k: string[], s: string) => Promise<string> }[] = [];
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) zincir.push({ ad: "gemini", calistir: geminiCalistir });
  for (const sp of OPENAI_UYUMLU) {
    if (sp.key && sp.model) zincir.push({ ad: sp.ad, calistir: (m, k, s) => openaiCalistir(sp, m, k, s) });
  }

  const hatalar: string[] = [];
  for (const s of zincir) {
    const kullanilan: string[] = [];
    try {
      const cevap = await s.calistir(mesajlar, kullanilan, SYSTEM_FULL);
      await db.from("ajan_loglari").insert({ kullanici: u.user.email, soru: mesajlar[mesajlar.length - 1]?.content, araclar: [`saglayici:${s.ad}`, ...kullanilan], cevap });
      return NextResponse.json({ cevap });
    } catch (e: any) {
      hatalar.push(`${s.ad}: ${String(e?.message ?? "").slice(0, 200)}`);
      console.error(`${s.ad} hata:`, e);
    }
  }

  return NextResponse.json({ hata: "Yapay zeka şu an çok yoğun veya kota doldu. Lütfen 1 dakika sonra tekrar dene.\n\nDetay: " + hatalar[0] }, { status: 503 });
}