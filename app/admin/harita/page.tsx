"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, MapPin, Navigation, Info, X, ExternalLink, 
  Layers, Settings, Loader2 
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// --- HARİTAYI DİNAMİK OLARAK ÇAĞIRIYORUZ (SSR KAPALI) ---
// Bu sayede "Window is not defined" hatası kökten çözülüyor.
const HaritaBileseni = dynamic(() => import('@/components/HaritaBileseni'), { 
    ssr: false,
    loading: () => (
        <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 text-blue-500 gap-3">
            <Loader2 className="animate-spin w-10 h-10"/>
            <span className="font-bold">Uydu Bağlantısı Kuruluyor...</span>
        </div>
    )
});

export default function HaritaModu() {
  const router = useRouter();
  const [vincler, setVincler] = useState<any[]>([]);
  const [secilenVinc, setSecilenVinc] = useState<any>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    async function verileriGetir() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      // --- KRİTİK NOKTA: service_tickets İLE BERABER ÇEKİYORUZ ---
      // Bu sayede haritada kırmızı/yeşil ayrımı yapabiliyoruz.
      const { data } = await supabase
        .from('cranes')
        .select('*, service_tickets(*)');
      
      if (data) setVincler(data);
      setYukleniyor(false);
    }
    verileriGetir();
  }, []);

  if (yukleniyor) return <div className="h-screen bg-slate-900 flex items-center justify-center text-blue-400"><Loader2 className="animate-spin w-10 h-10"/></div>;

  return (
    <div className="h-screen w-full relative bg-slate-900 overflow-hidden">
      
      {/* --- HARİTA BİLEŞENİ (ARKAPLAN) --- */}
      <div className="absolute inset-0 z-0">
         <HaritaBileseni 
            vincler={vincler} 
            secilenVinc={secilenVinc} 
            setSecilenVinc={setSecilenVinc} 
         />
      </div>

      {/* --- ÜST SOL: PANELE DÖN --- */}
      <div className="absolute top-4 left-4 z-[1000]">
         <motion.button 
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            onClick={() => router.push('/admin')}
            className="bg-white/90 backdrop-blur-md text-slate-800 p-3 rounded-xl shadow-2xl hover:bg-white pointer-events-auto transition flex items-center gap-2 font-bold"
         >
            <ArrowLeft className="w-5 h-5"/> Panele Dön
         </motion.button>
      </div>

      {/* --- ÜST SAĞ: GOD MODE ETİKETİ --- */}
      <div className="absolute top-4 right-4 z-[1000]">
         <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-slate-900/80 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700"
         >
            <Layers className="w-5 h-5 text-blue-400"/>
            <div>
                <h1 className="font-bold text-sm">BUVİSAN GOD MODE</h1>
                <p className="text-xs text-slate-400">Canlı Filo Takip Sistemi</p>
            </div>
         </motion.div>
      </div>

      {/* --- ALT ORTA: VİNÇ DETAY KARTI (POPUP) --- */}
      <AnimatePresence>
        {secilenVinc && (
            <motion.div 
                initial={{ y: 100, opacity: 0, scale: 0.9 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 100, opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="absolute bottom-8 left-4 right-4 md:left-auto md:right-8 md:w-96 z-[1000]"
            >
                <div className="bg-white/95 backdrop-blur-xl p-0 rounded-3xl shadow-2xl overflow-hidden border border-white/50">
                    
                    {/* Kart Başlığı (Duruma Göre Renk Değiştirir) */}
                    <div className={`p-4 flex justify-between items-center text-white transition-colors duration-300 ${
                        secilenVinc.service_tickets?.some((t:any) => t.status !== 'tamamlandi') 
                        ? 'bg-red-600' // Arıza varsa Kırmızı
                        : 'bg-green-600' // Yoksa Yeşil
                    }`}>
                        <h2 className="font-bold text-lg flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-white/80"/> 
                            <span className="truncate max-w-[200px]">{secilenVinc.location_address}</span>
                        </h2>
                        <button onClick={() => setSecilenVinc(null)} className="bg-white/20 p-1 rounded-full hover:bg-white/30 transition"><X className="w-5 h-5"/></button>
                    </div>

                    {/* Kart İçeriği */}
                    <div className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-600 font-bold text-xl shadow-inner border border-slate-100">🏗️</div>
                            <div>
                                <h3 className="font-bold text-slate-800">{secilenVinc.model_name}</h3>
                                <p className="text-sm text-slate-500">{secilenVinc.customer_name}</p>
                            </div>
                        </div>

                        {/* Arıza Uyarısı (Sadece Arıza Varsa Görünür) */}
                        {secilenVinc.service_tickets?.some((t:any) => t.status !== 'tamamlandi') && (
                            <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm font-bold mb-4 flex items-center gap-2 animate-pulse">
                                <Info className="w-4 h-4"/> DİKKAT: Aktif Arıza Kaydı Mevcut!
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <div className="bg-slate-50 p-2 rounded-lg text-center border border-slate-100">
                                <div className="text-xs text-slate-400 uppercase font-bold">Kapasite</div>
                                <div className="font-bold text-slate-700">{secilenVinc.capacity}</div>
                            </div>
                            <div className="bg-slate-50 p-2 rounded-lg text-center border border-slate-100">
                                <div className="text-xs text-slate-400 uppercase font-bold">Yükseklik</div>
                                <div className="font-bold text-slate-700">{secilenVinc.lifting_height}</div>
                            </div>
                        </div>

                        <Link 
                            href={`/vinc/${secilenVinc.id}`} 
                            target="_blank"
                            className="flex items-center justify-center w-full gap-2 bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-black transition shadow-lg group"
                        >
                            <ExternalLink className="w-4 h-4 group-hover:scale-110 transition"/> QR Paneline Git
                        </Link>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* --- ALT SOL: HARİTA KONTROLLERİ (Eksik Olan Kısım) --- */}
      <div className="absolute bottom-8 left-4 z-[1000] hidden md:flex flex-col gap-2">
          <button className="bg-white p-3 rounded-xl shadow-lg hover:bg-gray-50 text-slate-700 transition" title="Navigasyon"><Navigation className="w-5 h-5"/></button>
          <button className="bg-white p-3 rounded-xl shadow-lg hover:bg-gray-50 text-slate-700 transition" title="Ayarlar"><Settings className="w-5 h-5"/></button>
          <button className="bg-white p-3 rounded-xl shadow-lg hover:bg-gray-50 text-slate-700 transition" title="Bilgi"><Info className="w-5 h-5"/></button>
      </div>

    </div>
  );
}