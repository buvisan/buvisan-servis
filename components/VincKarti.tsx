"use client";

// ----------------------------------------------------------------------------
// BUVISAN - VİNÇ İŞLERİ KARTI 🏗️
// Asansör hariç vinç işleri + abonelik fırsatları + envanter.
// Kaynak: vinc_ozeti() + vinc_musterileri() + vinc_envanteri() + vinc_teklif_metni()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { Construction, ChevronDown, Loader2, RefreshCw, AlertTriangle, TrendingUp, X, Copy } from "lucide-react";

const para = (n: any) => Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

const DURUM_RENK: Record<string, string> = {
  gecikmis: "bg-rose-100 text-rose-700",
  yaklasan: "bg-amber-100 text-amber-700",
  planli: "bg-emerald-100 text-emerald-700",
  tarihsiz: "bg-slate-100 text-slate-500",
};

export default function VincKarti() {
  const [ozet, setOzet] = useState<any>(null);
  const [musteriler, setMusteriler] = useState<any[]>([]);
  const [envanter, setEnvanter] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [acik, setAcik] = useState(false);
  const [envAcik, setEnvAcik] = useState(false);
  const [hata, setHata] = useState("");
  const [teklif, setTeklif] = useState<{ musteri: string; metin: string } | null>(null);
  const [teklifYukleniyor, setTeklifYukleniyor] = useState("");
  const [kopyalandi, setKopyalandi] = useState(false);

  const getir = useCallback(async () => {
    setYukleniyor(true);
    setHata("");
    try {
      const { data: o, error: e1 } = await supabase.rpc("vinc_ozeti");
      if (e1) { setHata(e1.message); return; }
      setOzet(o);

      const { data: m } = await supabase.rpc("vinc_musterileri");
      setMusteriler((m || []).slice(0, 60));

      const { data: e } = await supabase.rpc("vinc_envanteri");
      setEnvanter((e || []).slice(0, 80));
    } catch (e: any) {
      setHata(String(e?.message || e));
    } finally { setYukleniyor(false); }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  const teklifOlustur = async (musteri: string, makine: number) => {
    setTeklifYukleniyor(musteri);
    try {
      const { data, error } = await supabase.rpc("vinc_teklif_metni", {
        p_musteri: musteri, p_makine_sayisi: makine || 1, p_periyot_ay: 6,
      });
      if (error) { alert("Teklif üretilemedi: " + error.message); return; }
      setTeklif({ musteri, metin: String(data || "") });
      setKopyalandi(false);
    } finally { setTeklifYukleniyor(""); }
  };

  const kopyala = async () => {
    if (!teklif) return;
    try {
      await navigator.clipboard.writeText(teklif.metin);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2500);
    } catch { alert("Kopyalanamadı — metni elle seçin."); }
  };

  if (yukleniyor && !ozet) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-600 mx-auto" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      {/* BAŞLIK */}
      <div className="bg-gradient-to-r from-cyan-700 to-teal-700 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white/15 p-2.5 rounded-xl">
            <Construction className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-white font-black text-sm tracking-tight leading-none">VİNÇ İŞLERİ</h2>
            <p className="text-[10px] text-cyan-100 font-bold uppercase tracking-widest mt-1">
              {para(ozet?.vinc_is || 0)} iş · {para(ozet?.vinc_sayisi || 0)} vinç · {para(ozet?.musteri_sayisi || 0)} müşteri
            </p>
          </div>
        </div>
        <button onClick={getir} disabled={yukleniyor}
          className="bg-white/15 hover:bg-white/25 p-2.5 rounded-xl transition">
          <RefreshCw size={15} className={`text-white ${yukleniyor ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {hata && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-700">
            ⚠️ {hata}
          </div>
        )}

        {/* KPI'LAR */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="bg-cyan-50 border border-cyan-100 rounded-2xl p-3">
            <p className="text-[9px] font-black text-cyan-600 uppercase tracking-wider">Vinç İşi</p>
            <p className="text-2xl font-black text-cyan-800 leading-none mt-1">{para(ozet?.vinc_is || 0)}</p>
            <p className="text-[9px] font-bold text-cyan-500 mt-1">ücret girilen işler</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3">
            <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">Vinç Cirosu</p>
            <p className="text-2xl font-black text-emerald-800 leading-none mt-1">{para(ozet?.vinc_ciro || 0)} ₺</p>
            <p className="text-[9px] font-bold text-emerald-500 mt-1">toplam servis geliri</p>
          </div>
          <div className="bg-teal-50 border border-teal-100 rounded-2xl p-3">
            <p className="text-[9px] font-black text-teal-600 uppercase tracking-wider">Abonelik Potansiyeli</p>
            <p className="text-2xl font-black text-teal-800 leading-none mt-1">{para(ozet?.abonelik_potansiyeli || 0)} ₺</p>
            <p className="text-[9px] font-bold text-teal-500 mt-1">yıllık · 6 aylık paketle</p>
          </div>
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3">
            <p className="text-[9px] font-black text-rose-600 uppercase tracking-wider">Bakımı Gecikmiş</p>
            <p className="text-2xl font-black text-rose-800 leading-none mt-1">{para(ozet?.bakimi_gecikmis || 0)}</p>
            <p className="text-[9px] font-bold text-rose-500 mt-1">tarihi geçmiş vinç</p>
          </div>
        </div>

        {/* VİNÇ MÜŞTERİLERİ */}
        <button onClick={() => setAcik((o) => !o)}
          className="w-full flex items-center justify-between bg-slate-900 hover:bg-slate-800 px-4 py-3 rounded-2xl transition">
          <span className="text-[11px] font-black text-white flex items-center gap-2">
            <TrendingUp size={13} /> VİNÇ MÜŞTERİLERİ ({musteriler.length})
          </span>
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${acik ? "rotate-180" : ""}`} />
        </button>

        <AnimatePresence>
          {acik && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="space-y-1.5 max-h-96 overflow-y-auto pt-1">
                {musteriler.map((m, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-black text-slate-800 truncate">{m.musteri}</p>
                      <p className="text-[9px] font-bold text-slate-400">
                        {m.vinc_sayisi} vinç · son servis {m.son_servis || "yok"}
                        {m.gun_once !== null ? ` (${m.gun_once} gün önce)` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] font-black text-emerald-700">{para(m.toplam_ciro)} ₺</p>
                      {m.abonelik_uygun && (
                        <p className="text-[8px] font-black text-amber-600">💡 ABONELİK UYGUN</p>
                      )}
                    </div>
                    <button onClick={() => teklifOlustur(m.musteri, m.vinc_sayisi)}
                      disabled={teklifYukleniyor === m.musteri}
                      className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 text-white px-2.5 py-2 rounded-lg text-[9px] font-black transition shrink-0">
                      {teklifYukleniyor === m.musteri ? "..." : "TEKLİF"}
                    </button>
                  </div>
                ))}
                {musteriler.length === 0 && (
                  <p className="text-[11px] text-slate-400 font-bold text-center py-3">Kayıt yok.</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* VİNÇ ENVANTERİ */}
        <button onClick={() => setEnvAcik((o) => !o)}
          className="w-full flex items-center justify-between bg-cyan-700 hover:bg-cyan-800 px-4 py-3 rounded-2xl transition">
          <span className="text-[11px] font-black text-white flex items-center gap-2">
            <Construction size={13} /> VİNÇ ENVANTERİ ({envanter.length})
          </span>
          <ChevronDown size={14} className={`text-cyan-200 transition-transform ${envAcik ? "rotate-180" : ""}`} />
        </button>

        <AnimatePresence>
          {envAcik && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="space-y-1.5 max-h-96 overflow-y-auto pt-1">
                {envanter.map((v, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-black text-slate-800 truncate">{v.musteri}</p>
                      <p className="text-[9px] font-bold text-slate-400">
                        {v.kapasite} · {v.makine_tipi} · {v.marka}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] font-black text-slate-600">{v.sonraki_bakim || "—"}</p>
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md ${DURUM_RENK[v.durum] || "bg-slate-100 text-slate-500"}`}>
                        {v.durum === "gecikmis" ? `⚠️ ${Math.abs(v.gecikme || 0)} gün gecikmiş`
                          : v.durum === "yaklasan" ? "🕐 yaklaşıyor"
                          : v.durum === "planli" ? "✅ planlı" : "tarihsiz"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FİLO İNDİRİMİ */}
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3">
          <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider mb-2">
            🏷️ FİLO İNDİRİMİ (makine sayısı arttıkça fiyat düşer)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[
              ["1 makine", "9.500 ₺"],
              ["2-3", "7.500 ₺"],
              ["4-6", "6.500 ₺"],
              ["7-9", "5.000 ₺"],
              ["10-14", "4.500 ₺"],
              ["16-24", "4.000 ₺"],
              ["25+", "3.500 ₺"],
            ].map(([a, f]) => (
              <span key={a} className="bg-white border border-emerald-200 rounded-lg px-2.5 py-1.5 text-[9px] font-black text-emerald-800">
                {a} → {f}
              </span>
            ))}
          </div>
          <p className="text-[9px] text-emerald-600 font-medium mt-2">
            Makine başı fiyat (KDV hariç) · 6 aylık abonelik paketi için geçerlidir.
          </p>
        </div>

        <p className="text-[9px] text-slate-400 font-medium text-center leading-relaxed">
          Vinçler, kapasite alanından otomatik tespit edilir (asansör hariç).
        </p>
      </div>

      {/* TEKLİF PENCERESİ */}
      <AnimatePresence>
        {teklif && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
              className="bg-white rounded-3xl w-full max-w-lg overflow-hidden">
              <div className="bg-cyan-700 text-white px-5 py-4 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-sm">ABONELİK TEKLİFİ</h3>
                  <p className="text-[10px] text-cyan-200 mt-0.5">{teklif.musteri}</p>
                </div>
                <button onClick={() => setTeklif(null)} className="bg-cyan-800 hover:bg-red-500 p-2 rounded-full transition">
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <pre className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-medium text-slate-700 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
{teklif.metin}
                </pre>
                <div className="flex gap-2">
                  <button onClick={kopyala}
                    className={`flex-1 py-3.5 rounded-xl font-black text-xs transition flex items-center justify-center gap-2 ${kopyalandi ? "bg-emerald-600 text-white" : "bg-slate-900 hover:bg-slate-800 text-white"}`}>
                    <Copy size={14} /> {kopyalandi ? "KOPYALANDI" : "MESAJI KOPYALA"}
                  </button>
                  <button onClick={() => setTeklif(null)}
                    className="px-5 py-3.5 bg-slate-100 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-200 transition">
                    Kapat
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
