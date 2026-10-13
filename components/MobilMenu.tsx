"use client";

// ----------------------------------------------------------------------------
// BUVISAN - MOBİL ALT MENÜ 📱
// ----------------------------------------------------------------------------
//  Telefon ve tablette tüm yönetim sayfalarına tek dokunuşla geçiş.
//  Masaüstünde GÖRÜNMEZ (lg:hidden) — mevcut tasarım bozulmaz.
//  app/admin/layout.tsx üzerinden bütün admin sayfalarına otomatik eklenir.
// ----------------------------------------------------------------------------

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, CalendarDays, Construction, FileText, Menu, X,
  Package, TrendingUp, Car, Map, ClipboardList, CalendarClock, Ban, Bot, Plus, ChevronRight
} from 'lucide-react';

const ANA_MENU = [
  { yol: '/admin', ad: 'Panel', ikon: LayoutDashboard },
  { yol: '/admin/planlayici', ad: 'Plan', ikon: CalendarDays },
  { yol: '/admin/vincler', ad: 'Vinçler', ikon: Construction },
  { yol: '/admin/teklifler', ad: 'Teklif', ikon: FileText },
];

const DIGER_MENU = [
  { yol: '/admin/stok', ad: 'Stok Takibi', aciklama: 'Adet, kritik seviye, hareketler', ikon: Package, renk: 'bg-amber-50 text-amber-600' },
  { yol: '/admin/malzemeler', ad: 'Depo & Finans', aciklama: 'Fiyatlar, aylık kâr özeti', ikon: Package, renk: 'bg-yellow-50 text-yellow-600' },
  { yol: '/admin/analiz', ad: 'Finans & Analiz', aciklama: 'Ciro, gider, müşteri analizi', ikon: TrendingUp, renk: 'bg-green-50 text-green-600' },
  { yol: '/admin/raporlar', ad: 'Saha Raporları', aciklama: 'Teknisyen formları, imzalar', ikon: ClipboardList, renk: 'bg-emerald-50 text-emerald-600' },
  { yol: '/admin/periyodik-bakim', ad: 'Bakım Takibi', aciklama: 'Periyodik bakım sözleşmeleri', ikon: CalendarClock, renk: 'bg-teal-50 text-teal-600' },
  { yol: '/admin/harita', ad: 'Canlı Harita', aciklama: 'Vinç konumları ve rota', ikon: Map, renk: 'bg-emerald-50 text-emerald-600' },
  { yol: '/admin/araclar', ad: 'Araçlar', aciklama: 'Filo, yakıt, bakım, cezalar', ikon: Car, renk: 'bg-cyan-50 text-cyan-600' },
  { yol: '/admin/yeni-vinc', ad: 'Yeni Vinç Ekle', aciklama: 'Envantere vinç kaydı', ikon: Plus, renk: 'bg-blue-50 text-blue-600' },
  { yol: '/admin/asistan', ad: 'Yapay Zeka Asistanı', aciklama: 'Verine soru sor', ikon: Bot, renk: 'bg-indigo-50 text-indigo-600' },
  { yol: '/admin/mimli-sirketler', ad: 'Mimli Şirketler', aciklama: 'Gidilmeyecek firmalar', ikon: Ban, renk: 'bg-red-50 text-red-600' },
];

export default function MobilMenu() {
  const yol = usePathname();
  const [menuAcik, setMenuAcik] = useState(false);

  const aktif = (hedef: string) =>
    hedef === '/admin' ? yol === '/admin' : yol?.startsWith(hedef);

  return (
    <>
      {/* ALT MENÜ (masaüstünde gizli) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-[500] bg-white/95 backdrop-blur-xl border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
          {ANA_MENU.map((m) => {
            const Ikon = m.ikon;
            const secili = aktif(m.yol);
            return (
              <Link key={m.yol} href={m.yol}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 transition ${secili ? 'text-blue-600' : 'text-slate-400'}`}>
                <div className={`p-1.5 rounded-xl transition ${secili ? 'bg-blue-50' : ''}`}>
                  <Ikon size={20} />
                </div>
                <span className={`text-[9px] font-black ${secili ? 'text-blue-600' : 'text-slate-400'}`}>{m.ad}</span>
              </Link>
            );
          })}

          <button onClick={() => setMenuAcik(true)}
            className={`flex flex-col items-center justify-center gap-1 py-2.5 transition ${menuAcik ? 'text-blue-600' : 'text-slate-400'}`}>
            <div className="p-1.5 rounded-xl">
              <Menu size={20} />
            </div>
            <span className="text-[9px] font-black">Daha Fazla</span>
          </button>
        </div>
      </nav>

      {/* TÜM MENÜ PANELİ */}
      <AnimatePresence>
        {menuAcik && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMenuAcik(false)}
              className="lg:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[600]" />

            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="lg:hidden fixed inset-x-0 bottom-0 z-[601] bg-white rounded-t-[2rem] shadow-2xl max-h-[85dvh] flex flex-col overflow-hidden">

              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="bg-slate-900 p-2 rounded-xl">
                    <Menu size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 text-sm leading-none">TÜM MENÜ</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Buvisan Servis Yönetimi</p>
                  </div>
                </div>
                <button onClick={() => setMenuAcik(false)} className="bg-slate-100 hover:bg-red-500 hover:text-white text-slate-500 p-2.5 rounded-full transition">
                  <X size={18} />
                </button>
              </div>

              <div className="overflow-y-auto p-4 space-y-2 pb-8">
                {DIGER_MENU.map((m) => {
                  const Ikon = m.ikon;
                  const secili = aktif(m.yol);
                  return (
                    <Link key={m.yol} href={m.yol} onClick={() => setMenuAcik(false)}
                      className={`flex items-center gap-3.5 p-3.5 rounded-2xl border transition active:scale-[0.98] ${secili ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100 hover:border-slate-300'}`}>
                      <div className={`p-2.5 rounded-xl ${m.renk}`}>
                        <Ikon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${secili ? 'text-blue-700' : 'text-slate-800'}`}>{m.ad}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{m.aciklama}</p>
                      </div>
                      <ChevronRight size={16} className="text-slate-300 shrink-0" />
                    </Link>
                  );
                })}

                <div className="pt-2">
                  <Link href="/admin/harita" onClick={() => setMenuAcik(false)}
                    className="flex items-center justify-center gap-2 w-full py-4 bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-2xl font-black text-xs shadow-lg active:scale-[0.98] transition">
                    <Map size={16} /> CANLI HARİTAYI AÇ
                  </Link>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
