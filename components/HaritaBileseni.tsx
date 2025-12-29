"use client";
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- İKON SORUNU ÇÖZÜMÜ (Kırık resmi düzeltir) ---
// Leaflet'in varsayılan ikon ayarlarını sıfırlıyoruz.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// --- 1. YEŞİL İKON (Sorunsuz) ---
const greenIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// --- 2. KIRMIZI İKON (Arızalı - Yanıp Sönen) ---
const redPulseIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
    className: 'yanip-sonen-pin' // CSS animasyonu için sınıf
});

function HaritaUcus({ konum }: { konum: [number, number] | null }) {
    const map = useMap();
    useEffect(() => {
        if (konum) {
            (map as any).flyTo(konum, 14, { duration: 1.5 });
        }
    }, [konum, map]);
    return null;
}

export default function HaritaBileseni({ vincler, secilenVinc, setSecilenVinc }: any) {
    return (
        <MapContainer 
            center={[39.9334, 32.8597]} 
            zoom={6} 
            style={{ height: "100%", width: "100%", zIndex: 0 }} 
            zoomControl={false}
        >
            <TileLayer
                attribution='&copy; OpenStreetMap'
                // Daha modern, sade harita teması
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />

            <HaritaUcus konum={secilenVinc && secilenVinc.lat ? [secilenVinc.lat, secilenVinc.lng] : null} />

            {vincler.map((vinc: any) => {
                // Arıza kontrolü: 'tamamlandi' olmayan bir kayıt var mı?
                const arizaVar = vinc.service_tickets?.some((ticket: any) => ticket.status !== 'tamamlandi');

                return (vinc.lat && vinc.lng) && (
                    <Marker 
                        key={vinc.id} 
                        position={[vinc.lat, vinc.lng]} 
                        // Duruma göre ikon seçimi: Arıza varsa Kırmızı, yoksa Yeşil
                        icon={arizaVar ? redPulseIcon : greenIcon} 
                        eventHandlers={{
                            click: () => setSecilenVinc(vinc),
                        }}
                    />
                );
            })}
        </MapContainer>
    );
}