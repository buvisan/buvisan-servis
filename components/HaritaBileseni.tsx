"use client";
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- CSS İKON TANIMLARI (Resim Yok, Kod Var) ---

// 1. YEŞİL İKON
const greenDivIcon = L.divIcon({
  className: 'custom-pin pin-yesil', // globals.css'teki sınıf
  iconSize: [20, 20], // Boyut
  iconAnchor: [10, 10], // Tam ortası
  popupAnchor: [0, -10],
  html: '<div class="pin-dot"></div>' // İçindeki beyaz nokta
});

// 2. KIRMIZI İKON (Yanıp Sönen)
const redDivIcon = L.divIcon({
  className: 'custom-pin pin-kirmizi',
  iconSize: [24, 24], // Biraz daha büyük görünsün
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
  html: '<div class="pin-dot"></div>'
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
                // CartoDB Dark Matter (Koyu Tema) - Renkli pinler bunda EFSANE durur
                // Eğer açık tema istersen: https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png yapabilirsin.
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />

            <HaritaUcus konum={secilenVinc && secilenVinc.lat ? [secilenVinc.lat, secilenVinc.lng] : null} />

            {vincler.map((vinc: any) => {
                // Arıza kontrolü
                const arizaVar = vinc.service_tickets?.some((ticket: any) => ticket.status !== 'tamamlandi');

                return (vinc.lat && vinc.lng) && (
                    <Marker 
                        key={vinc.id} 
                        position={[vinc.lat, vinc.lng]} 
                        // Sadece CSS sınıfı atıyoruz, resim yükleme derdi yok!
                        icon={arizaVar ? redDivIcon : greenDivIcon} 
                        eventHandlers={{
                            click: () => setSecilenVinc(vinc),
                        }}
                    />
                );
            })}
        </MapContainer>
    );
}