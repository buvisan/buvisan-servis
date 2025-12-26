"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams } from 'next/navigation';
import jsPDF from 'jspdf';
import { motion } from 'framer-motion'; // Animasyon kütüphanesi
import { 
  FileText, 
  Download, 
  AlertTriangle, 
  CheckCircle2, 
  Construction, 
  MapPin, 
  ArrowUpFromLine, 
  Weight 
} from 'lucide-react'; // Modern İkonlar

export default function VincDetaySayfasi() {
  const params = useParams();
  const { id } = params;

  const [vinc, setVinc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [arizaNotu, setArizaNotu] = useState("");
  const [bildirimDurumu, setBildirimDurumu] = useState("");

  useEffect(() => {
    async function vinciGetir() {
      if (!id) return;
      const { data, error } = await supabase.from('cranes').select('*').eq('id', id).single();
      if (!error) setVinc(data);
      setLoading(false);
    }
    vinciGetir();
  }, [id]);

  const arizaBildir = async () => {
    if (!arizaNotu) return alert("Lütfen bir not yazın.");
    setBildirimDurumu("loading");
    
    // Yapay bir gecikme ekleyelim ki kullanıcı işlem olduğunu hissetsin
    await new Promise(r => setTimeout(r, 800));

    const { error } = await supabase.from('service_tickets').insert([{ 
      crane_id: id, issue_type: 'Genel Arıza', description: arizaNotu, status: 'beklemede' 
    }]);

    if (error) {
      alert("Hata: " + error.message);
      setBildirimDurumu("");
    } else {
      setBildirimDurumu("success");
      setArizaNotu("");
    }
  };

  const pdfIndir = () => {
    if (!vinc) return;
    const doc = new jsPDF();
    doc.setFontSize(22); doc.text("BUVISAN TEKNIK SERVIS", 20, 20);
    doc.setFontSize(12); doc.text(`Model: ${vinc.model_name}`, 20, 40);
    doc.text(`Seri No: ${vinc.serial_number}`, 20, 50);
    doc.text(`Tarih: ${new Date().toLocaleDateString()}`, 20, 60);
    doc.save(`Buvisan-${vinc.serial_number}.pdf`);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full"
      />
    </div>
  );

  if (!vinc) return <div className="p-10 text-center text-red-500 font-bold">Kayıt Bulunamadı.</div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-900 via-blue-800 to-gray-900 p-4 font-sans text-gray-800 pb-20">
      
      {/* ÜST BAŞLIK ALANI */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center pt-6 pb-8"
      >
        <h1 className="text-3xl font-extrabold text-white tracking-tight drop-shadow-md">BUVİSAN</h1>
        <p className="text-blue-200 text-sm font-medium tracking-widest uppercase mt-1">Dijital Asistan v1.0</p>
      </motion.div>

      {/* ANA KART (Vinç Bilgileri) */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl overflow-hidden max-w-md mx-auto relative z-10"
      >
        {/* Kart Başlığı */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white opacity-10 rounded-full blur-xl"></div>
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg">
              <Construction className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-tight">{vinc.model_name}</h2>
              <p className="text-blue-100 text-sm font-mono mt-1 opacity-80">{vinc.serial_number}</p>
            </div>
          </div>
        </div>

        {/* Bilgiler Grid */}
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <div className="flex items-center gap-2 text-gray-400 mb-1 text-xs uppercase font-bold">
              <Weight className="w-4 h-4" /> Kapasite
            </div>
            <div className="text-gray-800 font-bold text-lg">{vinc.capacity}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <div className="flex items-center gap-2 text-gray-400 mb-1 text-xs uppercase font-bold">
              <ArrowUpFromLine className="w-4 h-4" /> Yükseklik
            </div>
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

        {/* BUTONLAR ALANI */}
        <div className="px-6 pb-6 space-y-3">
          {/* Orijinal Dosya Butonu (Varsa) */}
          {vinc.pdf_url && (
            <motion.a 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              href={vinc.pdf_url}
              target="_blank"
              className="flex items-center justify-center w-full gap-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-red-500/30 transition-all"
            >
              <FileText className="w-5 h-5" />
              Kullanım Kılavuzu (Orijinal)
            </motion.a>
          )}

          {/* Otomatik PDF Butonu */}
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={pdfIndir}
            className="flex items-center justify-center w-full gap-3 bg-slate-800 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-slate-900 transition-all"
          >
            <Download className="w-5 h-5" />
            Kimlik Kartı Oluştur
          </motion.button>
        </div>
      </motion.div>

      {/* ARIZA BİLDİRİM KARTI (Animasyonlu) */}
      <motion.div 
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="max-w-md mx-auto mt-6"
      >
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl p-6 shadow-xl relative overflow-hidden">
           {/* Dekoratif Kırmızı Arkaplan Efekti */}
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 to-red-600"></div>

           <div className="flex items-center gap-2 mb-4">
             <div className="bg-red-100 p-2 rounded-full">
               <AlertTriangle className="w-5 h-5 text-red-600" />
             </div>
             <h3 className="text-lg font-bold text-gray-800">Servis Talebi</h3>
           </div>

           <textarea 
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all text-gray-700 min-h-[100px] resize-none"
            placeholder="Sorunu kısaca açıklayın (Örn: Halat sesi, kumanda çalışmıyor...)"
            value={arizaNotu}
            onChange={(e) => setArizaNotu(e.target.value)}
           ></textarea>

           <div className="mt-4">
             {bildirimDurumu === "success" ? (
               <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-green-100 text-green-700 p-4 rounded-xl flex items-center justify-center gap-2 font-bold"
               >
                 <CheckCircle2 className="w-6 h-6" /> Talebiniz Alındı!
               </motion.div>
             ) : (
               <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={arizaBildir}
                disabled={bildirimDurumu === "loading"}
                className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2
                  ${bildirimDurumu === "loading" ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-orange-500 to-red-600 hover:shadow-red-500/40'}
                `}
               >
                 {bildirimDurumu === "loading" ? "Gönderiliyor..." : "SERVİS ÇAĞIR"}
               </motion.button>
             )}
           </div>
        </div>
      </motion.div>

      <div className="mt-8 text-center">
        <p className="text-blue-200/50 text-xs">Powered by ZM Çelik & Buvisan Technology</p>
      </div>

    </div>
  );
}