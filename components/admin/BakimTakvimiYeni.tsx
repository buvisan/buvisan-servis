"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - BAKIM TAKVİMİ (yıl bazlı, tam yönetim) 📅
// Yıl seç · ay ay gör · tarih değiştir · yapıldı işaretle
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Loader2, CheckCircle2, RotateCcw, ChevronLeft, ChevronRight,
  RefreshCw, Calendar, Clock, Building2, Pencil, X, Save, Wrench,
} from "lucide-react";

type Kayit = {
  id: string;
  sozlesme_id: string;
  musteri: string;
  tarih: string;
  tarih_iso: string;
  sira: number;
  durum: string;
  makine_sayisi: number;
  makine_tipi: string;
  periyot: number;
  hitap: string;
  gun_kaldi: number;
  sozlesme_bitis: string;
};

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export default function BakimTakvimiYeni() {
  const buYil = new Date().getFullYear();
  const [yil, setYil] = useState(buYil);
  const [liste, setListe] = useState<Kayit[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [mesaj, setMesaj] = useState("");
  const [islem, setIslemde] = useState<string | null>(null);
  const [duzKayit, setDuzKayit] = useState<Kayit | null>(null);
  const [duzTarih, setDuzTarih] = useState("");
  const [filtre, setFiltre] = useState<"hepsi" | "planlandi" | "yapildi" | "gecikmis">("hepsi");

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data, error } = await supabase.rpc("bakim_takvimi_detay", {
        p_yil: yil, p_musteri: null,
      });
      if (error) { setMesaj("❌ " + error.message); setListe([]); return; }
      setListe((data as Kayit[]) || []);
    } finally { setYukleniyor(false); }
  }, [yil]);

  useEffect(() => { getir(); }, [getir]);

  const yapildi = async (id: string, mevcut: boolean) => {
    setIslemde(id);
    try {
      const { data } = await supabase.rpc("bakim_yapildi_isaretle", {
        p_id: id, p_yapildi: !mevcut,
      });
      if ((data as any)?.ok) { setMesaj("✅ " + (data as any).mesaj); await getir(); }
      else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
    } finally { setIslemde(null); }
  };

  const tarihKaydet = async () => {
    if (!duzKayit || !duzTarih) return;
    setIslemde(duzKayit.id);
    try {
      const { data } = await supabase.rpc("bakim_tarihi_degistir", {
        p_id: duzKayit.id, p_yeni_tarih: duzTarih,
      });
      if ((data as any)?.ok) {
        setMesaj("✅ " + (data as any).mesaj);
        setDuzKayit(null); setDuzTarih("");
        await getir();
      } else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
    } finally { setIslemde(null); }
  };

  const filtreli = useMemo(() => {
    return liste.filter((k) => {
      if (filtre === "planlandi") return k.durum === "planlandi";
      if (filtre === "yapildi") return k.durum === "yapildi";
      if (filtre === "gecikmis") return k.durum === "planlandi" && k.gun_kaldi < 0;
      return true;
    });
  }, [liste, filtre]);

  // Aya göre grupla
  const aylik = useMemo(() => {
    const m: Record<number, Kayit[]> = {};
    for (const k of filtreli) {
      const ay = Number(String(k.tarih_iso).slice(5, 7)) - 1;
      if (!m[ay]) m[ay] = [];
      m[ay].push(k);
    }
    return m;
  }, [filtreli]);

  const toplam = liste.length;
  const yapilanAdet = liste.filter((k) => k.durum === "yapildi").length;
  const gecikmisAdet = liste.filter((k) => k.durum === "planlandi" && k.gun_kaldi < 0).length;
  const oran = toplam > 0 ? Math.round((yapilanAdet / toplam) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* YIL SEÇİCİ + İSTATİSTİK */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={() => setYil(yil - 1)}
              className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg"><ChevronLeft size={16} /></button>
            <div className="bg-slate-900 text-white px-5 py-2 rounded-xl font-black text-sm min-w-[80px] text-center">
              {yil}
            </div>
            <button onClick={() => setYil(yil + 1)}
              className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg"><ChevronRight size={16} /></button>
            <button onClick={() => setYil(buYil)}
              className="px-3 py-2 bg-teal-600 text-white rounded-lg text-[10px] font-black">BU YIL</button>
            <button onClick={getir}
              className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg">
              <RefreshCw size={16} className={yukleniyor ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {([["hepsi", "HEPSİ"], ["planlandi", "PLANLANAN"], ["yapildi", "YAPILAN"], ["gecikmis", "GECİKMİŞ"]] as const).map(([k, a]) => (
              <button key={k} onClick={() => setFiltre(k)}
                className={`px-3 py-2 rounded-lg text-[10px] font-black transition ${
                  filtre === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
          <div className="bg-slate-50 rounded-xl p-2.5">
            <p className="text-[8px] font-black text-slate-400 uppercase">TOPLAM BAKIM</p>
            <p className="text-xl font-black text-slate-800">{toplam}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-2.5">
            <p className="text-[8px] font-black text-emerald-600 uppercase">YAPILAN</p>
            <p className="text-xl font-black text-emerald-700">{yapilanAdet}</p>
          </div>
          <div className="bg-rose-50 rounded-xl p-2.5">
            <p className="text-[8px] font-black text-rose-600 uppercase">GECİKMİŞ</p>
            <p className="text-xl font-black text-rose-700">{gecikmisAdet}</p>
          </div>
          <div className="bg-indigo-50 rounded-xl p-2.5">
            <p className="text-[8px] font-black text-indigo-600 uppercase">TAMAMLANMA</p>
            <p className="text-xl font-black text-indigo-700">%{oran}</p>
          </div>
        </div>
      </div>

      {mesaj && (
        <div className={`p-3 rounded-xl text-[11px] font-bold ${mesaj.startsWith("✅") ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
          {mesaj}
        </div>
      )}

      {/* AYLIK GÖRÜNÜM */}
      {yukleniyor ? (
        <div className="py-14 text-center"><Loader2 className="w-7 h-7 animate-spin text-slate-300 mx-auto" /></div>
      ) : filtreli.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Calendar className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-black text-slate-400">{yil} yılında bakım yok</p>
          <p className="text-[11px] text-slate-400 mt-1">Sözleşme ekleyince takvim otomatik oluşur</p>
        </div>
      ) : (
        <div className="space-y-2">
          {AYLAR.map((ayAdi, ayIdx) => {
            const kayitlar = aylik[ayIdx] || [];
            if (kayitlar.length === 0) return null;
            const buAy = new Date().getMonth() === ayIdx && new Date().getFullYear() === yil;

            return (
              <div key={ayIdx} className={`bg-white rounded-2xl border-2 overflow-hidden ${buAy ? "border-teal-300" : "border-slate-200"}`}>
                <div className={`px-4 py-2.5 flex items-center justify-between ${buAy ? "bg-teal-600" : "bg-slate-800"}`}>
                  <h3 className="text-white font-black text-xs uppercase tracking-wide">
                    {ayAdi} {yil}
                  </h3>
                  <span className="text-[9px] font-black text-white/70">
                    {kayitlar.length} BAKIM
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {kayitlar.map((k) => {
                    const bitti = k.durum === "yapildi";
                    const gec = !bitti && k.gun_kaldi < 0;
                    return (
                      <div key={k.id} className={`px-3 py-2.5 flex items-center gap-2 ${gec ? "bg-rose-50/50" : ""}`}>
                        <div className={`w-1.5 h-10 rounded-full shrink-0 ${bitti ? "bg-emerald-500" : gec ? "bg-rose-500" : "bg-slate-300"}`} />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-[11px] font-black text-slate-800 truncate">{k.musteri}</p>
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${
                              bitti ? "bg-emerald-100 text-emerald-700"
                              : gec ? "bg-rose-100 text-rose-700"
                              : "bg-slate-100 text-slate-600"}`}>
                              {bitti ? "YAPILDI" : gec ? `${Math.abs(k.gun_kaldi)} GÜN GECİKTİ` : "PLANLANDI"}
                            </span>
                            {k.makine_tipi && (
                              <span className="text-[8px] font-bold text-slate-400">
                                {k.makine_sayisi} {k.makine_tipi}
                              </span>
                            )}
                          </div>
                          <p className="text-[9px] font-bold text-slate-500 mt-0.5">
                            {k.tarih} · {k.sira}. bakım
                          </p>
                        </div>

                        <button onClick={() => { setDuzKayit(k); setDuzTarih(k.tarih_iso); }}
                          className="px-2 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-[9px] font-black shrink-0 flex items-center gap-1">
                          <Pencil size={10} /> TARİH
                        </button>

                        <button onClick={() => yapildi(k.id, bitti)} disabled={islem === k.id}
                          className={`px-2 py-1.5 rounded-lg text-[9px] font-black shrink-0 flex items-center gap-1 ${
                            bitti
                              ? "bg-slate-100 text-slate-600 border border-slate-200"
                              : "bg-emerald-600 text-white"}`}>
                          {islem === k.id ? <Loader2 size={10} className="animate-spin" />
                            : bitti ? <><RotateCcw size={10} /> GERİ AL</> : <><CheckCircle2 size={10} /> YAPILDI</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TARİH DEĞİŞTİRME MODAL */}
      {duzKayit && (
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-xs text-slate-800 uppercase">📅 BAKIM TARİHİ</h3>
              <button onClick={() => setDuzKayit(null)} className="text-slate-400"><X size={18} /></button>
            </div>
            <p className="text-[11px] font-bold text-slate-600 mb-1">{duzKayit.musteri}</p>
            <p className="text-[10px] text-slate-400 mb-3">{duzKayit.sira}. bakım · şu an: {duzKayit.tarih}</p>
            <input type="date" value={duzTarih} onChange={(e) => setDuzTarih(e.target.value)}
              className="w-full p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-teal-500" />
            <div className="flex gap-2 mt-3">
              <button onClick={() => setDuzKayit(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl text-[11px] font-black">İPTAL</button>
              <button onClick={tarihKaydet} disabled={islem === duzKayit.id}
                className="flex-[2] py-3 bg-teal-600 text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 disabled:bg-slate-300">
                {islem === duzKayit.id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} KAYDET
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
