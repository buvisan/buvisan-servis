"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - MALZEME SATIŞI 🛒
// Depodan malzeme seç → satış oluştur → A4 form/irsaliye yazdır → finansa aktar
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Plus, Minus, Trash2, Search, Loader2, ShoppingCart,
  Package, Printer, Banknote, CheckCircle2, X, Save, Percent, Building2,
} from "lucide-react";
import { satisHtml } from "@/lib/formHtml";
import { yazdirVeyaPaylas } from "@/lib/yazdirPaylas";

type Kalem = {
  stok_id?: string;
  parca_adi: string;
  parca_kodu?: string;
  birim: string;
  adet: number;
  birim_fiyat: number;
};

export default function SatisSayfasi() {
  const [sekme, setSekme] = useState<"yeni" | "gecmis">("yeni");
  const [stok, setStok] = useState<any[]>([]);
  const [satislar, setSatislar] = useState<any[]>([]);
  const [arama, setArama] = useState("");
  const [kalemler, setKalemler] = useState<Kalem[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mesaj, setMesaj] = useState("");

  // Müşteri bilgileri
  const [musteri, setMusteri] = useState("");
  const [yetkili, setYetkili] = useState("");
  const [telefon, setTelefon] = useState("");
  const [adres, setAdres] = useState("");
  const [odeme, setOdeme] = useState("nakit");
  const [belgeTipi, setBelgeTipi] = useState<"satis" | "irsaliye">("satis");
  const [iskonto, setIskonto] = useState(0);
  const [kdvOrani, setKdvOrani] = useState(20);
  const [notlar, setNotlar] = useState("");

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const [s, l] = await Promise.all([
        supabase.from("stok").select("*").order("parca_adi").limit(2000),
        supabase.rpc("satis_listesi", { p_limit: 100 }),
      ]);
      setStok(s.data || []);
      setSatislar((l.data as any[]) || []);
    } finally { setYukleniyor(false); }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  const stokFiltre = useMemo(() => {
    const a = arama.toLowerCase().trim();
    if (!a) return stok.slice(0, 40);
    return stok.filter((s: any) => {
      const ad = String(s.parca_adi || s.ad || "").toLowerCase();
      const kod = String(s.parca_kodu || s.kod || s.stok_kodu || "").toLowerCase();
      return ad.includes(a) || kod.includes(a);
    }).slice(0, 60);
  }, [stok, arama]);

  const ekle = (s: any) => {
    const ad = s.parca_adi || s.ad || "Malzeme";
    const fiyat = Number(s.satis_fiyati || s.birim_fiyat || s.fiyat || 0);
    const mevcut = kalemler.findIndex((k) => k.parca_adi === ad);
    if (mevcut >= 0) {
      const k = [...kalemler];
      k[mevcut] = { ...k[mevcut], adet: k[mevcut].adet + 1 };
      setKalemler(k);
    } else {
      setKalemler([...kalemler, {
        stok_id: s.id, parca_adi: ad,
        parca_kodu: s.parca_kodu || s.kod || s.stok_kodu || "",
        birim: s.birim || "Adet", adet: 1, birim_fiyat: fiyat,
      }]);
    }
  };

  const guncelle = (i: number, alan: keyof Kalem, deger: any) => {
    const k = [...kalemler];
    (k[i] as any)[alan] = deger;
    setKalemler(k);
  };

  const sil = (i: number) => setKalemler(kalemler.filter((_, x) => x !== i));

  const araToplam = kalemler.reduce((s, k) => s + k.adet * k.birim_fiyat, 0);
  const indirimli = Math.max(0, araToplam - iskonto);
  const kdvTutar = Math.round(indirimli * kdvOrani) / 100;
  const genelToplam = indirimli + kdvTutar;

  const kaydet = async (yazdir: boolean) => {
    if (!musteri.trim()) { setMesaj("⚠️ Müşteri adı zorunludur."); return; }
    if (kalemler.length === 0) { setMesaj("⚠️ En az bir malzeme ekleyin."); return; }

    setKaydediliyor(true);
    setMesaj("");
    try {
      const { data, error } = await supabase.rpc("satis_kaydet", {
        p_musteri: musteri.trim(),
        p_kalemler: kalemler,
        p_yetkili: yetkili.trim() || null,
        p_telefon: telefon.trim() || null,
        p_adres: adres.trim() || null,
        p_odeme_tipi: odeme,
        p_iskonto: iskonto,
        p_kdv_orani: kdvOrani,
        p_belge_tipi: belgeTipi,
        p_notlar: notlar.trim() || null,
        p_olusturan: "ADMIN",
      });

      if (error || !(data as any)?.ok) {
        setMesaj("❌ " + (error?.message || (data as any)?.mesaj || "Kaydedilemedi"));
        return;
      }

      const satisNo = (data as any).satis_no;
      setMesaj("✅ Kaydedildi: " + satisNo);

      if (yazdir) {
        const html = satisHtml({
          ...(data as any),
          musteri, yetkili, telefon, adres, odeme_tipi: odeme,
          belge_tipi: belgeTipi, ara_toplam: indirimli, iskonto,
          kdv_orani: kdvOrani, kdv_tutar: kdvTutar, genel_toplam: genelToplam,
          notlar, kalemler, tarih_tr: new Date().toLocaleDateString("tr-TR"),
        });
        await yazdirVeyaPaylas(html, {
          baslik: belgeTipi === "irsaliye" ? "Sevk İrsaliyesi" : "Satış Formu",
          dosyaAdi: satisNo,
        });
      }

      setKalemler([]);
      setMusteri(""); setYetkili(""); setTelefon(""); setAdres(""); setNotlar("");
      setIskonto(0);
      await getir();
      setSekme("gecmis");
    } finally { setKaydediliyor(false); }
  };

  const yazdirGecmis = async (s: any) => {
    const { data } = await supabase.rpc("satis_getir", { p_id: s.id });
    if (!(data as any)?.ok) { setMesaj("❌ Satış yüklenemedi"); return; }
    const html = satisHtml({ ...(data as any).satis, kalemler: (data as any).kalemler });
    await yazdirVeyaPaylas(html, {
      baslik: s.belge_tipi === "irsaliye" ? "Sevk İrsaliyesi" : "Satış Formu",
      dosyaAdi: s.satis_no,
    });
  };

  const finansaAktar = async (s: any) => {
    if (!confirm(`${s.satis_no} finansa aktarılacak. Devam?`)) return;
    const { data } = await supabase.rpc("satisi_finansa_kaydet", { p_id: s.id });
    if ((data as any)?.ok) { setMesaj("✅ " + (data as any).mesaj); await getir(); }
    else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* ÜST BAR */}
      <div className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin/malzemeler" className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-2.5 rounded-xl">
              <ArrowLeft size={16} />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="bg-white/10 p-2 rounded-xl"><ShoppingCart size={18} /></div>
              <div>
                <h1 className="font-black text-sm leading-none">MALZEME SATIŞI</h1>
                <p className="text-[10px] text-slate-400 font-bold mt-1">
                  Satış formu · İrsaliye · Finans
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-3">
        {/* SEKMELER */}
        <div className="flex gap-2">
          <button onClick={() => setSekme("yeni")}
            className={`flex-1 py-3 rounded-xl text-[11px] font-black transition ${
              sekme === "yeni" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
            ➕ YENİ SATIŞ
          </button>
          <button onClick={() => setSekme("gecmis")}
            className={`flex-1 py-3 rounded-xl text-[11px] font-black transition ${
              sekme === "gecmis" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
            🧾 GEÇMİŞ ({satislar.length})
          </button>
        </div>

        {mesaj && (
          <div className={`p-3 rounded-xl text-[11px] font-bold ${
            mesaj.startsWith("✅") ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
            {mesaj}
          </div>
        )}

        {sekme === "yeni" ? (
          <>
            {/* MÜŞTERİ */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
              <h3 className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                <Building2 size={11} /> MÜŞTERİ BİLGİLERİ
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <input value={musteri} onChange={(e) => setMusteri(e.target.value)}
                  placeholder="Müşteri / Firma *"
                  className="col-span-2 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-slate-900" />
                <input value={yetkili} onChange={(e) => setYetkili(e.target.value)}
                  placeholder="Yetkili kişi"
                  className="p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-slate-900" />
                <input value={telefon} onChange={(e) => setTelefon(e.target.value)}
                  placeholder="Telefon" type="tel"
                  className="p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-slate-900" />
                <input value={adres} onChange={(e) => setAdres(e.target.value)}
                  placeholder="Adres"
                  className="col-span-2 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-slate-900" />
              </div>
            </div>

            {/* MALZEME SEÇ */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5">
                <h3 className="text-white font-black text-xs flex items-center gap-1.5">
                  <Package size={13} /> DEPODAN MALZEME SEÇ
                </h3>
              </div>
              <div className="p-3">
                <div className="relative">
                  <Search size={15} className="absolute left-3.5 top-3.5 text-slate-400" />
                  <input value={arama} onChange={(e) => setArama(e.target.value)}
                    placeholder="Malzeme adı veya kodu ara..."
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {yukleniyor ? (
                  <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>
                ) : stokFiltre.length === 0 ? (
                  <p className="py-10 text-center text-[11px] font-bold text-slate-400">Malzeme bulunamadı</p>
                ) : stokFiltre.map((s: any) => {
                  const ad = s.parca_adi || s.ad || "Malzeme";
                  const fiyat = Number(s.satis_fiyati || s.birim_fiyat || s.fiyat || 0);
                  const stokAdet = Number(s.adet ?? s.stok ?? s.miktar ?? 0);
                  return (
                    <button key={s.id} onClick={() => ekle(s)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-indigo-50 transition text-left">
                      <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                        <Package size={12} className="text-indigo-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-black text-slate-800 truncate">{ad}</p>
                        <p className="text-[9px] font-bold text-slate-400">
                          Stok: {stokAdet} · {fiyat.toLocaleString("tr-TR")} ₺
                        </p>
                      </div>
                      <Plus size={14} className="text-indigo-600 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SEPET */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="bg-slate-900 px-4 py-2.5 flex items-center justify-between">
                <h3 className="text-white font-black text-xs">🛒 SEPET ({kalemler.length})</h3>
                {kalemler.length > 0 && (
                  <button onClick={() => setKalemler([])} className="text-[9px] font-black text-rose-300 hover:text-white">
                    TEMİZLE
                  </button>
                )}
              </div>

              {kalemler.length === 0 ? (
                <p className="py-10 text-center text-[11px] font-bold text-slate-400">
                  Yukarıdan malzeme ekleyin
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {kalemler.map((k, i) => (
                    <div key={i} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] font-black text-slate-800 flex-1">{k.parca_adi}</p>
                        <button onClick={() => sil(i)} className="text-rose-500 p-1"><Trash2 size={13} /></button>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center gap-1 bg-slate-100 rounded-lg">
                          <button onClick={() => guncelle(i, "adet", Math.max(1, k.adet - 1))}
                            className="p-1.5 text-slate-600"><Minus size={12} /></button>
                          <input value={k.adet} onChange={(e) => guncelle(i, "adet", Number(e.target.value) || 1)}
                            className="w-10 text-center bg-transparent text-[11px] font-black outline-none" />
                          <button onClick={() => guncelle(i, "adet", k.adet + 1)}
                            className="p-1.5 text-slate-600"><Plus size={12} /></button>
                        </div>
                        <span className="text-[9px] font-black text-slate-400">×</span>
                        <input value={k.birim_fiyat} onChange={(e) => guncelle(i, "birim_fiyat", Number(e.target.value) || 0)}
                          className="w-24 p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-right outline-none focus:border-indigo-500" />
                        <span className="text-[10px] font-black text-slate-400">₺</span>
                        <span className="ml-auto text-[12px] font-black text-emerald-600">
                          {(k.adet * k.birim_fiyat).toLocaleString("tr-TR")} ₺
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {kalemler.length > 0 && (
                <div className="p-3 bg-slate-50 border-t border-slate-200 space-y-1.5">
                  <div className="flex justify-between text-[11px] font-bold text-slate-600">
                    <span>Ara Toplam</span><span>{araToplam.toLocaleString("tr-TR")} ₺</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-600">İskonto</span>
                    <input value={iskonto} onChange={(e) => setIskonto(Number(e.target.value) || 0)}
                      className="w-24 p-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-right outline-none" />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1"><Percent size={10} /> KDV</span>
                    <select value={kdvOrani} onChange={(e) => setKdvOrani(Number(e.target.value))}
                      className="w-24 p-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold outline-none">
                      {[0, 1, 8, 10, 18, 20].map((o) => <option key={o} value={o}>%{o}</option>)}
                    </select>
                  </div>
                  <div className="flex justify-between text-[11px] font-bold text-slate-600">
                    <span>KDV Tutarı</span><span>{kdvTutar.toLocaleString("tr-TR")} ₺</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t-2 border-slate-900 text-[14px] font-black text-slate-900">
                    <span>GENEL TOPLAM</span><span>{genelToplam.toLocaleString("tr-TR")} ₺</span>
                  </div>
                </div>
              )}
            </div>

            {/* AYARLAR + KAYDET */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase">Belge Tipi</label>
                  <select value={belgeTipi} onChange={(e) => setBelgeTipi(e.target.value as any)}
                    className="w-full mt-1 p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-[11px] font-bold outline-none">
                    <option value="satis">Satış Formu</option>
                    <option value="irsaliye">Sevk İrsaliyesi</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase">Ödeme</label>
                  <select value={odeme} onChange={(e) => setOdeme(e.target.value)}
                    className="w-full mt-1 p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-[11px] font-bold outline-none">
                    <option value="nakit">Nakit</option>
                    <option value="havale">Havale</option>
                    <option value="kredi_karti">Kredi Kartı</option>
                    <option value="cek">Çek</option>
                    <option value="senet">Senet</option>
                  </select>
                </div>
              </div>
              <textarea rows={2} value={notlar} onChange={(e) => setNotlar(e.target.value)}
                placeholder="Notlar (opsiyonel)"
                className="w-full p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-[11px] resize-none outline-none focus:border-slate-900" />

              <div className="flex gap-2 pt-1">
                <button onClick={() => kaydet(false)} disabled={kaydediliyor}
                  className="flex-1 py-3.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {kaydediliyor ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  SADECE KAYDET
                </button>
                <button onClick={() => kaydet(true)} disabled={kaydediliyor}
                  className="flex-[2] py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 disabled:bg-slate-300 shadow-lg shadow-emerald-500/20">
                  {kaydediliyor ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
                  KAYDET VE YAZDIR
                </button>
              </div>
            </div>
          </>
        ) : (
          /* GEÇMİŞ */
          <div className="space-y-2">
            {satislar.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <ShoppingCart className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                <p className="text-xs font-black text-slate-400">Henüz satış yok</p>
              </div>
            ) : satislar.map((s: any) => (
              <div key={s.id} className="bg-white border border-slate-200 rounded-2xl p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[12px] font-black text-slate-800">{s.musteri}</p>
                      <span className="text-[8px] font-black text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">
                        {s.satis_no}
                      </span>
                      {s.finans_kaydedildi && (
                        <span className="text-[8px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <CheckCircle2 size={8} /> FİNANSTA
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-slate-500 mt-1">
                      {s.tarih} · {s.kalem_sayisi} kalem · {s.belge_tipi === "irsaliye" ? "İrsaliye" : "Satış"}
                    </p>
                  </div>
                  <p className="text-[13px] font-black text-emerald-600 shrink-0">
                    {Number(s.genel_toplam || 0).toLocaleString("tr-TR")} ₺
                  </p>
                </div>
                <div className="flex gap-1.5 mt-2.5">
                  <button onClick={() => yazdirGecmis(s)}
                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-black flex items-center justify-center gap-1">
                    <Printer size={11} /> YAZDIR
                  </button>
                  {!s.finans_kaydedildi && (
                    <button onClick={() => finansaAktar(s)}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black flex items-center justify-center gap-1">
                      <Banknote size={11} /> FİNANSA
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
