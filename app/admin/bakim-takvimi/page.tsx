'use client';

// ============================================================================
//  🗓️ BAKIM TAKVİMİ — Yıllık görünüm + mevsim kampanyası + abonelik fırsatları
// ----------------------------------------------------------------------------
//  Veri: bakim_durumu() · bakim_takvimi() · mevsim_kampanya() · bakim_firsatlari()
//  İlke: her bölüm ayrı yüklenir, biri gelmezse ekran çökmez
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  CalendarDays, Loader2, RefreshCw, ArrowLeft, AlertTriangle, Clock,
  CheckCircle2, Search, Copy, Check, Wallet, TrendingUp, Megaphone, X
} from 'lucide-react';

const AYLAR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const AYLAR_UZUN = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

const aylarRenk = (d: string) =>
  d === 'yapildi' ? 'bg-emerald-500'
  : d === 'planli' ? 'bg-blue-500'
  : d === 'gecikti' ? 'bg-rose-500'
  : 'bg-slate-200';

export default function BakimTakvimiPage() {
  const [durum, setDurum] = useState<any>(null);
  const [liste, setListe] = useState<any[]>([]);
  const [kampanya, setKampanya] = useState<any>(null);
  const [firsatlar, setFirsatlar] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState('');
  const [arama, setArama] = useState('');
  const [filtre, setFiltre] = useState('hepsi');
  const [yil, setYil] = useState(new Date().getFullYear());
  const [kopyalandi, setKopyalandi] = useState(false);
  const [kampanyaAcik, setKampanyaAcik] = useState(false);
  const [planModal, setPlanModal] = useState<any>(null);
  const [planTarih, setPlanTarih] = useState('');
  const [mesaj, setMesaj] = useState('');

  const getir = useCallback(async () => {
    setYukleniyor(true);
    setHata('');
    try {
      const [d, l, k, f] = await Promise.all([
        supabase.rpc('bakim_durumu'),
        supabase.rpc('bakim_takvimi', { p_yil: yil, p_limit: 400 }),
        supabase.rpc('mevsim_kampanya'),
        supabase.rpc('bakim_firsatlari', { p_limit: 20 }),
      ]);
      if (d.error) setHata(d.error.message);
      setDurum(d.data);
      setListe(l.data || []);
      setKampanya(k.data);
      setFirsatlar(f.data || []);
    } finally { setYukleniyor(false); }
  }, [yil]);

  useEffect(() => { getir(); }, [getir]);

  const planla = async () => {
    if (!planModal || !planTarih) return;
    const { data, error } = await supabase.rpc('bakim_planla', {
      p_crane_id: planModal.crane_id, p_tarih: planTarih, p_not: null,
    });
    if (error || !(data as any)?.ok) {
      setMesaj(error?.message || (data as any)?.mesaj || 'Planlanamadı.');
      return;
    }
    setMesaj('✅ ' + (data as any).mesaj);
    setPlanModal(null); setPlanTarih('');
    await getir();
    setTimeout(() => setMesaj(''), 3500);
  };

  const kopyala = async () => {
    try {
      await navigator.clipboard.writeText(kampanya?.mesaj || '');
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2500);
    } catch { /* yoksay */ }
  };

  const filtreli = liste.filter((x) => {
    if (arama.trim() && !String(x.musteri || '').toLocaleLowerCase('tr-TR').includes(arama.toLocaleLowerCase('tr-TR'))) return false;
    if (filtre === 'hepsi') return true;
    return x.durum === filtre;
  });

  const kampanyaPotansiyel = Number(kampanya?.potansiyel || 0);
  const firsatPotansiyel = firsatlar.reduce((t, f) => t + Number(f.tahmini_gelir || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8">

      {/* ÜST BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-slate-800 flex items-center gap-2.5">
            <CalendarDays className="text-blue-600" size={30} /> BAKIM TAKVİMİ
          </h1>
          <p className="text-slate-500 text-xs md:text-sm mt-0.5">
            {yil} yılı bakım planı · mevsim kampanyası · abonelik fırsatları
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button onClick={() => setYil(yil - 1)} className="bg-white border border-slate-200 px-3.5 py-3 rounded-2xl font-black text-xs hover:bg-slate-100">‹</button>
          <span className="bg-slate-900 text-white px-5 py-3 rounded-2xl font-black text-xs flex items-center">{yil}</span>
          <button onClick={() => setYil(yil + 1)} className="bg-white border border-slate-200 px-3.5 py-3 rounded-2xl font-black text-xs hover:bg-slate-100">›</button>
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
            → <code className="bg-white px-1.5 py-0.5 rounded">72-bakim-takvimi-ve-kampanya.sql</code> çalıştırıldı mı?
          </p>
        </div>
      )}

      {mesaj && (
        <div className={`p-4 rounded-2xl text-xs font-bold mb-5 border ${
          mesaj.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
        }`}>{mesaj}</div>
      )}

      {/* BAKIM DURUMU */}
      {durum && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-rose-50 border border-rose-200 rounded-3xl p-4">
              <p className="text-[10px] font-black text-rose-600 uppercase tracking-wider flex items-center gap-1"><AlertTriangle size={11}/> GECİKMİŞ</p>
              <p className="text-2xl md:text-3xl font-black text-rose-700 mt-1 leading-none">{durum.gecikmis}</p>
              <p className="text-[10px] font-bold text-rose-500 mt-1">bakım tarihi geçmiş</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4">
              <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider flex items-center gap-1"><Clock size={11}/> BU HAFTA</p>
              <p className="text-2xl md:text-3xl font-black text-amber-700 mt-1 leading-none">{durum.bu_hafta}</p>
              <p className="text-[10px] font-bold text-amber-500 mt-1">7 gün içinde</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-3xl p-4">
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">BU AY</p>
              <p className="text-2xl md:text-3xl font-black text-blue-700 mt-1 leading-none">{durum.bu_ay}</p>
              <p className="text-[10px] font-bold text-blue-500 mt-1">30 gün içinde</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-3xl p-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">UYUM ORANI</p>
              <p className="text-2xl md:text-3xl font-black text-slate-700 mt-1 leading-none">%{durum.uyum_orani}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">
                {durum.sozlesmeli} sözleşmeli · {durum.sozlesmesiz} sözleşmesiz
              </p>
            </div>
          </div>

          {/* ABONELİK FIRSATI BANTI */}
          {firsatPotansiyel > 0 && (
            <div className="bg-gradient-to-r from-violet-600 to-purple-700 rounded-3xl p-4 md:p-5 mb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black text-violet-200 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp size={13}/> ABONELİK FIRSATI
                </p>
                <p className="text-lg md:text-xl font-black text-white mt-1 leading-tight">
                  {firsatlar.length} sözleşmesiz müşteri · <span className="text-violet-200">{para(firsatPotansiyel)} ₺/yıl potansiyel</span>
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <a href="#firsatlar" className="bg-white text-violet-700 px-4 py-2.5 rounded-2xl font-black text-xs">LİSTEYİ GÖR</a>
              </div>
            </div>
          )}
        </>
      )}

      {/* MEVSİM KAMPANYASI */}
      {kampanya && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-5">
          <div className="bg-gradient-to-r from-orange-500 to-amber-600 px-4 py-3 flex items-center justify-between">
            <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Megaphone size={15} /> {kampanya.baslik}
            </p>
            <span className="text-[10px] font-black text-amber-100">
              {AYLAR_UZUN[Number(kampanya.ay) - 1]} ayı
            </span>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                <p className="text-[9px] font-black text-slate-400 uppercase">Hizmet</p>
                <p className="text-[11px] font-bold text-slate-700 mt-0.5 leading-snug">{kampanya.hizmet}</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                <p className="text-[9px] font-black text-slate-400 uppercase">Hedef</p>
                <p className="text-lg font-black text-slate-700 leading-none mt-1">{kampanya.hedef_adet} <span className="text-[10px] font-bold text-slate-400">müşteri</span></p>
              </div>
              <div className="bg-emerald-50 rounded-2xl p-3 border border-emerald-100">
                <p className="text-[9px] font-black text-emerald-600 uppercase">Potansiyel Gelir</p>
                <p className="text-lg font-black text-emerald-700 leading-none mt-1">{para(kampanyaPotansiyel)} ₺</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={kopyala}
                className="flex-1 bg-slate-900 text-white px-4 py-3 rounded-2xl font-black text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition">
                {kopyalandi ? <Check size={15} /> : <Copy size={15} />}
                {kopyalandi ? 'KOPYALANDI!' : 'MESAJI KOPYALA (WhatsApp)'}
              </button>
              <button onClick={() => setKampanyaAcik(true)}
                className="bg-white border border-slate-200 px-4 py-3 rounded-2xl font-black text-xs text-slate-600">
                HEDEFLERİ GÖR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ARAMA + FİLTRE */}
      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input type="text" value={arama} onChange={(e) => setArama(e.target.value)}
            placeholder="Müşteri ara..."
            className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-blue-400" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { k: 'hepsi', a: 'Hepsi' },
            { k: 'gecikmis', a: '🔴 Gecikmiş' },
            { k: 'yaklasan', a: '🟠 Yaklaşan' },
            { k: 'planli', a: '🔵 Planlı' },
            { k: 'tarihsiz', a: '⚪ Tarihsiz' },
          ].map((f) => (
            <button key={f.k} onClick={() => setFiltre(f.k)}
              className={`px-3.5 py-3 rounded-2xl text-[11px] font-black border transition whitespace-nowrap ${
                filtre === f.k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
              }`}>{f.a}</button>
          ))}
        </div>
      </div>

      {/* TAKVİM LİSTESİ */}
      {yukleniyor ? (
        <div className="py-20 text-center"><Loader2 className="w-9 h-9 animate-spin text-slate-400 mx-auto" /></div>
      ) : filtreli.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
          <CheckCircle2 className="w-11 h-11 text-slate-300 mx-auto mb-3" />
          <p className="font-black text-slate-600">Kayıt bulunamadı</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[860px]">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase sticky left-0 bg-slate-50">Müşteri</th>
                  {AYLAR.map((a) => (
                    <th key={a} className="text-center px-1 py-3 text-[10px] font-black text-slate-500 uppercase w-10">{a}</th>
                  ))}
                  <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase">Sonraki</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtreli.slice(0, 120).map((c: any) => {
                  const aylarMap: Record<number, string> = {};
                  (Array.isArray(c.aylar) ? c.aylar : []).forEach((a: any) => { aylarMap[Number(a.ay)] = a.durum; });
                  return (
                    <tr key={c.crane_id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 sticky left-0 bg-white">
                        <p className="font-black text-slate-700 truncate max-w-[200px]">{c.musteri}</p>
                        <p className="text-[9px] font-bold text-slate-400">
                          {c.vinc} · {c.makine_tipi}
                          {c.sozlesmeli && <span className="ml-1 text-blue-600">🔄 sözleşmeli</span>}
                        </p>
                      </td>
                      {AYLAR.map((_, i) => {
                        const d = aylarMap[i + 1] || 'bos';
                        return (
                          <td key={i} className="px-1 py-2.5">
                            <div className={`w-full h-6 rounded-md ${aylarRenk(d)} ${d === 'bos' ? 'opacity-40' : ''}`}
                              title={`${AYLAR_UZUN[i]}: ${d === 'yapildi' ? 'Servis yapıldı' : d === 'planli' ? 'Planlandı' : d === 'gecikti' ? 'GECİKMİŞ' : 'Kayıt yok'}`} />
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-right">
                        <p className={`text-[10px] font-black ${
                          c.durum === 'gecikmis' ? 'text-rose-600'
                          : c.durum === 'yaklasan' ? 'text-amber-600'
                          : c.durum === 'planli' ? 'text-blue-600' : 'text-slate-400'}`}>
                          {c.sonraki || '—'}
                        </p>
                        {Number(c.gecikme) > 0 && (
                          <p className="text-[9px] font-bold text-rose-500">{c.gecikme} gün geçti</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => { setPlanModal(c); setPlanTarih(''); }}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl font-black text-[10px] whitespace-nowrap">
                          PLANLA
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-4 px-4 py-3 bg-slate-50 border-t border-slate-100 flex-wrap">
            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /> Servis yapıldı</span>
            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500" /> Planlandı</span>
            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-500" /> Gecikmiş</span>
            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-200" /> Kayıt yok</span>
            <span className="text-[10px] font-bold text-slate-400 ml-auto">{filtreli.length} vinç gösteriliyor</span>
          </div>
        </div>
      )}

      {/* ABONELİK FIRSATLARI */}
      {firsatlar.length > 0 && (
        <div id="firsatlar" className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mt-5">
          <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-4 py-3 flex items-center justify-between">
            <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Wallet size={15} /> ABONELİK FIRSATLARI
            </p>
            <span className="text-[10px] font-black text-violet-100">{para(firsatPotansiyel)} ₺/yıl</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr className="text-[10px] font-black text-slate-500 uppercase">
                  <th className="text-left px-4 py-2.5">Müşteri</th>
                  <th className="text-right px-3 py-2.5">Vinç</th>
                  <th className="text-right px-3 py-2.5">Yıllık Ciro</th>
                  <th className="text-right px-3 py-2.5">Son Servis</th>
                  <th className="text-left px-3 py-2.5">Önerilen Paket</th>
                  <th className="text-right px-4 py-2.5">Tahmini Gelir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {firsatlar.map((f: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-black text-slate-700 truncate max-w-[200px]">{f.musteri}</td>
                    <td className="px-3 py-2.5 text-right font-black text-slate-600">{f.vinc_sayisi}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-500">{para(f.yillik_ciro)} ₺</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="font-bold text-slate-500">{f.son_servis || '—'}</span>
                      {Number(f.gun_once) > 180 && (
                        <span className="block text-[9px] font-black text-amber-600">{f.gun_once} gün önce</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200 rounded-lg px-2 py-0.5">
                        {f.onerilen_paket}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-black text-emerald-700">{para(f.tahmini_gelir)} ₺</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ BAKIM PLANLA MODALI ═══ */}
      <AnimatePresence>
        {planModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4"
            onClick={() => setPlanModal(null)}>
            <motion.div initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="min-w-0">
                  <h2 className="font-black text-slate-800 truncate">BAKIM PLANLA</h2>
                  <p className="text-[11px] font-bold text-slate-400 truncate">{planModal.musteri}</p>
                </div>
                <button onClick={() => setPlanModal(null)} className="p-2 hover:bg-slate-100 rounded-xl"><X size={20} className="text-slate-400" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Bakım Tarihi</label>
                  <input type="date" value={planTarih} onChange={(e) => setPlanTarih(e.target.value)}
                    className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-blue-500" />
                </div>
                <div className="flex gap-2">
                  {[7, 14, 30, 90].map((g) => {
                    const t = new Date(); t.setDate(t.getDate() + g);
                    const s = t.toISOString().slice(0, 10);
                    return (
                      <button key={g} onClick={() => setPlanTarih(s)}
                        className={`flex-1 py-2.5 rounded-2xl text-[10px] font-black border transition ${
                          planTarih === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'
                        }`}>+{g}g</button>
                    );
                  })}
                </div>
                <button onClick={planla} disabled={!planTarih}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white py-4 rounded-2xl font-black text-sm">
                  PLANLA
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ KAMPANYA HEDEFLERİ MODALI ═══ */}
      <AnimatePresence>
        {kampanyaAcik && kampanya && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4"
            onClick={() => setKampanyaAcik(false)}>
            <motion.div initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full md:max-w-2xl rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
              <div className="sticky top-0 bg-white px-5 py-4 border-b border-slate-100 flex items-center justify-between z-10">
                <div>
                  <h2 className="font-black text-slate-800">{kampanya.baslik}</h2>
                  <p className="text-[11px] font-bold text-slate-400">{kampanya.hedef_adet} hedef müşteri</p>
                </div>
                <button onClick={() => setKampanyaAcik(false)} className="p-2 hover:bg-slate-100 rounded-xl"><X size={20} className="text-slate-400" /></button>
              </div>
              <div className="p-5">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-2">KAMPANYA MESAJI</p>
                  <pre className="text-[11px] font-medium text-slate-700 whitespace-pre-wrap leading-relaxed font-sans">{kampanya.mesaj}</pre>
                  <button onClick={kopyala}
                    className="mt-3 w-full bg-slate-900 text-white py-3 rounded-2xl font-black text-xs flex items-center justify-center gap-2">
                    {kopyalandi ? <Check size={15} /> : <Copy size={15} />}
                    {kopyalandi ? 'KOPYALANDI!' : 'KOPYALA'}
                  </button>
                </div>

                <p className="text-[10px] font-black text-slate-400 uppercase mb-2">HEDEF MÜŞTERİLER</p>
                <div className="space-y-1.5">
                  {(Array.isArray(kampanya.hedefler) ? kampanya.hedefler : []).map((h: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 bg-white border border-slate-100 rounded-2xl p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-black text-slate-700 truncate">{h.musteri}</p>
                        <p className="text-[10px] font-bold text-slate-400">
                          {h.vinç} · son servis: {h.son_servis || 'hiç'}
                          {Number(h.gun_once) > 0 && ` (${h.gun_once} gün önce)`}
                        </p>
                      </div>
                      {h.telefon && (
                        <a href={`tel:${h.telefon}`}
                          className="shrink-0 bg-emerald-600 text-white px-3 py-2 rounded-xl font-black text-[10px]">
                          ARA
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
