"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient'; // Bağlantı dosyamızı çağırdık
import { useParams } from 'next/navigation';

export default function VincDetaySayfasi() {
  const params = useParams();
  const { id } = params; // URL'den gelen ID'yi aldık

  const [vinc, setVinc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [arizaNotu, setArizaNotu] = useState("");
  const [bildirimDurumu, setBildirimDurumu] = useState(""); // Gönderildi mesajı için

  // Sayfa açılınca çalışacak kısım:
  useEffect(() => {
    async function vinciGetir() {
      if (!id) return;
      
      // Veritabanından bu ID'ye sahip vinci bul
      const { data, error } = await supabase
        .from('cranes')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error("Hata:", error);
      } else {
        setVinc(data);
      }
      setLoading(false);
    }

    vinciGetir();
  }, [id]);

  // Arıza Bildir butonuna basınca çalışacak kısım
  const arizaBildir = async () => {
    if (!arizaNotu) return alert("Lütfen arıza ile ilgili bir not yazın.");
    
    setBildirimDurumu("Gönderiliyor...");

    const { error } = await supabase
      .from('service_tickets')
      .insert([
        { 
          crane_id: id, 
          issue_type: 'Genel Arıza', 
          description: arizaNotu,
          status: 'beklemede'
        }
      ]);

    if (error) {
      alert("Hata oluştu!");
      setBildirimDurumu("");
    } else {
      setBildirimDurumu("Başarılı! Teknik ekibimize bildirim düştü. 🚀");
      setArizaNotu(""); // Kutuyu temizle
    }
  };

  if (loading) return <div className="p-10 text-center text-xl">Vinç bilgileri yükleniyor...</div>;
  if (!vinc) return <div className="p-10 text-center text-red-500 font-bold">Vinç Bulunamadı! QR Kod hatalı olabilir.</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4">
      
      {/* Üst Logo Alanı */}
      <div className="w-full max-w-md bg-white p-4 rounded-xl shadow-sm mb-4 text-center">
        <h1 className="text-2xl font-bold text-blue-900">BUVİSAN SERVİS</h1>
        <p className="text-sm text-gray-500">Dijital Asistan</p>
      </div>

      {/* Vinç Bilgi Kartı */}
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg overflow-hidden mb-6 border border-gray-100">
        <div className="bg-blue-600 p-4 text-white">
          <h2 className="text-lg font-bold">🏗️ {vinc.model_name}</h2>
          <p className="text-sm opacity-90">Seri No: {vinc.serial_number}</p>
        </div>
        
        <div className="p-6 space-y-3">
            <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Kapasite:</span>
                <span className="font-semibold text-gray-800">{vinc.capacity}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Yükseklik:</span>
                <span className="font-semibold text-gray-800">{vinc.lifting_height}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Konum:</span>
                <span className="font-semibold text-gray-800">{vinc.location_address}</span>
            </div>
            <div className="flex justify-between pt-2">
                <span className="text-gray-500">Müşteri:</span>
                <span className="font-semibold text-gray-800">{vinc.customer_name}</span>
            </div>
        </div>
      </div>

      {/* Arıza Bildirim Formu */}
      <div className="w-full max-w-md bg-white p-6 rounded-xl shadow-lg border border-red-100">
        <h3 className="text-lg font-bold text-gray-800 mb-2">🚨 Arıza Bildir</h3>
        <p className="text-sm text-gray-500 mb-4">Bir sorun mu var? Aşağıya yazın, anında görelim.</p>
        
        <textarea 
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-800"
          rows={3}
          placeholder="Örn: Halatta aşınma var, ses geliyor..."
          value={arizaNotu}
          onChange={(e) => setArizaNotu(e.target.value)}
        ></textarea>

        {bildirimDurumu ? (
            <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-lg text-center font-bold">
                {bildirimDurumu}
            </div>
        ) : (
            <button 
                onClick={arizaBildir}
                className="w-full mt-4 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-all active:scale-95"
            >
                SERVİS ÇAĞIR
            </button>
        )}
      </div>

      <div className="mt-8 text-gray-400 text-xs text-center">
        Powered by ZM Çelik & Buvisan Technology
      </div>
    </div>
  );
}