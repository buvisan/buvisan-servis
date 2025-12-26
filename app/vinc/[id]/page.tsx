"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams } from 'next/navigation';
import jsPDF from 'jspdf';
import { motion } from 'framer-motion';
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
  FolderOpen 
} from 'lucide-react';

export default function VincDetaySayfasi() {
  const params = useParams();
  const { id } = params;

  // --- STATE TANIMLARI ---
  const [vinc, setVinc] = useState<any>(null);
  const [gecmis, setGecmis] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Arıza Formu için
  const [arizaNotu, setArizaNotu] = useState("");
  const [bildirimDurumu, setBildirimDurumu] = useState("");
  const [secilenMedya, setSecilenMedya] = useState<File | null>(null);

  // --- VERİ ÇEKME ---
  useEffect(() => {
    async function verileriGetir() {
      if (!id) return;
      
      // 1. Vinç Bilgisi
      const { data: vincData, error: vincError } = await supabase
        .from('cranes')
        .select('*')
        .eq('id', id)
        .single();
      
      if (vincError) {
        console.error("Vinç hatası:", vincError);
        setLoading(false);
        return;
      }
      setVinc(vincData);

      // 2. Geçmiş (Timeline) Bilgisi
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

  // --- YARDIMCI FONKSİYONLAR ---

  // Dosya ismini temizle (Türkçe karakter vb. atar)
  const dosyaIsminiTemizle = (isim: string) => {
    return isim.replace(/[^a-zA-Z0-9.-]/g, '').toLowerCase();
  };

  // Telegram Bildirimi
  const telegramBildirimiGonder = async (not: string, medyaVarMi: boolean) => {
    // BURAYI KENDİ BİLGİLERİNLE DOLDURMAYI UNUTMA! 👇
    const botToken = "BURAYA_TOKENI_YAZ"; 
    const grupId = "BURAYA_GRUP_ID_YAZ";  

    if(botToken === "BURAYA_TOKENI_YAZ") return; // Token girilmemişse çalışma

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

  // Arıza Bildirim Gönderme
  const arizaBildir = async () => {
    if (!arizaNotu) return alert("Lütfen sorunu açıklayan bir not yazın.");
    setBildirimDurumu("loading");
    
    let medyaLinki = null;

    try {
        // 1. Medya varsa yükle
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

        // 2. Veritabanına yaz
        const { error } = await supabase.from('service_tickets').insert([{ 
            crane_id: id, 
            issue_type: 'Genel Arıza', 
            description: arizaNotu, 
            status: 'beklemede', 
            media_url: medyaLinki 
        }]);

        if (error) throw error;

        // 3. Bildirim at
        await telegramBildirimiGonder(arizaNotu, !!medyaLinki);

        setBildirimDurumu("success");
        setArizaNotu("");
        setSecilenMedya(null);

    } catch (error: any) {
        alert("Hata: " + error.message);
        setBildirimDurumu("");
    }
  };

  // Otomatik Kimlik Kartı (PDF)
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

  // Timeline İkon Seçici
  const getIcon = (type: string) => {
    switch(type) {
      case 'uretim': return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'montaj': return <Truck className="w-5 h-5 text-blue-600" />;
      case 'bakim': return <Wrench className="w-5 h-5 text-orange-500" />;
      case 'ariza': return <AlertTriangle className="w-5 h-5 text-red-500" />;
      default: return <History className="w-5 h-5 text-gray-500" />;
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin w-8 h-8 text-blue-600"/></div>;
  if (!vinc) return <div className="p-10 text-center text-red-500 font-bold">Kayıt Bulunamadı.</div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-900 via-blue-800 to-gray-900 p-4 font-sans text-gray-800 pb-20">
      
      {/* ÜST BAŞLIK */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center pt-6 pb-8">
        <h1 className="text-3xl font-extrabold text-white tracking-tight drop-shadow-md">BUVİSAN</h1>
        <p className="text-blue-200 text-sm font-medium tracking-widest uppercase mt-1">Dijital Servis Asistanı</p>
      </motion.div>

      {/* ANA VİNÇ KARTI */}
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl overflow-hidden max-w-md mx-auto mb-6 relative z-10">
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg"><Construction className="w-8 h-8 text-white" /></div>
            <div>
              <h2 className="text-xl font-bold leading-tight">{vinc.model_name}</h2>
              <p className="text-blue-100 text-sm font-mono mt-1 opacity-80">{vinc.serial_number}</p>
            </div>
          </div>
        </div>
        
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <div className="flex items-center gap-2 text-gray-400 mb-1 text-xs uppercase font-bold"><Weight className="w-4 h-4" /> Kapasite</div>
            <div className="text-gray-800 font-bold text-lg">{vinc.capacity}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <div className="flex items-center gap-2 text-gray-400 mb-1 text-xs uppercase font-bold"><ArrowUpFromLine className="w-4 h-4" /> Yükseklik</div>
            <div className="text-gray-800 font-bold text-lg">{vinc.lifting_height}</div>
          </div>
          <div className="col-span-2 bg-gray-50 p-3 rounded-xl border border-gray-100 flex items-start gap-3">
            <MapPin className="w-5 h-5 text-blue-500 mt-1 shrink-0" />
            <div>
              <div className="text-gray-400 text-xs uppercase font-bold mb-1">Konum</div>
              <div className="text-gray-800 font-medium leading-snug">{vinc.location_address}</div>
            </div>
          </div>
        </div>

        {/* --- DOKÜMAN BUTONLARI (YENİLENEN KISIM) --- */}
        <div className="px-6 pb-6 space-y-3 border-t border-gray-100 pt-4">
           <h3 className="text-xs font-bold text-gray-400 uppercase ml-1 mb-2">Teknik Dokümanlar & Belgeler</h3>
           
           {/* Buton 1 (Kırmızı - Ana Kullanım Kılavuzu) */}
           {vinc.pdf_url ? (
             <a href={vinc.pdf_url} target="_blank" className="flex items-center gap-3 bg-red-50 text-red-700 font-bold py-3 px-4 rounded-xl shadow-sm hover:bg-red-100 transition border border-red-100">
               <FileText className="w-5 h-5 text-red-600"/> 
               <span className="flex-1">İş Emri Formu</span>
               <Download className="w-4 h-4 opacity-50"/>
             </a>
           ) : null}
           
           {/* Buton 2 (Mavi - Ek Doküman) */}
           {vinc.pdf_url_2 ? (
             <a href={vinc.pdf_url_2} target="_blank" className="flex items-center gap-3 bg-blue-50 text-blue-700 font-bold py-3 px-4 rounded-xl shadow-sm hover:bg-blue-100 transition border border-blue-100">
               <FolderOpen className="w-5 h-5 text-blue-600"/> 
               <span className="flex-1">Devreye Alma Formu </span>
               <Download className="w-4 h-4 opacity-50"/>
             </a>
           ) : null}
           
           {/* Buton 3 (Mavi - Ek Doküman) */}
           {vinc.pdf_url_3 ? (
             <a href={vinc.pdf_url_3} target="_blank" className="flex items-center gap-3 bg-blue-50 text-blue-700 font-bold py-3 px-4 rounded-xl shadow-sm hover:bg-blue-100 transition border border-blue-100">
               <FolderOpen className="w-5 h-5 text-blue-600"/> 
               <span className="flex-1">Elektrik Şeması</span>
               <Download className="w-4 h-4 opacity-50"/>
             </a>
           ) : null}

           {/* Buton 4 (Mavi - Ek Doküman) */}
           {vinc.pdf_url_4 ? (
             <a href={vinc.pdf_url_4} target="_blank" className="flex items-center gap-3 bg-blue-50 text-blue-700 font-bold py-3 px-4 rounded-xl shadow-sm hover:bg-blue-100 transition border border-blue-100">
               <FolderOpen className="w-5 h-5 text-blue-600"/> 
               <span className="flex-1">Genel Montaj</span>
               <Download className="w-4 h-4 opacity-50"/>
             </a>
           ) : null}

           {/* Otomatik Kimlik Kartı */}
           <button onClick={pdfIndir} className="flex items-center gap-3 w-full justify-center bg-slate-800 text-white font-bold py-4 rounded-xl hover:bg-slate-900 transition text-sm shadow-lg mt-2">
             <Download className="w-4 h-4"/> Otomatik Kimlik Kartı Oluştur
           </button>
        </div>
      </motion.div>

      {/* --- TIMELINE (SERVİS GEÇMİŞİ) --- */}
      <div className="max-w-md mx-auto mb-8">
        <h3 className="text-white/80 font-bold text-lg mb-4 flex items-center gap-2 px-2">
          <History className="w-5 h-5"/> Servis Geçmişi & Şecere
        </h3>
        
        <div className="space-y-4">
          {gecmis.length === 0 ? (
            <div className="bg-white/10 backdrop-blur border border-white/20 p-6 rounded-2xl text-center text-blue-200 text-sm">
              Henüz geçmiş kaydı girilmemiş.
            </div>
          ) : (
            gecmis.map((olay, index) => (
              <motion.div 
                key={olay.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white/95 rounded-2xl p-4 shadow-lg flex gap-4 relative overflow-hidden"
              >
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 to-blue-600"></div>
                
                <div className="mt-1 bg-gray-100 p-2 rounded-full h-fit shrink-0 border border-gray-200">
                  {getIcon(olay.event_type)}
                </div>
                
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-gray-800 text-sm">{olay.title}</h4>
                    <span className="text-xs text-gray-400 font-mono bg-gray-100 px-2 py-1 rounded">
                      {new Date(olay.created_at).toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                  <p className="text-gray-600 text-xs mt-1 leading-relaxed">{olay.description}</p>
                  {olay.technician_name && (
                    <div className="mt-2 text-xs font-bold text-blue-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {olay.technician_name}
                    </div>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* --- ARIZA BİLDİRİM FORMU --- */}
      <div className="max-w-md mx-auto">
        <div className="bg-white/95 backdrop-blur rounded-3xl p-6 shadow-xl border-t-4 border-red-500">
           <h3 className="text-lg font-bold text-gray-800 mb-3 flex gap-2">
             <AlertTriangle className="text-red-600"/> Arıza Bildir
           </h3>
           
           <textarea 
             className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm min-h-[100px] resize-none focus:ring-2 focus:ring-red-500 outline-none" 
             placeholder="Sorun nedir? Kısaca açıklayın..." 
             value={arizaNotu} 
             onChange={(e)=>setArizaNotu(e.target.value)}
           ></textarea>

           {/* Fotoğraf Yükleme Alanı */}
           <label className={`mt-3 flex items-center justify-center w-full gap-2 p-3 rounded-xl border-2 border-dashed cursor-pointer text-sm font-bold transition ${secilenMedya ? 'bg-green-50 border-green-500 text-green-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
              <Camera className="w-4 h-4"/> 
              {secilenMedya ? "Fotoğraf/Video Hazır ✅" : "Fotoğraf veya Video Ekle"}
              <input type="file" accept="image/*,video/*" onChange={(e)=>setSecilenMedya(e.target.files?.[0]||null)} className="hidden" />
           </label>
           
           {secilenMedya && (
             <p className="text-center text-xs text-green-600 mt-1 truncate px-2">{secilenMedya.name}</p>
           )}

           <button 
             onClick={arizaBildir} 
             disabled={bildirimDurumu === "loading"} 
             className={`w-full mt-4 text-white font-bold py-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 ${bildirimDurumu === "loading" ? 'bg-gray-400' : 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600'}`}
           >
             {bildirimDurumu === "loading" ? <Loader2 className="animate-spin w-5 h-5"/> : "SERVİS ÇAĞIR"}
           </button>

           {bildirimDurumu === "success" && (
             <div className="mt-3 bg-green-100 text-green-700 p-3 rounded-xl text-center font-bold text-sm">
               🚀 Bildirim Başarıyla Gönderildi!
             </div>
           )}
        </div>
      </div>
      
      <div className="mt-8 text-center pb-8">
        <p className="text-blue-200/50 text-xs">Powered by Buvisan Crane Systems Technology</p>
      </div>

    </div>
  );
}