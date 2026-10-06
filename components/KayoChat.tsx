"use client";

import { useState, useEffect, useRef } from "react";

export default function KayoChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [mesajlar, setMesajlar] = useState<{role: string, content: string}[]>([]);
  const [input, setInput] = useState("");
  const mesajSonuRef = useRef<HTMLDivElement>(null);

  // 1. HAFIZA: Sayfa yüklendiğinde eski konuşmaları tarayıcıdan çek
  useEffect(() => {
    const kayitliGecmis = localStorage.getItem("kayo_sohbet_gecmisi");
    if (kayitliGecmis) {
      setMesajlar(JSON.parse(kayitliGecmis));
    } else {
      setMesajlar([{ role: "Kayo", content: "Selam kanka, sistem aktif. Nasıl yardımcı olabilirim?" }]);
    }
  }, []);

  // 2. HAFIZA: Her yeni mesajda tarayıcı belleğini güncelle ve otomatik en alta kaydır
  useEffect(() => {
    if (mesajlar.length > 0) {
      localStorage.setItem("kayo_sohbet_gecmisi", JSON.stringify(mesajlar));
    }
    mesajSonuRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mesajlar]);

  // Ekstra: Hafızayı manuel temizleme butonu
  const gecmisiTemizle = () => {
    if (window.confirm("Kanka tüm konuşma geçmişini siliyorum, emin misin?")) {
      const baslangic = [{ role: "Kayo", content: "Hafızamı sıfırladım kanka. Yeni konumuz nedir?" }];
      setMesajlar(baslangic);
      localStorage.setItem("kayo_sohbet_gecmisi", JSON.stringify(baslangic));
    }
  };

  const mesajGonder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const yeniMesajlar = [...mesajlar, { role: "Sen", content: input }];
    setMesajlar(yeniMesajlar);
    setInput("");

    setMesajlar([...yeniMesajlar, { role: "Kayo", content: "Düşünüyorum..." }]);

    try {
      // DİKKAT: Kendi aktif Ngrok URL'ini buraya yapıştırmayı unutma!
      const response = await fetch("https://servis.buvisan.com/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mesaj: input }),
      });

      const data = await response.json();
      setMesajlar([...yeniMesajlar, { role: "Kayo", content: data.cevap }]);
    } catch (error) {
      setMesajlar([...yeniMesajlar, { role: "Kayo", content: "Kanka arka plana (Python) bağlanamadım. Ngrok açık mı?" }]);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full w-16 h-16 flex items-center justify-center shadow-2xl transition-all"
        >
          🤖
        </button>
      )}

      {isOpen && (
        /* MANUEL BOYUTLANDIRMA: resize, overflow-hidden, w-[400px] h-[600px] ve sınır değerleri eklendi */
        <div className="bg-white rounded-2xl shadow-2xl flex flex-col border border-gray-200 overflow-hidden resize min-w-[320px] min-h-[400px] max-w-[85vw] max-h-[85vh] w-[400px] h-[600px]">
          
          <div className="bg-blue-600 text-white p-4 flex justify-between items-center shrink-0">
            <div className="font-bold flex items-center gap-3">
              Kayo Asistan
              <button onClick={gecmisiTemizle} className="bg-red-500 hover:bg-red-700 text-white text-[10px] px-2 py-1 rounded transition-colors" title="Geçmişi Sil">
                🧹 Temizle
              </button>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white hover:text-gray-200">
              ✕
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto bg-gray-50 flex flex-col gap-3">
            {mesajlar.map((msg, index) => (
              <div
                key={index}
                className={`max-w-[85%] p-3 rounded-xl text-sm ${
                  msg.role === "Sen"
                    ? "bg-blue-600 text-white self-end rounded-br-none"
                    : "bg-gray-200 text-gray-800 self-start rounded-bl-none"
                }`}
              >
                {msg.content}
              </div>
            ))}
            {/* Otomatik kaydırma hedefi */}
            <div ref={mesajSonuRef} />
          </div>

          <form onSubmit={mesajGonder} className="p-3 bg-white border-t flex gap-2 shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Bir komut yaz..."
              className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-black"
            />
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Gönder
            </button>
          </form>
        </div>
      )}
    </div>
  );
}