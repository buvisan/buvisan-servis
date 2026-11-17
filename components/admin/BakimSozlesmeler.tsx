"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - BAKIM SÖZLEŞMELERİ 📋
// Bakım takvimi ekranına gömülü sözleşme yönetimi
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { sozlesmeHtml } from "@/lib/sozlesmeHtml";
import { yazdirVeyaPaylas } from "@/lib/yazdirPaylas";
import {
  Plus, X, Loader2, FileText, Trash2, AlertTriangle, CheckCircle2,
  Clock, Building2, Calendar, RefreshCw, ExternalLink,
} from "lucide-react";

type Sozlesme = {
  id: string;
  company_name: string;
  machine_count: number;
  price_per_machine: number;
  maintenance_period_months: number;
  start_date: string;
  end_date: string;
  status: string;
  contract_file_url: string | null;
  hitap_adi?: string | null;
  service_price?: number | null;
  machine_type?: string | null;
  yearly_total?: number | null;
  visits_per_year?: number | null;
  asama?: string | null;
};

export default function BakimSozlesmeler() {
  const [liste, setListe] = useState<Sozlesme[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [mesaj, setMesaj] = useState("");
  const [formAcik, setFormAcik] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [arama, setArama] = useState("");

  const [cFirma, setCFirma] = useState("");
  const [cMakine, setCMakine] = useState(1);
  const [cFiyat, setCFiyat] = useState("");
  const [cPeriyot, setCPeriyot] = useState(3);
  const [cSure, setCSure] = useState(1);
  const [cBaslangic, setCBaslangic] = useState(new Date().toISOString().slice(0, 10));
  const [cDosya, setCDosya] = useState<File | null>(null);
  const [cHitap, setCHitap] = useState("");
  const [cServis, setCServis] = useState("");
  const [cTip, setCTip] = useState("vinç");
  const [cYilda, setCYilda] = useState(4);
  const [cAsama, setCAsama] = useState<"teklif"|"anlasildi">("anlasildi");

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data } = await supabase
        .from("maintenance_contracts")
        .select("*")
        .order("end_date", { ascending: true });
      setListe((data as Sozlesme[]) || []);
    } finally { setYukleniyor(false); }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  const gunKaldi = (t: string) => {
    if (!t) return 0;
    const fark = new Date(t).getTime() - Date.now();
    return Math.ceil(fark / 86400000);
  };

  const sozlesmeEkle = async () => {
    if (!cFirma.trim()) { setMesaj("⚠️ Firma adı zorunludur."); return; }
    setKaydediliyor(true); setMesaj("");
    try {
      let dosyaUrl: string | null = null;

      if (cDosya) {
        try {
          const ad = `sozlesme-${Date.now()}-${cDosya.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          const { error: upErr } = await supabase.storage.from("documents").upload(ad, cDosya);
          if (!upErr) {
            const { data: pub } = supabase.storage.from("documents").getPublicUrl(ad);
            dosyaUrl = pub?.publicUrl || null;
          }
        } catch { /* yoksay */ }
      }

      const { data, error } = await supabase.rpc("sozlesme_kaydet", {
        p_firma: cFirma.trim(),
        p_hitap: cHitap.trim() || null,
        p_makine_sayisi: Number(cMakine) || 1,
        p_makine_fiyat: Number(String(cFiyat).replace(",", ".")) || 0,
        p_servis_fiyat: Number(String(cServis).replace(",", ".")) || 0,
        p_periyot: Number(cPeriyot) || 3,
        p_makine_tipi: cTip,
        p_baslangic: cBaslangic,
        p_sure_yil: Number(cSure) || 1,
        p_dosya_url: dosyaUrl,
        p_notlar: null,
        p_yilda: Number(cYilda) || 4,
        p_asama: cAsama,
      });

      if (error || !(data as any)?.ok) {
        setMesaj("❌ " + (error?.message || (data as any)?.mesaj || "Kaydedilemedi"));
        return;
      }

      setMesaj("✅ " + ((data as any).mesaj || "Sözleşme eklendi."));
      setFormAcik(false);
      setCFirma(""); setCHitap(""); setCMakine(1); setCFiyat(""); setCServis("");
      setCPeriyot(3); setCSure(1); setCDosya(null); setCTip("vinç");
      await getir();
    } finally { setKaydediliyor(false); }
  };

  const sozlesmePdf = async (s: Sozlesme) => {
    try {
      setMesaj("⏳ Sözleşme hazırlanıyor...");
      await yazdirVeyaPaylas(sozlesmeHtml(s), {
        baslik: "Bakım Sözleşmesi - " + s.company_name,
        dosyaAdi: "sozlesme-" + String(s.company_name || "firma").replace(/\s+/g, "-").toLowerCase(),
        cokSayfali: true,
      });
      setMesaj("");
    } catch (e: any) {
      setMesaj("❌ " + (e?.message || "PDF hatası"));
    }
  };

  const asamaDegistir = async (s: Sozlesme) => {
    const yeni = s.asama === "teklif" ? "anlasildi" : "teklif";
    const { data } = await supabase.rpc("sozlesme_asama_degistir", {
      p_id: s.id, p_asama: yeni,
    });
    if ((data as any)?.ok) { setMesaj("✅ " + (data as any).mesaj); await getir(); }
    else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
  };

  const sil = async (id: string, firma: string) => {
    if (!confirm(`${firma} sözleşmesi silinsin mi?`)) return;
    const { error } = await supabase.from("maintenance_contracts").delete().eq("id", id);
    if (error) { setMesaj("❌ " + error.message); return; }
    setMesaj("✅ Silindi.");
    await getir();
  };

  const bitir = async (id: string) => {
    if (!confirm("Sözleşme tamamlandı olarak işaretlensin mi?")) return;
    await supabase.from("maintenance_contracts").update({ status: "bitti" }).eq("id", id);
    setMesaj("✅ Tamamlandı olarak işaretlendi.");
    await getir();
  };

  const filtreli = liste.filter((s) =>
    !arama || String(s.company_name || "").toLowerCase().includes(arama.toLowerCase())
  );

  const aktifSayi = liste.filter((s) => s.status !== "bitti" && gunKaldi(s.end_date) > 0).length;
  const yakindaSayi = liste.filter((s) => {
    const g = gunKaldi(s.end_date);
    return s.status !== "bitti" && g > 0 && g <= 30;
  }).length;
  const bitmisSayi = liste.filter((s) => s.status === "bitti" || gunKaldi(s.end_date) <= 0).length;

  return (
    <div className="space-y-3">
      {/* İSTATİSTİK + EKLE */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-white border border-emerald-200 rounded-2xl p-3">
          <p className="text-[9px] font-black text-emerald-600 uppercase">Aktif Sözleşme</p>
          <p className="text-2xl font-black text-emerald-700 mt-0.5">{aktifSayi}</p>
        </div>
        <div className="bg-white border border-amber-200 rounded-2xl p-3">
          <p className="text-[9px] font-black text-amber-600 uppercase">Yakında Bitecek</p>
          <p className="text-2xl font-black text-amber-700 mt-0.5">{yakindaSayi}</p>
        </div>
        <div className="bg-white border border-rose-200 rounded-2xl p-3">
          <p className="text-[9px] font-black text-rose-600 uppercase">Süresi Biten</p>
          <p className="text-2xl font-black text-rose-700 mt-0.5">{bitmisSayi}</p>
        </div>
        <button onClick={() => setFormAcik(true)}
          className="bg-gradient-to-br from-teal-600 to-cyan-600 rounded-2xl p-3 text-white flex flex-col items-center justify-center hover:from-teal-500 hover:to-cyan-500 transition">
          <Plus size={20} />
          <span className="text-[10px] font-black mt-1">YENİ SÖZLEŞME</span>
        </button>
      </div>

      {mesaj && (
        <div className={`p-3 rounded-xl text-[11px] font-bold ${mesaj.startsWith("✅") ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
          {mesaj}
        </div>
      )}

      {/* ARAMA */}
      <div className="flex gap-2">
        <input value={arama} onChange={(e) => setArama(e.target.value)}
          placeholder="Firma ara..."
          className="flex-1 p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-teal-500" />
        <button onClick={getir} className="px-4 bg-slate-900 text-white rounded-xl">
          <RefreshCw size={14} className={yukleniyor ? "animate-spin" : ""} />
        </button>
      </div>

      {/* LİSTE */}
      {yukleniyor ? (
        <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>
      ) : filtreli.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <FileText className="w-10 h-10 text-slate-200 mx-auto mb-2" />
          <p className="text-xs font-black text-slate-400">Sözleşme yok</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {filtreli.map((s) => {
            const g = gunKaldi(s.end_date);
            const bitti = s.status === "bitti" || g <= 0;
            return (
              <div key={s.id} className={`bg-white rounded-2xl border-2 p-4 ${bitti ? "border-rose-200" : g <= 30 ? "border-amber-200" : "border-slate-200"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-black text-slate-800 truncate">{s.company_name}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${bitti ? "bg-rose-100 text-rose-700" : g <= 30 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {bitti ? "SÜRESİ BİTTİ" : `${g} GÜN KALDI`}
                      </span>
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        YILDA {Math.floor(12 / Math.max(1, s.maintenance_period_months || 3))} BAKIM
                      </span>
                      {s.asama === "teklif" && (
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                          TEKLİF AŞAMASI
                        </span>
                      )}
                      {s.hitap_adi && (
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                          {s.hitap_adi}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => sil(s.id, s.company_name)} className="text-rose-400 hover:text-rose-600 p-1 shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 bg-slate-50 rounded-xl p-2.5">
                  <div>
                    <p className="text-[8px] font-black text-slate-400 uppercase">Makine</p>
                    <p className="text-[12px] font-black text-slate-800">{s.machine_count} Adet</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-slate-400 uppercase">Makine Başı</p>
                    <p className="text-[12px] font-black text-slate-800">{Number(s.price_per_machine || 0).toLocaleString("tr-TR")} ₺</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-slate-400 uppercase">Başlangıç</p>
                    <p className="text-[10px] font-bold text-slate-600">{s.start_date || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-slate-400 uppercase">Bitiş</p>
                    <p className="text-[10px] font-bold text-slate-600">{s.end_date || "—"}</p>
                  </div>
                </div>

                <div className="flex gap-1.5 mt-2.5">
                  <button onClick={() => sozlesmePdf(s)}
                    className="flex-1 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[10px] font-black flex items-center justify-center gap-1">
                    📄 SÖZLEŞME PDF
                  </button>
                  <button onClick={() => asamaDegistir(s)}
                    className={`px-3 py-2 rounded-lg text-[10px] font-black border ${s.asama === "teklif" ? "bg-amber-50 text-amber-700 border-amber-300" : "bg-emerald-50 text-emerald-700 border-emerald-300"}`}>
                    {s.asama === "teklif" ? "TEKLİF → ANLAŞILDI" : "ANLAŞILDI ✓"}
                  </button>
                </div>

                <div className="flex gap-1.5 mt-1.5">
                  {s.contract_file_url ? (
                    <a href={s.contract_file_url} target="_blank" rel="noopener noreferrer"
                      className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-black flex items-center justify-center gap-1">
                      <ExternalLink size={11} /> SÖZLEŞME DOSYASI
                    </a>
                  ) : (
                    <span className="flex-1 py-2 bg-slate-100 text-slate-400 rounded-lg text-[10px] font-black flex items-center justify-center">
                      DOSYA YOK
                    </span>
                  )}
                  {s.asama === "teklif" && (
                    <button onClick={async () => {
                      const { data } = await supabase.rpc("sozlesme_asama_degistir", { p_id: s.id, p_asama: "anlasildi" });
                      if ((data as any)?.ok) { setMesaj("✅ " + (data as any).mesaj); await getir(); }
                      else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
                    }}
                      className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black">
                      ANLAŞILDI
                    </button>
                  )}
                  {!bitti && s.asama !== "teklif" && (
                    <button onClick={() => bitir(s.id)}
                      className="px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black">
                      BİTİR
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* YENİ SÖZLEŞME MODAL */}
      {formAcik && (
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden max-h-[92vh] flex flex-col">
            <div className="bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-3 flex items-center justify-between shrink-0">
              <h3 className="text-white font-black text-xs uppercase">📋 YENİ BAKIM SÖZLEŞMESİ</h3>
              <button onClick={() => setFormAcik(false)} className="text-white/80"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-2.5 overflow-y-auto">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">Firma Adı *</label>
                <input value={cFirma} onChange={(e) => setCFirma(e.target.value)}
                  placeholder="Örn: ROLLMECH"
                  className="w-full mt-1 p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-teal-500" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">Aşama</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button onClick={() => setCAsama("teklif")}
                    className={`py-2.5 rounded-xl text-[11px] font-black transition ${cAsama === "teklif" ? "bg-amber-500 text-white" : "bg-slate-50 text-slate-500 border border-slate-200"}`}>
                    📝 TEKLİF
                  </button>
                  <button onClick={() => setCAsama("anlasildi")}
                    className={`py-2.5 rounded-xl text-[11px] font-black transition ${cAsama === "anlasildi" ? "bg-emerald-600 text-white" : "bg-slate-50 text-slate-500 border border-slate-200"}`}>
                    ✅ ANLAŞILDI
                  </button>
                </div>
                <p className="text-[8px] text-slate-400 mt-1">
                  {cAsama === "teklif" ? "Takvime eklenmez — anlaşılınca eklenir" : "Takvime otomatik eklenir"}
                </p>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">Hitap Adı (sözleşmede geçecek)</label>
                <input value={cHitap} onChange={(e) => setCHitap(e.target.value)}
                  placeholder="Örn: KONFİDA PERİYODİK KONTROL"
                  className="w-full mt-1 p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-teal-500" />
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">Makine Tipi</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button onClick={() => setCTip("vinç")}
                    className={`py-2.5 rounded-xl text-[11px] font-black transition ${cTip === "vinç" ? "bg-teal-600 text-white" : "bg-slate-50 text-slate-500 border border-slate-200"}`}>
                    🏗️ VİNÇ
                  </button>
                  <button onClick={() => setCTip("asansör")}
                    className={`py-2.5 rounded-xl text-[11px] font-black transition ${cTip === "asansör" ? "bg-cyan-600 text-white" : "bg-slate-50 text-slate-500 border border-slate-200"}`}>
                    🛗 ASANSÖR
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase">Makine Sayısı</label>
                  <input type="number" value={cMakine} onChange={(e) => setCMakine(Number(e.target.value) || 1)}
                    className="w-full mt-1 p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase">Makine Başı Fiyat</label>
                  <input value={cFiyat} onChange={(e) => setCFiyat(e.target.value)}
                    placeholder="8500"
                    className="w-full mt-1 p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none" />
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">Servis / Yol Fiyatı (her ziyaret)</label>
                <input value={cServis} onChange={(e) => setCServis(e.target.value)}
                  placeholder="2000"
                  className="w-full mt-1 p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-teal-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase">Yılda Kaç Bakım</label>
                  <select value={cPeriyot} onChange={(e) => setCPeriyot(Number(e.target.value))}
                    className="w-full mt-1 p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none">
                    <option value={12}>1 kez / yıl (12 ayda 1)</option>
                    <option value={6}>2 kez / yıl (6 ayda 1)</option>
                    <option value={4}>3 kez / yıl (4 ayda 1)</option>
                    <option value={3}>4 kez / yıl (3 ayda 1)</option>
                    <option value={2}>6 kez / yıl (2 ayda 1)</option>
                    <option value={1}>12 kez / yıl (ayda 1)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase">Süre (yıl)</label>
                  <select value={cSure} onChange={(e) => setCSure(Number(e.target.value))}
                    className="w-full mt-1 p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none">
                    {[1, 2, 3, 5].map((y) => <option key={y} value={y}>{y} yıl</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">Başlangıç Tarihi</label>
                <input type="date" value={cBaslangic} onChange={(e) => setCBaslangic(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">Sözleşme Dosyası (PDF)</label>
                <input type="file" accept=".pdf,image/*"
                  onChange={(e) => setCDosya(e.target.files?.[0] || null)}
                  className="w-full mt-1 p-2 bg-slate-50 border-2 border-slate-200 rounded-xl text-[10px] font-bold" />
              </div>

              <div className="bg-teal-50 border border-teal-200 rounded-xl p-2.5">
                <p className="text-[10px] font-bold text-teal-800">
                  Bitiş: {(() => {
                    const b = new Date(cBaslangic);
                    b.setFullYear(b.getFullYear() + Number(cSure || 1));
                    return b.toLocaleDateString("tr-TR");
                  })()} · Yılda {Math.floor(12 / Number(cPeriyot || 3))} bakım · Yıllık toplam: {(() => {
                    const ziyaret = Math.floor(12 / Number(cPeriyot || 3));
                    const birim = Number(cMakine) * Number(String(cFiyat).replace(",", ".") || 0) + Number(String(cServis).replace(",", ".") || 0);
                    return (birim * ziyaret).toLocaleString("tr-TR");
                  })()} ₺
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setFormAcik(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl text-[11px] font-black">İPTAL</button>
                <button onClick={sozlesmeEkle} disabled={kaydediliyor}
                  className="flex-[2] py-3 bg-teal-600 text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 disabled:bg-slate-300">
                  {kaydediliyor ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} SÖZLEŞME EKLE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
