"use client";

// ----------------------------------------------------------------------------
// BUVISAN - MESAİ GİRİŞİM ⏱️
// Personel kendi giriş/çıkış saatini girer → /admin/puantaj'a otomatik yansır.
// Cumartesi %50, pazar %100 mesai OTOMATİK hesaplanır.
// Kaynak: benim_mesaim_ekle() + benim_mesailerim()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Loader2, Save, ChevronDown, Check, CalendarDays } from "lucide-react";

const AYLAR = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

export default function MesaiGirisimKarti() {
  const bugun = new Date();
  const [tarih, setTarih] = useState(bugun.toISOString().slice(0, 10));
  const [saat, setSaat] = useState("9");
  const [kayitlar, setKayitlar] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mesaj, setMesaj] = useState("");
  const [acik, setAcik] = useState(false);

  const ay = `${bugun.getFullYear()}-${String(bugun.getMonth() + 1).padStart(2, "0")}`;

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data } = await supabase.rpc("benim_mesailerim", { p_ay: ay });
      setKayitlar(data || []);
    } finally { setYukleniyor(false); }
  }, [ay]);

  useEffect(() => { getir(); }, [getir]);

  const kaydet = async () => {
    setKaydediliyor(true);
    setMesaj("");
    try {
      const { data, error } = await supabase.rpc("benim_mesaim_ekle", {
        p_tarih: tarih, p_saat: Number(saat) || 0, p_aciklama: null,
      });
      if (error || !(data as any)?.ok) {
        setMesaj(error?.message || (data as any)?.mesaj || "Kaydedilemedi.");
        return;
      }
      setMesaj("✅ " + ((data as any).mesaj || "Kaydedildi."));
      await getir();
      setTimeout(() => setMesaj(""), 3000);
    } finally { setKaydediliyor(false); }
  };

  // Seçilen tarihin gün tipi önizlemesi
  const gunTipi = (() => {
    if (!tarih) return null;
    const d = new Date(tarih + "T00:00:00");
    const dow = d.getDay();
    if (dow === 6) return { renk: "text-blue-600", yazi: "🔵 Cumartesi → %50 mesai" };
    if (dow === 0) return { renk: "text-violet-600", yazi: "🟣 Pazar → %100 mesai" };
    return { renk: "text-emerald-600", yazi: "🟢 Hafta içi → normal saat" };
  })();

  const toplamNormal = kayitlar.reduce((t, k) => t + Number(k.normal_saat || 0), 0);
  const toplam50 = kayitlar.reduce((t, k) => t + Number(k.mesai50_saat || 0), 0);
  const toplam100 = kayitlar.reduce((t, k) => t + Number(k.mesai100_saat || 0), 0);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-sky-700 to-blue-700 px-4 py-3.5 flex items-center gap-2.5">
        <div className="bg-white/15 p-2 rounded-xl">
          <Clock className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-white font-black text-sm tracking-tight leading-none">MESAİ GİRİŞİM</h2>
          <p className="text-[10px] text-sky-200 font-bold uppercase tracking-widest mt-1">
            kendi saatlerini gir · puantaja işlenir
          </p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* GİRİŞ FORMU */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tarih</label>
            <input type="date" value={tarih} max={bugun.toISOString().slice(0, 10)}
              onChange={(e) => setTarih(e.target.value)}
              className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-sky-500" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Kaç saat çalıştın?</label>
            <input type="number" step="0.5" min="0" max="16" value={saat}
              onChange={(e) => setSaat(e.target.value)}
              className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-sky-500" />
          </div>
        </div>

        {gunTipi && (
          <p className={`text-[11px] font-black ${gunTipi.renk}`}>{gunTipi.yazi}</p>
        )}

        <button onClick={kaydet} disabled={kaydediliyor}
          className="w-full bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white py-3.5 rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98]">
          {kaydediliyor ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          MESAİMİ KAYDET
        </button>

        {mesaj && (
          <div className={`p-3 rounded-2xl text-[11px] font-bold ${mesaj.startsWith("✅") ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
            {mesaj}
          </div>
        )}

        {/* BU AY ÖZETİ */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 text-center">
            <p className="text-[9px] font-black text-slate-400 uppercase">Normal</p>
            <p className="text-base font-black text-slate-700">{toplamNormal} sa</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-100 text-center">
            <p className="text-[9px] font-black text-blue-500 uppercase">Cmt %50</p>
            <p className="text-base font-black text-blue-700">{toplam50} sa</p>
          </div>
          <div className="bg-violet-50 rounded-xl p-2.5 border border-violet-100 text-center">
            <p className="text-[9px] font-black text-violet-500 uppercase">Paz %100</p>
            <p className="text-base font-black text-violet-700">{toplam100} sa</p>
          </div>
        </div>

        {/* GİRİŞLERİM */}
        <button onClick={() => setAcik((o) => !o)}
          className="w-full flex items-center justify-between bg-slate-100 hover:bg-slate-200 px-3.5 py-3 rounded-2xl transition">
          <span className="text-[11px] font-black text-slate-600 flex items-center gap-2">
            <CalendarDays size={13} /> {AYLAR[bugun.getMonth()]} GİRİŞLERİM ({kayitlar.length})
          </span>
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${acik ? "rotate-180" : ""}`} />
        </button>

        <AnimatePresence>
          {acik && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              {yukleniyor ? (
                <div className="py-4 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" /></div>
              ) : kayitlar.length === 0 ? (
                <p className="text-[11px] text-slate-400 font-bold text-center py-3">
                  Bu ay henüz mesai girmediniz.
                </p>
              ) : (
                <div className="space-y-1.5 pt-2">
                  {kayitlar.map((k) => (
                    <div key={k.tarih} className={`flex items-center justify-between rounded-xl px-3 py-2.5 border ${
                      k.izin_mi ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"
                    }`}>
                      <div>
                        <p className="text-[11px] font-black text-slate-700">
                          {new Date(k.tarih).toLocaleDateString("tr-TR")} · {k.gun_adi}
                        </p>
                        {k.izin_mi && <p className="text-[9px] font-black text-amber-600">⛱️ ONAYLI İZİN</p>}
                      </div>
                      <div className="text-right">
                        {Number(k.normal_saat) > 0 && <p className="text-[11px] font-black text-slate-600">{k.normal_saat} sa normal</p>}
                        {Number(k.mesai50_saat) > 0 && <p className="text-[11px] font-black text-blue-600">{k.mesai50_saat} sa ×1,5</p>}
                        {Number(k.mesai100_saat) > 0 && <p className="text-[11px] font-black text-violet-600">{k.mesai100_saat} sa ×2</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-[9px] text-slate-400 font-medium text-center leading-relaxed">
          Girdiğin saatler <strong>yönetimin puantaj ekranına otomatik yansır</strong>.
          İzniniz onaylandığında o günler <strong>izinli</strong> olarak işaretlenir.
        </p>
      </div>
    </div>
  );
}
