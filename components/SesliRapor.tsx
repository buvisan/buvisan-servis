"use client";

// ----------------------------------------------------------------------------
// 🎤 SESLİ RAPOR — konuş, rapor alanları dolsun
// ----------------------------------------------------------------------------
//  MediaRecorder ile ses kaydeder → /api/sesli-rapor'a gönderir →
//  dönen alanları forma yazar (arıza, yapılan işler, süre, parçalar).
// ----------------------------------------------------------------------------

import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Mic, Square, Loader2, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Sonuc = {
  arizanin_cinsi?: string;
  yapilan_isler?: string;
  sure_dakika?: number | null;
  parcalar?: string[];
};

export default function SesliRapor({
  baglam,
  onSonuc,
}: {
  baglam?: string;
  onSonuc: (s: Sonuc) => void;
}) {
  const [kayitVar, setKayitVar] = useState(false);
  const [saniye, setSaniye] = useState(0);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState('');

  const kayitciRef = useRef<MediaRecorder | null>(null);
  const parcalarRef = useRef<Blob[]>([]);
  const sayacRef = useRef<any>(null);

  const basla = async () => {
    setHata('');
    try {
      const akis = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tip = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const kayitci = new MediaRecorder(akis, tip ? { mimeType: tip } : undefined);
      parcalarRef.current = [];

      kayitci.ondataavailable = (e) => { if (e.data.size > 0) parcalarRef.current.push(e.data); };
      kayitci.onstop = async () => {
        akis.getTracks().forEach((t) => t.stop());
        if (sayacRef.current) clearInterval(sayacRef.current);
        const blob = new Blob(parcalarRef.current, { type: kayitci.mimeType || 'audio/webm' });
        await gonder(blob, kayitci.mimeType || 'audio/webm');
      };

      kayitci.start();
      kayitciRef.current = kayitci;
      setKayitVar(true);
      setSaniye(0);
      sayacRef.current = setInterval(() => setSaniye((s) => s + 1), 1000);
    } catch {
      setHata('Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verin.');
    }
  };

  const durdur = () => {
    kayitciRef.current?.stop();
    setKayitVar(false);
    if (sayacRef.current) clearInterval(sayacRef.current);
  };

  const gonder = async (blob: Blob, mime: string) => {
    setGonderiliyor(true);
    setHata('');
    try {
      const { data: oturum } = await supabase.auth.getSession();
      const token = oturum?.session?.access_token;
      if (!token) { setHata('Oturum bulunamadı, tekrar giriş yapın.'); return; }

      // Base64'e çevir
      const base64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });

      const yanit = await fetch('/api/sesli-rapor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ses: base64, mime, baglam: baglam || '' }),
      });
      const sonuc = await yanit.json();

      if (!sonuc?.ok) { setHata(sonuc?.mesaj || 'Rapor çıkarılamadı.'); return; }
      onSonuc({
        arizanin_cinsi: sonuc.arizanin_cinsi,
        yapilan_isler: sonuc.yapilan_isler,
        sure_dakika: sonuc.sure_dakika,
        parcalar: sonuc.parcalar,
      });
    } catch {
      setHata('Bağlantı hatası.');
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="bg-violet-600 p-2 rounded-xl">
            <Mic className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-xs font-black text-violet-900 leading-none">SESLİ RAPOR</p>
            <p className="text-[10px] text-violet-500 font-bold mt-0.5">
              Konuş, alanlar otomatik dolsun
            </p>
          </div>
        </div>

        {!kayitVar ? (
          <button onClick={basla} disabled={gonderiliyor}
            className="bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white px-4 py-3 rounded-xl font-black text-[10px] flex items-center gap-2 transition active:scale-95">
            {gonderiliyor ? <><Loader2 size={14} className="animate-spin" /> ÇÖZÜMLENİYOR...</> : <><Mic size={14} /> KAYDI BAŞLAT</>}
          </button>
        ) : (
          <button onClick={durdur}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-xl font-black text-[10px] flex items-center gap-2 transition animate-pulse">
            <Square size={14} /> DURDUR ({saniye}sn)
          </button>
        )}
      </div>

      <AnimatePresence>
        {kayitVar && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-[10px] text-violet-700 font-bold">
            🔴 Kayıt sürüyor... Şöyle söyleyin: <em>&quot;Kedi yürütme switch&apos;i takılı kalmış, switch ayarını yaptım, 2 saat sürdü, parmak switch kullandım&quot;</em>
          </motion.p>
        )}
        {hata && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-[10px] text-rose-700 font-bold bg-rose-50 border border-rose-200 rounded-xl p-2.5 mt-1">
            {hata}
          </motion.p>
        )}
      </AnimatePresence>

      <p className="text-[9px] text-violet-400 font-medium mt-2">
        Kayıt sunucuda saklanmaz, sadece metne çevrilir. Mikrofon izni gerekir.
      </p>
    </div>
  );
}
