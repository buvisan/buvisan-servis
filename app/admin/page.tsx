"use client";
// --------------------------------------------------------
// BUVISAN ADMIN PANELİ - ANA KUMANDA MERKEZİ V3.5 🛠️
// (Manuel İş Emrine Harita Koordinatları - Lat/Lng Eklendi 📍)
// --------------------------------------------------------

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ChatAlani from '@/components/ChatAlani'; 
import { 
  LogOut, Plus, List, MapPin, AlertCircle, CheckCircle2, Clock, 
  Camera, LayoutDashboard, Globe, Wrench, ChevronRight, Activity, 
  Package, FileText, TrendingUp, User, Building2, Save, X, Phone, 
  AlertTriangle, Truck, Settings, CheckSquare, Square, Trash2, Loader2, Car, Video, Mic, Image as ImageIcon, Edit2
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

  const [manuelFormAcik, setManuelFormAcik] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [duzenlenenKayitId, setDuzenlenenKayitId] = useState<string | null>(null);
  
  const [secilenManuelPersoneller, setSecilenManuelPersoneller] = useState<string[]>([]);
  
  // 🔥 YENİ: State içine lat ve lng eklendi 🔥
  const [manuelKayit, setManuelKayit] = useState({
      firma_adi: '', yetkili: '', telefon: '', adres: '', vinc_bilgisi: '', aciliyet: 'Normal', ekip: '', sorun: '', lat: '', lng: ''
  });

  useEffect(() => { guvenlikVeVeri(); }, []);

  async function guvenlikVeVeri() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.replace('/login'); return; }

        const { data: profil } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        if (!profil || profil.role !== 'admin') { router.replace('/personel'); return; }

        setErisimIzni(true);

        const { data } = await supabase.from('service_tickets').select('*, cranes(*)').order('created_at', { ascending: false });

        if (data) {
            setBildirimler(data);
            setIstatistikler({
                bekleyen: data.filter(x => x.status !== 'tamamlandi').length,
                cozulen: data.filter(x => x.status === 'tamamlandi').length,
                toplam: data.length
            });
        }
    } catch (error) { console.error("Hata:", error); } 
    finally { setYukleniyor(false); }
  }

  async function durumuGuncelle(id: string, yeniDurum: string) {
    if(!confirm("Bu arızayı 'Çözüldü' olarak işaretlemek istiyor musun?")) return;
    const { error } = await supabase.from('service_tickets').update({ status: yeniDurum }).eq('id', id);
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
          lat: kayit.lat || '', // 🔥 YENİ: Veritabanından gelen enlem
          lng: kayit.lng || ''  // 🔥 YENİ: Veritabanından gelen boylam
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

      const veriPaketi = {
          description: manuelKayit.sorun, manual_customer_name: manuelKayit.firma_adi, manual_customer_rep: manuelKayit.yetkili,
          manual_phone: manuelKayit.telefon, manual_location: manuelKayit.adres, manual_crane_info: manuelKayit.vinc_bilgisi,
          priority: manuelKayit.aciliyet, assigned_team: manuelKayit.ekip,
          lat: manuelKayit.lat ? Number(manuelKayit.lat) : null, // 🔥 YENİ: Enlem kaydediliyor
          lng: manuelKayit.lng ? Number(manuelKayit.lng) : null  // 🔥 YENİ: Boylam kaydediliyor
      };

      let error;
      if (duzenlenenKayitId) error = (await supabase.from('service_tickets').update(veriPaketi).eq('id', duzenlenenKayitId)).error;
      else error = (await supabase.from('service_tickets').insert([{ ...veriPaketi, status: 'bekliyor' }])).error;

      setKaydediliyor(false);

      if (error) alert("Kaydedilemedi: " + error.message);
      else {
          setManuelFormAcik(false); setSecilenManuelPersoneller([]);
          setManuelKayit({ firma_adi: '', yetkili: '', telefon: '', adres: '', vinc_bilgisi: '', aciliyet: 'Normal', ekip: '', sorun: '', lat: '', lng: '' });
          setDuzenlenenKayitId(null); guvenlikVeVeri(); 
      }
  }

  async function cikisYap() { await supabase.auth.signOut(); router.push('/login'); }

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
                    <div className="text-sm md:text-base font-medium opacity-90">{istatistikler.bekleyen > 0 ? "Adet Bekleyen Arıza Kaydı Var!" : "Müdahale bekleyen arıza yok."}</div>
                </div>
                <div className="relative z-10 mt-4"><span className="bg-white/20 hover:bg-white/30 backdrop-blur-sm px-4 py-2 rounded-xl text-xs font-bold transition cursor-default">Toplam {istatistikler.toplam} Kayıt</span></div>
            </motion.div>

            <div className="hidden md:flex bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex-col justify-center items-center text-center">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4"><LayoutDashboard size={32}/></div>
                <h3 className="text-slate-800 font-bold text-lg">Yönetim Paneli</h3>
                <p className="text-slate-400 text-xs mt-1">v3.5 Aktif</p>
                <div className="mt-4 w-full h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 w-2/3 rounded-full"></div></div>
            </div>
        </div>

        {/* OPERASYON MENÜSÜ */}
        <div>
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><div className="w-1 h-6 bg-slate-800 rounded-full"></div> Operasyonlar</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <motion.button whileHover={{ y: -3 }} onClick={() => { setDuzenlenenKayitId(null); setManuelKayit({ firma_adi: '', yetkili: '', telefon: '', adres: '', vinc_bilgisi: '', aciliyet: 'Normal', ekip: '', sorun: '', lat: '', lng: '' }); setSecilenManuelPersoneller([]); setManuelFormAcik(true); }} className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-2xl shadow-md border border-slate-700 hover:shadow-xl transition-all group text-left flex flex-col justify-between h-32 relative overflow-hidden">
                    <div className="absolute -right-4 -bottom-4 opacity-10"><Settings size={80}/></div>
                    <div className="bg-white/10 text-white w-10 h-10 rounded-xl flex items-center justify-center group-hover:bg-white/20 transition-colors relative z-10"><Plus size={20}/></div>
                    <div className="relative z-10"><h3 className="font-bold text-white text-sm">İş Emri Ekle</h3><p className="text-[10px] text-slate-400">Manuel arıza kaydı</p></div>
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
            <div className="flex items-center justify-between mb-4 mt-8">
               <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><div className="w-1 h-6 bg-red-500 rounded-full"></div> Bekleyen İşler / Bildirimler</h2>
               <span className="text-xs font-bold text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-200">{bildirimler.length} Kayıt</span>
            </div>

            <div className="space-y-4">
              {bildirimler.length === 0 ? (
                <div className="bg-white p-12 rounded-3xl text-center border border-dashed border-slate-300">
                  <div className="bg-green-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle2 className="w-8 h-8 text-green-500" /></div>
                  <h3 className="text-lg font-bold text-slate-700">Tertemiz!</h3><p className="text-slate-400 text-sm mt-1">Bekleyen iş emri bulunmuyor.</p>
                </div>
              ) : (
                bildirimler.map((kayit) => {
                  const isKritik = kayit.priority === 'Kritik (Makine Durdu)';
                  
                  return (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={kayit.id} 
                    className={`bg-white p-6 rounded-3xl shadow-sm border hover:shadow-md transition-all relative overflow-hidden 
                    ${kayit.status === 'tamamlandi' ? 'border-slate-100 border-l-[6px] border-l-green-500 opacity-60' : 
                      isKritik ? 'border-red-300 border-l-[6px] border-l-red-600 shadow-red-100 bg-red-50/20' : 'border-slate-100 border-l-[6px] border-l-orange-400'}`}>
                    
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      <div className="flex-1 space-y-3 w-full">
                        
                        {/* ROZETLER */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`px-3 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 shadow-sm border ${kayit.status === 'tamamlandi' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-orange-100 text-orange-700 border-orange-200 animate-pulse'}`}>
                                {kayit.status === 'tamamlandi' ? <CheckCircle2 className="w-3 h-3"/> : <Clock className="w-3 h-3"/>}
                                {kayit.status === 'tamamlandi' ? 'ÇÖZÜLDÜ' : 'BEKLİYOR'}
                            </span>
                            <span className="text-slate-400 text-[10px] font-bold font-mono bg-slate-100 px-3 py-1 rounded-full flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(kayit.created_at).toLocaleString('tr-TR', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' })}</span>
                            
                            {/* Kritik Rozeti */}
                            {isKritik && kayit.status !== 'tamamlandi' && (
                                <span className="bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 animate-bounce shadow-lg shadow-red-500/50">
                                    <AlertTriangle className="w-3 h-3"/> MAKİNE DURDU!
                                </span>
                            )}

                            {/* Ekip Atama Rozeti */}
                            {kayit.assigned_team && (
                                <span className="bg-blue-50 text-blue-600 border border-blue-200 text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1">
                                    <Truck className="w-3 h-3"/> Ekip: {kayit.assigned_team}
                                </span>
                            )}
                            
                            {kayit.manual_customer_name && (
                                <span className="bg-slate-800 text-white text-[9px] font-bold px-2 py-1 rounded-full flex items-center gap-1"><Wrench size={10}/> Talep/Manuel</span>
                            )}
                        </div>

                        {/* MÜŞTERİ BİLGİLERİ */}
                        <div>
                          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                              {kayit.cranes?.customer_name || kayit.manual_customer_name || "Bilinmeyen Müşteri"}
                          </h3>
                          <div className="flex flex-wrap items-center gap-3 text-slate-500 text-xs mt-1">
                              <div className="flex items-center gap-1"><MapPin className="w-3 h-3 text-blue-500" /> <span>{kayit.cranes?.location_address || kayit.manual_location || "Adres Belirtilmemiş"}</span></div>
                              
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
                        <div className={`p-4 rounded-xl border text-sm relative ${isKritik && kayit.status !== 'tamamlandi' ? 'bg-red-50 border-red-100 text-red-900' : 'bg-slate-50 border-slate-100 text-slate-700'}`}>
                            <Wrench className={`w-6 h-6 absolute top-2 right-2 ${isKritik ? 'text-red-200' : 'text-slate-200'}`} />
                            <span className="font-bold block mb-1 text-xs uppercase">Sorun / Arıza Detayı:</span> 
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

                            {/* ESKİ TEKLİ MEDYA İÇİN GERİYE DÖNÜK UYUMLULUK */}
                            {kayit.media_url && (!kayit.media_urls || kayit.media_urls.length === 0) && (
                                <div>
                                    <a href={kayit.media_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-100 transition border border-blue-100 shadow-sm"><Camera className="w-3 h-3" /> Fotoğrafı Görüntüle</a>
                                </div>
                            )}
                        </div>

                      </div>

                      {/* İŞLEM BUTONLARI */}
                      <div className="w-full md:w-auto flex flex-col gap-2 min-w-[200px]">
                          {kayit.status !== 'tamamlandi' && (<button onClick={() => durumuGuncelle(kayit.id, 'tamamlandi')} className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-green-200 transition-all flex items-center justify-center gap-2 text-sm"><CheckCircle2 className="w-4 h-4" /> <span>Çözüldü İşaretle</span></button>)}
                          
                          {/* QR ile gelenlerde müşteri chat açılsın */}
                          {!kayit.manual_customer_name && (
                              <button onClick={() => setAktifChatId(aktifChatId === kayit.id ? null : kayit.id)} className="w-full bg-white border border-slate-200 text-slate-600 font-bold py-3 px-4 rounded-xl text-sm hover:bg-slate-50 transition flex items-center justify-center gap-2"><span>💬 {aktifChatId === kayit.id ? 'Sohbeti Kapat' : 'Müşteriyle Mesajlaş'}</span></button>
                          )}

                          {/* DÜZENLE VE SİL BUTONLARI */}
                          <div className="flex gap-2 w-full mt-1">
                              <button onClick={() => kayitDuzenleAc(kayit)} className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"><Edit2 size={14}/> Düzenle</button>
                              <button onClick={() => kayitSil(kayit.id)} className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"><Trash2 size={14}/> Sil</button>
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto" onClick={() => { setManuelFormAcik(false); setSecilenManuelPersoneller([]); setManuelKayit({ firma_adi: '', yetkili: '', telefon: '', adres: '', vinc_bilgisi: '', aciliyet: 'Normal', ekip: '', sorun: '', lat: '', lng: '' }); setDuzenlenenKayitId(null); }}>
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-3xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col my-auto" onClick={e => e.stopPropagation()}>
                    
                    {/* Modal Başlık */}
                    <div className="p-6 md:p-8 bg-slate-900 text-white flex justify-between items-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5"><Settings size={100}/></div>
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="p-3 bg-blue-500/20 rounded-2xl text-blue-400 border border-blue-500/30"><Wrench size={24}/></div>
                            <div>
                                <h2 className="text-2xl font-black tracking-tight">{duzenlenenKayitId ? 'Kayıt Düzenle' : 'Yeni İş Emri Oluştur'}</h2>
                                <p className="text-xs text-blue-400 font-bold uppercase tracking-widest mt-1">Saha Ekiplerine Yönlendir</p>
                            </div>
                        </div>
                        <button onClick={() => { setManuelFormAcik(false); setSecilenManuelPersoneller([]); setManuelKayit({ firma_adi: '', yetkili: '', telefon: '', adres: '', vinc_bilgisi: '', aciliyet: 'Normal', ekip: '', sorun: '', lat: '', lng: '' }); setDuzenlenenKayitId(null); }} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-red-500 p-2.5 rounded-full transition relative z-10"><X size={20}/></button>
                    </div>

                    {/* Form İçeriği */}
                    <div className="p-6 md:p-8 space-y-6 bg-slate-50">
                        
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
                            
                            {/* 🔥 YENİ: HARİTA KOORDİNATLARI (ENLEM VE BOYLAM) 🔥 */}
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
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><AlertCircle size={12}/> Arıza Detayı / Müşteri Bildirimi <span className="text-red-500">*</span></label>
                            <textarea rows={4} placeholder="Müşterinin telefonda bildirdiği sorunu buraya detaylıca yazın... Bu bilgi sahaya iş emri olarak düşecek." value={manuelKayit.sorun} onChange={e => setManuelKayit({...manuelKayit, sorun: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm leading-relaxed"/>
                        </div>
                    </div>

                    <div className="p-6 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
                        <button onClick={() => { setManuelFormAcik(false); setSecilenManuelPersoneller([]); setManuelKayit({ firma_adi: '', yetkili: '', telefon: '', adres: '', vinc_bilgisi: '', aciliyet: 'Normal', ekip: '', sorun: '', lat: '', lng: '' }); setDuzenlenenKayitId(null); }} className="px-6 py-3.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition text-sm">İptal</button>
                        <button onClick={manuelArizaKaydet} disabled={kaydediliyor} className="px-8 py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-200 flex items-center gap-2 text-sm active:scale-95">
                            {kaydediliyor ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>}
                            {kaydediliyor ? 'Kaydediliyor...' : duzenlenenKayitId ? 'Değişiklikleri Kaydet' : 'İş Emrini Sisteme Gönder'}
                        </button>
                    </div>

                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}