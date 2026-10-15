'use client';

// ============================================================================
//  🏆 BÜYÜME MERKEZİ — Kayıp riski + canlı kâr + sezon tahmini
// ----------------------------------------------------------------------------
//  Veri: musteri_kayip_riski() · canli_kar() · sezon_tahmini() · musteri_yasam()
//  İlke: her bölüm bağımsız yüklenir, biri hata verse diğerleri çalışır
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  TrendingUp, Loader2, RefreshCw, ArrowLeft, AlertTriangle, Users,
  Phone, Calculator, Package, Plus, X, Target, TrendingDown, Minus,
  Wallet, Sparkles, CheckCircle2, Clock
} from 'lucide-react';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

const RISK_RENK = (r: number) =>
  r >= 70 ? { bg: 'bg-rose-50', br: 'border-rose-200', tx: 'text-rose-700', bar: 'bg-rose-500' }
  : r >= 45 ? { bg: 'bg-amber-50', br: 'border-amber-200', tx: 'text-amber-700', bar: 'bg-amber-500' }
  : { bg: 'bg-emerald-50', br: 'border-emerald-200', tx: 'text-emerald-700', bar: 'bg-emerald-500' };

export default function BuyumePage() {
  const [sekme, setSekme] = useState<'risk' | 'kar' | 'sezon'>('risk');
  const [riskler, setRiskler] = useState<any[]>([]);
  const [yasam, setYasam] = useState<any>(null);
  const [sezon, setSezon] = useState<any>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState('');
  const [filtre, setFiltre] = useState('hepsi');

  // Kâr hesaplayıcı
  const [ucret, setUcret] = useState('');
  const [sure, setSure] = useState('');
  const [parcalar, setParcalar] = useState<{ ad: string; adet: string; birim?: number }[]>([{ ad: '', adet: '1' }]);
  // 🔍 Malzeme otomatik tamamlama
  const [oneriler, setOneriler] = useState<any[]>([]);
  const [aktifIdx, setAktifIdx] = useState<number | null>(null);
  const aramaZaman = useRef<any>(null);

  // Yazarken depodan ara (300 ms bekleme)
  const malzemeAra = useCallback((metin: string, i: number) => {
    if (aramaZaman.current) clearTimeout(aramaZaman.current);
    if (!metin || metin.trim().length < 2) { setOneriler([]); setAktifIdx(null); return; }
    aramaZaman.current = setTimeout(async () => {
      try {
        const { data } = await supabase.rpc("malzeme_ara", { p_arama: metin, p_limit: 8 });
        setOneriler(data || []);
        setAktifIdx(i);
      } catch { setOneriler([]); }
    }, 300);
  }, []);

  // Öneriyi seç
  const oneriSec = (i: number, m: any) => {
    const y = [...parcalar];
    y[i].ad = m.ad;
    y[i].birim = Number(m.alis_fiyati) || 0;
    setParcalar(y);
    setOneriler([]);
    setAktifIdx(null);
  };
  const [kar, setKar] = useState<any>(null);
  const [karYuk, setKarYuk] = useState(false);

  const getir = useCallback(async () => {
    setYukleniyor(true); setHata('');
    try {
      const [r, y, s] = await Promise.all([
        supabase.rpc('musteri_kayip_riski', { p_limit: 100 }),
        supabase.rpc('musteri_yasam'),
        supabase.rpc('sezon_tahmini'),
      ]);
      if (r.error) setHata(r.error.message);
      setRiskler(r.data || []);
      setYasam(y.data);
      setSezon(s.data);
    } finally { setYukleniyor(false); }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  const karHesapla = async () => {
    if (!ucret) return;
    setKarYuk(true);
    try {
      const liste = parcalar
        .filter((p) => p.ad.trim())
        .map((p) => ({ ad: p.ad.trim(), adet: Number(p.adet) || 1 }));
      const { data, error } = await supabase.rpc('canli_kar', {
        p_ucret: Number(ucret),
        p_malzemeler: liste,
        p_sure_saat: Number(sure) || 0,
        p_saatlik: null,
      });
      if (error) return;
      setKar(data);
    } finally { setKarYuk(false); }
  };

  const filtreli = riskler.filter((r) => {
    if (filtre === 'hepsi') return true;
    if (filtre === 'yuksek') return Number(r.risk) >= 70;
    if (filtre === 'orta') return Number(r.risk) >= 45 && Number(r.risk) < 70;
    if (filtre === 'sessiz') return Number(r.gun_once) > 120 || r.gun_once === null;
    return true;
  });

  const yuksekRisk = riskler.filter((r) => Number(r.risk) >= 70).length;
  const riskCiro = riskler.filter((r) => Number(r.risk) >= 70).reduce((t, r) => t + Number(r.toplam_ciro || 0), 0);
  const sezonaylar: any[] = Array.isArray(sezon?.aylar) ? sezon.aylar : [];
  const sezonMax = Math.max(...sezonaylar.map((a) => Number(a.tahmin) || 0), 1);

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8">

      {/* ÜST BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-slate-800 flex items-center gap-2.5">
            <TrendingUp className="text-teal-600" size={30} /> BÜYÜME MERKEZİ
          </h1>
          <p className="text-slate-500 text-xs md:text-sm mt-0.5">
            Müşteri kayıp riski · canlı kâr sayacı · sezon tahmini
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={getir} disabled={yukleniyor}
            className="bg-white border border-slate-200 px-4 py-3 rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-slate-100">
            <RefreshCw size={15} className={yukleniyor ? 'animate-spin' : ''} /> YENİLE
          </button>
          <Link href="/admin" className="bg-slate-900 text-white px-4 py-3 rounded-2xl font-black text-xs flex items-center gap-2">
            <ArrowLeft size={15} /> PANEL
          </Link>
        </div>
      </div>

      {hata && (
        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 mb-5">
          <p className="font-black text-rose-800 flex items-center gap-2 text-sm"><AlertTriangle size={18} /> Veri alınamadı</p>
          <p className="text-xs text-rose-600 font-medium mt-2">{hata}</p>
          <p className="text-xs text-rose-500 font-bold mt-2">
            → <code className="bg-white px-1.5 py-0.5 rounded">78-kayip-riski-ve-kar.sql</code> çalıştırıldı mı?
          </p>
        </div>
      )}

      {/* MÜŞTERİ YAŞAM DÖNGÜSÜ */}
      {yasam && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          <div className="bg-white rounded-3xl border border-slate-200 p-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">TOPLAM</p>
            <p className="text-2xl font-black text-slate-700 leading-none mt-1">{yasam.toplam}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-1">müşteri</p>
          </div>
          <div className="bg-emerald-50 rounded-3xl border border-emerald-200 p-4">
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">🟢 AKTİF</p>
            <p className="text-2xl font-black text-emerald-700 leading-none mt-1">{yasam.yeni}</p>
            <p className="text-[10px] font-bold text-emerald-500 mt-1">son 30 gün</p>
          </div>
          <div className="bg-blue-50 rounded-3xl border border-blue-200 p-4">
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">🔵 NORMAL</p>
            <p className="text-2xl font-black text-blue-700 leading-none mt-1">{yasam.aktif}</p>
            <p className="text-[10px] font-bold text-blue-500 mt-1">30-90 gün</p>
          </div>
          <div className="bg-amber-50 rounded-3xl border border-amber-200 p-4">
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider">🟠 RİSKLİ</p>
            <p className="text-2xl font-black text-amber-700 leading-none mt-1">{yasam.riskli}</p>
            <p className="text-[10px] font-bold text-amber-500 mt-1">90-180 gün</p>
          </div>
          <div className="bg-rose-50 rounded-3xl border border-rose-200 p-4">
            <p className="text-[10px] font-black text-rose-600 uppercase tracking-wider">🔴 KAYIP</p>
            <p className="text-2xl font-black text-rose-700 leading-none mt-1">{yasam.kayip}</p>
            <p className="text-[10px] font-bold text-rose-500 mt-1">180+ gün</p>
          </div>
        </div>
      )}

      {/* YÜKSEK RİSK UYARISI */}
      {yuksekRisk > 0 && (
        <div className="bg-gradient-to-r from-rose-600 to-orange-600 rounded-3xl p-4 md:p-5 mb-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black text-rose-100 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle size={13} /> KAYIP RİSKİ
            </p>
            <p className="text-lg md:text-xl font-black text-white mt-1 leading-tight">
              {yuksekRisk} müşteri kaybedilmek üzere
              <span className="text-rose-200"> · {para(riskCiro)} ₺ yıllık ciro risk altında</span>
            </p>
          </div>
          <button onClick={() => { setSekme('risk'); setFiltre('yuksek'); }}
            className="bg-white text-rose-700 px-4 py-2.5 rounded-2xl font-black text-xs shrink-0">
            LİSTEYİ GÖR
          </button>
        </div>
      )}

      {/* SEKMELER */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {[
          { k: 'risk', a: `🏆 Kayıp Riski${yuksekRisk ? ` (${yuksekRisk})` : ''}` },
          { k: 'kar', a: '💰 Canlı Kâr Sayacı' },
          { k: 'sezon', a: '📈 Sezon Tahmini' },
        ].map((s) => (
          <button key={s.k} onClick={() => setSekme(s.k as any)}
            className={`px-4 py-3 rounded-2xl text-xs font-black border transition whitespace-nowrap ${
              sekme === s.k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>
            {s.a}
          </button>
        ))}
      </div>

      {/* ═══════════ KAYIP RİSKİ ═══════════ */}
      {sekme === 'risk' && (
        <>
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {[
              { k: 'hepsi', a: 'Hepsi' },
              { k: 'yuksek', a: '🔴 Yüksek Risk' },
              { k: 'orta', a: '🟠 Orta' },
              { k: 'sessiz', a: '🔇 120+ gün sessiz' },
            ].map((f) => (
              <button key={f.k} onClick={() => setFiltre(f.k)}
                className={`px-3.5 py-2.5 rounded-2xl text-[11px] font-black border transition whitespace-nowrap ${
                  filtre === f.k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>
                {f.a}
              </button>
            ))}
          </div>

          {yukleniyor ? (
            <div className="py-20 text-center"><Loader2 className="w-9 h-9 animate-spin text-slate-400 mx-auto" /></div>
          ) : filtreli.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
              <CheckCircle2 className="w-11 h-11 text-emerald-500 mx-auto mb-3" />
              <p className="font-black text-slate-700">Bu filtrede müşteri yok</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtreli.slice(0, 40).map((r: any, i: number) => {
                const rs = RISK_RENK(Number(r.risk));
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    className={`${rs.bg} ${rs.br} border-2 rounded-3xl p-4`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-black text-slate-800 truncate">{r.musteri}</p>
                        <p className="text-[10px] font-bold text-slate-400">
                          {r.vinc_sayisi} vinç · {para(r.toplam_ciro)} ₺
                          {r.sozlesmeli && <span className="ml-1 text-blue-600">🔄 sözleşmeli</span>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xl font-black leading-none ${rs.tx}`}>{r.risk}</p>
                        <p className={`text-[9px] font-black ${rs.tx}`}>{r.risk_etiket}</p>
                      </div>
                    </div>

                    <div className="h-1.5 bg-white/70 rounded-full overflow-hidden mb-2.5">
                      <div className={`h-full rounded-full ${rs.bar}`} style={{ width: `${Math.min(100, Number(r.risk))}%` }} />
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 mb-2.5">
                      <div className="bg-white/70 rounded-xl p-1.5 text-center">
                        <p className="text-[8px] font-black text-slate-400 uppercase">Son Servis</p>
                        <p className="text-[10px] font-black text-slate-700">{r.gun_once !== null ? `${r.gun_once}g` : '—'}</p>
                      </div>
                      <div className="bg-white/70 rounded-xl p-1.5 text-center">
                        <p className="text-[8px] font-black text-slate-400 uppercase">90g İş</p>
                        <p className="text-[10px] font-black text-slate-700">{r.son_90_is}</p>
                      </div>
                      <div className="bg-white/70 rounded-xl p-1.5 text-center">
                        <p className="text-[8px] font-black text-slate-400 uppercase">Düşüş</p>
                        <p className="text-[10px] font-black text-slate-700">%{r.dusus_orani ?? 0}</p>
                      </div>
                    </div>

                    <div className="bg-white/80 rounded-2xl p-2.5 border border-white">
                      <p className="text-[10px] font-bold text-slate-600 flex items-start gap-1.5">
                        <Sparkles size={11} className="text-amber-500 mt-0.5 shrink-0" /> {r.oneri}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══════════ CANLI KÂR SAYACI ═══════════ */}
      {sekme === 'kar' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-3">
              <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Calculator size={15} /> İŞ MALİYETİ HESAPLA
              </p>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Müşteri Ücreti (₺)</label>
                  <input type="number" value={ucret} onChange={(e) => setUcret(e.target.value)}
                    placeholder="5000"
                    className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tahmini Süre (saat)</label>
                  <input type="number" step="0.5" value={sure} onChange={(e) => setSure(e.target.value)}
                    placeholder="2.5"
                    className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none focus:border-emerald-400" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Kullanılan Parçalar</label>
                  <button onClick={() => setParcalar([...parcalar, { ad: '', adet: '1' }])}
                    className="text-[10px] font-black text-emerald-600 flex items-center gap-1">
                    <Plus size={11} /> EKLE
                  </button>
                </div>
                <div className="space-y-2">
                  {parcalar.map((p, i) => (
                    <div key={i} className="relative">
                      <div className="flex gap-2">
                        <input type="text" value={p.ad}
                          onChange={(e) => {
                            const y = [...parcalar]; y[i].ad = e.target.value; setParcalar(y);
                            malzemeAra(e.target.value, i);
                          }}
                          onFocus={() => { if (p.ad.length >= 2) malzemeAra(p.ad, i); }}
                          onBlur={() => setTimeout(() => { if (aktifIdx === i) { setOneriler([]); setAktifIdx(null); } }, 200)}
                          placeholder="Parça adı yaz → depodan öneri çıkar"
                          className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-emerald-400" />
                        <input type="number" value={p.adet}
                          onChange={(e) => { const y = [...parcalar]; y[i].adet = e.target.value; setParcalar(y); }}
                          className="w-16 p-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xs text-center outline-none focus:border-emerald-400" />
                        {parcalar.length > 1 && (
                          <button onClick={() => setParcalar(parcalar.filter((_, x) => x !== i))}
                            className="px-2.5 bg-rose-50 border border-rose-200 rounded-2xl">
                            <X size={14} className="text-rose-500" />
                          </button>
                        )}
                      </div>

                      {/* 🔍 DEPODAN ÖNERİLER */}
                      {aktifIdx === i && oneriler.length > 0 && (
                        <div className="absolute z-30 left-0 right-16 mt-1 bg-white border-2 border-emerald-300 rounded-2xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                          <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-100">
                            <p className="text-[9px] font-black text-emerald-700 uppercase tracking-wider">
                              🏭 Depodan {oneriler.length} sonuç
                            </p>
                          </div>
                          {oneriler.map((m: any) => (
                            <button key={m.id} onMouseDown={(ev) => { ev.preventDefault(); oneriSec(i, m); }}
                              className="w-full text-left px-3 py-2 hover:bg-emerald-50 transition border-b border-slate-50 last:border-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-black text-slate-800 truncate">{m.ad}</p>
                                  <p className="text-[9px] font-bold text-slate-400">
                                    Stok: {Number(m.stok) || 0} {m.birim || 'adet'}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-[11px] font-black text-emerald-700">
                                    {Number(m.alis_fiyati) > 0 ? Number(m.alis_fiyati).toLocaleString('tr-TR') + ' ₺' : 'fiyat yok'}
                                  </p>
                                  <p className="text-[8px] font-bold text-slate-400">alış</p>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {aktifIdx === i && oneriler.length === 0 && p.ad.length >= 2 && (
                        <div className="absolute z-30 left-0 right-16 mt-1 bg-amber-50 border-2 border-amber-200 rounded-2xl px-3 py-2">
                          <p className="text-[10px] font-black text-amber-700">
                            ⚠️ Depoda bulunamadı — yine de kaydedilebilir
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={karHesapla} disabled={karYuk || !ucret}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg">
                {karYuk ? <Loader2 size={18} className="animate-spin" /> : <Calculator size={18} />}
                KÂRI HESAPLA
              </button>
              <p className="text-[9px] text-slate-400 font-medium text-center">
                Parça maliyetleri depodaki <strong>gerçek alış fiyatından</strong> otomatik çekilir
              </p>
            </div>
          </div>

          <div>
            {kar ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3 flex items-center justify-between">
                  <p className="text-xs font-black text-white uppercase tracking-wider">CANLI KÂR</p>
                  <span className={`text-[11px] font-black px-2.5 py-1 rounded-lg ${
                    Number(kar.kar_marji) >= 25 ? 'bg-emerald-500 text-white'
                    : Number(kar.kar_marji) >= 10 ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'}`}>
                    {kar.durum}
                  </span>
                </div>
                <div className="p-5">
                  <div className="text-center mb-5">
                    <p className={`text-4xl font-black leading-none ${
                      Number(kar.kar) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {Number(kar.kar) >= 0 ? '+' : ''}{para(kar.kar)} ₺
                    </p>
                    <p className="text-[11px] font-bold text-slate-400 mt-2">
                      Kâr marjı: %{kar.kar_marji}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2 border-b border-slate-100">
                      <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                        <Wallet size={12} className="text-emerald-600" /> Müşteri Ücreti
                      </span>
                      <span className="text-sm font-black text-emerald-700">+{para(kar.ucret)} ₺</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-slate-100">
                      <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                        <Package size={12} className="text-rose-600" /> Malzeme Maliyeti
                      </span>
                      <span className="text-sm font-black text-rose-700">−{para(kar.malzeme)} ₺</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-slate-100">
                      <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                        <Clock size={12} className="text-orange-600" /> İşçilik ({kar.sure_saat} sa × {para(kar.saatlik)} ₺)
                      </span>
                      <span className="text-sm font-black text-rose-700">−{para(kar.iscilik)} ₺</span>
                    </div>
                    <div className="flex items-center justify-between py-2.5 bg-slate-50 rounded-xl px-3 mt-2">
                      <span className="text-[11px] font-black text-slate-600">TOPLAM GİDER</span>
                      <span className="text-sm font-black text-slate-800">{para(kar.toplam_gider)} ₺</span>
                    </div>
                  </div>

                  {Array.isArray(kar.malzeme_detay) && kar.malzeme_detay.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5">PARÇA DÖKÜMÜ</p>
                      <div className="space-y-1">
                        {kar.malzeme_detay.map((m: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-[11px] bg-slate-50 rounded-xl px-3 py-2">
                            <span className="font-bold text-slate-600 truncate">{m.ad} × {m.adet}</span>
                            <span className="font-black text-slate-700 shrink-0 ml-2">
                              {para(m.birim)} ₺ → {para(m.toplam)} ₺
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
                <Calculator className="w-11 h-11 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-black text-slate-500">İş kârını hesapla</p>
                <p className="text-[11px] text-slate-400 font-medium mt-1.5 leading-relaxed">
                  Ücret + süre + parçaları gir →<br />
                  <strong>gerçek kârı</strong> anında gör. Parça fiyatları depodan çekilir.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ SEZON TAHMİNİ ═══════════ */}
      {sekme === 'sezon' && (
        <div>
          {sezonaylar.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
              <TrendingUp className="w-11 h-11 text-slate-300 mx-auto mb-3" />
              <p className="font-black text-slate-600">Tahmin için yeterli veri yok</p>
            </div>
          ) : (
            <>
              <div className="bg-gradient-to-r from-teal-600 to-emerald-700 rounded-3xl p-5 mb-5">
                <p className="text-[11px] font-black text-teal-100 uppercase tracking-wider">ÖNÜMÜZDEKİ 3 AY TAHMİNİ</p>
                <p className="text-3xl font-black text-white mt-1 leading-none">{para(sezon?.toplam_tahmin)} ₺</p>
                <p className="text-[11px] font-bold text-teal-100 mt-2">
                  Geçen yıl + son 3 ay trendi ağırlıklı hesaplandı
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {sezonaylar.map((a: any, i: number) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-base font-black text-slate-800">{a.ay}</p>
                          <p className="text-[10px] font-bold text-slate-400">{a.yil}</p>
                        </div>
                        <span className="text-2xl">{a.yon}</span>
                      </div>

                      <div className="h-24 flex items-end gap-2 mb-3">
                        <div className="flex-1 flex flex-col items-center justify-end h-full">
                          <span className="text-[9px] font-black text-slate-400 mb-1">{para(a.gecen_yil)}</span>
                          <div className="w-full bg-slate-200 rounded-t-lg"
                            style={{ height: `${Math.max((Number(a.gecen_yil) / sezonMax) * 100, 4)}%` }} />
                          <span className="text-[8px] font-bold text-slate-400 mt-1">Geçen Yıl</span>
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-end h-full">
                          <span className="text-[9px] font-black text-teal-600 mb-1">{para(a.tahmin)}</span>
                          <div className="w-full bg-teal-500 rounded-t-lg"
                            style={{ height: `${Math.max((Number(a.tahmin) / sezonMax) * 100, 4)}%` }} />
                          <span className="text-[8px] font-black text-teal-600 mt-1">Tahmin</span>
                        </div>
                      </div>

                      {a.degisim !== null && (
                        <div className={`flex items-center justify-center gap-1.5 rounded-xl py-1.5 mb-2 ${
                          Number(a.degisim) > 5 ? 'bg-emerald-50 text-emerald-700'
                          : Number(a.degisim) < -5 ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'}`}>
                          {Number(a.degisim) > 5 ? <TrendingUp size={12} />
                            : Number(a.degisim) < -5 ? <TrendingDown size={12} /> : <Minus size={12} />}
                          <span className="text-[11px] font-black">
                            {Number(a.degisim) > 0 ? '+' : ''}%{a.degisim}
                          </span>
                        </div>
                      )}

                      <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-600 flex items-start gap-1.5">
                          <Target size={11} className="text-teal-500 mt-0.5 shrink-0" /> {a.oneri}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
