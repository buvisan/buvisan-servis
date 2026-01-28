"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Loader2, Plus, TrendingUp, DollarSign, Calendar, Save, Trash2, Briefcase, User, MapPin, Clock, Wrench, FileText, X, Box } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

export default function AnalizSayfasi() {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kayitlar, setKayitlar] = useState<any[]>([]);
  
  // Detay Modalı İçin State
  const [seciliKayit, setSeciliKayit] = useState<any | null>(null);

  // İstatistikler
  const [istatistik, setIstatistik] = useState({
    toplamCiro: 0,
    buAyCiro: 0,
    buHaftaIslem: 0,
    buAyIslem: 0
  });
  
  const [grafikVerisi, setGrafikVerisi] = useState<any[]>([]);

  // --- GELİŞMİŞ KAYIT FORMU ---
  const [yeniKayit, setYeniKayit] = useState({
    service_date: new Date().toISOString().split('T')[0],
    customer_text: '', 
    company_address: '', // YENİ
    customer_rep: '',    // YENİ
    crane_capacity: '',  // YENİ
    service_type: 'Servis', // YENİ (Default)
    work_hours: '',      // YENİ
    description: '',
    materials_text: '',  // YENİ
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
    
    // Bu haftanın başlangıcı
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

        topCiro += fiyat;
        if (islemTarihi.getMonth() === suAnkiAy && islemTarihi.getFullYear() === suAnkiYil) {
            ayCiro += fiyat;
            aySayi++;
        }
        if (islemTarihi >= buHaftaBaslangic) haftaSayi++;

        const musteri = item.customer_text || 'Bilinmeyen';
        musteriAnalizi[musteri] = (musteriAnalizi[musteri] || 0) + fiyat;
    });

    setIstatistik({ toplamCiro: topCiro, buAyCiro: ayCiro, buHaftaIslem: haftaSayi, buAyIslem: aySayi });

    const grafikArr = Object.keys(musteriAnalizi)
        .map(key => ({ name: key, tutar: musteriAnalizi[key] }))
        .sort((a, b) => b.tutar - a.tutar)
        .slice(0, 5);
        
    setGrafikVerisi(grafikArr);
  };

  const kaydet = async () => {
    if (!yeniKayit.customer_text || !yeniKayit.price) return alert("Müşteri adı ve fiyat zorunludur.");
    
    setYukleniyor(true);
    const { error } = await supabase.from('completed_services').insert([{
        service_date: yeniKayit.service_date,
        customer_text: yeniKayit.customer_text,
        company_address: yeniKayit.company_address,
        customer_rep: yeniKayit.customer_rep,
        crane_capacity: yeniKayit.crane_capacity,
        service_type: yeniKayit.service_type,
        work_hours: yeniKayit.work_hours ? Number(yeniKayit.work_hours) : 0,
        description: yeniKayit.description,
        materials_text: yeniKayit.materials_text,
        price: yeniKayit.price,
        technician: yeniKayit.technician
    }]);
    
    if (error) {
        alert("Hata: " + error.message);
    } else {
        alert("Kayıt Başarıyla Eklendi! ✅");
        // Formu sıfırla
        setYeniKayit({
            service_date: new Date().toISOString().split('T')[0],
            customer_text: '', company_address: '', customer_rep: '', crane_capacity: '',
            service_type: 'Servis', work_hours: '', description: '', materials_text: '',
            price: '', technician: 'Genel Servis'
        });
        verileriGetir();
    }
  };

  const sil = async (e: any, id: string) => {
    e.stopPropagation(); // Satıra tıklamayı engelle
    if(!confirm("Bu kaydı silmek istediğine emin misin?")) return;
    await supabase.from('completed_services').delete().eq('id', id);
    verileriGetir();
    setSeciliKayit(null); // Modalı kapat
  }

  // Servis Tipine Göre Renk Ayarı
  const tipRengi = (tip: string) => {
      if(tip === 'Periyodik Bakım') return 'bg-purple-100 text-purple-700 border-purple-200';
      if(tip === 'Garanti') return 'bg-green-100 text-green-700 border-green-200';
      if(tip === 'Servis') return 'bg-blue-100 text-blue-700 border-blue-200';
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }

  if (yukleniyor && kayitlar.length === 0) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600"/></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 pb-20 relative">
      
      {/* BAŞLIK */}
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">📊 Servis Yönetim Paneli</h1>
            <p className="text-slate-500 text-sm">Finansal analiz ve detaylı servis dökümü.</p>
        </div>
        <Link href="/admin" className="text-sm font-bold text-slate-500 hover:text-slate-800">Panele Dön</Link>
      </div>

      {/* İSTATİSTİKLER */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Toplam Ciro</div>
            <div className="text-xl font-black text-slate-800">{istatistik.toplamCiro.toLocaleString('tr-TR')} ₺</div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Bu Ay Ciro</div>
            <div className="text-xl font-black text-slate-800">{istatistik.buAyCiro.toLocaleString('tr-TR')} ₺</div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Haftalık Servis</div>
            <div className="text-xl font-black text-slate-800">{istatistik.buHaftaIslem} Adet</div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Aylık Servis</div>
            <div className="text-xl font-black text-slate-800">{istatistik.buAyIslem} Adet</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* --- SOL TARAF: DETAYLI GİRİŞ FORMU --- */}
        <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-lg border border-slate-100 h-fit sticky top-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 bg-slate-800 text-white rounded-full p-1"/> Yeni İşlem Ekle
            </h2>
            
            <div className="space-y-3">
                {/* 1. Müşteri & Adres */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Müşteri Bilgileri</span>
                    <input type="date" value={yeniKayit.service_date} onChange={e => setYeniKayit({...yeniKayit, service_date: e.target.value})} className="w-full p-2 bg-white rounded-lg border text-sm font-bold"/>
                    <input type="text" placeholder="Firma Adı (Örn: Buvisan)" value={yeniKayit.customer_text} onChange={e => setYeniKayit({...yeniKayit, customer_text: e.target.value})} className="w-full p-2 bg-white rounded-lg border text-sm font-bold"/>
                    <input type="text" placeholder="Firma Adresi" value={yeniKayit.company_address} onChange={e => setYeniKayit({...yeniKayit, company_address: e.target.value})} className="w-full p-2 bg-white rounded-lg border text-xs"/>
                    <input type="text" placeholder="Yetkili Kişi İsmi" value={yeniKayit.customer_rep} onChange={e => setYeniKayit({...yeniKayit, customer_rep: e.target.value})} className="w-full p-2 bg-white rounded-lg border text-xs"/>
                </div>

                {/* 2. Vinç & İşlem */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">İşlem Detayları</span>
                    <div className="flex gap-2">
                         <select value={yeniKayit.service_type} onChange={e => setYeniKayit({...yeniKayit, service_type: e.target.value})} className="flex-1 p-2 bg-white rounded-lg border text-xs font-bold">
                            <option>Servis</option>
                            <option>Periyodik Bakım</option>
                            <option>Garanti</option>
                            <option>Montaj</option>
                            <option>Diğer</option>
                         </select>
                         <input type="text" placeholder="Kapasite (10 Ton)" value={yeniKayit.crane_capacity} onChange={e => setYeniKayit({...yeniKayit, crane_capacity: e.target.value})} className="flex-1 p-2 bg-white rounded-lg border text-xs"/>
                    </div>
                    <textarea rows={2} placeholder="Yapılan İşin Açıklaması..." value={yeniKayit.description} onChange={e => setYeniKayit({...yeniKayit, description: e.target.value})} className="w-full p-2 bg-white rounded-lg border text-sm"/>
                    <textarea rows={2} placeholder="Kullanılan Malzemeler & Fiyatları..." value={yeniKayit.materials_text} onChange={e => setYeniKayit({...yeniKayit, materials_text: e.target.value})} className="w-full p-2 bg-white rounded-lg border text-xs font-mono"/>
                </div>

                {/* 3. Finans & Ekip */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fiyat & Ekip</span>
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <span className="absolute left-3 top-2 text-slate-400 text-xs">₺</span>
                            <input type="number" placeholder="0.00" value={yeniKayit.price} onChange={e => setYeniKayit({...yeniKayit, price: e.target.value})} className="w-full pl-6 p-2 bg-white rounded-lg border text-sm font-bold"/>
                        </div>
                        <input type="number" placeholder="Saat" value={yeniKayit.work_hours} onChange={e => setYeniKayit({...yeniKayit, work_hours: e.target.value})} className="flex-1 p-2 bg-white rounded-lg border text-xs"/>
                    </div>
                    <input type="text" placeholder="Teknisyenler (Ahmet, Mehmet...)" value={yeniKayit.technician} onChange={e => setYeniKayit({...yeniKayit, technician: e.target.value})} className="w-full p-2 bg-white rounded-lg border text-xs"/>
                </div>

                <button onClick={kaydet} disabled={yukleniyor} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-blue-200">
                    {yukleniyor ? <Loader2 className="animate-spin"/> : <><Save size={18}/> KAYDET</>}
                </button>
            </div>
        </div>

        {/* --- SAĞ TARAF: GRAFİK VE LİSTE --- */}
        <div className="lg:col-span-2 space-y-6">
            
            {/* GRAFİK */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-sm font-bold text-slate-500 mb-6 uppercase">En Çok Kazandıran 5 Firma</h3>
                <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={grafikVerisi}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="name" tick={{fontSize: 10}} interval={0} />
                            <YAxis width={60} />
                            <Tooltip />
                            <Bar dataKey="tutar" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Gelir (TL)" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* LİSTE (TIKLANABİLİR) */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 border-b border-slate-100 font-bold text-slate-700 flex justify-between items-center">
                    <span>📜 Son İşlemler</span>
                    <span className="text-xs text-slate-400 font-normal">Detay için satıra tıkla</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                            <tr>
                                <th className="p-4">Tarih</th>
                                <th className="p-4">Müşteri</th>
                                <th className="p-4">İşlem</th>
                                <th className="p-4">Tip</th>
                                <th className="p-4">Tutar</th>
                                <th className="p-4 text-right">Sil</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {kayitlar.map((item) => (
                                <tr 
                                    key={item.id} 
                                    onClick={() => setSeciliKayit(item)} // 🔥 SATIRA TIKLAYINCA MODAL AÇILIR
                                    className="hover:bg-blue-50 transition cursor-pointer group"
                                >
                                    <td className="p-4 font-mono text-slate-500 text-xs">{new Date(item.service_date).toLocaleDateString('tr-TR')}</td>
                                    <td className="p-4">
                                        <div className="font-bold text-slate-800 group-hover:text-blue-600">{item.customer_text}</div>
                                        <div className="text-[10px] text-slate-400">{item.customer_rep || '-'}</div>
                                    </td>
                                    <td className="p-4 text-slate-600 truncate max-w-[150px]">{item.description}</td>
                                    <td className="p-4">
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded border ${tipRengi(item.service_type)}`}>
                                            {item.service_type || 'Servis'}
                                        </span>
                                    </td>
                                    <td className="p-4 font-bold text-green-600">{Number(item.price).toLocaleString('tr-TR')} ₺</td>
                                    <td className="p-4 text-right">
                                        <button onClick={(e) => sil(e, item.id)} className="text-slate-300 hover:text-red-500 transition p-2"><Trash2 size={16}/></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      </div>

      {/* --- 🔥 DETAY MODALI (POP-UP) 🔥 --- */}
      <AnimatePresence>
        {seciliKayit && (
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
                onClick={() => setSeciliKayit(null)}
            >
                <motion.div 
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                    className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Modal Başlık */}
                    <div className="bg-slate-900 text-white p-6 flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h2 className="text-2xl font-bold">{seciliKayit.customer_text}</h2>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded bg-white/20 text-white`}>{seciliKayit.service_type}</span>
                            </div>
                            <div className="flex items-center gap-4 text-slate-400 text-xs">
                                <span className="flex items-center gap-1"><MapPin size={12}/> {seciliKayit.company_address || 'Adres Girilmedi'}</span>
                                <span className="flex items-center gap-1"><User size={12}/> {seciliKayit.customer_rep || 'Yetkili Girilmedi'}</span>
                            </div>
                        </div>
                        <button onClick={() => setSeciliKayit(null)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition"><X size={20}/></button>
                    </div>

                    {/* Modal İçerik */}
                    <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1"><Wrench size={12}/> Teknik Detaylar</div>
                                <div className="space-y-1 text-sm text-slate-700">
                                    <div><span className="font-bold">Vinç Kapasite:</span> {seciliKayit.crane_capacity || '-'}</div>
                                    <div><span className="font-bold">Çalışma Süresi:</span> {seciliKayit.work_hours} Saat</div>
                                    <div><span className="font-bold">Teknisyenler:</span> {seciliKayit.technician}</div>
                                </div>
                            </div>
                            <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                                <div className="text-xs font-bold text-green-600 uppercase mb-1 flex items-center gap-1"><DollarSign size={12}/> Finansal</div>
                                <div className="text-3xl font-black text-green-700">{Number(seciliKayit.price).toLocaleString('tr-TR')} ₺</div>
                                <div className="text-xs text-green-600 mt-1 font-bold">{new Date(seciliKayit.service_date).toLocaleDateString('tr-TR')} Tarihinde İşlendi</div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2"><FileText size={16}/> Yapılan İşin Detayı</h3>
                            <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-600 leading-relaxed border border-slate-100">
                                {seciliKayit.description}
                            </div>
                        </div>

                        {seciliKayit.materials_text && (
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2"><Box size={16}/> Kullanılan Malzemeler & Fiyatlar</h3>
                                <div className="bg-yellow-50 p-4 rounded-xl text-sm text-slate-700 font-mono whitespace-pre-line border border-yellow-100">
                                    {seciliKayit.materials_text}
                                </div>
                            </div>
                        )}
                        
                    </div>
                    
                    {/* Modal Alt Bar */}
                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                        <button onClick={() => setSeciliKayit(null)} className="px-6 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 font-bold hover:bg-slate-100 transition">Kapat</button>
                    </div>

                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}