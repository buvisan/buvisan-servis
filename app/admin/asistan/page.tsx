"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Msg = { role: "user" | "assistant"; content: string };
type Onay = { id: string; created_at: string; tur: string; ozet: string; veri: any };

const tl = (n: number) => Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + " ₺";

function Kalin({ metin }: { metin: string }) {
  return (
    <>
      {metin.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}
    </>
  );
}

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

export default function Asistan() {
  const [mesajlar, setMesajlar] = useState<Msg[]>([]);
  const [yazi, setYazi] = useState("");
  const [bekle, setBekle] = useState(false);
  const [onaylar, setOnaylar] = useState<Onay[]>([]);
  const [islemde, setIslemde] = useState<string | null>(null);
  const [bildirim, setBildirim] = useState("");

  async function onaylariYukle() {
    try {
      const r = await fetch("/api/onay", { headers: { Authorization: `Bearer ${await token()}` } });
      const j = await r.json();
      setOnaylar(j.onaylar ?? []);
    } catch {}
  }

  useEffect(() => { onaylariYukle(); }, []);

  async function gonder() {
    if (!yazi.trim() || bekle) return;
    const yeni: Msg[] = [...mesajlar, { role: "user", content: yazi }];
    setMesajlar(yeni); setYazi(""); setBekle(true); setBildirim("");
    try {
      const r = await fetch("/api/asistan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ mesajlar: yeni }),
      });
      const j = await r.json();
      setMesajlar([...yeni, { role: "assistant", content: j.cevap ?? j.hata ?? "Cevap alınamadı." }]);
    } catch {
      setMesajlar([...yeni, { role: "assistant", content: "Bağlantı hatası, tekrar dener misin?" }]);
    }
    setBekle(false);
    onaylariYukle();
  }

  async function karar(id: string, k: "onayla" | "reddet") {
    setIslemde(id);
    try {
      const r = await fetch("/api/onay", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ id, karar: k }),
      });
      const j = await r.json();
      setBildirim(j.mesaj ?? j.hata);
    } catch {
      setBildirim("Bağlantı hatası.");
    }
    setIslemde(null);
    onaylariYukle();
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>🤖 Buvisan Asistan</h1>

      {onaylar.length > 0 && (
        <div style={{ border: "2px solid #f59e0b", background: "#fffbeb", borderRadius: 12, padding: 12, margin: "16px 0" }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>⏳ Bekleyen Onaylar ({onaylar.length})</div>
          {onaylar.map((o) => {
            const t = o.veri?.teklif;
            return (
              <div key={o.id} style={{ background: "#fff", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                <div style={{ fontWeight: 700 }}>Teklif taslağı: {t?.customer_name}</div>
                <table style={{ width: "100%", fontSize: 14, margin: "6px 0" }}>
                  <tbody>
                    {t?.items?.map((k: any) => (
                      <tr key={k.id}>
                        <td>{k.ad}</td>
                        <td>{k.adet} adet</td>
                        <td>{tl(k.birim_fiyat)}</td>
                        <td style={{ textAlign: "right" }}>{tl(k.toplam)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {o.veri?.indirim_yuzde > 0 && <div style={{ fontSize: 13 }}>İndirim: %{o.veri.indirim_yuzde}</div>}
                <div style={{ fontWeight: 800 }}>Genel toplam: {tl(t?.total_price)}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button disabled={islemde === o.id} onClick={() => karar(o.id, "onayla")}
                    style={{ padding: "8px 16px", background: "#16a34a", color: "#fff", borderRadius: 8 }}>
                    ✅ Onayla ve Kaydet
                  </button>
                  <button disabled={islemde === o.id} onClick={() => karar(o.id, "reddet")}
                    style={{ padding: "8px 16px", background: "#dc2626", color: "#fff", borderRadius: 8 }}>
                    ❌ Reddet
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {bildirim && (
        <div style={{ background: "#ecfdf5", border: "1px solid #6ee7b7", padding: 10, borderRadius: 8, margin: "8px 0" }}>
          {bildirim}
        </div>
      )}

      <div style={{ minHeight: 400, margin: "16px 0" }}>
        {mesajlar.map((m, i) => (
          <div key={i} style={{
            background: m.role === "user" ? "#1d4ed8" : "#f1f5f9",
            color: m.role === "user" ? "#fff" : "#0f172a",
            padding: 12, borderRadius: 12, margin: "8px 0", whiteSpace: "pre-wrap",
          }}><Kalin metin={m.content} /></div>
        ))}
        {bekle && <div>Düşünüyor...</div>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={yazi} onChange={(e) => setYazi(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && gonder()}
          placeholder="Örn: Serosa'ya 5 adet 12MM HALAT teklifi hazırla"
          style={{ flex: 1, padding: 12, border: "1px solid #cbd5e1", borderRadius: 8 }} />
        <button onClick={gonder} style={{ padding: "12px 20px", background: "#0f172a", color: "#fff", borderRadius: 8 }}>
          Gönder
        </button>
      </div>
    </div>
  );
}
