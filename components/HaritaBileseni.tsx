"use client";
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- KIRMIZI VİNÇ İKONU (Garanti Çalışan Link) ---
const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],      // İkon boyutu
    iconAnchor: [12, 41],    // İkonun ucu nereye bassın
    popupAnchor: [1, -34],   // Popup nereden çıksın
    shadowSize: [41, 41]
});

// Harita Uçuş Efekti
function HaritaUcus({ konum }: { konum: [number, number] | null }) {
    const map = useMap();
    useEffect(() => {
        if (konum) {
            (map as any).flyTo(konum, 14, { duration: 2.0, easeLinearity: 0.25 });
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
            {/* --- HARİTA TEMASI (Daha Modern/Fresh Görünüm) --- */}
            <TileLayer
                attribution='&copy; OpenStreetMap'
                // Buraya "CartoDB Voyager" temasını koydum, çok daha temiz ve teknolojik durur.
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />

            <HaritaUcus konum={secilenVinc && secilenVinc.lat ? [secilenVinc.lat, secilenVinc.lng] : null} />

            {vincler.map((vinc: any) => (
                (vinc.lat && vinc.lng) && (
                    <Marker 
                        key={vinc.id} 
                        position={[vinc.lat, vinc.lng]} 
                        icon={redIcon} // <-- ARTIK KIRMIZI!
                        eventHandlers={{
                            click: () => setSecilenVinc(vinc),
                            mouseover: (e) => e.target.openPopup(), // Üzerine gelince bilgi verilebilir (Opsiyonel)
                        }}
                    />
                )
            ))}
        </MapContainer>
    );
}