"use client";

// ----------------------------------------------------------------------------
// BUVISAN - FİNANS ÖZETİ (TEK DOĞRULUK KAYNAĞI) 💰
// ----------------------------------------------------------------------------
//  Bu kart rakamları finans_ozet() fonksiyonundan alır — panelin, analiz
//  sayfasının ve yapay zekanın göreceği TEK doğru rakam kümesi.
//
//  Kurallar (Kaya'nın kararı):
//    • Personel gideri : gider tablosuna ELLE girilen maaş
//    • Malzeme gideri  : servis raporlarındaki gerçek parça kullanımından
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { TrendingUp, TrendingDown, Wallet, AlertTriangle, Loader2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

export default function FinansOzetKarti({ baslangicAy }: { baslangicAy?: string }) {
  const bugun = new Date();
  const [ay, setAy] = useState(baslangicAy || `${bugun.getFullYear()}-${String(bugun.getMonth() + 1).padStart(2, '0')}`);
  const [ozet, setOzet] = useState<any>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data, error } = await supabase.rpc('finans_ozet', { p_ay: ay });
      if (error) console.warn('Finans özeti alınamadı:', error.message);
      setOzet(error ? null : data);

      const { data: t } = await supabase.rpc('finans_trend', { p_adet: 6 });
      setTrend(t || []);
    } finally {
      setYukleniyor(false);
    }
  }, [ay]);

  useEffect(() => { getir(); }, [getir]);

  const ayDegistir = (yon: number) => {
    const [y, m] = ay.split('-').map(Number);
    const d = new Date(y, m - 1 + yon, 1);
    setAy(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  if (yukleniyor && !ozet) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 text-center">
        <Loader2 className="w-7 h-7 animate-spin text-emerald-500 mx-auto" />
      </div>
    );
  }

  if (!ozet) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={16} className="text-amber-600" />
          <h3 className="font-black text-amber-800 text-sm">Finans modülü hazır değil</h3>
        </div>
        <p className="text-[11px] text-amber-700 font-medium">
          <code>sql/18-finans-v2-kurallarinla.sql</code> scriptinin çalıştırılması gerekiyor.
        </p>
      </div>
    );
  }

  const netKar = Number(ozet.net_kar || 0);
  const karli = netKar >= 0;
  const [yil, ayNo] = ay.split('-').map(Number);

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      {/* BAŞLIK */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/20 p-2 rounded-xl">
            <Wallet className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-white font-black text-sm tracking-tight leading-none">FİNANS ÖZETİ</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
              Tek doğruluk kaynağı · {ozet.personel_kaynagi}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => ayDegistir(-1)} className="text-slate-400 hover:text-white bg-white/10 p-2 rounded-lg transition">
            <ChevronLeft size={15} />
          </button>
          <span className="text-white font-black text-xs px-2 min-w-[90px] text-center">
            {AYLAR[ayNo - 1]} {yil}
          </span>
          <button onClick={() => ayDegistir(1)} className="text-slate-400 hover:text-white bg-white/10 p-2 rounded-lg transition">
            <ChevronRight size={15} />
          </button>
          <button onClick={getir} className="text-slate-400 hover:text-white bg-white/10 p-2 rounded-lg transition ml-1" title="Yenile">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">

        {/* UYARI */}
        {ozet.uyari && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex gap-2">
            <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 font-bold leading-relaxed">{ozet.uyari}</p>
          </div>
        )}

        {/* ANA RAKAMLAR */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Ciro</p>
            <p className="text-2xl font-black text-slate-800 leading-none">{para(ozet.ciro)} ₺</p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">{ozet.is_adedi} iş</p>
          </div>

          <div className="bg-rose-50 rounded-2xl p-4 border border-rose-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-rose-400 mb-1">Personel</p>
            <p className="text-2xl font-black text-rose-700 leading-none">{para(ozet.personel_gideri)} ₺</p>
            <p className="text-[10px] text-rose-400 font-bold mt-1">elle girilen maaş</p>
          </div>

          <div className="bg-orange-50 rounded-2xl p-4 border border-orange-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-orange-400 mb-1">Malzeme</p>
            <p className="text-2xl font-black text-orange-700 leading-none">{para(ozet.malzeme_gideri)} ₺</p>
            <p className="text-[10px] text-orange-400 font-bold mt-1">
              {ozet.malzeme_kaynagi || 'raporlardan otomatik'}
              {Number(ozet.malzeme_rapor || 0) > 0 && Number(ozet.malzeme_elle || 0) > 0
                && Number(ozet.malzeme_rapor) !== Number(ozet.malzeme_elle) && (
                <span className="text-orange-500"> · elle: {para(ozet.malzeme_elle)} ₺</span>
              )}
            </p>
          </div>

          <div className={`rounded-2xl p-4 border ${karli ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
            <p className={`text-[10px] font-black uppercase tracking-wider mb-1 ${karli ? 'text-emerald-500' : 'text-rose-500'}`}>Net Kâr</p>
            <p className={`text-2xl font-black leading-none flex items-center gap-1.5 ${karli ? 'text-emerald-700' : 'text-rose-700'}`}>
              {karli ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              {para(netKar)} ₺
            </p>
            <p className={`text-[10px] font-bold mt-1 ${karli ? 'text-emerald-500' : 'text-rose-400'}`}>
              marj %{ozet.kar_marji_yuzde}
            </p>
          </div>
        </div>

        {/* GİDER DAĞILIMI */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Toplam Gider</span>
            <span className="text-sm font-black text-slate-700">{para(ozet.toplam_gider)} ₺</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-slate-200">
            {Number(ozet.toplam_gider) > 0 && (
              <>
                <div className="bg-rose-400" style={{ width: `${(Number(ozet.personel_gideri) / Number(ozet.toplam_gider)) * 100}%` }} title="Personel" />
                <div className="bg-orange-400" style={{ width: `${(Number(ozet.malzeme_gideri) / Number(ozet.toplam_gider)) * 100}%` }} title="Malzeme" />
                <div className="bg-slate-400" style={{ width: `${(Number(ozet.sabit_giderler) / Number(ozet.toplam_gider)) * 100}%` }} title="Sabit" />
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-3 mt-2.5">
            {[['bg-rose-400', `Personel ${para(ozet.personel_gideri)} ₺`],
              ['bg-orange-400', `Malzeme ${para(ozet.malzeme_gideri)} ₺`],
              ['bg-slate-400', `Sabit ${para(ozet.sabit_giderler)} ₺`]].map(([c, l]) => (
              <span key={l} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                <span className={`w-2 h-2 rounded-full ${c}`} /> {l}
              </span>
            ))}
          </div>
        </div>

        {/* 6 AYLIK TREND */}
        {trend.length > 0 && (
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">Son 6 Ay · Ciro / Net Kâr</p>
            <div className="space-y-2">
              {trend.map((t) => {
                const enBuyuk = Math.max(...trend.map((x: any) => Number(x.ciro) || 1));
                const ciroYuzde = (Number(t.ciro) / enBuyuk) * 100;
                const karYuzde = Number(t.ciro) > 0 ? (Number(t.net_kar) / Number(t.ciro)) * 100 : 0;
                const [ty, tm] = String(t.ay).split('-').map(Number);
                return (
                  <div key={t.ay} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 w-14 shrink-0">{AYLAR[tm - 1].slice(0, 3)} {String(ty).slice(2)}</span>
                    <div className="flex-1 h-5 bg-slate-200 rounded-lg overflow-hidden relative">
                      <div className="h-full bg-blue-400/70" style={{ width: `${ciroYuzde}%` }} />
                      <span className="absolute inset-y-0 left-2 flex items-center text-[9px] font-black text-slate-700">
                        {para(t.ciro)} ₺
                      </span>
                    </div>
                    <span className={`text-[10px] font-black w-20 text-right ${Number(t.net_kar) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {Number(t.net_kar) >= 0 ? '+' : ''}{para(t.net_kar)} ₺
                      <span className="text-slate-400 font-bold ml-1">%{Math.round(karYuzde)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-[10px] text-slate-400 font-medium text-center">
          Bu rakamlar panelin, analiz sayfasının ve yapay zekanın kullandığı <strong>tek doğru kaynaktır</strong>.
        </p>
      </div>
    </div>
  );
}
