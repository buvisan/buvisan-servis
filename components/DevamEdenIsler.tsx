"use client";

// ----------------------------------------------------------------------------
// BUVISAN - DEVAM EDEN İŞLER ⏸️
// 1 gün geçen devam eden bakım formlarını uyarır.
// Kaynak: devam_eden_isler()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { PauseCircle, ChevronDown, Loader2, RefreshCw, AlertTriangle, ChevronRight } from "lucide-react";

const TIP_AD: Record<string, string> = { vinc: "🏗️", asansor: "🏢" };

export default function DevamEdenIsler() {
  const [liste, setListe] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [acik, setAcik] = useState(false);

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data } = await supabase.rpc("devam_eden_isler");
      setListe(data || []);
      if ((data || []).length > 0) setAcik(true);
    } finally { setYukleniyor(false); }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  // Hiç yoksa gösterme
  if (yukleniyor) return null;
  if (liste.length === 0) return null;

  const acilSayisi = liste.filter((i) => i.acil).length;

  return (
    <div className="bg-white rounded-3xl border-2 border-amber-300 shadow-sm overflow-hidden">
      <button onClick={() => setAcik((o) => !o)}
        className="w-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="bg-white/20 p-2 rounded-xl"><PauseCircle size={18} className="text-white" /></div>
          <div className="text-left">
            <h3 className="text-white font-black text-sm leading-none">
              ⏸️ {liste.length} İŞ DEVAM EDİYOR
            </h3>
            <p className="text-[10px] text-amber-100 font-bold mt-1">
              {acilSayisi > 0 ? `🚨 ${acilSayisi} iş 1 günü geçti — takip gerekli` : "Bakım formları tamamlanmayı bekliyor"}
            </p>
          </div>
        </div>
        <ChevronDown size={16} className={`text-white transition-transform ${acik ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {acik && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="p-3 space-y-1.5 max-h-72 overflow-y-auto">
              {liste.map((i) => (
                <div key={i.id}
                  className={`flex items-center gap-2.5 border rounded-xl px-3 py-2.5 ${
                    i.acil ? "bg-rose-50 border-rose-200" : "bg-slate-50 border-slate-200"}`}>
                  <span className="text-base shrink-0">{TIP_AD[i.form_tipi] || "📋"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black text-slate-800 truncate">{i.musteri || "—"}</p>
                    <p className="text-[9px] font-bold text-slate-400">
                      {i.seri_no} · {i.personel || "—"} · {i.devam_tarihi || "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {i.acil ? (
                      <span className="text-[9px] font-black text-rose-700 flex items-center gap-0.5">
                        <AlertTriangle size={9} /> {i.gun_gecti > 0 ? `${i.gun_gecti} gün` : "BUGÜN"}
                      </span>
                    ) : (
                      <span className="text-[9px] font-black text-amber-600">bekliyor</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Link href="/admin/bakim-formlari"
              className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white py-3 text-[10px] font-black transition">
              TÜM FORMLARI GÖR <ChevronRight size={12} />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
