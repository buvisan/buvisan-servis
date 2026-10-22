"use client";

// ----------------------------------------------------------------------------
// BUVISAN - BAKIM FORMLARI LİSTESİ 📋 (A + C)
//   A) Tüm formları listeler, tipe göre filtreler
//   C) Formu görüntüler + PDF/PRINT indirir
// Kaynak: bakim_formlari_liste()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList, Loader2, RefreshCw, ArrowLeft, X, Printer,
  Check, AlertTriangle, Star, PenLine, PauseCircle, CheckCircle2,
} from "lucide-react";

const TIP_AD: Record<string, string> = { vinc: "🏗️ VİNÇ", asansor: "🏢 ASANSÖR" };
const TIP_RENK: Record<string, string> = {
  vinc: "bg-teal-100 text-teal-700 border-teal-200",
  asansor: "bg-cyan-100 text-cyan-700 border-cyan-200",
};

export default function BakimFormlariSayfasi() {
  const [liste, setListe] = useState<any[]>([]);
  const [filtre, setFiltre] = useState<"hepsi" | "vinc" | "asansor">("hepsi");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [detay, setDetay] = useState<any>(null);
  const [detayYuk, setDetayYuk] = useState(false);
  const [hata, setHata] = useState("");

  const getir = useCallback(async () => {
    setYukleniyor(true);
    setHata("");
    try {
      const { data, error } = await supabase.rpc("bakim_formlari_liste", {
        p_tip: filtre === "hepsi" ? null : filtre,
        p_limit: 100,
      });
      if (error) { setHata(error.message); return; }
      setListe(data || []);
    } finally { setYukleniyor(false); }
  }, [filtre]);

  useEffect(() => { getir(); }, [getir]);

  const detayAc = async (id: string) => {
    setDetayYuk(true);
    try {
      const { data } = await supabase.from("bakim_formlari").select("*").eq("id", id).maybeSingle();
      setDetay(data);
    } finally { setDetayYuk(false); }
  };

  const yazdir = () => {
    const icerik = document.getElementById("form-yazdir")?.innerHTML;
    if (!icerik) return;
    const w = window.open("", "_blank");
    if (!w) { alert("Pop-up engellendi. Lütfen izin verin."); return; }
    const stiller = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((el) => el.outerHTML).join("\n");
    w.document.write(`<!DOCTYPE html><html><head><title>${detay?.seri_no || "Bakım Formu"}</title>
      ${stiller}
      <style>
        @page { size: A4; margin: 10mm; }
        html, body { margin: 0; padding: 0; background: #fff !important; }
        body { font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        table { border-collapse: collapse; width: 100%; }
        tr, td, th { page-break-inside: avoid; }
        .no-print, button { display: none !important; }
        img { max-height: 60px; }
      </style>
    </head><body>${icerik}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 700);
  };;

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-16">
      {/* BAŞLIK */}
      <div className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-2.5 rounded-xl transition">
              <ArrowLeft size={16} />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="bg-white/10 p-2 rounded-xl"><ClipboardList size={18} /></div>
              <div>
                <h1 className="font-black text-sm leading-none">BAKIM FORMLARI</h1>
                <p className="text-[10px] text-slate-400 font-bold mt-1">
                  {liste.length} form · periyodik bakım kayıtları
                </p>
              </div>
            </div>
          </div>
          <button onClick={getir} disabled={yukleniyor} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-2.5 rounded-xl transition">
            <RefreshCw size={16} className={yukleniyor ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-4">
        {hata && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700">
            ⚠️ {hata}
            <p className="text-[10px] font-medium mt-1">→ SQL 130 çalıştırıldı mı?</p>
          </div>
        )}

        {/* FİLTRE */}
        <div className="flex gap-2 flex-wrap">
          {([["hepsi", "Tümü"], ["vinc", "🏗️ Vinç"], ["asansor", "🏢 Asansör"]] as const).map(([k, a]) => (
            <button key={k} onClick={() => setFiltre(k as any)}
              className={`px-4 py-2.5 rounded-xl text-xs font-black transition ${
                filtre === k ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {a}
            </button>
          ))}
        </div>

        {/* LİSTE */}
        {yukleniyor ? (
          <div className="py-16 text-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" /></div>
        ) : liste.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
            <ClipboardList className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-black text-slate-500">Henüz bakım formu yok</p>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Personel ekranından "VİNÇ BAKIM" veya "ASANSÖR BAKIM" butonuyla form doldurulunca burada görünür.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {liste.map((f) => (
              <button key={f.id} onClick={() => detayAc(f.id)}
                className="w-full bg-white border border-slate-200 rounded-2xl p-3 flex items-center gap-3 hover:border-teal-300 hover:shadow-md transition text-left">
                <div className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black border shrink-0 ${TIP_RENK[f.form_tipi] || "bg-slate-100 text-slate-600"}`}>
                  {TIP_AD[f.form_tipi] || f.form_tipi}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-black text-slate-800 truncate">{f.musteri || "—"}</p>
                  <p className="text-[10px] font-bold text-slate-400">
                    {f.seri_no} · {f.kontrol_tarihi} · {f.personel || "—"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-[10px] font-black text-emerald-600">✅ {f.onay_sayisi}</span>
                    {f.ret_sayisi > 0 && <span className="text-[10px] font-black text-rose-600">⚠️ {f.ret_sayisi}</span>}
                  </div>
                  {f.is_durumu === "devam_ediyor" ? (
                    <span className="text-[9px] font-black text-amber-600 flex items-center gap-1 justify-end mt-0.5">
                      <PauseCircle size={10} /> DEVAM EDİYOR
                    </span>
                  ) : (
                    <span className="text-[9px] font-black text-emerald-600 flex items-center gap-1 justify-end mt-0.5">
                      <CheckCircle2 size={10} /> TAMAM
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* DETAY MODAL */}
      <AnimatePresence>
        {(detay || detayYuk) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[999] flex items-center justify-center p-2 md:p-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }}
              className="bg-white rounded-3xl w-full max-w-3xl overflow-hidden max-h-[95vh] flex flex-col">
              <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0 no-print">
                <div>
                  <h3 className="font-black text-sm">{detay?.seri_no || "YÜKLENİYOR..."}</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {detay ? `${TIP_AD[detay.form_tipi] || detay.form_tipi} · ${detay.musteri || ""}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={yazdir} disabled={!detay}
                    className="bg-teal-600 hover:bg-teal-700 disabled:bg-slate-700 px-3 py-2 rounded-xl text-[10px] font-black flex items-center gap-1.5 transition">
                    <Printer size={13} /> PDF / YAZDIR
                  </button>
                  <button onClick={() => setDetay(null)} className="bg-slate-800 hover:bg-red-500 p-2 rounded-xl transition">
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="p-5 overflow-y-auto flex-1">
                {detayYuk && !detay ? (
                  <div className="py-12 text-center"><Loader2 className="w-7 h-7 animate-spin text-slate-400 mx-auto" /></div>
                ) : detay ? (
                  <div id="form-yazdir" className="space-y-4">
                    {/* BAŞLIK */}
                    <div className="text-center border-b-2 border-slate-800 pb-3">
                      <h1 className="text-lg font-black text-slate-900">
                        {detay.form_tipi === "asansor" ? "YÜK PLATFORMU PERİYODİK BAKIM FORMU" : "VİNÇ PERİYODİK BAKIM FORMU"}
                      </h1>
                      <p className="text-[11px] font-bold text-slate-500 mt-1">BUVİSAN VİNÇ SERVİS</p>
                    </div>

                    {/* BİLGİLER */}
                    <table className="w-full text-[10px] border-collapse">
                      <tbody>
                        <tr>
                          <td className="border border-slate-300 p-1.5 font-bold bg-slate-50 w-32">Seri No</td>
                          <td className="border border-slate-300 p-1.5">{detay.seri_no}</td>
                          <td className="border border-slate-300 p-1.5 font-bold bg-slate-50 w-32">Kontrol Tarihi</td>
                          <td className="border border-slate-300 p-1.5">
                            {detay.kontrol_tarihi ? new Date(detay.kontrol_tarihi).toLocaleDateString("tr-TR") : "—"}
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-slate-300 p-1.5 font-bold bg-slate-50">Müşteri</td>
                          <td className="border border-slate-300 p-1.5">{detay.musteri || "—"}</td>
                          <td className="border border-slate-300 p-1.5 font-bold bg-slate-50">Yetkili</td>
                          <td className="border border-slate-300 p-1.5">{detay.yetkili || "—"}</td>
                        </tr>
                        <tr>
                          <td className="border border-slate-300 p-1.5 font-bold bg-slate-50">Personel</td>
                          <td className="border border-slate-300 p-1.5">{detay.personel || "—"}</td>
                          <td className="border border-slate-300 p-1.5 font-bold bg-slate-50">Adres</td>
                          <td className="border border-slate-300 p-1.5">{detay.adres || "—"}</td>
                        </tr>
                        {detay.makine_bilgileri && Object.keys(detay.makine_bilgileri).length > 0 && (
                          <tr>
                            <td className="border border-slate-300 p-1.5 font-bold bg-slate-50 align-top">Makine</td>
                            <td className="border border-slate-300 p-1.5" colSpan={3}>
                              {Object.entries(detay.makine_bilgileri).filter(([, v]) => v).map(([k, v]) => (
                                <span key={k} className="inline-block mr-3">{k}: <b>{String(v)}</b></span>
                              ))}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {/* ÖZET */}
                    <div className="flex gap-3 flex-wrap text-[10px] font-black">
                      <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700">✅ ONAY: {detay.onay_sayisi}</span>
                      <span className="px-2 py-1 rounded bg-rose-100 text-rose-700">⚠️ RET: {detay.ret_sayisi}</span>
                      {detay.musteri_puani ? (
                        <span className="px-2 py-1 rounded bg-amber-100 text-amber-700">⭐ {detay.musteri_puani}/5</span>
                      ) : null}
                      <span className={`px-2 py-1 rounded ${detay.is_durumu === "devam_ediyor" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {detay.is_durumu === "devam_ediyor" ? "⏸️ DEVAM EDİYOR" : "✅ TAMAMLANDI"}
                      </span>
                    </div>

                    {/* MADDELER — GRUP GRUP */}
                    {(() => {
                      const maddeler = Array.isArray(detay.maddeler) ? detay.maddeler : [];
                      const gruplar: Record<string, any[]> = {};
                      maddeler.forEach((m: any) => {
                        const g = m.grup || "DİĞER";
                        if (!gruplar[g]) gruplar[g] = [];
                        gruplar[g].push(m);
                      });
                      return Object.entries(gruplar).map(([grup, items]) => (
                        <div key={grup}>
                          <h2 className="text-[11px] font-black text-slate-700 bg-slate-100 px-2 py-1.5 border-l-4 border-teal-600">
                            {grup}
                          </h2>
                          <table className="w-full border-collapse text-[10px]">
                            <thead>
                              <tr>
                                <th className="border border-slate-300 p-1 text-left bg-slate-50">Kontrol Maddesi</th>
                                <th className="border border-slate-300 p-1 bg-slate-50 w-16">RET</th>
                                <th className="border border-slate-300 p-1 bg-slate-50 w-16">ONAY</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((m: any, i: number) => (
                                <tr key={i}>
                                  <td className="border border-slate-300 p-1">{m.madde}</td>
                                  <td className="border border-slate-300 p-1 text-center font-black text-rose-600">
                                    {m.sonuc === "ret" ? "✔" : ""}
                                  </td>
                                  <td className="border border-slate-300 p-1 text-center font-black text-emerald-600">
                                    {m.sonuc === "onay" ? "✔" : ""}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ));
                    })()}

                    {/* NOT */}
                    {detay.notlar && (
                      <div>
                        <p className="text-[10px] font-black text-slate-600 bg-slate-100 px-2 py-1">NOT</p>
                        <p className="border border-slate-300 p-2 text-[10px] min-h-[40px]">{detay.notlar}</p>
                      </div>
                    )}

                    {/* MEMNUNİYET + YORUM */}
                    {detay.musteri_yorumu && (
                      <div>
                        <p className="text-[10px] font-black text-slate-600 bg-slate-100 px-2 py-1">MÜŞTERİ YORUMU</p>
                        <p className="border border-slate-300 p-2 text-[10px] italic">"{detay.musteri_yorumu}"</p>
                      </div>
                    )}

                    {/* İMZALAR */}
                    <div className="grid grid-cols-2 gap-6 pt-4">
                      <div className="text-center">
                        <p className="text-[9px] font-black text-slate-500 mb-1">KONTROLÜ YAPAN</p>
                        <p className="text-[10px] font-bold mb-1">{detay.personel || "—"}</p>
                        {detay.personel_imza ? (
                          <img src={detay.personel_imza} alt="imza" className="h-14 mx-auto object-contain" />
                        ) : <div className="h-14" />}
                        <div className="border-t border-slate-800 pt-1 text-[9px] font-bold">İMZA</div>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] font-black text-slate-500 mb-1">FİRMA GÖREVLİSİ</p>
                        <p className="text-[10px] font-bold mb-1">{detay.musteri_adi || detay.musteri || "—"}</p>
                        {detay.musteri_imza ? (
                          <img src={detay.musteri_imza} alt="imza" className="h-14 mx-auto object-contain" />
                        ) : <div className="h-14" />}
                        <div className="border-t border-slate-800 pt-1 text-[9px] font-bold">İMZA</div>
                      </div>
                    </div>

                    <p className="text-[8px] text-slate-400 text-center pt-3 border-t border-slate-200">
                      BELGE NO: {detay.seri_no} · Oluşturma: {new Date(detay.created_at).toLocaleString("tr-TR")}
                    </p>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
