"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react'; // Yüksek kalite indirme için Canvas'a geçildi
import { Save, ArrowLeft, FileText, UploadCloud, Hash, Truck, Weight, ArrowUpFromLine, User, MapPin, Loader2, Globe, Trash2, Printer, QrCode, DownloadCloud, ShieldCheck } from 'lucide-react';

export default function VincDuzenle() {
  const router = useRouter();
  const params = useParams();
  const { id } = params;

  const [yukleniyor, setYukleniyor] = useState(false);
  const [veriYukleniyor, setVeriYukleniyor] = useState(true);

  // Dosya Yükleme State'i
  const [dosyalar, setDosyalar] = useState<{ [key: string]: File | null }>({
    dosya1: null, dosya2: null, dosya3: null, dosya4: null
  });

  // Form Verileri
  const [formData, setFormData] = useState({
    serial_number: '', model_name: '', capacity: '', 
    lifting_height: '', location_address: '', customer_name: '',
    lat: '', lng: '',
    pdf_url: '', pdf_url_2: '', pdf_url_3: '', pdf_url_4: ''
  });

  // --- MEVCUT VERİYİ ÇEK VE DOLDUR ---
  useEffect(() => {
    async function veriyiGetir() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const { data, error } = await supabase
        .from('cranes')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error || !data) {
        alert("Vinç bulunamadı!");
        router.push('/admin/vincler');
        return;
      }

      setFormData({
        serial_number: data.serial_number || '',
        model_name: data.model_name || '',
        capacity: data.capacity || '',
        lifting_height: data.lifting_height || '',
        location_address: data.location_address || '',
        customer_name: data.customer_name || '',
        lat: data.lat || '',
        lng: data.lng || '',
        pdf_url: data.pdf_url || '',
        pdf_url_2: data.pdf_url_2 || '',
        pdf_url_3: data.pdf_url_3 || '',
        pdf_url_4: data.pdf_url_4 || ''
      });
      setVeriYukleniyor(false);
    }
    veriyiGetir();
  }, [id, router]);

  const handleChange = (e: any) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const dosyaSec = (key: string, e: any) => {
    if (e.target.files?.[0]) {
      setDosyalar(prev => ({ ...prev, [key]: e.target.files[0] }));
    }
  };

  const dosyaSil = (urlKey: string) => {
    if(confirm("Bu dosyayı kaldırmak istediğinize emin misiniz?")) {
        // @ts-ignore
        setFormData(prev => ({ ...prev, [urlKey]: '' }));
    }
  }

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

  const guncelle = async () => {
    setYukleniyor(true);
    try {
      const [link1, link2, link3, link4] = await Promise.all([
        dosyayiYukleVeLinkAl(dosyalar.dosya1),
        dosyayiYukleVeLinkAl(dosyalar.dosya2),
        dosyayiYukleVeLinkAl(dosyalar.dosya3),
        dosyayiYukleVeLinkAl(dosyalar.dosya4),
      ]);

      const guncelVeri = {
        ...formData,
        lat: formData.lat ? parseFloat(formData.lat) : null,
        lng: formData.lng ? parseFloat(formData.lng) : null,
        pdf_url: link1 || formData.pdf_url,
        pdf_url_2: link2 || formData.pdf_url_2,
        pdf_url_3: link3 || formData.pdf_url_3,
        pdf_url_4: link4 || formData.pdf_url_4,
      };

      const { data, error } = await supabase
        .from('cranes')
        .update(guncelVeri)
        .eq('id', id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        alert("HATA: Güncelleme gerçekleşmedi! RLS ayarlarını kontrol et.");
        return;
      }
      
      alert("Vinç başarıyla güncellendi! ✅");
      router.push('/admin/vincler');

    } catch (error: any) {
      alert("Hata: " + error.message);
    } finally {
      setYukleniyor(false);
    }
  };

  // --- YAZDIRMA ---
  const yazdir = () => {
    window.print();
  };

  // --- YENİ: YÜKSEK KALİTE QR İNDİRME OTOMASYONU ---
  const qrIndir = () => {
    const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement;
    if (canvas) {
      const pngUrl = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
      const downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      
      // İşletim sistemlerinin izin vermediği karakterleri (-) ile değiştirerek güvenli isim oluşturma
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

  if (veriYukleniyor) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-blue-600 gap-4">
      <Loader2 className="animate-spin w-10 h-10" />
      <span className="font-semibold tracking-widest uppercase text-sm">Veriler Çekiliyor...</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 flex flex-col items-center pb-20 font-sans text-slate-800">
      
      {/* BAŞLIK ALANI */}
      <div className="w-full max-w-5xl flex items-center justify-between mb-8 print:hidden">
        <button onClick={() => router.push('/admin/vincler')} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 transition-all font-semibold text-sm">
          <ArrowLeft className="w-4 h-4" /> Listeye Dön
        </button>
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-lg"><ShieldCheck className="w-5 h-5 text-blue-600"/></div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Kayıt Düzenle</h1>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-5xl space-y-6">
          
          {/* ANA FORM KARTI */}
          <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 print:shadow-none print:border-none print:p-0">
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
                    <input name="serial_number" value={formData.serial_number} onChange={handleChange} className="w-full pl-12 p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold text-slate-700" />
                  </div>
                </div>
                
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">Model</label>
                  <div className="relative group">
                    <Truck className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors"/>
                    <input name="model_name" value={formData.model_name} onChange={handleChange} className="w-full pl-12 p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold text-slate-700" />
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="w-1/2">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">Kapasite</label>
                    <div className="relative group">
                      <Weight className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors"/>
                      <input name="capacity" value={formData.capacity} onChange={handleChange} className="w-full pl-12 p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold text-slate-700" />
                    </div>
                  </div>
                  <div className="w-1/2">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">Yükseklik</label>
                    <div className="relative group">
                      <ArrowUpFromLine className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors"/>
                      <input name="lifting_height" value={formData.lifting_height} onChange={handleChange} className="w-full pl-12 p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold text-slate-700" />
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
                    <input name="customer_name" value={formData.customer_name} onChange={handleChange} className="w-full pl-12 p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold text-slate-700" />
                  </div>
                </div>
                
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">Açık Adres</label>
                  <div className="relative group">
                    <MapPin className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors"/>
                    <input name="location_address" value={formData.location_address} onChange={handleChange} className="w-full pl-12 p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold text-slate-700" />
                  </div>
                </div>
                
                {/* KOORDİNATLAR */}
                <div className="flex gap-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                    <div className="w-1/2">
                      <label className="text-[11px] font-bold text-blue-600 uppercase tracking-wider ml-1 mb-1 block">Enlem (Lat)</label>
                      <div className="relative">
                          <Globe className="absolute left-3 top-3 text-blue-400 w-4 h-4"/>
                          <input name="lat" value={formData.lat} placeholder="40.xxxx" onChange={handleChange} className="w-full pl-9 p-2 bg-white border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-700 transition-all" />
                      </div>
                    </div>
                    <div className="w-1/2">
                      <label className="text-[11px] font-bold text-blue-600 uppercase tracking-wider ml-1 mb-1 block">Boylam (Lng)</label>
                      <div className="relative">
                          <Globe className="absolute left-3 top-3 text-blue-400 w-4 h-4"/>
                          <input name="lng" value={formData.lng} placeholder="29.xxxx" onChange={handleChange} className="w-full pl-9 p-2 bg-white border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-700 transition-all" />
                      </div>
                    </div>
                </div>
              </div>
            </div>
          </div>

          {/* DOKÜMAN YÖNETİMİ KARTI */}
          <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 print:hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4 mb-6">
              <FileText className="w-5 h-5 text-blue-500"/>
              <h3 className="font-extrabold text-slate-800 text-lg">Doküman Yönetimi</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { key: 'dosya1', label: '1. İş Emri Formu', urlKey: 'pdf_url' },
                  { key: 'dosya2', label: '2. Devreye Alma Formu', urlKey: 'pdf_url_2' },
                  { key: 'dosya3', label: '3. Elektrik Şeması', urlKey: 'pdf_url_3' },
                  { key: 'dosya4', label: '4. Genel Montaj', urlKey: 'pdf_url_4' }
                ].map((item) => (
                  <div key={item.key} className="bg-slate-50 p-5 rounded-2xl border border-slate-200/60 hover:border-blue-200 transition-colors">
                      <div className="flex justify-between items-center mb-3">
                          <span className="text-sm font-bold text-slate-700">{item.label}</span>
                          {/* @ts-ignore */}
                          {formData[item.urlKey] ? (
                              <div className="flex gap-2 items-center">
                                  {/* @ts-ignore */}
                                  <a href={formData[item.urlKey]} target="_blank" className="text-[10px] bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-200 transition-colors flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3"/> MEVCUT DOSYA
                                  </a>
                                  <button onClick={() => dosyaSil(item.urlKey)} className="text-rose-500 hover:text-rose-700 p-1.5 bg-white rounded-lg border border-rose-100 hover:bg-rose-50 transition-colors"><Trash2 className="w-4 h-4"/></button>
                              </div>
                          ) : (
                              <span className="text-[10px] bg-slate-200 text-slate-500 px-3 py-1.5 rounded-lg font-bold">DOSYA YOK</span>
                          )}
                      </div>
                      
                      <label className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${dosyalar[item.key] ? 'bg-emerald-50/50 border-emerald-400' : 'bg-white hover:border-blue-400 border-slate-200'}`}>
                          <UploadCloud className={`w-6 h-6 mb-2 ${dosyalar[item.key] ? 'text-emerald-500' : 'text-slate-400'}`} />
                          <span className="text-xs font-semibold text-slate-600 text-center px-2">
                            {dosyalar[item.key] ? <span className="text-emerald-600">{dosyalar[item.key]!.name}</span> : "Yeni PDF Yükle veya Sürükle"}
                          </span>
                          <input type="file" accept=".pdf" onChange={(e) => dosyaSec(item.key, e)} className="hidden" />
                      </label>
                  </div>
                ))}
            </div>
            
            <button onClick={guncelle} disabled={yukleniyor} className="w-full mt-8 bg-slate-800 hover:bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-lg shadow-slate-300 transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.99]">
              {yukleniyor ? <Loader2 className="animate-spin" /> : <><Save className="w-5 h-5" /> DEĞİŞİKLİKLERİ KAYDET VE GÜNCELLE</>}
            </button>
          </div>

          {/* --- YENİ EKLENEN QR KOD ALANI --- */}
          <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 print:hidden border-b border-slate-100 pb-4">
                <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-lg"><QrCode className="w-6 h-6 text-blue-600"/></div>
                    QR Kimlik Kartı & Etiket
                </h3>
                <div className="flex gap-3 w-full md:w-auto">
                  <button onClick={yazdir} className="flex-1 md:flex-none bg-slate-50 border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                      <Printer className="w-4 h-4"/> A4 Yazdır
                  </button>
                  <button onClick={qrIndir} className="flex-1 md:flex-none bg-blue-50 border border-blue-100 text-blue-600 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors flex items-center justify-center gap-2">
                      <DownloadCloud className="w-4 h-4"/> Resim Olarak İndir
                  </button>
                </div>
             </div>

             <div className="flex flex-col md:flex-row gap-8 items-center justify-center bg-slate-50 p-8 rounded-3xl border border-slate-200 print:bg-white print:border-[3px] print:border-black print:p-6 print:rounded-2xl max-w-2xl mx-auto">
                 
                 {/* QR Kod - Yüksek Çözünürlüklü Canvas */}
                 <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 print:shadow-none print:border-2 print:border-black">
                    <QRCodeCanvas 
                        id="qr-canvas"
                        value={`https://servis.buvisan.com/vinc/${id}`} 
                        size={1024} // Gerçek render boyutu (1024x1024 px - Bastırmak için çok yüksek kalite)
                        style={{ width: "180px", height: "180px" }} // Ekranda görünen boyutu
                        level={"H"} 
                        includeMargin={true} 
                    />
                 </div>

                 {/* Yan Bilgiler */}
                 <div className="text-center md:text-left space-y-2 flex-1">
                     <div className="text-3xl font-black text-slate-900 tracking-tighter">BUVİSAN</div>
                     <div className="text-[11px] font-black text-blue-600 uppercase tracking-[0.3em] mb-4">Dijital Kimlik Kartı</div>
                     
                     <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2 print:border-none print:p-0 print:bg-transparent">
                       <div className="text-sm text-slate-700 flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-1 print:border-black">
                         <span className="text-[10px] text-slate-400 font-bold uppercase">Seri No</span>
                         <strong className="font-mono">{formData.serial_number || '-'}</strong>
                       </div>
                       <div className="text-sm text-slate-700 flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-1 print:border-black">
                         <span className="text-[10px] text-slate-400 font-bold uppercase">Model</span>
                         <strong className="text-right">{formData.model_name || '-'}</strong>
                       </div>
                       <div className="text-sm text-slate-700 flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-1 print:border-black">
                         <span className="text-[10px] text-slate-400 font-bold uppercase">Kapasite</span>
                         <strong className="text-right">{formData.capacity || '-'}</strong>
                       </div>
                       <div className="text-sm text-slate-700 flex flex-col md:flex-row md:items-center md:justify-between">
                         <span className="text-[10px] text-slate-400 font-bold uppercase">Firma</span>
                         <strong className="text-right text-blue-700 print:text-black">{formData.customer_name || '-'}</strong>
                       </div>
                     </div>
                     <div className="text-[9px] text-slate-400 mt-3 font-medium text-center md:text-left">Bu QR kodu okutarak vincin dijital servis defterine ulaşabilirsiniz.</div>
                 </div>
             </div>
          </div>

      </motion.div>
    </div>
  );
}