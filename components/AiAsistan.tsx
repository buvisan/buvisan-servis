'use client';
import { useChat } from '@ai-sdk/react';
import { useState } from 'react';
import { MessageSquare, Minus } from 'lucide-react'; 

export default function AiAsistan() {
  const [acik, setAcik] = useState(false);
  // @ts-ignore
  const { messages, input, handleInputChange, handleSubmit } = useChat();

  // Kapalıysa sadece şık bir buton göster
  if (!acik) {
    return (
      <button
        onClick={() => setAcik(true)}
        className="fixed bottom-6 right-6 bg-slate-900 text-white p-4 rounded-full shadow-2xl z-[99999] hover:bg-slate-800 transition-all hover:scale-110 flex items-center justify-center group"
      >
        <MessageSquare size={24} className="group-hover:animate-pulse" />
      </button>
    );
  }

  // Açıksa daha kompakt ve minimize edilebilir sohbet penceresi
  return (
    <div className="flex flex-col h-[450px] w-[350px] border border-slate-200 p-0 bg-white rounded-2xl shadow-2xl fixed bottom-6 right-6 z-[99999] overflow-hidden">
      
      {/* Üst Bar */}
      <div className="bg-slate-900 text-white p-3 flex justify-between items-center shadow-md z-10">
        <span className="font-bold text-sm flex items-center gap-2">
          <MessageSquare size={16} className="text-blue-400"/> Buvisan Otonom Asistan
        </span>
        <button onClick={() => setAcik(false)} className="hover:bg-slate-700 p-1.5 rounded transition">
          <Minus size={18} />
        </button>
      </div>
      
      {/* Mesajlaşma Alanı */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 text-xs mt-10">
            Sisteme müdahale etmeye hazırım. Ne yapalım?
          </div>
        )}
        {messages.map((m: any) => (
          <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <span className={`inline-block p-2.5 rounded-xl text-sm shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm'}`}>
              {m.content}
            </span>
          </div>
        ))}
      </div>

      {/* Mesaj Gönderme Formu */}
      <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-slate-200 flex gap-2">
        <input
          className="bg-slate-100 border border-slate-200 p-2.5 flex-1 rounded-xl text-slate-700 text-sm outline-none focus:border-blue-500 transition"
          value={input}
          placeholder="Talimat ver..."
          onChange={handleInputChange}
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition">
          İlet
        </button>
      </form>
    </div>
  );
}