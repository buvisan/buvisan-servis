"use client";

// ----------------------------------------------------------------------------
// BUVISAN - KAZANCIM KARTI 💰
// Personel kendi aylık kazancını görür: maaş + cumartesi (%50) + pazar (%100)
// mesai + avans/kesinti + net ele geçen. Ayrıca kendi iş istatistikleri.
// Kaynak: personel_kazanc(personel, ay)
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, ChevronDown, ChevronLeft, ChevronRight, Loader2, CheckCircle2, TrendingUp, Info } from 'lucide-react';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export default function KazancimKarti({ personel }: { personel?: string }) {
  const bugun = new Date();
  const [ay, setAy] = useState(`${bugun.getFullYear()}-${String(bugun.getMonth() + 1).padStart(2, '0')}`);
  const [veri, setVeri] = useState<any>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [acik, setAcik] = useState(false);

  const getir = useCallback(async () => {
    if (!personel) { setYukleniyor(false); return; }
    setYukleniyor(true);
    try {
      const { data } = await supabase.rpc('personel_kazanc', { p_personel: personel, p_ay: ay });
      setVeri(data);
    } finally { setYukleniyor(false); }
  }, [personel, ay]);

  useEffect(() => { getir(); }, [getir]);

  if (!personel) return null;

  const ayDegistir = (yon: number) => {
    const [y, m] = ay.split('-').map(Number);
    const d = new Date(y, m - 1 + yon, 1);
    setAy(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const [yil, ayNo] = ay.split('-').map(Number);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-emerald-700 to-teal-700 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-white/15 p-2 rounded-xl">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-white font-black text-sm tracking-tight leading-none">KAZANCIM</h2>
            <p className="text-[10px] text-emerald-200 font-bold uppercase tracking-widest mt-1">
              maaş + mesai dökümü
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => ayDegistir(-1)} className="text-emerald-200 hover:text-white bg-white/10 p-2 rounded-lg transition">
            <ChevronLeft size={14} />
          </button>
          <span className="text-white font-black text-[11px] px-1 min-w-[78px] text-center">
            {AYLAR[ayNo - 1]} {yil}
          </span>
          <button onClick={() => ayDegistir(1)} className="text-emerald-200 hover:text-white bg-white/10 p-2 rounded-lg transition">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {yukleniyor ? (
        <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-600 mx-auto" /></div>
      ) : veri?.yetki_yok ? (
        <div className="p-5">
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex gap-2">
            <Info size={15} className="text-rose-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-rose-800 font-bold leading-relaxed">
              {veri.mesaj || 'Sadece kendi kazanç bilginizi görebilirsiniz.'}
            </p>
          </div>
        </div>
      ) : !veri?.kayit_var ? (
        <div className="p-5">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-2">
            <Info size={15} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 font-bold leading-relaxed">
              Bu ay için puantaj kaydınız henüz girilmemiş. Yönetim puantajı girdiğinde
              kazancınız burada görünecek.
            </p>
          </div>
          {Number(veri?.is_sayisi) > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                <p className="text-[9px] font-black text-slate-400 uppercase">İş</p>
                <p className="text-lg font-black text-slate-700">{veri.is_sayisi}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                <p className="text-[9px] font-black text-slate-400 uppercase">Saat</p>
                <p className="text-lg font-black text-slate-700">{veri.calisma_saati}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                <p className="text-[9px] font-black text-slate-400 uppercase">Ciro</p>
                <p className="text-lg font-black text-slate-700">{para(veri.toplam_ciro)}</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {/* NET ELE GEÇEN */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-1">Net Ele Geçen</p>
            <p className="text-3xl font-black text-emerald-700 leading-none">{para(veri.net_ele_gecen)} ₺</p>
          </div>

          {/* DÖKÜM */}
          <div className="bg-slate-50 rounded-2xl border border-slate-100 divide-y divide-slate-100">
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-[11px] font-bold text-slate-600">Maaş</span>
              <span className="text-[11px] font-black text-slate-800">{para(veri.maas)} ₺</span>
            </div>
            {Number(veri.mesai50_saat) > 0 && (
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-blue-50/50">
                <span className="text-[11px] font-bold text-blue-700">
                  Cumartesi mesaisi <span className="text-[9px] font-black">×1,5</span>
                  <span className="text-[9px] text-blue-400 font-black ml-1">({veri.mesai50_saat} saat)</span>
                </span>
                <span className="text-[11px] font-black text-blue-700">+{para(veri.mesai50_tutar)} ₺</span>
              </div>
            )}
            {Number(veri.mesai100_saat) > 0 && (
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-violet-50/50">
                <span className="text-[11px] font-bold text-violet-700">
                  Pazar mesaisi <span className="text-[9px] font-black">×2</span>
                  <span className="text-[9px] text-violet-400 font-black ml-1">({veri.mesai100_saat} saat)</span>
                </span>
                <span className="text-[11px] font-black text-violet-700">+{para(veri.mesai100_tutar)} ₺</span>
              </div>
            )}
            {Number(veri.yemek) > 0 && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-[11px] font-bold text-slate-600">Yemek</span>
                <span className="text-[11px] font-black text-emerald-600">+{para(veri.yemek)} ₺</span>
              </div>
            )}
            {Number(veri.avans) > 0 && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-[11px] font-bold text-slate-600">Avans</span>
                <span className="text-[11px] font-black text-rose-600">−{para(veri.avans)} ₺</span>
              </div>
            )}
            {Number(veri.kesinti) > 0 && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-[11px] font-bold text-slate-600">Kesinti</span>
                <span className="text-[11px] font-black text-rose-600">−{para(veri.kesinti)} ₺</span>
              </div>
            )}
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-white">
              <span className="text-[10px] font-black text-slate-400 uppercase">Saatlik ücretin</span>
              <span className="text-[11px] font-black text-slate-600">{para(veri.saatlik_ucret)} ₺/saat</span>
            </div>
          </div>

          {/* İŞ İSTATİSTİKLERİ */}
          <button onClick={() => setAcik((o) => !o)}
            className="w-full flex items-center justify-between bg-slate-100 hover:bg-slate-200 px-3.5 py-3 rounded-2xl transition">
            <span className="text-[11px] font-black text-slate-600 flex items-center gap-2">
              <TrendingUp size={13} /> BU AYKİ İŞLERİM
            </span>
            <ChevronDown size={14} className={`text-slate-400 transition-transform ${acik ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {acik && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase">Tamamlanan İş</p>
                    <p className="text-xl font-black text-slate-700">{veri.is_sayisi}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase">Çalışma Saati</p>
                    <p className="text-xl font-black text-slate-700">{veri.calisma_saati}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase">Ürettiğin Ciro</p>
                    <p className="text-xl font-black text-emerald-700">{para(veri.toplam_ciro)} ₺</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase">Hafta Sonu İşi</p>
                    <p className="text-xl font-black text-slate-700">
                      {veri.cumartesi_is}<span className="text-[10px] text-slate-400"> cmt</span> · {veri.pazar_is}<span className="text-[10px] text-slate-400"> paz</span>
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-start gap-2 bg-slate-50 rounded-xl p-3 border border-slate-100">
            <CheckCircle2 size={13} className="text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[9px] text-slate-500 font-medium leading-relaxed">
              Maaş ve mesai bilgileri <strong>puantaj kaydından</strong> gelir. Bir hata görürseniz yönetime bildirin.
              Hafta içi çalışma 08:00-18:00&apos;dir. Hafta sonu çalışılırsa cumartesi %50, pazar %100 mesai yazılır.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
