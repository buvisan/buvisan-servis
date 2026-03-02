"use client";

// ----------------------------------------------------------------------------
// BUVISAN SAHA ASİSTANI 🎙️ V4.0 (Çoklu Fotoğraf - Max 3 Adet 📸)
// ----------------------------------------------------------------------------

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Mic, StopCircle, Send, CheckCircle2, User, Loader2, RefreshCw, Building2, FileText, Clock, Camera, Trash2, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PERSONEL_LISTESI = [
  "VOLKAN ACAR", "HAMZA ATTAR", "VEYSEL ÇARKLI", "KERİM AKDOĞAN" , "GÖKHAN GÖK" , "BASİL HAVATİMİ", "BURHAN KANDEMİR" , "OKAN ARAN" , "ADEM ACAR"
];

export default function SahaAsistani() {
  const [seciliUsta, setSeciliUsta] = useState("");
  const [kayitDurumu, setKayitDurumu] = useState<'bekliyor' | 'kaydediyor' | 'tamamlandi'>('bekliyor');
  const [konusulanMetin, setKonusulanMetin] = useState("");
  
  const [firmaAdi, setFirmaAdi] = useState("");
  const [formNo, setFormNo] = useState("");
  const [calismaSaati, setCalismaSaati] = useState("");

  // 🔥 ÇOKLU FOTOĞRAF STATE'LERİ 🔥
  const [fotoDosyalar, setFotoDosyalar] = useState<File[]>([]);
  const [fotoOnizlemeler, setFotoOnizlemeler] = useState<string[]>([]);
  const dosyaInputRef = useRef<HTMLInputElement>(null);

  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [yuklemeMesaji, setYuklemeMesaji] = useState("");
  const [basarili, setBasarili] = useState(false);

  const recognitionRef = useRef<any>(null);
  const eskiMetinRef = useRef(""); 

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'tr-TR';

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setKonusulanMetin(eskiMetinRef.current + " " + currentTranscript);
      };

      recognition.onerror = () => setKayitDurumu('bekliyor');
      recognition.onend = () => setKayitDurumu('bekliyor');
      recognitionRef.current = recognition;
    }
  }, []);

  const kaydiBaslat = () => {
    if (!seciliUsta) return alert("Lütfen önce ismini seç usta!");
    eskiMetinRef.current = konusulanMetin; 
    setKayitDurumu('kaydediyor');
    try { recognitionRef.current?.start(); } catch(e) {} 
  };

  const kaydiDurdur = () => {
    setKayitDurumu('bekliyor');
    recognitionRef.current?.stop();
    eskiMetinRef.current = konusulanMetin; 
  };

  const metniTemizle = () => {
    if(confirm("Tüm notu silmek istiyor musun?")) {
        setKonusulanMetin(""); eskiMetinRef.current = "";
    }
  };

  // 🔥 ÇOKLU FOTOĞRAF SEÇME FONKSİYONU
  const fotoSecildi = (e: any) => {
      const files = Array.from(e.target.files) as File[];
      if (fotoDosyalar.length + files.length > 3) {
          alert("Usta en fazla 3 adet fotoğraf yükleyebilirsin!");
          return;
      }
      const yeniDosyalar = [...fotoDosyalar, ...files].slice(0, 3);
      setFotoDosyalar(yeniDosyalar);
      
      const onizlemeler = yeniDosyalar.map(file => URL.createObjectURL(file));
      setFotoOnizlemeler(onizlemeler);
      
      if (dosyaInputRef.current) dosyaInputRef.current.value = ''; // Inputu sıfırla ki aynı resmi tekrar seçebilsin
  };

  const fotoSil = (index: number) => {
      setFotoDosyalar(prev => prev.filter((_, i) => i !== index));
      setFotoOnizlemeler(prev => prev.filter((_, i) => i !== index));
  };

  const merkezeGonder = async () => {
    if (!konusulanMetin || konusulanMetin.length < 5) return alert("Usta pek bir şey duyamadım, detayları yazar mısın?");
    if (!firmaAdi) return alert("Lütfen gidilen firmayı yaz usta.");
    
    setGonderiliyor(true);
    let yuklenenResimUrlleri: string[] = [];

    // 🔥 BÜTÜN FOTOĞRAFLARI SIRAYLA YÜKLE
    if (fotoDosyalar.length > 0) {
        setYuklemeMesaji(`Fotoğraflar Yükleniyor... (0/${fotoDosyalar.length})`);
        
        for (let i = 0; i < fotoDosyalar.length; i++) {
            const dosya = fotoDosyalar[i];
            const dosyaUzantisi = dosya.name.split('.').pop();
            const rastgeleIsim = `${Date.now()}-${Math.random().toString(36).substring(7)}.${dosyaUzantisi}`;
            
            setYuklemeMesaji(`Fotoğraflar Yükleniyor... (${i+1}/${fotoDosyalar.length})`);
            
            const { error: uploadError } = await supabase.storage
                .from('saha_raporlari')
                .upload(rastgeleIsim, dosya);

            if (!uploadError) {
                const { data } = supabase.storage.from('saha_raporlari').getPublicUrl(rastgeleIsim);
                yuklenenResimUrlleri.push(data.publicUrl);
            }
        }
    }

    setYuklemeMesaji("Rapor Merkeze İletiliyor...");

    const { error } = await supabase.from('field_reports').insert([
      {
        technician_name: seciliUsta,
        company_name: firmaAdi,
        form_number: formNo,
        work_hours: calismaSaati ? Number(calismaSaati) : 0,
        audio_text: konusulanMetin,
        image_urls: yuklenenResimUrlleri, // 🔥 ARTIK ARRAY (DİZİ) OLARAK KAYDEDİYORUZ
        status: 'bekliyor'
      }
    ]);

    setGonderiliyor(false);
    setYuklemeMesaji("");

    if (error) {
      alert("Gönderilirken bir hata oldu: " + error.message);
    } else {
      setBasarili(true);
      setTimeout(() => {
        setBasarili(false); setKayitDurumu('bekliyor'); setKonusulanMetin("");
        setFirmaAdi(""); setFormNo(""); setCalismaSaati(""); eskiMetinRef.current = "";
        setFotoDosyalar([]); setFotoOnizlemeler([]); // Resimleri sıfırla
      }, 3000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans text-slate-100 pb-10">
      <div className="w-full max-w-md bg-slate-800 rounded-[40px] p-6 md:p-8 shadow-2xl border border-slate-700 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-blue-500/20 blur-[100px] rounded-full pointer-events-none"></div>

        <div className="text-center mb-8 relative z-10">
          <div className="w-16 h-1 bg-blue-500 mx-auto rounded-full mb-6"></div>
          <h1 className="text-3xl font-black text-white tracking-tight">SAHA TERMİNALİ</h1>
          <p className="text-blue-400 font-bold text-xs mt-2 uppercase tracking-widest bg-blue-900/30 inline-block px-3 py-1 rounded-full border border-blue-800/50">Akıllı Raporlama v4.0</p>
        </div>

        <AnimatePresence mode="wait">
          {!basarili ? (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5 relative z-10">
              
              {/* Usta Seçimi */}
              <div className="bg-slate-900/50 p-4 rounded-3xl border border-slate-700">
                  <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2 mb-2 ml-1"><User size={14}/> Sen Kimsin Usta?</label>
                  <select value={seciliUsta} onChange={(e) => setSeciliUsta(e.target.value)} className="w-full p-3 bg-slate-800 border-none rounded-xl font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 transition-colors"><option value="">İsmini Seç...</option>{PERSONEL_LISTESI.map(isim => <option key={isim} value={isim}>{isim}</option>)}</select>
              </div>

              {/* Hızlı Bilgiler Kutusu */}
              <div className="bg-slate-900/50 p-4 rounded-3xl border border-slate-700 space-y-3">
                  <div><label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2 mb-1 ml-1"><Building2 size={12}/> Gidilen Firma <span className="text-red-400">*</span></label><input type="text" placeholder="Örn: Togg, Erbek Kalıp..." value={firmaAdi} onChange={e => setFirmaAdi(e.target.value)} className="w-full p-3 bg-slate-800 border-none rounded-xl text-sm font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-600"/></div>
                  <div className="flex gap-3">
                      <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2 mb-1 ml-1"><FileText size={12}/> Servis Form No</label><input type="text" placeholder="Örn: 5424" value={formNo} onChange={e => setFormNo(e.target.value)} className="w-full p-3 bg-slate-800 border-none rounded-xl text-sm font-bold text-blue-400 outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-600"/></div>
                      <div className="w-1/3"><label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2 mb-1 ml-1"><Clock size={12}/> Süre</label><input type="number" placeholder="Saat" value={calismaSaati} onChange={e => setCalismaSaati(e.target.value)} className="w-full p-3 bg-slate-800 border-none rounded-xl text-sm font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 text-center placeholder:text-slate-600"/></div>
                  </div>
              </div>

              {/* 🔥 ÇOKLU FOTOĞRAF GALERİSİ 🔥 */}
              <div className="bg-slate-900/50 p-4 rounded-3xl border border-slate-700">
                  <div className="flex justify-between items-center mb-2 ml-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2"><Camera size={14}/> Kanıt / Form (Max 3)</label>
                      <span className="text-[10px] font-bold text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded-full">{fotoOnizlemeler.length}/3</span>
                  </div>
                  
                  {/* Çoklu resim seçici */}
                  <input type="file" accept="image/*" multiple ref={dosyaInputRef} onChange={fotoSecildi} className="hidden" />
                  
                  <div className="grid grid-cols-3 gap-2 mt-3">
                      {fotoOnizlemeler.map((url, index) => (
                          <div key={index} className="relative rounded-xl overflow-hidden border border-slate-600 aspect-square group">
                              <img src={url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition" />
                              <button onClick={() => fotoSil(index)} className="absolute top-1 right-1 bg-red-500/90 text-white p-1 rounded-lg shadow-lg hover:bg-red-500 transition">
                                  <Trash2 size={14}/>
                              </button>
                          </div>
                      ))}
                      
                      {fotoOnizlemeler.length < 3 && (
                          <button onClick={() => dosyaInputRef.current?.click()} className="aspect-square border-2 border-dashed border-slate-600 rounded-xl text-slate-400 font-bold hover:bg-slate-800 hover:border-blue-500 hover:text-blue-400 transition flex flex-col items-center justify-center gap-1">
                              <ImageIcon size={20} />
                              <span className="text-[9px] text-center px-1">Ekle</span>
                          </button>
                      )}
                  </div>
              </div>

              {/* Sesli Not Alanı */}
              <div className="bg-slate-900/50 p-5 rounded-3xl border border-slate-700">
                  <div className="text-center mb-6">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                      {kayitDurumu === 'bekliyor' && "Yapılan İşlemi Anlat (Eklemek İçin Tekrar Bas)"}
                      {kayitDurumu === 'kaydediyor' && <span className="text-red-400 animate-pulse">Seni Dinliyorum Usta...</span>}
                    </p>
                    <button onClick={kayitDurumu === 'kaydediyor' ? kaydiDurdur : kaydiBaslat} className={`relative w-24 h-24 mx-auto rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${kayitDurumu === 'kaydediyor' ? 'bg-red-500 shadow-red-500/50 scale-110' : 'bg-blue-600 shadow-blue-600/30 hover:bg-blue-500'}`}>
                      {kayitDurumu === 'kaydediyor' ? <><div className="absolute inset-0 bg-red-400 rounded-full animate-ping opacity-75"></div><StopCircle size={36} className="text-white relative z-10" /></> : <Mic size={36} className="text-white" />}
                    </button>
                  </div>
                  <div className="relative">
                    <textarea value={konusulanMetin} onChange={(e) => setKonusulanMetin(e.target.value)} placeholder="Buraya konuşarak veya yazarak yapılan işlemleri girin..." className="w-full h-32 p-4 bg-slate-800 border border-slate-700 rounded-2xl text-slate-200 text-sm focus:border-blue-500 outline-none resize-none leading-relaxed" />
                    {konusulanMetin && (<button onClick={metniTemizle} className="absolute right-3 top-3 p-1.5 bg-slate-700 text-slate-400 hover:text-red-400 hover:bg-slate-600 rounded-lg transition" title="Temizle"><RefreshCw size={14}/></button>)}
                  </div>
              </div>

              {/* Gönder Butonu */}
              <button 
                onClick={merkezeGonder} disabled={gonderiliyor || !konusulanMetin || !seciliUsta || !firmaAdi}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black rounded-2xl transition flex flex-col items-center justify-center gap-1 shadow-lg shadow-emerald-500/20 active:scale-95"
              >
                <div className="flex items-center gap-2">
                    {gonderiliyor ? <Loader2 className="animate-spin"/> : <Send size={20}/>}
                    {gonderiliyor ? "GÖNDERİLİYOR..." : "MERKEZE GÖNDER"}
                </div>
                {yuklemeMesaji && <span className="text-[10px] text-emerald-100 font-medium">{yuklemeMesaji}</span>}
              </button>

            </motion.div>
          ) : (
            <motion.div key="success" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center"><CheckCircle2 size={64} className="text-emerald-500" /></div>
              <h2 className="text-2xl font-black text-white">RAPOR İLETİLDİ!</h2>
              <p className="text-slate-400 text-sm">Merkeze onay için gönderildi usta, eline sağlık.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}