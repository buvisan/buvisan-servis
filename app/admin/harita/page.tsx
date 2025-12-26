"use client";
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, MapPin, Navigation, Info, X, ExternalLink, 
  Layers, Settings, Loader2 
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

export default function HaritaModu() {
  const router = useRouter();
  const [vincler, setVincler] = useState<any[]>([]);
  const [secilenVinc, setSecilenVinc] = useState<any>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  // --- HARİTA BİLEŞENİ (Dynamic Import) ---
  const Map = useMemo(() => dynamic(
    () => import('react-leaflet').then((mod) => {
        const { MapContainer, TileLayer, Marker, useMap } = mod;
        
        // CSS'i manuel yüklüyoruz
        require('leaflet/dist/leaflet.css');
        const L = require('leaflet');

        // Mavi İkon Ayarı
        const customIcon = new L.Icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers/marker-icon-2x-blue.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });

        // Harita İçerik Kontrolcüsü
        const HaritaIcerik = () => {
             // BURADAKİ 'as any' HATAYI SUSTURUR 👇
             const map = useMap() as any; 
             
             return (
                <>
                    <TileLayer
                        attribution='&copy; OpenStreetMap'
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    />
                    {vincler.map((vinc) => (
                        (vinc.lat && vinc.lng) && (
                            <Marker 
                                key={vinc.id} 
                                position={[vinc.lat, vinc.lng]} 
                                icon={customIcon}
                                eventHandlers={{
                                    click: () => {
                                        setSecilenVinc(vinc);
                                        // Animasyon artık hata vermez
                                        map.flyTo([vinc.lat, vinc.lng], 14, { duration: 1.5 });
                                    },
                                }}
                            />
                        )
                    ))}
                </>
             );
        };

        return function MapComponent() {
            return (
                <MapContainer center={[39.9334, 32.8597]} zoom={6} style={{ height: "100%", width: "100%" }} zoomControl={false}>
                    <HaritaIcerik />
                </MapContainer>
            );
        };
    }),
    { 
      ssr: false,
      loading: () => <div className="h-full flex items-center justify-center text-white"><Loader2 className="animate-spin"/> Harita Yükleniyor...</div>
    } 
  ), [vincler]);

  useEffect(() => {
    async function verileriGetir() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const { data } = await supabase.from('cranes').select('*');
      if (data) setVincler(data);
      setYukleniyor(false);
    }
    verileriGetir();
  }, []);

  if (yukleniyor) return <div className="h-screen bg-slate-900 flex items-center justify-center text-blue-400"><Loader2 className="animate-spin w-10 h-10"/></div>;

  return (
    <div className="h-screen w-full relative bg-slate-900 overflow-hidden">
      <div className="absolute inset-0 z-0"><Map /></div>

      {/* Panele Dön Butonu */}
      <div className="absolute top-4 left-4 z-[1000]">
         <motion.button 
            initial={{ x: -50, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
            onClick={() => router.push('/admin')}
            className="bg-white/90 backdrop-blur-md text-slate-800 p-3 rounded-xl shadow-2xl hover:bg-white flex items-center gap-2 font-bold"
         >
            <ArrowLeft className="w-5 h-5"/> Panele Dön
         </motion.button>
      </div>

      {/* God Mode Etiketi */}
      <div className="absolute top-4 right-4 z-[1000]">
         <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-slate-900/80 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700">
            <Layers className="w-5 h-5 text-blue-400"/>
            <div><h1 className="font-bold text-sm">BUVİSAN GOD MODE</h1><p className="text-xs text-slate-400">Canlı Filo Takip</p></div>
         </motion.div>
      </div>

      {/* Popup Kart */}
      <AnimatePresence>
        {secilenVinc && (
            <motion.div 
                initial={{ y: 100, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 100, opacity: 0, scale: 0.9 }}
                className="absolute bottom-8 left-4 right-4 md:left-auto md:right-8 md:w-96 z-[1000]"
            >
                <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
                    <div className="bg-blue-700 p-4 flex justify-between items-center text-white">
                        <h2 className="font-bold flex gap-2"><MapPin className="w-4 h-4"/> {secilenVinc.location_address}</h2>
                        <button onClick={() => setSecilenVinc(null)}><X className="w-5 h-5"/></button>
                    </div>
                    <div className="p-6">
                        <h3 className="font-bold text-lg text-slate-800 mb-1">{secilenVinc.model_name}</h3>
                        <p className="text-sm text-slate-500 mb-4">{secilenVinc.customer_name}</p>
                        <Link href={`/vinc/${secilenVinc.id}`} target="_blank" className="block w-full text-center bg-slate-900 text-white font-bold py-3 rounded-xl">
                            QR Paneline Git
                        </Link>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}