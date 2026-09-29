"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams } from 'next/navigation';
import jsPDF from 'jspdf';
import { motion, AnimatePresence } from 'framer-motion';
import ChatAlani from '@/components/ChatAlani';
import { 
  FileText, 
  Download, 
  AlertTriangle, 
  CheckCircle2, 
  Construction, 
  MapPin, 
  ArrowUpFromLine, 
  Weight, 
  Camera, 
  Loader2, 
  History, 
  Wrench, 
  Truck, 
  CheckCircle, 
  FolderOpen,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

export default function VincDetaySayfasi() {
  const params = useParams();
  const { id } = params;

  // --- STATE TANIMLARI (DEĞİŞTİRİLMEDİ) ---
  const [vinc, setVinc] = useState<any>(null);
  const [gecmis, setGecmis] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [arizaNotu, setArizaNotu] = useState("");
  const [bildirimDurumu, setBildirimDurumu] = useState("");
  const [secilenMedya, setSecilenMedya] = useState<File | null>(null);

  // --- VERİ ÇEKME (DEĞİŞTİRİLMEDİ) ---
  useEffect(() => {
    async function verileriGetir() {
      if (!id) return;
      
      const { data: vincData, error: vincError } = await supabase
        .from('cranes')
        .select('*, service_tickets(*)')
        .eq('id', id)
        .single();
      
      if (vincError) {
        console.error("Vinç hatası:", vincError);
        setLoading(false);
        return;
      }
      setVinc(vincData);

      const { data: gecmisData } = await supabase
        .from('crane_history')
        .select('*')
        .eq('crane_id', id)
        .order('created_at', { ascending: false });
      
      setGecmis(gecmisData || []);
      setLoading(false);
    }
    verileriGetir();
  }, [id]);

  // --- YARDIMCI FONKSİYONLAR (DEĞİŞTİRİLMEDİ) ---
  const dosyaIsminiTemizle = (isim: string) => {
    return isim.replace(/[^a-zA-Z0-9.-]/g, '').toLowerCase();
  };

  const telegramBildirimiGonder = async (not: string, medyaVarMi: boolean) => {
    const botToken = "8567697885:AAGCSyckJKLG11HwTQaMGGUwMyXIm0UqAK0"; 
    const grupId = "-5079408473"; 

    const baslik = medyaVarMi ? "📸 *FOTOĞRAFLI YENİ ARIZA!*" : "🚨 *YENİ ARIZA BİLDİRİMİ!*";
    
    const mesaj = `${baslik}\n\n` +
                  `🏗️ *Vinç:* ${vinc.model_name}\n` +
                  `🔢 *Seri No:* ${vinc.serial_number}\n` +
                  `🏢 *Müşteri:* ${vinc.customer_name}\n` +
                  `📍 *Konum:* ${vinc.location_address}\n` +
                  `------------------\n` +
                  `⚠️ *Sorun:* ${not}`;
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: grupId,
          text: mesaj,
          parse_mode: 'Markdown'
        })
      });
    } catch (e) {
      console.error("Telegram hatası:", e);
    }
  };

  const arizaBildir = async () => {
    if (!arizaNotu) return alert("Lütfen sorunu açıklayan bir not yazın.");
    setBildirimDurumu("loading");
    
    let medyaLinki = null;

    try {
        if (secilenMedya) {
            const uzantisi = secilenMedya.name.split('.').pop() || 'jpg';
            const dosyaAdi = `${Date.now()}-ariza.${dosyaIsminiTemizle(uzantisi)}`;
            
            const { error: upErr } = await supabase.storage
                .from('ariza-medya')
                .upload(dosyaAdi, secilenMedya);

            if (upErr) throw upErr;

            const { data: urlData } = supabase.storage
                .from('ariza-medya')
                .getPublicUrl(dosyaAdi);
                
            medyaLinki = urlData.publicUrl;
        }

        const { error } = await supabase.from('service_tickets').insert([{ 
            crane_id: id, 
            issue_type: 'Genel Arıza', 
            description: arizaNotu, 
            status: 'beklemede', 
            media_url: medyaLinki 
        }]);

        if (error) throw error;

        await telegramBildirimiGonder(arizaNotu, !!medyaLinki);

        setBildirimDurumu("success");
        setArizaNotu("");
        setSecilenMedya(null);

        // 3 saniye sonra başarı mesajını gizle
        setTimeout(() => setBildirimDurumu(""), 3000);

    } catch (error: any) {
        alert("Hata: " + error.message);
        setBildirimDurumu("");
    }
  };

  const pdfIndir = () => {
    if (!vinc) return;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("BUVISAN DIJITAL SERVIS", 20, 20);
    doc.setFontSize(12);
    doc.text(`Model: ${vinc.model_name}`, 20, 40);
    doc.text(`Seri No: ${vinc.serial_number}`, 20, 50);
    doc.text(`Müşteri: ${vinc.customer_name}`, 20, 60);
    doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, 20, 70);
    doc.save(`Kimlik-${vinc.serial_number}.pdf`);
  };

  const getIcon = (type: string) => {
    switch(type) {
      case 'uretim': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'montaj': return <Truck className="w-5 h-5 text-blue-500" />;
      case 'bakim': return <Wrench className="w-5 h-5 text-amber-500" />;
      case 'ariza': return <AlertTriangle className="w-5 h-5 text-rose-500" />;
      default: return <History className="w-5 h-5 text-slate-400" />;
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin w-10 h-10 text-blue-500"/>
        <p className="text-blue-200 font-medium animate-pulse">Sistem Yükleniyor...</p>
      </div>
    </div>
  );
  
  if (!vinc) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6">
      <div className="bg-white p-8 rounded-3xl shadow-2xl text-center max-w-sm w-full">
        <AlertTriangle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">Kayıt Bulunamadı</h2>
        <p className="text-slate-500 text-sm">Bu QR koda ait aktif bir vinç kaydı sistemde yer almıyor.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0A1128] text-slate-800 pb-24 selection:bg-blue-200 font-sans relative overflow-x-hidden">
      
      {/* Arka Plan Dekoratif Elementleri */}
      <div className="absolute top-0 left-0 w-full h-96 bg-blue-600/20 blur-[100px] rounded-full pointer-events-none -translate-y-1/2"></div>
      
      <div className="max-w-md mx-auto px-4 relative z-10">
        
        {/* ÜST BAŞLIK */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center pt-10 pb-8">
          <h1 className="text-4xl font-black text-white tracking-tight">BUVİSAN</h1>
          <p className="text-blue-300 text-xs font-bold tracking-[0.2em] uppercase mt-2 opacity-80">Dijital Servis Asistanı</p>
        </motion.div>

        {/* ANA VİNÇ KARTI */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          className="bg-white rounded-[2rem] shadow-2xl overflow-hidden mb-6 border border-white/20"
        >
          {/* Kart Üst Bilgi (Gradient) */}
          <div className="bg-gradient-to-br from-blue-700 to-blue-900 p-6 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Construction className="w-32 h-32 -rotate-12 translate-x-8 -translate-y-8" /></div>
            <div className="relative z-10 flex items-start gap-4">
              <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/20 shadow-inner">
                <Construction className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold leading-tight">{vinc.model_name}</h2>
                <div className="flex items-center gap-2 mt-2">
                  <span className="bg-blue-950/50 px-3 py-1 rounded-full text-blue-100 text-xs font-mono font-medium border border-white/10 backdrop-blur-sm">
                    {vinc.serial_number}
                  </span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
              </div>
            </div>
          </div>
          
          {/* Kart İçi Detaylar */}
          <div className="p-6">
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-400 mb-2 text-[10px] uppercase font-bold tracking-wider">
                  <Weight className="w-3.5 h-3.5" /> Kapasite
                </div>
                <div className="text-slate-800 font-bold text-lg">{vinc.capacity}</div>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-400 mb-2 text-[10px] uppercase font-bold tracking-wider">
                  <ArrowUpFromLine className="w-3.5 h-3.5" /> Yükseklik
                </div>
                <div className="text-slate-800 font-bold text-lg">{vinc.lifting_height}</div>
              </div>
              <div className="col-span-2 bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-start gap-3">
                <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-100 shrink-0">
                  <MapPin className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-1">Konum / Müşteri</div>
                  <div className="text-slate-800 font-bold text-sm leading-tight mb-1">{vinc.customer_name}</div>
                  <div className="text-slate-500 font-medium text-xs leading-snug">{vinc.location_address}</div>
                </div>
              </div>
            </div>

            {/* --- DOKÜMAN BUTONLARI --- */}
            <div className="space-y-3 pt-2">
               <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1 mb-3">Teknik Belgeler</h3>
               
               {vinc.pdf_url && (
                 <a href={vinc.pdf_url} target="_blank" className="group flex items-center gap-4 bg-rose-50 hover:bg-rose-100 p-3.5 rounded-2xl transition-all duration-200 border border-rose-100/50">
                   <div className="bg-rose-100 group-hover:bg-rose-200 p-2 rounded-xl text-rose-600 transition-colors"><FileText className="w-5 h-5"/></div>
                   <span className="flex-1 font-bold text-rose-700 text-sm">İş Emri Formu</span>
                   <ChevronRight className="w-5 h-5 text-rose-300 group-hover:translate-x-1 transition-transform"/>
                 </a>
               )}
               
               {vinc.pdf_url_2 && (
                 <a href={vinc.pdf_url_2} target="_blank" className="group flex items-center gap-4 bg-slate-50 hover:bg-slate-100 p-3.5 rounded-2xl transition-all duration-200 border border-slate-100">
                   <div className="bg-blue-100 group-hover:bg-blue-200 p-2 rounded-xl text-blue-600 transition-colors"><FolderOpen className="w-5 h-5"/></div>
                   <span className="flex-1 font-bold text-slate-700 text-sm">Devreye Alma Formu</span>
                   <Download className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors"/>
                 </a>
               )}
               
               {vinc.pdf_url_3 && (
                 <a href={vinc.pdf_url_3} target="_blank" className="group flex items-center gap-4 bg-slate-50 hover:bg-slate-100 p-3.5 rounded-2xl transition-all duration-200 border border-slate-100">
                   <div className="bg-blue-100 group-hover:bg-blue-200 p-2 rounded-xl text-blue-600 transition-colors"><FolderOpen className="w-5 h-5"/></div>
                   <span className="flex-1 font-bold text-slate-700 text-sm">Elektrik Şeması</span>
                   <Download className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors"/>
                 </a>
               )}

               {vinc.pdf_url_4 && (
                 <a href={vinc.pdf_url_4} target="_blank" className="group flex items-center gap-4 bg-slate-50 hover:bg-slate-100 p-3.5 rounded-2xl transition-all duration-200 border border-slate-100">
                   <div className="bg-blue-100 group-hover:bg-blue-200 p-2 rounded-xl text-blue-600 transition-colors"><FolderOpen className="w-5 h-5"/></div>
                   <span className="flex-1 font-bold text-slate-700 text-sm">Genel Montaj</span>
                   <Download className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors"/>
                 </a>
               )}

               <button onClick={pdfIndir} className="w-full flex items-center justify-center gap-2 bg-[#0A1128] hover:bg-[#121d42] text-white font-bold py-4 rounded-2xl transition-all duration-200 text-sm shadow-md mt-4 active:scale-[0.98]">
                 <Download className="w-4 h-4 text-blue-300"/> Cihaz Kimlik Kartı İndir
               </button>
            </div>
          </div>
        </motion.div>

        {/* --- TIMELINE (SERVİS GEÇMİŞİ) --- */}
        <div className="mb-10">
          <h3 className="text-white font-bold text-lg mb-6 flex items-center gap-2 ml-2">
            <History className="w-5 h-5 text-blue-400"/> Servis Geçmişi
          </h3>
          
          <div className="bg-white/5 backdrop-blur-md rounded-[2rem] p-6 border border-white/10">
            {gecmis.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-4">
                Henüz geçmiş kaydı bulunmamaktadır.
              </div>
            ) : (
              <div className="relative border-l-2 border-white/10 ml-4 space-y-8 pb-4">
                {gecmis.map((olay, index) => (
                  <motion.div 
                    key={olay.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="relative pl-6"
                  >
                    {/* Timeline Noktası */}
                    <div className="absolute -left-[17px] top-0 bg-[#0A1128] p-1 rounded-full border-2 border-white/10">
                      {getIcon(olay.event_type)}
                    </div>
                    
                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 relative -top-1">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-slate-800 text-sm">{olay.title}</h4>
                        <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                          {new Date(olay.created_at).toLocaleDateString('tr-TR')}
                        </span>
                      </div>
                      <p className="text-slate-500 text-xs leading-relaxed mt-2">{olay.description}</p>
                      
                      {olay.technician_name && (
                        <div className="mt-3 pt-3 border-t border-slate-50 text-[11px] font-bold text-blue-600 flex items-center gap-1.5 inline-flex bg-blue-50 px-3 py-1.5 rounded-xl">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Usta: {olay.technician_name}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* --- ARIZA BİLDİRİM FORMU --- */}
        <div className="bg-white rounded-[2rem] p-6 shadow-2xl border border-slate-100 relative overflow-hidden">
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 to-rose-600"></div>
           
           <h3 className="text-lg font-extrabold text-slate-800 mb-4 flex items-center gap-2">
             <AlertTriangle className="w-5 h-5 text-rose-500"/> Servis Talebi Oluştur
           </h3>
           
           <div className="space-y-4">
             <div className="relative">
               <textarea 
                 className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm min-h-[120px] resize-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all outline-none text-slate-700 placeholder:text-slate-400" 
                 placeholder="Lütfen yaşadığınız sorunu kısaca açıklayın..." 
                 value={arizaNotu} 
                 onChange={(e)=>setArizaNotu(e.target.value)}
               ></textarea>
             </div>

             {/* Fotoğraf Yükleme Alanı */}
             <label className={`flex items-center justify-center w-full gap-2 p-4 rounded-2xl border-2 border-dashed cursor-pointer text-sm font-bold transition-all duration-200 ${secilenMedya ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:border-slate-300'}`}>
                <Camera className={`w-5 h-5 ${secilenMedya ? 'text-emerald-500' : 'text-slate-400'}`}/> 
                <span className="truncate max-w-[200px]">
                  {secilenMedya ? secilenMedya.name : "Fotoğraf / Video Ekle (İsteğe Bağlı)"}
                </span>
                <input type="file" accept="image/*,video/*" onChange={(e)=>setSecilenMedya(e.target.files?.[0]||null)} className="hidden" />
             </label>

             <button 
               onClick={arizaBildir} 
               disabled={bildirimDurumu === "loading"} 
               className={`w-full text-white font-bold py-4 rounded-2xl shadow-lg shadow-rose-500/25 transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98] ${bildirimDurumu === "loading" ? 'bg-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700'}`}
             >
               {bildirimDurumu === "loading" ? (
                 <><Loader2 className="animate-spin w-5 h-5"/> Gönderiliyor...</>
               ) : (
                 "SERVİS ÇAĞIR"
               )}
             </button>

             <AnimatePresence>
               {bildirimDurumu === "success" && (
                 <motion.div 
                   initial={{ opacity: 0, y: -10, height: 0 }}
                   animate={{ opacity: 1, y: 0, height: 'auto' }}
                   exit={{ opacity: 0, y: -10, height: 0 }}
                   className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl text-center font-bold text-sm border border-emerald-100 flex items-center justify-center gap-2"
                 >
                   <CheckCircle2 className="w-5 h-5" /> Talebiniz başarıyla iletildi!
                 </motion.div>
               )}
             </AnimatePresence>
           </div>
        </div>

        {/* --- AKTİF TİCKET SOHBET ALANI --- */}
        {vinc && vinc.service_tickets?.some((t: any) => t.status !== 'tamamlandi') && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-8 mb-4">
            <h3 className="text-white font-bold text-sm mb-3 ml-2 flex items-center gap-2 opacity-90">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Canlı Destek
            </h3>
            <div className="bg-white rounded-[2rem] p-2 shadow-2xl border border-slate-100 overflow-hidden">
              <ChatAlani 
                ticketId={vinc.service_tickets.find((t: any) => t.status !== 'tamamlandi').id} 
                kimimBen="musteri" 
              />
            </div>
          </motion.div>
        )}

      </div>
      
      {/* FOOTER */}
      <div className="absolute bottom-6 w-full text-center">
        <p className="text-white/30 text-[10px] font-medium tracking-widest uppercase">
          Powered by Buvisan Technology
        </p>
      </div>

    </div>
  );
}