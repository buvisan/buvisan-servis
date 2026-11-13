"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - MÜŞTERİ PORTALI 👤 (v3 — Hesap Sistemi)
// Giriş: kullanıcı adı + şifre · Kayıt: admin onaylı
// Veri: SADECE kendi firmasının kayıtları
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, ShieldCheck, Loader2, LogOut, Wrench, Calendar,
  MapPin, CheckCircle2, RefreshCw, User, Lock, Building2,
  UserPlus, Eye, EyeOff, AlertTriangle, FileText, Clock,
} from "lucide-react";

type Adim = "giris" | "kayit" | "portal";

export default function MusteriPortali() {
  const [adim, setAdim] = useState<Adim>("giris");
  const [kullaniciAdi, setKullaniciAdi] = useState("");
  const [sifre, setSifre] = useState("");
  const [sifreGorunur, setSifreGorunur] = useState(false);
  const [token, setToken] = useState("");
  const [veri, setVeri] = useState<any>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [mesaj, setMesaj] = useState("");
  const [sekme, setSekme] = useState<"ozet" | "gecmis" | "bakim" | "teklif">("ozet");

  // Kayıt formu
  const [kFirma, setKFirma] = useState("");
  const [kKadi, setKKadi] = useState("");
  const [kAd, setKAd] = useState("");
  const [kTel, setKTel] = useState("");
  const [kSifre, setKSifre] = useState("");
  const [kSifre2, setKSifre2] = useState("");
  const [kEmail, setKEmail] = useState("");
  const [kayitBasarili, setKayitBasarili] = useState(false);

  useEffect(() => {
    try {
      const t = localStorage.getItem("musteri_token");
      if (t) { setToken(t); setAdim("portal"); }
    } catch { /* yoksay */ }
  }, []);

  const veriGetir = useCallback(async (tk: string) => {
    setYukleniyor(true);
    try {
      const { data, error } = await supabase.rpc("musteri_portal_verisi_v2", { p_token: tk });
      if (error || !(data as any)?.ok) {
        setMesaj((data as any)?.mesaj || error?.message || "Oturum geçersiz");
        setAdim("giris");
        try { localStorage.removeItem("musteri_token"); } catch { /* yoksay */ }
        return;
      }
      setVeri(data);
    } finally { setYukleniyor(false); }
  }, []);

  useEffect(() => {
    if (token && adim === "portal") veriGetir(token);
  }, [token, adim, veriGetir]);

  const girisYap = async () => {
    if (!kullaniciAdi.trim() || !sifre) { setMesaj("⚠️ Kullanıcı adı ve şifre girin."); return; }
    setYukleniyor(true);
    setMesaj("");
    try {
      const { data, error } = await supabase.rpc("musteri_giris_sifre", {
        p_kullanici_adi: kullaniciAdi.trim(), p_sifre: sifre,
      });
      if (error || !(data as any)?.ok) {
        setMesaj("❌ " + (error?.message || (data as any)?.mesaj || "Giriş başarısız"));
        return;
      }
      const tk = (data as any).token;
      setToken(tk);
      try { localStorage.setItem("musteri_token", tk); } catch { /* yoksay */ }
      setAdim("portal");
      setMesaj("");
      setSifre("");
    } finally { setYukleniyor(false); }
  };

  const kayitOl = async () => {
    if (!kFirma.trim()) { setMesaj("⚠️ Firma adı zorunludur."); return; }
    if (kKadi.trim().length < 4) { setMesaj("⚠️ Kullanıcı adı en az 4 karakter."); return; }
    if (kTel.replace(/[^0-9]/g, "").length < 10) { setMesaj("⚠️ Geçerli telefon girin."); return; }
    if (kSifre.length < 6) { setMesaj("⚠️ Şifre en az 6 karakter."); return; }
    if (kSifre !== kSifre2) { setMesaj("⚠️ Şifreler eşleşmiyor."); return; }

    setYukleniyor(true);
    setMesaj("");
    try {
      const { data, error } = await supabase.rpc("musteri_kayit_ol", {
        p_firma_adi: kFirma.trim(),
        p_kullanici_adi: kKadi.trim(),
        p_ad_soyad: kAd.trim(),
        p_telefon: kTel.trim(),
        p_sifre: kSifre,
        p_email: kEmail.trim() || null,
      });
      if (error || !(data as any)?.ok) {
        setMesaj("❌ " + (error?.message || (data as any)?.mesaj || "Kayıt başarısız"));
        return;
      }
      setKayitBasarili(true);
      setMesaj("✅ " + ((data as any).mesaj || "Kaydınız alındı!"));
    } finally { setYukleniyor(false); }
  };

  const cikis = () => {
    try { localStorage.removeItem("musteri_token"); } catch { /* yoksay */ }
    setToken(""); setVeri(null); setAdim("giris");
    setKullaniciAdi(""); setSifre("");
  };

  // ═══════════ GİRİŞ / KAYIT ═══════════
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

          {/* Sekme */}
          <div className="flex border-b border-slate-200">
            <button onClick={() => { setAdim("giris"); setMesaj(""); setKayitBasarili(false); }}
              className={`flex-1 py-3 text-[11px] font-black transition ${adim === "giris" ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-400"}`}>
              GİRİŞ YAP
            </button>
            <button onClick={() => { setAdim("kayit"); setMesaj(""); setKayitBasarili(false); }}
              className={`flex-1 py-3 text-[11px] font-black transition ${adim === "kayit" ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-400"}`}>
              KAYIT OL
            </button>
          </div>

          <div className="p-5 space-y-3.5">
            {/* ═══ GİRİŞ ═══ */}
            {adim === "giris" && (
              <>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                    <User size={11} /> Kullanıcı Adı
                  </label>
                  <input value={kullaniciAdi} onChange={(e) => setKullaniciAdi(e.target.value)}
                    placeholder="ornek_firma"
                    className="w-full mt-1.5 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-slate-900" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                    <Lock size={11} /> Şifre
                  </label>
                  <div className="relative mt-1.5">
                    <input value={sifre} onChange={(e) => setSifre(e.target.value)}
                      type={sifreGorunur ? "text" : "password"}
                      placeholder="••••••"
                      onKeyDown={(e) => { if (e.key === "Enter") girisYap(); }}
                      className="w-full p-3 pr-12 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm outline-none focus:border-slate-900" />
                    <button onClick={() => setSifreGorunur(o => !o)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {sifreGorunur ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button onClick={girisYap} disabled={yukleniyor}
                  className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2">
                  {yukleniyor ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  {yukleniyor ? "GİRİLİYOR..." : "GİRİŞ YAP"}
                </button>
                <p className="text-center text-[10px] text-slate-400 font-medium">
                  Hesabınız yok mu? Yukarıdan <b>KAYIT OL</b>
                </p>
              </>
            )}

            {/* ═══ KAYIT ═══ */}
            {adim === "kayit" && !kayitBasarili && (
              <>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                    <Building2 size={11} /> Firma Adı *
                  </label>
                  <input value={kFirma} onChange={(e) => setKFirma(e.target.value)}
                    placeholder="ABC Makina San. Ltd. Şti."
                    className="w-full mt-1.5 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-slate-900" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase">Ad Soyad</label>
                    <input value={kAd} onChange={(e) => setKAd(e.target.value)}
                      placeholder="Ahmet Yılmaz"
                      className="w-full mt-1.5 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-slate-900" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                      <Phone size={10} /> Telefon *
                    </label>
                    <input value={kTel} onChange={(e) => setKTel(e.target.value)}
                      placeholder="05xx" type="tel" inputMode="tel"
                      className="w-full mt-1.5 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-slate-900" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                    <User size={11} /> Kullanıcı Adı *
                  </label>
                  <input value={kKadi} onChange={(e) => setKKadi(e.target.value.replace(/[^a-z0-9_]/gi, ""))}
                    placeholder="abc_makina"
                    className="w-full mt-1.5 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-slate-900" />
                  <p className="text-[9px] text-slate-400 mt-1">En az 4 karakter, harf/rakam/alt çizgi</p>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase">E-posta (opsiyonel)</label>
                  <input value={kEmail} onChange={(e) => setKEmail(e.target.value)}
                    placeholder="ahmet@abcmakina.com" type="email"
                    className="w-full mt-1.5 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-slate-900" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                      <Lock size={10} /> Şifre *
                    </label>
                    <input value={kSifre} onChange={(e) => setKSifre(e.target.value)}
                      type="password" placeholder="••••••"
                      className="w-full mt-1.5 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-slate-900" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                      <Lock size={10} /> Şifre Tekrar *
                    </label>
                    <input value={kSifre2} onChange={(e) => setKSifre2(e.target.value)}
                      type="password" placeholder="••••••"
                      className={`w-full mt-1.5 p-3 bg-slate-50 border-2 rounded-xl text-xs outline-none focus:border-slate-900 ${
                        kSifre2 && kSifre !== kSifre2 ? "border-rose-400" : "border-slate-200"}`} />
                  </div>
                </div>
                {kSifre2 && kSifre !== kSifre2 && (
                  <p className="text-[10px] text-rose-600 font-bold">⚠️ Şifreler eşleşmiyor</p>
                )}
                <button onClick={kayitOl} disabled={yukleniyor}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2">
                  {yukleniyor ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                  {yukleniyor ? "KAYDEDİLİYOR..." : "KAYIT OL"}
                </button>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                  <p className="text-[9px] font-bold text-amber-800 leading-snug">
                    ⚠️ Kaydınız <b>yönetici onayından</b> sonra aktif olur.
                    Telefon numaranız sistemimizde kayıtlı olmalıdır.
                  </p>
                </div>
              </>
            )}

            {/* ═══ KAYIT BAŞARILI ═══ */}
            {adim === "kayit" && kayitBasarili && (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-emerald-100 rounded-full mx-auto flex items-center justify-center mb-4">
                  <CheckCircle2 size={32} className="text-emerald-600" />
                </div>
                <p className="text-sm font-black text-slate-800">Kaydınız Alındı!</p>
                <p className="text-[11px] text-slate-500 font-medium mt-2 px-4 leading-relaxed">
                  Yönetici onayından sonra kullanıcı adı ve şifrenizle giriş yapabilirsiniz.
                  Onay genellikle <b>1 iş günü</b> içinde yapılır.
                </p>
                <button onClick={() => { setAdim("giris"); setKayitBasarili(false); setMesaj(""); }}
                  className="mt-4 text-[11px] font-black text-slate-700 underline">
                  Giriş ekranına dön
                </button>
              </div>
            )}

            {mesaj && (
              <div className={`p-3 rounded-xl text-[11px] font-bold ${
                mesaj.startsWith("✅") ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
                {mesaj}
              </div>
            )}

            <p className="text-center text-[9px] text-slate-400 pt-2">
              Yardım: 0224 374 00 01
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  // ═══════════ PORTAL ═══════════
  const vincler = veri?.vincler || [];
  const servisler = veri?.servisler || [];
  const aktif = veri?.aktif_isler || [];
  const bakim = veri?.bakim_takvimi || [];
  const teklifler = veri?.teklifler || [];

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-4 sticky top-0 z-40 shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 bg-yellow-400 rounded-xl flex items-center justify-center font-black text-slate-900 shrink-0">B</div>
            <div className="min-w-0">
              <p className="text-white font-black text-sm leading-none truncate">{veri?.firma || "Firma"}</p>
              <p className="text-slate-400 text-[9px] font-bold mt-0.5 truncate">
                {veri?.ad_soyad || "Müşteri Portalı"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
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
        <div className="flex gap-1 bg-white rounded-2xl p-1.5 shadow-sm overflow-x-auto">
          {([["ozet","ÖZET"],["gecmis","GEÇMİŞ"],["bakim","BAKIM"],["teklif","TEKLİF"]] as const).map(([k, a]) => (
            <button key={k} onClick={() => setSekme(k)}
              className={`flex-1 min-w-fit px-3 py-2.5 rounded-xl text-[10px] font-black transition ${
                sekme === k ? "bg-slate-900 text-white" : "text-slate-500"}`}>
              {a}
            </button>
          ))}
        </div>

        {yukleniyor && !veri ? (
          <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" /></div>
        ) : sekme === "ozet" ? (
          <>
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
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {v.kapasite !== "—" && <span className="text-[9px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border">{v.kapasite}</span>}
                      {v.seri_no !== "—" && <span className="text-[9px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border">{v.seri_no}</span>}
                      {v.makine_tipi !== "—" && <span className="text-[9px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border">{v.makine_tipi}</span>}
                    </div>
                    {v.adres && v.adres !== "—" && <p className="text-[9px] text-slate-400 mt-1 line-clamp-1">📍 {v.adres}</p>}
                    {v.sonraki_bakim && (
                      <p className="text-[9px] font-black text-amber-600 mt-1">
                        🔧 Sonraki bakım: {String(v.sonraki_bakim).slice(0, 10)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : sekme === "gecmis" ? (
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
                      {s.malzeme && <p className="text-[9px] text-slate-400 mt-1">📦 {s.malzeme}</p>}
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
        ) : sekme === "bakim" ? (
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
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3">
              <h3 className="text-white font-black text-sm">💰 TEKLİFLERİM ({teklifler.length})</h3>
            </div>
            <div className="p-3 space-y-2">
              {teklifler.length === 0 ? (
                <p className="text-center text-slate-400 text-[11px] font-bold py-6">Teklif yok</p>
              ) : teklifler.map((t: any, i: number) => (
                <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-slate-800">{t.musteri}</p>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded ${
                      t.durum === "BEKLIYOR" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {t.durum}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{t.ariza}</p>
                  <p className="text-[9px] text-slate-400 mt-1">{t.tarih}</p>
                </div>
              ))}
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
