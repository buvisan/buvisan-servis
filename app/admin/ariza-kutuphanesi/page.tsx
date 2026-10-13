"use client";

// ----------------------------------------------------------------------------
// BUVISAN - ARIZA KÜTÜPHANESİ 📚
// Şikayet yaz → daha önce yaşanmış benzer arızaları, çözümlerini ve
// kullanılan parçaları göster. Şirket bilgisi kişilerden şirkete geçer.
// Kaynak: kutuphane_ozeti() + ariza_kategorileri() + ariza_cozum_ara()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Search, Loader2, ArrowLeft, Wrench, Package, User, Clock, Lightbulb, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

const ORNEKLER = ['switch takılı kalmış', 'halat değişimi', 'kumanda çalışmıyor', 'sigorta atıyor', 'fren tutmuyor'];

export default function ArizaKutuphanesiSayfasi() {
  const router = useRouter();
  const [ozet, setOzet] = useState<any>(null);
  const [kategoriler, setKategoriler] = useState<any[]>([]);
  const [arama, setArama] = useState('');
  const [sonuclar, setSonuclar] = useState<any[]>([]);
  const [araniyor, setAraniyor] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [aramaYapildi, setAramaYapildi] = useState(false);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data: o } = await supabase.rpc('kutuphane_ozeti');
      setOzet(o);
      const { data: k } = await supabase.rpc('ariza_kategorileri');
      setKategoriler(k || []);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { yukle(); }, [yukle]);

  const ara = async (metin?: string) => {
    const q = (metin ?? arama).trim();
    if (q.length < 3) return;
    setArama(q);
    setAraniyor(true);
    setAramaYapildi(true);
    try {
      const { data } = await supabase.rpc('ariza_cozum_ara', { p_sikayet: q, p_limit: 15 });
      setSonuclar(data || []);
    } finally {
      setAraniyor(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8">
      <div className="max-w-[1200px] mx-auto space-y-6">

        {/* BAŞLIK */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin')}
            className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
              <BookOpen className="text-violet-600" /> ARIZA KÜTÜPHANESİ
            </h1>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
              Geçmiş çözümler · {ozet?.kayit_sayisi || 0} kayıt · {ozet?.kategori_sayisi || 0} kategori
            </p>
          </div>
        </div>

        {/* ARAMA */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs font-black text-slate-700 mb-3 flex items-center gap-2">
            <Search size={14} className="text-violet-600" /> ARIZA ARA — şikayeti yaz, geçmiş çözümü gör
          </p>
          <div className="flex flex-col md:flex-row gap-2">
            <input
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') ara(); }}
              placeholder="Örn: switch takılı kalmış, halat değişimi, kumanda çalışmıyor..."
              className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-violet-500 text-sm"
            />
            <button onClick={() => ara()} disabled={araniyor || arama.trim().length < 3}
              className="bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white px-8 py-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-95">
              {araniyor ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              ARA
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {ORNEKLER.map((o) => (
              <button key={o} onClick={() => ara(o)}
                className="bg-slate-100 hover:bg-violet-50 hover:text-violet-700 text-slate-500 rounded-xl px-3 py-2 text-[10px] font-bold transition">
                {o}
              </button>
            ))}
          </div>
        </div>

        {/* ARAMA SONUÇLARI */}
        <AnimatePresence>
          {aramaYapildi && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {araniyor ? (
                <div className="bg-white rounded-3xl p-10 text-center border border-slate-100">
                  <Loader2 className="w-7 h-7 animate-spin text-violet-500 mx-auto" />
                  <p className="text-xs text-slate-400 font-bold mt-3">Geçmiş çözümler taranıyor...</p>
                </div>
              ) : sonuclar.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5">
                  <p className="text-xs font-bold text-amber-800">
                    Bu şikayete benzer geçmiş kayıt bulunamadı. Farklı kelimelerle deneyin
                    (örn. sadece parça adı: <em>&quot;halat&quot;</em>, <em>&quot;switch&quot;</em>).
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs font-black text-slate-700">
                      <Lightbulb size={14} className="inline text-amber-500 mr-1" />
                      {sonuclar.length} BENZER ÇÖZÜM BULUNDU
                    </p>
                    <button onClick={() => { setAramaYapildi(false); setSonuclar([]); setArama(''); }}
                      className="text-[10px] font-black text-slate-400 hover:text-rose-500">TEMİZLE</button>
                  </div>

                  {sonuclar.map((s, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-slate-800 truncate">{s.musteri}</p>
                          <p className="text-[10px] text-slate-400 font-bold flex items-center gap-2">
                            <Clock size={10} />
                            {s.tarih ? new Date(s.tarih).toLocaleDateString('tr-TR') : '-'}
                            {s.teknisyen && <><User size={10} /> {s.teknisyen}</>}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[11px] font-black text-emerald-700">{para(s.tutar)} ₺</span>
                          <p className="text-[9px] font-black text-violet-500">
                            eşleşme {s.benzerlik}
                          </p>
                        </div>
                      </div>

                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                          <Wrench size={10} /> ÇÖZÜM
                        </p>
                        <p className="text-[11px] text-slate-700 leading-relaxed">{s.aciklama}</p>
                      </div>

                      {s.parcalar && (
                        <div className="mt-2 flex items-start gap-2">
                          <Package size={12} className="text-blue-500 mt-0.5 shrink-0" />
                          <p className="text-[10px] text-slate-500 font-bold">{s.parcalar}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* KATEGORİLER */}
        {!aramaYapildi && (
          <>
            {ozet && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Çözüm Kaydı</p>
                  <p className="text-xl md:text-2xl font-black text-slate-800 leading-none">{ozet.kayit_sayisi}</p>
                </div>
                <div className="bg-violet-50 rounded-2xl p-4 border border-violet-100">
                  <p className="text-[10px] font-black uppercase tracking-wider text-violet-500 mb-1">En Sık Arıza</p>
                  <p className="text-lg font-black text-violet-700 leading-none uppercase">{ozet.en_sik_ariza || '-'}</p>
                  <p className="text-[10px] text-violet-500 font-bold mt-1">{ozet.en_sik_adet} kez</p>
                </div>
                <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-500 mb-1">En Pahalı Arıza</p>
                  <p className="text-lg font-black text-amber-700 leading-none uppercase">{ozet.en_pahali_ariza || '-'}</p>
                  <p className="text-[10px] text-amber-500 font-bold mt-1">ort. {para(ozet.en_pahali_tutar)} ₺</p>
                </div>
                <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-1">Toplam Değer</p>
                  <p className="text-xl md:text-2xl font-black text-emerald-700 leading-none">{para(ozet.toplam_cozum_degeri)} ₺</p>
                </div>
              </div>
            )}

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <TrendingUp size={16} className="text-violet-600" />
                <h2 className="font-black text-slate-800 text-sm">ARIZA KATEGORİLERİ</h2>
                <span className="text-[10px] text-slate-400 font-bold ml-auto">en sık → en seyrek</span>
              </div>

              {yukleniyor ? (
                <div className="p-10 text-center"><Loader2 className="w-7 h-7 animate-spin text-violet-500 mx-auto" /></div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {kategoriler.map((k) => {
                    const enBuyuk = Number(kategoriler[0]?.adet || 1);
                    return (
                      <div key={k.kategori} className="p-4 hover:bg-slate-50/70 transition cursor-pointer"
                        onClick={() => ara(k.kategori)}>
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <p className="text-xs font-black text-slate-800 uppercase">{k.kategori}</p>
                          <div className="text-right shrink-0">
                            <span className="text-[11px] font-black text-violet-700">{k.adet} kez</span>
                            <span className="text-[10px] text-slate-400 font-bold ml-2">ort. {para(k.ort_tutar)} ₺</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-500" style={{ width: `${(Number(k.adet) / enBuyuk) * 100}%` }} />
                          </div>
                          <span className="text-[9px] font-bold text-slate-400 w-28 text-right shrink-0">
                            {k.musteri_sayisi} firma · son {k.son_kayit ? new Date(k.son_kayit).toLocaleDateString('tr-TR') : '-'}
                          </span>
                        </div>
                        {k.ornek_cozum && (
                          <p className="text-[10px] text-slate-400 italic mt-1.5 truncate">
                            ör: “{String(k.ornek_cozum).slice(0, 90)}”
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-[10px] text-slate-400 font-medium text-center px-4">
              Bir arıza tipine dokunarak o kategorideki <strong>tüm geçmiş çözümleri</strong> görebilirsin.
              Bilgi böylece kişilerden şirkete kalır.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
