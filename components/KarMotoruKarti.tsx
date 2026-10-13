"use client";

// ----------------------------------------------------------------------------
// BUVISAN - İŞ BAZLI KÂR MOTORU KARTI 💵
// Hangi işin/müşterinin gerçekten kâr bıraktığını gösterir.
// Kaynak: kar_ozeti() + is_karliligi() + musteri_karliligi()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, TrendingDown, TrendingUp, ChevronDown, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

export default function KarMotoruKarti() {
  const [ozet, setOzet] = useState<any>(null);
  const [zararli, setZararli] = useState<any[]>([]);
  const [musteriler, setMusteriler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [acik, setAcik] = useState(false);
  const [musteriAcik, setMusteriAcik] = useState(false);
  const [sekme, setSekme] = useState<'karli' | 'zararli'>('karli');

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data: o } = await supabase.rpc('kar_ozeti');
      setOzet(o);

      const { data: z } = await supabase.rpc('is_karliligi', { p_limit: 25, p_sadece_zararli: true });
      setZararli(z || []);

      const { data: m } = await supabase.rpc('musteri_karliligi');
      setMusteriler(m || []);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  if (yukleniyor && !ozet) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-amber-600 mx-auto" />
      </div>
    );
  }
  if (!ozet) return null;

  const marj = Number(ozet.marj_yuzde || 0);
  const karli = marj >= 30;
  const listelenecek = sekme === 'karli'
    ? musteriler.slice(0, 20)
    : [...musteriler].sort((a, b) => Number(a.kar) - Number(b.kar)).slice(0, 20);

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-amber-600 to-orange-700 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white/15 p-2 rounded-xl">
            <Coins className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-white font-black text-sm tracking-tight leading-none">İŞ BAZLI KÂR</h2>
            <p className="text-[10px] text-amber-200 font-bold uppercase tracking-widest mt-1">
              {ozet.is_sayisi} iş · malzeme + işçilik düşülmüş
            </p>
          </div>
        </div>
        <button onClick={getir} className="text-amber-200 hover:text-white bg-white/10 p-2 rounded-lg transition">
          {yukleniyor ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Ciro</p>
            <p className="text-xl md:text-2xl font-black text-slate-800 leading-none">{para(ozet.ciro)} ₺</p>
          </div>
          <div className="bg-rose-50 rounded-2xl p-4 border border-rose-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-rose-400 mb-1">Maliyet</p>
            <p className="text-xl md:text-2xl font-black text-rose-700 leading-none">{para(ozet.toplam_maliyet)} ₺</p>
            <p className="text-[10px] text-rose-400 font-bold mt-1">
              malz. {para(ozet.malzeme)} · işç. {para(ozet.iscilik)}
            </p>
          </div>
          <div className={`rounded-2xl p-4 border ${karli ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
            <p className={`text-[10px] font-black uppercase tracking-wider mb-1 ${karli ? 'text-emerald-500' : 'text-amber-500'}`}>Brüt Kâr</p>
            <p className={`text-xl md:text-2xl font-black leading-none flex items-center gap-1.5 ${karli ? 'text-emerald-700' : 'text-amber-700'}`}>
              {karli ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              {para(ozet.brut_kar)} ₺
            </p>
            <p className={`text-[10px] font-bold mt-1 ${karli ? 'text-emerald-500' : 'text-amber-500'}`}>marj %{marj}</p>
          </div>
          <div className={`rounded-2xl p-4 border ${Number(ozet.zararli_is) > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
            <p className={`text-[10px] font-black uppercase tracking-wider mb-1 ${Number(ozet.zararli_is) > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
              Zarar Eden İş
            </p>
            <p className={`text-xl md:text-2xl font-black leading-none ${Number(ozet.zararli_is) > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
              {ozet.zararli_is}
            </p>
            <p className={`text-[10px] font-bold mt-1 ${Number(ozet.zararli_is) > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
              toplam {para(ozet.zarar_tutari)} ₺
            </p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">En Kârlı Müşteri</p>
            <p className="text-xs font-black text-emerald-700">{ozet.en_karli_musteri || '-'}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Saatlik İşçilik Maliyeti</p>
            <p className="text-xs font-black text-slate-700">{para(ozet.saatlik_maliyet)} ₺/saat</p>
          </div>
        </div>

        {/* ZARAR EDEN İŞLER */}
        {zararli.length > 0 && (
          <div>
            <button onClick={() => setAcik((o) => !o)}
              className="w-full flex items-center justify-between bg-rose-600 text-white px-4 py-3 rounded-2xl hover:bg-rose-700 transition">
              <span className="text-xs font-black flex items-center gap-2">
                <AlertTriangle size={14} /> ZARAR EDEN İŞLER ({zararli.length})
              </span>
              <ChevronDown size={16} className={`transition-transform ${acik ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {acik && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="pt-3 space-y-2">
                    {zararli.map((i) => (
                      <div key={i.is_id} className="bg-rose-50/60 border border-rose-100 rounded-2xl p-3.5">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-slate-800 truncate">{i.musteri}</p>
                            <p className="text-[10px] text-slate-400 font-bold">
                              {i.tarih ? new Date(i.tarih).toLocaleDateString('tr-TR') : '-'}
                              {i.teknisyen ? ` · ${i.teknisyen}` : ''}
                            </p>
                          </div>
                          <span className="text-sm font-black text-rose-700 shrink-0">{para(i.kar)} ₺</span>
                        </div>
                        {i.aciklama && (
                          <p className="text-[10px] text-slate-500 italic leading-snug mb-1">
                            “{String(i.aciklama).slice(0, 120)}”
                          </p>
                        )}
                        <p className="text-[10px] text-slate-500 font-bold">
                          Fiyat {para(i.fiyat)} ₺ · malzeme {para(i.malzeme_maliyeti)} ₺ · işçilik {para(i.iscilik_maliyeti)} ₺
                          {' · '}<span className="text-rose-600">marj %{i.marj_yuzde}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* MÜŞTERİ KÂRLILIĞI */}
        {musteriler.length > 0 && (
          <div>
            <button onClick={() => setMusteriAcik((o) => !o)}
              className="w-full flex items-center justify-between bg-slate-900 text-white px-4 py-3 rounded-2xl hover:bg-slate-800 transition">
              <span className="text-xs font-black">MÜŞTERİ KÂRLILIĞI ({musteriler.length})</span>
              <ChevronDown size={16} className={`transition-transform ${musteriAcik ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {musteriAcik && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="pt-3">
                    <div className="flex gap-2 mb-3">
                      {([['karli', 'En Kârlı'], ['zararli', 'En Zararlı']] as const).map(([k, a]) => (
                        <button key={k} onClick={() => setSekme(k)}
                          className={`px-3 py-2 rounded-xl text-[10px] font-black transition ${sekme === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                          {a}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {listelenecek.map((m) => (
                        <div key={m.musteri} className="bg-slate-50 border border-slate-100 rounded-2xl p-3">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-[11px] font-black text-slate-800 truncate flex-1">{m.musteri}</p>
                            <span className={`text-[11px] font-black shrink-0 ${Number(m.kar) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {para(m.kar)} ₺
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className={`h-full ${Number(m.marj_yuzde) >= 30 ? 'bg-emerald-500' : Number(m.marj_yuzde) >= 0 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                style={{ width: `${Math.min(Math.max(Number(m.marj_yuzde), 0), 100)}%` }} />
                            </div>
                            <span className="text-[9px] font-bold text-slate-400 w-24 text-right shrink-0">
                              {m.is_sayisi} iş · %{m.marj_yuzde}
                            </span>
                          </div>
                          {Number(m.zararli_is) > 0 && (
                            <p className="text-[9px] font-black text-rose-500 mt-1">{m.zararli_is} iş zarar etti</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <p className="text-[10px] text-slate-400 font-medium text-center">
          Maliyet = <strong>depodaki alış fiyatı × adet</strong> + <strong>çalışma saati × saatlik maliyet</strong>. İşçilik kalemleri malzeme sayılmaz.
        </p>
      </div>
    </div>
  );
}
