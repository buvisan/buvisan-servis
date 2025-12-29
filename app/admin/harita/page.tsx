"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, MapPin, Navigation, Info, X, ExternalLink, 
  Layers, Settings, Loader2, Moon, Sun, Activity 
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const HaritaBileseni = dynamic(() => import('@/components/HaritaBileseni'), { 
    ssr: false,
    loading: () => <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 text-blue-500 gap-3"><Loader2 className="animate-spin w-10 h-10"/><span className="font-bold">Bağlantı Kuruluyor...</span></div>
});

export default function HaritaModu() {
  const router = useRouter();
  const [vincler, setVincler] = useState<any[]>([]);
  const [secilenVinc, setSecilenVinc] = useState<any>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  // --- YENİ ÖZELLİKLER İÇİN STATE'LER ---
  const [tema, setTema] = useState<'light' | 'dark'>('light'); // Harita Teması
  const [resetTetikleyici, setResetTetikleyici] = useState(0); // Haritayı Sıfırla
  const [bilgiGoster, setBilgiGoster] = useState(false); // İstatistik Modalı

  useEffect(() => {
    async function verileriGetir() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const { data } = await supabase.from('cranes').select('*, service_tickets(*)');
      if (data) setVincler(data);
      setYukleniyor(false);
    }
    verileriGetir();
  }, []);

  // İstatistik Hesaplama
  const toplamVinc = vincler.length;
  const arizaliVinc = vincler.filter(v => v.service_tickets?.some((t:any) => t.status !== 'tamamlandi')).length;
  const aktifVinc = toplamVinc - arizaliVinc;

  if (yukleniyor) return <div className="h-screen bg-slate-900 flex items-center justify-center text-blue-400"><Loader2 className="animate-spin w-10 h-10"/></div>;

  return (
    <div className="h-screen w-full relative bg-slate-900 overflow-hidden">
      
      {/* --- HARİTA --- */}
      <div className="absolute inset-0 z-0">
         <HaritaBileseni 
            vincler={vincler} 
            secilenVinc={secilenVinc} 
            setSecilenVinc={setSecilenVinc}
            tema={tema} // Temayı gönderiyoruz
            resetTetikleyici={resetTetikleyici} // Reset komutunu gönderiyoruz
         />
      </div>

      {/* --- ÜST SOL: PANELE DÖN --- */}
      <div className="absolute top-4 left-4 z-[1000]">
         <motion.button 
            initial={{ x: -50, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
            onClick={() => router.push('/admin')}
            className="bg-white/90 backdrop-blur-md text-slate-800 p-3 rounded-xl shadow-2xl hover:bg-white flex items-center gap-2 font-bold transition"
         >
            <ArrowLeft className="w-5 h-5"/> Panele Dön
         </motion.button>
      </div>

      {/* --- ÜST SAĞ: KURUMSAL BAŞLIK (DÜZELTİLDİ) --- */}
      <div className="absolute top-4 right-4 z-[1000]">
         <motion.div 
            initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="bg-slate-900/90 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-slate-700"
         >
            <div className={`p-2 rounded-full ${arizaliVinc > 0 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}>
                <Layers className="w-5 h-5 text-white"/>
            </div>
            <div>
                <h1 className="font-bold text-sm tracking-wide">CANLI FİLO YÖNETİMİ</h1>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                    {arizaliVinc > 0 ? `${arizaliVinc} ARIZA MEVCUT` : 'SİSTEM SORUNSUZ'}
                </p>
            </div>
         </motion.div>
      </div>

      {/* --- SOL ALT: KONTROL BUTONLARI (ARTIK ÇALIŞIYOR) --- */}
      <div className="absolute bottom-8 left-4 z-[1000] hidden md:flex flex-col gap-3">
          
          {/* 1. Navigasyon: Haritayı Ortalar */}
          <button 
            onClick={() => setResetTetikleyici(prev => prev + 1)}
            className="bg-white p-3 rounded-xl shadow-lg hover:bg-blue-50 text-slate-700 transition active:scale-90" 
            title="Haritayı Ortala"
          >
            <Navigation className="w-5 h-5"/>
          </button>

          {/* 2. Ayarlar: Gece/Gündüz Modu */}
          <button 
            onClick={() => setTema(prev => prev === 'light' ? 'dark' : 'light')}
            className={`p-3 rounded-xl shadow-lg transition active:scale-90 ${tema === 'dark' ? 'bg-slate-800 text-yellow-400' : 'bg-white text-slate-700 hover:bg-blue-50'}`}
            title="Görünüm Modu"
          >
            {tema === 'light' ? <Moon className="w-5 h-5"/> : <Sun className="w-5 h-5"/>}
          </button>

          {/* 3. Bilgi: İstatistikleri Göster */}
          <button 
            onClick={() => setBilgiGoster(!bilgiGoster)}
            className={`p-3 rounded-xl shadow-lg transition active:scale-90 ${bilgiGoster ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-blue-50'}`}
            title="İstatistikler"
          >
            <Info className="w-5 h-5"/>
          </button>
      </div>

      {/* --- INFO MODALI (İSTATİSTİK KUTUSU) --- */}
      <AnimatePresence>
        {bilgiGoster && (
            <motion.div 
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="absolute bottom-8 left-20 z-[1000] bg-white/95 backdrop-blur-xl p-6 rounded-3xl shadow-2xl border border-white/50 w-72"
            >
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-600"/> Filo Durumu
                </h3>
                <div className="space-y-3">
                    <div className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                        <span className="text-sm text-slate-500 font-bold">Toplam Vinç</span>
                        <span className="text-slate-800 font-bold">{toplamVinc}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-green-50 rounded-lg border border-green-100">
                        <span className="text-sm text-green-700 font-bold">Aktif / Çalışan</span>
                        <span className="text-green-700 font-bold">{aktifVinc}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-red-50 rounded-lg border border-red-100">
                        <span className="text-sm text-red-700 font-bold">Arızalı / Bakımda</span>
                        <span className="text-red-700 font-bold">{arizaliVinc}</span>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* --- VİNÇ DETAY KARTI --- */}
      <AnimatePresence>
        {secilenVinc && (
            <motion.div 
                initial={{ y: 100, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 100, opacity: 0, scale: 0.9 }}
                className="absolute bottom-8 left-4 right-4 md:left-auto md:right-8 md:w-96 z-[1000]"
            >
                <div className="bg-white/95 backdrop-blur-xl p-0 rounded-3xl shadow-2xl overflow-hidden border border-white/50">
                    <div className={`p-4 flex justify-between items-center text-white transition-colors duration-300 ${secilenVinc.service_tickets?.some((t:any) => t.status !== 'tamamlandi') ? 'bg-red-600' : 'bg-green-600'}`}>
                        <h2 className="font-bold text-lg flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-white/80"/> <span className="truncate max-w-[200px]">{secilenVinc.location_address}</span>
                        </h2>
                        <button onClick={() => setSecilenVinc(null)} className="bg-white/20 p-1 rounded-full hover:bg-white/30 transition"><X className="w-5 h-5"/></button>
                    </div>
                    <div className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-600 font-bold text-xl shadow-inner border border-slate-100">🏗️</div>
                            <div>
                                <h3 className="font-bold text-slate-800">{secilenVinc.model_name}</h3>
                                <p className="text-sm text-slate-500">{secilenVinc.customer_name}</p>
                            </div>
                        </div>
                        {secilenVinc.service_tickets?.some((t:any) => t.status !== 'tamamlandi') && (
                            <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm font-bold mb-4 flex items-center gap-2 animate-pulse">
                                <Info className="w-4 h-4"/> DİKKAT: Aktif Arıza Kaydı Mevcut!
                            </div>
                        )}
                        <Link href={`/vinc/${secilenVinc.id}`} target="_blank" className="flex items-center justify-center w-full gap-2 bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-black transition shadow-lg group">
                            <ExternalLink className="w-4 h-4 group-hover:scale-110 transition"/> QR Paneline Git
                        </Link>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}