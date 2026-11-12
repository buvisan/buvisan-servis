"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - TELEFON REHBERİ 📇 (profesyonel arayüz)
// Arama · seçim · toplu silme · düzenleme · toplu yükleme
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Loader2, Trash2, Pencil, X, Check, Phone, Users,
  ChevronDown, AlertTriangle, RefreshCw, Building2, User, CheckSquare, Square,
} from "lucide-react";
import TelefonTopluYukle from "@/components/TelefonTopluYukle";

type Kayit = {
  id: string;
  telefon: string;
  firma_adi: string | null;
  yetkili: string | null;
  notlar: string | null;
  kullanildi: boolean;
  ekleyen: string | null;
  olusturma: string;
};

export default function TelefonRehberi() {
  const [liste, setListe] = useState<Kayit[]>([]);
  const [istatistik, setIstatistik] = useState<any>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [arama, setArama] = useState("");
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [mesaj, setMesaj] = useState("");
  const [islem, setIslemde] = useState(false);
  const [limit, setLimit] = useState(100);
  const [duzenle, setDuzenle] = useState<Kayit | null>(null);
  const [dTel, setDTel] = useState("");
  const [dFirma, setDFirma] = useState("");
  const [dYetkili, setDYetkili] = useState("");
  const [dNot, setDNot] = useState("");

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const [l, s] = await Promise.all([
        supabase.rpc("telefon_izin_listesi"),
        supabase.rpc("telefon_izin_istatistik"),
      ]);
      setListe((l.data as Kayit[]) || []);
      setIstatistik(s.data || null);
    } finally { setYukleniyor(false); }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  const filtreli = useMemo(() => {
    const a = arama.trim().toLowerCase().replace(/\s+/g, "");
    if (!a) return liste;
    return liste.filter((t) => {
      const tel = String(t.telefon || "").replace(/[^0-9]/g, "");
      const isim = String(t.yetkili || "").toLowerCase().replace(/\s+/g, "");
      const firma = String(t.firma_adi || "").toLowerCase().replace(/\s+/g, "");
      return tel.includes(a) || isim.includes(a) || firma.includes(a);
    });
  }, [liste, arama]);

  const goster = filtreli.slice(0, limit);
  const hepsiSecili = goster.length > 0 && goster.every((t) => secili.has(t.id));

  const secDegistir = (id: string) => {
    setSecili((o) => {
      const y = new Set(o);
      if (y.has(id)) y.delete(id); else y.add(id);
      return y;
    });
  };

  const tumunuSec = () => {
    if (hepsiSecili) {
      setSecili(new Set());
    } else {
      setSecili(new Set(goster.map((t) => t.id)));
    }
  };

  const secilenleriSil = async () => {
    if (secili.size === 0) return;
    if (!confirm(`${secili.size} kayıt silinecek. Emin misiniz?`)) return;
    setIslemde(true);
    try {
      const { data } = await supabase.rpc("telefon_izni_toplu_sil", {
        p_idler: Array.from(secili),
      });
      if ((data as any)?.ok) {
        setMesaj("✅ " + (data as any).mesaj);
        setSecili(new Set());
        await getir();
      } else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
    } finally { setIslemde(false); }
  };

  const tumunuSil = async () => {
    if (!confirm("TÜM rehber silinecek! Bu işlem geri alınamaz. Emin misiniz?")) return;
    setIslemde(true);
    try {
      const { data } = await supabase.rpc("telefon_izni_tumunu_sil");
      if ((data as any)?.ok) { setMesaj("✅ " + (data as any).mesaj); setSecili(new Set()); await getir(); }
    } finally { setIslemde(false); }
  };

  const bozukTemizle = async () => {
    if (!confirm("Bozuk isimler (kod görünen) temizlenecek. Devam?")) return;
    setIslemde(true);
    try {
      const { data } = await supabase.rpc("telefon_bozuk_isim_temizle");
      if ((data as any)?.ok) { setMesaj("✅ " + (data as any).mesaj); await getir(); }
    } finally { setIslemde(false); }
  };

  const duzenleAc = (t: Kayit) => {
    setDuzenle(t); setDTel(t.telefon); setDFirma(t.firma_adi || "");
    setDYetkili(t.yetkili || ""); setDNot(t.notlar || "");
  };

  const duzenleKaydet = async () => {
    if (!duzenle) return;
    setIslemde(true);
    try {
      const { data } = await supabase.rpc("telefon_izni_guncelle", {
        p_id: duzenle.id, p_telefon: dTel, p_firma: dFirma || null,
        p_yetkili: dYetkili || null, p_notlar: dNot || null,
      });
      if ((data as any)?.ok) { setMesaj("✅ " + (data as any).mesaj); setDuzenle(null); await getir(); }
      else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
    } finally { setIslemde(false); }
  };

  const bosalt = async () => {
    const ok = await supabase.rpc("telefon_izni_tumunu_sil");
    if ((ok.data as any)?.ok) { setMesaj("✅ Tüm rehber silindi"); await getir(); }
  };

  const telGoster = (t: string) => {
    const d = t.replace(/[^0-9]/g, "");
    if (d.length === 10) return `0${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6,8)} ${d.slice(8)}`;
    return t;
  };

  return (
    <div className="space-y-3">
      {/* İSTATİSTİK */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { ad: "TOPLAM", deger: istatistik?.toplam ?? liste.length, renk: "from-indigo-600 to-violet-600" },
          { ad: "İSİMLİ", deger: istatistik?.isimli ?? "—", renk: "from-emerald-600 to-teal-600" },
          { ad: "FİRMALI", deger: istatistik?.firmali ?? "—", renk: "from-blue-600 to-cyan-600" },
          { ad: "BOZUK", deger: istatistik?.bozuk_isim ?? "—", renk: "from-rose-600 to-red-600" },
        ].map((k) => (
          <div key={k.ad} className={`bg-gradient-to-br ${k.renk} rounded-2xl p-3 text-white shadow-sm`}>
            <p className="text-[9px] font-black opacity-80">{k.ad}</p>
            <p className="text-xl font-black mt-0.5">{k.deger}</p>
          </div>
        ))}
      </div>

      {/* YÜKLEME */}
      <details className="bg-white border-2 border-emerald-200 rounded-2xl overflow-hidden">
        <summary className="px-4 py-3 cursor-pointer font-black text-xs text-emerald-800 uppercase flex items-center justify-between">
          <span>📇 REHBER YÜKLE</span>
          <ChevronDown size={14} />
        </summary>
        <div className="p-3 pt-0">
          <TelefonTopluYukle onBitti={getir} />
        </div>
      </details>

      {/* ARAÇ ÇUBUĞU */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2.5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-3.5 text-slate-400" />
            <input value={arama} onChange={(e) => { setArama(e.target.value); setLimit(100); }}
              placeholder="İsim, firma veya numara ara..."
              className="w-full pl-10 pr-9 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500" />
            {arama && (
              <button onClick={() => setArama("")} className="absolute right-3 top-3.5 text-slate-400">
                <X size={15} />
              </button>
            )}
          </div>
          <button onClick={getir} disabled={yukleniyor}
            className="px-4 bg-slate-900 text-white rounded-xl">
            <RefreshCw size={15} className={yukleniyor ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={tumunuSec}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-black text-slate-700">
            {hepsiSecili ? <CheckSquare size={13} /> : <Square size={13} />}
            {hepsiSecili ? "SEÇİMİ KALDIR" : "TÜMÜNÜ SEÇ"}
          </button>

          {secili.size > 0 && (
            <button onClick={secilenleriSil} disabled={islem}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-black">
              <Trash2 size={13} /> {secili.size} SİL
            </button>
          )}

          {(istatistik?.bozuk_isim ?? 0) > 0 && (
            <button onClick={bozukTemizle} disabled={islem}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-black">
              <AlertTriangle size={13} /> BOZUK İSİMLERİ TEMİZLE ({istatistik.bozuk_isim})
            </button>
          )}

          {liste.length > 0 && (
            <button onClick={tumunuSil} disabled={islem}
              className="ml-auto flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-lg text-[10px] font-black">
              <Trash2 size={13} /> TÜMÜNÜ SİL
            </button>
          )}
        </div>

        {mesaj && (
          <div className={`px-3 py-2 rounded-lg text-[10px] font-bold ${
            mesaj.startsWith("✅") ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {mesaj}
          </div>
        )}
      </div>

      {/* LİSTE */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 flex items-center justify-between">
          <h3 className="text-white font-black text-xs">
            TANIMLI NUMARALAR ({filtreli.length})
          </h3>
          {arama && (
            <span className="text-[9px] font-bold text-indigo-200">
              "{arama}" aramasi
            </span>
          )}
        </div>

        {yukleniyor ? (
          <div className="py-14 text-center"><Loader2 className="w-7 h-7 animate-spin text-slate-300 mx-auto" /></div>
        ) : goster.length === 0 ? (
          <div className="py-14 text-center">
            <Users className="w-10 h-10 text-slate-200 mx-auto mb-2" />
            <p className="text-xs font-black text-slate-400">
              {arama ? "Sonuç bulunamadı" : "Rehber boş"}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              {arama ? "Farklı bir arama deneyin" : "Yukarıdan rehber yükleyin"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {goster.map((t) => {
              const sec = secili.has(t.id);
              return (
                <div key={t.id}
                  className={`flex items-center gap-2.5 px-3 py-2.5 transition ${
                    sec ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                  <button onClick={() => secDegistir(t.id)} className="shrink-0">
                    {sec
                      ? <CheckSquare size={17} className="text-indigo-600" />
                      : <Square size={17} className="text-slate-300" />}
                  </button>

                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-black text-white">
                      {(t.yetkili || "?").charAt(0).toUpperCase()}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[12px] font-black text-slate-800">
                        {t.yetkili || <span className="text-slate-300 italic font-medium">İsimsiz</span>}
                      </p>
                      {t.kullanildi && (
                        <span className="text-[8px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                          KAYITLI
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <a href={`tel:${t.telefon}`} className="text-[11px] font-bold text-indigo-600">
                        {telGoster(t.telefon)}
                      </a>
                      {t.firma_adi && (
                        <span className="text-[9px] font-bold text-slate-400 flex items-center gap-0.5">
                          <Building2 size={9} /> {t.firma_adi}
                        </span>
                      )}
                    </div>
                  </div>

                  <button onClick={() => duzenleAc(t)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg shrink-0">
                    <Pencil size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {goster.length < filtreli.length && (
          <button onClick={() => setLimit((l) => l + 200)}
            className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-[11px] font-black text-indigo-600 border-t border-slate-200">
            DAHA FAZLA GÖSTER ({filtreli.length - goster.length} kaldı)
          </button>
        )}
      </div>

      {/* DÜZENLE MODAL */}
      <AnimatePresence>
        {duzenle && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
              className="bg-white rounded-3xl w-full max-w-sm overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 flex items-center justify-between">
                <h3 className="text-white font-black text-xs uppercase">KAYDI DÜZENLE</h3>
                <button onClick={() => setDuzenle(null)} className="text-white/80 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 space-y-2.5">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
                    <Phone size={10} /> Telefon *
                  </label>
                  <input value={dTel} onChange={(e) => setDTel(e.target.value)}
                    className="w-full mt-1 p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
                    <User size={10} /> Yetkili
                  </label>
                  <input value={dYetkili} onChange={(e) => setDYetkili(e.target.value)}
                    placeholder="Ad soyad"
                    className="w-full mt-1 p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
                    <Building2 size={10} /> Firma
                  </label>
                  <input value={dFirma} onChange={(e) => setDFirma(e.target.value)}
                    placeholder="Firma adı"
                    className="w-full mt-1 p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase">Not</label>
                  <input value={dNot} onChange={(e) => setDNot(e.target.value)}
                    className="w-full mt-1 p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setDuzenle(null)}
                    className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl text-[11px] font-black">
                    İPTAL
                  </button>
                  <button onClick={duzenleKaydet} disabled={islem}
                    className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 disabled:bg-slate-300">
                    {islem ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    KAYDET
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
