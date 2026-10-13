"use client";

// ----------------------------------------------------------------------------
// BUVISAN - SES KAYITLARI & ZEKASI 🎤
// Müşterilerin bıraktığı ses kayıtları: dinle, yazıya çevir, aranabilir yap.
// Kaynak: ses_kayitlari() + ses_cevirisi_kaydet() + ses_metin_ara()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import { Mic, Search, Loader2, ArrowLeft, Play, Sparkles, CheckCircle2, FileText, Clock, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SesKayitlariSayfasi() {
  const router = useRouter();
  const [kayitlar, setKayitlar] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [cevrilen, setCevrilen] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState('');
  const [arama, setArama] = useState('');
  const [aramaSonuc, setAramaSonuc] = useState<any[] | null>(null);

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data } = await supabase.rpc('ses_kayitlari');
      setKayitlar(data || []);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  const cevir = async (k: any) => {
    setCevrilen(k.audio_url);
    setMesaj('');
    try {
      const { data: oturum } = await supabase.auth.getSession();
      const token = oturum?.session?.access_token;
      if (!token) { setMesaj('Oturum bulunamadı, tekrar giriş yapın.'); return; }

      const yanit = await fetch('/api/ses-yaziya-cevir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ audio_url: k.audio_url, musteri: k.musteri, ticket_id: k.ticket_id }),
      });
      const sonuc = await yanit.json();

      if (!sonuc?.ok) {
        setMesaj(sonuc?.mesaj || 'Çeviri yapılamadı.');
        return;
      }

      const { error } = await supabase.rpc('ses_cevirisi_kaydet', {
        p_ticket_id: k.ticket_id,
        p_audio_url: k.audio_url,
        p_musteri: k.musteri,
        p_metin: sonuc.metin,
        p_ozet: sonuc.ozet,
        p_ariza_tipi: sonuc.ariza_tipi,
        p_aciliyet: sonuc.aciliyet,
      });

      if (error) { setMesaj('Çeviri alındı ama kaydedilemedi: ' + error.message); return; }

      setMesaj('✅ Yazıya çevrildi ve kaydedildi.');
      await getir();
      setTimeout(() => setMesaj(''), 2500);
    } catch {
      setMesaj('Bağlantı hatası.');
    } finally {
      setCevrilen(null);
    }
  };

  const ara = async () => {
    if (!arama.trim()) { setAramaSonuc(null); return; }
    const { data } = await supabase.rpc('ses_metin_ara', { p_arama: arama, p_limit: 25 });
    setAramaSonuc(data || []);
  };

  const gosterilecek = aramaSonuc ?? kayitlar;

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8">
      <div className="max-w-[1100px] mx-auto space-y-6">

        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin')}
            className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
              <Mic className="text-rose-600" /> SES KAYITLARI
            </h1>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
              Dinle · yazıya çevir · aranabilir yap
            </p>
          </div>
        </div>

        {/* ARAMA */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs font-black text-slate-700 mb-3 flex items-center gap-2">
            <Search size={14} className="text-rose-600" /> ÇEVRİLMİŞ KAYITLARDA ARA
          </p>
          <div className="flex flex-col md:flex-row gap-2">
            <input value={arama} onChange={(e) => setArama(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') ara(); }}
              placeholder="Örn: GOTEC, halat, switch..."
              className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-rose-500 text-sm" />
            <button onClick={ara}
              className="bg-rose-600 hover:bg-rose-700 text-white px-8 py-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-95">
              <Search size={16} /> ARA
            </button>
            {aramaSonuc && (
              <button onClick={() => { setArama(''); setAramaSonuc(null); }}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-4 rounded-2xl font-black text-xs transition">
                TEMİZLE
              </button>
            )}
          </div>
        </div>

        {mesaj && (
          <div className={`p-4 rounded-2xl text-xs font-bold border ${mesaj.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
            {mesaj}
          </div>
        )}

        {kayitlar.length === 0 && !yukleniyor && (
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
            <p className="text-sm font-black text-amber-800 mb-1">Henüz ses kaydı yok</p>
            <p className="text-[11px] text-amber-700 font-medium leading-relaxed max-w-md mx-auto">
              Müşteriler talep formundan sesli arıza kaydı bırakabilir. Kayıt geldikçe burada listelenir,
              yazıya çevrilir ve <strong>aranabilir</strong> hale gelir.
            </p>
          </div>
        )}

        {/* LİSTE */}
        <div className="space-y-3">
          {yukleniyor && (
            <div className="bg-white rounded-3xl p-10 text-center border border-slate-100">
              <Loader2 className="w-7 h-7 animate-spin text-rose-500 mx-auto" />
            </div>
          )}

          {gosterilecek.map((k) => {
            const cevrildi = k.cevrildi ?? Boolean(k.metin);
            const metin = k.metin;
            const ozet = k.ozet;
            return (
              <motion.div key={k.ticket_id || k.audio_url}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-800 truncate">{k.musteri || 'Bilinmiyor'}</p>
                    <p className="text-[10px] text-slate-400 font-bold flex items-center gap-2 flex-wrap">
                      <Clock size={10} />
                      {k.kayit_tarihi ? new Date(k.kayit_tarihi).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                      {k.ariza_tipi && <span className="bg-slate-100 px-2 py-0.5 rounded-lg uppercase">{k.ariza_tipi}</span>}
                      {k.aciliyet && (
                        <span className={`px-2 py-0.5 rounded-lg uppercase ${String(k.aciliyet).includes('ACİL') ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                          {k.aciliyet}
                        </span>
                      )}
                    </p>
                  </div>
                  {cevrildi && (
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black px-2 py-1 rounded-lg shrink-0 flex items-center gap-1">
                      <CheckCircle2 size={10} /> ÇEVRİLDİ
                    </span>
                  )}
                </div>

                {k.talep_metni && (
                  <p className="text-[10px] text-slate-500 italic mb-2">Talep notu: “{String(k.talep_metni).slice(0, 120)}”</p>
                )}

                <audio controls preload="none" src={k.audio_url} className="w-full h-10 mb-2" />

                {cevrildi && (metin || ozet) && (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2">
                    {ozet && (
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-wider text-violet-500 mb-0.5 flex items-center gap-1">
                          <Sparkles size={9} /> ÖZET
                        </p>
                        <p className="text-[11px] font-bold text-slate-700 leading-relaxed">{ozet}</p>
                      </div>
                    )}
                    {metin && (
                      <details>
                        <summary className="text-[10px] font-black text-slate-500 cursor-pointer flex items-center gap-1">
                          <FileText size={10} /> TAM METİN
                        </summary>
                        <p className="text-[11px] text-slate-600 leading-relaxed mt-1.5 whitespace-pre-wrap">{metin}</p>
                      </details>
                    )}
                  </div>
                )}

                {!cevrildi && (
                  <button onClick={() => cevir(k)} disabled={cevrilen === k.audio_url || !k.ticket_id}
                    className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white py-3 rounded-xl font-black text-[11px] flex items-center justify-center gap-2 transition active:scale-[0.98]">
                    {cevrilen === k.audio_url
                      ? <><Loader2 size={14} className="animate-spin" /> YAZIYA ÇEVRİLİYOR...</>
                      : <><Sparkles size={14} /> YAZIYA ÇEVİR + ÖZETLE</>}
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>

        {gosterilecek.length > 0 && (
          <p className="text-[10px] text-slate-400 font-medium text-center">
            Yazıya çevrilen kayıtlar <strong>aranabilir</strong> hale gelir. Böylece
            &quot;geçen ay bu müşteri ne demişti?&quot; sorusu saniyeler içinde cevaplanır.
          </p>
        )}
      </div>
    </div>
  );
}
