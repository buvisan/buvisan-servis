"use client";
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Varsayılan İkonu Güzelleştir (Mavi Pin)
const customIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Harita Uçuş Efekti (Bunu ayrı component yaptık ki hata vermesin)
function HaritaUcus({ konum }: { konum: [number, number] | null }) {
    const map = useMap();
    
    useEffect(() => {
        if (konum) {
            map.flyTo(konum, 14, {
                duration: 1.5
            });
        }
    }, [konum, map]);

    return null;
}

export default function HaritaBileseni({ vincler, secilenVinc, setSecilenVinc }: any) {
    return (
        <MapContainer 
            center={[39.9334, 32.8597]} 
            zoom={6} 
            style={{ height: "100%", width: "100%" }} 
            zoomControl={false}
        >
            <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />

            {/* Seçilen vince uçuş efekti */}
            <HaritaUcus konum={secilenVinc && secilenVinc.lat ? [secilenVinc.lat, secilenVinc.lng] : null} />

            {vincler.map((vinc: any) => (
                (vinc.lat && vinc.lng) && (
                    <Marker 
                        key={vinc.id} 
                        position={[vinc.lat, vinc.lng]} 
                        icon={customIcon}
                        eventHandlers={{
                            click: () => setSecilenVinc(vinc),
                        }}
                    />
                )
            ))}
        </MapContainer>
    );
}