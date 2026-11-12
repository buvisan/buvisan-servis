"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - BİLDİRİM TETİKLEYİCİ 🔔
// Uygulama açıkken her 60 saniyede bir bekleyen bildirimleri gönderir.
// (Vercel Hobby planı cron'u günde 1 kez sınırlıyor → bu yöntemle anlık çalışır)
// ----------------------------------------------------------------------------

import { useEffect } from "react";

const ARALIK_MS = 60 * 1000;      // 60 saniye
const ILK_GECIKME = 8 * 1000;     // açılıştan 8 sn sonra

export default function BildirimGonderici() {
  useEffect(() => {
    let durdu = false;
    let zamanlayici: any = null;

    const gonder = async () => {
      if (durdu) return;
      if (typeof document !== "undefined" && document.hidden) return;  // sekme kapalıysa atla
      try {
        await fetch("/api/push-gonder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 20 }),
        });
      } catch { /* yoksay */ }
      try {
        await fetch("/api/sms-gonder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 10 }),
        });
      } catch { /* yoksay */ }
    };

    const baslat = setTimeout(() => {
      gonder();
      zamanlayici = setInterval(gonder, ARALIK_MS);
    }, ILK_GECIKME);

    return () => {
      durdu = true;
      clearTimeout(baslat);
      if (zamanlayici) clearInterval(zamanlayici);
    };
  }, []);

  return null;
}
