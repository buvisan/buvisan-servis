"use client";

// ----------------------------------------------------------------------------
// BUVISAN FİLO YÖNETİM MERKEZİ 🏎️ V2.0 
// (Tip Hataları Düzeltildi - Tam Stabil Sürüm ✔️)
// ----------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Car, ShieldAlert, Wrench, Calendar, Plus, X, Edit2, Trash2, Loader2, 
  Map, Key, Radio, Disc, AlertTriangle, CheckCircle2, FileText, FileWarning, 
  Settings, Banknote, BarChart3, UserCheck, User, Save, Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function FiloYonetimEkrani() {
  const [araclar, setAraclar] = useState<any[]>([]);
  const [tumCezalar, setTumCezalar] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  
  // MODALLAR
  const [formAcik, setFormAcik] = useState(false);
  const [sicilModaliAcik, setSicilModaliAcik] = useState(false);
  const [cezaRaporuAcik, setCezaRaporuAcik] = useState(false);

  const [duzenlemeId, setDuzenlemeId] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  // SEÇİLİ ARAÇ SİCİLİ İÇİN
  const [aktifArac, setAktifArac] = useState<any | null>(null);
  const [aktifTab, setAktifTab] = useState<'cezalar' | 'bakimlar'>('cezalar');
  const [aracCezalari, setAracCezalari] = useState<any[]>([]);
  const [aracBakimlari, setAracBakimlari] = useState<any[]>([]);

  // İstatistikler
  const [istatistikler, setIstatistikler] = useState({ toplam: 0, acilMuayene: 0, acilSigorta: 0 });

  // Yeni Kayıt Formu State'i
  const [yeniArac, setYeniArac] = useState({
    plate: '', vehicle_name: '', model_year: '', has_arvento: false,
    insurance_date: '', casco_date: '', inspection_date: '', 
    tire_status: 'Yazlık Takılı', ad_branding: 'Reklam Yok', 
    spare_key: 'Mevcut', current_km: '', next_oil_km: '', 
    route_permit_date: '', assigned_driver: ''
  });

  // Sicil Kayıt Formları
  const [yeniCeza, setYeniCeza] = useState({ driver_name: '', fine_date: '', fine_type: 'Hız İhlali', amount: '', description: '' });
  const [yeniBakim, setYeniBakim] = useState({ maintenance_date: '', maintenance_type: 'Tamir / Onarım', amount: '', description: '' });

  useEffect(() => { verileriGetir(); }, []);

  const verileriGetir = async () => {
    setYukleniyor(true);
    
    // Araçları Çek
    const { data: aracData } = await supabase.from('fleet_vehicles').select('*').order('plate', { ascending: true });
    
    // Tüm Cezaları Çek (Raporlama için)
    const { data: cezaData } = await supabase.from('fleet_fines').select('*, fleet_vehicles(plate)');
    
    if (aracData) {
      setAraclar(aracData);
      let acilM = 0, acilS = 0;
      aracData.forEach(arac => {
          if (kalanGunHesapla(arac.inspection_date) !== null && kalanGunHesapla(arac.inspection_date)! <= 30) acilM++;
          if (kalanGunHesapla(arac.insurance_date) !== null && kalanGunHesapla(arac.insurance_date)! <= 30) acilS++;
      });
      setIstatistikler({ toplam: aracData.length, acilMuayene: acilM, acilSigorta: acilS });
    }

    if (cezaData) {
        setTumCezalar(cezaData);
    }
    
    setYukleniyor(false);
  };

  // SİCİL VERİLERİNİ GETİR
  const sicilGetir = async (arac_id: string) => {
      const { data: cezalar } = await supabase.from('fleet_fines').select('*').eq('vehicle_id', arac_id).order('fine_date', { ascending: false });
      const { data: bakimlar } = await supabase.from('fleet_maintenance').select('*').eq('vehicle_id', arac_id).order('maintenance_date', { ascending: false });
      if (cezalar) setAracCezalari(cezalar);
      if (bakimlar) setAracBakimlari(bakimlar);
  };

  const sicilAc = (arac: any) => {
      setAktifArac(arac);
      setYeniCeza({ ...yeniCeza, driver_name: arac.assigned_driver || '' });
      sicilGetir(arac.id);
      setSicilModaliAcik(true);
  };

  // SİCİL KAYIT FONKSİYONLARI
  const cezaKaydet = async () => {
      if(!yeniCeza.amount || !yeniCeza.fine_date || !yeniCeza.driver_name) return alert("Sürücü, Tarih ve Tutar zorunludur!");
      const veri = { ...yeniCeza, vehicle_id: aktifArac.id, amount: Number(yeniCeza.amount) };
      const { error } = await supabase.from('fleet_fines').insert([veri]);
      if(error) alert("Hata: " + error.message);
      else { alert("Ceza işlendi."); setYeniCeza({ driver_name: aktifArac.assigned_driver || '', fine_date: '', fine_type: 'Hız İhlali', amount: '', description: '' }); sicilGetir(aktifArac.id); verileriGetir(); }
  };

  const bakimKaydet = async () => {
      if(!yeniBakim.maintenance_date || !yeniBakim.description) return alert("Tarih ve Açıklama zorunludur!");
      const veri = { ...yeniBakim, vehicle_id: aktifArac.id, amount: yeniBakim.amount ? Number(yeniBakim.amount) : 0 };
      const { error } = await supabase.from('fleet_maintenance').insert([veri]);
      if(error) alert("Hata: " + error.message);
      else { alert("İşlem kaydedildi."); setYeniBakim({ maintenance_date: '', maintenance_type: 'Tamir / Onarım', amount: '', description: '' }); sicilGetir(aktifArac.id); }
  };

  const kayitSil = async (tablo: string, id: string) => {
      if(confirm("Silmek istediğine emin misin?")) {
          await supabase.from(tablo).delete().eq('id', id);
          sicilGetir(aktifArac.id);
          verileriGetir();
      }
  };

  // ŞOFÖR CEZA LİDER TABLOSU
  const soforCezaAnalizi = () => {
      const analiz: any = {};
      tumCezalar.forEach(c => {
          const sofor = c.driver_name || 'Bilinmiyor';
          if (!analiz[sofor]) analiz[sofor] = { toplamTutar: 0, cezaSayisi: 0, detaylar: [] };
          analiz[sofor].toplamTutar += Number(c.amount);
          analiz[sofor].cezaSayisi += 1;
          analiz[sofor].detaylar.push(c);
      });
      return Object.keys(analiz).map(isim => ({ isim, ...analiz[isim] })).sort((a, b) => b.toplamTutar - a.toplamTutar);
  };

  // AKILLI TARİH HESAPLAYICI
  const kalanGunHesapla = (hedefTarih: string | null) => {
    if (!hedefTarih) return null;
    const bugun = new Date(); bugun.setHours(0,0,0,0);
    const hedef = new Date(hedefTarih);
    return Math.ceil((hedef.getTime() - bugun.getTime()) / (1000 * 3600 * 24));
  };

  const durumRengi = (gun: number | null) => {
      if (gun === null) return 'text-slate-400 bg-slate-100 border-slate-200'; 
      if (gun < 0) return 'text-red-700 bg-red-100 border-red-300 animate-pulse'; 
      if (gun <= 30) return 'text-orange-700 bg-orange-100 border-orange-300'; 
      return 'text-emerald-700 bg-emerald-50 border-emerald-200'; 
  };

  const formSifirla = () => {
      setYeniArac({ plate: '', vehicle_name: '', model_year: '', has_arvento: false, insurance_date: '', casco_date: '', inspection_date: '', tire_status: 'Yazlık Takılı', ad_branding: 'Reklam Yok', spare_key: 'Mevcut', current_km: '', next_oil_km: '', route_permit_date: '', assigned_driver: '' });
      setDuzenlemeId(null);
  };

  const duzenleAc = (arac: any) => {
      setYeniArac({ ...arac, current_km: arac.current_km || '', next_oil_km: arac.next_oil_km || '' });
      setDuzenlemeId(arac.id);
      setFormAcik(true);
  };

  const kaydetVeyaGuncelle = async () => {
      if (!yeniArac.plate || !yeniArac.vehicle_name) return alert("Plaka ve Araç Adı zorunludur!");
      setKaydediliyor(true);

      const veriPaketi = {
          ...yeniArac,
          current_km: yeniArac.current_km ? Number(yeniArac.current_km) : 0,
          next_oil_km: yeniArac.next_oil_km ? Number(yeniArac.next_oil_km) : 0,
          insurance_date: yeniArac.insurance_date || null, casco_date: yeniArac.casco_date || null, inspection_date: yeniArac.inspection_date || null, route_permit_date: yeniArac.route_permit_date || null,
      };

      let error;
      if (duzenlemeId) error = (await supabase.from('fleet_vehicles').update(veriPaketi).eq('id', duzenlemeId)).error;
      else error = (await supabase.from('fleet_vehicles').insert([veriPaketi])).error;

      setKaydediliyor(false);
      if (error) alert("Hata: " + error.message);
      else { alert("Başarıyla Kaydedildi! 🚀"); setFormAcik(false); formSifirla(); verileriGetir(); }
  };

  const sil = async (id: string, plaka: string) => {
      if (confirm(`${plaka} plakalı aracı ve TÜM GEÇMİŞİNİ (Cezalar, Bakımlar) silmek istediğine emin misin?`)) {
          await supabase.from('fleet_vehicles').delete().eq('id', id);
          verileriGetir();
      }
  };

  if (yukleniyor) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-blue-600 w-12 h-12"/></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans pb-24">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
            <div className="bg-slate-900 p-3 rounded-2xl text-white shadow-lg"><Car size={28}/></div>
            <div>
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">Araç Filosu & Sicil</h1>
                <p className="text-slate-500 text-sm font-medium">Vize, Ceza, Lastik ve Bakım Merkezi</p>
            </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => setCezaRaporuAcik(true)} className="flex-1 md:flex-none bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-5 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition active:scale-95">
                <BarChart3 size={20}/> Şoför Ceza Analizi
            </button>
            <button onClick={() => { formSifirla(); setFormAcik(true); }} className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition active:scale-95">
                <Plus size={20}/> Yeni Araç Ekle
            </button>
        </div>
      </div>

      {/* İSTATİSTİKLER */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
              <p className="text-xs font-bold text-slate-400 uppercase">Toplam Araç</p><p className="text-3xl font-black text-slate-800 mt-1">{istatistikler.toplam}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
              <p className="text-xs font-bold text-slate-400 uppercase">Acil Muayene Bekleyen</p><p className={`text-3xl font-black mt-1 ${istatistikler.acilMuayene > 0 ? 'text-red-600 animate-pulse' : 'text-emerald-600'}`}>{istatistikler.acilMuayene}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
              <p className="text-xs font-bold text-slate-400 uppercase">Acil Sigorta Bekleyen</p><p className={`text-3xl font-black mt-1 ${istatistikler.acilSigorta > 0 ? 'text-red-600 animate-pulse' : 'text-emerald-600'}`}>{istatistikler.acilSigorta}</p>
          </div>
          <div className="bg-gradient-to-br from-red-500 to-red-700 p-5 rounded-2xl shadow-md text-white flex flex-col justify-center">
              <p className="text-xs font-bold text-red-200 uppercase">Toplam Kesilen Ceza</p><p className="text-3xl font-black mt-1">{tumCezalar.reduce((a, b) => a + Number(b.amount), 0).toLocaleString()} ₺</p>
          </div>
      </div>

      {/* ARAÇ KARTLARI (GRID) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {araclar.map(arac => {
              const muayeneGun = kalanGunHesapla(arac.inspection_date);
              const sigortaGun = kalanGunHesapla(arac.insurance_date);
              const kaskoGun = kalanGunHesapla(arac.casco_date);
              const izinGun = kalanGunHesapla(arac.route_permit_date);

              // 🔥 İŞTE BURADAKİ ETİKET DÜZELTİLDİ (motion.div) 🔥
              return (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} key={arac.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all overflow-hidden flex flex-col relative group">
                      
                      {/* Kart Header */}
                      <div className="bg-slate-900 p-5 flex justify-between items-start relative overflow-hidden">
                          <div className="absolute -right-4 -top-4 opacity-10"><Car size={100}/></div>
                          <div className="relative z-10 w-full">
                              <div className="flex justify-between w-full items-start">
                                  <div className="bg-white text-slate-900 font-black text-xl px-4 py-1.5 rounded-lg border-2 border-slate-300 shadow-sm inline-block mb-2 tracking-widest uppercase">
                                      {arac.plate}
                                  </div>
                                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                                      <button onClick={() => duzenleAc(arac)} className="p-1.5 bg-white/10 hover:bg-blue-500 text-white rounded-lg transition"><Edit2 size={14}/></button>
                                      <button onClick={() => sil(arac.id, arac.plate)} className="p-1.5 bg-white/10 hover:bg-red-500 text-white rounded-lg transition"><Trash2 size={14}/></button>
                                  </div>
                              </div>
                              <h3 className="text-white font-bold">{arac.vehicle_name} <span className="text-slate-400 text-sm font-normal">({arac.model_year || 'Model Yok'})</span></h3>
                              {arac.assigned_driver && <p className="text-blue-400 text-xs mt-1 flex items-center gap-1"><User size={12}/> Şoför / Sorumlu: {arac.assigned_driver}</p>}
                          </div>
                      </div>

                      {/* Mini Donanım Bilgileri */}
                      <div className="flex divide-x divide-slate-100 border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-500">
                          <div className="flex-1 p-2 flex justify-center items-center gap-1.5"><Radio size={12} className={arac.has_arvento ? 'text-green-500' : 'text-slate-300'}/> {arac.has_arvento ? 'Arvento Var' : 'Arvento Yok'}</div>
                          <div className="flex-1 p-2 flex justify-center items-center gap-1.5"><Key size={12} className="text-orange-400"/> {arac.spare_key}</div>
                          <div className="flex-1 p-2 flex justify-center items-center gap-1.5"><Disc size={12} className="text-slate-700"/> {arac.tire_status}</div>
                      </div>

                      {/* Kritik Tarihler */}
                      <div className="p-5 space-y-3 flex-1 pb-20 relative">
                          <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-500 flex items-center gap-2"><Wrench size={14}/> Muayene</span>
                              <div className={`text-xs font-bold px-3 py-1 rounded-full border ${durumRengi(muayeneGun)}`}>
                                  {muayeneGun === null ? 'Girilmemiş' : muayeneGun < 0 ? 'SÜRESİ GEÇTİ!' : muayeneGun + ' Gün Kaldı'}
                              </div>
                          </div>
                          <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-500 flex items-center gap-2"><ShieldAlert size={14}/> Sigorta</span>
                              <div className={`text-xs font-bold px-3 py-1 rounded-full border ${durumRengi(sigortaGun)}`}>
                                  {sigortaGun === null ? 'Girilmemiş' : sigortaGun < 0 ? 'SÜRESİ GEÇTİ!' : sigortaGun + ' Gün Kaldı'}
                              </div>
                          </div>
                          <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-500 flex items-center gap-2"><ShieldAlert size={14} className="opacity-50"/> Kasko</span>
                              <div className={`text-xs font-bold px-3 py-1 rounded-full border ${kaskoGun === null ? 'bg-slate-100 text-slate-400 border-slate-200' : durumRengi(kaskoGun)}`}>
                                  {kaskoGun === null ? 'YOK' : kaskoGun < 0 ? 'SÜRESİ GEÇTİ!' : kaskoGun + ' Gün Kaldı'}
                              </div>
                          </div>
                          
                          <div className="h-px w-full bg-slate-100 my-2"></div>

                          {/* KM ve Bakım */}
                          <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 flex justify-between items-center">
                              <div>
                                  <p className="text-[10px] text-blue-500 font-bold uppercase">Güncel / Bakım KM</p>
                                  <p className="text-sm font-black text-blue-800">{Number(arac.current_km).toLocaleString()} <span className="text-blue-300">/</span> {Number(arac.next_oil_km).toLocaleString()}</p>
                              </div>
                              <div className="bg-white p-2 rounded-lg shadow-sm">
                                  {Number(arac.current_km) > 0 && Number(arac.current_km) >= Number(arac.next_oil_km) 
                                      ? <AlertTriangle size={20} className="text-red-500 animate-pulse"/> 
                                      : <CheckCircle2 size={20} className="text-emerald-500"/>}
                              </div>
                          </div>
                          
                          {/* SİCİL BUTONU (ALT KISIMDA SABİT) */}
                          <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-white via-white to-transparent">
                              <button onClick={() => sicilAc(arac)} className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition shadow-lg">
                                  <FileWarning size={16}/> Araç Sicili & Geçmişi
                              </button>
                          </div>
                      </div>

                  </motion.div>
              )
          })}
      </div>

      {/* =========================================================================
          🔥 MODAL: ARAÇ SİCİLİ VE GEÇMİŞİ (CEZALAR / BAKIMLAR)
          ========================================================================= */}
      <AnimatePresence>
        {sicilModaliAcik && aktifArac && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto" onClick={() => setSicilModaliAcik(false)}>
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-slate-50 w-full max-w-4xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
                    
                    {/* Header */}
                    <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                        <div>
                            <div className="flex items-center gap-3">
                                <span className="bg-white text-slate-900 font-black px-3 py-1 rounded-lg text-lg tracking-widest">{aktifArac.plate}</span>
                                <h2 className="text-xl font-bold text-slate-200">{aktifArac.vehicle_name}</h2>
                            </div>
                            <p className="text-slate-400 text-xs mt-2 uppercase tracking-widest flex items-center gap-1"><User size={12}/> Şoför: {aktifArac.assigned_driver || 'Atanmamış'}</p>
                        </div>
                        <button onClick={() => setSicilModaliAcik(false)} className="bg-slate-800 hover:bg-red-500 p-2 rounded-full transition"><X size={20}/></button>
                    </div>

                    {/* Tab Menüsü */}
                    <div className="flex bg-white border-b border-slate-200 shrink-0">
                        <button onClick={() => setAktifTab('cezalar')} className={`flex-1 py-4 font-bold text-sm flex items-center justify-center gap-2 transition border-b-2 ${aktifTab === 'cezalar' ? 'border-red-500 text-red-600 bg-red-50/50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}>
                            <FileWarning size={18}/> Ceza ve İhlaller ({aracCezalari.length})
                        </button>
                        <button onClick={() => setAktifTab('bakimlar')} className={`flex-1 py-4 font-bold text-sm flex items-center justify-center gap-2 transition border-b-2 ${aktifTab === 'bakimlar' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}>
                            <Settings size={18}/> Tamir & Lastik Değişimi ({aracBakimlari.length})
                        </button>
                    </div>

                    {/* İÇERİK ALANI */}
                    <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
                        
                        {/* 🔴 CEZALAR TABI */}
                        {aktifTab === 'cezalar' && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Ceza Ekleme Formu */}
                                <div className="md:col-span-1 bg-white p-5 rounded-2xl border border-red-100 shadow-sm space-y-4 h-fit">
                                    <h3 className="font-bold text-red-600 text-sm flex items-center gap-2 border-b border-red-50 pb-2"><Plus size={16}/> Yeni Ceza Ekle</h3>
                                    <div><label className="text-[10px] font-bold text-slate-500 uppercase">Tarih</label><input type="date" value={yeniCeza.fine_date} onChange={e => setYeniCeza({...yeniCeza, fine_date: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-red-400"/></div>
                                    <div><label className="text-[10px] font-bold text-slate-500 uppercase">Zimmetli Şoför</label><input type="text" placeholder="Kimin üzerine?" value={yeniCeza.driver_name} onChange={e => setYeniCeza({...yeniCeza, driver_name: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-red-400"/></div>
                                    <div><label className="text-[10px] font-bold text-slate-500 uppercase">Ceza Türü</label><select value={yeniCeza.fine_type} onChange={e => setYeniCeza({...yeniCeza, fine_type: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-red-400"><option>Hız İhlali (Radar)</option><option>Hatalı Park</option><option>Kırmızı Işık</option><option>Trafik Kazası (Kusurlu)</option><option>Diğer</option></select></div>
                                    <div className="relative"><label className="text-[10px] font-bold text-slate-500 uppercase">Tutar (₺)</label><input type="number" placeholder="0" value={yeniCeza.amount} onChange={e => setYeniCeza({...yeniCeza, amount: e.target.value})} className="w-full p-2.5 pl-8 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black text-red-600 outline-none focus:border-red-400"/><span className="absolute left-3 top-[26px] text-slate-400 text-sm">₺</span></div>
                                    <div><label className="text-[10px] font-bold text-slate-500 uppercase">Açıklama</label><textarea rows={2} placeholder="Nerede yemiş?" value={yeniCeza.description} onChange={e => setYeniCeza({...yeniCeza, description: e.target.value})} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs resize-none outline-none focus:border-red-400"/></div>
                                    <button onClick={cezaKaydet} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-red-200 transition text-sm">Sicile İşle</button>
                                </div>
                                
                                {/* Ceza Geçmişi Listesi */}
                                <div className="md:col-span-2 space-y-3">
                                    {aracCezalari.length === 0 ? (
                                        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-400 flex flex-col items-center"><CheckCircle2 size={48} className="text-emerald-400 mb-2 opacity-50"/><p className="font-bold">Bu araca ait ceza kaydı bulunmuyor.</p></div>
                                    ) : (
                                        aracCezalari.map(ceza => (
                                            <div key={ceza.id} className="bg-white p-4 rounded-2xl border border-red-100 shadow-sm flex items-center justify-between">
                                                <div className="flex gap-4 items-center">
                                                    <div className="bg-red-50 text-red-500 p-3 rounded-xl"><FileWarning size={20}/></div>
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">{ceza.fine_type} <span className="bg-slate-100 text-slate-500 text-[9px] px-2 py-0.5 rounded-full">{new Date(ceza.fine_date).toLocaleDateString('tr-TR')}</span></h4>
                                                        <p className="text-xs text-slate-500 mt-0.5"><User size={12} className="inline mr-1"/>{ceza.driver_name} {ceza.description && <span className="text-slate-400 ml-2">- {ceza.description}</span>}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="font-black text-red-600">{Number(ceza.amount).toLocaleString()} ₺</span>
                                                    <button onClick={() => kayitSil('fleet_fines', ceza.id)} className="text-slate-300 hover:text-red-500 transition"><Trash2 size={16}/></button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 🔵 BAKIMLAR TABI */}
                        {aktifTab === 'bakimlar' && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Bakım Ekleme Formu */}
                                <div className="md:col-span-1 bg-white p-5 rounded-2xl border border-blue-100 shadow-sm space-y-4 h-fit">
                                    <h3 className="font-bold text-blue-600 text-sm flex items-center gap-2 border-b border-blue-50 pb-2"><Plus size={16}/> Yeni İşlem Ekle</h3>
                                    <div><label className="text-[10px] font-bold text-slate-500 uppercase">Tarih</label><input type="date" value={yeniBakim.maintenance_date} onChange={e => setYeniBakim({...yeniBakim, maintenance_date: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-blue-400"/></div>
                                    <div><label className="text-[10px] font-bold text-slate-500 uppercase">İşlem Türü</label><select value={yeniBakim.maintenance_type} onChange={e => setYeniBakim({...yeniBakim, maintenance_type: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400"><option>Tamir / Onarım</option><option>Lastik Değişimi</option><option>Periyodik Bakım (Yağ vs)</option><option>Kaza / Hasar</option></select></div>
                                    <div className="relative"><label className="text-[10px] font-bold text-slate-500 uppercase">Maliyet (₺)</label><input type="number" placeholder="0" value={yeniBakim.amount} onChange={e => setYeniBakim({...yeniBakim, amount: e.target.value})} className="w-full p-2.5 pl-8 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black text-blue-600 outline-none focus:border-blue-400"/><span className="absolute left-3 top-[26px] text-slate-400 text-sm">₺</span></div>
                                    <div><label className="text-[10px] font-bold text-slate-500 uppercase">Yapılan İşlem Detayı</label><textarea rows={3} placeholder="Balatalar değişti, 4 adet kışlık takıldı..." value={yeniBakim.description} onChange={e => setYeniBakim({...yeniBakim, description: e.target.value})} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs resize-none outline-none focus:border-blue-400"/></div>
                                    <button onClick={bakimKaydet} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 transition text-sm">Arşive Ekle</button>
                                </div>
                                
                                {/* Bakım Geçmişi Listesi */}
                                <div className="md:col-span-2 space-y-3">
                                    {aracBakimlari.length === 0 ? (
                                        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-400 flex flex-col items-center"><Settings size={48} className="text-blue-200 mb-2 opacity-50"/><p className="font-bold">Bu araca ait geçmiş işlem bulunmuyor.</p></div>
                                    ) : (
                                        aracBakimlari.map(bakim => (
                                            <div key={bakim.id} className="bg-white p-4 rounded-2xl border border-blue-100 shadow-sm flex items-center justify-between">
                                                <div className="flex gap-4 items-center">
                                                    <div className="bg-blue-50 text-blue-500 p-3 rounded-xl"><Wrench size={20}/></div>
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">{bakim.maintenance_type} <span className="bg-slate-100 text-slate-500 text-[9px] px-2 py-0.5 rounded-full">{new Date(bakim.maintenance_date).toLocaleDateString('tr-TR')}</span></h4>
                                                        <p className="text-xs text-slate-500 mt-0.5 max-w-sm">{bakim.description}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="font-black text-slate-700">{Number(bakim.amount).toLocaleString()} ₺</span>
                                                    <button onClick={() => kayitSil('fleet_maintenance', bakim.id)} className="text-slate-300 hover:text-red-500 transition"><Trash2 size={16}/></button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* =========================================================================
          🔥 MODAL: ŞOFÖR CEZA RAPORU (LİDERLİK TABLOSU) 🔥
          ========================================================================= */}
      <AnimatePresence>
        {cezaRaporuAcik && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setCezaRaporuAcik(false)}>
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                    
                    <div className="p-6 bg-gradient-to-r from-red-600 to-red-800 text-white flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 p-3 rounded-xl"><BarChart3 size={24}/></div>
                            <div>
                                <h2 className="text-2xl font-black">Şoför Ceza Analizi</h2>
                                <p className="text-red-200 text-xs font-bold uppercase tracking-widest">En Çok Ceza Yiyen Personeller</p>
                            </div>
                        </div>
                        <button onClick={() => setCezaRaporuAcik(false)} className="bg-black/20 hover:bg-black/40 p-2 rounded-full transition"><X size={20}/></button>
                    </div>

                    <div className="p-6 overflow-y-auto max-h-[60vh] bg-slate-50">
                        {tumCezalar.length === 0 ? (
                            <div className="text-center py-10 text-slate-400 font-bold">Sistemde hiç ceza kaydı yok. Harika!</div>
                        ) : (
                            <div className="space-y-4">
                                {soforCezaAnalizi().map((sofor: any, index: number) => (
                                    <div key={index} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between relative overflow-hidden">
                                        <div className={`absolute left-0 top-0 bottom-0 w-2 ${index === 0 ? 'bg-red-500' : index === 1 ? 'bg-orange-400' : 'bg-slate-300'}`}></div>
                                        
                                        <div className="flex items-center gap-4 pl-4">
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-lg ${index === 0 ? 'bg-red-100 text-red-600' : index === 1 ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>
                                                #{index + 1}
                                            </div>
                                            <div>
                                                <h3 className="font-black text-slate-800 text-lg">{sofor.isim}</h3>
                                                <p className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded inline-block mt-1">{sofor.cezaSayisi} Adet İhlal</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Toplam Maliyet</p>
                                            <div className="text-2xl font-black text-red-600">{sofor.toplamTutar.toLocaleString()} ₺</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* =========================================================================
          🔥 MODAL: YENİ ARAÇ / DÜZENLEME FORMU
          ========================================================================= */}
      <AnimatePresence>
        {formAcik && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto" onClick={() => setFormAcik(false)}>
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-4xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col my-auto" onClick={e => e.stopPropagation()}>
                    
                    <div className="p-6 md:p-8 bg-slate-900 text-white flex justify-between items-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5"><Car size={100}/></div>
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="p-3 bg-blue-500/20 rounded-2xl text-blue-400 border border-blue-500/30">{duzenlemeId ? <Edit2 size={24}/> : <Plus size={24}/>}</div>
                            <div><h2 className="text-2xl font-black">{duzenlemeId ? 'Araç Bilgilerini Güncelle' : 'Filoya Yeni Araç Ekle'}</h2></div>
                        </div>
                        <button onClick={() => setFormAcik(false)} className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full transition relative z-10"><X size={20}/></button>
                    </div>

                    <div className="p-6 md:p-8 bg-slate-50 grid grid-cols-1 md:grid-cols-2 gap-8 max-h-[70vh] overflow-y-auto">
                        
                        {/* SOL KOLON - KİMLİK & DURUM */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-black text-slate-800 border-b pb-2 mb-4 flex items-center gap-2"><Car size={16}/> Araç Kimliği</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Plaka *</label><input type="text" placeholder="16 ZM 685" value={yeniArac.plate} onChange={e => setYeniArac({...yeniArac, plate: e.target.value.toUpperCase()})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 uppercase outline-none focus:border-blue-500"/></div>
                                <div><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Model Yılı</label><input type="text" placeholder="2022" value={yeniArac.model_year} onChange={e => setYeniArac({...yeniArac, model_year: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500"/></div>
                            </div>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Araç Adı (Marka/Model) *</label><input type="text" placeholder="FORD RANGER YENİ" value={yeniArac.vehicle_name} onChange={e => setYeniArac({...yeniArac, vehicle_name: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500"/></div>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Zimmetli Şoför / Sorumlu</label><input type="text" placeholder="Örn: Ahmet Bey" value={yeniArac.assigned_driver} onChange={e => setYeniArac({...yeniArac, assigned_driver: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500"/></div>

                            <div className="h-4"></div>
                            <h3 className="text-sm font-black text-slate-800 border-b pb-2 mb-4 flex items-center gap-2"><Wrench size={16}/> Donanım & Aksesuar</h3>
                            
                            <label className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition">
                                <input type="checkbox" checked={yeniArac.has_arvento} onChange={e => setYeniArac({...yeniArac, has_arvento: e.target.checked})} className="w-5 h-5 accent-blue-600 rounded"/>
                                <span className="font-bold text-sm text-slate-700">Arvento Takip Cihazı Var</span>
                            </label>

                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Lastik Durumu</label><select value={yeniArac.tire_status} onChange={e => setYeniArac({...yeniArac, tire_status: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500"><option>Yazlık Takılı</option><option>Kışlık Takılı</option><option>Dört Mevsim</option></select></div>
                                <div><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Yedek Anahtar</label><input type="text" placeholder="Mevcut / Zeki Beyde" value={yeniArac.spare_key} onChange={e => setYeniArac({...yeniArac, spare_key: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500"/></div>
                            </div>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Araç Reklam</label><select value={yeniArac.ad_branding} onChange={e => setYeniArac({...yeniArac, ad_branding: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500"><option>Reklam Yok</option><option>Ruhsata İşli</option><option>İşli Değil</option></select></div>
                        </div>

                        {/* SAĞ KOLON - TARİHLER VE KM */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-black text-slate-800 border-b pb-2 mb-4 flex items-center gap-2"><Calendar size={16}/> Kritik Tarihler (Bitiş)</h3>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase ml-1 text-red-500">Muayene Bitiş Tarihi</label><input type="date" value={yeniArac.inspection_date} onChange={e => setYeniArac({...yeniArac, inspection_date: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-red-400"/></div>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase ml-1 text-orange-500">Sigorta Bitiş Tarihi</label><input type="date" value={yeniArac.insurance_date} onChange={e => setYeniArac({...yeniArac, insurance_date: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-orange-400"/></div>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Kasko Bitiş Tarihi (Yoksa Boş Bırak)</label><input type="date" value={yeniArac.casco_date} onChange={e => setYeniArac({...yeniArac, casco_date: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500"/></div>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Güzergah İzin Bitiş Tarihi</label><input type="date" value={yeniArac.route_permit_date} onChange={e => setYeniArac({...yeniArac, route_permit_date: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500"/></div>

                            <div className="h-4"></div>
                            <h3 className="text-sm font-black text-slate-800 border-b pb-2 mb-4 flex items-center gap-2"><Activity size={16}/> Yağ Bakım & KM Takibi</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="relative"><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Şu Anki KM</label><input type="number" placeholder="Örn: 71750" value={yeniArac.current_km} onChange={e => setYeniArac({...yeniArac, current_km: e.target.value})} className="w-full p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm font-black text-blue-800 outline-none focus:border-blue-500"/></div>
                                <div className="relative"><label className="text-[10px] font-bold text-slate-500 uppercase ml-1 text-emerald-600">Bakım Yapılacak KM</label><input type="number" placeholder="Örn: 81750" value={yeniArac.next_oil_km} onChange={e => setYeniArac({...yeniArac, next_oil_km: e.target.value})} className="w-full p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-black text-emerald-800 outline-none focus:border-emerald-500"/></div>
                            </div>
                        </div>

                    </div>

                    <div className="p-6 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
                        <button onClick={() => setFormAcik(false)} className="px-6 py-3.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition text-sm">Vazgeç</button>
                        <button onClick={kaydetVeyaGuncelle} disabled={kaydediliyor} className="px-8 py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-200 flex items-center gap-2 text-sm active:scale-95">
                            {kaydediliyor ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>}
                            {kaydediliyor ? 'Kaydediliyor...' : duzenlemeId ? 'Değişiklikleri Kaydet' : 'Sisteme Ekle'}
                        </button>
                    </div>

                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}