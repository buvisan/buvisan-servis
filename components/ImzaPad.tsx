"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - MÜŞTERİ İMZA PANELİ ✍️  (v3 — HİBRİT)
// ✅ Parmak kalkınca OTOMATİK kaydeder (veri kaybolmaz — hata çözümü)
// ✅ Pad AÇIK kalır — müşteri yeniden çizebilir
// ✅ "İMZAYI KAYDET VE KAPAT" → onaylar (onKaydet)
// ----------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine, CheckCircle2, RotateCcw } from 'lucide-react';

export default function ImzaPad({
  onChange,
  onKaydet,
  baslik = 'Müşteri İmzası',
}: {
  onChange: (blob: Blob | null) => void;
  onKaydet?: () => void;
  baslik?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ciziyor = useRef(false);
  const sonNokta = useRef<{ x: number; y: number } | null>(null);
  const [bos, setBos] = useState(true);
  const [kaydedildi, setKaydedildi] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const oran = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * oran;
    canvas.height = canvas.clientHeight * oran;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(oran, oran);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  const noktaAl = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const basla = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (kaydedildi) return;
    e.preventDefault();
    try { canvasRef.current?.setPointerCapture(e.pointerId); } catch { /* yoksay */ }
    ciziyor.current = true;
    sonNokta.current = noktaAl(e);
  };

  const ciz = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ciziyor.current || kaydedildi) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    const p = noktaAl(e);
    if (!ctx || !sonNokta.current) return;
    ctx.beginPath();
    ctx.moveTo(sonNokta.current.x, sonNokta.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    sonNokta.current = p;
    if (bos) setBos(false);
  };

  // ⭐ HİBRİT: parmak kalkınca OTOMATİK kaydet (veri KAYBOLMAZ)
  const bitir = () => {
    if (!ciziyor.current) return;
    ciziyor.current = false;
    sonNokta.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) onChange(blob);   // ⚡ hemen gönder
    }, 'image/png');
  };

  const kaydet = () => {
    const canvas = canvasRef.current;
    if (!canvas || bos) return;
    canvas.toBlob((blob) => {
      if (blob) {
        onChange(blob);
        setKaydedildi(true);
        onKaydet?.();
      }
    }, 'image/png');
  };

  const temizle = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setBos(true);
    setKaydedildi(false);
    onChange(null);
  };

  return (
    <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
          <PenLine className="w-4 h-4 text-purple-500" /> {baslik}
        </h3>
        {kaydedildi ? (
          <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1">
            <CheckCircle2 size={11} /> KAYDEDİLDİ
          </span>
        ) : !bos ? (
          <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            ✓ OTOMATİK KAYDEDİLDİ
          </span>
        ) : null}
      </div>

      <p className="text-[10px] text-slate-500 font-medium mb-3 ml-1">
        {kaydedildi
          ? 'İmza kaydedildi. Farklı imza için "Tekrar İmzala" butonunu kullanın.'
          : 'Lütfen imzalayın. Parmağınızı kaldırdığınızda OTOMATİK kaydedilir.'}
      </p>

      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={basla}
          onPointerMove={ciz}
          onPointerUp={bitir}
          onPointerLeave={bitir}
          onPointerCancel={bitir}
          className={`w-full h-40 bg-slate-50 border-2 border-dashed rounded-2xl touch-none ${
            kaydedildi ? 'border-emerald-300 opacity-80' : 'border-slate-300 cursor-crosshair'}`}
        />
        {bos && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-300">
            <PenLine size={26} />
            <span className="text-[11px] font-bold mt-1">Buraya imzalayın</span>
          </div>
        )}
        <div className="absolute bottom-3 left-4 right-4 border-b border-dashed border-slate-300 pointer-events-none"></div>
      </div>

      {kaydedildi ? (
        <button
          type="button"
          onClick={temizle}
          className="w-full mt-3 py-3 bg-slate-100 text-slate-700 rounded-xl text-[11px] font-black hover:bg-slate-200 active:scale-95 transition flex items-center justify-center gap-2"
        >
          <RotateCcw size={13} /> TEKRAR İMZALA
        </button>
      ) : (
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={temizle}
            disabled={bos}
            className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl text-[11px] font-black hover:bg-slate-200 disabled:opacity-40 active:scale-95 transition flex items-center justify-center gap-2"
          >
            <Eraser size={13} /> TEMİZLE
          </button>
          <button
            type="button"
            onClick={kaydet}
            disabled={bos}
            className="flex-[2] py-3 bg-emerald-600 text-white rounded-xl text-[11px] font-black hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 active:scale-95 transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            <CheckCircle2 size={14} /> İMZAYI KAYDET VE KAPAT
          </button>
        </div>
      )}
    </div>
  );
}
