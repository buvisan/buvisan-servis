"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css'; // 🔥 CSS ÖNEMLİ

// Harita bileşenlerini dinamik import ediyoruz (SSR hatasını önlemek için)
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

export default function PersonelHarita() {
  const router = useRouter();
  const [vincler, setVincler] = useState<any[]>([]);
  const [Leaflet, setLeaflet] = useState<any>(null);

  useEffect(() => {
    // Leaflet ikon düzeltmesi (Client tarafında çalışmalı)
    (async () => {
      const L = await import('leaflet');
      setLeaflet(L);
      
      // Varsayılan ikonları düzelt
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      });
    })();

    vincleriGetir();
  }, []);

  const vincleriGetir = async () => {
    // Sadece konumu olan vinçleri çekiyoruz (latitude/longitude boş değilse)
    const { data } = await supabase.from('cranes').select('*');
    if (data) setVincler(data);
  };

  return (
    <div className="relative w-full h-screen bg-slate-100 overflow-hidden">
        
        {/* ÜST BAR (Geri Dön) */}
        <div className="absolute top-4 left-4 z-[9999]">
            <button 
                onClick={() => router.push('/personel')}
                className="bg-white text-slate-800 px-4 py-3 rounded-xl shadow-xl font-bold flex items-center gap-2 border border-slate-200 active:scale-95 transition"
            >
                <ArrowLeft size={20}/> Geri Dön
            </button>
        </div>

        {/* HARİTA ALANI */}
        {Leaflet && (
            <MapContainer 
                center={[40.1885, 29.0610]} // Bursa Merkez
                zoom={10} 
                style={{ height: '100vh', width: '100%' }} // 🔥 TAM EKRAN
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap contributors'
                />
                
                {vincler.map((vinc) => (
                    // Eğer vincin koordinatı yoksa gösterme
                    (vinc.latitude && vinc.longitude) ? (
                        <Marker key={vinc.id} position={[vinc.latitude, vinc.longitude]}>
                            <Popup>
                                <div className="p-1">
                                    <h3 className="font-bold text-sm">{vinc.customer_name}</h3>
                                    <p className="text-xs text-slate-500">{vinc.location_address}</p>
                                    <span className="text-[10px] font-bold bg-blue-100 text-blue-600 px-2 py-0.5 rounded mt-1 inline-block">
                                        {vinc.model_name}
                                    </span>
                                </div>
                            </Popup>
                        </Marker>
                    ) : null
                ))}
            </MapContainer>
        )}
    </div>
  );
}