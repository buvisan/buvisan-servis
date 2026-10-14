"use client";

// ----------------------------------------------------------------------------
// BUVISAN - TALEPLERİM 📋
// Personel izin / avans / malzeme / arıza talebi gönderir, durumunu görür.
// Kaynak: talep_gonder() + taleplerim()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, ChevronDown, X, Check, Clock, XCircle, Package, Wallet, Wrench, CalendarDays } from 'lucide-react';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

const TIPLER = [
  { kod: 'IZIN', ad: 'İzin Talebi', ikon: CalendarDays, renk: 'bg-amber-50 text-amber-700 border-amber-200' },
  { kod: 'AVANS', ad: 'Avans Talebi', ikon: Wallet, renk: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { kod: 'MALZEME', ad: 'Malzeme Talebi', ikon: Package, renk: 'bg-blue-50 text-blue-700 border-blue-200' },
  { kod: 'ARIZA', ad: 'Arıza Bildirimi', ikon: Wrench, renk: 'bg-rose-50 text-rose-700 border-rose-200' },
];

const DURUM_RENK: Record<string, string> = {
  BEKLEMEDE: 'bg-amber-100 text-amber-700 border-amber-200',
  ONAYLANDI: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  REDDEDILDI: 'bg-rose-100 text-rose-700 border-rose-200',
};

export default function TaleplerimKarti() {
  const [talepler, setTalepler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [acik, setAcik] = useState(false);
  const [formAcik, setFormAcik] = useState(false);
  const [tip, setTip] = useState('IZIN');
  const [baslik, setBaslik] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [tutar, setTutar] = useState('');
  const [baslangic, setBaslangic] = useState('');
  const [bitis, setBitis] = useState('');
  const [oncelik, setOncelik] = useState('NORMAL');
  const [ucretli, setUcretli] = useState(true);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [mesaj, setMesaj] = useState('');

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data } = await supabase.rpc('taleplerim');
      setTalepler(data || []);
    } finally { setYukleniyor(false); }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  const gonder = async () => {
    if (!baslik.trim() && !aciklama.trim()) { setMesaj('Konu veya açıklama girin.'); return; }
    setGonderiliyor(true);
    setMesaj('');
    try {
      const ortak = {
        p_talep_tipi: tip,
        p_baslik: baslik.trim() || null,
        p_aciklama: aciklama.trim() || null,
        p_tutar: tip === 'AVANS' && tutar ? Number(tutar) : null,
        p_baslangic: tip === 'IZIN' && baslangic ? baslangic : null,
        p_bitis: tip === 'IZIN' && bitis ? bitis : null,
        p_oncelik: oncelik,
      };

      // 1) YENİ sürüm — ücretli/ücretsiz bilgisiyle
      let { data, error } = await supabase.rpc('talep_gonder', {
        ...ortak,
        p_ucretli: tip === 'IZIN' ? ucretli : true,
      });

      // 2) 🛡️ EMNİYET VALFİ: veritabanı henüz güncellenmemişse (p_ucretli yoksa)
      //    eski sürümle tekrar dene → personel ASLA bloke olmaz.
      if (error && (
        error.message?.includes('schema cache') ||
        error.message?.includes('p_ucretli') ||
        (error as any).code === 'PGRST202'
      )) {
        console.warn('talep_gonder yeni sürümü yok, eski sürüm deneniyor:', error.message);
        const eski = await supabase.rpc('talep_gonder', ortak);
        if (!eski.error) {
          setMesaj('✅ Talebiniz gönderildi. (Not: ücretli/ücretsiz ayrımı için yöneticiye haber verin.)');
          setBaslik(''); setAciklama(''); setTutar(''); setBaslangic(''); setBitis('');
          await getir();
          setTimeout(() => { setFormAcik(false); setMesaj(''); }, 3000);
          return;
        }
        error = eski.error;
        data = eski.data;
      }

      if (error || !(data as any)?.ok) {
        setMesaj(error?.message || (data as any)?.mesaj || 'Gönderilemedi.');
        return;
      }
      setMesaj('✅ Talebiniz gönderildi.');
      setBaslik(''); setAciklama(''); setTutar(''); setBaslangic(''); setBitis('');
      await getir();
      setTimeout(() => { setFormAcik(false); setMesaj(''); }, 1400);
    } finally { setGonderiliyor(false); }
  };

  const bekleyen = talepler.filter((t) => t.durum === 'BEKLEMEDE').length;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-white/15 p-2 rounded-xl">
            <Send className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-white font-black text-sm tracking-tight leading-none">TALEPLERİM</h2>
            <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest mt-1">
              izin · avans · malzeme · arıza
            </p>
          </div>
        </div>
        <button onClick={() => setFormAcik(true)}
          className="bg-white/15 hover:bg-white/25 text-white px-3 py-2 rounded-xl font-black text-[10px] transition">
          + YENİ TALEP
        </button>
      </div>

      <div className="p-4">
        {yukleniyor ? (
          <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" /></div>
        ) : talepler.length === 0 ? (
          <p className="text-[11px] text-slate-400 font-bold text-center py-4">
            Henüz talebiniz yok. &quot;+ YENİ TALEP&quot; ile izin, avans veya malzeme isteyebilirsiniz.
          </p>
        ) : (
          <>
            <button onClick={() => setAcik((o) => !o)}
              className="w-full flex items-center justify-between bg-slate-100 hover:bg-slate-200 px-3.5 py-3 rounded-2xl transition mb-2">
              <span className="text-[11px] font-black text-slate-600">
                TALEPLERİM ({talepler.length}){bekleyen > 0 && <span className="text-amber-600"> · {bekleyen} bekliyor</span>}
              </span>
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${acik ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {acik && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="space-y-2 pt-1">
                    {talepler.map((t) => {
                      const tipBilgi = TIPLER.find((x) => x.kod === t.talep_tipi);
                      const Ikon = tipBilgi?.ikon || Send;
                      return (
                        <div key={t.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Ikon size={14} className="text-slate-400 shrink-0" />
                              <p className="text-[11px] font-black text-slate-800 truncate">
                                {t.baslik || tipBilgi?.ad || t.talep_tipi}
                              </p>
                            </div>
                            <span className={`text-[9px] font-black px-2 py-1 rounded-lg border shrink-0 ${DURUM_RENK[t.durum] || ''}`}>
                              {t.durum === 'BEKLEMEDE' ? '⏳ BEKLİYOR' : t.durum === 'ONAYLANDI' ? '✅ ONAYLANDI' : '❌ REDDEDİLDİ'}
                            </span>
                          </div>
                          {t.talep_tipi === 'IZIN' && (
                            <span className={`inline-block text-[9px] font-black px-2 py-1 rounded-lg mb-1 ${
                              t.ucretli === false ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            }`}>
                              {t.ucretli === false ? '💸 ÜCRETSİZ İZİN (maaştan kesilir)' : '✅ ÜCRETLİ İZİN'}
                            </span>
                          )}
                          {t.aciklama && <p className="text-[10px] text-slate-500 leading-snug mb-1">{t.aciklama}</p>}
                          <p className="text-[9px] text-slate-400 font-bold">
                            {t.created_at ? new Date(t.created_at).toLocaleDateString('tr-TR') : ''}
                            {t.tutar ? ` · ${para(t.tutar)} ₺` : ''}
                            {t.baslangic ? ` · ${new Date(t.baslangic).toLocaleDateString('tr-TR')}` : ''}
                            {t.bitis ? ` → ${new Date(t.bitis).toLocaleDateString('tr-TR')}` : ''}
                            {t.oncelik === 'ACIL' ? ' · 🔴 ACİL' : ''}
                          </p>
                          {t.yonetici_notu && (
                            <p className="text-[10px] text-blue-700 font-bold bg-blue-50 rounded-lg p-2 mt-1.5">
                              💬 Yönetim: {t.yonetici_notu}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* YENİ TALEP FORMU */}
      <AnimatePresence>
        {formAcik && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setFormAcik(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[900]" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed inset-x-0 bottom-0 md:inset-0 md:m-auto md:h-fit md:max-w-lg z-[901] bg-white rounded-t-[2rem] md:rounded-3xl shadow-2xl max-h-[92dvh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
                <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                  <Send size={16} className="text-slate-700" /> YENİ TALEP
                </h3>
                <button onClick={() => setFormAcik(false)} className="bg-slate-100 hover:bg-red-500 hover:text-white text-slate-500 p-2 rounded-full transition">
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Talep Tipi</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {TIPLER.map((t) => {
                      const Ikon = t.ikon;
                      return (
                        <button key={t.kod} onClick={() => setTip(t.kod)}
                          className={`py-3 rounded-2xl text-[11px] font-black flex items-center justify-center gap-2 border transition ${
                            tip === t.kod ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                          }`}>
                          <Ikon size={14} /> {t.ad.replace(' Talebi', '').replace(' Bildirimi', '')}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {tip === 'IZIN' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Başlangıç</label>
                        <input type="date" value={baslangic} onChange={(e) => setBaslangic(e.target.value)}
                          className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-slate-500" />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Bitiş</label>
                        <input type="date" value={bitis} onChange={(e) => setBitis(e.target.value)}
                          className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-slate-500" />
                      </div>
                    </div>

                    {/* 💰 ÜCRETLİ / ÜCRETSİZ */}
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">İzin Türü</label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <button onClick={() => setUcretli(true)}
                          className={`py-3 rounded-2xl text-[11px] font-black border transition ${
                            ucretli ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'
                          }`}>
                          ✅ ÜCRETLİ
                          <span className="block text-[8px] font-bold opacity-80 mt-0.5">maaştan kesilmez</span>
                        </button>
                        <button onClick={() => setUcretli(false)}
                          className={`py-3 rounded-2xl text-[11px] font-black border transition ${
                            !ucretli ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-200'
                          }`}>
                          💸 ÜCRETSİZ
                          <span className="block text-[8px] font-bold opacity-80 mt-0.5">maaştan kesilir</span>
                        </button>
                      </div>
                      {!ucretli && (
                        <p className="text-[10px] text-amber-700 font-bold bg-amber-50 border border-amber-200 rounded-xl p-2.5 mt-2">
                          ⚠️ Ücretsiz izin onaylanırsa maaşınızdan <strong>günlük ücret × gün sayısı</strong> kadar
                          kesinti yapılır.
                        </p>
                      )}
                    </div>
                  </>
                )}

                {tip === 'AVANS' && (
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tutar (₺)</label>
                    <input type="number" value={tutar} onChange={(e) => setTutar(e.target.value)} placeholder="0"
                      className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-slate-500" />
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Konu</label>
                  <input value={baslik} onChange={(e) => setBaslik(e.target.value)}
                    placeholder={tip === 'MALZEME' ? 'Hangi parça?' : tip === 'ARIZA' ? 'Ne arızası?' : 'Kısa konu'}
                    className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-slate-500" />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Açıklama</label>
                  <textarea rows={3} value={aciklama} onChange={(e) => setAciklama(e.target.value)}
                    placeholder="Detay yazın..."
                    className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-slate-500 resize-none" />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Aciliyet</label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {['DUSUK', 'NORMAL', 'ACIL'].map((o) => (
                      <button key={o} onClick={() => setOncelik(o)}
                        className={`py-2.5 rounded-2xl text-[10px] font-black transition ${
                          oncelik === o
                            ? o === 'ACIL' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                        {o === 'DUSUK' ? 'Düşük' : o === 'NORMAL' ? 'Normal' : '🔴 Acil'}
                      </button>
                    ))}
                  </div>
                </div>

                {mesaj && (
                  <div className={`p-3 rounded-2xl text-[11px] font-bold ${mesaj.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                    {mesaj}
                  </div>
                )}

                <button onClick={gonder} disabled={gonderiliyor}
                  className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98]">
                  {gonderiliyor ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  TALEBİ GÖNDER
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
