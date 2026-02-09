"use client";

// ----------------------------------------------------------------------------
// BUVISAN PRO-FIELD | SAHA PERSONEL MODÜLÜ V2.0 👷‍♂️📲
// (Canlı Harita Butonu Eklendi)
// ----------------------------------------------------------------------------

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LogOut, MapPin, Clock, Camera, Wrench, ChevronRight, 
  CheckCircle2, Play, Square, Package, Plus, X, UploadCloud, User, Globe // 🔥 Globe ikonu eklendi
} from 'lucide-react';

export default function PersonelApp() {
  const router = useRouter();
  
  // --- STATE YÖNETİMİ ---
  const [yukleniyor, setYukleniyor] = useState(true);
  const [oturum, setOturum] = useState<any>(null);
  
  // Veriler
  const [gorevler, setGorevler] = useState<any[]>([]);
  const [stok, setStok] = useState<any[]>([]);
  
  // Aktif İş Yönetimi
  const [aktifGorev, setAktifGorev] = useState<any | null>(null);
  const [islemSuresi, setIslemSuresi] = useState(0); // Saniye cinsinden
  const timerRef = useRef<any>(null);

  // İşlem Detayları (Form)
  const [kullanilanMalzemeler, setKullanilanMalzemeler] = useState<any[]>([]);
  const [yapilanIslemAciklamasi, setYapilanIslemAciklamasi] = useState("");
  
  // Modal Kontrolleri
  const [malzemeModalAcik, setMalzemeModalAcik] = useState(false);

  // --- 1. BAŞLANGIÇ & VERİ ÇEKME ---
  useEffect(() => {
    baslat();
    return () => clearInterval(timerRef.current);
  }, []);

    const baslat = async () => {
        // A. Oturum Kontrolü
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/login'); return; }
        setOturum(session.user);

        // 🔥 B. ROL KONTROLÜ (GÜVENLİK) 🔥
        const { data: profil } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();

        // Eğer admin ise, admin paneline yolla (Opsiyonel: İstersen admin personeli de görebilsin diye bunu silebilirsin)
        if (profil?.role !== 'personel' && profil?.role !== 'admin') {
            // Rolü belirsizse login'e at
            router.push('/login');
            return;
        }

    // B. Görevleri Çek (Admin panelindeki 'bekleyen' arızalar)
    const { data: biletler } = await supabase
        .from('service_tickets')
        .select('*, cranes(*)')
        .neq('status', 'tamamlandi') // Sadece bitmemiş işler
        .order('created_at', { ascending: false });
    
    if (biletler) setGorevler(biletler);

    // C. Stok Listesini Çek (Malzeme seçimi için)
    const { data: stokData } = await supabase.from('materials').select('*').order('name');
    if (stokData) setStok(stokData);

    setYukleniyor(false);
  };

  // --- 2. KRONOMETRE & İŞ BAŞLATMA ---
  const isiBaslat = (gorev: any) => {
    setAktifGorev(gorev);
    setYapilanIslemAciklamasi("");
    setKullanilanMalzemeler([]);
    setIslemSuresi(0);
    
    // Sayacı başlat
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setIslemSuresi(prev => prev + 1);
    }, 1000);
  };

  const sureFormatla = (saniye: number) => {
    const dk = Math.floor(saniye / 60);
    const sn = saniye % 60;
    return `${dk.toString().padStart(2, '0')}:${sn.toString().padStart(2, '0')}`;
  };

  // --- 3. MALZEME YÖNETİMİ ---
  const malzemeEkle = (malzeme: any) => {
    const yeniKalem = {
        id: Date.now(), // Geçici ID
        stokId: malzeme.id,
        ad: malzeme.name,
        adet: 1,
        birim_fiyat: malzeme.sale_price,
        toplam_fiyat: malzeme.sale_price
    };
    setKullanilanMalzemeler([...kullanilanMalzemeler, yeniKalem]);
    setMalzemeModalAcik(false);
  };

  const malzemeCikar = (id: number) => {
    setKullanilanMalzemeler(kullanilanMalzemeler.filter(m => m.id !== id));
  };

  // --- 4. İŞİ BİTİR & SENKRONİZE ET ---
  const isiBitir = async () => {
    if (!yapilanIslemAciklamasi) return alert("Lütfen yapılan işlemi kısaca anlat.");
    if (!confirm("İşi tamamlayıp merkeze göndermek istiyor musun?")) return;

    setYukleniyor(true);
    clearInterval(timerRef.current);

    const toplamTutar = kullanilanMalzemeler.reduce((acc, m) => acc + m.toplam_fiyat, 0);

    try {
        // ADIM 1: Admin Panelindeki 'Son Bildirimler'i güncelle
        await supabase
            .from('service_tickets')
            .update({ status: 'tamamlandi' })
            .eq('id', aktifGorev.id);

        // ADIM 2: Finansal Analiz tablosuna ekle
        const servisKaydi = {
            service_date: new Date().toISOString(),
            customer_text: aktifGorev.cranes?.customer_name || 'Bilinmeyen Müşteri',
            company_address: aktifGorev.cranes?.location_address || '',
            service_type: 'Servis',
            description: yapilanIslemAciklamasi,
            price: toplamTutar,
            technician: oturum.email || 'Mobil Personel',
            work_hours: (islemSuresi / 3600).toFixed(2),
            materials: kullanilanMalzemeler
        };

        const { error } = await supabase.from('completed_services').insert([servisKaydi]);

        if (error) throw error;

        alert("Harika! İş tamamlandı ve merkeze iletildi. 🚀");
        setAktifGorev(null);
        baslat(); 

    } catch (error: any) {
        alert("Hata oluştu: " + error.message);
    } finally {
        setYukleniyor(false);
    }
  };

  // --- ARAYÜZ (UI) ---
  if (yukleniyor) return <div className="h-screen bg-slate-900 flex items-center justify-center text-white"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>;

  return (
    <div className="min-h-screen bg-slate-100 font-sans pb-20 select-none">
      
      {/* 🟢 HEADER: PROFİL & DURUM */}
      <div className="bg-slate-900 text-white p-5 rounded-b-3xl shadow-xl sticky top-0 z-40">
        <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center font-bold text-lg">
                    <User size={20}/>
                </div>
                <div>
                    <h2 className="font-bold text-lg leading-tight">Merhaba, Ekip!</h2>
                    <p className="text-xs text-slate-400">Saha Personeli</p>
                </div>
            </div>
            
            {/* 🔥 YENİ BUTONLAR GRUBU 🔥 */}
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => router.push('/personel/harita')} // Personel harita sayfasına gider
                    className="bg-slate-800 p-2.5 rounded-full text-green-400 border border-slate-700 hover:bg-slate-700 hover:text-green-300 transition shadow-lg"
                    title="Canlı Harita"
                >
                    <Globe size={20}/>
                </button>
                <button 
                    onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} 
                    className="bg-slate-800 p-2.5 rounded-full text-red-400 border border-slate-700 hover:bg-slate-700 hover:text-red-300 transition shadow-lg"
                    title="Çıkış Yap"
                >
                    <LogOut size={20}/>
                </button>
            </div>
        </div>
        
        {/* ÖZET KARTLARI */}
        <div className="flex gap-3">
            <div className="flex-1 bg-slate-800 p-3 rounded-2xl border border-slate-700">
                <div className="text-xs text-slate-400 mb-1">Bekleyen Görev</div>
                <div className="text-2xl font-black text-blue-400">{gorevler.length}</div>
            </div>
            <div className="flex-1 bg-slate-800 p-3 rounded-2xl border border-slate-700">
                <div className="text-xs text-slate-400 mb-1">Durum</div>
                <div className={`text-sm font-bold ${aktifGorev ? 'text-green-400 animate-pulse' : 'text-slate-500'}`}>
                    {aktifGorev ? '• ÇALIŞILIYOR' : '• MÜSAİT'}
                </div>
            </div>
        </div>
      </div>

      <div className="p-5">
        
        {/* 🟡 EĞER AKTİF GÖREV VARSA (İŞLEM MODU) */}
        <AnimatePresence mode="wait">
        {aktifGorev ? (
            <motion.div initial={{y:20, opacity:0}} animate={{y:0, opacity:1}} className="space-y-6">
                
                {/* 1. SAYAÇ & BİLGİ */}
                <div className="bg-white p-6 rounded-3xl shadow-lg border-2 border-blue-500 relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-bl-xl">AKTİF İŞLEM</div>
                    <h3 className="text-xl font-black text-slate-800 mb-1">{aktifGorev.cranes?.customer_name}</h3>
                    <p className="text-sm text-slate-500 flex items-center gap-1 mb-6"><MapPin size={14}/> {aktifGorev.cranes?.location_address}</p>
                    
                    <div className="flex justify-center my-4">
                        <div className="text-5xl font-mono font-black text-slate-800 tracking-widest bg-slate-100 px-6 py-2 rounded-xl border border-slate-200">
                            {sureFormatla(islemSuresi)}
                        </div>
                    </div>
                    
                    <div className="text-center text-xs text-slate-400 uppercase font-bold tracking-widest animate-pulse">Süre İşliyor...</div>
                </div>

                {/* 2. MALZEME EKLEME */}
                <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-slate-700 flex items-center gap-2"><Package size={18}/> Kullanılan Malzemeler</h4>
                        <button onClick={() => setMalzemeModalAcik(true)} className="bg-yellow-500 text-white p-2 rounded-xl shadow-lg hover:scale-105 transition"><Plus size={20}/></button>
                    </div>
                    
                    {kullanilanMalzemeler.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-sm italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            Henüz malzeme eklenmedi.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {kullanilanMalzemeler.map((m, i) => (
                                <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm">
                                    <span className="font-bold text-slate-700">{m.ad}</span>
                                    <button onClick={() => malzemeCikar(m.id)} className="text-red-400"><X size={16}/></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 3. AÇIKLAMA & BİTİR */}
                <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 space-y-4">
                    <h4 className="font-bold text-slate-700 flex items-center gap-2"><Wrench size={18}/> Yapılan İşlem Özeti</h4>
                    <textarea 
                        value={yapilanIslemAciklamasi}
                        onChange={e => setYapilanIslemAciklamasi(e.target.value)}
                        placeholder="Örn: Halat değişti, fren ayarlandı..." 
                        className="w-full p-4 bg-slate-50 rounded-xl border border-slate-200 text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                    ></textarea>
                    
                    <button 
                        onClick={isiBitir}
                        className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-lg shadow-xl shadow-slate-300 active:scale-95 transition flex items-center justify-center gap-3"
                    >
                        <CheckCircle2 size={24}/> İŞİ TAMAMLA
                    </button>
                    
                    <button 
                        onClick={() => { if(confirm("İptal edilsin mi?")) { setAktifGorev(null); clearInterval(timerRef.current); } }}
                        className="w-full text-slate-400 text-sm font-bold py-2"
                    >
                        Vazgeç ve Çık
                    </button>
                </div>

            </motion.div>
        ) : (
            /* 🔵 GÖREV LİSTESİ (NORMAL MOD) */
            <div className="space-y-4">
                <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                    <div className="w-1 h-6 bg-blue-600 rounded-full"></div> Görev Listesi
                </h3>

                {gorevler.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-300">
                        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3"/>
                        <p className="text-slate-500 font-bold">Harika! Tüm işler bitti.</p>
                        <p className="text-xs text-slate-400">Şu an atanmış yeni görev yok.</p>
                    </div>
                ) : (
                    gorevler.map((gorev) => (
                        <motion.div 
                            key={gorev.id} 
                            whileTap={{ scale: 0.98 }}
                            className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden"
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h4 className="font-bold text-slate-800 text-lg">{gorev.cranes?.customer_name}</h4>
                                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                                        <MapPin size={12}/> {gorev.cranes?.location_address || 'Adres Girilmemiş'}
                                    </div>
                                </div>
                                <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-1 rounded uppercase">Acil</span>
                            </div>
                            
                            <div className="bg-slate-50 p-3 rounded-xl text-sm text-slate-600 mb-4 border border-slate-100">
                                {gorev.description}
                            </div>

                            <button 
                                onClick={() => isiBaslat(gorev)}
                                className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-200 flex items-center justify-center gap-2 active:bg-blue-700 transition"
                            >
                                <Play size={18} fill="currentColor"/> İŞE BAŞLA
                            </button>
                        </motion.div>
                    ))
                )}
            </div>
        )}
        </AnimatePresence>

      </div>

      {/* --- MALZEME SEÇİM MODALI --- */}
      <AnimatePresence>
        {malzemeModalAcik && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-slate-900/80 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm">
                <motion.div initial={{y:100}} animate={{y:0}} className="bg-white w-full max-w-md rounded-3xl overflow-hidden max-h-[80vh] flex flex-col">
                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800">Depodan Malzeme Seç</h3>
                        <button onClick={() => setMalzemeModalAcik(false)} className="p-2 bg-white rounded-full shadow-sm"><X size={20}/></button>
                    </div>
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