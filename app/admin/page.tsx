"use client";
// --------------------------------------------------------
// BUVISAN ADMIN PANELİ - ANA KUMANDA MERKEZİ V2.1 🛠️
// (Tüm Eski Fonksiyonlar Korundu + Yeni Grid Tasarım)
// --------------------------------------------------------

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ChatAlani from '@/components/ChatAlani'; // 🔥 BU BİLEŞENİ AŞAĞIDA OLUŞTURACAĞIZ
import { 
  LogOut, Plus, List, MapPin, AlertCircle, CheckCircle2, Clock, 
  Camera, LayoutDashboard, Globe, Wrench, ChevronRight, Activity, 
  Package, FileText, TrendingUp 
} from 'lucide-react';

export default function AdminPanel() {
  const router = useRouter();
  
  // --- STATE (DURUM) YÖNETİMİ ---
  const [aktifChatId, setAktifChatId] = useState<string | null>(null);
  const [bildirimler, setBildirimler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [istatistikler, setIstatistikler] = useState({
    bekleyen: 0,
    cozulen: 0,
    toplam: 0
  });

  // --- SAYFA YÜKLENİRKEN --

useEffect(() => {
    guvenliGirisVeVeriler();
  }, []);

  // 🔥 GÜVENLİK VE VERİ ÇEKME MOTORU 🔥
  async function guvenliGirisVeVeriler() {
    // 1. Oturum Var mı?
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/login'); return; }

    // 2. 🔥 KRİTİK ADIM: ROL KONTROLÜ 🔥
    const { data: profil } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

    // Eğer adam admin değilse, personel sayfasına postala!
    if (profil?.role !== 'admin') {
        router.push('/personel'); 
        return; 
    }

    // 3. Adminse Verileri Çek
    const { data, error } = await supabase
      .from('service_tickets')
      .select('*, cranes(*)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setBildirimler(data);
      setIstatistikler({
        bekleyen: data.filter(x => x.status !== 'tamamlandi').length,
        cozulen: data.filter(x => x.status === 'tamamlandi').length,
        toplam: data.length
      });
    }
    setYukleniyor(false);
  }

  // --- DURUM GÜNCELLEME ---
  async function durumuGuncelle(id: string, yeniDurum: string) {
    if(!confirm("Bu arızayı 'Çözüldü' olarak işaretlemek istiyor musun?")) return;

    const { error } = await supabase
      .from('service_tickets')
      .update({ status: yeniDurum })
      .eq('id', id);
    
    if (!error) {
        guvenliGirisVeVeriler(); // Listeyi yenile
    } else {
        alert("Güncelleme hatası: " + error.message);
    }
  }

  // --- ÇIKIŞ ---
  async function cikisYap() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (yukleniyor) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-blue-600">
         <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
         <div className="animate-pulse font-bold text-lg">Panel Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      
      {/* ÜST HEADER */}
      <div className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-50 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-blue-600 to-blue-400 p-2.5 rounded-xl shadow-lg shadow-blue-900/50">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none">BUVİSAN</h1>
              <p className="text-[10px] text-blue-400 font-medium tracking-widest uppercase">Servis Yönetim Paneli</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin/harita')} className="group bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white pl-3 pr-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg hover:shadow-green-900/20 hover:border-green-500/50">
              <div className="bg-green-500/20 p-1.5 rounded-lg text-green-400"><Globe className="w-4 h-4 animate-pulse" /></div>
              <span className="hidden sm:inline">Canlı Harita</span>
            </button>
            <div className="h-8 w-px bg-slate-800 mx-2 hidden sm:block"></div>
            <button onClick={cikisYap} className="text-slate-400 hover:text-white hover:bg-white/10 px-3 py-2 rounded-lg transition flex items-center gap-2 text-sm font-medium">
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Çıkış</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        
        {/* 1. DASHBOARD İSTATİSTİKLERİ */}
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
                <p className="text-slate-400 text-xs mt-1">v2.1 Aktif</p>
                <div className="mt-4 w-full h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 w-2/3 rounded-full"></div></div>
            </div>
        </div>

        {/* 2. OPERASYON MENÜSÜ (GRID) */}
        <div>
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><div className="w-1 h-6 bg-slate-800 rounded-full"></div> Operasyonlar</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <motion.button whileHover={{ y: -3 }} onClick={() => router.push('/admin/yeni-vinc')} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all group text-left flex flex-col justify-between h-32">
                    <div className="bg-blue-50 text-blue-600 w-10 h-10 rounded-xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors"><Plus size={20}/></div>
                    <div><h3 className="font-bold text-slate-700 text-sm">Yeni Vinç Ekle</h3><p className="text-[10px] text-slate-400">Envantere ekle</p></div>
                </motion.button>
                <motion.button whileHover={{ y: -3 }} onClick={() => router.push('/admin/vincler')} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all group text-left flex flex-col justify-between h-32">
                    <div className="bg-indigo-50 text-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors"><List size={20}/></div>
                    <div><h3 className="font-bold text-slate-700 text-sm">Vinç Listesi</h3><p className="text-[10px] text-slate-400">Filoyu yönet</p></div>
                </motion.button>
                <motion.button whileHover={{ y: -3 }} onClick={() => router.push('/admin/analiz')} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:border-green-200 hover:shadow-md transition-all group text-left flex flex-col justify-between h-32">
                    <div className="bg-green-50 text-green-600 w-10 h-10 rounded-xl flex items-center justify-center group-hover:bg-green-600 group-hover:text-white transition-colors"><TrendingUp size={20}/></div>
                    <div><h3 className="font-bold text-slate-700 text-sm">Finansal Analiz</h3><p className="text-[10px] text-slate-400">Gelir raporları</p></div>
                </motion.button>
                <motion.button whileHover={{ y: -3 }} onClick={() => router.push('/admin/malzemeler')} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:border-yellow-200 hover:shadow-md transition-all group text-left flex flex-col justify-between h-32">
                    <div className="bg-yellow-50 text-yellow-600 w-10 h-10 rounded-xl flex items-center justify-center group-hover:bg-yellow-500 group-hover:text-white transition-colors"><Package size={20}/></div>
                    <div><h3 className="font-bold text-slate-700 text-sm">Malzeme Deposu</h3><p className="text-[10px] text-slate-400">Stok & Fiyat</p></div>
                </motion.button>
                <motion.button whileHover={{ y: -3 }} onClick={() => router.push('/admin/teklifler')} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:border-purple-200 hover:shadow-md transition-all group text-left flex flex-col justify-between h-32">
                    <div className="bg-purple-50 text-purple-600 w-10 h-10 rounded-xl flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors"><FileText size={20}/></div>
                    <div><h3 className="font-bold text-slate-700 text-sm">Teklif Hazırla</h3><p className="text-[10px] text-slate-400">Sözleşme & Form</p></div>
                </motion.button>
            </div>
        </div>

        {/* 3. BİLDİRİM LİSTESİ (ESKİ KODLARIN AYNI MANTIĞI) */}
        <div>
            <div className="flex items-center justify-between mb-4 mt-8">
               <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><div className="w-1 h-6 bg-red-500 rounded-full"></div> Son Bildirimler</h2>
               <span className="text-xs font-bold text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-200">{bildirimler.length} Kayıt</span>
            </div>

            <div className="space-y-4">
              {bildirimler.length === 0 ? (
                <div className="bg-white p-12 rounded-3xl text-center border border-dashed border-slate-300">
                  <div className="bg-green-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle2 className="w-8 h-8 text-green-500" /></div>
                  <h3 className="text-lg font-bold text-slate-700">Tertemiz!</h3><p className="text-slate-400 text-sm mt-1">Bekleyen iş emri bulunmuyor.</p>
                </div>
              ) : (
                bildirimler.map((kayit) => (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={kayit.id} className={`bg-white p-6 rounded-3xl shadow-sm border hover:shadow-md transition-all relative overflow-hidden ${kayit.status === 'tamamlandi' ? 'border-slate-100 border-l-[6px] border-l-green-500' : 'border-slate-100 border-l-[6px] border-l-red-500 bg-red-50/10'}`}>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      <div className="flex-1 space-y-3 w-full">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`px-3 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 shadow-sm border ${kayit.status === 'tamamlandi' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200 animate-pulse'}`}>
                                {kayit.status === 'tamamlandi' ? <CheckCircle2 className="w-3 h-3"/> : <Clock className="w-3 h-3"/>}
                                {kayit.status === 'tamamlandi' ? 'ÇÖZÜLDÜ' : 'BEKLİYOR'}
                            </span>
                            <span className="text-slate-400 text-[10px] font-bold font-mono bg-slate-100 px-3 py-1 rounded-full flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(kayit.created_at).toLocaleString('tr-TR', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' })}</span>
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">{kayit.cranes?.customer_name || "Bilinmeyen Müşteri"}</h3>
                          <div className="flex items-center gap-2 text-slate-500 text-xs mt-1"><MapPin className="w-3 h-3 text-blue-500" /><span>{kayit.cranes?.location_address}</span><span className="w-1 h-1 rounded-full bg-slate-300"></span><span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{kayit.cranes?.model_name}</span></div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-slate-700 text-sm relative"><Wrench className="w-6 h-6 text-slate-200 absolute top-2 right-2" /><span className="font-bold text-slate-900 block mb-1 text-xs uppercase">Sorun:</span> {kayit.description}</div>
                        {kayit.media_url && (<div className="pt-2"><a href={kayit.media_url} target="_blank" className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-100 transition border border-blue-100"><Camera className="w-3 h-3" /> Fotoğrafı Görüntüle</a></div>)}
                      </div>
                      <div className="w-full md:w-auto flex flex-col gap-2 min-w-[200px]">
                          {kayit.status !== 'tamamlandi' && (<button onClick={() => durumuGuncelle(kayit.id, 'tamamlandi')} className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-green-200 transition-all flex items-center justify-center gap-2 text-sm"><CheckCircle2 className="w-4 h-4" /> <span>Çözüldü İşaretle</span></button>)}
                          <button onClick={() => setAktifChatId(aktifChatId === kayit.id ? null : kayit.id)} className="w-full bg-white border border-slate-200 text-slate-600 font-bold py-3 px-4 rounded-xl text-sm hover:bg-slate-50 transition flex items-center justify-center gap-2"><span>💬 {aktifChatId === kayit.id ? 'Sohbeti Kapat' : 'Müşteriyle Mesajlaş'}</span></button>
                      </div>
                    </div>
                    {/* CHAT ALANI ENTEGRASYONU */}
                    <AnimatePresence>
                        {aktifChatId === kayit.id && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-6 border-t pt-4 overflow-hidden">
                              <ChatAlani ticketId={kayit.id} kimimBen="admin" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                  </motion.div>
                ))
              )}
            </div>
        </div>

      </div>
    </div>
  );
}