"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, ExternalLink, Search, Package, MapPin, User, Loader2, 
  History, X, Calendar, Wrench, FileText, CheckCircle2 
} from 'lucide-react';

export default function VinclerListesi() {
  const router = useRouter();
  const [vincler, setVincler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [arama, setArama] = useState("");

  // --- MODAL İÇİN STATE'LER ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [secilenVincId, setSecilenVincId] = useState<string | null>(null);
  const [modalForm, setModalForm] = useState({
    event_type: 'bakim',
    title: '',
    description: '',
    technician_name: '',
    created_at: new Date().toISOString().split('T')[0] // Bugünün tarihi varsayılan
  });
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => {
    verileriGetir();
  }, []);

  async function verileriGetir() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/login'); return; }

    const { data, error } = await supabase
      .from('cranes')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) setVincler(data || []);
    setYukleniyor(false);
  }

  // --- MODAL FONKSİYONLARI ---
  const modalAc = (id: string) => {
    setSecilenVincId(id);
    setModalForm({
        event_type: 'bakim',
        title: '',
        description: '',
        technician_name: '',
        created_at: new Date().toISOString().split('T')[0]
    });
    setIsModalOpen(true);
  };

  const gecmisKaydet = async () => {
    if (!secilenVincId || !modalForm.title) return alert("Başlık zorunludur!");
    setKaydediliyor(true);

    const { error } = await supabase.from('crane_history').insert([{
        crane_id: secilenVincId,
        event_type: modalForm.event_type,
        title: modalForm.title,
        description: modalForm.description,
        technician_name: modalForm.technician_name,
        created_at: modalForm.created_at // Seçilen tarih
    }]);

    if (error) {
        alert("Hata: " + error.message);
    } else {
        alert("İşlem başarıyla geçmişe eklendi! ✅");
        setIsModalOpen(false);
    }
    setKaydediliyor(false);
  };

  const filtrelenmisVincler = vincler.filter(v => 
    v.serial_number.toLowerCase().includes(arama.toLowerCase()) ||
    v.customer_name.toLowerCase().includes(arama.toLowerCase()) ||
    v.model_name.toLowerCase().includes(arama.toLowerCase())
  );

  if (yukleniyor) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-blue-600"><Loader2 className="animate-spin w-8 h-8" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 relative">
      <div className="max-w-6xl mx-auto">
        
        {/* BAŞLIK VE ARAMA */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto">
             <button onClick={() => router.push('/admin')} className="bg-white p-3 rounded-xl shadow-sm hover:shadow text-slate-500 hover:text-slate-800 transition">
               <ArrowLeft className="w-5 h-5" />
             </button>
             <div>
               <h1 className="text-2xl font-bold text-slate-800">Vinç Filosu</h1>
               <p className="text-slate-500 text-sm">Toplam {vincler.length} kayıtlı vinç</p>
             </div>
          </div>

          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-3.5 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Ara..." 
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
            />
          </div>
        </div>

        {/* TABLO KARTI */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden pb-20">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider border-b border-slate-100">
                  <th className="p-5">Seri No / Model</th>
                  <th className="p-5">Müşteri</th>
                  <th className="p-5">Konum</th>
                  <th className="p-5 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtrelenmisVincler.map((vinc, index) => (
                    <tr key={vinc.id} className="hover:bg-blue-50/50 transition group">
                      <td className="p-5">
                        <div className="flex items-center gap-3">
                          <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><Package className="w-5 h-5" /></div>
                          <div><div className="font-bold text-slate-800">{vinc.serial_number}</div><div className="text-sm text-slate-500">{vinc.model_name}</div></div>
                        </div>
                      </td>
                      <td className="p-5"><div className="flex items-center gap-2 text-slate-600"><User className="w-4 h-4 text-slate-400" /><span className="font-medium">{vinc.customer_name}</span></div></td>
                      <td className="p-5"><div className="flex items-center gap-2 text-slate-500 text-sm max-w-xs truncate"><MapPin className="w-4 h-4 text-slate-400 shrink-0" />{vinc.location_address}</div></td>
                      <td className="p-5 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => modalAc(vinc.id)} className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-2 rounded-lg text-sm font-bold transition-all shadow-sm">
                             <History className="w-4 h-4" /> İşle
                          </button>
                          <Link href={`/vinc/${vinc.id}`} target="_blank" className="inline-flex items-center gap-2 bg-slate-100 text-slate-600 hover:bg-blue-600 hover:text-white px-3 py-2 rounded-lg text-sm font-bold transition-all shadow-sm">
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- PROFESYONEL MODAL (POPUP) --- */}
      <AnimatePresence>
        {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
                >
                    {/* Modal Başlığı */}
                    <div className="bg-slate-800 p-4 flex justify-between items-center text-white">
                        <h3 className="font-bold text-lg flex items-center gap-2"><History className="w-5 h-5 text-amber-400"/> Servis Geçmişi İşle</h3>
                        <button onClick={() => setIsModalOpen(false)} className="hover:bg-slate-700 p-1 rounded-full transition"><X className="w-5 h-5"/></button>
                    </div>

                    {/* Modal Formu */}
                    <div className="p-6 space-y-4">
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">İşlem Tarihi</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-3 text-slate-400 w-4 h-4"/>
                                    <input type="date" value={modalForm.created_at} onChange={(e)=>setModalForm({...modalForm, created_at: e.target.value})} className="w-full pl-9 p-2.5 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-700" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">İşlem Tipi</label>
                                <select value={modalForm.event_type} onChange={(e)=>setModalForm({...modalForm, event_type: e.target.value})} className="w-full p-2.5 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-700">
                                    <option value="bakim">🛠️ Periyodik Bakım</option>
                                    <option value="ariza">🚨 Arıza Müdahale</option>
                                    <option value="montaj">🏗️ Montaj / Kurulum</option>
                                    <option value="revizyon">🔄 Revizyon</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">İşlem Başlığı</label>
                            <input type="text" placeholder="Örn: Yıllık Periyodik Bakım" value={modalForm.title} onChange={(e)=>setModalForm({...modalForm, title: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Teknisyen / Usta</label>
                            <div className="relative">
                                <User className="absolute left-3 top-3 text-slate-400 w-4 h-4"/>
                                <input type="text" placeholder="Örn: Ahmet Usta" value={modalForm.technician_name} onChange={(e)=>setModalForm({...modalForm, technician_name: e.target.value})} className="w-full pl-9 p-3 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Yapılan İşlemler (Detay)</label>
                            <textarea rows={3} placeholder="Değişen parçalar, yapılan kontroller..." value={modalForm.description} onChange={(e)=>setModalForm({...modalForm, description: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-none"></textarea>
                        </div>

                        <button onClick={gecmisKaydet} disabled={kaydediliyor} className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900 transition shadow-lg flex items-center justify-center gap-2">
                            {kaydediliyor ? <Loader2 className="animate-spin w-5 h-5"/> : <><CheckCircle2 className="w-5 h-5"/> KAYDET VE İŞLE</>}
                        </button>

                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>
    </div>
  );
}