"use client";

// ----------------------------------------------------------------------------
// BUVISAN STOK VE FİNANSAL YÖNETİM MERKEZİ 📦💰
// Versiyon: ULTRA PRO MAX (Full Database Connection)
// ----------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Loader2, Plus, Search, Trash2, Save, Package, ArrowLeft, 
  Edit2, TrendingUp, DollarSign, BarChart3, AlertCircle, X, 
  PlusCircle, PieChart, Activity, ChevronRight
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

export default function MalzemelerSayfasi() {

  // ==========================================================================
  // 1. STATE YÖNETİMİ
  // ==========================================================================
  const [yukleniyor, setYukleniyor] = useState(true);
  
  // Malzeme Verileri
  const [malzemeler, setMalzemeler] = useState<any[]>([]);
  const [analizliMalzemeler, setAnalizliMalzemeler] = useState<any[]>([]);
  
  // UI Kontrolleri
  const [arama, setArama] = useState("");
  const [formAcik, setFormAcik] = useState(false); // Malzeme Formu
  const [showFinancialModal, setShowFinancialModal] = useState(false); // Finans Modalı
  const [duzenlemeId, setDuzenlemeId] = useState<string | null>(null);

  // Finansal Veri State'leri
  const [seciliAy, setSeciliAy] = useState("2026-02"); // Varsayılan ŞUBAT
  const [finansalLoading, setFinansalLoading] = useState(false);
  const [finansalVeri, setFinansalVeri] = useState<any>({
    maas: 0, malzeme: 0, kira: 0, tazminat: 0, 
    yakit: 0, yemek: 0, mesaiYemek: 0, aracYipranma: 0, 
    aracSigorta: 0, aracBakim: 0, kdvDahilFatura: 0, gResmiFatura: 0
  });

  // İstatistikler
  const [istatistik, setIstatistik] = useState({
    toplamUrunCesidi: 0, enCokSatan: 'Yok', enKarliUrun: 'Yok', toplamMalzemeKari: 0
  });

  // Yeni Malzeme Formu
  const [yeniMalzeme, setYeniMalzeme] = useState({
    name: '', unit: 'Adet', buy_price: '', sale_price: '', discount_rate: '0'
  });

  // ==========================================================================
  // 2. VERİ ÇEKME VE ANALİZ
  // ==========================================================================
  useEffect(() => {
    verileriGetirVeAnalizEt();
  }, []);

  // AY DEĞİŞTİĞİNDE VERİLERİ ÇEK
  useEffect(() => {
    if (showFinancialModal) {
      finansalVeriyiGetir(seciliAy);
    }
  }, [seciliAy, showFinancialModal]);

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
  // 3. FİNANSAL İŞLEMLER (SUPABASE ENTEGRASYONU)
  // ==========================================================================
  
  const finansalVeriyiGetir = async (ayKey: string) => {
    setFinansalLoading(true);
    // Veritabanından o aya ait kaydı çek
    const { data, error } = await supabase
      .from('financial_records')
      .select('*')
      .eq('month_key', ayKey)
      .single();

    if (data) {
      // Veri varsa state'i güncelle
      setFinansalVeri({
        maas: data.maas, malzeme: data.malzeme, kira: data.kira, tazminat: data.tazminat,
        yakit: data.yakit, yemek: data.yemek, mesaiYemek: data.mesai_yemek,
        aracYipranma: data.arac_yipranma, aracSigorta: data.arac_sigorta, aracBakim: data.arac_bakim,
        kdvDahilFatura: data.kdv_dahil_fatura, gResmiFatura: data.g_resmi_fatura
      });
    } else {
      // Veri yoksa (Yeni Ay) sıfırla
      setFinansalVeri({
        maas: 0, malzeme: 0, kira: 0, tazminat: 0, yakit: 0, yemek: 0, mesaiYemek: 0, 
        aracYipranma: 0, aracSigorta: 0, aracBakim: 0, kdvDahilFatura: 0, gResmiFatura: 0
      });
    }
    setFinansalLoading(false);
  };

  const finansalVeriyiKaydet = async () => {
    if(!confirm(`${seciliAy} dönemi için verileri güncellemek istiyor musunuz?`)) return;
    
    setFinansalLoading(true);
    // Veritabanına UPSERT işlemi (Varsa güncelle, yoksa ekle)
    const { error } = await supabase
      .from('financial_records')
      .upsert({
        month_key: seciliAy,
        maas: finansalVeri.maas,
        malzeme: finansalVeri.malzeme,
        kira: finansalVeri.kira,
        tazminat: finansalVeri.tazminat,
        yakit: finansalVeri.yakit,
        yemek: finansalVeri.yemek,
        mesai_yemek: finansalVeri.mesaiYemek,
        arac_yipranma: finansalVeri.aracYipranma,
        arac_sigorta: finansalVeri.aracSigorta,
        arac_bakim: finansalVeri.aracBakim,
        kdv_dahil_fatura: finansalVeri.kdvDahilFatura,
        g_resmi_fatura: finansalVeri.gResmiFatura,
        updated_at: new Date()
      }, { onConflict: 'month_key' });

    if (error) {
      alert("Hata oluştu: " + error.message);
    } else {
      alert("✅ Veriler Başarıyla Buluta Yedeklendi!");
    }
    setFinansalLoading(false);
  };


  // ==========================================================================
  // 4. MALZEME CRUD İŞLEMLERİ
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value);
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
            {/* 🔥 YENİ MALZEME BUTONU (DÜZELTİLDİ) */}
            <button 
                onClick={() => { formuSifirla(); setFormAcik(true); }} 
                className="flex-1 md:flex-none bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-lg"
            >
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
        
        {/* TIKLANABİLİR KAR/ZARAR ANALİZ BUTONU */}
        <button 
          onClick={() => setShowFinancialModal(true)}
          className="bg-slate-900 p-5 rounded-2xl shadow-xl border border-slate-800 flex flex-col items-start hover:scale-[1.02] transition-transform group relative overflow-hidden"
        >
            <div className="absolute right-[-10px] bottom-[-10px] text-white/5 group-hover:text-emerald-500/10 transition-colors">
                <BarChart3 size={100} />
            </div>
            <div className="text-[10px] text-slate-400 font-bold uppercase mb-1 flex items-center gap-2 relative z-10">
                <Activity size={14} className="text-emerald-400 animate-pulse"/> FİNANSAL YÖNETİM
            </div>
            <div className="text-xl md:text-2xl font-black text-white relative z-10">
                 ANALİZ ET →
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
          🔥 FİNANSAL ANALİZ VE KAR/ZARAR MODALI (DB BAĞLANTILI)
          ========================================================================== */}
      <AnimatePresence>
        {showFinancialModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-2 md:p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 50 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 50 }}
              className="bg-white w-full max-w-7xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
            >
              
              {/* Modal Header */}
              <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-6">
                  <div className="w-14 h-14 bg-slate-900 rounded-3xl flex items-center justify-center text-emerald-400 shadow-xl border-4 border-white">
                    <TrendingUp size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">FİNANSAL YÖNETİM MERKEZİ</h2>
                    <div className="flex items-center gap-3 mt-1">
                      {/* OTOMATİK TARİH SEÇİCİ */}
                      <select 
                        value={seciliAy} 
                        onChange={(e) => setSeciliAy(e.target.value)}
                        className="bg-blue-600 text-white text-xs font-black px-4 py-1.5 rounded-full outline-none shadow-lg shadow-blue-200 cursor-pointer hover:bg-blue-700 transition-colors"
                      >
                         {Array.from({ length: 6 }, (_, i) => 2026 + i).map(yil => (
                            ["OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN", "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK"].map((ayAdi, index) => {
                              const ayDegeri = `${yil}-${String(index + 1).padStart(2, '0')}`;
                              return <option key={ayDegeri} value={ayDegeri}>{ayAdi} {yil}</option>;
                            })
                          ))}
                      </select>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest italic flex items-center gap-1">
                        {finansalLoading ? <Loader2 className="animate-spin w-3 h-3"/> : null} 
                        {finansalLoading ? "Veriler Çekiliyor..." : "Veriler Güncel"}
                      </span>
                    </div>
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
              <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                
                {/* SOL PANEL: VERİ GİRİŞ FORMU */}
                <div className="w-full md:w-1/2 p-8 overflow-y-auto border-r border-slate-100 bg-slate-50/30">
                  <h3 className="font-black text-slate-800 text-sm mb-6 flex items-center gap-2 uppercase tracking-tighter">
                    <Edit2 size={16} className="text-blue-600"/> GİDER VE GELİR KALEMLERİNİ DÜZENLE
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { id: 'maas', label: 'Personel Maaşları', color: 'red' },
                      { id: 'malzeme', label: 'Malzeme Maliyeti', color: 'red' },
                      { id: 'kira', label: 'Fabrika Kirası', color: 'red' },
                      { id: 'yakit', label: 'Benzin Harcaması', color: 'red' },
                      { id: 'yemek', label: 'Yemek Giderleri', color: 'red' },
                      { id: 'tazminat', label: 'Tazminat Karşılığı', color: 'red' },
                      { id: 'mesaiYemek', label: 'Servis/Mesai Yemek', color: 'red' },
                      { id: 'aracYipranma', label: 'Araç Yıpranma (%5)', color: 'red' },
                      { id: 'aracSigorta', label: 'Kasko/Sigorta/Muayene', color: 'red' },
                      { id: 'aracBakim', label: 'Araç Bakım Onarım', color: 'red' },
                      { id: 'kdvDahilFatura', label: 'AYLIK FATURA (KDV DAHİL)', color: 'emerald' },
                      { id: 'gResmiFatura', label: 'G.RESMİ FATURA GELİRİ', color: 'emerald' }
                    ].map((item) => (
                      <div key={item.id} className="space-y-1.5">
                        <label className={`text-[10px] font-black uppercase ml-1 ${item.color === 'red' ? 'text-slate-400' : 'text-emerald-600'}`}>
                          {item.label}
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-3 text-slate-300 text-xs font-bold">₺</span>
                          <input 
                            type="number" 
                            value={finansalVeri[item.id]} 
                            onChange={(e) => setFinansalVeri({...finansalVeri, [item.id]: parseFloat(e.target.value) || 0})}
                            className={`w-full pl-7 p-3 bg-white border rounded-2xl text-sm font-black outline-none focus:ring-4 transition-all ${item.color === 'red' ? 'border-slate-200 focus:ring-slate-100 text-slate-700' : 'border-emerald-100 focus:ring-emerald-50 text-emerald-700'}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-8 p-4 bg-blue-600 rounded-3xl text-white flex justify-between items-center shadow-xl shadow-blue-100">
                     <div className="text-xs font-bold uppercase opacity-80">VERİLERİ BULUTA YEDEKLE</div>
                     <button onClick={finansalVeriyiKaydet} disabled={finansalLoading} className="bg-white text-blue-600 px-6 py-2 rounded-xl text-xs font-black hover:bg-blue-50 transition-colors disabled:opacity-50">
                        {finansalLoading ? "KAYDEDİLİYOR..." : "KAYDET"}
                     </button>
                  </div>
                </div>

                {/* SAĞ PANEL: ANLIK ANALİZ RAPORU */}
                <div className="w-full md:w-1/2 p-8 overflow-y-auto space-y-8 bg-white">
                   {/* HESAPLAMA MOTORU */}
                   {(() => {
                      const toplamGider = finansalVeri.maas + finansalVeri.malzeme + finansalVeri.kira + finansalVeri.tazminat + 
                                         finansalVeri.yakit + finansalVeri.yemek + finansalVeri.mesaiYemek + 
                                         finansalVeri.aracYipranma + finansalVeri.aracSigorta + finansalVeri.aracBakim;
                      
                      const kdvHaricGelir = finansalVeri.kdvDahilFatura / 1.20; // %20 KDV Düşümü
                      const brutKar = (kdvHaricGelir + finansalVeri.gResmiFatura) - toplamGider;
                      const gelirVergisi = brutKar > 0 ? brutKar * 0.20 : 0;
                      const netKar = brutKar - gelirVergisi;

                      return (
                        <div className="space-y-8 animate-in fade-in duration-700">
                          <div className="text-center space-y-2">
                             <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">ANLIK {seciliAy} KAR/ZARAR DURUMU</h4>
                             <div className={`text-6xl font-black tracking-tighter ${netKar >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatCurrency(netKar)}
                             </div>
                             <div className="text-xs text-slate-400 font-bold uppercase italic">Tüm vergiler ve operasyonel giderler düşülmüştür.</div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                             <div className="p-5 bg-slate-900 rounded-[32px] text-white">
                                <div className="text-[10px] font-black text-slate-500 uppercase mb-1">TOPLAM GİDER</div>
                                <div className="text-xl font-black text-red-400">{formatCurrency(toplamGider)}</div>
                             </div>
                             <div className="p-5 bg-emerald-50 rounded-[32px] border border-emerald-100 text-emerald-700">
                                <div className="text-[10px] font-black text-emerald-400 uppercase mb-1">TOPLAM GELİR (NET)</div>
                                <div className="text-xl font-black">{formatCurrency(kdvHaricGelir + finansalVeri.gResmiFatura)}</div>
                             </div>
                          </div>

                          {/* GÖRSEL ANALİZ: PROGRESS BARS */}
                          <div className="bg-slate-50 p-6 rounded-[35px] space-y-4">
                             <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                                   <span>GİDER / GELİR ORANI</span>
                                   <span>%{Math.round((toplamGider / (kdvHaricGelir + finansalVeri.gResmiFatura)) * 100) || 0}</span>
                                </div>
                                <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                                   <div className="h-full bg-red-500 rounded-full" style={{ width: `${(toplamGider / (kdvHaricGelir + finansalVeri.gResmiFatura)) * 100}%` }}></div>
                                </div>
                             </div>
                          </div>

                          <div className="bg-yellow-50 p-6 rounded-[35px] border border-yellow-100 border-dashed">
                             <div className="flex items-start gap-4 text-yellow-800">
                                <AlertCircle size={20} className="shrink-0"/>
                                <div>
                                   <p className="text-xs font-bold leading-relaxed">
                                      Bu ayki <strong>{formatCurrency(brutKar)}</strong> brüt kar üzerinden <strong>{formatCurrency(gelirVergisi)}</strong> tutarında %20 gelir vergisi tahakkuku hesaplanmıştır.
                                   </p>
                                </div>
                             </div>
                          </div>
                        </div>
                      );
                   })()}
                </div>
              </div>
              
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MALZEME EKLEME / DÜZENLEME MODALI (DÜZELTİLDİ) */}
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