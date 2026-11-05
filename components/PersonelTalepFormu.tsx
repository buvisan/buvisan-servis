"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - PERSONEL MANUEL TALEP 📝
// Personel sahada müşteri adına talep açar.
// /talep ile AYNI işlemi yapar: randevu_al RPC → planlayıcıya düşer
// ----------------------------------------------------------------------------

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, Loader2, CheckCircle2, Wrench, Eye, Calendar,
  MapPin, Phone, Building2, User, AlertTriangle,
} from "lucide-react";

type Tip = "ariza" | "bakim" | "kesif";

export default function PersonelTalepFormu({ personelAdi }: { personelAdi?: string }) {
  const [acik, setAcik] = useState(false);
  const [tip, setTip] = useState<Tip>("ariza");
  const [firma, setFirma] = useState("");
  const [telefon, setTelefon] = useState("");
  const [yetkili, setYetkili] = useState("");
  const [adres, setAdres] = useState("");
  const [vincBilgi, setVincBilgi] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [tarih, setTarih] = useState(new Date().toISOString().slice(0, 10));
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [mesaj, setMesaj] = useState("");

  const temizle = () => {
    setFirma(""); setTelefon(""); setYetkili(""); setAdres("");
    setVincBilgi(""); setAciklama(""); setTip("ariza");
    setTarih(new Date().toISOString().slice(0, 10));
    setMesaj("");
  };

  const gonder = async () => {
    if (!firma.trim()) { setMesaj("⚠️ Firma adı zorunludur."); return; }
    if (!telefon.trim()) { setMesaj("⚠️ Telefon zorunludur."); return; }
    if (!aciklama.trim()) { setMesaj("⚠️ Arıza açıklaması zorunludur."); return; }

    setGonderiliyor(true);
    setMesaj("");
    try {
      const desc = [
        aciklama.trim(),
        personelAdi ? `\n\n[PERSONEL TARAFINDAN OLUŞTURULDU: ${personelAdi}]` : "",
      ].join("");

      // 1) RANDEVU AL (planlayıcıya düşer)
      const { data, error } = await supabase.rpc("randevu_al", {
        p_musteri_adi: firma.trim(),
        p_telefon: telefon.trim(),
        p_is_tipi: tip,
        p_tarih: tarih,
        p_yetkili: yetkili.trim() || null,
        p_adres: adres.trim() || null,
        p_vinc_bilgisi: vincBilgi.trim() || null,
        p_aciklama: desc,
        p_medya_urls: [],
        p_ses_url: null,
        p_bolge: null,
      });

      if (!error) {
        setMesaj("✅ Talep oluşturuldu! Planlayıcıya eklendi (Slot: " + (data?.slot || 1) + ")");
        setTimeout(() => { setAcik(false); temizle(); }, 2200);
        return;
      }

      // 2) YEDEK: doğrudan ticket
      const mesajMetni = String(error.message || "");
      const fonksiyonYok = error.code === "PGRST202"
        || mesajMetni.includes("Could not find the function")
        || mesajMetni.toLowerCase().includes("does not exist");

      if (!fonksiyonYok) {
        setMesaj("❌ " + (mesajMetni.includes("RANDEVU_DOLU")
          ? "Seçilen gün dolu (günde en fazla 3 randevu)."
          : mesajMetni));
        return;
      }

      // Fallback: service_tickets
      const { error: tErr } = await supabase.from("service_tickets").insert([{
        issue_type: tip === "bakim" ? "bakim" : tip === "kesif" ? "kesif" : "ariza",
        description: desc,
        status: "bekliyor",
        pipeline_status: "bekliyor",
        manual_customer_name: firma.trim(),
        manual_customer_rep: yetkili.trim() || null,
        manual_phone: telefon.trim(),
        manual_location: adres.trim() || null,
        manual_crane_info: vincBilgi.trim() || null,
        priority: tip === "ariza" ? "Kritik (Makine Durdu)" : "Normal",
      }]);

      if (tErr) { setMesaj("❌ " + tErr.message); return; }
      setMesaj("✅ Talep oluşturuldu (admin onayına düştü).");
      setTimeout(() => { setAcik(false); temizle(); }, 2200);
    } catch (e: any) {
      setMesaj("❌ " + (e?.message || "Gönderilemedi"));
    } finally { setGonderiliyor(false); }
  };

  const TIPLER: { k: Tip; ad: string; ikon: any; renk: string }[] = [
    { k: "ariza", ad: "Arıza", ikon: Wrench, renk: "rose" },
    { k: "bakim", ad: "Bakım", ikon: Calendar, renk: "amber" },
    { k: "kesif", ad: "Keşif", ikon: Eye, renk: "purple" },
  ];

  return (
    <>
      {/* BUTON */}
      <button onClick={() => { setAcik(true); setMesaj(""); }}
        className="w-full bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white px-4 py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-500/30 active:scale-[0.98] transition">
        <Plus size={18} /> MANUEL TALEP OLUŞTUR
        <span className="text-[9px] font-bold text-red-200 ml-1">(acil iş)</span>
      </button>

      {/* MODAL */}
      <AnimatePresence>
        {acik && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[999] flex items-end md:items-center justify-center overflow-y-auto">
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }}
              className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-3xl overflow-hidden max-h-[95vh] flex flex-col">

              {/* BAŞLIK */}
              <div className="bg-gradient-to-r from-rose-600 to-red-600 text-white px-5 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="bg-white/15 p-2 rounded-xl"><Plus size={18} /></div>
                  <div>
                    <h2 className="font-black text-sm leading-none">MANUEL TALEP OLUŞTUR</h2>
                    <p className="text-[10px] text-rose-100 font-bold mt-1">
                      Acil iş — planlayıcıya otomatik eklenir
                    </p>
                  </div>
                </div>
                <button onClick={() => { setAcik(false); temizle(); }} className="bg-white/15 hover:bg-red-500 p-2 rounded-full transition">
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto flex-1">

                {/* TİP */}
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase">İş Tipi</label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {TIPLER.map((t) => {
                      const Ikon = t.ikon;
                      const secili = tip === t.k;
                      return (
                        <button key={t.k} onClick={() => setTip(t.k)}
                          className={`py-3 rounded-xl text-[11px] font-black flex flex-col items-center gap-1 transition ${
                            secili
                              ? t.renk === "rose" ? "bg-rose-600 text-white"
                                : t.renk === "amber" ? "bg-amber-500 text-white"
                                : "bg-purple-600 text-white"
                              : "bg-slate-50 text-slate-500 border-2 border-slate-200"
                          }`}>
                          <Ikon size={16} />
                          {t.ad}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* FİRMA */}
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
                    <Building2 size={10} /> Firma Adı *
                  </label>
                  <input value={firma} onChange={(e) => setFirma(e.target.value)}
                    placeholder="Müşteri firma adı"
                    className="w-full mt-1 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-rose-500" />
                </div>

                {/* TELEFON + YETKİLİ */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
                      <Phone size={10} /> Telefon *
                    </label>
                    <input value={telefon} onChange={(e) => setTelefon(e.target.value)}
                      placeholder="05xx" type="tel"
                      className="w-full mt-1 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-rose-500" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
                      <User size={10} /> Yetkili
                    </label>
                    <input value={yetkili} onChange={(e) => setYetkili(e.target.value)}
                      placeholder="Ad soyad"
                      className="w-full mt-1 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-rose-500" />
                  </div>
                </div>

                {/* ADRES */}
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
                    <MapPin size={10} /> Adres
                  </label>
                  <input value={adres} onChange={(e) => setAdres(e.target.value)}
                    placeholder="Mahalle, sokak, ilçe"
                    className="w-full mt-1 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-rose-500" />
                </div>

                {/* VİNÇ BİLGİSİ */}
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase">Vinç / Makine Bilgisi</label>
                  <input value={vincBilgi} onChange={(e) => setVincBilgi(e.target.value)}
                    placeholder="10 TON KÖPRÜLÜ VİNÇ"
                    className="w-full mt-1 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-rose-500" />
                </div>

                {/* AÇIKLAMA */}
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
                    <AlertTriangle size={10} /> Arıza / İş Açıklaması *
                  </label>
                  <textarea rows={3} value={aciklama} onChange={(e) => setAciklama(e.target.value)}
                    placeholder="Ne oldu? Ne yapılacak?"
                    className="w-full mt-1 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs resize-none outline-none focus:border-rose-500" />
                </div>

                {/* TARİH */}
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
                    <Calendar size={10} /> Randevu Tarihi
                  </label>
                  <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)}
                    className="w-full mt-1 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-rose-500" />
                  <p className="text-[9px] text-slate-400 mt-1">Bugün seçili — hemen planlayıcıya düşer</p>
                </div>

                {mesaj && (
                  <div className={`p-3 rounded-xl text-[11px] font-bold ${
                    mesaj.startsWith("✅") ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
                    {mesaj}
                  </div>
                )}
              </div>

              {/* ALT BUTON */}
              <div className="border-t border-slate-200 p-3 bg-slate-50 flex gap-2 shrink-0">
                <button onClick={() => { setAcik(false); temizle(); }}
                  className="flex-1 py-3.5 bg-slate-200 text-slate-600 rounded-2xl font-black text-xs">
                  İPTAL
                </button>
                <button onClick={gonder} disabled={gonderiliyor}
                  className="flex-[2] py-3.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-500/30">
                  {gonderiliyor ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  {gonderiliyor ? "OLUŞTURULUYOR..." : "TALEP OLUŞTUR"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
