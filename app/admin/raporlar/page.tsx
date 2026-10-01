"use client";

// ----------------------------------------------------------------------------
// BUVISAN ADMIN PANELİ - SAHA RAPORLARI V2.0 (PREMIUM UI)
// (Gelişmiş Arama Filtresi ve Lüks Arayüz Tasarımı)
// --------------------------------------------------------

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Loader2, FileText, Calendar, User, MapPin, 
  Printer, CheckCircle2, Wrench, Search, X, ClipboardList, Package
} from 'lucide-react';

export default function RaporlarListesi() {
  const router = useRouter();
  const [raporlar, setRaporlar] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  
  // YENİ: Arama State'i
  const [aramaMetni, setAramaMetni] = useState("");

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

  // YENİ: Dinamik Arama Filtresi
  const filtrelenmisRaporlar = raporlar.filter(rapor => {
    const aramaKriteri = aramaMetni.toLowerCase();
    const firmaAd = (rapor.firma_adi || "").toLowerCase();
    const personel = (rapor.personel_adi || "").toLowerCase();
    const ariza = (rapor.arizanin_cinsi || "").toLowerCase();
    
    return firmaAd.includes(aramaKriteri) || personel.includes(aramaKriteri) || ariza.includes(aramaKriteri);
  });

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

  if (yukleniyor) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-4"></div>
      <div className="font-bold text-lg animate-pulse tracking-widest uppercase">Raporlar Yükleniyor...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20 selection:bg-emerald-200 relative overflow-x-hidden">
      
      {/* ÜST HEADER DEKORASYONU */}
      <div className="absolute top-0 left-0 w-full h-[300px] bg-slate-900 rounded-b-[3rem] shadow-xl z-0"></div>

      <div className="max-w-[1400px] mx-auto px-6 relative z-10 pt-10">
        
        {/* ÜST BAŞLIK VE AKSİYONLAR */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
          <div className="flex items-center gap-4 text-white">
             <button onClick={() => router.push('/admin')} className="bg-white/10 p-3.5 rounded-2xl border border-white/20 hover:bg-white/20 transition-all backdrop-blur-sm">
                <ArrowLeft className="w-5 h-5" />
             </button>
             <div>
               <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                 <div className="bg-emerald-500 p-2 rounded-xl"><ClipboardList className="w-6 h-6 text-white" /></div> 
                 Saha Servis Raporları
               </h1>
               <p className="text-slate-400 text-xs mt-1.5 font-bold uppercase tracking-widest">Sahadan gelen matbu formlar ({raporlar.length} Adet)</p>
             </div>
          </div>

          {/* YENİ: ARAMA MOTORU */}
          <div className="w-full lg:w-96 relative">
             <Search className="absolute left-4 top-4 text-slate-400 w-5 h-5" />
             <input 
               type="text" 
               placeholder="Firma, personel veya arıza ara..." 
               value={aramaMetni}
               onChange={(e) => setAramaMetni(e.target.value)}
               className="w-full pl-12 pr-4 py-4 bg-white/10 border border-white/20 rounded-2xl text-sm font-bold text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/50 focus:bg-white/20 transition-all backdrop-blur-md shadow-lg"
             />
          </div>
        </div>

        {/* RAPOR KARTLARI LİSTESİ */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtrelenmisRaporlar.length === 0 ? (
                <div className="col-span-full bg-white p-16 rounded-[2rem] text-center shadow-xl border border-slate-100 flex flex-col items-center">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4"><Package className="w-10 h-10 text-slate-300"/></div>
                    <h3 className="text-xl font-black text-slate-800">Rapor Bulunamadı</h3>
                    <p className="text-slate-500 text-sm mt-2">Arama kriterinize uygun veya sisteme girilmiş bir rapor yok.</p>
                </div>
            ) : (
                filtrelenmisRaporlar.map((rapor) => (
                    <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} key={rapor.id} className="bg-white p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 hover:shadow-xl hover:border-emerald-200 transition-all relative overflow-hidden flex flex-col justify-between group">
                        
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -translate-y-10 translate-x-10 group-hover:bg-emerald-500/10 transition-colors"></div>

                        <div>
                            <div className="flex justify-between items-start mb-5 relative z-10">
                                <span className={`border px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm ${rapor.islem_turu === 'Per.Bakım' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : rapor.islem_turu === 'Garanti' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                    <CheckCircle2 size={12}/> {rapor.islem_turu || 'SERVİS'}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 font-mono bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 flex items-center gap-1">
                                    <Calendar size={12}/> {new Date(rapor.created_at).toLocaleDateString('tr-TR')}
                                </span>
                            </div>
                            
                            <h3 className="text-xl font-black text-slate-800 mb-4 leading-tight line-clamp-2 relative z-10" title={rapor.firma_adi}>{rapor.firma_adi}</h3>
                            
                            <div className="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100 relative z-10">
                                <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700">
                                    <div className="bg-white p-1 rounded shadow-sm border border-slate-100"><User size={12} className="text-blue-500"/></div>
                                    {rapor.personel_adi}
                                </div>
                                <div className="flex items-start gap-2.5 text-xs font-medium text-slate-500">
                                    <div className="bg-white p-1 rounded shadow-sm border border-slate-100 shrink-0"><MapPin size={12} className="text-rose-500"/></div>
                                    <span className="line-clamp-1 mt-0.5">{rapor.firma_adresi}</span>
                                </div>
                                <div className="flex items-start gap-2.5 text-xs font-medium text-slate-600">
                                    <div className="bg-white p-1 rounded shadow-sm border border-slate-100 shrink-0"><Wrench size={12} className="text-amber-500"/></div>
                                    <span className="line-clamp-2 mt-0.5">{rapor.arizanin_cinsi || 'Sorun belirtilmemiş.'}</span>
                                </div>
                            </div>
                        </div>

                        <button onClick={() => setSeciliRapor(rapor)} className="w-full mt-6 bg-slate-900 hover:bg-black text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 text-xs shadow-lg active:scale-95 relative z-10">
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
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-slate-900/90 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
                <motion.div initial={{scale:0.95, y:20}} animate={{scale:1, y:0}} exit={{scale:0.95, y:20}} className="bg-slate-200 w-full max-w-5xl h-[95vh] rounded-[2rem] flex flex-col shadow-2xl overflow-hidden relative border border-slate-700">
                    
                    <div className="bg-slate-900 text-white p-5 flex justify-between items-center shrink-0 z-50 shadow-md">
                        <h3 className="font-black flex items-center gap-3 text-lg">
                           <div className="bg-white/10 p-2 rounded-xl"><FileText size={20} className="text-emerald-400"/></div>
                           Servis Raporu Önizleme
                        </h3>
                        <button onClick={() => setSeciliRapor(null)} className="hover:bg-rose-500 hover:text-white bg-white/10 p-2.5 rounded-full transition-colors"><X size={20}/></button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center bg-slate-800 custom-scrollbar shadow-inner">
                        
                        {/* A4 KAĞIDI TASARIMI (MATBU FORMUN BİREBİR AYNISI) */}
                        <div ref={printRef} className="bg-white w-[210mm] min-h-[297mm] p-[15mm] shadow-2xl relative text-black shrink-0 font-sans mx-auto box-border overflow-hidden">
                            
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

                    <div className="bg-slate-900 border-t border-slate-700 p-4 flex justify-center gap-4 shrink-0 z-50 shadow-[0_-5px_25px_rgba(0,0,0,0.5)]">
                        <button onClick={raporYazdir} className="bg-emerald-500 text-white px-8 py-4 rounded-xl font-black shadow-lg hover:bg-emerald-600 flex items-center gap-2 transform active:scale-95 transition">
                            <Printer size={20}/> RAPORU YAZDIR VEYA PDF KAYDET
                        </button>
                        <button onClick={() => setSeciliRapor(null)} className="bg-white/10 text-white px-8 py-4 rounded-xl font-bold hover:bg-white/20 transition-colors">
                            Kapat
                        </button>
                    </div>

                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}