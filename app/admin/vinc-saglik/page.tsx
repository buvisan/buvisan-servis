'use client';

// ============================================================================
//  🏗️ VİNÇ SAĞLIK MERKEZİ — Sağlık skoru + arıza kehaneti + kurumsal hafıza
// ----------------------------------------------------------------------------
//  Veri: vinc_saglik_listesi() · vinc_saglik_skoru() · ariza_kehanet()
//        kurumsal_hafiza() · parca_omur_analizi() · model_analizi()
//  İlke: her bölüm ayrı yüklenir → biri gelmezse ekran çökmez
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Activity, Loader2, RefreshCw, ArrowLeft, Search, X, AlertTriangle,
  TrendingUp, TrendingDown, Wrench, Clock, Star, Brain, Package,
  Target, ChevronRight, Flame, CheckCircle2, Info
} from 'lucide-react';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

const renkSinif = (r: string) =>
  r === 'emerald' ? { bg: 'bg-emerald-500', soft: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' }
  : r === 'amber' ? { bg: 'bg-amber-500', soft: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' }
  : r === 'orange' ? { bg: 'bg-orange-500', soft: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' }
  : { bg: 'bg-rose-500', soft: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };

export default function VincSaglikPage() {
  const [liste, setListe] = useState<any[]>([]);
  const [siralama, setSiralama] = useState('riskli');
  const [arama, setArama] = useState('');
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState('');
  const [secili, setSecili] = useState<any>(null);
  const [detay, setDetay] = useState<any>(null);
  const [kehanet, setKehanet] = useState<any>(null);
  const [hafiza, setHafiza] = useState<any>(null);
  const [detayYukleniyor, setDetayYukleniyor] = useState(false);
  const [parcaOmur, setParcaOmur] = useState<any[]>([]);

  const getir = useCallback(async () => {
    setYukleniyor(true);
    setHata('');
    try {
      const { data, error } = await supabase.rpc('vinc_saglik_listesi', {
        p_limit: 300, p_siralama: siralama,
      });
      if (error) { setHata(error.message); setListe([]); return; }
      setListe(data || []);
    } finally { setYukleniyor(false); }
  }, [siralama]);

  useEffect(() => { getir(); }, [getir]);

  useEffect(() => {
    supabase.rpc('parca_omur_analizi', { p_limit: 12 })
      .then(({ data }) => setParcaOmur(data || []));
  }, []);

  const detayAc = async (c: any) => {
    setSecili(c);
    setDetay(null); setKehanet(null); setHafiza(null);
    setDetayYukleniyor(true);
    try {
      const [d, k, h] = await Promise.all([
        supabase.rpc('vinc_saglik_skoru', { p_crane_id: c.crane_id }),
        supabase.rpc('ariza_kehanet', { p_crane_id: c.crane_id }),
        supabase.rpc('kurumsal_hafiza', { p_musteri: c.musteri }),
      ]);
      setDetay(d.data); setKehanet(k.data); setHafiza(h.data);
    } finally { setDetayYukleniyor(false); }
  };

  const filtreli = liste.filter((x) =>
    !arama.trim() || String(x.musteri || '').toLocaleLowerCase('tr-TR').includes(arama.toLocaleLowerCase('tr-TR'))
  );

  // Özet dağılım
  const dagilim = {
    iyi: liste.filter((x) => Number(x.skor) >= 80).length,
    orta: liste.filter((x) => Number(x.skor) >= 60 && Number(x.skor) < 80).length,
    zayif: liste.filter((x) => Number(x.skor) >= 40 && Number(x.skor) < 60).length,
    kotu: liste.filter((x) => Number(x.skor) < 40).length,
  };

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8">

      {/* ÜST BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-slate-800 flex items-center gap-2.5">
            <Activity className="text-emerald-600" size={30} /> VİNÇ SAĞLIK MERKEZİ
          </h1>
          <p className="text-slate-500 text-xs md:text-sm mt-0.5">
            Sağlık skoru · arıza tahmini · kurumsal hafıza
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button onClick={getir} disabled={yukleniyor}
            className="flex-1 md:flex-none bg-white border border-slate-200 px-4 py-3 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-slate-100 transition">
            <RefreshCw size={16} className={yukleniyor ? 'animate-spin' : ''} /> YENİLE
          </button>
          <Link href="/admin"
            className="flex-1 md:flex-none bg-slate-900 text-white px-4 py-3 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-slate-800 transition">
            PANEL
          </Link>
        </div>
      </div>

      {hata && (
        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 mb-5">
          <p className="font-black text-rose-800 flex items-center gap-2"><AlertTriangle size={18} /> Veri alınamadı</p>
          <p className="text-xs text-rose-600 font-medium mt-2">{hata}</p>
          <p className="text-xs text-rose-500 font-bold mt-2">
            → <code className="bg-white px-1.5 py-0.5 rounded">71-vinc-saglik-ve-kehanet.sql</code> çalıştırıldı mı?
          </p>
        </div>
      )}

      {/* SAĞLIK DAĞILIMI */}
      {liste.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            { e: '🟢 İYİ', v: dagilim.iyi, r: 'emerald', not: '80+ puan' },
            { e: '🟡 ORTA', v: dagilim.orta, r: 'amber', not: '60-79' },
            { e: '🟠 ZAYIF', v: dagilim.zayif, r: 'orange', not: '40-59' },
            { e: '🔴 KÖTÜ', v: dagilim.kotu, r: 'rose', not: '40 altı' },
          ].map((k, i) => {
            const rs = renkSinif(k.r);
            return (
              <div key={i} className={`${rs.soft} ${rs.border} border rounded-3xl p-4`}>
                <p className={`text-[10px] font-black uppercase tracking-wider ${rs.text}`}>{k.e}</p>
                <p className={`text-2xl md:text-3xl font-black mt-1 leading-none ${rs.text}`}>{k.v}</p>
                <p className={`text-[10px] font-bold mt-1 ${rs.text} opacity-70`}>{k.not} · vinç</p>
              </div>
            );
          })}
        </div>
      )}

      {/* ARAMA + SIRALAMA */}
      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input type="text" value={arama} onChange={(e) => setArama(e.target.value)}
            placeholder="Müşteri ara..."
            className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-emerald-400" />
        </div>
        <div className="flex gap-2">
          {[
            { k: 'riskli', a: '🔴 En Riskli' },
            { k: 'iyi', a: '🟢 En İyi' },
            { k: 'musteri', a: '🔤 İsim' },
          ].map((s) => (
            <button key={s.k} onClick={() => setSiralama(s.k)}
              className={`px-3.5 py-3 rounded-2xl text-[11px] font-black border transition whitespace-nowrap ${
                siralama === s.k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
              }`}>{s.a}</button>
          ))}
        </div>
      </div>

      {/* LİSTE */}
      {yukleniyor ? (
        <div className="py-20 text-center"><Loader2 className="w-9 h-9 animate-spin text-slate-400 mx-auto" /></div>
      ) : filtreli.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
          <CheckCircle2 className="w-11 h-11 text-slate-300 mx-auto mb-3" />
          <p className="font-black text-slate-600">Vinç bulunamadı</p>
          <p className="text-xs text-slate-400 font-medium mt-1">
            {hata ? 'SQL 71 çalıştırılmalı.' : 'Arama kriterine uyan kayıt yok.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtreli.slice(0, 60).map((c: any, i: number) => {
            const rs = renkSinif(c.renk);
            return (
              <motion.button key={c.crane_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.015, 0.3) }}
                onClick={() => detayAc(c)}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 text-left hover:border-emerald-300 hover:shadow-md transition group">
                <div className="flex items-start gap-3">
                  {/* SKOR HALKASI */}
                  <div className="relative w-14 h-14 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3.2" />
                      <circle cx="18" cy="18" r="15.9" fill="none"
                        className={rs.text.replace('text-', 'stroke-')}
                        strokeWidth="3.2" strokeLinecap="round"
                        strokeDasharray={`${(Number(c.skor) / 100) * 99.9} 99.9`} />
                    </svg>
                    <span className={`absolute inset-0 flex items-center justify-center font-black text-sm ${rs.text}`}>
                      {Math.round(Number(c.skor))}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-black text-slate-800 truncate">{c.musteri}</p>
                    <p className="text-[10px] font-bold text-slate-400">
                      {c.vinc} · {c.makine_tipi}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${rs.soft} ${rs.text} border ${rs.border}`}>
                        {c.seviye}
                      </span>
                      {Number(c.ariza_sayisi) > 0 && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200">
                          {c.ariza_sayisi} arıza
                        </span>
                      )}
                      {Number(c.gecikme_gun) > 0 && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                          ⏰ {c.gecikme_gun}g gecikme
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-emerald-500 transition shrink-0 mt-1" />
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* PARÇA ÖMÜR ANALİZİ */}
      {parcaOmur.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mt-6">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Package size={15} className="text-violet-600" /> PARÇA ÖMÜR ANALİZİ
            </p>
            <span className="text-[9px] font-bold text-slate-400">geçmiş veriden öğrenildi</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr className="text-[10px] font-black text-slate-500 uppercase">
                  <th className="text-left px-4 py-2.5">Parça</th>
                  <th className="text-right px-4 py-2.5">Kaç kez</th>
                  <th className="text-right px-4 py-2.5">Kaç vinç</th>
                  <th className="text-right px-4 py-2.5">Ort. Ömür</th>
                  <th className="text-right px-4 py-2.5">Son kullanım</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {parcaOmur.map((p: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-bold text-slate-700 truncate max-w-[280px]">{p.parca}</td>
                    <td className="px-4 py-2.5 text-right font-black text-slate-600">{p.kac_kez}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-500">{p.kac_vinç}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-black text-violet-700 bg-violet-50 px-2 py-0.5 rounded-lg border border-violet-200">
                        {p.ortalama_ay} ay
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-400">{p.son_kullanim}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400 font-medium px-4 py-3 bg-slate-50 border-t border-slate-100">
            💡 Bu parçalar geçmişte düzenli aralıklarla değişmiş → <strong>önleyici bakım planlamasında kullan</strong>
          </p>
        </div>
      )}

      {/* ═══════════ DETAY MODALI ═══════════ */}
      <AnimatePresence>
        {secili && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4"
            onClick={() => setSecili(null)}>
            <motion.div initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full md:max-w-3xl rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">

              <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
                <div className="min-w-0">
                  <h2 className="font-black text-slate-800 truncate">{secili.musteri}</h2>
                  <p className="text-[11px] font-bold text-slate-400">{secili.vinc} · {secili.makine_tipi}</p>
                </div>
                <button onClick={() => setSecili(null)} className="p-2 hover:bg-slate-100 rounded-xl transition shrink-0">
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              {detayYukleniyor ? (
                <div className="py-16 text-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" /></div>
              ) : (
                <div className="p-5 space-y-4">

                  {/* SAĞLIK SKORU */}
                  {detay && (
                    <div className={`rounded-3xl border-2 ${renkSinif(detay.renk).border} ${renkSinif(detay.renk).soft} p-4`}>
                      <div className="flex items-center gap-4">
                        <div className="relative w-20 h-20 shrink-0">
                          <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#ffffff" strokeWidth="3" />
                            <circle cx="18" cy="18" r="15.9" fill="none"
                              className={renkSinif(detay.renk).text.replace('text-', 'stroke-')}
                              strokeWidth="3" strokeLinecap="round"
                              strokeDasharray={`${(Number(detay.skor) / 100) * 99.9} 99.9`} />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={`font-black text-xl ${renkSinif(detay.renk).text}`}>{Math.round(Number(detay.skor))}</span>
                            <span className={`text-[8px] font-black ${renkSinif(detay.renk).text} opacity-70`}>/100</span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-black text-lg ${renkSinif(detay.renk).text}`}>{detay.seviye}</p>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[10px] font-bold">
                            <span className="text-slate-500">Bakım: <b className="text-slate-700">{detay.bakim_puan}/40</b></span>
                            <span className="text-slate-500">Arıza: <b className="text-slate-700">{detay.ariza_puan}/25</b></span>
                            <span className="text-slate-500">Tazelik: <b className="text-slate-700">{detay.tazelik_puan}/20</b></span>
                            <span className="text-slate-500">Memnuniyet: <b className="text-slate-700">{detay.memnuniyet_puan}/15</b></span>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <div className="bg-white/60 rounded-xl p-2 text-center">
                          <p className="text-[9px] font-black text-slate-400 uppercase">Toplam Servis</p>
                          <p className="text-base font-black text-slate-700">{detay.toplam_servis}</p>
                        </div>
                        <div className="bg-white/60 rounded-xl p-2 text-center">
                          <p className="text-[9px] font-black text-slate-400 uppercase">Arıza</p>
                          <p className="text-base font-black text-rose-600">{detay.ariza_sayisi}</p>
                        </div>
                        <div className="bg-white/60 rounded-xl p-2 text-center">
                          <p className="text-[9px] font-black text-slate-400 uppercase">Son Arıza</p>
                          <p className="text-[11px] font-black text-slate-700">{detay.son_ariza || '—'}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* KEHANET */}
                  {kehanet && (
                    <div className="rounded-3xl border border-slate-200 overflow-hidden">
                      <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-4 py-2.5 flex items-center justify-between">
                        <p className="text-[11px] font-black text-white uppercase tracking-wider flex items-center gap-2">
                          <Brain size={14} /> ARIZA KEHANETİ
                        </p>
                        <span className="text-[10px] font-black text-violet-100">{kehanet.risk_etiket}</span>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center gap-4 mb-3">
                          <div className="flex-1">
                            <div className="flex items-end justify-between mb-1">
                              <span className="text-[10px] font-black text-slate-400 uppercase">Risk</span>
                              <span className="text-2xl font-black text-violet-700 leading-none">%{kehanet.risk}</span>
                            </div>
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${
                                Number(kehanet.risk) >= 70 ? 'bg-rose-500'
                                : Number(kehanet.risk) >= 50 ? 'bg-orange-500'
                                : Number(kehanet.risk) >= 30 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${Number(kehanet.risk)}%` }} />
                            </div>
                          </div>
                        </div>
                        <p className="text-xs font-bold text-slate-600 bg-slate-50 rounded-2xl p-3 border border-slate-100">
                          {kehanet.oneri}
                        </p>
                        {Array.isArray(kehanet.riskli_parcalar) && kehanet.riskli_parcalar.length > 0 && (
                          <div className="mt-3">
                            <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5">Sık kullanılan parçalar</p>
                            <div className="flex flex-wrap gap-1.5">
                              {kehanet.riskli_parcalar.map((p: any, i: number) => (
                                <span key={i} className="text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200 rounded-lg px-2 py-1">
                                  {p.parca} <b>×{p.adet}</b>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* KURUMSAL HAFIZA */}
                  {hafiza && (
                    <div className="rounded-3xl border border-slate-200 overflow-hidden">
                      <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-4 py-2.5 flex items-center justify-between">
                        <p className="text-[11px] font-black text-white uppercase tracking-wider flex items-center gap-2">
                          <Brain size={14} /> KURUMSAL HAFIZA
                        </p>
                        <span className="text-[10px] font-bold text-slate-300">
                          {hafiza.toplam_is} iş · {para(hafiza.toplam_ciro)} ₺
                        </span>
                      </div>
                      <div className="p-4 space-y-3">
                        {Array.isArray(hafiza.tekrarlar) && hafiza.tekrarlar.length > 0 && (
                          <div>
                            <p className="text-[10px] font-black text-rose-600 uppercase mb-1.5 flex items-center gap-1">
                              <Flame size={11} /> TEKRARLAYAN SORUNLAR
                            </p>
                            <div className="space-y-1.5">
                              {hafiza.tekrarlar.map((t: any, i: number) => (
                                <div key={i} className="bg-rose-50 border border-rose-200 rounded-2xl p-2.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black text-rose-800 truncate">{t.parca}</span>
                                    <span className="text-[10px] font-black text-rose-600 shrink-0 ml-2">×{t.adet}</span>
                                  </div>
                                  <p className="text-[9px] font-bold text-rose-500 mt-1">{t.uyari}</p>
                                  <p className="text-[9px] font-medium text-rose-400 mt-0.5">
                                    {t.ilk} → {t.son}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {Array.isArray(hafiza.gecmis) && hafiza.gecmis.length > 0 && (
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5">SON SERVİSLER</p>
                            <div className="space-y-1 max-h-52 overflow-y-auto">
                              {hafiza.gecmis.map((g: any, i: number) => (
                                <div key={i} className="flex items-start gap-2.5 bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                                  <span className="text-[10px] font-black text-slate-400 shrink-0 w-20">{g.tarih}</span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-black text-slate-600">{g.tur}</p>
                                    <p className="text-[10px] text-slate-400 font-medium truncate">{g.aciklama}</p>
                                  </div>
                                  {Number(g.ucret) > 0 && (
                                    <span className="text-[10px] font-black text-emerald-700 shrink-0">{para(g.ucret)} ₺</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {Array.isArray(hafiza.benzer_musteriler) && hafiza.benzer_musteriler.length > 0 && (
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                              <Info size={11} /> AYNI PARÇAYI KULLANAN DİĞER MÜŞTERİLER
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {hafiza.benzer_musteriler.map((m: any, i: number) => (
                                <span key={i} className="text-[10px] font-bold bg-slate-100 text-slate-600 rounded-lg px-2 py-1">
                                  {m.musteri}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
