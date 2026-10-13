"use client";

// ----------------------------------------------------------------------------
// BUVISAN - ASANSÖR KARTI 🏢
// Kapasite alanından otomatik tespit edilen asansör işleri + abonelik fırsatları.
// Kaynak: makine_tipi_ozeti() + asansor_musterileri() + asansor_envanteri()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, ChevronDown, Loader2, RefreshCw, AlertTriangle, TrendingUp, ArrowUpDown, X } from 'lucide-react';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

export default function AsansorKarti() {
  const [ozet, setOzet] = useState<any>(null);
  const [musteriler, setMusteriler] = useState<any[]>([]);
  const [envanter, setEnvanter] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [acik, setAcik] = useState(false);
  const [envAcik, setEnvAcik] = useState(false);
  const [sirala, setSirala] = useState<'ciro' | 'gecikme'>('ciro');
  const [hata, setHata] = useState('');
  const [teklif, setTeklif] = useState<{ musteri: string; metin: string } | null>(null);
  const [teklifYukleniyor, setTeklifYukleniyor] = useState('');
  const [kopyalandi, setKopyalandi] = useState(false);

  const teklifOlustur = async (musteri: string) => {
    setTeklifYukleniyor(musteri);
    try {
      const { data, error } = await supabase.rpc('abonelik_teklif_metni', {
        p_musteri: musteri, p_periyot_ay: 6, p_makine_sayisi: null, p_iskonto_yuzde: 0,
      });
      if (error) { alert('Teklif üretilemedi: ' + error.message); return; }
      setTeklif({ musteri, metin: String(data || '') });
      setKopyalandi(false);
    } finally {
      setTeklifYukleniyor('');
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
    setHata('');
    try {
      const { data: o, error: e1 } = await supabase.rpc('makine_tipi_ozeti');
      if (e1) { setHata(e1.message); return; }
      setOzet(o);

      const { data: m } = await supabase.rpc('asansor_musterileri');
      setMusteriler(m || []);

      const { data: e } = await supabase.rpc('asansor_envanteri');
      setEnvanter((e || []).slice(0, 60));
    } catch (e: any) {
      setHata(String(e?.message || e));
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  if (yukleniyor && !ozet) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-sky-600 mx-auto" />
      </div>
    );
  }

  if (!ozet || Number(ozet.servis_asansor) === 0) {
    if (hata) {
      return (
        <div className="bg-sky-50 border border-sky-300 rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle size={16} className="text-sky-700" />
            <h3 className="font-black text-sky-900 text-sm">ASANSÖR — veri alınamadı</h3>
          </div>
          <p className="text-[10px] text-sky-800 bg-white/70 rounded-xl p-2.5 font-mono break-all mb-2">Hata: {hata}</p>
          <p className="text-[11px] text-sky-800 font-bold">
            <code className="bg-sky-100 px-1 rounded">35</code> ve <code className="bg-sky-100 rounded px-1">36</code> numaralı
            scriptlerin çalıştırılması gerekiyor.
          </p>
          <button onClick={getir} className="mt-3 bg-sky-700 hover:bg-sky-800 text-white px-4 py-2 rounded-xl text-[10px] font-black transition">
            TEKRAR DENE
          </button>
        </div>
      );
    }
    return null;
  }

  const toplamAbonelik = musteriler.reduce((t, m) => t + Number(m.abonelik_6ay || 0), 0);
  const gecikmis = musteriler.filter((m) => Number(m.gecen_gun) >= 150);
  const listelenecek = sirala === 'ciro'
    ? musteriler.slice(0, 20)
    : [...musteriler].sort((a, b) => Number(b.gecen_gun) - Number(a.gecen_gun)).slice(0, 20);

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-sky-700 to-cyan-700 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white/15 p-2 rounded-xl">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-white font-black text-sm tracking-tight leading-none">ASANSÖR İŞLERİ</h2>
            <p className="text-[10px] text-sky-200 font-bold uppercase tracking-widest mt-1">
              {ozet.servis_asansor} iş · {ozet.asansor_cesidi} farklı asansör · {ozet.asansor_musteri} müşteri
            </p>
          </div>
        </div>
        <button onClick={getir} className="text-sky-200 hover:text-white bg-white/10 p-2 rounded-lg transition">
          {yukleniyor ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-sky-50 rounded-2xl p-4 border border-sky-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-sky-500 mb-1">Asansör İşi</p>
            <p className="text-2xl font-black text-sky-700 leading-none">{ozet.servis_asansor}</p>
            <p className="text-[10px] text-sky-500 font-bold mt-1">{ozet.servis_toplam} işin içinde</p>
          </div>
          <div className="bg-cyan-50 rounded-2xl p-4 border border-cyan-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-cyan-500 mb-1">Asansör Cirosu</p>
            <p className="text-2xl font-black text-cyan-700 leading-none">{para(ozet.asansor_ciro)} ₺</p>
          </div>
          <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-1">Abonelik Potansiyeli</p>
            <p className="text-xl md:text-2xl font-black text-emerald-700 leading-none">{para(toplamAbonelik)} ₺</p>
            <p className="text-[10px] text-emerald-500 font-bold mt-1">yıllık · 6 aylık paketle</p>
          </div>
          <div className={`rounded-2xl p-4 border ${gecikmis.length > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
            <p className={`text-[10px] font-black uppercase tracking-wider mb-1 ${gecikmis.length > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
              Bakımı Gecikmiş
            </p>
            <p className={`text-2xl font-black leading-none ${gecikmis.length > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
              {gecikmis.length}
            </p>
            <p className={`text-[10px] font-bold mt-1 ${gecikmis.length > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
              150+ gündür servis yok
            </p>
          </div>
        </div>

        {/* MÜŞTERİ LİSTESİ */}
        {musteriler.length > 0 && (
          <div>
            <button onClick={() => setAcik((o) => !o)}
              className="w-full flex items-center justify-between bg-slate-900 text-white px-4 py-3 rounded-2xl hover:bg-slate-800 transition">
              <span className="text-xs font-black flex items-center gap-2">
                <TrendingUp size={14} /> ASANSÖR MÜŞTERİLERİ ({musteriler.length})
              </span>
              <ChevronDown size={16} className={`transition-transform ${acik ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {acik && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="pt-3">
                    <div className="flex gap-2 mb-3">
                      {([['ciro', 'Ciroya Göre'], ['gecikme', 'Gecikmeye Göre']] as const).map(([k, a]) => (
                        <button key={k} onClick={() => setSirala(k)}
                          className={`px-3 py-2 rounded-xl text-[10px] font-black transition flex items-center gap-1 ${sirala === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                          <ArrowUpDown size={10} /> {a}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-2">
                      {listelenecek.map((m) => {
                        const g = Number(m.gecen_gun || 0);
                        return (
                          <div key={m.musteri} className={`rounded-2xl p-3.5 border ${g >= 150 ? 'bg-rose-50/70 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-black text-slate-800 truncate">{m.musteri}</p>
                                <p className="text-[10px] text-slate-400 font-bold">
                                  {m.asansor_cesidi} farklı asansör · {m.servis_sayisi} servis
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[11px] font-black text-cyan-700">{para(m.toplam_tutar)} ₺</p>
                                <p className={`text-[9px] font-black ${g >= 150 ? 'text-rose-600' : g >= 90 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                  {g} gün önce
                                </p>
                              </div>
                            </div>
                            <p className="text-[10px] font-bold text-emerald-700">
                              📅 6 aylık abonelik teklifi: <strong>{para(m.abonelik_6ay)} ₺</strong> (yıllık)
                            </p>
                            <button onClick={() => teklifOlustur(m.musteri)}
                              disabled={teklifYukleniyor === m.musteri}
                              className="mt-2 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white py-2.5 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 transition active:scale-[0.98]">
                              {teklifYukleniyor === m.musteri
                                ? <><Loader2 size={11} className="animate-spin" /> HAZIRLANIYOR...</>
                                : <>📋 TEKLİF METNİ OLUŞTUR</>}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ASANSÖR ENVANTERİ */}
        {envanter.length > 0 && (
          <div>
            <button onClick={() => setEnvAcik((o) => !o)}
              className="w-full flex items-center justify-between bg-sky-600 text-white px-4 py-3 rounded-2xl hover:bg-sky-700 transition">
              <span className="text-xs font-black flex items-center gap-2">
                <Building2 size={14} /> ASANSÖR ENVANTERİ ({envanter.length})
              </span>
              <ChevronDown size={16} className={`transition-transform ${envAcik ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {envAcik && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="pt-3 space-y-1.5">
                    {envanter.map((a, i) => (
                      <div key={i} className="bg-sky-50/60 border border-sky-100 rounded-xl p-3 flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black text-slate-800 truncate">{a.asansor_adi}</p>
                          <p className="text-[10px] text-slate-400 font-bold truncate">
                            {a.musteri} · {a.servis_sayisi} servis
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] font-black text-cyan-700">{para(a.toplam_tutar)} ₺</p>
                          <p className="text-[9px] font-bold text-slate-400">{a.gecen_gun} gün</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 mb-2">
            💰 FİLO İNDİRİMİ (makine sayısı arttıkça fiyat düşer)
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              ['1 makine', '8.500 ₺'],
              ['2-3', '7.500 ₺'],
              ['4-6', '6.500 ₺'],
              ['7-9', '5.500 ₺'],
              ['10-14', '4.500 ₺'],
              ['15-24', '4.000 ₺'],
              ['25+', '3.500 ₺'],
            ].map(([a, f]) => (
              <span key={a} className="bg-white border border-emerald-200 rounded-xl px-2.5 py-1.5 text-[9px] font-bold text-slate-600">
                <strong className="text-emerald-700">{a}</strong> → {f}
              </span>
            ))}
          </div>
          <p className="text-[9px] text-emerald-600 font-medium mt-2">
            Makine başı fiyat (KDV hariç) · vinç ve asansör için aynı kademe uygulanır ·
            teklif metninde indirim ayrıca gösterilir
          </p>
        </div>

        <p className="text-[10px] text-slate-400 font-medium text-center">
          Asansörler, iş formlarındaki <strong>kapasite alanından</strong> otomatik tespit edilir
          (&quot;2 TON ASANSÖR&quot;, &quot;14 NOLU ASANSÖR&quot; gibi). Yeni işler de otomatik sınıflanır.
        </p>
      </div>

      {/* TEKLİF METNİ PENCERESİ */}
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
                  <h3 className="font-black text-slate-800 text-sm">📋 ABONELİK TEKLİFİ</h3>
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
                <p className="text-[10px] text-slate-400 text-center font-medium mt-2">
                  Metni kopyalayıp WhatsApp&apos;tan müşteriye gönder.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
