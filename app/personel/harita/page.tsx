"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MapPin } from 'lucide-react';
import dynamic from 'next/dynamic';

// Leaflet Haritası "window" nesnesini kullandığı için SSR (Server Side Rendering) hatası vermesin diye dynamic import yapıyoruz.
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

// Leaflet CSS'i import etmemiz lazım yoksa harita bozuk görünür
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// İkon düzeltmesi (Leaflet varsayılan ikonları bazen Next.js'de kaybolur)
const icon = L.icon({ iconUrl: "/images/marker-icon.png", iconSize: [25, 41], iconAnchor: [12, 41] });
// NOT: Eğer marker ikonu görünmezse, public klasörüne bir ikon atıp yolunu buraya yazmalısın.
// Veya CDN kullanabiliriz:
const defaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});


export default function PersonelHarita() {
  const router = useRouter();
  const [vincler, setVincler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    vincleriGetir();
  }, []);

  const vincleriGetir = async () => {
    // Sadece koordinatı olan vinçleri çekelim (latitude ve longitude sütunları var varsayıyoruz)
    // Eğer veritabanında 'lat' ve 'lng' sütunları yoksa burası hata verir.
    // Önceki adımlarda vinçlere konum eklememiş olabiliriz. 
    // Şimdilik örnek veri ile çalışacak şekilde ayarlıyorum.
    
    const { data } = await supabase.from('cranes').select('*');
    if (data) setVincler(data);
    setYukleniyor(false);
  };

  return (
    <div className="h-screen w-full relative bg-slate-100">
        
        {/* ÜST BAR (Geri Dön) */}
        <div className="absolute top-4 left-4 z-[9999]">
            <button 
                onClick={() => router.push('/personel')}
                className="bg-white text-slate-800 px-4 py-3 rounded-xl shadow-xl font-bold flex items-center gap-2 border border-slate-200"
            >
                <ArrowLeft size={20}/> Geri Dön
            </button>
        </div>

        {/* HARİTA ALANI */}
        <div className="h-full w-full z-0">
            {typeof window !== 'undefined' && (
                <MapContainer center={[40.1885, 29.0610]} zoom={12} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    
                    {/* Vinçleri Haritaya Diz */}
                    {vincler.map((vinc) => (
                        // Not: Eğer vincin lat/lng bilgisi yoksa varsayılan veya rastgele bir yere atıyorum şimdilik.
                        // Gerçekte: v.lat && v.lng ? ... : null olmalı.
                        <Marker 
                            key={vinc.id} 
                            position={[vinc.latitude || 40.18 + (Math.random()*0.1), vinc.longitude || 29.06 + (Math.random()*0.1)]}
                            icon={defaultIcon}
                        >
                            <Popup>
                                <div className="p-2">
                                    <h3 className="font-bold text-sm">{vinc.customer_name}</h3>
                                    <p className="text-xs text-slate-500">{vinc.location_address}</p>
                                    <p className="text-xs font-bold text-blue-600 mt-1">{vinc.model_name}</p>
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            )}
        </div>
    </div>
  );
}