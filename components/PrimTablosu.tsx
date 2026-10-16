"use client";

// ----------------------------------------------------------------------------
// BUVISAN - PRİM TABLOSU 💰
// mod="admin"     → tüm personel + ayarlar (yönetici)
// mod="personel"  → sadece kendi primi (personel)
// Kaynak: prim_ozet() · personel_prim_detay() · prim_ayar_kaydet()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, Loader2, RefreshCw, ChevronDown, ChevronLeft, ChevronRight,
  Settings, X, TrendingUp, Award, Info, Trophy,
} from "lucide-react";

const AYLAR = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const para = (n: any) => Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

const AY_ANAHTAR = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export default function PrimTablosu({
  mod = "admin",
  personel = "",
}: { mod?: "admin" | "personel"; personel?: string }) {
  const [ay, setAy] = useState(() => AY_ANAHTAR(new Date()));
  const [liste, setListe] = useState<any[]>([]);
  const [detay, setDetay] = useState<any>(null);
  const [detayKim, setDetayKim] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");
  const [ayarAcik, setAyarAcik] = useState(false);
  const [ayar, setAyar] = useState<any>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const getir = useCallback(async () => {
    setYukleniyor(true);
    setHata("");
    try {
      if (mod === "admin") {
        const { data, error } = await supabase.rpc("prim_ozet", { p_ay: ay });
        if (error) { setHata(error.message); return; }
        setListe(data || []);
      } else {
        const { data, error } = await supabase.rpc("personel_prim_detay", { p_personel: personel, p_ay: ay });
        if (error) { setHata(error.message); return; }
        setDetay(data); setDetayKim(personel);
      }
    } finally { setYukleniyor(false); }
  }, [mod, personel, ay]);

  useEffect(() => { getir(); }, [getir]);

  const detayAc = async (ad: string) => {
    if (detayKim === ad) { setDetayKim(""); setDetay(null); return; }
    const { data } = await supabase.rpc("personel_prim_detay", { p_personel: ad, p_ay: ay });
    setDetay(data); setDetayKim(ad);
  };

  const ayarAc = async () => {
    const { data } = await supabase.from("prim_ayarlari").select("*").eq("id", 1).maybeSingle();
    setAyar(data || { maks_prim: 1200, min_prim: 50, aylik_hedef_is: 20 });
    setAyarAcik(true);
  };

  const ayarKaydet = async () => {
    setKaydediliyor(true);
    try {
      await supabase.rpc("prim_ayar_kaydet", {
        p_maks: Number(ayar?.maks_prim) || 1200,
        p_min: Number(ayar?.min_prim) || 50,
        p_hedef: Number(ayar?.aylik_hedef_is) || 20,
      });
      setAyarAcik(false);
      await getir();
    } finally { setKaydediliyor(false); }
  };

  const ayDegistir = (yon: number) => {
    const [y, m] = ay.split("-").map(Number);
    const d = new Date(y, m - 1 + yon, 1);
    setAy(AY_ANAHTAR(d));
  };

  const ayEtiket = () => {
    const [y, m] = ay.split("-").map(Number);
    return `${AYLAR[m - 1]} ${y}`;
  };

  const toplamPrim = mod === "admin"
    ? liste.reduce((t, p) => t + Number(p.toplam_prim || 0), 0)
    : Number(detay?.toplam_prim || 0);

  const enIyi = mod === "admin" && liste.length > 0
    ? [...liste].sort((a, b) => Number(b.toplam_prim) - Number(a.toplam_prim))[0]
    : null;

  // ══════════════ PERSONEL GÖRÜNÜMÜ ══════════════
  if (mod === "personel") {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-700 to-teal-700 px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-white/15 p-2 rounded-xl"><Wallet className="w-5 h-5 text-white" /></div>
            <div>
              <h2 className="text-white font-black text-sm tracking-tight leading-none">PRİMİM</h2>
              <p className="text-[10px] text-emerald-200 font-bold uppercase tracking-widest mt-1">
                {ayEtiket()} · bitirdiğin işlere göre
              </p>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => ayDegistir(-1)} className="bg-white/15 hover:bg-white/25 p-2 rounded-xl">
              <ChevronLeft size={14} className="text-white" />
            </button>
            <button onClick={() => ayDegistir(1)} className="bg-white/15 hover:bg-white/25 p-2 rounded-xl">
              <ChevronRight size={14} className="text-white" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {hata && <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-700">⚠️ {hata}</div>}

          {yukleniyor ? (
            <div className="py-6 text-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-400 mx-auto" /></div>
          ) : (
            <>
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-center text-white shadow-lg">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100">BU AY PRİMİN</p>
                <p className="text-3xl font-black mt-1">{para(toplamPrim)} ₺</p>
                <p className="text-[10px] font-bold text-emerald-100 mt-1">
                  {detay?.is_sayisi || 0} biten iş · ortalama ağırlık {detay?.ortalama_agirlik || 0} puan
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Biten İş</p>
                  <p className="text-lg font-black text-slate-700">{detay?.is_sayisi || 0}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Ort. Ağırlık</p>
                  <p className="text-lg font-black text-slate-700">{detay?.ortalama_agirlik || 0}</p>
                </div>
              </div>

              {/* İŞ İŞ DÖKÜM */}
              {Array.isArray(detay?.isler) && detay.isler.length > 0 ? (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                    İş İş Dökümü ({detay.isler.length})
                  </p>
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                    {detay.isler.map((i: any, x: number) => (
                      <div key={x} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-black text-slate-700 truncate">{i.musteri}</p>
                          <p className="text-[9px] font-bold text-slate-400">
                            {i.tarih} · {i.tip} · {i.sure} sa
                            {i.memnuniyet ? ` · ⭐${i.memnuniyet}` : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="text-[11px] font-black text-emerald-700">+{para(i.prim)} ₺</p>
                          <p className="text-[8px] font-bold text-slate-400">{i.etiket} ({i.agirlik_puan}p)</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center bg-slate-50 rounded-2xl">
                  <Info className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                  <p className="text-[11px] font-black text-slate-500">Bu ay prim yok</p>
                  <p className="text-[9px] text-slate-400 font-medium mt-1 px-4">
                    Prim, <strong>finansta tutarı girilen (biten)</strong> işlerden hesaplanır.
                  </p>
                </div>
              )}

              <p className="text-[9px] text-slate-400 font-medium text-center leading-relaxed">
                Prim; işin <strong>süresi · parça sayısı · tipi · büyüklüğü</strong> ve
                <strong> müşteri memnuniyetine</strong> göre hesaplanır. Bitmeyen iş prim almaz.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ══════════════ YÖNETİCİ GÖRÜNÜMÜ ══════════════
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-emerald-700 to-teal-700 px-4 py-3.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="bg-white/15 p-2 rounded-xl"><Wallet className="w-5 h-5 text-white" /></div>
          <div>
            <h2 className="text-white font-black text-sm tracking-tight leading-none">PRİM TABLOSU</h2>
            <p className="text-[10px] text-emerald-200 font-bold uppercase tracking-widest mt-1">
              {ayEtiket()} · {liste.length} personel · toplam {para(toplamPrim)} ₺
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => ayDegistir(-1)} className="bg-white/15 hover:bg-white/25 p-2 rounded-xl">
            <ChevronLeft size={14} className="text-white" />
          </button>
          <button onClick={() => ayDegistir(1)} className="bg-white/15 hover:bg-white/25 p-2 rounded-xl">
            <ChevronRight size={14} className="text-white" />
          </button>
          <button onClick={ayarAc} className="bg-white/15 hover:bg-white/25 p-2 rounded-xl" title="Prim ayarları">
            <Settings size={14} className="text-white" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {hata && <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-700">⚠️ {hata}</div>}

        {/* ÖZET */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-emerald-50 rounded-xl p-2.5 border border-emerald-100 text-center">
            <p className="text-[9px] font-black text-emerald-600 uppercase">Toplam Prim</p>
            <p className="text-lg font-black text-emerald-800 leading-none mt-0.5">{para(toplamPrim)} ₺</p>
          </div>
          <div className="bg-sky-50 rounded-xl p-2.5 border border-sky-100 text-center">
            <p className="text-[9px] font-black text-sky-500 uppercase">Biten İş</p>
            <p className="text-lg font-black text-sky-800 leading-none mt-0.5">
              {liste.reduce((t, p) => t + Number(p.is_sayisi || 0), 0)}
            </p>
          </div>
          <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-100 text-center">
            <p className="text-[9px] font-black text-amber-600 uppercase">En İyi</p>
            <p className="text-[11px] font-black text-amber-800 leading-tight mt-1 truncate">
              {enIyi?.personel || "—"}
            </p>
          </div>
        </div>

        {yukleniyor ? (
          <div className="py-6 text-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-400 mx-auto" /></div>
        ) : liste.length === 0 ? (
          <p className="text-[11px] text-slate-400 font-bold text-center py-4">Bu ay için veri yok.</p>
        ) : (
          <div className="space-y-2">
            {[...liste].sort((a, b) => Number(b.toplam_prim) - Number(a.toplam_prim)).map((p, i) => (
              <div key={p.personel} className="border border-slate-200 rounded-2xl overflow-hidden">
                <button onClick={() => detayAc(p.personel)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition text-left">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${
                    i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-200 text-slate-600"
                    : i === 2 ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-400"}`}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black text-slate-800 truncate">{p.personel}</p>
                    <p className="text-[9px] font-bold text-slate-400">
                      {p.is_sayisi} biten iş · ort. ağırlık {p.ortalama_agirlik}
                      {Number(p.zor_is) > 0 ? ` · ${p.zor_is} zor` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[14px] font-black text-emerald-700">{para(p.toplam_prim)} ₺</p>
                    <p className="text-[9px] font-bold text-slate-400">maaşın %{p.prim_orani}</p>
                  </div>
                  <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${detayKim === p.personel ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence>
                  {detayKim === p.personel && detay && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-slate-100">
                      <div className="p-3 bg-slate-50 space-y-1.5 max-h-72 overflow-y-auto">
                        <div className="flex justify-between text-[10px] font-black text-slate-500 pb-1 border-b border-slate-200">
                          <span>MAAŞ + PRİM</span>
                          <span>{para(Number(p.maas) + Number(p.toplam_prim))} ₺ ({para(p.maas)} + {para(p.toplam_prim)})</span>
                        </div>
                        {(detay.isler || []).map((is: any, x: number) => (
                          <div key={x} className="flex items-center justify-between bg-white rounded-xl px-2.5 py-2 border border-slate-100">
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-black text-slate-700 truncate">{is.musteri}</p>
                              <p className="text-[8px] font-bold text-slate-400">
                                {is.tarih} · {is.tip} · {is.sure} sa · {is.agirlik_puan}p
                                {is.memnuniyet ? ` · ⭐${is.memnuniyet}` : ""}
                              </p>
                            </div>
                            <p className="text-[10px] font-black text-emerald-700 shrink-0 ml-2">+{para(is.prim)} ₺</p>
                          </div>
                        ))}
                        {(!detay.isler || detay.isler.length === 0) && (
                          <p className="text-[10px] font-bold text-slate-400 text-center py-2">Bu ay biten iş yok.</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}

        <p className="text-[9px] text-slate-400 font-medium text-center leading-relaxed">
          Prim = <strong>İş Ağırlık Puanı ÷ 100 × {para(ayar?.maks_prim || 1200)} ₺</strong>.
          Ağırlık; süre · parça · iş tipi · iş büyüklüğü · müşteri memnuniyetinden oluşur.
          Sadece <strong>finansta tutarı girilen (biten)</strong> işler sayılır.
        </p>
      </div>

      {/* AYARLAR */}
      <AnimatePresence>
        {ayarAcik && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
              className="bg-white rounded-3xl w-full max-w-md overflow-hidden">
              <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-sm">PRİM AYARLARI</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Katsayıları kendine göre ayarla</p>
                </div>
                <button onClick={() => setAyarAcik(false)} className="bg-slate-800 hover:bg-red-500 p-2 rounded-full transition">
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    100 Puan Kaç ₺? (Maksimum Prim)
                  </label>
                  <input type="number" value={ayar?.maks_prim ?? 1200}
                    onChange={(e) => setAyar({ ...ayar, maks_prim: e.target.value })}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black outline-none focus:border-emerald-400" />
                  <p className="text-[10px] text-slate-400 font-medium mt-1">
                    En ağır iş bu tutarı alır. Kolay iş ~%10-15'ini alır.
                  </p>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    En Düşük Prim (₺)
                  </label>
                  <input type="number" value={ayar?.min_prim ?? 50}
                    onChange={(e) => setAyar({ ...ayar, min_prim: e.target.value })}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black outline-none focus:border-emerald-400" />
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <p className="text-[10px] font-black text-emerald-800 mb-1">ÖRNEK HESAP</p>
                  <p className="text-[10px] font-medium text-emerald-700">
                    Ağır iş (83 puan) → <strong>{para(Math.round(83 / 100 * (Number(ayar?.maks_prim) || 1200)))} ₺</strong><br />
                    Kolay iş (11 puan) → <strong>{para(Math.max(Number(ayar?.min_prim) || 50, Math.round(11 / 100 * (Number(ayar?.maks_prim) || 1200))))} ₺</strong>
                  </p>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={ayarKaydet} disabled={kaydediliyor}
                    className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black rounded-xl text-xs transition flex items-center justify-center gap-2">
                    {kaydediliyor ? <Loader2 size={14} className="animate-spin" /> : <Trophy size={14} />}
                    KAYDET
                  </button>
                  <button onClick={() => setAyarAcik(false)}
                    className="px-5 py-3.5 bg-slate-100 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-200 transition">
                    İptal
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
