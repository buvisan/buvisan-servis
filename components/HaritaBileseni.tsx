"use client";
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- İKON AYARLARI ---
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// CSS PİNLERİ
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

function HaritaKontrol({ konum, resetTetikleyici }: { konum: [number, number] | null, resetTetikleyici: number }) {
    const map = useMap();

    useEffect(() => {
        if (konum) {
            map.flyTo(konum, 14, { duration: 1.5 });
        }
    }, [konum, map]);

    useEffect(() => {
        if (resetTetikleyici > 0) {
            map.flyTo([39.9334, 32.8597], 6, { duration: 1.5 });
        }
    }, [resetTetikleyici, map]);

    return null;
}

export default function HaritaBileseni({ vincler, secilenVinc, setSecilenVinc, tema, resetTetikleyici }: any) {
    const maxBounds = new L.LatLngBounds(new L.LatLng(-85, -180), new L.LatLng(85, 180));

    return (
        <MapContainer 
            center={[39.9334, 32.8597]} 
            zoom={6}
            minZoom={3}
            maxBounds={maxBounds}
            maxBoundsViscosity={1.0}
            style={{ height: "100%", width: "100%", zIndex: 0, background: tema === 'dark' ? '#0f172a' : '#ddd' }} 
            zoomControl={false}
        >
            <TileLayer
                attribution='&copy; OpenStreetMap'
                noWrap={true} 
                url={tema === 'dark' 
                    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                }
            />

            <HaritaKontrol 
                konum={secilenVinc && secilenVinc.lat ? [secilenVinc.lat, secilenVinc.lng] : null} 
                resetTetikleyici={resetTetikleyici}
            />

            {vincler.map((vinc: any) => {
                // --- SIKI KOORDİNAT KONTROLÜ ---
                const lat = parseFloat(vinc.lat);
                const lng = parseFloat(vinc.lng);

                // 1. Sayı değilse gösterme (Boşluk, null, harf vs.)
                if (isNaN(lat) || isNaN(lng)) return null;

                // 2. Koordinat (0, 0) ise gösterme (Okyanus ortası hatası)
                if (lat === 0 && lng === 0) return null;

                // 3. Dünya sınırları dışında ise gösterme
                if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

                // --- ARIZA KONTROLÜ ---
                const arizaVar = vinc.service_tickets?.some((ticket: any) => ticket.status !== 'tamamlandi');
                
                return (
                    <Marker 
                        key={vinc.id} 
                        position={[lat, lng]} 
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