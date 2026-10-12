"use client";

// ----------------------------------------------------------------------------
// BUVISAN - SESLİ YAZMA 🎤
// ----------------------------------------------------------------------------
//  Saha teknisyeni eli yağlıyken telefonla uzun yazı yazmak zorunda kalmasın:
//  konuşur, yazıya dökülür. Tarayıcının kendi altyapısı kullanılır
//  (ücret yok, ek servis yok). Desteklemeyen tarayıcıda hiç görünmez.
// ----------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';

export default function SesliYazi({
  onMetin,
  etiket = 'Sesle yaz',
}: {
  onMetin: (metin: string) => void;
  etiket?: string;
}) {
  const [destekliyor, setDestekliyor] = useState(false);
  const [dinliyor, setDinliyor] = useState(false);
  const [araMetin, setAraMetin] = useState('');
  const [hata, setHata] = useState('');
  const tanimaRef = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setDestekliyor(!!SR);
    return () => { try { tanimaRef.current?.stop(); } catch { /* yoksay */ } };
  }, []);

  const baslat = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const tanima = new SR();
    tanima.lang = 'tr-TR';
    tanima.continuous = true;
    tanima.interimResults = true;
    tanima.maxAlternatives = 1;

    tanima.onresult = (e: any) => {
      let ara = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const sonuc = e.results[i];
        const metin = sonuc[0]?.transcript || '';
        if (sonuc.isFinal) {
          const temiz = metin.trim();
          if (temiz) onMetin(temiz);
        } else {
          ara += metin;
        }
      }
      setAraMetin(ara);
    };

    tanima.onerror = (e: any) => {
      const kod = e?.error;
      setHata(
        kod === 'not-allowed' || kod === 'service-not-allowed'
          ? 'Mikrofon izni verilmedi.'
          : kod === 'no-speech'
            ? 'Ses duyulamadı, tekrar dene.'
            : 'Sesli yazma çalışmadı, elle yazabilirsin.'
      );
      setDinliyor(false);
      setAraMetin('');
    };

    tanima.onend = () => {
      setDinliyor(false);
      setAraMetin('');
    };

    tanimaRef.current = tanima;
    try {
      tanima.start();
      setDinliyor(true);
      setHata('');
    } catch {
      setHata('Başlatılamadı, tekrar dene.');
    }
  };

  const durdur = () => {
    try { tanimaRef.current?.stop(); } catch { /* yoksay */ }
    setDinliyor(false);
  };

  // Tarayıcı desteklemiyorsa hiç gösterme (arayüz kirlenmesin)
  if (!destekliyor) return null;

  return (
    <div className="mt-1.5">
      {!dinliyor ? (
        <button
          type="button"
          onClick={baslat}
          className="w-full py-2.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-xl text-[10px] font-black hover:bg-indigo-100 active:scale-95 transition flex items-center justify-center gap-2"
        >
          <Mic size={13} /> {etiket.toLocaleUpperCase('tr-TR')}
        </button>
      ) : (
        <div className="bg-indigo-600 rounded-xl p-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></span> DİNLİYORUM...
            </span>
            <button
              type="button"
              onClick={durdur}
              className="bg-white/20 text-white px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-white/30 transition"
            >
              <Square size={10} /> BİTİR
            </button>
          </div>
          <p className="text-[11px] text-indigo-100 font-medium min-h-[16px] italic leading-snug">
            {araMetin || 'Konuşun, yazıya döküyorum...'}
          </p>
        </div>
      )}

      {hata && <p className="text-[10px] text-red-500 font-bold mt-1.5 ml-1">{hata}</p>}
    </div>
  );
}
