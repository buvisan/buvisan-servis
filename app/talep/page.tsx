"use client";

// ----------------------------------------------------------------------------
// BUVISAN MÜŞTERİ ARIZA BİLDİRİM PORTALI 🚀
// Müşterilerin WhatsApp'tan tıklayıp kendi arızalarını gireceği sayfa.
// ----------------------------------------------------------------------------

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Building2, User, Phone, MapPin, Settings, AlertTriangle, 
  AlertCircle, Send, Loader2, CheckCircle2, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ArizaBildirimEkrani() {
  const [form, setForm] = useState({
      firma_adi: '',
      yetkili: '',
      telefon: '',
      adres: '',
      vinc_bilgisi: '',
      aciliyet: 'Normal', // Normal, Kritik (Makine Durdu)
      sorun: ''
  });

  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [basarili, setBasarili] = useState(false);

  const talebiGonder = async () => {
      // Basit doğrulama
      if (!form.firma_adi || !form.telefon || !form.sorun) {
          alert("Lütfen Firma Adı, Telefon ve Arıza Detayı alanlarını doldurunuz.");
          return;
      }

      setGonderiliyor(true);

      // Admin panelindeki sisteme (service_tickets) doğrudan kayıt atıyoruz
      const { error } = await supabase.from('service_tickets').insert([
          {
              description: form.sorun,
              status: 'bekliyor',
              manual_customer_name: form.firma_adi,
              manual_customer_rep: form.yetkili,
              manual_phone: form.telefon,
              manual_location: form.adres,
              manual_crane_info: form.vinc_bilgisi,
              priority: form.aciliyet
          }
      ]);

      setGonderiliyor(false);

      if (error) {
          alert("Gönderim sırasında bir hata oluştu: " + error.message);
      } else {
          setBasarili(true);
      }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center py-10 px-4 font-sans selection:bg-blue-200">
      
      {/* Logo ve Başlık Alanı */}
      <div className="w-full max-w-md mb-6 text-center">
          <div className="w-20 h-20 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-blue-500/30 mb-4">
             <Settings size={40} className="text-white animate-[spin_10s_linear_infinite]" />
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">BUVİSAN</h1>
          <p className="text-sm font-bold text-blue-600 uppercase tracking-widest mt-1">Teknik Servis Talep Formu</p>
      </div>

      {/* Form Alanı */}
      <div className="w-full max-w-md bg-white rounded-[32px] shadow-xl border border-slate-200 overflow-hidden relative">
          
          <AnimatePresence mode="wait">
              {!basarili ? (
                  <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-6 sm:p-8 space-y-5">
                      
                      <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex gap-3 text-blue-800 text-xs font-medium leading-relaxed mb-6">
                          <Info size={24} className="text-blue-500 shrink-0" />
                          <p>Mümkün olan en kısa sürede size yardımcı olabilmemiz için lütfen aşağıdaki bilgileri eksiksiz doldurunuz.</p>
                      </div>

                      {/* Firma Bilgileri */}
                      <div className="space-y-4">
                          <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><Building2 size={14}/> Firma Adınız <span className="text-red-500">*</span></label>
                              <input type="text" placeholder="Firmanızın tam adı" value={form.firma_adi} onChange={e => setForm({...form, firma_adi: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition"/>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                              <div>
                                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><User size={14}/> Yetkili Kişi</label>
                                  <input type="text" placeholder="Ad Soyad" value={form.yetkili} onChange={e => setForm({...form, yetkili: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition"/>
                              </div>
                              <div>
                                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><Phone size={14}/> Telefon <span className="text-red-500">*</span></label>
                                  <input type="tel" placeholder="05XX XXX XX XX" value={form.telefon} onChange={e => setForm({...form, telefon: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500 transition"/>
                              </div>
                          </div>
                          <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><MapPin size={14}/> Açık Adresiniz</label>
                              <input type="text" placeholder="İl, ilçe, mahalle, sokak..." value={form.adres} onChange={e => setForm({...form, adres: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition"/>
                          </div>
                      </div>

                      <div className="h-px w-full bg-slate-100 my-2"></div>

                      {/* Makine ve Arıza Detayları */}
                      <div className="space-y-4">
                          <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><Settings size={14}/> Makine / Vinç Bilgisi</label>
                              <input type="text" placeholder="Örn: 10 Ton Tavan Vinci" value={form.vinc_bilgisi} onChange={e => setForm({...form, vinc_bilgisi: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition"/>
                          </div>
                          
                          <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><AlertTriangle size={14}/> Arıza Aciliyet Durumu</label>
                              <div className="grid grid-cols-2 gap-3">
                                  <button onClick={() => setForm({...form, aciliyet: 'Normal'})} className={`p-4 rounded-2xl border-2 text-sm font-bold transition-all flex flex-col items-center gap-2 ${form.aciliyet === 'Normal' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>
                                      <div className={`w-3 h-3 rounded-full ${form.aciliyet === 'Normal' ? 'bg-blue-500' : 'bg-slate-300'}`}></div>
                                      Normal (Sıraya Alınsın)
                                  </button>
                                  <button onClick={() => setForm({...form, aciliyet: 'Kritik (Makine Durdu)'})} className={`p-4 rounded-2xl border-2 text-sm font-bold transition-all flex flex-col items-center gap-2 text-center ${form.aciliyet === 'Kritik (Makine Durdu)' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>
                                      <div className={`w-3 h-3 rounded-full ${form.aciliyet === 'Kritik (Makine Durdu)' ? 'bg-red-500 animate-ping absolute' : 'bg-slate-300'}`}></div>
                                      <div className={`w-3 h-3 rounded-full relative z-10 ${form.aciliyet === 'Kritik (Makine Durdu)' ? 'bg-red-500' : 'bg-slate-300'}`}></div>
                                      KRİTİK (Makine Durdu)
                                  </button>
                              </div>
                          </div>

                          <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-1.5 ml-1"><AlertCircle size={14}/> Arıza Detayı <span className="text-red-500">*</span></label>
                              <textarea rows={4} placeholder="Lütfen yaşadığınız sorunu detaylı bir şekilde açıklayınız..." value={form.sorun} onChange={e => setForm({...form, sorun: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500 transition leading-relaxed"/>
                          </div>
                      </div>

                      <button onClick={talebiGonder} disabled={gonderiliyor} className="w-full mt-4 py-5 bg-blue-600 hover:bg-blue-700 text-white font-black text-lg rounded-2xl shadow-xl shadow-blue-600/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70 disabled:active:scale-100">
                          {gonderiliyor ? <Loader2 size={24} className="animate-spin"/> : <Send size={24}/>}
                          {gonderiliyor ? 'Gönderiliyor...' : 'SERVİS TALEBİ OLUŞTUR'}
                      </button>

                  </motion.div>
              ) : (
                  <motion.div key="success" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="p-10 text-center flex flex-col items-center justify-center min-h-[400px]">
                      <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                          <CheckCircle2 size={50} className="text-emerald-500" />
                      </div>
                      <h2 className="text-2xl font-black text-slate-800 mb-2">Talebiniz Alındı!</h2>
                      <p className="text-slate-500 leading-relaxed mb-8">Arıza bildiriminiz teknik servis merkezimize başarıyla iletildi. Ekiplerimiz en kısa sürede sizinle iletişime geçecektir.</p>
                      <button onClick={() => window.location.reload()} className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition text-sm">
                          Yeni Talep Oluştur
                      </button>
                  </motion.div>
              )}
          </AnimatePresence>
      </div>
      
      <p className="text-slate-400 text-xs font-medium mt-8">© {new Date().getFullYear()} Buvisan Teknik Servis Altyapısı</p>
    </div>
  );
}