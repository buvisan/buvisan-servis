"use client";
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Send, User, ShieldCheck, Loader2 } from 'lucide-react';

export default function ChatAlani({ ticketId, kimimBen }: { ticketId: string, kimimBen: 'admin' | 'musteri' }) {
  const [mesajlar, setMesajlar] = useState<any[]>([]);
  const [yeniMesaj, setYeniMesaj] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const mesajSonuRef = useRef<HTMLDivElement>(null);

  // Mesajları Getir ve Canlı Dinle
  useEffect(() => {
    const mesajlariGetir = async () => {
      const { data } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      if (data) setMesajlar(data);
    };

    mesajlariGetir();

    // Canlı Abonelik (Realtime)
    const kanal = supabase
      .channel('chat-odasi')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${ticketId}` }, (payload) => {
         setMesajlar((eski) => [...eski, payload.new]);
      })
      .subscribe();

    return () => { supabase.removeChannel(kanal); };
  }, [ticketId]);

  // Otomatik aşağı kaydır
  useEffect(() => {
    mesajSonuRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mesajlar]);

  const mesajGonder = async () => {
    if (!yeniMesaj.trim()) return;
    setGonderiliyor(true);

    await supabase.from('ticket_messages').insert([{
      ticket_id: ticketId,
      sender_type: kimimBen,
      message: yeniMesaj
    }]);

    setYeniMesaj("");
    setGonderiliyor(false);
  };

  return (
    <div className="flex flex-col h-[400px] bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
      {/* BAŞLIK */}
      <div className="bg-slate-200 p-3 text-xs font-bold text-slate-600 flex justify-between items-center">
        <span>💬 Arıza Destek Hattı</span>
        <span className="text-[10px] bg-white px-2 py-1 rounded-full">{kimimBen === 'admin' ? 'Yönetici Modu' : 'Müşteri Modu'}</span>
      </div>

      {/* MESAJ LİSTESİ */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {mesajlar.length === 0 && (
            <div className="text-center text-slate-400 text-xs mt-10">Henüz bir mesaj yok. İlk mesajı sen yaz!</div>
        )}
        
        {mesajlar.map((msg) => {
          const benMiyim = msg.sender_type === kimimBen;
          return (
            <div key={msg.id} className={`flex ${benMiyim ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-3 rounded-2xl text-sm shadow-sm ${
                benMiyim 
                  ? 'bg-blue-600 text-white rounded-br-none' 
                  : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
              }`}>
                <div className="flex items-center gap-2 mb-1 opacity-70 text-[10px] font-bold uppercase">
                  {msg.sender_type === 'admin' ? <ShieldCheck size={12}/> : <User size={12}/>}
                  {msg.sender_type === 'admin' ? 'Yetkili' : 'Müşteri'}
                </div>
                {msg.message}
                <div className={`text-[9px] text-right mt-1 ${benMiyim ? 'text-blue-200' : 'text-slate-400'}`}>
                  {new Date(msg.created_at).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={mesajSonuRef} />
      </div>

      {/* MESAJ YAZMA ALANI */}
      <div className="p-3 bg-white border-t border-slate-200 flex gap-2">
        <input 
          type="text" 
          value={yeniMesaj}
          onChange={(e) => setYeniMesaj(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && mesajGonder()}
          placeholder="Mesajınızı yazın..." 
          className="flex-1 bg-slate-100 border-none rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button 
          onClick={mesajGonder} 
          disabled={gonderiliyor}
          className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition disabled:opacity-50"
        >
          {gonderiliyor ? <Loader2 className="animate-spin w-5 h-5"/> : <Send className="w-5 h-5"/>}
        </button>
      </div>
    </div>
  );
}