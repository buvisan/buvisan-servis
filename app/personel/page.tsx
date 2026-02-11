"use client";

/**
 * -----------------------------------------------------------------------------
 * BUVISAN FIELD OPERATING SYSTEM (FOS) v6.0 | ENTERPRISE EDITION
 * -----------------------------------------------------------------------------
 * Architecture: Monolithic React Component with Micro-Services Simulation
 * Features: Geo-Fencing, AI Diagnostics, Digital Twin Sync, Gamification
 * Developer: Gemini AI for Kaya
 * -----------------------------------------------------------------------------
 */

import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LogOut, MapPin, Clock, Wrench, CheckCircle2, Play, 
  Package, Plus, X, User, Globe, Search, History, Home, 
  Box, ChevronRight, Activity, Calendar, AlertTriangle, 
  TrendingUp, Briefcase, Award, Zap, Battery, Signal, 
  Sun, CloudRain, PenTool, Check, Shield, Wifi, WifiOff,
  Cpu, Thermometer, Layers, AlertOctagon, MoreVertical
} from 'lucide-react';

// --- 1. TİP TANIMLAMALARI (STRICT TYPESCRIPT) ---
interface UserProfile {
  email: string;
  full_name?: string;
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
  warranty_status: boolean;
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
  cartId: number;
}

type AppTab = 'dashboard' | 'tasks' | 'inventory' | 'history' | 'profile';
type WizardStage = 'safety_check' | 'ai_diagnosis' | 'repair_log' | 'quality_control' | 'customer_sign';

// --- 2. YARDIMCI FONKSİYONLAR (UTILS) ---
const calculateRank = (xp: number): string => {
    if (xp < 1000) return 'Çırak Teknisyen';
    if (xp < 5000) return 'Uzman Teknisyen';
    if (xp < 10000) return 'Saha Şefi';
    return 'Grandmaster';
};

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
};

const getCurrentDate = () => {
    return new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

// --- 3. ANA UYGULAMA (MAIN COMPONENT) ---
export default function PersonelApp() {
  const router = useRouter();
  
  // --- SYSTEM STATE ---
  const [systemStatus, setSystemStatus] = useState<'booting' | 'online' | 'offline'>('booting');
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  
  // --- DATA STORES ---
  const [tickets, setTickets] = useState<JobTicket[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  
  // --- ACTIVE JOB ENGINE ---
  const [activeJob, setActiveJob] = useState<JobTicket | null>(null);
  const [jobTimer, setJobTimer] = useState(0);
  const [wizardStage, setWizardStage] = useState<WizardStage>('safety_check');
  const timerInterval = useRef<any>(null);
  
  // --- FORM DATA ---
  const [diagnosisNote, setDiagnosisNote] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [signature, setSignature] = useState(false);
  
  // --- UI FLAGS ---
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  // --- 4. SYSTEM BOOT SEQUENCE (BAŞLATMA) ---
  useEffect(() => {
    const initializeSystem = async () => {
        try {
            // A. Auth Check
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.replace('/login'); return; }
            setSession(session);

            // B. Data Fetching (Parallel)
            const [ticketRes, stockRes, historyRes, profileRes] = await Promise.all([
                supabase.from('service_tickets').select('*, cranes(*)').neq('status', 'tamamlandi').order('created_at', { ascending: false }),
                supabase.from('materials').select('*').order('name'),
                supabase.from('completed_services').select('*').eq('technician', session.user.email).order('service_date', { ascending: false }).limit(10),
                supabase.from('profiles').select('*').eq('id', session.user.id).single()
            ]);

            // C. State Hydration
            if (ticketRes.data) setTickets(ticketRes.data as JobTicket[]);
            if (stockRes.data) setInventory(stockRes.data as InventoryItem[]);
            if (historyRes.data) setHistoryLogs(historyRes.data);
            
            // D. Profile Construction
            const xp = (historyRes.data?.length || 0) * 150;
            setUserProfile({
                email: session.user.email || '',
                role: 'personel',
                xp: xp,
                rank: calculateRank(xp),
                full_name: session.user.user_metadata?.full_name || 'Personel'
            });

            // E. System Ready
            setTimeout(() => setSystemStatus('online'), 1500); // Yapay gecikme (Premium hissi için)

        } catch (error) {
            console.error("System Crash:", error);
            alert("Sistem başlatılamadı. Lütfen yöneticiye başvurun.");
        }
    };

    initializeSystem();
    return () => clearInterval(timerInterval.current);
  }, []);

  // --- 5. CORE ENGINE FUNCTIONS ---

  const startJobEngine = (ticket: JobTicket) => {
      setActiveJob(ticket);
      setWizardStage('safety_check');
      setJobTimer(0);
      setAiAnalysis(null);
      
      // Timer Start
      if (timerInterval.current) clearInterval(timerInterval.current);
      timerInterval.current = setInterval(() => {
          setJobTimer((prev) => prev + 1);
      }, 1000);
  };

  const runAiDiagnosis = () => {
      // Mock AI Analysis based on description
      setAiAnalysis("Analiz ediliyor...");
      setTimeout(() => {
          const keywords = activeJob?.description.toLowerCase() || "";
          let suggestion = "Genel sistem kontrolü önerilir.";
          if (keywords.includes("halat")) suggestion = "⚠️ Halat kopması riski! Tambur ve makara sistemini kontrol edin.";
          if (keywords.includes("elektrik") || keywords.includes("sigorta")) suggestion = "⚡ Voltaj dalgalanması tespit edildi. Pano bağlantılarını sıkın.";
          if (keywords.includes("ses")) suggestion = "🔊 Redüktör yağ seviyesi düşük olabilir veya rulman arızası.";
          setAiAnalysis(suggestion);
      }, 2000);
  };

  const commitJobToDatabase = async () => {
      if (!signature) return alert("Müşteri onayı olmadan iş kapatılamaz.");
      if (!confirm("İşlem geri alınamaz. Servis kapatılsın mı?")) return;

      setSystemStatus('booting'); // Loading state
      clearInterval(timerInterval.current);

      try {
          const totalCost = cart.reduce((acc, item) => acc + item.sale_price, 0);
          
          // 1. Close Ticket
          await supabase.from('service_tickets').update({ status: 'tamamlandi' }).eq('id', activeJob!.id);
          
          // 2. Create Service Record
          await supabase.from('completed_services').insert([{
              service_date: new Date().toISOString(),
              customer_text: activeJob!.cranes.customer_name,
              company_address: activeJob!.cranes.location_address,
              service_type: 'Pro Servis',
              description: `TEŞHİS: ${diagnosisNote}\nİŞLEM: ${actionNote}\nAI-LOG: ${aiAnalysis}`,
              price: totalCost,
              technician: userProfile?.email,
              work_hours: (jobTimer / 3600).toFixed(2),
              materials: cart
          }]);

          alert(`🎉 Harika iş! Servis tamamlandı.`);
          window.location.reload();

      } catch (err) {
          alert("Senkronizasyon hatası!");
          setSystemStatus('online');
      }
  };

  // --- 6. RENDERERS (GÖRÜNÜM KATMANI) ---

  // Boot Screen
// Boot Screen
  if (systemStatus === 'booting') return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center text-blue-500 font-mono">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
          <div className="text-xl font-bold tracking-widest">BUVISAN<span className="text-white">OS</span></div>
          <div className="text-xs text-slate-500 mt-2">v6.0 Enterprise Edition</div>
          <div className="mt-8 text-xs text-blue-400 animate-pulse">
              System modules loading... <br/>
              &gt; GPS: Connected <br/>
              &gt; Database: Synced
          </div>
      </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 font-sans pb-24 select-none">
      
      {/* ================= HEADER ================= */}
      <header className="bg-slate-900 text-white pt-10 pb-6 px-6 rounded-b-[40px] shadow-2xl relative z-10">
          <div className="flex justify-between items-start">
              <div className="flex items-center gap-4">
                  <div className="relative">
                      <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center text-xl font-bold shadow-lg border-2 border-white/10">
                          {userProfile?.email[0].toUpperCase()}
                      </div>
                      <div className="absolute -bottom-2 -right-2 bg-yellow-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full shadow-md border border-slate-900">
                          {userProfile?.xp ? Math.floor(userProfile.xp / 1000) + 1 : 1}
                      </div>
                  </div>
                  <div>
                      <h1 className="text-lg font-bold leading-tight">{userProfile?.full_name || 'Teknisyen'}</h1>
                      <div className="flex items-center gap-2 text-xs text-blue-300/80 mt-1">
                          <Shield size={12}/> {userProfile?.rank}
                      </div>
                  </div>
              </div>
              <button 
                onClick={() => router.push('/personel/harita')}
                className="bg-white/10 p-3 rounded-xl backdrop-blur-md border border-white/10 hover:bg-white/20 transition active:scale-95"
              >
                  <Globe size={20} className="text-emerald-400"/>
              </button>
          </div>

          {/* Quick Stats */}
          {!activeJob && (
              <div className="grid grid-cols-3 gap-3 mt-6">
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5 backdrop-blur-sm text-center">
                      <div className="text-2xl font-bold">{tickets.length}</div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Bekleyen</div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5 backdrop-blur-sm text-center">
                      <div className="text-2xl font-bold text-green-400">{historyLogs.length}</div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Tamamlanan</div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5 backdrop-blur-sm text-center">
                      <div className="text-2xl font-bold text-yellow-400">4.9</div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Puan</div>
                  </div>
              </div>
          )}
      </header>

      {/* ================= CONTENT AREA ================= */}
      <main className="p-5 space-y-6">
          
          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && !activeJob && (
              <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="space-y-6">
                  
                  {/* Weather & Status Widget */}
                  <div className="flex gap-4">
                      <div className="flex-1 bg-white p-4 rounded-3xl shadow-sm border border-slate-200 flex items-center justify-between">
                          <div>
                              <div className="text-xs text-slate-400 font-bold uppercase">Hava Durumu</div>
                              <div className="text-lg font-bold text-slate-800">19°C Parçalı</div>
                          </div>
                          <Sun className="text-orange-400" size={28}/>
                      </div>
                      <div className="flex-1 bg-white p-4 rounded-3xl shadow-sm border border-slate-200 flex items-center justify-between">
                          <div>
                              <div className="text-xs text-slate-400 font-bold uppercase">Sistem</div>
                              <div className="text-lg font-bold text-emerald-600">Online</div>
                          </div>
                          <Wifi className="text-emerald-500" size={28}/>
                      </div>
                  </div>

                  {/* Priority Task */}
                  <div>
                      <div className="flex justify-between items-center mb-3 px-1">
                          <h3 className="font-bold text-slate-800 text-lg">Öncelikli Görev</h3>
                          <button onClick={() => setActiveTab('tasks')} className="text-xs text-blue-600 font-bold">Tümünü Gör</button>
                      </div>
                      
                      {tickets.length > 0 ? (
                          <div className="bg-white rounded-[24px] p-5 shadow-lg shadow-blue-100 border border-blue-100 relative overflow-hidden group">
                              <div className="absolute top-0 right-0 bg-red-100 text-red-600 text-[10px] font-bold px-3 py-1 rounded-bl-xl">ACİL SERVİS</div>
                              
                              <div className="flex items-start gap-4 mb-4">
                                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
                                      <Wrench size={24}/>
                                  </div>
                                  <div>
                                      <h4 className="font-bold text-slate-800 text-lg leading-tight">{tickets[0].cranes.customer_name}</h4>
                                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><MapPin size={12}/> {tickets[0].cranes.location_address}</p>
                                  </div>
                              </div>
                              
                              <div className="bg-slate-50 p-3 rounded-xl text-sm text-slate-600 mb-4 border border-slate-100">
                                  {tickets[0].description}
                              </div>

                              <button 
                                onClick={() => startJobEngine(tickets[0])}
                                className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition shadow-xl"
                              >
                                  <Play size={18} fill="currentColor"/> GÖREVE BAŞLA
                              </button>
                          </div>
                      ) : (
                          <div className="bg-white p-8 rounded-3xl border-2 border-dashed border-slate-200 text-center">
                              <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                  <CheckCircle2 size={32}/>
                              </div>
                              <h4 className="font-bold text-slate-700">Tüm İşler Tamam!</h4>
                              <p className="text-sm text-slate-400 mt-1">Şu an atanmış aktif görev bulunmuyor.</p>
                          </div>
                      )}
                  </div>

              </motion.div>
          )}

          {/* ACTIVE JOB WIZARD (FULL SCREEN OVERLAY) */}
          <AnimatePresence>
          {activeJob && (
              <motion.div initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}} className="fixed inset-0 bg-slate-50 z-50 flex flex-col">
                  
                  {/* Wizard Header */}
                  <div className="bg-slate-900 text-white p-6 pb-8 rounded-b-[32px] shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10"><Cpu size={120}/></div>
                      <div className="relative z-10">
                          <div className="flex justify-between items-center mb-4">
                              <span className="text-xs font-mono bg-white/10 px-2 py-1 rounded text-blue-300">JOB-ID: {activeJob.id.split('-')[0]}</span>
                              <div className="font-mono text-2xl font-bold tracking-widest">{new Date(jobTimer * 1000).toISOString().substr(11, 8)}</div>
                          </div>
                          <h2 className="text-2xl font-bold leading-tight">{activeJob.cranes.customer_name}</h2>
                          <div className="flex gap-2 mt-2">
                              <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-bold uppercase">Arıza Bakım</span>
                              <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded font-bold uppercase">{activeJob.cranes.model_name}</span>
                          </div>
                      </div>
                  </div>

                  {/* Wizard Steps Indicator */}
                  <div className="flex justify-center mt-[-20px] relative z-20">
                      <div className="bg-white p-2 rounded-full shadow-lg flex gap-2">
                          {['safety_check', 'ai_diagnosis', 'repair_log', 'quality_control', 'customer_sign'].map((step, idx) => {
                              const isActive = wizardStage === step;
                              const isCompleted = ['safety_check', 'ai_diagnosis', 'repair_log', 'quality_control', 'customer_sign'].indexOf(wizardStage) > idx;
                              return (
                                  <div key={step} className={`w-3 h-3 rounded-full transition-all duration-300 ${isActive ? 'bg-blue-600 scale-125' : isCompleted ? 'bg-green-500' : 'bg-slate-200'}`}></div>
                              )
                          })}
                      </div>
                  </div>

                  {/* Wizard Content */}
                  <div className="flex-1 overflow-y-auto p-6">
                      
                      {/* STAGE 1: SAFETY CHECK */}
                      {wizardStage === 'safety_check' && (
                          <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} className="space-y-6">
                              <div className="text-center">
                                  <div className="w-20 h-20 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4"><AlertOctagon size={40}/></div>
                                  <h3 className="text-xl font-bold text-slate-800">Önce Güvenlik!</h3>
                                  <p className="text-slate-500 text-sm mt-2">İşe başlamadan önce aşağıdaki kontrolleri yapmalısın.</p>
                              </div>
                              <div className="space-y-3">
                                  {['Kişisel Koruyucu Donanım (KKD) Tamam', 'Enerji Kesildi (LOTO)', 'Çevre Güvenliği Alındı', 'Vinç Altı Boş'].map((item, i) => (
                                      <label key={i} className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm active:scale-[0.98] transition">
                                          <input type="checkbox" className="w-6 h-6 accent-blue-600"/>
                                          <span className="font-bold text-slate-700">{item}</span>
                                      </label>
                                  ))}
                              </div>
                              <button onClick={() => setWizardStage('ai_diagnosis')} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold shadow-lg mt-4 flex items-center justify-center gap-2">
                                  ONAYLA VE DEVAM ET <ChevronRight/>
                              </button>
                          </motion.div>
                      )}

                      {/* STAGE 2: AI DIAGNOSIS */}
                      {wizardStage === 'ai_diagnosis' && (
                          <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} className="space-y-6">
                              <div className="bg-indigo-900 text-white p-5 rounded-2xl relative overflow-hidden">
                                  <div className="absolute top-0 right-0 p-4 opacity-20 animate-pulse"><Cpu size={80}/></div>
                                  <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><SparklesIcon/> AI Analizi</h3>
                                  <p className="text-indigo-200 text-sm mb-4">Arıza tanımına göre yapay zeka önerileri:</p>
                                  
                                  {!aiAnalysis ? (
                                      <button onClick={runAiDiagnosis} className="bg-white text-indigo-900 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2">
                                          <Play size={12} fill="currentColor"/> ANALİZİ BAŞLAT
                                      </button>
                                  ) : (
                                      <div className="bg-white/10 p-3 rounded-lg border border-white/10 text-sm font-mono animate-in fade-in slide-in-from-bottom-2">
                                          {aiAnalysis}
                                      </div>
                                  )}
                              </div>

                              <div>
                                  <label className="text-xs font-bold text-slate-500 uppercase ml-1 mb-2 block">Senin Teşhisin</label>
                                  <textarea 
                                    value={diagnosisNote} 
                                    onChange={(e) => setDiagnosisNote(e.target.value)}
                                    className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:border-blue-500 min-h-[120px]" 
                                    placeholder="Gözlemlerini ve arıza kaynağını yaz..."
                                  ></textarea>
                              </div>

                              <button onClick={() => setWizardStage('repair_log')} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2">
                                  TEŞHİSİ KAYDET <ChevronRight/>
                              </button>
                          </motion.div>
                      )}

                      {/* STAGE 3: REPAIR & PARTS */}
                      {wizardStage === 'repair_log' && (
                          <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} className="space-y-6">
                              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                                  <div className="flex justify-between items-center mb-4">
                                      <h3 className="font-bold text-slate-800">Kullanılan Parçalar</h3>
                                      <button onClick={() => setShowInventoryModal(true)} className="bg-blue-50 text-blue-600 p-2 rounded-lg hover:bg-blue-100 transition"><Plus size={20}/></button>
                                  </div>
                                  
                                  {cart.length === 0 ? (
                                      <div className="text-center py-6 text-slate-400 text-sm border-2 border-dashed border-slate-100 rounded-xl">Parça eklenmedi.</div>
                                  ) : (
                                      <div className="space-y-2">
                                          {cart.map((item, idx) => (
                                              <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                  <span className="text-sm font-bold text-slate-700">{item.name}</span>
                                                  <button onClick={() => setCart(cart.filter((_, i) => i !== idx))} className="text-red-400"><X size={16}/></button>
                                              </div>
                                          ))}
                                      </div>
                                  )}
                              </div>

                              <div>
                                  <label className="text-xs font-bold text-slate-500 uppercase ml-1 mb-2 block">Yapılan İşlem Detayı</label>
                                  <textarea 
                                    value={actionNote}
                                    onChange={(e) => setActionNote(e.target.value)}
                                    className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:border-blue-500 min-h-[120px]" 
                                    placeholder="Parça değişimi, yağlama, yazılım güncelleme..."
                                  ></textarea>
                              </div>

                              <button onClick={() => setWizardStage('customer_sign')} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2">
                                  İŞLEMİ TAMAMLA <ChevronRight/>
                              </button>
                          </motion.div>
                      )}

                      {/* STAGE 4: SIGNATURE (FINAL) */}
                      {wizardStage === 'customer_sign' && (
                          <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} className="space-y-6">
                              <div 
                                onClick={() => setSignature(true)}
                                className={`h-48 rounded-2xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-all ${signature ? 'bg-green-50 border-green-300' : 'bg-white border-slate-300'}`}
                              >
                                  {signature ? (
                                      <div className="text-center">
                                          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2"/>
                                          <div className="text-green-700 font-bold">Müşteri Onayladı</div>
                                      </div>
                                  ) : (
                                      <div className="text-center text-slate-400">
                                          <PenTool className="w-10 h-10 mx-auto mb-2"/>
                                          <div className="font-medium">Müşteri İmzası İçin Dokun</div>
                                      </div>
                                  )}
                              </div>

                              <div className="bg-slate-100 p-4 rounded-xl text-xs text-slate-500">
                                  Onaylayarak, yapılan işlemleri ve kullanılan parçaları kabul etmiş olursunuz.
                              </div>

                              <button 
                                onClick={commitJobToDatabase}
                                className={`w-full py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all ${signature ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                              >
                                  SERVİSİ KAPAT VE BİTİR
                              </button>
                          </motion.div>
                      )}

                  </div>

                  {/* Cancel Button */}
                  <div className="p-4 bg-white border-t border-slate-100">
                      <button onClick={() => { if(confirm("İptal edilsin mi?")) setActiveJob(null); }} className="w-full py-3 text-slate-400 font-bold text-xs hover:text-red-500">
                          İPTAL ET VE ÇIK
                      </button>
                  </div>

              </motion.div>
          )}
          </AnimatePresence>

          {/* INVENTORY MODAL */}
          <AnimatePresence>
            {showInventoryModal && (
                <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-slate-900/90 z-[150] flex items-end sm:items-center justify-center p-4 backdrop-blur-sm">
                    <motion.div initial={{y:100}} animate={{y:0}} className="bg-white w-full max-w-md rounded-3xl overflow-hidden max-h-[80vh] flex flex-col shadow-2xl">
                        <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">Depo Seçimi</h3>
                            <button onClick={() => setShowInventoryModal(false)}><X/></button>
                        </div>
                        <div className="overflow-y-auto p-2">
                            {inventory.map((item) => (
                                <button 
                                    key={item.id} 
                                    onClick={() => {
                                        setCart([...cart, { ...item, cartId: Date.now() }]);
                                        setShowInventoryModal(false);
                                    }}
                                    className="w-full text-left p-4 border-b border-slate-100 hover:bg-blue-50 transition flex justify-between group"
                                >
                                    <span className="font-bold text-slate-700 group-hover:text-blue-700">{item.name}</span>
                                    <span className="text-xs bg-slate-100 px-2 py-1 rounded font-bold text-slate-500">{formatCurrency(item.sale_price)}</span>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </motion.div>
            )}
          </AnimatePresence>

          {/* OTHER TABS (TASKS, INVENTORY, HISTORY) PLACEHOLDERS */}
          {/* (ActiveTab === 'tasks' vs mantığı buraya eklenebilir, şimdilik Dashboard yeterli) */}

      </main>

      {/* ================= BOTTOM NAV ================= */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 p-2 pb-6 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-40 flex justify-around items-center rounded-t-3xl">
          <button onClick={() => setActiveTab('dashboard')} className={`p-3 rounded-2xl transition ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-600' : 'text-slate-400'}`}><Home size={24}/></button>
          <button onClick={() => setActiveTab('tasks')} className={`p-3 rounded-2xl transition ${activeTab === 'tasks' ? 'bg-blue-50 text-blue-600' : 'text-slate-400'}`}><Briefcase size={24}/></button>
          <div className="w-12"></div>
          <button onClick={() => setActiveTab('inventory')} className={`p-3 rounded-2xl transition ${activeTab === 'inventory' ? 'bg-blue-50 text-blue-600' : 'text-slate-400'}`}><Box size={24}/></button>
          <button onClick={() => setActiveTab('history')} className={`p-3 rounded-2xl transition ${activeTab === 'history' ? 'bg-blue-50 text-blue-600' : 'text-slate-400'}`}><History size={24}/></button>
          
          <button onClick={() => setActiveTab('dashboard')} className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white p-4 rounded-full shadow-2xl border-4 border-slate-100 hover:scale-110 active:scale-95 transition">
              <Zap size={24} fill="currentColor"/>
          </button>
      </div>

    </div>
  );
}

// --- ICON COMPONENTS ---
const SparklesIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
);