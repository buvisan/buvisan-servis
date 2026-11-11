"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - MÜŞTERİ PORTALI 👤
// Telefon + SMS kodu ile giriş · Kendi vinçleri, servis geçmişi,
// aktif işler, bakım takvimi
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, ShieldCheck, Loader2, LogOut, Wrench, Clock, Calendar,
  MapPin, CheckCircle2, AlertCircle, RefreshCw, ChevronRight, Star,
} from "lucide-react";

type Adim = "telefon" | "kod" | "portal";

export default function MusteriPortali() {
  const [adim, setAdim] = useState<Adim>("telefon");
  const [telefon, setTelefon] = useState("");
  const [kod, setKod] = useState("");
  const [token, setToken] = useState("");
  const [veri, setVeri] = useState<any>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [mesaj, setMesaj] = useState("");
  const [sekmе, setSekme] = useState<"ozet" | "gecmis" | "bakim">("ozet");

  // Kayıtlı oturum
  useEffect(() => {
    try {
      const t = localStorage.getItem("musteri_token");
      if (t) { setToken(t); setAdim("portal"); }
    } catch { /* yoksay */ }
  }, []);

  const veriGetir = useCallback(async (tk: string) => {
    setYukleniyor(true);
    try {
      const { data, error } = await supabase.rpc("musteri_portal_verisi", { p_token: tk });
      if (error || !(data as any)?.ok) {
        setMesaj((data as any)?.mesaj || error?.message || "Oturum geçersiz");
        setAdim("telefon");
        try { localStorage.removeItem("musteri_token"); } catch { /* yoksay */ }
        return;
      }
      setVeri(data);
    } finally { setYukleniyor(false); }
  }, []);

  useEffect(() => {
    if (token && adim === "portal") veriGetir(token);
  }, [token, adim, veriGetir]);

  const kodIste = async () => {
    const tel = telefon.replace(/[^0-9]/g, "");
    if (tel.length < 10) { setMesaj("⚠️ Geçerli bir telefon numarası girin."); return; }
    setYukleniyor(true);
    setMesaj("");
    try {
      const { data, error } = await supabase.rpc("musteri_giris_kodu_olustur", { p_telefon: telefon });
      if (error || !(data as any)?.ok) {
        setMesaj("❌ " + (error?.message || (data as any)?.mesaj || "Kod gönderilemedi"));
        return;
      }
      setMesaj("✅ SMS kodu gönderildi. Telefonunuzu kontrol edin.");
      setAdim("kod");
    } finally { setYukleniyor(false); }
  };

  const girisYap = async () => {
    if (kod.trim().length < 4) { setMesaj("⚠️ 6 haneli kodu girin."); return; }
    setYukleniyor(true);
    setMesaj("");
    try {
      const { data, error } = await supabase.rpc("musteri_giris_dogrula", {
        p_telefon: telefon, p_kod: kod.trim(),
      });
      if (error || !(data as any)?.ok) {
        setMesaj("❌ " + (error?.message || (data as any)?.mesaj || "Kod geçersiz"));
        return;
      }
      const tk = (data as any).token;
      setToken(tk);
      try { localStorage.setItem("musteri_token", tk); } catch { /* yoksay */ }
      setAdim("portal");
      setMesaj("");
    } finally { setYukleniyor(false); }
  };

  const cikis = () => {
    try { localStorage.removeItem("musteri_token"); } catch { /* yoksay */ }
    setToken(""); setVeri(null); setAdim("telefon"); setTelefon(""); setKod("");
  };

  // ═══════════════ GİRİŞ EKRANI ═══════════════
  if (adim !== "portal") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-center">
            <div className="w-16 h-16 bg-yellow-400 rounded-2xl mx-auto flex items-center justify-center font-black text-2xl text-slate-900 mb-3">
              B
            </div>
            <h1 className="text-white font-black text-lg">BUVİSAN</h1>
            <p className="text-slate-400 text-[11px] font-bold mt-1">MÜŞTERİ PORTALI</p>
          </div>

          <div className="p-5 space-y-4">
            {adim === "telefon" ? (
              <>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                    <Phone size={11} /> Telefon Numarası
                  </label>
                  <input value={telefon} onChange={(e) => setTelefon(e.target.value)}
                    placeholder="0532 123 45 67" type="tel" inputMode="tel"
                    className="w-full mt-1.5 p-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-slate-900" />
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Kayıtlı telefonunuza 6 haneli doğrulama kodu göndereceğiz.
                  </p>
                </div>
                <button onClick={kodIste} disabled={yukleniyor}
                  className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2">
                  {yukleniyor ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  {yukleniyor ? "GÖNDERİLİYOR..." : "KOD GÖNDER"}
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                    <ShieldCheck size={11} /> SMS Kodu
                  </label>
                  <input value={kod} onChange={(e) => setKod(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                    placeholder="123456" inputMode="numeric" maxLength={6}
                    className="w-full mt-1.5 p-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-2xl font-black text-center tracking-[0.5em] outline-none focus:border-slate-900" />
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    {telefon} numarasına gelen 6 haneli kod
                  </p>
                </div>
                <button onClick={girisYap} disabled={yukleniyor}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2">
                  {yukleniyor ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  {yukleniyor ? "KONTROL EDİLİYOR..." : "GİRİŞ YAP"}
                </button>
                <button onClick={() => { setAdim("telefon"); setKod(""); setMesaj(""); }}
                  className="w-full text-slate-400 text-[11px] font-bold py-2">
                  ← Numarayı değiştir
                </button>
              </>
            )}

            {mesaj && (
              <div className={`p-3 rounded-xl text-[11px] font-bold ${
                mesaj.startsWith("✅") ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
                {mesaj}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  // ═══════════════ PORTAL ═══════════════
  const vincler = veri?.vincler || [];
  const servisler = veri?.servisler || [];
  const aktif = veri?.aktif_isler || [];
  const bakim = veri?.bakim_takvimi || [];

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* ÜST BAR */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-4 sticky top-0 z-40 shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-yellow-400 rounded-xl flex items-center justify-center font-black text-slate-900">B</div>
            <div>
              <p className="text-white font-black text-sm leading-none">BUVİSAN</p>
              <p className="text-slate-400 text-[9px] font-bold mt-0.5">MÜŞTERİ PORTALI</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => veriGetir(token)} className="bg-white/10 hover:bg-white/20 p-2 rounded-lg">
              <RefreshCw size={14} className={`text-white ${yukleniyor ? "animate-spin" : ""}`} />
            </button>
            <button onClick={cikis} className="bg-white/10 hover:bg-red-500 p-2 rounded-lg">
              <LogOut size={14} className="text-white" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* SEKME */}
        <div className="flex gap-2 bg-white rounded-2xl p-1.5 shadow-sm">
          {([["ozet", "ÖZET"], ["gecmis", "GEÇMİŞ"], ["bakim", "BAKIM"]] as const).map(([k, a]) => (
            <button key={k} onClick={() => setSekme(k)}
              className={`flex-1 py-2.5 rounded-xl text-[11px] font-black transition ${
                sekmе === k ? "bg-slate-900 text-white" : "text-slate-500"}`}>
              {a}
            </button>
          ))}
        </div>

        {yukleniyor && !veri ? (
          <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" /></div>
        ) : sekmе === "ozet" ? (
          <>
            {/* AKTİF İŞLER */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3">
                <h3 className="text-white font-black text-sm">🔧 AKTİF SERVİSLERİM ({aktif.length})</h3>
              </div>
              <div className="p-3 space-y-2">
                {aktif.length === 0 ? (
                  <p className="text-center text-slate-400 text-[11px] font-bold py-6">Aktif servis yok</p>
                ) : aktif.map((a: any) => (
                  <div key={a.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <p className="text-xs font-black text-slate-800">{a.firma}</p>
                    <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{a.aciklama}</p>
                    <p className="text-[9px] text-slate-400 font-bold mt-1">{a.tarih}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* VİNÇLERİM */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-3">
                <h3 className="text-white font-black text-sm">🏗️ MAKİNELERİM ({vincler.length})</h3>
              </div>
              <div className="p-3 space-y-2">
                {vincler.length === 0 ? (
                  <p className="text-center text-slate-400 text-[11px] font-bold py-6">Kayıtlı makine bulunamadı</p>
                ) : vincler.map((v: any) => (
                  <div key={v.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <p className="text-xs font-black text-slate-800">{v.model}</p>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      <span className="text-[9px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border">{v.kapasite}</span>
                      <span className="text-[9px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border">{v.seri_no}</span>
                      {v.sonraki_bakim && (
                        <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          Bakım: {String(v.sonraki_bakim).slice(0, 10)}
                        </span>
                      )}
                    </div>
                    {v.adres && <p className="text-[9px] text-slate-400 mt-1 line-clamp-1">📍 {v.adres}</p>}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : sekmе === "gecmis" ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-4 py-3">
              <h3 className="text-white font-black text-sm">📄 SERVİS GEÇMİŞİM ({servisler.length})</h3>
            </div>
            <div className="p-3 space-y-2">
              {servisler.length === 0 ? (
                <p className="text-center text-slate-400 text-[11px] font-bold py-6">Servis kaydı yok</p>
              ) : servisler.map((s: any, i: number) => (
                <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black text-slate-500">{s.tarih} · {s.tur}</p>
                      <p className="text-xs font-bold text-slate-700 mt-1 line-clamp-2">{s.aciklama}</p>
                      <p className="text-[9px] text-slate-400 mt-1">👤 {s.personel}</p>
                    </div>
                    {Number(s.tutar) > 0 && (
                      <span className="text-xs font-black text-emerald-600 shrink-0">
                        {Number(s.tutar).toLocaleString("tr-TR")} ₺
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3">
              <h3 className="text-white font-black text-sm">📅 BAKIM TAKVİMİM ({bakim.length})</h3>
            </div>
            <div className="p-3 space-y-2">
              {bakim.length === 0 ? (
                <p className="text-center text-slate-400 text-[11px] font-bold py-6">Planlı bakım yok</p>
              ) : bakim.map((b: any, i: number) => {
                const kaldi = Number(b.gun_kaldi || 0);
                return (
                  <div key={i} className={`rounded-xl p-3 border-2 ${
                    kaldi <= 0 ? "bg-rose-50 border-rose-300"
                    : kaldi <= 30 ? "bg-amber-50 border-amber-300"
                    : "bg-emerald-50 border-emerald-200"}`}>
                    <p className="text-xs font-black text-slate-800">{b.model}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-[10px] font-bold text-slate-600">{b.tarih}</p>
                      <span className={`text-[10px] font-black ${
                        kaldi <= 0 ? "text-rose-600" : kaldi <= 30 ? "text-amber-600" : "text-emerald-600"}`}>
                        {kaldi <= 0 ? `${Math.abs(kaldi)} gün GEÇTİ` : `${kaldi} gün kaldı`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-center text-[9px] text-slate-400 font-bold py-4">
          BUVİSAN Vinç Servis · 0224 374 00 01
        </p>
      </div>
    </div>
  );
}
