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

// Leaflet'i dinamik import ediyoruz (SSR Hatasını önlemek için)
import dynamic from 'next/dynamic';

export default function HaritaModu() {
  const router = useRouter();
  const [vincler, setVincler] = useState<any[]>([]);
  const [secilenVinc, setSecilenVinc] = useState<any>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  // Harita Bileşeni (Client Side Only)
  const Map = useMemo(() => dynamic(
    () => import('react-leaflet').then((mod) => {
        const { MapContainer, TileLayer, Marker, useMap } = mod;
        // Leaflet CSS düzeltmesi
        require('leaflet/dist/leaflet.css');
        const L = require('leaflet');

        // Varsayılan İkonu Güzelleştir (Buvisan Mavisi Pin)
        const customIcon = new L.Icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers/marker-icon-2x-blue.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });

        // Harita İçi Bileşen
        const HaritaIcerik = () => {
             const map = useMap();
             return (
                <>
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        // CartoDB Voyager teması (Çok daha modern ve temiz görünür)
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    />
                    {vincler.map((vinc) => (
                        // Eğer koordinat girilmemişse haritada gösterme
                        (vinc.lat && vinc.lng) && (
                            <Marker 
                                key={vinc.id} 
                                position={[vinc.lat, vinc.lng]} 
                                icon={customIcon}
                                eventHandlers={{
                                    click: () => {
                                        setSecilenVinc(vinc);
                                        // Tıklayınca hafifçe oraya odaklan
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
    { ssr: false } // Server side render kapatıldı
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
      
      {/* --- HARİTA --- */}
      <div className="absolute inset-0 z-0">
         <Map />
      </div>

      {/* --- ÜST KONTROL BAR --- */}
      <div className="absolute top-4 left-4 right-4 z-[1000] flex justify-between items-start pointer-events-none">
         <motion.button 
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            onClick={() => router.push('/admin')}
            className="bg-white/90 backdrop-blur-md text-slate-800 p-3 rounded-xl shadow-2xl hover:bg-white pointer-events-auto transition flex items-center gap-2 font-bold"
         >
            <ArrowLeft className="w-5 h-5"/> Panele Dön
         </motion.button>

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

      {/* --- VİNÇ DETAY KARTI (POPUP) --- */}
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
                    
                    {/* Kart Başlığı */}
                    <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-4 flex justify-between items-start text-white">
                        <div>
                            <h2 className="font-bold text-lg flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-blue-200"/> {secilenVinc.location_address}
                            </h2>
                            <p className="text-blue-100 text-xs mt-1 font-mono opacity-80">{secilenVinc.serial_number}</p>
                        </div>
                        <button onClick={() => setSecilenVinc(null)} className="bg-white/20 p-1 rounded-full hover:bg-white/30 transition"><X className="w-5 h-5"/></button>
                    </div>

                    {/* Kart İçeriği */}
                    <div className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xl">🏗️</div>
                            <div>
                                <h3 className="font-bold text-slate-800">{secilenVinc.model_name}</h3>
                                <p className="text-sm text-slate-500">{secilenVinc.customer_name}</p>
                            </div>
                        </div>

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

      {/* --- HARİTA KONTROLLERİ --- */}
      <div className="absolute bottom-8 left-4 z-[1000] hidden md:flex flex-col gap-2">
          <button className="bg-white p-3 rounded-xl shadow-lg hover:bg-gray-50 text-slate-700"><Navigation className="w-5 h-5"/></button>
          <button className="bg-white p-3 rounded-xl shadow-lg hover:bg-gray-50 text-slate-700"><Settings className="w-5 h-5"/></button>
          <button className="bg-white p-3 rounded-xl shadow-lg hover:bg-gray-50 text-slate-700"><Info className="w-5 h-5"/></button>
      </div>

    </div>
  );
}