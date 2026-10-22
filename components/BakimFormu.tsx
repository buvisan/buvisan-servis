"use client";

// ----------------------------------------------------------------------------
// BUVISAN - PERİYODİK BAKIM FORMU 📋
// İki form tipi: 'vinc' (27 madde) · 'asansor' (31 madde + makine bilgileri)
//   • Her madde: RET / ONAY
//   • Müşteri memnuniyeti + müşteri adı + imza
//   • Personel imzası
//   • ⏸️ DEVAM EDİYOR (1 gün hatırlatma) / ✅ İŞİ BİTİR
// Kaynak: bakim_formu_kaydet() · is_durumu_guncelle()
// ----------------------------------------------------------------------------

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList, X, Loader2, Check, AlertTriangle, Star,
  PenLine, CheckCircle2, ChevronDown, Settings2, PlusCircle,
} from "lucide-react";
import ImzaPad from "@/components/ImzaPad";

type Tip = "vinc" | "asansor";

const PARA = (n: any) => Number(n || 0).toLocaleString("tr-TR");

// ═══════════════ VİNÇ FORMU — 5 GRUP, 27 MADDE ═══════════════
const VINC_GRUPLAR = [
  {
    ad: "KALDIRMA GRUBU",
    maddeler: [
      "Motor / redüktör kontrolü",
      "Halat tamburu kontrolü",
      "Halat kanca / kanca takımı kontrolü",
      "Kaldırma freni kontrolü",
    ],
  },
  {
    ad: "ARA VİNÇ / KÖPRÜ GRUBU",
    maddeler: [
      "Arabanın üzerindeki motor-redüktör kontrolü",
      "Halat tamburu kontrolü",
      "Halat ve kanca / kanca takımı kontrolü",
      "Halat kılavuzu ve halat kontrolü",
      "Taşıyıcı teker ve ray kontrolü",
      "Köprü bağlantı cıvata ve kaynak kontrolü",
      "Enerji taşıma sistemi kontrolü",
      "Köprü ve kaldırma motoru / halat tamburu bağlantı kontrolü",
    ],
  },
  {
    ad: "KEDİ YÜRÜTME GRUBU",
    maddeler: [
      "Motor ve redüktör kontrolü",
      "Teker ve rayların kontrolü + kaynak",
      "Şase ve kiriş bağlantı cıvata ve kaynak kontrolü",
      "Tampon kontrolleri",
    ],
  },
  {
    ad: "KÖPRÜ YÜRÜTME GRUBU",
    maddeler: [
      "Motor ve redüktör kontrolü",
      "Fren ve fren bağlantı kontrolü",
      "Teker ve rayların kontrolü, kaynak",
      "Tampon kontrolleri",
      "Şase bağlantı cıvata ve kaynak kontrolü",
      "Köprü ve kaldırma tamburu bağlantı kontrolü",
    ],
  },
  {
    ad: "ELEKTRİK GRUBU",
    maddeler: [
      "Enerji kablo kontrolü",
      "Şalter ve buton kontrolü",
      "Kumanda ve ikaz sistemleri",
      "Köprü elektrik panosu",
      "Aydınlatma kontrolü",
    ],
  },
];

// ═══════════════ ASANSÖR FORMU — 4 GRUP, 31 MADDE ═══════════════
const ASANSOR_GRUPLAR = [
  {
    ad: "GENEL KONTROLLER",
    maddeler: [
      "Fren fonksiyonları kontrolleri",
      "Üst ve alt stop şiviç kontrolü",
      "Halat / zincir hasar, lif kontrolü",
      "Yağ keçelerinin sızdırmazlık kontrolü",
      "Yağlama ve seviye tespit kontrolleri",
      "Kanca bloğu ve çatlak kontrolü",
      "Halat kılavuzu kontrolü",
      "Motor ve redüktör kontrolü",
      "Tekerlek ve patenlerin kontrolü",
      "Asansör rayları deformasyon kontrolü",
      "Aşırı yük şiviç kontrolü",
      "Kabin aydınlatma kontrolü",
      "Kabin kapısı / sensör kontrolü",
    ],
  },
  {
    ad: "1. DURAK",
    maddeler: [
      "Sesli ve ışıklı ikaz kontrolü",
      "Kat şiviçlerinin kontrolü",
      "Kapı kilitli kontrolü",
      "Kat butonlarının kontrolü",
    ],
  },
  {
    ad: "2. DURAK",
    maddeler: [
      "Sesli ve ışıklı ikaz kontrolü",
      "Kat şiviçlerinin kontrolü",
      "Kapı kilitli kontrolü",
      "Kat butonlarının kontrolü",
    ],
  },
  {
    ad: "3. DURAK",
    maddeler: [
      "Sesli ve ışıklı ikaz kontrolü",
      "Kat şiviçlerinin kontrolü",
      "Kapı kilitli kontrolü",
      "Kat butonlarının kontrolü",
    ],
  },
  {
    ad: "4. DURAK",
    maddeler: [
      "Sesli ve ışıklı ikaz kontrolü",
      "Kat şiviçlerinin kontrolü",
      "Kapı kilitli kontrolü",
      "Kat butonlarının kontrolü",
    ],
  },
  {
    ad: "DİĞER",
    maddeler: [
      "Elektrik panosu genel kontrolü",
      "Enerji sistemlerinin kontrolü",
    ],
  },
];

// ASANSÖR MAKİNE BİLGİLERİ
const ASANSOR_ALANLAR = [
  { k: "uretici", e: "Üretici Firma" },
  { k: "imalat_yili", e: "İmalat Yılı" },
  { k: "kapasite", e: "Kapasite" },
  { k: "kaldirma_grubu", e: "Kaldırma Grubu" },
  { k: "reduktor_grubu", e: "Redüktör Grubu" },
  { k: "bulundugu_yer", e: "Bulunduğu Yer" },
  { k: "halat_capi", e: "Halat Çapı" },
  { k: "kw", e: "KW" },
  { k: "donanim_sayisi", e: "Donanım Sayısı" },
  { k: "halat_boyu", e: "Halat Boyu" },
  { k: "marka", e: "Marka" },
  { k: "asansor_tipi", e: "Asansör Tipi" },
  { k: "kaldirma_yuksekligi", e: "Kaldırma Yüksekliği" },
  { k: "kat_sayisi", e: "Kat Sayısı" },
  { k: "kanca_tipi", e: "Kanca Tipi" },
];

export default function BakimFormu({
  tip, musteri, yetkili, telefon, adres, personel, craneId, randevuId, ticketId,
  onKapat, onKaydedildi, onFormEkle,
}: {
  tip: Tip;
  musteri?: string;
  yetkili?: string;
  telefon?: string;
  adres?: string;
  personel?: string;
  craneId?: string;
  randevuId?: string;
  ticketId?: string;
  onKapat: () => void;
  onKaydedildi?: () => void;
  onFormEkle?: (tip: Tip) => void;
}) {
  const gruplar = tip === "asansor" ? ASANSOR_GRUPLAR : VINC_GRUPLAR;
  const baslik = tip === "asansor" ? "YÜK PLATFORMU PERİYODİK BAKIM FORMU" : "VİNÇ PERİYODİK BAKIM FORMU";

  const [musteriAd, setMusteriAd] = useState(musteri || "");
  const [yetkiliAd, setYetkiliAd] = useState(yetkili || "");
  const [tarih, setTarih] = useState(new Date().toISOString().slice(0, 10));
  const [saat, setSaat] = useState(new Date().toTimeString().slice(0, 5));

  // Sonuçlar: "grupIdx-maddeIdx" → 'onay' | 'ret' | null
  const [sonuclar, setSonuclar] = useState<Record<string, "onay" | "ret">>({});
  const [makine, setMakine] = useState<Record<string, string>>({});
  const [notlar, setNotlar] = useState("");
  const [puan, setPuan] = useState(0);
  const [yorum, setYorum] = useState("");
  const [musteriImza, setMusteriImza] = useState<string | null>(null);
  const [personelImza, setPersonelImza] = useState<string | null>(null);
  const [imzaTip, setImzaTip] = useState<"musteri" | "personel" | null>(null);

  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mesaj, setMesaj] = useState("");
  const [acikGrup, setAcikGrup] = useState<Record<number, boolean>>({ 0: true });
  const [formEkleAcik, setFormEkleAcik] = useState(false);

  const toplamMadde = gruplar.reduce((t, g) => t + g.maddeler.length, 0);
  const onaySayisi = Object.values(sonuclar).filter((v) => v === "onay").length;
  const retSayisi = Object.values(sonuclar).filter((v) => v === "ret").length;

  const isaretle = (g: number, m: number, deger: "onay" | "ret") => {
    const anahtar = `${g}-${m}`;
    setSonuclar((s) => {
      const yeni = { ...s };
      if (yeni[anahtar] === deger) delete yeni[anahtar];
      else yeni[anahtar] = deger;
      return yeni;
    });
  };

  const kaydet = async (durum: "bitti" | "devam_ediyor", kapat: boolean = true): Promise<boolean> => {
    if (!musteriAd.trim()) { setMesaj("⚠️ Müşteri adı zorunludur."); return false; }
    setKaydediliyor(true);
    setMesaj("");
    try {
      // Maddeleri JSON'a çevir
      const maddeler: any[] = [];
      gruplar.forEach((g, gi) => {
        g.maddeler.forEach((m, mi) => {
          const s = sonuclar[`${gi}-${mi}`] || null;
          maddeler.push({ grup: g.ad, madde: m, sonuc: s, not: "" });
        });
      });

      const { data, error } = await supabase.rpc("bakim_formu_kaydet", {
        p_tip: tip,
        p_musteri: musteriAd.trim(),
        p_yetkili: yetkiliAd.trim() || null,
        p_telefon: telefon || null,
        p_adres: adres || null,
        p_crane_id: craneId || null,
        p_randevu_id: randevuId || null,
        p_ticket_id: ticketId || null,
        p_personel: personel || null,
        p_kontrol_tarihi: tarih,
        p_kontrol_saati: saat,
        p_makine_bilgileri: tip === "asansor" ? makine : {},
        p_maddeler: maddeler,
        p_musteri_puani: puan > 0 ? puan : null,
        p_musteri_yorumu: yorum.trim() || null,
        p_musteri_adi: musteriAd.trim(),
        p_musteri_imza: musteriImza,
        p_personel_imza: personelImza,
        p_notlar: notlar.trim() || null,
        p_is_durumu: durum,
        p_devam_tarihi: durum === "devam_ediyor"
          ? new Date(Date.now() + 86400000).toISOString().slice(0, 10) : null,
      });

      if (error || !(data as any)?.ok) {
        setMesaj("❌ " + (error?.message || (data as any)?.mesaj || "Kaydedilemedi."));
        return false;
      }

      setMesaj("✅ " + ((data as any).mesaj || "Form kaydedildi."));
      if (kapat) onKaydedildi?.();
        if (kapat) setTimeout(() => { onKapat(); }, 1800);
        return true;
    } catch { return false; } finally { setKaydediliyor(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[999] flex items-end md:items-center justify-center overflow-y-auto">
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="bg-white w-full max-w-2xl rounded-t-3xl md:rounded-3xl overflow-hidden max-h-[95vh] flex flex-col">

        {/* BAŞLIK */}
        <div className="bg-gradient-to-r from-teal-700 to-cyan-700 text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white/15 p-2 rounded-xl"><ClipboardList size={18} /></div>
            <div>
              <h2 className="font-black text-sm leading-tight">{baslik}</h2>
              <p className="text-[10px] text-teal-100 font-bold mt-0.5">
                {toplamMadde} madde · {onaySayisi} onay · {retSayisi} ret
              </p>
            </div>
          </div>
          <button onClick={onKapat} className="bg-white/15 hover:bg-red-500 p-2 rounded-full transition">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">

          {/* MÜŞTERİ BİLGİLERİ */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">Müşteri *</label>
                <input value={musteriAd} onChange={(e) => setMusteriAd(e.target.value)}
                  placeholder="Firma adı"
                  className="w-full mt-1 p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-teal-500" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">Yetkili</label>
                <input value={yetkiliAd} onChange={(e) => setYetkiliAd(e.target.value)}
                  placeholder="Ad soyad"
                  className="w-full mt-1 p-2.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-teal-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">Kontrol Tarihi</label>
                <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-teal-500" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">Kontrol Saati</label>
                <input type="time" value={saat} onChange={(e) => setSaat(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-teal-500" />
              </div>
            </div>
          </div>

          {/* MAKİNE BİLGİLERİ — sadece asansör */}
          {tip === "asansor" && (
            <div className="bg-cyan-50 border border-cyan-200 rounded-2xl p-3">
              <p className="text-[10px] font-black text-cyan-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Settings2 size={12} /> Makine Bilgileri
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                {ASANSOR_ALANLAR.map((a) => (
                  <input key={a.k} value={makine[a.k] || ""}
                    onChange={(e) => setMakine((m) => ({ ...m, [a.k]: e.target.value }))}
                    placeholder={a.e}
                    className="p-2 bg-white border border-cyan-200 rounded-lg text-[10px] outline-none focus:border-cyan-500" />
                ))}
              </div>
            </div>
          )}

          {/* MADDE GRUPLARI */}
          {gruplar.map((g, gi) => (
            <div key={gi} className="border border-slate-200 rounded-2xl overflow-hidden">
              <button onClick={() => setAcikGrup((a) => ({ ...a, [gi]: !a[gi] }))}
                className="w-full flex items-center justify-between bg-slate-100 hover:bg-slate-200 px-3 py-2.5 transition">
                <span className="text-[11px] font-black text-slate-700 uppercase tracking-wide">
                  {g.ad} <span className="text-slate-400">({g.maddeler.length})</span>
                </span>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${acikGrup[gi] ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence>
                {acikGrup[gi] && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                    className="overflow-hidden">
                    <div className="divide-y divide-slate-100">
                      {g.maddeler.map((m, mi) => {
                        const s = sonuclar[`${gi}-${mi}`];
                        return (
                          <div key={mi} className="px-3 py-2 flex items-center gap-2">
                            <p className="text-[10px] font-medium text-slate-700 flex-1 leading-snug">{m}</p>
                            <button onClick={() => isaretle(gi, mi, "ret")}
                              className={`px-2 py-1.5 rounded-lg text-[9px] font-black transition shrink-0 ${
                                s === "ret" ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-400 hover:bg-rose-50"}`}>
                              RET
                            </button>
                            <button onClick={() => isaretle(gi, mi, "onay")}
                              className={`px-2 py-1.5 rounded-lg text-[9px] font-black transition shrink-0 ${
                                s === "onay" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400 hover:bg-emerald-50"}`}>
                              ONAY
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}

          {/* NOT */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase">Not</label>
            <textarea rows={2} value={notlar} onChange={(e) => setNotlar(e.target.value)}
              placeholder="Bakım notları, tespit edilen arızalar..."
              className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs resize-none outline-none focus:border-teal-500" />
          </div>

          {/* MÜŞTERİ MEMNUNİYETİ */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
            <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-2">
              ⭐ Müşteri Memnuniyeti
            </p>
            <div className="flex gap-2 mb-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setPuan(puan === n ? 0 : n)}
                  className="transition active:scale-90">
                  <Star size={26} className={puan >= n ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
                </button>
              ))}
            </div>
            <input value={yorum} onChange={(e) => setYorum(e.target.value)}
              placeholder="Müşteri yorumu (isteğe bağlı)"
              className="w-full p-2.5 bg-white border border-amber-200 rounded-lg text-[11px] outline-none focus:border-amber-500" />
          </div>

          {/* İMZALAR */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-center">
              <p className="text-[9px] font-black text-slate-500 uppercase mb-2">Müşteri İmzası</p>
              {musteriImza ? (
                <div>
                  <img src={musteriImza} alt="Müşteri imza" className="w-full h-20 object-contain bg-white rounded-lg border" />
                  <button onClick={() => setMusteriImza(null)}
                    className="text-[9px] font-black text-rose-500 mt-1">SİL</button>
                </div>
              ) : (
                <button onClick={() => setImzaTip("musteri")}
                  className="w-full py-4 bg-white border-2 border-dashed border-slate-300 rounded-xl text-slate-400 flex flex-col items-center gap-1 hover:border-teal-400 transition">
                  <PenLine size={18} />
                  <span className="text-[9px] font-black">İMZALAT</span>
                </button>
              )}
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-center">
              <p className="text-[9px] font-black text-slate-500 uppercase mb-2">Personel İmzası</p>
              {personelImza ? (
                <div>
                  <img src={personelImza} alt="Personel imza" className="w-full h-20 object-contain bg-white rounded-lg border" />
                  <button onClick={() => setPersonelImza(null)}
                    className="text-[9px] font-black text-rose-500 mt-1">SİL</button>
                </div>
              ) : (
                <button onClick={() => setImzaTip("personel")}
                  className="w-full py-4 bg-white border-2 border-dashed border-slate-300 rounded-xl text-slate-400 flex flex-col items-center gap-1 hover:border-teal-400 transition">
                  <PenLine size={18} />
                  <span className="text-[9px] font-black">İMZALA</span>
                </button>
              )}
            </div>
          </div>

          {mesaj && (
            <div className={`p-3 rounded-2xl text-[11px] font-bold ${
              mesaj.startsWith("✅") ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
              {mesaj}
            </div>
          )}
        </div>

        {/* ALT BUTONLAR */}
        <div className="border-t border-slate-200 p-3 bg-slate-50 space-y-2 shrink-0">
          {/* MAKİNE SEÇİCİ — form eklenecekse */}
          {formEkleAcik && (
            <div className="bg-white border-2 border-teal-300 rounded-2xl p-3">
              <p className="text-[10px] font-black text-teal-700 uppercase mb-2">
                Hangi makine için form ekleyeceksiniz?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setFormEkleAcik(false); onFormEkle?.("vinc"); }}
                  className="py-3 rounded-xl text-[11px] font-black bg-teal-600 hover:bg-teal-700 text-white transition">
                  🏗️ VİNÇ
                </button>
                <button onClick={() => { setFormEkleAcik(false); onFormEkle?.("asansor"); }}
                  className="py-3 rounded-xl text-[11px] font-black bg-cyan-700 hover:bg-cyan-800 text-white transition">
                  🏢 ASANSÖR
                </button>
              </div>
              <button onClick={() => setFormEkleAcik(false)}
                className="w-full mt-2 py-2 text-[10px] font-bold text-slate-500">İptal</button>
            </div>
          )}

          {!formEkleAcik && (
            <div className="flex gap-2">
              <button onClick={() => {
                  // Önce mevcut formu kaydet, sonra yeni form ekle
                  if (!musteriAd.trim()) { setMesaj("⚠️ Müşteri adı zorunludur."); return false; }
                  setFormEkleAcik(true);
                }}
                className="flex-1 bg-teal-600 hover:bg-teal-700 text-white py-3.5 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition">
                <PlusCircle size={15} /> FORM EKLE
              </button>
              <button onClick={() => kaydet("bitti")} disabled={kaydediliyor}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white py-3.5 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition">
                {kaydediliyor ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                BİTİR
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* İMZA PADI */}
      {imzaTip && (
        <div className="absolute inset-0 bg-white z-[60] flex flex-col">
          <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
            <p className="text-xs font-black capitalize">
              {imzaTip === "musteri" ? "MÜŞTERİ İMZASI" : "PERSONEL İMZASI"}
            </p>
            <button onClick={() => setImzaTip(null)} className="bg-slate-800 hover:bg-red-500 p-2 rounded-full transition">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ImzaPad
              onChange={(blob: Blob | null) => {
                if (!blob) { setImzaTip(null); return; }
                const reader = new FileReader();
                reader.onloadend = () => {
                  const b64 = String(reader.result || "");
                  if (imzaTip === "musteri") setMusteriImza(b64);
                  else setPersonelImza(b64);
                  setImzaTip(null);
                };
                reader.readAsDataURL(blob);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
