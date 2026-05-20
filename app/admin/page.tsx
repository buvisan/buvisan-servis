"use client";
// --------------------------------------------------------
// BUVISAN ADMIN PANELİ - ANA KUMANDA MERKEZİ V4.1 🛠️
// (Teklif Önizleme Modülü Doğrudan Ana Ekrana Gömüldü 📄)
// --------------------------------------------------------

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ChatAlani from '@/components/ChatAlani'; 
import { 
  LogOut, Plus, List, MapPin, AlertCircle, CheckCircle2, Clock, 
  Camera, LayoutDashboard, Globe, Wrench, ChevronRight, Activity, 
  Package, FileText, TrendingUp, User, Building2, Save, X, Phone, 
  AlertTriangle, Truck, Settings, CheckSquare, Square, Trash2, Loader2, Car, Video, Mic, Image as ImageIcon, Edit2, Map, Search, Eye, Printer, FileCheck
} from 'lucide-react';

const PERSONEL_LISTESI = [
  "VOLKAN ACAR", "HAMZA ATTAR", "VEYSEL ÇARKLI", "KERİM AKDOĞAN" , "GÖKHAN GÖK" , "BASİL HAVATİMİ" , "BURHAN KANDEMİR" , "OKAN ARAN" , "ADEM ACAR"
];

export default function AdminPanel() {
  const router = useRouter();
  
  const [aktifChatId, setAktifChatId] = useState<string | null>(null);
  const [bildirimler, setBildirimler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [erisimIzni, setErisimIzni] = useState(false);
  const [istatistikler, setIstatistikler] = useState({ bekleyen: 0, cozulen: 0, toplam: 0 });

  // İŞ EMRİ FİLTRELEME STATE'İ
  const [aktifSekme, setAktifSekme] = useState<'hepsi' | 'bekliyor' | 'tamamlandi'>('bekliyor');
  const [aramaMetni, setAramaMetni] = useState("");

  const [manuelFormAcik, setManuelFormAcik] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [duzenlenenKayitId, setDuzenlenenKayitId] = useState<string | null>(null);
  
  const [secilenManuelPersoneller, setSecilenManuelPersoneller] = useState<string[]>([]);
  
  const [manuelKayit, setManuelKayit] = useState({
      firma_adi: '', yetkili: '', telefon: '', adres: '', vinc_bilgisi: '', aciliyet: 'Normal', ekip: '', sorun: '', lat: '', lng: '',
      ticket_type: 'ariza', 
      pipeline_status: 'bekliyor' 
  });

  // 🔥 YENİ: TEKLİF SİSTEMİ İÇİN GEREKLİ STATELER VE REF 🔥
  const [teklifler, setTeklifler] = useState<any[]>([]);
  const [seciliTeklif, setSeciliTeklif] = useState<any | null>(null);
  const [onizlemeAcik, setOnizlemeAcik] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => { guvenlikVeVeri(); }, []);

  async function guvenlikVeVeri() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.replace('/login'); return; }

        const { data: profil } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        if (!profil || profil.role !== 'admin') { router.replace('/personel'); return; }

        setErisimIzni(true);

        // Hem İş Emirlerini Hem de Teklifleri Çekiyoruz
        const { data: biletData } = await supabase.from('service_tickets').select('*, cranes(*)').order('created_at', { ascending: false });
        const { data: teklifData } = await supabase.from('offers').select('*'); 

        if (biletData) {
            setBildirimler(biletData);
            setIstatistikler({
                bekleyen: biletData.filter(x => x.pipeline_status !== 'tamamlandi').length,
                cozulen: biletData.filter(x => x.pipeline_status === 'tamamlandi').length,
                toplam: biletData.length
            });
        }

        if (teklifData) {
            setTeklifler(teklifData);
        }

    } catch (error) { console.error("Hata:", error); } 
    finally { setYukleniyor(false); }
  }

  // PIPELINE (SÜREÇ) GÜNCELLEME
  async function durumGuncelle(id: string, yeniDurum: string) {
    if(!confirm(`Bu işin durumunu "${yeniDurum.toUpperCase()}" olarak değiştirmek istiyor musunuz?`)) return;
    
    const legacyStatus = yeniDurum === 'tamamlandi' ? 'tamamlandi' : 'bekliyor';
    
    const { error } = await supabase.from('service_tickets').update({ 
        pipeline_status: yeniDurum,
        status: legacyStatus
    }).eq('id', id);

    if (!error) guvenlikVeVeri(); else alert("Güncelleme hatası: " + error.message);
  }

  async function kayitSil(id: string) {
      if(!confirm("Bu arıza kaydını tamamen silmek istediğinize emin misiniz? (Bu işlem geri alınamaz!)")) return;
      const { error } = await supabase.from('service_tickets').delete().eq('id', id);
      if(error) alert("Silinirken hata oluştu: " + error.message);
      else guvenlikVeVeri(); 
  }

  function kayitDuzenleAc(kayit: any) {
      setDuzenlenenKayitId(kayit.id);
      
      setManuelKayit({
          firma_adi: kayit.manual_customer_name || kayit.cranes?.customer_name || '',
          yetkili: kayit.manual_customer_rep || '',
          telefon: kayit.manual_phone || '',
          adres: kayit.manual_location || kayit.cranes?.location_address || '',
          vinc_bilgisi: kayit.manual_crane_info || kayit.cranes?.model_name || '',
          aciliyet: kayit.priority || 'Normal',
          ekip: kayit.assigned_team || '',
          sorun: kayit.description || '',
          lat: kayit.lat || '', 
          lng: kayit.lng || '',
          ticket_type: kayit.ticket_type || 'ariza',
          pipeline_status: kayit.pipeline_status || 'bekliyor'
      });

      if(kayit.assigned_team) setSecilenManuelPersoneller(kayit.assigned_team.split(" - ").map((p:string) => p.trim()));
      else setSecilenManuelPersoneller([]);

      setManuelFormAcik(true);
  }

  const manuelPersonelSeciminiGuncelle = (personel: string) => {
      let yeniListe = [...secilenManuelPersoneller];
      if (yeniListe.includes(personel)) yeniListe = yeniListe.filter(p => p !== personel);
      else yeniListe.push(personel);
      
      setSecilenManuelPersoneller(yeniListe);
      setManuelKayit({...manuelKayit, ekip: yeniListe.join(" - ")});
  };

  async function manuelArizaKaydet() {
      if(!manuelKayit.firma_adi || !manuelKayit.sorun) return alert("Lütfen en azından Firma Adı ve Sorun alanlarını doldurun.");
      setKaydediliyor(true);

      const legacyStatus = manuelKayit.pipeline_status === 'tamamlandi' ? 'tamamlandi' : 'bekliyor';

      const veriPaketi = {
          description: manuelKayit.sorun, manual_customer_name: manuelKayit.firma_adi, manual_customer_rep: manuelKayit.yetkili,
          manual_phone: manuelKayit.telefon, manual_location: manuelKayit.adres, manual_crane_info: manuelKayit.vinc_bilgisi,
          priority: manuelKayit.aciliyet, assigned_team: manuelKayit.ekip,
          lat: manuelKayit.lat ? Number(manuelKayit.lat) : null, 
          lng: manuelKayit.lng ? Number(manuelKayit.lng) : null,
          ticket_type: manuelKayit.ticket_type,
          pipeline_status: manuelKayit.pipeline_status,
          status: legacyStatus
      };

      let error;
      if (duzenlenenKayitId) error = (await supabase.from('service_tickets').update(veriPaketi).eq('id', duzenlenenKayitId)).error;
      else error = (await supabase.from('service_tickets').insert([veriPaketi])).error;

      setKaydediliyor(false);

      if (error) alert("Kaydedilemedi: " + error.message);
      else {
          setManuelFormAcik(false); setSecilenManuelPersoneller([]);
          setManuelKayit({ firma_adi: '', yetkili: '', telefon: '', adres: '', vinc_bilgisi: '', aciliyet: 'Normal', ekip: '', sorun: '', lat: '', lng: '', ticket_type: 'ariza', pipeline_status: 'bekliyor' });
          setDuzenlenenKayitId(null); guvenlikVeVeri(); 
      }
  }

  async function cikisYap() { await supabase.auth.signOut(); router.push('/login'); }

  const haritayaGit = (lat: number, lng: number) => {
    router.push(`/admin/harita?lat=${lat}&lng=${lng}`);
  };

  // İŞ EMİRLERİNİ FİLTRELEME FONKSİYONU
  const filtrelenmisBildirimler = bildirimler.filter(kayit => {
      const aramaKriteri = aramaMetni.toLowerCase();
      const firmaAd = (kayit.cranes?.customer_name || kayit.manual_customer_name || "").toLowerCase();
      const sorun = (kayit.description || "").toLowerCase();
      const aramaUyumu = firmaAd.includes(aramaKriteri) || sorun.includes(aramaKriteri);

      let sekmeUyumu = true;
      if (aktifSekme === 'hepsi') sekmeUyumu = true;
      if (aktifSekme === 'bekliyor') sekmeUyumu = kayit.pipeline_status !== 'tamamlandi';
      if (aktifSekme === 'tamamlandi') sekmeUyumu = kayit.pipeline_status === 'tamamlandi';

      return aramaUyumu && sekmeUyumu;
  });

  const getPipelineStatusBadge = (status: string) => {
      switch(status) {
          case 'kesif_bekliyor': return <span className="bg-purple-100 text-purple-700 border-purple-200 px-3 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 shadow-sm border"><Eye size={12}/> KEŞİF BEKLİYOR</span>;
          case 'teklif_hazirlanacak': return <span className="bg-orange-100 text-orange-700 border-orange-200 px-3 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 shadow-sm border"><FileText size={12}/> TEKLİF HAZIRLANACAK</span>;
          case 'teklif_bekliyor': return <span className="bg-yellow-100 text-yellow-700 border-yellow-200 px-3 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 shadow-sm border animate-pulse"><Clock size={12}/> ONAY BEKLİYOR</span>;
          case 'mudahale_edilecek': return <span className="bg-blue-100 text-blue-700 border-blue-200 px-3 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 shadow-sm border"><Truck size={12}/> ONAYLANDI / GİDİLECEK</span>;
          case 'acil_cozum': return <span className="bg-red-100 text-red-700 border-red-200 px-3 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 shadow-sm border animate-pulse"><AlertTriangle size={12}/> ACİL ÇÖZÜM BEKLİYOR</span>;
          case 'tamamlandi': return <span className="bg-green-100 text-green-700 border-green-200 px-3 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 shadow-sm border"><CheckCircle2 size={12}/> ÇÖZÜLDÜ</span>;
          default: return <span className="bg-slate-100 text-slate-700 border-slate-200 px-3 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 shadow-sm border"><Clock size={12}/> BEKLİYOR</span>;
      }
  };

  // 🔥 YENİ: YAZDIRMA FONKSİYONU 🔥
  const yazdir = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    
    const win = window.open('', '', 'width=900,height=650');
    win?.document.write(`
      <html>
        <head>
          <title>Buvisan Teklif</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
              @media print {
                  body { -webkit-print-color-adjust: exact; }
              }
          </style>
        </head>
        <body>${printContent.innerHTML}</body>
      </html>
    `);
    win?.document.close();
    win?.focus();
    setTimeout(() => { win?.print(); win?.close(); }, 500);
  };

  if (yukleniyor || !erisimIzni) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
         <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
         <div className="font-bold text-lg animate-pulse">Güvenlik Kontrolü Yapılıyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      
      {/* ÜST HEADER */}
      <div className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-50 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-blue-600 to-blue-400 p-2.5 rounded-xl shadow-lg shadow-blue-900/50"><LayoutDashboard className="w-6 h-6 text-white" /></div>
            <div><h1 className="text-xl font-bold tracking-tight leading-none">BUVİSAN</h1><p className="text-[10px] text-blue-400 font-medium tracking-widest uppercase">Servis Yönetim Paneli</p></div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin/harita')} className="group bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white pl-3 pr-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg hover:shadow-green-900/20 hover:border-green-500/50"><div className="bg-green-500/20 p-1.5 rounded-lg text-green-400"><Globe className="w-4 h-4 animate-pulse" /></div><span className="hidden sm:inline">Canlı Harita</span></button>
            <div className="h-8 w-px bg-slate-800 mx-2 hidden sm:block"></div>
            <button onClick={cikisYap} className="text-slate-400 hover:text-white hover:bg-white/10 px-3 py-2 rounded-lg transition flex items-center gap-2 text-sm font-medium"><LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Çıkış</span></button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        
        {/* DASHBOARD İSTATİSTİKLERİ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <motion.div whileHover={{ scale: 1.01 }} className={`md:col-span-2 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[180px] ${istatistikler.bekleyen > 0 ? 'bg-gradient-to-r from-orange-500 to-red-600 shadow-orange-200' : 'bg-gradient-to-r from-emerald-500 to-teal-600 shadow-emerald-200'}`}>
                <div className="absolute right-0 top-0 p-6 opacity-10">{istatistikler.bekleyen > 0 ? <AlertCircle size={140}/> : <CheckCircle2 size={140}/>}</div>
                <div className="relative z-10">
                    <h2 className="text-sm font-bold opacity-90 uppercase tracking-wider flex items-center gap-2 mb-2"><Activity size={16}/> Sistem Durumu</h2>
                    <div className="text-5xl md:text-6xl font-black mb-1">{istatistikler.bekleyen > 0 ? istatistikler.bekleyen : "Temiz"}</div>
                    <div className="text-sm md:text-base font-medium opacity-90">{istatistikler.bekleyen > 0 ? "Adet Bekleyen Kayıt Var!" : "Müdahale bekleyen işlem yok."}</div>
                </div>
                <div className="relative z-10 mt-4"><span className="bg-white/20 hover:bg-white/30 backdrop-blur-sm px-4 py-2 rounded-xl text-xs font-bold transition cursor-default">Toplam {istatistikler.toplam} Kayıt</span></div>
            </motion.div>

            <div className="hidden md:flex bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex-col justify-center items-center text-center">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4"><LayoutDashboard size={32}/></div>
                <h3 className="text-slate-800 font-bold text-lg">Yönetim Paneli</h3>
                <p className="text-slate-400 text-xs mt-1">v4.1 Aktif</p>
                <div className="mt-4 w-full h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 w-2/3 rounded-full"></div></div>
            </div>
        </div>

        {/* OPERASYON MENÜSÜ */}
        <div>
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><div className="w-1 h-6 bg-slate-800 rounded-full"></div> Operasyonlar</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <motion.button whileHover={{ y: -3 }} onClick={() => { setDuzenlenenKayitId(null); setManuelKayit({ firma_adi: '', yetkili: '', telefon: '', adres: '', vinc_bilgisi: '', aciliyet: 'Normal', ekip: '', sorun: '', lat: '', lng: '', ticket_type: 'ariza', pipeline_status: 'bekliyor' }); setSecilenManuelPersoneller([]); setManuelFormAcik(true); }} className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-2xl shadow-md border border-slate-700 hover:shadow-xl transition-all group text-left flex flex-col justify-between h-32 relative overflow-hidden">
                    <div className="absolute -right-4 -bottom-4 opacity-10"><Settings size={80}/></div>
                    <div className="bg-white/10 text-white w-10 h-10 rounded-xl flex items-center justify-center group-hover:bg-white/20 transition-colors relative z-10"><Plus size={20}/></div>
                    <div className="relative z-10"><h3 className="font-bold text-white text-sm">İş Emri Ekle</h3><p className="text-[10px] text-slate-400">Arıza veya Keşif Girişi</p></div>
                </motion.button>
                <motion.button whileHover={{ y: -3 }} onClick={() => router.push('/admin/yeni-vinc')} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all group text-left flex flex-col justify-between h-32"><div className="bg-blue-50 text-blue-600 w-10 h-10 rounded-xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors"><Plus size={20}/></div><div><h3 className="font-bold text-slate-700 text-sm">Yeni Vinç</h3><p className="text-[10px] text-slate-400">Envantere ekle</p></div></motion.button>
                <motion.button whileHover={{ y: -3 }} onClick={() => router.push('/admin/vincler')} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all group text-left flex flex-col justify-between h-32"><div className="bg-indigo-50 text-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors"><List size={20}/></div><div><h3 className="font-bold text-slate-700 text-sm">Vinç Listesi</h3><p className="text-[10px] text-slate-400">Filoyu yönet</p></div></motion.button>
                <motion.button whileHover={{ y: -3 }} onClick={() => router.push('/admin/analiz')} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:border-green-200 hover:shadow-md transition-all group text-left flex flex-col justify-between h-32"><div className="bg-green-50 text-green-600 w-10 h-10 rounded-xl flex items-center justify-center group-hover:bg-green-600 group-hover:text-white transition-colors"><TrendingUp size={20}/></div><div><h3 className="font-bold text-slate-700 text-sm">Finans</h3><p className="text-[10px] text-slate-400">Gelir raporları</p></div></motion.button>
                <motion.button whileHover={{ y: -3 }} onClick={() => router.push('/admin/malzemeler')} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:border-yellow-200 hover:shadow-md transition-all group text-left flex flex-col justify-between h-32"><div className="bg-yellow-50 text-yellow-600 w-10 h-10 rounded-xl flex items-center justify-center group-hover:bg-yellow-500 group-hover:text-white transition-colors"><Package size={20}/></div><div><h3 className="font-bold text-slate-700 text-sm">Depo</h3><p className="text-[10px] text-slate-400">Stok & Fiyat</p></div></motion.button>
                <motion.button whileHover={{ y: -3 }} onClick={() => router.push('/admin/teklifler')} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:border-purple-200 hover:shadow-md transition-all group text-left flex flex-col justify-between h-32"><div className="bg-purple-50 text-purple-600 w-10 h-10 rounded-xl flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors"><FileText size={20}/></div><div><h3 className="font-bold text-slate-700 text-sm">Teklif</h3><p className="text-[10px] text-slate-400">Sözleşme & Form</p></div></motion.button>
            </div>
        </div>

        {/* 3. BİLDİRİM LİSTESİ */}
        <div>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 mt-8 gap-4">
               <div className="flex items-center gap-3 w-full md:w-auto">
                   <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 whitespace-nowrap"><div className="w-1 h-6 bg-blue-500 rounded-full"></div> Operasyon Takibi</h2>
                   
                   <div className="relative w-full md:w-64 ml-2">
                      <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4"/>
                      <input type="text" placeholder="Firma, Sorun Ara..." value={aramaMetni} onChange={e => setAramaMetni(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 transition shadow-sm"/>
                   </div>
               </div>
               
               <div className="flex bg-slate-200/50 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
                   <button onClick={() => setAktifSekme('hepsi')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${aktifSekme === 'hepsi' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Tümü ({filtrelenmisBildirimler.length})</button>
                   <button onClick={() => setAktifSekme('bekliyor')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 whitespace-nowrap ${aktifSekme === 'bekliyor' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-orange-500'}`}><Clock size={12}/> Bekleyenler</button>
                   <button onClick={() => setAktifSekme('tamamlandi')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 whitespace-nowrap ${aktifSekme === 'tamamlandi' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500 hover:text-green-500'}`}><CheckCircle2 size={12}/> Çözülenler</button>
               </div>
            </div>

            <div className="space-y-4">
              {filtrelenmisBildirimler.length === 0 ? (
                <div className="bg-white p-12 rounded-3xl text-center border border-dashed border-slate-300">
                  <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle2 className="w-8 h-8 text-blue-500" /></div>
                  <h3 className="text-lg font-bold text-slate-700">Tertemiz!</h3><p className="text-slate-400 text-sm mt-1">Bu kategoride gösterilecek kayıt bulunamadı.</p>
                </div>
              ) : (
                filtrelenmisBildirimler.map((kayit) => {
                  const isKritik = kayit.priority === 'Kritik (Makine Durdu)';
                  
                  // Adres bilgisini kontrol et
                  const adresMetni = kayit.cranes?.location_address || kayit.manual_location;
                  const koordinatVarMi = kayit.lat && kayit.lng;
                  
                  // Satış Tüneli Kenar Rengi
                  let borderClass = 'border-slate-100 border-l-[6px] border-l-slate-400';
                  if(kayit.pipeline_status === 'tamamlandi') borderClass = 'border-slate-100 border-l-[6px] border-l-green-500 opacity-60';
                  else if(isKritik || kayit.pipeline_status === 'acil_cozum') borderClass = 'border-red-300 border-l-[6px] border-l-red-600 shadow-red-100 bg-red-50/20';
                  else if(kayit.pipeline_status === 'kesif_bekliyor') borderClass = 'border-purple-200 border-l-[6px] border-l-purple-500';
                  else if(kayit.pipeline_status === 'teklif_hazirlanacak') borderClass = 'border-orange-200 border-l-[6px] border-l-orange-500';
                  else if(kayit.pipeline_status === 'teklif_bekliyor') borderClass = 'border-yellow-200 border-l-[6px] border-l-yellow-500';
                  else if(kayit.pipeline_status === 'mudahale_edilecek') borderClass = 'border-blue-200 border-l-[6px] border-l-blue-500';

                  return (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={kayit.id} 
                    className={`bg-white p-6 rounded-3xl shadow-sm border hover:shadow-md transition-all relative overflow-hidden ${borderClass}`}>
                    
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      <div className="flex-1 space-y-3 w-full">
                        
                        {/* ROZETLER VE PİPELİNE DURUMU */}
                        <div className="flex flex-wrap items-center gap-2">
                            {getPipelineStatusBadge(kayit.pipeline_status)}
                            
                            <span className="text-slate-400 text-[10px] font-bold font-mono bg-slate-100 px-3 py-1 rounded-full flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(kayit.created_at).toLocaleString('tr-TR', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' })}</span>
                            
                            {/* Tür Rozeti */}
                            {kayit.ticket_type === 'kesif' ? (
                                <span className="bg-purple-50 text-purple-600 border border-purple-200 text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1"><Eye size={12}/> KEŞİF TALEBİ</span>
                            ) : (
                                <span className="bg-slate-50 text-slate-600 border border-slate-200 text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1"><Wrench size={12}/> ARIZA BİLDİRİMİ</span>
                            )}

                            {/* Ekip Atama Rozeti */}
                            {kayit.assigned_team && (
                                <span className="bg-blue-50 text-blue-600 border border-blue-200 text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1">
                                    <Truck className="w-3 h-3"/> Ekip: {kayit.assigned_team}
                                </span>
                            )}
                            
                            {kayit.manual_customer_name && (
                                <span className="bg-slate-800 text-white text-[9px] font-bold px-2 py-1 rounded-full flex items-center gap-1"><User size={10}/> Dış Servis (Manuel)</span>
                            )}
                        </div>

                        {/* MÜŞTERİ BİLGİLERİ */}
                        <div>
                          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                              {kayit.cranes?.customer_name || kayit.manual_customer_name || "Bilinmeyen Müşteri"}
                          </h3>
                          <div className="flex flex-wrap items-center gap-3 text-slate-500 text-xs mt-1">
                              
                              <div className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3 text-blue-500" /> 
                                  <span>
                                      {adresMetni ? adresMetni : koordinatVarMi ? "📍 Harita Konumu Girildi" : "Adres Belirtilmemiş"}
                                  </span>
                                  {koordinatVarMi && (
                                      <button 
                                          onClick={() => haritayaGit(kayit.lat, kayit.lng)}
                                          className="ml-2 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 px-2 py-0.5 rounded text-[10px] font-bold transition flex items-center gap-1 shadow-sm"
                                      >
                                          <Map size={10}/> Haritada Gör
                                      </button>
                                  )}
                              </div>
                              
                              {/* Telefon (Tıklanabilir) */}
                              {kayit.manual_phone && (
                                  <a href={`tel:${kayit.manual_phone}`} className="flex items-center gap-1 text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded hover:bg-emerald-100 transition">
                                      <Phone className="w-3 h-3" /> {kayit.manual_phone}
                                  </a>
                              )}
                              
                              {(kayit.cranes?.model_name || kayit.manual_crane_info) && (
                                  <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                      {kayit.cranes?.model_name || kayit.manual_crane_info}
                                  </span>
                              )}

                              {kayit.manual_customer_rep && (
                                  <span className="font-semibold text-slate-500"><User size={12} className="inline mr-1"/>{kayit.manual_customer_rep}</span>
                              )}
                          </div>
                        </div>

                        {/* SORUN DETAYI */}
                        <div className={`p-4 rounded-xl border text-sm relative ${(isKritik || kayit.pipeline_status === 'acil_cozum') && kayit.pipeline_status !== 'tamamlandi' ? 'bg-red-50 border-red-100 text-red-900' : 'bg-slate-50 border-slate-100 text-slate-700'}`}>
                            <Wrench className={`w-6 h-6 absolute top-2 right-2 ${(isKritik || kayit.pipeline_status === 'acil_cozum') ? 'text-red-200' : 'text-slate-200'}`} />
                            <span className="font-bold block mb-1 text-xs uppercase">Sorun / Arıza / Keşif Detayı:</span> 
                            <p className="whitespace-pre-line">{kayit.description}</p>
                        </div>
                        
                        {/* SES KAYDI VE ÇOKLU MEDYA GÖRÜNTÜLEME */}
                        <div className="pt-3 space-y-3">
                            {/* SES KAYDI */}
                            {kayit.audio_url && (
                                <div className="bg-slate-100 p-3 rounded-xl border border-slate-200 shadow-inner">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 mb-2"><Mic size={12} className="text-blue-500"/> Müşteri Ses Kaydı:</span>
                                    <audio src={kayit.audio_url} controls className="h-10 w-full md:w-80 rounded-lg shadow-sm" />
                                </div>
                            )}

                            {/* ÇOKLU MEDYA (FOTO/VİDEO) */}
                            {kayit.media_urls && kayit.media_urls.length > 0 && (
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 mb-2"><Camera size={12} className="text-blue-500"/> Müşteri Eklediği Medyalar ({kayit.media_urls.length}):</span>
                                    <div className="flex gap-2 overflow-x-auto pb-1">
                                        {kayit.media_urls.map((url: string, i: number) => (
                                            <a key={i} href={url} target="_blank" rel="noreferrer" className="shrink-0 bg-white text-slate-700 px-3 py-2 rounded-lg text-xs font-bold hover:text-blue-600 hover:border-blue-300 transition border border-slate-200 flex items-center gap-2 shadow-sm">
                                                <ImageIcon size={14}/> Dosya {i+1}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                      </div>

                      {/* 🔥 İŞLEM VE PIPELINE BUTONLARI 🔥 */}
                      <div className="w-full md:w-[220px] flex flex-col gap-2 shrink-0">
                          
                          {/* 🔥 YENİ: TEKLİF GÖRÜNTÜLEME BUTONU 🔥 */}
                          {teklifler.some(t => t.related_ticket_id === kayit.id) && (
                              <button 
                                  onClick={() => {
                                      const teklif = teklifler.find(t => t.related_ticket_id === kayit.id);
                                      setSeciliTeklif(teklif);
                                      setOnizlemeAcik(true);
                                  }}
                                  className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-md mb-1"
                              >
                                  <Printer size={14} className="text-blue-400"/> GÖNDERİLEN TEKLİFİ GÖR
                              </button>
                          )}

                          {kayit.pipeline_status !== 'tamamlandi' && (
                              <div className="bg-slate-50 border border-slate-200 p-2 rounded-xl flex flex-col gap-2 mb-2">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase text-center">Durumu Güncelle</span>
                                  
                                  {/* Süreç İlerletme Butonları */}
                                  <div className="grid grid-cols-2 gap-1.5">
                                      <button onClick={() => durumGuncelle(kayit.id, 'kesif_bekliyor')} className="bg-purple-100 hover:bg-purple-200 text-purple-700 p-2 rounded-lg text-[9px] font-bold transition flex items-center justify-center" title="Keşif Bekliyor"><Eye size={12}/></button>
                                      <button onClick={() => durumGuncelle(kayit.id, 'teklif_hazirlanacak')} className="bg-orange-100 hover:bg-orange-200 text-orange-700 p-2 rounded-lg text-[9px] font-bold transition flex items-center justify-center" title="Teklif Hazırlanacak"><FileText size={12}/></button>
                                      <button onClick={() => durumGuncelle(kayit.id, 'teklif_bekliyor')} className="bg-yellow-100 hover:bg-yellow-200 text-yellow-700 p-2 rounded-lg text-[9px] font-bold transition flex items-center justify-center" title="Teklif Onayı Bekleniyor"><Clock size={12}/></button>
                                      <button onClick={() => durumGuncelle(kayit.id, 'mudahale_edilecek')} className="bg-blue-100 hover:bg-blue-200 text-blue-700 p-2 rounded-lg text-[9px] font-bold transition flex items-center justify-center" title="Onaylandı / Gidilecek"><Truck size={12}/></button>
                                  </div>
                                  
                                  <button onClick={() => durumGuncelle(kayit.id, 'acil_cozum')} className="w-full bg-red-100 hover:bg-red-200 text-red-700 py-2 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1"><AlertTriangle size={12}/> ACİL ÇÖZÜM</button>
                                  <button onClick={() => durumGuncelle(kayit.id, 'tamamlandi')} className="w-full bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-lg text-xs font-bold transition shadow-sm flex items-center justify-center gap-1"><CheckCircle2 size={14}/> ÇÖZÜLDÜ (BİTİR)</button>
                              </div>
                          )}

                          {/* QR ile gelenlerde müşteri chat açılsın */}
                          {!kayit.manual_customer_name && (
                              <button onClick={() => setAktifChatId(aktifChatId === kayit.id ? null : kayit.id)} className="w-full bg-white border border-slate-200 text-slate-600 font-bold py-2.5 px-4 rounded-xl text-xs hover:bg-slate-50 transition flex items-center justify-center gap-2 shadow-sm"><span>💬 {aktifChatId === kayit.id ? 'Sohbeti Kapat' : 'Müşteriye Yaz'}</span></button>
                          )}

                          {/* DÜZENLE VE SİL BUTONLARI */}
                          <div className="flex gap-2 w-full mt-1">
                              <button onClick={() => kayitDuzenleAc(kayit)} className="flex-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 shadow-sm"><Edit2 size={12}/> Düzenle</button>
                              <button onClick={() => kayitSil(kayit.id)} className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 shadow-sm"><Trash2 size={12}/> Sil</button>
                          </div>
                      </div>
                    </div>
                    {/* CHAT ALANI ENTEGRASYONU */}
                    <AnimatePresence>
                        {aktifChatId === kayit.id && !kayit.manual_customer_name && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-6 border-t pt-4 overflow-hidden">
                              <ChatAlani ticketId={kayit.id} kimimBen="admin" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                  </motion.div>
                )})
              )}
            </div>
        </div>

      </div>

      {/* =========================================================================
          🔥 MODAL: GELİŞMİŞ MANUEL ARIZA GİRİŞ VE DÜZENLEME FORMU 🔥
          ========================================================================= */}
      <AnimatePresence>
        {manuelFormAcik && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto" onClick={() => { setManuelFormAcik(false); setSecilenManuelPersoneller([]); setManuelKayit({ firma_adi: '', yetkili: '', telefon: '', adres: '', vinc_bilgisi: '', aciliyet: 'Normal', ekip: '', sorun: '', lat: '', lng: '', ticket_type: 'ariza', pipeline_status: 'bekliyor' }); setDuzenlenenKayitId(null); }}>
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-3xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col my-auto" onClick={e => e.stopPropagation()}>
                    
                    {/* Modal Başlık */}
                    <div className="p-6 md:p-8 bg-slate-900 text-white flex justify-between items-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5"><Settings size={100}/></div>
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="p-3 bg-blue-500/20 rounded-2xl text-blue-400 border border-blue-500/30"><Wrench size={24}/></div>
                            <div>
                                <h2 className="text-2xl font-black tracking-tight">{duzenlenenKayitId ? 'Kayıt Düzenle' : 'Yeni İş Emri Oluştur'}</h2>
                                <p className="text-xs text-blue-400 font-bold uppercase tracking-widest mt-1">Sahaya veya Ofise Yönlendir</p>
                            </div>
                        </div>
                        <button onClick={() => { setManuelFormAcik(false); setSecilenManuelPersoneller([]); setManuelKayit({ firma_adi: '', yetkili: '', telefon: '', adres: '', vinc_bilgisi: '', aciliyet: 'Normal', ekip: '', sorun: '', lat: '', lng: '', ticket_type: 'ariza', pipeline_status: 'bekliyor' }); setDuzenlenenKayitId(null); }} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-red-500 p-2.5 rounded-full transition relative z-10"><X size={20}/></button>
                    </div>

                    {/* Form İçeriği */}
                    <div className="p-6 md:p-8 space-y-6 bg-slate-50">

                        {/* 🔥 YENİ: İŞİN TÜRÜNÜ SEÇ (ARIZA MI KEŞİF Mİ) 🔥 */}
                        <div className="bg-white p-2 rounded-xl border border-slate-200 flex shadow-sm">
                            <button onClick={() => setManuelKayit({...manuelKayit, ticket_type: 'ariza', pipeline_status: 'acil_cozum'})} className={`flex-1 py-3 text-sm font-bold rounded-lg transition ${manuelKayit.ticket_type === 'ariza' ? 'bg-red-50 text-red-600 border border-red-200' : 'text-slate-500 hover:bg-slate-50'}`}>🚨 DİREKT ARIZA (ÇÖZÜM)</button>
                            <button onClick={() => setManuelKayit({...manuelKayit, ticket_type: 'kesif', pipeline_status: 'kesif_bekliyor'})} className={`flex-1 py-3 text-sm font-bold rounded-lg transition ${manuelKayit.ticket_type === 'kesif' ? 'bg-purple-50 text-purple-600 border border-purple-200' : 'text-slate-500 hover:bg-slate-50'}`}>👀 ÖNCE KEŞİF / TEKLİF</button>
                        </div>
                        
                        {/* Müşteri Temel Bilgiler */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><Building2 size={12}/> Firma / Müşteri Adı <span className="text-red-500">*</span></label>
                                <input type="text" placeholder="Örn: Togg Fabrikası" value={manuelKayit.firma_adi} onChange={e => setManuelKayit({...manuelKayit, firma_adi: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm"/>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><User size={12}/> Yetkili Kişi (Opsiyonel)</label>
                                <input type="text" placeholder="Örn: Ahmet Bey" value={manuelKayit.yetkili} onChange={e => setManuelKayit({...manuelKayit, yetkili: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm"/>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><Phone size={12}/> İletişim Numarası</label>
                                <input type="text" placeholder="Örn: 0532 123 45 67" value={manuelKayit.telefon} onChange={e => setManuelKayit({...manuelKayit, telefon: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm"/>
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><MapPin size={12}/> Açık Adres / Lokasyon</label>
                                <input type="text" placeholder="Örn: İnegöl OSB, 1. Cadde" value={manuelKayit.adres} onChange={e => setManuelKayit({...manuelKayit, adres: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm"/>
                            </div>
                            
                            {/* HARİTA KOORDİNATLARI (ENLEM VE BOYLAM) */}
                            <div className="md:col-span-2 grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><MapPin size={12}/> Enlem (Lat)</label>
                                    <input type="number" placeholder="Örn: 40.1826" value={manuelKayit.lat} onChange={e => setManuelKayit({...manuelKayit, lat: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm"/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><MapPin size={12}/> Boylam (Lng)</label>
                                    <input type="number" placeholder="Örn: 28.9338" value={manuelKayit.lng} onChange={e => setManuelKayit({...manuelKayit, lng: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm"/>
                                </div>
                            </div>
                        </div>

                        <div className="h-px w-full bg-slate-200 my-2"></div>

                        {/* İş ve Vinç Detayları */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><Settings size={12}/> Makine / Vinç Bilgisi</label>
                                <input type="text" placeholder="Örn: 10 Ton Çift Kiriş Gezer Köprülü" value={manuelKayit.vinc_bilgisi} onChange={e => setManuelKayit({...manuelKayit, vinc_bilgisi: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm"/>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><AlertTriangle size={12}/> Aciliyet</label>
                                <select value={manuelKayit.aciliyet} onChange={e => setManuelKayit({...manuelKayit, aciliyet: e.target.value})} className={`w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm cursor-pointer ${manuelKayit.aciliyet === 'Kritik (Makine Durdu)' ? 'text-red-600 bg-red-50 border-red-200' : ''}`}>
                                    <option value="Düşük">Düşük (Müsaitlikte)</option>
                                    <option value="Normal">Normal (Planlı)</option>
                                    <option value="Yüksek">Yüksek (Aynı Gün)</option>
                                    <option value="Kritik (Makine Durdu)">🚨 KRİTİK (MAKİNE DURDU)</option>
                                </select>
                            </div>
                        </div>

                        <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-3">
                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2"><Truck size={12}/> Operasyona Yönlendirilecek Ekip (Seçiniz)</span>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {PERSONEL_LISTESI.map((personel) => (
                                    <button
                                        key={personel}
                                        onClick={() => manuelPersonelSeciminiGuncelle(personel)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition border ${secilenManuelPersoneller.includes(personel) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                    >
                                        {secilenManuelPersoneller.includes(personel) ? <CheckSquare size={14}/> : <Square size={14}/>}
                                        {personel}
                                    </button>
                                ))}
                            </div>
                            <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200">
                                <span className="text-xs text-blue-700 font-bold">
                                    {manuelKayit.ekip || 'Henüz Kimse Seçilmedi'}
                                </span>
                                {secilenManuelPersoneller.length > 0 && (
                                    <button 
                                        onClick={() => { setSecilenManuelPersoneller([]); setManuelKayit({...manuelKayit, ekip: ''}); }} 
                                        className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition" 
                                        title="Seçimi Temizle"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Sorun Detayı */}
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><AlertCircle size={12}/> Arıza Detayı / Keşif Bildirimi <span className="text-red-500">*</span></label>
                            <textarea rows={4} placeholder="Müşterinin bildirdiği sorunu veya keşif amacını buraya detaylıca yazın..." value={manuelKayit.sorun} onChange={e => setManuelKayit({...manuelKayit, sorun: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm leading-relaxed"/>
                        </div>
                    </div>

                    <div className="p-6 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
                        <button onClick={() => { setManuelFormAcik(false); setSecilenManuelPersoneller([]); setManuelKayit({ firma_adi: '', yetkili: '', telefon: '', adres: '', vinc_bilgisi: '', aciliyet: 'Normal', ekip: '', sorun: '', lat: '', lng: '', ticket_type: 'ariza', pipeline_status: 'bekliyor' }); setDuzenlenenKayitId(null); }} className="px-6 py-3.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition text-sm">İptal</button>
                        <button onClick={manuelArizaKaydet} disabled={kaydediliyor} className="px-8 py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-200 flex items-center gap-2 text-sm active:scale-95">
                            {kaydediliyor ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>}
                            {kaydediliyor ? 'Kaydediliyor...' : duzenlenenKayitId ? 'Değişiklikleri Kaydet' : 'İş Emrini Sisteme Gönder'}
                        </button>
                    </div>

                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* --- MODAL: TEKLİF ÖNİZLEME (A4 KAĞIT) --- */}
      <AnimatePresence>
        {onizlemeAcik && seciliTeklif && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-slate-900/90 z-[9999] flex items-center justify-center p-4">
                
                <div className="bg-slate-200 w-full max-w-5xl h-[95vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden relative">
                    
                    {/* --- ÜST BAR (Başlık) --- */}
                    <div className="bg-slate-800 text-white p-4 flex justify-between items-center shrink-0 z-50 shadow-md">
                        <h3 className="font-bold flex items-center gap-2"><FileCheck size={18}/> Teklif Önizleme</h3>
                        <button onClick={() => setOnizlemeAcik(false)} className="hover:bg-slate-700 p-2 rounded-full"><X size={20}/></button>
                    </div>

                    {/* --- ORTA KISIM (KAYDIRILABİLİR ALAN) --- */}
                    <div className="flex-1 overflow-y-auto p-8 flex justify-center bg-slate-600/50">
                        
                        {/* A4 KAĞIDI */}
                        <div ref={printRef} className="bg-white w-[210mm] min-h-[297mm] p-[15mm] shadow-xl relative text-black shrink-0">
                            
                            {/* HEADER: LOGO VE FİRMA BİLGİSİ */}
                            <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4 mb-8">
                                <div>
                                    <h1 className="text-3xl font-black text-slate-800 tracking-tighter">BUVİSAN</h1>
                                    <p className="text-sm font-bold text-slate-500">MAKİNA İMALAT SANAYİ VE TİCARET LİMİTED ŞİRKETİ</p>
                                </div>
                                <div className="text-right text-xs text-slate-600">
                                    <p>Demirci / Nilüfer / BURSA</p>
                                    <p>Tel: 0224 374 00 01</p>
                                    <p>Web: www.buvisan.com</p>
                                </div>
                            </div>

                            {/* BELGE BAŞLIĞI */}
                            <div className="text-center mb-8">
                                <h2 className="text-xl font-bold uppercase border-b border-slate-300 inline-block pb-1">
                                    {seciliTeklif.template_type === 'standart' ? 'FİYAT TEKLİF FORMU' : 
                                     seciliTeklif.template_type === 'bakim' ? 'PERİYODİK BAKIM SÖZLEŞMESİ' : 'SİPARİŞ FORMU'}
                                </h2>
                                <p className="text-xs text-slate-400 mt-1">Tarih: {new Date(seciliTeklif.offer_date).toLocaleDateString('tr-TR')}</p>
                            </div>

                            {/* MÜŞTERİ BİLGİLERİ */}
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-8 text-sm">
                                <div className="grid grid-cols-[100px_1fr] gap-2 mb-2">
                                    <span className="font-bold text-slate-600">Sayın:</span>
                                    <span>{seciliTeklif.customer_rep || 'Yetkili'}</span>
                                </div>
                                <div className="grid grid-cols-[100px_1fr] gap-2 mb-2">
                                    <span className="font-bold text-slate-600">Firma:</span>
                                    <span className="uppercase font-bold">{seciliTeklif.customer_name}</span>
                                </div>
                                <div className="grid grid-cols-[100px_1fr] gap-2">
                                    <span className="font-bold text-slate-600">Adres:</span>
                                    <span>{seciliTeklif.customer_address}</span>
                                </div>
                            </div>

                            {/* TABLO */}
                            <table className="w-full mb-8 border-collapse">
                                <thead>
                                    <tr className="bg-slate-100 text-slate-700 text-xs uppercase border-y border-slate-300">
                                        <th className="p-3 text-left">Açıklama / Malzeme</th>
                                        <th className="p-3 text-center">Miktar</th>
                                        <th className="p-3 text-right">Birim Fiyat</th>
                                        <th className="p-3 text-right">Tutar</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {seciliTeklif.items && seciliTeklif.items.map((item: any, i: number) => (
                                        <tr key={i} className="border-b border-slate-100">
                                            <td className="p-3">{item.ad}</td>
                                            <td className="p-3 text-center">{item.adet}</td>
                                            <td className="p-3 text-right">{Number(item.birim_fiyat).toLocaleString()} ₺</td>
                                            <td className="p-3 text-right font-bold">{Number(item.toplam).toLocaleString()} ₺</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-slate-800">
                                        <td colSpan={3} className="p-3 text-right font-bold uppercase text-slate-600">Genel Toplam</td>
                                        <td className="p-3 text-right font-black text-lg">{Number(seciliTeklif.total_price).toLocaleString()} ₺</td>
                                    </tr>
                                </tfoot>
                            </table>

                            {/* NOTLAR */}
                            <div className="mb-12">
                                <h4 className="font-bold text-sm border-b border-slate-200 mb-2 pb-1">Notlar ve Şartlar:</h4>
                                <div className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                                    {seciliTeklif.description || 'Bu teklif 15 gün süreyle geçerlidir. Fiyatlara KDV dahil değildir.'}
                                </div>
                            </div>

                            {/* İMZA */}
                            <div className="flex justify-between mt-auto pt-12 pb-8">
                                <div className="text-center">
                                    <p className="font-bold text-sm mb-12">Müşteri Onayı</p>
                                    <div className="border-t border-slate-400 w-32 mx-auto"></div>
                                    <p className="text-xs text-slate-400 mt-1">İmza / Kaşe</p>
                                </div>
                                <div className="text-center">
                                    <p className="font-bold text-sm mb-12">BUVİSAN Onayı</p>
                                    <div className="border-t border-slate-400 w-32 mx-auto"></div>
                                    <p className="text-xs text-slate-400 mt-1">İmza / Kaşe</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* --- ALT BAR (SABİT AKSİYON BUTONLARI) --- */}
                    <div className="bg-white border-t p-4 flex justify-center gap-4 shrink-0 z-50 shadow-[0_-5px_15px_rgba(0,0,0,0.1)]">
                        <button onClick={() => {
                            const win = window.open('', '', 'width=900,height=650');
                            win?.document.write('<html><head><title>Buvisan Teklif</title><script src="https://cdn.tailwindcss.com"></script><style>@media print { body { -webkit-print-color-adjust: exact; } }</style></head><body>' + printRef.current?.innerHTML + '</body></html>');
                            win?.document.close();
                            win?.focus();
                            setTimeout(() => { win?.print(); win?.close(); }, 500);
                        }} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-700 flex items-center gap-2 transform active:scale-95 transition">
                            <Printer size={20}/> Yazdır / PDF Kaydet
                        </button>
                        <button onClick={() => setOnizlemeAcik(false)} className="bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-200">
                            Kapat
                        </button>
                    </div>

                </div>
            </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}