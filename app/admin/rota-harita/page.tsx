'use client';

// ============================================================================
//  🗺️ ROTA & HARİTA MERKEZİ — canlı harita + akıllı rota + bölge yoğunluğu
// ----------------------------------------------------------------------------
//  Veri: harita_noktalari() · gunun_rotasi() · bolge_analizi()
//  Harita: Leaflet (CDN) + OpenStreetMap → ÜCRETSİZ, API ANAHTARI GEREKMEZ
//  Emniyet: Leaflet yüklenmezse sağ panelden devam edilir (ekran çökmez)
//  NOT: /admin/harita (eski uydu haritası) KORUNDU — burası yeni merkez
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Map, Loader2, RefreshCw, ArrowLeft, AlertTriangle, Navigation,
  MapPin, Truck, Wrench, CheckCircle2, Layers, TrendingUp, Route
} from 'lucide-react';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

const RENKLER: Record<string, string> = {
  vinc: '#3b82f6', talep: '#ef4444', bakim: '#f59e0b',
  yapildi: '#10b981', rota: '#8b5cf6',
};

export default function RotaHaritaPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);
  const katman = useRef<any>(null);
  const [hazir, setHazir] = useState(false);
  const [haritaHata, setHaritaHata] = useState(false);
  const [noktalar, setNoktalar] = useState<any>(null);
  const [rota, setRota] = useState<any>(null);
  const [bolgeler, setBolgeler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState('');
  const [goster, setGoster] = useState<Record<string, boolean>>({
    vinc: true, talep: true, bakim: false, yapildi: true, rota: true,
  });
  const [panel, setPanel] = useState<'rota' | 'bolge'>('rota');

  // Leaflet CDN
  useEffect(() => {
    if ((window as any).L) { setHazir(true); return; }
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.async = true;
    js.onload = () => setHazir(true);
    js.onerror = () => setHaritaHata(true);
    document.body.appendChild(js);
  }, []);

  const getir = useCallback(async () => {
    setYukleniyor(true); setHata('');
    try {
      const [n, r, b] = await Promise.all([
        supabase.rpc('harita_noktalari'),
        supabase.rpc('gunun_rotasi'),
        supabase.rpc('bolge_analizi'),
      ]);
      if (n.error) setHata(n.error.message);
      setNoktalar(n.data); setRota(r.data); setBolgeler(b.data || []);
    } finally { setYukleniyor(false); }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  useEffect(() => {
    const L = (window as any).L;
    if (!hazir || !L || !mapRef.current || !noktalar) return;

    if (!mapObj.current) {
      mapObj.current = L.map(mapRef.current).setView(
        [Number(noktalar?.merkez?.lat) || 40.195, Number(noktalar?.merkez?.lng) || 29.06], 10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap',
      }).addTo(mapObj.current);
      katman.current = L.layerGroup().addTo(mapObj.current);
    }

    katman.current.clearLayers();

    const ekle = (lat: any, lng: any, renk: string, baslik: string, alt: string, adres: string, tel: string) => {
      const la = Number(lat), ln = Number(lng);
      if (!la || !ln) return;
      L.circleMarker([la, ln], { radius: 7, fillColor: renk, color: '#fff', weight: 2, fillOpacity: 0.9 })
        .bindPopup(
          `<div style="font-family:system-ui;min-width:170px">
             <div style="font-weight:900;font-size:13px;color:#1e293b">${baslik || '-'}</div>
             <div style="font-size:11px;color:#64748b;margin-top:2px">${alt || ''}</div>
             ${adres ? `<div style="font-size:10px;color:#94a3b8;margin-top:4px">📍 ${adres}</div>` : ''}
             <div style="margin-top:8px;display:flex;gap:6px">
               <a href="https://www.google.com/maps/dir/?api=1&destination=${la},${ln}" target="_blank"
                  style="background:#0f172a;color:#fff;padding:5px 10px;border-radius:8px;font-size:10px;font-weight:800;text-decoration:none">YOL TARİFİ</a>
               ${tel ? `<a href="tel:${tel}" style="background:#10b981;color:#fff;padding:5px 10px;border-radius:8px;font-size:10px;font-weight:800;text-decoration:none">ARA</a>` : ''}
             </div>
           </div>`)
        .addTo(katman.current);
    };

    if (goster.vinc) (noktalar.vinc || []).forEach((x: any) => ekle(x.lat, x.lng, RENKLER.vinc, x.baslik, x.alt, x.adres, x.telefon));
    if (goster.talep) (noktalar.talep || []).forEach((x: any) => ekle(x.lat, x.lng, RENKLER.talep, '🔴 ' + x.baslik, x.alt, x.adres, x.telefon));
    if (goster.bakim) (noktalar.bakim || []).forEach((x: any) => ekle(x.lat, x.lng, RENKLER.bakim, '🔧 ' + x.baslik, x.alt, x.adres, x.telefon));
    if (goster.yapildi) (noktalar.yapildi || []).forEach((x: any) => ekle(x.lat, x.lng, RENKLER.yapildi, '✅ ' + x.baslik, x.alt, '', ''));

    if (goster.rota && rota?.duraklar?.length > 1) {
      const hat = rota.duraklar.map((d: any) => [Number(d.lat), Number(d.lng)]);
      L.polyline(hat, { color: RENKLER.rota, weight: 4, opacity: 0.85, dashArray: '8,6' }).addTo(katman.current);
      rota.duraklar.forEach((d: any) => {
        L.marker([Number(d.lat), Number(d.lng)], {
          icon: L.divIcon({
            className: '',
            html: `<div style="background:#8b5cf6;color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${d.sira}</div>`,
            iconSize: [24, 24], iconAnchor: [12, 12],
          }),
        }).bindPopup(`<b>${d.sira}. ${d.baslik}</b><br><span style="font-size:11px;color:#64748b">${d.tur} · ${d.mesafe} km</span>`)
          .addTo(katman.current);
      });
    }
  }, [hazir, noktalar, rota, goster]);

  const sayilar = noktalar?.sayilar || {};
  const durakSayisi = Number(rota?.durak_sayisi || 0);

  return (
    <div className="min-h-screen bg-slate-50/60 font-sans text-slate-800 flex flex-col">

      {/* ÜST BAR */}
      <div className="p-4 md:p-6 pb-3 bg-white border-b border-slate-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2.5">
              <Map className="text-blue-600" size={26} /> ROTA & HARİTA MERKEZİ
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">
              {sayilar.vinc || 0} vinç · {sayilar.talep || 0} talep · {sayilar.bakim || 0} bakım · bugün {sayilar.yapildi || 0} iş
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={getir} disabled={yukleniyor}
              className="bg-white border border-slate-200 px-3.5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-slate-100">
              <RefreshCw size={15} className={yukleniyor ? 'animate-spin' : ''} /> YENİLE
            </button>
            <Link href="/admin" className="bg-slate-900 text-white px-3.5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2">
              <ArrowLeft size={15} /> PANEL
            </Link>
          </div>
        </div>

        <div className="flex gap-2 mt-3 flex-wrap">
          {[
            { k: 'vinc', a: 'Vinçler', r: RENKLER.vinc, i: <MapPin size={12} /> },
            { k: 'talep', a: 'Talepler', r: RENKLER.talep, i: <AlertTriangle size={12} /> },
            { k: 'bakim', a: 'Bakım', r: RENKLER.bakim, i: <Wrench size={12} /> },
            { k: 'yapildi', a: 'Bugün yapılan', r: RENKLER.yapildi, i: <CheckCircle2 size={12} /> },
            { k: 'rota', a: 'Rota', r: RENKLER.rota, i: <Route size={12} /> },
          ].map((l) => (
            <button key={l.k} onClick={() => setGoster((g) => ({ ...g, [l.k]: !g[l.k] }))}
              className={`px-3 py-2 rounded-xl text-[11px] font-black border transition flex items-center gap-1.5 ${
                goster[l.k] ? 'text-white border-transparent' : 'bg-white text-slate-400 border-slate-200'}`}
              style={goster[l.k] ? { backgroundColor: l.r } : {}}>
              {l.i} {l.a}
            </button>
          ))}
        </div>
      </div>

      {hata && (
        <div className="m-4 bg-rose-50 border border-rose-200 rounded-2xl p-4">
          <p className="font-black text-rose-800 text-xs flex items-center gap-2"><AlertTriangle size={15} /> Veri alınamadı</p>
          <p className="text-[11px] text-rose-600 font-medium mt-1">{hata}</p>
          <p className="text-[11px] text-rose-500 font-bold mt-1">
            → <code className="bg-white px-1 rounded">75-harita-ve-rota.sql</code> çalıştırıldı mı?
          </p>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* HARİTA */}
        <div className="relative flex-1 min-h-[400px] bg-slate-200">
          {yukleniyor && !noktalar && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center">
                <Loader2 className="w-9 h-9 animate-spin text-slate-400 mx-auto" />
                <p className="text-[11px] font-bold text-slate-400 mt-2">Harita hazırlanıyor...</p>
              </div>
            </div>
          )}
          {haritaHata && (
            <div className="absolute inset-0 flex items-center justify-center p-6 z-10">
              <div className="text-center max-w-sm">
                <Map className="w-11 h-11 text-slate-300 mx-auto mb-2" />
                <p className="font-black text-slate-600 text-sm">Harita yüklenemedi</p>
                <p className="text-[11px] text-slate-400 font-medium mt-1">
                  OpenStreetMap erişimi gerekli. Sağdaki rota/bölge panelinden devam edebilirsin.
                </p>
              </div>
            </div>
          )}
          <div ref={mapRef} className="absolute inset-0" />

          {durakSayisi > 0 && (
            <div className="absolute top-3 left-3 bg-white/95 backdrop-blur rounded-2xl shadow-lg px-4 py-3 z-[500]">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">BUGÜNÜN ROTASI</p>
              <p className="text-lg font-black text-slate-800 leading-none mt-0.5">
                {durakSayisi} durak · {rota?.toplam_km} km
              </p>
              <p className="text-[10px] font-bold text-violet-600 mt-1">~{rota?.tahmini_sure_saat} saat</p>
            </div>
          )}
        </div>

        {/* SAĞ PANEL */}
        <div className="lg:w-[380px] bg-white border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col">
          <div className="flex border-b border-slate-100">
            {[
              { k: 'rota', a: 'ROTA', i: <Navigation size={13} /> },
              { k: 'bolge', a: 'BÖLGELER', i: <Layers size={13} /> },
            ].map((s) => (
              <button key={s.k} onClick={() => setPanel(s.k as any)}
                className={`flex-1 py-3 text-[11px] font-black flex items-center justify-center gap-1.5 transition ${
                  panel === s.k ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}>
                {s.i} {s.a}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 max-h-[55vh] lg:max-h-[calc(100vh-220px)]">
            {panel === 'rota' ? (
              durakSayisi === 0 ? (
                <div className="py-10 text-center">
                  <Truck className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs font-black text-slate-500">Bugün için durak yok</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">
                    Koordinatlı randevu, bakım veya talep eklendiğinde rota oluşur.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(rota?.duraklar || []).map((d: any, i: number) => (
                    <motion.div key={i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.3) }}
                      className="flex items-start gap-3 bg-slate-50 rounded-2xl p-3 border border-slate-100">
                      <span className="w-7 h-7 rounded-full bg-violet-600 text-white flex items-center justify-center font-black text-xs shrink-0">
                        {d.sira}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-black text-slate-800 truncate">{d.baslik}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] font-black text-slate-400">{d.tur}</span>
                          <span className="text-[9px] font-black text-violet-600">+{d.mesafe} km</span>
                        </div>
                        {d.adres && <p className="text-[9px] text-slate-400 font-medium truncate mt-0.5">📍 {d.adres}</p>}
                      </div>
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`}
                        target="_blank" rel="noopener noreferrer"
                        className="shrink-0 bg-slate-900 text-white px-2.5 py-1.5 rounded-lg font-black text-[9px]">GİT</a>
                    </motion.div>
                  ))}
                  <div className="bg-violet-50 border border-violet-200 rounded-2xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-violet-700 uppercase">TOPLAM</span>
                      <span className="text-sm font-black text-violet-800">{rota?.toplam_km} km</span>
                    </div>
                    <p className="text-[10px] font-bold text-violet-500 mt-1">~{rota?.tahmini_sure_saat} saat tahmini</p>
                  </div>
                </div>
              )
            ) : (
              bolgeler.length === 0 ? (
                <p className="py-10 text-center text-xs font-bold text-slate-400">Bölge verisi yok.</p>
              ) : (
                <div className="space-y-2">
                  {bolgeler.map((b: any, i: number) => (
                    <div key={i} className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[12px] font-black text-slate-800 truncate">{b.bolge}</p>
                          <p className="text-[9px] font-bold text-slate-400">{b.durum}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base font-black text-slate-700 leading-none">{b.vinc_sayisi}</p>
                          <p className="text-[9px] font-bold text-slate-400">vinç</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
                        <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                          <TrendingUp size={10} /> {para(b.toplam_ciro)} ₺
                        </span>
                        <span className="text-[9px] font-bold text-slate-400">
                          {b.son_servis ? `son ${b.son_servis}` : 'servis yok'}
                        </span>
                      </div>
                      {Number(b.bakim_bekleyen) > 0 && (
                        <p className="text-[9px] font-black text-amber-600 mt-1">⚠️ {b.bakim_bekleyen} vinç bakım bekliyor</p>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
