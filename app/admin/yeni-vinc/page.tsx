"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { QRCodeSVG } from 'qrcode.react';
import { useRouter } from 'next/navigation';

export default function YeniVincEkle() {
  const router = useRouter();
  const [yukleniyor, setYukleniyor] = useState(false);
  const [izinKontrol, setIzinKontrol] = useState(true);

  // Dosya yükleme için state
  const [secilenDosya, setSecilenDosya] = useState<File | null>(null);

  // GÜVENLİK KONTROLÜ
  useEffect(() => {
    async function kontrolEt() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) router.push('/login');
      else setIzinKontrol(false);
    }
    kontrolEt();
  }, []);

  const [formData, setFormData] = useState({
    serial_number: '', model_name: '', capacity: '', 
    lifting_height: '', location_address: '', customer_name: ''
  });

  const [olusanId, setOlusanId] = useState<string | null>(null);

  const handleChange = (e: any) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const dosyaSec = (e: any) => {
    if (e.target.files && e.target.files[0]) {
      setSecilenDosya(e.target.files[0]);
    }
  };

  // --- YENİ EKLENEN TEMİZLİKÇİ FONKSİYON ---
  const dosyaIsminiTemizle = (isim: string) => {
    return isim
      .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
      .replace(/ü/g, 'u').replace(/Ü/g, 'U')
      .replace(/ş/g, 's').replace(/Ş/g, 'S')
      .replace(/ı/g, 'i').replace(/İ/g, 'I')
      .replace(/ö/g, 'o').replace(/Ö/g, 'O')
      .replace(/ç/g, 'c').replace(/Ç/g, 'C')
      .replace(/ /g, '-') // Boşlukları tire yap
      .replace(/[^a-zA-Z0-9.-]/g, ''); // Kalan garip karakterleri sil
  };
  // ------------------------------------------

  const kaydet = async () => {
    setYukleniyor(true);
    let yuklenenDosyaLinki = null;

    try {
      // 1. Önce Dosyayı Yükle (Eğer dosya seçildiyse)
      if (secilenDosya) {
        // İsmi temizle ve benzersiz sayı ekle
        const temizIsim = dosyaIsminiTemizle(secilenDosya.name);
        const dosyaAdi = `${Date.now()}-${temizIsim}`; 
        
        const { data: dosyaData, error: dosyaError } = await supabase.storage
          .from('dokumanlar')
          .upload(dosyaAdi, secilenDosya);

        if (dosyaError) throw dosyaError;

        // Linki al
        const { data: urlData } = supabase.storage
          .from('dokumanlar')
          .getPublicUrl(dosyaAdi);
          
        yuklenenDosyaLinki = urlData.publicUrl;
      }

      // 2. Veritabanına Kaydet
      const { data, error } = await supabase
        .from('cranes')
        .insert([{ ...formData, pdf_url: yuklenenDosyaLinki }])
        .select()
        .single();

      if (error) throw error;

      setOlusanId(data.id);

    } catch (error: any) {
      alert("Hata: " + error.message);
    } finally {
      setYukleniyor(false);
    }
  };

  const yazdir = () => window.print();

  if (izinKontrol) return <div className="p-10 text-center">Yetki kontrolü yapılıyor... 🕵️‍♂️</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8 flex flex-col items-center">
      <h1 className="text-3xl font-bold text-blue-900 mb-6">🏗️ Yeni Vinç & Dosya Kaydı</h1>

      {!olusanId ? (
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-lg space-y-4">
          
          <div><label className="text-sm font-bold">Seri No</label><input name="serial_number" onChange={handleChange} className="w-full p-2 border rounded" /></div>
          <div><label className="text-sm font-bold">Model</label><input name="model_name" onChange={handleChange} className="w-full p-2 border rounded" /></div>
          <div className="flex gap-4">
            <div className="w-1/2"><label className="text-sm font-bold">Kapasite</label><input name="capacity" onChange={handleChange} className="w-full p-2 border rounded" /></div>
            <div className="w-1/2"><label className="text-sm font-bold">Yükseklik</label><input name="lifting_height" onChange={handleChange} className="w-full p-2 border rounded" /></div>
          </div>
          <div><label className="text-sm font-bold">Müşteri</label><input name="customer_name" onChange={handleChange} className="w-full p-2 border rounded" /></div>
          <div><label className="text-sm font-bold">Adres</label><input name="location_address" onChange={handleChange} className="w-full p-2 border rounded" /></div>

          {/* Dosya Yükleme */}
          <div className="bg-blue-50 p-4 rounded border border-blue-200">
            <label className="block text-sm font-bold text-blue-900 mb-2">📄 PDF Dokümanı Yükle</label>
            <input 
              type="file" 
              accept=".pdf"
              onChange={dosyaSec}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200"
            />
          </div>

          <button onClick={kaydet} disabled={yukleniyor} className="w-full bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-700 transition">
            {yukleniyor ? "Yükleniyor ve Kaydediliyor..." : "KAYDET VE QR OLUŞTUR"}
          </button>
          <button onClick={() => router.push('/admin')} className="w-full mt-2 text-gray-500 text-sm hover:underline">« Panele Dön</button>
        </div>
      ) : (
        <div className="bg-white p-10 rounded-xl shadow-lg text-center border-4 border-blue-900 print:border-0 print:shadow-none">
          <h2 className="text-2xl font-bold mb-2">QR KOD HAZIR</h2>
          <div className="flex justify-center mb-6 p-4 border-2 border-dashed border-gray-300">
            <QRCodeSVG value={`https://buvisan-servis.vercel.app/vinc/${olusanId}`} size={256} level={"H"} includeMargin={true} />
          </div>
          <div className="flex gap-4 justify-center print:hidden">
            <button onClick={yazdir} className="bg-gray-800 text-white px-6 py-2 rounded font-bold hover:bg-black">🖨️ Yazdır</button>
            <button onClick={() => {setOlusanId(null); setSecilenDosya(null);}} className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700">➕ Yeni Ekle</button>
          </div>
        </div>
      )}
    </div>
  );
}