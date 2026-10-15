'use client';

// ============================================================================
//  🏆 PERSONEL PERFORMANS MERKEZİ
// ----------------------------------------------------------------------------
//  Veri: gunluk_skor_tablosu() · personel_siralama() · personel_yetkinlik_matrisi()
//        personel_karnesi() · yetkinlik_ayarla()
//  İlke: her bölüm ayrı, biri gelmezse ekran çökmez
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Trophy, Loader2, RefreshCw, ArrowLeft, AlertTriangle, Target,
  Star, Clock, CheckCircle2, X, TrendingUp, Award, GraduationCap,
  Zap, FileText, Shield, Calendar
} from 'lucide-react';

const AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const kisa = (n: any) => {
  const v = Number(n || 0);
  if (v >= 1000000) return (v / 1000000).toFixed(1).replace('.', ',') + 'M';
  if (v >= 1000) return Math.round(v / 1000) + 'B';
  return String(Math.round(v));
};

const YETKINLIKLER = [
  { k: 'vincs', a: 'Vinç', i: '🏗️' },
  { k: 'asansor', a: 'Asansör', i: '🛗' },
  { k: 'hidrolik', a: 'Hidrolik', i: '💧' },
  { k: 'elektrik', a: 'Elektrik', i: '⚡' },
  { k: 'montaj', a: 'Montaj', i: '🔧' },
  { k: 'isg', a: 'İSG', i: '🦺' },
];

export default function PersonelPerformansPage() {
  const [skor, setSkor] = useState<any>(null);
  const [siralama, setSiralama] = useState<any[]>([]);
  const [matris, setMatris] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState('');
  const [ay, setAy] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [secili, setSecili] = useState<any>(null);
  const [karne, setKarne] = useState<any>(null);
  const [karneYuk, setKarneYuk] = useState(false);
  const [mesaj, setMesaj] = useState('');

  const getir = useCallback(async () => {
    setYukleniyor(true);
    setHata('');
    try {
      const [s, l, m] = await Promise.all([
        supabase.rpc('gunluk_skor_tablosu'),
        supabase.rpc('personel_siralama', { p_ay: ay }),
        supabase.rpc('personel_yetkinlik_matrisi'),
      ]);
      if (s.error) setHata(s.error.message);
      setSkor(s.data);
      setSiralama(l.data || []);
      setMatris(m.data || []);
    } finally { setYukleniyor(false); }
  }, [ay]);

  useEffect(() => { getir(); }, [getir]);

  const karneAc = async (ad: string) => {
    setSecili({ ad });
    setKarne(null);
    setKarneYuk(true);
    try {
      const { data } = await supabase.rpc('personel_karnesi', { p_personel: ad, p_ay: ay });
      setKarne(data);
    } finally { setKarneYuk(false); }
  };

  const seviyeAyarla = async (personel: string, yetkinlik: string, seviye: number) => {
    const { data, error } = await supabase.rpc('yetkinlik_ayarla', {
      p_personel: personel, p_yetkinlik: yetkinlik, p_seviye: seviye,
    });
    if (error || !(data as any)?.ok) {
      setMesaj(error?.message || (data as any)?.mesaj || 'Kaydedilemedi.');
      return;
    }
    setMesaj('✅ ' + (data as any).mesaj);
    await getir();
    setTimeout(() => setMesaj(''), 2500);
  };

  const [yil, ayNo] = ay.split('-').map(Number);
  const gunlukPersonel: any[] = Array.isArray(skor?.personel) ? skor.personel : [];
  const enYuksek = Math.max(...gunlukPersonel.map((p) => Number(p.ciro) || 0), 1);

  const yildiz = (s: number) => '●'.repeat(Math.max(1, Math.min(5, s))) + '○'.repeat(Math.max(0, 5 - Math.max(1, Math.min(5, s))));

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8">

      {/* ÜST BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-slate-800 flex items-center gap-2.5">
            <Trophy className="text-amber-500" size={30} /> PERSONEL PERFORMANS
          </h1>
          <p className="text-slate-500 text-xs md:text-sm mt-0.5">
            Performans karnesi · yetkinlik matrisi · günlük skor tablosu
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <select value={ay} onChange={(e) => setAy(e.target.value)}
            className="bg-white border border-slate-200 px-4 py-3 rounded-2xl font-black text-xs outline-none">
            {Array.from({ length: 12 }, (_, i) => {
              const d = new Date(); d.setMonth(d.getMonth() - i);
              const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              return <option key={v} value={v}>{AYLAR[d.getMonth()]} {d.getFullYear()}</option>;
            })}
          </select>
          <button onClick={getir} disabled={yukleniyor}
            className="bg-white border border-slate-200 px-4 py-3 rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-slate-100">
            <RefreshCw size={16} className={yukleniyor ? 'animate-spin' : ''} />
          </button>
          <Link href="/admin" className="bg-slate-900 text-white px-4 py-3 rounded-2xl font-black text-xs flex items-center gap-2">PANEL</Link>
        </div>
      </div>

      {hata && (
        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 mb-5">
          <p className="font-black text-rose-800 flex items-center gap-2"><AlertTriangle size={18} /> Veri alınamadı</p>
          <p className="text-xs text-rose-600 font-medium mt-2">{hata}</p>
          <p className="text-xs text-rose-500 font-bold mt-2">
            → <code className="bg-white px-1.5 py-0.5 rounded">73-personel-karnesi.sql</code> çalıştırıldı mı?
          </p>
        </div>
      )}

      {mesaj && (
        <div className={`p-4 rounded-2xl text-xs font-bold mb-5 border ${
          mesaj.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
        }`}>{mesaj}</div>
      )}

      {/* 🎯 GÜNLÜK SKOR TABLOSU */}
      {skor && (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-5 mb-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap size={13} className="text-amber-400" /> BUGÜNÜN SKOR TABLOSU
              </p>
              <p className="text-[10px] font-bold text-slate-500 mt-0.5">{skor.tarih} · {skor.saat}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-white leading-none">
                {skor.yapilan_is}<span className="text-sm text-slate-400">/{skor.hedef_is}</span>
              </p>
              <p className="text-[10px] font-black text-amber-400">%{skor.is_orani} hedef</p>
            </div>
          </div>

          {/* HEDEF ÇUBUĞU */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase">Günlük Ciro Hedefi</span>
              <span className="text-[11px] font-black text-emerald-400">
                {para(skor.yapilan_ciro)} / {para(skor.hedef_ciro)} ₺
              </span>
            </div>
            <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${
                Number(skor.ciro_orani) >= 80 ? 'bg-emerald-500' : Number(skor.ciro_orani) >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${Math.min(100, Number(skor.ciro_orani))}%` }} />
            </div>
          </div>

          {gunlukPersonel.length === 0 ? (
            <p className="text-center text-xs font-bold text-slate-500 py-4">Bugün henüz iş kaydı yok.</p>
          ) : (
            <div className="space-y-2">
              {gunlukPersonel.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                    i === 0 ? 'bg-amber-400 text-slate-900' : i === 1 ? 'bg-slate-300 text-slate-800'
                    : i === 2 ? 'bg-orange-400 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black text-white truncate">{p.personel}</p>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(Number(p.ciro) / enYuksek) * 100}%` }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[13px] font-black text-emerald-400">{para(p.ciro)} ₺</p>
                    <p className="text-[9px] font-bold text-slate-400">{p.is} iş</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 🏆 AYLIK SIRALAMA */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-5">
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-3 flex items-center justify-between">
          <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Award size={15} /> {AYLAR[ayNo - 1].toUpperCase()} {yil} SIRALAMASI
          </p>
          <span className="text-[10px] font-black text-amber-100">{siralama.length} personel</span>
        </div>
        {siralama.length === 0 ? (
          <p className="p-8 text-center text-xs font-bold text-slate-400">Bu ay iş kaydı yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr className="text-[10px] font-black text-slate-500 uppercase">
                  <th className="text-left px-4 py-2.5 w-16">Sıra</th>
                  <th className="text-left px-3 py-2.5">Personel</th>
                  <th className="text-right px-3 py-2.5">İş</th>
                  <th className="text-right px-3 py-2.5">Ciro</th>
                  <th className="text-right px-3 py-2.5">Ort. Süre</th>
                  <th className="text-right px-3 py-2.5">Puan</th>
                  <th className="text-right px-4 py-2.5">Performans</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {siralama.map((s: any) => (
                  <tr key={s.personel} className="hover:bg-slate-50 cursor-pointer" onClick={() => karneAc(s.personel)}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-xl font-black text-sm ${
                        s.sira === 1 ? 'bg-amber-100 text-amber-700'
                        : s.sira === 2 ? 'bg-slate-200 text-slate-700'
                        : s.sira === 3 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-500'}`}>
                        {s.madalya || s.sira}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-black text-slate-700">{s.personel}</td>
                    <td className="px-3 py-3 text-right font-black text-slate-600">{s.is_sayisi}</td>
                    <td className="px-3 py-3 text-right font-black text-emerald-700">{para(s.ciro)} ₺</td>
                    <td className="px-3 py-3 text-right font-bold text-slate-500">{s.ortalama_sure} sa</td>
                    <td className="px-3 py-3 text-right">
                      {Number(s.musteri_puani) > 0 ? (
                        <span className="font-black text-amber-600">★ {s.musteri_puani}</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${
                            Number(s.performans) >= 85 ? 'bg-emerald-500'
                            : Number(s.performans) >= 70 ? 'bg-blue-500'
                            : Number(s.performans) >= 55 ? 'bg-amber-500' : 'bg-rose-400'}`}
                            style={{ width: `${Math.min(100, Number(s.performans))}%` }} />
                        </div>
                        <span className="font-black text-slate-700 w-10 text-right">{Math.round(Number(s.performans))}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 🎓 YETKİNLİK MATRİSİ */}
      {matris.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-violet-700 px-4 py-3 flex items-center justify-between">
            <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
              <GraduationCap size={15} /> YETKİNLİK MATRİSİ
            </p>
            <span className="text-[10px] font-bold text-indigo-200">geçmişten öğrenildi · tıkla düzenle</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase sticky left-0 bg-slate-50">Personel</th>
                  {YETKINLIKLER.map((y) => (
                    <th key={y.k} className="text-center px-3 py-3 text-[10px] font-black text-slate-500 uppercase">
                      <span className="block text-base">{y.i}</span>{y.a}
                    </th>
                  ))}
                  <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase">İş</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {matris.map((m: any) => (
                  <tr key={m.personel} className="hover:bg-slate-50">
                    <td className="px-4 py-3 sticky left-0 bg-white">
                      <p className="font-black text-slate-700">{m.personel}</p>
                      <p className="text-[9px] font-bold text-slate-400">{m.kaynak}</p>
                    </td>
                    {YETKINLIKLER.map((y) => {
                      const sv = Number(m[y.k] || 1);
                      return (
                        <td key={y.k} className="px-3 py-3 text-center">
                          <button onClick={() => seviyeAyarla(m.personel, y.k, sv >= 5 ? 1 : sv + 1)}
                            title={`Seviye ${sv}/5 — tıkla artır`}
                            className={`text-sm font-black tracking-tighter transition hover:scale-110 ${
                              sv >= 4 ? 'text-emerald-600' : sv === 3 ? 'text-blue-600'
                              : sv === 2 ? 'text-amber-500' : 'text-slate-300'}`}>
                            {yildiz(sv)}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right font-black text-slate-600">{m.toplam_is}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400 font-medium px-4 py-3 bg-slate-50 border-t border-slate-100">
            💡 <strong>● sayısı seviye</strong> (1-5) · Yıldıza tıkla → seviye artar · Elle işaret otomatik öğrenmeyi ezer
          </p>
        </div>
      )}

      {/* ═══ KARNE MODALI ═══ */}
      <AnimatePresence>
        {secili && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4"
            onClick={() => setSecili(null)}>
            <motion.div initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full md:max-w-2xl rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">

              <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
                <div>
                  <h2 className="font-black text-slate-800">{secili.ad}</h2>
                  <p className="text-[11px] font-bold text-slate-400">{AYLAR[ayNo - 1]} {yil} karnesi</p>
                </div>
                <button onClick={() => setSecili(null)} className="p-2 hover:bg-slate-100 rounded-xl"><X size={20} className="text-slate-400" /></button>
              </div>

              {karneYuk ? (
                <div className="py-16 text-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" /></div>
              ) : karne ? (
                <div className="p-5 space-y-4">

                  {/* PERFORMANS SKORU */}
                  <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-5 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">PERFORMANS PUANI</p>
                    <p className="text-5xl font-black text-white mt-2 leading-none">{Math.round(Number(karne.performans))}</p>
                    <p className="text-sm font-black text-amber-400 mt-2">{karne.performans_etiket}</p>
                    {Number(karne.siralama) > 0 && (
                      <p className="text-[11px] font-bold text-slate-400 mt-2">
                        {karne.toplam_personel} personel içinde <b className="text-white">{karne.siralama}.</b>
                      </p>
                    )}
                  </div>

                  {/* METRİKLER */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { e: 'İŞ SAYISI', v: karne.is_sayisi, i: <Target size={15}/>, r: 'blue' },
                      { e: 'TOPLAM CİRO', v: `${para(karne.ciro)} ₺`, i: <TrendingUp size={15}/>, r: 'emerald' },
                      { e: 'ORT. SÜRE', v: `${karne.ortalama_sure} sa`, i: <Clock size={15}/>, r: 'violet' },
                      { e: 'MÜŞTERİ PUANI', v: karne.musteri_puani ? `★ ${karne.musteri_puani}` : '—', i: <Star size={15}/>, r: 'amber' },
                      { e: 'RAPOR DÜZENİ', v: karne.rapor_orani !== null ? `%${karne.rapor_orani}` : '—', i: <FileText size={15}/>, r: 'cyan' },
                      { e: 'İSG UYUMU', v: karne.isg_uyum !== null ? `%${karne.isg_uyum}` : '—', i: <Shield size={15}/>, r: 'rose' },
                      { e: 'MESAİ GÜNÜ', v: karne.mesai_gun, i: <Calendar size={15}/>, r: 'slate' },
                      { e: 'İZİN GÜNÜ', v: karne.izin_gun, i: <Calendar size={15}/>, r: 'slate' },
                    ].map((k, i) => {
                      const renk = k.r === 'emerald' ? 'bg-emerald-50 text-emerald-600'
                        : k.r === 'blue' ? 'bg-blue-50 text-blue-600'
                        : k.r === 'violet' ? 'bg-violet-50 text-violet-600'
                        : k.r === 'amber' ? 'bg-amber-50 text-amber-600'
                        : k.r === 'cyan' ? 'bg-cyan-50 text-cyan-600'
                        : k.r === 'rose' ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-600';
                      return (
                        <div key={i} className="bg-white border border-slate-200 rounded-2xl p-3 flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${renk}`}>{k.i}</div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-black text-slate-400 uppercase truncate">{k.e}</p>
                            <p className="text-sm font-black text-slate-700 leading-tight">{k.v}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 6 AYLIK TREND */}
                  {Array.isArray(karne.trend) && karne.trend.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-3xl p-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-3">6 AYLIK TREND</p>
                      <div className="flex items-end gap-1.5 h-24">
                        {karne.trend.map((t: any, i: number) => {
                          const mx = Math.max(...karne.trend.map((x: any) => Number(x.ciro) || 0), 1);
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                              <span className="text-[8px] font-black text-slate-400 mb-1">{kisa(t.ciro)}</span>
                              <div className={`w-full rounded-t-lg ${i === karne.trend.length - 1 ? 'bg-blue-600' : 'bg-slate-200'}`}
                                style={{ height: `${Math.max((Number(t.ciro) / mx) * 100, 3)}%` }} />
                              <span className="text-[8px] font-bold text-slate-400 mt-1">{AYLAR[Number(String(t.ay).slice(5,7)) - 1].slice(0,3)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* SON İŞLER */}
                  {Array.isArray(karne.son_isler) && karne.son_isler.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
                      <p className="text-[10px] font-black text-slate-400 uppercase px-4 py-3 bg-slate-50 border-b border-slate-100">
                        SON İŞLER
                      </p>
                      <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
                        {karne.son_isler.map((s: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                            <span className="text-[10px] font-black text-slate-400 shrink-0 w-20">{s.tarih}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-black text-slate-700 truncate">{s.musteri}</p>
                              <p className="text-[9px] font-bold text-slate-400">{s.tur} · {s.saat} sa</p>
                            </div>
                            {Number(s.ucret) > 0 && (
                              <span className="text-[11px] font-black text-emerald-700 shrink-0">{para(s.ucret)} ₺</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
