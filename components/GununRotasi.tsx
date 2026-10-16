"use client";

// ----------------------------------------------------------------------------
// BUVISAN - GÜNÜN ROTASI 🚐 (personel ekranı)
// Planlayıcıda oluşturulan randevular → haritaya düşer → personel buradan görür
//   • Sıralı duraklar (en yakın komşu algoritması)
//   • Her durakta "GİT" → Google Maps navigasyon
//   • "TÜM ROTAYI AÇ" → tek tıkla waypoint'li rota
// Kaynak: gunun_rotasi()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  Route, Loader2, RefreshCw, Navigation, MapPin, ChevronDown,
  Map as MapIcon, Clock, AlertTriangle, CheckCircle2, Phone,
} from "lucide-react";

const TUR_RENK: Record<string, { bg: string; text: string; ikon: string }> = {
  "ariza":        { bg: "bg-rose-100",    text: "text-rose-700",    ikon: "⚠️" },
  "arıza":        { bg: "bg-rose-100",    text: "text-rose-700",    ikon: "⚠️" },
  "kesif":        { bg: "bg-indigo-100",  text: "text-indigo-700",  ikon: "🔍" },
  "keşif":        { bg: "bg-indigo-100",  text: "text-indigo-700",  ikon: "🔍" },
  "bakim":        { bg: "bg-blue-100",    text: "text-blue-700",    ikon: "🔧" },
  "bakım":        { bg: "bg-blue-100",    text: "text-blue-700",    ikon: "🔧" },
  "montaj":       { bg: "bg-amber-100",   text: "text-amber-700",   ikon: "🏗️" },
  "kritik talep": { bg: "bg-red-100",     text: "text-red-700",     ikon: "🔴" },
};

const googleGit = (lat: any, lng: any, adres?: string) => {
  const hedef = (adres || "").trim().length > 8
    ? encodeURIComponent(adres!)
    : `${lat},${lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${hedef}&travelmode=driving`;
};

const googleTumRota = (duraklar: any[]) => {
  if (!duraklar || duraklar.length < 2) return "";
  const nokta = (d: any) =>
    (d.adres || "").trim().length > 8 ? encodeURIComponent(d.adres) : `${d.lat},${d.lng}`;
  const ilk = nokta(duraklar[0]);
  const son = nokta(duraklar[duraklar.length - 1]);
  const ara = duraklar.slice(1, -1).map(nokta).join("|");
  let url = `https://www.google.com/maps/dir/?api=1&origin=${ilk}&destination=${son}&travelmode=driving`;
  if (ara) url += `&waypoints=${ara}`;
  return url;
};

export default function GununRotasi() {
  const [veri, setVeri] = useState<any>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [acik, setAcik] = useState(true);
  const [hata, setHata] = useState("");

  const getir = useCallback(async () => {
    setYukleniyor(true);
    setHata("");
    try {
      const { data, error } = await supabase.rpc("gunun_rotasi");
      if (error) { setHata(error.message); setVeri(null); return; }
      setVeri(data);
    } catch (e: any) {
      setHata(e?.message || "Rota alınamadı.");
    } finally { setYukleniyor(false); }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  const duraklar: any[] = veri?.duraklar || [];
  const koordinatsiz: any[] = veri?.koordinatsiz || [];
  const toplamKm = Number(veri?.toplam_km || 0);
  const sureSaat = Number(veri?.tahmini_sure_saat || 0);
  const tumRotaLink = googleTumRota(duraklar);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      {/* BAŞLIK */}
      <div className="bg-gradient-to-r from-violet-700 to-purple-700 px-4 py-3.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="bg-white/15 p-2 rounded-xl shrink-0">
            <Route className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-white font-black text-sm tracking-tight leading-none">GÜNÜN ROTASI</h2>
            <p className="text-[10px] text-violet-200 font-bold uppercase tracking-widest mt-1 truncate">
              {veri?.tarih || "—"} · {veri?.tarih_gun || ""}
            </p>
          </div>
        </div>
        <button onClick={getir} disabled={yukleniyor}
          className="bg-white/15 hover:bg-white/25 p-2 rounded-xl transition shrink-0">
          <RefreshCw size={15} className={`text-white ${yukleniyor ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {hata && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-700">
            ⚠️ {hata}
          </div>
        )}

        {/* ÖZET */}
        {!hata && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-violet-50 rounded-xl p-2.5 border border-violet-100 text-center">
              <p className="text-[9px] font-black text-violet-500 uppercase">Durak</p>
              <p className="text-lg font-black text-violet-800 leading-none mt-0.5">{duraklar.length}</p>
            </div>
            <div className="bg-sky-50 rounded-xl p-2.5 border border-sky-100 text-center">
              <p className="text-[9px] font-black text-sky-500 uppercase">Mesafe</p>
              <p className="text-lg font-black text-sky-800 leading-none mt-0.5">{toplamKm} km</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-100 text-center">
              <p className="text-[9px] font-black text-amber-600 uppercase">Süre</p>
              <p className="text-lg font-black text-amber-800 leading-none mt-0.5">~{sureSaat} sa</p>
            </div>
          </div>
        )}

        {/* TÜM ROTAYI AÇ */}
        {tumRotaLink && (
          <a href={tumRotaLink} target="_blank" rel="noreferrer"
            className="w-full bg-violet-600 hover:bg-violet-700 text-white py-3.5 rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98]">
            <MapIcon size={16} /> TÜM ROTAYI GOOGLE MAPS'TE AÇ
          </a>
        )}

        {/* DURAKLAR */}
        {yukleniyor ? (
          <div className="py-6 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400 mx-auto" />
            <p className="text-[10px] font-bold text-slate-400 mt-2">Rota hesaplanıyor...</p>
          </div>
        ) : duraklar.length === 0 && !hata ? (
          <div className="py-5 text-center bg-slate-50 rounded-2xl">
            <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-[11px] font-black text-slate-500">Bugün için durak yok</p>
            <p className="text-[9px] text-slate-400 font-medium mt-1 px-4">
              Planlayıcıda bugüne randevu eklendiğinde ve koordinat girildiğinde
              rota burada görünür.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {duraklar.map((d: any, i: number) => {
              const anahtar = String(d.tur || "").toLocaleLowerCase("tr");
              const r = TUR_RENK[anahtar] || { bg: "bg-slate-100", text: "text-slate-600", ikon: "🔧" };
              const sonMu = i === duraklar.length - 1;
              return (
                <div key={i} className="relative">
                  {/* Bağlantı çizgisi */}
                  {!sonMu && (
                    <div className="absolute left-[19px] top-[46px] bottom-[-8px] w-0.5 bg-violet-200 z-0" />
                  )}
                  <div className="relative z-10 bg-slate-50 border border-slate-200 rounded-2xl p-3">
                    <div className="flex items-start gap-3">
                      {/* SIRA NUMARASI */}
                      <div className="w-9 h-9 rounded-full bg-violet-600 text-white flex items-center justify-center font-black text-sm shrink-0">
                        {d.sira || i + 1}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${r.bg} ${r.text}`}>
                            {r.ikon} {d.tur || "Servis"}
                          </span>
                          {Number(d.mesafe) > 0 && (
                            <span className="text-[9px] font-black text-slate-400">
                              +{Number(d.mesafe).toFixed(1)} km
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] font-black text-slate-800 mt-1 leading-tight">{d.baslik || "-"}</p>
                        {d.adres && (
                          <p className="text-[10px] text-slate-500 font-medium mt-1 flex items-start gap-1">
                            <MapPin size={10} className="text-slate-400 mt-0.5 shrink-0" />
                            <span className="break-words">{d.adres}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* AKSİYONLAR */}
                    <div className="flex gap-1.5 mt-2.5">
                      <a href={googleGit(d.lat, d.lng, d.adres)} target="_blank" rel="noreferrer"
                        className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 transition">
                        <Navigation size={12} /> GİT
                      </a>
                      {d.telefon && (
                        <a href={`tel:${d.telefon}`}
                          className="px-3 bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-xl text-[10px] font-black flex items-center gap-1.5 transition">
                          <Phone size={12} /> ARA
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* KOORDİNATSIZ İŞLER */}
        {koordinatsiz.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
            <p className="text-[11px] font-black text-amber-800 flex items-center gap-1.5 mb-2">
              <AlertTriangle size={12} /> {koordinatsiz.length} iş koordinatsız — rotada yok
            </p>
            <div className="space-y-1">
              {koordinatsiz.map((k: any, i: number) => (
                <p key={i} className="text-[10px] font-bold text-amber-700 truncate">
                  • {k.baslik} {k.adres ? `— ${String(k.adres).slice(0, 35)}` : ""}
                </p>
              ))}
            </div>
            <p className="text-[9px] text-amber-600 font-medium mt-2">
              Yönetim, planlayıcıdan {`"📍 Konum"`} butonuyla koordinat ekleyince rotaya girer.
            </p>
          </div>
        )}

        <p className="text-[9px] text-slate-400 font-medium text-center leading-relaxed">
          Rota, planlayıcıdaki <strong>bugünün işlerinden</strong> otomatik oluşur.
          Biten iş rotadan <strong>kendiliğinden çıkar</strong>.
        </p>
      </div>
    </div>
  );
}
