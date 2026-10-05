"use client";

import { useState } from "react";

export default function KayoChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [mesajlar, setMesajlar] = useState([
    { role: "Kayo", content: "Selam kanka, sistem aktif. Nasıl yardımcı olabilirim?" }
  ]);
  const [input, setInput] = useState("");

  const mesajGonder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Kullanıcının mesajını ekrana ekle
    const yeniMesajlar = [...mesajlar, { role: "Sen", content: input }];
    setMesajlar(yeniMesajlar);
    setInput("");

    // Kayo Düşünüyor efekti
    setMesajlar([...yeniMesajlar, { role: "Kayo", content: "Düşünüyorum..." }]);

    try {
      // Buradaki URL ileride senin bilgisayarındaki Python (Kayo) sunucusuna gidecek
      const response = await fetch("HTTPS_NGROK_URL_GELECEK/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mesaj: input }),
      });

      const data = await response.json();
      
      // Kayo'nun gerçek cevabını ekrana yansıt
      setMesajlar([...yeniMesajlar, { role: "Kayo", content: data.cevap }]);
    } catch (error) {
      setMesajlar([...yeniMesajlar, { role: "Kayo", content: "Kanka arka plana (Python) bağlanamadım. Açık olduğundan emin misin?" }]);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Kapalıyken Görünen Buton */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full w-16 h-16 flex items-center justify-center shadow-2xl transition-all"
        >
          🤖
        </button>
      )}

      {/* Açıkken Görünen Chat Penceresi */}
      {isOpen && (
        <div className="bg-white rounded-2xl shadow-2xl w-80 sm:w-96 h-[500px] flex flex-col border border-gray-200 overflow-hidden">
          {/* Üst Kısım (Header) */}
          <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
            <div className="font-bold">Kayo Asistan</div>
            <button onClick={() => setIsOpen(false)} className="text-white hover:text-gray-200">
              ✕
            </button>
          </div>

          {/* Mesajlaşma Alanı */}
          <div className="flex-1 p-4 overflow-y-auto bg-gray-50 flex flex-col gap-3">
            {mesajlar.map((msg, index) => (
              <div
                key={index}
                className={`max-w-[80%] p-3 rounded-xl text-sm ${
                  msg.role === "Sen"
                    ? "bg-blue-600 text-white self-end rounded-br-none"
                    : "bg-gray-200 text-gray-800 self-start rounded-bl-none"
                }`}
              >
                {msg.content}
              </div>
            ))}
          </div>

          {/* Mesaj Yazma Alanı */}
          <form onSubmit={mesajGonder} className="p-3 bg-white border-t flex gap-2">
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