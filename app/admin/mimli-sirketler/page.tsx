"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Plus, Search, Ban, AlertTriangle, Phone, 
  User, Building2, Trash2, X, Save, FileText, CalendarClock 
} from 'lucide-react';

export default function MimliSirketlerPage() {
  const router = useRouter();
  
  const [sirketler, setSirketler] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [aramaMetni, setAramaMetni] = useState("");
  
  // Form Stateleri
  const [modalAcik, setModalAcik] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [yeniSirket, setYeniSirket] = useState({
      company_name: '',
      contact_person: '',
      phone: '',
      reason_category: 'Ödeme Alınamıyor / Borçlu',
      details: ''
  });

  useEffect(() => {
    veriCek();
  }, []);

  async function veriCek() {
    setYukleniyor(true);
    const { data, error } = await supabase
      .from('blacklisted_companies')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setSirketler(data);
    }
    setYukleniyor(false);
  }

  async function sirketKaydet() {
    if (!yeniSirket.company_name) return alert("Firma adı girmek zorunludur!");
    setKaydediliyor(true);

    const { error } = await supabase
      .from('blacklisted_companies')
      .insert([yeniSirket]);

    setKaydediliyor(false);

    if (error) {
        alert("Kaydedilemedi: " + error.message);
    } else {
        setModalAcik(false);
        setYeniSirket({ company_name: '', contact_person: '', phone: '', reason_category: 'Ödeme Alınamıyor / Borçlu', details: '' });
        veriCek();
    }
  }

  async function sirketSil(id: string, name: string) {
      if(!confirm(`"${name}" firmasını mimli listeden çıkarmak istediğinize emin misiniz?`)) return;
      
      const { error } = await supabase.from('blacklisted_companies').delete().eq('id', id);
      if(!error) veriCek();
  }

  const filtrelenmisSirketler = sirketler.filter(s => 
      s.company_name.toLowerCase().includes(aramaMetni.toLowerCase()) || 
      (s.contact_person && s.contact_person.toLowerCase().includes(aramaMetni.toLowerCase())) ||
      (s.reason_category && s.reason_category.toLowerCase().includes(aramaMetni.toLowerCase()))
  );

  if (yukleniyor) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      
      {/* HEADER */}
      <div className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-40 border-b-4 border-red-600">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/admin')} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition">
                <ArrowLeft size={20}/>
            </button>
            <div className="flex items-center gap-3">
              <div className="bg-red-500/20 p-2.5 rounded-xl border border-red-500/30 text-red-500">
                  <Ban className="w-6 h-6" />
              </div>
              <div>
                  <h1 className="text-xl font-black tracking-tight leading-none text-red-50">MİMLİ ŞİRKETLER</h1>
                  <p className="text-[10px] text-red-400 font-bold tracking-widest uppercase">Kırmızı Liste / Gidilmeyecekler</p>
              </div>
            </div>
          </div>
          
          <button onClick={() => setModalAcik(true)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-red-900/20">
              <Plus size={18} /> <span className="hidden sm:inline">Yeni Şirket Ekle</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        
        {/* BİLGİ VE ARAMA ÇUBUĞU */}
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-200 mb-8 flex flex-col md:flex-row gap-6 items-center justify-between">
            <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                    <AlertTriangle className="text-red-500 w-6 h-6"/>
                </div>
                <div>
                    <h2 className="font-bold text-slate-800">Dikkat!</h2>
                    <p className="text-xs text-slate-500">Bu listedeki firmalara hizmet veya servis verilmeden önce muhasebe ve yönetim onayı alınmalıdır.</p>
                </div>
            </div>

            <div className="relative w-full md:w-80 shrink-0">
                <Search className="absolute left-4 top-3.5 text-slate-400 w-5 h-5"/>
                <input 
                    type="text" 
                    placeholder="Şirket, yetkili veya sebep ara..." 
                    value={aramaMetni} 
                    onChange={e => setAramaMetni(e.target.value)} 
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400 transition"
                />
            </div>
        </div>

        {/* MİMLİ ŞİRKETLER LİSTESİ */}
        {filtrelenmisSirketler.length === 0 ? (
             <div className="bg-white p-12 rounded-3xl text-center border border-dashed border-slate-300">
                <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"><Ban className="w-10 h-10 text-slate-300" /></div>
                <h3 className="text-lg font-bold text-slate-700">Liste Boş</h3>
                <p className="text-slate-400 text-sm mt-1">Sisteme kayıtlı mimli şirket bulunmuyor veya aramanıza uyan sonuç yok.</p>
             </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtrelenmisSirketler.map((sirket) => (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={sirket.id} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 border-l-[6px] border-l-red-500 relative overflow-hidden group">
                        
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 uppercase leading-tight mb-1">{sirket.company_name}</h3>
                                <div className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-md inline-flex border border-red-100 mt-1">
                                    <AlertTriangle size={12}/> {sirket.reason_category}
                                </div>
                            </div>
                            <button onClick={() => sirketSil(sirket.id, sirket.company_name)} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-xl transition" title="Listeden Çıkar">
                                <Trash2 size={18}/>
                            </button>
                        </div>

                        <div className="space-y-2 mt-6">
                            {sirket.contact_person && (
                                <div className="flex items-center gap-3 text-sm text-slate-600">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0"><User size={14}/></div>
                                    <span className="font-medium">{sirket.contact_person}</span>
                                </div>
                            )}
                            {sirket.phone && (
                                <div className="flex items-center gap-3 text-sm text-slate-600">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0"><Phone size={14}/></div>
                                    <a href={`tel:${sirket.phone}`} className="font-mono font-medium hover:text-blue-600 transition">{sirket.phone}</a>
                                </div>
                            )}
                        </div>

                        {sirket.details && (
                            <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-700">
                                <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1"><FileText size={10}/> Notlar / Geçmiş</span>
                                <p className="whitespace-pre-line leading-relaxed">{sirket.details}</p>
                            </div>
                        )}

                        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                            <CalendarClock size={12}/> Eklenme: {new Date(sirket.created_at).toLocaleDateString('tr-TR')}
                        </div>

                    </motion.div>
                ))}
            </div>
        )}
      </div>

      {/* YENİ ŞİRKET EKLEME MODALI */}
      <AnimatePresence>
        {modalAcik && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col my-auto" onClick={e => e.stopPropagation()}>
                    
                    <div className="p-6 md:p-8 bg-red-600 text-white flex justify-between items-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10"><Ban size={100}/></div>
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="p-3 bg-white/20 rounded-2xl"><AlertTriangle size={24}/></div>
                            <div>
                                <h2 className="text-2xl font-black tracking-tight">Kara Listeye Ekle</h2>
                                <p className="text-xs text-red-200 font-bold uppercase tracking-widest mt-1">Mimli Şirket Kaydı</p>
                            </div>
                        </div>
                        <button onClick={() => setModalAcik(false)} className="text-red-200 hover:text-white bg-red-700/50 hover:bg-red-800 p-2.5 rounded-full transition relative z-10"><X size={20}/></button>
                    </div>

                    <div className="p-6 md:p-8 space-y-5 bg-slate-50">
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><Building2 size={12}/> Firma Adı <span className="text-red-500">*</span></label>
                            <input type="text" placeholder="Örn: Sorunlu Plastik A.Ş." value={yeniSirket.company_name} onChange={e => setYeniSirket({...yeniSirket, company_name: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-red-500 transition shadow-sm"/>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><User size={12}/> Muhatap Yetkili</label>
                                <input type="text" placeholder="Örn: Veli Bey" value={yeniSirket.contact_person} onChange={e => setYeniSirket({...yeniSirket, contact_person: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-red-500 transition shadow-sm"/>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><Phone size={12}/> Telefon Numarası</label>
                                <input type="text" placeholder="Örn: 05xx xxx xx xx" value={yeniSirket.phone} onChange={e => setYeniSirket({...yeniSirket, phone: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm font-mono outline-none focus:ring-2 focus:ring-red-500 transition shadow-sm"/>
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><AlertTriangle size={12}/> Kara Listeye Alınma Sebebi <span className="text-red-500">*</span></label>
                            <select value={yeniSirket.reason_category} onChange={e => setYeniSirket({...yeniSirket, reason_category: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500 transition shadow-sm cursor-pointer">
                                <option value="Ödeme Alınamıyor / Borçlu">Ödeme Alınamıyor / Borçlu</option>
                                <option value="Sürekli Sorun Çıkarıyor / Kavgalı">Sürekli Sorun Çıkarıyor / Kavgalı</option>
                                <option value="Sözleşme Feshedildi">Sözleşme Feshedildi / İptal</option>
                                <option value="Güven Vermiyor">Güven Vermiyor / Şüpheli</option>
                                <option value="Diğer">Diğer (Detaylarda belirtin)</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><FileText size={12}/> Detaylı Notlar / Tüm Geçmiş</label>
                            <textarea rows={4} placeholder="Şirketle yaşanan süreci, neden servis kesildiğini, ne kadar borcu kaldığını buraya not alabilirsin..." value={yeniSirket.details} onChange={e => setYeniSirket({...yeniSirket, details: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm resize-none outline-none focus:ring-2 focus:ring-red-500 transition shadow-sm leading-relaxed"/>
                        </div>
                    </div>

                    <div className="p-6 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
                        <button onClick={() => setModalAcik(false)} className="px-6 py-3.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition text-sm">İptal</button>
                        <button onClick={sirketKaydet} disabled={kaydediliyor} className="px-8 py-3.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition shadow-lg shadow-red-200 flex items-center gap-2 text-sm active:scale-95">
                            {kaydediliyor ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span> : <Save size={18}/>}
                            {kaydediliyor ? 'Kaydediliyor...' : 'Kara Listeye Ekle'}
                        </button>
                    </div>

                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}