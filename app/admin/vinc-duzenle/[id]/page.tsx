"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Save, ArrowLeft, FileText, UploadCloud, Hash, Truck, Weight, ArrowUpFromLine, User, MapPin, Loader2, Globe, Trash2 } from 'lucide-react';

export default function VincDuzenle() {
  const router = useRouter();
  const params = useParams();
  const { id } = params;

  const [yukleniyor, setYukleniyor] = useState(false);
  const [veriYukleniyor, setVeriYukleniyor] = useState(true);

  // Dosya Yükleme State'i (Yeni yüklenecekler için)
  const [dosyalar, setDosyalar] = useState<{ [key: string]: File | null }>({
    dosya1: null, dosya2: null, dosya3: null, dosya4: null
  });

  // Form Verileri (Orijinal yapıya uygun)
  const [formData, setFormData] = useState({
    serial_number: '', model_name: '', capacity: '', 
    lifting_height: '', location_address: '', customer_name: '',
    lat: '', lng: '', // Koordinat alanları
    pdf_url: '', pdf_url_2: '', pdf_url_3: '', pdf_url_4: ''
  });

  // --- MEVCUT VERİYİ ÇEK VE DOLDUR ---
  useEffect(() => {
    async function veriyiGetir() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      // ID'ye göre vinç verisini çek
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

      // State'i doldur
      setFormData({
        serial_number: data.serial_number || '',
        model_name: data.model_name || '',
        capacity: data.capacity || '',
        lifting_height: data.lifting_height || '',
        location_address: data.location_address || '',
        customer_name: data.customer_name || '',
        lat: data.lat || '', // Koordinatları doldur
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

  // Mevcut dosya linkini silmek için (Boş string yapar)
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

// --- GÜNCELLEME İŞLEMİ (Geliştirilmiş) ---
  const guncelle = async () => {
    setYukleniyor(true);
    try {
      // 1. Yeni seçilen dosyalar varsa yükle
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

      // 🔥 KRİTİK DEĞİŞİKLİK BURADA 🔥
      const { data, error } = await supabase
        .from('cranes')
        .update(guncelVeri)
        .eq('id', id)
        .select(); // <-- Güncellenen veriyi geri istiyoruz

      if (error) throw error;

      // Eğer hata yoksa ama data boşsa, Supabase sessizce reddetmiştir
      if (!data || data.length === 0) {
        alert("HATA: Güncelleme gerçekleşmedi! Supabase RLS politikalarını kontrol et.");
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

  if (veriYukleniyor) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-blue-600"><Loader2 className="animate-spin w-8 h-8" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center">
      <div className="w-full max-w-4xl flex items-center justify-between mb-8">
        <button onClick={() => router.push('/admin/vincler')} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition"><ArrowLeft className="w-5 h-5" /> Listeye Dön</button>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">✏️ Vinç Düzenle</h1>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-4xl border border-slate-100">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* SOL KOLON */}
            <div className="space-y-4">
              <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Seri No</label><div className="relative"><Hash className="absolute left-3 top-3 text-slate-400 w-5 h-5"/><input name="serial_number" value={formData.serial_number} onChange={handleChange} className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
              <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Model</label><div className="relative"><Truck className="absolute left-3 top-3 text-slate-400 w-5 h-5"/><input name="model_name" value={formData.model_name} onChange={handleChange} className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
              <div className="flex gap-4">
                <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Kapasite</label><div className="relative"><Weight className="absolute left-3 top-3 text-slate-400 w-5 h-5"/><input name="capacity" value={formData.capacity} onChange={handleChange} className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
                <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Yükseklik</label><div className="relative"><ArrowUpFromLine className="absolute left-3 top-3 text-slate-400 w-5 h-5"/><input name="lifting_height" value={formData.lifting_height} onChange={handleChange} className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
              </div>
            </div>

            {/* SAĞ KOLON */}
            <div className="space-y-4">
              <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Müşteri</label><div className="relative"><User className="absolute left-3 top-3 text-slate-400 w-5 h-5"/><input name="customer_name" value={formData.customer_name} onChange={handleChange} className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
              <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Adres (Metin)</label><div className="relative"><MapPin className="absolute left-3 top-3 text-slate-400 w-5 h-5"/><input name="location_address" value={formData.location_address} onChange={handleChange} className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
              
              {/* KOORDİNATLAR */}
              <div className="flex gap-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <div className="w-1/2">
                    <label className="text-xs font-bold text-blue-500 uppercase ml-1">Enlem (Lat)</label>
                    <div className="relative">
                        <Globe className="absolute left-3 top-3 text-blue-400 w-4 h-4"/>
                        <input name="lat" value={formData.lat} placeholder="40.xxxx" onChange={handleChange} className="w-full pl-9 p-2 bg-white border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-700" />
                    </div>
                  </div>
                  <div className="w-1/2">
                    <label className="text-xs font-bold text-blue-500 uppercase ml-1">Boylam (Lng)</label>
                    <div className="relative">
                        <Globe className="absolute left-3 top-3 text-blue-400 w-4 h-4"/>
                        <input name="lng" value={formData.lng} placeholder="29.xxxx" onChange={handleChange} className="w-full pl-9 p-2 bg-white border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-700" />
                    </div>
                  </div>
              </div>
            </div>
          </div>

          {/* DOKÜMAN YÖNETİMİ */}
          <h3 className="text-sm font-bold text-slate-800 mb-3 border-b pb-2">📂 Doküman Yönetimi</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {[
                { key: 'dosya1', label: '1. İş Emri Formu', urlKey: 'pdf_url' },
                { key: 'dosya2', label: '2. Devreye Alma Formu', urlKey: 'pdf_url_2' },
                { key: 'dosya3', label: '3. Elektrik Şeması', urlKey: 'pdf_url_3' },
                { key: 'dosya4', label: '4. Genel Montaj', urlKey: 'pdf_url_4' }
             ].map((item) => (
                <div key={item.key} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-slate-600">{item.label}</span>
                        
                        {/* Mevcut dosya varsa göster */}
                        {/* @ts-ignore */}
                        {formData[item.urlKey] ? (
                            <div className="flex gap-2 items-center">
                                {/* @ts-ignore */}
                                <a href={formData[item.urlKey]} target="_blank" className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded font-bold hover:bg-green-200">MEVCUT DOSYAYI GÖR</a>
                                <button onClick={() => dosyaSil(item.urlKey)} className="text-red-500 hover:text-red-700 p-1 bg-white rounded border border-red-100"><Trash2 className="w-3 h-3"/></button>
                            </div>
                        ) : (
                            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded font-bold">DOSYA YOK</span>
                        )}
                    </div>
                    
                    <label className={`flex flex-col items-center justify-center p-3 border-2 border-dashed rounded-lg cursor-pointer transition ${dosyalar[item.key] ? 'bg-green-50 border-green-500' : 'bg-white hover:border-blue-400'}`}>
                        <UploadCloud className={`w-5 h-5 mb-1 ${dosyalar[item.key] ? 'text-green-600' : 'text-slate-400'}`} />
                        <span className="text-[10px] text-slate-500">{dosyalar[item.key] ? dosyalar[item.key]!.name : "Dosya Yükle / Değiştir"}</span>
                        <input type="file" accept=".pdf" onChange={(e) => dosyaSec(item.key, e)} className="hidden" />
                    </label>
                </div>
             ))}
          </div>

          <button onClick={guncelle} disabled={yukleniyor} className="w-full mt-8 bg-slate-800 hover:bg-black text-white font-bold py-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2">
            {yukleniyor ? <Loader2 className="animate-spin" /> : <><Save className="w-5 h-5" /> DEĞİŞİKLİKLERİ KAYDET</>}
          </button>
      </motion.div>
    </div>
  );
}