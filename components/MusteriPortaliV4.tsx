"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - MÜŞTERİ PORTALI v4 👤
// Özet · Makine · Servis · Teklif · Canlı Sohbet
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2, LogOut, Wrench, RefreshCw, Send, MessageSquare, Plus, X,
  Check, CheckCircle2, XCircle, Star, Package, TrendingUp, Eye, EyeOff,
  ShieldCheck, UserPlus,
} from "lucide-react";

type Sekme = "ozet" | "makine" | "servis" | "teklif" | "sohbet";

export default function MusteriPortaliV4({ baslangicToken }: { baslangicToken?: string }) {
  const [token, setToken] = useState(baslangicToken || "");
  const [veri, setVeri] = useState<any>(null);
  const [teklifler, setTeklifler] = useState<any[]>([]);
  const [sohbet, setSohbet] = useState<any[]>([]);
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
  const sohbetSon = useRef<HTMLDivElement | null>(null);

  const veriGetir = useCallback(async (tk: string) => {
    setYukleniyor(true);
    try {
      const [p, t, s] = await Promise.all([
        supabase.rpc("musteri_portal_v6", { p_token: tk }),
        supabase.rpc("musteri_teklifleri", { p_token: tk }),
        supabase.rpc("musteri_sohbet_getir", { p_token: tk }),
      ]);
      if (!(p.data as any)?.ok) {
        setMesaj((p.data as any)?.mesaj || "Oturum geçersiz");
        try { localStorage.removeItem("musteri_token"); } catch { /* yoksay */ }
        return;
      }
      setVeri(p.data);
      const ayriTeklif = (t.data as any[]) || [];
      const anaTeklif = (p.data as any)?.teklifler || [];
      setTeklifler(anaTeklif.length > 0 ? anaTeklif : ayriTeklif);
      setSohbet((s.data as any[]) || []);
    } finally { setYukleniyor(false); }
  }, []);

  useEffect(() => { if (token) veriGetir(token); }, [token, veriGetir]);

  useEffect(() => {
    if (!token) return;
    const z = setInterval(() => veriGetir(token), 30000);
    return () => clearInterval(z);
  }, [token, veriGetir]);

  useEffect(() => {
    if (sohbetSon.current) sohbetSon.current.scrollIntoView({ behavior: "smooth" });
  }, [sohbet, sekme]);

  const mesajGonder = async () => {
    if (!yeniMesaj.trim() || gonderiyor) return;
    setGonderiyor(true);
    try {
      const { data } = await supabase.rpc("musteri_mesaj_gonder", { p_token: token, p_mesaj: yeniMesaj.trim() });
      if ((data as any)?.ok) {
        setYeniMesaj("");
        const s = await supabase.rpc("musteri_sohbet_getir", { p_token: token });
        setSohbet((s.data as any[]) || []);
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

  const makineSil = async (id: string) => {
    if (!confirm("Bu makineyi silmek istiyor musunuz?")) return;
    const { data } = await supabase.rpc("musteri_vinc_sil", { p_token: token, p_id: id });
    if ((data as any)?.ok) { setMesaj("✅ Silindi"); await veriGetir(token); }
    else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
  };

  const cikis = () => {
    try { localStorage.removeItem("musteri_token"); } catch { /* yoksay */ }
    setToken(""); setVeri(null);
    window.location.reload();
  };

  const vincler = veri?.vincler || [];
  const kendi = veri?.kendi_makineler || [];
  const biletMak = veri?.bilet_makineleri || [];
  const servisler = veri?.servisler || [];
  const aktif = veri?.aktif_isler || [];
  const bakim = veri?.bakim_takvimi || [];
  const okunmamis = Number(veri?.okunmamis_mesaj || 0);
  const bekleyenTeklif = teklifler.filter((t) => t.durum === "bekliyor" || t.durum === "BEKLIYOR").length;

  const sekmeler: { k: Sekme; ad: string; ikon: any; badge: number }[] = [
    { k: "ozet", ad: "ÖZET", ikon: TrendingUp, badge: 0 },
    { k: "makine", ad: "MAKİNE", ikon: Package, badge: 0 },
    { k: "servis", ad: "SERVİS", ikon: Wrench, badge: 0 },
    { k: "teklif", ad: "TEKLİF", ikon: Star, badge: bekleyenTeklif },
    { k: "sohbet", ad: "SOHBET", ikon: MessageSquare, badge: okunmamis },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3.5 sticky top-0 z-40 shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 bg-yellow-400 rounded-xl flex items-center justify-center font-black text-slate-900 shrink-0">B</div>
            <div className="min-w-0">
              <p className="text-white font-black text-sm leading-none truncate">{veri?.firma || "Firma"}</p>
              <p className="text-slate-400 text-[9px] font-bold mt-1 truncate">{veri?.ad_soyad || "Müşteri Portalı"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => token && veriGetir(token)} className="bg-white/10 hover:bg-white/20 p-2 rounded-lg">
              <RefreshCw size={14} className={`text-white ${yukleniyor ? "animate-spin" : ""}`} />
            </button>
            <button onClick={cikis} className="bg-white/10 hover:bg-red-500 p-2 rounded-lg"><LogOut size={14} className="text-white" /></button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-3">
        {mesaj && (
          <div className={`p-3 rounded-xl text-[11px] font-bold ${mesaj.startsWith("✅") ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
            {mesaj}
          </div>
        )}

        <div className="flex gap-1 bg-white rounded-2xl p-1.5 shadow-sm overflow-x-auto">
          {sekmeler.map((s) => {
            const Ikon = s.ikon;
            const sec = sekme === s.k;
            return (
              <button key={s.k} onClick={() => setSekme(s.k)}
                className={`flex-1 min-w-fit px-2.5 py-2.5 rounded-xl text-[10px] font-black flex items-center justify-center gap-1 relative transition ${sec ? "bg-slate-900 text-white" : "text-slate-500"}`}>
                <Ikon size={12} /> {s.ad}
                {s.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] font-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center">
                    {s.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {yukleniyor && !veri ? (
          <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" /></div>
        ) : sekme === "ozet" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gradient-to-br from-teal-600 to-cyan-600 rounded-2xl p-3.5 text-white">
                <p className="text-[9px] font-black opacity-80">MAKİNE</p>
                <p className="text-2xl font-black mt-0.5">{Number(veri?.makine_sayisi ?? 0)}</p>
              </div>
              <div className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-2xl p-3.5 text-white">
                <p className="text-[9px] font-black opacity-80">SERVİS</p>
                <p className="text-2xl font-black mt-0.5">{servisler.length}</p>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3">
                <h3 className="text-white font-black text-sm">🔧 AKTİF SERVİSLERİM ({aktif.length})</h3>
              </div>
              <div className="p-3 space-y-2">
                {aktif.length === 0 ? <p className="text-center text-slate-400 text-[11px] font-bold py-6">Aktif servis yok</p>
                  : aktif.map((a: any) => (
                    <div key={a.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <p className="text-xs font-black text-slate-800">{a.firma}</p>
                      <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{a.aciklama}</p>
                      <p className="text-[9px] text-slate-400 font-bold mt-1">{a.tarih}</p>
                    </div>
                  ))}
              </div>
            </div>

            {bakim.length > 0 && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3">
                  <h3 className="text-white font-black text-sm">📅 BAKIM TAKVİMİM ({bakim.length})</h3>
                </div>
                <div className="p-3 space-y-2">
                  {bakim.slice(0, 5).map((b: any, i: number) => {
                    const k = Number(b.gun_kaldi || 0);
                    return (
                      <div key={i} className={`rounded-xl p-3 border-2 ${k <= 0 ? "bg-rose-50 border-rose-300" : k <= 30 ? "bg-amber-50 border-amber-300" : "bg-emerald-50 border-emerald-200"}`}>
                        <p className="text-xs font-black text-slate-800">{b.model}</p>
                        <div className="flex justify-between mt-1">
                          <p className="text-[10px] font-bold text-slate-600">{b.tarih}</p>
                          <span className={`text-[10px] font-black ${k <= 0 ? "text-rose-600" : k <= 30 ? "text-amber-600" : "text-emerald-600"}`}>
                            {k <= 0 ? `${Math.abs(k)} gün GEÇTİ` : `${k} gün kaldı`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : sekme === "makine" ? (
          <>
            <button onClick={() => { setMakineDuz(null); setMModel(""); setMSeri(""); setMKapasite(""); setMKonum(""); setMakineForm(o => !o); }}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-2xl text-[11px] font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20">
              {makineForm ? <X size={14} /> : <Plus size={14} />} {makineForm ? "İPTAL" : "KENDİ MAKİNEMİ EKLE"}
            </button>

            <AnimatePresence>
              {makineForm && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="bg-white border-2 border-emerald-200 rounded-2xl p-4 space-y-2 overflow-hidden">
                  <input value={mModel} onChange={(e) => setMModel(e.target.value)} placeholder="Model * (örn: 10 TON KÖPRÜLÜ VİNÇ)"
                    className="w-full p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-emerald-500" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={mSeri} onChange={(e) => setMSeri(e.target.value)} placeholder="Seri No"
                      className="p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500" />
                    <input value={mKapasite} onChange={(e) => setMKapasite(e.target.value)} placeholder="Kapasite"
                      className="p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={mTip} onChange={(e) => setMTip(e.target.value)}
                      className="p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none">
                      <option value="vinç">Vinç</option>
                      <option value="asansör">Asansör</option>
                    </select>
                    <input value={mKonum} onChange={(e) => setMKonum(e.target.value)} placeholder="Konum"
                      className="p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500" />
                  </div>
                  <button onClick={makineDuz ? duzenleKaydet : makineEkle} disabled={yukleniyor}
                    className="w-full py-3 bg-emerald-600 text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-2 disabled:bg-slate-300">
                    {yukleniyor ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} KAYDET
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-3">
                <h3 className="text-white font-black text-sm">🏗️ SİSTEMDEKİ MAKİNELERİM ({vincler.length})</h3>
              </div>
              <div className="p-3 space-y-2">
                {vincler.length === 0 ? <p className="text-center text-slate-400 text-[11px] font-bold py-6">Kayıtlı makine yok</p>
                  : vincler.map((v: any) => (
                    <div key={v.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <p className="text-xs font-black text-slate-800">{v.model}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {v.kapasite !== "—" && <span className="text-[9px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border">{v.kapasite}</span>}
                        {v.seri_no !== "—" && <span className="text-[9px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border">{v.seri_no}</span>}
                        {v.makine_tipi !== "—" && <span className="text-[9px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border">{v.makine_tipi}</span>}
                      </div>
                      {v.adres && v.adres !== "—" && <p className="text-[9px] text-slate-400 mt-1">📍 {v.adres}</p>}
                    </div>
                  ))}
              </div>
            </div>

            {biletMak.length > 0 && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-3">
                  <h3 className="text-white font-black text-sm">📋 TALEPLERİMDEN MAKİNELER ({biletMak.length})</h3>
                </div>
                <div className="p-3 space-y-2">
                  {biletMak.map((v: any) => (
                    <div key={v.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <p className="text-xs font-black text-slate-800">{v.model}</p>
                      <p className="text-[9px] font-bold text-slate-400 mt-1">{v.tarih}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {kendi.length > 0 && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3">
                  <h3 className="text-white font-black text-sm">➕ EKLEDİĞİM MAKİNELER ({kendi.length})</h3>
                </div>
                <div className="p-3 space-y-2">
                  {kendi.map((v: any) => (
                    <div key={v.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-black text-slate-800">{v.model}</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">KAYITLI</span>
                          <button onClick={() => duzenleAc(v)} className="text-indigo-500 p-1"><Check size={12} /></button>
                          <button onClick={() => makineSil(v.id)} className="text-rose-500 p-1"><X size={12} /></button>
                        </div>
                      </div>
                      <p className="text-[9px] font-bold text-slate-400 mt-1">{v.tarih}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : sekme === "servis" ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-4 py-3">
              <h3 className="text-white font-black text-sm">📄 SERVİS GEÇMİŞİM ({servisler.length})</h3>
            </div>
            <div className="p-3 space-y-2">
              {servisler.length === 0 ? <p className="text-center text-slate-400 text-[11px] font-bold py-8">Servis kaydı yok</p>
                : servisler.map((s: any, i: number) => (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-[10px] font-black text-slate-500">{s.tarih}</p>
                          {s.form_no && <span className="text-[8px] font-black text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">{s.form_no}</span>}
                        </div>
                        <p className="text-xs font-bold text-slate-700 mt-1 line-clamp-2">{s.aciklama}</p>
                        {s.malzeme && <p className="text-[9px] text-slate-400 mt-1">📦 {s.malzeme}</p>}
                        <p className="text-[9px] text-slate-400 mt-1">👤 {s.personel}</p>
                      </div>
                      {Number(s.tutar) > 0 && (
                        <span className="text-xs font-black text-emerald-600 shrink-0">{Number(s.tutar).toLocaleString("tr-TR")} ₺</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : sekme === "teklif" ? (
          <div className="space-y-2">
            {teklifler.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
                <Star className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                <p className="text-xs font-black text-slate-400">Teklif yok</p>
              </div>
            ) : teklifler.map((t: any, i: number) => {
              const dNorm = String(t.durum || "").toLowerCase().trim();
              const bekliyor = dNorm === "bekliyor" || dNorm === "beklemede" || dNorm === "" || dNorm === "taslak";
              const onayli = dNorm === "onaylandi" || dNorm === "onayli";
              const red = dNorm === "reddedildi" || dNorm === "red";
              return (
                <div key={i} className="bg-white border border-slate-200 rounded-2xl p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-xs font-black text-slate-800">{t.baslik}</p>
                        <span className="text-[8px] font-black text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{t.no}</span>
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${bekliyor ? "bg-amber-100 text-amber-700" : onayli ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                          {bekliyor ? "BEKLİYOR" : onayli ? "ONAYLANDI" : red ? "REDDEDİLDİ" : String(t.durum || "BEKLİYOR").toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1.5 line-clamp-2">{t.aciklama}</p>
                      <p className="text-[9px] text-slate-400 font-bold mt-1">{t.tarih}</p>
                    </div>
                    {Number(t.tutar) > 0 && (
                      <p className="text-sm font-black text-emerald-600 shrink-0">{Number(t.tutar).toLocaleString("tr-TR")} ₺</p>
                    )}
                  </div>
                  {bekliyor && (
                    <div className="flex gap-2 mt-2.5">
                      <button onClick={() => teklifKarar(t.kaynak, t.id, false)}
                        className="flex-1 py-2.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-[10px] font-black flex items-center justify-center gap-1">
                        <XCircle size={12} /> REDDET
                      </button>
                      <button onClick={() => { setPazarlikAcik(t); setPzTutar(Math.round(Number(t.tutar) * 0.9)); setPzMesaj(""); }}
                        className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-[10px] font-black flex items-center justify-center gap-1">
                        <MessageSquare size={12} /> PAZARLIK
                      </button>
                      <button onClick={() => teklifKarar(t.kaynak, t.id, true)}
                        className="flex-[2] py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black flex items-center justify-center gap-1">
                        <CheckCircle2 size={12} /> ONAYLA
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col" style={{ height: "calc(100vh - 240px)" }}>
            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 shrink-0">
              <h3 className="text-white font-black text-sm">💬 CANLI DESTEK</h3>
              <p className="text-[9px] text-violet-200 font-bold mt-0.5">Size en kısa sürede dönüş yapacağız</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {sohbet.length === 0 ? (
                <div className="text-center py-10">
                  <MessageSquare className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                  <p className="text-[11px] font-bold text-slate-400">Henüz mesaj yok</p>
                  <p className="text-[10px] text-slate-400 mt-1">Aşağıdan yazın, hemen cevap verelim</p>
                </div>
              ) : sohbet.map((m: any) => {
                const benim = m.gonderen === "musteri";
                return (
                  <div key={m.id} className={`flex ${benim ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${benim ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"}`}>
                      <p className="text-[11px] font-medium leading-relaxed whitespace-pre-wrap">{m.mesaj}</p>
                      <p className="text-[8px] font-bold mt-1 text-slate-400">{m.tarih}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={sohbetSon} />
            </div>
            <div className="border-t border-slate-200 p-3 flex gap-2 shrink-0 bg-white">
              <input value={yeniMesaj} onChange={(e) => setYeniMesaj(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); mesajGonder(); } }}
                placeholder="Mesajınızı yazın..."
                className="flex-1 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-violet-500" />
              <button onClick={mesajGonder} disabled={gonderiyor || !yeniMesaj.trim()}
                className="bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white px-4 rounded-xl flex items-center justify-center">
                {gonderiyor ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {pazarlikAcik && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
                className="bg-white rounded-3xl w-full max-w-sm overflow-hidden">
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 flex items-center justify-between">
                  <h3 className="text-white font-black text-xs uppercase">💬 PAZARLIK TEKLİFİ</h3>
                  <button onClick={() => setPazarlikAcik(null)} className="text-white/80"><X size={18} /></button>
                </div>
                <div className="p-4 space-y-3">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase">Mevcut Teklif</p>
                    <p className="text-lg font-black text-slate-800 mt-0.5">{Number(pazarlikAcik.tutar || 0).toLocaleString("tr-TR")} ₺</p>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase">Teklif Etmek İstediğiniz Tutar *</label>
                    <input type="number" value={pzTutar} onChange={(e) => setPzTutar(Number(e.target.value) || 0)}
                      className="w-full mt-1 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-black outline-none focus:border-amber-500" />
                    {pzTutar > 0 && pzTutar < Number(pazarlikAcik.tutar || 0) && (
                      <p className="text-[10px] font-bold text-emerald-600 mt-1">
                        İndirim: {(Number(pazarlikAcik.tutar || 0) - pzTutar).toLocaleString("tr-TR")} ₺ (%{Math.round((1 - pzTutar / Number(pazarlikAcik.tutar || 1)) * 100)})
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase">Mesajınız (opsiyonel)</label>
                    <textarea rows={3} value={pzMesaj} onChange={(e) => setPzMesaj(e.target.value)}
                      placeholder="Örn: Peşin ödemede bu fiyatı yapabilir misiniz?"
                      className="w-full mt-1 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs resize-none outline-none focus:border-amber-500" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setPazarlikAcik(null)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl text-[11px] font-black">İPTAL</button>
                    <button onClick={pazarlikGonder} disabled={pzGonder}
                      className="flex-[2] py-3 bg-amber-500 text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 disabled:bg-slate-300">
                      {pzGonder ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} GÖNDER
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-center text-[9px] text-slate-400 font-bold py-3">BUVİSAN Vinç Servis · 0224 374 00 01</p>
      </div>
    </div>
  );
}
