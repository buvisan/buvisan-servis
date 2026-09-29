"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
// --- YENİ EKLENEN KÜTÜPHANELER (Toplu QR için) ---
import { QRCodeCanvas } from 'qrcode.react'; 
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
// -----------------------------------------------
import { 
  ArrowLeft, ExternalLink, Search, Package, MapPin, User, Loader2, 
  History, X, Calendar, CheckCircle2, Pencil, QrCode, DownloadCloud, AlertTriangle, Truck, Wrench 
} from 'lucide-react';

export default function VinclerListesi() {
  const router = useRouter();
  const [vincler, setVincler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [arama, setArama] = useState("");

  // Toplu İndirme State'i
  const [qrIndiriliyor, setQrIndiriliyor] = useState(false);

  // --- MODAL İÇİN STATE'LER ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [secilenVincId, setSecilenVincId] = useState<string | null>(null);
  const [modalForm, setModalForm] = useState({
    event_type: 'bakim',
    title: '',
    description: '',
    technician_name: '',
    created_at: new Date().toISOString().split('T')[0]
  });
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => {
    verileriGetir();
  }, []);

  async function verileriGetir() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/login'); return; }

    const { data, error } = await supabase
      .from('cranes')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setVincler(data || []);
    setYukleniyor(false);
  }

  // --- MODAL FONKSİYONLARI ---
  const modalAc = (id: string) => {
    setSecilenVincId(id);
    setModalForm({
        event_type: 'bakim',
        title: '',
        description: '',
        technician_name: '',
        created_at: new Date().toISOString().split('T')[0]
    });
    setIsModalOpen(true);
  };

  const gecmisKaydet = async () => {
    if (!secilenVincId || !modalForm.title) return alert("Başlık zorunludur!");
    setKaydediliyor(true);
    const { error } = await supabase.from('crane_history').insert([{
        crane_id: secilenVincId,
        event_type: modalForm.event_type,
        title: modalForm.title,
        description: modalForm.description,
        technician_name: modalForm.technician_name,
        created_at: modalForm.created_at
    }]);
    
    if (error) {
        alert("Hata: " + error.message);
    } else {
        alert("İşlem başarıyla geçmişe eklendi! ✅");
        setIsModalOpen(false);
    }
    setKaydediliyor(false);
  };

  const filtrelenmisVincler = vincler.filter(v => 
    v.serial_number?.toLowerCase().includes(arama.toLowerCase()) ||
    v.customer_name?.toLowerCase().includes(arama.toLowerCase()) ||
    v.model_name?.toLowerCase().includes(arama.toLowerCase())
  );

  // --- YENİ: TOPLU QR KOD İNDİRME FONKSİYONU ---
  const topluQrIndir = async () => {
    if (filtrelenmisVincler.length === 0) return alert("İndirilecek vinç bulunamadı.");
    setQrIndiriliyor(true);

    try {
      const zip = new JSZip();
      
      // Ekranda gizli render edilecek Canvas'ları yakalamak için Promise zinciri
      const qrPromises = filtrelenmisVincler.map((vinc) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            const canvas = document.getElementById(`qr-canvas-${vinc.id}`) as HTMLCanvasElement;
            if (canvas) {
              const dataUrl = canvas.toDataURL("image/png");
              // Base64 başlığını temizle
              const base64Data = dataUrl.replace(/^data:image\/(png|jpg);base64,/, "");
              
              // İsimlendirme formatı: Firma-Müşteri Tonaj-Kapasite Model-Model
              const rawName = `Firma-${vinc.customer_name || 'Yok'} Tonaj-${vinc.capacity || 'Yok'} Model-${vinc.model_name || 'Yok'}`;
              const safeFileName = rawName.replace(/[/\\?%*:|"<>]/g, '-') + '.png';
              
              zip.file(safeFileName, base64Data, { base64: true });
            }
            resolve();
          }, 50); // Tarayıcının render edebilmesi için çok kısa bir süre tanıyoruz
        });
      });

      await Promise.all(qrPromises);

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `Buvisan-QR-Kodlar-${new Date().toLocaleDateString('tr-TR')}.zip`);

    } catch (error) {
      console.error("Zip oluşturma hatası:", error);
      alert("QR Kodlar indirilirken bir hata oluştu.");
    } finally {
      setQrIndiriliyor(false);
    }
  };

  if (yukleniyor) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-blue-600 gap-4">
      <Loader2 className="animate-spin w-10 h-10" />
      <span className="font-semibold tracking-widest uppercase text-sm">Filo Yükleniyor...</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 relative font-sans text-slate-800">
      
      {/* 
        GİZLİ QR KOD RENDER ALANI: 
        Kullanıcı görmez ama tarayıcı arkaplanda bu yüksek çözünürlüklü canvasları oluşturur ki Zip'e ekleyebilelim.
      */}
      <div style={{ display: 'none' }}>
        {filtrelenmisVincler.map(vinc => (
          <QRCodeCanvas 
            key={`qr-${vinc.id}`}
            id={`qr-canvas-${vinc.id}`}
            value={`https://servis.buvisan.com/vinc/${vinc.id}`} 
            size={1024} // Yüksek Kalite
            level={"H"} 
            includeMargin={true} 
          />
        ))}
      </div>

      <div className="max-w-[1400px] mx-auto">
        
        {/* BAŞLIK VE AKSİYONLAR */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
          <div className="flex items-center gap-4">
             <button onClick={() => router.push('/admin')} className="bg-white p-3.5 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all">
                <ArrowLeft className="w-5 h-5" />
             </button>
             <div>
               <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                 <Package className="w-6 h-6 text-blue-600" /> Vinç Filosu
               </h1>
               <p className="text-slate-500 text-sm mt-1 font-medium">Sistemde toplam <span className="font-bold text-blue-600">{vincler.length}</span> aktif vinç bulunuyor.</p>
             </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
             <div className="relative w-full sm:w-80">
               <Search className="absolute left-4 top-3.5 text-slate-400 w-5 h-5" />
               <input 
                 type="text" 
                 placeholder="Seri No, Firma veya Model ara..." 
                 value={arama}
                 onChange={(e) => setArama(e.target.value)}
                 className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-sm transition-all font-medium text-sm"
               />
             </div>
             
             {/* TOPLU QR İNDİRME BUTONU */}
             <button 
                onClick={topluQrIndir} 
                disabled={qrIndiriliyor || filtrelenmisVincler.length === 0}
                className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-sm shadow-lg transition-all duration-200 ${qrIndiriliyor ? 'bg-slate-400 text-white cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white hover:shadow-blue-500/25 active:scale-95'}`}
             >
                {qrIndiriliyor ? <Loader2 className="w-5 h-5 animate-spin"/> : <QrCode className="w-5 h-5"/>}
                {qrIndiriliyor ? 'Zip Hazırlanıyor...' : 'Toplu QR İndir (Zip)'}
             </button>
          </div>
        </div>

        {/* TABLO KARTI */}
        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden pb-10">
          <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-slate-500 text-[11px] uppercase font-extrabold tracking-wider border-b border-slate-100">
                  <th className="p-6 rounded-tl-[2rem]">Cihaz Detayları (Seri / Model)</th>
                  <th className="p-6">Müşteri Bilgisi</th>
                  <th className="p-6">Lokasyon</th>
                  <th className="p-6 text-right rounded-tr-[2rem]">Aksiyonlar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrelenmisVincler.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-slate-400 font-medium">Aramanıza uygun vinç bulunamadı.</td>
                  </tr>
                ) : (
                  filtrelenmisVincler.map((vinc) => (
                    <tr key={vinc.id} className="hover:bg-blue-50/30 transition-colors group">
                      <td className="p-4 px-6">
                        <div className="flex items-center gap-4">
                          <div className="bg-slate-50 group-hover:bg-blue-100 p-3 rounded-2xl text-slate-400 group-hover:text-blue-600 transition-colors border border-slate-100 group-hover:border-blue-200">
                             <Package className="w-5 h-5" />
                          </div>
                          <div>
                             <div className="font-extrabold text-slate-800 font-mono tracking-tight">{vinc.serial_number || 'SERİ NO YOK'}</div>
                             <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-0.5">{vinc.model_name || '-'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 px-6">
                         <div className="flex items-center gap-2.5">
                           <div className="bg-slate-100 p-1.5 rounded-lg"><User className="w-4 h-4 text-slate-500" /></div>
                           <span className="font-bold text-slate-700 text-sm">{vinc.customer_name || 'Bilinmiyor'}</span>
                         </div>
                      </td>
                      <td className="p-4 px-6">
                         <div className="flex items-center gap-2 text-slate-500 text-sm max-w-[250px]">
                           <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                           <span className="truncate font-medium">{vinc.location_address || '-'}</span>
                         </div>
                      </td>
                      <td className="p-4 px-6 text-right">
                        <div className="flex justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                           
                           {/* DÜZENLEME BUTONU */}
                           <button 
                             onClick={() => router.push(`/admin/vinc-duzenle/${vinc.id}`)} 
                             className="inline-flex items-center justify-center bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 hover:border-blue-200 p-2.5 rounded-xl transition-all shadow-sm"
                             title="Vinci Düzenle"
                           >
                             <Pencil className="w-4 h-4" />
                           </button>

                           {/* İŞLE BUTONU */}
                           <button 
                             onClick={() => modalAc(vinc.id)} 
                             className="inline-flex items-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-100/50 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm"
                             title="Servis Geçmişi Ekle"
                           >
                             <History className="w-4 h-4" /> İŞLE
                           </button>

                           {/* PROFİL GÖRÜNTÜLE */}
                           <Link 
                             href={`/vinc/${vinc.id}`} 
                             target="_blank" 
                             className="inline-flex items-center justify-center bg-slate-800 hover:bg-black text-white p-2.5 rounded-xl transition-all shadow-md shadow-slate-300"
                             title="Dijital Kimliği Görüntüle"
                           >
                            <ExternalLink className="w-4 h-4" />
                           </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
             </table>
          </div>
        </div>
      </div>

      {/* --- PROFESYONEL MODAL (POPUP) --- */}
      <AnimatePresence>
        {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm">
                
                {/* Modal Arkaplan Tıklama (Kapatma) */}
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
                  className="absolute inset-0" onClick={() => setIsModalOpen(false)}
                />

                <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden relative z-10 border border-slate-100"
                >
                    {/* Modal Başlık */}
                    <div className="bg-slate-900 p-6 flex justify-between items-center text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><History className="w-32 h-32 -rotate-12 translate-x-8 -translate-y-8" /></div>
                        <div className="relative z-10">
                          <h3 className="font-extrabold text-xl flex items-center gap-3 tracking-tight">
                            <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm"><History className="w-5 h-5 text-amber-400"/></div>
                            Servis Kaydı Ekle
                          </h3>
                        </div>
                        <button onClick={() => setIsModalOpen(false)} className="relative z-10 bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors backdrop-blur-sm"><X className="w-5 h-5"/></button>
                    </div>

                    {/* Modal İçerik */}
                    <div className="p-6 sm:p-8 space-y-5">
                        <div className="grid grid-cols-2 gap-5">
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 ml-1">İşlem Tarihi</label>
                                <div className="relative group">
                                    <Calendar className="absolute left-3.5 top-3 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors"/>
                                    <input type="date" value={modalForm.created_at} onChange={(e)=>setModalForm({...modalForm, created_at: e.target.value})} className="w-full pl-11 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-bold text-slate-700 transition-all cursor-pointer" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 ml-1">İşlem Tipi</label>
                                <div className="relative">
                                  <select value={modalForm.event_type} onChange={(e)=>setModalForm({...modalForm, event_type: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-bold text-slate-700 transition-all cursor-pointer appearance-none">
                                      <option value="bakim">Periyodik Bakım</option>
                                      <option value="ariza">Arıza Müdahale</option>
                                      <option value="montaj">Montaj / Kurulum</option>
                                      <option value="revizyon">Revizyon</option>
                                  </select>
                                  {/* Select Ok İkonu */}
                                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                                      <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                                  </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 ml-1">İşlem Başlığı</label>
                            <input type="text" placeholder="Örn: Yıllık Periyodik Bakım Yapıldı" value={modalForm.title} onChange={(e)=>setModalForm({...modalForm, title: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold text-slate-700 transition-all placeholder:font-normal placeholder:text-slate-400" />
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 ml-1">Teknisyen / Usta</label>
                            <div className="relative group">
                                <User className="absolute left-3.5 top-3.5 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors"/>
                                <input type="text" placeholder="Örn: Ahmet Usta" value={modalForm.technician_name} onChange={(e)=>setModalForm({...modalForm, technician_name: e.target.value})} className="w-full pl-11 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold text-slate-700 transition-all placeholder:font-normal placeholder:text-slate-400" />
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 ml-1">Yapılan İşlemler (Detay)</label>
                            <textarea rows={4} placeholder="Değişen parçalar, yapılan testler, notlar..." value={modalForm.description} onChange={(e)=>setModalForm({...modalForm, description: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium text-sm text-slate-700 transition-all resize-none placeholder:text-slate-400"></textarea>
                        </div>

                        <button onClick={gecmisKaydet} disabled={kaydediliyor} className="w-full mt-2 bg-slate-900 hover:bg-black text-white font-bold py-4 rounded-xl transition-all shadow-xl shadow-slate-300 flex items-center justify-center gap-2 active:scale-95">
                             {kaydediliyor ? <Loader2 className="animate-spin w-5 h-5"/> : <><CheckCircle2 className="w-5 h-5"/> GEÇMİŞİ KAYDET VE İŞLE</>}
                        </button>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>
    </div>
  );
}