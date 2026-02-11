"use client";

// ----------------------------------------------------------------------------
// BUVISAN PRO-FIELD V3.0 | SAHA PERSONEL SÜPER UYGULAMASI 👷‍♂️📱
// Alt Navigasyonlu, Stok Kontrollü, Vinç Sorgulamalı
// ----------------------------------------------------------------------------

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LogOut, MapPin, Clock, Camera, Wrench, CheckCircle2, Play, 
  Package, Plus, X, User, Globe, Search, History, Home, 
  Box, FileText, ChevronRight, BarChart3
} from 'lucide-react';

export default function PersonelApp() {
  const router = useRouter();
  
  // --- STATE ---
  const [yukleniyor, setYukleniyor] = useState(true);
  const [oturum, setOturum] = useState<any>(null);
  const [aktifSekme, setAktifSekme] = useState<'gorevler' | 'stok' | 'gecmis' | 'profil'>('gorevler');

  // VERİLER
  const [gorevler, setGorevler] = useState<any[]>([]);
  const [stok, setStok] = useState<any[]>([]);
  
  // GÖREV YÖNETİMİ
  const [aktifGorev, setAktifGorev] = useState<any | null>(null);
  const [islemSuresi, setIslemSuresi] = useState(0);
  const timerRef = useRef<any>(null);
  const [kullanilanMalzemeler, setKullanilanMalzemeler] = useState<any[]>([]);
  const [yapilanIslemAciklamasi, setYapilanIslemAciklamasi] = useState("");
  const [malzemeModalAcik, setMalzemeModalAcik] = useState(false);

  // VİNÇ SORGULAMA (GEÇMİŞ)
  const [vincArama, setVincArama] = useState("");
  const [bulunanVincler, setBulunanVincler] = useState<any[]>([]);
  const [seciliVincGecmisi, setSeciliVincGecmisi] = useState<any[]>([]);

  // STOK ARAMA
  const [stokArama, setStokArama] = useState("");

  // --- 1. BAŞLAT ---
  useEffect(() => {
    const baslat = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/login'); return; }
        setOturum(session.user);

        // Görevleri Çek
        const { data: biletler } = await supabase.from('service_tickets').select('*, cranes(*)').neq('status', 'tamamlandi').order('created_at', { ascending: false });
        if (biletler) setGorevler(biletler);

        // Stok Çek
        const { data: stokData } = await supabase.from('materials').select('*').order('name');
        if (stokData) setStok(stokData);

        setYukleniyor(false);
    };
    baslat();
    return () => clearInterval(timerRef.current);
  }, []);

  // --- FONKSİYONLAR ---
  const sureFormatla = (saniye: number) => {
    const dk = Math.floor(saniye / 60);
    const sn = saniye % 60;
    return `${dk.toString().padStart(2, '0')}:${sn.toString().padStart(2, '0')}`;
  };

  const isiBaslat = (gorev: any) => {
    setAktifGorev(gorev);
    setYapilanIslemAciklamasi("");
    setKullanilanMalzemeler([]);
    setIslemSuresi(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setIslemSuresi(prev => prev + 1), 1000);
  };

  const isiBitir = async () => {
    if (!yapilanIslemAciklamasi) return alert("Açıklama giriniz.");
    if (!confirm("İşi tamamlıyor musun?")) return;
    
    setYukleniyor(true);
    clearInterval(timerRef.current);
    const toplam = kullanilanMalzemeler.reduce((a, b) => a + b.toplam_fiyat, 0);

    await supabase.from('service_tickets').update({ status: 'tamamlandi' }).eq('id', aktifGorev.id);
    await supabase.from('completed_services').insert([{
        service_date: new Date().toISOString(),
        customer_text: aktifGorev.cranes?.customer_name,
        company_address: aktifGorev.cranes?.location_address,
        service_type: 'Servis',
        description: yapilanIslemAciklamasi,
        price: toplam,
        technician: oturum.email,
        work_hours: (islemSuresi / 3600).toFixed(2),
        materials: kullanilanMalzemeler
    }]);

    alert("İşlem Başarılı! ✅");
    setAktifGorev(null);
    setYukleniyor(false);
    router.refresh();
  };

  const malzemeEkle = (m: any) => {
      setKullanilanMalzemeler([...kullanilanMalzemeler, { ...m, id: Date.now(), stokId: m.id, ad: m.name, birim_fiyat: m.sale_price, toplam_fiyat: m.sale_price }]);
      setMalzemeModalAcik(false);
  };

  // VİNÇ GEÇMİŞİ SORGULA
  const vincAra = async () => {
      if(vincArama.length < 3) return;
      const { data } = await supabase.from('cranes').select('*').ilike('customer_name', `%${vincArama}%`);
      if(data) setBulunanVincler(data);
  };

  const vincGecmisiGetir = async (vincId: string) => {
      const { data } = await supabase.from('completed_services').select('*').ilike('customer_text', `%${bulunanVincler.find(v=>v.id===vincId)?.customer_name}%`).order('service_date', { ascending: false });
      if(data) setSeciliVincGecmisi(data);
  };

  if (yukleniyor) return <div className="h-screen bg-slate-900 flex items-center justify-center text-white"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div></div>;

  return (
    <div className="min-h-screen bg-slate-100 font-sans pb-24 select-none">
      
      {/* 🟢 HEADER */}
      <div className="bg-slate-900 text-white p-5 pt-8 rounded-b-3xl shadow-xl sticky top-0 z-30">
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center font-bold text-lg"><User size={20}/></div>
                <div><h2 className="font-bold text-lg leading-tight">Saha Personeli</h2><p className="text-xs text-slate-400">{oturum?.email}</p></div>
            </div>
            <button onClick={() => router.push('/personel/harita')} className="bg-slate-800 p-2.5 rounded-full text-green-400 border border-slate-700 shadow-lg"><Globe size={20}/></button>
        </div>
      </div>

      {/* 🔵 İÇERİK ALANI (SEKMELERE GÖRE DEĞİŞİR) */}
      <div className="p-5">
        
        {/* SEKME 1: GÖREVLER (ANA EKRAN) */}
        {aktifSekme === 'gorevler' && (
            <div className="space-y-4">
                {aktifGorev ? (
                    <motion.div initial={{y:10}} animate={{y:0}} className="bg-white p-6 rounded-3xl shadow-lg border-2 border-blue-500 relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-bl-xl animate-pulse">AKTİF</div>
                        <h3 className="text-xl font-black text-slate-800">{aktifGorev.cranes?.customer_name}</h3>
                        <p className="text-sm text-slate-500 mb-6 flex items-center gap-1"><MapPin size={14}/> {aktifGorev.cranes?.location_address}</p>
                        
                        <div className="text-5xl font-mono font-black text-center text-slate-800 bg-slate-50 py-4 rounded-2xl border border-slate-100 mb-6">{sureFormatla(islemSuresi)}</div>
                        
                        <div className="space-y-3">
                            <button onClick={() => setMalzemeModalAcik(true)} className="w-full bg-yellow-50 text-yellow-700 font-bold py-3 rounded-xl border border-yellow-200 flex items-center justify-center gap-2"><Package size={18}/> Malzeme Ekle ({kullanilanMalzemeler.length})</button>
                            <textarea value={yapilanIslemAciklamasi} onChange={e=>setYapilanIslemAciklamasi(e.target.value)} placeholder="Yapılan işlem..." className="w-full p-3 bg-slate-50 border rounded-xl outline-none text-sm min-h-[80px]"></textarea>
                            <button onClick={isiBitir} className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2"><CheckCircle2 size={20}/> İŞİ BİTİR</button>
                        </div>
                    </motion.div>
                ) : (
                    <>
                        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2"><div className="w-1 h-5 bg-blue-600 rounded-full"></div> Bekleyen İşler ({gorevler.length})</h3>
                        {gorevler.length === 0 ? <div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-dashed">İş yok, keyfine bak! ☕</div> : gorevler.map(g => (
                            <motion.div key={g.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative">
                                <span className="absolute top-4 right-4 bg-red-100 text-red-600 text-[10px] font-bold px-2 py-1 rounded">ACİL</span>
                                <h4 className="font-bold text-slate-800">{g.cranes?.customer_name}</h4>
                                <p className="text-xs text-slate-500 mt-1 mb-3">{g.description}</p>
                                <button onClick={() => isiBaslat(g)} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-md flex items-center justify-center gap-2"><Play size={16}/> BAŞLA</button>
                            </motion.div>
                        ))}
                    </>
                )}
            </div>
        )}

        {/* SEKME 2: STOK KONTROL (SADECE GÖRÜNTÜLEME) */}
        {aktifSekme === 'stok' && (
            <div className="space-y-4">
                <div className="bg-white p-3 rounded-xl shadow-sm border flex items-center gap-2 sticky top-24 z-20">
                    <Search className="text-slate-400 w-5 h-5"/>
                    <input type="text" placeholder="Malzeme ara..." className="flex-1 outline-none text-sm font-bold text-slate-700" value={stokArama} onChange={e=>setStokArama(e.target.value)}/>
                </div>
                <div className="space-y-2">
                    {stok.filter(s => s.name.toLowerCase().includes(stokArama.toLowerCase())).map(s => (
                        <div key={s.id} className="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
                            <div><div className="font-bold text-slate-700 text-sm">{s.name}</div><div className="text-[10px] text-slate-400">{s.category || 'Genel'}</div></div>
                            <div className="text-right"><div className="font-black text-blue-600">{s.stock_quantity || 0} Adet</div><div className="text-[10px] text-slate-400">Stokta</div></div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* SEKME 3: VİNÇ GEÇMİŞİ */}
        {aktifSekme === 'gecmis' && (
            <div className="space-y-4">
                <div className="bg-white p-4 rounded-2xl shadow-sm border">
                    <h3 className="font-bold text-slate-800 text-sm mb-2">Vinç Geçmişi Sorgula</h3>
                    <div className="flex gap-2">
                        <input type="text" placeholder="Müşteri adı gir..." className="flex-1 p-3 bg-slate-50 border rounded-xl text-sm outline-none" value={vincArama} onChange={e=>setVincArama(e.target.value)}/>
                        <button onClick={vincAra} className="bg-slate-900 text-white p-3 rounded-xl"><Search size={20}/></button>
                    </div>
                </div>
                {bulunanVincler.map(v => (
                    <div key={v.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="font-bold text-slate-800">{v.customer_name}</h4>
                            <button onClick={()=>vincGecmisiGetir(v.id)} className="bg-blue-50 text-blue-600 text-xs font-bold px-3 py-1 rounded-lg">Geçmişi Gör</button>
                        </div>
                        <p className="text-xs text-slate-500">{v.model_name} - {v.serial_number}</p>
                        
                        {/* Geçmiş Kayıtları Listele */}
                        {seciliVincGecmisi.length > 0 && bulunanVincler.find(x=>x.id===v.id) && (
                            <div className="mt-3 pt-3 border-t space-y-2">
                                {seciliVincGecmisi.map(g => (
                                    <div key={g.id} className="bg-slate-50 p-2 rounded-lg text-xs">
                                        <div className="font-bold text-slate-700">{new Date(g.service_date).toLocaleDateString()}</div>
                                        <div className="text-slate-500">{g.description}</div>
                                        <div className="text-right text-blue-600 font-bold mt-1">{g.technician}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        )}

        {/* SEKME 4: PROFİL */}
        {aktifSekme === 'profil' && (
            <div className="bg-white p-6 rounded-3xl text-center shadow-lg border border-slate-100">
                <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-black">{oturum?.email[0].toUpperCase()}</div>
                <h3 className="font-bold text-xl text-slate-800">Saha Teknisyeni</h3>
                <p className="text-slate-500 text-sm mb-6">{oturum?.email}</p>
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-50 p-3 rounded-xl"><div className="text-2xl font-black text-slate-800">12</div><div className="text-xs text-slate-400">Tamamlanan</div></div>
                    <div className="bg-slate-50 p-3 rounded-xl"><div className="text-2xl font-black text-green-500">4.8</div><div className="text-xs text-slate-400">Puan</div></div>
                </div>
                <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="w-full bg-red-50 text-red-600 font-bold py-3 rounded-xl flex items-center justify-center gap-2"><LogOut size={18}/> Çıkış Yap</button>
            </div>
        )}

      </div>

      {/* 🚀 ALT NAVİGASYON BAR (BOTTOM TAB) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-2 pb-6 shadow-2xl z-50 flex justify-around items-center rounded-t-3xl">
        <button onClick={() => setAktifSekme('gorevler')} className={`p-3 rounded-2xl flex flex-col items-center gap-1 transition ${aktifSekme === 'gorevler' ? 'text-blue-600 bg-blue-50' : 'text-slate-400'}`}><Home size={24}/><span className="text-[10px] font-bold">Görevler</span></button>
        <button onClick={() => setAktifSekme('stok')} className={`p-3 rounded-2xl flex flex-col items-center gap-1 transition ${aktifSekme === 'stok' ? 'text-yellow-600 bg-yellow-50' : 'text-slate-400'}`}><Box size={24}/><span className="text-[10px] font-bold">Stok</span></button>
        <div className="w-12"></div> {/* Orta Boşluk (Opsiyonel FAB için) */}
        <button onClick={() => setAktifSekme('gecmis')} className={`p-3 rounded-2xl flex flex-col items-center gap-1 transition ${aktifSekme === 'gecmis' ? 'text-purple-600 bg-purple-50' : 'text-slate-400'}`}><History size={24}/><span className="text-[10px] font-bold">Geçmiş</span></button>
        <button onClick={() => setAktifSekme('profil')} className={`p-3 rounded-2xl flex flex-col items-center gap-1 transition ${aktifSekme === 'profil' ? 'text-slate-800 bg-slate-100' : 'text-slate-400'}`}><User size={24}/><span className="text-[10px] font-bold">Profil</span></button>
        
        {/* Ortadaki Yüzen Harita Butonu */}
        <button onClick={() => router.push('/personel/harita')} className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white p-4 rounded-full shadow-xl border-4 border-slate-100 hover:scale-110 transition"><Globe size={28}/></button>
      </div>

      {/* --- MALZEME SEÇİM MODALI --- */}
      <AnimatePresence>
        {malzemeModalAcik && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-slate-900/80 z-[60] flex items-end sm:items-center justify-center p-4 backdrop-blur-sm">
                <motion.div initial={{y:100}} animate={{y:0}} className="bg-white w-full max-w-md rounded-3xl overflow-hidden max-h-[80vh] flex flex-col">
                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center"><h3 className="font-bold text-slate-800">Depodan Malzeme Seç</h3><button onClick={() => setMalzemeModalAcik(false)} className="p-2 bg-white rounded-full shadow-sm"><X size={20}/></button></div>
                    <div className="overflow-y-auto p-4 space-y-2">
                        {stok.map(s => (
                            <button key={s.id} onClick={() => malzemeEkle(s)} className="w-full text-left p-4 rounded-xl border border-slate-100 bg-white hover:bg-blue-50 hover:border-blue-200 transition flex justify-between items-center group">
                                <span className="font-bold text-slate-700 group-hover:text-blue-700">{s.name}</span>
                                <span className="text-xs font-bold bg-slate-100 px-2 py-1 rounded text-slate-500">{s.sale_price} ₺</span>
                            </button>
                        ))}
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}