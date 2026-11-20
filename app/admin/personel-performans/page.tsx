'use client';

// ============================================================================
//  🏆 PERSONEL PERFORMANS MERKEZİ
// ----------------------------------------------------------------------------
//  Veri: gunluk_skor_tablosu() · personel_siralama() · personel_yetkinlik_matrisi()
//        personel_karnesi() · yetkinlik_ayarla()
//        + /api/personel-karlilik  (ciro / maliyet / kâr — TEK hesap yeri)
//  İlke: her bölüm ayrı, biri gelmezse ekran çökmez
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import PrimTablosu from '@/components/PrimTablosu';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Trophy, Loader2, RefreshCw, ArrowLeft, AlertTriangle, Target,
  Star, Clock, CheckCircle2, X, TrendingUp, Award, GraduationCap,
  Zap, FileText, Shield, Calendar
, Wallet, Package, Users, Percent, Info, Database, Receipt, ChevronDown, Calculator} from 'lucide-react';

const AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const para2 = (n: any) => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kisa = (n: any) => {
  const v = Number(n || 0);
  if (v >= 1000000) return (v / 1000000).toFixed(1).replace('.', ',') + 'M';
  if (v >= 1000) return Math.round(v / 1000) + 'B';
  return String(Math.round(v));
};
const tarihTR = (t: any) => {
  const s = String(t || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
};

// Kutu renkleri (Tailwind sınıfları tam yazılmalı — dinamik birleştirme yok)
const RENK: Record<string, { kutu: string; ikon: string; yazi: string }> = {
  emerald: { kutu: 'bg-emerald-50 border-emerald-200', ikon: 'bg-emerald-100 text-emerald-700', yazi: 'text-emerald-700' },
  rose:    { kutu: 'bg-rose-50 border-rose-200',       ikon: 'bg-rose-100 text-rose-700',       yazi: 'text-rose-700' },
  blue:    { kutu: 'bg-blue-50 border-blue-200',       ikon: 'bg-blue-100 text-blue-700',       yazi: 'text-blue-700' },
  slate:   { kutu: 'bg-white border-slate-200',        ikon: 'bg-slate-100 text-slate-600',     yazi: 'text-slate-700' },
  amber:   { kutu: 'bg-amber-50 border-amber-200',     ikon: 'bg-amber-100 text-amber-700',     yazi: 'text-amber-700' },
  violet:  { kutu: 'bg-violet-50 border-violet-200',   ikon: 'bg-violet-100 text-violet-700',   yazi: 'text-violet-700' },
};

function Kutu({ etiket, deger, alt, renk = 'slate', ikon }: {
  etiket: string; deger: any; alt?: any; renk?: string; ikon?: any;
}) {
  const r = RENK[renk] || RENK.slate;
  return (
    <div className={`rounded-2xl border p-3 ${r.kutu}`}>
      <div className="flex items-center gap-2 mb-1">
        {ikon && <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${r.ikon}`}>{ikon}</span>}
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wide leading-tight">{etiket}</p>
      </div>
      <p className={`text-base md:text-lg font-black leading-tight ${r.yazi}`}>{deger}</p>
      {alt && <p className="text-[9px] font-bold text-slate-400 mt-0.5 leading-tight">{alt}</p>}
    </div>
  );
}

const KAYNAK_ETIKET: Record<string, { ad: string; sinif: string; aciklama: string }> = {
  rapor:      { ad: 'RAPOR',   sinif: 'bg-emerald-100 text-emerald-700', aciklama: 'Raporda saklı gerçek maliyet (kullanım anındaki alış fiyatı)' },
  kayit:      { ad: 'KAYIT',   sinif: 'bg-blue-100 text-blue-700',       aciklama: 'İş kaydında saklı maliyet' },
  depo:       { ad: 'GÜNCEL',  sinif: 'bg-amber-100 text-amber-800',     aciklama: 'Depodaki GÜNCEL alış fiyatından hesaplandı (fiyat değişebilir)' },
  yok:        { ad: 'YOK',     sinif: 'bg-slate-100 text-slate-500',     aciklama: 'Kayıtta malzeme kalemi yok' },
  bilinmiyor: { ad: 'EKSİK',   sinif: 'bg-rose-100 text-rose-700',       aciklama: 'Malzeme var ama maliyeti kayıtlı değil' },
};

// ============================================================================
//  💰 KÂRLILIK PANELİ — /api/personel-karlilik çıktısını gösterir
//  Hesap YOK: tüm sayılar sunucudan (tek hesap yeri) gelir.
// ============================================================================
function KarlilikPaneli({ v }: { v: any }) {
  const o = v.ozet;
  const h = o.hesaplanan;
  const m = o.maliyetsiz;
  const kay = v.kaynaklar;
  const maliyetToplam = Math.max(Number(h.maliyet) || 0, 0);
  const bar = (n: any) => (maliyetToplam > 0 ? Math.min(100, (Math.max(Number(n) || 0, 0) / maliyetToplam) * 100) : 0);
  const pay = (n: any) => (maliyetToplam > 0 ? Math.round((Math.max(Number(n) || 0, 0) / maliyetToplam) * 100) : 0);

  const kalemler = [
    { ad: 'Malzeme', deger: h.malzeme, renk: 'bg-blue-500', not: 'raporda saklı maliyet → yoksa depodaki güncel alış fiyatı' },
    { ad: 'İşçilik', deger: h.iscilik, renk: 'bg-violet-500', not: 'süre × ekipteki kişilerin saat ücreti (maaş × katsayı ÷ saat)' },
    { ad: 'Yol', deger: h.yol, renk: 'bg-slate-300', not: 'iş kaydında yol gideri tutulmuyor → 0 (tahmin edilmedi)' },
    { ad: 'Diğer', deger: h.diger, renk: 'bg-slate-300', not: 'kayıtta yok → 0 (tahmin edilmedi)' },
  ];

  return (
    <div className="space-y-3.5">

      {/* ── 1. ANA KUTULAR ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
        <Kutu etiket="CİRO (KDV HARİÇ)" deger={`${para(o.ciro)} ₺`}
          alt={`${o.is_sayisi} iş · ort. ${para(o.ortalama_is)} ₺`} renk="emerald" ikon={<TrendingUp size={14} />} />
        <Kutu etiket="MALİYET (KDV HARİÇ)" deger={`${para(h.maliyet)} ₺`}
          alt={`malzeme ${para(h.malzeme)} + işçilik ${para(h.iscilik)}`} renk="rose" ikon={<Package size={14} />} />
        <Kutu etiket="KÂR" deger={`${para(h.kar)} ₺`}
          alt={h.marj === null ? 'marj hesaplanamadı' : `marj %${h.marj}`} renk="blue" ikon={<Percent size={14} />} />
        <Kutu etiket="KÂRA GİREN / TOPLAM İŞ" deger={`${h.is_sayisi} / ${o.is_sayisi}`}
          alt={m.is_sayisi > 0 ? `${m.is_sayisi} iş maliyetsiz` : 'tüm işlerde maliyet tam'}
          renk={m.is_sayisi > 0 ? 'amber' : 'slate'} ikon={<Target size={14} />} />
      </div>

      {/* ── 2. YARDIMCI KUTULAR ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
        <Kutu etiket="ORTALAMA KÂR / İŞ" deger={`${para(h.ortalama_kar)} ₺`}
          alt={`${h.is_sayisi} iş üzerinden`} renk="slate" ikon={<Wallet size={14} />} />
        <Kutu etiket="ORTAK İŞ" deger={`${para(o.ortak.ciro)} ₺`}
          alt={`${o.ortak.is_sayisi} iş · ekiple yapıldı`} renk="violet" ikon={<Users size={14} />} />
        <Kutu etiket="TEK BAŞINA" deger={`${para(o.tek.ciro)} ₺`}
          alt={`${o.tek.is_sayisi} iş`} renk="slate" ikon={<Users size={14} />} />
        <Kutu etiket="SAAT ÜCRETİ (KİŞİ)" deger={v.saatlik_ucret.kisi === null ? '—' : `${para2(v.saatlik_ucret.kisi)} ₺`}
          alt={`maaş × ${v.katsayilar.sgk} ÷ ${v.katsayilar.aylik_saat} saat`} renk="slate" ikon={<Clock size={14} />} />
      </div>

      {/* ── 3. MALİYET DAĞILIMI ── */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <p className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1.5">
            <Calculator size={12} /> MALİYET DAĞILIMI
          </p>
          <span className="text-[9px] font-bold text-slate-400">KDV hariç · {h.is_sayisi} iş</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
            {kalemler.map((k, i) => (
              <div key={i} className={k.renk} style={{ width: `${bar(k.deger)}%` }} title={`${k.ad}: ${para(k.deger)} ₺`} />
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {kalemler.map((k, i) => (
              <div key={i} className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${k.renk}`} />
                  <span className="text-[9px] font-black text-slate-500 uppercase">{k.ad}</span>
                </div>
                <p className="text-[12px] font-black text-slate-700 leading-tight mt-0.5">
                  {para(k.deger)} ₺ <span className="text-[9px] text-slate-400 font-bold">%{pay(k.deger)}</span>
                </p>
                <p className="text-[8px] font-bold text-slate-400 leading-snug mt-0.5">{k.not}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 4. EKSİK MALİYET UYARISI ── */}
      {m.is_sayisi > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5">
          <p className="text-[11px] font-black text-amber-900 flex items-center gap-1.5">
            <AlertTriangle size={14} /> {m.is_sayisi} iş maliyetsiz — kâra dahil edilmedi
          </p>
          <p className="text-[10px] font-bold text-amber-800 mt-1 leading-relaxed">
            Bu işlerin toplam {para(m.ciro)} ₺ cirosu var; maliyeti kayıtlı olmadığı için <b>tahmin edilmedi</b>.
            {m.malzeme_bilinmeyen > 0 && ` ${m.malzeme_bilinmeyen} işte malzeme maliyeti yok.`}
            {m.sure_bilinmeyen > 0 && ` ${m.sure_bilinmeyen} işte süre/işçilik kaydı yok.`}
          </p>
          <p className="text-[10px] font-bold text-amber-700 mt-1">
            Kâr ve marj yalnızca maliyeti TAM olan {h.is_sayisi} işin {para(h.ciro)} ₺ cirosu üzerinden hesaplandı.
          </p>
        </div>
      )}

      {/* ── 5. İŞ BAZLI DÖKÜM ── */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <p className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1.5">
            <Receipt size={12} /> İŞ BAZLI DÖKÜM
          </p>
          <span className="text-[9px] font-bold text-slate-400">{v.isler.length} iş · KDV hariç</span>
        </div>

        {v.isler.length === 0 ? (
          <p className="p-8 text-center text-[11px] font-bold text-slate-400">
            Bu ay bu personele atanmış tamamlanmış iş yok.
          </p>
        ) : (
          <>
            {/* MASAÜSTÜ TABLO */}
            <div className="hidden md:block max-h-[420px] overflow-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-white sticky top-0 z-10 shadow-[0_1px_0_0_rgb(241,245,249)]">
                  <tr className="text-[9px] font-black text-slate-500 uppercase">
                    <th className="text-left px-3 py-2">Tarih</th>
                    <th className="text-left px-3 py-2">Müşteri</th>
                    <th className="text-left px-3 py-2">İş tipi</th>
                    <th className="text-right px-3 py-2">Tutar</th>
                    <th className="text-right px-3 py-2">Malzeme</th>
                    <th className="text-right px-3 py-2">İşçilik</th>
                    <th className="text-right px-3 py-2">Kâr</th>
                    <th className="text-center px-3 py-2">Kaynak</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {v.isler.map((s: any) => {
                    const ke = KAYNAK_ETIKET[s.malzeme_kaynagi] || KAYNAK_ETIKET.yok;
                    const malzemeEksik = (s.eksik_neden || []).includes('malzeme maliyeti yok');
                    const iscilikEksik = (s.eksik_neden || []).includes('işçilik/süre kaydı yok');
                    return (
                      <tr key={s.id} className={`hover:bg-slate-50 ${s.maliyet_durumu === 'eksik' ? 'bg-amber-50/40' : ''}`}>
                        <td className="px-3 py-2 font-bold text-slate-500 whitespace-nowrap">{tarihTR(s.tarih)}</td>
                        <td className="px-3 py-2">
                          <p className="font-black text-slate-700 truncate max-w-[180px]" title={s.musteri}>{s.musteri}</p>
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            {s.ortak && (
                              <span className="text-[8px] font-black bg-violet-100 text-violet-700 px-1 py-0.5 rounded" title={`Ekip: ${(s.ekip || []).join(', ')}`}>
                                ORTAK
                              </span>
                            )}
                            {s.bedelsiz && <span className="text-[8px] font-black bg-slate-200 text-slate-600 px-1 py-0.5 rounded">BEDELSİZ</span>}
                            {s.maliyet_durumu === 'eksik' && (
                              <span className="text-[8px] font-black bg-amber-200 text-amber-900 px-1 py-0.5 rounded"
                                title={(s.eksik_neden || []).join(' · ')}>
                                MALİYET EKSİK
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-500">{s.is_tipi}</td>
                        <td className="px-3 py-2 text-right font-black text-slate-700">{para(s.tutar)} ₺</td>
                        <td className={`px-3 py-2 text-right font-bold ${malzemeEksik ? 'text-rose-500' : 'text-slate-600'}`}>
                          {malzemeEksik ? '—' : `${para(s.malzeme)} ₺`}
                          {s.guncel_fiyat && !malzemeEksik && (
                            <span className="block text-[8px] font-black text-amber-600">güncel fiyat</span>
                          )}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${iscilikEksik ? 'text-rose-500' : 'text-slate-600'}`}>
                          {iscilikEksik ? '—' : `${para(s.iscilik)} ₺`}
                          {!iscilikEksik && s.saat !== null && (
                            <span className="block text-[8px] font-bold text-slate-400">{para2(s.saat)} sa</span>
                          )}
                        </td>
                        <td className={`px-3 py-2 text-right font-black ${s.kar === null ? 'text-slate-300' : s.kar >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {s.kar === null ? '—' : `${para(s.kar)} ₺`}
                          {s.marj !== null && <span className="block text-[8px] font-bold text-slate-400">%{s.marj}</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${ke.sinif}`} title={`${ke.aciklama}${s.rapor_id ? ' · rapor bağlı' : ''}`}>
                            {ke.ad}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* MOBİL KARTLAR (tek sütun) */}
            <div className="md:hidden divide-y divide-slate-100">
              {v.isler.map((s: any) => {
                const ke = KAYNAK_ETIKET[s.malzeme_kaynagi] || KAYNAK_ETIKET.yok;
                const malzemeEksik = (s.eksik_neden || []).includes('malzeme maliyeti yok');
                const iscilikEksik = (s.eksik_neden || []).includes('işçilik/süre kaydı yok');
                return (
                  <div key={s.id} className="p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[12px] font-black text-slate-700 truncate">{s.musteri}</p>
                        <p className="text-[9px] font-bold text-slate-400">
                          {tarihTR(s.tarih)} · {s.is_tipi}
                          {s.saat !== null && ` · ${para2(s.saat)} sa`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[13px] font-black text-slate-800">{para(s.tutar)} ₺</p>
                        <p className="text-[9px] font-bold text-slate-400">KDV hariç</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      {s.ortak && <span className="text-[8px] font-black bg-violet-100 text-violet-700 px-1 py-0.5 rounded">ORTAK</span>}
                      {s.bedelsiz && <span className="text-[8px] font-black bg-slate-200 text-slate-600 px-1 py-0.5 rounded">BEDELSİZ</span>}
                      <span className={`text-[8px] font-black px-1 py-0.5 rounded ${ke.sinif}`}>{ke.ad}</span>
                      {s.guncel_fiyat && !malzemeEksik && <span className="text-[8px] font-black text-amber-600">güncel fiyat</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase">Malzeme</p>
                        <p className={`text-[11px] font-black ${malzemeEksik ? 'text-rose-500' : 'text-slate-700'}`}>
                          {malzemeEksik ? 'yok' : `${para(s.malzeme)} ₺`}
                        </p>
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase">İşçilik</p>
                        <p className={`text-[11px] font-black ${iscilikEksik ? 'text-rose-500' : 'text-slate-700'}`}>
                          {iscilikEksik ? 'yok' : `${para(s.iscilik)} ₺`}
                        </p>
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase">Kâr</p>
                        <p className={`text-[11px] font-black ${s.kar === null ? 'text-slate-300' : s.kar >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {s.kar === null ? '—' : `${para(s.kar)} ₺`}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100">
              <p className="text-[9px] font-bold text-slate-500 leading-relaxed">
                Kaynak: <b className="text-emerald-700">RAPOR</b> = raporda saklı gerçek maliyet ·{' '}
                <b className="text-amber-700">GÜNCEL</b> = depodaki güncel alış fiyatı ·{' '}
                <b className="text-slate-500">YOK</b> = malzeme kalemi yok ·{' '}
                <b className="text-rose-600">EKSİK</b> = maliyet kaydı yok (kâra dahil edilmedi).
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── 6. VERİ KAYNAĞI / FOOTER ── */}
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4 space-y-2.5">
        <p className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1.5">
          <Database size={12} /> VERİ KAYNAĞI — OKUNAN KAYITLAR
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-bold text-slate-600">
          <p>completed_services: <b>{kay.completed_services.okunan}</b> kayıt okundu · <b>{kay.completed_services.kullanilan}</b> iş kullanıldı{kay.completed_services.mukerrer > 0 && ` · ${kay.completed_services.mukerrer} mükerrer atıldı`}</p>
          <p>service_reports: <b>{kay.service_reports.okunan}</b> kayıt okundu · <b>{kay.service_reports.eslesen}</b> işe bağlandı · <b>{kay.service_reports.malzeme_veren}</b> işe maliyet verdi</p>
          <p>materials: <b>{kay.materials.okunan}</b> kayıt okundu · <b>{kay.materials.fiyatli}</b> kayıtta alış fiyatı var</p>
          <p>personel_maas: <b>{kay.personel_maas.okunan}</b> kayıt · <b>{kay.personel_maas.ucretli}</b> ücretli personel</p>
          <p>randevular: <b>{kay.randevular.okunan}</b> kayıt · <b>{kay.randevular.personel_atanan}</b> bu personele atanmış · <b>{kay.randevular.eslesen}</b> işle eşleşti</p>
          <p>profiles: <b>{kay.profiles.okunan}</b> kayıt (kimlik eşleşmesi{kay.profiles.okunan > 0 ? '' : ' — personel kendi hesabıyla eşlenmedi'})</p>
        </div>

        <div className="border-t border-slate-200 pt-2.5 space-y-1.5 text-[10px] font-bold text-slate-500 leading-relaxed">
          <p className="flex items-start gap-1.5">
            <Info size={11} className="mt-0.5 shrink-0 text-slate-400" />
            <span><b className="text-slate-700">Maliyet önceliği:</b> raporda saklı maliyet (kullanım anındaki alış fiyatı) → iş kaydında saklı maliyet → depodaki güncel alış fiyatı (bu durumda satırda “güncel fiyat” yazar).</span>
          </p>
          <p className="flex items-start gap-1.5">
            <Info size={11} className="mt-0.5 shrink-0 text-slate-400" />
            <span><b className="text-slate-700">İşçilik:</b> süre × ekipteki her kişinin saat ücreti. Saat ücreti = kişinin aylık maaşı × {v.katsayilar.sgk} (SGK+yemek+yol) ÷ {v.katsayilar.aylik_saat} saat. {v.saatlik_ucret.sirket !== null && `Şirket ortalaması (toplam maaş ÷ 220): ${para2(v.saatlik_ucret.sirket)} ₺/saat — bu panel kişi bazlı ücreti kullanır.`}</span>
          </p>
          <p className="flex items-start gap-1.5">
            <Info size={11} className="mt-0.5 shrink-0 text-slate-400" />
            <span><b className="text-slate-700">Tekilleştirme:</b> {v.tekillestirme}</span>
          </p>
          <p className="flex items-start gap-1.5">
            <Info size={11} className="mt-0.5 shrink-0 text-slate-400" />
            <span><b className="text-slate-700">Kapsam:</b> yol ve diğer giderler iş kaydında tutulmadığı için 0 ₺ alındı — bu yüzden kâr <b>üst sınır</b> olarak okunmalı. Tüm tutarlar <b>KDV hariç</b>.</span>
          </p>
        </div>

        {Array.isArray(v.uyarilar) && v.uyarilar.length > 0 && (
          <div className="border-t border-slate-200 pt-2.5">
            <ul className="space-y-1">
              {v.uyarilar.map((u: string, i: number) => (
                <li key={i} className="text-[10px] font-bold text-amber-700 flex items-start gap-1.5">
                  <AlertTriangle size={10} className="mt-0.5 shrink-0" /> {u}
                </li>
              ))}
            </ul>
          </div>
        )}

        {Array.isArray(v.kaynak_hatalari) && v.kaynak_hatalari.length > 0 && (
          <div className="border-t border-slate-200 pt-2.5">
            <p className="text-[10px] font-black text-rose-600">Bazı kaynaklar okunamadı (diğerleri kullanıldı):</p>
            <ul className="mt-1 space-y-0.5">
              {v.kaynak_hatalari.map((u: string, i: number) => (
                <li key={i} className="text-[9px] font-bold text-rose-500">{u}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}


const YETKINLIKLER = [
  { k: 'vincs', a: 'Vinç', i: '🏗️' },
  { k: 'asansor', a: 'Asansör', i: '🛗' },
  { k: 'hidrolik', a: 'Hidrolik', i: '💧' },
  { k: 'elektrik', a: 'Elektrik', i: '⚡' },
  { k: 'montaj', a: 'Montaj', i: '🔧' },
  { k: 'isg', a: 'İSG', i: '🦺' },
];

export default function PersonelPerformansPage() {
  const [skor, setSkor] = useState<any>(null);
  const [siralama, setSiralama] = useState<any[]>([]);
  const [matris, setMatris] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState('');
  const [ay, setAy] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [secili, setSecili] = useState<any>(null);
  const [karne, setKarne] = useState<any>(null);
  const [karneYuk, setKarneYuk] = useState(false);
  const [karlilik, setKarlilik] = useState<any>(null);
  const [karlilikYuk, setKarlilikYuk] = useState(false);
  const [karlilikHata, setKarlilikHata] = useState('');
  const [mesaj, setMesaj] = useState('');

  const getir = useCallback(async () => {
    setYukleniyor(true);
    setHata('');
    try {
      const [s, l, m] = await Promise.all([
        supabase.rpc('gunluk_skor_tablosu'),
        supabase.rpc('personel_siralama', { p_ay: ay }),
        supabase.rpc('personel_yetkinlik_matrisi'),
      ]);
      if (s.error) setHata(s.error.message);
      setSkor(s.data);
      setSiralama(l.data || []);
      setMatris(m.data || []);
    } finally { setYukleniyor(false); }
  }, [ay]);

  useEffect(() => { getir(); }, [getir]);

  // İsme tıklanınca: (1) kârlılık analizi — TEK hesap ucu, (2) performans karnesi
  const karneAc = async (ad: string) => {
    setSecili({ ad });
    setKarne(null);
    setKarlilik(null);
    setKarlilikHata('');
    setKarneYuk(true);
    setKarlilikYuk(true);

    const karlilikIstek = (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setKarlilikHata('Yönetici oturumu bulunamadı. Lütfen tekrar giriş yapın.');
        return;
      }
      const r = await fetch(
        `/api/personel-karlilik?personel=${encodeURIComponent(ad)}&ay=${ay}`,
        { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' }
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.hata || 'Kârlılık verisi alınamadı.');
      setKarlilik(j);
    })()
      .catch((e: any) => setKarlilikHata(e?.message || 'Kârlılık verisi alınamadı.'))
      .finally(() => setKarlilikYuk(false));

    const karneIstek = (async () => {
      try {
        const { data } = await supabase.rpc('personel_karnesi', { p_personel: ad, p_ay: ay });
        setKarne(data);
      } finally {
        setKarneYuk(false);
      }
    })();

    await Promise.all([karlilikIstek, karneIstek]);
  };

  const seviyeAyarla = async (personel: string, yetkinlik: string, seviye: number) => {
    const { data, error } = await supabase.rpc('yetkinlik_ayarla', {
      p_personel: personel, p_yetkinlik: yetkinlik, p_seviye: seviye,
    });
    if (error || !(data as any)?.ok) {
      setMesaj(error?.message || (data as any)?.mesaj || 'Kaydedilemedi.');
      return;
    }
    setMesaj('✅ ' + (data as any).mesaj);
    await getir();
    setTimeout(() => setMesaj(''), 2500);
  };

  const [yil, ayNo] = ay.split('-').map(Number);
  const gunlukPersonel: any[] = Array.isArray(skor?.personel) ? skor.personel : [];
  const enYuksek = Math.max(...gunlukPersonel.map((p) => Number(p.ciro) || 0), 1);

  const yildiz = (s: number) => '●'.repeat(Math.max(1, Math.min(5, s))) + '○'.repeat(Math.max(0, 5 - Math.max(1, Math.min(5, s))));

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8">

      {/* ÜST BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-slate-800 flex items-center gap-2.5">
            <Trophy className="text-amber-500" size={30} /> PERSONEL PERFORMANS
          </h1>
          <p className="text-slate-500 text-xs md:text-sm mt-0.5">
            Performans karnesi · yetkinlik matrisi · günlük skor tablosu
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <select value={ay} onChange={(e) => { setAy(e.target.value); setSecili(null); }}
            className="bg-white border border-slate-200 px-4 py-3 rounded-2xl font-black text-xs outline-none">
            {Array.from({ length: 12 }, (_, i) => {
              const d = new Date(); d.setMonth(d.getMonth() - i);
              const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              return <option key={v} value={v}>{AYLAR[d.getMonth()]} {d.getFullYear()}</option>;
            })}
          </select>
          <button onClick={getir} disabled={yukleniyor}
            className="bg-white border border-slate-200 px-4 py-3 rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-slate-100">
            <RefreshCw size={16} className={yukleniyor ? 'animate-spin' : ''} />
          </button>
          <Link href="/admin" className="bg-slate-900 text-white px-4 py-3 rounded-2xl font-black text-xs flex items-center gap-2">PANEL</Link>
        </div>
      </div>

      {hata && (
        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 mb-5">
          <p className="font-black text-rose-800 flex items-center gap-2"><AlertTriangle size={18} /> Veri alınamadı</p>
          <p className="text-xs text-rose-600 font-medium mt-2">{hata}</p>
          <p className="text-xs text-rose-500 font-bold mt-2">
            → <code className="bg-white px-1.5 py-0.5 rounded">73-personel-karnesi.sql</code> çalıştırıldı mı?
          </p>
        </div>
      )}

      {mesaj && (
        <div className={`p-4 rounded-2xl text-xs font-bold mb-5 border ${
          mesaj.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
        }`}>{mesaj}</div>
      )}

      {/* 🎯 GÜNLÜK SKOR TABLOSU */}
      {skor && (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-5 mb-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap size={13} className="text-amber-400" /> BUGÜNÜN SKOR TABLOSU
              </p>
              <p className="text-[10px] font-bold text-slate-500 mt-0.5">{skor.tarih} · {skor.saat}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-white leading-none">
                {skor.yapilan_is}<span className="text-sm text-slate-400">/{skor.hedef_is}</span>
              </p>
              <p className="text-[10px] font-black text-amber-400">%{skor.is_orani} hedef</p>
            </div>
          </div>

          {/* HEDEF ÇUBUĞU */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase">Günlük Ciro Hedefi</span>
              <span className="text-[11px] font-black text-emerald-400">
                {para(skor.yapilan_ciro)} / {para(skor.hedef_ciro)} ₺
              </span>
            </div>
            <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${
                Number(skor.ciro_orani) >= 80 ? 'bg-emerald-500' : Number(skor.ciro_orani) >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${Math.min(100, Number(skor.ciro_orani))}%` }} />
            </div>
          </div>

          {gunlukPersonel.length === 0 ? (
            <p className="text-center text-xs font-bold text-slate-500 py-4">Bugün henüz iş kaydı yok.</p>
          ) : (
            <div className="space-y-2">
              {gunlukPersonel.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                    i === 0 ? 'bg-amber-400 text-slate-900' : i === 1 ? 'bg-slate-300 text-slate-800'
                    : i === 2 ? 'bg-orange-400 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black text-white truncate">{p.personel}</p>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(Number(p.ciro) / enYuksek) * 100}%` }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[13px] font-black text-emerald-400">{para(p.ciro)} ₺</p>
                    <p className="text-[9px] font-bold text-slate-400">{p.is} iş</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 🏆 AYLIK SIRALAMA */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-5">
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-3 flex items-center justify-between">
          <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Award size={15} /> {AYLAR[ayNo - 1].toUpperCase()} {yil} SIRALAMASI
          </p>
          <span className="text-[10px] font-black text-amber-100">
            {siralama.length} personel · isme tıkla → maliyet/kârlılık analizi
          </span>
        </div>
        {siralama.length === 0 ? (
          <p className="p-8 text-center text-xs font-bold text-slate-400">Bu ay iş kaydı yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr className="text-[10px] font-black text-slate-500 uppercase">
                  <th className="text-left px-4 py-2.5 w-16">Sıra</th>
                  <th className="text-left px-3 py-2.5">Personel</th>
                  <th className="text-right px-3 py-2.5">İş</th>
                  <th className="text-right px-3 py-2.5">Ciro</th>
                  <th className="text-right px-3 py-2.5">Ort. Süre</th>
                  <th className="text-right px-3 py-2.5">Puan</th>
                  <th className="text-right px-4 py-2.5">Performans</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {siralama.map((s: any) => (
                  <tr key={s.personel} className="hover:bg-slate-50 cursor-pointer" onClick={() => karneAc(s.personel)}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-xl font-black text-sm ${
                        s.sira === 1 ? 'bg-amber-100 text-amber-700'
                        : s.sira === 2 ? 'bg-slate-200 text-slate-700'
                        : s.sira === 3 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-500'}`}>
                        {s.madalya || s.sira}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-black text-slate-700">{s.personel}</td>
                    <td className="px-3 py-3 text-right font-black text-slate-600">{s.is_sayisi}</td>
                    <td className="px-3 py-3 text-right font-black text-emerald-700">{para(s.ciro)} ₺</td>
                    <td className="px-3 py-3 text-right font-bold text-slate-500">{s.ortalama_sure} sa</td>
                    <td className="px-3 py-3 text-right">
                      {Number(s.musteri_puani) > 0 ? (
                        <span className="font-black text-amber-600">★ {s.musteri_puani}</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${
                            Number(s.performans) >= 85 ? 'bg-emerald-500'
                            : Number(s.performans) >= 70 ? 'bg-blue-500'
                            : Number(s.performans) >= 55 ? 'bg-amber-500' : 'bg-rose-400'}`}
                            style={{ width: `${Math.min(100, Number(s.performans))}%` }} />
                        </div>
                        <span className="font-black text-slate-700 w-10 text-right">{Math.round(Number(s.performans))}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 🎓 YETKİNLİK MATRİSİ */}
      {matris.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-violet-700 px-4 py-3 flex items-center justify-between">
            <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
              <GraduationCap size={15} /> YETKİNLİK MATRİSİ
            </p>
            <span className="text-[10px] font-bold text-indigo-200">geçmişten öğrenildi · tıkla düzenle</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase sticky left-0 bg-slate-50">Personel</th>
                  {YETKINLIKLER.map((y) => (
                    <th key={y.k} className="text-center px-3 py-3 text-[10px] font-black text-slate-500 uppercase">
                      <span className="block text-base">{y.i}</span>{y.a}
                    </th>
                  ))}
                  <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase">İş</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {matris.map((m: any) => (
                  <tr key={m.personel} className="hover:bg-slate-50">
                    <td className="px-4 py-3 sticky left-0 bg-white">
                      <p className="font-black text-slate-700">{m.personel}</p>
                      <p className="text-[9px] font-bold text-slate-400">{m.kaynak}</p>
                    </td>
                    {YETKINLIKLER.map((y) => {
                      const sv = Number(m[y.k] || 1);
                      return (
                        <td key={y.k} className="px-3 py-3 text-center">
                          <button onClick={() => seviyeAyarla(m.personel, y.k, sv >= 5 ? 1 : sv + 1)}
                            title={`Seviye ${sv}/5 — tıkla artır`}
                            className={`text-sm font-black tracking-tighter transition hover:scale-110 ${
                              sv >= 4 ? 'text-emerald-600' : sv === 3 ? 'text-blue-600'
                              : sv === 2 ? 'text-amber-500' : 'text-slate-300'}`}>
                            {yildiz(sv)}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right font-black text-slate-600">{m.toplam_is}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400 font-medium px-4 py-3 bg-slate-50 border-t border-slate-100">
            💡 <strong>● sayısı seviye</strong> (1-5) · Yıldıza tıkla → seviye artar · Elle işaret otomatik öğrenmeyi ezer
          </p>
        </div>
      )}

      {/* ═══ KÂRLILIK + PERFORMANS MODALI ═══ */}
      <AnimatePresence>
        {secili && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4"
            onClick={() => setSecili(null)}>
            <motion.div initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full md:max-w-5xl rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">

              <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-100 px-4 md:px-5 py-3.5 flex items-start justify-between gap-3 z-20">
                <div className="min-w-0">
                  <h2 className="font-black text-slate-800 text-base md:text-lg truncate">
                    {karlilik?.personel || secili.ad}
                  </h2>
                  <p className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span>{AYLAR[ayNo - 1]} {yil}</span>
                    <span className="text-slate-300">·</span>
                    <span className="bg-slate-900 text-white px-1.5 py-0.5 rounded font-black text-[9px]">KDV HARİÇ</span>
                    {karlilik && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span>
                          {karlilik.ozet.planlanan_randevu !== null && karlilik.ozet.planlanan_randevu > 0
                            ? `${karlilik.ozet.is_sayisi} tamamlanan / ${karlilik.ozet.planlanan_randevu} planlanan`
                            : `${karlilik.ozet.is_sayisi} iş`}
                        </span>
                        {karlilik.eslesme !== 'maas' && (
                          <span className="text-amber-600">· eşleşme: {karlilik.eslesme}</span>
                        )}
                      </>
                    )}
                  </p>
                </div>
                <button onClick={() => setSecili(null)} className="p-2 hover:bg-slate-100 rounded-xl shrink-0">
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              <div className="p-4 md:p-5 space-y-4">
                {karlilikYuk ? (
                  <div className="py-16 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" />
                    <p className="text-[11px] font-bold text-slate-400 mt-2">Ciro, maliyet ve kâr hesaplanıyor…</p>
                  </div>
                ) : karlilikHata ? (
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
                    <p className="font-black text-rose-800 flex items-center gap-2 text-sm">
                      <AlertTriangle size={16} /> Kârlılık analizi alınamadı
                    </p>
                    <p className="text-[11px] text-rose-600 font-bold mt-1.5">{karlilikHata}</p>
                    <p className="text-[10px] text-rose-500 font-bold mt-2">
                      Bu analiz yalnızca yönetici oturumunda çalışır (prim/maliyet bilgisi personel ekranında görünmez).
                    </p>
                  </div>
                ) : karlilik ? (
                  <KarlilikPaneli v={karlilik} />
                ) : null}

                {/* PERFORMANS KARNESİ (katlanır — eski ekran korunur) */}
                {karneYuk ? (
                  <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>
                ) : karne ? (
                  <details className="bg-white border border-slate-200 rounded-3xl overflow-hidden group">
                    <summary className="px-4 py-3 bg-slate-50 cursor-pointer list-none flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1.5">
                        <Award size={12} /> PERFORMANS KARNESİ
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-600">
                          PUAN {Math.round(Number(karne.performans))} · {karne.performans_etiket}
                        </span>
                        <ChevronDown size={14} className="text-slate-400 group-open:rotate-180 transition" />
                      </span>
                    </summary>

                    <div className="p-4 space-y-4">

                      {/* PERFORMANS SKORU */}
                      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-4 text-center">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">PERFORMANS PUANI</p>
                        <p className="text-4xl font-black text-white mt-1.5 leading-none">{Math.round(Number(karne.performans))}</p>
                        <p className="text-sm font-black text-amber-400 mt-1.5">{karne.performans_etiket}</p>
                        {Number(karne.siralama) > 0 && (
                          <p className="text-[11px] font-bold text-slate-400 mt-1.5">
                            {karne.toplam_personel} personel içinde <b className="text-white">{karne.siralama}.</b>
                          </p>
                        )}
                      </div>

                      {/* METRİKLER */}
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { e: 'İŞ SAYISI', v: karne.is_sayisi, i: <Target size={15}/>, r: 'blue' },
                          { e: 'TOPLAM CİRO', v: `${para(karne.ciro)} ₺`, i: <TrendingUp size={15}/>, r: 'emerald' },
                          { e: 'ORT. SÜRE', v: `${karne.ortalama_sure} sa`, i: <Clock size={15}/>, r: 'violet' },
                          { e: 'MÜŞTERİ PUANI', v: karne.musteri_puani ? `★ ${karne.musteri_puani}` : '—', i: <Star size={15}/>, r: 'amber' },
                          { e: 'RAPOR DÜZENİ', v: karne.rapor_orani !== null ? `%${karne.rapor_orani}` : '—', i: <FileText size={15}/>, r: 'cyan' },
                          { e: 'İSG UYUMU', v: karne.isg_uyum !== null ? `%${karne.isg_uyum}` : '—', i: <Shield size={15}/>, r: 'rose' },
                          { e: 'MESAİ GÜNÜ', v: karne.mesai_gun, i: <Calendar size={15}/>, r: 'slate' },
                          { e: 'İZİN GÜNÜ', v: karne.izin_gun, i: <Calendar size={15}/>, r: 'slate' },
                        ].map((k, i) => {
                          const renk = k.r === 'emerald' ? 'bg-emerald-50 text-emerald-600'
                            : k.r === 'blue' ? 'bg-blue-50 text-blue-600'
                            : k.r === 'violet' ? 'bg-violet-50 text-violet-600'
                            : k.r === 'amber' ? 'bg-amber-50 text-amber-600'
                            : k.r === 'cyan' ? 'bg-cyan-50 text-cyan-600'
                            : k.r === 'rose' ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-600';
                          return (
                            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-3 flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${renk}`}>{k.i}</div>
                              <div className="min-w-0">
                                <p className="text-[9px] font-black text-slate-400 uppercase truncate">{k.e}</p>
                                <p className="text-sm font-black text-slate-700 leading-tight">{k.v}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* 6 AYLIK TREND */}
                      {Array.isArray(karne.trend) && karne.trend.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-3xl p-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-3">6 AYLIK TREND</p>
                          <div className="flex items-end gap-1.5 h-24">
                            {karne.trend.map((t: any, i: number) => {
                              const mx = Math.max(...karne.trend.map((x: any) => Number(x.ciro) || 0), 1);
                              return (
                                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                                  <span className="text-[8px] font-black text-slate-400 mb-1">{kisa(t.ciro)}</span>
                                  <div className={`w-full rounded-t-lg ${i === karne.trend.length - 1 ? 'bg-blue-600' : 'bg-slate-200'}`}
                                    style={{ height: `${Math.max((Number(t.ciro) / mx) * 100, 3)}%` }} />
                                  <span className="text-[8px] font-bold text-slate-400 mt-1">{AYLAR[Number(String(t.ay).slice(5,7)) - 1].slice(0,3)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* SON İŞLER */}
                      {Array.isArray(karne.son_isler) && karne.son_isler.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
                          <p className="text-[10px] font-black text-slate-400 uppercase px-4 py-3 bg-slate-50 border-b border-slate-100">
                            SON İŞLER
                          </p>
                          <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
                            {karne.son_isler.map((s: any, i: number) => (
                              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                                <span className="text-[10px] font-black text-slate-400 shrink-0 w-20">{s.tarih}</span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-black text-slate-700 truncate">{s.musteri}</p>
                                  <p className="text-[9px] font-bold text-slate-400">{s.tur} · {s.saat} sa</p>
                                </div>
                                {Number(s.ucret) > 0 && (
                                  <span className="text-[11px] font-black text-emerald-700 shrink-0">{para(s.ucret)} ₺</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PRİM TABLOSU */}
      <div className="mt-6">
        <PrimTablosu mod="admin" />
      </div>
    </div>
  );
}
