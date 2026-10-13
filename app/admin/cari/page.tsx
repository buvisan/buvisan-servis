"use client";

// ----------------------------------------------------------------------------
// BUVISAN - CARİ HESAP & TAHSİLAT 💸
// ----------------------------------------------------------------------------
//  Bakiye = Yapılan İşler (completed_services) − Tahsil Edilen (cari_tahsilatlar)
//  Fonksiyonlar: cari_ozet(), cari_listesi(), cari_hesap(musteri), tahsilat_ekle()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet, Search, Loader2, RefreshCw, TrendingUp, AlertTriangle,
  Plus, X, CheckCircle, Building2, ArrowLeft, Phone, ChevronRight
} from 'lucide-react';
import { useRouter } from 'next/navigation';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

export default function CariHesapSayfasi() {
  const router = useRouter();
  const [ozet, setOzet] = useState<any>(null);
  const [liste, setListe] = useState<any[]>([]);
  const [arama, setArama] = useState('');
  const [yukleniyor, setYukleniyor] = useState(true);
  const [filtre, setFiltre] = useState<'borclu' | 'tumu'>('borclu');

  const [formAcik, setFormAcik] = useState(false);
  const [seciliMusteri, setSeciliMusteri] = useState('');
  const [tutar, setTutar] = useState('');
  const [tarih, setTarih] = useState(new Date().toISOString().slice(0, 10));
  const [tip, setTip] = useState('Havale');
  const [aciklama, setAciklama] = useState('');
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mesaj, setMesaj] = useState('');

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data: o } = await supabase.rpc('cari_ozet');
      setOzet(o);
      const { data: l } = await supabase.rpc('cari_listesi');
      setListe(l || []);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  const kaydet = async () => {
    if (!seciliMusteri.trim() || !tutar || Number(tutar) <= 0) {
      setMesaj('Müşteri ve tutar gerekli.');
      return;
    }
    setKaydediliyor(true);
    setMesaj('');
    try {
      const { data, error } = await supabase.rpc('tahsilat_ekle', {
        p_musteri: seciliMusteri.trim(),
        p_tutar: Number(tutar),
        p_tarih: tarih,
        p_tip: tip,
        p_fatura_no: null,
        p_aciklama: aciklama || null,
        p_kullanici: null,
      });
      if (error || !(data as any)?.ok) {
        setMesaj(error?.message || (data as any)?.mesaj || 'Kaydedilemedi.');
        return;
      }
      setMesaj('✅ ' + ((data as any).mesaj || 'Kaydedildi.'));
      setTutar(''); setAciklama('');
      await getir();
      setTimeout(() => { setFormAcik(false); setMesaj(''); }, 1200);
    } finally {
      setKaydediliyor(false);
    }
  };

  const suzulmus = liste.filter((l) => {
    if (filtre === 'borclu' && Number(l.bakiye) <= 0) return false;
    if (arama.trim()) return String(l.musteri).toLowerCase().includes(arama.trim().toLowerCase());
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8">
      <div className="max-w-[1400px] mx-auto space-y-6">

        {/* BAŞLIK */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin')}
              className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                <Wallet className="text-emerald-600" /> CARİ HESAP
              </h1>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                Yapılan iş − Tahsil edilen = Kalan alacak
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={getir} className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-300 transition-all">
              {yukleniyor ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            </button>
            <button onClick={() => { setSeciliMusteri(''); setFormAcik(true); }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-2xl font-black text-xs flex items-center gap-2 shadow-lg transition active:scale-95">
              <Plus size={16} /> TAHSİLAT EKLE
            </button>
          </div>
        </div>

        {yukleniyor && !ozet && (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-100">
            <Loader2 className="w-7 h-7 animate-spin text-emerald-500 mx-auto" />
          </div>
        )}

        {ozet && (
          <>
            {/* ÖZET KARTLARI */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Yapılan İş</p>
                <p className="text-xl md:text-2xl font-black text-slate-800 leading-none">{para(ozet.toplam_is)} ₺</p>
              </div>
              <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-1">Tahsil Edilen</p>
                <p className="text-xl md:text-2xl font-black text-emerald-700 leading-none">{para(ozet.toplam_tahsilat)} ₺</p>
                <p className="text-[10px] text-emerald-500 font-bold mt-1">oran %{ozet.tahsilat_orani}</p>
              </div>
              <div className="bg-rose-50 rounded-2xl p-4 border border-rose-100">
                <p className="text-[10px] font-black uppercase tracking-wider text-rose-500 mb-1">Kalan Alacak</p>
                <p className="text-xl md:text-2xl font-black text-rose-700 leading-none">{para(ozet.toplam_bakiye)} ₺</p>
                <p className="text-[10px] text-rose-500 font-bold mt-1">{ozet.borclu_sayisi} müşteri borçlu</p>
              </div>
              <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-500 mb-1">En Büyük Borç</p>
                <p className="text-xl md:text-2xl font-black text-amber-700 leading-none">{para(ozet.en_buyuk_borc)} ₺</p>
                <p className="text-[10px] text-amber-600 font-bold mt-1 truncate">{ozet.en_buyuk_borclu || '-'}</p>
              </div>
            </div>

            {Number(ozet.toplam_tahsilat) === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-2">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 font-bold leading-relaxed">
                  Henüz hiç tahsilat kaydı girilmemiş. Bu yüzden &quot;kalan alacak&quot; rakamı, yapılan tüm işlerin toplamına eşit görünüyor.
                  <strong> Tahsilatları girmeye başladığında gerçek bakiye ortaya çıkar.</strong> Geçmiş ödemeleri de girebilirsin (tarih seçerek).
                </p>
              </div>
            )}

            {/* ARAMA + FİLTRE */}
            <div className="bg-white rounded-2xl border border-slate-100 p-2 flex flex-col md:flex-row items-stretch md:items-center gap-2 shadow-sm">
              <div className="flex items-center gap-2 flex-1 px-2">
                <Search size={18} className="text-slate-400" />
                <input value={arama} onChange={(e) => setArama(e.target.value)}
                  placeholder="Müşteri ara..." className="flex-1 p-2.5 bg-transparent outline-none font-bold text-sm" />
              </div>
              <div className="flex gap-1">
                {([['borclu', 'Borçlular'], ['tumu', 'Tümü']] as const).map(([k, a]) => (
                  <button key={k} onClick={() => setFiltre(k)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-black transition ${filtre === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* LİSTE */}
            <div className="space-y-2">
              {suzulmus.length === 0 && (
                <div className="bg-white rounded-3xl p-10 text-center border border-slate-100">
                  <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400 font-bold">Kayıt bulunamadı.</p>
                </div>
              )}
              {suzulmus.slice(0, 100).map((l) => {
                const oran = Number(l.tahsilat_orani || 0);
                return (
                  <div key={l.musteri} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-800 truncate">{l.musteri}</p>
                        <p className="text-[10px] text-slate-400 font-bold">
                          {l.is_sayisi} iş {l.son_is ? `· son iş ${new Date(l.son_is).toLocaleDateString('tr-TR')}` : ''}
                          {l.son_odeme ? ` · son ödeme ${new Date(l.son_odeme).toLocaleDateString('tr-TR')}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-lg font-black leading-none ${Number(l.bakiye) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {para(l.bakiye)} ₺
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">kalan</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-200">
                          <div className="bg-emerald-500" style={{ width: `${Math.min(oran, 100)}%` }} />
                        </div>
                        <p className="text-[9px] text-slate-400 font-bold mt-1">
                          {para(l.tahsil_edilen)} ₺ tahsil / {para(l.yapilan_is)} ₺ iş · %{oran}
                        </p>
                      </div>
                      <button onClick={() => { setSeciliMusteri(l.musteri); setTutar(String(Math.round(Number(l.bakiye)))); setFormAcik(true); }}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-2 rounded-xl text-[10px] font-black flex items-center gap-1.5 transition shrink-0">
                        <Plus size={12} /> TAHSİLAT
                      </button>
                    </div>
                  </div>
                );
              })}
              {suzulmus.length > 100 && (
                <p className="text-[10px] text-slate-400 text-center font-bold py-2">
                  İlk 100 gösteriliyor (toplam {suzulmus.length}) — arama yaparak daralt
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* TAHSİLAT FORMU */}
      <AnimatePresence>
        {formAcik && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setFormAcik(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[900]" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed inset-x-0 bottom-0 md:inset-0 md:m-auto md:h-fit md:max-w-lg z-[901] bg-white rounded-t-[2rem] md:rounded-3xl shadow-2xl max-h-[90dvh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
                <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                  <Wallet size={16} className="text-emerald-600" /> TAHSİLAT EKLE
                </h3>
                <button onClick={() => setFormAcik(false)} className="bg-slate-100 hover:bg-red-500 hover:text-white text-slate-500 p-2 rounded-full transition">
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Müşteri *</label>
                  <input value={seciliMusteri} onChange={(e) => setSeciliMusteri(e.target.value)}
                    placeholder="Firma adı" className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-emerald-500" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tutar (₺) *</label>
                    <input type="number" value={tutar} onChange={(e) => setTutar(e.target.value)}
                      placeholder="0" className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tarih</label>
                    <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)}
                      className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-emerald-500" />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Ödeme Tipi</label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {['Havale', 'Nakit', 'Çek'].map((t) => (
                      <button key={t} onClick={() => setTip(t)}
                        className={`py-3 rounded-2xl text-xs font-black transition ${tip === t ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Açıklama</label>
                  <input value={aciklama} onChange={(e) => setAciklama(e.target.value)}
                    placeholder="Fatura no, not..." className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-emerald-500" />
                </div>

                {mesaj && (
                  <div className={`p-3 rounded-2xl text-[11px] font-bold ${mesaj.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                    {mesaj}
                  </div>
                )}

                <button onClick={kaydet} disabled={kaydediliyor}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98]">
                  {kaydediliyor ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                  TAHSİLATI KAYDET
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
