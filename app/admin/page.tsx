"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function AdminPanel() {
  const [bildirimler, setBildirimler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  // Sayfa açılınca verileri çek
  useEffect(() => {
    verileriGetir();
  }, []);

  async function verileriGetir() {
    // service_tickets tablosunu çek ama yanına cranes (vinç) bilgilerini de ekle
    const { data, error } = await supabase
      .from('service_tickets')
      .select('*, cranes(*)') 
      .order('created_at', { ascending: false }); // En yeniyi en üste koy

    if (error) console.error("Hata:", error);
    else setBildirimler(data || []);
    
    setYukleniyor(false);
  }

  // Arızayı çözüldü olarak işaretle
  async function durumuGuncelle(id: string, yeniDurum: string) {
    const { error } = await supabase
      .from('service_tickets')
      .update({ status: yeniDurum })
      .eq('id', id);

    if (!error) {
      // Listeyi ekranda da güncelle (sayfayı yenilemeden)
      verileriGetir();
    }
  }

  if (yukleniyor) return <div className="p-10 text-center text-xl">Panel Yükleniyor...</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">🛠️ Buvisan Teknik Servis Paneli</h1>
          <button onClick={verileriGetir} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            Yenile 🔄
          </button>
        </div>

        <div className="grid gap-4">
          {bildirimler.length === 0 ? (
            <div className="text-center text-gray-500 py-10">Henüz hiç arıza bildirimi yok. Keyfine bak! ☕</div>
          ) : (
            bildirimler.map((kayit) => (
              <div key={kayit.id} className={`bg-white p-6 rounded-lg shadow-md border-l-8 ${kayit.status === 'tamamlandi' ? 'border-green-500' : 'border-red-500'}`}>
                <div className="flex flex-col md:flex-row justify-between">
                  
                  {/* Sol Taraf: Vinç ve Arıza Bilgisi */}
                  <div className="mb-4 md:mb-0">
                    <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 text-xs font-bold rounded text-white ${kayit.status === 'tamamlandi' ? 'bg-green-500' : 'bg-red-500'}`}>
                            {kayit.status === 'tamamlandi' ? 'ÇÖZÜLDÜ' : 'BEKLİYOR'}
                        </span>
                        <span className="text-gray-400 text-sm">
                            {new Date(kayit.created_at).toLocaleString('tr-TR')}
                        </span>
                    </div>
                    
                    <h2 className="text-xl font-bold text-gray-800">
                        {kayit.cranes?.customer_name || "Bilinmeyen Müşteri"}
                    </h2>
                    <p className="text-gray-600 text-sm mb-2">
                        📍 {kayit.cranes?.location_address} - {kayit.cranes?.model_name}
                    </p>
                    
                    <div className="bg-red-50 p-3 rounded text-red-800 font-medium inline-block border border-red-100">
                        📢 Sorun: {kayit.description}
                    </div>
                  </div>

                  {/* Sağ Taraf: Aksiyon Butonları */}
                  <div className="flex items-center">
                    {kayit.status !== 'tamamlandi' && (
                        <button 
                            onClick={() => durumuGuncelle(kayit.id, 'tamamlandi')}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded shadow transition-all"
                        >
                            ✅ Çözüldü İşaretle
                        </button>
                    )}
                    {kayit.status === 'tamamlandi' && (
                        <button 
                            onClick={() => durumuGuncelle(kayit.id, 'beklemede')}
                            className="text-gray-400 hover:text-gray-600 text-sm underline ml-4"
                        >
                            Geri Al
                        </button>
                    )}
                  </div>

                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}