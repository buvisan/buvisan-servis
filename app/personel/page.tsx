"use client";

// ----------------------------------------------------------------------------
// BUVISAN PRO-FIELD v4.0 | DATA EDITION 📊
// Gerçek Veriler, Akıllı Geçmiş, Canlı İstatistikler
// ----------------------------------------------------------------------------

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LogOut, MapPin, Clock, Wrench, CheckCircle2, Play, 
  Package, Plus, X, User, Globe, Search, History, Home, 
  Box, ChevronRight, Activity, Calendar, AlertTriangle, TrendingUp, Briefcase
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
  
  // PROFİL İSTATİSTİKLERİ
  const [istatistikler, setIstatistikler] = useState({
      toplamIs: 0,
      toplamSaat: 0,
      buAykiIs: 0,
      sonIsler: [] as any[]
  });

  // GÖREV YÖNETİMİ
  const [aktifGorev, setAktifGorev] = useState<any | null>(null);
  const [islemSuresi, setIslemSuresi] = useState(0);
  const timerRef = useRef<any>(null);
  const [kullanilanMalzemeler, setKullanilanMalzemeler] = useState<any[]>([]);
  const [yapilanIslemAciklamasi, setYapilanIslemAciklamasi] = useState("");
  const [malzemeModalAcik, setMalzemeModalAcik] = useState(false);

  // VİNÇ SORGULAMA & KİŞİSEL GEÇMİŞ
  const [vincArama, setVincArama] = useState("");
  const [gecmisListesi, setGecmisListesi] = useState<any[]>([]); // Hem arama hem kişisel geçmiş için

  // STOK ARAMA
  const [stokArama, setStokArama] = useState("");

  // --- 1. BAŞLATMA VE VERİ ÇEKME ---
  useEffect(() => {
    const baslat = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/login'); return; }
        setOturum(session.user);

        // 1. Bekleyen Görevleri Çek
        const { data: biletler } = await supabase
            .from('service_tickets')
            .select('*, cranes(*)')
            .neq('status', 'tamamlandi')
            .order('created_at', { ascending: false });
        if (biletler) setGorevler(biletler);

        // 2. Stok Çek
        const { data: stokData } = await supabase.from('materials').select('*').order('name');
        if (stokData) setStok(stokData);

        // 3. Kişisel İstatistikleri ve Geçmişi Çek (🔥 YENİ 🔥)
        // Personelin yaptığı tamamlanan işleri çekiyoruz
        const { data: bitenIsler } = await supabase
            .from('completed_services')
            .select('*')
            .eq('technician', session.user.email) // Sadece bu personelin işleri
            .order('service_date', { ascending: false });

        if (bitenIsler) {
            const buAy = new Date().getMonth();
            const buAykiIsler = bitenIsler.filter(is => new Date(is.service_date).getMonth() === buAy).length;
            const toplamSaat = bitenIsler.reduce((acc, curr) => acc + (parseFloat(curr.work_hours) || 0), 0);

            setIstatistikler({
                toplamIs: bitenIsler.length,
                toplamSaat: Math.round(toplamSaat),
                buAykiIs: buAykiIsler,
                sonIsler: bitenIsler.slice(0, 5) // Profilde göstermek için son 5 iş
            });
            
            // "Geçmiş" sekmesi boş kalmasın diye varsayılan olarak personelin kendi geçmişini yüklüyoruz
            setGecmisListesi(bitenIsler); 
        }

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
    if (!yapilanIslemAciklamasi) return alert("Lütfen yapılan işlemi açıklayın.");
    if (!confirm("İşi tamamlıyor musun?")) return;
    
    setYukleniyor(true);
    clearInterval(timerRef.current);
    const toplam = kullanilanMalzemeler.reduce((a, b) => a + b.toplam_fiyat, 0);

    // 1. Bileti Kapat
    await supabase.from('service_tickets').update({ status: 'tamamlandi' }).eq('id', aktifGorev.id);
    
    // 2. Servis Kaydını Oluştur
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

    alert("Eline sağlık usta! İşlem kaydedildi. ✅");
    setAktifGorev(null);
    setYukleniyor(false);
    window.location.reload(); // Sayfayı yenile ki veriler güncellensin
  };

  const malzemeEkle = (m: any) => {
      setKullanilanMalzemeler([...kullanilanMalzemeler, { ...m, id: Date.now(), stokId: m.id, ad: m.name, birim_fiyat: m.sale_price, toplam_fiyat: m.sale_price }]);
      setMalzemeModalAcik(false);
  };

  // GENEL ARAMA (Tüm veritabanında arar)
  const genelAramaYap = async (text: string) => {
      setVincArama(text);
      if(text.length < 2) {
          // Arama silinirse tekrar kendi geçmişini göster
          const { data } = await supabase.from('completed_services').select('*').eq('technician', oturum.email).order('service_date', { ascending: false });
          if(data) setGecmisListesi(data);
          return;
      }

      // Hem müşteri adında hem teknisyen adında ara (Admin'in yaptıklarını da görebilsin diye)
      const { data } = await supabase
        .from('completed_services')
        .select('*')
        .or(`customer_text.ilike.%${text}%,description.ilike.%${text}%`)
        .order('service_date', { ascending: false })
        .limit(20);
      
      if(data) setGecmisListesi(data);
  };

  if (yukleniyor) return <div className="h-screen bg-slate-900 flex items-center justify-center text-white"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div></div>;

  return (
    <div className="min-h-screen bg-slate-100 font-sans pb-24 select-none">
      
      {/* 🟢 HEADER (Daha Dolu) */}
      <div className="bg-slate-900 text-white p-5 pt-8 rounded-b-3xl shadow-xl sticky top-0 z-30">
        <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-blue-400 rounded-full flex items-center justify-center font-bold text-lg border-2 border-blue-300/30 text-white shadow-lg">
                    {oturum?.email[0].toUpperCase()}
                </div>
                <div>
                    <h2 className="font-bold text-lg leading-tight">İyi Çalışmalar 👋</h2>
                    <p className="text-xs text-blue-300 font-medium truncate w-40">{oturum?.email}</p>
                </div>
            </div>
            <div className="flex gap-2">
                <button onClick={() => router.push('/personel/harita')} className="bg-slate-800 p-2.5 rounded-xl text-green-400 border border-slate-700 shadow-lg hover:bg-slate-700 transition"><Globe size={20}/></button>
            </div>
        </div>
        
        {/* HIZLI DURUM KARTI */}
        {!aktifGorev && (
            <div className="flex justify-between items-center bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/10">
                <div className="text-xs text-slate-300 flex items-center gap-2"><Briefcase size={14}/> Bugün tamamlanan: <span className="text-white font-bold">{istatistikler.buAykiIs} İş</span></div>
                <div className="h-4 w-[1px] bg-white/20"></div>
                <div className="text-xs text-slate-300 flex items-center gap-2"><Clock size={14}/> Toplam Efor: <span className="text-white font-bold">{istatistikler.toplamSaat} Saat</span></div>
            </div>
        )}
      </div>

      {/* 🔵 İÇERİK ALANI */}
      <div className="p-5">
        
        {/* SEKME 1: GÖREVLER */}
        {aktifSekme === 'gorevler' && (
            <div className="space-y-4">
                {aktifGorev ? (
                    <motion.div initial={{y:10}} animate={{y:0}} className="bg-white p-6 rounded-3xl shadow-2xl border-2 border-blue-500 relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs font-bold px-4 py-1.5 rounded-bl-2xl animate-pulse flex items-center gap-1"><Activity size={12}/> AKTİF GÖREV</div>
                        <h3 className="text-xl font-black text-slate-800 mt-2">{aktifGorev.cranes?.customer_name}</h3>
                        <p className="text-sm text-slate-500 mb-6 flex items-center gap-1 mt-1"><MapPin size={14} className="text-red-500"/> {aktifGorev.cranes?.location_address}</p>
                        
                        <div className="text-6xl font-mono font-black text-center text-slate-800 tracking-wider mb-8">{sureFormatla(islemSuresi)}</div>
                        
                        <div className="space-y-3">
                            <button onClick={() => setMalzemeModalAcik(true)} className="w-full bg-orange-50 text-orange-700 font-bold py-4 rounded-2xl border border-orange-100 flex items-center justify-center gap-2 shadow-sm active:scale-95 transition"><Package size={20}/> Malzeme Ekle ({kullanilanMalzemeler.length})</button>
                            <textarea value={yapilanIslemAciklamasi} onChange={e=>setYapilanIslemAciklamasi(e.target.value)} placeholder="Yapılan işlemleri detaylı yaz..." className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-sm min-h-[100px] focus:ring-2 focus:ring-blue-500"></textarea>
                            <button onClick={isiBitir} className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-900/20 flex items-center justify-center gap-2 active:scale-95 transition"><CheckCircle2 size={22}/> GÖREVİ TAMAMLA</button>
                        </div>
                    </motion.div>
                ) : (
                    <>
                        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2"><div className="w-1 h-5 bg-blue-600 rounded-full"></div> Bekleyen İş Listesi</h3>
                        {gorevler.length === 0 ? (
                            <div className="text-center py-12 px-6 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle2 size={32}/></div>
                                <h3 className="font-bold text-slate-700 text-lg">Harikasın!</h3>
                                <p className="text-slate-400 text-sm mt-1">Şu an atanmış aktif bir görev yok. Biraz dinlen ☕</p>
                            </div>
                        ) : gorevler.map(g => (
                            <motion.div key={g.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative group active:scale-[0.98] transition-transform">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="bg-red-50 text-red-600 text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 border border-red-100"><AlertTriangle size={10}/> ACİL</span>
                                    <span className="text-[10px] text-slate-400 font-mono">{new Date(g.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                </div>
                                <h4 className="font-bold text-slate-800 text-lg leading-tight">{g.cranes?.customer_name}</h4>
                                <div className="flex items-center gap-1 text-xs text-slate-500 mt-1"><MapPin size={12}/> {g.cranes?.location_address}</div>
                                <p className="text-sm text-slate-600 mt-3 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">{g.description}</p>
                                <button onClick={() => isiBaslat(g)} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2"><Play size={18} fill="currentColor"/> İŞE BAŞLA</button>
                            </motion.div>
                        ))}
                    </>
                )}
            </div>
        )}

        {/* SEKME 2: STOK KONTROL */}
        {aktifSekme === 'stok' && (
            <div className="space-y-4">
                <div className="bg-white p-3 rounded-2xl shadow-sm border flex items-center gap-3 sticky top-24 z-20">
                    <Search className="text-slate-400 w-5 h-5"/>
                    <input type="text" placeholder="Parça adı veya kod..." className="flex-1 outline-none text-sm font-bold text-slate-700 placeholder:font-normal" value={stokArama} onChange={e=>setStokArama(e.target.value)}/>
                </div>
                <div className="space-y-3">
                    {stok.filter(s => s.name.toLowerCase().includes(stokArama.toLowerCase())).map(s => (
                        <div key={s.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.stock_quantity < 5 ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                                    <Box size={20}/>
                                </div>
                                <div>
                                    <div className="font-bold text-slate-700 text-sm leading-tight">{s.name}</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">{s.category || 'Genel Parça'}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className={`font-black text-lg ${s.stock_quantity < 5 ? 'text-red-500' : 'text-slate-800'}`}>{s.stock_quantity}</div>
                                <div className="text-[9px] text-slate-400 font-bold uppercase">Stok</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* SEKME 3: GEÇMİŞ (ARTIK DOLU!) */}
        {aktifSekme === 'gecmis' && (
            <div className="space-y-4">
                <div className="bg-white p-4 rounded-2xl shadow-sm border sticky top-24 z-20">
                    <h3 className="font-bold text-slate-800 text-sm mb-2">Servis Arşivi</h3>
                    <div className="flex gap-2">
                        <input type="text" placeholder="Firma veya açıklama ara..." className="flex-1 p-3 bg-slate-50 border rounded-xl text-sm outline-none font-bold text-slate-700" value={vincArama} onChange={e=>genelAramaYap(e.target.value)}/>
                        <div className="bg-slate-900 text-white p-3 rounded-xl"><Search size={20}/></div>
                    </div>
                </div>

                <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">{vincArama ? 'Arama Sonuçları' : 'Son Yaptığın İşler'}</h4>
                    {gecmisListesi.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">Kayıt bulunamadı.</div>
                    ) : (
                        gecmisListesi.map(g => (
                            <div key={g.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-2">
                                <div className="flex justify-between items-start">
                                    <h4 className="font-bold text-slate-800 text-sm">{g.customer_text}</h4>
                                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-mono">{new Date(g.service_date).toLocaleDateString('tr-TR')}</span>
                                </div>
                                <p className="text-xs text-slate-500 line-clamp-2 bg-slate-50 p-2 rounded-lg">{g.description}</p>
                                <div className="flex justify-between items-center mt-1">
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-blue-600"><User size={10}/> {g.technician}</div>
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-green-600"><Clock size={10}/> {g.work_hours} Saat</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        )}

        {/* SEKME 4: PROFİL (DATA İLE DOLU!) */}
        {aktifSekme === 'profil' && (
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-3xl text-center shadow-lg border border-slate-100 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-20 bg-gradient-to-b from-blue-50 to-white -z-0"></div>
                    <div className="relative z-10">
                        <div className="w-24 h-24 bg-slate-900 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-black border-4 border-white shadow-xl">
                            {oturum?.email[0].toUpperCase()}
                        </div>
                        <h3 className="font-bold text-xl text-slate-800">Saha Teknisyeni</h3>
                        <p className="text-slate-500 text-sm mb-6">{oturum?.email}</p>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div className="text-3xl font-black text-slate-800">{istatistikler.toplamIs}</div>
                                <div className="text-xs text-slate-400 font-bold uppercase mt-1">Tamamlanan İş</div>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div className="text-3xl font-black text-green-500">{istatistikler.toplamSaat}</div>
                                <div className="text-xs text-slate-400 font-bold uppercase mt-1">Toplam Saat</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SON HAREKETLER (TIMELINE) */}
                <div>
                    <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2"><History size={20}/> Son Hareketler</h3>
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 space-y-6">
                        {istatistikler.sonIsler.length === 0 ? (
                            <div className="text-center text-slate-400 text-sm">Henüz kayıt yok.</div>
                        ) : (
                            istatistikler.sonIsler.map((is, i) => (
                                <div key={i} className="flex gap-4 relative">
                                    {/* Çizgi */}
                                    {i !== istatistikler.sonIsler.length - 1 && <div className="absolute left-[11px] top-8 w-[2px] h-full bg-slate-100"></div>}
                                    
                                    <div className="mt-1 min-w-[24px]">
                                        <div className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center"><CheckCircle2 size={14}/></div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-slate-400 font-mono mb-0.5">{new Date(is.service_date).toLocaleDateString()}</div>
                                        <div className="font-bold text-slate-800 text-sm">{is.customer_text}</div>
                                        <div className="text-xs text-slate-500 mt-1 line-clamp-1">{is.description}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="w-full bg-red-50 text-red-600 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 border border-red-100 hover:bg-red-100 transition"><LogOut size={18}/> Oturumu Kapat</button>
            </div>
        )}

      </div>

      {/* 🚀 ALT NAVİGASYON BAR */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-2 pb-6 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-50 flex justify-around items-center rounded-t-3xl">
        <button onClick={() => setAktifSekme('gorevler')} className={`p-3 rounded-2xl flex flex-col items-center gap-1 transition ${aktifSekme === 'gorevler' ? 'text-blue-600 bg-blue-50' : 'text-slate-400'}`}><Home size={24}/><span className="text-[10px] font-bold">Görevler</span></button>
        <button onClick={() => setAktifSekme('stok')} className={`p-3 rounded-2xl flex flex-col items-center gap-1 transition ${aktifSekme === 'stok' ? 'text-yellow-600 bg-yellow-50' : 'text-slate-400'}`}><Box size={24}/><span className="text-[10px] font-bold">Stok</span></button>
        <div className="w-12"></div> {/* Harita Boşluğu */}
        <button onClick={() => setAktifSekme('gecmis')} className={`p-3 rounded-2xl flex flex-col items-center gap-1 transition ${aktifSekme === 'gecmis' ? 'text-purple-600 bg-purple-50' : 'text-slate-400'}`}><History size={24}/><span className="text-[10px] font-bold">Geçmiş</span></button>
        <button onClick={() => setAktifSekme('profil')} className={`p-3 rounded-2xl flex flex-col items-center gap-1 transition ${aktifSekme === 'profil' ? 'text-slate-800 bg-slate-100' : 'text-slate-400'}`}><User size={24}/><span className="text-[10px] font-bold">Profil</span></button>
        
        {/* Ortadaki Yüzen Harita Butonu */}
        <button onClick={() => router.push('/personel/harita')} className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white p-4 rounded-full shadow-2xl shadow-blue-900/40 border-4 border-slate-100 hover:scale-110 active:scale-95 transition"><Globe size={28}/></button>
      </div>

      {/* --- MALZEME SEÇİM MODALI --- */}
      <AnimatePresence>
        {malzemeModalAcik && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-slate-900/80 z-[60] flex items-end sm:items-center justify-center p-4 backdrop-blur-sm">
                <motion.div initial={{y:100}} animate={{y:0}} className="bg-white w-full max-w-md rounded-3xl overflow-hidden max-h-[80vh] flex flex-col shadow-2xl">
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