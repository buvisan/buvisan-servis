"use client";

// ----------------------------------------------------------------------------
// BUVISAN - MÜŞTERİ İMZA PANELİ ✍️
// Parmakla (veya fareyle) imza atılır, PNG olarak dışarı verilir.
// ----------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine, CheckCircle2 } from 'lucide-react';

export default function ImzaPad({ onChange }: { onChange: (blob: Blob | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ciziyor = useRef(false);
  const sonNokta = useRef<{ x: number; y: number } | null>(null);
  const [bos, setBos] = useState(true);

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
    e.preventDefault();
    try { canvasRef.current?.setPointerCapture(e.pointerId); } catch { /* yoksay */ }
    ciziyor.current = true;
    sonNokta.current = noktaAl(e);
  };

  const ciz = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ciziyor.current) return;
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

  const bitir = () => {
    if (!ciziyor.current) return;
    ciziyor.current = false;
    sonNokta.current = null;
    canvasRef.current?.toBlob((blob) => onChange(blob), 'image/png');
  };

  const temizle = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setBos(true);
    onChange(null);
  };

  return (
    <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
          <PenLine className="w-4 h-4 text-purple-500" /> Müşteri İmzası
        </h3>
        {!bos && (
          <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1">
            <CheckCircle2 size={11} /> İMZA ALINDI
          </span>
        )}
      </div>

      <p className="text-[10px] text-slate-500 font-medium mb-3 ml-1">
        Lütfen işi teslim aldığınıza dair imzalayın. Parmakla veya kalemle çizebilirsiniz.
      </p>

      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={basla}
          onPointerMove={ciz}
          onPointerUp={bitir}
          onPointerLeave={bitir}
          onPointerCancel={bitir}
          className="w-full h-40 bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl touch-none cursor-crosshair"
        />
        {bos && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-300">
            <PenLine size={26} />
            <span className="text-[11px] font-bold mt-1">Buraya imzalayın</span>
          </div>
        )}
        <div className="absolute bottom-3 left-4 right-4 border-b border-dashed border-slate-300 pointer-events-none"></div>
      </div>

      <button
        type="button"
        onClick={temizle}
        className="w-full mt-3 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-[11px] font-black hover:bg-slate-200 active:scale-95 transition flex items-center justify-center gap-2"
      >
        <Eraser size={13} /> İMZAYI TEMİZLE
      </button>
    </div>
  );
}
