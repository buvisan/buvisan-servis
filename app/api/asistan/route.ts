import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { db, tools, runTool } from "@/lib/agent-tools";

export const maxDuration = 60;

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const GROQ_MODEL = process.env.GROQ_MODEL || "";

const SYSTEM = `Sen Buvisan, Birikiton, ZM Çelik ve ZM Kumlama şirketlerinin teknik servis, finans, depo ve operasyon süreçlerini yöneten asistansın. Patronun Kaya.
Veritabanı tabloların (veri_sorgula ile bakabilirsin):
- blacklisted_companies: mimli firmalar
- offers: teklifler (customer_name, total_price, final_price, status, items)
- materials: depo/işçilik fiyatları (name, buy_price, sale_price)
- completed_services: tamamlanan servisler ve ciro (customer_text, price, service_date)
- service_tickets: iş emirleri (status, pipeline_status, priority, manual_customer_name)
- service_reports, field_reports: saha ve servis raporları
- cranes, crane_history: müşterilerdeki vinçler ve geçmişi
- fleet_vehicles, fleet_fines, fleet_fuel, fleet_maintenance: araç filosu, cezalar, yakıt, bakım
- maintenance_contracts: periyodik bakım sözleşmeleri
- financial_records: aylık giderler (month_key örn. 2026-09)
Kurallar:
1. Herhangi bir firma için teklif, iş emri veya yönlendirme konuşulursa önce mimli_sirket_kontrol aracını çağır. Firma mimliyse dur, Kaya'ya uyar.
2. Birikiton sadece 1 ve 2 tonluk monoray vinçlerdir. Buvisan ile Birikiton'u asla karıştırma.
3. Yetkin SADECE OKUMA ve not kaydetmekle sınırlı. Teklif, iş emri vb. kayıt oluşturamaz, değiştiremez, silemezsin. İstenirse "henüz yetkim yok" de. Tek istisna not_kaydet aracıdır.
4. Bilmiyorsan veya veri yoksa uydurma, söyle. Her cevapta hangi veriye (tablo/kayıt) dayandığını belirt.
5. Türkçe, kısa ve net cevap ver. Para birimi TL.
6. Hazır araçlar sorunu karşılamıyorsa veri_sorgula'yı kullan, "yapamam" demeden önce mutlaka dene. Firma adı arayıp bulamazsan "yok" deme, önce kelimeyi kısaltıp tekrar ara. Kullanıcı soruyu nasıl sorarsa sorsun (günlük konuşma dili dahil) niyetini anla ve uygun aracı seç.
7. "En çok iş/ciro yapan müşteri", "X'ten ne kadar kazandık" gibi sorularda musteri_ciro_siralama kullan. veri_sorgula ile satır sayıp sıralama yapma. Cevapta firmaların hangi yazılışlarının birleştirildiğini kısaca belirt.
8. Kaya "hatırla", "not al", "bundan sonra" gibi açıkça isterse not_kaydet çağır. Kendi kendine not ekleme. Kaydettikten sonra ne kaydettiğini tek cümleyle söyle.
9. Aşağıda "Kaya'nın kalıcı notları" bölümü varsa o notlara uy. Notlar ile veritabanı verisi çelişirse ikisini de belirtip Kaya'ya sor.
Bugünün tarihi: ${new Date().toLocaleDateString("tr-TR")}`;

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

const gecici = (e: any) => {
  const m = String(e?.message ?? "");
  return /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|rate/i.test(m);
};

// Geçici hatada kısa bekleyip 2 kez dener
async function tekrar<T>(fn: () => Promise<T>): Promise<T> {
  let son: any;
  for (let i = 0; i < 2; i++) {
    try {
      return await fn();
    } catch (e) {
      son = e;
      if (!gecici(e)) throw e;
      await bekle(1500 * (i + 1));
    }
  }
  throw son;
}

// ---------- GEMINI ----------
const geminiAraclar = tools.map((t: any) => ({
  name: t.name,
  description: t.description,
  parametersJsonSchema: t.input_schema,
}));

async function geminiCalistir(mesajlar: any[], kullanilan: string[], sistem: string): Promise<string> {
  const contents: any[] = mesajlar.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  for (let tur = 0; tur < 8; tur++) {
    const res = await tekrar(() =>
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          systemInstruction: sistem,
          tools: [{ functionDeclarations: geminiAraclar }],
          maxOutputTokens: 2000,
        },
      })
    );
    const calls = res.functionCalls;
    if (!calls || calls.length === 0) return res.text ?? "Cevap üretemedim.";

    contents.push(res.candidates![0].content);
    const parts: any[] = [];
    for (const c of calls) {
      kullanilan.push(c.name!);
      const out = await runTool(c.name!, c.args ?? {});
      parts.push({ functionResponse: { name: c.name, response: { sonuc: out } } });
    }
    contents.push({ role: "user", parts });
  }
  return "Çok fazla adım gerekti, soruyu daha basit sorar mısın?";
}

// ---------- GROQ (OpenAI uyumlu) ----------
const groqAraclar = tools.map((t: any) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

async function groqIstek(messages: any[]) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      tools: groqAraclar,
      max_tokens: 2000,
    }),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function groqCalistir(mesajlar: any[], kullanilan: string[], sistem: string): Promise<string> {
  const messages: any[] = [{ role: "system", content: sistem }, ...mesajlar];

  for (let tur = 0; tur < 8; tur++) {
    const j = await tekrar(() => groqIstek(messages));
    const msg = j.choices?.[0]?.message;
    if (!msg) throw new Error("Groq boş cevap döndü");
    if (!msg.tool_calls || msg.tool_calls.length === 0) return msg.content ?? "Cevap üretemedim.";

    messages.push(msg);
    for (const c of msg.tool_calls) {
      kullanilan.push(c.function.name);
      let args = {};
      try { args = JSON.parse(c.function.arguments || "{}"); } catch {}
      const out = await runTool(c.function.name, args);
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out) });
    }
  }
  return "Çok fazla adım gerekti, soruyu daha basit sorar mısın?";
}

// ---------- ANA AKIŞ ----------
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ hata: "Giriş yok" }, { status: 401 });
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return NextResponse.json({ hata: "Geçersiz oturum" }, { status: 401 });
  const { data: prof } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (prof?.role !== "admin") return NextResponse.json({ hata: "Yetki yok" }, { status: 403 });

  const { mesajlar } = await req.json();

  // Kaya'nın kalıcı notlarını her konuşmanın başında oku
  const { data: notlar } = await db
    .from("ajan_notlari")
    .select("konu, not_metni")
    .eq("aktif", true)
    .order("created_at");
  const notMetni = (notlar ?? [])
    .map((n) => `- ${n.konu ? n.konu + ": " : ""}${n.not_metni}`)
    .join("\n");
  const SYSTEM_FULL = notMetni
    ? `${SYSTEM}\n\nKaya'nın kalıcı notları (bunlara uy):\n${notMetni}`
    : SYSTEM;

  // Sırayla denenecek sağlayıcılar (anahtarı olan varsa listeye girer)
  const zincir: { ad: string; calistir: typeof geminiCalistir }[] = [];
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) zincir.push({ ad: "gemini", calistir: geminiCalistir });
  if (process.env.GROQ_API_KEY && GROQ_MODEL) zincir.push({ ad: "groq", calistir: groqCalistir });

  let sonHata: any;
  for (const s of zincir) {
    const kullanilan: string[] = [];
    try {
      const cevap = await s.calistir(mesajlar, kullanilan, SYSTEM_FULL);
      await db.from("ajan_loglari").insert({
        kullanici: u.user.email,
        soru: mesajlar[mesajlar.length - 1]?.content,
        araclar: [`saglayici:${s.ad}`, ...kullanilan],
        cevap,
      });
      return NextResponse.json({ cevap });
    } catch (e) {
      sonHata = e;
      console.error(`${s.ad} hata:`, e);
    }
  }

  return NextResponse.json(
    { hata: "Yapay zeka şu an yanıt vermiyor, 1 dakika sonra tekrar dener misin? (" + String(sonHata?.message ?? "").slice(0, 150) + ")" },
    { status: 503 }
  );
}