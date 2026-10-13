"use client";

// ----------------------------------------------------------------------------
// BUVISAN - PUANTAJ YÖNETİMİ 📅
// Günlük puantaj girişi + maaş güncelleme + aylık özet.
// Cumartesi otomatik %50, pazar otomatik %100 mesaiye yazılır.
// Kaynak: maas_listesi() · maas_guncelle() · puantaj_gun_ekle() · personel_kazanc()
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays, Loader2, ArrowLeft, Save, Plus, X, Wallet,
  Check, AlertTriangle, RefreshCw, Users, ChevronLeft, ChevronRight, Printer
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PERSONEL_LISTESI } from '@/lib/personel';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

// Maaş gösterimi: PUANTAJ MOTORU ÖNCELİKLİ
//   (geçmiş aylarda kilitli değeri döndürür → maaş güncellense bile değişmez)
//   Motor 0 dönerse maaş tablosuna düşülür.
const maasGoster = (motorDegeri: any, maasTablosu: any) => {
  const m = Number(motorDegeri || 0);
  const t = Number(maasTablosu || 0);
  return para(m > 0 ? m : t);
};
const parendeksiYok = maasGoster;
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export default function PuantajSayfasi() {
  const router = useRouter();
  const bugun = new Date();
  const [ay, setAy] = useState(`${bugun.getFullYear()}-${String(bugun.getMonth() + 1).padStart(2, '0')}`);
  const [maaslar, setMaaslar] = useState<any[]>([]);
  const [ozetler, setOzetler] = useState<Record<string, any>>({});
  const [yukleniyor, setYukleniyor] = useState(true);
  const [duzenlenen, setDuzenlenen] = useState<string>('');
  const [yeniMaas, setYeniMaas] = useState('');
  const [mesaj, setMesaj] = useState('');

  // Günlük giriş formu
  const [gunForm, setGunForm] = useState(false);
  const [gPersonel, setGPersonel] = useState(PERSONEL_LISTESI[0] || '');
  const [gTarih, setGTarih] = useState(new Date().toISOString().slice(0, 10));
  const [gSaat, setGSaat] = useState('9');
  const [gIzin, setGIzin] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      const { data: m } = await supabase.rpc('maas_listesi');
      setMaaslar(m || []);

      const yeni: Record<string, any> = {};
      for (const p of PERSONEL_LISTESI) {
        try {
          const { data } = await supabase.rpc('personel_kazanc', { p_personel: p, p_ay: ay });
          if (data && !(data as any).yetki_yok) yeni[p] = data;
        } catch { /* tek kişi hata verse de devam */ }
      }
      setOzetler(yeni);
    } finally {
      setYukleniyor(false);
    }
  }, [ay]);

  useEffect(() => { getir(); }, [getir]);

  const maasKaydet = async (personel: string) => {
    // "38.000" veya "38,000" gibi yazımları da doğru anla (38 değil 38000)
    const temiz = String(yeniMaas).trim().replace(/\./g, '').replace(',', '.');
    const tutar = Number(temiz);

    if (!temiz || isNaN(tutar) || tutar <= 0) {
      setMesaj('Lütfen geçerli bir maaş tutarı girin (örn: 38000 veya 38.000).');
      return;
    }
    if (tutar < 1000) {
      setMesaj(`Girdiğiniz tutar çok düşük görünüyor: ${tutar} ₺. Maaş için 38.000 gibi tam tutarı yazın.`);
      return;
    }

    const { data, error } = await supabase.rpc('maas_guncelle', {
      p_personel: personel, p_maas: tutar, p_kullanici: null,
    });
    if (error || !(data as any)?.ok) {
      setMesaj(error?.message || (data as any)?.mesaj || 'Güncellenemedi.');
      return;
    }
    setMesaj('✅ ' + ((data as any).mesaj || 'Kaydedildi.'));
    setDuzenlenen('');
    setYeniMaas('');
    await getir();
    setTimeout(() => setMesaj(''), 3000);
  };

  const gunKaydet = async () => {
    setKaydediliyor(true);
    try {
      const { data, error } = await supabase.rpc('puantaj_gun_ekle', {
        p_personel: gPersonel,
        p_tarih: gTarih,
        p_giris: null,
        p_cikis: null,
        p_saat: gIzin ? 0 : Number(gSaat) || 0,
        p_izin: gIzin,
        p_aciklama: null,
        p_kullanici: null,
      });
      if (error || !(data as any)?.ok) {
        setMesaj(error?.message || (data as any)?.mesaj || 'Kaydedilemedi.');
        return;
      }
      setMesaj('✅ ' + ((data as any).mesaj || 'Kaydedildi.'));
      await getir();
      setTimeout(() => { setGunForm(false); setMesaj(''); }, 1600);
    } finally { setKaydediliyor(false); }
  };

  const ayDegistir = (yon: number) => {
    const [y, m] = ay.split('-').map(Number);
    const d = new Date(y, m - 1 + yon, 1);
    setAy(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const [yil, ayNo] = ay.split('-').map(Number);

  // Her personel için gösterilecek değerleri TEK yerden hesapla
  // (üstteki toplamlar ile alttaki satırlar BİRBİRİNİ TUTSUN)
  const satirlar = PERSONEL_LISTESI.map((p) => {
    const o = ozetler[p] || {};
    const mk = maaslar.find((m) => m.personel?.toLocaleUpperCase('tr-TR') === p.toLocaleUpperCase('tr-TR'));
    // ⭐ MOTOR ÖNCELİKLİ: geçmiş ayda kilitli değeri döndürür (maaş değişse bile sabit kalır)
    const maas = Number(o.maas) > 0 ? Number(o.maas) : Number(mk?.maas || 0);
    const mesaiTutar = Number(o.toplam_mesai || 0);
    const net = Number(o.net_ele_gecen) > 0 ? Number(o.net_ele_gecen) : (maas + mesaiTutar);
    return { p, o, mk, maas, mesaiTutar, net, cmt50: Number(o.mesai50_saat || 0), paz100: Number(o.mesai100_saat || 0) };
  });

  const toplamMaas = satirlar.reduce((t, s) => t + s.maas, 0);
  const toplamMesai = satirlar.reduce((t, s) => t + s.mesaiTutar, 0);
  const netToplamGoster = satirlar.reduce((t, s) => t + s.net, 0);

  return (
    <>
    {/* ================= EKRAN GÖRÜNÜMÜ (yazdırmada gizlenir) ================= */}
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8 print:hidden">
      <div className="max-w-[1200px] mx-auto space-y-6">

        {/* BAŞLIK */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin')}
              className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                <CalendarDays className="text-blue-600" /> PUANTAJ
              </h1>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                Günlük giriş · otomatik mesai · maaş yönetimi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => ayDegistir(-1)} className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-300 transition-all">
              <ChevronLeft size={18} />
            </button>
            <span className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-slate-200 font-black text-sm min-w-[130px] text-center">
              {AYLAR[ayNo - 1]} {yil}
            </span>
            <button onClick={() => ayDegistir(1)} className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-300 transition-all">
              <ChevronRight size={18} />
            </button>
            <button onClick={() => setGunForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-2xl font-black text-xs flex items-center gap-2 shadow-lg transition active:scale-95">
              <Plus size={16} /> GÜN EKLE
            </button>
            <button onClick={() => window.print()}
              className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-3 rounded-2xl font-black text-xs flex items-center gap-2 shadow-lg transition active:scale-95">
              <Printer size={16} /> PDF İNDİR
            </button>
          </div>
        </div>

        {mesaj && (
          <div className={`p-4 rounded-2xl text-xs font-bold border ${mesaj.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
            {mesaj}
          </div>
        )}

        {/* AYLIK TOPLAM */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Personel</p>
            <p className="text-2xl font-black text-slate-800 leading-none">{PERSONEL_LISTESI.length}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Toplam Maaş</p>
            <p className="text-xl font-black text-slate-700 leading-none">{para(toplamMaas)} ₺</p>
          </div>
          <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-blue-500 mb-1">Toplam Mesai</p>
            <p className="text-xl font-black text-blue-700 leading-none">{para(toplamMesai)} ₺</p>
          </div>
          <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-1">Net Toplam</p>
            <p className="text-xl font-black text-emerald-700 leading-none">{para(netToplamGoster)} ₺</p>
          </div>
        </div>

        {yukleniyor && (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-100">
            <Loader2 className="w-7 h-7 animate-spin text-blue-500 mx-auto" />
          </div>
        )}

        {/* PERSONEL LİSTESİ */}
        {!yukleniyor && (
          <div className="space-y-3">
            {PERSONEL_LISTESI.map((p) => {
              const o = ozetler[p] || {};
              const mKayit = maaslar.find((m) => m.personel?.toLocaleUpperCase('tr-TR') === p.toLocaleUpperCase('tr-TR'));
              const duzenliyor = duzenlenen === p;
              return (
                <div key={p} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-800">{p}</p>
                      <p className="text-[10px] text-slate-400 font-bold">
                        {o.is_sayisi || 0} iş · {o.calisma_saati || 0} saat · {para(o.toplam_ciro)} ₺ ciro
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black text-emerald-700 leading-none">
                        {para(Number(o.net_ele_gecen) > 0 ? o.net_ele_gecen : (Number(mKayit?.maas) || Number(o.maas) || 0))} ₺
                      </p>
                      <p className="text-[9px] text-slate-400 font-bold mt-0.5">net ele geçen</p>
                    </div>
                  </div>

                  {/* ⛱️ İZİN GÜNLERİ (onaylı izinler puantaja işlenir) */}
                  {Number(o.izin_gun) > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3 flex items-center justify-between">
                      <span className="text-[10px] font-black text-amber-700">
                        ⛱️ {o.izin_gun} gün onaylı izin
                      </span>
                      <span className="text-[9px] font-bold text-amber-600">
                        {Number(o.gun_sayisi) || 0} gün çalıştı
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                    <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase">Maaş</p>
                      {duzenliyor ? (
                        <div>
                          <input type="number" value={yeniMaas} onChange={(e) => setYeniMaas(e.target.value)}
                            placeholder={String(mKayit?.maas || o.maas || '38000')}
                            className="w-full mt-1 p-2 bg-white border border-blue-300 rounded-lg text-xs font-black outline-none" />
                          <p className="text-[8px] text-blue-500 font-bold mt-0.5">
                            Şu anki: {para(mKayit?.maas || o.maas)} ₺
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm font-black text-slate-700">
                            {parendeksiYok(o.maas, mKayit?.maas)} ₺
                          </p>
                          {o.maas_kaynagi && String(o.maas_kaynagi).includes('kilitli') && (
                            <p className="text-[8px] font-black text-blue-600 mt-0.5">🔒 geçmiş ay — kilitli</p>
                          )}
                        </div>
                      )}
                    </div>                    <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-100">
                      <p className="text-[9px] font-black text-blue-500 uppercase">Cmt %50</p>
                      <p className="text-sm font-black text-blue-700">{o.mesai50_saat || 0} sa</p>
                    </div>
                    <div className="bg-violet-50 rounded-xl p-2.5 border border-violet-100">
                      <p className="text-[9px] font-black text-violet-500 uppercase">Paz %100</p>
                      <p className="text-sm font-black text-violet-700">{o.mesai100_saat || 0} sa</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-100">
                      <p className="text-[9px] font-black text-amber-500 uppercase">Mesai Tutarı</p>
                      <p className="text-sm font-black text-amber-700">{para(o.toplam_mesai)} ₺</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {duzenliyor ? (
                      <>
                        <button onClick={() => maasKaydet(p)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-black text-[10px] flex items-center justify-center gap-1.5 transition">
                          <Save size={13} /> MAAŞI KAYDET
                        </button>
                        <button onClick={() => { setDuzenlenen(''); setYeniMaas(''); }}
                          className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-black text-[10px] transition">
                          İPTAL
                        </button>
                      </>
                    ) : (
                      <button onClick={() => { setDuzenlenen(p); setYeniMaas(String(mKayit?.maas || o.maas || '')); }}
                        className="flex-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 py-2.5 rounded-xl font-black text-[10px] flex items-center justify-center gap-1.5 transition">
                        <Wallet size={13} /> MAAŞI GÜNCELLE
                      </button>
                    )}
                    <button onClick={() => { setGPersonel(p); setGunForm(true); }}
                      className="px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-black text-[10px] flex items-center gap-1.5 transition">
                      <Plus size={13} /> GÜN
                    </button>
                  </div>

                  {!(Number(mKayit?.maas) > 0) && !(Number(o.maas) > 0) && (
                    <p className="text-[10px] text-amber-600 font-bold mt-2">
                      ⚠️ Maaş girilmemiş — &quot;MAAŞI GÜNCELLE&quot; ile ekleyin.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex gap-2">
          <AlertTriangle size={15} className="text-blue-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-900 font-medium leading-relaxed">
            <strong>Otomatik mesai:</strong> Gün eklerken <strong>cumartesi</strong> günü girilen saat
            otomatik <strong>%50</strong>, <strong>pazar</strong> günü girilen saat otomatik <strong>%100</strong> mesaiye yazılır.
            Sen sadece saati giriyorsun.
          </p>
        </div>
      </div>

      {/* GÜN EKLEME FORMU */}
      <AnimatePresence>
        {gunForm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setGunForm(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[900]" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed inset-x-0 bottom-0 md:inset-0 md:m-auto md:h-fit md:max-w-lg z-[901] bg-white rounded-t-[2rem] md:rounded-3xl shadow-2xl max-h-[92dvh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
                <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                  <CalendarDays size={16} className="text-blue-600" /> GÜN EKLE
                </h3>
                <button onClick={() => setGunForm(false)} className="bg-slate-100 hover:bg-red-500 hover:text-white text-slate-500 p-2 rounded-full transition">
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Personel</label>
                  <select value={gPersonel} onChange={(e) => setGPersonel(e.target.value)}
                    className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-blue-500">
                    {PERSONEL_LISTESI.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tarih</label>
                    <input type="date" value={gTarih} onChange={(e) => setGTarih(e.target.value)}
                      className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Saat</label>
                    <input type="number" step="0.5" value={gSaat} onChange={(e) => setGSaat(e.target.value)}
                      disabled={gIzin}
                      className="w-full mt-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-blue-500 disabled:opacity-40" />
                  </div>
                </div>

                <button onClick={() => setGIzin((v) => !v)}
                  className={`w-full py-3 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition ${gIzin ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {gIzin ? <><Check size={14} /> İZİNLİ GÜN OLARAK İŞARETLENDİ</> : <>İZİN GÜNÜ OLARAK İŞARETLE</>}
                </button>

                {/* Gün tipi önizleme */}
                <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Bu gün nasıl yazılacak?</p>
                  {(() => {
                    const d = new Date(gTarih + 'T00:00:00');
                    const dow = d.getDay();
                    if (gIzin) return <p className="text-xs font-black text-amber-600">🟡 İZİN GÜNÜ (çalışma yok)</p>;
                    if (dow === 6) return <p className="text-xs font-black text-blue-600">🔵 CUMARTESİ → %50 mesaiye yazılır</p>;
                    if (dow === 0) return <p className="text-xs font-black text-violet-600">🟣 PAZAR → %100 mesaiye yazılır</p>;
                    return <p className="text-xs font-black text-emerald-600">🟢 HAFTA İÇİ → normal çalışma</p>;
                  })()}
                </div>

                <button onClick={gunKaydet} disabled={kaydediliyor}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98]">
                  {kaydediliyor ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  KAYDET
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>

    {/* ================= PDF / YAZDIRMA GÖRÜNÜMÜ ================= */}
    <div className="hidden print:block p-8 text-black bg-white">
      <div className="text-center mb-6 border-b-2 border-black pb-4">
        <h1 className="text-2xl font-black tracking-tight">BUVİSAN VİNÇ SERVİS</h1>
        <p className="text-sm font-bold mt-1">PUANTAJ LİSTESİ</p>
        <p className="text-lg font-black mt-1">{AYLAR[ayNo - 1].toUpperCase()} {yil}</p>
      </div>

      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="bg-slate-200">
            <th className="border border-black p-2 text-left">PERSONEL</th>
            <th className="border border-black p-2 text-right">MAAŞ</th>
            <th className="border border-black p-2 text-right">CMT %50</th>
            <th className="border border-black p-2 text-right">PAZ %100</th>
            <th className="border border-black p-2 text-right">MESAİ</th>
            <th className="border border-black p-2 text-right">AVANS</th>
            <th className="border border-black p-2 text-right">KESİNTİ</th>
            <th className="border border-black p-2 text-right">NET</th>
          </tr>
        </thead>
        <tbody>
          {satirlar.map((s) => (
            <tr key={s.p}>
              <td className="border border-black p-2 font-bold">{s.p}</td>
              <td className="border border-black p-2 text-right">{para(s.maas)}</td>
              <td className="border border-black p-2 text-right">{s.cmt50 > 0 ? `${s.cmt50} sa` : '-'}</td>
              <td className="border border-black p-2 text-right">{s.paz100 > 0 ? `${s.paz100} sa` : '-'}</td>
              <td className="border border-black p-2 text-right">{para(s.mesaiTutar)}</td>
              <td className="border border-black p-2 text-right">{para(s.o.avans)}</td>
              <td className="border border-black p-2 text-right">{para(s.o.kesinti)}</td>
              <td className="border border-black p-2 text-right font-black">{para(s.net)}</td>
            </tr>
          ))}
          <tr className="bg-slate-100 font-black">
            <td className="border border-black p-2">TOPLAM</td>
            <td className="border border-black p-2 text-right">{para(toplamMaas)}</td>
            <td className="border border-black p-2"></td>
            <td className="border border-black p-2"></td>
            <td className="border border-black p-2 text-right">{para(toplamMesai)}</td>
            <td className="border border-black p-2"></td>
            <td className="border border-black p-2"></td>
            <td className="border border-black p-2 text-right">{para(netToplamGoster)}</td>
          </tr>
        </tbody>
      </table>

      <p className="text-[10px] mt-3 font-medium">
        Not: Hafta içi çalışma 08:00-18:00&apos;dir. Hafta sonu çalışmalarında cumartesi %50,
        pazar %100 zamlı ücret uygulanır.
      </p>

      <div className="flex justify-between mt-16 text-xs font-bold">
        <div className="text-center">
          <p>Düzenleyen</p>
          <p className="mt-12 border-t border-black pt-1 px-8">İmza</p>
        </div>
        <div className="text-center">
          <p>Onaylayan</p>
          <p className="mt-12 border-t border-black pt-1 px-8">İmza</p>
        </div>
        <div className="text-center">
          <p>Tarih</p>
          <p className="mt-12 border-t border-black pt-1 px-8">
            {new Date().toLocaleDateString('tr-TR')}
          </p>
        </div>
      </div>
    </div>
    </>
  );
}
