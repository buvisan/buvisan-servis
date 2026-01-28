"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Loader2, Plus, TrendingUp, DollarSign, Calendar, Wrench, Save, Trash2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import Link from 'next/link';

export default function AnalizSayfasi() {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kayitlar, setKayitlar] = useState<any[]>([]);
  const [vincler, setVincler] = useState<any[]>([]);
  
  // İstatistikler
  const [toplamCiro, setToplamCiro] = useState(0);
  const [buAyCiro, setBuAyCiro] = useState(0);
  const [grafikVerisi, setGrafikVerisi] = useState<any[]>([]);

  // Yeni Kayıt Formu
  const [yeniKayit, setYeniKayit] = useState({
    crane_id: '',
    service_date: new Date().toISOString().split('T')[0], // Bugünün tarihi
    description: '',
    price: '',
    technician: 'Genel Servis'
  });

  // Verileri Çek
  useEffect(() => {
    verileriGetir();
  }, []);

  const verileriGetir = async () => {
    // 1. Vinç Listesini Al (Dropdown için)
    const { data: vinclerData } = await supabase.from('cranes').select('id, customer_name, model_name');
    if (vinclerData) setVincler(vinclerData);

    // 2. Geçmiş Kayıtları Al
    const { data: servisData, error } = await supabase
      .from('completed_services')
      .select('*, cranes(customer_name, model_name)')
      .order('service_date', { ascending: false });

    if (servisData) {
        setKayitlar(servisData);
        hesaplamalariYap(servisData);
    }
    setYukleniyor(false);
  };

  // Otomatik Hesaplama Motoru
  const hesaplamalariYap = (data: any[]) => {
    let toplam = 0;
    let buAy = 0;
    const markaAnalizi: any = {};
    const suAnkiAy = new Date().getMonth();

    data.forEach(item => {
        const fiyat = Number(item.price) || 0;
        toplam += fiyat;

        const tarih = new Date(item.service_date);
        if (tarih.getMonth() === suAnkiAy) {
            buAy += fiyat;
        }

        // Marka Bazlı Gruplama (Grafik İçin)
        const marka = item.cranes?.model_name || 'Bilinmeyen';
        if (markaAnalizi[marka]) {
            markaAnalizi[marka] += fiyat;
        } else {
            markaAnalizi[marka] = fiyat;
        }
    });

    setToplamCiro(toplam);
    setBuAyCiro(buAy);

    // Grafik formatına çevir
    const grafikArr = Object.keys(markaAnalizi).map(key => ({
        name: key,
        tutar: markaAnalizi[key]
    }));
    setGrafikVerisi(grafikArr);
  };

  // Yeni Kayıt Ekleme
  const kaydet = async () => {
    if (!yeniKayit.crane_id || !yeniKayit.price) return alert("Lütfen vinç seçin ve fiyat girin.");
    
    setYukleniyor(true);
    const { error } = await supabase.from('completed_services').insert([yeniKayit]);
    
    if (error) {
        alert("Hata: " + error.message);
    } else {
        alert("Kayıt Eklendi! 💰");
        // Formu temizle ve listeyi yenile
        setYeniKayit({ ...yeniKayit, description: '', price: '' });
        verileriGetir();
    }
  };

  // Kayıt Silme
  const sil = async (id: string) => {
    if(!confirm("Bu finansal kaydı silmek istediğine emin misin?")) return;
    await supabase.from('completed_services').delete().eq('id', id);
    verileriGetir();
  }

  if (yukleniyor && kayitlar.length === 0) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600"/></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 pb-20">
      
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">📊 Finansal & Servis Analizi</h1>
            <p className="text-slate-500 text-sm">Haftalık, aylık ve yıllık servis raporları.</p>
        </div>
        <Link href="/admin" className="text-sm font-bold text-slate-500 hover:text-slate-800">Panele Dön</Link>
      </div>

      {/* --- İSTATİSTİK KARTLARI --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="p-3 bg-green-100 text-green-600 rounded-xl"><DollarSign size={24}/></div>
            <div>
                <div className="text-xs text-slate-400 font-bold uppercase">Toplam Ciro</div>
                <div className="text-2xl font-black text-slate-800">{toplamCiro.toLocaleString('tr-TR')} ₺</div>
            </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl"><TrendingUp size={24}/></div>
            <div>
                <div className="text-xs text-slate-400 font-bold uppercase">Bu Ay Ciro</div>
                <div className="text-2xl font-black text-slate-800">{buAyCiro.toLocaleString('tr-TR')} ₺</div>
            </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-xl"><Wrench size={24}/></div>
            <div>
                <div className="text-xs text-slate-400 font-bold uppercase">Toplam İşlem</div>
                <div className="text-2xl font-black text-slate-800">{kayitlar.length} Adet</div>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* --- SOL TARA: YENİ KAYIT FORMU --- */}
        <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-lg border border-slate-100 h-fit sticky top-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 bg-slate-800 text-white rounded-full p-1"/> Yeni İşlem Gir
            </h2>
            
            <div className="space-y-4">
                <div>
                    <label className="text-xs font-bold text-slate-400">Tarih</label>
                    <input type="date" value={yeniKayit.service_date} onChange={e => setYeniKayit({...yeniKayit, service_date: e.target.value})} className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700"/>
                </div>

                <div>
                    <label className="text-xs font-bold text-slate-400">Vinç / Müşteri Seç</label>
                    <select value={yeniKayit.crane_id} onChange={e => setYeniKayit({...yeniKayit, crane_id: e.target.value})} className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700">
                        <option value="">Seçiniz...</option>
                        {vincler.map(v => (
                            <option key={v.id} value={v.id}>{v.customer_name} - {v.model_name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="text-xs font-bold text-slate-400">Yapılan İş / Açıklama</label>
                    <textarea rows={3} value={yeniKayit.description} onChange={e => setYeniKayit({...yeniKayit, description: e.target.value})} placeholder="Örn: Halat değişimi yapıldı..." className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-sm"/>
                </div>

                <div className="flex gap-4">
                    <div className="flex-1">
                        <label className="text-xs font-bold text-slate-400">Fiyat (TL)</label>
                        <input type="number" value={yeniKayit.price} onChange={e => setYeniKayit({...yeniKayit, price: e.target.value})} placeholder="0.00" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700"/>
                    </div>
                    <div className="flex-1">
                        <label className="text-xs font-bold text-slate-400">Teknisyen</label>
                        <input type="text" value={yeniKayit.technician} onChange={e => setYeniKayit({...yeniKayit, technician: e.target.value})} className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-sm"/>
                    </div>
                </div>

                <button onClick={kaydet} disabled={yukleniyor} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2">
                    {yukleniyor ? <Loader2 className="animate-spin"/> : <><Save size={18}/> KAYDET</>}
                </button>
            </div>
        </div>

        {/* --- SAĞ TARAF: GRAFİK VE LİSTE --- */}
        <div className="lg:col-span-2 space-y-6">
            
            {/* GRAFİK */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-sm font-bold text-slate-500 mb-6 uppercase">Marka Bazlı Gelir Dağılımı</h3>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={grafikVerisi}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="name" tick={{fontSize: 12}} />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="tutar" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Toplam Gelir (TL)" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* LİSTE */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 border-b border-slate-100 font-bold text-slate-700">📜 Son İşlemler</div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                            <tr>
                                <th className="p-4">Tarih</th>
                                <th className="p-4">Müşteri / Vinç</th>
                                <th className="p-4">Açıklama</th>
                                <th className="p-4">Tutar</th>
                                <th className="p-4 text-right">İşlem</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {kayitlar.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50 transition">
                                    <td className="p-4 font-mono text-slate-500">{new Date(item.service_date).toLocaleDateString('tr-TR')}</td>
                                    <td className="p-4">
                                        <div className="font-bold text-slate-800">{item.cranes?.customer_name}</div>
                                        <div className="text-xs text-slate-400">{item.cranes?.model_name}</div>
                                    </td>
                                    <td className="p-4 text-slate-600">{item.description}</td>
                                    <td className="p-4 font-bold text-green-600">{Number(item.price).toLocaleString('tr-TR')} ₺</td>
                                    <td className="p-4 text-right">
                                        <button onClick={() => sil(item.id)} className="text-slate-300 hover:text-red-500 transition"><Trash2 size={16}/></button>
                                    </td>
                                </tr>
                            ))}
                            {kayitlar.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-6 text-center text-slate-400">Henüz kayıt bulunmuyor. Soldan ekleyebilirsin.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>

      </div>
    </div>
  );
}