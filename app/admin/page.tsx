"use client";
// --------------------------------------------------------
// BUVISAN ADMIN PANELİ - ANA KUMANDA MERKEZİ 🛠️
// --------------------------------------------------------

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion'; // Animasyon kütüphanesi
import { 
  LogOut, 
  Plus, 
  List, 
  MapPin, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Camera, 
  LayoutDashboard,
  Globe, // Dünya ikonu (Harita için)
  Wrench,
  ChevronRight,
  Activity
} from 'lucide-react';

export default function AdminPanel() {
  const router = useRouter();
  
  // --- STATE (DURUM) YÖNETİMİ ---
  const [bildirimler, setBildirimler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [istatistikler, setIstatistikler] = useState({
    bekleyen: 0,
    cozulen: 0,
    toplam: 0
  });

  // --- SAYFA YÜKLENİRKEN ÇALIŞACAKLAR ---
  useEffect(() => {
    oturumKontroluVeVeriler();
  }, []);

  // --- VERİ ÇEKME VE GÜVENLİK ---
  async function oturumKontroluVeVeriler() {
    // 1. Önce oturum var mı bakalım
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { 
      // Oturum yoksa şutla
      router.push('/login'); 
      return; 
    }

    // 2. Arıza biletlerini çek (Vinç bilgileriyle beraber)
    const { data, error } = await supabase
      .from('service_tickets')
      .select('*, cranes(*)') 
      .order('created_at', { ascending: false }); // En yeni en üstte

    if (!error && data) {
      setBildirimler(data);
      
      // İstatistikleri hesapla
      setIstatistikler({
        bekleyen: data.filter(x => x.status !== 'tamamlandi').length,
        cozulen: data.filter(x => x.status === 'tamamlandi').length,
        toplam: data.length
      });
    }
    setYukleniyor(false);
  }

  // --- DURUM GÜNCELLEME (ÇÖZÜLDÜ İŞARETLEME) ---
  async function durumuGuncelle(id: string, yeniDurum: string) {
    if(!confirm("Bu arızayı 'Çözüldü' olarak işaretlemek istiyor musun?")) return;

    await supabase
      .from('service_tickets')
      .update({ status: yeniDurum })
      .eq('id', id);
    
    // Listeyi yenile ki anlık görelim
    oturumKontroluVeVeriler();
  }

  // --- ÇIKIŞ YAPMA ---
  async function cikisYap() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  // --- YÜKLENİYOR EKRANI ---
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
      
      {/* ==================================================================================
          ÜST BAR (HEADER) - LOGO VE NAVİGASYON
      ================================================================================== */}
      <div className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-50 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          
          {/* SOL: LOGO ALANI */}
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-blue-600 to-blue-400 p-2.5 rounded-xl shadow-lg shadow-blue-900/50">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none">BUVİSAN</h1>
              <p className="text-[10px] text-blue-400 font-medium tracking-widest uppercase">Servis Yönetim Paneli</p>
            </div>
          </div>

          {/* SAĞ: BUTONLAR */}
          <div className="flex items-center gap-3">
            
            {/* 🔥 CANLI HARİTA BUTONU (Buraya koyduk ki gözden kaçmasın) 🔥 */}
            <button 
              onClick={() => router.push('/admin/harita')}
              className="group bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white pl-3 pr-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg hover:shadow-green-900/20 hover:border-green-500/50"
            >
              <div className="bg-green-500/20 p-1.5 rounded-lg group-hover:bg-green-500 group-hover:text-white transition-colors text-green-400">
                 <Globe className="w-4 h-4 animate-pulse" /> 
              </div>
              <span className="hidden sm:inline">Canlı Harita</span>
            </button>

            <div className="h-8 w-px bg-slate-800 mx-2 hidden sm:block"></div>

            <button 
              onClick={cikisYap} 
              className="text-slate-400 hover:text-white hover:bg-white/10 px-3 py-2 rounded-lg transition flex items-center gap-2 text-sm font-medium"
            >
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Çıkış</span>
            </button>
          </div>

        </div>
      </div>

      {/* ==================================================================================
          ANA İÇERİK
      ================================================================================== */}
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        
        {/* --- 1. BÖLÜM: HIZLI İŞLEM KARTLARI --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          
          {/* KART 1: YENİ VİNÇ EKLE */}
          <motion.button 
            whileHover={{ y: -5 }}
            onClick={() => router.push('/admin/yeni-vinc')}
            className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:shadow-blue-100/50 transition-all flex items-center gap-4 group text-left"
          >
            <div className="bg-blue-50 text-blue-600 p-4 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Plus className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-lg group-hover:text-blue-600 transition-colors">Yeni Vinç Ekle</h3>
              <p className="text-slate-400 text-sm">Sisteme yeni vinç tanımla</p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 ml-auto group-hover:text-blue-500" />
          </motion.button>

          {/* KART 2: VİNÇ LİSTESİ */}
          <motion.button 
            whileHover={{ y: -5 }}
            onClick={() => router.push('/admin/vincler')}
            className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:shadow-purple-100/50 transition-all flex items-center gap-4 group text-left"
          >
            <div className="bg-purple-50 text-purple-600 p-4 rounded-2xl group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <List className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-lg group-hover:text-purple-600 transition-colors">Vinç Listesi</h3>
              <p className="text-slate-400 text-sm">Tüm filoyu görüntüle</p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 ml-auto group-hover:text-purple-500" />
          </motion.button>
          
          {/* KART 3: İSTATİSTİK (BEKLEYEN ARIZA) */}
          <div className="bg-gradient-to-br from-orange-500 to-red-600 p-6 rounded-3xl shadow-lg shadow-orange-500/20 text-white flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
               <AlertCircle className="w-24 h-24" />
            </div>
            <div>
              <div className="text-orange-100 text-sm font-bold uppercase tracking-wider mb-1 flex items-center gap-2">
                <Activity className="w-4 h-4"/> Bekleyen Arıza
              </div>
              <div className="text-5xl font-extrabold">{istatistikler.bekleyen}</div>
            </div>
            <div className="mt-4 text-xs bg-white/20 w-fit px-2 py-1 rounded-lg backdrop-blur-sm">
               Toplam {istatistikler.toplam} kayıttan
            </div>
          </div>
          
        </div>

        {/* --- 2. BÖLÜM: BİLDİRİM LİSTESİ --- */}
        <div className="flex items-center justify-between mb-6">
           <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
             <div className="bg-red-100 p-2 rounded-xl text-red-600">
               <AlertCircle className="w-6 h-6" /> 
             </div>
             Son Bildirimler
           </h2>
           <span className="text-sm font-bold text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-sm">
             {bildirimler.length} Kayıt
           </span>
        </div>

        <div className="space-y-4">
          {bildirimler.length === 0 ? (
            <div className="bg-white p-16 rounded-3xl text-center border-2 border-dashed border-slate-200">
              <div className="bg-green-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                 <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-700">Her Şey Yolunda!</h3>
              <p className="text-slate-400 mt-2">Şu an bekleyen veya geçmiş bir arıza kaydı yok.</p>
            </div>
          ) : (
            bildirimler.map((kayit) => (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                key={kayit.id} 
                className={`bg-white p-6 md:p-8 rounded-3xl shadow-sm border hover:shadow-md transition-all relative overflow-hidden group ${
                  kayit.status === 'tamamlandi' 
                    ? 'border-slate-100 border-l-[6px] border-l-green-500' 
                    : 'border-slate-100 border-l-[6px] border-l-red-500 bg-red-50/10'
                }`}
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  
                  {/* SOL TARA: BİLGİLER */}
                  <div className="flex-1 space-y-3 w-full">
                    
                    {/* Üst Etiketler */}
                    <div className="flex flex-wrap items-center gap-3">
                        <span className={`px-4 py-1.5 text-xs font-bold rounded-full flex items-center gap-1.5 shadow-sm border ${
                          kayit.status === 'tamamlandi' 
                            ? 'bg-green-100 text-green-700 border-green-200' 
                            : 'bg-red-100 text-red-700 border-red-200 animate-pulse'
                        }`}>
                            {kayit.status === 'tamamlandi' ? <CheckCircle2 className="w-3.5 h-3.5"/> : <Clock className="w-3.5 h-3.5"/>}
                            {kayit.status === 'tamamlandi' ? 'ÇÖZÜLDÜ' : 'BEKLİYOR'}
                        </span>
                        
                        <span className="text-slate-400 text-xs font-bold font-mono bg-slate-100 px-3 py-1.5 rounded-full flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            {new Date(kayit.created_at).toLocaleString('tr-TR', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' })}
                        </span>
                    </div>
                    
                    {/* Başlık ve Konum */}
                    <div>
                      <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                          {kayit.cranes?.customer_name || "Bilinmeyen Müşteri"}
                      </h3>
                      <div className="flex items-center gap-2 text-slate-500 text-sm mt-1">
                          <MapPin className="w-4 h-4 text-blue-500" />
                          <span>{kayit.cranes?.location_address}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                          <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">{kayit.cranes?.model_name}</span>
                      </div>
                    </div>
                    
                    {/* Arıza Açıklaması Kutusu */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-slate-700 text-sm relative">
                        <Wrench className="w-8 h-8 text-slate-100 absolute top-2 right-2 -rotate-12" />
                        <span className="font-bold text-slate-900 block mb-1">Bildirilen Sorun:</span> 
                        {kayit.description}
                    </div>

                    {/* FOTOĞRAF GÖRME BUTONU (Varsa) */}
                    {kayit.media_url && (
                      <div className="pt-2">
                        <a 
                          href={kayit.media_url} 
                          target="_blank" 
                          className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-100 transition border border-blue-100"
                        >
                          <Camera className="w-4 h-4" /> 📸 Fotoğrafı/Videoyu Görüntüle
                        </a>
                      </div>
                    )}
                  </div>

                  {/* SAĞ TARAF: AKSİYON BUTONU */}
                  {kayit.status !== 'tamamlandi' && (
                    <div className="w-full md:w-auto flex justify-end">
                      <motion.button 
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => durumuGuncelle(kayit.id, 'tamamlandi')}
                          className="w-full md:w-auto bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-4 px-8 rounded-2xl shadow-lg shadow-green-200 transition-all flex items-center justify-center gap-2"
                      >
                          <CheckCircle2 className="w-6 h-6" /> 
                          <span>ÇÖZÜLDÜ OLARAK İŞARETLE</span>
                      </motion.button>
                    </div>
                  )}

                  {kayit.status === 'tamamlandi' && (
                     <div className="hidden md:block opacity-50 grayscale hover:grayscale-0 transition-all">
                        <CheckCircle2 className="w-16 h-16 text-green-200" />
                     </div>
                  )}

                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}