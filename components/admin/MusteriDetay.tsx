"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - MÜŞTERİ DETAY PANELİ 👥
// Sohbet · Pazarlık · Teklifler · Makineler · Servis · Aktif İşler
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Loader2, X, Send, MessageSquare, Star, Package, Wrench,
  CheckCircle2, XCircle, RefreshCw, AlertTriangle, Pencil,
} from "lucide-react";

type Sekme = "sohbet" | "pazarlik" | "teklif" | "makine" | "servis";

export default function MusteriDetay({ hesapId, onKapat }: { hesapId: string; onKapat: () => void }) {
  const [veri, setVeri] = useState<any>(null);
  const [sekme, setSekme] = useState<Sekme>("sohbet");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [mesaj, setMesaj] = useState("");
  const [yeniMesaj, setYeniMesaj] = useState("");
  const [gonderiyor, setGonderiyor] = useState(false);
  const [pzModal, setPzModal] = useState<any | null>(null);
  const [pzNot, setPzNot] = useState("");
  const [pzTutar, setPzTutar] = useState(0);
  const sonRef = useRef<HTMLDivElement | null>(null);

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data, error } = await supabase.rpc("musteri_detay", { p_hesap_id: hesapId });
      if (error || !(data as any)?.ok) { setMesaj("❌ " + (error?.message || (data as any)?.mesaj)); return; }
      setVeri(data);
    } finally { setYukleniyor(false); }
  }, [hesapId]);

  useEffect(() => { getir(); }, [getir]);
  useEffect(() => {
    const z = setInterval(getir, 5000);
    return () => clearInterval(z);
  }, [getir]);
  // ⚡ REALTIME
  useEffect(() => {
    let kanal: any = null;
    try {
      kanal = supabase
        .channel("admin-sohbet-rt-" + hesapId)
        .on("postgres_changes" as any,
          { event: "INSERT", schema: "public", table: "musteri_sohbet" },
          async (payload: any) => {
            try {
              const yeni = payload?.new;
              if (yeni && yeni.id && yeni.hesap_id === hesapId) {
                setVeri((o: any) => {
                  if (!o) return o;
                  const mevcut = o.sohbet || [];
                  if (mevcut.some((x: any) => x.id === yeni.id)) return o;
                  return {
                    ...o,
                    sohbet: [...mevcut, {
                      id: yeni.id,
                      gonderen: yeni.gonderen,
                      mesaj: yeni.mesaj,
                      tarih: new Date(yeni.created_at || Date.now()).toLocaleString("tr-TR", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      }),
                    }],
                  };
                });
              }
            } catch { /* yoksay */ }
            setTimeout(() => { getir(); }, 700);
          })
        .subscribe();
    } catch { /* yoksay */ }
    return () => { try { if (kanal) supabase.removeChannel(kanal); } catch { /* yoksay */ } };
  }, [hesapId, getir]);

  useEffect(() => { if (sonRef.current) sonRef.current.scrollIntoView({ behavior: "smooth" }); }, [veri, sekme]);

  const mesajGonder = async () => {
    if (!yeniMesaj.trim() || gonderiyor) return;
    setGonderiyor(true);
    try {
      const { data } = await supabase.rpc("admin_mesaj_gonder", {
        p_hesap_id: hesapId, p_mesaj: yeniMesaj.trim(),
      });
      if ((data as any)?.ok) { setYeniMesaj(""); setMesaj(""); await getir(); }
      else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
    } finally { setGonderiyor(false); }
  };

  const pazarlikCevap = async (durum: string) => {
    if (!pzModal) return;
    const { data } = await supabase.rpc("pazarlik_cevapla", {
      p_id: pzModal.id, p_durum: durum,
      p_admin_notu: pzNot.trim() || null,
      p_yeni_tutar: durum === "revize" && pzTutar > 0 ? pzTutar : null,
    });
    if ((data as any)?.ok) {
      setMesaj("✅ " + (data as any).mesaj);
      setPzModal(null); setPzNot(""); setPzTutar(0);
      await getir();
    } else setMesaj("❌ " + ((data as any)?.mesaj || "Hata"));
  };

  const h = veri?.hesap || {};
  const sohbet = veri?.sohbet || [];
  const pazarliklar = veri?.pazarliklar || [];
  const teklifler = veri?.teklifler || [];
  const makineler = veri?.makineler || [];
  const servisler = veri?.servisler || [];
  const aktif = veri?.aktif_isler || [];

  const sekmeler: { k: Sekme; ad: string; ikon: any; badge: number }[] = [
    { k: "sohbet", ad: "SOHBET", ikon: MessageSquare, badge: Number(veri?.okunmamis_mesaj || 0) },
    { k: "pazarlik", ad: "PAZARLIK", ikon: AlertTriangle, badge: Number(veri?.bekleyen_pazarlik || 0) },
    { k: "teklif", ad: "TEKLİF", ikon: Star, badge: 0 },
    { k: "makine", ad: "MAKİNE", ikon: Package, badge: makineler.length },
    { k: "servis", ad: "SERVİS", ikon: Wrench, badge: servisler.length },
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm z-[999] flex items-center justify-center p-2 md:p-4">
      <div className="bg-white rounded-3xl w-full max-w-3xl overflow-hidden flex flex-col" style={{ maxHeight: "94vh" }}>
        {/* BAŞLIK */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-white font-black text-sm truncate">{h.firma || "Müşteri"}</h2>
            <p className="text-slate-400 text-[10px] font-bold mt-0.5 truncate">
              {h.kullanici} · {h.telefon} · Kayıt: {h.kayit}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={getir} className="bg-white/10 hover:bg-white/20 p-2 rounded-lg">
              <RefreshCw size={14} className={`text-white ${yukleniyor ? "animate-spin" : ""}`} />
            </button>
            <button onClick={onKapat} className="bg-white/10 hover:bg-red-500 p-2 rounded-lg"><X size={14} className="text-white" /></button>
          </div>
        </div>

        {/* SEKMELER */}
        <div className="flex gap-1 bg-slate-50 px-2 py-2 overflow-x-auto shrink-0 border-b border-slate-200">
          {sekmeler.map((s) => {
            const Ikon = s.ikon;
            const sec = sekme === s.k;
            return (
              <button key={s.k} onClick={() => setSekme(s.k)}
                className={`flex-1 min-w-fit px-2.5 py-2 rounded-xl text-[10px] font-black flex items-center justify-center gap-1 relative transition ${sec ? "bg-slate-900 text-white" : "bg-white text-slate-500 border border-slate-200"}`}>
                <Ikon size={11} /> {s.ad}
                {s.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] font-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center">{s.badge}</span>
                )}
              </button>
            );
          })}
        </div>

        {mesaj && (
          <div className={`mx-3 mt-2 p-2.5 rounded-xl text-[10px] font-bold shrink-0 ${mesaj.startsWith("✅") ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{mesaj}</div>
        )}

        {/* İÇERİK */}
        <div className="flex-1 overflow-y-auto p-3">
          {yukleniyor && !veri ? (
            <div className="py-20 text-center"><Loader2 className="w-7 h-7 animate-spin text-slate-300 mx-auto" /></div>
          ) : sekme === "sohbet" ? (
            <div className="space-y-2">
              {sohbet.length === 0 ? (
                <p className="text-center text-slate-400 text-[11px] font-bold py-10">Henüz mesaj yok</p>
              ) : sohbet.map((m: any) => {
                const admin = m.gonderen === "admin";
                return (
                  <div key={m.id} className={`flex ${admin ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${admin ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"}`}>
                      <p className="text-[11px] leading-relaxed whitespace-pre-wrap">{m.mesaj}</p>
                      <p className="text-[8px] font-bold mt-1 text-slate-400">{m.tarih}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={sonRef} />
            </div>
          ) : sekme === "pazarlik" ? (
            <div className="space-y-2">
              {pazarliklar.length === 0 ? (
                <p className="text-center text-slate-400 text-[11px] font-bold py-10">Pazarlık yok</p>
              ) : pazarliklar.map((p: any) => {
                const bekliyor = String(p.durum).toLowerCase() === "bekliyor";
                return (
                  <div key={p.id} className={`rounded-2xl p-3 border ${bekliyor ? "bg-amber-50 border-amber-300" : "bg-slate-50 border-slate-200"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-black text-slate-500 uppercase">{p.kaynak} · {p.tarih}</span>
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${
                        p.durum === "kabul" ? "bg-emerald-100 text-emerald-700"
                        : p.durum === "red" ? "bg-rose-100 text-rose-700"
                        : p.durum === "revize" ? "bg-blue-100 text-blue-700"
                        : "bg-amber-100 text-amber-700"}`}>
                        {String(p.durum).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <div>
                        <p className="text-[8px] font-black text-slate-400">TEKLİF</p>
                        <p className="text-[12px] font-black text-slate-700">{Number(p.teklif_tutar || 0).toLocaleString("tr-TR")} ₺</p>
                      </div>
                      <span className="text-slate-300">→</span>
                      <div>
                        <p className="text-[8px] font-black text-slate-400">İSTENEN</p>
                        <p className="text-[12px] font-black text-amber-700">{Number(p.istenen_tutar || 0).toLocaleString("tr-TR")} ₺</p>
                      </div>
                      <div className="ml-auto">
                        <p className="text-[8px] font-black text-slate-400">FARK</p>
                        <p className="text-[12px] font-black text-rose-600">−{Number(p.fark || 0).toLocaleString("tr-TR")} ₺</p>
                      </div>
                    </div>
                    {p.mesaj && <p className="text-[10px] text-slate-600 mt-2 italic">"{p.mesaj}"</p>}
                    {p.admin_notu && <p className="text-[9px] text-slate-500 mt-1">Not: {p.admin_notu}</p>}
                    {bekliyor && (
                      <div className="flex gap-1.5 mt-2">
                        <button onClick={() => { setPzModal(p); setPzTutar(Number(p.istenen_tutar)); setPzNot(""); }}
                          className="flex-[2] py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black flex items-center justify-center gap-1">
                          <CheckCircle2 size={11} /> CEVAPLA
                        </button>
                        <button onClick={() => { setPzModal(p); setPzNot(""); }}
                          className="flex-1 py-2 bg-slate-200 text-slate-700 rounded-lg text-[10px] font-black">
                          HIZLI
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : sekme === "teklif" ? (
            <div className="space-y-2">
              {teklifler.length === 0 ? (
                <p className="text-center text-slate-400 text-[11px] font-bold py-10">Teklif yok</p>
              ) : teklifler.map((t: any, i: number) => {
                const dn = String(t.durum || "").toLowerCase();
                const bek = dn === "bekliyor" || dn === "";
                return (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <p className="text-[11px] font-black text-slate-800">{t.baslik}</p>
                        <span className="text-[8px] font-black text-slate-500 bg-white px-1.5 py-0.5 rounded border">{t.no}</span>
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${bek ? "bg-amber-100 text-amber-700" : dn === "onaylandi" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                          {bek ? "BEKLİYOR" : dn === "onaylandi" ? "ONAYLANDI" : "RED"}
                        </span>
                      </div>
                      <p className="text-[12px] font-black text-emerald-600 shrink-0">{Number(t.tutar || 0).toLocaleString("tr-TR")} ₺</p>
                    </div>
                    <p className="text-[9px] text-slate-500 mt-1 line-clamp-2">{t.aciklama}</p>
                  </div>
                );
              })}
            </div>
          ) : sekme === "makine" ? (
            <div className="space-y-1.5">
              {makineler.length === 0 ? (
                <p className="text-center text-slate-400 text-[11px] font-bold py-10">Makine yok</p>
              ) : makineler.map((m: any, i: number) => (
                <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                  <Package size={14} className="text-slate-400 shrink-0" />
                  <p className="text-[11px] font-black text-slate-800 flex-1 truncate">{m.model}</p>
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                    m.kaynak === "kendi" ? "bg-indigo-100 text-indigo-700"
                    : m.kaynak === "talep" ? "bg-blue-100 text-blue-700"
                    : "bg-slate-200 text-slate-600"}`}>
                    {String(m.kaynak).toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {aktif.length > 0 && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3 mb-2">
                  <p className="text-[9px] font-black text-blue-700 uppercase mb-1.5">AKTİF İŞLER ({aktif.length})</p>
                  {aktif.map((a: any) => (
                    <div key={a.id} className="bg-white rounded-lg p-2 mb-1.5 last:mb-0">
                      <p className="text-[10px] font-bold text-slate-700 line-clamp-2">{a.aciklama}</p>
                      <p className="text-[8px] text-slate-400 font-bold mt-0.5">{a.tarih} · {a.durum}</p>
                    </div>
                  ))}
                </div>
              )}
              {servisler.length === 0 ? (
                <p className="text-center text-slate-400 text-[11px] font-bold py-10">Servis kaydı yok</p>
              ) : servisler.map((s: any, i: number) => (
                <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[9px] font-black text-slate-500">{s.tarih}</p>
                        {s.form_no && <span className="text-[8px] font-black text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">{s.form_no}</span>}
                      </div>
                      <p className="text-[10px] font-bold text-slate-700 mt-1 line-clamp-2">{s.aciklama}</p>
                      <p className="text-[8px] text-slate-400 mt-0.5">👤 {s.personel}</p>
                    </div>
                    {Number(s.tutar) > 0 && <p className="text-[11px] font-black text-emerald-600 shrink-0">{Number(s.tutar).toLocaleString("tr-TR")} ₺</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SOHBET GİRİŞİ */}
        {sekme === "sohbet" && (
          <div className="border-t border-slate-200 p-2.5 flex gap-2 shrink-0 bg-white">
            <input value={yeniMesaj} onChange={(e) => setYeniMesaj(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); mesajGonder(); } }}
              placeholder="Müşteriye mesaj yazın..."
              className="flex-1 p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-[11px] outline-none focus:border-violet-500" />
            <button onClick={mesajGonder} disabled={gonderiyor || !yeniMesaj.trim()}
              className="bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white px-3.5 rounded-xl flex items-center justify-center">
              {gonderiyor ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        )}
      </div>

      {/* PAZARLIK CEVAP MODAL */}
      {pzModal && (
        <div className="fixed inset-0 bg-slate-900/80 z-[1000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-4">
            <h3 className="font-black text-xs text-slate-800 uppercase mb-3">💬 PAZARLIĞA CEVAP</h3>
            <div className="bg-slate-50 rounded-xl p-3 mb-3">
              <p className="text-[9px] font-black text-slate-400">TEKLİF → İSTENEN</p>
              <p className="text-sm font-black text-slate-800">
                {Number(pzModal.teklif_tutar || 0).toLocaleString("tr-TR")} ₺ → {Number(pzModal.istenen_tutar || 0).toLocaleString("tr-TR")} ₺
              </p>
            </div>
            <label className="text-[9px] font-black text-slate-400 uppercase">Revize Tutar (opsiyonel)</label>
            <input type="number" value={pzTutar} onChange={(e) => setPzTutar(Number(e.target.value) || 0)}
              className="w-full mt-1 mb-2 p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none" />
            <label className="text-[9px] font-black text-slate-400 uppercase">Not</label>
            <textarea rows={2} value={pzNot} onChange={(e) => setPzNot(e.target.value)}
              placeholder="Müşteriye not..."
              className="w-full mt-1 mb-3 p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs resize-none outline-none" />
            <div className="grid grid-cols-3 gap-1.5">
              <button onClick={() => pazarlikCevap("kabul")} className="py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black">KABUL</button>
              <button onClick={() => pazarlikCevap("revize")} className="py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black">REVİZE</button>
              <button onClick={() => pazarlikCevap("red")} className="py-2.5 bg-rose-600 text-white rounded-xl text-[10px] font-black">RED</button>
            </div>
            <button onClick={() => setPzModal(null)} className="w-full mt-2 py-2 text-slate-500 text-[10px] font-black">KAPAT</button>
          </div>
        </div>
      )}
    </div>
  );
}
