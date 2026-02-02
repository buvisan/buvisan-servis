"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Loader2, 
  Plus, 
  Search, 
  Trash2, 
  Save, 
  Package, 
  ArrowLeft, 
  Edit2, 
  RotateCcw 
} from 'lucide-react';
import Link from 'next/link';

export default function MalzemelerSayfasi() {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [malzemeler, setMalzemeler] = useState<any[]>([]);
  const [arama, setArama] = useState("");

  // Düzenleme Modu Kontrolü
  const [duzenlemeId, setDuzenlemeId] = useState<string | null>(null);

  // Form Verileri
  const [yeniMalzeme, setYeniMalzeme] = useState({
    name: '', 
    unit: 'Adet', 
    buy_price: '', 
    sale_price: '',
    discount_rate: '0'
  });

  useEffect(() => { verileriGetir(); }, []);

  const verileriGetir = async () => {
    const { data } = await supabase
      .from('materials')
      .select('*')
      .order('name', { ascending: true });
      
    if (data) setMalzemeler(data);
    setYukleniyor(false);
  };

  // 🔥 KAYDETME VE GÜNCELLEME İŞLEMİ 🔥
  const kaydetVeyaGuncelle = async () => {
    if (!yeniMalzeme.name || !yeniMalzeme.sale_price) return alert("Malzeme adı ve satış fiyatı zorunludur!");
    
    // Veritabanına gidecek veri
    const veriPaketi = {
        name: yeniMalzeme.name,
        unit: yeniMalzeme.unit,
        buy_price: yeniMalzeme.buy_price ? parseFloat(yeniMalzeme.buy_price) : 0,
        sale_price: parseFloat(yeniMalzeme.sale_price),
        discount_rate: yeniMalzeme.discount_rate ? parseFloat(yeniMalzeme.discount_rate) : 0
    };

    let error;

    if (duzenlemeId) {
        // GÜNCELLEME MODU
        const response = await supabase
            .from('materials')
            .update(veriPaketi)
            .eq('id', duzenlemeId);
        error = response.error;
    } else {
        // YENİ EKLEME MODU
        const response = await supabase
            .from('materials')
            .insert([veriPaketi]);
        error = response.error;
    }

    if (error) {
        alert("Hata: " + error.message);
    } else {
        alert(duzenlemeId ? "Malzeme Güncellendi! ✅" : "Malzeme Eklendi! ✅");
        formuSifirla();
        verileriGetir();
    }
  };

  // Düzenleme Modunu Aç
  const duzenle = (malzeme: any) => {
      setDuzenlemeId(malzeme.id);
      setYeniMalzeme({
          name: malzeme.name,
          unit: malzeme.unit,
          buy_price: malzeme.buy_price || '',
          sale_price: malzeme.sale_price || '',
          discount_rate: malzeme.discount_rate || '0'
      });
      // Sayfanın başına kaydır
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Vazgeç / Sıfırla
  const formuSifirla = () => {
      setDuzenlemeId(null);
      setYeniMalzeme({ name: '', unit: 'Adet', buy_price: '', sale_price: '', discount_rate: '0' });
  };

  const sil = async (id: string) => {
    if(!confirm("Bu malzemeyi stoktan silmek istediğine emin misin?")) return;
    await supabase.from('materials').delete().eq('id', id);
    verileriGetir();
  };

  // Arama Filtreleme
  const filtrelenmis = malzemeler.filter(m => m.name.toLowerCase().includes(arama.toLowerCase()));

  if (yukleniyor) return <div className="h-screen flex justify-center items-center"><Loader2 className="animate-spin text-blue-600"/></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 pb-20 font-sans">
      
      {/* ÜST BAŞLIK */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                <Package className="text-blue-600"/> Malzeme Deposu
            </h1>
            <p className="text-slate-500 text-sm">Stok kartları ve fiyat yönetimi.</p>
        </div>
        <Link href="/admin" className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold text-sm hover:bg-slate-100 flex items-center gap-2">
            <ArrowLeft size={16}/> Panele Dön
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* --- SOL: MALZEME FORMU (EKLEME & DÜZENLEME) --- */}
        <div className={`lg:col-span-1 p-6 rounded-2xl shadow-lg border h-fit sticky top-6 transition-all ${duzenlemeId ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-100'}`}>
            <h2 className={`text-lg font-bold mb-4 flex items-center gap-2 ${duzenlemeId ? 'text-orange-700' : 'text-slate-800'}`}>
                {duzenlemeId ? <Edit2 className="w-5 h-5"/> : <Plus className="w-5 h-5 bg-blue-600 text-white rounded-full p-1"/>}
                {duzenlemeId ? 'Malzemeyi Düzenle' : 'Yeni Malzeme Tanımla'}
            </h2>
            
            <div className="space-y-4">
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">Malzeme Adı</label>
                    <input 
                        type="text" 
                        placeholder="Örn: 10mm Çelik Halat" 
                        value={yeniMalzeme.name} 
                        onChange={e => setYeniMalzeme({...yeniMalzeme, name: e.target.value})} 
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase">Birim</label>
                        <select value={yeniMalzeme.unit} onChange={e => setYeniMalzeme({...yeniMalzeme, unit: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none">
                            <option>Adet</option><option>Metre</option><option>Kg</option><option>Takım</option><option>Litre</option><option>Kutu</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase">İskonto (%)</label>
                        <input type="number" placeholder="0" value={yeniMalzeme.discount_rate} onChange={e => setYeniMalzeme({...yeniMalzeme, discount_rate: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none"/>
                    </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Alış Fiyatı (Maliyet)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-slate-400 text-xs">₺</span>
                            <input type="number" placeholder="0.00" value={yeniMalzeme.buy_price} onChange={e => setYeniMalzeme({...yeniMalzeme, buy_price: e.target.value})} className="w-full pl-6 p-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-600 outline-none"/>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-blue-500 uppercase">Satış Fiyatı (Liste)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-slate-400 text-xs">₺</span>
                            <input type="number" placeholder="0.00" value={yeniMalzeme.sale_price} onChange={e => setYeniMalzeme({...yeniMalzeme, sale_price: e.target.value})} className="w-full pl-6 p-2 bg-white border-2 border-blue-100 rounded-lg text-lg font-black text-blue-600 outline-none"/>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
                    {duzenlemeId && (
                        <button onClick={formuSifirla} className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold rounded-xl transition flex items-center justify-center gap-2 text-sm">
                            <RotateCcw size={18}/> VAZGEÇ
                        </button>
                    )}
                    <button 
                        onClick={kaydetVeyaGuncelle} 
                        className={`flex-[2] py-3 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg ${duzenlemeId ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'}`}
                    >
                        {duzenlemeId ? <><Save size={18}/> GÜNCELLE</> : <><Save size={18}/> KAYDET</>}
                    </button>
                </div>
            </div>
        </div>

        {/* --- SAĞ: MALZEME LİSTESİ --- */}
        <div className="lg:col-span-2 space-y-4">
            {/* Arama */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-2 shadow-sm">
                <Search className="text-slate-400 w-5 h-5"/>
                <input type="text" placeholder="Malzeme Ara..." value={arama} onChange={e => setArama(e.target.value)} className="flex-1 outline-none text-slate-700 font-bold"/>
            </div>

            {/* Tablo */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                            <tr>
                                <th className="p-4">Malzeme Adı</th>
                                <th className="p-4 hidden md:table-cell">Birim</th>
                                <th className="p-4 text-right">Alış</th>
                                <th className="p-4 text-right text-blue-600">Satış</th>
                                <th className="p-4 text-center">İşlem</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtrelenmis.map((m) => (
                                <tr key={m.id} className={`transition group ${duzenlemeId === m.id ? 'bg-orange-50' : 'hover:bg-slate-50'}`}>
                                    <td className="p-4 font-bold text-slate-700">{m.name}</td>
                                    <td className="p-4 text-slate-500 hidden md:table-cell">
                                        <span className="bg-slate-100 px-2 py-1 rounded text-xs">{m.unit}</span>
                                    </td>
                                    <td className="p-4 text-right text-slate-400 font-mono">{Number(m.buy_price).toLocaleString()} ₺</td>
                                    <td className="p-4 text-right font-black text-blue-600">{Number(m.sale_price).toLocaleString()} ₺</td>
                                    <td className="p-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button 
                                                onClick={() => duzenle(m)} 
                                                className="text-blue-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition"
                                                title="Düzenle"
                                            >
                                                <Edit2 size={16}/>
                                            </button>
                                            <button 
                                                onClick={() => sil(m.id)} 
                                                className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition"
                                                title="Sil"
                                            >
                                                <Trash2 size={16}/>
                                            </button>
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
    </div>
  );
}