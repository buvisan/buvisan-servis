"use client";

// ----------------------------------------------------------------------------
// BUVISAN - TALEP YÖNETİMİ 📥
// Personelden gelen izin/avans/malzeme/arıza taleplerini onayla veya reddet.
// Kaynak: tum_talepler() + talep_cevapla()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Inbox, Loader2, ArrowLeft, Check, X, Clock, CalendarDays,
  Wallet, Package, Wrench, RefreshCw, MessageSquare, AlertTriangle
} from 'lucide-react';
import { useRouter } from 'next/navigation';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

const TIPLER: Record<string, { ad: string; ikon: any; renk: string }> = {
  IZIN: { ad: 'İzin', ikon: CalendarDays, renk: 'bg-amber-50 text-amber-700 border-amber-200' },
  AVANS: { ad: 'Avans', ikon: Wallet, renk: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  MALZEME: { ad: 'Malzeme', ikon: Package, renk: 'bg-blue-50 text-blue-700 border-blue-200' },
  ARIZA: { ad: 'Arıza', ikon: Wrench, renk: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export default function TalepYonetimiSayfasi() {
  const router = useRouter();
  const [talepler, setTalepler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [filtre, setFiltre] = useState<'BEKLEMEDE' | 'HEPSI'>('BEKLEMEDE');
  const [mesaj, setMesaj] = useState('');
  const [islemde, setIslemde] = useState('');
  const [notYazan, setNotYazan] = useState<string>('');
  const [notMetni, setNotMetni] = useState('');

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data, error } = await supabase.rpc('tum_talepler', {
        p_durum: filtre === 'BEKLEMEDE' ? 'BEKLEMEDE' : null,
      });
      if (error) { setMesaj('Talepler alınamadı: ' + error.message); setTalepler([]); return; }
      setTalepler(data || []);
    } finally { setYukleniyor(false); }
  }, [filtre]);

  useEffect(() => { getir(); }, [getir]);

  const cevapla = async (id: string, durum: string, not?: string) => {
    setIslemde(id + durum);
    try {
      const { data, error } = await supabase.rpc('talep_cevapla', {
        p_id: id, p_durum: durum, p_not: not || null,
      });
      if (error || !(data as any)?.ok) {
        setMesaj(error?.message || (data as any)?.mesaj || 'İşlem yapılamadı.');
        return;
      }
      setMesaj('✅ ' + ((data as any).mesaj || 'Kaydedildi.'));
      setNotYazan('');
      setNotMetni('');
      await getir();
      setTimeout(() => setMesaj(''), 2200);
    } finally { setIslemde(''); }
  };

  const bekleyenSayisi = talepler.filter((t) => t.durum === 'BEKLEMEDE').length;

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8">
      <div className="max-w-[1100px] mx-auto space-y-6">

        {/* BAŞLIK */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin')}
              className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                <Inbox className="text-indigo-600" /> PERSONEL TALEPLERİ
              </h1>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                izin · avans · malzeme · arıza bildirimi
              </p>
            </div>
          </div>
          <button onClick={getir} className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-300 transition-all">
            {yukleniyor ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          </button>
        </div>

        {mesaj && (
          <div className={`p-4 rounded-2xl text-xs font-bold border ${mesaj.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
            {mesaj}
          </div>
        )}

        {/* FİLTRE */}
        <div className="flex gap-2">
          {([['BEKLEMEDE', 'Bekleyenler'], ['HEPSI', 'Tümü']] as const).map(([k, a]) => (
            <button key={k} onClick={() => setFiltre(k)}
              className={`px-4 py-3 rounded-2xl text-xs font-black transition ${filtre === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
              {a}{k === 'BEKLEMEDE' && bekleyenSayisi > 0 ? ` (${bekleyenSayisi})` : ''}
            </button>
          ))}
        </div>

        {yukleniyor && (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-100">
            <Loader2 className="w-7 h-7 animate-spin text-indigo-500 mx-auto" />
          </div>
        )}

        {!yukleniyor && talepler.length === 0 && (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-100">
            <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-black text-slate-600 mb-1">
              {filtre === 'BEKLEMEDE' ? 'Bekleyen talep yok' : 'Hiç talep yok'}
            </p>
            <p className="text-[11px] text-slate-400 font-medium">
              Personel izin, avans veya malzeme talebi gönderdiğinde burada görünür.
            </p>
          </div>
        )}

        {/* TALEP LİSTESİ */}
        <div className="space-y-3">
          {talepler.map((t) => {
            const tip = TIPLER[t.talep_tipi] || TIPLER.MALZEME;
            const Ikon = tip.ikon;
            const bekliyor = t.durum === 'BEKLEMEDE';
            return (
              <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={`bg-white rounded-2xl border p-4 shadow-sm ${bekliyor ? 'border-amber-200' : 'border-slate-100'}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`p-2.5 rounded-xl border shrink-0 ${tip.renk}`}>
                      <Ikon size={17} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-800 truncate">
                        {t.personel}
                        {t.oncelik === 'ACIL' && <span className="ml-2 text-[9px] text-rose-600 font-black">🔴 ACİL</span>}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold">
                        {tip.ad} talebi · {t.created_at ? new Date(t.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[9px] font-black px-2.5 py-1.5 rounded-lg border shrink-0 ${
                    bekliyor ? 'bg-amber-100 text-amber-700 border-amber-200'
                      : t.durum === 'ONAYLANDI' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                      : 'bg-rose-100 text-rose-700 border-rose-200'
                  }`}>
                    {bekliyor ? '⏳ BEKLİYOR' : t.durum === 'ONAYLANDI' ? '✅ ONAYLANDI' : '❌ REDDEDİLDİ'}
                  </span>
                </div>

                {(t.baslik || t.aciklama) && (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 mb-2">
                    {t.baslik && <p className="text-[11px] font-black text-slate-700 mb-0.5">{t.baslik}</p>}
                    {t.aciklama && <p className="text-[11px] text-slate-600 leading-relaxed">{t.aciklama}</p>}
                  </div>
                )}

                {/* DETAYLAR */}
                <div className="flex flex-wrap gap-3 mb-2">
                  {t.tutar > 0 && (
                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                      💰 {para(t.tutar)} ₺
                    </span>
                  )}
                  {t.baslangic && (
                    <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg">
                      📅 {new Date(t.baslangic).toLocaleDateString('tr-TR')}
                      {t.bitis ? ` → ${new Date(t.bitis).toLocaleDateString('tr-TR')}` : ''}
                    </span>
                  )}
                  {t.baslangic && t.bitis && (
                    <span className="text-[10px] font-bold text-slate-500 px-2.5 py-1">
                      {Math.max(Math.round((new Date(t.bitis).getTime() - new Date(t.baslangic).getTime()) / 86400000) + 1, 1)} gün
                    </span>
                  )}
                </div>

                {t.yonetici_notu && !bekliyor && (
                  <p className="text-[10px] text-blue-700 font-bold bg-blue-50 rounded-lg p-2 mb-2">
                    💬 Notunuz: {t.yonetici_notu}
                  </p>
                )}

                {/* AKSİYONLAR */}
                {bekliyor && (
                  <>
                    {notYazan === t.id && (
                      <div className="mb-2">
                        <input value={notMetni} onChange={(e) => setNotMetni(e.target.value)}
                          placeholder="Personele not (isteğe bağlı)"
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500" />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => cevapla(t.id, 'ONAYLANDI', notMetni)}
                        disabled={islemde === t.id + 'ONAYLANDI'}
                        className="flex-1 min-w-[120px] bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white py-3 rounded-xl font-black text-[11px] flex items-center justify-center gap-1.5 transition active:scale-[0.98]">
                        {islemde === t.id + 'ONAYLANDI' ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />} ONAYLA
                      </button>
                      <button onClick={() => cevapla(t.id, 'REDDEDILDI', notMetni)}
                        disabled={islemde === t.id + 'REDDEDILDI'}
                        className="flex-1 min-w-[120px] bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white py-3 rounded-xl font-black text-[11px] flex items-center justify-center gap-1.5 transition active:scale-[0.98]">
                        {islemde === t.id + 'REDDEDILDI' ? <Loader2 size={13} className="animate-spin" /> : <X size={14} />} REDDET
                      </button>
                      <button onClick={() => { setNotYazan(notYazan === t.id ? '' : t.id); setNotMetni(''); }}
                        className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-[11px] flex items-center gap-1.5 transition">
                        <MessageSquare size={13} /> NOT
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            );
          })}
        </div>

        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex gap-2">
          <AlertTriangle size={15} className="text-indigo-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-indigo-900 font-medium leading-relaxed">
            Personel talepleri <strong>yalnızca sizde görünür</strong>. Onayladığınızda/reddettiğinizde
            personel kendi ekranında (TALEPLERİM kartında) sonucu ve notunuzu görür.
          </p>
        </div>
      </div>
    </div>
  );
}
