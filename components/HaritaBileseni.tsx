"use client";
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- İKON TANIMLARI ---
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// CSS Pinleri (Daha önce eklediğimiz)
const greenDivIcon = L.divIcon({
  className: 'custom-pin pin-yesil',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
  html: '<div class="pin-dot"></div>'
});

const redDivIcon = L.divIcon({
  className: 'custom-pin pin-kirmizi',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
  html: '<div class="pin-dot"></div>'
});

// Harita Kontrolcüsü (Uçuş ve Resetleme)
function HaritaKontrol({ konum, resetTetikleyici }: { konum: [number, number] | null, resetTetikleyici: number }) {
    const map = useMap();

    // 1. Seçilen vince uç
    useEffect(() => {
        if (konum) {
            map.flyTo(konum, 14, { duration: 1.5 });
        }
    }, [konum, map]);

    // 2. Reset butonuna basılınca Türkiye geneline dön
    useEffect(() => {
        if (resetTetikleyici > 0) {
            map.flyTo([39.9334, 32.8597], 6, { duration: 1.5 });
        }
    }, [resetTetikleyici, map]);

    return null;
}

// ANA BİLEŞEN
// Yeni propslar ekledik: tema, resetTetikleyici
export default function HaritaBileseni({ vincler, secilenVinc, setSecilenVinc, tema, resetTetikleyici }: any) {
    return (
        <MapContainer 
            center={[39.9334, 32.8597]} 
            zoom={6} 
            style={{ height: "100%", width: "100%", zIndex: 0, background: tema === 'dark' ? '#0f172a' : '#ddd' }} 
            zoomControl={false}
        >
            {/* TEMA SEÇİMİ: Dark Mode vs Light Mode */}
            <TileLayer
                attribution='&copy; OpenStreetMap'
                url={tema === 'dark' 
                    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" // Koyu Tema
                    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" // Açık Tema
                }
            />

            <HaritaKontrol 
                konum={secilenVinc && secilenVinc.lat ? [secilenVinc.lat, secilenVinc.lng] : null} 
                resetTetikleyici={resetTetikleyici}
            />

            {vincler.map((vinc: any) => {
                const arizaVar = vinc.service_tickets?.some((ticket: any) => ticket.status !== 'tamamlandi');
                return (vinc.lat && vinc.lng) && (
                    <Marker 
                        key={vinc.id} 
                        position={[vinc.lat, vinc.lng]} 
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