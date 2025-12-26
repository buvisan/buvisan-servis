"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { QRCodeSVG } from 'qrcode.react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  Save, 
  Printer, 
  Plus, 
  ArrowLeft, 
  FileText, 
  UploadCloud, 
  Hash, 
  Truck, 
  Weight, 
  ArrowUpFromLine, 
  User, 
  MapPin,
  Loader2
} from 'lucide-react';

export default function YeniVincEkle() {
  const router = useRouter();
  const [yukleniyor, setYukleniyor] = useState(false);
  const [izinKontrol, setIzinKontrol] = useState(true);
  const [secilenDosya, setSecilenDosya] = useState<File | null>(null);
  
  // GÜVENLİK
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

  const dosyaIsminiTemizle = (isim: string) => {
    return isim
      .replace(/ğ/g, 'g').replace(/Ğ/g, 'G').replace(/ü/g, 'u').replace(/Ü/g, 'U')
      .replace(/ş/g, 's').replace(/Ş/g, 'S').replace(/ı/g, 'i').replace(/İ/g, 'I')
      .replace(/ö/g, 'o').replace(/Ö/g, 'O').replace(/ç/g, 'c').replace(/Ç/g, 'C')
      .replace(/ /g, '-').replace(/[^a-zA-Z0-9.-]/g, '');
  };

  const kaydet = async () => {
    setYukleniyor(true);
    let yuklenenDosyaLinki = null;

    try {
      if (secilenDosya) {
        const temizIsim = dosyaIsminiTemizle(secilenDosya.name);
        const dosyaAdi = `${Date.now()}-${temizIsim}`; 
        
        const { error: dosyaError } = await supabase.storage.from('dokumanlar').upload(dosyaAdi, secilenDosya);
        if (dosyaError) throw dosyaError;

        const { data: urlData } = supabase.storage.from('dokumanlar').getPublicUrl(dosyaAdi);
        yuklenenDosyaLinki = urlData.publicUrl;
      }

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

  if (izinKontrol) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-blue-600"><Loader2 className="animate-spin w-8 h-8" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center">
      
      {/* ÜST BAR */}
      <div className="w-full max-w-2xl flex items-center justify-between mb-8">
        <button onClick={() => router.push('/admin')} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition">
          <ArrowLeft className="w-5 h-5" /> Panele Dön
        </button>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
           🏗️ Yeni Vinç Kaydı
        </h1>
      </div>

      {!olusanId ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-2xl border border-slate-100"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* SOL KOLON */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Seri Numarası</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
                  <input name="serial_number" onChange={handleChange} placeholder="Örn: BVS-2025-001" className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Model İsmi</label>
                <div className="relative">
                  <Truck className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
                  <input name="model_name" onChange={handleChange} placeholder="Çift Kiriş Gezer..." className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>

              <div className="flex gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">Kapasite</label>
                  <div className="relative">
                    <Weight className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
                    <input name="capacity" onChange={handleChange} placeholder="10 Ton" className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">Yükseklik</label>
                  <div className="relative">
                    <ArrowUpFromLine className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
                    <input name="lifting_height" onChange={handleChange} placeholder="12m" className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* SAĞ KOLON */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Müşteri Adı</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
                  <input name="customer_name" onChange={handleChange} placeholder="Yılmazlar İnşaat A.Ş." className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Kurulacak Adres</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
                  <input name="location_address" onChange={handleChange} placeholder="Ankara OSB..." className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>

              {/* DOSYA YÜKLEME ALANI */}
              <div className="pt-2">
                <label className="block w-full cursor-pointer group">
                  <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-xl bg-slate-50 group-hover:bg-blue-50 group-hover:border-blue-400 transition-all">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      {secilenDosya ? (
                        <>
                          <FileText className="w-8 h-8 text-green-500 mb-2" />
                          <p className="text-sm text-green-600 font-bold">{secilenDosya.name}</p>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="w-8 h-8 text-slate-400 group-hover:text-blue-500 mb-2" />
                          <p className="text-sm text-slate-500 group-hover:text-blue-600">PDF Yüklemek için Tıkla</p>
                        </>
                      )}
                    </div>
                    <input type="file" accept=".pdf" onChange={dosyaSec} className="hidden" />
                  </div>
                </label>
              </div>
            </div>
          </div>

          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={kaydet} 
            disabled={yukleniyor} 
            className="w-full mt-8 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-blue-500/30 transition-all flex items-center justify-center gap-2"
          >
             {yukleniyor ? <Loader2 className="animate-spin" /> : <><Save className="w-5 h-5" /> KAYDET VE QR OLUŞTUR</>}
          </motion.button>

        </motion.div>
      ) : (
        /* --- SONUÇ EKRANI (QR KOD) --- */
        <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white p-10 rounded-3xl shadow-2xl text-center border-4 border-slate-900 print:border-0 print:shadow-none print:w-full max-w-lg"
        >
          <div className="flex items-center justify-center gap-2 mb-2 text-slate-900">
             <h2 className="text-3xl font-extrabold tracking-tight">BUVİSAN</h2>
             <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded">SERVİS</span>
          </div>
          <p className="text-slate-500 mb-6 text-sm">Aşağıdaki QR kodu vinç üzerine yapıştırınız.</p>
          
          <div className="flex justify-center mb-6 p-4 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
            <QRCodeSVG value={`https://buvisan-servis.vercel.app/vinc/${olusanId}`} size={200} level={"H"} includeMargin={true} />
          </div>

          <div className="text-left bg-slate-50 p-4 rounded-xl mb-6 text-sm border border-slate-100">
            <p className="py-1 border-b border-slate-200 flex justify-between"><strong>Model:</strong> <span>{formData.model_name}</span></p>
            <p className="py-1 border-b border-slate-200 flex justify-between"><strong>Seri No:</strong> <span>{formData.serial_number}</span></p>
            <p className="py-1 flex justify-between"><strong>Müşteri:</strong> <span>{formData.customer_name}</span></p>
          </div>

          <div className="flex gap-3 justify-center print:hidden">
            <button onClick={yazdir} className="bg-slate-800 text-white px-6 py-3 rounded-xl font-bold hover:bg-black flex items-center gap-2 transition">
                <Printer className="w-4 h-4"/> Yazdır
            </button>
            <button onClick={() => {setOlusanId(null); setSecilenDosya(null);}} className="bg-blue-100 text-blue-700 px-6 py-3 rounded-xl font-bold hover:bg-blue-200 flex items-center gap-2 transition">
                <Plus className="w-4 h-4"/> Yeni Ekle
            </button>
          </div>
          <button onClick={() => router.push('/admin')} className="mt-6 text-slate-400 text-sm hover:text-slate-600 print:hidden">
            « Panele Dön
          </button>
        </motion.div>
      )}
    </div>
  );
}