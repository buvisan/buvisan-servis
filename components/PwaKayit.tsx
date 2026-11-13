"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - PWA KAYIT + KURULUM İSTEMİ 📱
// Service worker kaydı, "Ana ekrana ekle" banner'ı
// ----------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";

export default function PwaKayit() {
  const [kurulumEvent, setKurulumEvent] = useState<any>(null);
  const [goster, setGoster] = useState(false);
  const [iosMu, setIosMu] = useState(false);

  useEffect(() => {
    // Service worker kaydı
    if ("serviceWorker" in navigator) {
      // ⭐ Yeni SW devreye girince sayfayı bir kez yenile (eski cache temizlenir)
      let yenilendi = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (yenilendi) return;
        yenilendi = true;
        try { window.location.reload(); } catch { /* yoksay */ }
      });

      // Kayıtlı SW'yi güncelle
      try {
        navigator.serviceWorker.getRegistration().then((r) => {
          if (r && r.update) r.update().catch(() => {});
        }).catch(() => {});
      } catch { /* yoksay */ }

      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
    }

    // iOS tespiti
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIosMu(ios);

    // Daha önce kapatıldı mı?
    try {
      if (localStorage.getItem("pwa_banner_kapatildi") === "1") return;
    } catch { /* yoksay */ }

    // Android/Chrome kurulum eventi
    const onBeforeInstall = (e: any) => {
      e.preventDefault();
      setKurulumEvent(e);
      setGoster(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS'ta kurulum banner'ı (standalone değilse)
    if (ios && !(navigator as any).standalone) {
      setTimeout(() => setGoster(true), 3000);
    }

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const kur = async () => {
    if (kurulumEvent) {
      kurulumEvent.prompt();
      const sonuc = await kurulumEvent.userChoice;
      if (sonuc?.outcome === "accepted") setGoster(false);
      setKurulumEvent(null);
    }
  };

  const kapat = () => {
    setGoster(false);
    try { localStorage.setItem("pwa_banner_kapatildi", "1"); } catch { /* yoksay */ }
  };

  if (!goster) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9999] md:left-auto md:right-4 md:w-96">
      <div className="bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700 p-4 flex items-start gap-3">
        <div className="bg-emerald-500/20 p-2.5 rounded-xl shrink-0">
          <Smartphone size={20} className="text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm">BUVİSAN'ı Telefona Kur</p>
          <p className="text-[10px] text-slate-400 font-medium mt-1 leading-snug">
            {iosMu
              ? "Safari'de ↗️ Paylaş → 'Ana Ekrana Ekle' ile uygulama gibi kullan"
              : "Ana ekrana ekle — hızlı açılır, bildirim gelir"}
          </p>
          <div className="flex gap-2 mt-2.5">
            {!iosMu && (
              <button onClick={kur}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white py-2 rounded-lg text-[11px] font-black flex items-center justify-center gap-1.5">
                <Download size={12} /> KUR
              </button>
            )}
            <button onClick={kapat}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg text-[11px] font-bold">
              {iosMu ? "ANLADIM" : "SONRA"}
            </button>
          </div>
        </div>
        <button onClick={kapat} className="text-slate-500 hover:text-white shrink-0">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
