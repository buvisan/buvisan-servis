"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - TELEFON TOPLU YÜKLEME 📇
// 2 yol: 1) .vcf dosyası yükle  2) kopyala-yapıştır
// ----------------------------------------------------------------------------

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Phone, Loader2, Upload, FileUp, X } from "lucide-react";

type Kisi = { isim: string; telefon: string };

// vCard (.vcf) dosyasını ayrıştır
function vcfAyikla(metin: string): Kisi[] {
  const kisiler: Kisi[] = [];
  const kartlar = metin.split(/BEGIN:VCARD/i).slice(1);
  for (const kart of kartlar) {
    // İsim
    let isim = "";
    const fn = kart.match(/^FN[^:]*:(.+)$/im);
    const n = kart.match(/^N[^:]*:(.+)$/im);
    if (fn) isim = fn[1].trim();
    else if (n) {
      const p = n[1].split(";").map((x) => x.trim()).filter(Boolean);
      isim = [...p.slice(1), p[0]].filter(Boolean).join(" ").trim();
    }
    // Telefon(lar)
    const teller = [...kart.matchAll(/^TEL[^:]*:(.+)$/gim)].map((m) => m[1].trim());
    for (const tel of teller) {
      const rakam = tel.replace(/[^0-9]/g, "");
      if (rakam.length >= 10) {
        kisiler.push({ isim: isim || "İsimsiz", telefon: tel });
      }
    }
  }
  return kisiler;
}

export default function TelefonTopluYukle({ onBitti }: { onBitti?: () => void }) {
  const [metin, setMetin] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [sonuc, setSonuc] = useState("");
  const [dosyaAdi, setDosyaAdi] = useState("");
  const [kisiler, setKisiler] = useState<Kisi[]>([]);
  const dosyaRef = useRef<HTMLInputElement | null>(null);

  // 📁 DOSYA SEÇ
  const dosyaSec = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setDosyaAdi(f.name);
    setSonuc("");
    try {
      const icerik = await f.text();
      let liste: Kisi[] = [];

      if (/BEGIN:VCARD/i.test(icerik)) {
        liste = vcfAyikla(icerik);
      } else {
        // CSV / TXT
        liste = icerik.split(/\r?\n/).map((satir) => {
          const p = satir.split(/[,;\t]+/).map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean);
          let tel = "", isim = "";
          for (const x of p) {
            const r = x.replace(/[^0-9]/g, "");
            if (r.length >= 10 && r.length <= 13 && !tel) tel = x;
            else if (!isim && r.length < 10) isim = x;
          }
          return { isim: isim || "İsimsiz", telefon: tel };
        }).filter((k) => k.telefon);
      }

      setKisiler(liste);
      setSonuc(liste.length > 0
        ? `📋 ${liste.length} kişi bulundu — "YÜKLE" butonuna basın`
        : "❌ Dosyada kişi bulunamadı");
    } catch (err: any) {
      setSonuc("❌ Dosya okunamadı: " + (err?.message || ""));
    }
  };

  // 📞 YÜKLE
  const yukle = async () => {
    const yuklenecek = kisiler.length > 0 ? kisiler : metin
      .split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((satir) => {
        const p = satir.split(/[,;\t]+/).map((x) => x.trim()).filter(Boolean);
        let tel = "", isim = "";
        for (const x of p) {
          const r = x.replace(/[^0-9]/g, "");
          if (r.length >= 10 && r.length <= 13 && !tel) tel = x;
          else if (!isim && r.length < 10) isim = x;
        }
        return { isim: isim || "İsimsiz", telefon: tel };
      }).filter((k) => k.telefon);

    if (yuklenecek.length === 0) { setSonuc("⚠️ Yüklenecek kişi yok."); return; }

    setYukleniyor(true);
    setSonuc("");
    let basarili = 0, hatali = 0;

    try {
      for (const k of yuklenecek) {
        const { data, error } = await supabase.rpc("telefon_izni_ekle", {
          p_telefon: k.telefon,
          p_firma: null,
          p_yetkili: k.isim,
          p_notlar: dosyaAdi ? `Dosyadan: ${dosyaAdi}` : "Rehberden yüklendi",
          p_ekleyen: "ADMIN",
        });
        if (error || !(data as any)?.ok) hatali++;
        else basarili++;
      }
      setSonuc(`✅ ${basarili} kişi eklendi · ${hatali} zaten var/hata`);
      setKisiler([]); setMetin(""); setDosyaAdi("");
      if (dosyaRef.current) dosyaRef.current.value = "";
      onBitti?.();
    } catch (e: any) {
      setSonuc("❌ " + (e?.message || "Hata"));
    } finally { setYukleniyor(false); }
  };

  return (
    <div className="bg-white border-2 border-emerald-200 rounded-2xl p-4 space-y-3">
      <h3 className="text-xs font-black text-emerald-800 uppercase flex items-center gap-1.5">
        <Upload size={13} /> REHBERDEN TOPLU YÜKLE
      </h3>

      {/* DOSYA */}
      <div>
        <input ref={dosyaRef} type="file" accept=".vcf,.csv,.txt,text/vcard,text/csv,text/plain"
          onChange={dosyaSec} className="hidden" id="vcf-input" />
        <label htmlFor="vcf-input"
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-2 cursor-pointer">
          <FileUp size={15} /> REHBER DOSYASI SEÇ (.vcf)
        </label>
        {dosyaAdi && (
          <div className="flex items-center gap-2 mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <span className="text-[10px] font-bold text-slate-600 truncate flex-1">{dosyaAdi}</span>
            <button onClick={() => { setDosyaAdi(""); setKisiler([]); setSonuc(""); if (dosyaRef.current) dosyaRef.current.value = ""; }}
              className="text-slate-400 hover:text-rose-600"><X size={13} /></button>
          </div>
        )}
        {kisiler.length > 0 && (
          <p className="text-[10px] font-bold text-emerald-700 mt-1">
            📋 {kisiler.length} kişi hazır · ilk: {kisiler[0].isim} — {kisiler[0].telefon}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-slate-200"></div>
        <span className="text-[9px] font-black text-slate-400">VEYA YAPIŞTIR</span>
        <div className="flex-1 h-px bg-slate-200"></div>
      </div>

      {/* METIN */}
      <textarea rows={4} value={metin} onChange={(e) => setMetin(e.target.value)}
        placeholder={"Ahmet Yılmaz, 0532 123 45 67\nMehmet Bey, 0555 999 88 77"}
        className="w-full p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-[11px] font-mono resize-none outline-none focus:border-emerald-500" />

      <button onClick={yukle} disabled={yukleniyor}
        className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-2">
        {yukleniyor ? <Loader2 size={13} className="animate-spin" /> : <Phone size={13} />}
        {yukleniyor ? "YÜKLENİYOR..." : `YÜKLE (${kisiler.length || "?"})`}
      </button>

      {sonuc && (
        <p className={`text-[10px] font-bold ${sonuc.startsWith("✅") ? "text-emerald-700" : sonuc.startsWith("📋") ? "text-blue-700" : "text-rose-600"}`}>
          {sonuc}
        </p>
      )}
    </div>
  );
}
