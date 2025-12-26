"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { QRCodeSVG } from 'qrcode.react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Save, Printer, Plus, ArrowLeft, FileText, UploadCloud, Hash, Truck, Weight, ArrowUpFromLine, User, MapPin, Loader2 } from 'lucide-react';

export default function YeniVincEkle() {
  const router = useRouter();
  const [yukleniyor, setYukleniyor] = useState(false);
  const [izinKontrol, setIzinKontrol] = useState(true);

  // 4 Farklı Dosya İçin State
  const [dosyalar, setDosyalar] = useState<{ [key: string]: File | null }>({
    dosya1: null,
    dosya2: null,
    dosya3: null,
    dosya4: null
  });

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

  const handleChange = (e: any) => setFormData({ ...formData, [e.target.name]: e.target.value });

  // Dosya Seçme Fonksiyonu
  const dosyaSec = (key: string, e: any) => {
    if (e.target.files?.[0]) {
      setDosyalar(prev => ({ ...prev, [key]: e.target.files[0] }));
    }
  };

  const dosyaIsminiTemizle = (isim: string) => {
    return isim.replace(/[^a-zA-Z0-9.-]/g, '').toLowerCase();
  };

  // Tek bir dosyayı yükleyip linkini döndüren yardımcı fonksiyon
  const dosyayiYukleVeLinkAl = async (dosya: File | null) => {
    if (!dosya) return null;
    const temizIsim = dosyaIsminiTemizle(dosya.name);
    const dosyaAdi = `${Date.now()}-${Math.floor(Math.random()*1000)}-${temizIsim}`;
    
    const { error } = await supabase.storage.from('dokumanlar').upload(dosyaAdi, dosya);
    if (error) throw error;
    
    const { data } = supabase.storage.from('dokumanlar').getPublicUrl(dosyaAdi);
    return data.publicUrl;
  };

  const kaydet = async () => {
    setYukleniyor(true);
    try {
      // 4 Dosyayı Paralel Yükle
      const [link1, link2, link3, link4] = await Promise.all([
        dosyayiYukleVeLinkAl(dosyalar.dosya1),
        dosyayiYukleVeLinkAl(dosyalar.dosya2),
        dosyayiYukleVeLinkAl(dosyalar.dosya3),
        dosyayiYukleVeLinkAl(dosyalar.dosya4),
      ]);

      const { data, error } = await supabase
        .from('cranes')
        .insert([{ 
          ...formData, 
          pdf_url: link1, 
          pdf_url_2: link2, 
          pdf_url_3: link3, 
          pdf_url_4: link4 
        }])
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
      <div className="w-full max-w-4xl flex items-center justify-between mb-8">
        <button onClick={() => router.push('/admin')} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition"><ArrowLeft className="w-5 h-5" /> Panele Dön</button>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">🏗️ Yeni Vinç Kaydı</h1>
      </div>

      {!olusanId ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-4xl border border-slate-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-4">
              <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Seri No</label><div className="relative"><Hash className="absolute left-3 top-3 text-slate-400 w-5 h-5"/><input name="serial_number" onChange={handleChange} className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
              <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Model</label><div className="relative"><Truck className="absolute left-3 top-3 text-slate-400 w-5 h-5"/><input name="model_name" onChange={handleChange} className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
              <div className="flex gap-4">
                <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Kapasite</label><div className="relative"><Weight className="absolute left-3 top-3 text-slate-400 w-5 h-5"/><input name="capacity" onChange={handleChange} className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
                <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Yükseklik</label><div className="relative"><ArrowUpFromLine className="absolute left-3 top-3 text-slate-400 w-5 h-5"/><input name="lifting_height" onChange={handleChange} className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
              </div>
            </div>
            <div className="space-y-4">
              <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Müşteri</label><div className="relative"><User className="absolute left-3 top-3 text-slate-400 w-5 h-5"/><input name="customer_name" onChange={handleChange} className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
              <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Adres</label><div className="relative"><MapPin className="absolute left-3 top-3 text-slate-400 w-5 h-5"/><input name="location_address" onChange={handleChange} className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
            </div>
          </div>

          {/* --- DOSYA YÜKLEME ALANI (4 ADET) --- */}
          <h3 className="text-sm font-bold text-slate-800 mb-3 border-b pb-2">📂 Doküman Yükleme Alanı</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* Dosya 1 (Ana) */}
             <label className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer transition ${dosyalar.dosya1 ? 'bg-green-50 border-green-500' : 'bg-slate-50 hover:bg-blue-50 hover:border-blue-400'}`}>
                <FileText className={`w-6 h-6 mb-2 ${dosyalar.dosya1 ? 'text-green-600' : 'text-slate-400'}`} />
                <span className="text-xs font-bold text-slate-600">{dosyalar.dosya1 ? dosyalar.dosya1.name : "1. İş Emri Formu"}</span>
                <input type="file" accept=".pdf" onChange={(e) => dosyaSec('dosya1', e)} className="hidden" />
             </label>

             {/* Dosya 2 */}
             <label className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer transition ${dosyalar.dosya2 ? 'bg-green-50 border-green-500' : 'bg-slate-50 hover:bg-blue-50 hover:border-blue-400'}`}>
                <UploadCloud className={`w-6 h-6 mb-2 ${dosyalar.dosya2 ? 'text-green-600' : 'text-slate-400'}`} />
                <span className="text-xs font-bold text-slate-600">{dosyalar.dosya2 ? dosyalar.dosya2.name : "2. Devreye Alma Formu"}</span>
                <input type="file" accept=".pdf" onChange={(e) => dosyaSec('dosya2', e)} className="hidden" />
             </label>

             {/* Dosya 3 */}
             <label className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer transition ${dosyalar.dosya3 ? 'bg-green-50 border-green-500' : 'bg-slate-50 hover:bg-blue-50 hover:border-blue-400'}`}>
                <UploadCloud className={`w-6 h-6 mb-2 ${dosyalar.dosya3 ? 'text-green-600' : 'text-slate-400'}`} />
                <span className="text-xs font-bold text-slate-600">{dosyalar.dosya3 ? dosyalar.dosya3.name : "3. Elektrik Şeması"}</span>
                <input type="file" accept=".pdf" onChange={(e) => dosyaSec('dosya3', e)} className="hidden" />
             </label>

             {/* Dosya 4 */}
             <label className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer transition ${dosyalar.dosya4 ? 'bg-green-50 border-green-500' : 'bg-slate-50 hover:bg-blue-50 hover:border-blue-400'}`}>
                <UploadCloud className={`w-6 h-6 mb-2 ${dosyalar.dosya4 ? 'text-green-600' : 'text-slate-400'}`} />
                <span className="text-xs font-bold text-slate-600">{dosyalar.dosya4 ? dosyalar.dosya4.name : "4. Genel Montaj"}</span>
                <input type="file" accept=".pdf" onChange={(e) => dosyaSec('dosya4', e)} className="hidden" />
             </label>
          </div>

          <button onClick={kaydet} disabled={yukleniyor} className="w-full mt-8 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-blue-500/30 transition flex items-center justify-center gap-2">
            {yukleniyor ? <Loader2 className="animate-spin" /> : <><Save className="w-5 h-5" /> KAYDET VE QR OLUŞTUR</>}
          </button>
        </motion.div>
      ) : (
        <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="bg-white p-10 rounded-3xl shadow-2xl text-center border-4 border-slate-900">
          <h2 className="text-3xl font-extrabold mb-2">QR HAZIR!</h2>
          <div className="flex justify-center mb-6 p-4 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
            <QRCodeSVG value={`https://buvisan-servis.vercel.app/vinc/${olusanId}`} size={200} level={"H"} includeMargin={true} />
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={yazdir} className="bg-slate-800 text-white px-6 py-3 rounded-xl font-bold hover:bg-black flex gap-2"><Printer className="w-4 h-4"/> Yazdır</button>
            <button onClick={() => window.location.reload()} className="bg-blue-100 text-blue-700 px-6 py-3 rounded-xl font-bold hover:bg-blue-200 flex gap-2"><Plus className="w-4 h-4"/> Yeni Ekle</button>
          </div>
        </motion.div>
      )}
    </div>
  );
}