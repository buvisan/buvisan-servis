"use client";

// ----------------------------------------------------------------------------
// BUVISAN - MUSTERI RANDEVU TAKVIMI 🗓️
// Gunde en fazla 3 randevu. Dolu gunler ve kapali gunler (hafta sonu/tatil)
// musteri tarafindan SECILEMEZ. Kisisel veri gostermez, sadece doluluk sayisi.
// ----------------------------------------------------------------------------

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Loader2, Lock, CheckCircle2, CalendarDays, Users } from 'lucide-react';

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export const isoTarih = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const tarihYaz = (t: string) => {
  if (!t) return '';
  const [y, m, g] = t.split('-').map(Number);
  const d = new Date(y, m - 1, g);
  return `${g} ${AYLAR[m - 1]} ${y}, ${GUNLER[(d.getDay() + 6) % 7]}`;
};

type GunBilgi = { tarih: string; dolu: number; kapasite: number; acik: boolean };

const RENK: Record<string, { secili: string; nokta: string; yazi: string; halka: string; buton: string }> = {
  rose:   { secili: 'bg-rose-600 border-rose-600 text-white shadow-lg shadow-rose-200',       nokta: 'bg-rose-500',   yazi: 'text-rose-600',   halka: 'ring-rose-400/40',   buton: 'bg-rose-600' },
  indigo: { secili: 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200', nokta: 'bg-indigo-500', yazi: 'text-indigo-600', halka: 'ring-indigo-400/40', buton: 'bg-indigo-600' },
  blue:   { secili: 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200',       nokta: 'bg-blue-500',   yazi: 'text-blue-600',   halka: 'ring-blue-400/40',   buton: 'bg-blue-600' },
};

export default function RandevuTakvimi({
  value,
  onChange,
  vurgu = 'blue',
  yenileKey = 0,
  onDurum,
}: {
  value: string | null;
  onChange: (t: string) => void;
  vurgu?: 'rose' | 'indigo' | 'blue';
  yenileKey?: number;
  onDurum?: (hazir: boolean) => void;
}) {
  const renk = RENK[vurgu] || RENK.blue;
  const [ay, setAy] = useState(() => {
    const b = new Date();
    return new Date(b.getFullYear(), b.getMonth(), 1);
  });
  const [gunler, setGunler] = useState<Record<string, GunBilgi>>({});
  const [yukleniyor, setYukleniyor] = useState(true);
  const [takvimHazir, setTakvimHazir] = useState(true);

  const dolulukGetir = useCallback(async (hedefAy: Date) => {
    setYukleniyor(true);
    const bas = new Date(hedefAy.getFullYear(), hedefAy.getMonth(), 1);
    const bit = new Date(hedefAy.getFullYear(), hedefAy.getMonth() + 1, 0);

    const { data, error } = await supabase.rpc('randevu_doluluk', {
      p_bas: isoTarih(bas),
      p_bit: isoTarih(bit),
    });

    if (error) {
      // Takvim altyapisi henuz kurulmamis olabilir; musteri formu ASLA kirilmasin.
      console.warn('Randevu takvimi yuklenemedi:', error.message);
      setTakvimHazir(false);
      setGunler({});
    } else {
      const harita: Record<string, GunBilgi> = {};
      (data || []).forEach((g: any) => {
        harita[String(g.tarih).slice(0, 10)] = {
          tarih: String(g.tarih).slice(0, 10),
          dolu: Number(g.dolu) || 0,
          kapasite: Number(g.kapasite) || 3,
          acik: g.acik !== false,
        };
      });
      setGunler(harita);
      setTakvimHazir(true);
    }
    setYukleniyor(false);
  }, []);

  useEffect(() => {
    dolulukGetir(ay);
  }, [ay, dolulukGetir, yenileKey]);

  // Takvimin kullanilabilir olup olmadigini ust bilesene bildir
  useEffect(() => {
    onDurum?.(takvimHazir);
  }, [takvimHazir, onDurum]);

  const bugunIso = isoTarih(new Date());
  const ilkGun = new Date(ay.getFullYear(), ay.getMonth(), 1);
  const kaydirma = (ilkGun.getDay() + 6) % 7; // Pazartesi = 0
  const ayGunSayisi = new Date(ay.getFullYear(), ay.getMonth() + 1, 0).getDate();
  const hucreler: (number | null)[] = [
    ...Array(kaydirma).fill(null),
    ...Array.from({ length: ayGunSayisi }, (_, i) => i + 1),
  ];
  while (hucreler.length % 7 !== 0) hucreler.push(null);

  const ayDegistir = (yon: number) => {
    setAy(new Date(ay.getFullYear(), ay.getMonth() + yon, 1));
  };

  const buguneGit = () => {
    const b = new Date();
    setAy(new Date(b.getFullYear(), b.getMonth(), 1));
  };

  const seciliBilgi = value ? gunler[value] : undefined;

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
      {/* BAŞLIK */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white ${renk.buton}`}>
            <CalendarDays size={16} />
          </div>
          <div>
            <h4 className="text-sm font-extrabold text-slate-800 leading-none">Randevu Tarihi Seçin</h4>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5">Günde en fazla 3 müşteri kabul edilir</p>
          </div>
        </div>
        {yukleniyor && <Loader2 size={16} className="animate-spin text-slate-300" />}
      </div>

      {/* AY GEZİNME */}
      <div className="flex items-center justify-between bg-slate-50 rounded-2xl px-2 py-1.5 mb-3">
        <button type="button" onClick={() => ayDegistir(-1)} className="p-2 rounded-xl hover:bg-white text-slate-500 transition">
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-slate-700 tracking-wide">
            {AYLAR[ay.getMonth()]} {ay.getFullYear()}
          </span>
          <button type="button" onClick={buguneGit} className="text-[9px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-700 bg-white border border-slate-200 px-2 py-1 rounded-lg transition">
            Bugün
          </button>
        </div>
        <button type="button" onClick={() => ayDegistir(1)} className="p-2 rounded-xl hover:bg-white text-slate-500 transition">
          <ChevronRight size={16} />
        </button>
      </div>

      {!takvimHazir ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[11px] text-amber-700 font-medium leading-relaxed">
          Randevu takvimi şu an yüklenemedi. Talebinizi tarih seçmeden gönderebilirsiniz, ekibimiz sizi arayıp gün belirleyecektir.
        </div>
      ) : (
        <>
          {/* GÜN BAŞLIKLARI */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {GUNLER.map((g) => (
              <div key={g} className={`text-center text-[9px] font-bold uppercase tracking-wider py-1 ${g === 'Cmt' || g === 'Paz' ? 'text-slate-300' : 'text-slate-400'}`}>
                {g}
              </div>
            ))}
          </div>

          {/* GÜN HÜCRELERİ */}
          <div className="grid grid-cols-7 gap-1">
            {hucreler.map((gun, i) => {
              if (gun === null) return <div key={`bos-${i}`} className="aspect-square" />;

              const tarihIso = isoTarih(new Date(ay.getFullYear(), ay.getMonth(), gun));
              const bilgi = gunler[tarihIso];
              const kapasite = bilgi?.kapasite ?? 3;
              const dolu = bilgi?.dolu ?? 0;
              const acik = bilgi?.acik ?? false;
              const kalan = Math.max(kapasite - dolu, 0);
              const doluMu = kalan === 0;
              const secili = value === tarihIso;
              const bugunMu = tarihIso === bugunIso;
              const tiklanabilir = acik && !doluMu && !!bilgi;

              return (
                <button
                  key={tarihIso}
                  type="button"
                  disabled={!tiklanabilir}
                  onClick={() => onChange(tarihIso)}
                  className={[
                    'aspect-square rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-all relative',
                    secili
                      ? `${renk.secili} scale-[1.04] z-10`
                      : tiklanabilir
                        ? 'bg-white border-slate-200 hover:border-slate-400 hover:shadow-md text-slate-700'
                        : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed',
                    bugunMu && !secili ? `ring-2 ${renk.halka}` : '',
                  ].join(' ')}
                >
                  <span className={`text-[11px] font-bold leading-none ${secili ? 'text-white' : ''}`}>{gun}</span>

                  {tiklanabilir && (
                    <span className={`text-[8px] font-bold leading-none ${secili ? 'text-white/90' : kalan === 1 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {kalan} yer
                    </span>
                  )}
                  {acik && doluMu && !secili && (
                    <span className="text-[7px] font-black leading-none text-rose-500">DOLU</span>
                  )}
                  {!acik && bilgi && (
                    <Lock size={8} className="text-slate-300" />
                  )}

                  {tiklanabilir && (
                    <span className="absolute bottom-1 flex gap-[2px]">
                      {Array.from({ length: kapasite }).map((_, k) => (
                        <span
                          key={k}
                          className={`w-[3px] h-[3px] rounded-full ${k < dolu ? (secili ? 'bg-white' : renk.nokta) : secili ? 'bg-white/30' : 'bg-slate-200'}`}
                        />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* SEÇİM ÖZETİ */}
          {value && seciliBilgi && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center gap-3">
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              <div className="flex-1">
                <p className="text-[11px] font-bold text-emerald-800">{tarihYaz(value)}</p>
                <p className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                  <Users size={10} /> {seciliBilgi.dolu + 1}. randevu hakkınız ayrıldı
                </p>
              </div>
              <button type="button" onClick={() => onChange('')} className="text-[9px] font-bold text-emerald-700 bg-white border border-emerald-200 px-2 py-1 rounded-lg">
                Değiştir
              </button>
            </motion.div>
          )}

          {!value && (
            <p className="text-[10px] text-slate-400 font-medium text-center mt-3">
              Kapalı ve dolu günler seçilemez · Hafta sonu hizmet verilmez
            </p>
          )}
        </>
      )}
    </div>
  );
}
