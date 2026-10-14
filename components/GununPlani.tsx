"use client";

// ----------------------------------------------------------------------------
// BUVISAN - SAHA EKIBI GUNLUK SERVIS PLANI 📅
// ----------------------------------------------------------------------------
//  * Bugun ve yarin icin TUM ekibin randevu planini gosterir
//  * Kendi adi gecen isleri VURGULAR ("SEN" rozeti + mavi cerceve)
//  * Is kartindan tek dokunusla servis raporu formunu acar
//  * Isimler birebir ayni yazilmasa da eslesir (Turkce karakter/harf toleransi)
//  MEVCUT SAYFAYA SADECE EKLENIR, hicbir seyi degistirmez.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { isimEslesiyor } from '@/lib/personel';
import { motion } from 'framer-motion';
import {
  CalendarDays, MapPin, Phone, Wrench, FileText, CheckCircle2, AlertTriangle,
  Search, CalendarClock, Users, RefreshCw, Loader2, ChevronRight, Mic, Navigation
} from 'lucide-react';

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUNLER = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

const isoTarih = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const tarihYaz = (t: string) => {
  if (!t) return '';
  const [y, m, g] = t.split('-').map(Number);
  const d = new Date(y, m - 1, g);
  return `${g} ${AYLAR[m - 1]} ${y}, ${GUNLER[(d.getDay() + 6) % 7]}`;
};

const IS_TIPI: Record<string, { ad: string; sinif: string; ikon: any }> = {
  ariza: { ad: 'Arıza / Servis', sinif: 'bg-rose-100 text-rose-700 border-rose-200', ikon: AlertTriangle },
  kesif: { ad: 'Keşif', sinif: 'bg-indigo-100 text-indigo-700 border-indigo-200', ikon: Search },
  bakim: { ad: 'Bakım', sinif: 'bg-blue-100 text-blue-700 border-blue-200', ikon: CalendarClock },
};

export default function GununPlani({
  aktifPersonel,
  onRaporAc,
}: {
  aktifPersonel: any;
  onRaporAc: (ticket: any) => void;
}) {
  const [kayitlar, setKayitlar] = useState<any[]>([]);
  const [biletler, setBiletler] = useState<Record<string, any>>({});
  const [yukleniyor, setYukleniyor] = useState(true);
  const [benimAdim, setBenimAdim] = useState('');
  const [acikGun, setAcikGun] = useState<'bugun' | 'yarin'>('bugun');

  const bugun = isoTarih(new Date());
  const yarin = isoTarih(new Date(Date.now() + 86400000));

  // Kayitli isim tercihi varsa onu, yoksa profil adini kullan
  useEffect(() => {
    let kayitli: string | null = null;
    try { kayitli = window.localStorage.getItem('buvisan_personel_adi'); } catch { /* yoksay */ }
    setBenimAdim(kayitli || aktifPersonel?.full_name || '');
  }, [aktifPersonel]);

  const verileriGetir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data, error } = await supabase
        .from('randevular')
        .select('*')
        .in('randevu_tarihi', [bugun, yarin])
        .neq('durum', 'iptal')
        .order('randevu_tarihi', { ascending: true })
        .order('slot', { ascending: true });

      if (error) { console.warn('Plan alinamadi:', error.message); setKayitlar([]); return; }

      const liste = data || [];
      setKayitlar(liste);

      const idler = liste.map((r: any) => r.ticket_id).filter(Boolean);
      if (idler.length > 0) {
        const { data: tData } = await supabase.from('service_tickets').select('*, cranes(*)').in('id', idler);
        const harita: Record<string, any> = {};
        (tData || []).forEach((t: any) => { harita[t.id] = t; });
        setBiletler(harita);
      } else {
        setBiletler({});
      }
    } finally {
      setYukleniyor(false);
    }
  }, [bugun, yarin]);

  useEffect(() => { verileriGetir(); }, [verileriGetir]);

  // Sekmeye geri donuldugunde plani tazele
  useEffect(() => {
    const elle = () => { if (!document.hidden) verileriGetir(); };
    document.addEventListener('visibilitychange', elle);
    return () => document.removeEventListener('visibilitychange', elle);
  }, [verileriGetir]);

  // Personel alanı "A - B" şeklinde birden fazla kişi içerebilir; her birini ayrı sınarız
  const benimMi = useCallback((r: any) => {
    if (!benimAdim) return false;
    const kisiler = String(r?.atanan_personel || '')
      .split(' - ')
      .map((x) => x.trim())
      .filter(Boolean);
    return kisiler.some((k) => isimEslesiyor(k, benimAdim));
  }, [benimAdim]);

  const bugunListe = useMemo(() => kayitlar.filter((r) => String(r.randevu_tarihi).slice(0, 10) === bugun), [kayitlar, bugun]);
  const yarinListe = useMemo(() => kayitlar.filter((r) => String(r.randevu_tarihi).slice(0, 10) === yarin), [kayitlar, yarin]);
  const gosterilecek = acikGun === 'bugun' ? bugunListe : yarinListe;

  const benimBugun = bugunListe.filter(benimMi).length;

  // Planda gecen tum personel isimleri (eslesme olmazsa secim icin)
  const tumIsimler = useMemo(() => {
    const s = new Set<string>();
    kayitlar.forEach((r) =>
      String(r.atanan_personel || '').split(' - ').map((x) => x.trim()).filter(Boolean).forEach((x) => s.add(x))
    );
    return Array.from(s).sort();
  }, [kayitlar]);

  const eslesmeVar = kayitlar.some(benimMi);

  const isimSec = (isim: string) => {
    setBenimAdim(isim);
    try { window.localStorage.setItem('buvisan_personel_adi', isim); } catch { /* yoksay */ }
  };

  return (
    <div className="px-4 pt-4">
      <div className="bg-white rounded-[2rem] shadow-lg border border-slate-200 overflow-hidden">

        {/* BAŞLIK */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600/20 p-2 rounded-xl">
              <CalendarDays className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-white font-black text-sm tracking-tight leading-none">SERVİS PLANI</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                Bugün {bugunListe.length} iş · Senin {benimBugun}
              </p>
            </div>
          </div>
          <button onClick={verileriGetir} className="text-slate-400 hover:text-white bg-white/10 p-2 rounded-full transition" title="Yenile">
            {yukleniyor ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        </div>

        {/* İSİM EŞLEŞMEDİYSE SEÇTİR */}
        {!yukleniyor && !eslesmeVar && tumIsimler.length > 0 && (
          <div className="bg-amber-50 border-b border-amber-200 px-5 py-3">
            <p className="text-[11px] font-bold text-amber-800 mb-2">
              Adın planda yazılı değil. Kendini seç, işlerin vurgulanır:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tumIsimler.map((isim) => (
                <button
                  key={isim}
                  onClick={() => isimSec(isim)}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 transition"
                >
                  {isim}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* GÜN SEKMELERİ */}
        <div className="flex gap-1 p-2 bg-slate-50 border-b border-slate-100">
          <button
            onClick={() => setAcikGun('bugun')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 ${acikGun === 'bugun' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
          >
            BUGÜN
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${acikGun === 'bugun' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'}`}>
              {bugunListe.length}
            </span>
          </button>
          <button
            onClick={() => setAcikGun('yarin')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 ${acikGun === 'yarin' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
          >
            YARIN
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${acikGun === 'yarin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'}`}>
              {yarinListe.length}
            </span>
          </button>
        </div>

        <div className="p-3 bg-slate-50">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">
            {tarihYaz(acikGun === 'bugun' ? bugun : yarin)}
          </p>

          {yukleniyor ? (
            <div className="py-10 text-center">
              <Loader2 className="w-7 h-7 animate-spin text-blue-500 mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-bold">Plan yükleniyor...</p>
            </div>
          ) : gosterilecek.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-slate-300">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-600">Planlanmış iş yok</p>
              <p className="text-[11px] text-slate-400 mt-1">
                {acikGun === 'bugun' ? 'Bugün için randevu bulunmuyor.' : 'Yarın için randevu bulunmuyor.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {gosterilecek.map((r) => {
                const benim = benimMi(r);
                const tip = IS_TIPI[r.is_tipi] || IS_TIPI.ariza;
                const TipIkon = tip.ikon;
                const bilet = r.ticket_id ? biletler[r.ticket_id] : null;
                const bitti = r.durum === 'yapildi';
                const personeller = String(r.atanan_personel || '').split(' - ').map((x) => x.trim()).filter(Boolean);

                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`bg-white rounded-2xl p-4 border-2 shadow-sm transition ${
                      bitti ? 'border-emerald-200 opacity-80'
                        : benim ? 'border-blue-500 ring-2 ring-blue-100'
                          : 'border-slate-200'
                    }`}
                  >
                    {/* ÜST SATIR */}
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="bg-slate-900 text-white text-[9px] font-black px-2 py-1 rounded-lg">
                          {r.slot}. RANDEVU
                        </span>
                        <span className={`text-[9px] font-black px-2 py-1 rounded-lg border flex items-center gap-1 ${tip.sinif}`}>
                          <TipIkon size={10} /> {tip.ad}
                        </span>
                        {benim && (
                          <span className="bg-blue-600 text-white text-[9px] font-black px-2 py-1 rounded-lg animate-pulse">
                            SEN
                          </span>
                        )}
                      </div>
                      {bitti && (
                        <span className="text-[9px] font-black px-2 py-1 rounded-lg border bg-emerald-100 text-emerald-700 border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 size={10} /> YAPILDI
                        </span>
                      )}
                    </div>

                    {/* MÜŞTERİ */}
                    <h3 className="text-base font-black text-slate-800 leading-tight mb-2">{r.musteri_adi}</h3>

                    <div className="space-y-1 mb-3">
                      {r.telefon && (
                        <a href={`tel:${r.telefon}`} className="text-xs text-blue-600 font-bold flex items-center gap-2 hover:underline">
                          <Phone size={12} /> {r.telefon}
                        </a>
                      )}
                      {r.adres && (
                        <a
                          href={
                            r.lat && r.lng
                              ? `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`
                              : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.adres)}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block bg-sky-50 border border-sky-200 rounded-2xl px-3 py-2.5 active:bg-sky-100 transition"
                        >
                          <span className="text-xs text-slate-700 font-bold flex items-start gap-2">
                            <MapPin size={13} className="text-sky-600 mt-0.5 shrink-0" />
                            <span className="leading-snug">{r.adres}</span>
                          </span>
                          <span className="text-[10px] font-black text-sky-700 flex items-center gap-1 mt-1.5 ml-5">
                            <Navigation size={11} /> YOL TARİFİ AL
                          </span>
                        </a>
                      )}
                      {r.vinc_bilgisi && (
                        <p className="text-xs text-slate-500 font-medium flex items-center gap-2">
                          <Wrench size={12} className="text-slate-400" /> {r.vinc_bilgisi}
                        </p>
                      )}
                      {personeller.length > 0 && (
                        <p className="text-xs font-medium flex items-center gap-2 flex-wrap">
                          <Users size={12} className="text-slate-400" />
                          {personeller.map((p, i) => (
                            <span key={p} className={isimEslesiyor(p, benimAdim) ? 'text-blue-700 font-black' : 'text-slate-500'}>
                              {p}{i < personeller.length - 1 ? ',' : ''}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>

                    {/* SES KAYDI VARSA DİNLE */}
                    {bilet?.audio_url && !bitti && (
                      <div className="bg-blue-50 border border-blue-100 p-2.5 rounded-xl mb-3">
                        <span className="text-[9px] font-bold text-blue-700 uppercase flex items-center gap-1.5 mb-1.5">
                          <Mic size={12} className="animate-pulse" /> Müşterinin ses kaydı
                        </span>
                        <audio src={bilet.audio_url} controls className="w-full h-8" />
                      </div>
                    )}

                    {/* AKSİYON */}
                    {bitti ? (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 text-center">
                        <p className="text-[11px] font-bold text-emerald-700">Bu iş tamamlandı 👍</p>
                      </div>
                    ) : bilet ? (
                      <button
                        onClick={() => onRaporAc(bilet)}
                        className={`w-full py-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 shadow-sm ${
                          benim ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        <FileText size={14} /> SERVİS RAPORU DOLDUR <ChevronRight size={14} />
                      </button>
                    ) : (
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-center">
                        <p className="text-[10px] text-slate-400 font-bold">Bu randevuya bağlı iş emri yok</p>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
