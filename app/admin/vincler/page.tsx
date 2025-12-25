"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function VinclerListesi() {
  const router = useRouter();
  const [vincler, setVincler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  // GÜVENLİK VE VERİ ÇEKME
  useEffect(() => {
    async function verileriGetir() {
      // 1. Giriş kontrolü
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // 2. Tüm vinçleri çek (En son eklenen en üstte)
      const { data, error } = await supabase
        .from('cranes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) console.error(error);
      else setVincler(data || []);
      
      setYukleniyor(false);
    }

    verileriGetir();
  }, []);

  if (yukleniyor) return <div className="p-10 text-center">Vinç listesi yükleniyor... 🏗️</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">📋 Kayıtlı Vinç Listesi</h1>
          <button onClick={() => router.push('/admin')} className="text-gray-600 hover:text-gray-900">
            « Ana Panele Dön
          </button>
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-200 text-gray-700 text-sm uppercase">
                <th className="p-4">Seri No</th>
                <th className="p-4">Model</th>
                <th className="p-4">Müşteri</th>
                <th className="p-4">Konum</th>
                <th className="p-4 text-center">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vincler.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-gray-500">Kayıtlı vinç yok.</td></tr>
              ) : (
                vincler.map((vinc) => (
                  <tr key={vinc.id} className="hover:bg-gray-50 transition">
                    <td className="p-4 font-bold text-blue-900">{vinc.serial_number}</td>
                    <td className="p-4 text-gray-700">{vinc.model_name}</td>
                    <td className="p-4 font-medium">{vinc.customer_name}</td>
                    <td className="p-4 text-gray-500 text-sm">{vinc.location_address}</td>
                    <td className="p-4 text-center">
                      {/* --- İŞTE BU BUTON QR KODUN YAPTIĞI İŞİ YAPAR --- */}
                      <Link 
                        href={`/vinc/${vinc.id}`} 
                        target="_blank" // Yeni sekmede açar
                        className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-blue-700 transition inline-block"
                      >
                        Sayfaya Git 🔗
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}