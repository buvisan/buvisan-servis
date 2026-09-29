"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { QRCodeCanvas } from 'qrcode.react'; // Yüksek kalite resim indirme için eklendi
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Save, Printer, Plus, ArrowLeft, FileText, UploadCloud, Hash, Truck, Weight, ArrowUpFromLine, User, MapPin, Loader2, Globe, ShieldCheck, QrCode, DownloadCloud, CheckCircle2 } from 'lucide-react';

export default function YeniVincEkle() {
  const router = useRouter();
  const [yukleniyor, setYukleniyor] = useState(false);
  const [izinKontrol, setIzinKontrol] = useState(true);

  // 4 Farklı Dosya İçin State
  const [dosyalar, setDosyalar] = useState<{ [key: string]: File | null }>({
    dosya1: null, dosya2: null, dosya3: null, dosya4: null
  });

  useEffect(() => {
    async function kontrolEt() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) router.push('/login');
      else setIzinKontrol(false);
    }
    kontrolEt();
  }, [router]);

  // --- FORM DATASINA 'lat' VE 'lng' EKLEDİK ---
  const [formData, setFormData] = useState({
    serial_number: '', model_name: '', capacity: '', 
    lifting_height: '', location_address: '', customer_name: '',
    lat: '', lng: '' 
  });
  
  const [olusanId, setOlusanId] = useState<string | null>(null);

  const handleChange = (e: any) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const dosyaSec = (key: string, e: any) => {
    if (e.target.files?.[0]) {
      setDosyalar(prev => ({ ...prev, [key]: e.target.files[0] }));
    }
  };

  const dosyaIsminiTemizle = (isim: string) => isim.replace(/[^a-zA-Z0-9.-]/g, '').toLowerCase();

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
          lat: formData.lat ? parseFloat(formData.lat) : null,
          lng: formData.lng ? parseFloat(formData.lng) : null,
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

  // --- YENİ: YÜKSEK KALİTE QR İNDİRME OTOMASYONU ---
  const qrIndir = () => {
    const canvas = document.getElementById('qr-canvas-new') as HTMLCanvasElement;
    if (canvas) {
      const pngUrl = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
      const downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      
      const rawName = `Firma-${formData.customer_name || 'Yok'} Tonaj-${formData.capacity || 'Yok'} Model-${formData.model_name || 'Yok'}`;
      const safeFileName = rawName.replace(/[/\\?%*:|"<>]/g, '-') + '.png';
      
      downloadLink.download = safeFileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } else {
      alert("QR Kod henüz yüklenmedi, lütfen bekleyin.");
    }
  };

  if (izinKontrol) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-blue-600 gap-4">
      <Loader2 className="animate-spin w-10 h-10" />
      <span className="font-semibold tracking-widest uppercase text-sm">Erişim Kontrol Ediliyor...</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 flex flex-col items-center pb-20 font-sans text-slate-800">
      
      <div className="w-full max-w-5xl flex items-center justify-between mb-8 print:hidden">
        <button onClick={() => router.push('/admin')} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 transition-all font-semibold text-sm">
          <ArrowLeft className="w-4 h-4" /> Panele Dön
        </button>
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-lg"><Plus className="w-5 h-5 text-blue-600"/></div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Yeni Vinç Kaydı</h1>
        </div>
      </div>

      {!olusanId ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-5xl space-y-6">
          
          {/* ANA FORM KARTI */}
          <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-4">
              
              {/* SOL KOLON */}
              <div className="space-y-5">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-4">
                  <Truck className="w-4 h-4 text-slate-400"/>
                  <h3 className="font-bold text-slate-700 text-sm tracking-widest uppercase">Teknik Detaylar</h3>
                </div>
                
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">Seri No</label>
                  <div className="relative group">
                    <Hash className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors"/>
                    <input name="serial_number" onChange={handleChange} className="w-full pl-12 p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold text-slate-700" />
                  </div>
                </div>
                
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">Model</label>
                  <div className="relative group">
                    <Truck className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors"/>
                    <input name="model_name" onChange={handleChange} className="w-full pl-12 p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold text-slate-700" />
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="w-1/2">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">Kapasite</label>
                    <div className="relative group">
                      <Weight className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors"/>
                      <input name="capacity" onChange={handleChange} className="w-full pl-12 p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold text-slate-700" />
                    </div>
                  </div>
                  <div className="w-1/2">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">Yükseklik</label>
                    <div className="relative group">
                      <ArrowUpFromLine className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors"/>
                      <input name="lifting_height" onChange={handleChange} className="w-full pl-12 p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold text-slate-700" />
                    </div>
                  </div>
                </div>
              </div>

              {/* SAĞ KOLON */}
              <div className="space-y-5">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-4">
                  <User className="w-4 h-4 text-slate-400"/>
                  <h3 className="font-bold text-slate-700 text-sm tracking-widest uppercase">Müşteri & Konum</h3>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">Müşteri / Firma Adı</label>
                  <div className="relative group">
                    <User className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors"/>
                    <input name="customer_name" onChange={handleChange} className="w-full pl-12 p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold text-slate-700" />
                  </div>
                </div>
                
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">Açık Adres (Metin)</label>
                  <div className="relative group">
                    <MapPin className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors"/>
                    <input name="location_address" onChange={handleChange} className="w-full pl-12 p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold text-slate-700" />
                  </div>
                </div>
                
                {/* KOORDİNATLAR */}
                <div className="flex flex-col gap-2 p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                    <div className="flex gap-4">
                        <div className="w-1/2">
                          <label className="text-[11px] font-bold text-blue-600 uppercase tracking-wider ml-1 mb-1 block">Enlem (Lat)</label>
                          <div className="relative">
                              <Globe className="absolute left-3 top-3 text-blue-400 w-4 h-4"/>
                              <input name="lat" placeholder="40.xxxx" onChange={handleChange} className="w-full pl-9 p-2 bg-white border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-700 transition-all" />
                          </div>
                        </div>
                        <div className="w-1/2">
                          <label className="text-[11px] font-bold text-blue-600 uppercase tracking-wider ml-1 mb-1 block">Boylam (Lng)</label>
                          <div className="relative">
                              <Globe className="absolute left-3 top-3 text-blue-400 w-4 h-4"/>
                              <input name="lng" placeholder="29.xxxx" onChange={handleChange} className="w-full pl-9 p-2 bg-white border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-700 transition-all" />
                          </div>
                        </div>
                    </div>
                    <p className="text-[10px] text-blue-400/80 text-center mt-1 font-medium">* Google Maps'te konuma sağ tıklayıp en üstteki sayıları kopyalayın.</p>
                </div>
              </div>
            </div>
          </div>

          {/* DOKÜMAN YÖNETİMİ KARTI */}
          <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4 mb-6">
              <FileText className="w-5 h-5 text-blue-500"/>
              <h3 className="font-extrabold text-slate-800 text-lg">Doküman Yükleme Alanı</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'dosya1', label: '1. İş Emri Formu' },
                  { key: 'dosya2', label: '2. Devreye Alma Formu' },
                  { key: 'dosya3', label: '3. Elektrik Şeması' },
                  { key: 'dosya4', label: '4. Genel Montaj' }
                ].map((item) => (
                  <label key={item.key} className={`flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 ${dosyalar[item.key] ? 'bg-emerald-50/50 border-emerald-400' : 'bg-slate-50 border-slate-200 hover:border-blue-400 hover:bg-blue-50/30'}`}>
                      <UploadCloud className={`w-7 h-7 mb-2 ${dosyalar[item.key] ? 'text-emerald-500' : 'text-slate-400'}`} />
                      <span className="text-xs font-semibold text-slate-600 text-center px-2">
                        {dosyalar[item.key] ? <span className="text-emerald-600">{dosyalar[item.key]!.name}</span> : item.label}
                      </span>
                      <input type="file" accept=".pdf" onChange={(e) => dosyaSec(item.key, e)} className="hidden" />
                  </label>
                ))}
            </div>

            <button onClick={kaydet} disabled={yukleniyor} className="w-full mt-8 bg-slate-800 hover:bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-lg shadow-slate-300 transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.99]">
              {yukleniyor ? <Loader2 className="animate-spin" /> : <><Save className="w-5 h-5" /> KAYDET VE QR OLUŞTUR</>}
            </button>
          </div>

        </motion.div>
      ) : (
        
        // --- YENİLENEN QR SONUÇ EKRANI ---
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white p-10 rounded-[2rem] shadow-2xl text-center border-t-8 border-t-blue-600 max-w-2xl w-full">
          
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
             <CheckCircle2 className="w-10 h-10 text-emerald-500"/>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-800 mb-2">Kayıt Başarılı!</h2>
          <p className="text-slate-500 text-sm mb-8">Vinç sisteme eklendi ve dijital kimlik kartı oluşturuldu.</p>
          
          <div className="flex justify-center mb-8 p-6 border border-slate-100 rounded-3xl bg-slate-50 shadow-inner">
             {/* Yüksek Çözünürlüklü Canvas (1024x1024 render, 200x200 gösterim) */}
             <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
               <QRCodeCanvas 
                  id="qr-canvas-new"
                  value={`https://servis.buvisan.com/vinc/${olusanId}`} 
                  size={1024} 
                  style={{ width: "200px", height: "200px" }}
                  level={"H"} 
                  includeMargin={true} 
               />
             </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={yazdir} className="flex-1 bg-slate-100 text-slate-700 px-6 py-4 rounded-xl font-bold hover:bg-slate-200 transition-colors flex items-center justify-center gap-2">
               <Printer className="w-5 h-5"/> A4 Yazdır
            </button>
            <button onClick={qrIndir} className="flex-1 bg-slate-800 text-white px-6 py-4 rounded-xl font-bold hover:bg-slate-900 transition-colors shadow-lg shadow-slate-300 flex items-center justify-center gap-2">
               <DownloadCloud className="w-5 h-5"/> QR İndir
            </button>
            <button onClick={() => window.location.reload()} className="flex-1 bg-blue-50 text-blue-600 px-6 py-4 rounded-xl font-bold hover:bg-blue-100 transition-colors border border-blue-100 flex items-center justify-center gap-2">
               <Plus className="w-5 h-5"/> Yeni Ekle
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}