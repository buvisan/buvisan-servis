"use client";

// ----------------------------------------------------------------------------
// BUVISAN - CANLI TAKİP YÖNETİMİ 📍
// Takip başlat → durum güncelle → WhatsApp mesajını kopyala → müşteriye gönder.
// Kaynak: aktif_takipler() + takip_baslat() + takip_guncelle() + takip_mesaji()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Plus, Loader2, ArrowLeft, X, Copy, CheckCircle2, Truck,
  Clock, Wrench, RefreshCw, ExternalLink, Check
} from 'lucide-react';
import { useRouter } from 'next/navigation';

const DURUMLAR = [
  { kod: 'PLANLANDI', ad: 'Planlandı', ikon: Clock, renk: 'bg-slate-100 text-slate-600' },
  { kod: 'YOLDA', ad: 'Yolda', ikon: Truck, renk: 'bg-blue-100 text-blue-700' },
  { kod: 'VARDI', ad: 'Vardı', ikon: MapPin, renk: 'bg-indigo-100 text-indigo-700' },
  { kod: 'CALISIYOR', ad: 'Çalışıyor', ikon: Wrench, renk: 'bg-amber-100 text-amber-700' },
  { kod: 'BITTI', ad: 'Tamamlandı', ikon: CheckCircle2, renk: 'bg-emerald-100 text-emerald-700' },
];

export default function TakipYonetimiSayfasi() {
  const router = useRouter();
  const [takipler, setTakipler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [formAcik, setFormAcik] = useState(false);
  const [mesaj, setMesaj] = useState('');
  const [kopyalanan, setKopyalanan] = useState('');
  const [islemde, setIslemde] = useState('');

  const [musteri, setMusteri] = useState('');
  const [teknisyen, setTeknisyen] = useState('');
  const [vinc, setVinc] = useState('');
  const [adres, setAdres] = useState('');
  const [eta, setEta] = useState('');
  const [varisZaman, setVarisZaman] = useState<Record<string,string>>({});

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data } = await supabase.rpc('aktif_takipler');
      setTakipler(data || []);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  const baslat = async () => {
    if (!musteri.trim()) { setMesaj('Müşteri adı gerekli.'); return; }
    setIslemde('baslat');
    try {
      const { data, error } = await supabase.rpc('takip_baslat', {
        p_musteri: musteri.trim(),
        p_teknisyen: teknisyen || null,
        p_vinc: vinc || null,
        p_adres: adres || null,
        p_konu: null,
      });
      if (error || !(data as any)?.ok) { setMesaj(error?.message || (data as any)?.mesaj || 'Başlatılamadı.'); return; }
      setMesaj('✅ Takip başlatıldı!');
      setMusteri(''); setTeknisyen(''); setVinc(''); setAdres(''); setEta('');
      await getir();
      setTimeout(() => { setFormAcik(false); setMesaj(''); }, 1200);
    } finally { setIslemde(''); }
  };

  const durumGuncelle = async (id: string, durum: string, etaDk?: number) => {
    setIslemde(id + durum);
    try {
      const { error } = await supabase.rpc('takip_guncelle', {
        p_id: id, p_durum: durum, p_lat: null, p_lng: null,
        p_eta_dk: etaDk ?? null, p_not: null,
      });
      if (error) { alert('Güncellenemedi: ' + error.message); return; }
      await getir();
    } finally { setIslemde(''); }
  };

  const varisKaydet = async (id: string) => {
    const deger = varisZaman[id];
    if (!deger) { setMesaj('⚠️ Önce tarih/saat seçin.'); return; }
    setIslemde(id + 'varis');
    try {
      const { data, error } = await supabase.rpc('takip_varis_ayarla', {
        p_id: id,
        p_tahmini_varis: new Date(deger).toISOString(),
        p_musteri_notu: null,
        p_teknisyen: null,
      });
      if (error || !(data as any)?.ok) {
        setMesaj('❌ ' + (error?.message || (data as any)?.mesaj || 'Kaydedilemedi.'));
        return;
      }
      setMesaj('✅ ' + ((data as any).mesaj || 'Varış saati kaydedildi.'));
      setVarisZaman((v) => ({ ...v, [id]: '' }));
      await getir();
      setTimeout(() => setMesaj(''), 4000);
    } finally { setIslemde(''); }
  };

  const mesajKopyala = async (id: string) => {
    setIslemde(id + 'mesaj');
    try {
      const { data, error } = await supabase.rpc('takip_mesaji', { p_id: id });
      if (error || !data) { alert('Mesaj üretilemedi: ' + (error?.message || '')); return; }
      await navigator.clipboard.writeText(String(data));
      setKopyalanan(id);
      setTimeout(() => setKopyalanan(''), 2500);
    } catch {
      alert('Kopyalanamadı.');
    } finally { setIslemde(''); }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8">
      <div className="max-w-[1100px] mx-auto space-y-6">

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin')}
              className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                <MapPin className="text-blue-600" /> CANLI TAKİP
              </h1>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                Müşteriye durum linki gönder · WhatsApp mesajı hazır
              </p>
            </div>
          </div>
          <button onClick={() => setFormAcik(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-2xl font-black text-xs flex items-center gap-2 shadow-lg transition active:scale-95">
            <Plus size={16} /> TAKİP BAŞLAT
          </button>
        </div>

        {yukleniyor && (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-100">
            <Loader2 className="w-7 h-7 animate-spin text-blue-500 mx-auto" />
          </div>
        )}

        {!yukleniyor && takipler.length === 0 && (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-100">
            <MapPin className="w-9 h-9 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-black text-slate-600 mb-1">Aktif takip yok</p>
            <p className="text-[11px] text-slate-400 font-medium mb-4">
              Servise giden teknisyen için takip başlat, müşteriye linki gönder.
            </p>
            <button onClick={() => setFormAcik(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-2xl font-black text-xs transition">
              + TAKİP BAŞLAT
            </button>
          </div>
        )}

        <div className="space-y-3">
          {takipler.map((t) => {
            const d = DURUMLAR.find((x) => x.kod === t.durum) || DURUMLAR[0];
            const Ikon = d.ikon;
            return (
              <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-800 truncate">{t.musteri}</p>
                    <p className="text-[10px] text-slate-400 font-bold">
                      {t.teknisyen || 'Teknisyen atanmadı'}{t.vinc_bilgi ? ` · ${t.vinc_bilgi}` : ''}
                    </p>
                  </div>
                  <span className={`text-[9px] font-black px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0 ${d.renk}`}>
                    <Ikon size={11} /> {d.ad}
                  </span>
                </div>

                {t.tahmini_varis && (
                  <p className="text-[11px] font-black text-blue-700 mb-2">
                    🕐 Tahmini varış: {new Date(t.tahmini_varis).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}

                {/* DURUM GÜNCELLE */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {DURUMLAR.map((x) => (
                    <button key={x.kod}
                      onClick={() => durumGuncelle(t.id, x.kod)}
                      disabled={t.durum === x.kod || islemde === t.id + x.kod}
                      className={`px-3 py-2 rounded-xl text-[10px] font-black transition ${
                        t.durum === x.kod
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-40'
                      }`}>
                      {islemde === t.id + x.kod ? '...' : x.ad}
                    </button>
                  ))}
                </div>

                {/* ETA GİRİŞİ */}
                <div className="flex items-center gap-2 mb-3 bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                  <span className="text-[10px] font-black text-slate-500 shrink-0">VARİŞ (dk sonra):</span>
                  <input type="number" value={eta} onChange={(e) => setEta(e.target.value)}
                    placeholder="25" className="w-20 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500" />
                  <button onClick={() => { durumGuncelle(t.id, 'YOLDA', Number(eta) || 30); setEta(''); }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-[10px] font-black transition">
                    YOLDA + SÜRE
                  </button>
                </div>

                {/* TAHMİNİ VARIŞ SAATİ */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 mb-3">
                  <p className="text-[10px] font-black text-blue-700 mb-2">🕐 TAHMİNİ VARIŞ SAATİ (müşteri görür)</p>
                  <div className="flex items-center gap-2">
                    <input type="datetime-local" value={varisZaman[t.id] || ''}
                      onChange={(e) => setVarisZaman((v) => ({ ...v, [t.id]: e.target.value }))}
                      className="flex-1 p-2 bg-white border border-blue-200 rounded-lg text-[11px] font-bold outline-none focus:border-blue-500" />
                    <button onClick={() => varisKaydet(t.id)} disabled={islemde === t.id + 'varis'}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-3 py-2 rounded-lg text-[10px] font-black transition shrink-0">
                      {islemde === t.id + 'varis' ? '...' : 'KAYDET'}
                    </button>
                  </div>
                </div>

                {/* AKSİYONLAR */}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => mesajKopyala(t.id)} disabled={islemde === t.id + 'mesaj'}
                    className={`flex-1 min-w-[160px] py-3 rounded-xl font-black text-[10px] flex items-center justify-center gap-1.5 transition active:scale-[0.98] ${
                      kopyalanan === t.id ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                    }`}>
                    {kopyalanan === t.id
                      ? <><Check size={13} /> KOPYALANDI — WHATSAPP&apos;A YAPIŞTIR</>
                      : islemde === t.id + 'mesaj'
                        ? <><Loader2 size={13} className="animate-spin" /> HAZIRLANIYOR...</>
                        : <><Copy size={13} /> WHATSAPP MESAJINI KOPYALA</>}
                  </button>
                  <a href={t.link} target="_blank" rel="noopener noreferrer"
                    className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-[10px] flex items-center gap-1.5 transition">
                    <ExternalLink size={13} /> MÜŞTERİ EKRANI
                  </a>
                </div>
              </motion.div>
            );
          })}
        </div>

        {takipler.length > 0 && (
          <button onClick={getir} className="w-full bg-white border border-slate-200 py-3 rounded-2xl font-black text-[11px] text-slate-500 hover:border-blue-300 transition flex items-center justify-center gap-2">
            <RefreshCw size={13} /> YENİLE
          </button>
        )}
      </div>

      {/* YENİ TAKİP FORMU */}
      <AnimatePresence>
        {formAcik && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setFormAcik(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[900]" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed inset-x-0 bottom-0 md:inset-0 md:m-auto md:h-fit md:max-w-lg z-[901] bg-white rounded-t-[2rem] md:rounded-3xl shadow-2xl max-h-[92dvh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
                <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                  <MapPin size={16} className="text-blue-600" /> YENİ TAKİP
                </h3>
                <button onClick={() => setFormAcik(false)} className="bg-slate-100 hover:bg-red-500 hover:text-white text-slate-500 p-2 rounded-full transition">
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Müşteri *</label>
                  <input value={musteri} onChange={(e) => setMusteri(e.target.value)} placeholder="Firma adı"
                    className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-blue-500" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Teknisyen</label>
                    <input value={teknisyen} onChange={(e) => setTeknisyen(e.target.value)} placeholder="GÖKHAN GÖK"
                      className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Makine</label>
                    <input value={vinc} onChange={(e) => setVinc(e.target.value)} placeholder="25 Ton Vinç / 2 Ton Asansör"
                      className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Adres</label>
                  <input value={adres} onChange={(e) => setAdres(e.target.value)} placeholder="Tesis adresi"
                    className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-blue-500" />
                </div>

                {mesaj && (
                  <div className={`p-3 rounded-2xl text-[11px] font-bold ${mesaj.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                    {mesaj}
                  </div>
                )}

                <button onClick={baslat} disabled={islemde === 'baslat'}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98]">
                  {islemde === 'baslat' ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                  TAKİBİ BAŞLAT VE LİNK OLUŞTUR
                </button>
                <p className="text-[10px] text-slate-400 text-center font-medium">
                  Başlattıktan sonra <strong>&quot;WhatsApp mesajını kopyala&quot;</strong> butonuyla müşteriye gönderebilirsin.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
