"use client";

// --- GEREKLİ KÜTÜPHANELER ---
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --------------------------------------------------------------------------
// 1. İKON AYARLARI (RESİM YÜKLEME SORUNUNU ÇÖZER)
// --------------------------------------------------------------------------
// Leaflet'in varsayılan ikon yolu bazen Next.js'te bozulur. Bunu düzeltiyoruz.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// --------------------------------------------------------------------------
// 2. CSS PİNLERİ (RESİMSİZ, MODERN İKONLAR)
// --------------------------------------------------------------------------
// Bu sınıflar (custom-pin, pin-yesil vb.) globals.css dosyasından gelir.

// ✅ YEŞİL PİN (Sorunsuz Vinçler İçin)
const greenDivIcon = L.divIcon({
  className: 'custom-pin pin-yesil',
  iconSize: [20, 20],   // İkon boyutu
  iconAnchor: [10, 10], // İkonun tam orta noktası haritada nereye basacak
  popupAnchor: [0, -10],
  html: '<div class="pin-dot"></div>' // Ortasındaki beyaz nokta
});

// 🚨 KIRMIZI PİN (Arızalı Vinçler İçin - Yanıp Söner)
const redDivIcon = L.divIcon({
  className: 'custom-pin pin-kirmizi',
  iconSize: [24, 24],   // Kırmızı biraz daha büyük ve dikkat çekici
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
  html: '<div class="pin-dot"></div>'
});

// --------------------------------------------------------------------------
// 3. HARİTA KONTROL BİLEŞENİ (UÇUŞ VE RESETLEME)
// --------------------------------------------------------------------------
// Bu gizli bileşen, haritayı programatik olarak hareket ettirmemizi sağlar.
function HaritaKontrol({ konum, resetTetikleyici }: { konum: [number, number] | null, resetTetikleyici: number }) {
    const map = useMap();

    // A) Eğer bir vince tıklandıysa, oraya "Uç" (FlyTo)
    useEffect(() => {
        if (konum) {
            map.flyTo(konum, 14, { duration: 1.5 });
        }
    }, [konum, map]);

    // B) Eğer "Reset" butonuna basıldıysa, varsayılan konuma dön
    useEffect(() => {
        if (resetTetikleyici > 0) {
            // [39.9334, 32.8597] -> Türkiye Merkezi
            // Zoom: 3 -> Dünya genelini görecek kadar uzak
            map.flyTo([39.9334, 32.8597], 3, { duration: 1.5 });
        }
    }, [resetTetikleyici, map]);

    return null;
}

// --------------------------------------------------------------------------
// 4. ANA HARİTA BİLEŞENİ
// --------------------------------------------------------------------------
export default function HaritaBileseni({ vincler, secilenVinc, setSecilenVinc, tema, resetTetikleyici }: any) {
    
    // Haritanın gidebileceği maksimum sınırlar (Tüm Dünya)
    const maxBounds = new L.LatLngBounds(
        new L.LatLng(-85, -180), // Güney Batı Köşesi
        new L.LatLng(85, 180)    // Kuzey Doğu Köşesi
    );

    return (
        <MapContainer 
            center={[39.9334, 32.8597]} // Başlangıç: Türkiye
            zoom={6}
            minZoom={2} // Kullanıcı dünyayı görecek kadar uzaklaşabilsin
            maxBounds={maxBounds} // Harita dışına çıkmayı engelle
            maxBoundsViscosity={1.0} // Sınıra gelince esneme efekti
            style={{ 
                height: "100%", 
                width: "100%", 
                zIndex: 0, 
                // Tema 'dark' ise arka planı koyu yap, değilse gri yap
                background: tema === 'dark' ? '#0f172a' : '#ddd' 
            }} 
            zoomControl={false} // Zoom butonlarını gizle (Biz kendimiz ekledik mi? Hayır, sade olsun)
        >
            {/* TEMA KATMANI (Dark Mode / Light Mode) */}
            <TileLayer
                attribution='&copy; OpenStreetMap'
                noWrap={true} // Haritanın yan yana tekrar etmesini engeller
                url={tema === 'dark' 
                    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" // Koyu Tema
                    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" // Açık Tema
                }
            />

            {/* UÇUŞ KONTROLCÜSÜNÜ ÇAĞIR */}
            <HaritaKontrol 
                konum={secilenVinc && secilenVinc.lat ? [secilenVinc.lat, secilenVinc.lng] : null} 
                resetTetikleyici={resetTetikleyici}
            />

            {/* VİNÇLERİ HARİTAYA YERLEŞTİRME DÖNGÜSÜ */}
            {vincler.map((vinc: any) => {
                // Veritabanından gelen string değerleri sayıya çevir
                const lat = parseFloat(vinc.lat);
                const lng = parseFloat(vinc.lng);

                // --- 🛡️ GÜVENLİK FİLTRESİ BAŞLANGICI ---
                
                // 1. Sayısal değer bozuksa (NaN) veya boşsa GÖSTERME
                if (isNaN(lat) || isNaN(lng)) return null;
                
                // 2. Koordinat tam 0,0 ise (Okyanus ortası hatası) GÖSTERME
                if (lat === 0 && lng === 0) return null;

                // --- 🛡️ GÜVENLİK FİLTRESİ BİTİŞİ ---

                // --- ARIZA KONTROLÜ ---
                // service_tickets içinde 'tamamlandi' olmayan (yani aktif) bir arıza var mı?
                const arizaVar = vinc.service_tickets?.some((ticket: any) => ticket.status !== 'tamamlandi');
                
                return (
                    <Marker 
                        key={vinc.id} 
                        position={[lat, lng]} 
                        // Arıza varsa Kırmızı, yoksa Yeşil ikon kullan
                        icon={arizaVar ? redDivIcon : greenDivIcon} 
                        eventHandlers={{
                            click: () => setSecilenVinc(vinc), // Tıklayınca detay kartını aç
                        }}
                    />
                );
            })}
        </MapContainer>
    );
}