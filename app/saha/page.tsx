"use client";

// ----------------------------------------------------------------------------
// BUVISAN SAHA ASİSTANI 🎙️ V3.0 (Olay Yeri Kamerası Eklendi 📸)
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

  // 🔥 YENİ: KAMERA VE FOTOĞRAF STATE'LERİ
  const [fotoDosya, setFotoDosya] = useState<File | null>(null);
  const [fotoOnizleme, setFotoOnizleme] = useState<string | null>(null);
  const dosyaInputRef = useRef<HTMLInputElement>(null);

  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [yuklemeMesaji, setYuklemeMesaji] = useState(""); // Fotoğraf yüklenirken bilgi verir
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

  // 🔥 FOTOĞRAF SEÇME FONKSİYONU
  const fotoSecildi = (e: any) => {
      const file = e.target.files[0];
      if (file) {
          setFotoDosya(file);
          setFotoOnizleme(URL.createObjectURL(file));
      }
  };

  const fotoSil = () => {
      setFotoDosya(null);
      setFotoOnizleme(null);
      if (dosyaInputRef.current) dosyaInputRef.current.value = '';
  };

  const merkezeGonder = async () => {
    if (!konusulanMetin || konusulanMetin.length < 5) return alert("Usta pek bir şey duyamadım, detayları yazar mısın?");
    if (!firmaAdi) return alert("Lütfen gidilen firmayı yaz usta.");
    
    setGonderiliyor(true);
    let imageUrl = null;

    // 🔥 EĞER FOTOĞRAF VARSA ÖNCE ONU SUPABASE STORAGE'A YÜKLE
    if (fotoDosya) {
        setYuklemeMesaji("Fotoğraf Yükleniyor...");
        const dosyaUzantisi = fotoDosya.name.split('.').pop();
        const rastgeleIsim = `${Date.now()}-${Math.random().toString(36).substring(7)}.${dosyaUzantisi}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('saha_raporlari')
            .upload(rastgeleIsim, fotoDosya);

        if (uploadError) {
            alert("Fotoğraf yüklenemedi: " + uploadError.message);
            setGonderiliyor(false);
            setYuklemeMesaji("");
            return;
        }

        // Yüklenen fotoğrafın herkese açık linkini al
        const { data: publicUrlData } = supabase.storage.from('saha_raporlari').getPublicUrl(rastgeleIsim);
        imageUrl = publicUrlData.publicUrl;
    }

    setYuklemeMesaji("Rapor Merkeze İletiliyor...");

    const { error } = await supabase.from('field_reports').insert([
      {
        technician_name: seciliUsta,
        company_name: firmaAdi,
        form_number: formNo,
        work_hours: calismaSaati ? Number(calismaSaati) : 0,
        audio_text: konusulanMetin,
        image_url: imageUrl, // 🔥 Fotoğraf linkini veritabanına ekle
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
        fotoSil(); // Ekranı temizle
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
          <p className="text-blue-400 font-bold text-xs mt-2 uppercase tracking-widest bg-blue-900/30 inline-block px-3 py-1 rounded-full border border-blue-800/50">Akıllı Raporlama v3.0</p>
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

              {/* 🔥 YENİ: OLAY YERİ KAMERASI KISMI 🔥 */}
              <div className="bg-slate-900/50 p-4 rounded-3xl border border-slate-700">
                  <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2 mb-2 ml-1"><Camera size={14}/> Kanıt / Form Fotoğrafı</label>
                  
                  {/* Gizli dosya seçici (capture="environment" telefonda direkt arka kamerayı açmayı dener) */}
                  <input type="file" accept="image/*" capture="environment" ref={dosyaInputRef} onChange={fotoSecildi} className="hidden" />
                  
                  {!fotoOnizleme ? (
                      <button onClick={() => dosyaInputRef.current?.click()} className="w-full py-4 border-2 border-dashed border-slate-600 rounded-2xl text-slate-400 font-bold hover:bg-slate-800 hover:border-blue-500 hover:text-blue-400 transition flex flex-col items-center gap-2">
                          <ImageIcon size={24} />
                          <span>Fotoğraf Çek veya Yükle</span>
                      </button>
                  ) : (
                      <div className="relative rounded-2xl overflow-hidden border border-slate-600">
                          <img src={fotoOnizleme} alt="Kanıt" className="w-full h-40 object-cover opacity-80" />
                          <button onClick={fotoSil} className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-xl shadow-lg hover:bg-red-600 transition">
                              <Trash2 size={16}/>
                          </button>
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900 to-transparent p-3 pt-10">
                              <span className="text-xs font-bold text-white flex items-center gap-1"><CheckCircle2 size={14} className="text-emerald-400"/> Eklendi</span>
                          </div>
                      </div>
                  )}
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