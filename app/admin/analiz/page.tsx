"use client";

// ----------------------------------------------------------------------------
// BUVISAN SERVİS YÖNETİM PANELİ - PRO ANALİZ MODÜLÜ 🛠️
// Versiyon: 8.0 (Saha Sesli Rapor Entegrasyonu & Akıllı Asistan 🤖)
// ----------------------------------------------------------------------------

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Loader2, Plus, TrendingUp, DollarSign, Calendar, Save, Trash2, 
  Briefcase, User, MapPin, Clock, Wrench, FileText, X, Box, Edit2, RotateCcw, 
  Package, Search, AlertCircle, Download, Users, CheckSquare, Square, Filter,
  Mic, BellRing, Sparkles, CheckCircle2
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import html2canvas from 'html2canvas';

// 🔥 SABİT PERSONEL LİSTESİ
const PERSONEL_LISTESI = [
  "VOLKAN ACAR", "HAMZA ATTAR", "VEYSEL ÇARKLI", "KERİM AKDOĞAN" , "GÖKHAN GÖK" , "BASİL HAVATİMİ" , "BURHAN KANDEMİR" , "OKAN ARAN" , "ADEM ACAR"
];

export default function AnalizSayfasi() {
  
  // 1. Ekran görüntüsü referansı
  const modalRef = useRef<HTMLDivElement>(null);
  
  // 2. State Yönetimi
  const [indiriliyor, setIndiriliyor] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kayitlar, setKayitlar] = useState<any[]>([]);
  const [stokMalzemeleri, setStokMalzemeleri] = useState<any[]>([]); 
  const [aramaMetni, setAramaMetni] = useState("");
  
  // MODAL KONTROLLERİ
  const [seciliKayit, setSeciliKayit] = useState<any | null>(null);
  const [formAcik, setFormAcik] = useState(false);
  const [performansAcik, setPerformansAcik] = useState(false); 
  const [duzenlemeId, setDuzenlemeId] = useState<string | null>(null);

  // 🔥 YENİ: SESLİ RAPOR STATE'LERİ 🔥
  const [sesliRaporlar, setSesliRaporlar] = useState<any[]>([]);
  const [raporModalAcik, setRaporModalAcik] = useState(false);
  const [aktifRaporId, setAktifRaporId] = useState<string | null>(null); // Forma çevrilen raporun ID'si

  // ANALİZ TARİHİ
  const [analizTarihi, setAnalizTarihi] = useState(new Date().toISOString().slice(0, 7)); 

  // İSTATİSTİK & GRAFİK
  const [istatistik, setIstatistik] = useState({ toplamCiro: 0, buAyCiro: 0, toplamIslem: 0, buHaftaIslem: 0, buAyIslem: 0 });
  const [grafikVerisi, setGrafikVerisi] = useState<any[]>([]);

  // MALZEME & FORM
  const [malzemeListesi, setMalzemeListesi] = useState<{id: number, ad: string, adet: number, birim_fiyat: number, toplam_fiyat: number}[]>([]);
  const [secilenMalzemeId, setSecilenMalzemeId] = useState(""); 
  const [tempAdet, setTempAdet] = useState("1");
  const [tempBirimFiyat, setTempBirimFiyat] = useState(""); 

  // YENİ KAYIT FORMU
  const [yeniKayit, setYeniKayit] = useState({
    service_date: new Date().toISOString().split('T')[0],
    customer_text: '', company_address: '', customer_rep: '',    
    crane_capacity: '', service_type: 'Servis', 
    work_hours: '', description: '', 
    price: '', technician: ''
  });

  // ÇOKLU SEÇİM İÇİN GEÇİCİ STATE
  const [secilenPersoneller, setSecilenPersoneller] = useState<string[]>([]);

  // ==========================================================================
  // 2. VERİ ÇEKME
  // ==========================================================================
  useEffect(() => { 
      tumVerileriGetir(); 
      // Her 10 saniyede bir yeni saha raporu var mı diye kontrol et (Canlı hissi verir)
      const interval = setInterval(() => { sesliRaporlariGetir(); }, 10000);
      return () => clearInterval(interval);
  }, []);

  const tumVerileriGetir = async () => {
    try {
        const { data: servisData } = await supabase.from('completed_services').select('*').order('service_date', { ascending: false });
        if (servisData) { setKayitlar(servisData); hesaplamalariYap(servisData); }
        const { data: stokData } = await supabase.from('materials').select('*').order('name', { ascending: true });
        if (stokData) setStokMalzemeleri(stokData);
        await sesliRaporlariGetir(); // İlk açılışta raporları da çek
    } catch (error) { console.error("Veri hatası", error); } 
    finally { setYukleniyor(false); }
  };

  // 🔥 YENİ: SAHA RAPORLARINI ÇEKME FONKSİYONU
  const sesliRaporlariGetir = async () => {
      const { data } = await supabase.from('field_reports').select('*').eq('status', 'bekliyor').order('created_at', { ascending: false });
      if (data) setSesliRaporlar(data);
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
    buHaftaBaslangic.setDate(diff); buHaftaBaslangic.setHours(0,0,0,0);

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
    setGrafikVerisi(Object.keys(musteriAnalizi).map(key => ({ name: key, tutar: musteriAnalizi[key] })).sort((a, b) => b.tutar - a.tutar).slice(0, 5));
  };

  // ==========================================================================
  // 4. PERFORMANS ANALİZİ
  // ==========================================================================
  const personelAnaliziYap = () => {
      const [secilenYil, secilenAy] = analizTarihi.split('-').map(Number);
      const filtrelenmisKayitlar = kayitlar.filter(k => {
          if (!k.service_date) return false;
          const d = new Date(k.service_date);
          return d.getFullYear() === secilenYil && (d.getMonth() + 1) === secilenAy;
      });

      return PERSONEL_LISTESI.map(personel => {
          const gittigiIsler = filtrelenmisKayitlar.filter(k => k.technician && k.technician.includes(personel));
          return { ad: personel, isSayisi: gittigiIsler.length, detaylar: gittigiIsler };
      }).sort((a, b) => b.isSayisi - a.isSayisi);
  };

  const [aktifPersonelDetay, setAktifPersonelDetay] = useState<any>(null);

  // ==========================================================================
  // 5. FORM & MALZEME İŞLEMLERİ
  // ==========================================================================
  const malzemeEkle = () => {
      if(!secilenMalzemeId || !tempBirimFiyat || !tempAdet) return alert("Bilgileri kontrol edin.");
      const bulunan = stokMalzemeleri.find(m => m.id === secilenMalzemeId);
      const yeni = { id: Date.now(), ad: bulunan ? bulunan.name : "Bilinmeyen", adet: parseFloat(tempAdet), birim_fiyat: parseFloat(tempBirimFiyat), toplam_fiyat: parseFloat(tempAdet) * parseFloat(tempBirimFiyat) };
      setMalzemeListesi([...malzemeListesi, yeni]); setSecilenMalzemeId(""); setTempAdet("1"); setTempBirimFiyat("");
  };
  const malzemeSil = (id: number) => { setMalzemeListesi(malzemeListesi.filter(m => m.id !== id)); };
  
  const personelSeciminiGuncelle = (personel: string) => {
      let yeniListe = [...secilenPersoneller];
      if (yeniListe.includes(personel)) { yeniListe = yeniListe.filter(p => p !== personel); } 
      else { yeniListe.push(personel); }
      setSecilenPersoneller(yeniListe);
      setYeniKayit({...yeniKayit, technician: yeniListe.join(" - ")});
  };

  const personelleriTemizle = () => {
      setSecilenPersoneller([]);
      setYeniKayit({...yeniKayit, technician: ""});
  };

  const yeniKayitAc = () => { setDuzenlemeId(null); setAktifRaporId(null); formuSifirla(); setFormAcik(true); };
  
  const formuSifirla = () => {
      setMalzemeListesi([]);
      setSecilenPersoneller([]);
      setYeniKayit({ service_date: new Date().toISOString().split('T')[0], customer_text: '', company_address: '', customer_rep: '', crane_capacity: '', service_type: 'Servis', work_hours: '', description: '', price: '', technician: '' });
  };

  const duzenle = (e: any, kayit: any) => {
      e.stopPropagation(); setDuzenlemeId(kayit.id); setAktifRaporId(null);
      setMalzemeListesi(kayit.materials || []);
      const mevcutPersoneller = kayit.technician ? kayit.technician.split(" - ").map((p: string) => p.trim()) : [];
      setSecilenPersoneller(mevcutPersoneller);
      setYeniKayit({ ...kayit, technician: kayit.technician || '' });
      setFormAcik(true);
  };

  // 🔥 YENİ: SESLİ RAPORU SİHİRLİ FORMA ÇEVİRME 🔥
  const raporaDonustur = (rapor: any) => {
      setDuzenlemeId(null);
      formuSifirla();
      
      // Akıllı Müşteri Tahmini (Cümle içinde geçen eski müşteriyi bulur)
      let tahminMusteri = "";
      const kelimeler = rapor.audio_text.toLowerCase();
      const benzersizMusteriler = Array.from(new Set(kayitlar.map(k => k.customer_text).filter(Boolean)));
      for(const musteri of benzersizMusteriler) {
          if (kelimeler.includes(String(musteri).toLowerCase())) { 
              tahminMusteri = String(musteri); 
              break; 
          }
      }

      setAktifRaporId(rapor.id); // Kaydederken bu raporu 'onaylandi' yapacağız
      
      setYeniKayit({
          ...yeniKayit,
          customer_text: tahminMusteri,
          technician: rapor.technician_name,
          description: `🎙️ SAHA SES KAYDI:\n"${rapor.audio_text}"\n\n--- Lütfen yukarıdaki ses kaydına göre malzeme ve fiyat bilgisini tamamlayın ---`
      });
      
      setSecilenPersoneller([rapor.technician_name]);
      setRaporModalAcik(false); // Rapor listesini kapat
      setFormAcik(true); // Formu aç
  };

  // 🔥 GÜNCELLENMİŞ KAYDETME FONKSİYONU
  const kaydetVeyaGuncelle = async () => {
    if (!yeniKayit.customer_text || !yeniKayit.price) return alert("Müşteri ve Fiyat zorunludur.");
    setYukleniyor(true);
    const veriPaketi = { ...yeniKayit, work_hours: yeniKayit.work_hours ? Number(yeniKayit.work_hours) : 0, materials: malzemeListesi };
    
    let error;
    if (duzenlemeId) {
        error = (await supabase.from('completed_services').update(veriPaketi).eq('id', duzenlemeId)).error;
    } else {
        error = (await supabase.from('completed_services').insert([veriPaketi])).error;
        // Eğer bu kayıt bir saha raporundan geldiyse, raporu havuzdan düş (Onayla)
        if (!error && aktifRaporId) {
            await supabase.from('field_reports').update({ status: 'onaylandi' }).eq('id', aktifRaporId);
        }
    }
    
    if (error) alert("Hata: " + error.message);
    else { 
        alert(duzenlemeId ? "Güncellendi! ✅" : "Kaydedildi! ✅"); 
        setFormAcik(false); 
        formuSifirla(); 
        setAktifRaporId(null);
        tumVerileriGetir(); // Verileri ve raporları yenile
    }
    setYukleniyor(false);
  };

  const fisiIndir = async () => {
    if (!modalRef.current || !seciliKayit) return;
    setIndiriliyor(true);
    try {
      const canvas = await html2canvas(modalRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const link = document.createElement("a"); link.href = canvas.toDataURL("image/png");
      link.download = `ServisFisi-${seciliKayit.customer_text}.png`; link.click();
    } catch (error) { console.error(error); alert("Hata oluştu."); }
    setIndiriliyor(false);
  };

  const sil = async (e: any, id: string) => { e.stopPropagation(); if(confirm("Silmek istediğine emin misin?")) { await supabase.from('completed_services').delete().eq('id', id); tumVerileriGetir(); if (seciliKayit?.id === id) setSeciliKayit(null); }};
  const raporuSil = async (id: string) => { if(confirm("Saha raporunu çöpe at?")) { await supabase.from('field_reports').update({ status: 'reddedildi' }).eq('id', id); sesliRaporlariGetir(); }};

  const filtrelenmisKayitlar = kayitlar.filter(i => !aramaMetni || (i.customer_text?.toLowerCase()||'').includes(aramaMetni.toLowerCase()));

  if (yukleniyor && kayitlar.length === 0) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-blue-600 w-10 h-10"/></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-24 relative font-sans">
      
      {/* ÜST BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 md:mb-8">
        <div><h1 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">📊 Servis Yönetim Paneli</h1><p className="text-slate-500 text-xs md:text-sm">Finansal analiz ve servis takibi.</p></div>
        <div className="flex gap-2 w-full md:w-auto flex-wrap">
            
            {/* 🔥 YENİ BUTON: GELEN SAHA RAPORLARI */}
            <button 
                onClick={() => setRaporModalAcik(true)} 
                className="relative text-center bg-cyan-600 text-white border border-cyan-700 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-cyan-700 transition flex items-center justify-center gap-2 shadow-lg shadow-cyan-200"
            >
                <Mic size={18}/> Saha Raporları
                {sesliRaporlar.length > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] w-6 h-6 flex items-center justify-center rounded-full animate-bounce shadow-lg shadow-red-500/50 border-2 border-white">
                        {sesliRaporlar.length}
                    </span>
                )}
            </button>

            <button onClick={() => setPerformansAcik(true)} className="flex-1 md:flex-none text-center bg-purple-600 text-white border border-purple-700 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-purple-700 transition flex items-center justify-center gap-2 shadow-lg shadow-purple-200"><Users size={18}/> Ekip Performansı</button>
            <button onClick={yeniKayitAc} className="flex-1 md:flex-none text-center bg-blue-600 text-white border border-blue-700 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-lg shadow-blue-200"><Plus size={18}/> Yeni İşlem Ekle</button>
            <Link href="/admin/malzemeler" className="flex-1 md:flex-none text-center bg-yellow-50 text-yellow-700 border border-yellow-200 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-yellow-100 transition flex items-center justify-center gap-2"><Package size={18}/> Depo</Link>
            <Link href="/admin" className="flex-1 md:flex-none text-center bg-white border border-slate-200 px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition flex items-center justify-center gap-2"><RotateCcw size={18}/> Panel</Link>
        </div>
      </div>

      {/* İSTATİSTİKLER */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-8">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Toplam Ciro</div><div className="text-xl font-black text-slate-800">{istatistik.toplamCiro.toLocaleString('tr-TR')} ₺</div></div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Bu Ay Ciro</div><div className="text-xl font-black text-slate-800">{istatistik.buAyCiro.toLocaleString('tr-TR')} ₺</div></div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Haftalık Servis</div><div className="text-xl font-black text-slate-800">{istatistik.buHaftaIslem} Adet</div></div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><div className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Aylık Servis</div><div className="text-xl font-black text-slate-800">{istatistik.buAyIslem} Adet</div></div>
      </div>

      {/* GRAFİK VE LİSTE */}
      <div className="space-y-8">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hidden md:block">
                <h3 className="text-sm font-bold text-slate-500 mb-6 uppercase flex items-center gap-2"><TrendingUp size={16}/> En Çok Ciro Yapan 5 Müşteri</h3>
                <div className="h-[250px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={grafikVerisi}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="name" tick={{fontSize: 10}} /><YAxis width={60} /><Tooltip /><Bar dataKey="tutar" fill="#4f46e5" radius={[6, 6, 0, 0]} name="Gelir (TL)" /></BarChart></ResponsiveContainer></div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3"><div className="bg-blue-50 p-2 rounded-lg text-blue-600"><FileText size={20}/></div><div><h3 className="font-bold text-slate-800 flex items-center gap-2">Son İşlemler <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">{filtrelenmisKayitlar.length} Kayıt</span></h3><p className="text-xs text-slate-400">Detayları görmek için satıra tıklayın.</p></div></div>
                    <div className="relative w-full md:w-64 group"><Search className="absolute left-3 top-3 text-slate-400 w-4 h-4"/><input type="text" placeholder="Ara: Müşteri, Teknisyen..." value={aramaMetni} onChange={(e) => setAramaMetni(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition"/>{aramaMetni && <button onClick={() => setAramaMetni("")} className="absolute right-3 top-3 text-slate-400 hover:text-red-500"><X size={14}/></button>}</div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap md:whitespace-normal">
                        <thead className="bg-slate-50/50 text-slate-500 font-bold uppercase text-[10px] md:text-xs tracking-wider"><tr><th className="p-4 pl-6">Tarih</th><th className="p-4">Müşteri</th><th className="p-4 hidden md:table-cell">İşlem</th><th className="p-4">Tutar</th><th className="p-4 text-right pr-6">İşlem</th></tr></thead>
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
          🔥 YENİ MODAL: GELEN SAHA RAPORLARI (SESLİ ASİSTAN)
          ========================================================================= */}
      <AnimatePresence>
        {raporModalAcik && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-cyan-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4" onClick={() => setRaporModalAcik(false)}>
                <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-white w-full max-w-3xl rounded-[40px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="p-6 bg-cyan-50 border-b border-cyan-100 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-cyan-600 rounded-2xl text-white shadow-lg shadow-cyan-200"><BellRing size={28} className={sesliRaporlar.length > 0 ? "animate-pulse" : ""}/></div>
                            <div>
                                <h2 className="text-2xl font-black text-slate-800">SAHA BİLDİRİMLERİ</h2>
                                <p className="text-xs font-bold text-cyan-600 uppercase tracking-widest">Sahadan gelen sesli kayıtlar</p>
                            </div>
                        </div>
                        <button onClick={() => setRaporModalAcik(false)} className="p-2 bg-white rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition"><X size={24}/></button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-4">
                        {sesliRaporlar.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                <CheckCircle2 size={64} className="opacity-20 mb-4"/>
                                <p className="font-bold">Sahadan bekleyen rapor yok, her şey temiz!</p>
                            </div>
                        ) : (
                            sesliRaporlar.map(rapor => (
                                <div key={rapor.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition">
                                    <div className="flex justify-between items-start mb-3 border-b border-slate-100 pb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="bg-slate-100 p-2 rounded-lg text-slate-500"><User size={16}/></div>
                                            <div>
                                                <h4 className="font-bold text-slate-800">{rapor.technician_name}</h4>
                                                <p className="text-[10px] text-slate-400">{new Date(rapor.created_at).toLocaleString('tr-TR')}</p>
                                            </div>
                                        </div>
                                        <span className="bg-orange-100 text-orange-600 text-[10px] font-bold px-2 py-1 rounded uppercase flex items-center gap-1"><Clock size={10}/> Bekliyor</span>
                                    </div>
                                    <div className="bg-slate-50 p-4 rounded-xl text-slate-600 text-sm italic mb-4 border-l-4 border-cyan-400 relative">
                                        <Mic size={16} className="absolute right-3 top-3 text-slate-300"/>
                                        "{rapor.audio_text}"
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => raporaDonustur(rapor)} className="flex-1 bg-cyan-600 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-cyan-700 transition shadow-lg shadow-cyan-200">
                                            <Sparkles size={16}/> Sihirli Forma Çevir
                                        </button>
                                        <button onClick={() => raporuSil(rapor.id)} className="bg-white border border-slate-200 text-red-500 p-2.5 rounded-xl hover:bg-red-50 transition"><Trash2 size={16}/></button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* =========================================================================
          🔥 MODAL: FORM (YENİ EKLEME VE DÜZENLEME PENCERESİ)
          ========================================================================= */}
      <AnimatePresence>
        {formAcik && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setFormAcik(false)}>
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} ref={modalRef} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className={`p-6 flex justify-between items-center shrink-0 ${duzenlemeId ? 'bg-orange-50 border-b border-orange-100' : aktifRaporId ? 'bg-cyan-50 border-b border-cyan-100' : 'bg-blue-50 border-b border-blue-100'}`}>
                        <h2 className={`text-xl font-bold flex items-center gap-3 ${duzenlemeId ? 'text-orange-700' : aktifRaporId ? 'text-cyan-700' : 'text-blue-700'}`}>
                            {duzenlemeId ? <Edit2 className="w-6 h-6"/> : aktifRaporId ? <Sparkles className="w-6 h-6"/> : <Plus className="w-6 h-6"/>}
                            {duzenlemeId ? 'Kayıt Düzenle' : aktifRaporId ? 'AI Destekli Kayıt Oluştur' : 'Yeni İşlem Ekle'}
                        </h2>
                        <button onClick={() => setFormAcik(false)} className="bg-white/50 hover:bg-white p-2 rounded-full transition"><X size={24} className="text-slate-500"/></button>
                    </div>

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
                                <textarea rows={4} placeholder="Yapılan işlemi detaylıca yazın..." value={yeniKayit.description} onChange={e => setYeniKayit({...yeniKayit, description: e.target.value})} className={`w-full p-3 bg-slate-50 rounded-xl border text-sm resize-none ${aktifRaporId ? 'border-cyan-300 bg-cyan-50/30' : 'border-slate-200'}`}/>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><Users size={12}/> Servis Ekibi (Seçiniz)</span>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {PERSONEL_LISTESI.map((personel) => (
                                    <button 
                                        key={personel} 
                                        onClick={() => personelSeciminiGuncelle(personel)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition border ${secilenPersoneller.includes(personel) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                    >
                                        {secilenPersoneller.includes(personel) ? <CheckSquare size={14}/> : <Square size={14}/>}
                                        {personel}
                                    </button>
                                ))}
                            </div>
                            
                            <div className="flex justify-between items-center bg-blue-50 p-3 rounded-xl border border-blue-100">
                                <span className="text-xs text-blue-700 font-bold">
                                    {yeniKayit.technician || 'Henüz Kimse Seçilmedi'}
                                </span>
                                {secilenPersoneller.length > 0 && (
                                    <button onClick={personelleriTemizle} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition" title="Seçimi Temizle"><Trash2 size={16} /></button>
                                )}
                            </div>
                        </div>

                        <div className="p-4 bg-yellow-50 rounded-2xl border border-yellow-200 space-y-4">
                            <span className="text-[10px] font-bold text-yellow-700 uppercase tracking-wider flex items-center gap-2"><Box size={12}/> Malzemeler</span>
                            <div className="flex flex-col md:flex-row gap-2 items-center">
                                <select value={secilenMalzemeId} onChange={(e) => { const id = e.target.value; setSecilenMalzemeId(id); const bulunan = stokMalzemeleri.find(m => m.id === id); if (bulunan) setTempBirimFiyat(bulunan.sale_price); else setTempBirimFiyat(""); }} className="w-full p-3 bg-white rounded-xl border border-yellow-300 text-xs font-bold text-slate-700"><option value="">Malzeme Seç...</option>{stokMalzemeleri.map(m => (<option key={m.id} value={m.id}>{m.name}</option>))}</select>
                                <div className="flex gap-2 w-full md:w-auto">
                                    <div className="relative w-20"><input type="number" placeholder="Adet" value={tempAdet} onChange={e => setTempAdet(e.target.value)} className="w-full p-3 bg-white rounded-xl border border-yellow-300 text-xs font-bold text-center"/><span className="absolute right-1 top-3 text-[9px] text-slate-400">Adet</span></div>
                                    <div className="relative flex-1"><span className="absolute left-3 top-3 text-slate-400 text-xs">₺</span><input type="number" placeholder="Fiyat" value={tempBirimFiyat} onChange={e => setTempBirimFiyat(e.target.value)} className="w-full pl-6 p-3 bg-white rounded-xl border border-yellow-300 text-xs font-bold"/></div>
                                    <button onClick={malzemeEkle} className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 rounded-xl shadow-lg shadow-yellow-200"><Plus size={20}/></button>
                                </div>
                            </div>
                            {malzemeListesi.length > 0 && (<div className="bg-white rounded-xl border border-yellow-200 overflow-hidden">{malzemeListesi.map((m) => (<div key={m.id} className="flex justify-between items-center text-xs p-2 border-b border-slate-50 last:border-0 hover:bg-slate-50"><div><span className="font-bold text-slate-700">{m.ad}</span> <span className="text-slate-400 ml-2">({m.adet} x {m.birim_fiyat} ₺)</span></div><div className="flex items-center gap-3"><span className="font-mono font-bold text-slate-900">{Number(m.toplam_fiyat).toLocaleString()} ₺</span><button onClick={() => malzemeSil(m.id)} className="text-red-300 hover:text-red-500"><X size={14}/></button></div></div>))}<div className="bg-yellow-100 p-2 text-right text-xs font-bold text-yellow-800">Toplam: {malzemeListesi.reduce((a, b) => a + b.toplam_fiyat, 0).toLocaleString()} ₺</div></div>)}
                        </div>

                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                            <div className="flex gap-3">
                                <div className="flex-1 relative"><span className="absolute left-3 top-3 text-slate-400 text-sm">₺</span><input type="number" placeholder="Genel Toplam Tutar" value={yeniKayit.price} onChange={e => setYeniKayit({...yeniKayit, price: e.target.value})} className="w-full pl-7 p-3 bg-white rounded-xl border border-slate-200 text-sm font-black text-green-700"/></div>
                                <div className="w-1/3 relative"><input type="number" placeholder="Saat" value={yeniKayit.work_hours} onChange={e => setYeniKayit({...yeniKayit, work_hours: e.target.value})} className="w-full p-3 bg-white rounded-xl border border-slate-200 text-xs text-center"/><span className="absolute right-3 top-3 text-slate-300 text-xs">Sa</span></div>
                            </div>
                        </div>
                    </div>

                    <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0">
                        <button onClick={fisiIndir} disabled={indiriliyor} className="px-6 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition flex items-center gap-2 shadow-lg text-sm">{indiriliyor ? <Loader2 size={16} className="animate-spin"/> : <Download size={16}/>} {indiriliyor ? 'İniliyor...' : 'Fişi İndir'}</button>
                        <button onClick={() => setFormAcik(false)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition">Vazgeç</button>
                        <button onClick={kaydetVeyaGuncelle} className={`flex-[2] py-3 text-white font-bold rounded-xl hover:shadow-lg transition ${duzenlemeId ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'}`}>{duzenlemeId ? 'Kaydı Güncelle' : aktifRaporId ? 'İşle ve Onayla' : 'Kaydet ve Tamamla'}</button>
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* =========================================================================
          🔥 EKİP PERFORMANS ANALİZİ (TARİHÇELİ)
          ========================================================================= */}
      <AnimatePresence>
        {performansAcik && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-purple-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4" onClick={() => setPerformansAcik(false)}>
                <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-white w-full max-w-5xl rounded-[40px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="p-6 bg-purple-50 border-b border-purple-100 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-purple-600 rounded-2xl text-white"><Users size={28}/></div>
                            <div>
                                <h2 className="text-2xl font-black text-slate-800">EKİP PERFORMANSI</h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <Filter size={12} className="text-purple-400"/>
                                    <select 
                                        value={analizTarihi} 
                                        onChange={(e) => setAnalizTarihi(e.target.value)}
                                        className="bg-white border-2 border-purple-200 text-purple-700 text-xs font-black px-3 py-1 rounded-full outline-none shadow-sm cursor-pointer hover:bg-purple-100"
                                    >
                                        {Array.from({ length: 7 }, (_, i) => 2024 + i).map(yil => (
                                            ["OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN", "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK"].map((ayAdi, index) => {
                                                const ayValue = `${yil}-${String(index + 1).padStart(2, '0')}`;
                                                return <option key={ayValue} value={ayValue}>{ayAdi} {yil}</option>;
                                            })
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <button onClick={() => setPerformansAcik(false)} className="p-2 bg-white rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition"><X size={24}/></button>
                    </div>

                    <div className="flex flex-1 overflow-hidden">
                        <div className="w-1/3 border-r border-slate-100 overflow-y-auto bg-slate-50/50 p-4 space-y-2">
                            {personelAnaliziYap().map((p, index) => (
                                <button 
                                    key={index} 
                                    onClick={() => setAktifPersonelDetay(p)}
                                    className={`w-full p-4 rounded-2xl flex justify-between items-center transition border ${aktifPersonelDetay?.ad === p.ad ? 'bg-purple-600 text-white shadow-lg shadow-purple-200 border-purple-600' : 'bg-white text-slate-600 hover:bg-white border-slate-200 hover:border-purple-200'}`}
                                >
                                    <div className="font-bold text-sm">{p.ad}</div>
                                    <div className={`text-xs font-black px-3 py-1 rounded-full ${aktifPersonelDetay?.ad === p.ad ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{p.isSayisi} İş</div>
                                </button>
                            ))}
                        </div>

                        <div className="w-2/3 p-8 overflow-y-auto bg-white">
                            {aktifPersonelDetay ? (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-end border-b pb-4">
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-800">{aktifPersonelDetay.ad}</h3>
                                            <p className="text-sm text-slate-500">{analizTarihi} döneminde tamamladığı işler.</p>
                                        </div>
                                        <div className="text-4xl font-black text-purple-600">{aktifPersonelDetay.isSayisi}</div>
                                    </div>

                                    {aktifPersonelDetay.detaylar.length > 0 ? (
                                        <div className="grid gap-3">
                                            {aktifPersonelDetay.detaylar.map((is: any) => (
                                                <div key={is.id} className="p-4 rounded-2xl border border-slate-100 hover:bg-purple-50 transition group flex justify-between items-center">
                                                    <div>
                                                        <div className="font-bold text-slate-800">{is.customer_text}</div>
                                                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-2"><Calendar size={12}/> {new Date(is.service_date).toLocaleDateString('tr-TR')}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-black text-slate-700">{Number(is.price).toLocaleString()} ₺</div>
                                                        <div className="text-[10px] text-purple-500 font-bold uppercase mt-1">{is.service_type}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-20 text-slate-400">
                                            <div className="flex justify-center mb-4"><Package size={48} className="opacity-20"/></div>
                                            <p>Bu ay için kayıt bulunamadı.</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                    <Users size={64} className="opacity-10 mb-4"/>
                                    <p className="font-medium">Detaylarını görmek için soldan bir personel seçin.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* Detay Modalı */}
      <AnimatePresence>{seciliKayit && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setSeciliKayit(null)}><motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-[95%] md:w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}><div className="bg-slate-900 text-white p-6 flex justify-between items-start shrink-0"><div><div className="flex items-center gap-3 mb-2"><h2 className="text-2xl font-bold">{seciliKayit.customer_text}</h2><span className="text-xs font-bold px-3 py-1 rounded-full bg-white/10">{seciliKayit.service_type}</span></div><div className="flex gap-4 text-slate-400 text-xs"><span className="flex items-center gap-1"><MapPin size={14}/> {seciliKayit.company_address}</span><span className="flex items-center gap-1"><User size={14}/> {seciliKayit.customer_rep}</span></div></div><button onClick={() => setSeciliKayit(null)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition"><X size={24}/></button></div><div className="p-6 space-y-6 overflow-y-auto"><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="p-4 bg-slate-50 rounded-2xl border border-slate-100"><div className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2"><Wrench size={14}/> Teknik</div><div className="space-y-2 text-sm text-slate-700"><div className="flex justify-between border-b pb-1"><span>Kapasite:</span> <b>{seciliKayit.crane_capacity}</b></div><div className="flex justify-between border-b pb-1"><span>Süre:</span> <b>{seciliKayit.work_hours} Saat</b></div><div className="flex justify-between"><span>Ekip:</span> <b>{seciliKayit.technician}</b></div></div></div><div className="p-4 bg-green-50 rounded-2xl border border-green-100 flex flex-col justify-center"><div className="text-xs font-bold text-green-600 uppercase mb-2 flex items-center gap-2"><DollarSign size={14}/> Tutar</div><div className="text-3xl font-black text-green-700">{Number(seciliKayit.price).toLocaleString('tr-TR')} ₺</div><div className="text-xs text-green-600/70 mt-1">{new Date(seciliKayit.service_date).toLocaleDateString('tr-TR')}</div></div></div><div><h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><FileText size={18}/> Detay</h3><div className="bg-slate-50 p-5 rounded-2xl text-sm text-slate-600">{seciliKayit.description}</div></div>{seciliKayit.materials && Array.isArray(seciliKayit.materials) && seciliKayit.materials.length > 0 && (<div><h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Box size={18} className="text-yellow-600"/> Kullanılan Malzemeler</h3><div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm"><table className="w-full text-sm"><thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200"><tr><th className="p-3 text-left pl-4">Malzeme</th><th className="p-3 text-center">Adet</th><th className="p-3 text-right">Birim</th><th className="p-3 text-right pr-4">Toplam</th></tr></thead><tbody className="divide-y divide-slate-100 bg-white">{seciliKayit.materials.map((m: any, i: number) => (<tr key={i}><td className="p-3 pl-4 text-slate-700 font-medium">{m.ad}</td><td className="p-3 text-center text-slate-500">{m.adet}</td><td className="p-3 text-right text-slate-400 text-xs">{Number(m.birim_fiyat).toLocaleString()} ₺</td><td className="p-3 pr-4 text-right font-bold text-slate-900">{Number(m.toplam_fiyat).toLocaleString()} ₺</td></tr>))}<tr className="bg-yellow-50"><td colSpan={3} className="p-3 pl-4 font-bold text-yellow-800 text-right uppercase text-xs">Genel Toplam</td><td className="p-3 pr-4 text-right font-black text-yellow-800">{seciliKayit.materials.reduce((a:any, b:any) => a + Number(b.toplam_fiyat), 0).toLocaleString()} ₺</td></tr></tbody></table></div></div>)}</div><div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0"><button onClick={(e) => { setSeciliKayit(null); duzenle(e, seciliKayit); }} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-lg text-sm"><Edit2 size={16}/> Düzenle</button><button onClick={() => setSeciliKayit(null)} className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition text-sm">Kapat</button></div></motion.div></motion.div>)}</AnimatePresence>

    </div>
  );
}