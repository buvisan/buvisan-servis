"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Loader2, Plus, TrendingUp, DollarSign, Calendar, Wrench, Save, Trash2, Briefcase } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Link from 'next/link';

export default function AnalizSayfasi() {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kayitlar, setKayitlar] = useState<any[]>([]);
  
  // İstatistikler
  const [istatistik, setIstatistik] = useState({
    toplamCiro: 0,
    buAyCiro: 0,
    toplamIslem: 0,
    buHaftaIslem: 0, // YENİ
    buAyIslem: 0     // YENİ
  });
  
  const [grafikVerisi, setGrafikVerisi] = useState<any[]>([]);

  // Yeni Kayıt Formu (Artık crane_id yok, customer_text var)
  const [yeniKayit, setYeniKayit] = useState({
    service_date: new Date().toISOString().split('T')[0],
    customer_text: '', // Elle yazılan isim
    description: '',
    price: '',
    technician: 'Genel Servis'
  });

  useEffect(() => {
    verileriGetir();
  }, []);

  const verileriGetir = async () => {
    const { data, error } = await supabase
      .from('completed_services')
      .select('*')
      .order('service_date', { ascending: false });

    if (data) {
        setKayitlar(data);
        hesaplamalariYap(data);
    }
    setYukleniyor(false);
  };

  const hesaplamalariYap = (data: any[]) => {
    const bugun = new Date();
    const suAnkiAy = bugun.getMonth();
    const suAnkiYil = bugun.getFullYear();
    
    // Bu haftanın başlangıcını bul (Pazartesi)
    const buHaftaBaslangic = new Date(bugun);
    const day = buHaftaBaslangic.getDay();
    const diff = buHaftaBaslangic.getDate() - day + (day === 0 ? -6 : 1); 
    buHaftaBaslangic.setDate(diff);
    buHaftaBaslangic.setHours(0,0,0,0);

    let topCiro = 0;
    let ayCiro = 0;
    let haftaSayi = 0;
    let aySayi = 0;

    const musteriAnalizi: any = {};

    data.forEach(item => {
        const fiyat = Number(item.price) || 0;
        const islemTarihi = new Date(item.service_date);

        // 1. Ciro Hesapları
        topCiro += fiyat;
        if (islemTarihi.getMonth() === suAnkiAy && islemTarihi.getFullYear() === suAnkiYil) {
            ayCiro += fiyat;
            aySayi++; // Bu ay yapılan işlem sayısı
        }

        // 2. Hafta Hesabı
        if (islemTarihi >= buHaftaBaslangic) {
            haftaSayi++;
        }

        // 3. Grafik İçin (Müşteri Bazlı Toplam)
        const musteri = item.customer_text || 'Bilinmeyen';
        if (musteriAnalizi[musteri]) {
            musteriAnalizi[musteri] += fiyat;
        } else {
            musteriAnalizi[musteri] = fiyat;
        }
    });

    setIstatistik({
        toplamCiro: topCiro,
        buAyCiro: ayCiro,
        toplamIslem: data.length,
        buHaftaIslem: haftaSayi,
        buAyIslem: aySayi
    });

    // Grafiğe çevir (En çok ciro yapan 5 müşteri)
    const grafikArr = Object.keys(musteriAnalizi)
        .map(key => ({ name: key, tutar: musteriAnalizi[key] }))
        .sort((a, b) => b.tutar - a.tutar)
        .slice(0, 5); // İlk 5'i al
        
    setGrafikVerisi(grafikArr);
  };

  const kaydet = async () => {
    if (!yeniKayit.customer_text || !yeniKayit.price) return alert("Müşteri adı ve fiyat giriniz.");
    
    setYukleniyor(true);
    // Veritabanına elle yazılan ismi 'customer_text' olarak kaydediyoruz
    const { error } = await supabase.from('completed_services').insert([{
        service_date: yeniKayit.service_date,
        customer_text: yeniKayit.customer_text,
        description: yeniKayit.description,
        price: yeniKayit.price,
        technician: yeniKayit.technician
    }]);
    
    if (error) {
        alert("Hata: " + error.message);
    } else {
        alert("Kayıt Eklendi! 💰");
        setYeniKayit({ ...yeniKayit, description: '', price: '', customer_text: '' });
        verileriGetir();
    }
  };

  const sil = async (id: string) => {
    if(!confirm("Silmek istediğine emin misin?")) return;
    await supabase.from('completed_services').delete().eq('id', id);
    verileriGetir();
  }

  if (yukleniyor && kayitlar.length === 0) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600"/></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 pb-20">
      
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">📊 Finansal & İş Analizi</h1>
            <p className="text-slate-500 text-sm">Haftalık ve aylık performans raporları.</p>
        </div>
        <Link href="/admin" className="text-sm font-bold text-slate-500 hover:text-slate-800">Panele Dön</Link>
      </div>

      {/* --- İSTATİSTİK KARTLARI (YENİLENDİ) --- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {/* Toplam Ciro */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-100 text-green-600 rounded-lg"><DollarSign size={20}/></div>
                <span className="text-xs text-slate-400 font-bold uppercase">Toplam Ciro</span>
            </div>
            <div className="text-xl font-black text-slate-800">{istatistik.toplamCiro.toLocaleString('tr-TR')} ₺</div>
        </div>

        {/* Bu Ay Ciro */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><TrendingUp size={20}/></div>
                <span className="text-xs text-slate-400 font-bold uppercase">Bu Ay Ciro</span>
            </div>
            <div className="text-xl font-black text-slate-800">{istatistik.buAyCiro.toLocaleString('tr-TR')} ₺</div>
        </div>

        {/* Bu Hafta İşlem Sayısı (YENİ) */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Calendar size={20}/></div>
                <span className="text-xs text-slate-400 font-bold uppercase">Bu Hafta İş</span>
            </div>
            <div className="text-xl font-black text-slate-800">{istatistik.buHaftaIslem} <span className="text-sm font-normal text-slate-400">Adet</span></div>
        </div>

        {/* Bu Ay İşlem Sayısı (YENİ) */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-orange-100 text-orange-600 rounded-lg"><Briefcase size={20}/></div>
                <span className="text-xs text-slate-400 font-bold uppercase">Bu Ay İş</span>
            </div>
            <div className="text-xl font-black text-slate-800">{istatistik.buAyIslem} <span className="text-sm font-normal text-slate-400">Adet</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* --- SOL TARAF: YENİ KAYIT FORMU (MANUEL GİRİŞ) --- */}
        <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-lg border border-slate-100 h-fit sticky top-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 bg-slate-800 text-white rounded-full p-1"/> İşlem Gir
            </h2>
            
            <div className="space-y-4">
                <div>
                    <label className="text-xs font-bold text-slate-400">Tarih</label>
                    <input type="date" value={yeniKayit.service_date} onChange={e => setYeniKayit({...yeniKayit, service_date: e.target.value})} className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700"/>
                </div>

                {/* ARTIK DROP DOWN YOK, MANUEL GİRİŞ VAR */}
                <div>
                    <label className="text-xs font-bold text-slate-400">Müşteri / Firma Adı</label>
                    <input 
                        type="text" 
                        placeholder="Örn: Arçelik Fabrikası" 
                        value={yeniKayit.customer_text} 
                        onChange={e => setYeniKayit({...yeniKayit, customer_text: e.target.value})} 
                        className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700"
                    />
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
            
            {/* GRAFİK (EN ÇOK KİM KAZANDIRDI?) */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-sm font-bold text-slate-500 mb-6 uppercase">En Çok Çalışılan 5 Firma (Gelir)</h3>
                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={grafikVerisi}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="name" tick={{fontSize: 10}} interval={0} />
                            <YAxis width={80} />
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
                                <th className="p-4">Müşteri</th>
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
                                        <div className="font-bold text-slate-800">{item.customer_text || item.cranes?.customer_name || 'Bilinmiyor'}</div>
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