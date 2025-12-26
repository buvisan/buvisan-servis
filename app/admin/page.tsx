"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  LogOut, 
  Plus, 
  List, 
  MapPin, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  Camera,
  LayoutDashboard
} from 'lucide-react';

export default function AdminPanel() {
  const router = useRouter();
  const [bildirimler, setBildirimler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    oturumKontroluVeVeriler();
  }, []);

  async function oturumKontroluVeVeriler() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/login'); return; }

    const { data, error } = await supabase
      .from('service_tickets')
      .select('*, cranes(*)') 
      .order('created_at', { ascending: false });

    if (!error) setBildirimler(data || []);
    setYukleniyor(false);
  }

  async function durumuGuncelle(id: string, yeniDurum: string) {
    await supabase.from('service_tickets').update({ status: yeniDurum }).eq('id', id);
    oturumKontroluVeVeriler();
  }

  async function cikisYap() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (yukleniyor) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-blue-600"><div className="animate-pulse font-bold">Yükleniyor...</div></div>;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ÜST BAR */}
      <div className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">BUVİSAN <span className="text-blue-400 font-light">PANEL</span></h1>
          </div>
          <button onClick={cikisYap} className="text-slate-400 hover:text-white transition flex items-center gap-2 text-sm font-medium">
            <LogOut className="w-4 h-4" /> Çıkış
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        
        {/* HIZLI İŞLEMLER MENÜSÜ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <motion.button 
            whileHover={{ y: -5 }}
            onClick={() => router.push('/admin/yeni-vinc')}
            className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all flex flex-col items-center gap-3 group"
          >
            <div className="bg-blue-50 text-blue-600 p-3 rounded-full group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Plus className="w-6 h-6" />
            </div>
            <span className="font-bold text-slate-700">Yeni Vinç Ekle</span>
          </motion.button>

          <motion.button 
            whileHover={{ y: -5 }}
            onClick={() => router.push('/admin/vincler')}
            className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all flex flex-col items-center gap-3 group"
          >
            <div className="bg-purple-50 text-purple-600 p-3 rounded-full group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <List className="w-6 h-6" />
            </div>
            <span className="font-bold text-slate-700">Vinç Listesi</span>
          </motion.button>
          
          {/* İstatistik Kutucukları (Statik Örnek) */}
          <div className="bg-gradient-to-br from-orange-400 to-red-500 p-6 rounded-2xl shadow text-white flex flex-col justify-between">
            <div className="text-orange-100 text-sm font-medium">Bekleyen Arıza</div>
            <div className="text-4xl font-bold">{bildirimler.filter(x => x.status !== 'tamamlandi').length}</div>
          </div>
          
          <div className="bg-gradient-to-br from-blue-500 to-cyan-400 p-6 rounded-2xl shadow text-white flex flex-col justify-between">
            <div className="text-blue-100 text-sm font-medium">Toplam Talep</div>
            <div className="text-4xl font-bold">{bildirimler.length}</div>
          </div>
        </div>

        {/* ARIZA LİSTESİ BAŞLIK */}
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <AlertCircle className="text-red-500" /> Son Bildirimler
        </h2>

        {/* ARIZA KARTLARI (Responsive Grid) */}
        <div className="grid gap-4">
          {bildirimler.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl text-center text-slate-400 border border-dashed border-slate-300">
              Henüz bir arıza bildirimi yok. Her şey yolunda! 🌟
            </div>
          ) : (
            bildirimler.map((kayit) => (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                key={kayit.id} 
                className={`bg-white p-6 rounded-2xl shadow-sm border-l-8 hover:shadow-md transition-all relative overflow-hidden ${kayit.status === 'tamamlandi' ? 'border-green-500' : 'border-red-500'}`}
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        <span className={`px-3 py-1 text-xs font-bold rounded-full flex items-center gap-1 ${kayit.status === 'tamamlandi' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {kayit.status === 'tamamlandi' ? <CheckCircle2 className="w-3 h-3"/> : <Clock className="w-3 h-3"/>}
                            {kayit.status === 'tamamlandi' ? 'ÇÖZÜLDÜ' : 'BEKLİYOR'}
                        </span>
                        <span className="text-slate-400 text-xs font-mono">
                            {new Date(kayit.created_at).toLocaleString('tr-TR')}
                        </span>
                    </div>
                    
                    <h3 className="text-lg font-bold text-slate-800">
                        {kayit.cranes?.customer_name || "Bilinmeyen Müşteri"}
                    </h3>
                    <div className="flex items-center gap-1 text-slate-500 text-sm mb-3">
                        <MapPin className="w-3 h-3" />
                        {kayit.cranes?.location_address} - <span className="font-semibold text-slate-600">{kayit.cranes?.model_name}</span>
                    </div>
                    
                    <div className="bg-slate-50 p-3 rounded-lg text-slate-700 text-sm border border-slate-100">
                        <span className="font-bold text-slate-900">Sorun:</span> {kayit.description}
                    </div>
                  </div>
                  {/* EĞER MEDYA VARSA GÖSTER */}
                    {kayit.media_url && (
                      <div className="mt-3">
                        <a 
                          href={kayit.media_url} 
                          target="_blank" 
                          className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-sm font-bold hover:bg-blue-200 transition"
                        >
                          <Camera className="w-4 h-4" /> 📸 Fotoğrafı/Videoyu Gör
                        </a>
                      </div>
                    )}

                  {kayit.status !== 'tamamlandi' && (
                  <motion.button 
                    whileHover={{ y: -5 }}
                    onClick={() => router.push('/admin/harita')}
                    className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all flex flex-col items-center gap-3 group"
                  >
                    <div className="bg-green-50 text-green-600 p-3 rounded-full group-hover:bg-green-600 group-hover:text-white transition-colors">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <span className="font-bold text-slate-700">Canlı Harita</span>
                  </motion.button>
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