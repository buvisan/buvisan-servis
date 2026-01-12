"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Loader2, Search, X, MapPin, Navigation } from 'lucide-react';
import Link from 'next/link';

// İKON AYARLARI (Leaflet varsayılan ikon hatasını düzeltmek için)
const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// --- HARİTA KONTROLCÜSÜ (Kamerayı uçurmak için) ---
function HaritaKontrol({ hedef }: { hedef: { lat: number, lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (hedef) {
      map.flyTo([hedef.lat, hedef.lng], 16, { // 16 = Zoom Seviyesi
        duration: 2 // Uçuş süresi (saniye)
      });
    }
  }, [hedef, map]);
  return null;
}

export default function HaritaSayfasi() {
  const [vincler, setVincler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  
  // ARAMA İÇİN GEREKLİ STATE'LER
  const [aramaMetni, setAramaMetni] = useState("");
  const [seciliVincKonum, setSeciliVincKonum] = useState<{lat: number, lng: number} | null>(null);
  const [sonuclarAcik, setSonuclarAcik] = useState(false);

  useEffect(() => {
    const verileriGetir = async () => {
      const { data } = await supabase.from('cranes').select('*');
      if (data) setVincler(data.filter(v => v.lat && v.lng)); // Sadece konumu olanları al
      setYukleniyor(false);
    };
    verileriGetir();
  }, []);

  // Filtreleme Fonksiyonu
  const filtrelenmisVincler = vincler.filter(v => 
    v.model_name.toLowerCase().includes(aramaMetni.toLowerCase()) ||
    v.customer_name.toLowerCase().includes(aramaMetni.toLowerCase()) ||
    v.serial_number.toLowerCase().includes(aramaMetni.toLowerCase())
  );

  const vinceGit = (lat: number, lng: number) => {
    setSeciliVincKonum({ lat, lng });
    setSonuclarAcik(false); // Listeyi kapat
    setAramaMetni(""); // Aramayı temizle (isteğe bağlı)
  };

  if (yukleniyor) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin w-10 h-10 text-blue-600"/></div>;

  return (
    <div className="relative h-screen w-full">
      
      {/* --- ARAMA KUTUSU (Haritanın Üzerinde Yüzen Panel) --- */}
      <div className="absolute top-4 left-4 z-[9999] w-full max-w-md px-4">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
          
          {/* Input Alanı */}
          <div className="flex items-center p-3 gap-2">
            <Search className="text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Vinç Ara (Model, Müşteri, Seri No)..." 
              className="flex-1 outline-none text-slate-700 text-sm font-semibold"
              value={aramaMetni}
              onChange={(e) => { setAramaMetni(e.target.value); setSonuclarAcik(true); }}
              onFocus={() => setSonuclarAcik(true)}
            />
            {aramaMetni && (
              <button onClick={() => setAramaMetni("")}><X className="text-slate-400 w-4 h-4 hover:text-red-500"/></button>
            )}
          </div>

          {/* Sonuç Listesi */}
          {sonuclarAcik && aramaMetni && (
            <div className="max-h-[300px] overflow-y-auto border-t border-slate-100 bg-slate-50">
              {filtrelenmisVincler.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs">Sonuç bulunamadı</div>
              ) : (
                filtrelenmisVincler.map((vinc) => (
                  <button 
                    key={vinc.id}
                    onClick={() => vinceGit(vinc.lat, vinc.lng)}
                    className="w-full text-left p-3 hover:bg-blue-50 border-b border-slate-100 last:border-0 transition flex items-start gap-3"
                  >
                    <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                      <MapPin size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">{vinc.customer_name}</div>
                      <div className="text-xs text-slate-500">{vinc.model_name} • {vinc.serial_number}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* --- HARİTA --- */}
      <MapContainer center={[39.9334, 32.8597]} zoom={6} style={{ height: "100%", width: "100%" }}>
        
        {/* Harita Kontrolcüsü (Uçuş Pilotu) */}
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
        <HaritaKontrol hedef={seciliVincKonum} />

        {vincler.map((vinc) => (
          <Marker key={vinc.id} position={[vinc.lat, vinc.lng]} icon={icon}>
            <Popup>
              <div className="min-w-[200px]">
                <h3 className="font-bold text-slate-900 text-sm mb-1">{vinc.customer_name}</h3>
                <p className="text-xs text-slate-600 mb-2">{vinc.model_name}</p>
                <div className="bg-slate-100 p-1 rounded text-[10px] font-mono mb-3 text-slate-500">{vinc.serial_number}</div>
                <Link href={`/admin/vinc-duzenle/${vinc.id}`} className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 rounded transition">
                  DETAYLARA GİT
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      
      {/* Panele Dön Butonu (Sağ Üst) */}
      <Link href="/admin" className="absolute top-4 right-4 z-[9999] bg-white text-slate-700 px-4 py-2 rounded-xl shadow-lg font-bold text-sm hover:bg-slate-50 flex items-center gap-2">
        <Navigation className="w-4 h-4"/> Panele Dön
      </Link>

    </div>
  );
}