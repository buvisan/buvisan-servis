"use client";

// ----------------------------------------------------------------------------
// BUVISAN - BAKIM FORMLARIM 📋
// mod="personel" → personel kendi formlarını görür + PDF
// mod="admin"    → tüm saha raporları (servis + bakım birleşik)
// Kaynak: benim_bakim_formlarim() · saha_raporlari_birlesik()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ServisRaporuFormu from "@/components/ServisRaporuFormu";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList, Loader2, RefreshCw, ChevronDown, X, Printer,
  CheckCircle2, PauseCircle, FileText, Wrench,
} from "lucide-react";

const TIP_AD: Record<string, string> = { vinc: "🏗️ VİNÇ", asansor: "🏢 ASANSÖR" };
const TIP_RENK: Record<string, string> = {
  vinc: "bg-teal-100 text-teal-700 border-teal-200",
  asansor: "bg-cyan-100 text-cyan-700 border-cyan-200",
};

export default function BakimFormlarim({ mod = "personel" }: { mod?: "personel" | "admin" }) {
  const [liste, setListe] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [acik, setAcik] = useState(false);
  const [detay, setDetay] = useState<any>(null);
  const [detayYuk, setDetayYuk] = useState(false);

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      if (mod === "admin") {
        const { data } = await supabase.rpc("saha_raporlari_birlesik", { p_limit: 80 });
        setListe(data || []);
      } else {
        const { data } = await supabase.rpc("benim_bakim_formlarim", { p_limit: 30 });
        setListe(data || []);
      }
    } finally { setYukleniyor(false); }
  }, [mod]);

  useEffect(() => { getir(); }, [getir]);

  const detayAc = async (id: string, kaynak?: string) => {
    setDetayYuk(true);
    try {
      if (kaynak === "servis") {
        const { data } = await supabase.from("service_reports").select("*").eq("id", id).maybeSingle();
        setDetay(data ? { ...data, _servis: true } : null);
      } else {
        const { data } = await supabase.from("bakim_formlari").select("*").eq("id", id).maybeSingle();
        setDetay(data);
      }
    } finally { setDetayYuk(false); }
  };

  const yazdir = () => {
    const hedefId = detay?._servis ? "bf-yazdir-servis" : "bf-yazdir";
    const icerik = document.getElementById(hedefId)?.innerHTML;
    if (!icerik) { alert("Form içeriği bulunamadı."); return; }
    const w = window.open("", "_blank");
    if (!w) { alert("Pop-up engellendi. Lütfen izin verin."); return; }
    // ⭐ SAYFANIN TÜM CSS'İNİ KOPYALA (Tailwind dahil) → tablolar bozulmaz
    const stiller = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((el) => el.outerHTML).join("\n");
    w.document.write(`<!DOCTYPE html><html><head><title>${detay?.seri_no || "Bakım Formu"}</title>
      ${stiller}
      <style>
        @page { size: A4; margin: 10mm; }
        html, body { margin: 0; padding: 0; background: #fff !important; }
        body { font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        table { border-collapse: collapse; width: 100%; page-break-inside: auto; }
        tr, td, th { page-break-inside: avoid; }
        .srp-form { zoom: 1 !important; box-shadow: none !important; margin: 0 !important; width: 100% !important; min-height: auto !important; }
        .no-print, button { display: none !important; }
        img { max-height: 60px; }
        h1 { font-size: 16px; }
        h2 { page-break-after: avoid; }
      </style>
    </head><body>${icerik}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 700);
  };;

  const baslik = mod === "admin" ? "SAHA RAPORLARI" : "BAKIM FORMLARIM";
  const altBaslik = mod === "admin"
    ? `${liste.length} kayıt · servis + bakım formları`
    : `${liste.length} form · doldurduğun bakım formları`;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <button onClick={() => setAcik((o) => !o)}
        className="w-full bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-3.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="bg-white/15 p-2 rounded-xl"><ClipboardList size={17} className="text-white" /></div>
          <div className="text-left">
            <h2 className="text-white font-black text-sm leading-none">{baslik}</h2>
            <p className="text-[10px] text-slate-400 font-bold mt-1">{altBaslik}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={(e) => { e.stopPropagation(); getir(); }} className="bg-white/10 hover:bg-white/20 p-2 rounded-lg transition">
            <RefreshCw size={13} className={`text-white ${yukleniyor ? "animate-spin" : ""}`} />
          </button>
          <ChevronDown size={15} className={`text-slate-400 transition-transform ${acik ? "rotate-180" : ""}`} />
        </div>
      </button>

      <AnimatePresence>
        {acik && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="p-3">
              {yukleniyor ? (
                <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" /></div>
              ) : liste.length === 0 ? (
                <div className="py-5 text-center bg-slate-50 rounded-2xl">
                  <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-[11px] font-black text-slate-500">
                    {mod === "admin" ? "Henüz saha raporu yok" : "Henüz form doldurmadın"}
                  </p>
                  <p className="text-[9px] text-slate-400 font-medium mt-1 px-4">
                    {mod === "admin"
                      ? "Personel form doldurduğunda burada görünür."
                      : "İş kartından VİNÇ BAKIM veya ASANSÖR BAKIM butonuyla form doldurabilirsin."}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {liste.map((f: any) => {
                    const bakimMi = true;
                    return (
                      <button key={f.id}
                        onClick={() => detayAc(f.id, f.kaynak)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-2.5 hover:border-teal-300 transition text-left">
                        <span className="text-base shrink-0">
                          {mod === "admin"
                            ? (f.kaynak === "bakim" ? (String(f.tip || "").includes("Asansör") ? "🏢" : "🏗️") : "📄")
                            : (TIP_AD[f.form_tipi]?.slice(0, 2) || "📋")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-black text-slate-800 truncate">
                            {mod === "admin" ? (f.baslik || f.musteri) : f.musteri}
                          </p>
                          <p className="text-[9px] font-bold text-slate-400 truncate">
                            {mod === "admin"
                              ? `${f.tip} · ${f.personel} · ${f.ozet}`
                              : `${f.seri_no} · ${f.kontrol_tarihi}${f.kim && f.kim !== "—" ? " · " + f.kim : ""} · ${f.onay_sayisi}✅ ${f.ret_sayisi}⚠️`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {mod === "admin" ? (
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${f.kaynak === "bakim" ? "bg-teal-100 text-teal-700" : "bg-blue-100 text-blue-700"}`}>
                              {f.kaynak === "bakim" ? "BAKIM" : "SERVİS"}
                            </span>
                          ) : f.kaynak === "servis" ? (
                            <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">SERVİS</span>
                          ) : f.is_durumu === "devam_ediyor" ? (
                            <span className="text-[8px] font-black text-amber-600 flex items-center gap-0.5"><PauseCircle size={9} /> DEVAM</span>
                          ) : (
                            <span className="text-[8px] font-black text-emerald-600 flex items-center gap-0.5"><CheckCircle2 size={9} /> TAMAM</span>
                          )}
                          <p className="text-[8px] font-bold text-slate-400 mt-0.5">
                            {mod === "admin" ? f.tarih : f.olusturma}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DETAY MODAL */}
      <AnimatePresence>
        {(detay || detayYuk) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[999] flex items-center justify-center p-2 md:p-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }}
              className={`bg-white rounded-3xl w-full overflow-hidden max-h-[95vh] flex flex-col ${detay?._servis ? "max-w-[230mm]" : "max-w-2xl"}`}>
              <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="font-black text-sm">{detay?.seri_no || "..."}</h3>
                  <p className="text-[10px] text-slate-400">{detay?.musteri || ""}</p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={yazdir} disabled={!detay}
                    className="bg-teal-600 hover:bg-teal-700 disabled:bg-slate-700 px-3 py-2 rounded-xl text-[10px] font-black flex items-center gap-1">
                    <Printer size={12} /> PDF
                  </button>
                  <button onClick={() => setDetay(null)} className="bg-slate-800 hover:bg-red-500 p-2 rounded-xl">
                    <X size={15} />
                  </button>
                </div>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                {detayYuk && !detay ? (
                  <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" /></div>
                ) : detay ? (
                  detay._servis ? (
                    <div id="bf-yazdir-servis" className="overflow-x-auto">
                      <ServisRaporuFormu rapor={detay} />
                    </div>
                  ) : (
<div id="bf-yazdir" className="space-y-3">
                    <div className="text-center border-b-2 border-slate-800 pb-2">
                      <h1 className="text-base font-black">
                        {detay._servis ? "SERVİS RAPORU"
                          : detay.form_tipi === "asansor" ? "YÜK PLATFORMU PERİYODİK BAKIM FORMU"
                          : "VİNÇ PERİYODİK BAKIM FORMU"}
                      </h1>
                      <p className="text-[10px] font-bold text-slate-500">BUVİSAN VİNÇ SERVİS</p>
                    </div>

                    {/* SERVİS RAPORU DETAYI */}
                    {detay._servis && (
                      <div className="space-y-2">
                        <table className="w-full text-[10px] border-collapse">
                          <tbody>
                            <tr>
                              <td className="border border-slate-300 p-1 font-bold bg-slate-50 w-24">Müşteri</td>
                              <td className="border border-slate-300 p-1" colSpan={3}>{detay.firma_adi || detay.musteri_adi || "—"}</td>
                            </tr>
                            <tr>
                              <td className="border border-slate-300 p-1 font-bold bg-slate-50">Tarih</td>
                              <td className="border border-slate-300 p-1">{detay.isyerine_varis_tarih_saat ? new Date(detay.isyerine_varis_tarih_saat).toLocaleString("tr-TR") : (detay.created_at ? new Date(detay.created_at).toLocaleString("tr-TR") : "—")}</td>
                              <td className="border border-slate-300 p-1 font-bold bg-slate-50 w-24">Ücret</td>
                              <td className="border border-slate-300 p-1">{detay.malzeme_tutari ? Number(detay.malzeme_tutari).toLocaleString("tr-TR") + " ₺" : "—"}</td>
                            </tr>
                            <tr>
                              <td className="border border-slate-300 p-1 font-bold bg-slate-50">Teknisyen</td>
                              <td className="border border-slate-300 p-1">{detay.personel_adi || detay.technician || "—"}</td>
                              <td className="border border-slate-300 p-1 font-bold bg-slate-50">Süre</td>
                              <td className="border border-slate-300 p-1">{detay.sure_dakika ? detay.sure_dakika + " dk" : "—"}</td>
                            </tr>
                          </tbody>
                        </table>
                        {detay.description && (
                          <div>
                            <p className="text-[9px] font-black bg-slate-100 px-2 py-0.5">YAPILAN İŞ</p>
                            <p className="border border-slate-300 p-1.5 text-[9px] whitespace-pre-wrap">{detay.yapilan_isler || detay.arizanin_cinsi || "—"}</p>
                          </div>
                        )}
                        {detay.materials_text && (
                          <div>
                            <p className="text-[9px] font-black bg-slate-100 px-2 py-0.5">KULLANILAN PARÇALAR</p>
                            <p className="border border-slate-300 p-1.5 text-[9px] whitespace-pre-wrap">{(detay.imza_atan ? "Müşteri yetkilisi: " + detay.imza_atan : "")}</p>
                          </div>
                        )}
                        {(detay.imza_url || detay.musteri_puani) && (
                          <p className="text-[10px] font-black text-amber-600">⭐ Müşteri Puanı: {detay.musteri_puani}/5</p>
                        )}
                      </div>
                    )}
                    <table className="w-full text-[10px] border-collapse">
                      <tbody>
                        <tr>
                          <td className="border border-slate-300 p-1 font-bold bg-slate-50 w-24">Seri No</td>
                          <td className="border border-slate-300 p-1">{detay.seri_no}</td>
                          <td className="border border-slate-300 p-1 font-bold bg-slate-50 w-24">Tarih</td>
                          <td className="border border-slate-300 p-1">{detay.kontrol_tarihi ? new Date(detay.kontrol_tarihi).toLocaleDateString("tr-TR") : "—"}</td>
                        </tr>
                        <tr>
                          <td className="border border-slate-300 p-1 font-bold bg-slate-50">Müşteri</td>
                          <td className="border border-slate-300 p-1">{detay.musteri || "—"}</td>
                          <td className="border border-slate-300 p-1 font-bold bg-slate-50">Personel</td>
                          <td className="border border-slate-300 p-1">{detay.personel || "—"}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="flex gap-2 flex-wrap text-[10px] font-black">
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">✅ {detay.onay_sayisi}</span>
                      <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-700">⚠️ {detay.ret_sayisi}</span>
                      {detay.musteri_puani ? <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700">⭐ {detay.musteri_puani}/5</span> : null}
                      <span className={`px-2 py-0.5 rounded ${detay.is_durumu === "devam_ediyor" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {detay.is_durumu === "devam_ediyor" ? "⏸️ DEVAM" : "✅ TAMAM"}
                      </span>
                    </div>
                    {(() => {
                      const md = Array.isArray(detay.maddeler) ? detay.maddeler : [];
                      const g: Record<string, any[]> = {};
                      md.forEach((m: any) => { const k = m.grup || "DİĞER"; (g[k] ||= []).push(m); });
                      return Object.entries(g).map(([grup, items]) => (
                        <div key={grup}>
                          <h2 className="text-[10px] font-black bg-slate-100 px-2 py-1 border-l-4 border-teal-600">{grup}</h2>
                          <table className="w-full border-collapse text-[9px]">
                            <thead><tr>
                              <th className="border border-slate-300 p-0.5 text-left bg-slate-50">Madde</th>
                              <th className="border border-slate-300 p-0.5 w-12 bg-slate-50">RET</th>
                              <th className="border border-slate-300 p-0.5 w-12 bg-slate-50">ONAY</th>
                            </tr></thead>
                            <tbody>{items.map((m: any, i: number) => (
                              <tr key={i}>
                                <td className="border border-slate-300 p-0.5">{m.madde}</td>
                                <td className="border border-slate-300 p-0.5 text-center text-rose-600 font-black">{m.sonuc === "ret" ? "✔" : ""}</td>
                                <td className="border border-slate-300 p-0.5 text-center text-emerald-600 font-black">{m.sonuc === "onay" ? "✔" : ""}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      ));
                    })()}
                    {detay.notlar && (
                      <div><p className="text-[9px] font-black bg-slate-100 px-2 py-0.5">NOT</p>
                        <p className="border border-slate-300 p-1.5 text-[9px]">{detay.notlar}</p></div>
                    )}
                    <div className="grid grid-cols-2 gap-4 pt-3">
                      <div className="text-center">
                        <p className="text-[8px] font-black text-slate-500">KONTROLÜ YAPAN</p>
                        <p className="text-[9px] font-bold">{detay.personel || "—"}</p>
                        {detay.personel_imza ? <img src={detay.personel_imza} alt="imza" className="h-12 mx-auto object-contain" /> : <div className="h-12" />}
                        <div className="border-t border-slate-800 text-[8px] font-bold pt-0.5">İMZA</div>
                      </div>
                      <div className="text-center">
                        <p className="text-[8px] font-black text-slate-500">FİRMA GÖREVLİSİ</p>
                        <p className="text-[9px] font-bold">{detay.musteri_adi || detay.musteri || "—"}</p>
                        {detay.musteri_imza ? <img src={detay.musteri_imza} alt="imza" className="h-12 mx-auto object-contain" /> : <div className="h-12" />}
                        <div className="border-t border-slate-800 text-[8px] font-bold pt-0.5">İMZA</div>
                      </div>
                    </div>
                  </div>
                )
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
