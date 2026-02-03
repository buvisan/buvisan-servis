"use client";

// ----------------------------------------------------------------------------
// BUVISAN SERVİS YÖNETİM PANELİ - FİNANSAL ANALİZ VE SERVİS TAKİP MODÜLÜ 🛠️
// (Final Versiyon: Stok Entegrasyonlu, Arama Özellikli & Detaylı Modal)
// ----------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Loader2, Plus, TrendingUp, DollarSign, Calendar, Save, Trash2, 
  Briefcase, User, MapPin, Clock, Wrench, FileText, X, Box, Edit2, RotateCcw, 
  Package, Search // Arama ikonu eklendi
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

export default function AnalizSayfasi() {
  
  // --- STATE TANIMLAMALARI ---
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kayitlar, setKayitlar] = useState<any[]>([]);
  
  // 🔥 YENİ: Stoktaki Malzemeler Listesi (Depodan çekilecek)
  const [stokMalzemeleri, setStokMalzemeleri] = useState<any[]>([]);
  
  // 🔥 YENİ: Arama Metni State'i
  const [aramaMetni, setAramaMetni] = useState("");

  // Detay Modalı için seçili kayıt
  const [seciliKayit, setSeciliKayit] = useState<any | null>(null);

  // Düzenleme Modu için ID
  const [duzenlemeId, setDuzenlemeId] = useState<string | null>(null);

  // İstatistik Verileri
  const [istatistik, setIstatistik] = useState({
    toplamCiro: 0,
    buAyCiro: 0,
    toplamIslem: 0, 
    buHaftaIslem: 0,
    buAyIslem: 0
  });
  
  // Grafik Verisi
  const [grafikVerisi, setGrafikVerisi] = useState<any[]>([]);

  // --- MALZEME YÖNETİMİ ---
  // Sepetteki Malzemeler
  const [malzemeListesi, setMalzemeListesi] = useState<{id: number, ad: string, fiyat: number}[]>([]);
  
  // Seçim Kutuları (Geçici)
  const [secilenMalzemeId, setSecilenMalzemeId] = useState("");
  const [tempMalzemeFiyat, setTempMalzemeFiyat] = useState("");

  // Form Verileri (Tüm detaylar burada)
  const [yeniKayit, setYeniKayit] = useState({
    service_date: new Date().toISOString().split('T')[0],
    customer_text: '', 
    company_address: '', 
    customer_rep: '',    
    crane_capacity: '',  
    service_type: 'Servis', 
    work_hours: '',      
    description: '',
    price: '',
    technician: 'Genel Servis'
  });

  // --- SAYFA YÜKLENİNCE VERİLERİ ÇEK ---
  useEffect(() => {
    verileriGetir();
  }, []);

  const verileriGetir = async () => {
    // 1. Servis Kayıtlarını Çek
    const { data: servisData } = await supabase
      .from('completed_services')
      .select('*')
      .order('service_date', { ascending: false });

    if (servisData) {
        setKayitlar(servisData);
        hesaplamalariYap(servisData);
    }

    // 2. 🔥 Depodaki Malzemeleri Çek
    const { data: stokData } = await supabase.from('materials').select('*').order('name', { ascending: true });
    if (stokData) setStokMalzemeleri(stokData);

    setYukleniyor(false);
  };

  // --- HESAPLAMA MOTORU ---
  const hesaplamalariYap = (data: any[]) => {
    const bugun = new Date();
    const suAnkiAy = bugun.getMonth();
    const suAnkiYil = bugun.getFullYear();
    
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

        if (islemTarihi >= buHaftaBaslangic) {
            haftaSayi++;
        }

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

    const grafikArr = Object.keys(musteriAnalizi)
        .map(key => ({ name: key, tutar: musteriAnalizi[key] }))
        .sort((a, b) => b.tutar - a.tutar)
        .slice(0, 5);
        
    setGrafikVerisi(grafikArr);
  };

  // 🔥 YENİ: ARAMA FİLTRESİ
  const filtrelenmisKayitlar = kayitlar.filter(item => {
      if (!aramaMetni) return true; // Arama yoksa hepsini göster
      
      const aranan = aramaMetni.toLocaleLowerCase('tr-TR');
      
      const musteri = item.customer_text?.toLocaleLowerCase('tr-TR') || '';
      const aciklama = item.description?.toLocaleLowerCase('tr-TR') || '';
      const teknisyen = item.technician?.toLocaleLowerCase('tr-TR') || '';
      const yetkili = item.customer_rep?.toLocaleLowerCase('tr-TR') || '';

      return musteri.includes(aranan) || aciklama.includes(aranan) || teknisyen.includes(aranan) || yetkili.includes(aranan);
  });

  // --- MALZEME İŞLEMLERİ ---
  const malzemeSecildi = (e: any) => {
      const id = e.target.value;
      setSecilenMalzemeId(id);
      const bulunan = stokMalzemeleri.find(m => m.id === id);
      if(bulunan) setTempMalzemeFiyat(bulunan.sale_price); else setTempMalzemeFiyat("");
  };

  const malzemeEkle = () => {
      if(!secilenMalzemeId || !tempMalzemeFiyat) return alert("Lütfen malzeme seçin ve fiyatı kontrol edin.");
      const bulunan = stokMalzemeleri.find(m => m.id === secilenMalzemeId);
      const yeni = { id: Date.now(), ad: bulunan ? bulunan.name : "Bilinmeyen", fiyat: parseFloat(tempMalzemeFiyat) };
      setMalzemeListesi([...malzemeListesi, yeni]);
      setSecilenMalzemeId(""); setTempMalzemeFiyat("");
  };

  const malzemeSil = (id: number) => {
      setMalzemeListesi(malzemeListesi.filter(m => m.id !== id));
  };

  // --- KAYDET / GÜNCELLE ---
  const kaydetVeyaGuncelle = async () => {
    if (!yeniKayit.customer_text || !yeniKayit.price) return alert("Lütfen Müşteri Adı ve Fiyat alanlarını doldurunuz.");
    setYukleniyor(true);

    const veriPaketi = {
        ...yeniKayit,
        work_hours: yeniKayit.work_hours ? Number(yeniKayit.work_hours) : 0,
        materials: malzemeListesi
    };

    let error;
    if (duzenlemeId) {
        const response = await supabase.from('completed_services').update(veriPaketi).eq('id', duzenlemeId);
        error = response.error;
    } else {
        const response = await supabase.from('completed_services').insert([veriPaketi]);
        error = response.error;
    }
    
    if (error) alert("Bir hata oluştu: " + error.message);
    else {
        alert(duzenlemeId ? "Kayıt başarıyla güncellendi! ✅" : "Yeni işlem başarıyla eklendi! ✅");
        formuSifirla();
        verileriGetir();
    }
    setYukleniyor(false);
  };

  const duzenle = (e: any, kayit: any) => {
      e.stopPropagation(); 
      setDuzenlemeId(kayit.id);
      
      const eskiMalzemeler = kayit.materials && Array.isArray(kayit.materials) ? kayit.materials : [];
      setMalzemeListesi(eskiMalzemeler);

      setYeniKayit({
          service_date: kayit.service_date,
          customer_text: kayit.customer_text || '', company_address: kayit.company_address || '',
          customer_rep: kayit.customer_rep || '', crane_capacity: kayit.crane_capacity || '',
          service_type: kayit.service_type || 'Servis', work_hours: kayit.work_hours || '',
          description: kayit.description || '', price: kayit.price || '', technician: kayit.technician || ''
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formuSifirla = () => {
      setDuzenlemeId(null);
      setMalzemeListesi([]);
      setYeniKayit({
          service_date: new Date().toISOString().split('T')[0],
          customer_text: '', company_address: '', customer_rep: '', crane_capacity: '',
          service_type: 'Servis', work_hours: '', description: '', 
          price: '', technician: 'Genel Servis'
      });
  };

  const sil = async (e: any, id: string) => {
    e.stopPropagation();
    if(!confirm("Bu kaydı kalıcı olarak silmek istediğinize emin misiniz?")) return;
    await supabase.from('completed_services').delete().eq('id', id);
    verileriGetir();
    if (seciliKayit?.id === id) setSeciliKayit(null);
  }

  const tipRengi = (tip: string) => {
      if(tip === 'Periyodik Bakım') return 'bg-purple-100 text-purple-700 border-purple-200';
      if(tip === 'Garanti') return 'bg-green-100 text-green-700 border-green-200';
      if(tip === 'Servis') return 'bg-blue-100 text-blue-700 border-blue-200';
      if(tip === 'Montaj') return 'bg-orange-100 text-orange-700 border-orange-200';
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }

  const malzemeToplami = malzemeListesi.reduce((acc, curr) => acc + curr.fiyat, 0);

  if (yukleniyor && kayitlar.length === 0) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-blue-600 w-10 h-10"/></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-24 relative font-sans">
      
      {/* 1. ÜST BAŞLIK */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 md:mb-8">
        <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">📊 Servis Yönetim Paneli</h1>
            <p className="text-slate-500 text-xs md:text-sm">Finansal analiz, servis dökümü ve iş takibi.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <Link href="/admin/malzemeler" className="flex-1 md:flex-none text-center bg-yellow-50 text-yellow-700 border border-yellow-200 px-4 py-2 rounded-xl text-sm font-bold hover:bg-yellow-100 transition flex items-center justify-center gap-2">
                <Package size={16}/> Depo
            </Link>
            <Link href="/admin" className="flex-1 md:flex-none text-center bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition">
                Panele Dön
            </Link>
        </div>
      </div>

      {/* 2. İSTATİSTİKLER */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-slate-100"><div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Toplam Ciro</div><div className="text-lg md:text-xl font-black text-slate-800">{istatistik.toplamCiro.toLocaleString('tr-TR')} ₺</div></div>
        <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-slate-100"><div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Bu Ay Ciro</div><div className="text-lg md:text-xl font-black text-slate-800">{istatistik.buAyCiro.toLocaleString('tr-TR')} ₺</div></div>
        <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-slate-100"><div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Haftalık Servis</div><div className="text-lg md:text-xl font-black text-slate-800">{istatistik.buHaftaIslem} Adet</div></div>
        <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-slate-100"><div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Aylık Servis</div><div className="text-lg md:text-xl font-black text-slate-800">{istatistik.buAyIslem} Adet</div></div>
      </div>

      {/* 3. ANA IZGARA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* SOL: FORM */}
        <div className={`lg:col-span-1 p-5 md:p-6 rounded-2xl shadow-lg border h-fit lg:sticky lg:top-6 transition-all ${duzenlemeId ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-100'}`}>
            <h2 className={`text-lg font-bold mb-4 flex items-center gap-2 ${duzenlemeId ? 'text-orange-700' : 'text-slate-800'}`}>
                {duzenlemeId ? <Edit2 className="w-5 h-5"/> : <Plus className="w-5 h-5 bg-slate-800 text-white rounded-full p-1"/>}
                {duzenlemeId ? 'Kaydı Düzenle' : 'Yeni İşlem Ekle'}
            </h2>
            
            <div className="space-y-3">
                <div className="p-3 bg-white/50 rounded-xl border border-slate-200/50 space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Müşteri Bilgileri</span>
                    <input type="date" value={yeniKayit.service_date} onChange={e => setYeniKayit({...yeniKayit, service_date: e.target.value})} className="w-full p-2 bg-white rounded-lg border text-sm font-bold"/>
                    <input type="text" placeholder="Firma Adı" value={yeniKayit.customer_text} onChange={e => setYeniKayit({...yeniKayit, customer_text: e.target.value})} className="w-full p-2 bg-white rounded-lg border text-sm font-bold"/>
                    <input type="text" placeholder="Adres" value={yeniKayit.company_address} onChange={e => setYeniKayit({...yeniKayit, company_address: e.target.value})} className="w-full p-2 bg-white rounded-lg border text-xs"/>
                    <input type="text" placeholder="Yetkili Kişi" value={yeniKayit.customer_rep} onChange={e => setYeniKayit({...yeniKayit, customer_rep: e.target.value})} className="w-full p-2 bg-white rounded-lg border text-xs"/>
                </div>

                <div className="p-3 bg-white/50 rounded-xl border border-slate-200/50 space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">İşlem Detayları</span>
                    <div className="flex flex-col md:flex-row gap-2">
                         <select value={yeniKayit.service_type} onChange={e => setYeniKayit({...yeniKayit, service_type: e.target.value})} className="flex-1 p-2 bg-white rounded-lg border text-xs font-bold"><option>Servis</option><option>Periyodik Bakım</option><option>Garanti</option><option>Montaj</option><option>Diğer</option></select>
                         <input type="text" placeholder="Kapasite" value={yeniKayit.crane_capacity} onChange={e => setYeniKayit({...yeniKayit, crane_capacity: e.target.value})} className="flex-1 p-2 bg-white rounded-lg border text-xs"/>
                    </div>
                    <textarea rows={2} placeholder="Arıza / İşlem Açıklaması..." value={yeniKayit.description} onChange={e => setYeniKayit({...yeniKayit, description: e.target.value})} className="w-full p-2 bg-white rounded-lg border text-sm"/>
                </div>

                <div className="p-3 bg-yellow-50 rounded-xl border border-yellow-100 space-y-3">
                    <span className="text-[10px] font-bold text-yellow-600 uppercase tracking-wider flex items-center gap-1"><Box size={12}/> Malzeme Deposu</span>
                    <div className="flex gap-2 items-center">
                        <select value={secilenMalzemeId} onChange={malzemeSecildi} className="w-full md:flex-[2] p-2 bg-white rounded-lg border border-yellow-200 text-xs font-bold text-slate-700 outline-none">
                            <option value="">Malzeme Seçiniz...</option>
                            {stokMalzemeleri.map(m => (<option key={m.id} value={m.id}>{m.name}</option>))}
                        </select>
                        <div className="flex gap-2 w-full md:w-auto">
                            <input type="number" placeholder="Fiyat" value={tempMalzemeFiyat} onChange={e => setTempMalzemeFiyat(e.target.value)} className="flex-1 p-2 bg-white rounded-lg border border-yellow-200 text-xs font-bold"/>
                            <button onClick={malzemeEkle} className="bg-yellow-500 hover:bg-yellow-600 text-white p-2 rounded-lg transition"><Plus size={16}/></button>
                        </div>
                    </div>
                    {malzemeListesi.length > 0 && (
                        <div className="max-h-[150px] overflow-y-auto bg-white rounded-lg border border-yellow-100 p-2 space-y-1">
                            {malzemeListesi.map((m) => (
                                <div key={m.id} className="flex justify-between items-center text-xs p-1.5 bg-slate-50 rounded hover:bg-slate-100"><span className="font-medium text-slate-700">{m.ad}</span><div className="flex items-center gap-2"><span className="font-bold text-slate-900">{Number(m.fiyat).toLocaleString()} ₺</span><button onClick={() => malzemeSil(m.id)} className="text-red-400 hover:text-red-600"><X size={12}/></button></div></div>
                            ))}
                            <div className="text-right text-[10px] font-bold text-yellow-700 pt-1 border-t border-slate-100">Toplam: {malzemeToplami.toLocaleString()} ₺</div>
                        </div>
                    )}
                </div>

                <div className="p-3 bg-white/50 rounded-xl border border-slate-200/50 space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fiyat & Ekip</span>
                    <div className="flex gap-2">
                        <div className="flex-1 relative"><span className="absolute left-3 top-2 text-slate-400 text-xs">₺</span><input type="number" placeholder="Toplam Fiyat" value={yeniKayit.price} onChange={e => setYeniKayit({...yeniKayit, price: e.target.value})} className="w-full pl-6 p-2 bg-white rounded-lg border text-sm font-bold"/></div>
                        <input type="number" placeholder="Saat" value={yeniKayit.work_hours} onChange={e => setYeniKayit({...yeniKayit, work_hours: e.target.value})} className="flex-1 p-2 bg-white rounded-lg border text-xs"/>
                    </div>
                    <input type="text" placeholder="Teknisyenler" value={yeniKayit.technician} onChange={e => setYeniKayit({...yeniKayit, technician: e.target.value})} className="w-full p-2 bg-white rounded-lg border text-xs"/>
                </div>

                <div className="flex gap-2">
                    {duzenlemeId && <button onClick={formuSifirla} className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold rounded-xl transition text-xs"><RotateCcw size={18}/> VAZGEÇ</button>}
                    <button onClick={kaydetVeyaGuncelle} disabled={yukleniyor} className={`flex-[2] py-3 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg text-xs md:text-sm ${duzenlemeId ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                        {yukleniyor ? <Loader2 className="animate-spin"/> : duzenlemeId ? <><Save size={18}/> GÜNCELLE</> : <><Save size={18}/> KAYDET</>}
                    </button>
                </div>
            </div>
        </div>

        {/* SAĞ TARAF: GRAFİK VE LİSTE */}
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100 hidden md:block">
                <h3 className="text-sm font-bold text-slate-500 mb-6 uppercase">Gelir Grafiği (Top 5)</h3>
                <div className="h-[200px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={grafikVerisi}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="name" tick={{fontSize: 10}} /><YAxis width={60} /><Tooltip /><Bar dataKey="tutar" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Gelir (TL)" /></BarChart></ResponsiveContainer></div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 border-b border-slate-100 font-bold text-slate-700 flex flex-col md:flex-row justify-between gap-4 items-center">
                    <span className="flex items-center gap-2">📜 Son İşlemler <span className="text-[10px] md:text-xs text-slate-400 font-normal hidden md:inline">(Detay için tıkla)</span></span>
                    
                    {/* 🔥 YENİ: ARAMA ÇUBUĞU BURADA 🔥 */}
                    <div className="w-full md:w-1/2 relative">
                        <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                        <input 
                            type="text" 
                            placeholder="Ara: Müşteri, Teknisyen..." 
                            value={aramaMetni}
                            onChange={(e) => setAramaMetni(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
                        />
                        {aramaMetni && (
                            <button onClick={() => setAramaMetni("")} className="absolute right-3 top-2.5 text-slate-400 hover:text-red-500">
                                <X size={14}/>
                            </button>
                        )}
                    </div>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap md:whitespace-normal">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] md:text-xs">
                            <tr><th className="p-3 md:p-4">Tarih</th><th className="p-3 md:p-4">Müşteri</th><th className="p-3 md:p-4 hidden md:table-cell">İşlem</th><th className="p-3 md:p-4">Tip</th><th className="p-3 md:p-4">Tutar</th><th className="p-3 md:p-4 text-right">İşlem</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {/* 🔥 FİLTRELENMİŞ LİSTE GÖSTERİLİYOR 🔥 */}
                            {filtrelenmisKayitlar.map((item) => (
                                <tr key={item.id} onClick={() => setSeciliKayit(item)} className={`transition cursor-pointer group ${duzenlemeId === item.id ? 'bg-orange-50' : 'hover:bg-blue-50'}`}>
                                    <td className="p-3 md:p-4 font-mono text-slate-500 text-[10px] md:text-xs">{new Date(item.service_date).toLocaleDateString('tr-TR')}</td>
                                    <td className="p-3 md:p-4"><div className="font-bold text-slate-800 text-xs md:text-sm group-hover:text-blue-600 truncate max-w-[120px]">{item.customer_text}</div><div className="text-[10px] text-slate-400">{item.customer_rep || '-'}</div></td>
                                    <td className="p-3 md:p-4 text-slate-600 truncate max-w-[100px] hidden md:table-cell">{item.description}</td>
                                    <td className="p-3 md:p-4"><span className={`text-[10px] font-bold px-2 py-1 rounded border ${tipRengi(item.service_type)}`}>{item.service_type}</span></td>
                                    <td className="p-3 md:p-4 font-bold text-green-600 text-xs md:text-sm">{Number(item.price).toLocaleString('tr-TR')} ₺</td>
                                    <td className="p-3 md:p-4 text-right"><div className="flex justify-end gap-1"><button onClick={(e) => duzenle(e, item)} className="text-blue-400 hover:bg-blue-50 p-2 rounded-lg transition"><Edit2 size={16}/></button><button onClick={(e) => sil(e, item.id)} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition"><Trash2 size={16}/></button></div></td>
                                </tr>
                            ))}
                            {filtrelenmisKayitlar.length === 0 && (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-400 text-sm">Aradığınız kriterlere uygun kayıt bulunamadı.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      </div>

      {/* --- DETAY MODALI (POP-UP) --- */}
      <AnimatePresence>
        {seciliKayit && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setSeciliKayit(null)}>
                <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="bg-white w-[95%] md:w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="bg-slate-900 text-white p-4 md:p-6 flex justify-between items-start shrink-0">
                        <div>
                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 mb-1"><h2 className="text-lg md:text-2xl font-bold">{seciliKayit.customer_text}</h2><span className={`text-[10px] md:text-xs font-bold px-2 py-0.5 rounded bg-white/20 text-white w-fit`}>{seciliKayit.service_type}</span></div>
                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-slate-400 text-[10px] md:text-xs"><span className="flex items-center gap-1"><MapPin size={12}/> {seciliKayit.company_address || '-'}</span><span className="flex items-center gap-1"><User size={12}/> {seciliKayit.customer_rep || '-'}</span></div>
                        </div>
                        <button onClick={() => setSeciliKayit(null)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition"><X size={20}/></button>
                    </div>

                    <div className="p-4 md:p-6 space-y-4 md:space-y-6 overflow-y-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-3 md:p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="text-[10px] md:text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1"><Wrench size={12}/> Teknik Detaylar</div>
                                <div className="space-y-1 text-xs md:text-sm text-slate-700"><div><span className="font-bold">Kapasite:</span> {seciliKayit.crane_capacity || '-'}</div><div><span className="font-bold">Süre:</span> {seciliKayit.work_hours} Saat</div><div><span className="font-bold">Ekip:</span> {seciliKayit.technician}</div></div>
                            </div>
                            <div className="p-3 md:p-4 bg-green-50 rounded-xl border border-green-100">
                                <div className="text-[10px] md:text-xs font-bold text-green-600 uppercase mb-1 flex items-center gap-1"><DollarSign size={12}/> Toplam Bedel</div>
                                <div className="text-2xl md:text-3xl font-black text-green-700">{Number(seciliKayit.price).toLocaleString('tr-TR')} ₺</div>
                                <div className="text-[10px] md:text-xs text-green-600 mt-1 font-bold">{new Date(seciliKayit.service_date).toLocaleDateString('tr-TR')}</div>
                            </div>
                        </div>

                        <div><h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2"><FileText size={16}/> İşlem Detayı</h3><div className="bg-slate-50 p-4 rounded-xl text-xs md:text-sm text-slate-600 leading-relaxed border border-slate-100">{seciliKayit.description}</div></div>

                        {/* 🔥 YENİ: MODAL İÇİNDE MALZEME TABLOSU 🔥 */}
                        {seciliKayit.materials && Array.isArray(seciliKayit.materials) && seciliKayit.materials.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2"><Box size={16}/> Kullanılan Malzemeler</h3>
                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-xs md:text-sm">
                                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                                            <tr><th className="p-3 text-left">Malzeme Adı</th><th className="p-3 text-right">Fiyat</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {seciliKayit.materials.map((m: any, i: number) => (
                                                <tr key={i}><td className="p-3 text-slate-700">{m.ad}</td><td className="p-3 text-right font-bold text-slate-900">{Number(m.fiyat).toLocaleString()} ₺</td></tr>
                                            ))}
                                            <tr className="bg-yellow-50"><td className="p-3 font-bold text-yellow-800">TOPLAM MALZEME</td><td className="p-3 text-right font-black text-yellow-800">{seciliKayit.materials.reduce((a:any, b:any) => a + Number(b.fiyat), 0).toLocaleString()} ₺</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                        
                        {/* Yedek: Eski text formatı varsa göster */}
                        {seciliKayit.materials_text && (!seciliKayit.materials || seciliKayit.materials.length === 0) && (
                             <div className="bg-yellow-50 p-4 rounded-xl text-xs md:text-sm text-slate-700 font-mono whitespace-pre-line border border-yellow-100">{seciliKayit.materials_text}</div>
                        )}
                    </div>
                    
                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 shrink-0">
                        <button onClick={(e) => { setSeciliKayit(null); duzenle(e, seciliKayit); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition flex items-center gap-2 text-xs md:text-sm"><Edit2 size={14}/> Düzenle</button>
                        <button onClick={() => setSeciliKayit(null)} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 font-bold hover:bg-slate-100 transition text-xs md:text-sm">Kapat</button>
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}