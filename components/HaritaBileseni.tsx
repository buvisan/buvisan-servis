"use client";
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Loader2, Search, X, MapPin, Navigation, AlertTriangle, CheckCircle2, Filter, ExternalLink, Factory, Zap } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';

// --- STYLES (PREMIUM RADAR EFEKTİ İÇİN) ---
// Bunu normalde global.css'e atardık ama kolaylık olsun diye buraya inject ediyoruz.
const customStyles = `
  @keyframes radar-pulse {
    0% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
    70% { transform: scale(1); box-shadow: 0 0 0 20px rgba(239, 68, 68, 0); }
    100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  }
  @keyframes glow {
    0% { box-shadow: 0 0 5px rgba(239, 68, 68, 0.5), 0 0 10px rgba(239, 68, 68, 0.5); }
    50% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.8), 0 0 30px rgba(239, 68, 68, 0.6); }
    100% { box-shadow: 0 0 5px rgba(239, 68, 68, 0.5), 0 0 10px rgba(239, 68, 68, 0.5); }
  }
  .premium-marker { transition: all 0.3s ease; }
  .premium-marker:hover { transform: scale(1.1) !important; z-index: 9999 !important; }
`;

// --- İKON TANIMLAMALARI ---

// 1. SAĞLAM VİNÇ (Premium Yeşil)
const yesilIcon = L.divIcon({
  className: 'premium-marker',
  html: `
    <div style="
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      width: 36px; height: 36px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
      display: flex; align-items: center; justify-content: center;
      color: white;
    ">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
    </div>
    <div style="
      position: absolute; bottom: -8px; left: 12px;
      width: 12px; height: 12px; background: white; transform: rotate(45deg); z-index: -1;
    "></div>
  `,
  iconSize: [36, 48],
  iconAnchor: [18, 48],
  popupAnchor: [0, -48],
});

// 2. ARIZALI VİNÇ (Premium Radar Kırmızı)
const kirmiziIcon = L.divIcon({
  className: 'premium-marker',
  html: `
    <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
      <div style="
        position: absolute; width: 100%; height: 100%;
        border-radius: 50%;
        background: rgba(239, 68, 68, 0.3);
        animation: radar-pulse 2s infinite;
      "></div>
      
      <div style="
        position: relative; z-index: 2;
        background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
        width: 36px; height: 36px;
        border-radius: 50%;
        border: 3px solid white;
        animation: glow 2s infinite;
        display: flex; align-items: center; justify-content: center;
        color: white;
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
      </div>
      
      <div style="
        position: absolute; bottom: 4px; left: 16px;
        width: 12px; height: 12px; background: white; transform: rotate(45deg); z-index: 1;
      "></div>
    </div>
  `,
  iconSize: [44, 54],
  iconAnchor: [22, 54],
  popupAnchor: [0, -54],
});


// --- MESAFE HESAPLAMA (Haversine Formülü) ---
// Bütün vinçlerin Bursa Merkeze (veya fabrikaya) uzaklığını hesaplar.
function mesafeyiHesapla(lat1: number, lon1: number) {
  const fabrikaLat = 40.221008; // ÖRN: Buvisan Fabrika Konumu (Nilüfer)
  const fabrikaLng = 28.905455; 

  const R = 6371; // Dünya yarıçapı (km)
  const dLat = (lat1 - fabrikaLat) * (Math.PI / 180);
  const dLon = (lon1 - fabrikaLng) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(fabrikaLat * (Math.PI / 180)) * Math.cos(lat1 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Mesafe KM cinsinden
  return d.toFixed(1); // Virgülden sonra 1 basamak (örn: 14.2 km)
}

function HaritaKontrol({ hedef }: { hedef: { lat: number, lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (hedef) {
      map.flyTo([hedef.lat, hedef.lng], 15, { duration: 1.5, easeLinearity: 0.25 });
    }
  }, [hedef, map]);
  return null;
}

export default function HaritaBileseni() {
  const [vincler, setVincler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [aramaMetni, setAramaMetni] = useState("");
  const [seciliVincKonum, setSeciliVincKonum] = useState<{lat: number, lng: number} | null>(null);
  const [sonuclarAcik, setSonuclarAcik] = useState(false);
  
  // FİLTRELEME İÇİN YENİ STATE
  // 'hepsi' | 'arizali' | 'saglam'
  const [aktifFiltre, setAktifFiltre] = useState('hepsi'); 

  const [ozet, setOzet] = useState({ toplam: 0, arizali: 0, saglam: 0 });

  useEffect(() => {
    const verileriGetir = async () => {
      const { data } = await supabase.from('cranes').select('*, service_tickets(*)');
      if (data) {
        const haritaVerisi = data.filter(v => v.lat && v.lng);
        setVincler(haritaVerisi);
        let arizaliSayisi = 0;
        haritaVerisi.forEach(v => {
           const aktifAriza = v.service_tickets?.some((t: any) => t.status !== 'tamamlandi');
           if (aktifAriza) arizaliSayisi++;
        });
        setOzet({ toplam: haritaVerisi.length, arizali: arizaliSayisi, saglam: haritaVerisi.length - arizaliSayisi });
      }
      setYukleniyor(false);
    };
    verileriGetir();
  }, []);

  // --- GELİŞMİŞ FİLTRELEME ---
  const filtrelenmisVincler = vincler.filter(v => {
    // 1. Arama Metni Kontrolü
    const aranan = aramaMetni.toLocaleLowerCase('tr-TR');
    const metinUyumu = 
      v.model_name?.toLocaleLowerCase('tr-TR').includes(aranan) ||
      v.customer_name?.toLocaleLowerCase('tr-TR').includes(aranan) ||
      v.serial_number?.toLocaleLowerCase('tr-TR').includes(aranan);

    // 2. Buton Filtresi Kontrolü
    const arizaVarMi = v.service_tickets?.some((t: any) => t.status !== 'tamamlandi');
    let durumUyumu = true;
    if (aktifFiltre === 'arizali') durumUyumu = arizaVarMi;
    if (aktifFiltre === 'saglam') durumUyumu = !arizaVarMi;

    return metinUyumu && durumUyumu;
  });

  const vinceGit = (lat: number, lng: number) => {
    setSeciliVincKonum({ lat, lng });
    setSonuclarAcik(false);
    setAramaMetni("");
  };

  if (yukleniyor) return <div className="h-full flex flex-col items-center justify-center bg-slate-50 text-blue-600 gap-3"><Loader2 className="animate-spin w-10 h-10" /><span className="animate-pulse font-bold">Uydu Bağlantısı Kuruluyor...</span></div>;

  return (
    <div className="relative h-full w-full font-sans">
      <style>{customStyles}</style>
      
      {/* ÜST KOMUTA PANELİ (Arama + Filtreler) */}
      <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute top-6 left-4 right-4 md:left-6 md:w-[450px] z-[9999] flex flex-col gap-3">
        
        {/* Arama Kutusu */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 overflow-hidden">
          <div className="flex items-center p-3 gap-3">
            <div className={`p-2 rounded-xl bg-slate-100 text-slate-500`}><Search className="w-5 h-5" /></div>
            <input 
              type="text" 
              placeholder="Filtrele: Model, Müşteri, Seri No..." 
              className="flex-1 bg-transparent outline-none text-slate-800 font-bold placeholder:text-slate-400 text-sm"
              value={aramaMetni}
              onChange={(e) => { setAramaMetni(e.target.value); setSonuclarAcik(true); }}
              onFocus={() => setSonuclarAcik(true)}
            />
            {aramaMetni && <button onClick={() => setAramaMetni("")}><X className="text-slate-400 hover:text-red-500 w-5 h-5"/></button>}
          </div>

          {/* Akıllı Sonuç Listesi */}
          <AnimatePresence>
            {sonuclarAcik && aramaMetni && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="max-h-[350px] overflow-y-auto border-t border-slate-100 bg-white">
                {filtrelenmisVincler.map((vinc) => {
                    const arizaVarMi = vinc.service_tickets?.some((t: any) => t.status !== 'tamamlandi');
                    return (
                      <button key={vinc.id} onClick={() => vinceGit(vinc.lat, vinc.lng)} className="w-full text-left p-3 hover:bg-blue-50 border-b border-slate-50 flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${arizaVarMi ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                        <div>
                          <div className="text-xs font-bold text-slate-800">{vinc.customer_name}</div>
                          <div className="text-[10px] text-slate-500">{vinc.model_name}</div>
                        </div>
                      </button>
                    )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Hızlı Filtre Butonları (Cockpit Toggle) */}
        <div className="flex gap-2">
            <button 
                onClick={() => setAktifFiltre('hepsi')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition shadow-lg backdrop-blur-md border ${aktifFiltre === 'hepsi' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white/90 text-slate-600 border-white/50 hover:bg-white'}`}
            >
                TÜM FİLO
            </button>
            <button 
                onClick={() => setAktifFiltre('arizali')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition shadow-lg backdrop-blur-md border flex items-center justify-center gap-1 ${aktifFiltre === 'arizali' ? 'bg-red-600 text-white border-red-600' : 'bg-white/90 text-red-600 border-white/50 hover:bg-red-50'}`}
            >
                <AlertTriangle size={14}/> ARIZALILAR
            </button>
            <button 
                onClick={() => setAktifFiltre('saglam')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition shadow-lg backdrop-blur-md border flex items-center justify-center gap-1 ${aktifFiltre === 'saglam' ? 'bg-green-600 text-white border-green-600' : 'bg-white/90 text-green-600 border-white/50 hover:bg-green-50'}`}
            >
                <CheckCircle2 size={14}/> AKTİFLER
            </button>
        </div>
      </motion.div>

      {/* ALT BİLGİ BAR (Şeffaf İstatistik) */}
      <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="absolute bottom-6 left-6 z-[9999] hidden md:flex items-center gap-4">
         <div className="bg-white/80 backdrop-blur-md px-4 py-2 rounded-2xl shadow-lg border border-white/50 text-xs font-bold text-slate-600">
            Toplam: <span className="text-slate-900 text-sm ml-1">{ozet.toplam}</span>
         </div>
         <div className="bg-red-50/80 backdrop-blur-md px-4 py-2 rounded-2xl shadow-lg border border-red-100 text-xs font-bold text-red-600 flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div> Kritik Durum: <span className="text-red-800 text-sm ml-1">{ozet.arizali}</span>
         </div>
      </motion.div>

      {/* HARİTA */}
      <MapContainer center={[39.9334, 32.8597]} zoom={6} zoomControl={false} style={{ height: "100%", width: "100%", zIndex: 0 }}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution='&copy; OpenStreetMap' />
        <HaritaKontrol hedef={seciliVincKonum} />

        {filtrelenmisVincler.map((vinc) => {
          const arizaVarMi = vinc.service_tickets?.some((t: any) => t.status !== 'tamamlandi');
          return (
            <Marker 
              key={vinc.id} 
              position={[vinc.lat, vinc.lng]} 
              icon={arizaVarMi ? kirmiziIcon : yesilIcon} // YENİ PREMIUM İKONLAR
              eventHandlers={{ click: () => vinceGit(vinc.lat, vinc.lng) }}
            >
              <Popup className="premium-popup" closeButton={false}>
                <div className="min-w-[240px] p-2">
                  {/* BAŞLIK & DURUM */}
                  <div className="flex justify-between items-start mb-3">
                     <div>
                        <h3 className="font-black text-slate-800 text-sm leading-tight">{vinc.customer_name}</h3>
                        <p className="text-[10px] text-slate-500 font-bold mt-1">{vinc.model_name}</p>
                     </div>
                     <div className={`p-1.5 rounded-lg ${arizaVarMi ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                        {arizaVarMi ? <AlertTriangle size={16}/> : <Zap size={16}/>}
                     </div>
                  </div>

                  {/* BİLGİ KARTLARI */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                     <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <div className="text-[9px] text-slate-400 font-bold uppercase">Uzaklık (Merkez)</div>
                        <div className="text-xs font-mono font-bold text-slate-700 flex items-center gap-1">
                            <Factory size={10} className="text-blue-400"/> {mesafeyiHesapla(vinc.lat, vinc.lng)} km
                        </div>
                     </div>
                     <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <div className="text-[9px] text-slate-400 font-bold uppercase">Seri No</div>
                        <div className="text-xs font-mono font-bold text-slate-700">{vinc.serial_number}</div>
                     </div>
                  </div>

                  {/* AKSİYON BUTONLARI */}
                  <div className="space-y-2">
                      <Link href={`/vinc/${vinc.id}`} target="_blank" className="flex items-center justify-center gap-2 w-full bg-slate-900 hover:bg-black text-white text-xs font-bold py-2.5 rounded-lg transition shadow-md">
                        Müşteri Ekranını Aç <ExternalLink size={12}/>
                      </Link>
                      
                      {/* NAVİGASYON BUTONU */}
                      <a 
                        href={`https://www.google.com/maps/dir/?api=1&destination=${vinc.lat},${vinc.lng}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 text-xs font-bold py-2.5 rounded-lg transition"
                      >
                        <Navigation size={12}/> Yol Tarifi Al (Google Maps)
                      </a>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      
      <Link href="/admin" className="absolute top-6 right-6 z-[9999] bg-white/90 backdrop-blur text-slate-700 px-4 py-3 rounded-2xl shadow-xl font-bold text-xs hover:bg-white hover:text-blue-600 transition flex items-center gap-2 border border-white/50">
        <Navigation className="w-4 h-4"/> PANELE DÖN
      </Link>
    </div>
  );
}