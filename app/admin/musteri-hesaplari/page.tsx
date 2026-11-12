"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - MÜŞTERİ HESAPLARI 👥 (admin)
// Kayıt taleplerini onayla / reddet
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import TelefonRehberi from "@/components/TelefonRehberi";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Loader2, RefreshCw, CheckCircle2, XCircle,
  Users, Building2, Phone, User, Clock, AlertTriangle, Search,
} from "lucide-react";

export default function MusteriHesaplari() {
  const [liste, setListe] = useState<any[]>([]);
  const [durum, setDurum] = useState<"bekliyor" | "onaylandi" | "reddedildi" | "hepsi">("bekliyor");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [islemde, setIslemde] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState("");
  const [arama, setArama] = useState("");
  const [redModal, setRedModal] = useState<string | null>(null);
  const [redSebep, setRedSebep] = useState("");
  const [aktifSekme, setAktifSekme] = useState<'hesaplar'|'telefonlar'>('hesaplar');
  const [telListe, setTelListe] = useState<any[]>([]);
  const [tTel, setTTel] = useState('');
  const [tFirma, setTFirma] = useState('');
  const [tYetkili, setTYetkili] = useState('');
  const [tNot, setTNot] = useState('');
  const [telYuk, setTelYuk] = useState(false);
  const [telArama, setTelArama] = useState('');

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data, error } = await supabase.rpc("musteri_hesap_listesi", { p_durum: durum });
      if (error) { setMesaj(error.message); setListe([]); return; }
      setListe(data || []);
    } finally { setYukleniyor(false); }
  }, [durum]);

  useEffect(() => { getir(); }, [getir]);

  const telGetir = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('telefon_izin_listesi');
      setTelListe(data || []);
    } catch { setTelListe([]); }
  }, []);

  useEffect(() => { if (aktifSekme === 'telefonlar') telGetir(); }, [aktifSekme, telGetir]);

  const telEkle = async () => {
    if (tTel.replace(/[^0-9]/g,'').length < 10) { setMesaj('⚠️ Geçerli telefon girin.'); return; }
    setTelYuk(true); setMesaj('');
    try {
      const { data, error } = await supabase.rpc('telefon_izni_ekle', {
        p_telefon: tTel.trim(), p_firma: tFirma.trim() || null,
        p_yetkili: tYetkili.trim() || null, p_notlar: tNot.trim() || null, p_ekleyen: 'ADMIN',
      });
      if (error || !(data as any)?.ok) { setMesaj('❌ ' + (error?.message || (data as any)?.mesaj)); return; }
      setMesaj('✅ ' + (data as any).mesaj);
      setTTel(''); setTFirma(''); setTYetkili(''); setTNot('');
      await telGetir();
    } finally { setTelYuk(false); }
  };

  const telSil = async (id: string) => {
    if (!confirm('Bu numarayı silmek istiyor musunuz?')) return;
    const { data } = await supabase.rpc('telefon_izni_sil', { p_id: id });
    if ((data as any)?.ok) { setMesaj('✅ Silindi'); await telGetir(); }
  };

  const onayla = async (id: string) => {
    setIslemde(id);
    setMesaj("");
    try {
      const { data, error } = await supabase.rpc("musteri_hesap_onayla", {
        p_id: id, p_durum: "onaylandi", p_sebep: null, p_onaylayan: "ADMIN",
      });
      if (error || !(data as any)?.ok) { setMesaj("❌ " + (error?.message || (data as any)?.mesaj)); return; }
      setMesaj("✅ " + (data as any).mesaj);
      await getir();
    } finally { setIslemde(null); }
  };

  const reddet = async () => {
    if (!redModal) return;
    setIslemde(redModal);
    try {
      const { data, error } = await supabase.rpc("musteri_hesap_onayla", {
        p_id: redModal, p_durum: "reddedildi",
        p_sebep: redSebep.trim() || "Belirtilmedi", p_onaylayan: "ADMIN",
      });
      if (error || !(data as any)?.ok) { setMesaj("❌ " + (error?.message || (data as any)?.mesaj)); return; }
      setMesaj("✅ " + (data as any).mesaj);
      setRedModal(null); setRedSebep("");
      await getir();
    } finally { setIslemde(null); }
  };

  const filtreli = liste.filter((h: any) => {
    const a = arama.toLowerCase();
    return !a
      || String(h.firma_adi || "").toLowerCase().includes(a)
      || String(h.kullanici_adi || "").toLowerCase().includes(a)
      || String(h.telefon || "").includes(a)
      || String(h.ad_soyad || "").toLowerCase().includes(a);
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-2.5 rounded-xl">
              <ArrowLeft size={16} />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="bg-white/10 p-2 rounded-xl"><Users size={18} /></div>
              <div>
                <h1 className="font-black text-sm leading-none">MÜŞTERİ HESAPLARI</h1>
                <p className="text-[10px] text-slate-400 font-bold mt-1">
                  {liste.length} kayıt · onay bekleyenler
                </p>
              </div>
            </div>
          </div>
          <button onClick={getir} disabled={yukleniyor} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-2.5 rounded-xl">
            <RefreshCw size={16} className={yukleniyor ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-3">
        {/* ANA SEKMELER */}
        <div className="flex gap-2">
          <button onClick={() => setAktifSekme('hesaplar')}
            className={`flex-1 py-3 rounded-xl text-[11px] font-black transition ${aktifSekme === 'hesaplar' ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
            👥 HESAP TALEPLERİ
          </button>
          <button onClick={() => setAktifSekme('telefonlar')}
            className={`flex-1 py-3 rounded-xl text-[11px] font-black transition ${aktifSekme === 'telefonlar' ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
            📞 TELEFON TANIMLA
          </button>
        </div>

        {aktifSekme === 'telefonlar' && <TelefonRehberi />}

        {aktifSekme === 'hesaplar' && (
        <>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {([["bekliyor","⏳ BEKLEYEN"],["onaylandi","✅ ONAYLI"],["reddedildi","❌ REDDEDİLEN"],["hepsi","TÜMÜ"]] as const).map(([k, a]) => (
            <button key={k} onClick={() => setDurum(k)}
              className={`px-4 py-2.5 rounded-xl text-[11px] font-black whitespace-nowrap transition ${
                durum === k ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
              {a}
            </button>
          ))}
        </div>

        {/* ARAMA */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
          <input value={arama} onChange={(e) => setArama(e.target.value)}
            placeholder="Firma, kullanıcı adı, telefon ara..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-slate-900" />
        </div>

        {mesaj && (
          <div className={`p-3 rounded-xl text-[11px] font-bold ${
            mesaj.startsWith("✅") ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
            {mesaj}
          </div>
        )}

        {yukleniyor ? (
          <div className="py-16 text-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" /></div>
        ) : filtreli.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
            <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-black text-slate-500">
              {durum === "bekliyor" ? "Onay bekleyen kayıt yok" : "Kayıt yok"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtreli.map((h: any) => (
              <div key={h.id} className="bg-white border border-slate-200 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-black text-slate-800">{h.firma_adi}</h3>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded ${
                        h.durum === "onaylandi" ? "bg-emerald-100 text-emerald-700"
                        : h.durum === "reddedildi" ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-700"}`}>
                        {h.durum === "onaylandi" ? "✅ ONAYLI" : h.durum === "reddedildi" ? "❌ RED" : "⏳ BEKLİYOR"}
                      </span>
                      {Number(h.vinç_sayisi) > 0 && (
                        <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          🏗️ {h.vinç_sayisi} vinç
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] font-bold text-slate-500">
                      <span className="flex items-center gap-1"><User size={10} /> {h.kullanici_adi}</span>
                      {h.ad_soyad && <span>{h.ad_soyad}</span>}
                      <span className="flex items-center gap-1"><Phone size={10} /> {h.telefon}</span>
                      {h.email && <span>{h.email}</span>}
                    </div>
                    <p className="text-[9px] text-slate-400 font-medium mt-1.5 flex items-center gap-1">
                      <Clock size={9} /> Kayıt: {h.olusturma}
                      {h.onay_tarihi && ` · Onay: ${h.onay_tarihi}`}
                    </p>
                    {h.ret_sebebi && (
                      <p className="text-[9px] text-rose-600 font-bold mt-1">Ret sebebi: {h.ret_sebebi}</p>
                    )}
                  </div>

                  {h.durum === "bekliyor" && (
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => onayla(h.id)} disabled={islemde === h.id}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-3 py-2 rounded-xl text-[10px] font-black flex items-center gap-1">
                        {islemde === h.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                        ONAYLA
                      </button>
                      <button onClick={() => { setRedModal(h.id); setRedSebep(""); }}
                        className="bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 px-3 py-2 rounded-xl text-[10px] font-black flex items-center gap-1">
                        <XCircle size={11} /> RED
                      </button>
                    </div>
                  )}

                  {h.durum === "onaylandi" && (
                    <button onClick={() => { setRedModal(h.id); setRedSebep(""); }}
                      className="bg-slate-100 text-slate-600 border border-slate-200 hover:bg-rose-50 hover:text-rose-600 px-3 py-2 rounded-xl text-[10px] font-black shrink-0">
                      İPTAL ET
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        </>
        )}
      </div>

      {/* RED MODAL */}
      <AnimatePresence>
        {redModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
              className="bg-white rounded-3xl w-full max-w-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={18} className="text-rose-600" />
                <h3 className="font-black text-sm text-slate-800">Hesabı Reddet</h3>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mb-3">
                Müşteri bu sebebi giriş ekranında görecek.
              </p>
              <textarea rows={3} value={redSebep} onChange={(e) => setRedSebep(e.target.value)}
                placeholder="Örn: Telefon numarası sistemde kayıtlı değil"
                className="w-full p-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs resize-none outline-none focus:border-rose-400" />
              <div className="flex gap-2 mt-3">
                <button onClick={() => { setRedModal(null); setRedSebep(""); }}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl text-[11px] font-black">
                  İPTAL
                </button>
                <button onClick={reddet} disabled={islemde === redModal}
                  className="flex-1 py-3 bg-rose-600 text-white rounded-xl text-[11px] font-black disabled:bg-slate-300">
                  {islemde === redModal ? "..." : "REDDET"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
