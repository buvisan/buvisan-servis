"use client";

// ----------------------------------------------------------------------------
// BUVISAN SAHA PERSONELİ UYGULAMASI 🛠️ V1.3 (EKİP SEÇİMİ EKLENDİ)
// (Dijital Servis Formu, Sesli Müşteri Kaydı ve Çoklu Personel Takibi)
// ----------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LogOut, MapPin, CheckCircle2, Clock, Truck, 
  Wrench, ChevronRight, FileSignature, ArrowLeft, Plus, Trash2, Send, Loader2, User, HardHat, FileText, CalendarClock, Mic,
  Users, CheckSquare, Square // <-- YENİ İKONLAR
} from 'lucide-react';

const SAHA_PERSONELLERI = [
  "Veysel Çarklı", "Okan Aran", "Gökhan Gök", "Kerim Akdoğan", "Kaya Ali Tosun"
];

export default function PersonelEkrani() {
  const router = useRouter();
  const [yukleniyor, setYukleniyor] = useState(true);
  const [isler, setIsler] = useState<any[]>([]);
  const [aktifPersonel, setAktifPersonel] = useState<any>(null);

  // --- FORM STATELERİ ---
  const [seciliIs, setSeciliIs] = useState<any>(null);
  const [formAcik, setFormAcik] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [basarili, setBasarili] = useState(false);

  // Kağıt formun birebir dijital hali
  const [raporForm, setRaporForm] = useState({
      isyerine_varis: '', isyerinden_ayrilis: '', 
      vinc_modeli: '', vinc_seri_no: '', vinc_kapasite: '',
      arizanin_cinsi: '', islem_turu: 'Servis', yapilan_isler: '',
      degisen_parcalar: [{ parca_no: '', parca_adi: '', adet: '' }],
      secilen_personeller: [] as string[] // <-- YENİ EKLENDİ (Çoklu Personel Seçimi)
  });

  useEffect(() => { verileriGetir(); }, []);

  async function verileriGetir() {
      try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) { router.replace('/login'); return; }

          const { data: profil } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
          if (!profil) { router.replace('/login'); return; }
          
          setAktifPersonel(profil);

          const { data: isData } = await supabase
              .from('service_tickets')
              .select('*, cranes(*)')
              .neq('pipeline_status', 'tamamlandi')
              .order('created_at', { ascending: false });

          if (isData) setIsler(isData);

      } catch (error) { console.error("Hata:", error); } 
      finally { setYukleniyor(false); }
  }

  async function cikisYap() { await supabase.auth.signOut(); router.push('/login'); }

  // --- PARÇA LİSTESİ YÖNETİMİ ---
  const parcaEkle = () => setRaporForm({...raporForm, degisen_parcalar: [...raporForm.degisen_parcalar, { parca_no: '', parca_adi: '', adet: '' }]});
  const parcaSil = (index: number) => {
      const yeniListe = [...raporForm.degisen_parcalar];
      yeniListe.splice(index, 1);
      setRaporForm({...raporForm, degisen_parcalar: yeniListe});
  }
  const parcaGuncelle = (index: number, alan: string, deger: string) => {
      const yeniListe = [...raporForm.degisen_parcalar];
      // @ts-ignore
      yeniListe[index][alan] = deger;
      setRaporForm({...raporForm, degisen_parcalar: yeniListe});
  }

  // --- YENİ: PERSONEL SEÇİM FONKSİYONU ---
  const personelToggle = (isim: string) => {
      const mevcutListe = raporForm.secilen_personeller;
      if (mevcutListe.includes(isim)) {
          setRaporForm({ ...raporForm, secilen_personeller: mevcutListe.filter(p => p !== isim) });
      } else {
          setRaporForm({ ...raporForm, secilen_personeller: [...mevcutListe, isim] });
      }
  };

  const formuAc = (isKaydi: any) => {
      setSeciliIs(isKaydi);
      
      const suan = new Date();
      const varisSaati = `${suan.getHours().toString().padStart(2, '0')}:${suan.getMinutes().toString().padStart(2, '0')}`;

      setRaporForm({
          isyerine_varis: `${suan.toLocaleDateString('tr-TR')} ${varisSaati}`, 
          isyerinden_ayrilis: '', 
          vinc_modeli: isKaydi.cranes?.model_name || isKaydi.manual_crane_info || '', 
          vinc_seri_no: isKaydi.cranes?.serial_number || '', 
          vinc_kapasite: isKaydi.cranes?.capacity || '',
          arizanin_cinsi: isKaydi.description || '', 
          islem_turu: isKaydi.ticket_type === 'kesif' ? 'Diğer' : 'Servis', 
          yapilan_isler: '',
          degisen_parcalar: [{ parca_no: '', parca_adi: '', adet: '' }],
          secilen_personeller: [] // Form her açıldığında sıfırlanır
      });
      setFormAcik(true);
      setBasarili(false);
  }

  const raporuKaydet = async () => {
      setGonderiliyor(true);

      const firma_adi = seciliIs.cranes?.customer_name || seciliIs.manual_customer_name || 'Bilinmiyor';
      const firma_adresi = seciliIs.cranes?.location_address || seciliIs.manual_location || 'Belirtilmedi';

      // Çoklu seçilen personelleri araya tire (-) koyarak birleştir, seçilmediyse formu dolduranın adını yaz
      const kaydedilecekPersoneller = raporForm.secilen_personeller.length > 0 
          ? raporForm.secilen_personeller.join(" - ") 
          : aktifPersonel?.full_name || 'Bilinmeyen Personel';

      try {
          const { error } = await supabase.from('service_reports').insert([{
              ticket_id: seciliIs.id,
              personel_adi: kaydedilecekPersoneller, // <-- YENİ BİRLEŞTİRİLMİŞ İSİMLER BURAYA GİDER
              firma_adi: firma_adi,
              firma_adresi: firma_adresi,
              isyerine_varis_tarih_saat: raporForm.isyerine_varis,
              isyerinden_ayrilis_tarih_saat: raporForm.isyerinden_ayrilis,
              vinc_modeli: raporForm.vinc_modeli,
              vinc_seri_no: raporForm.vinc_seri_no,
              vinc_kapasite: raporForm.vinc_kapasite,
              arizanin_cinsi: raporForm.arizanin_cinsi,
              islem_turu: raporForm.islem_turu,
              yapilan_isler: raporForm.yapilan_isler,
              degisen_parcalar: raporForm.degisen_parcalar
          }]);

          if (error) throw error;

          await supabase.from('service_tickets').update({ pipeline_status: 'tamamlandi', status: 'tamamlandi' }).eq('id', seciliIs.id);

          setBasarili(true);
          setTimeout(() => {
              setFormAcik(false);
              verileriGetir();
          }, 3000);

      } catch (err: any) {
          alert("Kaydedilirken hata oluştu: " + err.message);
      } finally {
          setGonderiliyor(false);
      }
  }

  if (yukleniyor) return (
      <div className="min-h-[100dvh] bg-slate-900 flex flex-col items-center justify-center text-white">
         <Loader2 className="animate-spin w-12 h-12 text-blue-500 mb-4"/>
         <div className="font-bold text-lg animate-pulse tracking-widest uppercase">SAHA UYGULAMASI AÇILIYOR</div>
      </div>
  );

  return (
    <div className="min-h-[100dvh] bg-slate-100 font-sans pb-24">
      
      {/* ÜST HEADER */}
      <div className="bg-slate-900 text-white p-4 shadow-xl sticky top-0 z-40 rounded-b-3xl">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg"><HardHat className="w-6 h-6 text-white" /></div>
            <div>
                <h1 className="text-xl font-black tracking-tight leading-none">SAHA EKİBİ</h1>
                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mt-1">Buvisan Operasyon</p>
            </div>
          </div>
          <button onClick={cikisYap} className="text-slate-400 hover:text-white bg-white/10 p-2.5 rounded-full transition"><LogOut className="w-5 h-5" /></button>
        </div>
        
        <div className="bg-slate-800 rounded-2xl p-4 flex items-center gap-3 border border-slate-700">
            <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center text-slate-300"><User size={20}/></div>
            <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Hoş Geldin,</div>
                <div className="font-bold">{aktifPersonel?.full_name || 'Personel'}</div>
            </div>
        </div>
      </div>

      {/* BEKLEYEN İŞLER LİSTESİ */}
      <div className="p-4 space-y-4">
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-2 ml-1">
              <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></div> Aktif Operasyonlar ({isler.length})
          </h2>

          {isler.length === 0 ? (
              <div className="bg-white p-10 rounded-3xl text-center border border-dashed border-slate-300 shadow-sm">
                  <div className="bg-emerald-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle2 className="w-8 h-8 text-emerald-500" /></div>
                  <h3 className="text-lg font-bold text-slate-700">Saha Temiz!</h3>
                  <p className="text-slate-400 text-xs mt-1">Şu an size atanmış bekleyen bir iş bulunmuyor.</p>
              </div>
          ) : (
              isler.map((is) => {
                  const isKritik = is.priority === 'Kritik (Makine Durdu)';
                  const firma = is.cranes?.customer_name || is.manual_customer_name || "Bilinmeyen Firma";
                  const adres = is.cranes?.location_address || is.manual_location || "Adres Yok";
                  
                  return (
                      <div key={is.id} className={`bg-white rounded-[2rem] p-5 shadow-lg border-l-[6px] relative overflow-hidden ${isKritik ? 'border-l-red-500 shadow-red-100' : 'border-l-blue-500'}`}>
                          
                          {/* Üst Bilgiler */}
                          <div className="flex justify-between items-start mb-3">
                              <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${isKritik ? 'bg-red-50 text-red-600 border-red-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                                  {isKritik ? '🚨 KRİTİK (ACİL)' : 'NORMAL İŞ EMRİ'}
                              </span>
                              <span className="text-[10px] text-slate-400 font-bold bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 flex items-center gap-1">
                                  <Clock size={10}/> {new Date(is.created_at).toLocaleDateString('tr-TR')}
                              </span>
                          </div>

                          <h3 className="text-lg font-extrabold text-slate-800 leading-tight mb-2">{firma}</h3>
                          
                          <div className="flex items-start gap-2 text-slate-500 text-xs font-medium mb-3">
                              <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                              <p className="leading-snug">{adres}</p>
                          </div>

                          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs text-slate-700 font-medium mb-3">
                              <strong className="text-slate-800 block mb-1">Sorun:</strong> {is.description}
                          </div>

                          {is.audio_url && (
                              <div className="bg-blue-50 border border-blue-100 p-3 rounded-2xl mb-4 shadow-sm">
                                  <span className="text-[10px] font-bold text-blue-700 uppercase flex items-center gap-1.5 mb-2">
                                      <Mic size={14} className="text-blue-600 animate-pulse" /> Müşterinin Ses Kaydı:
                                  </span>
                                  <audio src={is.audio_url} controls className="w-full h-9 rounded-lg" />
                              </div>
                          )}

                          <button onClick={() => formuAc(is)} className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-2xl flex items-center justify-between px-5 hover:bg-black transition shadow-md active:scale-95">
                              <span className="flex items-center gap-2"><FileSignature size={18}/> DİJİTAL FORMU DOLDUR</span>
                              <ChevronRight size={18} className="text-slate-400"/>
                          </button>

                      </div>
                  );
              })
          )}
      </div>

      {/* ==========================================
          DİJİTAL SERVİS FORMU MODALI (AŞAĞIDAN AÇILIR)
          ========================================== */}
      <AnimatePresence>
        {formAcik && seciliIs && (
            <>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50"/>
                
                <motion.div 
                    initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="fixed inset-x-0 bottom-0 z-[60] bg-slate-50 rounded-t-[2.5rem] shadow-2xl overflow-hidden max-h-[95dvh] flex flex-col"
                >
                    {basarili ? (
                        <div className="p-10 text-center flex flex-col items-center justify-center min-h-[400px]">
                            <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6 shadow-inner"><CheckCircle2 size={50} className="text-emerald-500" /></div>
                            <h2 className="text-2xl font-black text-slate-800 mb-2">Rapor İletildi!</h2>
                            <p className="text-slate-500 text-sm leading-relaxed mb-8">Servis formu başarıyla Admin paneline aktarıldı ve iş emri kapatıldı.</p>
                        </div>
                    ) : (
                        <>
                            {/* Form Header */}
                            <div className="bg-white border-b border-slate-200 p-5 flex items-center justify-between shrink-0 rounded-t-[2.5rem] relative shadow-sm">
                                <button onClick={() => setFormAcik(false)} className="bg-slate-100 p-2.5 rounded-full text-slate-600 hover:bg-slate-200 transition"><ArrowLeft size={20}/></button>
                                <div className="text-center absolute left-1/2 -translate-x-1/2">
                                    <h2 className="font-black text-slate-800 text-lg">Servis Raporu</h2>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Saha Formu (No: {seciliIs.id.slice(0,5).toUpperCase()})</p>
                                </div>
                                <div className="w-10"></div>
                            </div>

                            {/* Form Body (Scrollable) */}
                            <div className="overflow-y-auto p-5 space-y-6 pb-32 custom-scrollbar">
                                
                                {/* Üst Firma Bilgisi (Sadece Okunur) */}
                                <div className="bg-blue-600 text-white p-5 rounded-3xl shadow-lg shadow-blue-500/30">
                                    <div className="text-[10px] font-bold text-blue-200 uppercase tracking-wider mb-1">Müşteri / Firma Adı</div>
                                    <div className="font-extrabold text-xl leading-tight mb-2">{seciliIs.cranes?.customer_name || seciliIs.manual_customer_name}</div>
                                    <div className="text-[10px] font-bold text-blue-200 uppercase tracking-wider mb-1">Firma Adresi</div>
                                    <div className="font-medium text-sm text-blue-50 leading-snug">{seciliIs.cranes?.location_address || seciliIs.manual_location}</div>
                                </div>

                                {/* YENİ: OPERASYONA KATILAN EKİP */}
                                <div className="space-y-4 bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm">
                                    <div>
                                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-1">
                                            <Users className="w-4 h-4 text-blue-500"/> Operasyona Katılan Ekip
                                        </h3>
                                        <p className="text-[10px] text-slate-500 font-medium ml-1">Lütfen sahada işlemi gerçekleştiren tüm personelleri seçiniz.</p>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-2">
                                        {SAHA_PERSONELLERI.map(personel => (
                                            <button 
                                                key={personel} 
                                                onClick={() => personelToggle(personel)} 
                                                className={`py-3 px-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 ${raporForm.secilen_personeller.includes(personel) ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                            >
                                                {raporForm.secilen_personeller.includes(personel) ? <CheckSquare size={14}/> : <Square size={14}/>}
                                                <span className="truncate">{personel}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* SES KAYDI ALANI */}
                                {seciliIs.audio_url && (
                                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-3xl shadow-sm">
                                        <div className="flex items-center gap-2 text-xs font-bold text-blue-800 uppercase mb-2">
                                            <Mic size={16} className="text-blue-600 animate-pulse" /> Müşterinin Ses Kaydı:
                                        </div>
                                        <audio src={seciliIs.audio_url} controls className="w-full h-10 rounded-xl" />
                                    </div>
                                )}

                                {/* TARİH / SAAT ALANI */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 block">İşyerine Varış</label>
                                        <input type="text" placeholder="Giriş Saati" value={raporForm.isyerine_varis} onChange={e=>setRaporForm({...raporForm, isyerine_varis: e.target.value})} className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 shadow-sm" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 block">İşyerinden Ayrılış</label>
                                        <input type="text" placeholder="Çıkış Saati" value={raporForm.isyerinden_ayrilis} onChange={e=>setRaporForm({...raporForm, isyerinden_ayrilis: e.target.value})} className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 shadow-sm" />
                                    </div>
                                </div>

                                <div className="h-px w-full bg-slate-200"></div>

                                {/* VİNÇ BİLGİLERİ */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2"><Truck className="w-4 h-4 text-blue-500"/> Makine / Vinç Bilgileri</h3>
                                    
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block">Modeli</label>
                                        <input type="text" placeholder="Model bilgisi" value={raporForm.vinc_modeli} onChange={e=>setRaporForm({...raporForm, vinc_modeli: e.target.value})} className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 shadow-sm" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block">Seri No</label>
                                            <input type="text" placeholder="Seri no" value={raporForm.vinc_seri_no} onChange={e=>setRaporForm({...raporForm, vinc_seri_no: e.target.value})} className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-mono text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 shadow-sm" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block">Kapasite / Tonaj</label>
                                            <input type="text" placeholder="Tonaj" value={raporForm.vinc_kapasite} onChange={e=>setRaporForm({...raporForm, vinc_kapasite: e.target.value})} className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 shadow-sm" />
                                        </div>
                                    </div>
                                </div>

                                {/* İŞLEM TÜRÜ VE ARIZA CİNSİ */}
                                <div className="space-y-4 bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 block">Servis İşlem Türü Seçin</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {['Servis', 'Garanti', 'Per.Bakım', 'Diğer'].map(tur => (
                                                <button key={tur} onClick={() => setRaporForm({...raporForm, islem_turu: tur})} className={`py-3 rounded-xl text-xs font-bold transition border ${raporForm.islem_turu === tur ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                    {tur}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 mt-4">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 block">Arızanın Cinsi (Sorun Ne İdi?)</label>
                                        <textarea rows={2} placeholder="Arıza detayını buraya girin..." value={raporForm.arizanin_cinsi} onChange={e=>setRaporForm({...raporForm, arizanin_cinsi: e.target.value})} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-500 transition resize-none leading-relaxed" />
                                    </div>
                                </div>

                                {/* YAPILAN İŞLER (BÜYÜK ALAN) */}
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-black text-slate-800 uppercase tracking-wider ml-1 flex items-center gap-2"><Wrench className="w-4 h-4 text-amber-500"/> Yapılan İşlemler (Detaylı)</label>
                                    <textarea rows={4} placeholder="Makine incelendi, şu parçalar söküldü, yerine bu takıldı, test edildi vb..." value={raporForm.yapilan_isler} onChange={e=>setRaporForm({...raporForm, yapilan_isler: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-3xl text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-amber-400 shadow-inner resize-none leading-relaxed" />
                                </div>

                                {/* DEĞİŞEN PARÇALAR TABLOSU (DİNAMİK) */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-[11px] font-black text-slate-800 uppercase tracking-wider ml-1 flex items-center gap-2"><FileText className="w-4 h-4 text-emerald-500"/> Değişen / Kullanılan Parçalar</label>
                                    </div>
                                    
                                    <div className="space-y-3">
                                        {raporForm.degisen_parcalar.map((parca, index) => (
                                            <div key={index} className="bg-white p-4 rounded-[2rem] border border-slate-200 shadow-sm relative group">
                                                <div className="absolute -top-2.5 left-4 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Kalem {index + 1}</div>
                                                
                                                <div className="grid grid-cols-12 gap-3 mt-2">
                                                    <div className="col-span-3">
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase px-1">Kod / No</label>
                                                        <input type="text" placeholder="No" value={parca.parca_no} onChange={(e) => parcaGuncelle(index, 'parca_no', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 placeholder:text-slate-400 text-center outline-none focus:bg-white" />
                                                    </div>
                                                    <div className="col-span-6">
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase px-1">Parça Adı</label>
                                                        <input type="text" placeholder="Örn: Diyot" value={parca.parca_adi} onChange={(e) => parcaGuncelle(index, 'parca_adi', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white" />
                                                    </div>
                                                    <div className="col-span-3 relative">
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase px-1">Adet</label>
                                                        <input type="text" placeholder="Adet" value={parca.adet} onChange={(e) => parcaGuncelle(index, 'adet', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 placeholder:text-slate-400 text-center outline-none focus:bg-white pr-7" />
                                                        
                                                        {raporForm.degisen_parcalar.length > 1 && (
                                                            <button onClick={() => parcaSil(index)} className="absolute -right-2 -top-6 bg-red-100 text-red-500 p-1.5 rounded-full hover:bg-red-500 hover:text-white transition shadow-sm"><Trash2 size={12}/></button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <button onClick={parcaEkle} className="w-full py-3.5 border-2 border-dashed border-emerald-300 bg-emerald-50 text-emerald-600 rounded-2xl text-xs font-bold hover:bg-emerald-100 transition flex items-center justify-center gap-2 mt-2">
                                        <Plus size={16}/> YENİ PARÇA SATIRI EKLE
                                    </button>
                                </div>
                            </div>

                            {/* Sabit Alt Buton */}
                            <div className="bg-white border-t border-slate-200 p-5 absolute bottom-0 left-0 w-full z-10 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] pb-8">
                                <button onClick={raporuKaydet} disabled={gonderiliyor} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-500/30 flex justify-center items-center gap-2 active:scale-95 transition-all text-base">
                                    {gonderiliyor ? <Loader2 className="animate-spin w-5 h-5"/> : <Send className="w-5 h-5"/>}
                                    {gonderiliyor ? "SİSTEME KAYDEDİLİYOR..." : "FORMU KAYDET VE İŞİ BİTİR"}
                                </button>
                            </div>
                        </>
                    )}
                </motion.div>
            </>
        )}
      </AnimatePresence>
    </div>
  );
}