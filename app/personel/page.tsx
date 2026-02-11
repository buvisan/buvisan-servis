"use client";

/**
 * -----------------------------------------------------------------------------
 * BUVISAN FIELD OS [ULTIMATE] | PART 1: CORE & TYPES
 * -----------------------------------------------------------------------------
 * Bu bölüm sistemin omurgasını, veri tiplerini ve kütüphane entegrasyonlarını içerir.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { 
  LogOut, MapPin, Clock, Wrench, CheckCircle2, Play, 
  Package, Plus, X, User, Globe, Search, History, Home, 
  Box, ChevronRight, Activity, Calendar, AlertTriangle, 
  TrendingUp, Briefcase, Award, Zap, Battery, Signal, 
  Sun, CloudRain, PenTool, Check, Shield, Wifi, WifiOff,
  Cpu, Thermometer, Layers, AlertOctagon, MoreVertical,
  Navigation, Phone, MessageSquare, Camera
} from 'lucide-react';

// --- TİP TANIMLAMALARI (TYPE DEFINITIONS) ---
// Hata yapmamak için her verinin kimliğini baştan tanımlıyoruz.

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'personel';
  xp: number;
  rank: string;
  avatar_url?: string;
}

interface Crane {
  id: string;
  customer_name: string;
  location_address: string;
  model_name: string;
  serial_number: string;
  latitude?: number;
  longitude?: number;
}

interface JobTicket {
  id: string;
  created_at: string;
  description: string;
  status: 'beklemede' | 'islemde' | 'tamamlandi';
  priority: 'normal' | 'yuksek' | 'kritik';
  cranes: Crane;
}

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  stock_quantity: number;
  sale_price: number;
}

interface CartItem extends InventoryItem {
  cartId: number; // Sepetteki benzersiz ID
}

interface ServiceHistory {
  id: string;
  service_date: string;
  customer_text: string;
  description: string;
  technician: string;
}

// Uygulama Sekmeleri
type AppTab = 'dashboard' | 'tasks' | 'inventory' | 'history' | 'profile';

// Servis Sihirbazı Adımları
type WizardStage = 
  | 'start'           // Başlangıç Onayı
  | 'safety'          // İSG Kontrolü
  | 'diagnosis'       // Arıza Tespiti & AI
  | 'repair'          // Onarım & Parça
  | 'proof'           // Fotoğraf & Kanıt
  | 'sign'            // İmza & Kapanış;

// --- YARDIMCI UTILS ---

// Rütbe Hesaplayıcı
const calculateRank = (xp: number): string => {
    if (xp < 1000) return 'Çırak Teknisyen';
    if (xp < 3000) return 'Saha Elemanı';
    if (xp < 7000) return 'Uzman Teknisyen';
    if (xp < 15000) return 'Saha Şefi';
    return 'Grandmaster';
};

// Para Formatlayıcı
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
};

// Süre Formatlayıcı (00:00:00)
const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// Tarih Formatlayıcı
const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
};

// --- ANA COMPONENT BAŞLANGICI ---
export default function PersonelApp() {
  const router = useRouter();
  
  // --- STATE MANAGEMENT (DURUM YÖNETİMİ) ---
  
  // 1. Sistem Durumu
  const [systemState, setSystemState] = useState<'booting' | 'ready' | 'error'>('booting');
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [isOnline, setIsOnline] = useState(true); // İnternet kontrolü
  
  // 2. Kullanıcı & Veri
  const [user, setUser] = useState<UserProfile | null>(null);
  const [tasks, setTasks] = useState<JobTicket[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<ServiceHistory[]>([]);
  
  // 3. İstatistikler (Canlı)
  const [stats, setStats] = useState({
      completedToday: 0,
      monthlyHours: 0,
      efficiencyScore: 98 // Yapay zeka puanı (Mock)
  });

  // 4. Hava Durumu (Mock - API Yoksa Bozulmasın Diye)
  const [weather, setWeather] = useState({ temp: 18, condition: 'Parçalı Bulutlu', icon: 'cloud' });

  // 5. Aktif Görev Motoru (The Engine)
  const [activeJob, setActiveJob] = useState<JobTicket | null>(null);
  const [wizardStage, setWizardStage] = useState<WizardStage>('start');
  const [jobTimer, setJobTimer] = useState(0);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);

  // 6. Form Verileri (Görev İçin)
  const [jobData, setJobData] = useState({
      safetyCheck: false,
      diagnosis: '',
      actions: '',
      photoUrl: '',
      customerSign: false,
      aiSuggestion: ''
  });
  const [cart, setCart] = useState<CartItem[]>([]);

  // 7. UI Kontrolleri
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [searchText, setSearchText] = useState("");

  // --- INIT & BOOT SEQUENCE ---
  useEffect(() => {
    // Tarayıcı internet kontrolü
    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));

    bootSystem();

    return () => {
        if (timerInterval.current) clearInterval(timerInterval.current);
    };
  }, []);

  const bootSystem = async () => {
      try {
          // 1. Auth Kontrol
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) { router.replace('/login'); return; }

          // 2. Verileri Çek (Parallel Fetching)
          const [profileRes, tasksRes, stockRes, historyRes] = await Promise.all([
              supabase.from('profiles').select('*').eq('id', session.user.id).single(),
              supabase.from('service_tickets').select('*, cranes(*)').neq('status', 'tamamlandi').order('created_at', { ascending: false }),
              supabase.from('materials').select('*').order('name'),
              supabase.from('completed_services').select('*').eq('technician', session.user.email).order('service_date', { ascending: false }).limit(20)
          ]);

          // 3. State Doldur
          if (profileRes.data) {
              const xp = (historyRes.data?.length || 0) * 150;
              setUser({
                  id: session.user.id,
                  email: session.user.email!,
                  full_name: profileRes.data.full_name || 'Personel',
                  role: profileRes.data.role,
                  xp: xp,
                  rank: calculateRank(xp)
              });
          }

          if (tasksRes.data) setTasks(tasksRes.data as JobTicket[]);
          if (stockRes.data) setInventory(stockRes.data as InventoryItem[]);
          if (historyRes.data) setHistory(historyRes.data as ServiceHistory[]);

          // 4. Hava Durumu Simülasyonu (Gerçek API yoksa)
          // Burada basit bir mantıkla saati kontrol edip hava durumu üretiyoruz.
          const hour = new Date().getHours();
          setWeather({
              temp: 15 + Math.floor(Math.random() * 5),
              condition: hour > 18 ? 'Açık Gece' : 'Güneşli',
              icon: hour > 18 ? 'moon' : 'sun'
          });

          // 5. Sistemi Aç
          setTimeout(() => setSystemState('ready'), 2000); // Havalı açılış için gecikme

      } catch (error) {
          console.error("Boot Error:", error);
          setSystemState('error');
      }
  };

  // --- PART 1 SONU --- 
  // Burası temel yapılandırmayı içerir. Devamında Mantık Motoru (Logic Engine) gelecek.
  // ... (PART 1 Kodlarının hemen altı)

  // --- 5. LOGIC ENGINE (MANTIK MOTORU) ---

  // A. GÖREV MOTORU (JOB ENGINE)
  const startJobSession = (ticket: JobTicket) => {
      setActiveJob(ticket);
      setWizardStage('start'); // Sihirbaz başa döner
      setJobTimer(0);
      setJobData({
          safetyCheck: false,
          diagnosis: '',
          actions: '',
          photoUrl: '',
          customerSign: false,
          aiSuggestion: ''
      });
      setCart([]);
      
      // Zamanlayıcıyı Başlat
      if (timerInterval.current) clearInterval(timerInterval.current);
      timerInterval.current = setInterval(() => {
          setJobTimer((prev) => prev + 1);
      }, 1000);
  };

  const terminateJobSession = () => {
      if (confirm("Görevi iptal etmek istediğine emin misin? Süre sıfırlanacak.")) {
          setActiveJob(null);
          clearInterval(timerInterval.current!);
          setJobTimer(0);
      }
  };

  // B. AI DIAGNOSTICS CORE (YAPAY ZEKA SİMÜLASYONU)
  const runAiDiagnostics = () => {
      // Gerçekçilik için yapay gecikme
      setJobData(prev => ({ ...prev, aiSuggestion: 'analyzing' }));
      
      setTimeout(() => {
          const desc = activeJob?.description.toLowerCase() || '';
          let analysis = "Sistem normal görünüyor. Rutin kontrolleri yapın.";
          
          // Anahtar Kelime Analizi
          if (desc.includes('ses') || desc.includes('gürültü')) 
              analysis = "⚠️ OLASI MEKANİK ARIZA: Redüktör dişlileri veya rulman yataklarını kontrol edin. Yağ seviyesi kritik olabilir.";
          else if (desc.includes('kalkmıyor') || desc.includes('kaldırma')) 
              analysis = "⚠️ YÜK SİSTEMİ ARIZASI: Fren balataları sıkışmış veya halat tamburunda sorun olabilir. Yük limit switch'ini test edin.";
          else if (desc.includes('elektrik') || desc.includes('sigorta')) 
              analysis = "⚡ ELEKTRİKSEL HATA: Pano içi kontaktörleri ve termik röleyi kontrol edin. Voltaj dalgalanması tespit edilebilir.";
          else if (desc.includes('kumanda') || desc.includes('buton'))
              analysis = "🎮 KONTROL ARIZASI: Kumanda kablosunda kopukluk veya alıcı kartında oksitlenme olabilir.";

          setJobData(prev => ({ ...prev, aiSuggestion: analysis }));
      }, 2500); // 2.5 saniye analiz süresi
  };

  // C. STOK KONTROL (INVENTORY CONTROLLER)
  const inventoryController = {
      add: (item: InventoryItem) => {
          const newItem: CartItem = { ...item, cartId: Date.now() };
          setCart(prev => [...prev, newItem]);
          setShowInventoryModal(false);
      },
      remove: (cartId: number) => {
          setCart(prev => prev.filter(i => i.cartId !== cartId));
      }
  };

  // D. SİHİRBAZ YÖNETİCİSİ (WIZARD CONTROLLER)
  const advanceStage = () => {
      switch (wizardStage) {
          case 'start':
              setWizardStage('safety');
              break;
          case 'safety':
              if (!jobData.safetyCheck) return alert("Lütfen iş güvenliği kurallarını onaylayın.");
              setWizardStage('diagnosis');
              break;
          case 'diagnosis':
              if (jobData.diagnosis.length < 5) return alert("Lütfen arıza tespitinizi detaylandırın.");
              setWizardStage('repair');
              break;
          case 'repair':
              if (jobData.actions.length < 5) return alert("Yapılan işlemleri yazmadan geçemezsiniz.");
              setWizardStage('sign'); // Fotoğraf adımını atlayıp imzaya geçiyoruz pratiklik için
              break;
          case 'sign':
              // Burası final adım, submit fonksiyonu çağrılacak
              break;
      }
  };

  // E. COMMIT ENGINE (VERİTABANI KAYIT)
  const commitTransaction = async () => {
      if (!jobData.customerSign) return alert("Müşteri onayı (imza) eksik.");
      if (!confirm("İş emri kapatılacak ve fatura onaya düşecek. Devam edilsin mi?")) return;

      // Sistemi 'İşleniyor' moduna al
      setSystemState('booting'); 
      clearInterval(timerInterval.current!);

      try {
          const totalMaterialCost = cart.reduce((acc, item) => acc + item.sale_price, 0);
          
          // 1. Görevi Tamamlandı Olarak İşaretle
          const { error: updateError } = await supabase
              .from('service_tickets')
              .update({ status: 'tamamlandi' })
              .eq('id', activeJob!.id);

          if (updateError) throw updateError;

          // 2. Servis Geçmişine İşle (Finansal Analiz için Kritik)
          const { error: insertError } = await supabase
              .from('completed_services')
              .insert([{
                  service_date: new Date().toISOString(),
                  customer_text: activeJob!.cranes.customer_name,
                  company_address: activeJob!.cranes.location_address,
                  service_type: 'Pro Servis', // Standart tip
                  description: `[TEŞHİS]: ${jobData.diagnosis}\n[İŞLEM]: ${jobData.actions}\n[AI LOG]: ${jobData.aiSuggestion}`,
                  price: totalMaterialCost, // Sadece malzeme maliyeti (İşçilik eklenebilir)
                  technician: user?.email,
                  work_hours: (jobTimer / 3600).toFixed(2), // Saniye -> Saat
                  materials: cart
              }]);

          if (insertError) throw insertError;

          // 3. Başarılı Sonuç
          alert(`✅ İŞLEM BAŞARILI!\n\nSüre: ${formatDuration(jobTimer)}\nParça Tutarı: ${formatCurrency(totalMaterialCost)}`);
          
          // State'i Sıfırla ve Sayfayı Yenile (Taze veri için)
          setSystemState('ready');
          setActiveJob(null);
          window.location.reload(); 

      } catch (error: any) {
          console.error("Commit Error:", error);
          alert("Veri senkronizasyon hatası: " + error.message);
          setSystemState('ready'); // Hatadan sonra sistemi tekrar aç
      }
  };

  // --- PART 2 SONU ---
  // Burası mantık motorunun bittiği yer. Sırada Görünüm (UI) var.
  // ... (PART 2 kodlarının bittiği yer)

  // --- 6. RENDERERS (GÖRÜNÜM KATMANI) ---

  // A. BOOT SCREEN (SİSTEM AÇILIŞ EFEKTİ)
  if (systemState === 'booting') return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center text-blue-500 font-mono select-none overflow-hidden relative">
          {/* Matrix Yağmuru Efekti (Basit CSS) */}
          <div className="absolute inset-0 bg-[url('https://media.giphy.com/media/U3qYN8S0j3bpK/giphy.gif')] opacity-5 pointer-events-none bg-cover"></div>
          
          <div className="z-10 text-center space-y-6">
              <div className="relative inline-block">
                  <div className="w-24 h-24 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                      <Cpu size={32} className="text-white animate-pulse"/>
                  </div>
              </div>
              
              <div>
                  <div className="text-3xl font-black tracking-[0.2em] text-white drop-shadow-[0_0_10px_rgba(59,130,246,0.8)]">BUVISAN<span className="text-blue-500">.OS</span></div>
                  <div className="text-xs text-slate-500 mt-2 font-bold tracking-widest">FIELD OPERATIONS SYSTEM v6.0</div>
              </div>

              <div className="text-left bg-slate-900/80 p-4 rounded-xl border border-slate-800 text-xs font-mono w-64 mx-auto space-y-1 shadow-2xl">
                  <div className="text-green-500">&gt; Kernel initialized... OK</div>
                  <div className="text-green-500 delay-75">&gt; Loading user profile... OK</div>
                  <div className="text-blue-400 animate-pulse">&gt; Syncing database...</div>
              </div>
          </div>
      </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 font-sans pb-28 select-none overflow-hidden relative">
      
      {/* ================= HEADER (PROFİL & DURUM) ================= */}
      <header className="bg-slate-900 text-white pt-10 pb-8 px-6 rounded-b-[40px] shadow-2xl relative z-10 overflow-hidden">
          {/* Arka Plan Süslemesi */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

          <div className="flex justify-between items-start relative z-10">
              <div className="flex items-center gap-4">
                  <div className="relative group">
                      <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center text-xl font-bold shadow-lg border-2 border-white/10 group-active:scale-95 transition">
                          {user?.email[0].toUpperCase()}
                      </div>
                      <div className="absolute -bottom-2 -right-2 bg-yellow-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full shadow-md border-2 border-slate-900 flex items-center gap-1">
                          <Award size={10}/> {user?.xp ? Math.floor(user.xp / 1000) + 1 : 1}
                      </div>
                  </div>
                  <div>
                      <h1 className="text-lg font-bold leading-tight">{user?.full_name || 'Teknisyen'}</h1>
                      <div className="flex items-center gap-2 text-xs text-blue-300/80 mt-1 font-medium bg-blue-900/30 px-2 py-0.5 rounded-lg w-fit border border-blue-500/20">
                          <Shield size={12}/> {user?.rank}
                      </div>
                  </div>
              </div>
              <button 
                onClick={() => router.push('/personel/harita')}
                className="bg-white/10 p-3 rounded-2xl backdrop-blur-md border border-white/10 hover:bg-white/20 transition active:scale-90 shadow-lg"
              >
                  <Globe size={22} className="text-emerald-400"/>
              </button>
          </div>

          {/* Hızlı İstatistikler Widget */}
          {!activeJob && (
              <div className="grid grid-cols-3 gap-3 mt-8">
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5 backdrop-blur-sm text-center hover:bg-white/10 transition">
                      <div className="text-2xl font-black text-white">{tasks.length}</div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Bekleyen</div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5 backdrop-blur-sm text-center hover:bg-white/10 transition">
                      <div className="text-2xl font-black text-emerald-400">{history.length}</div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Biten</div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5 backdrop-blur-sm text-center hover:bg-white/10 transition">
                      <div className="text-2xl font-black text-yellow-400">{stats.efficiencyScore}%</div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Verim</div>
                  </div>
              </div>
          )}
      </header>

      {/* ================= ANA İÇERİK (TABS) ================= */}
      <main className="p-5 space-y-6">
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && !activeJob && (
              <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="space-y-6">
                  
                  {/* Sistem Durumu Kartları */}
                  <div className="flex gap-4">
                      <div className="flex-1 bg-white p-4 rounded-3xl shadow-sm border border-slate-200 flex items-center justify-between">
                          <div>
                              <div className="text-[10px] text-slate-400 font-black uppercase">SAHA DURUMU</div>
                              <div className="text-sm font-bold text-slate-800 mt-1">{weather.condition}</div>
                          </div>
                          {weather.icon === 'sun' ? <Sun className="text-orange-400" size={24}/> : <CloudRain className="text-blue-400" size={24}/>}
                      </div>
                      <div className="flex-1 bg-white p-4 rounded-3xl shadow-sm border border-slate-200 flex items-center justify-between">
                          <div>
                              <div className="text-[10px] text-slate-400 font-black uppercase">BAĞLANTI</div>
                              <div className={`text-sm font-bold mt-1 ${isOnline ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {isOnline ? 'Online' : 'Offline'}
                              </div>
                          </div>
                          {isOnline ? <Wifi className="text-emerald-500" size={24}/> : <WifiOff className="text-red-500" size={24}/>}
                      </div>
                  </div>

                  {/* Öncelikli Görev Kartı */}
                  <div>
                      <div className="flex justify-between items-center mb-3 px-1">
                          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                              <div className="w-1 h-5 bg-blue-600 rounded-full"></div> Sırada Ne Var?
                          </h3>
                      </div>
                      
                      {tasks.length > 0 ? (
                          <div className="bg-white rounded-[28px] p-1 shadow-xl shadow-blue-100/50 border border-slate-100">
                              <div className="bg-slate-50 rounded-[24px] p-5 border border-slate-100 relative overflow-hidden group">
                                  {/* Acil Etiketi */}
                                  <div className="absolute top-0 right-0 bg-red-500 text-white text-[9px] font-black px-3 py-1.5 rounded-bl-2xl shadow-sm flex items-center gap-1">
                                      <AlertTriangle size={10}/> ACİL SERVİS
                                  </div>
                                  
                                  <div className="flex items-start gap-4 mb-4 mt-2">
                                      <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-200">
                                          <Wrench size={20}/>
                                      </div>
                                      <div>
                                          <h4 className="font-black text-slate-800 text-lg leading-tight line-clamp-1">{tasks[0].cranes.customer_name}</h4>
                                          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 font-medium"><MapPin size={12} className="text-red-400"/> {tasks[0].cranes.location_address}</p>
                                      </div>
                                  </div>
                                  
                                  <div className="bg-white p-4 rounded-2xl text-xs text-slate-600 mb-5 border border-slate-200 leading-relaxed font-medium">
                                      {tasks[0].description}
                                  </div>

                                  <button 
                                    onClick={() => startJobSession(tasks[0])}
                                    className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-xl shadow-slate-200 hover:bg-slate-800"
                                  >
                                      <Play size={16} fill="currentColor"/> GÖREVE BAŞLA
                                  </button>
                              </div>
                          </div>
                      ) : (
                          <div className="bg-white p-10 rounded-[32px] border-2 border-dashed border-slate-200 text-center">
                              <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                                  <CheckCircle2 size={36}/>
                              </div>
                              <h4 className="font-black text-slate-700 text-xl">Mükemmel!</h4>
                              <p className="text-sm text-slate-400 mt-2 font-medium">Şu an atanmış aktif görev yok. Dinlenme zamanı ☕</p>
                          </div>
                      )}
                  </div>
              </motion.div>
          )}

          {/* TAB 2: ENVANTER (INVENTORY) */}
          {activeTab === 'inventory' && (
              <motion.div initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">
                  <div className="sticky top-0 z-20 bg-slate-100 pb-2">
                      <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-3">
                          <Search className="text-slate-400" size={20}/>
                          <input 
                            type="text" 
                            placeholder="Parça ara..." 
                            className="flex-1 outline-none text-sm font-bold text-slate-700"
                            onChange={(e) => setSearchText(e.target.value)}
                          />
                      </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                      {inventory.filter(i => i.name.toLowerCase().includes(searchText.toLowerCase())).map((item) => (
                          <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.stock_quantity < 5 ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                                      <Box size={20}/>
                                  </div>
                                  <div>
                                      <div className="font-bold text-slate-700 text-sm">{item.name}</div>
                                      <div className="text-[10px] text-slate-400 font-bold bg-slate-50 px-2 py-0.5 rounded w-fit mt-1">{item.category}</div>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <div className="font-black text-slate-800">{item.stock_quantity} Adet</div>
                                  <div className="text-[10px] text-slate-400 font-bold">{formatCurrency(item.sale_price)}</div>
                              </div>
                          </div>
                      ))}
                  </div>
              </motion.div>
          )}

          {/* --- ACTIVE JOB WIZARD (TAM EKRAN SİHİRBAZ) --- */}
          <AnimatePresence>
          {activeJob && (
              <motion.div 
                initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}} transition={{type: 'spring', damping: 25}}
                className="fixed inset-0 bg-slate-50 z-[100] flex flex-col h-full"
              >
                  {/* Wizard Header */}
                  <div className="bg-slate-900 text-white p-6 pb-10 rounded-b-[40px] shadow-2xl relative shrink-0">
                      <div className="flex justify-between items-center mb-4">
                          <span className="text-[10px] font-bold font-mono bg-white/10 px-3 py-1 rounded-full text-blue-300 border border-white/5">
                              ID: #{activeJob.id.split('-')[0].toUpperCase()}
                          </span>
                          <div className="font-mono text-3xl font-bold tracking-widest text-emerald-400 drop-shadow-md">
                              {formatDuration(jobTimer)}
                          </div>
                      </div>
                      <h2 className="text-2xl font-black leading-tight mb-1">{activeJob.cranes.customer_name}</h2>
                      <p className="text-xs text-slate-400 flex items-center gap-1"><MapPin size={12}/> {activeJob.cranes.location_address}</p>
                      
                      {/* Step Indicator */}
                      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
                          {['start', 'safety', 'diagnosis', 'repair', 'sign'].map((step, idx) => {
                              const steps = ['start', 'safety', 'diagnosis', 'repair', 'sign'];
                              const currentIndex = steps.indexOf(wizardStage);
                              const stepIndex = steps.indexOf(step);
                              return (
                                  <div key={step} className={`h-1.5 rounded-full transition-all duration-500 ${stepIndex <= currentIndex ? 'w-8 bg-blue-500' : 'w-2 bg-slate-700'}`}></div>
                              )
                          })}
                      </div>
                  </div>

                  {/* Wizard Content Area */}
                  <div className="flex-1 overflow-y-auto p-6 pb-24">
                      
                      {/* 1. START STAGE */}
                      {wizardStage === 'start' && (
                          <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} className="space-y-6 text-center pt-10">
                              <div className="w-24 h-24 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto animate-pulse">
                                  <Zap size={48}/>
                              </div>
                              <h3 className="text-2xl font-black text-slate-800">Servis Başlatıldı</h3>
                              <p className="text-slate-500">Sayaç işliyor. Lütfen önce iş güvenliği kontrollerini yap.</p>
                              <button onClick={() => setWizardStage('safety')} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-lg shadow-xl mt-8">
                                  KONTROLLERE BAŞLA
                              </button>
                          </motion.div>
                      )}

                      {/* 2. SAFETY STAGE */}
                      {wizardStage === 'safety' && (
                          <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} className="space-y-5">
                              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><AlertOctagon className="text-orange-500"/> Güvenlik Kontrolü</h3>
                              {['Enerji Kesildi (LOTO)', 'Çevre Güvenliği Alındı', 'KKD Ekipmanları Tam', 'Yüksekte Çalışma Önlemi'].map((item, i) => (
                                  <label key={i} className="flex items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm active:scale-[0.98] transition">
                                      <input 
                                        type="checkbox" 
                                        className="w-6 h-6 accent-blue-600"
                                        onChange={(e) => {
                                            if(i===3 && e.target.checked) setJobData(prev => ({...prev, safetyCheck: true}));
                                        }}
                                      />
                                      <span className="font-bold text-slate-700">{item}</span>
                                  </label>
                              ))}
                              <button onClick={() => jobData.safetyCheck ? setWizardStage('diagnosis') : alert("Lütfen tüm maddeleri onaylayın.")} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg mt-4">
                                  ONAYLA VE DEVAM ET
                              </button>
                          </motion.div>
                      )}

                      {/* 3. DIAGNOSIS (AI) STAGE */}
                      {wizardStage === 'diagnosis' && (
                          <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} className="space-y-6">
                              
                              {/* AI CARD */}
                              <div className="bg-indigo-900 text-white p-5 rounded-2xl relative overflow-hidden shadow-lg shadow-indigo-200">
                                  <div className="absolute -right-4 -top-4 opacity-20"><Cpu size={100}/></div>
                                  <h4 className="font-bold text-lg flex items-center gap-2 relative z-10"><Zap size={18} className="text-yellow-400"/> AI Asistanı</h4>
                                  
                                  {jobData.aiSuggestion ? (
                                      <div className="mt-3 bg-white/10 p-3 rounded-xl text-sm font-medium border border-white/10 relative z-10 animate-in fade-in">
                                          {jobData.aiSuggestion === 'analyzing' ? (
                                              <div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Veriler analiz ediliyor...</div>
                                          ) : jobData.aiSuggestion}
                                      </div>
                                  ) : (
                                      <button onClick={runAiDiagnostics} className="mt-4 bg-white text-indigo-900 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-md relative z-10">
                                          <Play size={12} fill="currentColor"/> ARIZAYI ANALİZ ET
                                      </button>
                                  )}
                              </div>

                              <div>
                                  <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-2 block">TEKNİSYEN TESPİTİ</label>
                                  <textarea 
                                    className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition min-h-[150px] text-slate-700 font-medium"
                                    placeholder="Gözlemlerinizi ve arıza kaynağını detaylıca yazın..."
                                    value={jobData.diagnosis}
                                    onChange={e => setJobData({...jobData, diagnosis: e.target.value})}
                                  ></textarea>
                              </div>
                              
                              <button onClick={() => setWizardStage('repair')} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2">
                                  TESPİTİ KAYDET <ChevronRight size={18}/>
                              </button>
                          </motion.div>
                      )}

                      {/* 4. REPAIR & PARTS STAGE */}
                      {wizardStage === 'repair' && (
                          <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} className="space-y-6">
                              
                              {/* Parts List */}
                              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                                  <div className="flex justify-between items-center mb-4">
                                      <h4 className="font-bold text-slate-800 flex items-center gap-2"><Package size={18}/> Kullanılan Parçalar</h4>
                                      <button onClick={() => setShowInventoryModal(true)} className="bg-blue-50 text-blue-600 p-2 rounded-xl hover:bg-blue-100 transition"><Plus size={20}/></button>
                                  </div>
                                  
                                  {cart.length === 0 ? (
                                      <div className="text-center py-4 text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-dashed border-slate-200">Parça eklenmedi.</div>
                                  ) : (
                                      <div className="space-y-2">
                                          {cart.map((item, i) => (
                                              <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm">
                                                  <span className="font-bold text-slate-700">{item.name}</span>
                                                  <button onClick={() => inventoryController.remove(item.cartId)} className="text-red-400 p-1"><X size={16}/></button>
                                              </div>
                                          ))}
                                      </div>
                                  )}
                              </div>

                              <div>
                                  <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-2 block">YAPILAN İŞLEM</label>
                                  <textarea 
                                    className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition min-h-[150px] text-slate-700 font-medium"
                                    placeholder="Hangi parçalar değişti? Ne ayarlar yapıldı?"
                                    value={jobData.actions}
                                    onChange={e => setJobData({...jobData, actions: e.target.value})}
                                  ></textarea>
                              </div>

                              <button onClick={() => setWizardStage('sign')} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2">
                                  ONARIMI TAMAMLA <ChevronRight size={18}/>
                              </button>
                          </motion.div>
                      )}

                      {/* 5. SIGN STAGE (FINAL) */}
                      {wizardStage === 'sign' && (
                          <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} className="space-y-6 text-center">
                              
                              <div 
                                onClick={() => setJobData(prev => ({...prev, customerSign: true}))}
                                className={`h-56 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${jobData.customerSign ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-slate-300'}`}
                              >
                                  {jobData.customerSign ? (
                                      <motion.div initial={{scale:0.5}} animate={{scale:1}}>
                                          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-3"/>
                                          <div className="text-emerald-700 font-black text-xl">İMZALANDI</div>
                                      </motion.div>
                                  ) : (
                                      <>
                                          <PenTool className="w-12 h-12 text-slate-300 mb-3"/>
                                          <div className="text-slate-500 font-bold">Müşteri İmzası İçin Dokun</div>
                                          <div className="text-xs text-slate-400 mt-1">Onaylamak için tıklayın</div>
                                      </>
                                  )}
                              </div>

                              <div className="bg-blue-50 p-4 rounded-2xl text-xs text-blue-700 text-left leading-relaxed">
                                  <strong>Yasal Uyarı:</strong> Bu imza ile yapılan işlemleri, kullanılan parçaları ve servis süresini onaylamış olursunuz.
                              </div>

                              <button 
                                onClick={commitTransaction}
                                className={`w-full py-4 rounded-2xl font-bold shadow-xl flex items-center justify-center gap-2 text-lg transition-all ${jobData.customerSign ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                              >
                                  <CheckCircle2 size={24}/> SERVİSİ KAPAT
                              </button>
                          </motion.div>
                      )}

                  </div>

                  {/* Wizard Footer (Cancel) */}
                  <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 flex justify-center">
                      <button onClick={terminateJobSession} className="text-xs font-bold text-slate-400 hover:text-red-500 transition">
                          GÖREVİ İPTAL ET
                      </button>
                  </div>

              </motion.div>
          )}
          </AnimatePresence>

          {/* INVENTORY MODAL */}
          <AnimatePresence>
            {showInventoryModal && (
                <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-slate-900/90 z-[150] flex items-end sm:items-center justify-center p-4 backdrop-blur-sm">
                    <motion.div initial={{y:100}} animate={{y:0}} exit={{y:100}} className="bg-white w-full max-w-md rounded-[32px] overflow-hidden max-h-[80vh] flex flex-col shadow-2xl">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 text-lg">Parça Seçimi</h3>
                            <button onClick={() => setShowInventoryModal(false)} className="bg-slate-100 p-2 rounded-full"><X size={20}/></button>
                        </div>
                        <div className="overflow-y-auto p-3 space-y-2">
                            {inventory.map((item) => (
                                <button 
                                    key={item.id} 
                                    onClick={() => inventoryController.add(item)}
                                    className="w-full text-left p-4 rounded-2xl border border-slate-100 bg-white hover:bg-blue-50 hover:border-blue-200 transition flex justify-between items-center group active:scale-[0.98]"
                                >
                                    <div>
                                        <div className="font-bold text-slate-800 group-hover:text-blue-700">{item.name}</div>
                                        <div className="text-xs text-slate-400 mt-0.5">{item.category}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-slate-900">{formatCurrency(item.sale_price)}</div>
                                        <div className="text-[9px] text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded mt-1">Stok: {item.stock_quantity}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </motion.div>
            )}
          </AnimatePresence>
      </main>
      {/* ================= BOTTOM NAVIGATION ================= */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 p-2 pb-8 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-40 flex justify-around items-center rounded-t-[32px]">
          <button onClick={() => setActiveTab('dashboard')} className={`p-3 rounded-2xl transition duration-300 ${activeTab === 'dashboard' ? 'text-blue-600 bg-blue-50 scale-110' : 'text-slate-400 hover:text-slate-600'}`}>
              <Home size={24}/>
          </button>
          <button onClick={() => setActiveTab('inventory')} className={`p-3 rounded-2xl transition duration-300 ${activeTab === 'inventory' ? 'text-blue-600 bg-blue-50 scale-110' : 'text-slate-400 hover:text-slate-600'}`}>
              <Box size={24}/>
          </button>
          
          {/* ORTA FAB (ANA BUTON) */}
          <div className="relative -top-8">
              <button 
                onClick={() => setActiveTab('dashboard')} 
                className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center text-white shadow-2xl shadow-slate-900/40 border-4 border-white hover:scale-110 active:scale-95 transition duration-300"
              >
                  <Zap size={28} fill="currentColor"/>
              </button>
          </div>

          <button onClick={() => setActiveTab('history')} className={`p-3 rounded-2xl transition duration-300 ${activeTab === 'history' ? 'text-blue-600 bg-blue-50 scale-110' : 'text-slate-400 hover:text-slate-600'}`}>
              <History size={24}/>
          </button>
          <button onClick={() => router.push('/login')} className={`p-3 rounded-2xl transition duration-300 text-slate-400 hover:text-red-500`}>
              <LogOut size={24}/>
          </button>
      </div>

    </div>
  );
}