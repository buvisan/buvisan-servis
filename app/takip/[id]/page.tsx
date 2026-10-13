"use client";

// ----------------------------------------------------------------------------
// BUVISAN - CANLI İŞ TAKİBİ SAYFASI 📍
// Müşteriye verilen link: servis.buvisan.com/takip/<kimlik>
// Giriş gerekmez. Sadece güvenli alanlar gösterilir (is_durumu fonksiyonu).
// Telefon, fiyat, iç notlar ASLA paylaşılmaz.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import { Truck, MapPin, Clock, CheckCircle2, Loader2, RefreshCw, User, Wrench, Phone } from 'lucide-react';

const DURUMLAR = [
  { kod: 'PLANLANDI', ad: 'Planlandı', ikon: Clock },
  { kod: 'YOLDA', ad: 'Yolda', ikon: Truck },
  { kod: 'VARDI', ad: 'Vardı', ikon: MapPin },
  { kod: 'CALISIYOR', ad: 'Çalışıyor', ikon: Wrench },
  { kod: 'BITTI', ad: 'Tamamlandı', ikon: CheckCircle2 },
];

const saat = (t: any) => (t ? new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '-');
const tarihSaat = (t: any) => (t ? new Date(t).toLocaleString('tr-TR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '-');

export default function TakipSayfasi() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';

  const [veri, setVeri] = useState<any>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState(false);

  const getir = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase.rpc('is_durumu', { p_id: id });
      if (error || !(data as any)?.bulundu) { setHata(true); return; }
      setVeri(data);
      setHata(false);
    } catch {
      setHata(true);
    } finally {
      setYukleniyor(false);
    }
  }, [id]);

  useEffect(() => { getir(); }, [getir]);

  // 30 saniyede bir otomatik yenile (iş bitince durur)
  useEffect(() => {
    if (veri?.durum === 'BITTI' || veri?.durum === 'IPTAL') return;
    const zaman = setInterval(getir, 30000);
    return () => clearInterval(zaman);
  }, [getir, veri?.durum]);

  if (yukleniyor) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-9 h-9 animate-spin text-blue-400" />
        <p className="text-slate-400 text-xs font-bold">İş durumu yükleniyor...</p>
      </div>
    );
  }

  if (hata || !veri) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 max-w-sm">
          <MapPin className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <h1 className="text-white font-black mb-2">Takip Bulunamadı</h1>
          <p className="text-slate-400 text-xs leading-relaxed">
            Bu takip linki geçersiz veya kaldırılmış olabilir.
            Lütfen size gönderilen linki kontrol edin.
          </p>
        </div>
      </div>
    );
  }

  const aktifIndex = DURUMLAR.findIndex((d) => d.kod === veri.durum);
  const bitti = veri.durum === 'BITTI';
  const iptal = veri.durum === 'IPTAL';

  const durumRenk = iptal ? 'from-rose-600 to-rose-700'
    : bitti ? 'from-emerald-600 to-teal-700'
    : veri.durum === 'YOLDA' ? 'from-blue-600 to-indigo-700'
    : 'from-slate-700 to-slate-800';

  const durumYazi = iptal ? 'İPTAL EDİLDİ'
    : bitti ? 'İŞ TAMAMLANDI'
    : veri.durum === 'YOLDA' ? 'TEKNİSYENİNİZ YOLDA'
    : veri.durum === 'VARDI' ? 'TEKNİSYENİNİZ VARDİ'
    : veri.durum === 'CALISIYOR' ? 'ÇALIŞMA SÜRÜYOR'
    : 'SERVİS PLANLANDI';

  return (
    <div className="min-h-screen bg-slate-900 font-sans">
      {/* BAŞLIK */}
      <div className={`bg-gradient-to-br ${durumRenk} px-5 pt-10 pb-8 rounded-b-[2rem] shadow-xl relative overflow-hidden`}>
        <div className="absolute -right-8 -bottom-8 opacity-10">
          <Truck size={140} />
        </div>
        <div className="max-w-lg mx-auto relative z-10">
          <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mb-2">
            BUVİSAN VİNÇ SERVİS
          </p>
          <h1 className="text-white font-black text-xl leading-tight mb-4">{durumYazi}</h1>

          <div className="flex items-center gap-3">
            <div className="bg-white/15 backdrop-blur p-2.5 rounded-2xl">
              {veri.durum === 'YOLDA' ? <Truck size={20} className="text-white" />
                : bitti ? <CheckCircle2 size={20} className="text-white" />
                : <Clock size={20} className="text-white" />}
            </div>
            <div>
              <p className="text-white font-black text-sm">{veri.musteri}</p>
              {veri.vinc && <p className="text-white/70 text-[11px] font-bold">{veri.vinc}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-4 pb-28 space-y-4">

        {/* TAHMİNİ VARIŞ */}
        {!bitti && !iptal && veri.tahmini_varis && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-5 shadow-lg border border-slate-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Tahmini Varış</p>
            <p className="text-3xl font-black text-blue-600 leading-none">{saat(veri.tahmini_varis)}</p>
            <p className="text-[11px] text-slate-400 font-bold mt-1">
              {new Date(veri.tahmini_varis).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
            </p>
          </motion.div>
        )}

        {/* TEKNİSYEN */}
        {veri.teknisyen && (
          <div className="bg-white rounded-3xl p-5 shadow-lg border border-slate-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Görevli Teknisyen</p>
            <div className="flex items-center gap-3">
              <div className="bg-blue-50 p-3 rounded-2xl">
                <User size={18} className="text-blue-600" />
              </div>
              <p className="font-black text-slate-800 text-sm">{veri.teknisyen}</p>
            </div>
          </div>
        )}

        {/* DURUM ADIMLARI */}
        <div className="bg-white rounded-3xl p-5 shadow-lg border border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-4">İş Akışı</p>
          <div className="space-y-1">
            {DURUMLAR.map((d, i) => {
              const gecti = iptal ? false : i <= aktifIndex;
              const suAn = !iptal && i === aktifIndex && !bitti;
              const Ikon = d.ikon;
              return (
                <div key={d.kod} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`p-2 rounded-xl transition ${gecti ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-300'}`}>
                      <Ikon size={14} />
                    </div>
                    {i < DURUMLAR.length - 1 && (
                      <div className={`w-0.5 h-6 ${gecti && i < aktifIndex ? 'bg-blue-600' : 'bg-slate-200'}`} />
                    )}
                  </div>
                  <div className="pt-1.5">
                    <p className={`text-xs font-black ${gecti ? 'text-slate-800' : 'text-slate-300'}`}>
                      {d.ad}
                      {suAn && <span className="ml-2 text-[9px] text-blue-600 animate-pulse">● ŞU AN</span>}
                    </p>
                    {d.kod === 'YOLDA' && veri.yola_cikis && (
                      <p className="text-[10px] text-slate-400 font-bold">{saat(veri.yola_cikis)}</p>
                    )}
                    {d.kod === 'VARDI' && veri.varis && (
                      <p className="text-[10px] text-slate-400 font-bold">{saat(veri.varis)}</p>
                    )}
                    {d.kod === 'BITTI' && veri.bitis && (
                      <p className="text-[10px] text-slate-400 font-bold">{saat(veri.bitis)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* KONUM */}
        {veri.konum_guncelleme && (
          <div className="bg-white rounded-3xl p-5 shadow-lg border border-slate-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Son Konum Güncellemesi</p>
            <p className="text-sm font-black text-slate-700">{tarihSaat(veri.konum_guncelleme)}</p>
          </div>
        )}

        {/* NOT */}
        {veri.musteri_notu && (
          <div className="bg-blue-50 border border-blue-100 rounded-3xl p-5">
            <p className="text-[10px] font-black uppercase tracking-wider text-blue-500 mb-1">Bilgilendirme</p>
            <p className="text-xs text-blue-900 font-medium leading-relaxed">{veri.musteri_notu}</p>
          </div>
        )}

        {/* İLETİŞİM */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-5 text-center">
          <p className="text-slate-400 text-[11px] font-bold mb-3">
            Sorularınız için bize ulaşabilirsiniz
          </p>
          <a href="tel:+902242410000"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3.5 rounded-2xl font-black text-xs shadow-lg transition active:scale-95">
            <Phone size={16} /> BUVİSAN&apos;I ARA
          </a>
        </div>

        {/* ALT BİLGİ */}
        <div className="flex items-center justify-between px-2">
          <p className="text-slate-500 text-[10px] font-bold">
            Son güncelleme: {tarihSaat(veri.guncelleme)}
          </p>
          <button onClick={getir} className="text-slate-400 hover:text-white flex items-center gap-1.5 text-[10px] font-black transition">
            <RefreshCw size={12} /> YENİLE
          </button>
        </div>

        {!bitti && !iptal && (
          <p className="text-slate-500 text-[10px] font-medium text-center">
            Bu sayfa 30 saniyede bir kendini yeniler.
          </p>
        )}
      </div>
    </div>
  );
}
