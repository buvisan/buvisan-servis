import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { db, tools, runTool } from "@/lib/agent-tools";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
const MODEL = "gemini-3.8-flash";

const SYSTEM = `Sen Buvisan, Birikiton, ZM Çelik ve ZM Kumlama şirketlerinin teknik servis, finans, depo ve operasyon süreçlerini yöneten asistansın. Patronun Kaya.
Kurallar:
1. Herhangi bir firma için teklif, iş emri veya yönlendirme konuşulursa önce mimli_sirket_kontrol aracını çağır. Firma mimliyse dur, Kaya'ya uyar.
2. Birikiton sadece 1 ve 2 tonluk monoray vinçlerdir. Buvisan ile Birikiton'u asla karıştırma.
3. Şu an SADECE OKUMA yetkin var. Kayıt oluşturamaz, değiştiremez, silemezsin. İstenirse "henüz yetkim yok" de.
4. Bilmiyorsan veya veri yoksa uydurma, söyle. Her cevapta hangi veriye (tablo/kayıt) dayandığını belirt.
5. Türkçe, kısa ve net cevap ver. Para birimi TL.
Bugünün tarihi: ${new Date().toLocaleDateString("tr-TR")}`;

// agent-tools.ts'deki araçları Gemini formatına çeviriyoruz
const functionDeclarations = tools.map((t: any) => ({
  name: t.name,
  description: t.description,
  parametersJsonSchema: t.input_schema,
}));

export async function POST(req: Request) {
  // Güvenlik: sadece giriş yapmış admin kullanabilir
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ hata: "Giriş yok" }, { status: 401 });
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return NextResponse.json({ hata: "Geçersiz oturum" }, { status: 401 });
  const { data: prof } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (prof?.role !== "admin") return NextResponse.json({ hata: "Yetki yok" }, { status: 403 });

  const { mesajlar } = await req.json();
  const kullanilan: string[] = [];

  // Sohbet geçmişini Gemini formatına çevir (assistant -> model)
  const contents: any[] = mesajlar.map((m: any) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  try {
    for (let tur = 0; tur < 8; tur++) {
      const res = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: SYSTEM,
          tools: [{ functionDeclarations }],
          maxOutputTokens: 2000,
        },
      });

      const calls = res.functionCalls;

      // Araç çağrısı yoksa, nihai cevap budur
      if (!calls || calls.length === 0) {
        const cevap = res.text ?? "Cevap üretemedim.";
        await db.from("ajan_loglari").insert({
          kullanici: u.user.email,
          soru: mesajlar[mesajlar.length - 1]?.content,
          araclar: kullanilan,
          cevap,
        });
        return NextResponse.json({ cevap });
      }

      // Modelin araç isteğini geçmişe ekle, araçları çalıştır, sonuçları geri ver
      contents.push(res.candidates![0].content);
      const parts: any[] = [];
      for (const c of calls) {
        kullanilan.push(c.name!);
        const out = await runTool(c.name!, c.args ?? {});
        parts.push({ functionResponse: { name: c.name, response: { sonuc: out } } });
      }
      contents.push({ role: "user", parts });
    }
    return NextResponse.json({ cevap: "Çok fazla adım gerekti, soruyu daha basit sorar mısın?" });
  } catch (e: any) {
    return NextResponse.json({ hata: "Yapay zeka hatası: " + (e?.message ?? "bilinmiyor") }, { status: 500 });
  }
}