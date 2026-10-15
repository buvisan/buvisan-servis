'use client';

// ============================================================================
//  🤖 AKILLI ANALİZ MERKEZİ — Foto AI + Dinamik Fiyat + Anomali Alarmı
// ----------------------------------------------------------------------------
//  Veri: fiyat_onerisi() · anomali_tara() · foto_analiz_gecmisi() · foto_analiz_kaydet()
//  AI  : /api/foto-analiz (Gemini Vision) — yönetici korumalı
//  İlke: her bölüm bağımsız, biri hata verse diğerleri çalışır
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Sparkles, Loader2, RefreshCw, ArrowLeft, AlertTriangle, Camera,
  Calculator, TrendingUp, CheckCircle2, X, Upload, Shield, Clock,
  Package, Lightbulb, History, Zap
} from 'lucide-react';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const ACILLIK_RENK: Record<string, string> = {
  'KRİTİK': 'bg-rose-100 text-rose-700 border-rose-300',
  'YÜKSEK': 'bg-orange-100 text-orange-700 border-orange-300',
  'ORTA': 'bg-amber-100 text-amber-700 border-amber-300',
  'DÜŞÜK': 'bg-emerald-100 text-emerald-700 border-emerald-300',
};

export default function AkilliAnalizPage() {
  const dosyaRef = useRef<HTMLInputElement>(null);
  const [sekme, setSekme] = useState<'foto' | 'fiyat' | 'anomali'>('foto');
  const [onizleme, setOnizleme] = useState<string | null>(null);
  const [analiz, setAnaliz] = useState<any>(null);
  const [analizYuk, setAnalizYuk] = useState(false);
  const [mesaj, setMesaj] = useState('');
  const [musteri, setMusteri] = useState('');
  const [notr, setNotr] = useState('');

  // Fiyat
  const [fIsTipi, setFIsTipi] = useState('');
  const [fMusteri, setFMusteri] = useState('');
  const [fMesafe, setFMesafe] = useState('');
  const [fAcil, setFAcil] = useState(false);
  const [fiyat, setFiyat] = useState<any>(null);
  const [fiyatYuk, setFiyatYuk] = useState(false);

  // Anomali
  const [anomali, setAnomali] = useState<any>(null);
  const [anomaliYuk, setAnomaliYuk] = useState(true);

  // Geçmiş
  const [gecmis, setGecmis] = useState<any[]>([]);

  const gecmisGetir = useCallback(async () => {
    const { data } = await supabase.rpc('foto_analiz_gecmisi', { p_limit: 20 });
    setGecmis(data || []);
  }, []);

  const anomaliGetir = useCallback(async () => {
    setAnomaliYuk(true);
    try {
      const { data } = await supabase.rpc('anomali_tara');
      setAnomali(data);
    } finally { setAnomaliYuk(false); }
  }, []);

  useEffect(() => { anomaliGetir(); gecmisGetir(); }, [anomaliGetir, gecmisGetir]);

  // ─── FOTOĞRAF SEÇ ───
  const fotoSec = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { setMesaj('Lütfen bir fotoğraf seçin.'); return; }
    const okuyucu = new FileReader();
    okuyucu.onload = () => { setOnizleme(String(okuyucu.result)); setAnaliz(null); setMesaj(''); };
    okuyucu.readAsDataURL(f);
  };

  // ─── AI ANALİZİ ───
  const analizEt = async () => {
    if (!onizleme) { setMesaj('Önce fotoğraf seçin.'); return; }
    setAnalizYuk(true); setMesaj('');
    try {
      const { data: oturum } = await supabase.auth.getSession();
      const token = oturum?.session?.access_token;

      const yanit = await fetch('/api/foto-analiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          gorsel: onizleme,
          musteri: musteri.trim() || null,
          aciklama: notr.trim() || null,
        }),
      });

      const sonuc = await yanit.json();
      if (!yanit.ok || !sonuc.ok) {
        setMesaj(sonuc?.mesaj || 'Analiz yapılamadı.');
        return;
      }
      setAnaliz(sonuc.analiz);

      // Sonucu veritabanına kaydet (geçmiş + doğruluk takibi)
      await supabase.rpc('foto_analiz_kaydet', {
        p_musteri: musteri.trim() || 'Bilinmiyor',
        p_tespit: sonuc.analiz.tespit,
        p_onerilen_parca: (sonuc.analiz.parcalar || []).join(', ') || null,
        p_guven: sonuc.analiz.guven,
        p_ai_notu: (sonuc.analiz.oneriler || []).join(' | ') || null,
      });
      await gecmisGetir();
    } catch (e: any) {
      setMesaj('Bağlantı hatası: ' + (e?.message || 'bilinmeyen'));
    } finally { setAnalizYuk(false); }
  };

  // ─── FİYAT ÖNERİSİ ───
  const fiyatHesapla = async () => {
    setFiyatYuk(true); setMesaj('');
    try {
      const { data, error } = await supabase.rpc('fiyat_onerisi', {
        p_is_tipi: fIsTipi.trim() || null,
        p_musteri: fMusteri.trim() || null,
        p_mesafe_km: fMesafe ? Number(fMesafe) : 0,
        p_acil: fAcil,
      });
      if (error) { setMesaj(error.message); return; }
      setFiyat(data);
    } finally { setFiyatYuk(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8">

      {/* ÜST BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-slate-800 flex items-center gap-2.5">
            <Sparkles className="text-fuchsia-600" size={30} /> AKILLI ANALİZ
          </h1>
          <p className="text-slate-500 text-xs md:text-sm mt-0.5">
            Fotoğraftan arıza tespiti · dinamik fiyat · anomali alarmı
          </p>
        </div>
        <Link href="/admin" className="bg-slate-900 text-white px-4 py-3 rounded-2xl font-black text-xs flex items-center gap-2">
          <ArrowLeft size={15} /> PANEL
        </Link>
      </div>

      {mesaj && (
        <div className={`p-4 rounded-2xl text-xs font-bold mb-5 border ${
          mesaj.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{mesaj}</div>
      )}

      {/* SEKMELER */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {[
          { k: 'foto', a: '📸 Fotoğraftan Arıza', i: <Camera size={14} /> },
          { k: 'fiyat', a: '💰 Fiyat Önerisi', i: <Calculator size={14} /> },
          { k: 'anomali', a: `🚨 Anomali${anomali?.toplam ? ` (${anomali.toplam})` : ''}`, i: <AlertTriangle size={14} /> },
        ].map((s) => (
          <button key={s.k} onClick={() => setSekme(s.k as any)}
            className={`px-4 py-3 rounded-2xl text-xs font-black border transition whitespace-nowrap flex items-center gap-2 ${
              sekme === s.k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>
            {s.i} {s.a}
          </button>
        ))}
      </div>

      {/* ═══════════ FOTOĞRAFTAN ARIZA ═══════════ */}
      {sekme === 'foto' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* SOL: FOTOĞRAF */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-fuchsia-600 to-purple-700 px-4 py-3">
              <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Camera size={15} /> FOTOĞRAF YÜKLE
              </p>
            </div>
            <div className="p-4 space-y-3">
              <input ref={dosyaRef} type="file" accept="image/*" capture="environment"
                onChange={fotoSec} className="hidden" />

              {onizleme ? (
                <div className="relative">
                  <img src={onizleme} alt="Arıza fotoğrafı"
                    className="w-full rounded-2xl border-2 border-slate-200 object-contain max-h-[340px] bg-slate-50" />
                  <button onClick={() => { setOnizleme(null); setAnaliz(null); }}
                    className="absolute top-2 right-2 bg-white/90 rounded-xl p-2 shadow-lg">
                    <X size={16} className="text-slate-600" />
                  </button>
                </div>
              ) : (
                <button onClick={() => dosyaRef.current?.click()}
                  className="w-full h-52 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center gap-2 hover:border-fuchsia-400 hover:bg-fuchsia-50/50 transition">
                  <Upload size={32} className="text-slate-300" />
                  <p className="text-xs font-black text-slate-500">Fotoğraf çek veya seç</p>
                  <p className="text-[10px] font-medium text-slate-400">Arızalı parçayı net göster</p>
                </button>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Müşteri</label>
                  <input type="text" value={musteri} onChange={(e) => setMusteri(e.target.value)}
                    placeholder="Örn: RB KARESİ"
                    className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-fuchsia-400" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Not (isteğe bağlı)</label>
                  <input type="text" value={notr} onChange={(e) => setNotr(e.target.value)}
                    placeholder="Örn: ses geliyor"
                    className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-fuchsia-400" />
                </div>
              </div>

              <button onClick={analizEt} disabled={analizYuk || !onizleme}
                className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-slate-300 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98]">
                {analizYuk ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {analizYuk ? 'YAPAY ZEKA İNCELİYOR...' : 'ANALİZ ET'}
              </button>

              <p className="text-[9px] text-slate-400 font-medium text-center">
                Fotoğraf sunucuda <strong>saklanmaz</strong> · sadece analiz sonucu kaydedilir
              </p>
            </div>
          </div>

          {/* SAĞ: SONUÇ */}
          <div className="space-y-4">
            {analizYuk && (
              <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-fuchsia-500 mx-auto" />
                <p className="text-xs font-black text-slate-600 mt-3">Yapay zeka fotoğrafı inceliyor...</p>
                <p className="text-[10px] text-slate-400 font-medium mt-1">10-20 saniye sürebilir</p>
              </div>
            )}

            {analiz && !analizYuk && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3 flex items-center justify-between">
                  <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Sparkles size={15} /> YAPAY ZEKA SONUCU
                  </p>
                  <span className={`text-[10px] font-black px-2 py-1 rounded-lg border ${ACILLIK_RENK[analiz.aciliyet] || ACILLIK_RENK['ORTA']}`}>
                    {analiz.aciliyet}
                  </span>
                </div>

                <div className="p-4 space-y-4">
                  {/* TESPİT */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5">TESPİT</p>
                    <p className="text-sm font-bold text-slate-700 leading-relaxed bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                      {analiz.tespit}
                    </p>
                  </div>

                  {/* GÜVEN */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase">GÜVEN ORANI</span>
                      <span className={`text-sm font-black ${
                        Number(analiz.guven) >= 70 ? 'text-emerald-600'
                        : Number(analiz.guven) >= 40 ? 'text-amber-600' : 'text-rose-600'}`}>
                        %{analiz.guven}
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${
                        Number(analiz.guven) >= 70 ? 'bg-emerald-500'
                        : Number(analiz.guven) >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        style={{ width: `${Math.min(100, Number(analiz.guven))}%` }} />
                    </div>
                    {Number(analiz.guven) < 50 && (
                      <p className="text-[10px] font-bold text-amber-600 mt-1.5">
                        ⚠️ Güven düşük — daha net bir fotoğraf çekmeyi dene
                      </p>
                    )}
                  </div>

                  {/* PARÇALAR */}
                  {analiz.parcalar?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                        <Package size={11} /> GEREKLİ PARÇALAR
                      </p>
                      <div className="space-y-1.5">
                        {analiz.parcalar.map((p: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                            <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                            <span className="text-[12px] font-bold text-emerald-800">{p}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SÜRE */}
                  {Number(analiz.is_suresi_saat) > 0 && (
                    <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl p-3">
                      <Clock size={18} className="text-blue-600 shrink-0" />
                      <div>
                        <p className="text-[10px] font-black text-blue-600 uppercase">TAHMİNİ SÜRE</p>
                        <p className="text-sm font-black text-blue-800">{analiz.is_suresi_saat} saat</p>
                      </div>
                    </div>
                  )}

                  {/* ÖNERİLER */}
                  {analiz.oneriler?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                        <Lightbulb size={11} /> ÖNERİLER
                      </p>
                      <ul className="space-y-1">
                        {analiz.oneriler.map((o: string, i: number) => (
                          <li key={i} className="text-[11px] font-medium text-slate-600 flex items-start gap-2">
                            <span className="text-fuchsia-500 font-black">•</span> {o}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* GÜVENLİK */}
                  {analiz.guvenlik && (
                    <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-3.5">
                      <p className="text-[10px] font-black text-rose-600 uppercase flex items-center gap-1.5 mb-1">
                        <Shield size={12} /> İŞ GÜVENLİĞİ UYARISI
                      </p>
                      <p className="text-[12px] font-bold text-rose-800">{analiz.guvenlik}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {!analiz && !analizYuk && (
              <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
                <Sparkles className="w-11 h-11 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-black text-slate-500">Fotoğraf yükle ve analiz et</p>
                <p className="text-[11px] text-slate-400 font-medium mt-1.5 leading-relaxed">
                  Yapay zeka arızayı tespit eder, gerekli parçayı söyler,<br />
                  tahmini süreyi ve güvenlik uyarısını verir.
                </p>
              </div>
            )}

            {/* GEÇMİŞ */}
            {gecmis.length > 0 && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                  <History size={14} className="text-slate-400" />
                  <p className="text-[11px] font-black text-slate-600 uppercase tracking-wider">SON ANALİZLER</p>
                </div>
                <div className="divide-y divide-slate-50 max-h-56 overflow-y-auto">
                  {gecmis.slice(0, 6).map((g: any) => (
                    <div key={g.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-black text-slate-700 truncate">{g.musteri}</span>
                        <span className={`text-[9px] font-black shrink-0 ${
                          Number(g.guven) >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>%{g.guven}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">{g.tespit}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ FİYAT ÖNERİSİ ═══════════ */}
      {sekme === 'fiyat' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-3">
              <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Calculator size={15} /> FİYAT HESAPLA
              </p>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">İş Tipi</label>
                <input type="text" value={fIsTipi} onChange={(e) => setFIsTipi(e.target.value)}
                  placeholder="Örn: Rulman, Halat, Bakım, Fren"
                  className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-emerald-400" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Müşteri</label>
                <input type="text" value={fMusteri} onChange={(e) => setFMusteri(e.target.value)}
                  placeholder="Örn: RB KARESİ (sadakat indirimi için)"
                  className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-emerald-400" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Mesafe (km)</label>
                <input type="number" value={fMesafe} onChange={(e) => setFMesafe(e.target.value)}
                  placeholder="Örn: 35"
                  className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-emerald-400" />
              </div>
              <button onClick={() => setFAcil(!fAcil)}
                className={`w-full py-3.5 rounded-2xl font-black text-xs border-2 transition ${
                  fAcil ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                {fAcil ? '⚡ ACİL İŞ (+%25)' : '⚡ Acil iş mi? (tıkla)'}
              </button>
              <button onClick={fiyatHesapla} disabled={fiyatYuk}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg">
                {fiyatYuk ? <Loader2 size={18} className="animate-spin" /> : <Calculator size={18} />}
                FİYAT ÖNER
              </button>
            </div>
          </div>

          <div>
            {fiyat ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-3">
                  <p className="text-xs font-black text-white uppercase tracking-wider">ÖNERİLEN FİYAT</p>
                </div>
                <div className="p-5">
                  <div className="text-center mb-5">
                    <p className="text-4xl font-black text-emerald-700 leading-none">{para(fiyat.oneri)} ₺</p>
                    <p className="text-[11px] font-bold text-slate-400 mt-2">
                      Makul aralık: {para(fiyat.alt_sinir)} – {para(fiyat.ust_sinir)} ₺
                    </p>
                  </div>

                  <div className="space-y-2 mb-4">
                    {[
                      { e: `Benzer ${fiyat.benzer_is} işin medyanı`, v: fiyat.medyan, renk: 'slate' },
                      { e: 'Mesafe eklemesi', v: fiyat.mesafe_ek, renk: 'blue', artı: true },
                      { e: 'Aciliyet eklemesi', v: fiyat.acil_ek, renk: 'orange', artı: true },
                      { e: 'Sadakat indirimi', v: fiyat.sadakat_indirim, renk: 'emerald' },
                    ].filter((x) => Number(x.v) !== 0).map((x, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] font-bold py-1.5 border-b border-slate-50 last:border-0">
                        <span className="text-slate-500">{x.e}</span>
                        <span className={`${
                          x.renk === 'emerald' ? 'text-emerald-600'
                          : x.renk === 'orange' ? 'text-orange-600'
                          : x.renk === 'blue' ? 'text-blue-600' : 'text-slate-700'}`}>
                          {x.artı && Number(x.v) > 0 ? '+' : ''}{para(x.v)} ₺
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase">Tahmini Malzeme</p>
                      <p className="text-sm font-black text-slate-700">{para(fiyat.tahmini_malzeme)} ₺</p>
                    </div>
                    <div className={`rounded-2xl p-3 border ${
                      Number(fiyat.tahmini_kar_orani) >= 30 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                      <p className={`text-[9px] font-black uppercase ${
                        Number(fiyat.tahmini_kar_orani) >= 30 ? 'text-emerald-600' : 'text-amber-600'}`}>Tahmini Kâr Marjı</p>
                      <p className={`text-sm font-black ${
                        Number(fiyat.tahmini_kar_orani) >= 30 ? 'text-emerald-700' : 'text-amber-700'}`}>
                        %{fiyat.tahmini_kar_orani}
                      </p>
                    </div>
                  </div>

                  {fiyat.uyari && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mt-3">
                      <p className="text-[11px] font-bold text-amber-700">{fiyat.uyari}</p>
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400 font-medium mt-3 leading-relaxed">{fiyat.mesaj}</p>
                  {Number(fiyat.musteri_is) > 0 && (
                    <p className="text-[10px] font-bold text-emerald-600 mt-2">
                      👤 Bu müşteriyle {fiyat.musteri_is} iş yapıldı · toplam {para(fiyat.musteri_ciro)} ₺
                    </p>
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
                <Calculator className="w-11 h-11 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-black text-slate-500">Fiyat önerisi al</p>
                <p className="text-[11px] text-slate-400 font-medium mt-1.5 leading-relaxed">
                  Geçmiş işlerden öğrenir · mesafe, aciliyet ve<br />müşteri sadakatini hesaba katar.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ ANOMALİ ALARMI ═══════════ */}
      {sekme === 'anomali' && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={anomaliGetir} disabled={anomaliYuk}
              className="bg-white border border-slate-200 px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-slate-100">
              <RefreshCw size={14} className={anomaliYuk ? 'animate-spin' : ''} /> TARA
            </button>
          </div>

          {anomaliYuk ? (
            <div className="py-16 text-center"><Loader2 className="w-9 h-9 animate-spin text-slate-400 mx-auto" /></div>
          ) : !anomali || Number(anomali.toplam) === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-sm font-black text-slate-700">Anomali yok kanka! 🎉</p>
              <p className="text-[11px] text-slate-400 font-medium mt-1">
                Giderler normal, kâr marjları sağlıklı, müşteri aktivitesi yerinde.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-gradient-to-r from-rose-600 to-orange-600 rounded-3xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-black text-rose-100 uppercase tracking-wider flex items-center gap-1.5">
                    <Zap size={13} /> DİKKAT GEREKEN DURUMLAR
                  </p>
                  <p className="text-xl font-black text-white mt-1">{anomali.toplam} uyarı</p>
                </div>
                {Number(anomali.yuksek_oncelikli) > 0 && (
                  <div className="bg-white/20 rounded-2xl px-4 py-2 text-center">
                    <p className="text-2xl font-black text-white leading-none">{anomali.yuksek_oncelikli}</p>
                    <p className="text-[9px] font-black text-rose-100">ACİL</p>
                  </div>
                )}
              </div>

              {(anomali.uyarilar || []).map((u: any, i: number) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.05, 0.3) }}
                  className={`bg-white rounded-3xl border-2 p-4 ${
                    u.seviye === 'yuksek' ? 'border-rose-200' : u.seviye === 'orta' ? 'border-amber-200' : 'border-slate-200'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                      u.seviye === 'yuksek' ? 'bg-rose-100 text-rose-600'
                      : u.seviye === 'orta' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                      {u.tip === 'gider' ? <TrendingUp size={18} />
                        : u.tip === 'kar' ? <Calculator size={18} />
                        : u.tip === 'musteri' ? <AlertTriangle size={18} /> : <Clock size={18} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-black text-slate-800 leading-tight">{u.baslik}</p>
                      <p className="text-[11px] text-slate-500 font-medium mt-1">{u.detay}</p>
                      <div className="bg-slate-50 rounded-xl p-2.5 mt-2 border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-600 flex items-start gap-1.5">
                          <Lightbulb size={11} className="text-amber-500 mt-0.5 shrink-0" /> {u.oneri}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
