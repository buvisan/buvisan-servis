"use client";

// ----------------------------------------------------------------------------
// BUVISAN - TEKLİF TAKİP KARTI 💰
// ----------------------------------------------------------------------------
//  "Para masada" kartı: yanıt bekleyen teklifler, kaç gündür beklediği ve
//  hangi fiyat aralığının kazandığı. teklif_bekleyenler() + teklif_kazanma_analizi()
//  fonksiyonlarından beslenir.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, AlertTriangle, Clock, ChevronDown, TrendingUp, Phone, Loader2, RefreshCw, Trophy } from 'lucide-react';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

const ACILIYET_RENK: Record<string, string> = {
  'SÜRESİ GEÇTİ': 'bg-rose-100 text-rose-700 border-rose-300',
  'ACİL': 'bg-orange-100 text-orange-700 border-orange-300',
  'TAKİP ET': 'bg-amber-100 text-amber-700 border-amber-300',
  'YENİ': 'bg-slate-100 text-slate-600 border-slate-300',
};

export default function TeklifTakipKarti() {
  const [analiz, setAnaliz] = useState<any>(null);
  const [bekleyenler, setBekleyenler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [acik, setAcik] = useState(false);

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data: a } = await supabase.rpc('teklif_kazanma_analizi');
      setAnaliz(a);

      const { data: b } = await supabase.rpc('teklif_bekleyenler');
      setBekleyenler(b || []);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  if (yukleniyor && !analiz) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-purple-500 mx-auto" />
      </div>
    );
  }

  if (!analiz) return null;

  const takipGereken = bekleyenler.filter((b) => ['ACİL', 'SÜRESİ GEÇTİ'].includes(b.aciliyet));
  const masadaki = Number(analiz.bekleyen_tutar || 0);
  const oran = Number(analiz.kazanma_orani || 0);
  const araliklar = analiz.fiyat_araliklari || [];

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      {/* BAŞLIK */}
      <div className="bg-gradient-to-r from-purple-700 to-indigo-700 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white/15 p-2 rounded-xl">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-white font-black text-sm tracking-tight leading-none">TEKLİF TAKİP</h2>
            <p className="text-[10px] text-purple-200 font-bold uppercase tracking-widest mt-1">
              {analiz.bekleyen} bekleyen · {analiz.onaylanan} onaylı · {analiz.reddedilen} ret
            </p>
          </div>
        </div>
        <button onClick={getir} className="text-purple-200 hover:text-white bg-white/10 p-2 rounded-lg transition" title="Yenile">
          {yukleniyor ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
      </div>

      <div className="p-5 space-y-4">

        {/* ANA RAKAMLAR */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-500 mb-1">Masadaki Para</p>
            <p className="text-2xl font-black text-amber-700 leading-none">{para(masadaki)} ₺</p>
            <p className="text-[10px] text-amber-500 font-bold mt-1">{analiz.bekleyen} teklif yanıt bekliyor</p>
          </div>

          <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-1">Kazanma Oranı</p>
            <p className="text-2xl font-black text-emerald-700 leading-none flex items-center gap-1.5">
              <Trophy size={18} /> %{oran}
            </p>
            <p className="text-[10px] text-emerald-500 font-bold mt-1">
              kazanılan: {para(analiz.kazanilan_tutar)} ₺
            </p>
          </div>

          <div className={`rounded-2xl p-4 border col-span-2 lg:col-span-1 ${takipGereken.length > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
            <p className={`text-[10px] font-black uppercase tracking-wider mb-1 ${takipGereken.length > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
              Takip Gereken
            </p>
            <p className={`text-2xl font-black leading-none ${takipGereken.length > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
              {takipGereken.length}
            </p>
            <p className={`text-[10px] font-bold mt-1 ${takipGereken.length > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
              7+ gündür yanıtsız / süresi geçmiş
            </p>
          </div>
        </div>

        {/* FİYAT ARALIĞI ANALİZİ */}
        {araliklar.length > 0 && (
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <TrendingUp size={12} /> Hangi Fiyat Aralığı Kazanıyor?
            </p>
            <div className="space-y-2">
              {araliklar.map((a: any) => (
                <div key={a.bant} className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-500 w-32 shrink-0">{a.bant}</span>
                  <div className="flex-1 h-4 bg-slate-200 rounded-lg overflow-hidden">
                    <div className={`h-full rounded-lg ${Number(a.oran) >= 60 ? 'bg-emerald-500' : Number(a.oran) >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                      style={{ width: `${Math.max(Number(a.oran), 3)}%` }} />
                  </div>
                  <span className="text-[10px] font-black text-slate-600 w-24 text-right shrink-0">
                    %{a.oran} <span className="text-slate-400 font-bold">({a.onay}/{Number(a.onay) + Number(a.ret)})</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 font-medium mt-3">
              Yeşil bantlar senin güçlü olduğun fiyat aralığı · Kırmızı bantlarda fiyatı gözden geçir
            </p>
          </div>
        )}

        {/* TAKİP LİSTESİ */}
        {bekleyenler.length > 0 && (
          <div>
            <button onClick={() => setAcik((o) => !o)}
              className="w-full flex items-center justify-between bg-slate-900 text-white px-4 py-3 rounded-2xl hover:bg-slate-800 transition">
              <span className="text-xs font-black flex items-center gap-2">
                <Clock size={14} /> BEKLEYEN TEKLİFLER ({bekleyenler.length})
              </span>
              <ChevronDown size={16} className={`transition-transform ${acik ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {acik && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="pt-3 space-y-2">
                    {bekleyenler.slice(0, 25).map((b) => (
                      <div key={b.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-slate-800 truncate">{b.musteri}</p>
                            <p className="text-[10px] text-slate-400 font-medium">{b.yetkili}</p>
                          </div>
                          <span className={`text-[9px] font-black px-2 py-1 rounded-lg border shrink-0 ${ACILIYET_RENK[b.aciliyet] || 'bg-slate-100 text-slate-600 border-slate-300'}`}>
                            {b.aciliyet}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-black text-purple-700">{para(b.tutar)} ₺</span>
                          <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                            <Clock size={10} /> {b.bekleyen_gun} gündür bekliyor
                          </span>
                        </div>
                      </div>
                    ))}
                    {bekleyenler.length > 25 && (
                      <p className="text-[10px] text-slate-400 text-center font-bold pt-1">
                        İlk 25 gösteriliyor (toplam {bekleyenler.length})
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {takipGereken.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex gap-2">
            <AlertTriangle size={15} className="text-rose-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-rose-800 font-bold leading-relaxed">
              <strong>{takipGereken.length} teklif</strong> takip bekliyor — toplam{' '}
              <strong>{para(takipGereken.reduce((t: number, b: any) => t + Number(b.tutar || 0), 0))} ₺</strong>.
              Bu teklifler her sabah Telegram bildiriminde de hatırlatılır.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
