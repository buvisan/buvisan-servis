"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - ANA SAYFA (PWA başlangıç ekranı) 🏠
// Uygulama ikonuna basılınca burada açılır — rol seçimi
// ----------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  User, Shield, Wrench, PhoneCall, ChevronRight, Smartphone,
} from "lucide-react";

export default function AnaSayfa() {
  const router = useRouter();
  const [kurulu, setKurulu] = useState(false);

  useEffect(() => {
    const pwa = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as any).standalone === true;
    setKurulu(pwa);
  }, []);

  const secenekler = [
    {
      ad: "PERSONEL",
      aciklama: "Günün rotası, formlar, mesai",
      yol: "/personel",
      ikon: Wrench,
      renk: "from-teal-600 to-cyan-600",
    },
    {
      ad: "YÖNETİM PANELİ",
      aciklama: "Kokpit, planlayıcı, raporlar",
      yol: "/admin",
      ikon: Shield,
      renk: "from-slate-800 to-slate-900",
    },
    {
      ad: "MÜŞTERİ PORTALI",
      aciklama: "Vinçlerim, servis geçmişi, bakım",
      yol: "/musteri",
      ikon: User,
      renk: "from-blue-600 to-indigo-600",
    },
    {
      ad: "SERVİS ÇAĞIR",
      aciklama: "Yeni arıza / bakım talebi",
      yol: "/talep",
      ikon: PhoneCall,
      renk: "from-rose-600 to-red-600",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-6">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 15 }}
          className="text-center mb-10">
          <div className="w-24 h-24 bg-yellow-400 rounded-3xl mx-auto flex items-center justify-center font-black text-5xl text-slate-900 shadow-2xl shadow-yellow-500/30">
            B
          </div>
          <h1 className="text-white font-black text-3xl mt-5 tracking-tight">BUVİSAN</h1>
          <p className="text-slate-400 text-xs font-bold tracking-widest mt-2 uppercase">
            Vinç & Asansör Servis Yönetimi
          </p>
          {kurulu && (
            <span className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30">
              <Smartphone size={11} className="text-emerald-400" />
              <span className="text-[9px] font-black text-emerald-400 uppercase">Uygulama Modu</span>
            </span>
          )}
        </motion.div>

        <div className="w-full max-w-sm space-y-2.5">
          {secenekler.map((s, i) => {
            const Ikon = s.ikon;
            return (
              <motion.button
                key={s.yol}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.07 }}
                onClick={() => router.push(s.yol)}
                className="w-full bg-white rounded-2xl p-3.5 flex items-center gap-3 shadow-lg hover:shadow-xl active:scale-[0.98] transition-all text-left group">
                <div className={`bg-gradient-to-br ${s.renk} p-3 rounded-xl shrink-0`}>
                  <Ikon size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-800 leading-none">{s.ad}</p>
                  <p className="text-[10px] font-medium text-slate-500 mt-1 truncate">{s.aciklama}</p>
                </div>
                <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-600 transition shrink-0" />
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="text-center pb-8 px-6">
        <p className="text-[10px] text-slate-500 font-bold">BUVİSAN VİNÇ SERVİS</p>
        <a href="tel:02243740001" className="text-[11px] text-slate-400 font-bold mt-1 inline-flex items-center gap-1 hover:text-white transition">
          📞 0224 374 00 01
        </a>
        <p className="text-[9px] text-slate-600 mt-3">v4.3 · Tüm hakları saklıdır</p>
      </div>
    </div>
  );
}
