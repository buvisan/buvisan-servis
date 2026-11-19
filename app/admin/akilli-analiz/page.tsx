'use client';

// ============================================================================
//  🤖 AKILLI ANALİZ MERKEZİ — Foto AI + Dinamik Fiyat + Anomali Alarmı
// ----------------------------------------------------------------------------
//  Veri: fiyat_onerisi() · anomali_tara() · foto_analiz_gecmisi() · foto_analiz_kaydet()
//  AI  : /api/foto-analiz (Gemini Vision) — yönetici korumalı
//  İlke: her bölüm bağımsız, biri hata verse diğerleri çalışır
//  Para: bu ekrandaki TÜM tutarlar KDV HARİÇTİR
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Sparkles, Loader2, RefreshCw, ArrowLeft, AlertTriangle, Camera,
  Calculator, TrendingUp, CheckCircle2, X, Upload, Shield, Clock,
  Package, Lightbulb, History, Zap
} from 'lucide-react';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

// Güvenli sayı: null / undefined / "" / NaN → varsayılan
const sayi = (n: any, varsayilan = 0) => {
  const v = Number(n);
  return Number.isFinite(v) ? v : varsayilan;
};
// Güven yüzdesi → 0-100 arası tam sayı (bant genişliği NaN olmasın)
const yuzde = (n: any) => Math.max(0, Math.min(100, Math.round(sayi(n))));

const ACILLIK_RENK: Record<string, string> = {
  'KRİTİK': 'bg-rose-100 text-rose-700 border-rose-300',
  'YÜKSEK': 'bg-orange-100 text-orange-700 border-orange-300',
  'ORTA': 'bg-amber-100 text-amber-700 border-amber-300',
  'DÜŞÜK': 'bg-emerald-100 text-emerald-700 border-emerald-300',
};

// ----------------------------------------------------------------------------
//  FOTOĞRAF HAZIRLAMA
// ----------------------------------------------------------------------------
//  Telefon fotoğrafları 3-10 MB olabiliyor; base64'e çevrilince ~%33 büyüyor
//  ve Vercel'in ~4.5 MB istek gövdesi sınırına takılıyordu (ANALİZ ET çalışmıyordu).
//  Bu yüzden büyük görseller gönderilmeden ÖNCE tarayıcıda küçültülür.
// ----------------------------------------------------------------------------
const KUCULT_ESIK = 1_400_000; // bundan büyük data-URL küçültülür (~1 MB dosya)
const UST_SINIR = 4_200_000;   // sunucuya gönderilebilecek en büyük data-URL
const EN_FAZLA_KENAR = 1600;   // küçültmede en uzun kenar (px)

function dosyaOku(dosya: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const okuyucu = new FileReader();
    okuyucu.onload = () => resolve(String(okuyucu.result || ''));
    okuyucu.onerror = () => reject(new Error('Fotoğraf okunamadı.'));
    okuyucu.readAsDataURL(dosya);
  });
}

function gorselYukle(veriUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Fotoğraf açılamadı.'));
    img.src = veriUrl;
  });
}

async function gorseliKucult(veriUrl: string): Promise<string> {
  const img = await gorselYukle(veriUrl);
  const kenar = Math.max(img.width || 0, img.height || 0);
  if (!kenar) return veriUrl;
  const oran = Math.min(1, EN_FAZLA_KENAR / kenar);
  const g = Math.max(1, Math.round((img.width || kenar) * oran));
  const y = Math.max(1, Math.round((img.height || kenar) * oran));
  const tuval = document.createElement('canvas');
  tuval.width = g;
  tuval.height = y;
  const ctx = tuval.getContext('2d');
  if (!ctx) return veriUrl;
  ctx.drawImage(img, 0, 0, g, y);
  const kucuk = tuval.toDataURL('image/jpeg', 0.82);
  return kucuk.length < veriUrl.length ? kucuk : veriUrl;
}

type MesajTuru = 'hata' | 'uyari' | 'basari';

export default function AkilliAnalizPage() {
  const dosyaRef = useRef<HTMLInputElement>(null);
  const [sekme, setSekme] = useState<'foto' | 'fiyat' | 'anomali'>('foto');
  const [onizleme, setOnizleme] = useState<string | null>(null);
  const [fotoYuk, setFotoYuk] = useState(false);
  const [analiz, setAnaliz] = useState<any>(null);
  const [analizYuk, setAnalizYuk] = useState(false);
  const [mesaj, setMesaj] = useState<{ tur: MesajTuru; metin: string } | null>(null);
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
  const [anomaliHata, setAnomaliHata] = useState<string | null>(null);

  // Geçmiş
  const [gecmis, setGecmis] = useState<any[]>([]);
  const [gecmisYuk, setGecmisYuk] = useState(true);
  const [gecmisHata, setGecmisHata] = useState<string | null>(null);

  const mesajYaz = (metin: string, tur: MesajTuru = 'hata') => setMesaj({ tur, metin });

  const gecmisGetir = useCallback(async () => {
    setGecmisYuk(true);
    try {
      const { data, error } = await supabase.rpc('foto_analiz_gecmisi', { p_limit: 20 });
      if (error) {
        setGecmisHata(error.message);
        setGecmis([]);
        return;
      }
      setGecmisHata(null);
      setGecmis(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setGecmisHata(e?.message || 'Geçmiş okunamadı.');
      setGecmis([]);
    } finally {
      setGecmisYuk(false);
    }
  }, []);

  const anomaliGetir = useCallback(async () => {
    setAnomaliYuk(true);
    setAnomaliHata(null);
    try {
      const { data, error } = await supabase.rpc('anomali_tara');
      if (error) {
        // Hata durumunda "anomali yok" DEME — yanlış güven verir
        setAnomali(null);
        setAnomaliHata(error.message);
        return;
      }
      if (!data || typeof data !== 'object') {
        setAnomali(null);
        setAnomaliHata('Tarama boş sonuç döndü.');
        return;
      }
      setAnomali(data);
    } catch (e: any) {
      setAnomali(null);
      setAnomaliHata(e?.message || 'Tarama yapılamadı.');
    } finally {
      setAnomaliYuk(false);
    }
  }, []);

  useEffect(() => { anomaliGetir(); gecmisGetir(); }, [anomaliGetir, gecmisGetir]);

  // ─── FOTOĞRAF SEÇ ───
  const fotoSec = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    // Aynı fotoğraf ikinci kez seçilebilsin (value sıfırlanmazsa onChange tetiklenmez)
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { mesajYaz('Lütfen bir fotoğraf seçin.'); return; }

    setFotoYuk(true);
    setMesaj(null);
    setAnaliz(null);
    try {
      let url = await dosyaOku(f);
      if (url.length > KUCULT_ESIK) {
        try { url = await gorseliKucult(url); } catch { /* küçültme olmazsa ham veriyle devam */ }
      }
      if (url.length > UST_SINIR) {
        setOnizleme(null);
        mesajYaz('Fotoğraf çok büyük (' + (f.size / 1024 / 1024).toFixed(1) + ' MB). Daha düşük çözünürlükte çekmeyi dene.');
        return;
      }
      setOnizleme(url);
    } catch (err: any) {
      setOnizleme(null);
      mesajYaz(err?.message || 'Fotoğraf okunamadı.');
    } finally {
      setFotoYuk(false);
    }
  };

  // ─── AI ANALİZİ ───
  const analizEt = async () => {
    if (!onizleme) { mesajYaz('Önce fotoğraf seçin.'); return; }
    setAnalizYuk(true);
    setMesaj(null);
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

      // Sunucu JSON dışında bir şey dönerse (HTML hata sayfası vb.) patlamasın
      let sonuc: any = null;
      try { sonuc = await yanit.json(); } catch { sonuc = null; }

      if (!yanit.ok || !sonuc?.ok) {
        // API 403'te { hata }, 4xx/5xx'te { mesaj } döner → ikisini de göster
        mesajYaz(
          sonuc?.mesaj || sonuc?.hata || `Analiz yapılamadı (sunucu ${yanit.status}).`
        );
        return;
      }

      const a = sonuc.analiz;
      if (!a || typeof a !== 'object') {
        mesajYaz('Yapay zeka geçerli bir analiz döndürmedi. Tekrar dene.', 'uyari');
        return;
      }
      setAnaliz(a);

      // Sonucu veritabanına kaydet (geçmiş + doğruluk takibi)
      const { error: kayitHatasi } = await supabase.rpc('foto_analiz_kaydet', {
        p_musteri: musteri.trim() || 'Bilinmiyor',
        p_tespit: String(a.tespit || 'Tespit yapılamadı'),
        p_onerilen_parca: Array.isArray(a.parcalar) ? (a.parcalar.join(', ') || null) : null,
        p_guven: yuzde(a.guven),
        p_ai_notu: Array.isArray(a.oneriler) ? (a.oneriler.join(' | ') || null) : null,
      });
      if (kayitHatasi) {
        mesajYaz('Analiz tamamlandı ama geçmişe kaydedilemedi: ' + kayitHatasi.message, 'uyari');
      }
      await gecmisGetir();
    } catch (e: any) {
      mesajYaz('Bağlantı hatası: ' + (e?.message || 'bilinmeyen'));
    } finally {
      setAnalizYuk(false);
    }
  };

  // ─── FİYAT ÖNERİSİ ───
  const fiyatHesapla = async () => {
    setFiyatYuk(true);
    setMesaj(null);
    try {
      // Negatif / bozuk mesafe fiyatı düşürmesin
      const mesafe = Math.max(0, sayi(fMesafe, 0));
      const { data, error } = await supabase.rpc('fiyat_onerisi', {
        p_is_tipi: fIsTipi.trim() || null,
        p_musteri: fMusteri.trim() || null,
        p_mesafe_km: mesafe,
        p_acil: fAcil,
      });
      if (error) {
        setFiyat(null);
        mesajYaz('Fiyat önerisi alınamadı: ' + error.message);
        return;
      }
      if (!data || typeof data !== 'object') {
        setFiyat(null);
        mesajYaz('Fiyat önerisi boş döndü. Geçmiş iş kaydı olmayabilir.', 'uyari');
        return;
      }
      setFiyat(data);
    } catch (e: any) {
      setFiyat(null);
      mesajYaz('Bağlantı hatası: ' + (e?.message || 'bilinmeyen'));
    } finally {
      setFiyatYuk(false);
    }
  };

  const analizGuven = yuzde(analiz?.guven);
  const aciliyet = analiz?.aciliyet || 'ORTA';
  const f = fiyat || null;

  // Fiyat kırılımı — tüm tutarlar KDV hariç
  const kirilim: { e: string; v: any; renk: string; arti?: boolean }[] = f
    ? [
        {
          e: sayi(f.benzer_is) > 0
            ? `Benzer ${sayi(f.benzer_is)} işin medyanı`
            : 'Varsayılan fiyat (benzer iş yok)',
          v: f.medyan,
          renk: 'slate',
        },
        { e: 'Mesafe eklemesi', v: f.mesafe_ek, renk: 'blue', arti: true },
        { e: 'Aciliyet eklemesi', v: f.acil_ek, renk: 'orange', arti: true },
        { e: 'Sadakat indirimi', v: f.sadakat_indirim, renk: 'emerald' },
      ]
    : [];

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
          mesaj.tur === 'basari' || mesaj.metin.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : mesaj.tur === 'uyari' ? 'bg-amber-50 text-amber-800 border-amber-200'
          : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{mesaj.metin}</div>
      )}

      {/* SEKMELER */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {[
          { k: 'foto', a: '📸 Fotoğraftan Arıza', i: <Camera size={14} /> },
          { k: 'fiyat', a: '💰 Fiyat Önerisi', i: <Calculator size={14} /> },
          { k: 'anomali', a: `🚨 Anomali${sayi(anomali?.toplam) > 0 ? ` (${sayi(anomali?.toplam)})` : ''}`, i: <AlertTriangle size={14} /> },
        ].map((s) => (
          <button key={s.k} onClick={() => { setSekme(s.k as any); setMesaj(null); }}
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

              {fotoYuk ? (
                <div className="w-full h-52 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center gap-2 bg-slate-50">
                  <Loader2 size={28} className="text-slate-400 animate-spin" />
                  <p className="text-xs font-black text-slate-500">Fotoğraf hazırlanıyor...</p>
                </div>
              ) : onizleme ? (
                <div className="relative">
                  <img src={onizleme} alt="Arıza fotoğrafı"
                    className="w-full rounded-2xl border-2 border-slate-200 object-contain max-h-[340px] bg-slate-50" />
                  <button onClick={() => { setOnizleme(null); setAnaliz(null); setMesaj(null); }}
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

              <button onClick={analizEt} disabled={analizYuk || fotoYuk || !onizleme}
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
                  <span className={`text-[10px] font-black px-2 py-1 rounded-lg border ${ACILLIK_RENK[aciliyet] || ACILLIK_RENK['ORTA']}`}>
                    {aciliyet}
                  </span>
                </div>

                <div className="p-4 space-y-4">
                  {/* TESPİT */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5">TESPİT</p>
                    <p className="text-sm font-bold text-slate-700 leading-relaxed bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                      {analiz.tespit || 'Tespit yapılamadı'}
                    </p>
                  </div>

                  {/* GÜVEN */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase">GÜVEN ORANI</span>
                      <span className={`text-sm font-black ${
                        analizGuven >= 70 ? 'text-emerald-600'
                        : analizGuven >= 40 ? 'text-amber-600' : 'text-rose-600'}`}>
                        %{analizGuven}
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${
                        analizGuven >= 70 ? 'bg-emerald-500'
                        : analizGuven >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        style={{ width: `${analizGuven}%` }} />
                    </div>
                    {analizGuven < 50 && (
                      <p className="text-[10px] font-bold text-amber-600 mt-1.5">
                        ⚠️ Güven düşük — daha net bir fotoğraf çekmeyi dene
                      </p>
                    )}
                  </div>

                  {/* PARÇALAR */}
                  {Array.isArray(analiz.parcalar) && analiz.parcalar.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                        <Package size={11} /> GEREKLİ PARÇALAR
                      </p>
                      <div className="space-y-1.5">
                        {analiz.parcalar.map((p: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                            <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                            <span className="text-[12px] font-bold text-emerald-800">{String(p)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SÜRE */}
                  {sayi(analiz.is_suresi_saat) > 0 && (
                    <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl p-3">
                      <Clock size={18} className="text-blue-600 shrink-0" />
                      <div>
                        <p className="text-[10px] font-black text-blue-600 uppercase">TAHMİNİ SÜRE</p>
                        <p className="text-sm font-black text-blue-800">{sayi(analiz.is_suresi_saat)} saat</p>
                      </div>
                    </div>
                  )}

                  {/* ÖNERİLER */}
                  {Array.isArray(analiz.oneriler) && analiz.oneriler.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                        <Lightbulb size={11} /> ÖNERİLER
                      </p>
                      <ul className="space-y-1">
                        {analiz.oneriler.map((o: any, i: number) => (
                          <li key={i} className="text-[11px] font-medium text-slate-600 flex items-start gap-2">
                            <span className="text-fuchsia-500 font-black">•</span> {String(o)}
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
                      <p className="text-[12px] font-bold text-rose-800">{String(analiz.guvenlik)}</p>
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

            {/* GEÇMİŞ — her zaman görünür (yükleme / boş / hata durumu var) */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <History size={14} className="text-slate-400" />
                  <p className="text-[11px] font-black text-slate-600 uppercase tracking-wider">SON ANALİZLER</p>
                </div>
                {gecmis.length > 0 && (
                  <span className="text-[9px] font-black text-slate-400">{gecmis.length}</span>
                )}
              </div>

              {gecmisYuk ? (
                <div className="px-4 py-6 text-center">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-300 mx-auto" />
                  <p className="text-[10px] font-bold text-slate-400 mt-2">Geçmiş okunuyor...</p>
                </div>
              ) : gecmisHata ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-[11px] font-black text-rose-600">Geçmiş okunamadı</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-1 break-words">{gecmisHata}</p>
                  <button onClick={gecmisGetir} className="text-[10px] font-black text-slate-600 underline mt-2">
                    Tekrar dene
                  </button>
                </div>
              ) : gecmis.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-[11px] font-black text-slate-500">Henüz analiz yok</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">
                    İlk fotoğraf analizinden sonra kayıtlar burada listelenir.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50 max-h-56 overflow-y-auto">
                  {gecmis.slice(0, 6).map((g: any, i: number) => (
                    <div key={g?.id || i} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-black text-slate-700 truncate">{g?.musteri || 'Bilinmiyor'}</span>
                        <span className={`text-[9px] font-black shrink-0 ${
                          sayi(g?.guven) >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>%{yuzde(g?.guven)}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                        {g?.tespit || '—'}{g?.tarih ? ` · ${g.tarih}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                <input type="number" min={0} step={1} value={fMesafe} onChange={(e) => setFMesafe(e.target.value)}
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
              <p className="text-[9px] text-slate-400 font-medium text-center">
                Tüm tutarlar <strong>KDV hariç</strong> hesaplanır
              </p>
            </div>
          </div>

          <div>
            {fiyatYuk ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mx-auto" />
                <p className="text-xs font-black text-slate-600 mt-3">Geçmiş işler taranıyor...</p>
                <p className="text-[10px] text-slate-400 font-medium mt-1">Medyan · mesafe · aciliyet · sadakat</p>
              </div>
            ) : f ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-black text-white uppercase tracking-wider">ÖNERİLEN FİYAT</p>
                  <span className="text-[9px] font-black text-emerald-50 bg-white/20 px-2 py-1 rounded-lg shrink-0">
                    KDV HARİÇ
                  </span>
                </div>
                <div className="p-5">
                  <div className="text-center mb-5">
                    <p className="text-4xl font-black text-emerald-700 leading-none">{para(f.oneri)} ₺</p>
                    <p className="text-[9px] font-bold text-slate-400 mt-1">KDV hariç</p>
                    <p className="text-[11px] font-bold text-slate-400 mt-2">
                      Makul aralık (KDV hariç): {para(f.alt_sinir)} – {para(f.ust_sinir)} ₺
                    </p>
                  </div>

                  <div className="space-y-2 mb-4">
                    {kirilim.filter((x) => sayi(x.v) !== 0).map((x, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] font-bold py-1.5 border-b border-slate-50 last:border-0">
                        <span className="text-slate-500">{x.e}</span>
                        <span className={`${
                          x.renk === 'emerald' ? 'text-emerald-600'
                          : x.renk === 'orange' ? 'text-orange-600'
                          : x.renk === 'blue' ? 'text-blue-600' : 'text-slate-700'}`}>
                          {x.arti && sayi(x.v) > 0 ? '+' : ''}{para(x.v)} ₺
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase">Tahmini Malzeme</p>
                      <p className="text-sm font-black text-slate-700">{para(f.tahmini_malzeme)} ₺</p>
                      <p className="text-[8px] font-bold text-slate-400 mt-0.5">KDV hariç</p>
                    </div>
                    <div className={`rounded-2xl p-3 border ${
                      sayi(f.tahmini_kar_orani) >= 30 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                      <p className={`text-[9px] font-black uppercase ${
                        sayi(f.tahmini_kar_orani) >= 30 ? 'text-emerald-600' : 'text-amber-600'}`}>Tahmini Kâr Marjı</p>
                      <p className={`text-sm font-black ${
                        sayi(f.tahmini_kar_orani) >= 30 ? 'text-emerald-700' : 'text-amber-700'}`}>
                        %{Math.round(sayi(f.tahmini_kar_orani))}
                      </p>
                    </div>
                  </div>

                  {f.uyari && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mt-3">
                      <p className="text-[11px] font-bold text-amber-700">{f.uyari}</p>
                    </div>
                  )}

                  {f.mesaj && (
                    <p className="text-[10px] text-slate-400 font-medium mt-3 leading-relaxed">{f.mesaj}</p>
                  )}
                  {sayi(f.musteri_is) > 0 && (
                    <p className="text-[10px] font-bold text-emerald-600 mt-2">
                      👤 Bu müşteriyle {sayi(f.musteri_is)} iş yapıldı · toplam {para(f.musteri_ciro)} ₺ (KDV hariç)
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
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[10px] font-bold text-slate-400">
              {anomali?.tarih ? `Son tarama: ${anomali.tarih}` : 'Tarama hazır'} · tutarlar KDV hariç
            </p>
            <button onClick={anomaliGetir} disabled={anomaliYuk}
              className="bg-white border border-slate-200 px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-slate-100">
              <RefreshCw size={14} className={anomaliYuk ? 'animate-spin' : ''} /> TARA
            </button>
          </div>

          {anomaliYuk ? (
            <div className="py-16 text-center"><Loader2 className="w-9 h-9 animate-spin text-slate-400 mx-auto" /></div>
          ) : anomaliHata ? (
            <div className="bg-white rounded-3xl border border-rose-200 p-12 text-center">
              <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
              <p className="text-sm font-black text-slate-700">Anomali taraması yapılamadı</p>
              <p className="text-[11px] text-slate-400 font-medium mt-1 break-words">{anomaliHata}</p>
              <button onClick={anomaliGetir}
                className="mt-4 bg-slate-900 text-white px-4 py-2.5 rounded-2xl font-black text-xs inline-flex items-center gap-2">
                <RefreshCw size={13} /> TEKRAR DENE
              </button>
            </div>
          ) : !anomali || sayi(anomali.toplam) === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-sm font-black text-slate-700">Anomali yok 🎉</p>
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
                  <p className="text-xl font-black text-white mt-1">{sayi(anomali.toplam)} uyarı</p>
                </div>
                {sayi(anomali.yuksek_oncelikli) > 0 && (
                  <div className="bg-white/20 rounded-2xl px-4 py-2 text-center">
                    <p className="text-2xl font-black text-white leading-none">{sayi(anomali.yuksek_oncelikli)}</p>
                    <p className="text-[9px] font-black text-rose-100">ACİL</p>
                  </div>
                )}
              </div>

              {(Array.isArray(anomali.uyarilar) ? anomali.uyarilar : []).map((u: any, i: number) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.05, 0.3) }}
                  className={`bg-white rounded-3xl border-2 p-4 ${
                    u?.seviye === 'yuksek' ? 'border-rose-200' : u?.seviye === 'orta' ? 'border-amber-200' : 'border-slate-200'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                      u?.seviye === 'yuksek' ? 'bg-rose-100 text-rose-600'
                      : u?.seviye === 'orta' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                      {u?.tip === 'gider' ? <TrendingUp size={18} />
                        : u?.tip === 'kar' ? <Calculator size={18} />
                        : u?.tip === 'musteri' ? <AlertTriangle size={18} /> : <Clock size={18} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-black text-slate-800 leading-tight">{u?.baslik || 'Uyarı'}</p>
                      {u?.detay && <p className="text-[11px] text-slate-500 font-medium mt-1">{u.detay}</p>}
                      {u?.oneri && (
                        <div className="bg-slate-50 rounded-xl p-2.5 mt-2 border border-slate-100">
                          <p className="text-[10px] font-bold text-slate-600 flex items-start gap-1.5">
                            <Lightbulb size={11} className="text-amber-500 mt-0.5 shrink-0" /> {u.oneri}
                          </p>
                        </div>
                      )}
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
