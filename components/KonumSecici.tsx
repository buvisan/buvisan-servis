"use client";

// ----------------------------------------------------------------------------
// BUVISAN - KONUM SEÇİCİ 🗺️
// Randevu oluştururken haritadan konum seç → koordinat kaydedilir.
//   • "Adresi Bul" → Nominatim (OpenStreetMap) adresi koordinata çevirir
//   • Haritaya tıkla → iğneyi istediğin yere koy
//   • İğneyi sürükle → ince ayar
// Sonuç: lat/lng kaydedilir, ana haritada TAM YERDE görünür.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Search, Loader2, MapPin, Check, X, Crosshair } from "lucide-react";
import { adresGeocode, yurtDisiMi } from "@/lib/geocode";

type Props = {
  adres: string;
  lat?: number | null;
  lng?: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
};

export default function KonumSecici({ adres, lat, lng, onChange }: Props) {
  const [hazir, setHazir] = useState(false);
  const [araniyor, setAraniyor] = useState(false);
  const [mesaj, setMesaj] = useState("");
  const [bulundu, setBulundu] = useState<string>("");

  const kapRef = useRef<HTMLDivElement | null>(null);
  const haritaRef = useRef<any>(null);
  const isaretRef = useRef<any>(null);

  // Leaflet CDN
  useEffect(() => {
    if ((window as any).L) { setHazir(true); return; }
    if (!document.getElementById("leaflet-css")) {
      const css = document.createElement("link");
      css.id = "leaflet-css"; css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
    }
    const mevcut = document.getElementById("leaflet-js") as HTMLScriptElement | null;
    if (mevcut) { mevcut.addEventListener("load", () => setHazir(true)); return; }
    const js = document.createElement("script");
    js.id = "leaflet-js";
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.onload = () => setHazir(true);
    document.body.appendChild(js);
  }, []);

  const isaretKoy = useCallback((la: number, ln: number, kaydir = true) => {
    const L = (window as any).L;
    if (!L || !haritaRef.current) return;
    if (isaretRef.current) {
      isaretRef.current.setLatLng([la, ln]);
    } else {
      isaretRef.current = L.marker([la, ln], { draggable: true }).addTo(haritaRef.current);
      isaretRef.current.on("dragend", () => {
        const p = isaretRef.current.getLatLng();
        onChange(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)));
      });
    }
    if (kaydir) haritaRef.current.setView([la, ln], 15);
  }, [onChange]);

  // Haritayı kur
  useEffect(() => {
    if (!hazir || !kapRef.current || haritaRef.current) return;
    const L = (window as any).L;
    const bas = (lat && lng) ? [Number(lat), Number(lng)] : [40.195, 29.06];
    haritaRef.current = L.map(kapRef.current).setView(bas, lat && lng ? 15 : 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap",
    }).addTo(haritaRef.current);

    haritaRef.current.on("click", (e: any) => {
      const la = Number(e.latlng.lat.toFixed(6));
      const ln = Number(e.latlng.lng.toFixed(6));
      onChange(la, ln);
      isaretKoy(la, ln, false);
      setMesaj("✅ Konum işaretlendi");
      setBulundu("");
      setTimeout(() => setMesaj(""), 2000);
    });

    if (lat && lng) isaretKoy(Number(lat), Number(lng), false);
    setTimeout(() => { try { haritaRef.current?.invalidateSize(); } catch { /* */ } }, 250);
  }, [hazir, lat, lng, onChange, isaretKoy]);

  // Adresi bul (Nominatim)
  const bul = async () => {
    if (!adres || adres.trim().length < 8) {
      setMesaj("⚠️ Önce açık adres yazın (en az 8 karakter).");
      return;
    }
    if (yurtDisiMi(adres)) {
      setMesaj("🌍 Bu adres yurt dışında — Türkiye haritasında gösterilemez.");
      return;
    }
    setAraniyor(true);
    setMesaj("");
    try {
      const g = await adresGeocode(adres);
      if (!g) {
        setMesaj("❌ Adres bulunamadı. Haritaya tıklayarak elle işaretleyin.");
        return;
      }
      onChange(g.lat, g.lng);
      isaretKoy(g.lat, g.lng, true);
      setBulundu(g.gosterilen);
      setMesaj(`✅ Bulundu (${g.hassasiyet})`);
      setTimeout(() => setMesaj(""), 4000);
    } finally { setAraniyor(false); }
  };


  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-slate-200">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Crosshair size={12} /> Haritadan Konum Seç
        </span>
        <button type="button" onClick={bul} disabled={araniyor}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg text-[10px] font-black flex items-center gap-1.5 transition">
          {araniyor ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
          ADRESİ BUL
        </button>
      </div>

      <div ref={kapRef} className="h-56 w-full bg-slate-200" />

      <div className="px-3 py-2 space-y-1">
        {mesaj && (
          <p className={`text-[10px] font-black ${mesaj.startsWith("✅") ? "text-emerald-700" : mesaj.startsWith("🌍") ? "text-blue-700" : "text-rose-700"}`}>
            {mesaj}
          </p>
        )}
        {bulundu && !mesaj && (
          <p className="text-[9px] text-slate-400 font-medium truncate">📍 {bulundu}</p>
        )}
        {lat && lng ? (
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black text-emerald-700 flex items-center gap-1">
              <Check size={11} /> Konum kaydedilecek: {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
            </p>
            <button type="button" onClick={() => { onChange(null, null); if (isaretRef.current) { isaretRef.current.remove(); isaretRef.current = null; } }}
              className="text-[9px] font-black text-rose-500 flex items-center gap-0.5">
              <X size={10} /> TEMİZLE
            </button>
          </div>
        ) : (
          <p className="text-[10px] font-bold text-amber-700 flex items-center gap-1">
            <MapPin size={11} /> Konum seçilmedi — haritaya tıklayın veya "ADRESİ BUL"a basın
          </p>
        )}
      </div>
    </div>
  );
}
