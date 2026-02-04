"use client";

// ----------------------------------------------------------------------------
// BUVISAN SERVİS YÖNETİM PANELİ - PRO ANALİZ MODÜLÜ 🛠️
// Versiyon: 5.0 (Modal Form + Ferah Arayüz + Stok Entegrasyonu)
// ----------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Loader2, Plus, TrendingUp, DollarSign, Calendar, Save, Trash2, 
  Briefcase, User, MapPin, Clock, Wrench, FileText, X, Box, Edit2, RotateCcw, 
  Package, Search, AlertCircle
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

export default function AnalizSayfasi() {
  
  // ==========================================================================
  // 1. STATE (DURUM) YÖNETİMİ
  // ==========================================================================
  
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kayitlar, setKayitlar] = useState<any[]>([]);
  const [stokMalzemeleri, setStokMalzemeleri] = useState<any[]>([]); 
  
  const [aramaMetni, setAramaMetni] = useState("");
  
  // MODAL KONTROLLERİ
  const [seciliKayit, setSeciliKayit] = useState<any | null>(null); // Detay Modalı
  const [formAcik, setFormAcik] = useState(false); // 🔥 YENİ: Form Modalı Açık mı?
  const [duzenlemeId, setDuzenlemeId] = useState<string | null>(null); // Düzenleme Modu ID

  const [istatistik, setIstatistik] = useState({
    toplamCiro: 0, buAyCiro: 0, toplamIslem: 0, buHaftaIslem: 0, buAyIslem: 0
  });
  
  const [grafikVerisi, setGrafikVerisi] = useState<any[]>([]);

  // --- MALZEME YÖNETİMİ (Sepet Mantığı) ---
  const [malzemeListesi, setMalzemeListesi] = useState<{id: number, ad: string, adet: number, birim_fiyat: number, toplam_fiyat: number}[]>([]);
  const [secilenMalzemeId, setSecilenMalzemeId] = useState(""); 
  const [tempAdet, setTempAdet] = useState("1");
  const [tempBirimFiyat, setTempBirimFiyat] = useState(""); 

  // --- FORM VERİLERİ ---
  const [yeniKayit, setYeniKayit] = useState({
    service_date: new Date().toISOString().split('T')[0],
    customer_text: '', company_address: '', customer_rep: '',    
    crane_capacity: '', service_type: 'Servis', 
    work_hours: '', description: '', 
    price: '', technician: 'Genel Servis'
  });

  // ==========================================================================
  // 2. VERİ ÇEKME
  // ==========================================================================

  useEffect(() => {
    tumVerileriGetir();
  }, []);

  const tumVerileriGetir = async () => {
    try {
        const { data: servisData } = await supabase.from('completed_services').select('*').order('service_date', { ascending: false });
        if (servisData) { setKayitlar(servisData); hesaplamalariYap(servisData); }

        const { data: stokData } = await supabase.from('materials').select('*').order('name', { ascending: true });
        if (stokData) setStokMalzemeleri(stokData);
    } catch (error) {
        console.error("Veri hatası", error);
    } finally {
        setYukleniyor(false);
    }
  };

  // ==========================================================================
  // 3. HESAPLAMALAR
  // ==========================================================================

  const hesaplamalariYap = (data: any[]) => {
    const bugun = new Date();
    const suAnkiAy = bugun.getMonth();
    const suAnkiYil = bugun.getFullYear();
    const buHaftaBaslangic = new Date(bugun);
    const day = buHaftaBaslangic.getDay();
    const diff = buHaftaBaslangic.getDate() - day + (day === 0 ? -6 : 1); 
    buHaftaBaslangic.setDate(diff);
    buHaftaBaslangic.setHours(0,0,0,0);

    let topCiro = 0, ayCiro = 0, haftaSayi = 0, aySayi = 0;
    const musteriAnalizi: any = {};

    data.forEach(item => {
        const fiyat = Number(item.price) || 0;
        const islemTarihi = new Date(item.service_date);
        topCiro += fiyat;

        if (islemTarihi.getMonth() === suAnkiAy && islemTarihi.getFullYear() === suAnkiYil) { ayCiro += fiyat; aySayi++; }
        if (islemTarihi >= buHaftaBaslangic) { haftaSayi++; }

        const musteri = item.customer_text || 'Bilinmeyen';
        musteriAnalizi[musteri] = (musteriAnalizi[musteri] || 0) + fiyat;
    });

    setIstatistik({ toplamCiro: topCiro, buAyCiro: ayCiro, toplamIslem: data.length, buHaftaIslem: haftaSayi, buAyIslem: aySayi });
    const grafikArr = Object.keys(musteriAnalizi).map(key => ({ name: key, tutar: musteriAnalizi[key] })).sort((a, b) => b.tutar - a.tutar).slice(0, 5);
    setGrafikVerisi(grafikArr);
  };

  // ==========================================================================
  // 4. MALZEME FONKSİYONLARI
  // ==========================================================================

  const malzemeSecildi = (e: any) => {
      const id = e.target.value;
      setSecilenMalzemeId(id);
      const bulunan = stokMalzemeleri.find(m => m.id === id);
      if (bulunan) setTempBirimFiyat(bulunan.sale_price); else setTempBirimFiyat("");
  };

  const malzemeEkle = () => {
      if(!secilenMalzemeId || !tempBirimFiyat || !tempAdet) return alert("Bilgileri kontrol edin.");
      const bulunan = stokMalzemeleri.find(m => m.id === secilenMalzemeId);
      const adet = parseFloat(tempAdet);
      const birimFiyat = parseFloat(tempBirimFiyat);
      
      const yeniMalzemeSatiri = {
          id: Date.now(),
          ad: bulunan ? bulunan.name : "Bilinmeyen Malzeme",
          adet: adet,
          birim_fiyat: birimFiyat,
          toplam_fiyat: adet * birimFiyat
      };
      setMalzemeListesi([...malzemeListesi, yeniMalzemeSatiri]);
      setSecilenMalzemeId(""); setTempAdet("1"); setTempBirimFiyat("");
  };

  const malzemeSil = (id: number) => { setMalzemeListesi(malzemeListesi.filter(m => m.id !== id)); };
  const sepetToplami = malzemeListesi.reduce((acc, curr) => acc + curr.toplam_fiyat, 0);

  // ==========================================================================
  // 5. KAYIT İŞLEMLERİ & MODAL YÖNETİMİ
  // ==========================================================================

  // Yeni Kayıt Modalını Aç
  const yeniKayitAc = () => {
      setDuzenlemeId(null);
      formuSifirla();
      setFormAcik(true);
  };

  // Düzenleme Modalını Aç
  const duzenle = (e: any, kayit: any) => {
      e.stopPropagation();
      setDuzenlemeId(kayit.id);
      const mevcutMalzemeler = kayit.materials && Array.isArray(kayit.materials) ? kayit.materials : [];
      setMalzemeListesi(mevcutMalzemeler);
      setYeniKayit({
          service_date: kayit.service_date,
          customer_text: kayit.customer_text || '', company_address: kayit.company_address || '',
          customer_rep: kayit.customer_rep || '', crane_capacity: kayit.crane_capacity || '',
          service_type: kayit.service_type || 'Servis', work_hours: kayit.work_hours || '',
          description: kayit.description || '', price: kayit.price || '', technician: kayit.technician || ''
      });
      setFormAcik(true); // Modalı aç
  };

  const kaydetVeyaGuncelle = async () => {
    if (!yeniKayit.customer_text || !yeniKayit.price) return alert("Müşteri ve Fiyat zorunludur.");
    setYukleniyor(true);

    const veriPaketi = { ...yeniKayit, work_hours: yeniKayit.work_hours ? Number(yeniKayit.work_hours) : 0, materials: malzemeListesi };

    let error;
    if (duzenlemeId) {
        const response = await supabase.from('completed_services').update(veriPaketi).eq('id', duzenlemeId);
        error = response.error;
    } else {
        const response = await supabase.from('completed_services').insert([veriPaketi]);
        error = response.error;
    }
    
    if (error) alert("Hata: " + error.message);
    else {
        alert(duzenlemeId ? "Güncellendi! ✅" : "Kaydedildi! ✅");
        setFormAcik(false); // Modalı kapat
        formuSifirla();
        tumVerileriGetir();
    }
    setYukleniyor(false);
  };

  const formuSifirla = () => {
      setMalzemeListesi([]);
      setYeniKayit({
          service_date: new Date().toISOString().split('T')[0],
          customer_text: '', company_address: '', customer_rep: '', crane_capacity: '',
          service_type: 'Servis', work_hours: '', description: '', price: '', technician: 'Genel Servis'
      });
  };

  const sil = async (e: any, id: string) => {
    e.stopPropagation();
    if(!confirm("Silmek istediğine emin misin?")) return;
    await supabase.from('completed_services').delete().eq('id', id);
    tumVerileriGetir();
    if (seciliKayit?.id === id) setSeciliKayit(null);
  }

  // Arama Filtresi
  const filtrelenmisKayitlar = kayitlar.filter(item => {
      if (!aramaMetni) return true;
      const aranan = aramaMetni.toLocaleLowerCase('tr-TR');
      return (
          (item.customer_text?.toLocaleLowerCase('tr-TR') || '').includes(aranan) ||
          (item.description?.toLocaleLowerCase('tr-TR') || '').includes(aranan) ||
          (item.technician?.toLocaleLowerCase('tr-TR') || '').includes(aranan)
      );
  });

  const tipRengi = (tip: string) => {
      if(tip === 'Periyodik Bakım') return 'bg-purple-100 text-purple-700 border-purple-200';
      if(tip === 'Garanti') return 'bg-green-100 text-green-700 border-green-200';
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }

  if (yukleniyor && kayitlar.length === 0) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-blue-600 w-10 h-10"/></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-24 relative font-sans">
      
      {/* ÜST BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 md:mb-8">
        <div><h1 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">📊 Servis Yönetim Paneli</h1><p className="text-slate-500 text-xs md:text-sm">Finansal analiz ve servis takibi.</p></div>
        <div className="flex gap-2 w-full md:w-auto">
            {/* 🔥 YENİ KAYIT BUTONU (FORMU AÇAR) */}
            <button 
                onClick={yeniKayitAc}
                className="flex-1 md:flex-none text-center bg-blue-600 text-white border border-blue-700 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
            >
                <Plus size={18}/> Yeni İşlem Ekle
            </button>
            <Link href="/admin/malzemeler" className="flex-1 md:flex-none text-center bg-yellow-50 text-yellow-700 border border-yellow-200 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-yellow-100 transition flex items-center justify-center gap-2"><Package size={18}/> Depo</Link>
            <Link href="/admin" className="flex-1 md:flex-none text-center bg-white border border-slate-200 px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition flex items-center justify-center gap-2"><RotateCcw size={18}/> Panel</Link>
        </div>
      </div>

      {/* İSTATİSTİKLER (Tam Genişlik) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-8">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Toplam Ciro</div><div className="text-xl font-black text-slate-800">{istatistik.toplamCiro.toLocaleString('tr-TR')} ₺</div></div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Bu Ay Ciro</div><div className="text-xl font-black text-slate-800">{istatistik.buAyCiro.toLocaleString('tr-TR')} ₺</div></div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Haftalık Servis</div><div className="text-xl font-black text-slate-800">{istatistik.buHaftaIslem} Adet</div></div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Aylık Servis</div><div className="text-xl font-black text-slate-800">{istatistik.buAyIslem} Adet</div></div>
      </div>

      {/* GRAFİK VE LİSTE (Artık Tam Ekran Genişliğinde) */}
      <div className="space-y-8">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hidden md:block">
                <h3 className="text-sm font-bold text-slate-500 mb-6 uppercase flex items-center gap-2"><TrendingUp size={16}/> En Çok Ciro Yapan 5 Müşteri</h3>
                <div className="h-[250px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={grafikVerisi}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="name" tick={{fontSize: 10}} /><YAxis width={60} /><Tooltip /><Bar dataKey="tutar" fill="#4f46e5" radius={[6, 6, 0, 0]} name="Gelir (TL)" /></BarChart></ResponsiveContainer></div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3"><div className="bg-blue-50 p-2 rounded-lg text-blue-600"><FileText size={20}/></div>
                    <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                Son İşlemler 
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">
                                    {filtrelenmisKayitlar.length} Kayıt
                                </span>
                        </h3><p className="text-xs text-slate-400">Detayları görmek için satıra tıklayın.</p></div></div>
                    <div className="relative w-full md:w-64 group"><Search className="absolute left-3 top-3 text-slate-400 w-4 h-4"/><input type="text" placeholder="Ara: Müşteri, Teknisyen..." value={aramaMetni} onChange={(e) => setAramaMetni(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition"/>{aramaMetni && <button onClick={() => setAramaMetni("")} className="absolute right-3 top-3 text-slate-400 hover:text-red-500"><X size={14}/></button>}</div>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap md:whitespace-normal">
                        <thead className="bg-slate-50/50 text-slate-500 font-bold uppercase text-[10px] md:text-xs tracking-wider">
                            <tr><th className="p-4 pl-6">Tarih</th><th className="p-4">Müşteri</th><th className="p-4 hidden md:table-cell">İşlem</th><th className="p-4">Tutar</th><th className="p-4 text-right pr-6">İşlem</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtrelenmisKayitlar.map((item) => (
                                <tr key={item.id} onClick={() => setSeciliKayit(item)} className="transition-all duration-200 cursor-pointer group hover:bg-blue-50/50">
                                    <td className="p-4 pl-6 font-mono text-slate-500 text-xs">{new Date(item.service_date).toLocaleDateString('tr-TR')}</td>
                                    <td className="p-4"><div className="font-bold text-slate-800 text-sm">{item.customer_text}</div><div className="text-[10px] text-slate-400">{item.customer_rep}</div></td>
                                    <td className="p-4 text-slate-600 text-xs hidden md:table-cell max-w-[200px] truncate">{item.description}</td>
                                    <td className="p-4 font-black text-green-600 text-sm">{Number(item.price).toLocaleString('tr-TR')} ₺</td>
                                    <td className="p-4 text-right pr-6"><div className="flex justify-end gap-2"><button onClick={(e) => duzenle(e, item)} className="p-2 text-blue-400 bg-blue-50 rounded-lg hover:bg-blue-600 hover:text-white transition"><Edit2 size={16}/></button><button onClick={(e) => sil(e, item.id)} className="p-2 text-red-400 bg-red-50 rounded-lg hover:bg-red-600 hover:text-white transition"><Trash2 size={16}/></button></div></td>
                                </tr>
                            ))}
                            {filtrelenmisKayitlar.length === 0 && <tr><td colSpan={5} className="p-12 text-center text-slate-400"><div className="flex flex-col items-center gap-2"><AlertCircle size={32} className="opacity-20"/><p className="text-sm font-medium">Kayıt bulunamadı.</p></div></td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
      </div>

      {/* =========================================================================
          🔥 FORM MODALI (YENİ EKLEME VE DÜZENLEME PENCERESİ) 🔥
         ========================================================================= */}
      <AnimatePresence>
        {formAcik && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setFormAcik(false)}>
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    
                    {/* MODAL BAŞLIK */}
                    <div className={`p-6 flex justify-between items-center shrink-0 ${duzenlemeId ? 'bg-orange-50 border-b border-orange-100' : 'bg-blue-50 border-b border-blue-100'}`}>
                        <h2 className={`text-xl font-bold flex items-center gap-3 ${duzenlemeId ? 'text-orange-700' : 'text-blue-700'}`}>
                            {duzenlemeId ? <Edit2 className="w-6 h-6"/> : <Plus className="w-6 h-6"/>}
                            {duzenlemeId ? 'Kayıt Düzenle' : 'Yeni İşlem Ekle'}
                        </h2>
                        <button onClick={() => setFormAcik(false)} className="bg-white/50 hover:bg-white p-2 rounded-full transition"><X size={24} className="text-slate-500"/></button>
                    </div>

                    {/* FORM İÇERİĞİ (SCROLLABLE) */}
                    <div className="p-6 space-y-6 overflow-y-auto">
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><User size={12}/> Müşteri Bilgileri</span>
                                <input type="date" value={yeniKayit.service_date} onChange={e => setYeniKayit({...yeniKayit, service_date: e.target.value})} className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold"/>
                                <input type="text" placeholder="Firma Adı (Örn: Buvisan)" value={yeniKayit.customer_text} onChange={e => setYeniKayit({...yeniKayit, customer_text: e.target.value})} className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold"/>
                                <input type="text" placeholder="Firma Adresi" value={yeniKayit.company_address} onChange={e => setYeniKayit({...yeniKayit, company_address: e.target.value})} className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs"/>
                                <input type="text" placeholder="Yetkili Kişi" value={yeniKayit.customer_rep} onChange={e => setYeniKayit({...yeniKayit, customer_rep: e.target.value})} className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs"/>
                            </div>

                            <div className="space-y-4">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><Wrench size={12}/> İşlem Detayları</span>
                                <div className="flex gap-2">
                                    <select value={yeniKayit.service_type} onChange={e => setYeniKayit({...yeniKayit, service_type: e.target.value})} className="flex-1 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold"><option>Servis</option><option>Periyodik Bakım</option><option>Garanti</option><option>Montaj</option><option>Diğer</option></select>
                                    <input type="text" placeholder="Kapasite" value={yeniKayit.crane_capacity} onChange={e => setYeniKayit({...yeniKayit, crane_capacity: e.target.value})} className="flex-1 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs"/>
                                </div>
                                <textarea rows={4} placeholder="Yapılan işlemi detaylıca yazın..." value={yeniKayit.description} onChange={e => setYeniKayit({...yeniKayit, description: e.target.value})} className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm resize-none"/>
                            </div>
                        </div>

                        {/* Malzeme Alanı */}
                        <div className="p-4 bg-yellow-50 rounded-2xl border border-yellow-200 space-y-4">
                            <span className="text-[10px] font-bold text-yellow-700 uppercase tracking-wider flex items-center gap-2"><Box size={12}/> Malzemeler</span>
                            <div className="flex flex-col md:flex-row gap-2 items-center">
                                <select value={secilenMalzemeId} onChange={malzemeSecildi} className="w-full p-3 bg-white rounded-xl border border-yellow-300 text-xs font-bold text-slate-700"><option value="">Malzeme Seç...</option>{stokMalzemeleri.map(m => (<option key={m.id} value={m.id}>{m.name}</option>))}</select>
                                <div className="flex gap-2 w-full md:w-auto">
                                    <div className="relative w-20"><input type="number" placeholder="Adet" value={tempAdet} onChange={e => setTempAdet(e.target.value)} className="w-full p-3 bg-white rounded-xl border border-yellow-300 text-xs font-bold text-center"/><span className="absolute right-1 top-3 text-[9px] text-slate-400">Adet</span></div>
                                    <div className="relative flex-1"><span className="absolute left-3 top-3 text-slate-400 text-xs">₺</span><input type="number" placeholder="Fiyat" value={tempBirimFiyat} onChange={e => setTempBirimFiyat(e.target.value)} className="w-full pl-6 p-3 bg-white rounded-xl border border-yellow-300 text-xs font-bold"/></div>
                                    <button onClick={malzemeEkle} className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 rounded-xl shadow-lg shadow-yellow-200"><Plus size={20}/></button>
                                </div>
                            </div>
                            {malzemeListesi.length > 0 && (
                                <div className="bg-white rounded-xl border border-yellow-200 overflow-hidden">
                                    {malzemeListesi.map((m) => (
                                        <div key={m.id} className="flex justify-between items-center text-xs p-2 border-b border-slate-50 last:border-0 hover:bg-slate-50">
                                            <div><span className="font-bold text-slate-700">{m.ad}</span> <span className="text-slate-400 ml-2">({m.adet} x {m.birim_fiyat} ₺)</span></div>
                                            <div className="flex items-center gap-3"><span className="font-mono font-bold text-slate-900">{Number(m.toplam_fiyat).toLocaleString()} ₺</span><button onClick={() => malzemeSil(m.id)} className="text-red-300 hover:text-red-500"><X size={14}/></button></div>
                                        </div>
                                    ))}
                                    <div className="bg-yellow-100 p-2 text-right text-xs font-bold text-yellow-800">Toplam: {sepetToplami.toLocaleString()} ₺</div>
                                </div>
                            )}
                        </div>

                        {/* Fiyat Alanı */}
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                            <div className="flex gap-3">
                                <div className="flex-1 relative"><span className="absolute left-3 top-3 text-slate-400 text-sm">₺</span><input type="number" placeholder="Genel Toplam Tutar" value={yeniKayit.price} onChange={e => setYeniKayit({...yeniKayit, price: e.target.value})} className="w-full pl-7 p-3 bg-white rounded-xl border border-slate-200 text-sm font-black text-green-700"/></div>
                                <div className="w-1/3 relative"><input type="number" placeholder="Saat" value={yeniKayit.work_hours} onChange={e => setYeniKayit({...yeniKayit, work_hours: e.target.value})} className="w-full p-3 bg-white rounded-xl border border-slate-200 text-xs text-center"/><span className="absolute right-3 top-3 text-slate-300 text-xs">Sa</span></div>
                            </div>
                            <input type="text" placeholder="Teknisyenler (Ahmet, Mehmet)" value={yeniKayit.technician} onChange={e => setYeniKayit({...yeniKayit, technician: e.target.value})} className="w-full p-3 bg-white rounded-xl border border-slate-200 text-xs"/>
                        </div>

                    </div>

                    {/* MODAL FOOTER */}
                    <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0">
                        <button onClick={() => setFormAcik(false)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition">Vazgeç</button>
                        <button onClick={kaydetVeyaGuncelle} className={`flex-[2] py-3 text-white font-bold rounded-xl hover:shadow-lg transition ${duzenlemeId ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                            {duzenlemeId ? 'Kaydı Güncelle' : 'Kaydet ve Tamamla'}
                        </button>
                    </div>

                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* =========================================================================
          DETAY MODALI (POP-UP PENCERE) - MEVCUT DURUMU KORUNDU
         ========================================================================= */}
      <AnimatePresence>
        {seciliKayit && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setSeciliKayit(null)}>
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-[95%] md:w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="bg-slate-900 text-white p-6 flex justify-between items-start shrink-0">
                        <div>
                            <div className="flex items-center gap-3 mb-2"><h2 className="text-2xl font-bold">{seciliKayit.customer_text}</h2><span className="text-xs font-bold px-3 py-1 rounded-full bg-white/10">{seciliKayit.service_type}</span></div>
                            <div className="flex gap-4 text-slate-400 text-xs"><span className="flex items-center gap-1"><MapPin size={14}/> {seciliKayit.company_address}</span><span className="flex items-center gap-1"><User size={14}/> {seciliKayit.customer_rep}</span></div>
                        </div>
                        <button onClick={() => setSeciliKayit(null)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition"><X size={24}/></button>
                    </div>

                    <div className="p-6 space-y-6 overflow-y-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100"><div className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2"><Wrench size={14}/> Teknik</div><div className="space-y-2 text-sm text-slate-700"><div className="flex justify-between border-b pb-1"><span>Kapasite:</span> <b>{seciliKayit.crane_capacity}</b></div><div className="flex justify-between border-b pb-1"><span>Süre:</span> <b>{seciliKayit.work_hours} Saat</b></div><div className="flex justify-between"><span>Ekip:</span> <b>{seciliKayit.technician}</b></div></div></div>
                            <div className="p-4 bg-green-50 rounded-2xl border border-green-100 flex flex-col justify-center"><div className="text-xs font-bold text-green-600 uppercase mb-2 flex items-center gap-2"><DollarSign size={14}/> Tutar</div><div className="text-3xl font-black text-green-700">{Number(seciliKayit.price).toLocaleString('tr-TR')} ₺</div><div className="text-xs text-green-600/70 mt-1">{new Date(seciliKayit.service_date).toLocaleDateString('tr-TR')}</div></div>
                        </div>

                        <div><h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><FileText size={18}/> Detay</h3><div className="bg-slate-50 p-5 rounded-2xl text-sm text-slate-600">{seciliKayit.description}</div></div>

                        {/* ADETLİ MALZEME TABLOSU */}
                        {seciliKayit.materials && Array.isArray(seciliKayit.materials) && seciliKayit.materials.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Box size={18} className="text-yellow-600"/> Kullanılan Malzemeler</h3>
                                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                                            <tr><th className="p-3 text-left pl-4">Malzeme</th><th className="p-3 text-center">Adet</th><th className="p-3 text-right">Birim</th><th className="p-3 text-right pr-4">Toplam</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {seciliKayit.materials.map((m: any, i: number) => (
                                                <tr key={i}>
                                                    <td className="p-3 pl-4 text-slate-700 font-medium">{m.ad}</td>
                                                    <td className="p-3 text-center text-slate-500">{m.adet}</td>
                                                    <td className="p-3 text-right text-slate-400 text-xs">{Number(m.birim_fiyat).toLocaleString()} ₺</td>
                                                    <td className="p-3 pr-4 text-right font-bold text-slate-900">{Number(m.toplam_fiyat).toLocaleString()} ₺</td>
                                                </tr>
                                            ))}
                                            <tr className="bg-yellow-50"><td colSpan={3} className="p-3 pl-4 font-bold text-yellow-800 text-right uppercase text-xs">Genel Toplam</td><td className="p-3 pr-4 text-right font-black text-yellow-800">{seciliKayit.materials.reduce((a:any, b:any) => a + Number(b.toplam_fiyat), 0).toLocaleString()} ₺</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                        <button onClick={(e) => { setSeciliKayit(null); duzenle(e, seciliKayit); }} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-lg text-sm"><Edit2 size={16}/> Düzenle</button>
                        <button onClick={() => setSeciliKayit(null)} className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition text-sm">Kapat</button>
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}