"use client";
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
// ExternalLink ikonunu ekledik
import { Loader2, Search, X, MapPin, Navigation, AlertTriangle, CheckCircle2, Filter, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';

// --- İKON TANIMLAMALARI ---

// Yeşil İkon (Standart Resim İkonu)
const yesilIcon = L.icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// 🔥 Kırmızı İkon (DALGA EFEKTLİ - DivIcon kullanıyoruz) 🔥
// Bu özel bir HTML ikonu. İçinde hem resmi hem de arkasındaki "animate-ping" (dalga) efektini barındırıyor.
const kirmiziAnimasyonluIcon = L.divIcon({
  className: 'bg-transparent', // Varsayılan beyaz kareyi kaldır
  html: `
    <div style="position: relative; width: 25px; height: 41px;">
      <div class="absolute -inset-4 rounded-full bg-red-500/40 animate-ping opacity-75" style="z-index: 1;"></div>
      <img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png" style="width: 25px; height: 41px; position: relative; z-index: 2; filter: drop-shadow(0 4px 3px rgb(0 0 0 / 0.07));">
    </div>
  `,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// --- HARİTA KONTROLCÜSÜ (Uçuş Pilotu) ---
function HaritaKontrol({ hedef }: { hedef: { lat: number, lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (hedef) {
      // Hedef değiştiğinde oraya uç (Zoom seviyesini 16 yaptık, iyice yaklaşsın)
      map.flyTo([hedef.lat, hedef.lng], 16, { duration: 2, easeLinearity: 0.25 });
    }
  }, [hedef, map]);
  return null;
}

export default function HaritaBileseni() {
  const [vincler, setVincler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [aramaMetni, setAramaMetni] = useState("");
  // Hangi vince odaklanacağımızı tutan state
  const [seciliVincKonum, setSeciliVincKonum] = useState<{lat: number, lng: number} | null>(null);
  const [sonuclarAcik, setSonuclarAcik] = useState(false);

  // İstatistikler
  const [ozet, setOzet] = useState({ toplam: 0, arizali: 0, saglam: 0 });

  useEffect(() => {
    const verileriGetir = async () => {
      const { data } = await supabase
        .from('cranes')
        .select('*, service_tickets(*)');
      
      if (data) {
        const haritaVerisi = data.filter(v => v.lat && v.lng);
        setVincler(haritaVerisi);

        let arizaliSayisi = 0;
        haritaVerisi.forEach(v => {
           const aktifAriza = v.service_tickets?.some((t: any) => t.status !== 'tamamlandi');
           if (aktifAriza) arizaliSayisi++;
        });

        setOzet({
          toplam: haritaVerisi.length,
          arizali: arizaliSayisi,
          saglam: haritaVerisi.length - arizaliSayisi
        });
      }
      setYukleniyor(false);
    };
    verileriGetir();
  }, []);

  const filtrelenmisVincler = vincler.filter(v => {
    const aranan = aramaMetni.toLocaleLowerCase('tr-TR');
    return (
      v.model_name?.toLocaleLowerCase('tr-TR').includes(aranan) ||
      v.customer_name?.toLocaleLowerCase('tr-TR').includes(aranan) ||
      v.serial_number?.toLocaleLowerCase('tr-TR').includes(aranan)
    );
  });

  // Bir vince gitme fonksiyonu (Hem aramadan hem tıklamadan tetiklenir)
  const vinceGit = (lat: number, lng: number) => {
    setSeciliVincKonum({ lat, lng }); // HaritaKontrol bunu algılayıp uçacak
    setSonuclarAcik(false);
    setAramaMetni("");
  };

  if (yukleniyor) return <div className="h-full flex flex-col items-center justify-center bg-slate-50 text-blue-600 gap-3"><Loader2 className="animate-spin w-10 h-10" /><span className="animate-pulse font-bold">Uydu Bağlantısı Kuruluyor...</span></div>;

  return (
    <div className="relative h-full w-full font-sans">
      
      {/* ÜST ARAMA BAR */}
      <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }} className="absolute top-6 left-4 right-4 md:left-6 md:w-[450px] z-[9999]">
        <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl border border-white/50 overflow-hidden">
          <div className="flex items-center p-4 gap-3">
            <div className={`p-2 rounded-xl ${aramaMetni ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                <Search className="w-5 h-5" />
            </div>
            <input 
              type="text" 
              placeholder="Vinç Ara (Model, Müşteri, Seri No)..." 
              className="flex-1 bg-transparent outline-none text-slate-800 font-semibold placeholder:text-slate-400"
              value={aramaMetni}
              onChange={(e) => { setAramaMetni(e.target.value); setSonuclarAcik(true); }}
              onFocus={() => setSonuclarAcik(true)}
            />
            {aramaMetni && (
              <button onClick={() => setAramaMetni("")} className="p-1 hover:bg-red-50 rounded-full group"><X className="text-slate-400 group-hover:text-red-500 w-5 h-5"/></button>
            )}
          </div>
          <AnimatePresence>
            {sonuclarAcik && aramaMetni && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="max-h-[350px] overflow-y-auto border-t border-slate-100 bg-white/95">
                {filtrelenmisVincler.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-sm flex flex-col items-center gap-2"><Filter className="w-8 h-8 opacity-20"/>Eşleşen vinç bulunamadı.</div>
                ) : (
                  filtrelenmisVincler.map((vinc) => {
                    const arizaVarMi = vinc.service_tickets?.some((t: any) => t.status !== 'tamamlandi');
                    return (
                      <button key={vinc.id} onClick={() => vinceGit(vinc.lat, vinc.lng)} className="w-full text-left p-4 hover:bg-blue-50 border-b border-slate-50 transition flex items-center gap-4 group">
                        <div className={`p-3 rounded-full ${arizaVarMi ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}><MapPin size={20} /></div>
                        <div className="flex-1">
                          <div className="text-sm font-bold text-slate-800 group-hover:text-blue-700 transition">{vinc.customer_name}</div>
                          <div className="text-xs text-slate-500 mt-0.5 font-medium">{vinc.model_name}</div>
                        </div>
                        {arizaVarMi && <div className="text-[10px] bg-red-500 text-white px-2 py-1 rounded font-bold animate-pulse">ARIZALI</div>}
                      </button>
                    )
                  })
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ALT İSTATİSTİK BAR */}
      <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="absolute bottom-6 left-6 right-6 md:left-auto md:w-auto md:min-w-[300px] bg-white/90 backdrop-blur-md p-2 rounded-2xl shadow-xl border border-white/50 z-[9999] flex justify-between items-center">
          <div className="flex items-center gap-3 px-4 py-2 border-r border-slate-200"><div className="text-xs text-slate-400 font-bold uppercase">Toplam</div><div className="text-lg font-black text-slate-800">{ozet.toplam}</div></div>
          <div className="flex items-center gap-2 px-4 py-2 text-green-600 border-r border-slate-200"><CheckCircle2 className="w-4 h-4"/><span className="text-sm font-bold">{ozet.saglam}</span></div>
          <div className="flex items-center gap-2 px-4 py-2 text-red-600"><AlertTriangle className="w-4 h-4"/><span className="text-sm font-bold">{ozet.arizali}</span></div>
      </motion.div>

      {/* --- HARİTA --- */}
      <MapContainer center={[39.9334, 32.8597]} zoom={6} zoomControl={false} style={{ height: "100%", width: "100%", zIndex: 0 }}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution='&copy; OpenStreetMap' />
        {/* Uçuş Pilotunu Ekledik */}
        <HaritaKontrol hedef={seciliVincKonum} />

        {vincler.map((vinc) => {
          const arizaVarMi = vinc.service_tickets?.some((t: any) => t.status !== 'tamamlandi');
          return (
            <Marker 
              key={vinc.id} 
              position={[vinc.lat, vinc.lng]} 
              // Arızalıysa animasyonlu ikonu, değilse normal yeşili kullan
              icon={arizaVarMi ? kirmiziAnimasyonluIcon : yesilIcon}
              // 🔥 TIKLAMA OLAYI EKLENDİ: Tıklayınca o konuma uç 🔥
              eventHandlers={{
                click: () => {
                  vinceGit(vinc.lat, vinc.lng);
                },
              }}
            >
              <Popup className="premium-popup">
                <div className="min-w-[220px] p-1">
                  <div className={`text-[10px] font-bold mb-2 inline-flex items-center gap-1 px-2 py-1 rounded-md ${arizaVarMi ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                    {arizaVarMi ? <><AlertTriangle size={10}/> ARIZA MEVCUT</> : <><CheckCircle2 size={10}/> SİSTEM NORMAL</>}
                  </div>
                  <h3 className="font-black text-slate-800 text-base mb-1">{vinc.customer_name}</h3>
                  <p className="text-xs text-slate-500 mb-3 font-medium">{vinc.model_name}</p>
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 mb-3">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Seri No</div>
                    <div className="text-xs font-mono text-slate-700">{vinc.serial_number}</div>
                  </div>

                  {/* 🔥 LİNK GÜNCELLENDİ: Artık Müşteri Ekranına Gidiyor (/vinc/ID) ve Yeni Sekmede Açılıyor 🔥 */}
                  <Link href={`/vinc/${vinc.id}`} target="_blank" className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg transition shadow-md">
                    DETAYLARA GİT (Müşteri Ekranı) <ExternalLink size={12}/>
                  </Link>
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