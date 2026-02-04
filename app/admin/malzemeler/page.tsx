"use client";

// ----------------------------------------------------------------------------
// BUVISAN STOK VE PERFORMANS YÖNETİMİ 📦
// Versiyon: ULTRA PRO (Kâr/Zarar Analizi + Satış Geçmişi Entegrasyonu)
// ----------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Loader2, Plus, Search, Trash2, Save, Package, ArrowLeft, 
  Edit2, RotateCcw, TrendingUp, TrendingDown, DollarSign, BarChart3, AlertCircle, X
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

export default function MalzemelerSayfasi() {
  
  // ==========================================================================
  // 1. STATE VE VERİ YÖNETİMİ
  // ==========================================================================
  
  const [yukleniyor, setYukleniyor] = useState(true);
  
  // Ham Veriler
  const [malzemeler, setMalzemeler] = useState<any[]>([]);
  const [satisGecmisi, setSatisGecmisi] = useState<any[]>([]); // Servislerden gelen satış verisi
  
  // İşlenmiş (Analiz Edilmiş) Veri
  const [analizliMalzemeler, setAnalizliMalzemeler] = useState<any[]>([]);
  
  // UI Kontrolleri
  const [arama, setArama] = useState("");
  const [formAcik, setFormAcik] = useState(false); // Modal Kontrolü
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
    name: '', 
    unit: 'Adet', 
    buy_price: '', 
    sale_price: '',
    discount_rate: '0'
  });

  // ==========================================================================
  // 2. VERİLERİ ÇEK VE ANALİZ ET
  // ==========================================================================

  useEffect(() => {
    verileriGetirVeAnalizEt();
  }, []);

  const verileriGetirVeAnalizEt = async () => {
    try {
        setYukleniyor(true);

        // A. Malzeme Tanımlarını Çek
        const { data: stokData } = await supabase.from('materials').select('*').order('name', { ascending: true });
        
        // B. Satış Geçmişini Çek (Completed Services)
        const { data: servisData } = await supabase.from('completed_services').select('materials');

        if (stokData && servisData) {
            setMalzemeler(stokData);
            setSatisGecmisi(servisData);
            performansHesapla(stokData, servisData);
        }

    } catch (error) {
        console.error("Veri hatası:", error);
    } finally {
        setYukleniyor(false);
    }
  };

  // 🔥 BU FONKSİYON SİHİR YAPIYOR: Hangi malzemeden ne kadar kazanılmış hesaplar
  const performansHesapla = (stokListesi: any[], servisListesi: any[]) => {
      
      // 1. Satışları ID bazında topla
      const satisOzeti: any = {}; // { malzemeId: { adet: 5, ciro: 500 } }

      servisListesi.forEach(servis => {
          if (servis.materials && Array.isArray(servis.materials)) {
              servis.materials.forEach((m: any) => {
                  // Eğer eski kayıtlarda ID yoksa ismi baz al (Geriye dönük uyumluluk)
                  // Ancak yeni sistemde ID var. Biz ID üzerinden gidelim.
                  // Malzeme eşleşmesi için ID'yi bulmaya çalışıyoruz.
                  
                  // Not: completed_services tablosundaki 'materials' JSON içindeki ID geçici ID olabilir (Date.now()).
                  // Bu yüzden, EĞER veritabanında malzeme ID'si saklanıyorsa onu kullanmalıydık.
                  // Şimdilik İSİM üzerinden eşleştirme yapacağız (daha güvenli çünkü ID'ler analiz sayfasında Date.now() ile üretiliyordu).
                  
                  const anahtar = m.ad; // İsim bazlı eşleştirme
                  if (!satisOzeti[anahtar]) {
                      satisOzeti[anahtar] = { toplamSatisAdedi: 0, toplamCiro: 0 };
                  }
                  satisOzeti[anahtar].toplamSatisAdedi += Number(m.adet || 1);
                  satisOzeti[anahtar].toplamCiro += Number(m.toplam_fiyat || m.fiyat);
              });
          }
      });

      // 2. Stok Listesi ile Satışları Birleştir ve Kâr Hesapla
      let toplamKar = 0;
      let enCokSatanAd = '-';
      let enCokSatanMiktar = 0;
      let enKarliAd = '-';
      let enYuksekKar = 0;

      const detayliListe = stokListesi.map(malzeme => {
          const satisVerisi = satisOzeti[malzeme.name] || { toplamSatisAdedi: 0, toplamCiro: 0 };
          
          // Kâr Hesabı: (Satış Fiyatı - Alış Fiyatı) * Satılan Adet
          // Not: Ciro üzerinden değil, güncel maliyet üzerinden tahmini kâr hesaplıyoruz.
          const birimKar = Number(malzeme.sale_price) - Number(malzeme.buy_price);
          const toplamUrunKari = birimKar * satisVerisi.toplamSatisAdedi;

          toplamKar += toplamUrunKari;

          // Rekortmenleri Bul
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

      // İstatistikleri Güncelle
      setIstatistik({
          toplamUrunCesidi: stokListesi.length,
          enCokSatan: enCokSatanAd,
          enKarliUrun: enKarliAd,
          toplamMalzemeKari: toplamKar
      });

      // Kâra göre sırala ve kaydet
      setAnalizliMalzemeler(detayliListe.sort((a, b) => b.performans.toplamKar - a.performans.toplamKar));
  };

  // ==========================================================================
  // 3. KAYIT VE DÜZENLEME İŞLEMLERİ
  // ==========================================================================

  const kaydetVeyaGuncelle = async () => {
    if (!yeniMalzeme.name || !yeniMalzeme.sale_price) return alert("Malzeme adı ve satış fiyatı zorunludur!");
    
    setYukleniyor(true);
    
    const veriPaketi = {
        name: yeniMalzeme.name,
        unit: yeniMalzeme.unit,
        buy_price: yeniMalzeme.buy_price ? parseFloat(yeniMalzeme.buy_price) : 0,
        sale_price: parseFloat(yeniMalzeme.sale_price),
        discount_rate: yeniMalzeme.discount_rate ? parseFloat(yeniMalzeme.discount_rate) : 0
    };

    let error;
    if (duzenlemeId) {
        const response = await supabase.from('materials').update(veriPaketi).eq('id', duzenlemeId);
        error = response.error;
    } else {
        const response = await supabase.from('materials').insert([veriPaketi]);
        error = response.error;
    }

    if (error) alert("Hata: " + error.message);
    else {
        alert(duzenlemeId ? "Malzeme Güncellendi! ✅" : "Malzeme Eklendi! ✅");
        setFormAcik(false);
        formuSifirla();
        verileriGetirVeAnalizEt();
    }
    setYukleniyor(false);
  };

  const duzenle = (malzeme: any) => {
      setDuzenlemeId(malzeme.id);
      setYeniMalzeme({
          name: malzeme.name,
          unit: malzeme.unit,
          buy_price: malzeme.buy_price || '',
          sale_price: malzeme.sale_price || '',
          discount_rate: malzeme.discount_rate || '0'
      });
      setFormAcik(true);
  };

  const formuSifirla = () => {
      setDuzenlemeId(null);
      setYeniMalzeme({ name: '', unit: 'Adet', buy_price: '', sale_price: '', discount_rate: '0' });
  };

  const sil = async (id: string) => {
    if(!confirm("Bu malzemeyi silerseniz stok listesinden kalkar. Emin misiniz?")) return;
    await supabase.from('materials').delete().eq('id', id);
    verileriGetirVeAnalizEt();
  };

  // Arama Filtresi
  const filtrelenmisListe = analizliMalzemeler.filter(m => m.name.toLowerCase().includes(arama.toLowerCase()));

  // Grafik Verisi Hazırla (Top 5 Kâr)
  const grafikVerisi = analizliMalzemeler.slice(0, 5).map(m => ({
      name: m.name.length > 10 ? m.name.substring(0,10)+'...' : m.name,
      kar: m.performans.toplamKar,
      ciro: m.performans.toplamCiro
  }));

  // Yükleniyor
  if (yukleniyor && analizliMalzemeler.length === 0) return <div className="h-screen flex justify-center items-center"><Loader2 className="animate-spin text-blue-600 w-10 h-10"/></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-24 relative font-sans">
      
      {/* ÜST BAŞLIK */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">
                <Package className="text-blue-600 w-8 h-8"/> Malzeme ve Performans Deposu
            </h1>
            <p className="text-slate-500 text-xs md:text-sm">Stok yönetimi, fiyatlandırma ve kârlılık analizi.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => { formuSifirla(); setFormAcik(true); }} className="flex-1 md:flex-none bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-lg shadow-blue-200">
                <Plus size={18}/> Yeni Malzeme Ekle
            </button>
            <Link href="/admin" className="flex-1 md:flex-none text-center bg-white border border-slate-200 px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-2">
                <ArrowLeft size={18}/> Panel
            </Link>
        </div>
      </div>

      {/* İSTATİSTİK KARTLARI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-8">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition">
            <div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1 flex items-center gap-2"><Package size={14}/> Çeşit Sayısı</div>
            <div className="text-xl md:text-2xl font-black text-slate-800">{istatistik.toplamUrunCesidi} <span className="text-sm font-normal text-slate-400">Ürün</span></div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition">
            <div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1 flex items-center gap-2"><TrendingUp size={14}/> En Çok Satan</div>
            <div className="text-sm md:text-lg font-bold text-blue-600 truncate">{istatistik.enCokSatan}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition">
            <div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1 flex items-center gap-2"><DollarSign size={14}/> En Kârlı Ürün</div>
            <div className="text-sm md:text-lg font-bold text-green-600 truncate">{istatistik.enKarliUrun}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition">
            <div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1 flex items-center gap-2"><BarChart3 size={14}/> Toplam Kâr (Tahmini)</div>
            <div className="text-xl md:text-2xl font-black text-green-700">{istatistik.toplamMalzemeKari.toLocaleString()} ₺</div>
        </div>
      </div>

      {/* GRAFİK VE TABLO ALANI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* GRAFİK */}
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

        {/* LİSTE */}
        <div className="lg:col-span-2 space-y-4">
            {/* Arama */}
            <div className="bg-white p-2 rounded-2xl border border-slate-200 flex items-center gap-2 shadow-sm">
                <div className="p-2 text-slate-400"><Search size={20}/></div>
                <input type="text" placeholder="Malzeme Ara (İsim, Birim)..." value={arama} onChange={e => setArama(e.target.value)} className="flex-1 p-2 bg-transparent outline-none text-slate-700 font-bold"/>
                {arama && <button onClick={() => setArama("")} className="p-2 text-slate-400 hover:text-red-500"><X size={18}/></button>}
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] md:text-xs">
                            <tr>
                                <th className="p-4 pl-6">Malzeme Adı</th>
                                <th className="p-4 text-right">Alış / Satış</th>
                                <th className="p-4 text-center">Satılan</th>
                                <th className="p-4 text-right">Toplam Kâr</th>
                                <th className="p-4 text-right pr-6">İşlem</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtrelenmisListe.map((m) => (
                                <tr key={m.id} className="hover:bg-blue-50/50 transition group">
                                    <td className="p-4 pl-6">
                                        <div className="font-bold text-slate-800 text-sm">{m.name}</div>
                                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                            <Package size={10}/> {m.unit} 
                                            <span className="w-1 h-1 rounded-full bg-slate-300 mx-1"></span>
                                            Kâr Marjı: %{Math.round(m.performans.karMarji)}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex flex-col items-end">
                                            <span className="text-xs text-red-400 font-mono">Alış: {Number(m.buy_price).toLocaleString()} ₺</span>
                                            <span className="text-sm text-blue-600 font-black font-mono">Satış: {Number(m.sale_price).toLocaleString()} ₺</span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="bg-slate-100 px-3 py-1 rounded-full text-slate-600 font-bold text-xs">{m.performans.satisAdedi} {m.unit}</span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className={`font-bold ${m.performans.toplamKar > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                                            {m.performans.toplamKar > 0 ? '+' : ''}{m.performans.toplamKar.toLocaleString()} ₺
                                        </div>
                                    </td>
                                    <td className="p-4 text-right pr-6">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => duzenle(m)} className="p-2 text-blue-400 bg-blue-50 rounded-lg hover:bg-blue-600 hover:text-white transition"><Edit2 size={16}/></button>
                                            <button onClick={() => sil(m.id)} className="p-2 text-red-400 bg-red-50 rounded-lg hover:bg-red-600 hover:text-white transition"><Trash2 size={16}/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      </div>

      {/* =========================================================================
          MODAL FORM (EKLEME & DÜZENLEME) - SAYFAYI BOĞMAYAN TASARIM
         ========================================================================= */}
      <AnimatePresence>
        {formAcik && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setFormAcik(false)}>
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                    
                    {/* MODAL BAŞLIK */}
                    <div className={`p-6 flex justify-between items-center shrink-0 ${duzenlemeId ? 'bg-orange-50' : 'bg-blue-50'}`}>
                        <h2 className={`text-xl font-bold flex items-center gap-3 ${duzenlemeId ? 'text-orange-700' : 'text-blue-700'}`}>
                            {duzenlemeId ? <Edit2 className="w-6 h-6"/> : <Plus className="w-6 h-6"/>}
                            {duzenlemeId ? 'Malzemeyi Düzenle' : 'Yeni Malzeme Ekle'}
                        </h2>
                        <button onClick={() => setFormAcik(false)} className="bg-white/50 hover:bg-white p-2 rounded-full transition"><X size={24}/></button>
                    </div>

                    {/* FORM */}
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
                                <input type="number" placeholder="0" value={yeniMalzeme.discount_rate} onChange={e => setYeniMalzeme({...yeniMalzeme, discount_rate: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none"/>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-red-400 uppercase ml-1">Alış Fiyatı (Maliyet)</label>
                                <div className="relative"><span className="absolute left-3 top-3 text-slate-400 text-xs">₺</span><input type="number" placeholder="0.00" value={yeniMalzeme.buy_price} onChange={e => setYeniMalzeme({...yeniMalzeme, buy_price: e.target.value})} className="w-full pl-6 p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 outline-none"/></div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-blue-500 uppercase ml-1">Satış Fiyatı (Liste)</label>
                                <div className="relative"><span className="absolute left-3 top-3 text-slate-400 text-xs">₺</span><input type="number" placeholder="0.00" value={yeniMalzeme.sale_price} onChange={e => setYeniMalzeme({...yeniMalzeme, sale_price: e.target.value})} className="w-full pl-6 p-3 bg-white border-2 border-blue-100 rounded-xl text-lg font-black text-blue-600 outline-none focus:border-blue-500 transition"/></div>
                            </div>
                            {/* Kâr Simülasyonu */}
                            {yeniMalzeme.sale_price && yeniMalzeme.buy_price && (
                                <div className="flex justify-between items-center text-xs px-2">
                                    <span className="text-slate-400">Tahmini Kâr:</span>
                                    <span className="font-bold text-green-600">
                                        +{Number(yeniMalzeme.sale_price) - Number(yeniMalzeme.buy_price)} ₺ 
                                        <span className="bg-green-100 px-2 py-0.5 rounded ml-2">%{Math.round(((Number(yeniMalzeme.sale_price) - Number(yeniMalzeme.buy_price)) / Number(yeniMalzeme.buy_price)) * 100)}</span>
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                        <button onClick={() => setFormAcik(false)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition">Vazgeç</button>
                        <button onClick={kaydetVeyaGuncelle} className={`flex-[2] py-3 text-white font-bold rounded-xl hover:shadow-lg transition ${duzenlemeId ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
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