"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams } from 'next/navigation';
import jsPDF from 'jspdf';
import { motion, AnimatePresence } from 'framer-motion';
import ChatAlani from '@/components/ChatAlani';
import { 
  FileText, Download, AlertTriangle, CheckCircle2, Construction, 
  MapPin, ArrowUpFromLine, Weight, Camera, Loader2, History, 
  Wrench, Truck, CheckCircle, FolderOpen, ChevronRight, ShieldCheck, 
  X, Video, Image as ImageIcon, Search, HardHat, FileSignature, Info
} from 'lucide-react';

export default function VincDetaySayfasi() {
  const params = useParams();
  const { id } = params;

  // --- VERİ STATELERİ ---
  const [vinc, setVinc] = useState<any>(null);
  const [gecmis, setGecmis] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // --- BOTTOM SHEET (AÇILIR MENÜ) STATELERİ ---
  // 'none' | 'ariza' | 'kesif' | 'bakim' | 'personel'
  const [aktifMenu, setAktifMenu] = useState<'none' | 'ariza' | 'kesif' | 'bakim' | 'personel'>('none');
  
  // --- MÜŞTERİ FORM STATELERİ ---
  const [arizaNotu, setArizaNotu] = useState("");
  const [secilenBolge, setSecilenBolge] = useState("");
  const [bildirimDurumu, setBildirimDurumu] = useState("");
  const [secilenMedyalar, setSecilenMedyalar] = useState<File[]>([]);

  // --- PERSONEL FORM STATELERİ ---
  const [perAd, setPerAd] = useState("");
  const [perIslemTipi, setPerIslemTipi] = useState("bakim");
  const [perBaslik, setPerBaslik] = useState("");
  const [perDetay, setPerDetay] = useState("");
  const [perDurum, setPerDurum] = useState("");

  const bolgeler = ['Genel', 'Köprü', 'Kedi / Araba', 'Halat / Zincir', 'Kanca', 'Elektrik Panosu', 'Kumanda', 'Yürüyüş Takımı'];

  useEffect(() => {
    async function verileriGetir() {
      if (!id) return;
      
      const { data: vincData, error: vincError } = await supabase
        .from('cranes')
        .select('*, service_tickets(*)')
        .eq('id', id)
        .single();
      
      if (vincError) {
        console.error("Vinç hatası:", vincError);
        setLoading(false);
        return;
      }
      setVinc(vincData);

      const { data: gecmisData } = await supabase
        .from('crane_history')
        .select('*')
        .eq('crane_id', id)
        .order('created_at', { ascending: false });
      
      setGecmis(gecmisData || []);
      setLoading(false);
    }
    verileriGetir();
  }, [id]);

  const dosyaIsminiTemizle = (isim: string) => isim.replace(/[^a-zA-Z0-9.-]/g, '').toLowerCase();

  const medyaSec = (e: any) => {
    if (e.target.files) {
      const yeniDosyalar = Array.from(e.target.files) as File[];
      if (secilenMedyalar.length + yeniDosyalar.length > 5) {
        alert("En fazla 5 adet medya yükleyebilirsiniz.");
        return;
      }
      setSecilenMedyalar((prev) => [...prev, ...yeniDosyalar]);
    }
  };

  const medyaSil = (indexToRemove: number) => {
    setSecilenMedyalar((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const telegramBildirimiGonder = async (not: string, medyaSayisi: number, tip: string, bolge: string) => {
    const botToken = "8567697885:AAGCSyckJKLG11HwTQaMGGUwMyXIm0UqAK0"; 
    const grupId = "-5079408473"; 

    let onayMetni = "";
    let baslikEmoji = "🚨";
    let baslikMetni = "YENİ TALEP!";

    if (tip === 'ariza') {
        onayMetni = "✅ *Müşteri 8.500 TL + KDV servis bedelini ONAYLADI.*";
        baslikEmoji = medyaSayisi > 0 ? "📸" : "🚨";
        baslikMetni = "YENİ ARIZA BİLDİRİMİ!";
    } else if (tip === 'kesif') {
        onayMetni = "✅ *Müşteri 5.000 TL + KDV keşif bedelini ONAYLADI.*";
        baslikEmoji = "🔍";
        baslikMetni = "YENİ KEŞİF TALEBİ!";
    } else if (tip === 'bakim') {
        onayMetni = "✅ *Müşteri Periyodik Bakım Sözleşmesi talep ediyor.*";
        baslikEmoji = "📝";
        baslikMetni = "BAKIM SÖZLEŞMESİ TALEBİ!";
    }

    const mesaj = `${baslikEmoji} *${baslikMetni}*\n\n` +
                  `🏗️ *Vinç:* ${vinc.model_name}\n` +
                  `🏢 *Müşteri:* ${vinc.customer_name}\n` +
                  `📍 *Konum:* ${vinc.location_address}\n` +
                  `${bolge ? `🎯 *Arıza Bölgesi:* ${bolge}\n` : ''}` +
                  `------------------\n` +
                  `💬 *Müşteri Notu:* ${not || 'Not girilmedi.'}\n\n` +
                  `${onayMetni}`;
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: grupId, text: mesaj, parse_mode: 'Markdown' })
      });
    } catch (e) { console.error("Telegram hatası:", e); }
  };

  // --- MÜŞTERİ TALEP GÖNDERME (ARIZA, KEŞİF, BAKIM) ---
  const talepGonder = async () => {
    if (aktifMenu === 'ariza' && !secilenBolge) return alert("Lütfen arızalı bölgeyi seçin.");
    if (aktifMenu !== 'bakim' && !arizaNotu) return alert("Lütfen talebinizi açıklayan bir not yazın.");
    
    setBildirimDurumu("loading");
    let medyaLinkleri: string[] = [];

    try {
        if (secilenMedyalar.length > 0) {
            const yuklemeIslemleri = secilenMedyalar.map(async (dosya) => {
                const uzantisi = dosya.name.split('.').pop() || 'jpg';
                const dosyaAdi = `${Date.now()}-${Math.floor(Math.random()*1000)}-talep.${dosyaIsminiTemizle(uzantisi)}`;
                const { error: upErr } = await supabase.storage.from('ariza-medya').upload(dosyaAdi, dosya);
                if (upErr) throw upErr;
                const { data: urlData } = supabase.storage.from('ariza-medya').getPublicUrl(dosyaAdi);
                return urlData.publicUrl;
            });
            medyaLinkleri = await Promise.all(yuklemeIslemleri);
        }

        let issueType = 'Genel Arıza';
        let desc = arizaNotu;

        if (aktifMenu === 'ariza') {
            issueType = `Arıza Bildirimi (${secilenBolge})`;
        } else if (aktifMenu === 'kesif') {
            issueType = `Keşif Talebi`;
        } else if (aktifMenu === 'bakim') {
            issueType = `Bakım Sözleşmesi Talebi`;
            desc = "Sistem üzerinden periyodik bakım sözleşmesi teklifi talep edildi.";
        }

        const { error } = await supabase.from('service_tickets').insert([{ 
            crane_id: id, 
            issue_type: issueType, 
            description: desc, 
            status: 'beklemede', 
            media_urls: medyaLinkleri
        }]);

        if (error) throw error;

        await telegramBildirimiGonder(desc, medyaLinkleri.length, aktifMenu, secilenBolge);

        setBildirimDurumu("success");
        setTimeout(() => {
            setBildirimDurumu("");
            setAktifMenu('none');
            setArizaNotu("");
            setSecilenBolge("");
            setSecilenMedyalar([]);
        }, 3000);

    } catch (error: any) {
        alert("Hata: " + error.message);
        setBildirimDurumu("");
    }
  };

  // --- YENİ: PERSONEL RAPOR KAYDETME ---
  const personelRaporKaydet = async () => {
    if (!perAd || !perBaslik || !perDetay) return alert("Lütfen adınızı, başlığı ve detayları doldurun.");
    setPerDurum("loading");

    try {
        const { error } = await supabase.from('crane_history').insert([{
            crane_id: id,
            event_type: perIslemTipi,
            title: perBaslik,
            description: perDetay,
            technician_name: perAd,
            created_at: new Date().toISOString()
        }]);

        if (error) throw error;

        setPerDurum("success");
        
        // Geçmiş listesini güncelle
        const { data: gecmisData } = await supabase.from('crane_history').select('*').eq('crane_id', id).order('created_at', { ascending: false });
        setGecmis(gecmisData || []);

        setTimeout(() => {
            setPerDurum("");
            setAktifMenu('none');
            setPerBaslik("");
            setPerDetay("");
        }, 3000);

    } catch (error: any) {
        alert("Hata: " + error.message);
        setPerDurum("");
    }
  };

  const pdfIndir = () => {
    if (!vinc) return;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("BUVISAN DIJITAL SERVIS", 20, 20);
    doc.setFontSize(12);
    doc.text(`Model: ${vinc.model_name}`, 20, 40);
    doc.text(`Seri No: ${vinc.serial_number}`, 20, 50);
    doc.text(`Müşteri: ${vinc.customer_name}`, 20, 60);
    doc.save(`Kimlik-${vinc.serial_number}.pdf`);
  };

  const getIcon = (type: string) => {
    switch(type) {
      case 'uretim': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'montaj': return <Truck className="w-5 h-5 text-blue-500" />;
      case 'bakim': return <Wrench className="w-5 h-5 text-amber-500" />;
      case 'ariza': return <AlertTriangle className="w-5 h-5 text-rose-500" />;
      default: return <History className="w-5 h-5 text-slate-400" />;
    }
  };

  if (loading) return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-900">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin w-10 h-10 text-blue-500"/>
        <p className="text-blue-200 font-medium animate-pulse">Sistem Yükleniyor...</p>
      </div>
    </div>
  );
  
  if (!vinc) return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-900 p-6">
      <div className="bg-white p-8 rounded-3xl shadow-2xl text-center max-w-sm w-full">
        <AlertTriangle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">Kayıt Bulunamadı</h2>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-[#0A1128] text-slate-800 font-sans relative overflow-x-hidden pb-32">
      
      <div className="absolute top-0 left-0 w-full h-96 bg-blue-600/20 blur-[100px] rounded-full pointer-events-none -translate-y-1/2"></div>
      
      <div className="max-w-md mx-auto px-4 relative z-10 pt-8">
        
        {/* ÜST BAŞLIK */}
        <div className="text-center pb-6">
          <h1 className="text-3xl font-black text-white tracking-tight">BUVİSAN</h1>
          <p className="text-blue-300 text-[10px] font-bold tracking-[0.3em] uppercase mt-1 opacity-80">Dijital Kimlik & Servis</p>
        </div>

        {/* ANA VİNÇ KARTI */}
        <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden mb-6">
          <div className="bg-gradient-to-br from-blue-700 to-blue-900 p-6 text-white relative">
            <div className="absolute right-0 top-0 opacity-10"><Construction className="w-32 h-32 -translate-y-4 translate-x-4" /></div>
            <div className="relative z-10 flex items-start gap-4">
              <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl">
                <Construction className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold leading-tight">{vinc.model_name}</h2>
                <span className="inline-block mt-2 bg-blue-950/50 px-3 py-1 rounded-full text-blue-100 text-xs font-mono font-medium border border-white/10">
                  SN: {vinc.serial_number}
                </span>
              </div>
            </div>
          </div>
          
          <div className="p-5">
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-400 mb-1 text-[10px] uppercase font-bold tracking-wider"><Weight className="w-3.5 h-3.5" /> Kapasite</div>
                <div className="text-slate-800 font-bold text-sm">{vinc.capacity}</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-400 mb-1 text-[10px] uppercase font-bold tracking-wider"><ArrowUpFromLine className="w-3.5 h-3.5" /> Yükseklik</div>
                <div className="text-slate-800 font-bold text-sm">{vinc.lifting_height}</div>
              </div>
              <div className="col-span-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-start gap-3">
                <MapPin className="w-5 h-5 text-blue-500 shrink-0" />
                <div>
                  <div className="text-slate-800 font-bold text-sm mb-0.5">{vinc.customer_name}</div>
                  <div className="text-slate-500 font-medium text-[11px] leading-snug">{vinc.location_address}</div>
                </div>
              </div>
            </div>

            {/* DOKÜMANLAR (AKORDİYON) */}
            <details className="group">
                <summary className="flex items-center justify-between font-bold text-sm text-slate-700 bg-slate-100 p-4 rounded-2xl cursor-pointer list-none">
                    <span className="flex items-center gap-2"><FolderOpen className="w-4 h-4 text-blue-600"/> Teknik Belgeler</span>
                    <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90"/>
                </summary>
                <div className="pt-3 space-y-2">
                    {vinc.pdf_url && <a href={vinc.pdf_url} target="_blank" className="flex items-center gap-3 bg-white border border-slate-200 p-3 rounded-xl text-sm font-bold text-slate-600"><FileText className="w-4 h-4 text-rose-500"/> İş Emri Formu</a>}
                    {vinc.pdf_url_2 && <a href={vinc.pdf_url_2} target="_blank" className="flex items-center gap-3 bg-white border border-slate-200 p-3 rounded-xl text-sm font-bold text-slate-600"><FileText className="w-4 h-4 text-blue-500"/> Devreye Alma</a>}
                    {vinc.pdf_url_3 && <a href={vinc.pdf_url_3} target="_blank" className="flex items-center gap-3 bg-white border border-slate-200 p-3 rounded-xl text-sm font-bold text-slate-600"><FileText className="w-4 h-4 text-blue-500"/> Elektrik Şeması</a>}
                    {vinc.pdf_url_4 && <a href={vinc.pdf_url_4} target="_blank" className="flex items-center gap-3 bg-white border border-slate-200 p-3 rounded-xl text-sm font-bold text-slate-600"><FileText className="w-4 h-4 text-blue-500"/> Genel Montaj</a>}
                </div>
            </details>
          </div>
        </div>

        {/* MÜŞTERİ AKSİYON PANELLERİ (ŞEFFAF FİYATLANDIRMA) */}
        <div className="space-y-4 mb-10">
            <h3 className="text-white/90 font-bold text-sm uppercase tracking-wider ml-2 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-rose-400"/> Talep Oluştur
            </h3>

            {/* BUTON 1: DİREKT ARIZA */}
            <button onClick={() => setAktifMenu('ariza')} className="w-full bg-gradient-to-r from-rose-500 to-red-600 p-5 rounded-[2rem] text-left shadow-lg relative overflow-hidden group active:scale-[0.98] transition-all">
                <div className="absolute right-[-20px] top-[-20px] opacity-20"><AlertTriangle className="w-32 h-32"/></div>
                <div className="relative z-10">
                    <h4 className="text-white font-extrabold text-lg flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> Arıza & Servis Çağır</h4>
                    <p className="text-rose-100 text-xs mt-1 font-medium leading-relaxed">Vinciniz çalışmıyor veya acil müdahale gerekiyorsa. <br/><strong className="text-white bg-black/20 px-2 py-0.5 rounded mt-1 inline-block">Servis Bedeli: 8.500 TL + KDV</strong></p>
                </div>
            </button>

            {/* BUTON 2: KEŞİF */}
            <button onClick={() => setAktifMenu('kesif')} className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 p-5 rounded-[2rem] text-left shadow-lg relative overflow-hidden group active:scale-[0.98] transition-all">
                <div className="absolute right-[-20px] top-[-20px] opacity-20"><Search className="w-32 h-32"/></div>
                <div className="relative z-10">
                    <h4 className="text-white font-extrabold text-lg flex items-center gap-2"><Search className="w-5 h-5"/> Sadece Arıza Keşfi</h4>
                    <p className="text-purple-100 text-xs mt-1 font-medium leading-relaxed">Arızanın ne olduğunu öğrenmek için keşif talep edin. <br/><strong className="text-white bg-black/20 px-2 py-0.5 rounded mt-1 inline-block">Keşif Bedeli: 5.000 TL + KDV</strong></p>
                </div>
            </button>

            {/* BUTON 3: BAKIM */}
            <button onClick={() => setAktifMenu('bakim')} className="w-full bg-white p-5 rounded-[2rem] text-left shadow-lg relative overflow-hidden group active:scale-[0.98] transition-all border border-slate-100">
                <div className="flex items-center justify-between relative z-10">
                    <div>
                        <h4 className="text-slate-800 font-extrabold text-base flex items-center gap-2"><FileSignature className="w-5 h-5 text-blue-600"/> Periyodik Bakım Sözleşmesi</h4>
                        <p className="text-slate-500 text-xs mt-1 font-medium">Yıllık bakım planı için teklif isteyin.</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300"/>
                </div>
            </button>
        </div>

        {/* --- TIMELINE (SERVİS GEÇMİŞİ) --- */}
        <div className="mb-10">
          <h3 className="text-white/90 font-bold text-sm uppercase tracking-wider ml-2 flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-blue-400"/> Servis Geçmişi
          </h3>
          <div className="bg-white/5 backdrop-blur-md rounded-[2rem] p-6 border border-white/10">
            {gecmis.length === 0 ? (
              <div className="text-center text-slate-400 text-xs">Geçmiş kayıt bulunmuyor.</div>
            ) : (
              <div className="relative border-l-2 border-white/10 ml-3 space-y-6 pb-2">
                {gecmis.map((olay, index) => (
                  <div key={olay.id} className="relative pl-6">
                    <div className="absolute -left-[13px] top-0 bg-[#0A1128] p-1 rounded-full border-2 border-white/10">
                      {getIcon(olay.event_type)}
                    </div>
                    <div className="bg-white rounded-2xl p-4 shadow-sm relative -top-1">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-slate-800 text-sm leading-tight pr-2">{olay.title}</h4>
                        <span className="text-[9px] text-slate-400 font-bold bg-slate-50 px-2 py-1 rounded-md shrink-0">
                          {new Date(olay.created_at).toLocaleDateString('tr-TR')}
                        </span>
                      </div>
                      <p className="text-slate-500 text-xs leading-relaxed mt-1.5">{olay.description}</p>
                      {olay.technician_name && (
                        <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] font-bold text-blue-600 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3" /> Personel: {olay.technician_name}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CANLI TICKET SOHBETİ */}
        {vinc && vinc.service_tickets?.some((t: any) => t.status !== 'tamamlandi') && (
          <div className="mt-8 mb-4">
            <h3 className="text-white font-bold text-xs mb-3 ml-2 flex items-center gap-2 opacity-90"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Devam Eden Talep / Destek</h3>
            <div className="bg-white rounded-[2rem] p-2 shadow-2xl overflow-hidden">
              <ChatAlani ticketId={vinc.service_tickets.find((t: any) => t.status !== 'tamamlandi').id} kimimBen="musteri" />
            </div>
          </div>
        )}
      </div>

      {/* PERSONEL GİRİŞ BUTONU (SABİT ALT) */}
      <div className="fixed bottom-6 w-full px-4 z-20 flex justify-center">
         <button onClick={() => setAktifMenu('personel')} className="bg-slate-900/80 backdrop-blur-xl border border-white/10 text-white px-6 py-3 rounded-full text-xs font-bold shadow-2xl flex items-center gap-2 hover:bg-slate-800 transition">
             <HardHat className="w-4 h-4 text-amber-400"/> Servis Personeli Girişi
         </button>
      </div>

      {/* ==========================================
          MODALLAR (BOTTOM SHEETS)
          ========================================== */}
      <AnimatePresence>
        {aktifMenu !== 'none' && (
          <>
            {/* Arkaplan Blur */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAktifMenu('none')} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100]"/>
            
            {/* Menü */}
            <motion.div 
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-x-0 bottom-0 z-[101] bg-white rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.2)] overflow-hidden max-h-[90dvh] flex flex-col"
            >
              {/* Tutamak */}
              <div className="w-full flex justify-center pt-4 pb-2 bg-white shrink-0" onClick={() => setAktifMenu('none')}>
                 <div className="w-12 h-1.5 bg-slate-200 rounded-full"></div>
              </div>

              <div className="overflow-y-auto px-6 pb-12 pt-2 custom-scrollbar">
                
                {/* 1. ARIZA BİLDİRİMİ */}
                {aktifMenu === 'ariza' && (
                  <div className="space-y-5">
                     <div>
                        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-2"><AlertTriangle className="w-6 h-6 text-rose-500"/> Arıza Kaydı</h2>
                        <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl flex gap-3 items-start">
                           <Info className="w-5 h-5 text-rose-500 shrink-0 mt-0.5"/>
                           <p className="text-xs text-rose-700 font-medium leading-relaxed">Bu işlem için <strong>8.500 TL + KDV</strong> servis bedeli yansıtılacaktır. Onaylıyorsanız formu doldurun.</p>
                        </div>
                     </div>

                     <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Arızalı Bölge Seçin <span className="text-rose-500">*</span></label>
                        <div className="flex flex-wrap gap-2">
                           {bolgeler.map(b => (
                             <button key={b} onClick={() => setSecilenBolge(b)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${secilenBolge === b ? 'bg-rose-500 text-white border-rose-500 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                               {b}
                             </button>
                           ))}
                        </div>
                     </div>

                     <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Açıklama <span className="text-rose-500">*</span></label>
                        <textarea rows={3} placeholder="Şikayetinizi detaylandırın..." value={arizaNotu} onChange={e=>setArizaNotu(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-rose-400 focus:bg-white transition-colors resize-none"></textarea>
                     </div>

                     {/* Foto/Video */}
                     <div>
                        <label className="flex items-center justify-center w-full gap-2 p-4 rounded-2xl border-2 border-dashed bg-slate-50 border-slate-200 text-slate-500 cursor-pointer font-bold text-xs">
                          <Camera className="w-4 h-4"/> Fotoğraf / Video Ekle ({secilenMedyalar.length}/5)
                          <input type="file" multiple accept="image/*,video/*" onChange={medyaSec} className="hidden" />
                        </label>
                        {secilenMedyalar.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                             {secilenMedyalar.map((m,i)=>(
                               <div key={i} className="bg-slate-100 px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-2 text-slate-600">
                                  {m.type.startsWith('video')?<Video className="w-3 h-3 text-blue-500"/>:<ImageIcon className="w-3 h-3 text-emerald-500"/>}
                                  <span className="max-w-[100px] truncate">{m.name}</span>
                                  <button onClick={()=>medyaSil(i)} className="text-rose-500"><X className="w-3 h-3"/></button>
                               </div>
                             ))}
                          </div>
                        )}
                     </div>

                     <button onClick={talepGonder} disabled={bildirimDurumu==="loading"} className="w-full bg-rose-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-rose-200 active:scale-95 transition-all">
                       {bildirimDurumu==="loading" ? <Loader2 className="animate-spin"/> : "ŞARTLARI KABUL ET VE ÇAĞIR"}
                     </button>
                  </div>
                )}

                {/* 2. KEŞİF BİLDİRİMİ */}
                {aktifMenu === 'kesif' && (
                  <div className="space-y-5">
                     <div>
                        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-2"><Search className="w-6 h-6 text-indigo-500"/> Arıza Keşfi</h2>
                        <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl flex gap-3 items-start">
                           <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5"/>
                           <p className="text-xs text-indigo-700 font-medium leading-relaxed">
                             Sadece arızanın tespitini istiyorsanız <strong>5.000 TL + KDV</strong> keşif bedeli alınır.<br/><br/>
                             <span className="opacity-80 text-[10px]">Eğer keşif sonrası işin yapılmasını onaylarsanız, bu bedel alınmaz ve sadece 8.500 TL + KDV arıza çözüm bedeli geçerli olur. (İkisi ayrı ayrı tahsil edilmez.)</span>
                           </p>
                        </div>
                     </div>

                     <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Gözlemleriniz <span className="text-indigo-500">*</span></label>
                        <textarea rows={3} placeholder="Sıkıntı nedir? Hangi durumda ortaya çıkıyor?" value={arizaNotu} onChange={e=>setArizaNotu(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-indigo-400 focus:bg-white transition-colors resize-none"></textarea>
                     </div>

                     <div>
                        <label className="flex items-center justify-center w-full gap-2 p-4 rounded-2xl border-2 border-dashed bg-slate-50 border-slate-200 text-slate-500 cursor-pointer font-bold text-xs">
                          <Camera className="w-4 h-4"/> Fotoğraf / Video Ekle ({secilenMedyalar.length}/5)
                          <input type="file" multiple accept="image/*,video/*" onChange={medyaSec} className="hidden" />
                        </label>
                     </div>

                     <button onClick={talepGonder} disabled={bildirimDurumu==="loading"} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 active:scale-95 transition-all">
                       {bildirimDurumu==="loading" ? <Loader2 className="animate-spin"/> : "ŞARTLARI KABUL ET VE KEŞİF İSTE"}
                     </button>
                  </div>
                )}

                {/* 3. BAKIM SÖZLEŞMESİ */}
                {aktifMenu === 'bakim' && (
                  <div className="space-y-6 text-center py-4">
                     <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto text-blue-600">
                        <FileSignature className="w-10 h-10"/>
                     </div>
                     <div>
                        <h2 className="text-2xl font-black text-slate-800 mb-2">Bakım Sözleşmesi</h2>
                        <p className="text-sm text-slate-500">Mevcut vinciniz için size özel yıllık periyodik bakım teklifimizi ileteceğiz. Müşteri temsilcimiz sizinle iletişime geçecektir.</p>
                     </div>
                     <button onClick={talepGonder} disabled={bildirimDurumu==="loading"} className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-blue-200 active:scale-95 transition-all">
                       {bildirimDurumu==="loading" ? <Loader2 className="animate-spin"/> : "TEKLİF TALEP ET"}
                     </button>
                  </div>
                )}

                {/* 4. PERSONEL GİRİŞİ */}
                {aktifMenu === 'personel' && (
                  <div className="space-y-4">
                     <div>
                        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-1"><HardHat className="w-6 h-6 text-amber-500"/> Personel Servis Kaydı</h2>
                        <p className="text-xs text-slate-500">Sadece yetkili servis personelleri doldurmalıdır.</p>
                     </div>

                     <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4 mt-4">
                        <div>
                           <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Ad Soyad</label>
                           <input type="text" value={perAd} onChange={e=>setPerAd(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-400" placeholder="Örn: Ahmet Yılmaz" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                           <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">İşlem Tipi</label>
                              <select value={perIslemTipi} onChange={e=>setPerIslemTipi(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-400">
                                 <option value="bakim">Periyodik Bakım</option>
                                 <option value="ariza">Arıza Müdahale</option>
                                 <option value="montaj">Montaj / Revizyon</option>
                              </select>
                           </div>
                           <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Başlık</label>
                              <input type="text" value={perBaslik} onChange={e=>setPerBaslik(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-400" placeholder="Örn: Motor Değişimi" />
                           </div>
                        </div>
                        <div>
                           <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Rapor Detayı</label>
                           <textarea rows={3} value={perDetay} onChange={e=>setPerDetay(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-400 resize-none" placeholder="Yapılan işlemleri detaylıca yazınız..."></textarea>
                        </div>
                     </div>

                     <button onClick={personelRaporKaydet} disabled={perDurum==="loading"} className="w-full bg-amber-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-amber-200 active:scale-95 transition-all">
                       {perDurum==="loading" ? <Loader2 className="animate-spin"/> : "SİSTEME KAYDET"}
                     </button>
                  </div>
                )}

                {/* BAŞARI MESAJI (ORTAK) */}
                <AnimatePresence>
                  {(bildirimDurumu === "success" || perDurum === "success") && (
                    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} className="bg-emerald-50 text-emerald-700 p-4 rounded-xl text-center font-bold text-sm border border-emerald-100 flex items-center justify-center gap-2 mt-4">
                      <CheckCircle2 className="w-5 h-5" /> İşlem başarıyla kaydedildi!
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}