"use client";

// ----------------------------------------------------------------------------
// BUVİSAN — MÜŞTERİ PORTALI v5
// Özet · Makine · Servis · Teklif · Sohbet · Bakım · Talep
//
// NOT: Veri akışı / RPC sözleşmeleri AYNEN korundu (musteri_portal_v6 vb.).
//      Bu dosyada sadece arayüz yenilendi + eksik "tarih değişikliği"
//      modalı bağlandı (RPC: musteri_bakim_tarih_talebi).
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import { yazdirVeyaPaylas } from "@/lib/yazdirPaylas";
import PushAbonelik from "@/components/PushAbonelik";
import { teklifHtml, satisHtml } from "@/lib/formHtml";
import { sozlesmeHtml } from "@/lib/sozlesmeHtml";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2, LogOut, Wrench, RefreshCw, Send, MessageSquare, Plus, X,
  Check, CheckCircle2, XCircle, Star, Package, Calendar, MapPin,
  ChevronRight, Clock, FileText, Banknote, AlertCircle, Sparkles,
  Phone, Pencil, Trash2, ShieldCheck, Activity,
} from "lucide-react";

type Sekme = "ozet" | "makine" | "servis" | "teklif" | "sohbet" | "talep" | "bakim";

// ─── Tipografi (sadece bu ekranı kapsar, global CSS'e dokunmaz) ───
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const para = (n: any) => (Number(n) || 0).toLocaleString("tr-TR");

const AY_ADLARI = ["OCA", "ŞUB", "MAR", "NİS", "MAY", "HAZ", "TEM", "AĞU", "EYL", "EKİ", "KAS", "ARA"];

// ─── Renk sözlüğü (ikon kutusu) ───
const RENK: Record<string, string> = {
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  teal: "bg-teal-50 text-teal-600 ring-teal-100",
  indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
  violet: "bg-violet-50 text-violet-600 ring-violet-100",
  rose: "bg-rose-50 text-rose-600 ring-rose-100",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
};

const CIP_RENK: Record<string, string> = {
  slate: "bg-slate-50 text-slate-600 border-slate-200",
  teal: "bg-teal-50 text-teal-700 border-teal-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
};

const BOS_RENK: Record<string, string> = {
  slate: "bg-slate-50 text-slate-300",
  teal: "bg-teal-50 text-teal-300",
  amber: "bg-amber-50 text-amber-300",
  indigo: "bg-indigo-50 text-indigo-300",
  violet: "bg-violet-50 text-violet-300",
  rose: "bg-rose-50 text-rose-300",
  emerald: "bg-emerald-50 text-emerald-300",
};

function Kart({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={
        "bg-white rounded-[22px] border border-slate-200/80 overflow-hidden " +
        "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_34px_-26px_rgba(15,23,42,0.35)] " +
        className
      }
    >
      {children}
    </div>
  );
}

function Bolum({
  ikon: Ikon, baslik, sayi, renk = "slate", sag,
}: {
  ikon: any; baslik: string; sayi?: number; renk?: string; sag?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3.5 pt-3.5 pb-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className={"w-7 h-7 rounded-xl grid place-items-center ring-1 shrink-0 " + (RENK[renk] || RENK.slate)}>
          <Ikon size={13} />
        </span>
        <h3 className="text-[10px] font-black tracking-[0.1em] text-slate-700 truncate">{baslik}</h3>
        {typeof sayi === "number" && (
          <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md shrink-0">{sayi}</span>
        )}
      </div>
      {sag}
    </div>
  );
}

function Cip({ children, renk = "slate" }: { children: ReactNode; renk?: string }) {
  return (
    <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[9px] font-black whitespace-nowrap " + (CIP_RENK[renk] || CIP_RENK.slate)}>
      {children}
    </span>
  );
}

function Bos({ ikon: Ikon, baslik, alt, ton = "slate" }: { ikon: any; baslik: string; alt?: string; ton?: string }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-7">
      <div className={"w-14 h-14 rounded-[20px] grid place-items-center " + (BOS_RENK[ton] || BOS_RENK.slate)}>
        <Ikon size={24} />
      </div>
      <p className="text-[12px] font-black text-slate-600 mt-3">{baslik}</p>
      {alt && <p className="text-[10px] font-semibold text-slate-400 mt-1 leading-relaxed max-w-[240px]">{alt}</p>}
    </div>
  );
}

function Iskelet() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-[176px] rounded-[26px] bg-slate-200/70" />
      <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[72px] rounded-2xl bg-slate-200/70" />)}
      </div>
      <div className="h-[132px] rounded-[22px] bg-slate-200/70" />
      <div className="h-[132px] rounded-[22px] bg-slate-200/70" />
    </div>
  );
}

function bekliyorMu(d: any): boolean {
  const x = String(d ?? "").toLowerCase().trim();
  return x === "bekliyor" || x === "beklemede" || x === "taslak" || x === "";
}

function teklifDurum(d: any): { ad: string; renk: string } {
  const x = String(d ?? "").toLowerCase().trim();
  if (x === "onaylandi" || x === "onayli") return { ad: "ONAYLANDI", renk: "emerald" };
  if (x === "reddedildi" || x === "red") return { ad: "REDDEDİLDİ", renk: "rose" };
  if (bekliyorMu(d)) return { ad: "BEKLİYOR", renk: "amber" };
  return { ad: String(d).toUpperCase(), renk: "slate" };
}

function pzDurum(d: any): { ad: string; renk: string; sinif: string } {
  const x = String(d ?? "").toLowerCase();
  if (x === "kabul") return { ad: "KABUL EDİLDİ", renk: "emerald", sinif: "border-emerald-200 bg-emerald-50/60" };
  if (x === "red") return { ad: "REDDEDİLDİ", renk: "rose", sinif: "border-rose-200 bg-rose-50/60" };
  if (x === "revize") return { ad: "REVİZE EDİLDİ", renk: "indigo", sinif: "border-indigo-200 bg-indigo-50/60" };
  return { ad: "CEVAP BEKLİYOR", renk: "amber", sinif: "border-amber-200 bg-amber-50/60" };
}

export default function MusteriPortaliV4({ baslangicToken }: { baslangicToken?: string }) {
  const [token, setToken] = useState(baslangicToken || "");
  const [veri, setVeri] = useState<any>(null);
  const [teklifler, setTeklifler] = useState<any[]>([]);
  const [sohbet, setSohbet] = useState<any[]>([]);
  const [pazarliklar, setPazarliklar] = useState<any[]>([]);
  const [tKonu, setTKonu] = useState("");
  const [tAciklama, setTAciklama] = useState("");
  const [tTip, setTTip] = useState("ariza");
  const [tMakine, setTMakine] = useState("");
  const [tGonder, setTGonder] = useState(false);
  const [bakimTakvim, setBakimTakvim] = useState<any[]>([]);
  const [sozlesme, setSozlesme] = useState<any>(null);
  const [bakimTalepler, setBakimTalepler] = useState<any[]>([]);
  const [duzPlan, setDuzPlan] = useState<any | null>(null);
  const [duzYeniTarih, setDuzYeniTarih] = useState("");
  const [duzSebep, setDuzSebep] = useState("");
  const [duzGonder, setDuzGonder] = useState(false);
  const [bakimYil, setBakimYil] = useState("");
  const [sekme, setSekme] = useState<Sekme>("ozet");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [mesaj, setMesaj] = useState("");

  const [yeniMesaj, setYeniMesaj] = useState("");
  const [gonderiyor, setGonderiyor] = useState(false);

  const [makineForm, setMakineForm] = useState(false);
  const [mModel, setMModel] = useState("");
  const [mSeri, setMSeri] = useState("");
  const [mKapasite, setMKapasite] = useState("");
  const [mTip, setMTip] = useState("vinç");
  const [mKonum, setMKonum] = useState("");

  const [makineDuz, setMakineDuz] = useState<any | null>(null);
  const [pazarlikAcik, setPazarlikAcik] = useState<any | null>(null);
  const [pzTutar, setPzTutar] = useState(0);
  const [pzMesaj, setPzMesaj] = useState("");
  const [pzGonder, setPzGonder] = useState(false);
  const [servisListe, setServisListe] = useState<any[]>([]);
  const [servisDetay, setServisDetay] = useState<any | null>(null);
  const [detayYuk, setDetayYuk] = useState(false);
  const sohbetSon = useRef<HTMLDivElement | null>(null);

  const veriGetir = useCallback(async (tk: string) => {
    setYukleniyor(true);
    try {
      const [p, t, s, pz, bk, sz, bt, sv] = await Promise.all([
        supabase.rpc("musteri_portal_v6", { p_token: tk }),
        supabase.rpc("musteri_teklifleri", { p_token: tk }),
        supabase.rpc("musteri_sohbet_getir", { p_token: tk }),
        supabase.rpc("musteri_pazarliklarim", { p_token: tk }),
        supabase.rpc("musteri_bakim_takvimi", { p_token: tk, p_yil: null }),
        supabase.rpc("musteri_sozlesmem", { p_token: tk }),
        supabase.rpc("musteri_bakim_taleplerim", { p_token: tk }),
        // 🆕 fiyatsız servis listesi (SQL 203). Yoksa aşağıda v6 listesine düşer.
        supabase.rpc("musteri_servislerim", { p_token: tk }),
      ]);
      if (!(p.data as any)?.ok) {
        setMesaj((p.data as any)?.mesaj || "Oturum geçersiz");
        setToken("");
        try { localStorage.removeItem("musteri_token"); } catch { /* yoksay */ }
        return;
      }
      setVeri(p.data);
      const ayriTeklif = (t.data as any[]) || [];
      const anaTeklif = (p.data as any)?.teklifler || [];
      setTeklifler(anaTeklif.length > 0 ? anaTeklif : ayriTeklif);
      setSohbet((s.data as any[]) || []);
      setPazarliklar((pz.data as any[]) || []);
      const bkData: any = bk.data || {};
      setBakimTakvim(bkData.sozlesme_var ? (bkData.takvim || []) : []);
      setSozlesme(((sz.data as any)?.var ? sz.data : null));
      setBakimTalepler((bt.data as any[]) || []);
      // Servis listesi: yeni (fiyatsız) RPC → yoksa v6 listesi (eski davranış)
      const yeniListe = Array.isArray(sv.data) ? (sv.data as any[]) : [];
      setServisListe(yeniListe.length > 0 ? yeniListe : (((p.data as any)?.servisler || []) as any[]));
    } finally { setYukleniyor(false); }
  }, []);

  useEffect(() => { if (token) veriGetir(token); }, [token, veriGetir]);

  useEffect(() => {
    if (!token) return;
    const z = setInterval(() => veriGetir(token), 4000);
    return () => clearInterval(z);
  }, [token, veriGetir]);

  // ⚡ REALTIME — anlık mesaj
  useEffect(() => {
    if (!token) return;
    let kanal: any = null;
    try {
      kanal = supabase
        .channel("musteri-sohbet-rt")
        .on("postgres_changes" as any,
          { event: "INSERT", schema: "public", table: "musteri_sohbet" },
          async (payload: any) => {
            // ⚡ ANINDA ekle (replica gecikmesini bekle)
            try {
              const yeni = payload?.new;
              if (yeni && yeni.id) {
                setSohbet((o) => {
                  if (o.some((x: any) => x.id === yeni.id)) return o;
                  return [...o, {
                    id: yeni.id,
                    gonderen: yeni.gonderen,
                    mesaj: yeni.mesaj,
                    tarih: new Date(yeni.created_at || Date.now()).toLocaleString("tr-TR", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    }),
                  }];
                });
              }
            } catch { /* yoksay */ }
            // sonra sunucudan teyit et
            setTimeout(async () => {
              try {
                const s = await supabase.rpc("musteri_sohbet_getir", { p_token: token });
                setSohbet((s.data as any[]) || []);
              } catch { /* yoksay */ }
            }, 700);
          })
        .subscribe();
    } catch { /* yoksay */ }

    return () => {
      try { if (kanal) supabase.removeChannel(kanal); } catch { /* yoksay */ }
    };
  }, [token]);

  useEffect(() => {
    // Sadece yeni mesaj geldiğinde veya sohbet sekmesine geçildiğinde en alta in.
    // (4 sn'lik veri yenilemesi kullanıcıyı yukarı kaydırmışken aşağı çekmesin)
    const el = sohbetSon.current;
    if (!el || sekme !== "sohbet") return;
    el.scrollTop = el.scrollHeight;
  }, [sohbet.length, sekme]);

  // Bilgi mesajı 5 sn sonra kendiliğinden kapansın
  useEffect(() => {
    if (!mesaj) return;
    const z = setTimeout(() => setMesaj(""), 5000);
    return () => clearTimeout(z);
  }, [mesaj]);

  const mesajGonder = async () => {
    if (!yeniMesaj.trim() || gonderiyor) return;
    setGonderiyor(true);
    try {
      const { data } = await supabase.rpc("musteri_mesaj_gonder", { p_token: token, p_mesaj: yeniMesaj.trim() });
      if ((data as any)?.ok) {
        setYeniMesaj("");
        const s = await supabase.rpc("musteri_sohbet_getir", { p_token: token });
        setSohbet((s.data as any[]) || []);
        if (veri) await veriGetir(token);
      }
    } finally { setGonderiyor(false); }
  };

  const teklifKarar = async (kaynak: string, id: string, onay: boolean) => {
    const { data } = await supabase.rpc("musteri_teklif_onayla", {
      p_token: token, p_kaynak: kaynak, p_id: id, p_onay: onay, p_not: null,
    });
    if ((data as any)?.ok) { setMesaj("✅ " + (data as any).mesaj); await veriGetir(token); }
    else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
  };

  const makineEkle = async () => {
    if (!mModel.trim()) { setMesaj("⚠️ Model zorunludur."); return; }
    setYukleniyor(true); setMesaj("");
    try {
      const { data } = await supabase.rpc("musteri_vinc_ekle", {
        p_token: token, p_model: mModel.trim(), p_seri_no: mSeri.trim() || null,
        p_kapasite: mKapasite.trim() || null, p_tip: mTip, p_konum: mKonum.trim() || null,
      });
      if ((data as any)?.ok) {
        setMesaj("✅ " + (data as any).mesaj);
        setMakineForm(false); setMModel(""); setMSeri(""); setMKapasite(""); setMKonum("");
        await veriGetir(token);
      } else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
    } finally { setYukleniyor(false); }
  };

  const duzenleAc = (v: any) => {
    setMakineDuz(v);
    setMModel(v.model || ""); setMSeri(v.seri_no && v.seri_no !== "—" ? v.seri_no : "");
    setMKapasite(v.kapasite && v.kapasite !== "—" ? v.kapasite : "");
    setMTip(v.makine_tipi || "vinç"); setMKonum(v.konum && v.konum !== "—" ? v.konum : "");
    setMakineForm(true);
  };

  const duzenleKaydet = async () => {
    if (!makineDuz) return;
    setYukleniyor(true); setMesaj("");
    try {
      const { data } = await supabase.rpc("musteri_vinc_guncelle", {
        p_token: token, p_id: makineDuz.id, p_model: mModel.trim(),
        p_seri_no: mSeri.trim() || null, p_kapasite: mKapasite.trim() || null,
        p_tip: mTip, p_konum: mKonum.trim() || null,
      });
      if ((data as any)?.ok) {
        setMesaj("✅ " + (data as any).mesaj);
        setMakineDuz(null); setMakineForm(false);
        setMModel(""); setMSeri(""); setMKapasite(""); setMKonum("");
        await veriGetir(token);
      } else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
    } finally { setYukleniyor(false); }
  };

  const pazarlikGonder = async () => {
    if (!pazarlikAcik) return;
    if (!pzTutar || pzTutar <= 0) { setMesaj("⚠️ Tutar girin."); return; }
    setPzGonder(true); setMesaj("");
    try {
      const { data } = await supabase.rpc("musteri_pazarlik_gonder", {
        p_token: token, p_kaynak: pazarlikAcik.kaynak, p_kayit_id: pazarlikAcik.id,
        p_teklif_tutar: Number(pazarlikAcik.tutar) || 0,
        p_istenen_tutar: pzTutar, p_mesaj: pzMesaj.trim() || null, p_kalemler: null,
      });
      if ((data as any)?.ok) {
        setMesaj("✅ " + (data as any).mesaj);
        setPazarlikAcik(null); setPzTutar(0); setPzMesaj("");
        await veriGetir(token);
      } else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
    } finally { setPzGonder(false); }
  };

  const talepGonder = async () => {
    if (!tKonu.trim()) { setMesaj("⚠️ Konu zorunludur."); return; }
    setTGonder(true); setMesaj("");
    try {
      const tamAciklama = (tMakine ? "[MAKİNE: " + tMakine + "]\n" : "") + tAciklama.trim();
      const { data } = await supabase.rpc("musteri_talep_ac", {
        p_token: token, p_konu: tKonu.trim(),
        p_aciklama: tamAciklama || tKonu.trim(), p_tip: tTip,
      });
      if ((data as any)?.ok) {
        setMesaj("✅ " + (data as any).mesaj);
        setTKonu(""); setTAciklama(""); setTMakine("");
        await veriGetir(token);
        setSekme("servis");
      } else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
    } finally { setTGonder(false); }
  };

  const tarihTalepGonder = async () => {
    if (!duzPlan) return;
    if (!duzYeniTarih) { setMesaj("⚠️ Yeni tarih seçin."); return; }
    setDuzGonder(true); setMesaj("");
    try {
      const { data } = await supabase.rpc("musteri_bakim_tarih_talebi", {
        p_token: token, p_plan_id: duzPlan.id,
        p_yeni_tarih: duzYeniTarih, p_sebep: duzSebep.trim() || null,
      });
      if ((data as any)?.ok) {
        setMesaj("✅ " + ((data as any).mesaj || "Talebiniz alındı."));
        setDuzPlan(null); setDuzSebep("");
        await veriGetir(token);
      } else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
    } finally { setDuzGonder(false); }
  };

  const pazarlikKarar = async (pid: string, onay: boolean) => {
    const { data } = await supabase.rpc("musteri_pazarlik_karar", {
      p_token: token, p_pazarlik_id: pid, p_onay: onay, p_not: null,
    });
    if ((data as any)?.ok) { setMesaj("✅ " + (data as any).mesaj); await veriGetir(token); }
    else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
  };

  const teklifPdf = async (kaynak: string, id: string, no: string) => {
    try {
      setMesaj("⏳ PDF hazırlanıyor...");
      const { data } = await supabase.rpc("musteri_teklif_detay", {
        p_token: token, p_kaynak: kaynak, p_id: id,
      });
      if (!(data as any)?.ok) { setMesaj("❌ " + ((data as any)?.mesaj || "Teklif yüklenemedi")); return; }

      let html = "";
      if (kaynak === "offer") {
        const t = (data as any).teklif;
        html = teklifHtml({ ...t, kalemler: t.kalemler || [] }, t.kalemler || []);
      } else if (kaynak === "satis") {
        const s = (data as any).satis;
        html = satisHtml({ ...s, kalemler: (data as any).kalemler || [] });
      } else {
        setMesaj("⚠️ Bu teklif türü için PDF henüz yok.");
        return;
      }

      await yazdirVeyaPaylas(html, { baslik: "Teklif " + (no || ""), dosyaAdi: "teklif-" + (no || "buv") });
      setMesaj("");
    } catch (e: any) {
      setMesaj("❌ " + (e?.message || "PDF hatası"));
    }
  };

  const makineSil = async (id: string) => {
    if (!confirm("Bu makineyi silmek istiyor musunuz?")) return;
    const { data } = await supabase.rpc("musteri_vinc_sil", { p_token: token, p_id: id });
    if ((data as any)?.ok) { setMesaj("✅ Silindi"); await veriGetir(token); }
    else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
  };

  // 📄 Sözleşme PDF — admin panelindeki ile AYNI şablon (lib/sozlesmeHtml)
  const sozlesmePdf = async () => {
    if (!sozlesme) return;
    try {
      setMesaj("⏳ Sözleşme hazırlanıyor...");
      const iso = (v: any) => {
        const s = String(v || "");
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        const p = s.split(".");
        return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : s;
      };
      const html = sozlesmeHtml({
        id: sozlesme.id,
        company_name: sozlesme.firma,
        hitap_adi: sozlesme.hitap,
        machine_count: sozlesme.makine_sayisi,
        price_per_machine: sozlesme.makine_fiyat,
        service_price: sozlesme.servis_fiyat,
        maintenance_period_months: sozlesme.periyot,
        machine_type: sozlesme.makine_tipi,
        start_date: iso(sozlesme.baslangic_iso || sozlesme.baslangic),
        end_date: iso(sozlesme.bitis_iso || sozlesme.bitis),
      });
      await yazdirVeyaPaylas(html, {
        baslik: "Bakım Sözleşmesi - " + (sozlesme.firma || ""),
        dosyaAdi: "sozlesme-" + String(sozlesme.firma || "buvisan").replace(/\s+/g, "-").toLowerCase(),
        cokSayfali: true,
      });
      setMesaj("");
    } catch (e: any) {
      setMesaj("❌ " + (e?.message || "PDF hatası"));
    }
  };

  // 🔍 Servis formu detayı — satıra tıklayınca (fiyat sadece burada görünür)
  const detayAc = async (row: any) => {
    setServisDetay(row);
    if (!row?.id || !row?.kaynak) return; // eski listede detay satırın kendisinde
    setDetayYuk(true);
    try {
      const { data, error } = await supabase.rpc("musteri_servis_detay", {
        p_token: token, p_kaynak: row.kaynak, p_id: row.id,
      });
      if (!error && (data as any)?.ok) {
        // kullanıcı bu sırada pencereyi kapattıysa / başka forma geçtiyse karışma
        setServisDetay((onceki: any) => (onceki && onceki.id === row.id ? { ...row, ...(data as any) } : onceki));
      } else if ((data as any)?.mesaj) setMesaj("❌ " + (data as any).mesaj);
    } catch { /* yoksay */ }
    finally { setDetayYuk(false); }
  };

  const cikis = () => {
    try { localStorage.removeItem("musteri_token"); } catch { /* yoksay */ }
    setToken(""); setVeri(null);
    window.location.reload();
  };

  // ─── Türetilmiş veriler ───
  const vincler = veri?.vincler || [];
  const kendi = veri?.kendi_makineler || [];
  const biletMak = veri?.bilet_makineleri || [];
  const servisler = veri?.servisler || [];
  const aktif = veri?.aktif_isler || [];
  const bakim = veri?.bakim_takvimi || [];
  const okunmamis = Number(veri?.okunmamis_mesaj || 0);

  const makineToplam = vincler.length + kendi.length;
  const bekleyenTeklif = teklifler.filter((t) => t.durum === "bekliyor" || t.durum === "BEKLIYOR").length;
  const bekleyenPazarlik = pazarliklar.filter((p) => ["bekliyor", "revize"].includes(String(p.durum || "").toLowerCase())).length;
  const toplamTutar = servisler.reduce((t: number, s: any) => t + (Number(s.tutar) || 0), 0);
  const buYil = new Date().getFullYear().toString();
  const yilToplam = servisler
    .filter((s: any) => String(s.tarih || "").endsWith(buYil))
    .reduce((t: number, s: any) => t + (Number(s.tutar) || 0), 0);
  const sonIslemler = servisler.filter((s: any) => Number(s.tutar) > 0).slice(0, 4);

  const siradakiPlan = bakimTakvim
    .filter((b: any) => b.durum !== "yapildi" && Number(b.gun_kaldi) >= 0)
    .sort((a: any, b: any) => Number(a.gun_kaldi) - Number(b.gun_kaldi))[0];
  const siradakiMakine = bakim
    .filter((b: any) => Number(b.gun_kaldi) >= 0)
    .sort((a: any, b: any) => Number(a.gun_kaldi) - Number(b.gun_kaldi))[0];
  const yaklasanBakim = siradakiPlan || siradakiMakine || null;
  const yaklasanMetin = !yaklasanBakim
    ? (sozlesme ? "Bakım planınız aktif" : "Bakım sözleşmeniz bulunmuyor")
    : Number(yaklasanBakim.gun_kaldi) === 0
      ? "Bugün planlı bakımınız var"
      : (yaklasanBakim.sira
        ? `${yaklasanBakim.sira}. bakım · ${yaklasanBakim.gun_kaldi} gün sonra`
        : `${yaklasanBakim.model} · ${yaklasanBakim.gun_kaldi} gün sonra`);

  const bakimYillar = Array.from(new Set(
    bakimTakvim
      .map((b: any) => String(b.tarih_iso || "").slice(0, 4))
      .filter((y) => /^\d{4}$/.test(y))
  )).sort();
  const varsayilanYil = String(
    (siradakiPlan?.tarih_iso || bakimTakvim[0]?.tarih_iso || new Date().toISOString()).slice(0, 4)
  );
  const secilenYil = bakimYil || varsayilanYil;

  const yilPlanlariHam = bakimTakvim.filter((b: any) => String(b.tarih_iso || "").slice(0, 4) === secilenYil);
  const yilPlanlari = yilPlanlariHam.length > 0 ? yilPlanlariHam : bakimTakvim;

  const ayDurumu = (ay: number): "plan" | "bitti" | "gec" | null => {
    const items = bakimTakvim.filter((b: any) =>
      String(b.tarih_iso || "").slice(0, 4) === secilenYil &&
      Number(String(b.tarih_iso || "").slice(5, 7)) === ay
    );
    if (items.length === 0) return null;
    if (items.every((b: any) => b.durum === "yapildi")) return "bitti";
    if (items.some((b: any) => b.durum !== "yapildi" && Number(b.gun_kaldi) < 0)) return "gec";
    return "plan";
  };

  const bugunIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const mesajTon = mesaj.startsWith("✅") ? "ok" : mesaj.startsWith("⏳") ? "bilgi" : "hata";

  const sekmeler: { k: Sekme; ad: string; ikon: any; badge: number }[] = [
    { k: "ozet", ad: "ÖZET", ikon: Activity, badge: 0 },
    { k: "makine", ad: "MAKİNE", ikon: Package, badge: 0 },
    { k: "servis", ad: "SERVİS", ikon: Wrench, badge: 0 },
    { k: "teklif", ad: "TEKLİF", ikon: Star, badge: bekleyenTeklif },
    { k: "sohbet", ad: "SOHBET", ikon: MessageSquare, badge: okunmamis },
    { k: "bakim", ad: "BAKIM", ikon: Calendar, badge: bakimTakvim.filter((b: any) => b.durum === "planlandi" && b.gun_kaldi >= 0 && b.gun_kaldi <= 30).length },
    { k: "talep", ad: "TALEP", ikon: Plus, badge: 0 },
  ];

  const hizli: { k: Sekme; ad: string; ikon: any; sinif: string }[] = [
    { k: "talep", ad: "Talep Aç", ikon: AlertCircle, sinif: "bg-rose-50 text-rose-600" },
    { k: "sohbet", ad: "Sohbet", ikon: MessageSquare, sinif: "bg-violet-50 text-violet-600" },
    { k: "teklif", ad: "Teklifler", ikon: Star, sinif: "bg-amber-50 text-amber-600" },
    { k: "bakim", ad: "Bakım", ikon: Calendar, sinif: "bg-teal-50 text-teal-600" },
  ];

  return (
    <div className="min-h-screen bg-[#f4f6fa]" style={{ fontFamily: FONT }}>

      {/* ══════════════════ ÜST BAR ══════════════════ */}
      <header className="sticky top-0 z-40 bg-[#0b1220]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-2xl mx-auto px-3.5 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 grid place-items-center font-black text-slate-900 text-lg shrink-0 shadow-lg shadow-amber-500/25">
              {(veri?.firma || "B").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[8px] font-black tracking-[0.22em] text-slate-500 leading-none">BUVİSAN · MÜŞTERİ</p>
              <p className="text-white font-black text-[13px] leading-tight truncate mt-1">{veri?.firma || "Firma"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 bg-emerald-400/10 border border-emerald-400/25 pl-1.5 pr-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[8px] font-black tracking-wider text-emerald-300">CANLI</span>
            </span>
            <button onClick={() => token && veriGetir(token)} aria-label="Yenile"
              className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 text-white grid place-items-center active:scale-95 transition kucuk">
              <RefreshCw size={14} className={yukleniyor ? "animate-spin" : ""} />
            </button>
            <button onClick={cikis} aria-label="Çıkış"
              className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 text-white grid place-items-center active:scale-95 transition hover:bg-rose-500/80 kucuk">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* ══════════════════ SEKMELER ══════════════════ */}
      <div className="sticky z-30 bg-white/85 backdrop-blur-xl border-b border-slate-200/80"
        style={{ top: "calc(4rem + env(safe-area-inset-top))" }}>
        <div className="max-w-2xl mx-auto px-2.5">
          <div className="overflow-x-auto" style={{ scrollbarWidth: "none" } as CSSProperties}>
            <div className="flex gap-1 py-2 w-max min-w-full">
              {sekmeler.map((s) => {
                const Ikon = s.ikon;
                const sec = sekme === s.k;
                return (
                  <button key={s.k} onClick={() => setSekme(s.k)}
                    className={"relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black whitespace-nowrap transition " +
                      (sec
                        ? "bg-[#0b1220] text-white shadow-lg shadow-slate-900/20"
                        : "text-slate-500 hover:bg-slate-100")}>
                    <Ikon size={12} />
                    {s.ad}
                    {s.badge > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-rose-500 text-white text-[8px] font-black grid place-items-center">
                        {s.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════ İÇERİK ══════════════════ */}
      <main className="max-w-2xl mx-auto px-3 pt-3 pb-6">

        {yukleniyor && !veri ? (
          <Iskelet />
        ) : !veri ? (
          <Kart>
            <Bos ikon={ShieldCheck} baslik="Oturum doğrulanamadı"
              alt="Güvenliğiniz için lütfen yeniden giriş yapın." ton="rose" />
            <div className="px-4 pb-4">
              <button onClick={cikis}
                className="w-full py-3 rounded-xl bg-[#0b1220] text-white text-[11px] font-black active:scale-[0.99] transition">
                GİRİŞ EKRANINA DÖN
              </button>
            </div>
          </Kart>
        ) : (
          <motion.div key={sekme} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }} className="space-y-3">

            {/* ────────────────────────── ÖZET ────────────────────────── */}
            {sekme === "ozet" && (
              <>
                <PushAbonelik kullanici={veri?.firma} rol="musteri" />

                {/* HERO */}
                <div className="relative overflow-hidden rounded-[26px] bg-[#0b1220] p-4 text-white shadow-[0_22px_50px_-30px_rgba(2,6,23,0.95)]">
                  <div className="pointer-events-none absolute -right-14 -top-16 w-48 h-48 rounded-full bg-teal-500/25 blur-3xl" />
                  <div className="pointer-events-none absolute -left-12 -bottom-16 w-44 h-44 rounded-full bg-indigo-500/25 blur-3xl" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[8px] font-black tracking-[0.22em] text-slate-400">MAKİNE PARKINIZ</p>
                        <div className="flex items-end gap-1.5 mt-1">
                          <span className="text-[38px] leading-none font-black tracking-tight">{makineToplam}</span>
                          <span className="text-[10px] font-bold text-slate-400 mb-1.5">adet</span>
                        </div>
                        <p className="text-[10px] font-semibold text-slate-300 mt-2 truncate">{yaklasanMetin}</p>
                      </div>
                      <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/10 grid place-items-center shrink-0">
                        <Package size={19} className="text-teal-300" />
                      </div>
                    </div>

                    <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2 mt-4">
                      {[
                        { a: "SERVİS", d: servisler.length },
                        { a: "AÇIK İŞ", d: aktif.length },
                        { a: "BEKLEYEN", d: bekleyenTeklif + bekleyenPazarlik },
                      ].map((k) => (
                        <div key={k.a} className="rounded-2xl bg-white/5 border border-white/10 px-2.5 py-2">
                          <p className="text-[7px] font-black tracking-[0.16em] text-slate-400">{k.a}</p>
                          <p className="text-base font-black leading-tight mt-0.5">{k.d}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* HIZLI İŞLEMLER */}
                <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2">
                  {hizli.map((h) => {
                    const I = h.ikon;
                    return (
                      <button key={h.k} onClick={() => setSekme(h.k)}
                        className="bg-white rounded-2xl border border-slate-200/80 py-2.5 flex flex-col items-center gap-1.5 active:scale-95 transition shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                        <span className={"w-8 h-8 rounded-xl grid place-items-center " + h.sinif}><I size={15} /></span>
                        <span className="text-[9px] font-black text-slate-600">{h.ad}</span>
                      </button>
                    );
                  })}
                </div>

                {/* AKTİF SERVİSLER */}
                <Kart>
                  <Bolum ikon={Activity} renk="indigo" baslik="AKTİF SERVİSLERİM" sayi={aktif.length} />
                  {aktif.length === 0 ? (
                    <Bos ikon={Wrench} baslik="Şu an açık iş yok"
                      alt="Tüm servis talepleriniz tamamlanmış görünüyor." ton="indigo" />
                  ) : (
                    <div className="px-3.5 pb-3.5 space-y-2">
                      {aktif.map((a: any) => (
                        <div key={a.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[12px] font-black text-slate-900 truncate">{a.firma}</p>
                            <Cip renk="indigo">{String(a.durum || "bekliyor").toUpperCase()}</Cip>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed line-clamp-2">{a.aciklama}</p>
                          <p className="text-[9px] font-bold text-slate-400 mt-1.5 flex items-center gap-1">
                            <Clock size={10} /> {a.tarih}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </Kart>

                {/* YAKLAŞAN BAKIMLAR */}
                {bakim.length > 0 && (
                  <Kart>
                    <Bolum ikon={Calendar} renk="amber" baslik="YAKLAŞAN BAKIMLAR" sayi={bakim.length}
                      sag={
                        <button onClick={() => setSekme("bakim")}
                          className="text-[9px] font-black text-slate-400 flex items-center gap-0.5 active:scale-95 transition kucuk">
                          Tümü <ChevronRight size={11} />
                        </button>
                      } />
                    <div className="px-3.5 pb-3.5 space-y-2">
                      {bakim.slice(0, 4).map((b: any, i: number) => {
                        const k = Number(b.gun_kaldi || 0);
                        const ton = k <= 0 ? "rose" : k <= 30 ? "amber" : "emerald";
                        return (
                          <div key={i} className={"rounded-2xl border p-2.5 " +
                            (ton === "rose" ? "bg-rose-50/70 border-rose-200"
                              : ton === "amber" ? "bg-amber-50/70 border-amber-200"
                                : "bg-emerald-50/60 border-emerald-200")}>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-black text-slate-800 truncate">{b.model}</p>
                              <Cip renk={ton}>{k <= 0 ? `${Math.abs(k)} gün geçti` : `${k} gün kaldı`}</Cip>
                            </div>
                            <p className="text-[9px] font-bold text-slate-500 mt-1">{b.tarih}</p>
                          </div>
                        );
                      })}
                    </div>
                  </Kart>
                )}

                {/* HESABIM */}
                <Kart>
                  <Bolum ikon={Banknote} renk="emerald" baslik="HESABIM"
                    sag={<span className="text-[9px] font-bold text-slate-400 truncate max-w-[46%]">{veri?.firma}</span>} />
                  <div className="px-3.5 pb-3.5 space-y-2">
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-[#0b1220] p-3.5 text-white">
                      <div className="pointer-events-none absolute -right-8 -top-10 w-28 h-28 rounded-full bg-emerald-400/25 blur-2xl" />
                      <p className="relative text-[8px] font-black tracking-[0.18em] text-slate-400">TOPLAM HİZMET TUTARI</p>
                      <p className="relative text-[26px] leading-none font-black mt-1">
                        {para(toplamTutar)} <span className="text-sm font-bold text-slate-400">₺</span>
                      </p>
                      <div className="relative flex flex-wrap gap-1.5 mt-3">
                        <span className="text-[8px] font-black px-2 py-1 rounded-lg bg-white/10 border border-white/10">
                          {servisler.length} HİZMET
                        </span>
                        {yilToplam > 0 && (
                          <span className="text-[8px] font-black px-2 py-1 rounded-lg bg-emerald-400/15 border border-emerald-400/20 text-emerald-300">
                            {buYil}: {para(yilToplam)} ₺
                          </span>
                        )}
                      </div>
                    </div>

                    {sonIslemler.length === 0 ? (
                      <p className="text-center text-[10px] font-bold text-slate-400 py-3">
                        Henüz faturalandırılmış hizmet yok.
                      </p>
                    ) : (
                      <div>
                        {sonIslemler.map((s: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
                            <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 grid place-items-center shrink-0">
                              <FileText size={11} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-bold text-slate-700 truncate">{s.aciklama}</p>
                              <p className="text-[9px] text-slate-400">{s.tarih}</p>
                            </div>
                            <p className="text-[11px] font-black text-slate-800 shrink-0">{para(s.tutar)} ₺</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Kart>

                {/* DESTEK */}
                <div className="rounded-[22px] border border-slate-200/80 bg-white p-3.5 flex items-center gap-3">
                  <span className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 grid place-items-center shrink-0">
                    <Phone size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black text-slate-800">Yardım mı lazım?</p>
                    <p className="text-[10px] font-semibold text-slate-400">Servis destek hattı · 0224 374 00 01</p>
                  </div>
                  <a href="tel:+902243740001"
                    className="px-3 py-2 rounded-xl bg-teal-600 text-white text-[10px] font-black shrink-0 active:scale-95 transition">
                    ARA
                  </a>
                </div>
              </>
            )}

            {/* ────────────────────────── MAKİNE ────────────────────────── */}
            {sekme === "makine" && (
              <>
                <div className="rounded-[22px] border border-slate-200/80 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 grid place-items-center shrink-0">
                      <Package size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-black text-slate-900">Makine Parkım</p>
                      <p className="text-[10px] font-semibold text-slate-400">
                        {vincler.length} kayıtlı · {kendi.length} kendi eklediğiniz
                      </p>
                    </div>
                    <button onClick={() => {
                      setMakineDuz(null); setMModel(""); setMSeri(""); setMKapasite(""); setMKonum("");
                      setMakineForm(o => !o);
                    }}
                      className={"px-3 py-2 rounded-xl text-[10px] font-black flex items-center gap-1 active:scale-95 transition " +
                        (makineForm ? "bg-slate-100 text-slate-600" : "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20")}>
                      {makineForm ? <><X size={12} /> İPTAL</> : <><Plus size={12} /> EKLE</>}
                    </button>
                  </div>

                  <AnimatePresence initial={false}>
                    {makineForm && (
                      <motion.div initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: "auto", marginTop: 12 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        transition={{ duration: 0.22, ease: "easeOut" }} className="overflow-hidden">
                        <div className="space-y-2 rounded-2xl bg-slate-50 border border-slate-200 p-3">
                          <input value={mModel} onChange={(e) => setMModel(e.target.value)}
                            placeholder="Model * (örn: 10 TON KÖPRÜLÜ VİNÇ)"
                            className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
                          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
                            <input value={mSeri} onChange={(e) => setMSeri(e.target.value)} placeholder="Seri No"
                              className="p-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
                            <input value={mKapasite} onChange={(e) => setMKapasite(e.target.value)} placeholder="Kapasite"
                              className="p-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
                          </div>
                          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
                            <select value={mTip} onChange={(e) => setMTip(e.target.value)}
                              className="p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-emerald-500">
                              <option value="vinç">Vinç</option>
                              <option value="asansör">Asansör</option>
                            </select>
                            <input value={mKonum} onChange={(e) => setMKonum(e.target.value)} placeholder="Konum"
                              className="p-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
                          </div>
                          <button onClick={makineDuz ? duzenleKaydet : makineEkle} disabled={yukleniyor}
                            className="w-full py-3 bg-[#0b1220] text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-2 disabled:bg-slate-300 active:scale-[0.99] transition">
                            {yukleniyor ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            {makineDuz ? "GÜNCELLE" : "KAYDET"}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <Kart>
                  <Bolum ikon={Wrench} renk="teal" baslik="SİSTEMDEKİ MAKİNELERİM" sayi={vincler.length} />
                  {vincler.length === 0 ? (
                    <Bos ikon={Package} baslik="Kayıtlı makine yok"
                      alt="Sistemde adınıza kayıtlı bir makine bulunamadı." ton="teal" />
                  ) : (
                    <div className="px-3.5 pb-3.5 space-y-2">
                      {vincler.map((v: any) => (
                        <div key={v.id} className="rounded-2xl border border-slate-200/80 bg-white p-3">
                          <div className="flex items-start gap-2.5">
                            <span className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 grid place-items-center shrink-0">
                              <Wrench size={15} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[12px] font-black text-slate-900 leading-tight">{v.model}</p>
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {v.kapasite !== "—" && <Cip>{v.kapasite}</Cip>}
                                {v.seri_no !== "—" && <Cip>S/N {v.seri_no}</Cip>}
                                {v.makine_tipi !== "—" && <Cip>{v.makine_tipi}</Cip>}
                              </div>
                              {v.adres && v.adres !== "—" && (
                                <p className="flex items-start gap-1 text-[9px] text-slate-400 mt-1.5 leading-relaxed">
                                  <MapPin size={10} className="mt-0.5 shrink-0" />
                                  <span className="line-clamp-2">{v.adres}</span>
                                </p>
                              )}
                              {v.sonraki_bakim && (
                                <p className="text-[9px] font-black text-amber-600 mt-1.5">
                                  Sonraki bakım · {String(v.sonraki_bakim).slice(0, 10)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Kart>

                {kendi.length > 0 && (
                  <Kart>
                    <Bolum ikon={Plus} renk="indigo" baslik="EKLEDİĞİM MAKİNELER" sayi={kendi.length} />
                    <div className="px-3.5 pb-3.5 space-y-2">
                      {kendi.map((v: any) => (
                        <div key={v.id} className="rounded-2xl border border-slate-200/80 bg-white p-3">
                          <div className="flex items-start gap-2.5">
                            <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 grid place-items-center shrink-0">
                              <Wrench size={15} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-[12px] font-black text-slate-900 truncate">{v.model}</p>
                                <Cip renk="emerald">KAYITLI</Cip>
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {v.kapasite && v.kapasite !== "—" && <Cip>{v.kapasite}</Cip>}
                                {v.seri_no && v.seri_no !== "—" && <Cip>S/N {v.seri_no}</Cip>}
                                {v.konum && v.konum !== "—" && <Cip>{v.konum}</Cip>}
                              </div>
                              <p className="text-[9px] font-bold text-slate-400 mt-1.5">Eklendi · {v.tarih}</p>
                            </div>
                            <div className="flex flex-col gap-1 shrink-0">
                              <button onClick={() => duzenleAc(v)} aria-label="Düzenle"
                                className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 grid place-items-center active:scale-95 transition kucuk">
                                <Pencil size={11} />
                              </button>
                              <button onClick={() => makineSil(v.id)} aria-label="Sil"
                                className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 text-rose-500 grid place-items-center active:scale-95 transition kucuk">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Kart>
                )}

                {biletMak.length > 0 && (
                  <Kart>
                    <Bolum ikon={FileText} renk="violet" baslik="TALEPLERİMDEN MAKİNELER" sayi={biletMak.length} />
                    <div className="px-3.5 pb-3.5 space-y-2">
                      {biletMak.map((v: any) => (
                        <div key={v.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3">
                          <p className="text-[12px] font-black text-slate-900">{v.model}</p>
                          <p className="text-[9px] font-bold text-slate-400 mt-1">{v.tarih}</p>
                        </div>
                      ))}
                    </div>
                  </Kart>
                )}
              </>
            )}

            {/* ────────────────────────── SERVİS ────────────────────────── */}
            {sekme === "servis" && (
              <Kart>
                <Bolum ikon={Wrench} renk="indigo" baslik="SERVİS GEÇMİŞİM" sayi={servisListe.length}
                  sag={<span className="text-[9px] font-bold text-slate-400">forma tıkla → detay</span>} />
                {servisListe.length === 0 ? (
                  <Bos ikon={FileText} baslik="Servis kaydı yok"
                    alt="Tamamlanan servisleriniz burada listelenir." ton="indigo" />
                ) : (
                  <div className="px-3.5 pb-3.5">
                    <div className="relative">
                      <div className="absolute left-[7px] top-3 bottom-4 w-px bg-slate-200" />
                      <div className="space-y-2.5">
                        {servisListe.map((s: any, i: number) => {
                          const bakimMi = String(s.tur || "").toLowerCase().includes("bakım");
                          const malzemeVar = !!s.malzeme_var || !!s.malzeme;
                          return (
                            <div key={s.id || i} className="relative pl-6">
                              <span className={"absolute left-0 top-4 w-[15px] h-[15px] rounded-full border-[3px] bg-white " +
                                (bakimMi ? "border-teal-500" : "border-indigo-500")} />
                              <button onClick={() => detayAc(s)}
                                className="w-full text-left rounded-2xl border border-slate-200/80 bg-white p-3 transition active:scale-[0.99] hover:border-indigo-300 hover:shadow-[0_6px_20px_-14px_rgba(15,23,42,0.4)]">
                                <div className="flex items-start gap-2.5">
                                  <span className={"w-8 h-8 rounded-xl grid place-items-center shrink-0 " +
                                    (bakimMi ? "bg-teal-50 text-teal-600" : "bg-indigo-50 text-indigo-600")}>
                                    {bakimMi ? <Calendar size={14} /> : <Wrench size={14} />}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[9px] font-black tracking-wide text-slate-400">
                                      {s.tarih} · {String(s.tur || "Servis").toUpperCase()}
                                    </p>
                                    <p className="text-[11px] font-bold text-slate-700 mt-1 leading-relaxed line-clamp-2">
                                      {s.aciklama}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                      {s.form_no && <Cip><FileText size={8} /> {s.form_no}</Cip>}
                                      {s.personel && s.personel !== "—" && <Cip>{s.personel}</Cip>}
                                      {malzemeVar && <Cip renk="amber"><Package size={8} /> Malzeme</Cip>}
                                    </div>
                                  </div>
                                  <ChevronRight size={15} className="text-slate-300 shrink-0 mt-1" />
                                </div>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </Kart>
            )}

            {/* ────────────────────────── TEKLİF ────────────────────────── */}
            {sekme === "teklif" && (
              <>
                {pazarliklar.length > 0 && (
                  <Kart>
                    <Bolum ikon={MessageSquare} renk="amber" baslik="PAZARLIKLARIM" sayi={pazarliklar.length} />
                    <div className="px-3.5 pb-3.5 space-y-2">
                      {pazarliklar.map((p: any) => {
                        const d = pzDurum(p.durum);
                        return (
                          <div key={p.id} className={"rounded-2xl border p-3 " + d.sinif}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[9px] font-black text-slate-500">{p.tarih}</span>
                              <Cip renk={d.renk}>{d.ad}</Cip>
                            </div>
                            <div className="flex items-end gap-2 mt-2">
                              <div className="min-w-0">
                                <p className="text-[8px] font-black tracking-wide text-slate-400">TEKLİF</p>
                                <p className="text-[13px] font-black text-slate-700">{para(p.teklif_tutar)} ₺</p>
                              </div>
                              <span className="text-slate-400 text-[11px] pb-0.5">→</span>
                              <div className="min-w-0">
                                <p className="text-[8px] font-black tracking-wide text-slate-400">TEKLİFİNİZ</p>
                                <p className="text-[13px] font-black text-slate-900">{para(p.istenen_tutar)} ₺</p>
                              </div>
                              <div className="ml-auto text-right">
                                <p className="text-[8px] font-black tracking-wide text-slate-400">FARK</p>
                                <p className="text-[13px] font-black text-rose-600">−{para(p.fark)} ₺</p>
                              </div>
                            </div>
                            {p.mesaj && (
                              <p className="text-[10px] text-slate-500 mt-2 italic leading-relaxed">“{p.mesaj}”</p>
                            )}
                            {p.admin_notu && (
                              <div className="mt-2 rounded-xl bg-white/80 border border-slate-200 px-2.5 py-2">
                                <p className="text-[8px] font-black tracking-wide text-slate-400">BUVİSAN CEVABI</p>
                                <p className="text-[10px] font-bold text-slate-700 mt-0.5">{p.admin_notu}</p>
                              </div>
                            )}
                            {(String(p.durum || "").toLowerCase() === "revize" || String(p.durum || "").toLowerCase() === "bekliyor") && (
                              <div className="flex gap-1.5 mt-2.5">
                                <button onClick={() => pazarlikKarar(p.id, false)}
                                  className="flex-1 py-2.5 rounded-xl bg-white border border-rose-200 text-rose-600 text-[10px] font-black flex items-center justify-center gap-1 active:scale-95 transition">
                                  <XCircle size={12} /> REDDET
                                </button>
                                <button onClick={() => pazarlikKarar(p.id, true)}
                                  className="flex-[2] py-2.5 rounded-xl bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center gap-1 active:scale-95 transition">
                                  <CheckCircle2 size={12} /> BU FİYATI KABUL ET
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Kart>
                )}

                <Kart>
                  <Bolum ikon={Star} renk="amber" baslik="TEKLİFLERİM" sayi={teklifler.length} />
                  {teklifler.length === 0 ? (
                    <Bos ikon={Star} baslik="Henüz teklif yok"
                      alt="Talebiniz üzerine hazırlanan teklifler burada görünür." ton="amber" />
                  ) : (
                    <div className="px-3.5 pb-3.5 space-y-2">
                      {teklifler.map((t: any, i: number) => {
                        const d = teklifDurum(t.durum);
                        const bekliyor = bekliyorMu(t.durum);
                        return (
                          <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-[12px] font-black text-slate-900">{t.baslik}</p>
                                  <Cip renk={d.renk}>{d.ad}</Cip>
                                </div>
                                <p className="text-[9px] font-bold text-slate-400 mt-1">#{t.no} · {t.tarih}</p>
                                {t.aciklama && (
                                  <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed line-clamp-2">{t.aciklama}</p>
                                )}
                              </div>
                              {Number(t.tutar) > 0 && (
                                <div className="text-right shrink-0">
                                  <p className="text-[8px] font-black tracking-wide text-slate-400">TUTAR</p>
                                  <p className="text-[14px] font-black text-slate-900">
                                    {para(t.tutar)} <span className="text-[10px] text-slate-400">₺</span>
                                  </p>
                                </div>
                              )}
                            </div>

                            <button onClick={() => teklifPdf(t.kaynak, t.id, t.no)}
                              className="w-full mt-2.5 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black flex items-center justify-center gap-1.5 active:scale-[0.99] transition">
                              <FileText size={12} /> TEKLİFİ GÖRÜNTÜLE / PDF
                            </button>

                            {bekliyor && (
                              <div className="flex gap-1.5 mt-2">
                                <button onClick={() => teklifKarar(t.kaynak, t.id, false)}
                                  className="flex-1 py-2.5 rounded-xl bg-white border border-rose-200 text-rose-600 text-[10px] font-black flex items-center justify-center gap-1 active:scale-95 transition">
                                  <XCircle size={12} /> REDDET
                                </button>
                                <button onClick={() => {
                                  setPazarlikAcik(t);
                                  setPzTutar(Math.round(Number(t.tutar) * 0.9));
                                  setPzMesaj("");
                                }}
                                  className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-[10px] font-black flex items-center justify-center gap-1 active:scale-95 transition">
                                  <MessageSquare size={12} /> PAZARLIK
                                </button>
                                <button onClick={() => teklifKarar(t.kaynak, t.id, true)}
                                  className="flex-[1.3] py-2.5 rounded-xl bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center gap-1 active:scale-95 transition">
                                  <CheckCircle2 size={12} /> ONAYLA
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Kart>
              </>
            )}

            {/* ────────────────────────── BAKIM ────────────────────────── */}
            {sekme === "bakim" && (
              <>
                {sozlesme ? (
                  <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-teal-900 via-[#0b1220] to-[#0b1220] p-4 text-white shadow-[0_22px_50px_-32px_rgba(2,6,23,0.95)]">
                    <div className="pointer-events-none absolute -right-12 -top-14 w-40 h-40 rounded-full bg-teal-400/25 blur-3xl" />
                    <div className="relative">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 grid place-items-center shrink-0">
                            <FileText size={16} className="text-teal-300" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[8px] font-black tracking-[0.2em] text-teal-300">BAKIM SÖZLEŞMEM</p>
                            <p className="text-[11px] font-black leading-tight truncate mt-0.5">
                              Yılda {sozlesme.yilda} bakım · {sozlesme.periyot} ayda 1
                            </p>
                          </div>
                        </div>
                        <span className={"shrink-0 text-[8px] font-black px-2 py-1 rounded-lg border " +
                          (Number(sozlesme.gun_kaldi) <= 30
                            ? "bg-rose-500/15 border-rose-400/30 text-rose-300"
                            : "bg-emerald-400/15 border-emerald-400/30 text-emerald-300")}>
                          {Number(sozlesme.gun_kaldi) > 0 ? `${sozlesme.gun_kaldi} gün kaldı` : "süresi doldu"}
                        </span>
                      </div>

                      <p className="text-[24px] leading-none font-black mt-3.5">
                        {para(sozlesme.yillik_toplam)}
                        <span className="text-[11px] font-bold text-slate-400"> ₺/yıl</span>
                      </p>

                      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 mt-3.5">
                        {[
                          { a: "MAKİNE", d: `${sozlesme.makine_sayisi} ${sozlesme.makine_tipi}` },
                          { a: "BAŞLANGIÇ", d: sozlesme.baslangic },
                          { a: "BİTİŞ", d: sozlesme.bitis },
                          { a: "BAKIM HAKKI", d: `${sozlesme.visit_count || sozlesme.yilda} ziyaret` },
                        ].map((k) => (
                          <div key={k.a} className="rounded-xl bg-white/5 border border-white/10 px-2.5 py-2">
                            <p className="text-[7px] font-black tracking-[0.16em] text-slate-400">{k.a}</p>
                            <p className="text-[10px] font-black mt-0.5 truncate">{k.d}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 space-y-1.5">
                        <button onClick={sozlesmePdf}
                          className="w-full py-2.5 rounded-xl bg-yellow-400 text-slate-900 text-[10px] font-black flex items-center justify-center gap-1.5 active:scale-[0.99] transition">
                          <FileText size={12} /> SÖZLEŞME PDF'İNİ GÖRÜNTÜLE
                        </button>
                        {sozlesme.dosya_url && (
                          <a href={sozlesme.dosya_url} target="_blank" rel="noopener noreferrer"
                            className="w-full py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-[10px] font-black flex items-center justify-center gap-1.5 active:scale-[0.99] transition">
                            <FileText size={12} /> İMZALI SÖZLEŞME DOSYASI
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <Kart>
                    <Bos ikon={FileText} baslik="Aktif bakım sözleşmeniz yok"
                      alt="Periyodik bakım sözleşmesi için bize ulaşın: 0224 374 00 01" ton="teal" />
                    <div className="px-4 pb-4">
                      <a href="tel:+902243740001"
                        className="w-full py-3 rounded-xl bg-teal-600 text-white text-[11px] font-black flex items-center justify-center gap-1.5 active:scale-[0.99] transition">
                        <Phone size={13} /> BİZİ ARAYIN
                      </a>
                    </div>
                  </Kart>
                )}

                {sozlesme && bakimTakvim.length === 0 && (
                  <Kart>
                    <Bos ikon={Calendar} baslik="Bakım takvimi henüz oluşturulmamış"
                      alt="Sözleşmeniz aktif. Bakım planı oluşturulunca burada görünecek." ton="amber" />
                  </Kart>
                )}

                {bakimTakvim.length > 0 && (
                  <Kart>
                    <Bolum ikon={Calendar} renk="teal" baslik="BAKIM TAKVİMİM" sayi={bakimTakvim.length} />
                    <div className="px-3.5 pb-3.5">
                      {bakimYillar.length > 1 && (
                        <div className="flex gap-1.5 mb-2.5">
                          {bakimYillar.map((y) => (
                            <button key={y} onClick={() => setBakimYil(y)}
                              className={"px-2.5 py-1.5 rounded-lg text-[9px] font-black border transition " +
                                (y === secilenYil
                                  ? "bg-[#0b1220] text-white border-[#0b1220]"
                                  : "bg-white text-slate-500 border-slate-200")}>
                              {y}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* 12 AYLIK ŞERİT */}
                      <div className="grid grid-cols-[repeat(6,minmax(0,1fr))] gap-1.5">
                        {AY_ADLARI.map((ad, i) => {
                          const d = ayDurumu(i + 1);
                          return (
                            <div key={ad}
                              className={"rounded-xl border py-1.5 text-center " +
                                (d === "plan" ? "border-teal-200 bg-teal-50"
                                  : d === "bitti" ? "border-emerald-200 bg-emerald-50"
                                    : d === "gec" ? "border-rose-200 bg-rose-50"
                                      : "border-slate-100 bg-slate-50")}>
                              <p className={"text-[8px] font-black " + (d ? "text-slate-600" : "text-slate-300")}>{ad}</p>
                              <div className="h-1.5 mt-1 flex justify-center">
                                {d && (
                                  <span className={"w-1.5 h-1.5 rounded-full " +
                                    (d === "plan" ? "bg-teal-500" : d === "bitti" ? "bg-emerald-500" : "bg-rose-500")} />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* BAKIM LİSTESİ */}
                      <div className="space-y-1.5 mt-3">
                        {yilPlanlari.map((b: any) => {
                          const bitti = b.durum === "yapildi";
                          const gec = !bitti && Number(b.gun_kaldi) < 0;
                          const yakin = !bitti && !gec && Number(b.gun_kaldi) <= 30;
                          return (
                            <div key={b.id}
                              className={"flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 " +
                                (bitti ? "border-emerald-200 bg-emerald-50/60"
                                  : gec ? "border-rose-200 bg-rose-50/60"
                                    : yakin ? "border-amber-200 bg-amber-50/60"
                                      : "border-slate-200 bg-white")}>
                              <div className="w-8 h-8 rounded-xl grid place-items-center shrink-0 bg-white border border-slate-200">
                                {bitti ? <Check size={13} className="text-emerald-600" />
                                  : gec ? <AlertCircle size={13} className="text-rose-500" />
                                    : <Calendar size={13} className={yakin ? "text-amber-500" : "text-slate-400"} />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-black text-slate-900">{b.tarih} · {b.sira}. bakım</p>
                                <p className={"text-[9px] font-bold " +
                                  (bitti ? "text-emerald-600" : gec ? "text-rose-600" : yakin ? "text-amber-600" : "text-slate-400")}>
                                  {bitti ? "Tamamlandı"
                                    : gec ? `${Math.abs(Number(b.gun_kaldi))} gün geçti`
                                      : Number(b.gun_kaldi) === 0 ? "Bugün" : `${b.gun_kaldi} gün kaldı`}
                                </p>
                              </div>
                              {!bitti && (
                                <button onClick={() => { setDuzPlan(b); setDuzYeniTarih(b.tarih_iso || ""); setDuzSebep(""); }}
                                  className="px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-600 text-[9px] font-black shrink-0 active:scale-95 transition kucuk">
                                  TARİH
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </Kart>
                )}

                {bakimTalepler.length > 0 && (
                  <Kart>
                    <Bolum ikon={Send} renk="violet" baslik="TARİH DEĞİŞİKLİK TALEPLERİM" sayi={bakimTalepler.length} />
                    <div className="px-3.5 pb-3.5 space-y-1.5">
                      {bakimTalepler.map((t: any) => {
                        const dn = String(t.durum || "").toLowerCase();
                        return (
                          <div key={t.id}
                            className={"rounded-2xl border px-3 py-2.5 " +
                              (dn === "onaylandi" ? "bg-emerald-50/60 border-emerald-200"
                                : dn === "reddedildi" ? "bg-rose-50/60 border-rose-200"
                                  : "bg-amber-50/60 border-amber-200")}>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[10px] font-black text-slate-700">{t.eski} → {t.yeni}</p>
                              <Cip renk={dn === "onaylandi" ? "emerald" : dn === "reddedildi" ? "rose" : "amber"}>
                                {dn === "onaylandi" ? "ONAYLANDI" : dn === "reddedildi" ? "RED" : "BEKLİYOR"}
                              </Cip>
                            </div>
                            {t.sebep && <p className="text-[9px] text-slate-500 mt-1">{t.sebep}</p>}
                            {t.admin_notu && (
                              <p className="text-[9px] font-bold text-slate-600 mt-1">BUVİSAN: {t.admin_notu}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Kart>
                )}
              </>
            )}

            {/* ────────────────────────── TALEP ────────────────────────── */}
            {sekme === "talep" && (
              <Kart>
                <div className="p-4 pb-0">
                  <div className="flex items-center gap-3">
                    <span className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 grid place-items-center shrink-0">
                      <AlertCircle size={19} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-black text-slate-900">Arıza / Servis Talebi</p>
                      <p className="text-[10px] font-semibold text-slate-400">Talebiniz anında ekibimize düşer</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-3.5">
                  <div>
                    <label className="text-[8px] font-black tracking-[0.16em] text-slate-400">TALEP TÜRÜ</label>
                    <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2 mt-1.5">
                      {([
                        { k: "ariza", ad: "Arıza", ikon: AlertCircle },
                        { k: "bakim", ad: "Bakım", ikon: Wrench },
                        { k: "kesif", ad: "Keşif", ikon: Sparkles },
                      ] as const).map((x) => {
                        const I = x.ikon;
                        const sec = tTip === x.k;
                        return (
                          <button key={x.k} onClick={() => setTTip(x.k)}
                            className={"py-2.5 rounded-xl border text-[10px] font-black flex flex-col items-center gap-1 transition " +
                              (sec
                                ? "bg-[#0b1220] text-white border-[#0b1220] shadow-lg shadow-slate-900/15"
                                : "bg-white text-slate-500 border-slate-200")}>
                            <I size={14} /> {x.ad}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {(vincler.length + kendi.length) > 0 && (
                    <div>
                      <label className="text-[8px] font-black tracking-[0.16em] text-slate-400">MAKİNE (OPSİYONEL)</label>
                      <select value={tMakine} onChange={(e) => setTMakine(e.target.value)}
                        className="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100">
                        <option value="">Makine seçin...</option>
                        {[...vincler, ...kendi].map((v: any, i: number) => (
                          <option key={i} value={v.model}>{v.model}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="text-[8px] font-black tracking-[0.16em] text-slate-400">KONU *</label>
                    <input value={tKonu} onChange={(e) => setTKonu(e.target.value)}
                      placeholder="Örn: Vinçten ses geliyor"
                      className="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100" />
                  </div>

                  <div>
                    <label className="text-[8px] font-black tracking-[0.16em] text-slate-400">AÇIKLAMA</label>
                    <textarea rows={4} value={tAciklama} onChange={(e) => setTAciklama(e.target.value)}
                      placeholder="Ne olduğunu detaylı yazın..."
                      className="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs resize-none outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100" />
                  </div>

                  <button onClick={talepGonder} disabled={tGonder}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 text-white text-[11px] font-black flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 disabled:opacity-50 active:scale-[0.99] transition">
                    {tGonder ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {tGonder ? "GÖNDERİLİYOR..." : "TALEBİ GÖNDER"}
                  </button>

                  <p className="text-center text-[9px] font-bold text-slate-400">
                    Acil durumlar için: 0224 374 00 01
                  </p>
                </div>
              </Kart>
            )}

            {/* ────────────────────────── SOHBET ────────────────────────── */}
            {sekme === "sohbet" && (
              <div className="bg-white rounded-[22px] border border-slate-200/80 overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_34px_-26px_rgba(15,23,42,0.35)]"
                style={{ height: "calc(100dvh - 13.5rem)", minHeight: 360 }}>
                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 shrink-0">
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 grid place-items-center text-slate-900 font-black text-[11px]">
                      B
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black text-slate-900 leading-tight">BUVİSAN Destek</p>
                    <p className="text-[9px] font-bold text-emerald-600">Çevrimiçi · genellikle 15 dk içinde</p>
                  </div>
                  <Cip renk="violet">{sohbet.length} mesaj</Cip>
                </div>

                <div ref={sohbetSon} className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5 bg-slate-50/60">
                  {sohbet.length === 0 ? (
                    <Bos ikon={MessageSquare} baslik="Henüz mesaj yok"
                      alt="Aşağıdan yazın, ekibimiz en kısa sürede dönsün." ton="violet" />
                  ) : sohbet.map((m: any) => {
                    const benim = m.gonderen === "musteri";
                    return (
                      <div key={m.id} className={"flex items-end gap-2 " + (benim ? "justify-end" : "justify-start")}>
                        {!benim && (
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-300 to-amber-500 grid place-items-center text-[8px] font-black text-slate-900 shrink-0">
                            B
                          </div>
                        )}
                        <div className={"max-w-[78%] rounded-2xl px-3 py-2 " +
                          (benim
                            ? "bg-[#0b1220] text-white rounded-br-sm"
                            : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm")}>
                          <p className="text-[11px] leading-relaxed whitespace-pre-wrap">{m.mesaj}</p>
                          <p className={"text-[8px] font-bold mt-1 " + (benim ? "text-slate-400 text-right" : "text-slate-400")}>
                            {m.tarih}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-2.5 border-t border-slate-100 bg-white shrink-0">
                  <div className="flex items-end gap-2">
                    <input value={yeniMesaj} onChange={(e) => setYeniMesaj(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); mesajGonder(); } }}
                      placeholder="Mesajınızı yazın..."
                      className="flex-1 px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
                    <button onClick={mesajGonder} disabled={gonderiyor || !yeniMesaj.trim()} aria-label="Gönder"
                      className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white grid place-items-center shrink-0 disabled:opacity-40 active:scale-95 transition">
                      {gonderiyor ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </motion.div>
        )}

        <p className="text-center text-[9px] font-bold text-slate-400 py-4">
          BUVİSAN Vinç &amp; Asansör Servis · 0224 374 00 01
        </p>
      </main>

      {/* ══════════════════ BİLDİRİM ══════════════════ */}
      <AnimatePresence>
        {mesaj && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-3 z-[1000] mx-auto max-w-md"
            style={{ top: "calc(8.25rem + env(safe-area-inset-top))" }}>
            <div className={"flex items-start gap-2 p-3 rounded-2xl border shadow-xl shadow-slate-900/10 text-[11px] font-bold " +
              (mesajTon === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : mesajTon === "bilgi" ? "bg-white border-slate-200 text-slate-700"
                  : "bg-rose-50 border-rose-200 text-rose-800")}>
              {mesajTon === "ok" ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                : mesajTon === "bilgi" ? <Loader2 size={14} className="shrink-0 mt-0.5 animate-spin" />
                  : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
              <span className="leading-relaxed flex-1">{mesaj.replace(/^[✅❌⚠️⏳]\s*/, "")}</span>
              <button onClick={() => setMesaj("")} aria-label="Kapat" className="shrink-0 opacity-60 kucuk">
                <X size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════ PAZARLIK PENCERESİ ══════════════════ */}
      <AnimatePresence>
        {pazarlikAcik && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
            onClick={() => setPazarlikAcik(null)}>
            <motion.div initial={{ y: 40, opacity: 0.5 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 340, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-sm bg-white rounded-t-[26px] sm:rounded-[26px] overflow-hidden max-h-[92dvh] overflow-y-auto"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
              <div className="sm:hidden w-10 h-1 rounded-full bg-slate-200 mx-auto mt-2.5" />

              <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 grid place-items-center">
                    <MessageSquare size={14} />
                  </span>
                  <h3 className="text-[12px] font-black text-slate-900">Pazarlık Teklifi</h3>
                </div>
                <button onClick={() => setPazarlikAcik(null)} aria-label="Kapat"
                  className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 grid place-items-center active:scale-95 transition kucuk">
                  <X size={15} />
                </button>
              </div>

              <div className="p-4 space-y-3">
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[8px] font-black tracking-[0.16em] text-slate-400">MEVCUT TEKLİF</p>
                    <p className="text-lg font-black text-slate-900 mt-0.5">{para(pazarlikAcik.tutar)} ₺</p>
                  </div>
                  <span className="text-[8px] font-black px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-400">
                    #{pazarlikAcik.no || "—"}
                  </span>
                </div>

                <div>
                  <label className="text-[8px] font-black tracking-[0.16em] text-slate-400">TEKLİF ETMEK İSTEDİĞİNİZ TUTAR *</label>
                  <input type="number" value={pzTutar} onChange={(e) => setPzTutar(Number(e.target.value) || 0)}
                    className="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
                  {pzTutar > 0 && pzTutar < Number(pazarlikAcik.tutar || 0) && (
                    <p className="text-[10px] font-bold text-emerald-600 mt-1.5">
                      İndirim: {para(Number(pazarlikAcik.tutar || 0) - pzTutar)} ₺
                      (%{Math.round((1 - pzTutar / Number(pazarlikAcik.tutar || 1)) * 100)})
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-[8px] font-black tracking-[0.16em] text-slate-400">MESAJINIZ (OPSİYONEL)</label>
                  <textarea rows={3} value={pzMesaj} onChange={(e) => setPzMesaj(e.target.value)}
                    placeholder="Örn: Peşin ödemede bu fiyatı yapabilir misiniz?"
                    className="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs resize-none outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
                </div>

                <div className="flex gap-2 pt-0.5">
                  <button onClick={() => setPazarlikAcik(null)}
                    className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-black active:scale-95 transition">
                    İPTAL
                  </button>
                  <button onClick={pazarlikGonder} disabled={pzGonder}
                    className="flex-[2] py-3 rounded-xl bg-amber-500 text-white text-[11px] font-black flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 transition">
                    {pzGonder ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} GÖNDER
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════ TARİH DEĞİŞİKLİĞİ PENCERESİ ══════════════════ */}
      <AnimatePresence>
        {duzPlan && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
            onClick={() => setDuzPlan(null)}>
            <motion.div initial={{ y: 40, opacity: 0.5 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 340, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-sm bg-white rounded-t-[26px] sm:rounded-[26px] overflow-hidden max-h-[92dvh] overflow-y-auto"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
              <div className="sm:hidden w-10 h-1 rounded-full bg-slate-200 mx-auto mt-2.5" />

              <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 grid place-items-center">
                    <Calendar size={14} />
                  </span>
                  <h3 className="text-[12px] font-black text-slate-900">Bakım Tarihi Değişikliği</h3>
                </div>
                <button onClick={() => setDuzPlan(null)} aria-label="Kapat"
                  className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 grid place-items-center active:scale-95 transition kucuk">
                  <X size={15} />
                </button>
              </div>

              <div className="p-4 space-y-3">
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                  <p className="text-[8px] font-black tracking-[0.16em] text-slate-400">PLANLANAN BAKIM</p>
                  <p className="text-sm font-black text-slate-900 mt-0.5">
                    {duzPlan.tarih} · {duzPlan.sira}. bakım
                  </p>
                </div>

                <div>
                  <label className="text-[8px] font-black tracking-[0.16em] text-slate-400">YENİ TARİH *</label>
                  <input type="date" min={bugunIso} value={duzYeniTarih}
                    onChange={(e) => setDuzYeniTarih(e.target.value)}
                    className="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" />
                </div>

                <div>
                  <label className="text-[8px] font-black tracking-[0.16em] text-slate-400">SEBEP (OPSİYONEL)</label>
                  <textarea rows={3} value={duzSebep} onChange={(e) => setDuzSebep(e.target.value)}
                    placeholder="Örn: O gün tesis kapalı olacak"
                    className="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs resize-none outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" />
                </div>

                <div className="rounded-xl bg-teal-50 border border-teal-200 px-3 py-2.5">
                  <p className="text-[9px] font-bold text-teal-800 leading-relaxed">
                    Talebiniz BUVİSAN onayına düşer. Onaylandığında takviminiz otomatik güncellenir.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setDuzPlan(null)}
                    className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-black active:scale-95 transition">
                    İPTAL
                  </button>
                  <button onClick={tarihTalepGonder} disabled={duzGonder}
                    className="flex-[2] py-3 rounded-xl bg-teal-600 text-white text-[11px] font-black flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 transition">
                    {duzGonder ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} TALEP GÖNDER
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════ SERVİS FORMU DETAYI ══════════════════ */}
      <AnimatePresence>
        {servisDetay && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
            onClick={() => setServisDetay(null)}>
            <motion.div initial={{ y: 40, opacity: 0.5 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 340, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md bg-white rounded-t-[26px] sm:rounded-[26px] overflow-hidden max-h-[92dvh] overflow-y-auto"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>

              <div className="sm:hidden w-10 h-1 rounded-full bg-slate-200 mx-auto mt-2.5" />

              <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 grid place-items-center shrink-0">
                    <FileText size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[8px] font-black tracking-[0.18em] text-slate-400">SERVİS FORMU</p>
                    <p className="text-[12px] font-black text-slate-900 truncate">{servisDetay.form_no || "—"}</p>
                  </div>
                </div>
                <button onClick={() => setServisDetay(null)} aria-label="Kapat"
                  className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 grid place-items-center active:scale-95 transition kucuk">
                  <X size={15} />
                </button>
              </div>

              <div className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
                  {[
                    { a: "TARİH", d: servisDetay.tarih || "—" },
                    { a: "TÜR", d: servisDetay.tur || "Servis" },
                    { a: "MAKİNE", d: servisDetay.makine || "—" },
                    { a: "TEKNİSYEN", d: servisDetay.personel || "—" },
                  ].map((k) => (
                    <div key={k.a} className="rounded-xl bg-slate-50 border border-slate-200 px-2.5 py-2">
                      <p className="text-[7px] font-black tracking-[0.16em] text-slate-400">{k.a}</p>
                      <p className="text-[10px] font-black text-slate-800 mt-0.5 truncate">{k.d}</p>
                    </div>
                  ))}
                </div>

                {detayYuk && (
                  <p className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                    <Loader2 size={11} className="animate-spin" /> Detay yükleniyor...
                  </p>
                )}

                <div>
                  <p className="text-[8px] font-black tracking-[0.16em] text-slate-400">YAPILAN İŞ</p>
                  <p className="text-[11px] text-slate-700 leading-relaxed mt-1 whitespace-pre-wrap">
                    {servisDetay.aciklama || "—"}
                  </p>
                </div>

                {servisDetay.yapilan_isler && (
                  <div>
                    <p className="text-[8px] font-black tracking-[0.16em] text-slate-400">DETAYLI İŞLEM</p>
                    <p className="text-[11px] text-slate-700 leading-relaxed mt-1 whitespace-pre-wrap">
                      {servisDetay.yapilan_isler}
                    </p>
                  </div>
                )}

                {servisDetay.malzeme && (
                  <div className="rounded-xl bg-amber-50/70 border border-amber-200 px-3 py-2.5">
                    <p className="text-[8px] font-black tracking-[0.16em] text-amber-700">KULLANILAN MALZEME</p>
                    <p className="text-[10px] text-amber-900 leading-relaxed mt-1 whitespace-pre-wrap">{servisDetay.malzeme}</p>
                  </div>
                )}

                {servisDetay.makine_bilgileri && Object.keys(servisDetay.makine_bilgileri).length > 0 && (
                  <div>
                    <p className="text-[8px] font-black tracking-[0.16em] text-slate-400">MAKİNE BİLGİLERİ</p>
                    <div className="mt-1.5 rounded-xl border border-slate-200 overflow-hidden">
                      {Object.entries(servisDetay.makine_bilgileri)
                        .filter(([, v]) => v)
                        .slice(0, 12)
                        .map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-slate-100 last:border-0">
                            <p className="text-[9px] font-black text-slate-400 uppercase">{String(k).replace(/_/g, " ")}</p>
                            <p className="text-[10px] font-bold text-slate-700 text-right truncate">{String(v)}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {Array.isArray(servisDetay.maddeler) && servisDetay.maddeler.length > 0 && (
                  <div>
                    <p className="text-[8px] font-black tracking-[0.16em] text-slate-400">
                      KONTROL LİSTESİ ({Number(servisDetay.onay || 0)} onay · {Number(servisDetay.ret || 0)} ret)
                    </p>
                    <div className="mt-1.5 rounded-xl border border-slate-200 overflow-hidden">
                      {servisDetay.maddeler.map((m: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 px-2.5 py-1.5 border-b border-slate-100 last:border-0">
                          {String(m?.sonuc) === "ret"
                            ? <XCircle size={11} className="text-rose-500 shrink-0 mt-0.5" />
                            : String(m?.sonuc) === "onay"
                              ? <Check size={11} className="text-emerald-600 shrink-0 mt-0.5" />
                              : <span className="w-[11px] h-[11px] rounded-full border border-slate-300 shrink-0 mt-0.5" />}
                          <p className="text-[10px] text-slate-600 leading-snug">{m?.madde || m?.ad || "—"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {servisDetay.musteri_yorumu && (
                  <div>
                    <p className="text-[8px] font-black tracking-[0.16em] text-slate-400">YORUMUNUZ</p>
                    <p className="text-[10px] text-slate-600 italic mt-1">“{servisDetay.musteri_yorumu}”</p>
                  </div>
                )}

                {/* 💰 FİYAT — sadece detayda görünür */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                  <p className="text-[8px] font-black tracking-[0.16em] text-slate-400">SERVİS BEDELİ</p>
                  {Number(servisDetay.tutar) > 0 ? (
                    <p className="text-[21px] leading-none font-black text-slate-900 mt-1">
                      {para(servisDetay.tutar)} <span className="text-[11px] font-bold text-slate-400">₺</span>
                    </p>
                  ) : (
                    <p className="text-[11px] font-bold text-slate-400 mt-1.5">
                      Bu iş için ayrıca bedel yansıtılmamış.
                    </p>
                  )}
                </div>

                <p className="text-center text-[9px] font-bold text-slate-400">
                  BUVİSAN Vinç &amp; Asansör Servis · 0224 374 00 01
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
