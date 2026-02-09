"use client";

// ----------------------------------------------------------------------------
// BUVISAN PRO MAP | PERSONEL HARİTA MODÜLÜ (ADMIN VERSİYONU İLE EŞİTLENDİ) 🌍
// ----------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, Filter, AlertCircle, CheckCircle2, Navigation } from 'lucide-react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

// Harita bileşenlerini dinamik import (SSR Hatasını önlemek için)
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

export default function PersonelHarita() {
  const router = useRouter();
  
  // --- STATE ---
  const [vincler, setVincler] = useState<any[]>([]);
  const [filtrelenmisVincler, setFiltrelenmisVincler] = useState<any[]>([]);
  const [aramaMetni, setAramaMetni] = useState("");
  const [aktifFiltre, setAktifFiltre] = useState<'tumu' | 'arizali' | 'aktif'>('tumu');
  const [Leaflet, setLeaflet] = useState<any>(null);

  // --- VERİ ÇEKME ---
  useEffect(() => {
    // Leaflet ve İkon Ayarları
    (async () => {
      const L = await import('leaflet');
      setLeaflet(L);
    })();

    verileriGetir();
  }, []);

  const verileriGetir = async () => {
    const { data } = await supabase.from('cranes').select('*');
    if (data) {
        setVincler(data);
        setFiltrelenmisVincler(data);
    }
  };

  // --- FİLTRELEME MOTORU ---
  useEffect(() => {
    let sonuc = vincler;

    // 1. Arama Metni Filtresi
    if (aramaMetni) {
        sonuc = sonuc.filter(v => 
            v.customer_name?.toLowerCase().includes(aramaMetni.toLowerCase()) ||
            v.location_address?.toLowerCase().includes(aramaMetni.toLowerCase()) ||
            v.model_name?.toLowerCase().includes(aramaMetni.toLowerCase())
        );
    }

    // 2. Buton Filtresi (Örnek mantık: status kolonu varsa ona göre, yoksa hepsi aktif)
    if (aktifFiltre === 'arizali') {
        // Eğer veritabanında 'status' kolonu varsa burayı açabilirsin:
        // sonuc = sonuc.filter(v => v.status === 'arizali');
        // Şimdilik boş dönmesin diye hepsini gösteriyorum veya boş array dönebilirsin.
    }

    setFiltrelenmisVincler(sonuc);
  }, [aramaMetni, aktifFiltre, vincler]);

  // --- ÖZEL MARKER İKONU (CSS ile Yeşil Daire) ---
  const createCustomIcon = () => {
    if (!Leaflet) return undefined;
    return Leaflet.divIcon({
      className: 'custom-icon',
      html: `<div style="
        background-color: #10b981; 
        width: 30px; 
        height: 30px; 
        border-radius: 50%; 
        border: 3px solid white; 
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -30]
    });
  };

  return (
    <div className="relative w-full h-screen bg-slate-100 overflow-hidden font-sans">
        
        {/* =================================================================================
            ÜST KONTROL PANELİ (Arama & Filtreler)
           ================================================================================= */}
        <div className="absolute top-4 left-4 right-4 z-[1000] flex flex-col md:flex-row gap-3 pointer-events-none">
            
            {/* SOL: ARAMA ÇUBUĞU */}
            <div className="bg-white p-2 rounded-2xl shadow-xl border border-slate-200 pointer-events-auto flex items-center w-full md:w-96">
                <Search className="text-slate-400 ml-2 w-5 h-5"/>
                <input 
                    type="text" 
                    placeholder="Filtrele: Model, Müşteri, Adres..." 
                    value={aramaMetni}
                    onChange={(e) => setAramaMetni(e.target.value)}
                    className="w-full p-2 outline-none text-sm font-bold text-slate-700 bg-transparent"
                />
            </div>

            {/* ORTA: FİLTRE BUTONLARI */}
            <div className="flex gap-2 pointer-events-auto overflow-x-auto pb-1 md:pb-0">
                <button 
                    onClick={() => setAktifFiltre('tumu')}
                    className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition whitespace-nowrap ${aktifFiltre === 'tumu' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                    <Filter size={14}/> TÜM FİLO
                </button>
                <button 
                    onClick={() => setAktifFiltre('arizali')}
                    className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition whitespace-nowrap ${aktifFiltre === 'arizali' ? 'bg-red-500 text-white' : 'bg-white text-red-500 hover:bg-red-50'}`}
                >
                    <AlertCircle size={14}/> ARIZALILAR
                </button>
                <button 
                    onClick={() => setAktifFiltre('aktif')}
                    className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition whitespace-nowrap ${aktifFiltre === 'aktif' ? 'bg-green-500 text-white' : 'bg-white text-green-600 hover:bg-green-50'}`}
                >
                    <CheckCircle2 size={14}/> AKTİFLER
                </button>
            </div>

            {/* SAĞ: GERİ DÖN BUTONU */}
            <div className="ml-auto pointer-events-auto">
                <button 
                    onClick={() => router.push('/personel')}
                    className="bg-white text-slate-800 px-5 py-3 rounded-xl shadow-xl font-bold flex items-center gap-2 border border-slate-200 hover:bg-slate-50 transition"
                >
                    <ArrowLeft size={18}/> PANELE DÖN
                </button>
            </div>
        </div>

        {/* =================================================================================
            ALT BİLGİ ÇUBUĞU (İstatistikler)
           ================================================================================= */}
        <div className="absolute bottom-6 left-6 z-[1000] flex gap-3 pointer-events-none">
            <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg border border-slate-200 pointer-events-auto flex items-center gap-2">
                <span className="text-slate-500 text-xs font-bold uppercase">Toplam:</span>
                <span className="text-slate-900 font-black text-sm">{vincler.length}</span>
            </div>
            <div className="bg-red-50/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg border border-red-100 pointer-events-auto flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                <span className="text-red-600 text-xs font-bold uppercase">Kritik Durum:</span>
                <span className="text-red-800 font-black text-sm">0</span>
            </div>
        </div>

        {/* =================================================================================
            HARİTA ALANI
           ================================================================================= */}
        <div className="h-full w-full z-0 bg-slate-200">
            {Leaflet && (
                <MapContainer 
                    center={[40.1885, 29.0610]} // Bursa Merkez
                    zoom={5} 
                    zoomControl={false} // Zoom butonunu kapatıyoruz (Mobilde yer kaplamasın)
                    style={{ height: '100vh', width: '100%' }}
                >
                    <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" // Daha modern, gri tonlu harita (Admin panelindeki gibi)
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    />
                    
                    {filtrelenmisVincler.map((vinc) => (
                        (vinc.latitude && vinc.longitude) ? (
                            <Marker 
                                key={vinc.id} 
                                position={[vinc.latitude, vinc.longitude]}
                                icon={createCustomIcon()}
                            >
                                <Popup closeButton={false} className="custom-popup">
                                    <div className="p-1 min-w-[200px]">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Aktif</span>
                                            <button className="text-blue-500 hover:text-blue-700"><Navigation size={14}/></button>
                                        </div>
                                        <h3 className="font-black text-slate-800 text-sm leading-tight mb-1">{vinc.customer_name}</h3>
                                        <p className="text-xs text-slate-500 font-medium leading-snug">{vinc.location_address}</p>
                                        <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between items-center">
                                            <span className="text-[10px] text-slate-400 font-bold">{vinc.model_name}</span>
                                            <button className="text-[10px] bg-slate-900 text-white px-2 py-1 rounded hover:bg-slate-700 transition">Detay</button>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        ) : null
                    ))}
                </MapContainer>
            )}
        </div>
    </div>
  );
}