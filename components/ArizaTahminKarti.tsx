"use client";

// ----------------------------------------------------------------------------
// BUVISAN - ARIZA TAHMİN KARTI 🔮
// Geçmiş arıza aralıklarından "bu vinç arızalanmak üzere" diyen sistem.
// ariza_ozeti() + ariza_tahmini() + ariza_kelimeleri() fonksiyonlarından beslenir.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, AlertTriangle, ChevronDown, Loader2, RefreshCw, Phone, ClipboardList } from 'lucide-react';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

const RISK_RENK: Record<string, string> = {
  'GECİKMİŞ': 'bg-rose-100 text-rose-700 border-rose-200',
  'YAKLAŞIYOR': 'bg-amber-100 text-amber-700 border-amber-200',
  'NORMAL': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'VERİ YETERSİZ': 'bg-slate-100 text-slate-500 border-slate-200',
};

export default function ArizaTahminKarti() {
  const [ozet, setOzet] = useState<any>(null);
  const [liste, setListe] = useState<any[]>([]);
  const [kelimeler, setKelimeler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [acik, setAcik] = useState(false);
  const [kelimeAcik, setKelimeAcik] = useState(false);
  // Hangi vincin iş geçmişi açık (Finans → Son İşlemler formlarından gelen detay)
  const [acikIs, setAcikIs] = useState<string | null>(null);

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data: o } = await supabase.rpc('ariza_ozeti');
      setOzet(o);

      const { data: l } = await supabase.rpc('ariza_tahmini');
      setListe(l || []);

      const { data: k } = await supabase.rpc('ariza_kelimeleri', { p_limit: 12 });
      setKelimeler(k || []);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  if (yukleniyor && !ozet) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mx-auto" />
      </div>
    );
  }
  if (!ozet) return null;

  const riskliler = liste.filter((l) => ['GECİKMİŞ', 'YAKLAŞIYOR'].includes(l.risk));

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-700 to-violet-700 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white/15 p-2 rounded-xl">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-white font-black text-sm tracking-tight leading-none">ARIZA TAHMİNİ</h2>
            <p className="text-[10px] text-indigo-200 font-bold uppercase tracking-widest mt-1">
              {ozet.takip_edilen_vinc} vinç takipte · ort. {ozet.ort_aralik_gun} günde bir arıza
            </p>
          </div>
        </div>
        <button onClick={getir} className="text-indigo-200 hover:text-white bg-white/10 p-2 rounded-lg transition">
          {yukleniyor ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-rose-50 rounded-2xl p-4 border border-rose-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-rose-500 mb-1">Gecikmiş</p>
            <p className="text-2xl font-black text-rose-700 leading-none">{ozet.gecikmis}</p>
            <p className="text-[10px] text-rose-500 font-bold mt-1">arıza zamanı geçti</p>
          </div>
          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-500 mb-1">Yaklaşan</p>
            <p className="text-2xl font-black text-amber-700 leading-none">{ozet.yaklasan}</p>
            <p className="text-[10px] text-amber-500 font-bold mt-1">arıza yakın</p>
          </div>
          <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-1">Normal</p>
            <p className="text-2xl font-black text-emerald-700 leading-none">{ozet.normal}</p>
            <p className="text-[10px] text-emerald-500 font-bold mt-1">sorun yok</p>
          </div>
          <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500 mb-1">Riskli Ciro</p>
            <p className="text-2xl font-black text-indigo-700 leading-none">{para(ozet.riskli_potansiyel)} ₺</p>
            <p className="text-[10px] text-indigo-500 font-bold mt-1">tahmini servis değeri</p>
          </div>
        </div>

        {riskliler.length > 0 ? (
          <div>
            <button onClick={() => setAcik((o) => !o)}
              className="w-full flex items-center justify-between bg-slate-900 text-white px-4 py-3 rounded-2xl hover:bg-slate-800 transition">
              <span className="text-xs font-black flex items-center gap-2">
                <AlertTriangle size={14} /> ARANMASI GEREKEN VİNÇLER ({riskliler.length})
              </span>
              <ChevronDown size={16} className={`transition-transform ${acik ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {acik && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="pt-3 space-y-2">
                    {riskliler.slice(0, 20).map((v) => (
                      <div key={v.crane_id} className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-slate-800 truncate">{v.musteri}</p>
                            <p className="text-[10px] text-slate-400 font-bold">
                              {v.seri_no || '-'} · {v.kapasite || '-'} · {v.servis_sayisi} servis geçmişi
                            </p>
                          </div>
                          <span className={`text-[9px] font-black px-2 py-1 rounded-lg border shrink-0 ${RISK_RENK[v.risk] || ''}`}>
                            {v.risk}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] text-slate-500 font-bold">
                            Son servis {v.son_servis ? new Date(v.son_servis).toLocaleDateString('tr-TR') : '-'}
                            {' · '}{v.gecen_gun} gün önce
                          </span>
                          <span className="text-[11px] font-black text-indigo-700">
                            Toplam {para(v.toplam_odeme)} ₺
                          </span>
                        </div>

                        <p className="text-[10px] text-slate-400 font-bold">
                          Ortalama {v.ort_aralik_gun} günde bir arızalanıyor
                          {v.durum_gun !== null && (
                            <span className={Number(v.durum_gun) < 0 ? 'text-rose-500' : 'text-amber-500'}>
                              {' · '}{Number(v.durum_gun) < 0 ? `${Math.abs(Number(v.durum_gun))} gün gecikmiş` : `${v.durum_gun} gün kaldı`}
                            </span>
                          )}
                        </p>

                        {/* NE İŞ YAPILDI — Finans → Son İşlemler formlarından */}
                        {v.son_ariza && (
                          <p className="text-[10px] text-slate-600 italic leading-relaxed mt-1.5 bg-white rounded-xl px-2.5 py-2 border border-slate-100">
                            “{String(v.son_ariza).slice(0, 160)}{String(v.son_ariza).length > 160 ? '…' : ''}”
                          </p>
                        )}

                        {Array.isArray(v.son_isler) && v.son_isler.length > 0 && (
                          <>
                            <button onClick={() => setAcikIs(acikIs === v.crane_id ? null : v.crane_id)}
                              className="text-[9px] font-black text-indigo-600 mt-1.5 flex items-center gap-1 hover:text-indigo-800 transition">
                              <ChevronDown size={11} className={`transition-transform ${acikIs === v.crane_id ? 'rotate-180' : ''}`} />
                              {v.son_isler.length} İŞ GEÇMİŞİNİ GÖR
                            </button>

                            <AnimatePresence>
                              {acikIs === v.crane_id && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                  <div className="mt-2 space-y-2 border-l-2 border-indigo-200 pl-3">
                                    {v.son_isler.map((is: any, i: number) => (
                                      <div key={i}>
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-[9px] font-black text-slate-500">
                                            {is.tarih ? new Date(is.tarih).toLocaleDateString('tr-TR') : '-'}
                                            {is.tur ? ` · ${is.tur}` : ''}
                                          </span>
                                          <span className="text-[9px] font-black text-emerald-600 shrink-0">
                                            {para(is.tutar)} ₺
                                          </span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 leading-snug">{is.aciklama || '-'}</p>
                                        {is.teknisyen && (
                                          <p className="text-[9px] text-slate-400 font-bold">👤 {is.teknisyen}</p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center">
            <p className="text-[11px] text-slate-500 font-bold">
              Şu an gecikmiş veya yaklaşan arıza yok — ya da vinçlerin yeterli servis geçmişi yok.
            </p>
          </div>
        )}

        {kelimeler.length > 0 && (
          <div>
            <button onClick={() => setKelimeAcik((o) => !o)}
              className="w-full flex items-center justify-between bg-slate-100 text-slate-700 px-4 py-3 rounded-2xl hover:bg-slate-200 transition">
              <span className="text-xs font-black flex items-center gap-2">
                <ClipboardList size={14} /> EN SIK ARIZALAR
              </span>
              <ChevronDown size={16} className={`transition-transform ${kelimeAcik ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {kelimeAcik && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="pt-3 flex flex-wrap gap-2">
                    {kelimeler.map((k) => (
                      <span key={k.kelime} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-600">
                        <strong className="text-slate-800 uppercase">{k.kelime}</strong>
                        <span className="text-slate-400"> · {k.adet} kez · ort. {para(k.ort_tutar)} ₺</span>
                      </span>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <p className="text-[10px] text-slate-400 font-medium text-center">
          Tahmin, vincin <strong>geçmiş servis aralıklarından</strong> hesaplanır. Ne kadar çok servis kaydı olursa tahmin o kadar isabetli olur.
        </p>
      </div>
    </div>
  );
}
