'use client';

// ============================================================================
//  📊 YÖNETİM KOKPİTİ — Tek ekranda tüm işletme
// ----------------------------------------------------------------------------
//  Veri kaynağı: kokpit_ozet() + oncelik_kuyrugu()
//  Tasarım: hiçbir grafik kütüphanesi yok (saf CSS) → hızlı, hafif, kalıcı
//  İlke: her bölüm ayrı hata korumalı → bir veri gelmezse ekran çökmez
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  LayoutDashboard, Loader2, RefreshCw, TrendingUp, TrendingDown, Minus,
  Users, FileText, AlertTriangle, CheckCircle2, Clock, Wallet, Target,
  ArrowUpRight, Calendar, Package, Flame
} from 'lucide-react';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const kisalt = (n: any) => {
  const v = Number(n || 0);
  if (v >= 1000000) return (v / 1000000).toFixed(1).replace('.', ',') + 'M';
  if (v >= 1000) return Math.round(v / 1000) + 'B';
  return String(Math.round(v));
};
const AYLAR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

export default function KokpitPage() {
  const [veri, setVeri] = useState<any>(null);
  const [kuyruk, setKuyruk] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState('');

  const getir = useCallback(async () => {
    setYukleniyor(true);
    setHata('');
    try {
      const [k, q] = await Promise.all([
        supabase.rpc('kokpit_ozet'),
        supabase.rpc('oncelik_kuyrugu', { p_limit: 8 }),
      ]);
      if (k.error) { setHata(k.error.message); }
      else { setVeri(k.data); }
      setKuyruk(q.data || []);
    } finally { setYukleniyor(false); }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  if (yukleniyor && !veri) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-slate-400 mx-auto" />
          <p className="text-xs font-bold text-slate-400 mt-3">Kokpit hazırlanıyor...</p>
        </div>
      </div>
    );
  }

  if (hata && !veri) {
    return (
      <div className="min-h-screen p-8 bg-slate-50">
        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-6 max-w-2xl mx-auto">
          <p className="font-black text-rose-800 flex items-center gap-2">
            <AlertTriangle size={20} /> Kokpit verisi alınamadı
          </p>
          <p className="text-xs text-rose-600 font-medium mt-2">{hata}</p>
          <p className="text-xs text-rose-500 font-bold mt-3">
            → <code className="bg-white px-1.5 py-0.5 rounded">70-kokpit-veri-katmani.sql</code> çalıştırıldı mı?
          </p>
          <button onClick={getir} className="mt-4 bg-rose-600 text-white px-4 py-2.5 rounded-xl font-black text-xs">
            TEKRAR DENE
          </button>
        </div>
      </div>
    );
  }

  const b  = veri?.bugun || {};
  const a  = veri?.bu_ay || {};
  const ga = veri?.gecen_ay || {};
  const y  = veri?.bu_yil || {};
  const gy = veri?.gecen_yil || {};
  const trend: any[] = Array.isArray(veri?.trend) ? veri.trend : [];
  const bekleyen: any[] = Array.isArray(veri?.bekleyen) ? veri.bekleyen : [];
  const musteriler: any[] = Array.isArray(veri?.en_iyi_musteriler) ? veri.en_iyi_musteriler : [];
  const personel: any[] = Array.isArray(veri?.personel) ? veri.personel : [];

  // Değişim hesapları
  const ayDegisim = Number(ga.ciro) > 0
    ? Math.round(((Number(a.ciro) - Number(ga.ciro)) / Number(ga.ciro)) * 100) : null;
  const yilDegisim = Number(gy.ciro) > 0
    ? Math.round(((Number(y.ciro) - Number(gy.ciro)) / Number(gy.ciro)) * 100) : null;

  const trendMax = Math.max(...trend.map((t) => Number(t.ciro) || 0), 1);
  const enYuksekPersonel = Math.max(...personel.map((p) => Number(p.ciro) || 0), 1);

  const Degisim = ({ deger }: { deger: number | null }) => {
    if (deger === null) return <span className="text-[10px] font-bold text-slate-400 flex items-center gap-0.5"><Minus size={10} /> veri yok</span>;
    if (deger > 0) return <span className="text-[10px] font-black text-emerald-600 flex items-center gap-0.5"><TrendingUp size={11} /> %{deger}</span>;
    if (deger < 0) return <span className="text-[10px] font-black text-rose-600 flex items-center gap-0.5"><TrendingDown size={11} /> %{Math.abs(deger)}</span>;
    return <span className="text-[10px] font-bold text-slate-400 flex items-center gap-0.5"><Minus size={10} /> aynı</span>;
  };

  const aciliyetRenk = (a: number) =>
    a === 1 ? 'bg-rose-500' : a === 2 ? 'bg-orange-500' : a === 3 ? 'bg-amber-500'
    : a === 4 ? 'bg-blue-500' : a === 5 ? 'bg-violet-500' : 'bg-slate-400';

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8">

      {/* ÜST BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-slate-800 flex items-center gap-2.5">
            <LayoutDashboard className="text-blue-600" size={30} /> YÖNETİM KOKPİTİ
          </h1>
          <p className="text-slate-500 text-xs md:text-sm mt-0.5">
            {veri?.tarih} · {veri?.saat} · tüm işletme tek ekranda
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

      {/* ═══════════ KPI SATIRI ═══════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-4 md:p-5 shadow-lg">
          <p className="text-[10px] font-black text-blue-200 uppercase tracking-wider">BUGÜN</p>
          <p className="text-2xl md:text-3xl font-black text-white mt-1 leading-none">{para(b.ciro)} ₺</p>
          <p className="text-[11px] font-bold text-blue-100 mt-2">
            {b.is || 0} iş · {b.rapor || 0} rapor
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-white rounded-3xl p-4 md:p-5 shadow-sm border border-slate-200">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">BU AY</p>
          <p className="text-2xl md:text-3xl font-black text-slate-800 mt-1 leading-none">{para(a.ciro)} ₺</p>
          <div className="flex items-center gap-2 mt-2">
            <Degisim deger={ayDegisim} />
            <span className="text-[10px] font-bold text-slate-400">· {a.is || 0} iş</span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-4 md:p-5 shadow-sm border border-slate-200">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">BU YIL</p>
          <p className="text-2xl md:text-3xl font-black text-slate-800 mt-1 leading-none">{para(y.ciro)} ₺</p>
          <div className="flex items-center gap-2 mt-2">
            <Degisim deger={yilDegisim} />
            <span className="text-[10px] font-bold text-slate-400">· {y.is || 0} iş</span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className={`rounded-3xl p-4 md:p-5 shadow-sm border ${bekleyen.length > 3 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <p className={`text-[10px] font-black uppercase tracking-wider ${bekleyen.length > 3 ? 'text-amber-600' : 'text-emerald-600'}`}>
            BEKLEYEN
          </p>
          <p className={`text-2xl md:text-3xl font-black mt-1 leading-none ${bekleyen.length > 3 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {bekleyen.length}
          </p>
          <p className={`text-[10px] font-bold mt-2 ${bekleyen.length > 3 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {bekleyen.length === 0 ? '✅ Her şey yolunda' : 'başlık takip bekliyor'}
          </p>
        </motion.div>
      </div>

      {/* ═══════════ NAKİT SATIRI ═══════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { e: 'BU AY TAHSİLAT', v: a.tahsilat, i: <Wallet size={16} />, r: 'emerald' },
          { e: 'PERSONEL GİDERİ', v: a.personel_gider, i: <Users size={16} />, r: 'rose' },
          { e: 'BU YIL TAHSİLAT', v: y.tahsilat, i: <Wallet size={16} />, r: 'emerald' },
          { e: 'BUGÜN RANDEVU', v: b.randevu, i: <Calendar size={16} />, r: 'blue', sayi: true },
        ].map((k, idx) => (
          <div key={idx} className="bg-white rounded-2xl p-3.5 border border-slate-200 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              k.r === 'emerald' ? 'bg-emerald-50 text-emerald-600'
              : k.r === 'rose' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
              {k.i}
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider truncate">{k.e}</p>
              <p className="text-base font-black text-slate-700 leading-tight">
                {k.sayi ? (k.v || 0) : `${para(k.v)} ₺`}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════ 12 AYLIK TREND ═══════════ */}
      {trend.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 md:p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <TrendingUp size={15} className="text-blue-600" /> 12 AYLIK CİRO TRENDİ
            </p>
            <p className="text-[10px] font-bold text-slate-400">en yüksek: {para(trendMax)} ₺</p>
          </div>
          <div className="flex items-end gap-1 md:gap-2 h-32">
            {trend.map((t: any, i: number) => {
              const yuk = (Number(t.ciro) / trendMax) * 100;
              const son = i === trend.length - 1;
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group">
                  <span className="text-[8px] font-black text-slate-400 opacity-0 group-hover:opacity-100 transition mb-0.5">
                    {kisalt(t.ciro)}
                  </span>
                  <div
                    className={`w-full rounded-t-lg transition-all ${son ? 'bg-blue-600' : 'bg-slate-200 group-hover:bg-blue-400'}`}
                    style={{ height: `${Math.max(yuk, 2)}%` }}
                    title={`${t.ay}: ${para(t.ciro)} ₺ · ${t.is} iş`}
                  />
                  <span className={`text-[8px] font-bold mt-1 ${son ? 'text-blue-600' : 'text-slate-400'}`}>
                    {AYLAR[Number(String(t.ay).slice(5, 7)) - 1]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════ BEKLEYEN İŞLER ═══════════ */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-5">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3 flex items-center justify-between">
          <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Target size={15} /> BEKLEYEN İŞLER ({bekleyen.length})
          </p>
          <span className="text-[9px] font-bold text-slate-300">asistan motorundan canlı</span>
        </div>
        {bekleyen.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-black text-slate-700">Bekleyen iş yok kanka! 🎉</p>
            <p className="text-[11px] text-slate-400 font-medium mt-1">Her şey yolunda.</p>
          </div>
        ) : (
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {bekleyen.map((x: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div className={`w-1.5 h-full min-h-[36px] rounded-full ${aciliyetRenk(Number(x.aciliyet))}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-black text-slate-700 leading-tight">{x.baslik}</p>
                  {x.detay && <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">{x.detay}</p>}
                </div>
                <span className="text-base font-black text-slate-800 shrink-0">{x.adet}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════ ÖNCELİK KUYRUĞU ═══════════ */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-5">
        <div className="bg-gradient-to-r from-rose-600 to-orange-600 px-4 py-3 flex items-center justify-between">
          <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Flame size={15} /> ÖNCELİK KUYRUĞU
          </p>
          <span className="text-[9px] font-bold text-rose-100">otomatik puanlanmış</span>
        </div>
        {kuyruk.length === 0 ? (
          <p className="p-6 text-center text-xs font-bold text-slate-400">Açık servis talebi yok.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {kuyruk.map((t: any, i: number) => (
              <div key={t.ticket_id} className="flex items-center gap-3 p-3.5 hover:bg-slate-50 transition">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-white text-sm shrink-0 ${
                  Number(t.skor) >= 80 ? 'bg-rose-600' : Number(t.skor) >= 60 ? 'bg-orange-500'
                  : Number(t.skor) >= 40 ? 'bg-amber-500' : 'bg-slate-400'}`}>
                  {Math.round(Number(t.skor))}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-black text-slate-800 truncate">{t.musteri}</p>
                  <p className="text-[10px] text-slate-400 font-medium truncate">{t.konu}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-black text-slate-500">{t.etiket}</p>
                  <p className="text-[9px] font-bold text-slate-400 flex items-center gap-1 justify-end mt-0.5">
                    <Clock size={9} /> {t.gun_bekleme} gün
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════ İKİ SÜTUN ═══════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* EN İYİ MÜŞTERİLER */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Users size={15} className="text-emerald-600" /> EN İYİ MÜŞTERİLER
            </p>
            <span className="text-[9px] font-bold text-slate-400">son 12 ay</span>
          </div>
          {musteriler.length === 0 ? (
            <p className="p-6 text-center text-xs font-bold text-slate-400">Veri yok.</p>
          ) : (
            <div className="p-3 space-y-1.5">
              {musteriler.map((m: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-50 transition">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                    i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600'
                    : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black text-slate-700 truncate">{m.ad}</p>
                    <p className="text-[9px] font-bold text-slate-400">{m.is} iş · son {m.son}</p>
                  </div>
                  <p className="text-sm font-black text-emerald-700 shrink-0">{para(m.ciro)} ₺</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PERSONEL PERFORMANSI */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Users size={15} className="text-blue-600" /> PERSONEL PERFORMANSI
            </p>
            <span className="text-[9px] font-bold text-slate-400">bu ay</span>
          </div>
          {personel.length === 0 ? (
            <p className="p-6 text-center text-xs font-bold text-slate-400">Bu ay iş kaydı yok.</p>
          ) : (
            <div className="p-3 space-y-2">
              {personel.map((p: any, i: number) => (
                <div key={i} className="p-2.5 rounded-2xl hover:bg-slate-50 transition">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[12px] font-black text-slate-700 truncate">{p.ad}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      {Number(p.puan) > 0 && (
                        <span className="text-[10px] font-black text-amber-600">★ {p.puan}</span>
                      )}
                      <span className="text-[11px] font-black text-slate-600">{p.is} iş</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${i === 0 ? 'bg-blue-600' : 'bg-blue-300'}`}
                      style={{ width: `${(Number(p.ciro) / enYuksekPersonel) * 100}%` }} />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px] font-bold text-slate-400">{p.saat} sa ort.</span>
                    <span className="text-[10px] font-black text-slate-600">{para(p.ciro)} ₺</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ALT NOT */}
      <p className="text-[10px] text-slate-400 font-medium text-center mt-6">
        Veriler canlı olarak <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200">kokpit_ozet()</code> fonksiyonundan gelir ·
        Telegram asistanı bekleyen işleri otomatik hatırlatır
      </p>
    </div>
  );
}
