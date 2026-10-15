"use client";

// ----------------------------------------------------------------------------
// BUVISAN - MESAİ GİRİŞİM ⏱️ (v2 — giriş/çıkış saati)
// Personel tarih + GİRİŞ SAATİ + ÇIKIŞ SAATİ girer.
// Sistem: süreyi hesaplar · mola düşer · gün tipine göre böler
//         → /admin/puantaj ekranına OTOMATİK işlenir.
// Cumartesi %50, pazar %100 mesai otomatik.
// Kaynak: mesai_girisi_ekle() + benim_mesailerim()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Loader2, Save, ChevronDown, CalendarDays, LogIn, LogOut, ArrowRight } from "lucide-react";

const AYLAR = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

// "08:00" → 8.0 saat
const saatSayi = (t: string): number => {
  if (!t || !t.includes(":")) return 0;
  const [h, m] = t.split(":").map((x) => Number(x) || 0);
  return h + m / 60;
};

export default function MesaiGirisimKarti() {
  const bugun = new Date();
  const bugunStr = bugun.toISOString().slice(0, 10);

  const [tarih, setTarih] = useState(bugunStr);
  const [giris, setGiris] = useState("08:00");
  const [cikis, setCikis] = useState("18:00");
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

  // ---- CANLI HESAPLAMA ÖNİZLEMESİ ----
  const hesap = useMemo(() => {
    const g = saatSayi(giris);
    const c = saatSayi(cikis);
    if (!giris || !cikis || g === 0 || c === 0) return null;

    let dk = (c - g) * 60;
    if (dk < 0) dk += 1440;                    // gece vardiyası
    const ham = dk / 60;
    const molaVar = dk > 480;                  // 8 saatten fazla → mola düş
    const net = molaVar ? (dk - 60) / 60 : ham;

    if (net <= 0) return { hata: "Çıkış saati giriş saatinden sonra olmalı." };
    if (net > 16) return { hata: "Günde 16 saatten fazla mesai girilemez." };

    const dow = new Date(tarih + "T00:00:00").getDay();
    const tip = dow === 6 ? "cmt" : dow === 0 ? "paz" : "normal";

    return { ham, molaVar, net: Math.round(net * 100) / 100, tip };
  }, [giris, cikis, tarih]);

  const kaydet = async () => {
    if (hesap && "hata" in hesap) { setMesaj("⚠️ " + hesap.hata); return; }
    setKaydediliyor(true);
    setMesaj("");
    try {
      const { data, error } = await supabase.rpc("mesai_girisi_ekle", {
        p_tarih: tarih, p_giris: giris, p_cikis: cikis, p_mola_dk: 60,
      });
      if (error || !(data as any)?.ok) {
        setMesaj(error?.message || (data as any)?.mesaj || "Kaydedilemedi.");
        return;
      }
      setMesaj("✅ " + ((data as any).mesaj || "Kaydedildi."));
      await getir();
      setTimeout(() => setMesaj(""), 4000);
    } finally { setKaydediliyor(false); }
  };

  const gunTipi = (() => {
    if (!tarih) return null;
    const dow = new Date(tarih + "T00:00:00").getDay();
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
            giriş-çıkış saati gir · puantaja işlenir
          </p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* TARİH */}
        <div>
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tarih</label>
          <input type="date" value={tarih} max={bugunStr}
            onChange={(e) => setTarih(e.target.value)}
            className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-sky-500" />
        </div>

        {/* GİRİŞ / ÇIKIŞ SAATİ */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <LogIn size={11} /> Giriş saati
            </label>
            <input type="time" value={giris} step="60"
              onChange={(e) => setGiris(e.target.value)}
              className="w-full mt-1 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl font-black text-emerald-800 outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <LogOut size={11} /> Çıkış saati
            </label>
            <input type="time" value={cikis} step="60"
              onChange={(e) => setCikis(e.target.value)}
              className="w-full mt-1 p-3 bg-rose-50 border border-rose-200 rounded-2xl font-black text-rose-800 outline-none focus:border-rose-500" />
          </div>
        </div>

        {/* CANLI HESAP ÖNİZLEMESİ */}
        {hesap && "hata" in hesap ? (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-[11px] font-black text-rose-700">
            ⚠️ {hesap.hata}
          </div>
        ) : hesap ? (
          <div className="p-3 rounded-2xl bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200">
            <div className="flex items-center justify-center gap-2 text-[13px] font-black text-slate-700">
              <span className="text-emerald-700">{giris}</span>
              <ArrowRight size={13} className="text-slate-400" />
              <span className="text-rose-700">{cikis}</span>
              <span className="text-slate-300">·</span>
              <span className="text-sky-700">
                {hesap.tip === "cmt" ? "Cumartesi (%50)" : hesap.tip === "paz" ? "Pazar (%100)" : "Hafta içi"}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="bg-white/70 rounded-xl py-1.5">
                <p className="text-[9px] font-black text-slate-400 uppercase">Ham süre</p>
                <p className="text-sm font-black text-slate-600">{hesap.ham.toFixed(1)} sa</p>
              </div>
              <div className={`rounded-xl py-1.5 ${hesap.molaVar ? "bg-amber-100" : "bg-white/70"}`}>
                <p className="text-[9px] font-black text-amber-600 uppercase">Mola</p>
                <p className="text-sm font-black text-amber-700">{hesap.molaVar ? "−1 sa" : "—"}</p>
              </div>
              <div className="bg-emerald-100 rounded-xl py-1.5">
                <p className="text-[9px] font-black text-emerald-600 uppercase">Net</p>
                <p className="text-sm font-black text-emerald-800">{hesap.net} sa</p>
              </div>
            </div>
          </div>
        ) : null}

        {gunTipi && !hesap && (
          <p className={`text-[11px] font-black ${gunTipi.renk}`}>{gunTipi.yazi}</p>
        )}

        <button onClick={kaydet} disabled={kaydediliyor || !!(hesap && "hata" in hesap)}
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
            <p className="text-base font-black text-slate-700">{Math.round(toplamNormal * 10) / 10} sa</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-100 text-center">
            <p className="text-[9px] font-black text-blue-500 uppercase">Cmt %50</p>
            <p className="text-base font-black text-blue-700">{Math.round(toplam50 * 10) / 10} sa</p>
          </div>
          <div className="bg-violet-50 rounded-xl p-2.5 border border-violet-100 text-center">
            <p className="text-[9px] font-black text-violet-500 uppercase">Paz %100</p>
            <p className="text-base font-black text-violet-700">{Math.round(toplam100 * 10) / 10} sa</p>
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
                        {k.izin_mi ? (
                          <p className="text-[9px] font-black text-amber-600">⛱️ ONAYLI İZİN</p>
                        ) : (k.giris || k.cikis) ? (
                          <p className="text-[9px] font-black text-slate-400">
                            🕐 {k.giris || "?"} → {k.cikis || "?"}
                          </p>
                        ) : null}
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
          Giriş ve çıkış saatini gir — <strong>süre, mola ve mesai otomatik hesaplanır</strong> ve
          <strong> yönetimin puantaj ekranına yansır</strong>. İzniniz onaylandığında o günler
          <strong> izinli</strong> olarak işaretlenir.
        </p>
      </div>
    </div>
  );
}
