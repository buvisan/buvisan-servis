"use client";

// ----------------------------------------------------------------------------
// BUVISAN MÜŞTERİ ARIZA BİLDİRİM PORTALI 🚀 V3.0
// (WhatsApp Tarzı Ses Kaydı ve Çoklu Foto/Video Özelliği 🎙️📸)
// ----------------------------------------------------------------------------

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Building2, User, Phone, MapPin, Settings, AlertTriangle, 
  AlertCircle, Send, Loader2, CheckCircle2, Info, Camera, Video, Trash2, Image as ImageIcon,
  Mic, StopCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ArizaBildirimEkrani() {
  const [form, setForm] = useState({
      firma_adi: '',
      yetkili: '',
      telefon: '',
      adres: '',
      vinc_bilgisi: '',
      aciliyet: 'Normal', 
      sorun: ''
  });

  // 🔥 ÇOKLU MEDYA (FOTO/VİDEO) STATE'LERİ 🔥
  const [medyaDosyalar, setMedyaDosyalar] = useState<File[]>([]);
  const [medyaOnizlemeler, setMedyaOnizlemeler] = useState<{url: string, type: string}[]>([]);
  const dosyaInputRef = useRef<HTMLInputElement>(null);

  // 🔥 SES KAYDI STATE'LERİ 🔥
  const [kayitDurumu, setKayitDurumu] = useState<'bekliyor' | 'kaydediyor' | 'tamamlandi'>('bekliyor');
  const [sesKaydi, setSesKaydi] = useState<File | null>(null);
  const [sesOnizleme, setSesOnizleme] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sesParcalariRef = useRef<Blob[]>([]);

  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [yuklemeMesaji, setYuklemeMesaji] = useState("");
  const [basarili, setBasarili] = useState(false);

  // --- ÇOKLU MEDYA FONKSİYONLARI ---
  const medyaSecildi = (e: any) => {
      const files = Array.from(e.target.files) as File[];
      if (medyaDosyalar.length + files.length > 5) {
          alert("En fazla 5 adet dosya yükleyebilirsiniz.");
          return;
      }
      
      const yeniDosyalar = [...medyaDosyalar, ...files].slice(0, 5);
      setMedyaDosyalar(yeniDosyalar);
      
      const onizlemeler = yeniDosyalar.map(file => ({
          url: URL.createObjectURL(file),
          type: file.type.startsWith('video/') ? 'video' : 'image'
      }));
      setMedyaOnizlemeler(onizlemeler);
      
      if (dosyaInputRef.current) dosyaInputRef.current.value = '';
  };

  const medyaSil = (index: number) => {
      setMedyaDosyalar(prev => prev.filter((_, i) => i !== index));
      setMedyaOnizlemeler(prev => prev.filter((_, i) => i !== index));
  };

  // --- SES KAYDI FONKSİYONLARI (WHATSAPP MANTIĞI) ---
  const sesKaydiBaslat = async () => {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const recorder = new MediaRecorder(stream);
          sesParcalariRef.current = [];
          
          recorder.ondataavailable = (e) => {
              if (e.data.size > 0) sesParcalariRef.current.push(e.data);
          };
          
          recorder.onstop = () => {
              const blob = new Blob(sesParcalariRef.current, { type: 'audio/mp3' });
              const file = new File([blob], "musteri_ses_kaydi.mp3", { type: "audio/mp3" });
              setSesKaydi(file);
              setSesOnizleme(URL.createObjectURL(blob));
              setKayitDurumu('tamamlandi');
          };
          
          mediaRecorderRef.current = recorder;
          recorder.start();
          setKayitDurumu('kaydediyor');
      } catch(err) {
          alert("Mikrofon izni alınamadı! Lütfen tarayıcı ayarlarından mikrofona izin verin veya arızayı yazarak bildirin.");
      }
  };

  const sesKaydiDurdur = () => {
      if(mediaRecorderRef.current && kayitDurumu === 'kaydediyor') {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
  };

  const sesKaydiSil = () => {
      setSesKaydi(null);
      setSesOnizleme(null);
      setKayitDurumu('bekliyor');
  };

  // --- GÖNDERME İŞLEMİ ---
  const talebiGonder = async () => {
      if (!form.firma_adi || !form.telefon || (!form.sorun && !sesKaydi)) {
          alert("Lütfen Firma Adı, Telefon giriniz ve arızayı ister yazarak ister ses kaydı ile belirtiniz.");
          return;
      }

      setGonderiliyor(true);
      let yuklenenMedyaUrlleri: string[] = [];
      let yuklenenSesUrl: string | null = null;

      // 1. Çoklu Medya Yükleme
      if (medyaDosyalar.length > 0) {
          setYuklemeMesaji(`Dosyalar Yükleniyor... (0/${medyaDosyalar.length})`);
          for (let i = 0; i < medyaDosyalar.length; i++) {
              const dosya = medyaDosyalar[i];
              const dosyaUzantisi = dosya.name.split('.').pop();
              const rastgeleIsim = `musteri_medya_${Date.now()}-${Math.random().toString(36).substring(7)}.${dosyaUzantisi}`;
              
              setYuklemeMesaji(`Dosyalar Yükleniyor... (${i+1}/${medyaDosyalar.length})`);
              const { error: uploadError } = await supabase.storage.from('saha_raporlari').upload(rastgeleIsim, dosya);

              if (!uploadError) {
                  const { data } = supabase.storage.from('saha_raporlari').getPublicUrl(rastgeleIsim);
                  yuklenenMedyaUrlleri.push(data.publicUrl);
              }
          }
      }

      // 2. Ses Kaydı Yükleme
      if (sesKaydi) {
          setYuklemeMesaji("Ses Kaydınız İletiliyor...");
          const rastgeleIsim = `musteri_ses_${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`;
          const { error: sesError } = await supabase.storage.from('saha_raporlari').upload(rastgeleIsim, sesKaydi);
          
          if (!sesError) {
              const { data } = supabase.storage.from('saha_raporlari').getPublicUrl(rastgeleIsim);
              yuklenenSesUrl = data.publicUrl;
          }
      }

      setYuklemeMesaji("Talebiniz Sisteme Kaydediliyor...");

      // 3. Veritabanına Yazma
      const { error } = await supabase.from('service_tickets').insert([
          {
              description: form.sorun || "Ses kaydı ile bildirildi.",
              status: 'bekliyor',
              manual_customer_name: form.firma_adi,
              manual_customer_rep: form.yetkili,
              manual_phone: form.telefon,
              manual_location: form.adres,
              manual_crane_info: form.vinc_bilgisi,
              priority: form.aciliyet,
              media_urls: yuklenenMedyaUrlleri, // 🔥 ÇOKLU MEDYA LİNKLERİ
              audio_url: yuklenenSesUrl // 🔥 SES KAYDI LİNKİ
          }
      ]);

      setGonderiliyor(false);
      setYuklemeMesaji("");

      if (error) {
          alert("Gönderim sırasında bir hata oluştu: " + error.message);
      } else {
          setBasarili(true);
      }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center py-10 px-4 font-sans selection:bg-blue-200">
      
      {/* Logo ve Başlık */}
      <div className="w-full max-w-md mb-6 text-center">
          <div className="w-20 h-20 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-blue-500/30 mb-4">
             <Settings size={40} className="text-white animate-[spin_10s_linear_infinite]" />
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">BUVİSAN</h1>
          <p className="text-sm font-bold text-blue-600 uppercase tracking-widest mt-1">Teknik Servis Talep Formu</p>
      </div>

      <div className="w-full max-w-md bg-white rounded-[32px] shadow-xl border border-slate-200 overflow-hidden relative">
          <AnimatePresence mode="wait">
              {!basarili ? (
                  <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-6 sm:p-8 space-y-6">
                      
                      <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex gap-3 text-blue-800 text-xs font-medium leading-relaxed mb-2">
                          <Info size={24} className="text-blue-500 shrink-0" />
                          <p>Hızlı müdahale için lütfen aşağıdaki bilgileri eksiksiz doldurunuz.</p>
                      </div>

                      {/* İletişim Bilgileri */}
                      <div className="space-y-4">
                          <div><label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><Building2 size={14}/> Firma Adınız <span className="text-red-500">*</span></label><input type="text" placeholder="Firmanızın tam adı" value={form.firma_adi} onChange={e => setForm({...form, firma_adi: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition"/></div>
                          <div className="grid grid-cols-2 gap-3">
                              <div><label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><User size={14}/> Yetkili Kişi</label><input type="text" placeholder="Ad Soyad" value={form.yetkili} onChange={e => setForm({...form, yetkili: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition"/></div>
                              <div><label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><Phone size={14}/> Telefon <span className="text-red-500">*</span></label><input type="tel" placeholder="05XX XXX XX XX" value={form.telefon} onChange={e => setForm({...form, telefon: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500 transition"/></div>
                          </div>
                          <div><label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><MapPin size={14}/> Açık Adresiniz</label><input type="text" placeholder="İl, ilçe, mahalle, sokak..." value={form.adres} onChange={e => setForm({...form, adres: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition"/></div>
                      </div>

                      <div className="h-px w-full bg-slate-100 my-4"></div>

                      {/* Arıza Bildirim Yöntemleri */}
                      <div className="space-y-6">
                          <div><label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><Settings size={14}/> Makine / Vinç Bilgisi</label><input type="text" placeholder="Örn: 10 Ton Tavan Vinci" value={form.vinc_bilgisi} onChange={e => setForm({...form, vinc_bilgisi: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition"/></div>
                          
                          <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><AlertTriangle size={14}/> Arıza Aciliyet Durumu</label>
                              <div className="grid grid-cols-2 gap-3">
                                  <button onClick={() => setForm({...form, aciliyet: 'Normal'})} className={`p-4 rounded-2xl border-2 text-xs font-bold transition-all flex flex-col items-center gap-2 ${form.aciliyet === 'Normal' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}><div className={`w-3 h-3 rounded-full ${form.aciliyet === 'Normal' ? 'bg-blue-500' : 'bg-slate-300'}`}></div>Sıraya Alınsın</button>
                                  <button onClick={() => setForm({...form, aciliyet: 'Kritik (Makine Durdu)'})} className={`p-4 rounded-2xl border-2 text-xs font-bold transition-all flex flex-col items-center gap-2 text-center ${form.aciliyet === 'Kritik (Makine Durdu)' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}><div className={`w-3 h-3 rounded-full ${form.aciliyet === 'Kritik (Makine Durdu)' ? 'bg-red-500 animate-ping absolute' : 'bg-slate-300'}`}></div>KRİTİK (Acil)</button>
                              </div>
                          </div>

                          {/* 🔥 YENİ: WHATSAPP TARZI SES KAYDI 🔥 */}
                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between mb-3 ml-1">
                                  <span className="flex items-center gap-2"><Mic size={14}/> Sesli Anlatım (Kolay Seçenek)</span>
                              </label>

                              {kayitDurumu === 'bekliyor' && (
                                  <button onClick={sesKaydiBaslat} className="w-full py-4 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-xl text-blue-600 font-bold transition flex flex-col items-center gap-2 shadow-sm">
                                      <div className="bg-blue-500 text-white p-3 rounded-full"><Mic size={24} /></div>
                                      <span className="text-xs uppercase tracking-widest mt-1">Dokun ve Konuş</span>
                                  </button>
                              )}

                              {kayitDurumu === 'kaydediyor' && (
                                  <button onClick={sesKaydiDurdur} className="w-full py-6 border-2 border-red-300 bg-red-50 rounded-xl text-red-600 font-bold transition flex flex-col items-center gap-3 shadow-inner">
                                      <div className="bg-red-500 text-white p-4 rounded-full animate-pulse shadow-lg shadow-red-500/50"><StopCircle size={32} /></div>
                                      <span className="text-xs uppercase tracking-widest mt-1 animate-pulse">Kaydediliyor... Bitirmek için dokun</span>
                                  </button>
                              )}

                              {kayitDurumu === 'tamamlandi' && sesOnizleme && (
                                  <div className="relative bg-white border border-slate-200 p-3 rounded-xl flex flex-col gap-3">
                                      <div className="flex items-center justify-between">
                                          <span className="text-xs font-bold text-emerald-600 flex items-center gap-1"><CheckCircle2 size={14}/> Ses Kaydı Hazır</span>
                                          <button onClick={sesKaydiSil} className="text-red-500 hover:text-red-700 bg-red-50 p-1.5 rounded-lg transition"><Trash2 size={14}/></button>
                                      </div>
                                      <audio src={sesOnizleme} controls className="w-full h-10" />
                                  </div>
                              )}
                          </div>

                          {/* Alternatif Yazılı Sorun */}
                          {kayitDurumu === 'bekliyor' && (
                              <div>
                                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><AlertCircle size={14}/> Veya Yazarak Anlatın</label>
                                  <textarea rows={3} placeholder="Yaşadığınız sorunu buraya yazabilirsiniz..." value={form.sorun} onChange={e => setForm({...form, sorun: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500 transition leading-relaxed"/>
                              </div>
                          )}

                          {/* 🔥 YENİ: ÇOKLU FOTO/VİDEO YÜKLEME 🔥 */}
                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                              <div className="flex justify-between items-center mb-3 ml-1">
                                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><Camera size={14}/> Kanıt Ekle (Max 5)</label>
                                  <span className="text-[10px] font-bold text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full">{medyaOnizlemeler.length}/5</span>
                              </div>
                              
                              <input type="file" accept="image/*, video/*" multiple ref={dosyaInputRef} onChange={medyaSecildi} className="hidden" />
                              
                              <div className="grid grid-cols-3 gap-2">
                                  {medyaOnizlemeler.map((medya, index) => (
                                      <div key={index} className="relative rounded-xl overflow-hidden border border-slate-300 aspect-square group bg-black">
                                          {medya.type === 'image' ? (
                                              <img src={medya.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition" />
                                          ) : (
                                              <video src={medya.url} className="w-full h-full object-cover opacity-80" />
                                          )}
                                          <button onClick={() => medyaSil(index)} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-lg shadow-lg hover:bg-red-600 transition z-10"><Trash2 size={12}/></button>
                                          {medya.type === 'video' && <div className="absolute bottom-1 left-1 bg-black/60 p-1 rounded-md"><Video size={12} className="text-white"/></div>}
                                      </div>
                                  ))}
                                  
                                  {medyaOnizlemeler.length < 5 && (
                                      <button onClick={() => dosyaInputRef.current?.click()} className="aspect-square border-2 border-dashed border-slate-300 bg-white rounded-xl text-slate-400 font-bold hover:border-blue-500 hover:text-blue-500 transition flex flex-col items-center justify-center gap-1">
                                          <div className="flex gap-1"><ImageIcon size={16} /><Video size={16} /></div>
                                          <span className="text-[9px] text-center px-1">Ekle</span>
                                      </button>
                                  )}
                              </div>
                          </div>
                      </div>

                      <button onClick={talebiGonder} disabled={gonderiliyor} className="w-full mt-6 py-5 bg-blue-600 hover:bg-blue-700 text-white font-black text-lg rounded-2xl shadow-xl shadow-blue-600/30 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 disabled:opacity-70 disabled:active:scale-100">
                          <div className="flex items-center gap-2">
                              {gonderiliyor ? <Loader2 size={24} className="animate-spin"/> : <Send size={24}/>}
                              {gonderiliyor ? 'GÖNDERİLİYOR...' : 'SERVİS TALEBİ OLUŞTUR'}
                          </div>
                          {yuklemeMesaji && <span className="text-xs text-blue-200 font-medium">{yuklemeMesaji}</span>}
                      </button>

                  </motion.div>
              ) : (
                  <motion.div key="success" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="p-10 text-center flex flex-col items-center justify-center min-h-[400px]">
                      <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6"><CheckCircle2 size={50} className="text-emerald-500" /></div>
                      <h2 className="text-2xl font-black text-slate-800 mb-2">Talebiniz Alındı!</h2>
                      <p className="text-slate-500 leading-relaxed mb-8">Arıza bildiriminiz ve ekleriniz teknik servis merkezimize başarıyla iletildi. Ekiplerimiz en kısa sürede sizinle iletişime geçecektir.</p>
                      <button onClick={() => window.location.reload()} className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition text-sm">Yeni Talep Oluştur</button>
                  </motion.div>
              )}
          </AnimatePresence>
      </div>
      
      <p className="text-slate-400 text-xs font-medium mt-8">© {new Date().getFullYear()} Buvisan Teknik Servis Altyapısı</p>
    </div>
  );
}