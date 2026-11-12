"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - TELEFON TOPLU YÜKLEME 📇
// Rehberden kopyala-yapıştır → tek tek ekler
// ----------------------------------------------------------------------------

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Phone, Loader2, CheckCircle2, Upload } from "lucide-react";

export default function TelefonTopluYukle({ onBitti }: { onBitti?: () => void }) {
  const [metin, setMetin] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [sonuc, setSonuc] = useState("");

  const yukle = async () => {
    if (!metin.trim()) { setSonuc("⚠️ Metin boş."); return; }
    setYukleniyor(true);
    setSonuc("");
    try {
      const satirlar = metin.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      let basarili = 0, hatali = 0, atlanan = 0;

      for (const satir of satirlar) {
        const parcalar = satir.split(/[,;\t]+/).map((p) => p.trim()).filter(Boolean);
        if (parcalar.length === 0) { atlanan++; continue; }

        let tel = "";
        let isim = "";
        for (const p of parcalar) {
          const rakam = p.replace(/[^0-9]/g, "");
          if (rakam.length >= 10 && rakam.length <= 13 && !tel) { tel = p; }
          else if (!isim && rakam.length < 10) { isim = p; }
        }
        if (!tel) { atlanan++; continue; }

        const { data, error } = await supabase.rpc("telefon_izni_ekle", {
          p_telefon: tel,
          p_firma: null,
          p_yetkili: isim || null,
          p_notlar: "Rehberden yüklendi",
          p_ekleyen: "ADMIN",
        });
        if (error || !(data as any)?.ok) { hatali++; } else { basarili++; }
      }

      setSonuc(`✅ ${basarili} eklendi · ${hatali} zaten var/hata · ${atlanan} atlandı`);
      setMetin("");
      onBitti?.();
    } catch (e: any) {
      setSonuc("❌ " + (e?.message || "Hata"));
    } finally { setYukleniyor(false); }
  };

  return (
    <div className="bg-white border-2 border-emerald-200 rounded-2xl p-4">
      <h3 className="text-xs font-black text-emerald-800 uppercase mb-2 flex items-center gap-1.5">
        <Upload size={13} /> REHBERDEN TOPLU YÜKLE
      </h3>
      <p className="text-[10px] text-slate-500 font-medium mb-2">
        Rehberini kopyala-yapıştır. Her satır: <b>İsim, Telefon</b>
      </p>
      <textarea rows={6} value={metin} onChange={(e) => setMetin(e.target.value)}
        placeholder={"Ahmet Yılmaz, 0532 123 45 67\nMehmet Bey, 0555 999 88 77\nABC Makina, 0533 444 33 22"}
        className="w-full p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-[11px] font-mono resize-none outline-none focus:border-emerald-500" />
      <button onClick={yukle} disabled={yukleniyor}
        className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-2">
        {yukleniyor ? <Loader2 size={13} className="animate-spin" /> : <Phone size={13} />}
        {yukleniyor ? "YÜKLENİYOR..." : "HEPSİNİ YÜKLE"}
      </button>
      {sonuc && (
        <p className={`text-[10px] font-bold mt-2 ${sonuc.startsWith("✅") ? "text-emerald-700" : "text-rose-600"}`}>
          {sonuc}
        </p>
      )}
    </div>
  );
}
