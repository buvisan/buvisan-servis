"use client";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Msg = { role: "user" | "assistant"; content: string };

export default function Asistan() {
  const [mesajlar, setMesajlar] = useState<Msg[]>([]);
  const [yazi, setYazi] = useState("");
  const [bekle, setBekle] = useState(false);

  async function gonder() {
    if (!yazi.trim() || bekle) return;
    const yeni: Msg[] = [...mesajlar, { role: "user", content: yazi }];
    setMesajlar(yeni); setYazi(""); setBekle(true);
    const { data } = await supabase.auth.getSession();
    const r = await fetch("/api/asistan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
      body: JSON.stringify({ mesajlar: yeni }),
    });
    const j = await r.json();
    setMesajlar([...yeni, { role: "assistant", content: j.cevap ?? j.hata }]);
    setBekle(false);
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>🤖 Buvisan Asistan</h1>
      <div style={{ minHeight: 400, margin: "16px 0" }}>
        {mesajlar.map((m, i) => (
          <div key={i} style={{
            background: m.role === "user" ? "#1d4ed8" : "#f1f5f9",
            color: m.role === "user" ? "#fff" : "#0f172a",
            padding: 12, borderRadius: 12, margin: "8px 0", whiteSpace: "pre-wrap",
          }}>{m.content}</div>
        ))}
        {bekle && <div>Düşünüyor...</div>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={yazi} onChange={(e) => setYazi(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && gonder()}
          placeholder="Örn: Hangi aracın muayenesi yaklaşıyor?"
          style={{ flex: 1, padding: 12, border: "1px solid #cbd5e1", borderRadius: 8 }} />
        <button onClick={gonder} style={{ padding: "12px 20px", background: "#0f172a", color: "#fff", borderRadius: 8 }}>
          Gönder
        </button>
      </div>
    </div>
  );
}