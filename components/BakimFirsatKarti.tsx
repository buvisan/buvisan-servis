"use client";

// ----------------------------------------------------------------------------
// BUVISAN - BAKIM FIRSAT KARTI 📅
// 281 sözleşmesiz vinç → düzenli gelire çevrilebilecek fırsatlar.
// bakim_ozeti() + abonelik_aday_musteriler() fonksiyonlarından beslenir.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarClock, AlertTriangle, ChevronDown, Loader2, RefreshCw, Building2, TrendingUp, Phone, X } from 'lucide-react';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

export default function BakimFirsatKarti() {
  const [ozet, setOzet] = useState<any>(null);
  const [adaylar, setAdaylar] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [acik, setAcik] = useState(false);
  const [teklif, setTeklif] = useState<{ musteri: string; metin: string } | null>(null);
  const [hazirlaniyor, setHazirlaniyor] = useState('');
  const [kopyalandi, setKopyalandi] = useState(false);

  const mesajOlustur = async (musteri: string) => {
    setHazirlaniyor(musteri);
    try {
      const { data, error } = await supabase.rpc('bakim_hatirlatma_metni', {
        p_musteri: musteri, p_periyot_ay: 6,
      });
      if (error) { alert('Mesaj üretilemedi: ' + error.message); return; }
      setTeklif({ musteri, metin: String(data || '') });
      setKopyalandi(false);
    } finally {
      setHazirlaniyor('');
    }
  };

  const kopyala = async () => {
    if (!teklif) return;
    try {
      await navigator.clipboard.writeText(teklif.metin);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2500);
    } catch {
      alert('Kopyalanamadı — metni elle seçip kopyalayın.');
    }
  };

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data: o } = await supabase.rpc('bakim_ozeti');
      setOzet(o);
      const { data: a } = await supabase.rpc('abonelik_aday_musteriler');
      setAdaylar(a || []);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  if (yukleniyor && !ozet) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-teal-500 mx-auto" />
      </div>
    );
  }
  if (!ozet) return null;

  const riskli = Number(ozet.yuksek_risk || 0) + Number(ozet.orta_risk || 0);

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-teal-700 to-emerald-700 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white/15 p-2 rounded-xl">
            <CalendarClock className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-white font-black text-sm tracking-tight leading-none">BAKIM FIRSATLARI</h2>
            <p className="text-[10px] text-teal-200 font-bold uppercase tracking-widest mt-1">
              {ozet.sozlesmesiz_vinc} sözleşmesiz vinç · {ozet.farkli_musteri} müşteri
            </p>
          </div>
        </div>
        <button onClick={getir} className="text-teal-200 hover:text-white bg-white/10 p-2 rounded-lg transition">
          {yukleniyor ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-teal-50 rounded-2xl p-4 border border-teal-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-teal-500 mb-1">Sözleşmesiz</p>
            <p className="text-2xl font-black text-teal-700 leading-none">{ozet.sozlesmesiz_vinc}</p>
            <p className="text-[10px] text-teal-500 font-bold mt-1">vinç fırsat bekliyor</p>
          </div>
          <div className="bg-rose-50 rounded-2xl p-4 border border-rose-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-rose-500 mb-1">Riskli</p>
            <p className="text-2xl font-black text-rose-700 leading-none">{riskli}</p>
            <p className="text-[10px] text-rose-500 font-bold mt-1">{ozet.yuksek_risk} yüksek · {ozet.orta_risk} orta</p>
          </div>
          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-500 mb-1">Hiç Servis Almamış</p>
            <p className="text-2xl font-black text-amber-700 leading-none">{ozet.hic_servis_yok}</p>
            <p className="text-[10px] text-amber-500 font-bold mt-1">vinç kaydı</p>
          </div>
          <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-1">Potansiyel</p>
            <p className="text-2xl font-black text-emerald-700 leading-none">{para(ozet.potansiyel_ciro)} ₺</p>
            <p className="text-[10px] text-emerald-500 font-bold mt-1">tahmini bakım cirosu</p>
          </div>
        </div>

        {adaylar.length > 0 && (
          <div>
            <button onClick={() => setAcik((o) => !o)}
              className="w-full flex items-center justify-between bg-slate-900 text-white px-4 py-3 rounded-2xl hover:bg-slate-800 transition">
              <span className="text-xs font-black flex items-center gap-2">
                <Building2 size={14} /> MÜŞTERİ FİLO SAĞLIK RAPORU ({adaylar.length})
              </span>
              <ChevronDown size={16} className={`transition-transform ${acik ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {acik && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="pt-3 space-y-2">
                    {adaylar.slice(0, 20).map((a) => (
                      <div key={a.musteri} className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-xs font-black text-slate-800 flex-1 min-w-0 truncate">{a.musteri}</p>
                          {Number(a.riskli_vinc) > 0 && (
                            <span className="bg-rose-100 text-rose-700 border border-rose-200 text-[9px] font-black px-2 py-1 rounded-lg shrink-0">
                              {a.riskli_vinc} RİSKLİ
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium">
                          {a.vinc_sayisi} vinç
                          {a.son_servis ? ` · son servis ${new Date(a.son_servis).toLocaleDateString('tr-TR')}` : ' · hiç servis kaydı yok'}
                        </p>
                        <p className="text-[11px] font-black text-emerald-700 mt-1">
                          Potansiyel: {para(a.potansiyel)} ₺
                        </p>
                        <button onClick={() => mesajOlustur(a.musteri)}
                          disabled={hazirlaniyor === a.musteri}
                          className="mt-2 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white py-2.5 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 transition active:scale-[0.98]">
                          {hazirlaniyor === a.musteri
                            ? <><Loader2 size={11} className="animate-spin" /> HAZIRLANIYOR...</>
                            : <>📋 BAKIM TEKLİF MESAJI OLUŞTUR</>}
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-3.5 flex gap-2">
          <TrendingUp size={15} className="text-teal-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-teal-900 font-medium leading-relaxed">
            Bu vinçlere <strong>yıllık bakım aboneliği</strong> teklif edilebilir. Sözleşmeli müşteri,
            arıza beklemeden düzenli servis alır; sen de <strong>öngörülebilir aylık gelir</strong> kazanırsın.
          </p>
        </div>

        {/* ABONELİK PAKETLERİ */}
        <div className="bg-white border border-teal-100 rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-teal-600 mb-3">
            📅 ABONELİK PAKETLERİ (makine başı · vinç & asansör)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-teal-50/70 rounded-2xl p-3.5 border border-teal-100">
              <p className="text-xs font-black text-teal-800">6 Aylık Bakım Anlaşması</p>
              <p className="text-lg font-black text-teal-700 leading-tight mt-1">8.500 ₺ <span className="text-[10px] font-bold text-teal-500">+ KDV</span></p>
              <p className="text-[10px] text-teal-600 font-bold mt-1">makine başı · yılda 2 periyodik bakım</p>
            </div>
            <div className="bg-emerald-50/70 rounded-2xl p-3.5 border border-emerald-100">
              <p className="text-xs font-black text-emerald-800">3 Aylık Bakım Anlaşması</p>
              <p className="text-lg font-black text-emerald-700 leading-tight mt-1">8.500 ₺ <span className="text-[10px] font-bold text-emerald-500">+ KDV</span></p>
              <p className="text-[10px] text-emerald-600 font-bold mt-1">makine başı · yılda 4 periyodik bakım</p>
            </div>
          </div>
          <p className="text-[9px] text-slate-400 font-medium mt-2.5">
            Her iki pakette de: acil servis önceliği · bakım raporu · KDV hariç (müşteri talebine göre indirim uygulanabilir).
            Detaylı fiyat hesabı: <code>abonelik_teklifi(makine_sayisi, periyot_ay, iskonto)</code>
          </p>
        </div>
      </div>

      {/* BAKIM TEKLİF MESAJI PENCERESİ */}
      <AnimatePresence>
        {teklif && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setTeklif(null)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[900]" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed inset-x-0 bottom-0 md:inset-0 md:m-auto md:h-fit md:max-w-2xl z-[901] bg-white rounded-t-[2rem] md:rounded-3xl shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <h3 className="font-black text-slate-800 text-sm">📋 BAKIM HATIRLATMA MESAJI</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{teklif.musteri}</p>
                </div>
                <button onClick={() => setTeklif(null)} className="bg-slate-100 hover:bg-red-500 hover:text-white text-slate-500 p-2.5 rounded-full transition">
                  <X size={16} />
                </button>
              </div>

              <div className="overflow-y-auto p-5">
                <pre className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-[11px] text-slate-700 font-sans whitespace-pre-wrap leading-relaxed">
{teklif.metin}
                </pre>
              </div>

              <div className="p-4 border-t border-slate-100 shrink-0">
                <button onClick={kopyala}
                  className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] ${kopyalandi ? 'bg-emerald-600 text-white' : 'bg-slate-900 hover:bg-slate-800 text-white'}`}>
                  {kopyalandi ? <>✅ KOPYALANDI — WHATSAPP&apos;A YAPIŞTIR</> : <>📋 METNİ KOPYALA</>}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
