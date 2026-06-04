"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Plus, Search, CalendarClock, Building2, Save, X, 
  FileText, Upload, CalendarDays, Settings, CheckCircle2, 
  AlertCircle, Download, FileCheck, Trash2, Clock, Calculator
} from 'lucide-react';

export default function PeriyodikBakimPage() {
  const router = useRouter();
  
  const [sozlesmeler, setSozlesmeler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [aramaMetni, setAramaMetni] = useState("");
  
  // Form Stateleri
  const [modalAcik, setModalAcik] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [dosyaYukleniyor, setDosyaYukleniyor] = useState(false);
  const [secilenDosya, setSecilenDosya] = useState<File | null>(null);

  const [yeniSozlesme, setYeniSozlesme] = useState({
      company_name: '',
      machine_count: 1,
      price_per_machine: '',
      maintenance_period_months: 3,
      contract_duration_years: 1,
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      contract_file_url: ''
  });

  useEffect(() => { veriCek(); }, []);

  // Başlangıç tarihi veya süre değiştiğinde Bitiş Tarihini otomatik hesapla
  useEffect(() => {
      if (yeniSozlesme.start_date) {
          const start = new Date(yeniSozlesme.start_date);
          start.setFullYear(start.getFullYear() + Number(yeniSozlesme.contract_duration_years));
          setYeniSozlesme(prev => ({ ...prev, end_date: start.toISOString().split('T')[0] }));
      }
  }, [yeniSozlesme.start_date, yeniSozlesme.contract_duration_years]);

  async function veriCek() {
    setYukleniyor(true);
    const { data, error } = await supabase
      .from('maintenance_contracts')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
        // Süresi geçenleri tespit et ve statüsünü güncelle
        const bugun = new Date();
        const guncelData = data.map(sozlesme => {
            const bitis = new Date(sozlesme.end_date);
            if (bitis < bugun && sozlesme.status === 'aktif') {
                sozlesme.status = 'bitti';
                // Veritabanında da güncelleyelim (Arka planda sessizce)
                supabase.from('maintenance_contracts').update({ status: 'bitti' }).eq('id', sozlesme.id).then();
            }
            return sozlesme;
        });
        setSozlesmeler(guncelData);
    }
    setYukleniyor(false);
  }

  async function dosyaYukleVeLinkAl() {
      if (!secilenDosya) return yeniSozlesme.contract_file_url;
      
      setDosyaYukleniyor(true);
      const dosyaUzantisi = secilenDosya.name.split('.').pop();
      const dosyaAdi = `sozlesme_${Date.now()}.${dosyaUzantisi}`;
      const dosyaYolu = `sozlesmeler/${dosyaAdi}`;

      const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(dosyaYolu, secilenDosya);

      setDosyaYukleniyor(false);

      if (uploadError) {
          alert("Dosya yüklenirken hata oluştu: " + uploadError.message);
          return null;
      }

      const { data } = supabase.storage.from('documents').getPublicUrl(dosyaYolu);
      return data.publicUrl;
  }

  async function sozlesmeKaydet() {
    if (!yeniSozlesme.company_name || !yeniSozlesme.price_per_machine) return alert("Firma adı ve fiyat girmek zorunludur!");
    setKaydediliyor(true);

    let finalFileUrl = yeniSozlesme.contract_file_url;
    if (secilenDosya) {
        const url = await dosyaYukleVeLinkAl();
        if (url) finalFileUrl = url;
    }

    const { error } = await supabase
      .from('maintenance_contracts')
      .insert([{ 
          ...yeniSozlesme, 
          price_per_machine: Number(yeniSozlesme.price_per_machine),
          contract_file_url: finalFileUrl 
      }]);

    setKaydediliyor(false);

    if (error) {
        alert("Kaydedilemedi: " + error.message);
    } else {
        setModalAcik(false);
        setSecilenDosya(null);
        setYeniSozlesme({ company_name: '', machine_count: 1, price_per_machine: '', maintenance_period_months: 3, contract_duration_years: 1, start_date: new Date().toISOString().split('T')[0], end_date: '', contract_file_url: '' });
        veriCek();
    }
  }

  async function sozlesmeSil(id: string, name: string) {
      if(!confirm(`"${name}" firmasının sözleşmesini tamamen silmek istediğinize emin misiniz?`)) return;
      const { error } = await supabase.from('maintenance_contracts').delete().eq('id', id);
      if(!error) veriCek();
  }

  const filtrelenmisSozlesmeler = sozlesmeler.filter(s => 
      s.company_name.toLowerCase().includes(aramaMetni.toLowerCase())
  );

  // Kalan gün hesaplama aracı
  const kalanGunHesapla = (endDate: string) => {
      const bitis = new Date(endDate).getTime();
      const bugun = new Date().getTime();
      const fark = bitis - bugun;
      return Math.ceil(fark / (1000 * 3600 * 24));
  };

  if (yukleniyor) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      
      {/* HEADER */}
      <div className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-40 border-b-4 border-teal-500">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/admin')} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition">
                <ArrowLeft size={20}/>
            </button>
            <div className="flex items-center gap-3">
              <div className="bg-teal-500/20 p-2.5 rounded-xl border border-teal-500/30 text-teal-400">
                  <CalendarClock className="w-6 h-6" />
              </div>
              <div>
                  <h1 className="text-xl font-black tracking-tight leading-none text-teal-50">BAKIM SÖZLEŞMELERİ</h1>
                  <p className="text-[10px] text-teal-400 font-bold tracking-widest uppercase">Periyodik Takip Sistemi</p>
              </div>
            </div>
          </div>
          
          <button onClick={() => setModalAcik(true)} className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-teal-900/20">
              <Plus size={18} /> <span className="hidden sm:inline">Yeni Sözleşme</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        
        {/* İSTATİSTİK KARTLARI & ARAMA */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center"><FileCheck size={28}/></div>
                <div><p className="text-sm font-bold text-slate-500 uppercase">Aktif Sözleşme</p><h3 className="text-3xl font-black text-slate-800">{sozlesmeler.filter(s => s.status === 'aktif').length}</h3></div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center"><AlertCircle size={28}/></div>
                <div><p className="text-sm font-bold text-slate-500 uppercase">Yakında Bitecek</p><h3 className="text-3xl font-black text-slate-800">{sozlesmeler.filter(s => s.status === 'aktif' && kalanGunHesapla(s.end_date) <= 30).length}</h3></div>
            </div>
            
            <div className="relative w-full h-full flex items-center">
                <Search className="absolute left-4 text-slate-400 w-5 h-5"/>
                <input 
                    type="text" 
                    placeholder="Firma Ara..." 
                    value={aramaMetni} 
                    onChange={e => setAramaMetni(e.target.value)} 
                    className="w-full h-full min-h-[72px] pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-3xl text-sm outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-400 transition shadow-sm"
                />
            </div>
        </div>

        {/* SÖZLEŞMELER LİSTESİ */}
        {filtrelenmisSozlesmeler.length === 0 ? (
             <div className="bg-white p-12 rounded-3xl text-center border border-dashed border-slate-300">
                <div className="bg-teal-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"><CalendarClock className="w-10 h-10 text-teal-300" /></div>
                <h3 className="text-lg font-bold text-slate-700">Sözleşme Bulunamadı</h3>
                <p className="text-slate-400 text-sm mt-1">Sisteme kayıtlı periyodik bakım sözleşmesi yok.</p>
             </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filtrelenmisSozlesmeler.map((sozlesme) => {
                    const kalanGun = kalanGunHesapla(sozlesme.end_date);
                    const durumRenk = sozlesme.status === 'bitti' ? 'bg-red-50 border-red-200 text-red-600' : 
                                      (kalanGun <= 30 ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-emerald-50 border-emerald-200 text-emerald-600');

                    return (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={sozlesme.id} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 relative overflow-hidden flex flex-col justify-between">
                        
                        <div>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-xl font-black text-slate-800 uppercase leading-tight mb-1">{sozlesme.company_name}</h3>
                                    <div className="flex gap-2 mt-2">
                                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border flex items-center gap-1 ${durumRenk}`}>
                                            {sozlesme.status === 'bitti' ? <X size={12}/> : <Clock size={12}/>}
                                            {sozlesme.status === 'bitti' ? 'SÜRESİ BİTTİ' : `${kalanGun} Gün Kaldı`}
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 flex items-center gap-1">
                                            <Settings size={12}/> {sozlesme.maintenance_period_months} Ayda 1 Bakım
                                        </span>
                                    </div>
                                </div>
                                <button onClick={() => sozlesmeSil(sozlesme.id, sozlesme.company_name)} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-xl transition" title="Sözleşmeyi Sil">
                                    <Trash2 size={18}/>
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4 my-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Makine Sayısı</p>
                                    <p className="font-black text-slate-700">{sozlesme.machine_count} Adet</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Makine Başı Fiyat</p>
                                    <p className="font-black text-slate-700">{Number(sozlesme.price_per_machine).toLocaleString()} ₺</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Sözleşme Başlangıç</p>
                                    <p className="font-bold text-slate-600 text-sm">{new Date(sozlesme.start_date).toLocaleDateString('tr-TR')}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Sözleşme Bitiş</p>
                                    <p className="font-bold text-slate-600 text-sm">{new Date(sozlesme.end_date).toLocaleDateString('tr-TR')}</p>
                                </div>
                            </div>
                        </div>

                        {/* AKSİYON BUTONLARI */}
                        <div className="pt-4 border-t border-slate-100 mt-auto">
                            {sozlesme.contract_file_url ? (
                                <a 
                                    href={sozlesme.contract_file_url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-4 rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-md"
                                >
                                    <FileText size={18} className="text-teal-400"/> SÖZLEŞME DOSYASINI AÇ
                                </a>
                            ) : (
                                <button disabled className="w-full bg-slate-100 text-slate-400 font-bold py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2 border border-slate-200 cursor-not-allowed">
                                    <X size={18}/> Dosya Yüklenmemiş
                                </button>
                            )}
                        </div>

                    </motion.div>
                )})}
            </div>
        )}
      </div>

      {/* YENİ SÖZLEŞME EKLEME MODALI */}
      <AnimatePresence>
        {modalAcik && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-3xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col my-auto" onClick={e => e.stopPropagation()}>
                    
                    <div className="p-6 md:p-8 bg-slate-900 text-white flex justify-between items-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10"><FileText size={100}/></div>
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="p-3 bg-teal-500/20 rounded-2xl text-teal-400 border border-teal-500/30"><Plus size={24}/></div>
                            <div>
                                <h2 className="text-2xl font-black tracking-tight">Yeni Sözleşme Oluştur</h2>
                                <p className="text-xs text-teal-400 font-bold uppercase tracking-widest mt-1">Periyodik Bakım Kaydı</p>
                            </div>
                        </div>
                        <button onClick={() => { setModalAcik(false); setSecilenDosya(null); }} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-red-500 p-2.5 rounded-full transition relative z-10"><X size={20}/></button>
                    </div>

                    <div className="p-6 md:p-8 space-y-6 bg-slate-50">
                        
                        {/* 1. Kısım: Müşteri ve Makine Bilgisi */}
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b pb-2">1. Firma ve Fiyatlandırma</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2 mb-1.5 ml-1"><Building2 size={12}/> Firma Adı</label>
                                    <input type="text" placeholder="Örn: X Fabrikası" value={yeniSozlesme.company_name} onChange={e => setYeniSozlesme({...yeniSozlesme, company_name: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-teal-500"/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2 mb-1.5 ml-1"><Settings size={12}/> Makine Sayısı</label>
                                    <input type="number" min="1" value={yeniSozlesme.machine_count} onChange={e => setYeniSozlesme({...yeniSozlesme, machine_count: Number(e.target.value)})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500"/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2 mb-1.5 ml-1"><Calculator size={12}/> Makine Başı Bakım Fiyatı (₺)</label>
                                    <input type="number" placeholder="Örn: 2500" value={yeniSozlesme.price_per_machine} onChange={e => setYeniSozlesme({...yeniSozlesme, price_per_machine: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500"/>
                                </div>
                            </div>
                        </div>

                        {/* 2. Kısım: Zaman ve Periyot */}
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b pb-2">2. Sözleşme Süresi ve Periyot</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2 mb-1.5 ml-1"><Clock size={12}/> Bakım Sıklığı</label>
                                    <select value={yeniSozlesme.maintenance_period_months} onChange={e => setYeniSozlesme({...yeniSozlesme, maintenance_period_months: Number(e.target.value)})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer">
                                        <option value={1}>Ayda 1 Kez</option>
                                        <option value={2}>2 Ayda 1 Kez</option>
                                        <option value={3}>3 Ayda 1 Kez (Standart)</option>
                                        <option value={4}>4 Ayda 1 Kez</option>
                                        <option value={6}>6 Ayda 1 Kez</option>
                                        <option value={12}>Yılda 1 Kez</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2 mb-1.5 ml-1"><CalendarDays size={12}/> Sözleşme Süresi</label>
                                    <select value={yeniSozlesme.contract_duration_years} onChange={e => setYeniSozlesme({...yeniSozlesme, contract_duration_years: Number(e.target.value)})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer">
                                        <option value={1}>1 Yıl</option>
                                        <option value={2}>2 Yıl</option>
                                        <option value={3}>3 Yıl</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2 mb-1.5 ml-1"><CalendarClock size={12}/> Başlangıç Tarihi</label>
                                    <input type="date" value={yeniSozlesme.start_date} onChange={e => setYeniSozlesme({...yeniSozlesme, start_date: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500"/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2 mb-1.5 ml-1"><CalendarClock size={12}/> Bitiş Tarihi (Oto. Hesaplanır)</label>
                                    <input type="date" disabled value={yeniSozlesme.end_date} className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 cursor-not-allowed"/>
                                </div>
                            </div>
                        </div>

                        {/* 3. Kısım: Belge Yükleme */}
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b pb-2 mb-4">3. Sözleşme Dosyası (PDF / GÖRSEL)</h3>
                            <div className="flex items-center justify-center w-full">
                                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition">
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        <Upload className="w-8 h-8 mb-2 text-slate-400" />
                                        <p className="mb-2 text-sm text-slate-500 font-bold">
                                            {secilenDosya ? secilenDosya.name : 'Dosya Seçmek veya Sürüklemek için Tıklayın'}
                                        </p>
                                        <p className="text-xs text-slate-400">PDF, JPG, PNG (Max 10MB)</p>
                                    </div>
                                    <input type="file" className="hidden" accept=".pdf,image/*" onChange={(e) => { if(e.target.files && e.target.files[0]) setSecilenDosya(e.target.files[0]) }} />
                                </label>
                            </div>
                        </div>

                    </div>

                    <div className="p-6 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
                        <button onClick={() => { setModalAcik(false); setSecilenDosya(null); }} className="px-6 py-3.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition text-sm">İptal</button>
                        <button onClick={sozlesmeKaydet} disabled={kaydediliyor || dosyaYukleniyor} className="px-8 py-3.5 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 transition shadow-lg shadow-teal-200 flex items-center gap-2 text-sm active:scale-95">
                            {(kaydediliyor || dosyaYukleniyor) ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span> : <Save size={18}/>}
                            {dosyaYukleniyor ? 'Dosya Yükleniyor...' : kaydediliyor ? 'Kaydediliyor...' : 'Sözleşmeyi Başlat'}
                        </button>
                    </div>

                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}