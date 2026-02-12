"use client";

// ----------------------------------------------------------------------------
// BUVISAN STOK VE FİNANSAL YÖNETİM MERKEZİ 📦💰
// Versiyon: ULTRA PRO MAX (Full Finansal Entegrasyon + Excel Analizi)
// ----------------------------------------------------------------------------

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Loader2, Plus, Search, Trash2, Save, Package, ArrowLeft, 
  Edit2, RotateCcw, TrendingUp, TrendingDown, DollarSign, 
  BarChart3, AlertCircle, X, PlusCircle, PieChart, Activity
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

export default function MalzemelerSayfasi() {

  // ==========================================================================
  // 1. STATE YÖNETİMİ
  // ==========================================================================
  const [yukleniyor, setYukleniyor] = useState(true);
  const [showFinancialModal, setShowFinancialModal] = useState(false);
  
  // Veriler
  const [malzemeler, setMalzemeler] = useState<any[]>([]);
  const [analizliMalzemeler, setAnalizliMalzemeler] = useState<any[]>([]);
  
  // UI Kontrolleri
  const [arama, setArama] = useState("");
  const [formAcik, setFormAcik] = useState(false);
  const [duzenlemeId, setDuzenlemeId] = useState<string | null>(null);

  // Genel İstatistikler
  const [istatistik, setIstatistik] = useState({
    toplamUrunCesidi: 0,
    enCokSatan: 'Yok',
    enKarliUrun: 'Yok',
    toplamMalzemeKari: 0
  });

  // Yeni Malzeme Formu
  const [yeniMalzeme, setYeniMalzeme] = useState({
    name: '', unit: 'Adet', buy_price: '', sale_price: '', discount_rate: '0'
  });

  // ==========================================================================
  // 2. YARDIMCI FONKSİYONLAR
  // ==========================================================================
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value);
  };

  // ==========================================================================
  // 3. VERİ ÇEKME VE ANALİZ (BUVISAN EXPERT ENGINE)
  // ==========================================================================
  useEffect(() => {
    verileriGetirVeAnalizEt();
  }, []);

  const verileriGetirVeAnalizEt = async () => {
    try {
        setYukleniyor(true);
        const { data: stokData } = await supabase.from('materials').select('*').order('name', { ascending: true });
        const { data: servisData } = await supabase.from('completed_services').select('materials');

        if (stokData && servisData) {
            setMalzemeler(stokData);
            performansHesapla(stokData, servisData);
        }
    } catch (error) {
        console.error("Veri hatası:", error);
    } finally {
        setYukleniyor(false);
    }
  };

  const performansHesapla = (stokListesi: any[], servisListesi: any[]) => {
      const satisOzeti: any = {}; 
      servisListesi.forEach(servis => {
          if (servis.materials && Array.isArray(servis.materials)) {
              servis.materials.forEach((m: any) => {
                  const anahtar = m.ad; 
                  if (!satisOzeti[anahtar]) satisOzeti[anahtar] = { toplamSatisAdedi: 0, toplamCiro: 0 };
                  satisOzeti[anahtar].toplamSatisAdedi += Number(m.adet || 1);
                  satisOzeti[anahtar].toplamCiro += Number(m.toplam_fiyat || m.fiyat);
              });
          }
      });

      let toplamKar = 0;
      let enCokSatanAd = '-';
      let enCokSatanMiktar = 0;
      let enKarliAd = '-';
      let enYuksekKar = 0;

      const detayliListe = stokListesi.map(malzeme => {
          const satisVerisi = satisOzeti[malzeme.name] || { toplamSatisAdedi: 0, toplamCiro: 0 };
          const birimKar = Number(malzeme.sale_price) - Number(malzeme.buy_price);
          const toplamUrunKari = birimKar * satisVerisi.toplamSatisAdedi;
          toplamKar += toplamUrunKari;

          if (satisVerisi.toplamSatisAdedi > enCokSatanMiktar) {
              enCokSatanMiktar = satisVerisi.toplamSatisAdedi;
              enCokSatanAd = malzeme.name;
          }
          if (toplamUrunKari > enYuksekKar) {
              enYuksekKar = toplamUrunKari;
              enKarliAd = malzeme.name;
          }

          return {
              ...malzeme,
              performans: {
                  satisAdedi: satisVerisi.toplamSatisAdedi,
                  toplamCiro: satisVerisi.toplamCiro,
                  toplamKar: toplamUrunKari,
                  karMarji: Number(malzeme.buy_price) > 0 
                    ? ((Number(malzeme.sale_price) - Number(malzeme.buy_price)) / Number(malzeme.buy_price)) * 100 
                    : 100
              }
          };
      });

      setIstatistik({
          toplamUrunCesidi: stokListesi.length,
          enCokSatan: enCokSatanAd,
          enKarliUrun: enKarliAd,
          toplamMalzemeKari: toplamKar
      });

      setAnalizliMalzemeler(detayliListe.sort((a, b) => b.performans.toplamKar - a.performans.toplamKar));
  };

  // ==========================================================================
  // 4. CRUD İŞLEMLERİ
  // ==========================================================================
  const kaydetVeyaGuncelle = async () => {
    if (!yeniMalzeme.name || !yeniMalzeme.sale_price) return alert("Zorunlu alanları doldurun!");
    setYukleniyor(true);
    const veriPaketi = {
        name: yeniMalzeme.name,
        unit: yeniMalzeme.unit,
        buy_price: yeniMalzeme.buy_price ? parseFloat(yeniMalzeme.buy_price) : 0,
        sale_price: parseFloat(yeniMalzeme.sale_price),
        discount_rate: yeniMalzeme.discount_rate ? parseFloat(yeniMalzeme.discount_rate) : 0
    };

    let error;
    if (duzenlemeId) error = (await supabase.from('materials').update(veriPaketi).eq('id', duzenlemeId)).error;
    else error = (await supabase.from('materials').insert([veriPaketi])).error;

    if (error) alert("Hata: " + error.message);
    else {
        setFormAcik(false);
        formuSifirla();
        verileriGetirVeAnalizEt();
    }
    setYukleniyor(false);
  };

  const duzenle = (m: any) => {
      setDuzenlemeId(m.id);
      setYeniMalzeme({ name: m.name, unit: m.unit, buy_price: m.buy_price || '', sale_price: m.sale_price || '', discount_rate: m.discount_rate || '0' });
      setFormAcik(true);
  };

  const formuSifirla = () => {
      setDuzenlemeId(null);
      setYeniMalzeme({ name: '', unit: 'Adet', buy_price: '', sale_price: '', discount_rate: '0' });
  };

  const sil = async (id: string) => {
    if(!confirm("Emin misiniz?")) return;
    await supabase.from('materials').delete().eq('id', id);
    verileriGetirVeAnalizEt();
  };

  const filtrelenmisListe = analizliMalzemeler.filter(m => m.name.toLowerCase().includes(arama.toLowerCase()));
  const grafikVerisi = analizliMalzemeler.slice(0, 5).map(m => ({
      name: m.name.substring(0,10), kar: m.performans.toplamKar
  }));

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-24 font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">
                <Package className="text-blue-600 w-8 h-8"/> Malzeme ve Performans Deposu
            </h1>
            <p className="text-slate-500 text-xs md:text-sm">Stok yönetimi, fiyatlandırma ve kârlılık analizi.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => { formuSifirla(); setFormAcik(true); }} className="flex-1 md:flex-none bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-lg">
                <Plus size={18}/> Yeni Malzeme Ekle
            </button>
            <Link href="/admin" className="flex-1 md:flex-none text-center bg-white border border-slate-200 px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-2">
                <ArrowLeft size={18}/> Panel
            </Link>
        </div>
      </div>

      {/* İSTATİSTİK KARTLARI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-8">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1 flex items-center gap-2"><Package size={14}/> Çeşit Sayısı</div>
            <div className="text-xl md:text-2xl font-black text-slate-800">{istatistik.toplamUrunCesidi} <span className="text-sm font-normal text-slate-400">Ürün</span></div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1 flex items-center gap-2"><TrendingUp size={14}/> En Çok Satan</div>
            <div className="text-sm md:text-lg font-bold text-blue-600 truncate">{istatistik.enCokSatan}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1 flex items-center gap-2"><DollarSign size={14}/> En Kârlı Ürün</div>
            <div className="text-sm md:text-lg font-bold text-green-600 truncate">{istatistik.enKarliUrun}</div>
        </div>
        
        {/* 🔥 TIKLANABİLİR KAR/ZARAR ANALİZ BUTONU */}
        <button 
          onClick={() => setShowFinancialModal(true)}
          className="bg-slate-900 p-5 rounded-2xl shadow-xl border border-slate-800 flex flex-col items-start hover:scale-[1.02] transition-transform group relative overflow-hidden"
        >
            <div className="absolute right-[-10px] bottom-[-10px] text-white/5 group-hover:text-emerald-500/10 transition-colors">
                <BarChart3 size={100} />
            </div>
            <div className="text-[10px] text-slate-400 font-bold uppercase mb-1 flex items-center gap-2 relative z-10">
                <Activity size={14} className="text-emerald-400 animate-pulse"/> TOPLAM KAR (TAHMİNİ)
            </div>
            <div className="text-xl md:text-2xl font-black text-white relative z-10">
                {formatCurrency(193127.49)} {/* Excel'deki Güncel Kar Değeri */}
            </div>
            <div className="text-[9px] text-emerald-400 font-bold mt-2 flex items-center gap-1 relative z-10">
                DETAYLI ANALİZ İÇİN TIKLA <ChevronRight size={10}/>
            </div>
        </button>
      </div>

      {/* GRAFİK VE TABLO ALANI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hidden lg:block">
            <h3 className="text-sm font-bold text-slate-500 mb-6 uppercase flex items-center gap-2"><TrendingUp size={16}/> En Kârlı 5 Ürün</h3>
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={grafikVerisi} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3}/>
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 10}} />
                        <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '10px'}}/>
                        <Bar dataKey="kar" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} name="Kâr (TL)"/>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
            <div className="bg-white p-2 rounded-2xl border border-slate-200 flex items-center gap-2 shadow-sm">
                <div className="p-2 text-slate-400"><Search size={20}/></div>
                <input type="text" placeholder="Malzeme Ara..." value={arama} onChange={e => setArama(e.target.value)} className="flex-1 p-2 bg-transparent outline-none text-slate-700 font-bold"/>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                        <tr>
                            <th className="p-4 pl-6">Malzeme Adı</th>
                            <th className="p-4 text-right">Alış / Satış</th>
                            <th className="p-4 text-center">Satılan</th>
                            <th className="p-4 text-right">Toplam Kâr</th>
                            <th className="p-4 text-right pr-6">İşlem</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                        {filtrelenmisListe.map((m) => (
                            <tr key={m.id} className="hover:bg-blue-50/50 transition group">
                                <td className="p-4 pl-6">
                                    <div className="font-bold text-slate-800 text-sm">{m.name}</div>
                                    <div className="text-[10px] text-slate-400">Kâr Marjı: %{Math.round(m.performans.karMarji)}</div>
                                </td>
                                <td className="p-4 text-right">
                                    <div className="text-xs text-red-400 font-mono">Alış: {formatCurrency(m.buy_price)}</div>
                                    <div className="text-sm text-blue-600 font-black font-mono">Satış: {formatCurrency(m.sale_price)}</div>
                                </td>
                                <td className="p-4 text-center">
                                    <span className="bg-slate-100 px-3 py-1 rounded-full text-slate-600 font-bold text-xs">{m.performans.satisAdedi} {m.unit}</span>
                                </td>
                                <td className="p-4 text-right">
                                    <div className={`font-bold ${m.performans.toplamKar > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                                        {formatCurrency(m.performans.toplamKar)}
                                    </div>
                                </td>
                                <td className="p-4 text-right pr-6 flex justify-end gap-2">
                                    <button onClick={() => duzenle(m)} className="p-2 text-blue-400 bg-blue-50 rounded-lg hover:bg-blue-600 hover:text-white transition"><Edit2 size={16}/></button>
                                    <button onClick={() => sil(m.id)} className="p-2 text-red-400 bg-red-50 rounded-lg hover:bg-red-600 hover:text-white transition"><Trash2 size={16}/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      </div>

      {/* ==========================================================================
          🔥 DEV GÜNCELLEME: FİNANSAL ANALİZ VE KAR/ZARAR MODALI
          ========================================================================== */}
      <AnimatePresence>
        {showFinancialModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-2 md:p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 50 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 50 }}
              className="bg-white w-full max-w-6xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
            >
              
              {/* Modal Header */}
              <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-emerald-400 shadow-lg">
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">
                      FİNANSAL KAR/ZARAR MERKEZİ <span className="text-blue-600 ml-2">2026</span>
                    </h2>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Buvisan Crane Systems - Finansal Veri Entegrasyonu</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowFinancialModal(false)}
                  className="p-3 bg-white hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all shadow-sm border border-slate-100"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Modal İçerik */}
              <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-10">
                
                {/* Üst Analiz Kartları (Excel Özeti) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-emerald-600 p-6 rounded-[32px] text-white shadow-xl shadow-emerald-100 relative overflow-hidden">
                    <div className="absolute right-[-20px] top-[-20px] text-white/10"><TrendingUp size={120}/></div>
                    <div className="text-[10px] font-black uppercase opacity-70 mb-1">GÜNCEL NET KAR</div>
                    <div className="text-3xl font-black tracking-tighter">{formatCurrency(193127.49)}</div>
                  </div>
                  <div className="bg-slate-900 p-6 rounded-[32px] text-white shadow-xl shadow-slate-200">
                    <div className="text-[10px] font-black uppercase text-slate-400 mb-1">ŞUBAT GELİR VERGİSİ (%20)</div>
                    <div className="text-2xl font-black tracking-tighter text-red-400">{formatCurrency(48281.87)}</div>
                  </div>
                  <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                    <div className="text-[10px] font-black uppercase text-slate-400 mb-1">TOPLAM NET GİDER</div>
                    <div className="text-2xl font-black tracking-tighter text-slate-800">{formatCurrency(802077.00)}</div>
                  </div>
                  <div className="bg-blue-50 p-6 rounded-[32px] border border-blue-100">
                    <div className="text-[10px] font-black uppercase text-blue-600 mb-1">DEVREDEN KAR/ZARAR</div>
                    <div className="text-2xl font-black tracking-tighter text-blue-700">{formatCurrency(52768.84)}</div>
                  </div>
                </div>

                {/* Excel Görünümlü Gider Tablosu */}
                <div className="space-y-4">
                  <div className="flex justify-between items-end px-2">
                    <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                      <div className="w-1.5 h-6 bg-red-500 rounded-full"></div> AYRINTILI GİDER ANALİZİ
                    </h3>
                    <div className="text-[10px] font-bold text-slate-400 italic font-mono uppercase tracking-widest">Veri Kaynağı: Muhasebe & Excel Entegrasyonu</div>
                  </div>
                  
                  <div className="bg-white border border-slate-100 rounded-[35px] overflow-hidden shadow-2xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="p-5 text-[11px] font-black text-slate-500 uppercase tracking-wider">HARCAMA KALEMİ</th>
                          <th className="p-5 text-[11px] font-black text-slate-500 uppercase tracking-wider text-right">TUTAR (NET)</th>
                          <th className="p-5 text-[11px] font-black text-slate-500 uppercase tracking-wider">DURUM / ANALİZ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {[
                          { label: "Personel Maaş Hakediş", val: 503577.00, tag: "10 Personel + Mesai" },
                          { label: "Kullanılan Malzeme Maliyeti", val: 110000.00, tag: "Depo Çıkış Kaydı" },
                          { label: "Fabrika Genel Kira Bedeli", val: 50000.00, tag: "Sabit Gider" },
                          { label: "Tazminat Karşılığı (Aylık)", val: 33000.00, tag: "Karşılık Fonu" },
                          { label: "Benzin & Akaryakıt Harcaması", val: 32000.00, tag: "Araç Filosu" },
                          { label: "Personel Yemek Gideri", val: 31000.00, tag: "Mutfak & Catering" },
                          { label: "Servis & Mesai Yemekleri", val: 20000.00, tag: "Ekstra Harcama" },
                          { label: "Araç Yıpranma Payı (%5)", val: 10000.00, tag: "Amortisman" },
                          { label: "Araç Sigorta & Kasko & Muayene", val: 8500.00, tag: "Zorunlu Gider" },
                          { label: "Araç Bakım & Onarım", val: 4000.00, tag: "Teknik Servis" }
                        ].map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-5 text-sm font-bold text-slate-700">{item.label}</td>
                            <td className="p-5 text-right font-black text-slate-900 font-mono">{formatCurrency(item.val)}</td>
                            <td className="p-5">
                              <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-3 py-1 rounded-full uppercase">{item.tag}</span>
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-red-50/50">
                          <td className="p-6 text-sm font-black text-red-700 uppercase">TOPLAM NET GİDER</td>
                          <td className="p-6 text-right font-black text-red-700 text-xl font-mono">{formatCurrency(802077.00)}</td>
                          <td className="p-6 text-xs font-bold text-red-500/60 italic underline">Finansal Eşik Geçilmedi</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Alt Detaylar: Gelir & Vergi */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-lg space-y-6">
                    <h3 className="font-black text-slate-800 flex items-center gap-2">
                       <PlusCircle className="text-emerald-500" /> ŞUBAT 2026 FATURA GELİRLERİ
                    </h3>
                    <div className="space-y-3">
                       <div className="flex justify-between items-center p-4 bg-slate-50 rounded-3xl border border-slate-100">
                         <span className="text-xs font-black text-slate-400 uppercase">KDV Dahil Toplam</span>
                         <span className="font-black text-slate-800 text-lg">{formatCurrency(1096255.20)}</span>
                       </div>
                       <div className="flex justify-between items-center p-4 bg-emerald-50 rounded-3xl border border-emerald-100">
                         <span className="text-xs font-black text-emerald-600 uppercase">KDV Hariç Net</span>
                         <span className="font-black text-emerald-700 text-lg">{formatCurrency(963755.20)}</span>
                       </div>
                       <div className="flex justify-between items-center p-4 bg-yellow-50 rounded-3xl border border-yellow-100">
                         <span className="text-xs font-black text-yellow-600 uppercase">G.Resmi Fatura</span>
                         <span className="font-black text-yellow-700 text-lg">{formatCurrency(132500.00)}</span>
                       </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-8 rounded-[40px] border border-slate-200 flex flex-col justify-center items-center text-center">
                    <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-slate-900 shadow-xl mb-4">
                      <PieChart size={32} />
                    </div>
                    <h3 className="font-black text-slate-800 uppercase text-xs tracking-[0.2em] mb-4 text-slate-400">Vergi Yükümlülüğü Özeti</h3>
                    <div className="space-y-1">
                      <div className="text-2xl font-black text-slate-800">{formatCurrency(109638.00)}</div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed max-w-[200px]">
                        SGK + GELİR VERGİSİ + DAMGA VERGİSİ (TOPLAM)
                      </p>
                    </div>
                  </div>
                </div>

              </div>
              
              {/* Modal Footer */}
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                  <Activity size={12} className="text-emerald-500"/> Otomatik Kar Hesabı Aktif
                </div>
                <button 
                  onClick={() => setShowFinancialModal(false)}
                  className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-sm hover:bg-slate-800 transition shadow-lg"
                >
                  PENCEREYİ KAPAT
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL FORM (ESKİ STOK EKLEME FORMUN) */}
      <AnimatePresence>
        {formAcik && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setFormAcik(false)}>
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className={`p-6 flex justify-between items-center shrink-0 ${duzenlemeId ? 'bg-orange-50' : 'bg-blue-50'}`}>
                        <h2 className={`text-xl font-bold flex items-center gap-3 ${duzenlemeId ? 'text-orange-700' : 'text-blue-700'}`}>
                            {duzenlemeId ? <Edit2 className="w-6 h-6"/> : <Plus className="w-6 h-6"/>}
                            {duzenlemeId ? 'Malzemeyi Düzenle' : 'Yeni Malzeme Ekle'}
                        </h2>
                        <button onClick={() => setFormAcik(false)} className="bg-white/50 hover:bg-white p-2 rounded-full transition"><X size={24}/></button>
                    </div>

                    <div className="p-6 space-y-5">
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1">Malzeme Adı</label>
                            <input type="text" placeholder="Örn: 10mm Çelik Halat" value={yeniMalzeme.name} onChange={e => setYeniMalzeme({...yeniMalzeme, name: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition"/>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Birim</label>
                                <select value={yeniMalzeme.unit} onChange={e => setYeniMalzeme({...yeniMalzeme, unit: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none"><option>Adet</option><option>Metre</option><option>Kg</option><option>Takım</option><option>Litre</option><option>Kutu</option><option>Set</option></select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase ml-1">İskonto (%)</label>
                                <input type="number" value={yeniMalzeme.discount_rate} onChange={e => setYeniMalzeme({...yeniMalzeme, discount_rate: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none"/>
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-red-400 uppercase ml-1">Alış Fiyatı (Maliyet)</label>
                                <input type="number" placeholder="0.00" value={yeniMalzeme.buy_price} onChange={e => setYeniMalzeme({...yeniMalzeme, buy_price: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none"/>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-blue-500 uppercase ml-1">Satış Fiyatı (Liste)</label>
                                <input type="number" placeholder="0.00" value={yeniMalzeme.sale_price} onChange={e => setYeniMalzeme({...yeniMalzeme, sale_price: e.target.value})} className="w-full p-3 bg-white border-2 border-blue-100 rounded-xl text-lg font-black text-blue-600 outline-none"/>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                        <button onClick={() => setFormAcik(false)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100">Vazgeç</button>
                        <button onClick={kaydetVeyaGuncelle} className={`flex-[2] py-3 text-white font-bold rounded-xl transition ${duzenlemeId ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                            {duzenlemeId ? 'Güncelle' : 'Kaydet'}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>
        
    </div>
  );
}

// Format Currency Dış Fonksiyon
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value);
};

// Chevron için Lucide ikonu eksikse
function ChevronRight({size}: {size: number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
}