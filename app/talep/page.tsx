"use client";

// ----------------------------------------------------------------------------
// BUVISAN MÜŞTERİ ARIZA BİLDİRİM PORTALI 🚀 V4.0 (ULTRA PREMIUM)
// (Fiyatlandırma, Bakım Sözleşmesi, Keşif ve Bölge Seçimi Entegre Edildi)
// ----------------------------------------------------------------------------

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Building2, User, Phone, MapPin, Settings, AlertTriangle, 
  AlertCircle, Send, Loader2, CheckCircle2, Info, Camera, Video, Trash2, Image as ImageIcon,
  Mic, StopCircle, ChevronRight, X, Search, FileSignature, Mail, Wrench
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ArizaBildirimEkrani() {
  const [form, setForm] = useState({
      firma_adi: '', yetkili: '', telefon: '', adres: '', vinc_bilgisi: '', email: '', sorun: ''
  });

  // --- UI KONTROL STATELERİ ---
  const [aktifMenu, setAktifMenu] = useState<'none' | 'iletisim' | 'ariza' | 'kesif' | 'bakim'>('none');
  const [iletisimTamam, setIletisimTamam] = useState(false);
  
  const [secilenBolge, setSecilenBolge] = useState("");
  const bolgeler = ['Genel', 'Köprü', 'Kedi / Araba', 'Halat / Zincir', 'Kanca', 'Elektrik Panosu', 'Kumanda', 'Yürüyüş Takımı'];

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

  // --- SES KAYDI FONKSİYONLARI ---
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

  // --- TELEGRAM BİLDİRİMİ ---
  const telegramBildirimiGonder = async (not: string, medyaSayisi: number, tip: string, bolge: string) => {
    const botToken = "8567697885:AAGCSyckJKLG11HwTQaMGGUwMyXIm0UqAK0"; 
    const grupId = "-5079408473"; 

    let onayMetni = "";
    let baslikEmoji = "🚨";
    let baslikMetni = "YENİ MANUEL TALEP!";

    if (tip === 'ariza') {
        onayMetni = "✅ *Müşteri 8.500 TL + KDV servis bedelini ONAYLADI.*";
        baslikEmoji = medyaSayisi > 0 ? "📸" : "🚨";
        baslikMetni = "YENİ MANUEL ARIZA BİLDİRİMİ!";
    } else if (tip === 'kesif') {
        onayMetni = "✅ *Müşteri 5.000 TL + KDV keşif bedelini ONAYLADI.*";
        baslikEmoji = "🔍";
        baslikMetni = "YENİ MANUEL KEŞİF TALEBİ!";
    } else if (tip === 'bakim') {
        onayMetni = "✅ *Müşteri Periyodik Bakım Sözleşmesi talep ediyor.*";
        baslikEmoji = "📝";
        baslikMetni = "MANUEL BAKIM SÖZLEŞMESİ TALEBİ!";
    }
    
    const mesaj = `${baslikEmoji} *${baslikMetni}*\n\n` +
                  `🏗️ *Vinç / Makine:* ${form.vinc_bilgisi || 'Belirtilmedi'}\n` +
                  `🏢 *Müşteri:* ${form.firma_adi}\n` +
                  `👤 *Yetkili:* ${form.yetkili || '-'}\n` +
                  `📞 *Telefon:* ${form.telefon}\n` +
                  `${form.email && tip === 'bakim' ? `📧 *E-Posta:* ${form.email}\n` : ''}` +
                  `📍 *Adres:* ${form.adres || 'Belirtilmedi'}\n` +
                  `${bolge ? `🎯 *Arıza Bölgesi:* ${bolge}\n` : ''}` +
                  `------------------\n` +
                  `💬 *Müşteri Notu:* ${not || 'Not girilmedi.'}\n\n` +
                  `${onayMetni}`;
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: grupId, text: mesaj, parse_mode: 'Markdown' })
      });
    } catch (e) { console.error("Telegram hatası:", e); }
  };

  // --- GÖNDERME İŞLEMİ ---
  const talebiGonder = async () => {
      if (aktifMenu === 'ariza' && !secilenBolge) return alert("Lütfen arızalı bölgeyi seçin.");
      if (aktifMenu === 'bakim' && !form.email) return alert("Lütfen teklif için e-posta adresinizi girin.");
      if (aktifMenu !== 'bakim' && !form.sorun && !sesKaydi) return alert("Lütfen talebinizi açıklayan bir not yazın veya ses kaydı bırakın.");

      setGonderiliyor(true);
      let yuklenenMedyaUrlleri: string[] = [];
      let yuklenenSesUrl: string | null = null;

      try {
        if (medyaDosyalar.length > 0) {
            setYuklemeMesaji(`Medyalar Aktarılıyor... (0/${medyaDosyalar.length})`);
            const yuklemeIslemleri = medyaDosyalar.map(async (dosya, index) => {
                const dosyaUzantisi = dosya.name.split('.').pop() || 'jpg';
                const rastgeleIsim = `musteri_medya_${Date.now()}-${Math.random().toString(36).substring(7)}.${dosyaUzantisi}`;
                
                const { error: upErr } = await supabase.storage.from('saha_raporlari').upload(rastgeleIsim, dosya);
                if (upErr) throw upErr;
                
                const { data } = supabase.storage.from('saha_raporlari').getPublicUrl(rastgeleIsim);
                setYuklemeMesaji(`Medyalar Aktarılıyor... (${index+1}/${medyaDosyalar.length})`);
                return data.publicUrl;
            });
            yuklenenMedyaUrlleri = await Promise.all(yuklemeIslemleri);
        }

        if (sesKaydi) {
            setYuklemeMesaji("Ses Kaydınız Şifreleniyor...");
            const rastgeleIsim = `musteri_ses_${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`;
            const { error: sesError } = await supabase.storage.from('saha_raporlari').upload(rastgeleIsim, sesKaydi);
            
            if (!sesError) {
                const { data } = supabase.storage.from('saha_raporlari').getPublicUrl(rastgeleIsim);
                yuklenenSesUrl = data.publicUrl;
            }
        }

        setYuklemeMesaji("Talebiniz Sisteme Kaydediliyor...");

        let issueType = 'Genel Arıza';
        let desc = form.sorun || "Ses kaydı ile bildirildi.";
        let pipelineStat = 'bekliyor';

        if (aktifMenu === 'ariza') {
            issueType = `Arıza Bildirimi (${secilenBolge})`;
            pipelineStat = 'acil_cozum';
        } else if (aktifMenu === 'kesif') {
            issueType = `Keşif Talebi`;
            pipelineStat = 'kesif_bekliyor';
        } else if (aktifMenu === 'bakim') {
            issueType = `Bakım Sözleşmesi Talebi`;
            desc = form.sorun || "Sistem üzerinden periyodik bakım sözleşmesi teklifi talep edildi.";
            pipelineStat = 'teklif_hazirlanacak';
        }

        const { error } = await supabase.from('service_tickets').insert([{
            issue_type: issueType,
            description: desc,
            status: 'bekliyor',
            pipeline_status: pipelineStat,
            manual_customer_name: form.firma_adi,
            manual_customer_rep: form.yetkili,
            manual_phone: form.telefon,
            manual_location: form.adres,
            manual_crane_info: form.vinc_bilgisi,
            priority: aktifMenu === 'ariza' ? 'Kritik (Makine Durdu)' : 'Normal',
            media_urls: yuklenenMedyaUrlleri,
            audio_url: yuklenenSesUrl
        }]);

        if (error) throw error;

        await telegramBildirimiGonder(desc, yuklenenMedyaUrlleri.length, aktifMenu, secilenBolge);

        setBasarili(true);
        setAktifMenu('none');
      } catch (err: any) {
        alert("Gönderim sırasında hata oluştu: " + err.message);
      } finally {
        setGonderiliyor(false);
        setYuklemeMesaji("");
      }
  };

  // --- İLETİŞİM FORMU ONAYI ---
  const iletisimOnayla = () => {
    if(!form.firma_adi || !form.telefon) return alert("Firma Adı ve Telefon zorunludur!");
    setIletisimTamam(true);
    setAktifMenu('none');
  }

  return (
    <div className="min-h-[100dvh] bg-[#0A1128] flex flex-col items-center py-10 px-4 font-sans selection:bg-blue-200 relative overflow-hidden pb-32">
      
      {/* Arka Plan Efekti */}
      <div className="absolute top-0 left-0 w-full h-96 bg-blue-600/20 blur-[100px] rounded-full pointer-events-none -translate-y-1/2"></div>

      {/* Logo ve Başlık */}
      <div className="w-full max-w-md mb-8 text-center relative z-10 pt-4">
          <h1 className="text-3xl font-black text-white tracking-tight">BUVİSAN</h1>
          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.3em] mt-1 opacity-80">Teknik Servis İstasyonu</p>
      </div>

      <AnimatePresence mode="wait">
        {!basarili ? (
          <motion.div key="main" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md z-10 space-y-4">
              
              <div className="bg-blue-900/40 border border-blue-500/30 p-4 rounded-2xl flex gap-3 text-blue-100 text-xs font-medium leading-relaxed mb-6 backdrop-blur-md shadow-xl">
                  <Info size={24} className="text-blue-400 shrink-0" />
                  <p>Hızlı ve doğru bir müdahale için lütfen önce iletişim bilgilerinizi girin, ardından talebinizi seçin.</p>
              </div>

              {/* ADIM 1: İLETİŞİM BİLGİLERİ (ZORUNLU İLK ADIM) */}
              <button onClick={() => setAktifMenu('iletisim')} className={`w-full p-5 rounded-[2rem] text-left shadow-lg relative overflow-hidden group transition-all border ${iletisimTamam ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white border-slate-100'}`}>
                  <div className="flex items-center justify-between relative z-10">
                      <div className="flex gap-4 items-center">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${iletisimTamam ? 'bg-emerald-500 text-white shadow-emerald-500/50' : 'bg-blue-50 text-blue-600'} shadow-lg transition-colors`}>
                             {iletisimTamam ? <CheckCircle2 size={20}/> : <User size={20}/>}
                          </div>
                          <div>
                              <h4 className={`font-extrabold text-base ${iletisimTamam ? 'text-emerald-400' : 'text-slate-800'}`}>İletişim Bilgileri</h4>
                              <p className={`text-xs mt-0.5 font-medium ${iletisimTamam ? 'text-emerald-500/70' : 'text-slate-500'}`}>{iletisimTamam ? `${form.firma_adi}` : 'Firma, Adres ve Vinç bilgisini girin.'}</p>
                          </div>
                      </div>
                      <ChevronRight className={`w-5 h-5 ${iletisimTamam ? 'text-emerald-500' : 'text-slate-300'}`}/>
                  </div>
              </button>

              {/* ADIM 2: TALEP OLUŞTURMA (SADECE İLETİŞİM TAMAMLANINCA AÇILIR) */}
              <AnimatePresence>
                {iletisimTamam && (
                   <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="pt-4 space-y-4">
                       <h3 className="text-white/90 font-bold text-sm uppercase tracking-wider ml-2 flex items-center gap-2 mb-2">
                           <Wrench className="w-4 h-4 text-rose-400"/> İşlem Seçin
                       </h3>

                       {/* BUTON 1: DİREKT ARIZA */}
                       <button onClick={() => setAktifMenu('ariza')} className="w-full bg-gradient-to-r from-rose-500 to-red-600 p-5 rounded-[2rem] text-left shadow-lg relative overflow-hidden group active:scale-[0.98] transition-all">
                           <div className="absolute right-[-20px] top-[-20px] opacity-20"><AlertTriangle className="w-32 h-32"/></div>
                           <div className="relative z-10">
                               <h4 className="text-white font-extrabold text-lg flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> Arıza & Servis Çağır</h4>
                               <p className="text-rose-100 text-xs mt-1 font-medium leading-relaxed">Vinciniz çalışmıyor veya acil müdahale gerekiyorsa. <br/><strong className="text-white bg-black/20 px-2 py-0.5 rounded mt-1 inline-block">Servis Bedeli: 8.500 TL + KDV</strong></p>
                           </div>
                       </button>

                       {/* BUTON 2: KEŞİF */}
                       <button onClick={() => setAktifMenu('kesif')} className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 p-5 rounded-[2rem] text-left shadow-lg relative overflow-hidden group active:scale-[0.98] transition-all">
                           <div className="absolute right-[-20px] top-[-20px] opacity-20"><Search className="w-32 h-32"/></div>
                           <div className="relative z-10">
                               <h4 className="text-white font-extrabold text-lg flex items-center gap-2"><Search className="w-5 h-5"/> Sadece Arıza Keşfi</h4>
                               <p className="text-purple-100 text-xs mt-1 font-medium leading-relaxed">Arızanın ne olduğunu öğrenmek için keşif talep edin. <br/><strong className="text-white bg-black/20 px-2 py-0.5 rounded mt-1 inline-block">Keşif Bedeli: 5.000 TL + KDV</strong></p>
                           </div>
                       </button>

                       {/* BUTON 3: BAKIM */}
                       <button onClick={() => setAktifMenu('bakim')} className="w-full bg-white p-5 rounded-[2rem] text-left shadow-lg relative overflow-hidden group active:scale-[0.98] transition-all border border-slate-100">
                           <div className="flex items-center justify-between relative z-10">
                               <div>
                                   <h4 className="text-slate-800 font-extrabold text-base flex items-center gap-2"><FileSignature className="w-5 h-5 text-blue-600"/> Periyodik Bakım Sözleşmesi</h4>
                                   <p className="text-slate-500 text-xs mt-1 font-medium">Yıllık bakım planı için teklif isteyin.</p>
                               </div>
                               <ChevronRight className="w-5 h-5 text-slate-300"/>
                           </div>
                       </button>
                   </motion.div>
                )}
              </AnimatePresence>

          </motion.div>
        ) : (
          <motion.div key="success" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md bg-white rounded-[32px] p-10 text-center flex flex-col items-center justify-center shadow-2xl relative z-10 border-t-8 border-t-emerald-500 mt-10">
              <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6 shadow-inner"><CheckCircle2 size={50} className="text-emerald-500" /></div>
              <h2 className="text-2xl font-black text-slate-800 mb-2">Talebiniz Alındı!</h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-8">Bildiriminiz ve ekleriniz teknik servis merkezimize başarıyla iletildi. Ekiplerimiz en kısa sürede sizinle iletişime geçecektir.</p>
              <button onClick={() => window.location.reload()} className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition text-sm">Yeni Talep Oluştur</button>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="absolute bottom-6 text-white/20 text-[10px] font-medium tracking-widest uppercase">Powered by Buvisan</p>


      {/* ==========================================
          MODALLAR (BOTTOM SHEETS)
          ========================================== */}
      <AnimatePresence>
        {aktifMenu !== 'none' && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAktifMenu('none')} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100]"/>
            
            <motion.div 
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-x-0 bottom-0 z-[101] bg-white rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.2)] overflow-hidden max-h-[90dvh] flex flex-col"
            >
              <div className="w-full flex justify-center pt-4 pb-2 bg-white shrink-0" onClick={() => setAktifMenu('none')}>
                 <div className="w-12 h-1.5 bg-slate-200 rounded-full"></div>
              </div>

              <div className="overflow-y-auto px-6 pb-8 pt-2 custom-scrollbar">
                
                {/* 1. İLETİŞİM BİLGİLERİ SHEET */}
                {aktifMenu === 'iletisim' && (
                  <div className="space-y-4">
                     <div className="mb-6 flex justify-between items-center">
                        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><User className="w-6 h-6 text-blue-500"/> İletişim & Konum</h2>
                     </div>

                     <div><label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><Building2 size={14}/> Firma Adınız <span className="text-red-500">*</span></label><input type="text" placeholder="Firmanızın tam adı" value={form.firma_adi} onChange={e => setForm({...form, firma_adi: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"/></div>
                     <div className="grid grid-cols-2 gap-3">
                         <div><label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><User size={14}/> Yetkili</label><input type="text" placeholder="Ad Soyad" value={form.yetkili} onChange={e => setForm({...form, yetkili: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"/></div>
                         <div><label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><Phone size={14}/> Telefon <span className="text-red-500">*</span></label><input type="tel" placeholder="05XX XXX XX" value={form.telefon} onChange={e => setForm({...form, telefon: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"/></div>
                     </div>
                     <div><label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><MapPin size={14}/> Açık Adres</label><input type="text" placeholder="İl, ilçe, tam adres..." value={form.adres} onChange={e => setForm({...form, adres: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"/></div>
                     <div><label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><Settings size={14}/> Makine / Vinç Bilgisi</label><input type="text" placeholder="Örn: 10 Ton Tavan Vinci" value={form.vinc_bilgisi} onChange={e => setForm({...form, vinc_bilgisi: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"/></div>

                     <button onClick={iletisimOnayla} className="w-full mt-4 py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-lg active:scale-95 transition-all">
                       KAYDET VE İLERLE
                     </button>
                  </div>
                )}

                {/* 2. ARIZA ÇAĞIRMA SHEET */}
                {aktifMenu === 'ariza' && (
                  <div className="space-y-5">
                     <div>
                        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-2"><AlertTriangle className="w-6 h-6 text-rose-500"/> Arıza Kaydı</h2>
                        <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl flex gap-3 items-start">
                           <Info className="w-5 h-5 text-rose-500 shrink-0 mt-0.5"/>
                           <p className="text-xs text-rose-700 font-medium leading-relaxed">Bu işlem için <strong>8.500 TL + KDV</strong> servis bedeli yansıtılacaktır. Onaylıyorsanız formu doldurun.</p>
                        </div>
                     </div>

                     <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Arızalı Bölge Seçin <span className="text-rose-500">*</span></label>
                        <div className="flex flex-wrap gap-2">
                           {bolgeler.map(b => (
                             <button key={b} onClick={() => setSecilenBolge(b)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${secilenBolge === b ? 'bg-rose-500 text-white border-rose-500 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                               {b}
                             </button>
                           ))}
                        </div>
                     </div>

                     <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between mb-3 ml-1">
                            <span className="flex items-center gap-2"><Mic size={14}/> Sesli Anlatım (Hızlı Seçenek)</span>
                        </label>
                        {kayitDurumu === 'bekliyor' && (
                            <button onClick={sesKaydiBaslat} className="w-full py-4 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-2xl text-blue-600 font-bold transition flex flex-col items-center gap-2 shadow-sm">
                                <div className="bg-blue-500 text-white p-3 rounded-full"><Mic size={24} /></div>
                                <span className="text-[10px] uppercase tracking-widest mt-1">Dokun ve Konuş</span>
                            </button>
                        )}
                        {kayitDurumu === 'kaydediyor' && (
                            <button onClick={sesKaydiDurdur} className="w-full py-6 border-2 border-red-300 bg-red-50 rounded-2xl text-red-600 font-bold transition flex flex-col items-center gap-3 shadow-inner">
                                <div className="bg-red-500 text-white p-4 rounded-full animate-pulse shadow-lg shadow-red-500/50"><StopCircle size={32} /></div>
                                <span className="text-[10px] uppercase tracking-widest mt-1 animate-pulse">Kaydediliyor... Bitirmek için dokun</span>
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

                     {kayitDurumu === 'bekliyor' && (
                         <div>
                             <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><AlertCircle size={14}/> Veya Yazarak Anlatın</label>
                             <textarea rows={3} placeholder="Şikayetinizi buraya yazabilirsiniz..." value={form.sorun} onChange={e => setForm({...form, sorun: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition leading-relaxed"/>
                         </div>
                     )}

                     <div className="bg-slate-50 p-4 rounded-3xl border border-slate-200">
                         <div className="flex justify-between items-center mb-3 ml-1">
                             <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><Camera size={14}/> Kanıt Ekle (Max 5)</label>
                             <span className="text-[10px] font-bold text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full">{medyaOnizlemeler.length}/5</span>
                         </div>
                         <input type="file" accept="image/*, video/*" multiple ref={dosyaInputRef} onChange={medyaSecildi} className="hidden" />
                         <div className="grid grid-cols-3 gap-2">
                             {medyaOnizlemeler.map((medya, index) => (
                                 <div key={index} className="relative rounded-xl overflow-hidden border border-slate-300 aspect-square group bg-black">
                                     {medya.type === 'image' ? <img src={medya.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition" /> : <video src={medya.url} className="w-full h-full object-cover opacity-80" />}
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

                     <button onClick={talebiGonder} disabled={gonderiliyor} className="w-full py-4 bg-rose-600 text-white font-bold rounded-2xl shadow-lg active:scale-95 transition-all flex justify-center items-center gap-2">
                       {gonderiliyor ? <Loader2 className="animate-spin"/> : "ŞARTLARI KABUL ET VE ÇAĞIR"}
                     </button>
                  </div>
                )}

                {/* 3. KEŞİF BİLDİRİMİ SHEET */}
                {aktifMenu === 'kesif' && (
                  <div className="space-y-5">
                     <div>
                        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-2"><Search className="w-6 h-6 text-indigo-500"/> Arıza Keşfi</h2>
                        <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl flex gap-3 items-start">
                           <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5"/>
                           <p className="text-xs text-indigo-700 font-medium leading-relaxed">
                             Sadece arızanın tespitini istiyorsanız <strong>5.000 TL + KDV</strong> keşif bedeli alınır.<br/><br/>
                             <span className="opacity-80 text-[10px]">Eğer keşif sonrası işin yapılmasını onaylarsanız, bu bedel alınmaz ve sadece 8.500 TL + KDV arıza çözüm bedeli geçerli olur. (İkisi ayrı ayrı tahsil edilmez.)</span>
                           </p>
                        </div>
                     </div>

                     <div>
                         <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><AlertCircle size={14}/> Gözlemlerinizi Yazın</label>
                         <textarea rows={3} placeholder="Sıkıntı nedir? Hangi durumda ortaya çıkıyor?" value={form.sorun} onChange={e => setForm({...form, sorun: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm resize-none outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition leading-relaxed"/>
                     </div>

                     <div className="bg-slate-50 p-4 rounded-3xl border border-slate-200">
                         <div className="flex justify-between items-center mb-3 ml-1">
                             <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><Camera size={14}/> Kanıt Ekle (Max 5)</label>
                             <span className="text-[10px] font-bold text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full">{medyaOnizlemeler.length}/5</span>
                         </div>
                         <input type="file" accept="image/*, video/*" multiple ref={dosyaInputRef} onChange={medyaSecildi} className="hidden" />
                         <div className="grid grid-cols-3 gap-2">
                             {medyaOnizlemeler.map((medya, index) => (
                                 <div key={index} className="relative rounded-xl overflow-hidden border border-slate-300 aspect-square group bg-black">
                                     {medya.type === 'image' ? <img src={medya.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition" /> : <video src={medya.url} className="w-full h-full object-cover opacity-80" />}
                                     <button onClick={() => medyaSil(index)} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-lg shadow-lg hover:bg-red-600 transition z-10"><Trash2 size={12}/></button>
                                     {medya.type === 'video' && <div className="absolute bottom-1 left-1 bg-black/60 p-1 rounded-md"><Video size={12} className="text-white"/></div>}
                                 </div>
                             ))}
                             {medyaOnizlemeler.length < 5 && (
                                 <button onClick={() => dosyaInputRef.current?.click()} className="aspect-square border-2 border-dashed border-slate-300 bg-white rounded-xl text-slate-400 font-bold hover:border-indigo-500 hover:text-indigo-500 transition flex flex-col items-center justify-center gap-1">
                                     <div className="flex gap-1"><ImageIcon size={16} /><Video size={16} /></div>
                                     <span className="text-[9px] text-center px-1">Ekle</span>
                                 </button>
                             )}
                         </div>
                     </div>

                     <button onClick={talebiGonder} disabled={gonderiliyor} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg active:scale-95 transition-all flex justify-center items-center gap-2">
                       {gonderiliyor ? <Loader2 className="animate-spin"/> : "ŞARTLARI KABUL ET VE KEŞİF İSTE"}
                     </button>
                  </div>
                )}

                {/* 4. BAKIM SÖZLEŞMESİ SHEET */}
                {aktifMenu === 'bakim' && (
                  <div className="space-y-6 text-center py-4">
                     <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto text-blue-600">
                        <FileSignature className="w-10 h-10"/>
                     </div>
                     <div>
                        <h2 className="text-2xl font-black text-slate-800 mb-2">Bakım Sözleşmesi</h2>
                        <p className="text-sm text-slate-500">Mevcut makineleriniz için size özel yıllık periyodik bakım teklifimizi ileteceğiz.</p>
                     </div>

                     <div className="text-left space-y-4">
                        <div>
                           <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><Mail size={14}/> E-Posta Adresiniz <span className="text-red-500">*</span></label>
                           <input type="email" placeholder="Teklifin gönderileceği mail adresi" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"/>
                        </div>
                        <div>
                           <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><AlertCircle size={14}/> Ek Notunuz (Opsiyonel)</label>
                           <textarea rows={2} placeholder="Kaç adet vinç var, özel talepleriniz neler?" value={form.sorun} onChange={e => setForm({...form, sorun: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition leading-relaxed"/>
                        </div>
                     </div>

                     <button onClick={talebiGonder} disabled={gonderiliyor} className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-blue-200 active:scale-95 transition-all">
                       {gonderiliyor ? <Loader2 className="animate-spin"/> : "TEKLİF TALEP ET"}
                     </button>
                  </div>
                )}

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}