"use client";
import { useState, useEffect } from 'react'; // useEffect ekledik
import { supabase } from '@/lib/supabaseClient';
import { QRCodeSVG } from 'qrcode.react';
import { useRouter } from 'next/navigation'; // Yönlendirme için ekledik

export default function YeniVincEkle() {
  const router = useRouter();
  const [yukleniyor, setYukleniyor] = useState(false); // Başlangıçta false
  const [izinKontrol, setIzinKontrol] = useState(true); // Sayfa yüklenirken beklemesi için

  // --- GÜVENLİK KONTROLÜ BAŞLANGIÇ ---
  useEffect(() => {
    async function kontrolEt() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Giriş yapmamışsa Login sayfasına at
        router.push('/login');
      } else {
        setIzinKontrol(false); // Giriş yapmış, ekranı aç
      }
    }
    kontrolEt();
  }, []);
  // --- GÜVENLİK KONTROLÜ BİTİŞ ---

  const [formData, setFormData] = useState({
    serial_number: '',
    model_name: '',
    capacity: '',
    lifting_height: '',
    location_address: '',
    customer_name: ''
  });

  const [olusanId, setOlusanId] = useState<string | null>(null);

  const handleChange = (e: any) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const kaydet = async () => {
    setYukleniyor(true);
    const { data, error } = await supabase
      .from('cranes')
      .insert([formData])
      .select()
      .single();

    if (error) {
      alert("Hata: " + error.message);
    } else {
      setOlusanId(data.id);
    }
    setYukleniyor(false);
  };

  const yazdir = () => {
    window.print();
  };

  // Eğer güvenlik kontrolü sürüyorsa bekleme ekranı göster
  if (izinKontrol) return <div className="p-10 text-center">Yetki kontrolü yapılıyor... 🕵️‍♂️</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8 flex flex-col items-center">
      <h1 className="text-3xl font-bold text-blue-900 mb-6">🏗️ Yeni Vinç Kaydı Oluştur</h1>

      {!olusanId ? (
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-lg space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700">Seri Numarası</label>
            <input name="serial_number" onChange={handleChange} placeholder="Örn: BVS-2025-002" className="w-full p-2 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700">Model İsmi</label>
            <input name="model_name" onChange={handleChange} placeholder="Örn: Tek Kiriş Gezer Köprülü" className="w-full p-2 border rounded" />
          </div>
          <div className="flex gap-4">
            <div className="w-1/2">
                <label className="block text-sm font-bold text-gray-700">Kapasite</label>
                <input name="capacity" onChange={handleChange} placeholder="Örn: 10 Ton" className="w-full p-2 border rounded" />
            </div>
            <div className="w-1/2">
                <label className="block text-sm font-bold text-gray-700">Yükseklik</label>
                <input name="lifting_height" onChange={handleChange} placeholder="Örn: 12m" className="w-full p-2 border rounded" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700">Müşteri Adı</label>
            <input name="customer_name" onChange={handleChange} placeholder="Örn: Yılmazlar İnşaat" className="w-full p-2 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700">Kurulacak Adres</label>
            <input name="location_address" onChange={handleChange} placeholder="Örn: Ankara OSB..." className="w-full p-2 border rounded" />
          </div>

          <button 
            onClick={kaydet}
            disabled={yukleniyor}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-700 transition"
          >
            {yukleniyor ? "Kaydediliyor..." : "KAYDET VE QR OLUŞTUR"}
          </button>
          
          {/* Geri Dön Butonu */}
          <button onClick={() => router.push('/admin')} className="w-full mt-2 text-gray-500 text-sm hover:underline">
            « Panele Dön
          </button>
        </div>
      ) : (
        <div className="bg-white p-10 rounded-xl shadow-lg text-center border-4 border-blue-900 print:border-0 print:shadow-none">
          <h2 className="text-2xl font-bold mb-2">BUVİSAN SERVİS SİSTEMİ</h2>
          <p className="text-gray-500 mb-6">Aşağıdaki QR kodu vinç üzerine yapıştırınız.</p>
          
          <div className="flex justify-center mb-6 p-4 border-2 border-dashed border-gray-300">
            <QRCodeSVG 
                value={`https://buvisan-servis.vercel.app/vinc/${olusanId}`} 
                size={256} 
                level={"H"}
                includeMargin={true}
            />
          </div>

          <div className="text-left bg-gray-100 p-4 rounded mb-6 text-sm">
            <p><strong>Model:</strong> {formData.model_name}</p>
            <p><strong>Müşteri:</strong> {formData.customer_name}</p>
            <p><strong>Seri No:</strong> {formData.serial_number}</p>
          </div>

          <div className="flex gap-4 justify-center print:hidden">
            <button onClick={yazdir} className="bg-gray-800 text-white px-6 py-2 rounded font-bold hover:bg-black">
                🖨️ Yazdır
            </button>
            <button onClick={() => setOlusanId(null)} className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700">
                ➕ Yeni Ekle
            </button>
          </div>
          <button onClick={() => router.push('/admin')} className="mt-4 text-gray-500 text-sm hover:underline print:hidden">
            « Panele Dön
          </button>
        </div>
      )}
    </div>
  );
}