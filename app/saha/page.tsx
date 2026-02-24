"use client";

// ----------------------------------------------------------------------------
// BUVISAN SAHA ASİSTANI 🎙️ (Mobiles-First)
// Sadece sahadaki teknisyenler içindir. Admin panelinden tamamen bağımsızdır.
// ----------------------------------------------------------------------------

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Mic, StopCircle, Send, CheckCircle2, User, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Teknisyen Listesi
const PERSONEL_LISTESI = [
  "VOLKAN ACAR", "HAMZA ATTAR", "VEYSEL ÇARKLI", "KERİM AKDOĞAN" , "GÖKHAN GÖK" , "BASİL HAVATİMİ"
];

export default function SahaAsistani() {
  const [seciliUsta, setSeciliUsta] = useState("");
  const [kayitDurumu, setKayitDurumu] = useState<'bekliyor' | 'kaydediyor' | 'tamamlandi'>('bekliyor');
  const [konusulanMetin, setKonusulanMetin] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [basarili, setBasarili] = useState(false);

  // Tarayıcı Ses Tanıma API'si
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Tarayıcı ses tanımayı destekliyor mu kontrol et
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'tr-TR'; // Türkçe algılama

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setKonusulanMetin(transcript);
      };

      recognition.onerror = (event: any) => {
        console.error("Ses tanıma hatası:", event.error);
        setKayitDurumu('bekliyor');
      };

      recognitionRef.current = recognition;
    } else {
      alert("Cihazınız veya tarayıcınız sesli asistanı desteklemiyor. Lütfen Google Chrome kullanın.");
    }
  }, []);

  const kaydiBaslat = () => {
    if (!seciliUsta) return alert("Lütfen önce ismini seç usta!");
    setKonusulanMetin("");
    setKayitDurumu('kaydediyor');
    recognitionRef.current?.start();
  };

  const kaydiDurdur = () => {
    setKayitDurumu('tamamlandi');
    recognitionRef.current?.stop();
  };

  const metniTemizle = () => {
    setKonusulanMetin("");
    setKayitDurumu('bekliyor');
  };

  const merkezeGonder = async () => {
    if (!konusulanMetin || konusulanMetin.length < 5) return alert("Usta pek bir şey duyamadım, tekrar anlatır mısın?");
    
    setGonderiliyor(true);
    
    // Veritabanına "Bekleyen Rapor" olarak gönder
    const { error } = await supabase.from('field_reports').insert([
      {
        technician_name: seciliUsta,
        audio_text: konusulanMetin
      }
    ]);

    setGonderiliyor(false);

    if (error) {
      alert("Gönderilirken bir hata oldu: " + error.message);
    } else {
      setBasarili(true);
      setTimeout(() => {
        setBasarili(false);
        setKayitDurumu('bekliyor');
        setKonusulanMetin("");
      }, 3000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans text-slate-100">
      
      <div className="w-full max-w-md bg-slate-800 rounded-[40px] p-8 shadow-2xl border border-slate-700 relative overflow-hidden">
        
        {/* Dekoratif Işıklandırma */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-blue-500/20 blur-[100px] rounded-full pointer-events-none"></div>

        {/* Header */}
        <div className="text-center mb-8 relative z-10">
          <div className="w-16 h-1 bg-blue-500 mx-auto rounded-full mb-6"></div>
          <h1 className="text-3xl font-black text-white tracking-tight">BUVİSAN SAHA</h1>
          <p className="text-blue-400 font-bold text-sm mt-1 uppercase tracking-widest">Akıllı Ses Asistanı</p>
        </div>

        <AnimatePresence mode="wait">
          {!basarili ? (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6 relative z-10">
              
              {/* Usta Seçimi */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2"><User size={14}/> Sen Kimsin Usta?</label>
                <select 
                  value={seciliUsta} 
                  onChange={(e) => setSeciliUsta(e.target.value)}
                  className="w-full p-4 bg-slate-900 border-2 border-slate-700 rounded-2xl font-bold text-white outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="">İsmini Seç...</option>
                  {PERSONEL_LISTESI.map(isim => <option key={isim} value={isim}>{isim}</option>)}
                </select>
              </div>

              {/* Animasyonlu Mikrofon Butonu */}
              <div className="flex justify-center py-8">
                <button 
                  onClick={kayitDurumu === 'kaydediyor' ? kaydiDurdur : kaydiBaslat}
                  className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${
                    kayitDurumu === 'kaydediyor' 
                      ? 'bg-red-500 shadow-red-500/50 scale-105' 
                      : 'bg-blue-600 shadow-blue-600/50 hover:bg-blue-500'
                  }`}
                >
                  {kayitDurumu === 'kaydediyor' ? (
                    <>
                      <div className="absolute inset-0 bg-red-400 rounded-full animate-ping opacity-75"></div>
                      <StopCircle size={48} className="text-white relative z-10" />
                    </>
                  ) : (
                    <Mic size={48} className="text-white" />
                  )}
                </button>
              </div>

              <div className="text-center">
                <p className="text-sm font-medium text-slate-400">
                  {kayitDurumu === 'bekliyor' && "Konuşmak için mikrofona dokun."}
                  {kayitDurumu === 'kaydediyor' && <span className="text-red-400 font-bold animate-pulse">Dinleniyor... Konuşmayı bitirince kırmızıya dokun.</span>}
                  {kayitDurumu === 'tamamlandi' && "Sesin yazıya çevrildi."}
                </p>
              </div>

              {/* Metin Kutusu */}
              <div className="relative">
                <textarea 
                  readOnly={kayitDurumu === 'kaydediyor'}
                  value={konusulanMetin}
                  onChange={(e) => setKonusulanMetin(e.target.value)}
                  placeholder="Abi bugün Togg fabrikasına gittik. 10 tonluk vincin fren bobini yandığı için değiştirdik. 2 saat sürdü..."
                  className="w-full h-32 p-4 bg-slate-900 border-2 border-slate-700 rounded-2xl text-slate-300 text-sm focus:border-blue-500 outline-none resize-none leading-relaxed"
                />
                {konusulanMetin && kayitDurumu !== 'kaydediyor' && (
                  <button onClick={metniTemizle} className="absolute right-3 top-3 p-2 bg-slate-800 text-slate-400 hover:text-red-400 rounded-xl transition">
                    <RefreshCw size={16}/>
                  </button>
                )}
              </div>

              {/* Gönder Butonu */}
              <button 
                onClick={merkezeGonder}
                disabled={gonderiliyor || !konusulanMetin || !seciliUsta}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                {gonderiliyor ? <Loader2 className="animate-spin"/> : <Send size={20}/>}
                {gonderiliyor ? "GÖNDERİLİYOR..." : "MERKEZE GÖNDER"}
              </button>

            </motion.div>
          ) : (
            /* Başarılı Ekranı */
            <motion.div key="success" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center">
                <CheckCircle2 size={64} className="text-emerald-500" />
              </div>
              <h2 className="text-2xl font-black text-white">RAPOR İLETİLDİ!</h2>
              <p className="text-slate-400 text-sm">Merkeze onay için gönderildi usta, eline sağlık.</p>
            </motion.div>
          )}
        </AnimatePresence>
        
      </div>
    </div>
  );
}