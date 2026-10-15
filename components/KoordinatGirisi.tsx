"use client";

// ----------------------------------------------------------------------------
// BUVISAN - KOORDİNAT GİRİŞİ 📍
// Randevu oluştururken koordinatları ELLE gir (veya Google Maps linkinden al).
//   • ENLEM / BOYLAM alanları
//   • Google Maps linkini yapıştır → koordinat otomatik çıkar
//   • "Kontrol Et" → Google Maps'te açar, doğru mu bak
// Sonuç: randevular.lat/lng → ana haritada TAM YERDE görünür.
// ----------------------------------------------------------------------------

import { useState } from "react";
import { MapPin, Link2, ExternalLink, Check, X, ClipboardPaste } from "lucide-react";

type Props = {
  lat?: number | null;
  lng?: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
};

/** Metinden koordinat çıkar — Google Maps linki, "40.22, 28.95" vb. */
function koordinatCikar(metin: string): { lat: number; lng: number } | null {
  if (!metin) return null;
  const m = metin.replace(/\s+/g, " ").trim();

  // 1) @40.22847,28.95231,15z  (Google Maps URL)
  let r = m.match(/@(-?\d{1,2}\.\d{3,})[, ]+(-?\d{1,3}\.\d{3,})/);
  if (r) return { lat: Number(r[1]), lng: Number(r[2]) };

  // 2) ?q=40.22847,28.95231  veya  /search/40.22,28.95
  r = m.match(/[?&](?:q|query|ll|center|destination)=(-?\d{1,2}\.\d{3,})[, ]+(-?\d{1,3}\.\d{3,})/);
  if (r) return { lat: Number(r[1]), lng: Number(r[2]) };

  // 3) !3d40.22847!4d28.95231  (Google Maps embed)
  const r3d = m.match(/!3d(-?\d{1,2}\.\d{3,})/);
  const r4d = m.match(/!4d(-?\d{1,3}\.\d{3,})/);
  if (r3d && r4d) return { lat: Number(r3d[1]), lng: Number(r4d[1]) };

  // 4) Düz "40.22847, 28.95231"
  r = m.match(/^(-?\d{1,2}\.\d{3,})[,;\s]+(-?\d{1,3}\.\d{3,})$/);
  if (r) return { lat: Number(r[1]), lng: Number(r[2]) };

  // 5) Herhangi bir yerde iki ondalıklı sayı
  r = m.match(/(-?\d{1,2}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})/);
  if (r) return { lat: Number(r[1]), lng: Number(r[2]) };

  return null;
}

export default function KoordinatGirisi({ lat, lng, onChange }: Props) {
  const [link, setLink] = useState("");
  const [uyari, setUyari] = useState("");

  const gecerliMi = (la: number, ln: number) =>
    la >= 35.5 && la <= 42.5 && ln >= 25.5 && ln <= 45;

  const linktenAl = () => {
    const k = koordinatCikar(link);
    if (!k) {
      setUyari("❌ Link içinde koordinat bulunamadı. Google Maps'te yeri açıp adres çubuğundaki linki kopyalayın.");
      return;
    }
    if (!gecerliMi(k.lat, k.lng)) {
      setUyari("🌍 Bu koordinat Türkiye sınırları dışında görünüyor.");
      return;
    }
    onChange(Number(k.lat.toFixed(6)), Number(k.lng.toFixed(6)));
    setUyari("✅ Koordinat alındı");
    setLink("");
    setTimeout(() => setUyari(""), 2500);
  };

  const elle = (deger: string, tip: "lat" | "lng") => {
    const n = deger.trim() === "" ? null : Number(deger.replace(",", "."));
    if (n !== null && Number.isNaN(n)) return;
    if (tip === "lat") onChange(n, lng ?? null);
    else onChange(lat ?? null, n);
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <MapPin size={12} /> Konum Koordinatları
        </span>
        {(lat || lng) && (
          <button type="button" onClick={() => { onChange(null, null); setUyari(""); }}
            className="text-[9px] font-black text-rose-500 flex items-center gap-0.5">
            <X size={10} /> TEMİZLE
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Enlem (Lat)</label>
          <input type="text" inputMode="decimal" value={lat ?? ""}
            onChange={(e) => elle(e.target.value, "lat")}
            placeholder="40.228470"
            className="w-full mt-1 p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold outline-none focus:border-indigo-400" />
        </div>
        <div>
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Boylam (Lng)</label>
          <input type="text" inputMode="decimal" value={lng ?? ""}
            onChange={(e) => elle(e.target.value, "lng")}
            placeholder="28.952310"
            className="w-full mt-1 p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold outline-none focus:border-indigo-400" />
        </div>
      </div>

      {/* Google Maps linkinden al */}
      <div>
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <Link2 size={10} /> Google Maps linkini yapıştır (otomatik alır)
        </label>
        <div className="flex gap-2 mt-1">
          <input type="text" value={link} onChange={(e) => setLink(e.target.value)}
            placeholder="https://maps.google.com/?q=40.22847,28.95231"
            className="flex-1 p-2.5 bg-white border border-slate-200 rounded-lg text-[11px] outline-none focus:border-indigo-400" />
          <button type="button" onClick={linktenAl} disabled={!link.trim()}
            className="px-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg text-[10px] font-black flex items-center gap-1 transition">
            <ClipboardPaste size={11} /> AL
          </button>
        </div>
      </div>

      {uyari && (
        <p className={`text-[10px] font-black ${uyari.startsWith("✅") ? "text-emerald-700" : uyari.startsWith("🌍") ? "text-amber-700" : "text-rose-700"}`}>
          {uyari}
        </p>
      )}

      {lat && lng ? (
        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2">
          <p className="text-[10px] font-black text-emerald-800 flex items-center gap-1">
            <Check size={11} /> {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
          </p>
          <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noreferrer"
            className="text-[9px] font-black text-blue-600 flex items-center gap-0.5">
            <ExternalLink size={10} /> KONTROL ET
          </a>
        </div>
      ) : (
        <p className="text-[10px] font-bold text-slate-400">
          Koordinat girilmezse randevu haritada görünmez — ama listede kalır.
        </p>
      )}
    </div>
  );
}
