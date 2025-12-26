"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ExternalLink, Search, Package, MapPin, User, Loader2 } from 'lucide-react';

export default function VinclerListesi() {
  const router = useRouter();
  const [vincler, setVincler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [arama, setArama] = useState("");

  useEffect(() => {
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
    verileriGetir();
  }, []);

  // Basit Arama Filtresi
  const filtrelenmisVincler = vincler.filter(v => 
    v.serial_number.toLowerCase().includes(arama.toLowerCase()) ||
    v.customer_name.toLowerCase().includes(arama.toLowerCase()) ||
    v.model_name.toLowerCase().includes(arama.toLowerCase())
  );

  if (yukleniyor) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-blue-600"><Loader2 className="animate-spin w-8 h-8" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
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
              placeholder="Seri No, Müşteri veya Model ara..." 
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
            />
          </div>
        </div>

        {/* TABLO KARTI */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
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
                {filtrelenmisVincler.length === 0 ? (
                  <tr><td colSpan={4} className="p-10 text-center text-slate-400">Kayıt bulunamadı.</td></tr>
                ) : (
                  filtrelenmisVincler.map((vinc, index) => (
                    <motion.tr 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }} // Domino efekti
                      key={vinc.id} 
                      className="hover:bg-blue-50/50 transition group"
                    >
                      <td className="p-5">
                        <div className="flex items-center gap-3">
                          <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                            <Package className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-800">{vinc.serial_number}</div>
                            <div className="text-sm text-slate-500">{vinc.model_name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex items-center gap-2 text-slate-600">
                          <User className="w-4 h-4 text-slate-400" />
                          <span className="font-medium">{vinc.customer_name}</span>
                        </div>
                      </td>
                      <td className="p-5">
                         <div className="flex items-center gap-2 text-slate-500 text-sm max-w-xs truncate">
                          <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                          {vinc.location_address}
                        </div>
                      </td>
                      <td className="p-5 text-right">
                        <Link 
                          href={`/vinc/${vinc.id}`} 
                          target="_blank"
                          className="inline-flex items-center gap-2 bg-slate-100 text-slate-600 hover:bg-blue-600 hover:text-white px-4 py-2 rounded-lg text-sm font-bold transition-all"
                        >
                          Görüntüle <ExternalLink className="w-4 h-4" />
                        </Link>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}