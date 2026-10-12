"use client";

// ----------------------------------------------------------------------------
// BUVISAN - STOK YÖNETİMİ 📦
// ----------------------------------------------------------------------------
//  * 383 malzemenin tamamını listeler, arama + filtre
//  * Satır üzerinde ADET ve KRİTİK SEVİYE girilir (tek tek veya toplu)
//  * Her değişiklik stok_hareket() ile kaydedilir → kim, ne zaman, kaç adet
//  * Giriş / Çıkış butonlarıyla hızlı stok işlemi
//  * Kritik seviyeye düşenler üstte kırmızı uyarı olarak çıkar
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Package, Search, Loader2, AlertTriangle, Save, Plus, Minus,
  History, RefreshCw, TrendingDown, CheckCircle2, X
} from 'lucide-react';

type Malzeme = {
  id: string;
  name: string;
  unit: string | null;
  buy_price: number | null;
  sale_price: number | null;
  stok_adet: number;
  kritik_seviye: number;
};

export default function StokSayfasi() {
  const router = useRouter();
  const [erisim, setErisim] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [malzemeler, setMalzemeler] = useState<Malzeme[]>([]);
  const [arama, setArama] = useState('');
  const [filtre, setFiltre] = useState<'hepsi' | 'kritik' | 'sifir'>('hepsi');
  const [kaydedilen, setKaydedilen] = useState<string | null>(null);
  const [islemde, setIslemde] = useState<string | null>(null);

  // Düzenlenen değerler (id -> değer)
  const [adetDuzenle, setAdetDuzenle] = useState<Record<string, string>>({});
  const [kritikDuzenle, setKritikDuzenle] = useState<Record<string, string>>({});

  // Hızlı işlem paneli
  const [hizliId, setHizliId] = useState<string | null>(null);
  const [hizliTip, setHizliTip] = useState<'giris' | 'cikis'>('giris');
  const [hizliMiktar, setHizliMiktar] = useState('1');
  const [hizliAciklama, setHizliAciklama] = useState('');

  // Hareket geçmişi
  const [gecmisAcik, setGecmisAcik] = useState(false);
  const [hareketler, setHareketler] = useState<any[]>([]);

  const verileriGetir = useCallback(async () => {
    const { data, error } = await supabase
      .from('materials')
      .select('id, name, unit, buy_price, sale_price, stok_adet, kritik_seviye')
      .order('name', { ascending: true });

    if (error) { console.error('Malzemeler alınamadı:', error.message); return; }
    setMalzemeler((data || []) as Malzeme[]);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.replace('/login'); return; }

        const { data: profil } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        if (!profil || profil.role !== 'admin') { router.replace('/personel'); return; }

        setErisim(true);
        await verileriGetir();
      } finally {
        setYukleniyor(false);
      }
    })();
  }, [router, verileriGetir]);

  const kritikler = useMemo(
    () => malzemeler.filter((m) => Number(m.kritik_seviye) > 0 && Number(m.stok_adet) <= Number(m.kritik_seviye)),
    [malzemeler]
  );

  const liste = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr-TR');
    return malzemeler.filter((m) => {
      if (filtre === 'kritik' && !(Number(m.kritik_seviye) > 0 && Number(m.stok_adet) <= Number(m.kritik_seviye))) return false;
      if (filtre === 'sifir' && Number(m.stok_adet) !== 0) return false;
      if (!q) return true;
      return String(m.name || '').toLocaleLowerCase('tr-TR').includes(q);
    });
  }, [malzemeler, arama, filtre]);

  // --- ADET KAYDET (sayım/düzeltme olarak hareket kaydı açar) ---
  const adetKaydet = async (m: Malzeme) => {
    const yeni = Number(adetDuzenle[m.id]);
    if (isNaN(yeni) || yeni < 0) { alert('Geçerli bir adet girin.'); return; }

    setIslemde(m.id);
    const { data, error } = await supabase.rpc('stok_hareket', {
      p_malzeme_id: m.id,
      p_tip: 'duzeltme',
      p_miktar: yeni,
      p_aciklama: 'Panelden sayım/düzeltme',
    });

    if (error || (data as any)?.ok === false) {
      alert('Kaydedilemedi: ' + (error?.message || (data as any)?.mesaj));
    } else {
      setAdetDuzenle((o) => { const y = { ...o }; delete y[m.id]; return y; });
      setKaydedilen(m.id);
      setTimeout(() => setKaydedilen(null), 1800);
      await verileriGetir();
    }
    setIslemde(null);
  };

  // --- KRİTİK SEVİYE KAYDET ---
  const kritikKaydet = async (m: Malzeme) => {
    const yeni = Number(kritikDuzenle[m.id]);
    if (isNaN(yeni) || yeni < 0) { alert('Geçerli bir seviye girin.'); return; }

    setIslemde(m.id);
    const { error } = await supabase.from('materials').update({ kritik_seviye: yeni }).eq('id', m.id);
    if (error) alert('Kaydedilemedi: ' + error.message);
    else {
      setKritikDuzenle((o) => { const y = { ...o }; delete y[m.id]; return y; });
      await verileriGetir();
    }
    setIslemde(null);
  };

  // --- HIZLI GİRİŞ / ÇIKIŞ ---
  const hizliKaydet = async () => {
    if (!hizliId) return;
    const miktar = Number(hizliMiktar);
    if (isNaN(miktar) || miktar <= 0) { alert('Geçerli bir miktar girin.'); return; }

    setIslemde(hizliId);
    const { data, error } = await supabase.rpc('stok_hareket', {
      p_malzeme_id: hizliId,
      p_tip: hizliTip,
      p_miktar: miktar,
      p_aciklama: hizliAciklama || (hizliTip === 'giris' ? 'Depo girişi' : 'Depo çıkışı'),
    });

    if (error) alert('İşlem başarısız: ' + error.message);
    else if ((data as any)?.ok === false) alert((data as any)?.mesaj || 'Stok yetersiz.');
    else {
      setHizliId(null); setHizliMiktar('1'); setHizliAciklama('');
      await verileriGetir();
    }
    setIslemde(null);
  };

  const gecmisiAc = async () => {
    setGecmisAcik(true);
    const { data } = await supabase
      .from('stok_hareketleri')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(60);
    setHareketler(data || []);
  };

  if (yukleniyor) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!erisim) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-xl max-w-sm">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="font-black text-slate-800 mb-1">Erişim Yok</h2>
          <p className="text-slate-500 text-sm">Stok yönetimi için yönetici girişi gerekir.</p>
        </div>
      </div>
    );
  }

  const kritikSayisi = kritikler.length;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* HEADER */}
      <div className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-40 border-b border-slate-800">
        <div className="max-w-5xl mx-auto flex justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin')} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-2.5 rounded-xl transition">
              <ArrowLeft size={18} />
            </button>
            <div className="bg-gradient-to-tr from-amber-500 to-orange-400 p-2.5 rounded-xl shadow-lg">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none">STOK YÖNETİMİ</h1>
              <p className="text-[10px] text-amber-400 font-medium tracking-widest uppercase">
                {malzemeler.length} malzeme {kritikSayisi > 0 ? `· ${kritikSayisi} kritik` : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={gecmisiAc} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-2.5 rounded-xl transition" title="Hareket geçmişi">
              <History size={18} />
            </button>
            <button onClick={verileriGetir} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-2.5 rounded-xl transition" title="Yenile">
              <RefreshCw size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-4">

        {/* KRİTİK UYARI */}
        {kritikSayisi > 0 && (
          <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <h3 className="font-black text-rose-800 text-sm">{kritikSayisi} PARÇA KRİTİK SEVİYEDE</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {kritikler.slice(0, 12).map((m) => (
                <span key={m.id} className="bg-white border border-rose-200 text-rose-700 text-[10px] font-bold px-2.5 py-1 rounded-lg">
                  {m.name} · {m.stok_adet} {m.unit || 'adet'}
                </span>
              ))}
              {kritikSayisi > 12 && <span className="text-[10px] font-bold text-rose-500 self-center">+{kritikSayisi - 12} tane daha</span>}
            </div>
          </div>
        )}

        {/* ARAMA + FİLTRE */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder="Malzeme ara..."
              className="w-full pl-10 pr-3 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:border-amber-400 shadow-sm"
            />
          </div>
          <div className="flex bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
            {([['hepsi', 'Tümü'], ['kritik', 'Kritik'], ['sifir', 'Sıfır Stok']] as const).map(([k, e]) => (
              <button key={k} onClick={() => setFiltre(k)}
                className={`px-3.5 py-2 rounded-xl text-[11px] font-bold transition ${filtre === k ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* BİLGİ */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 flex gap-2">
          <TrendingDown size={15} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-800 font-medium leading-relaxed">
            Adet kutusuna gerçek sayımı yazıp <strong>✓</strong> bas — her değişiklik <strong>kim, ne zaman, kaç adet</strong> olarak kaydedilir.
            <strong> Kritik seviye</strong> girersen (örn. 5), stok o seviyeye düşünce sabah Telegram bildiriminde uyarı çıkar.
          </p>
        </div>

        {/* LİSTE */}
        <div className="space-y-2">
          {liste.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-slate-300">
              <Package className="w-9 h-9 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-500">Kayıt bulunamadı</p>
            </div>
          ) : (
            liste.map((m) => {
              const adetDegeri = adetDuzenle[m.id] ?? String(m.stok_adet ?? 0);
              const kritikDegeri = kritikDuzenle[m.id] ?? String(m.kritik_seviye ?? 0);
              const kritikMi = Number(m.kritik_seviye) > 0 && Number(m.stok_adet) <= Number(m.kritik_seviye);
              const adetDegisti = adetDuzenle[m.id] !== undefined && Number(adetDuzenle[m.id]) !== Number(m.stok_adet);
              const kritikDegisti = kritikDuzenle[m.id] !== undefined && Number(kritikDuzenle[m.id]) !== Number(m.kritik_seviye);

              return (
                <motion.div key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className={`bg-white rounded-2xl border p-3.5 ${kritikMi ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{m.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {m.unit || 'adet'} · alış {Number(m.buy_price || 0).toLocaleString('tr-TR')} ₺
                        {kritikMi && <span className="text-rose-600 font-black"> · KRİTİK</span>}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* ADET */}
                      <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase">Adet</span>
                        <input
                          type="number" min={0}
                          value={adetDegeri}
                          onChange={(e) => setAdetDuzenle((o) => ({ ...o, [m.id]: e.target.value }))}
                          className={`w-16 bg-transparent text-sm font-black text-center outline-none ${kritikMi ? 'text-rose-600' : 'text-slate-800'}`}
                        />
                        {adetDegisti && (
                          <button onClick={() => adetKaydet(m)} disabled={islemde === m.id}
                            className="bg-emerald-500 text-white p-1.5 rounded-lg hover:bg-emerald-600 transition">
                            {islemde === m.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          </button>
                        )}
                        {kaydedilen === m.id && <CheckCircle2 size={14} className="text-emerald-500" />}
                      </div>

                      {/* KRİTİK SEVİYE */}
                      <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase">Uyarı</span>
                        <input
                          type="number" min={0}
                          value={kritikDegeri}
                          onChange={(e) => setKritikDuzenle((o) => ({ ...o, [m.id]: e.target.value }))}
                          className="w-12 bg-transparent text-sm font-bold text-center text-slate-600 outline-none"
                        />
                        {kritikDegisti && (
                          <button onClick={() => kritikKaydet(m)} disabled={islemde === m.id}
                            className="bg-blue-500 text-white p-1.5 rounded-lg hover:bg-blue-600 transition">
                            <Save size={12} />
                          </button>
                        )}
                      </div>

                      {/* GİRİŞ / ÇIKIŞ */}
                      <div className="flex gap-1">
                        <button onClick={() => { setHizliId(m.id); setHizliTip('giris'); setHizliMiktar('1'); setHizliAciklama(''); }}
                          className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-2.5 rounded-xl hover:bg-emerald-100 transition" title="Stok girişi">
                          <Plus size={14} />
                        </button>
                        <button onClick={() => { setHizliId(m.id); setHizliTip('cikis'); setHizliMiktar('1'); setHizliAciklama(''); }}
                          className="bg-rose-50 border border-rose-200 text-rose-700 p-2.5 rounded-xl hover:bg-rose-100 transition" title="Stok çıkışı">
                          <Minus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* HIZLI İŞLEM PANELİ */}
                  {hizliId === m.id && (
                    <div className={`mt-3 rounded-xl p-3 border ${hizliTip === 'giris' ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                      <p className={`text-[10px] font-black uppercase tracking-wider mb-2 ${hizliTip === 'giris' ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {hizliTip === 'giris' ? '📥 Stok Girişi' : '📤 Stok Çıkışı'} — {m.name}
                      </p>
                      <div className="flex gap-2">
                        <input type="number" min={1} value={hizliMiktar} onChange={(e) => setHizliMiktar(e.target.value)}
                          className="w-20 p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-black text-center outline-none" />
                        <input value={hizliAciklama} onChange={(e) => setHizliAciklama(e.target.value)}
                          placeholder="Açıklama (örn: fatura no, hangi iş)"
                          className="flex-1 p-2.5 bg-white border border-slate-200 rounded-lg text-xs outline-none" />
                        <button onClick={hizliKaydet} disabled={islemde === m.id}
                          className={`px-4 py-2.5 rounded-lg text-[11px] font-black text-white transition ${hizliTip === 'giris' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                          {islemde === m.id ? <Loader2 size={13} className="animate-spin" /> : 'KAYDET'}
                        </button>
                        <button onClick={() => setHizliId(null)} className="px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-500">
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* HAREKET GEÇMİŞİ PANELİ */}
      {gecmisAcik && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[900] flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setGecmisAcik(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white w-full max-w-2xl rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[85dvh] overflow-hidden flex flex-col">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <History size={18} className="text-slate-300" />
                <h3 className="font-black text-sm">STOK HAREKET GEÇMİŞİ</h3>
              </div>
              <button onClick={() => setGecmisAcik(false)} className="bg-slate-800 hover:bg-red-500 p-2 rounded-full transition"><X size={16} /></button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {hareketler.length === 0 ? (
                <p className="text-center text-slate-400 text-sm font-bold py-10">Henüz hareket yok</p>
              ) : (
                hareketler.map((h) => (
                  <div key={h.id} className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-3">
                    <span className={`p-2 rounded-lg ${h.tip === 'giris' ? 'bg-emerald-100 text-emerald-700' : h.tip === 'cikis' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>
                      {h.tip === 'giris' ? <Plus size={12} /> : h.tip === 'cikis' ? <Minus size={12} /> : <RefreshCw size={12} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-700 truncate">{h.malzeme_adi}</p>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {new Date(h.created_at).toLocaleString('tr-TR')}
                        {h.aciklama ? ` · ${h.aciklama}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-black ${h.tip === 'giris' ? 'text-emerald-600' : h.tip === 'cikis' ? 'text-rose-600' : 'text-blue-600'}`}>
                        {h.tip === 'cikis' ? '−' : h.tip === 'giris' ? '+' : '='}{h.miktar}
                      </p>
                      <p className="text-[9px] text-slate-400 font-bold">{h.onceki_adet} → {h.sonraki_adet}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
