"use client";

// ----------------------------------------------------------------------------
// BUVISAN - GEÇMİŞİM 🕘
// Saha personelinin kendi tamamladığı işleri ve performansını gösterir.
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { History, ChevronDown, Clock, TrendingUp, PenLine, Camera, MapPin, Loader2 } from 'lucide-react';
import { isimEslesiyor } from '@/lib/personel';

const dakikaYazi = (dk: number) => {
  if (!dk || dk <= 0) return '-';
  const sa = Math.floor(dk / 60);
  const k = dk % 60;
  return sa > 0 ? `${sa}s ${k}dk` : `${k}dk`;
};

const tarihYazi = (t: string) => {
  const d = new Date(t);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
};

export default function Gecmisim({ aktifPersonel }: { aktifPersonel: any }) {
  const [kayitlar, setKayitlar] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [acik, setAcik] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('service_reports')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(150);
        if (error) { console.warn('Geçmiş alınamadı:', error.message); return; }
        setKayitlar(data || []);
      } finally {
        setYukleniyor(false);
      }
    })();
  }, []);

  const benimkiler = useMemo(() => {
    const ad = aktifPersonel?.full_name || '';
    if (!ad) return [];
    return kayitlar.filter((r) =>
      String(r.personel_adi || '')
        .split(' - ')
        .map((p: string) => p.trim())
        .filter(Boolean)
        .some((p: string) => isimEslesiyor(p, ad))
    );
  }, [kayitlar, aktifPersonel]);

  const istatistik = useMemo(() => {
    const simdi = new Date();
    const ayBasi = new Date(simdi.getFullYear(), simdi.getMonth(), 1);
    const buAy = benimkiler.filter((r) => new Date(r.created_at) >= ayBasi);
    const sureler = buAy.map((r) => Number(r.sure_dakika) || 0).filter((x) => x > 0);
    const toplam = sureler.reduce((a, b) => a + b, 0);
    const imzali = benimkiler.filter((r) => r.imza_url).length;
    return {
      ayAdet: buAy.length,
      toplamDk: toplam,
      ortalama: sureler.length ? Math.round(toplam / sureler.length) : 0,
      toplamKayit: benimkiler.length,
      imzali,
    };
  }, [benimkiler]);

  return (
    <div className="px-4 pt-4">
      <div className="bg-white rounded-[2rem] shadow-lg border border-slate-200 overflow-hidden">
        <button
          onClick={() => setAcik((o) => !o)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-3">
            <div className="bg-slate-900 p-2 rounded-xl">
              <History className="w-5 h-5 text-slate-300" />
            </div>
            <div className="text-left">
              <h2 className="font-black text-sm text-slate-800 tracking-tight leading-none">GEÇMİŞİM</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                {yukleniyor ? 'Yükleniyor...' : `Bu ay ${istatistik.ayAdet} iş · ${istatistik.toplamKayit} toplam kayıt`}
              </p>
            </div>
          </div>
          <ChevronDown size={18} className={`text-slate-400 transition-transform ${acik ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {acik && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-4">

                {yukleniyor ? (
                  <div className="py-10 text-center">
                    <Loader2 className="w-7 h-7 animate-spin text-slate-400 mx-auto" />
                  </div>
                ) : (
                  <>
                    {/* PERFORMANS ŞERİDİ */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-slate-50 rounded-2xl p-3 text-center border border-slate-100">
                        <p className="text-2xl font-black text-slate-800 leading-none">{istatistik.ayAdet}</p>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-1">Bu Ay İş</p>
                      </div>
                      <div className="bg-blue-50 rounded-2xl p-3 text-center border border-blue-100">
                        <p className="text-2xl font-black text-blue-700 leading-none">{dakikaYazi(istatistik.toplamDk)}</p>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-blue-400 mt-1">Saha Süresi</p>
                      </div>
                      <div className="bg-emerald-50 rounded-2xl p-3 text-center border border-emerald-100">
                        <p className="text-2xl font-black text-emerald-700 leading-none">{dakikaYazi(istatistik.ortalama)}</p>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-500 mt-1">Ortalama</p>
                      </div>
                    </div>

                    {istatistik.imzali > 0 && (
                      <p className="text-[10px] font-bold text-slate-400 text-center">
                        🖊️ {istatistik.imzali} rapor müşteri imzasıyla kaydedildi
                      </p>
                    )}

                    {/* KAYIT LİSTESİ */}
                    {benimkiler.length === 0 ? (
                      <div className="py-10 text-center">
                        <TrendingUp className="w-9 h-9 text-slate-200 mx-auto mb-2" />
                        <p className="text-sm font-bold text-slate-500">Henüz tamamlanmış işin yok</p>
                        <p className="text-[11px] text-slate-400 mt-1">Rapor doldurduğunda burada listelenir.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {benimkiler.slice(0, 30).map((r) => (
                          <div key={r.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5">
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <p className="text-xs font-black text-slate-800 leading-tight flex-1">
                                {r.firma_adi || 'Bilinmeyen Firma'}
                              </p>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {r.imza_url && (
                                  <span title="Müşteri imzası var" className="bg-purple-100 text-purple-600 border border-purple-200 p-1 rounded-lg">
                                    <PenLine size={10} />
                                  </span>
                                )}
                                {Array.isArray(r.medya_urls) && r.medya_urls.length > 0 && (
                                  <span title="Fotoğraf var" className="bg-blue-100 text-blue-600 border border-blue-200 p-1 rounded-lg">
                                    <Camera size={10} />
                                  </span>
                                )}
                                {r.lat && (
                                  <span title="Konum kayıtlı" className="bg-emerald-100 text-emerald-600 border border-emerald-200 p-1 rounded-lg">
                                    <MapPin size={10} />
                                  </span>
                                )}
                              </div>
                            </div>

                            <p className="text-[10px] text-slate-400 font-bold mb-1.5">
                              {tarihYazi(r.created_at)} · {r.islem_turu || 'Servis'}
                            </p>

                            {r.yapilan_isler && (
                              <p className="text-[11px] text-slate-600 font-medium leading-snug line-clamp-2 mb-1.5">
                                {r.yapilan_isler}
                              </p>
                            )}

                            <div className="flex items-center gap-3">
                              {r.sure_dakika > 0 && (
                                <span className="text-[10px] font-black text-blue-600 bg-white border border-blue-100 px-2 py-1 rounded-lg flex items-center gap-1">
                                  <Clock size={10} /> {dakikaYazi(Number(r.sure_dakika))}
                                </span>
                              )}
                              {Array.isArray(r.degisen_parcalar) && r.degisen_parcalar.filter((p: any) => p?.parca_adi).length > 0 && (
                                <span className="text-[10px] font-bold text-slate-500">
                                  🔧 {r.degisen_parcalar.filter((p: any) => p?.parca_adi).length} parça
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                        {benimkiler.length > 30 && (
                          <p className="text-[10px] text-slate-400 text-center font-bold pt-2">
                            Son 30 kayıt gösteriliyor (toplam {benimkiler.length})
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
