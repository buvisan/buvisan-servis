"use client";
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// Haritayı dinamik olarak import ediyoruz ve Sunucu Taraflı Render (SSR)'ı kapatıyoruz.
const HaritaBileseni2 = dynamic(() => import('@/components/HaritaBileseni2'), {
  ssr: false, // 🔥 İŞTE SİHİRLİ KOD BURASI!
  loading: () => (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin w-12 h-12 text-blue-600" />
        <p className="text-slate-500 font-bold animate-pulse">Buvisan Uydu Haritası Yükleniyor...</p>
      </div>
    </div>
  ),
});

export default function HaritaSayfasi() {
  return (
    <div className="h-screen w-full">
      <HaritaBileseni2 />
    </div>
  );
}