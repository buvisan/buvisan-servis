"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - TEKLİF İSTE 💰 (personel)
// Personel: firma + malzeme listesi girer → admin "Teklif Bekleyenler"e düşer
// Kaynak: teklif_gerekli_isaretle()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Plus, Trash2, Loader2, CheckCircle2, ChevronDown,
  Send, Package, AlertCircle,
} from "lucide-react";

type Kalem = { ad: string; adet: string; birim: string };

export default function TeklifIsteKarti({ personelAdi }: { personelAdi?: string }) {
  const [acik, setAcik] = useState(false);
  const [formAcik, setFormAcik] = useState(false);
  const [musteri, setMusteri] = useState("");
  const [ariza, setAriza] = useState("");
  const [kalemler, setKalemler] = useState<Kalem[]>([{ ad: "", adet: "1", birim: "Adet" }]);
  const [notlar, setNotlar] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [mesaj, setMesaj] = useState("");
  const [bekleyenler, setBekleyenler] = useState<any[]>([]);

  const getir = useCallback(async () => {
    try {
      const { data } = await supabase.rpc("teklif_bekleyen_listesi", { p_durum: "BEKLIYOR" });
      setBekleyenler(data || []);
    } catch { setBekleyenler([]); }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  const kalemEkle = () => setKalemler((k) => [...k, { ad: "", adet: "1", birim: "Adet" }]);
  const kalemSil = (i: number) => setKalemler((k) => k.filter((_, x) => x !== i));
  const kalemGuncelle = (i: number, alan: keyof Kalem, deger: string) =>
    setKalemler((k) => k.map((x, idx) => idx === i ? { ...x, [alan]: deger } : x));

  const gonder = async () => {
    if (!musteri.trim()) { setMesaj("⚠️ Firma adı zorunludur."); return; }
    const doluKalemler = kalemler.filter((k) => k.ad.trim());
    if (doluKalemler.length === 0) { setMesaj("⚠️ En az 1 malzeme girin."); return; }

    setGonderiliyor(true);
    setMesaj("");
    try {
      // Malzemeleri metin olarak hazırla
      const malzemeMetni = doluKalemler
        .map((k) => `• ${k.ad.trim()} — ${k.adet || "1"} ${k.birim || "Adet"}`)
        .join("\n");

      const arizaMetni = [
        ariza.trim() ? `AÇIKLAMA: ${ariza.trim()}` : "",
        `MALZEMELER:\n${malzemeMetni}`,
        notlar.trim() ? `NOT: ${notlar.trim()}` : "",
        personelAdi ? `İSTEYEN: ${personelAdi}` : "",
      ].filter(Boolean).join("\n\n");

      const { data, error } = await supabase.rpc("teklif_gerekli_isaretle", {
        p_musteri: musteri.trim(),
        p_ariza: arizaMetni,
        p_is_emri_no: null,
      });

      if (error || !(data as any)?.ok) {
        setMesaj("❌ " + (error?.message || (data as any)?.mesaj || "Gönderilemedi."));
        return;
      }

      setMesaj("✅ " + ((data as any).mesaj || "Teklif talebi gönderildi. Admin görecek."));
      setMusteri(""); setAriza(""); setNotlar("");
      setKalemler([{ ad: "", adet: "1", birim: "Adet" }]);
      setTimeout(() => { setFormAcik(false); setMesaj(""); getir(); }, 2000);
    } finally { setGonderiliyor(false); }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <button onClick={() => setAcik((o) => !o)}
        className="w-full bg-gradient-to-r from-purple-700 to-indigo-700 px-4 py-3.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="bg-white/15 p-2 rounded-xl"><FileText size={17} className="text-white" /></div>
          <div className="text-left">
            <h2 className="text-white font-black text-sm leading-none">TEKLİF İSTE</h2>
            <p className="text-[10px] text-purple-200 font-bold mt-1">
              Malzeme gir → admin teklif hazırlasın
            </p>
          </div>
        </div>
        <ChevronDown size={15} className={`text-purple-200 transition-transform ${acik ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {acik && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="p-3 space-y-3">

              {!formAcik ? (
                <>
                  <button onClick={() => setFormAcik(true)}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3.5 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition">
                    <Plus size={15} /> YENİ TEKLİF TALEBİ
                  </button>

                  {bekleyenler.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black text-slate-400 uppercase">
                        BEKLEYEN TEKLİFLER ({bekleyenler.length})
                      </p>
                      {bekleyenler.slice(0, 5).map((b: any) => (
                        <div key={b.id} className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                          <p className="text-[11px] font-black text-amber-900 truncate">{b.musteri || "—"}</p>
                          <p className="text-[9px] font-bold text-amber-600 line-clamp-2">{b.ariza || ""}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {bekleyenler.length === 0 && (
                    <div className="bg-slate-50 rounded-2xl p-4 text-center">
                      <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-[11px] font-black text-slate-500">Bekleyen teklif yok</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* FİRMA */}
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase">Firma *</label>
                    <input value={musteri} onChange={(e) => setMusteri(e.target.value)}
                      placeholder="Firma adı"
                      className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500" />
                  </div>

                  {/* AÇIKLAMA */}
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase">Açıklama</label>
                    <input value={ariza} onChange={(e) => setAriza(e.target.value)}
                      placeholder="Ne için teklif istiyorsun?"
                      className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500" />
                  </div>

                  {/* MALZEMELER */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
                        <Package size={10} /> Malzemeler *
                      </label>
                      <button onClick={kalemEkle}
                        className="text-[9px] font-black text-purple-600 hover:text-purple-800 flex items-center gap-0.5">
                        <Plus size={10} /> EKLE
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {kalemler.map((k, i) => (
                        <div key={i} className="flex gap-1.5 items-center">
                          <input value={k.ad} onChange={(e) => kalemGuncelle(i, "ad", e.target.value)}
                            placeholder="Malzeme adı"
                            className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] outline-none focus:border-purple-500" />
                          <input value={k.adet} onChange={(e) => kalemGuncelle(i, "adet", e.target.value)}
                            placeholder="1" type="number"
                            className="w-14 p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-center outline-none focus:border-purple-500" />
                          <select value={k.birim} onChange={(e) => kalemGuncelle(i, "birim", e.target.value)}
                            className="w-20 p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] outline-none focus:border-purple-500">
                            <option>Adet</option><option>Metre</option><option>Kg</option>
                            <option>Litre</option><option>Takım</option><option>Kutu</option>
                          </select>
                          {kalemler.length > 1 && (
                            <button onClick={() => kalemSil(i)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* NOT */}
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase">Not</label>
                    <textarea rows={2} value={notlar} onChange={(e) => setNotlar(e.target.value)}
                      placeholder="Acil mi, ne zaman lazım..."
                      className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs resize-none outline-none focus:border-purple-500" />
                  </div>

                  {mesaj && (
                    <div className={`p-2.5 rounded-xl text-[10px] font-bold ${
                      mesaj.startsWith("✅") ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
                      {mesaj}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => { setFormAcik(false); setMesaj(""); }}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl text-[11px] font-black hover:bg-slate-200 transition">
                      İPTAL
                    </button>
                    <button onClick={gonder} disabled={gonderiliyor}
                      className="flex-[2] py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-2 transition">
                      {gonderiliyor ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      {gonderiliyor ? "GÖNDERİLİYOR..." : "TEKLİF TALEBİ GÖNDER"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
