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
            // Koordinat güvenli mi kontrol et (Lat 90'dan büyük olamaz)
            if(Math.abs(konum[0]) <= 90) {
                map.flyTo(konum, 14, { duration: 1.5 });
            } else {
                console.error("Hatalı Koordinat:", konum);
            }
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
    // Türkiye Sınırları (Harita çok dışarı çıkmasın)
    const maxBounds = new L.LatLngBounds(
        new L.LatLng(-85, -180), // Güney Batı
        new L.LatLng(85, 180)    // Kuzey Doğu
    );

    return (
        <MapContainer 
            center={[39.9334, 32.8597]} 
            zoom={6}
            minZoom={3} // Çok fazla uzaklaşmayı engelle (Dünya tekrarlamaz)
            maxBounds={maxBounds} // Haritayı sınırla
            maxBoundsViscosity={1.0} // Sınırdan çıkmaya çalışırsa geri teper
            style={{ height: "100%", width: "100%", zIndex: 0, background: tema === 'dark' ? '#0f172a' : '#ddd' }} 
            zoomControl={false}
        >
            <TileLayer
                attribution='&copy; OpenStreetMap'
                // noWrap: true -> HARİTA TEKRAR ETMEZ!
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
                const arizaVar = vinc.service_tickets?.some((ticket: any) => ticket.status !== 'tamamlandi');
                
                // KOORDİNAT KONTROLÜ (Hatalıysa gösterme)
                if(!vinc.lat || !vinc.lng || Math.abs(vinc.lat) > 90) return null;

                return (
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