"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Loader2, Plus, TrendingUp, DollarSign, Calendar, Save, Trash2, Briefcase, User, MapPin, Clock, Wrench, FileText, X, Box, Edit2, RotateCcw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

export default function AnalizSayfasi() {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kayitlar, setKayitlar] = useState<any[]>([]);
  
  // Detay Modalı İçin State
  const [seciliKayit, setSeciliKayit] = useState<any | null>(null);

  // Düzenleme Modu İçin State (ID varsa düzenleme modundayız demektir)
  const [duzenlemeId, setDuzenlemeId] = useState<string | null>(null);

  // İstatistikler
  const [istatistik, setIstatistik] = useState({
    toplamCiro: 0,
    buAyCiro: 0,
    buHaftaIslem: 0,
    buAyIslem: 0
  });
  
  const [grafikVerisi, setGrafikVerisi] = useState<any[]>([]);

  // Form Verileri
  const [yeniKayit, setYeniKayit] = useState({
    service_date: new Date().toISOString().split('T')[0],
    customer_text: '', 
    company_address: '', 
    customer_rep: '',    
    crane_capacity: '',  
    service_type: 'Servis', 
    work_hours: '',      
    description: '',
    materials_text: '',  
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

  // 🔥 KAYDETME VE GÜNCELLEME FONKSİYONU 🔥
  const kaydetVeyaGuncelle = async () => {
    if (!yeniKayit.customer_text || !yeniKayit.price) return alert("Müşteri adı ve fiyat zorunludur.");
    
    setYukleniyor(true);

    const veriPaketi = {
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
    };

    let error;

    if (duzenlemeId) {
        // GÜNCELLEME MODU
        const response = await supabase.from('completed_services').update(veriPaketi).eq('id', duzenlemeId);
        error = response.error;
    } else {
        // YENİ KAYIT MODU
        const response = await supabase.from('completed_services').insert([veriPaketi]);
        error = response.error;
    }
    
    if (error) {
        alert("Hata: " + error.message);
    } else {
        alert(duzenlemeId ? "Kayıt Güncellendi! ✅" : "Kayıt Eklendi! ✅");
        formuSifirla();
        verileriGetir();
    }
    setYukleniyor(false);
  };

  // Düzenleme Modunu Aç
  const duzenle = (e: any, kayit: any) => {
      e.stopPropagation(); // Detay modalını açmasın
      setDuzenlemeId(kayit.id);
      setYeniKayit({
          service_date: kayit.service_date,
          customer_text: kayit.customer_text || '',
          company_address: kayit.company_address || '',
          customer_rep: kayit.customer_rep || '',
          crane_capacity: kayit.crane_capacity || '',
          service_type: kayit.service_type || 'Servis',
          work_hours: kayit.work_hours || '',
          description: kayit.description || '',
          materials_text: kayit.materials_text || '',
          price: kayit.price || '',
          technician: kayit.technician || ''
      });
      // Sayfanın en üstüne (forma) kaydır
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Vazgeç / Formu Sıfırla
  const formuSifirla = () => {
      setDuzenlemeId(null);
      setYeniKayit({
          service_date: new Date().toISOString().split('T')[0],
          customer_text: '', company_address: '', customer_rep: '', crane_capacity: '',
          service_type: 'Servis', work_hours: '', description: '', materials_text: '',
          price: '', technician: 'Genel Servis'
      });
  };

  const sil = async (e: any, id: string) => {
    e.stopPropagation();
    if(!confirm("Bu kaydı silmek istediğine emin misin?")) return;
    await supabase.from('completed_services').delete().eq('id', id);
    verileriGetir();
    if (seciliKayit?.id === id) setSeciliKayit(null);
  }

  const tipRengi = (tip: string) => {
      if(tip === 'Periyodik Bakım') return 'bg-purple-100 text-purple-700 border-purple-200';
      if(tip === 'Garanti') return 'bg-green-100 text-green-700 border-green-200';
      if(tip === 'Servis') return 'bg-blue-100 text-blue-700 border-blue-200';
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }

  if (yukleniyor && kayitlar.length === 0) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600"/></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-24 relative font-sans">
      
      {/* BAŞLIK (MOBİL UYUMLU: Alt alta geçebilsin diye flex-col md:flex-row) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 md:mb-8">
        <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">📊 Servis Yönetim Paneli</h1>
            <p className="text-slate-500 text-xs md:text-sm">Finansal analiz ve detaylı servis dökümü.</p>
        </div>
        <Link href="/admin" className="w-full md:w-auto text-center bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition shadow-sm">
            Panele Dön
        </Link>
      </div>

      {/* İSTATİSTİKLER (MOBİL UYUMLU: grid-cols-2 lg:grid-cols-4) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Toplam Ciro</div>
            <div className="text-lg md:text-xl font-black text-slate-800">{istatistik.toplamCiro.toLocaleString('tr-TR')} ₺</div>
        </div>
        <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Bu Ay Ciro</div>
            <div className="text-lg md:text-xl font-black text-slate-800">{istatistik.buAyCiro.toLocaleString('tr-TR')} ₺</div>
        </div>
        <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Haftalık Servis</div>
            <div className="text-lg md:text-xl font-black text-slate-800">{istatistik.buHaftaIslem} Adet</div>
        </div>
        <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Aylık Servis</div>
            <div className="text-lg md:text-xl font-black text-slate-800">{istatistik.buAyIslem} Adet</div>
        </div>
      </div>

      {/* ANA IZGARA (MOBİL UYUMLU: Tek Sütun -> Büyük Ekranda 3 Sütun) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* --- SOL TARAF: FORM (HEM EKLEME HEM DÜZENLEME) --- */}
        <div className={`lg:col-span-1 p-5 md:p-6 rounded-2xl shadow-lg border h-fit sticky top-6 transition-all ${duzenlemeId ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-100'}`}>
            <h2 className={`text-lg font-bold mb-4 flex items-center gap-2 ${duzenlemeId ? 'text-orange-700' : 'text-slate-800'}`}>
                {duzenlemeId ? <Edit2 className="w-5 h-5"/> : <Plus className="w-5 h-5 bg-slate-800 text-white rounded-full p-1"/>}
                {duzenlemeId ? 'Kaydı Düzenle' : 'Yeni İşlem Ekle'}
            </h2>
            
            <div className="space-y-3">
                {/* 1. Müşteri & Adres */}
                <div className="p-3 bg-white/50 rounded-xl border border-slate-200/50 space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Müşteri Bilgileri</span>
                    <input type="date" value={yeniKayit.service_date} onChange={e => setYeniKayit({...yeniKayit, service_date: e.target.value})} className="w-full p-2 bg-white rounded-lg border text-sm font-bold"/>
                    <input type="text" placeholder="Firma Adı (Örn: Buvisan)" value={yeniKayit.customer_text} onChange={e => setYeniKayit({...yeniKayit, customer_text: e.target.value})} className="w-full p-2 bg-white rounded-lg border text-sm font-bold"/>
                    <input type="text" placeholder="Firma Adresi" value={yeniKayit.company_address} onChange={e => setYeniKayit({...yeniKayit, company_address: e.target.value})} className="w-full p-2 bg-white rounded-lg border text-xs"/>
                    <input type="text" placeholder="Yetkili Kişi İsmi" value={yeniKayit.customer_rep} onChange={e => setYeniKayit({...yeniKayit, customer_rep: e.target.value})} className="w-full p-2 bg-white rounded-lg border text-xs"/>
                </div>

                {/* 2. Vinç & İşlem */}
                <div className="p-3 bg-white/50 rounded-xl border border-slate-200/50 space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">İşlem Detayları</span>
                    <div className="flex flex-col md:flex-row gap-2">
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
                <div className="p-3 bg-white/50 rounded-xl border border-slate-200/50 space-y-3">
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

                {/* BUTONLAR */}
                <div className="flex gap-2">
                    {duzenlemeId && (
                        <button onClick={formuSifirla} className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold rounded-xl transition flex items-center justify-center gap-2 text-xs md:text-sm">
                            <RotateCcw size={18}/> VAZGEÇ
                        </button>
                    )}
                    <button onClick={kaydetVeyaGuncelle} disabled={yukleniyor} className={`flex-[2] py-3 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg text-xs md:text-sm ${duzenlemeId ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'}`}>
                        {yukleniyor ? <Loader2 className="animate-spin"/> : duzenlemeId ? <><Save size={18}/> GÜNCELLE</> : <><Save size={18}/> KAYDET</>}
                    </button>
                </div>
            </div>
        </div>

        {/* --- SAĞ TARAF: GRAFİK VE LİSTE --- */}
        <div className="lg:col-span-2 space-y-6">
            
            {/* GRAFİK (Mobilde gizlemesek iyi olur ama yer kaplamasın diye ayar çekebiliriz) */}
            <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100 hidden md:block">
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

            {/* LİSTE (MOBİL UYUMLU: Yatay Kaydırma Özellikli - overflow-x-auto) */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 border-b border-slate-100 font-bold text-slate-700 flex justify-between items-center">
                    <span>📜 Son İşlemler</span>
                    <span className="text-[10px] md:text-xs text-slate-400 font-normal">Detay için satıra tıkla</span>
                </div>
                {/* 🌟 İŞTE BURASI MOBİLDE TABLOYU KAYDIRILABİLİR YAPIYOR 🌟 */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap md:whitespace-normal">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] md:text-xs">
                            <tr>
                                <th className="p-3 md:p-4">Tarih</th>
                                <th className="p-3 md:p-4">Müşteri</th>
                                <th className="p-3 md:p-4 hidden md:table-cell">İşlem</th>
                                <th className="p-3 md:p-4">Tip</th>
                                <th className="p-3 md:p-4">Tutar</th>
                                <th className="p-3 md:p-4 text-right">Düzenle / Sil</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {kayitlar.map((item) => (
                                <tr 
                                    key={item.id} 
                                    onClick={() => setSeciliKayit(item)} 
                                    className={`transition cursor-pointer group ${duzenlemeId === item.id ? 'bg-orange-50' : 'hover:bg-blue-50'}`}
                                >
                                    <td className="p-3 md:p-4 font-mono text-slate-500 text-[10px] md:text-xs">{new Date(item.service_date).toLocaleDateString('tr-TR')}</td>
                                    <td className="p-3 md:p-4">
                                        <div className="font-bold text-slate-800 text-xs md:text-sm group-hover:text-blue-600 max-w-[120px] md:max-w-none truncate">{item.customer_text}</div>
                                        <div className="text-[10px] text-slate-400">{item.customer_rep || '-'}</div>
                                    </td>
                                    <td className="p-3 md:p-4 text-slate-600 truncate max-w-[100px] hidden md:table-cell">{item.description}</td>
                                    <td className="p-3 md:p-4">
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded border ${tipRengi(item.service_type)}`}>
                                            {item.service_type || 'Servis'}
                                        </span>
                                    </td>
                                    <td className="p-3 md:p-4 font-bold text-green-600 text-xs md:text-sm">{Number(item.price).toLocaleString('tr-TR')} ₺</td>
                                    <td className="p-3 md:p-4 text-right">
                                        <div className="flex justify-end gap-1">
                                            {/* 🔥 DÜZENLE BUTONU 🔥 */}
                                            <button 
                                                onClick={(e) => duzenle(e, item)} 
                                                className="text-blue-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition" 
                                                title="Düzenle"
                                            >
                                                <Edit2 size={16}/>
                                            </button>
                                            
                                            <button 
                                                onClick={(e) => sil(e, item.id)} 
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

      {/* --- DETAY MODALI (MOBİL UYUMLU: Genişlik ve Kaydırma Ayarları) --- */}
      <AnimatePresence>
        {seciliKayit && (
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
                onClick={() => setSeciliKayit(null)}
            >
                <motion.div 
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                    // w-[95%] ve max-h-[85vh] sayesinde telefonda taşma yapmaz
                    className="bg-white w-[95%] md:w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="bg-slate-900 text-white p-4 md:p-6 flex justify-between items-start shrink-0">
                        <div>
                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 mb-1">
                                <h2 className="text-lg md:text-2xl font-bold">{seciliKayit.customer_text}</h2>
                                <span className={`text-[10px] md:text-xs font-bold px-2 py-0.5 rounded bg-white/20 text-white w-fit`}>{seciliKayit.service_type}</span>
                            </div>
                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-slate-400 text-[10px] md:text-xs">
                                <span className="flex items-center gap-1"><MapPin size={12}/> {seciliKayit.company_address || 'Adres Girilmedi'}</span>
                                <span className="flex items-center gap-1"><User size={12}/> {seciliKayit.customer_rep || 'Yetkili Girilmedi'}</span>
                            </div>
                        </div>
                        <button onClick={() => setSeciliKayit(null)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition"><X size={20}/></button>
                    </div>

                    <div className="p-4 md:p-6 space-y-4 md:space-y-6 overflow-y-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-3 md:p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="text-[10px] md:text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1"><Wrench size={12}/> Teknik Detaylar</div>
                                <div className="space-y-1 text-xs md:text-sm text-slate-700">
                                    <div><span className="font-bold">Vinç Kapasite:</span> {seciliKayit.crane_capacity || '-'}</div>
                                    <div><span className="font-bold">Çalışma Süresi:</span> {seciliKayit.work_hours} Saat</div>
                                    <div><span className="font-bold">Teknisyenler:</span> {seciliKayit.technician}</div>
                                </div>
                            </div>
                            <div className="p-3 md:p-4 bg-green-50 rounded-xl border border-green-100">
                                <div className="text-[10px] md:text-xs font-bold text-green-600 uppercase mb-1 flex items-center gap-1"><DollarSign size={12}/> Finansal</div>
                                <div className="text-2xl md:text-3xl font-black text-green-700">{Number(seciliKayit.price).toLocaleString('tr-TR')} ₺</div>
                                <div className="text-[10px] md:text-xs text-green-600 mt-1 font-bold">{new Date(seciliKayit.service_date).toLocaleDateString('tr-TR')} Tarihinde İşlendi</div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2"><FileText size={16}/> Yapılan İşin Detayı</h3>
                            <div className="bg-slate-50 p-4 rounded-xl text-xs md:text-sm text-slate-600 leading-relaxed border border-slate-100">
                                {seciliKayit.description}
                            </div>
                        </div>

                        {seciliKayit.materials_text && (
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2"><Box size={16}/> Kullanılan Malzemeler & Fiyatlar</h3>
                                <div className="bg-yellow-50 p-4 rounded-xl text-xs md:text-sm text-slate-700 font-mono whitespace-pre-line border border-yellow-100">
                                    {seciliKayit.materials_text}
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 shrink-0">
                        {/* Modal İçinden Düzenleme Butonu */}
                        <button 
                            onClick={(e) => {
                                setSeciliKayit(null); // Modalı kapat
                                duzenle(e, seciliKayit); // Düzenleme moduna geç
                            }} 
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition flex items-center gap-2 text-xs md:text-sm"
                        >
                            <Edit2 size={14}/> Düzenle
                        </button>
                        <button onClick={() => setSeciliKayit(null)} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 font-bold hover:bg-slate-100 transition text-xs md:text-sm">Kapat</button>
                    </div>

                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}