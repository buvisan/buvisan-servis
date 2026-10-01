"use client";
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Loader2, FileText, Calendar, User, MapPin, Printer, CheckCircle2, Wrench, PackageSearch, X } from 'lucide-react';

export default function RaporlarListesi() {
  const router = useRouter();
  const [raporlar, setRaporlar] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  // PDF / Önizleme Modalı
  const [seciliRapor, setSeciliRapor] = useState<any | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => { verileriGetir(); }, []);

  async function verileriGetir() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const { data } = await supabase.from('service_reports').select('*').order('created_at', { ascending: false });
      if (data) setRaporlar(data);
      setYukleniyor(false);
  }

  const raporYazdir = () => {
      const printContent = printRef.current;
      if (!printContent) return;
      
      const win = window.open('', '', 'width=900,height=650');
      win?.document.write(`
        <html>
          <head>
            <title>Servis Raporu - ${seciliRapor.firma_adi}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                @media print {
                    body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
                    @page { size: A4 portrait; margin: 0; }
                }
            </style>
          </head>
          <body class="bg-white m-0 p-0">${printContent.innerHTML}</body>
        </html>
      `);
      win?.document.close();
      win?.focus();
      setTimeout(() => { win?.print(); win?.close(); }, 500);
  };

  if (yukleniyor) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-blue-600"><Loader2 className="animate-spin w-10 h-10" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 relative font-sans">
      
      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
          <div className="flex items-center gap-4">
             <button onClick={() => router.push('/admin')} className="bg-white p-3.5 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all">
                <ArrowLeft className="w-5 h-5" />
             </button>
             <div>
               <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                 <FileText className="w-6 h-6 text-blue-600" /> Saha Servis Raporları
               </h1>
               <p className="text-slate-500 text-sm mt-1 font-medium">Personeller tarafından doldurulan tüm dijital servis ve bakım formları.</p>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
            {raporlar.length === 0 ? (
                <div className="col-span-full bg-white p-12 rounded-[2rem] text-center border border-dashed border-slate-300 shadow-sm">
                    <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4"/>
                    <h3 className="text-lg font-bold text-slate-700">Henüz Rapor Yok</h3>
                    <p className="text-slate-400 text-sm mt-1">Saha personelleri formu doldurduğunda burada görünecektir.</p>
                </div>
            ) : (
                raporlar.map((rapor) => (
                    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} key={rapor.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden group flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-start mb-4">
                                <span className="bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                                    <CheckCircle2 size={12}/> {rapor.islem_turu || 'SERVİS'}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded-md border border-slate-100 flex items-center gap-1">
                                    <Calendar size={10}/> {new Date(rapor.created_at).toLocaleDateString('tr-TR')}
                                </span>
                            </div>
                            
                            <h3 className="text-lg font-extrabold text-slate-800 mb-1 leading-tight line-clamp-2" title={rapor.firma_adi}>{rapor.firma_adi}</h3>
                            
                            <div className="space-y-2 mt-4">
                                <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                                    <User size={14} className="text-slate-400 shrink-0"/> {rapor.personel_adi}
                                </div>
                                <div className="flex items-start gap-2 text-xs font-medium text-slate-500">
                                    <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5"/> <span className="line-clamp-1">{rapor.firma_adresi}</span>
                                </div>
                                <div className="flex items-start gap-2 text-xs font-medium text-slate-500">
                                    <Wrench size={14} className="text-amber-500 shrink-0 mt-0.5"/> <span className="line-clamp-2">{rapor.arizanin_cinsi || 'Sorun belirtilmemiş.'}</span>
                                </div>
                            </div>
                        </div>

                        <button onClick={() => setSeciliRapor(rapor)} className="w-full mt-6 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-700 font-bold py-3 rounded-xl border border-slate-200 hover:border-blue-200 transition-colors flex items-center justify-center gap-2 text-sm shadow-sm">
                            <FileText size={16}/> RAPORU AÇ VE YAZDIR
                        </button>
                    </motion.div>
                ))
            )}
        </div>
      </div>

      {/* --- A4 PDF ÖNİZLEME MODALI --- */}
      <AnimatePresence>
        {seciliRapor && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-slate-900/90 z-[9999] flex items-center justify-center p-4">
                <div className="bg-slate-200 w-full max-w-5xl h-[95vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden relative">
                    
                    <div className="bg-slate-800 text-white p-4 flex justify-between items-center shrink-0 z-50 shadow-md">
                        <h3 className="font-bold flex items-center gap-2"><FileText size={18}/> Servis Raporu Önizleme</h3>
                        <button onClick={() => setSeciliRapor(null)} className="hover:bg-slate-700 p-2 rounded-full"><X size={20}/></button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center bg-slate-600/50 custom-scrollbar">
                        
                        {/* A4 KAĞIDI TASARIMI (MATBU FORMUN BİREBİR AYNISI) */}
                        <div ref={printRef} className="bg-white w-[210mm] min-h-[297mm] p-[15mm] shadow-xl relative text-black shrink-0 font-sans mx-auto box-border overflow-hidden">
                            
                            {/* Başlık ve Logo Alanı */}
                            <div className="flex justify-between items-start border-b-[3px] border-black pb-4 mb-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-32 h-12 bg-yellow-400 rounded-lg flex items-center justify-center font-black text-2xl tracking-tighter shadow-sm border border-slate-200">BUVİSAN</div>
                                </div>
                                <div className="text-right text-[10px] font-bold text-slate-800 uppercase leading-tight">
                                    <p>ZM METAL MAKİNA İMALAT SANAYİ VE TİCARET LİMİTED ŞİRKETİ</p>
                                    <p className="text-slate-500 font-medium lowercase">info@zmmetal.com.tr - www.buvisan.com</p>
                                    <p className="text-slate-500 font-medium">Demirci Mah. / Bursa - Tel: 0224 374 00 01</p>
                                </div>
                            </div>

                            {/* Üst Bilgiler Tablosu */}
                            <div className="w-full border-2 border-black grid grid-cols-2 mb-4">
                                <div className="border-r-2 border-black">
                                    <div className="border-b border-black p-2 flex">
                                        <span className="w-24 font-bold text-xs">FİRMA ADI:</span>
                                        <span className="font-bold text-sm uppercase">{seciliRapor.firma_adi}</span>
                                    </div>
                                    <div className="p-2 flex h-[50px]">
                                        <span className="w-24 font-bold text-xs">FİRMA ADRESİ:</span>
                                        <span className="text-xs uppercase line-clamp-2">{seciliRapor.firma_adresi}</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="border-b border-black p-2 bg-slate-100 flex justify-between">
                                        <span className="font-black text-sm uppercase">Servis Raporu</span>
                                        <span className="font-bold text-sm text-red-600">No: {seciliRapor.id.slice(0,6).toUpperCase()}</span>
                                    </div>
                                    <div className="border-b border-black p-2 text-xs font-bold bg-slate-50">
                                        İŞYERİNE VARIŞ TARİH/SAAT: <span className="ml-2 text-sm">{seciliRapor.isyerine_varis_tarih_saat || '-'}</span>
                                    </div>
                                    <div className="p-2 text-xs font-bold bg-slate-50">
                                        İŞYERİNDEN AYRILIŞ TARİH/SAAT: <span className="ml-2 text-sm">{seciliRapor.isyerinden_ayrilis_tarih_saat || '-'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Vinç Bilgileri Tablosu */}
                            <table className="w-full border-2 border-black border-collapse mb-4 text-center">
                                <thead>
                                    <tr className="bg-slate-100 text-xs font-bold">
                                        <th className="border border-black p-2 w-[15%]">VİNCİN</th>
                                        <th className="border border-black p-2 w-[30%]">MODELİ</th>
                                        <th className="border border-black p-2 w-[25%]">SERİ NO</th>
                                        <th className="border border-black p-2 w-[30%] text-left pl-4" colSpan={2}>
                                            <span className="mr-4">[ {seciliRapor.islem_turu === 'Servis' ? 'X' : ' '} ] SERVİS</span>
                                            <span>[ {seciliRapor.islem_turu === 'Garanti' ? 'X' : ' '} ] GARANTİ</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="text-sm font-bold uppercase">
                                        <td className="border border-black p-2 bg-slate-50">Vinç</td>
                                        <td className="border border-black p-2">{seciliRapor.vinc_modeli || '-'}</td>
                                        <td className="border border-black p-2 font-mono">{seciliRapor.vinc_seri_no || '-'}</td>
                                        <td className="border border-black p-2 text-left pl-4 text-xs" colSpan={2}>
                                            <span className="mr-4">[ {seciliRapor.islem_turu === 'Per.Bakım' ? 'X' : ' '} ] PER.BAKIM</span>
                                            <span>[ {seciliRapor.islem_turu === 'Diğer' ? 'X' : ' '} ] DİĞER</span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td colSpan={5} className="border border-black p-3 text-left">
                                            <span className="font-bold text-xs uppercase underline">ARIZANIN CİNSİ:</span> 
                                            <span className="ml-2 text-sm font-semibold">{seciliRapor.arizanin_cinsi || 'Belirtilmedi'}</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* Yapılan İşler Alanı */}
                            <div className="w-full border-2 border-black min-h-[150px] p-3 mb-4 flex flex-col">
                                <span className="font-bold text-xs uppercase underline mb-2 block">YAPILAN İŞLER:</span>
                                <div className="text-sm font-medium leading-relaxed whitespace-pre-line flex-1">
                                    {seciliRapor.yapilan_isler || 'İşlem detayı girilmedi.'}
                                </div>
                            </div>

                            {/* Parçalar Tablosu */}
                            <table className="w-full border-2 border-black border-collapse mb-8 text-center text-sm">
                                <thead>
                                    <tr className="bg-slate-100 font-bold text-xs">
                                        <th className="border border-black p-2 w-[15%]">PARÇA NO</th>
                                        <th className="border border-black p-2 w-[70%]">PARÇA ADI</th>
                                        <th className="border border-black p-2 w-[15%]">ADET</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {seciliRapor.degisen_parcalar && seciliRapor.degisen_parcalar.map((parca: any, i: number) => {
                                        if(!parca.parca_adi) return null;
                                        return (
                                        <tr key={i} className="font-medium">
                                            <td className="border border-black p-2">{parca.parca_no}</td>
                                            <td className="border border-black p-2 text-left px-4 uppercase">{parca.parca_adi}</td>
                                            <td className="border border-black p-2 font-bold">{parca.adet}</td>
                                        </tr>
                                    )})}
                                    {/* Boş Satırlar */}
                                    {[...Array(seciliRapor.degisen_parcalar?.some((p:any)=>p.parca_adi) ? 1 : 4)].map((_, i) => (
                                        <tr key={'empty'+i}>
                                            <td className="border border-black p-4"></td>
                                            <td className="border border-black p-4"></td>
                                            <td className="border border-black p-4"></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* İmzalar */}
                            <div className="w-full border-2 border-black grid grid-cols-3 absolute bottom-[15mm] left-[15mm] w-[calc(100%-30mm)]">
                                <div className="border-r border-black p-2 h-24 relative">
                                    <span className="text-[10px] font-bold text-slate-500 block absolute top-1 left-2">SERVİS YETKİLİSİ</span>
                                    <div className="absolute bottom-2 left-0 w-full text-center font-bold uppercase text-sm">
                                        {seciliRapor.personel_adi}
                                    </div>
                                </div>
                                <div className="border-r border-black p-2 h-24 relative">
                                    <span className="text-[10px] font-bold text-slate-500 block absolute top-1 left-2">MÜŞTERİ YETKİLİSİ</span>
                                </div>
                                <div className="p-2 h-24 relative bg-slate-50">
                                    <span className="text-[10px] font-bold text-slate-500 block absolute top-1 left-2">RAPOR TARİHİ</span>
                                    <div className="absolute bottom-2 left-0 w-full text-center font-bold text-sm">
                                        {new Date(seciliRapor.created_at).toLocaleDateString('tr-TR')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white border-t p-4 flex justify-center gap-4 shrink-0 z-50 shadow-[0_-5px_15px_rgba(0,0,0,0.1)]">
                        <button onClick={raporYazdir} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-700 flex items-center gap-2 transform active:scale-95 transition">
                            <Printer size={20}/> Yazdır / PDF Kaydet
                        </button>
                        <button onClick={() => setSeciliRapor(null)} className="bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-200">
                            Kapat
                        </button>
                    </div>

                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}