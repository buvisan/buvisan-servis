'use client';

// ----------------------------------------------------------------------------
// BUVISAN - TEKLİF BEKLEYENLER 📄
// Periyodik kontrol / servis sonrası arıza tespit edilen işler.
// Teklif verilince veya "gerekmiyor" denince listeden çıkar.
// Kaynak: teklif_bekleyen_listesi() + teklif_durum_guncelle()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Loader2, ArrowLeft, CheckCircle2, XCircle, RefreshCw,
  Phone, AlertTriangle, Clock, Users
} from 'lucide-react';

const DURUMLAR = [
  { k: 'BEKLIYOR', a: '⏳ Bekleyen' },
  { k: 'TEKLIF_VERILDI', a: '✅ Teklif Verildi' },
  { k: 'GEREKMIYOR', a: '✖️ Gerekmiyor' },
];

export default function TeklifBekleyenlerPage() {
  const [liste, setListe] = useState<any[]>([]);
  const [durum, setDurum] = useState('BEKLIYOR');
  const [yukleniyor, setYukleniyor] = useState(true);
  const [islemde, setIslemde] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState('');
  const [hata, setHata] = useState('');

  const getir = useCallback(async () => {
    setYukleniyor(true);
    setHata('');
    try {
      const { data, error } = await supabase.rpc('teklif_bekleyen_listesi', { p_durum: durum });
      if (error) { setHata(error.message); setListe([]); return; }
      setListe(data || []);
    } finally { setYukleniyor(false); }
  }, [durum]);

  useEffect(() => { getir(); }, [getir]);

  const durumDegistir = async (id: string, yeni: string) => {
    setIslemde(id);
    setMesaj('');
    try {
      const { data, error } = await supabase.rpc('teklif_durum_guncelle', {
        p_id: id, p_durum: yeni, p_not: null,
      });
      if (error || !(data as any)?.ok) {
        setMesaj(error?.message || (data as any)?.mesaj || 'İşlem yapılamadı.');
        return;
      }
      setMesaj('✅ ' + ((data as any).mesaj || 'Güncellendi.'));
      await getir();
      setTimeout(() => setMesaj(''), 3000);
    } finally { setIslemde(null); }
  };

  const taramaYap = async () => {
    setYukleniyor(true);
    try {
      await supabase.rpc('teklif_bekleyen_tara');
      await getir();
      setMesaj('✅ Tarama tamamlandı.');
      setTimeout(() => setMesaj(''), 3000);
    } finally { setYukleniyor(false); }
  };

  const kaynakRenk = (k: string) =>
    k === 'sozlesmeli' ? 'bg-blue-50 text-blue-700 border-blue-200'
    : k === 'tek_seferlik' ? 'bg-violet-50 text-violet-700 border-violet-200'
    : k === 'garanti' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : k === 'manuel' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-slate-50 text-slate-600 border-slate-200';

  const bekleyenSayi = liste.filter((x) => x.durum === 'BEKLIYOR').length;

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8">
      {/* ÜST BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">
            <FileText className="text-violet-600" size={26} /> TEKLİF BEKLEYENLER
          </h1>
          <p className="text-slate-500 text-xs md:text-sm">
            Arıza tespit edilen işler · teklif verilince otomatik kapanır
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto flex-wrap">
          <button onClick={taramaYap} disabled={yukleniyor}
            className="flex-1 md:flex-none bg-white border border-slate-200 px-4 py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-100 transition">
            <RefreshCw size={16} className={yukleniyor ? 'animate-spin' : ''} /> TARAMA YAP
          </button>
          <a href="/admin"
            className="flex-1 md:flex-none bg-white border border-slate-200 px-4 py-3 rounded-2xl font-bold text-xs text-slate-600 flex items-center justify-center gap-2 hover:bg-slate-100 transition">
            <ArrowLeft size={16} /> Panel
          </a>
        </div>
      </div>

      {/* DURUM SEKMELERİ */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {DURUMLAR.map((d) => (
          <button key={d.k} onClick={() => setDurum(d.k)}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black whitespace-nowrap border transition ${
              durum === d.k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
            }`}>
            {d.a}
          </button>
        ))}
      </div>

      {mesaj && (
        <div className={`p-4 rounded-2xl text-xs font-bold mb-4 border ${
          mesaj.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
        }`}>{mesaj}</div>
      )}

      {hata && (
        <div className="p-4 rounded-2xl text-xs font-bold mb-4 bg-rose-50 text-rose-700 border border-rose-200 flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-black">Liste alınamadı</p>
            <p className="font-medium mt-1">{hata}</p>
            <p className="font-medium mt-1 text-[10px]">SQL 60 çalıştırıldı mı?</p>
          </div>
        </div>
      )}

      {yukleniyor ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" />
        </div>
      ) : liste.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <p className="font-black text-slate-700">
            {durum === 'BEKLIYOR' ? 'Bekleyen teklif yok! 🎉' : 'Bu durumda kayıt yok.'}
          </p>
          <p className="text-xs text-slate-400 font-medium mt-1">
            {durum === 'BEKLIYOR' ? 'Tüm teklifler verilmiş, eline sağlık.' : ''}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {liste.map((t) => (
              <motion.div key={t.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <h3 className="font-black text-slate-800 text-base leading-tight truncate">
                        {t.musteri_adi}
                      </h3>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                        <span className={`text-[9px] font-black px-2 py-1 rounded-lg border ${kaynakRenk(t.kaynak)}`}>
                          {t.kaynak_etiket}
                        </span>
                        <span className="text-[9px] font-black px-2 py-1 rounded-lg border bg-slate-50 text-slate-500 border-slate-200 flex items-center gap-1">
                          <Clock size={9} /> {t.gun_gecmis} gün önce
                        </span>
                      </div>
                    </div>
                    {durum === 'BEKLIYOR' && (
                      <button onClick={() => durumDegistir(t.id, 'TEKLIF_VERILDI')} disabled={islemde === t.id}
                        className="shrink-0 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-3.5 py-2.5 rounded-2xl font-black text-[10px] flex items-center gap-1.5 transition active:scale-95">
                        {islemde === t.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        TEKLİF VERİLDİ
                      </button>
                    )}
                  </div>

                  {t.ariza_ozeti && (
                    <p className="text-[11px] text-slate-600 font-medium bg-slate-50 border border-slate-100 rounded-2xl p-3 leading-relaxed">
                      {t.ariza_ozeti}
                    </p>
                  )}

                  {durum === 'BEKLIYOR' && (
                    <div className="flex gap-2 mt-2.5">
                      <button onClick={() => durumDegistir(t.id, 'GEREKMIYOR')} disabled={islemde === t.id}
                        className="flex-1 bg-white border border-slate-200 text-slate-500 px-3 py-2.5 rounded-2xl font-black text-[10px] flex items-center justify-center gap-1.5 hover:bg-slate-100 transition">
                        <XCircle size={13} /> GEREKMİYOR
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ALT BİLGİ */}
      {durum === 'BEKLIYOR' && bekleyenSayi > 0 && (
        <div className="mt-6 bg-violet-50 border border-violet-200 rounded-3xl p-4">
          <p className="text-xs font-black text-violet-800 flex items-center gap-2">
            <Users size={14} /> {bekleyenSayi} iş teklif bekliyor
          </p>
          <p className="text-[11px] text-violet-600 font-medium mt-1.5 leading-relaxed">
            Telegram asistanı bu işleri <strong>hafta içi 07:30–18:00</strong> arasında
            düzenli hatırlatır. Teklifi verdiğinde <strong>hatırlatma kendiliğinden biter.</strong>
          </p>
        </div>
      )}
    </div>
  );
}
