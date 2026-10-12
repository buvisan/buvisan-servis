"use client";

// ----------------------------------------------------------------------------
// BUVISAN - BEKLEYEN RAPOR BANDI 📴
// ----------------------------------------------------------------------------
//  İnternet yokken kaydedilemeyen raporlar burada görünür.
//  Bağlantı gelince kendiliğinden gönderilir; istenirse elle de gönderilebilir.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { kuyrukOku, kuyruguGonder } from '@/lib/kuyruk';
import { WifiOff, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function KuyrukBandi() {
  const [adet, setAdet] = useState(0);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [mesaj, setMesaj] = useState('');

  const yenile = useCallback(() => setAdet(kuyrukOku().length), []);

  const bosalt = useCallback(async (otomatik = false) => {
    if (kuyrukOku().length === 0) return;
    if (otomatik && typeof navigator !== 'undefined' && !navigator.onLine) return;

    setGonderiliyor(true);
    const sonuc = await kuyruguGonder();
    setGonderiliyor(false);
    yenile();

    if (sonuc.gonderilen > 0) {
      setMesaj(`${sonuc.gonderilen} rapor gönderildi ✅`);
    } else if (!otomatik) {
      setMesaj('Hâlâ gönderilemedi. İnternet gelince kendiliğinden denenecek.');
    }
    setTimeout(() => setMesaj(''), 5000);
  }, [yenile]);

  useEffect(() => {
    yenile();
    bosalt(true); // açılışta dene

    const cevrimici = () => bosalt(true);
    window.addEventListener('online', cevrimici);
    const zamanlayici = setInterval(() => bosalt(true), 60000);

    return () => {
      window.removeEventListener('online', cevrimici);
      clearInterval(zamanlayici);
    };
  }, [bosalt, yenile]);

  if (adet === 0 && !mesaj) return null;

  const bekleyenVar = adet > 0;

  return (
    <div className="px-4 pt-4">
      <div className={`rounded-2xl border p-4 flex items-center gap-3 ${bekleyenVar ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'}`}>
        <div className={`p-2.5 rounded-xl shrink-0 ${bekleyenVar ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
          {gonderiliyor ? <Loader2 size={18} className="animate-spin" />
            : bekleyenVar ? <WifiOff size={18} /> : <CheckCircle2 size={18} />}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-xs font-black ${bekleyenVar ? 'text-amber-800' : 'text-emerald-800'}`}>
            {bekleyenVar ? `${adet} rapor gönderilmeyi bekliyor` : (mesaj || 'Tüm raporlar gönderildi')}
          </p>
          <p className={`text-[10px] font-medium mt-0.5 ${bekleyenVar ? 'text-amber-600' : 'text-emerald-600'}`}>
            {bekleyenVar
              ? 'İnternet gelince kendiliğinden gönderilecek. Hiçbir rapor kaybolmaz.'
              : 'Kuyruk temiz.'}
          </p>
        </div>

        {bekleyenVar && (
          <button
            onClick={() => bosalt(false)}
            disabled={gonderiliyor}
            className="shrink-0 bg-amber-600 text-white px-3 py-2.5 rounded-xl text-[10px] font-black hover:bg-amber-700 active:scale-95 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {gonderiliyor ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            ŞİMDİ GÖNDER
          </button>
        )}
      </div>
    </div>
  );
}
