"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - GÖRSEL BAKIM TAKVİMİ 📅
// 12 aylık grid · günlerde bakım işaretleri · yıl seçimi
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2, X, Calendar } from "lucide-react";

type Kayit = {
  id: string;
  musteri: string;
  tarih: string;
  tarih_iso: string;
  durum: string;
  makine_sayisi: number;
  makine_tipi: string;
  gun_kaldi: number;
};

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUNLER = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export default function BakimTakvimiGorsel() {
  const buYil = new Date().getFullYear();
  const [yil, setYil] = useState(buYil);
  const [liste, setListe] = useState<Kayit[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [seciliGun, setSeciliGun] = useState<string | null>(null);

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data } = await supabase.rpc("bakim_takvimi_detay", { p_yil: yil, p_musteri: null });
      setListe((data as Kayit[]) || []);
    } finally { setYukleniyor(false); }
  }, [yil]);

  useEffect(() => { getir(); }, [getir]);

  // Tarih → kayıtlar
  const gunHaritasi = useMemo(() => {
    const m: Record<string, Kayit[]> = {};
    for (const k of liste) {
      if (!m[k.tarih_iso]) m[k.tarih_iso] = [];
      m[k.tarih_iso].push(k);
    }
    return m;
  }, [liste]);

  // Ay için takvim hücreleri
  const ayHucreleri = (ayIdx: number) => {
    const ilk = new Date(yil, ayIdx, 1);
    const son = new Date(yil, ayIdx + 1, 0);
    // Pazartesi başlangıç (0=Pzt)
    let baslangic = ilk.getDay() - 1;
    if (baslangic < 0) baslangic = 6;

    const hucreler: (number | null)[] = [];
    for (let i = 0; i < baslangic; i++) hucreler.push(null);
    for (let d = 1; d <= son.getDate(); d++) hucreler.push(d);
    return hucreler;
  };

  const tarihStr = (ayIdx: number, gun: number) => {
    const ay = String(ayIdx + 1).padStart(2, "0");
    const g = String(gun).padStart(2, "0");
    return `${yil}-${ay}-${g}`;
  };

  const buAy = new Date().getMonth();
  const buGun = new Date().getDate();

  const seciliKayitlar = seciliGun ? (gunHaritasi[seciliGun] || []) : [];

  const toplam = liste.length;
  const yapilan = liste.filter((k) => k.durum === "yapildi").length;
  const gecikmis = liste.filter((k) => k.durum === "planlandi" && k.gun_kaldi < 0).length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* BAŞLIK + YIL */}
      <div className="bg-slate-900 px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-yellow-400" />
          <h3 className="text-white font-black text-sm uppercase tracking-wide">YILLIK BAKIM TAKVİMİ</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setYil(yil - 1)}
            className="bg-white/10 hover:bg-white/20 p-1.5 rounded-lg"><ChevronLeft size={14} className="text-white" /></button>
          <span className="bg-yellow-400 text-slate-900 px-3 py-1 rounded-lg font-black text-xs min-w-[56px] text-center">{yil}</span>
          <button onClick={() => setYil(yil + 1)}
            className="bg-white/10 hover:bg-white/20 p-1.5 rounded-lg"><ChevronRight size={14} className="text-white" /></button>
          <button onClick={() => setYil(buYil)}
            className="bg-teal-600 hover:bg-teal-500 text-white px-2.5 py-1.5 rounded-lg text-[9px] font-black">BU YIL</button>
        </div>
      </div>

      {/* İSTATİSTİK ŞERİDİ */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-4 text-[10px] font-black flex-wrap">
        <span className="text-slate-600">📋 {toplam} BAKIM</span>
        <span className="text-emerald-600">✅ {yapilan} YAPILAN</span>
        <span className="text-rose-600">⚠️ {gecikmis} GECİKMİŞ</span>
        <span className="ml-auto text-slate-400 flex items-center gap-2">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Yapıldı</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500" /> Planlandı</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Gecikmiş</span>
        </span>
      </div>

      {yukleniyor ? (
        <div className="py-16 text-center"><Loader2 className="w-7 h-7 animate-spin text-slate-300 mx-auto" /></div>
      ) : (
        <>
          {/* 12 AYLIK GRID */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3">
            {AYLAR.map((ayAdi, ayIdx) => {
              const hucreler = ayHucreleri(ayIdx);
              const ayKayit = liste.filter((k) => Number(String(k.tarih_iso).slice(5, 7)) - 1 === ayIdx);
              const dolu = ayKayit.length > 0;
              const aktifAy = ayIdx === buAy && yil === buYil;

              return (
                <div key={ayIdx}
                  className={`rounded-xl border-2 overflow-hidden ${aktifAy ? "border-teal-400" : dolu ? "border-slate-300" : "border-slate-100"}`}>
                  <div className={`px-2 py-1.5 flex items-center justify-between ${aktifAy ? "bg-teal-600" : dolu ? "bg-slate-700" : "bg-slate-100"}`}>
                    <span className={`text-[10px] font-black uppercase ${dolu || aktifAy ? "text-white" : "text-slate-400"}`}>
                      {ayAdi}
                    </span>
                    {dolu && (
                      <span className="text-[8px] font-black text-yellow-400">{ayKayit.length}</span>
                    )}
                  </div>

                  <div className="p-1.5">
                    {/* Gün başlıkları */}
                    <div className="grid grid-cols-7 gap-0.5 mb-1">
                      {GUNLER.map((g) => (
                        <div key={g} className="text-[6px] font-black text-slate-400 text-center">{g.charAt(0)}</div>
                      ))}
                    </div>

                    {/* Günler */}
                    <div className="grid grid-cols-7 gap-0.5">
                      {hucreler.map((gun, i) => {
                        if (gun === null) return <div key={`b${i}`} />;
                        const ts = tarihStr(ayIdx, gun);
                        const kayitlar = gunHaritasi[ts] || [];
                        const varKayit = kayitlar.length > 0;
                        const hepsiYapildi = varKayit && kayitlar.every((k) => k.durum === "yapildi");
                        const gecikmisGun = varKayit && kayitlar.some((k) => k.durum === "planlandi" && k.gun_kaldi < 0);
                        const bugunMu = yil === buYil && ayIdx === buAy && gun === buGun;

                        let renk = "";
                        if (varKayit) {
                          renk = hepsiYapildi ? "bg-emerald-500 text-white"
                            : gecikmisGun ? "bg-rose-500 text-white"
                            : "bg-teal-500 text-white";
                        } else if (bugunMu) {
                          renk = "bg-yellow-400 text-slate-900";
                        } else {
                          renk = "text-slate-600 hover:bg-slate-100";
                        }

                        return (
                          <button key={gun} onClick={() => varKayit && setSeciliGun(ts)}
                            className={`aspect-square rounded-[3px] text-[7px] font-black flex items-center justify-center transition ${renk} ${varKayit ? "ring-1 ring-white/30 cursor-pointer" : ""}`}>
                            {gun}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* SEÇİLİ GÜN DETAYI */}
          {seciliGun && seciliKayitlar.length > 0 && (
            <div className="border-t-2 border-slate-900 bg-slate-50 p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[11px] font-black text-slate-800 uppercase">
                  {seciliGun.split("-").reverse().join(".")} — {seciliKayitlar.length} BAKIM
                </h4>
                <button onClick={() => setSeciliGun(null)} className="text-slate-400"><X size={16} /></button>
              </div>
              <div className="space-y-1.5">
                {seciliKayitlar.map((k) => {
                  const bitti = k.durum === "yapildi";
                  const gec = !bitti && k.gun_kaldi < 0;
                  return (
                    <div key={k.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${bitti ? "bg-emerald-50 border border-emerald-200" : gec ? "bg-rose-50 border border-rose-200" : "bg-white border border-slate-200"}`}>
                      <div className={`w-1.5 h-8 rounded-full ${bitti ? "bg-emerald-500" : gec ? "bg-rose-500" : "bg-teal-500"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-black text-slate-800 truncate">{k.musteri}</p>
                        <p className="text-[9px] font-bold text-slate-500">
                          {k.makine_sayisi} {k.makine_tipi}
                          {gec && <span className="text-rose-600 ml-1">· {Math.abs(k.gun_kaldi)} gün gecikti</span>}
                        </p>
                      </div>
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${bitti ? "bg-emerald-100 text-emerald-700" : gec ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                        {bitti ? "YAPILDI" : gec ? "GECİKMİŞ" : "PLANLANDI"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {liste.length === 0 && (
            <div className="px-4 pb-6 text-center">
              <p className="text-[11px] font-bold text-slate-400">{yil} yılında planlanmış bakım yok</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
