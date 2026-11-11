"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - PUSH ABONELİK 🔔 (v2 — HER ZAMAN GÖRÜNÜR)
// Desteklenmiyorsa da buton görünür, durum mesajı gösterir
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Bell, BellOff, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

const VAPID_PUBLIC = "BCR-gpY1Syhdjl2ZRynMJJdN1mFAnRl1FURCLcVZPPrn7e2_tFA5gpxPrSS-59kBajrgFeHgGtnFlT3tI286hFI";

function base64ToUint8(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function PushAbonelik({ kullanici, rol = "personel" }: { kullanici?: string; rol?: string }) {
  const [destekli, setDestekli] = useState<boolean | null>(null);
  const [abone, setAbone] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [mesaj, setMesaj] = useState("");

  const durumKontrol = useCallback(async () => {
    const swVar = typeof navigator !== "undefined" && "serviceWorker" in navigator;
    const pushVar = typeof window !== "undefined" && "PushManager" in window;
    const bildirimVar = typeof window !== "undefined" && "Notification" in window;

    if (!swVar || !pushVar || !bildirimVar) {
      setDestekli(false);
      return;
    }
    setDestekli(true);

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        setAbone(!!sub);
      }
    } catch { /* yoksay */ }
  }, []);

  useEffect(() => { durumKontrol(); }, [durumKontrol]);

  const aboneOl = async () => {
    setYukleniyor(true);
    setMesaj("");
    try {
      const izin = await Notification.requestPermission();
      if (izin !== "granted") {
        setMesaj("⚠️ Bildirim izni verilmedi. Tarayıcı ayarlarından izin verin.");
        return;
      }

      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js");
        await new Promise((r) => setTimeout(r, 1200));
        reg = await navigator.serviceWorker.getRegistration();
      }
      if (!reg) { setMesaj("❌ Service worker başlatılamadı. Sayfayı yenileyin."); return; }

      await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8(VAPID_PUBLIC) as BufferSource,
      });

      const json: any = sub.toJSON();
      const { error } = await supabase.from("push_abonelikler").upsert([{
        kullanici: kullanici || "Bilinmeyen",
        rol,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        cihaz: navigator.userAgent.includes("iPhone") ? "iPhone"
          : navigator.userAgent.includes("Android") ? "Android" : "Masaüstü",
        aktif: true,
      }], { onConflict: "endpoint" });

      if (error) { setMesaj("❌ Kaydedilemedi: " + error.message); return; }
      setAbone(true);
      setMesaj("✅ Bildirimler açıldı!");
    } catch (e: any) {
      const m = String(e?.message || "");
      if (m.includes("permission")) setMesaj("❌ Bildirim izni reddedildi.");
      else if (m.includes("applicationServerKey")) setMesaj("❌ VAPID anahtarı geçersiz.");
      else setMesaj("❌ " + (m || "Abonelik oluşturulamadı"));
    } finally { setYukleniyor(false); }
  };

  const aboneIptal = async () => {
    setYukleniyor(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const ep = sub.endpoint;
        await sub.unsubscribe();
        await supabase.from("push_abonelikler").update({ aktif: false }).eq("endpoint", ep);
      }
      setAbone(false);
      setMesaj("Bildirimler kapatıldı.");
    } catch { /* yoksay */ } finally { setYukleniyor(false); }
  };

  if (destekli === false) {
    return (
      <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <div>
            <p className="text-[11px] font-black text-amber-800">BİLDİRİM DESTEKLENMİYOR</p>
            <p className="text-[9px] font-medium text-amber-600">
              iPhone'da 16.4+ Safari gerekir. Uygulamayı ana ekrana ekleyin.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (destekli === null) {
    return (
      <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3">
        <div className="flex items-center gap-2">
          <Loader2 size={16} className="text-slate-400 animate-spin shrink-0" />
          <p className="text-[11px] font-bold text-slate-500">Bildirim durumu kontrol ediliyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border-2 p-3 ${
      abone ? "bg-emerald-50 border-emerald-300" : "bg-slate-900 border-slate-700"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {abone
            ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            : <Bell size={16} className="text-yellow-400 shrink-0" />}
          <div className="min-w-0">
            <p className={`text-[11px] font-black ${abone ? "text-emerald-800" : "text-white"}`}>
              {abone ? "BİLDİRİMLER AÇIK" : "BİLDİRİMLERİ AÇ"}
            </p>
            <p className={`text-[9px] font-medium ${abone ? "text-emerald-600" : "text-slate-400"}`}>
              {abone ? "Yeni iş atandığında haber verilir" : "Telefonuna bildirim gelsin"}
            </p>
          </div>
        </div>
        <button onClick={abone ? aboneIptal : aboneOl} disabled={yukleniyor}
          className={`px-4 py-2.5 rounded-xl text-[10px] font-black shrink-0 transition flex items-center gap-1.5 ${
            abone
              ? "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              : "bg-yellow-400 text-slate-900 hover:bg-yellow-300"
          } disabled:opacity-50`}>
          {yukleniyor ? <Loader2 size={12} className="animate-spin" />
            : abone ? <><BellOff size={12} /> KAPAT</> : <><Bell size={12} /> AÇ</>}
        </button>
      </div>
      {mesaj && (
        <p className={`text-[9px] font-bold mt-2 ${
          mesaj.startsWith("✅") ? "text-emerald-700" : "text-rose-600"}`}>
          {mesaj}
        </p>
      )}
    </div>
  );
}
