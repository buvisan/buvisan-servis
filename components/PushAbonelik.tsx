"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - PUSH ABONELİK 🔔
// Kullanıcı izin verir → abonelik kaydedilir → bildirim alır
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Bell, BellOff, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

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
  const [destekli, setDestekli] = useState(false);
  const [abone, setAbone] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [mesaj, setMesaj] = useState("");

  const durumKontrol = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setDestekli(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setAbone(!!sub);
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

      const reg = await navigator.serviceWorker.ready;
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
      setMesaj("❌ " + (e?.message || "Abonelik oluşturulamadı"));
    } finally { setYukleniyor(false); }
  };

  const aboneIptal = async () => {
    setYukleniyor(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const ep = sub.endpoint;
        await sub.unsubscribe();
        await supabase.from("push_abonelikler").update({ aktif: false }).eq("endpoint", ep);
      }
      setAbone(false);
      setMesaj("Bildirimler kapatıldı.");
    } catch { /* yoksay */ } finally { setYukleniyor(false); }
  };

  if (!destekli) return null;

  return (
    <div className={`rounded-2xl border-2 p-3 ${
      abone ? "bg-emerald-50 border-emerald-300" : "bg-slate-50 border-slate-200"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {abone
            ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            : <Bell size={16} className="text-slate-400 shrink-0" />}
          <div className="min-w-0">
            <p className={`text-[11px] font-black ${abone ? "text-emerald-800" : "text-slate-700"}`}>
              {abone ? "BİLDİRİMLER AÇIK" : "BİLDİRİMLERİ AÇ"}
            </p>
            <p className="text-[9px] font-medium text-slate-500">
              {abone ? "Yeni iş atandığında haber verilir" : "Telefonuna bildirim gelsin"}
            </p>
          </div>
        </div>
        <button onClick={abone ? aboneIptal : aboneOl} disabled={yukleniyor}
          className={`px-3 py-2 rounded-xl text-[10px] font-black shrink-0 transition ${
            abone
              ? "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              : "bg-slate-900 text-white hover:bg-slate-800"
          } disabled:opacity-50`}>
          {yukleniyor ? <Loader2 size={12} className="animate-spin" />
            : abone ? <BellOff size={12} /> : <Bell size={12} />}
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
