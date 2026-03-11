"use client";

// ----------------------------------------------------------------------------
// BUVISAN FİLO YÖNETİM MERKEZİ 🏎️ (Akıllı Araç Takip Sistemi)
// Versiyon: 1.0 (Excel'den Dijitale Geçiş)
// ----------------------------------------------------------------------------

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Car, ShieldAlert, Wrench, Calendar, Plus, X, Edit2, Trash2, Loader2, 
  Map, Key, Radio, Disc, AlertTriangle, CheckCircle2, AlertCircle, FileText, User, Activity, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function FiloYonetimEkrani() {
  const [araclar, setAraclar] = useState<any[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [formAcik, setFormAcik] = useState(false);
  const [duzenlemeId, setDuzenlemeId] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

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

  useEffect(() => { verileriGetir(); }, []);

  const verileriGetir = async () => {
    setYukleniyor(true);
    const { data, error } = await supabase.from('fleet_vehicles').select('*').order('plate', { ascending: true });
    
    if (data) {
      setAraclar(data);
      // İstatistik Hesaplama
      let acilM = 0, acilS = 0;
      data.forEach(arac => {
          if (kalanGunHesapla(arac.inspection_date) !== null && kalanGunHesapla(arac.inspection_date)! <= 30) acilM++;
          if (kalanGunHesapla(arac.insurance_date) !== null && kalanGunHesapla(arac.insurance_date)! <= 30) acilS++;
      });
      setIstatistikler({ toplam: data.length, acilMuayene: acilM, acilSigorta: acilS });
    }
    setYukleniyor(false);
  };

  // 🔥 AKILLI TARİH HESAPLAYICI (Süresi bitenleri kırmızı yapar)
  const kalanGunHesapla = (hedefTarih: string | null) => {
    if (!hedefTarih) return null;
    const bugun = new Date();
    bugun.setHours(0,0,0,0);
    const hedef = new Date(hedefTarih);
    const farkZaman = hedef.getTime() - bugun.getTime();
    return Math.ceil(farkZaman / (1000 * 3600 * 24));
  };

  const durumRengi = (gun: number | null) => {
      if (gun === null) return 'text-slate-400 bg-slate-100 border-slate-200'; // Tarih yok
      if (gun < 0) return 'text-red-700 bg-red-100 border-red-300 animate-pulse'; // Süre geçmiş
      if (gun <= 30) return 'text-orange-700 bg-orange-100 border-orange-300'; // 1 Aydan az kalmış
      return 'text-emerald-700 bg-emerald-50 border-emerald-200'; // Sorun yok
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
          // Boş tarihleri null yap ki veritabanı hata vermesin
          insurance_date: yeniArac.insurance_date || null,
          casco_date: yeniArac.casco_date || null,
          inspection_date: yeniArac.inspection_date || null,
          route_permit_date: yeniArac.route_permit_date || null,
      };

      let error;
      if (duzenlemeId) {
          error = (await supabase.from('fleet_vehicles').update(veriPaketi).eq('id', duzenlemeId)).error;
      } else {
          error = (await supabase.from('fleet_vehicles').insert([veriPaketi])).error;
      }

      setKaydediliyor(false);
      if (error) alert("Hata: " + error.message);
      else { alert("Başarıyla Kaydedildi! 🚀"); setFormAcik(false); formSifirla(); verileriGetir(); }
  };

  const sil = async (id: string, plaka: string) => {
      if (confirm(`${plaka} plakalı aracı filodan ÇIKARMAK istediğine emin misin?`)) {
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
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">Araç Filosu Takip</h1>
                <p className="text-slate-500 text-sm font-medium">Vize, Sigorta ve Bakım Monitörü</p>
            </div>
        </div>
        <button onClick={() => { formSifirla(); setFormAcik(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-200 transition active:scale-95">
            <Plus size={20}/> Yeni Araç Ekle
        </button>
      </div>

      {/* İSTATİSTİKLER */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div><p className="text-xs font-bold text-slate-400 uppercase">Toplam Araç</p><p className="text-3xl font-black text-slate-800">{istatistikler.toplam}</p></div>
              <div className="bg-blue-50 text-blue-500 p-4 rounded-full"><Car size={24}/></div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div><p className="text-xs font-bold text-slate-400 uppercase">Acil Muayene Bekleyen</p><p className={`text-3xl font-black ${istatistikler.acilMuayene > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{istatistikler.acilMuayene}</p></div>
              <div className={`${istatistikler.acilMuayene > 0 ? 'bg-red-50 text-red-500 animate-pulse' : 'bg-emerald-50 text-emerald-500'} p-4 rounded-full`}><Wrench size={24}/></div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div><p className="text-xs font-bold text-slate-400 uppercase">Acil Sigorta Bekleyen</p><p className={`text-3xl font-black ${istatistikler.acilSigorta > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{istatistikler.acilSigorta}</p></div>
              <div className={`${istatistikler.acilSigorta > 0 ? 'bg-red-50 text-red-500 animate-pulse' : 'bg-emerald-50 text-emerald-500'} p-4 rounded-full`}><ShieldAlert size={24}/></div>
          </div>
      </div>

      {/* ARAÇ KARTLARI (GRID) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {araclar.map(arac => {
              const muayeneGun = kalanGunHesapla(arac.inspection_date);
              const sigortaGun = kalanGunHesapla(arac.insurance_date);
              const kaskoGun = kalanGunHesapla(arac.casco_date);
              const izinGun = kalanGunHesapla(arac.route_permit_date);

              return (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} key={arac.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all overflow-hidden flex flex-col relative group">
                      
                      {/* Kart Header */}
                      <div className="bg-slate-900 p-5 flex justify-between items-start relative overflow-hidden">
                          <div className="absolute -right-4 -top-4 opacity-10"><Car size={100}/></div>
                          <div className="relative z-10">
                              <div className="bg-white text-slate-900 font-black text-xl px-4 py-1.5 rounded-lg border-2 border-slate-300 shadow-sm inline-block mb-2 tracking-widest uppercase">
                                  {arac.plate}
                              </div>
                              <h3 className="text-white font-bold">{arac.vehicle_name} <span className="text-slate-400 text-sm font-normal">({arac.model_year || 'Model Yok'})</span></h3>
                              {arac.assigned_driver && <p className="text-blue-400 text-xs mt-1 flex items-center gap-1"><User size={12}/> Sorumlu: {arac.assigned_driver}</p>}
                          </div>
                          
                          {/* Aksiyon Butonları (Hover olunca çıkar) */}
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition relative z-10">
                              <button onClick={() => duzenleAc(arac)} className="p-2 bg-white/10 hover:bg-blue-500 text-white rounded-lg transition"><Edit2 size={16}/></button>
                              <button onClick={() => sil(arac.id, arac.plate)} className="p-2 bg-white/10 hover:bg-red-500 text-white rounded-lg transition"><Trash2 size={16}/></button>
                          </div>
                      </div>

                      {/* Mini Donanım Bilgileri */}
                      <div className="flex divide-x divide-slate-100 border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-500">
                          <div className="flex-1 p-2 flex justify-center items-center gap-1.5"><Radio size={12} className={arac.has_arvento ? 'text-green-500' : 'text-slate-300'}/> {arac.has_arvento ? 'Arvento Var' : 'Arvento Yok'}</div>
                          <div className="flex-1 p-2 flex justify-center items-center gap-1.5"><Key size={12} className="text-orange-400"/> {arac.spare_key}</div>
                          <div className="flex-1 p-2 flex justify-center items-center gap-1.5"><Disc size={12} className="text-slate-700"/> {arac.tire_status}</div>
                      </div>

                      {/* Kritik Tarihler */}
                      <div className="p-5 space-y-3 flex-1">
                          {/* Muayene */}
                          <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-500 flex items-center gap-2"><Wrench size={14}/> Muayene</span>
                              <div className={`text-xs font-bold px-3 py-1 rounded-full border ${durumRengi(muayeneGun)}`}>
                                  {muayeneGun === null ? 'Girilmemiş' : muayeneGun < 0 ? 'SÜRESİ GEÇTİ!' : `${muayeneGun} Gün Kaldı`}
                              </div>
                          </div>
                          {/* Sigorta */}
                          <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-500 flex items-center gap-2"><ShieldAlert size={14}/> Sigorta</span>
                              <div className={`text-xs font-bold px-3 py-1 rounded-full border ${durumRengi(sigortaGun)}`}>
                                  {sigortaGun === null ? 'Girilmemiş' : sigortaGun < 0 ? 'SÜRESİ GEÇTİ!' : `${sigortaGun} Gün Kaldı`}
                              </div>
                          </div>
                          {/* Kasko */}
                          <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-500 flex items-center gap-2"><ShieldAlert size={14} className="opacity-50"/> Kasko</span>
                              <div className={`text-xs font-bold px-3 py-1 rounded-full border ${kaskoGun === null ? 'bg-slate-100 text-slate-400 border-slate-200' : durumRengi(kaskoGun)}`}>
                                  {kaskoGun === null ? 'YOK' : kaskoGun < 0 ? 'SÜRESİ GEÇTİ!' : `${kaskoGun} Gün Kaldı`}
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

                          {/* Ekstra Bilgiler */}
                          <div className="flex justify-between items-center pt-2">
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded"><FileText size={10} className="inline mr-1"/> {arac.ad_branding}</span>
                              {arac.route_permit_date && (
                                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
                                      İzin: {new Date(arac.route_permit_date).toLocaleDateString('tr-TR')}
                                  </span>
                              )}
                          </div>
                      </div>

                  </motion.div>
              )
          })}
      </div>

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
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Zimmetli Şoför</label><input type="text" placeholder="Örn: Ahmet Bey" value={yeniArac.assigned_driver} onChange={e => setYeniArac({...yeniArac, assigned_driver: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500"/></div>

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