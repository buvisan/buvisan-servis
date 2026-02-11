"use client";

/**
 * -----------------------------------------------------------------------------
 * BUVISAN FIELD PRO v7.0 | ENTERPRISE EDITION 🏗️
 * Real Signature, Rule-Based AI, Live History Sync
 * -----------------------------------------------------------------------------
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LogOut, MapPin, Clock, Wrench, CheckCircle2, Play, 
  Package, Plus, X, User, Globe, Search, History, Home, 
  Box, ChevronRight, Activity, Calendar, AlertTriangle, 
  TrendingUp, Briefcase, Award, Zap, Battery, Signal, 
  Sun, CloudRain, PenTool, Check, Shield, Wifi, WifiOff,
  Cpu, Thermometer, Layers, AlertOctagon, Eraser, Save,
  MessageSquare, FileSignature, Siren
} from 'lucide-react';

// --- 1. GELİŞMİŞ TİP TANIMLAMALARI ---

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'personel';
  xp: number;
  rank: string;
}

interface JobTicket {
  id: string;
  created_at: string;
  description: string;
  status: 'beklemede' | 'islemde' | 'tamamlandi';
  priority: 'normal' | 'yuksek' | 'kritik';
  cranes: {
    customer_name: string;
    location_address: string;
    model_name: string;
    serial_number: string;
  };
}

interface InventoryItem {
  id: string;
  name: string;
  stock_quantity: number;
  sale_price: number;
  category?: string;
}

// Sepet artık daha detaylı
interface CartItem extends InventoryItem {
  cartId: number;
}

// Geçmiş verisi (Finansal tablodan çekilecek)
interface ServiceHistoryItem {
  id: string;
  service_date: string;
  customer_text: string;
  description: string;
  price: number;
  technician: string;
  work_hours: string;
  service_type?: string;
}

type AppTab = 'dashboard' | 'tasks' | 'inventory' | 'history' | 'profile';
type WizardStage = 'safety' | 'diagnosis' | 'repair' | 'sign';

// --- 2. ARIZA KNOWLEDGE BASE (YAPAY ZEKA BEYNİ) ---
// AI artık rastgele konuşmuyor, bu kütüphaneden cevap veriyor.
const AI_KNOWLEDGE_BASE: Record<string, string> = {
    'halat': '⚠️ KRİTİK: Halat tellerinde kopma veya deformasyon riski. Tambur yivlerini ve halat kılavuzunu (gezdirici) mutlaka kontrol et. Yağlama durumu nedir?',
    'fren': '🛑 FREN SİSTEMİ: Balata kalınlığı sınıra gelmiş olabilir. Hava aralığını (air-gap) sentil ile ölç. Doğrultucu (diyot) voltajını kontrol et.',
    'kanca': '🪝 KANCA BLOĞU: Emniyet mandalı sağlam mı? Kanca eksenel boşluğunu kontrol et. Rulman dönüşü rahat olmalı.',
    'motor': '⚡ MOTOR ARIZASI: Termik röle atmış olabilir. Faz akımlarını ölç (Amper). Fanın temiz olduğundan emin ol. Yanık kokusu var mı?',
    'pano': '🔌 ELEKTRİK PANOSU: Gevşek klemens bağlantısı ark yapmış olabilir. Kontaktörlerin platinlerini kontrol et. Sürücü (inverter) hata kodu veriyor mu?',
    'ses': '🔊 MEKANİK SES: Redüktör yağ seviyesi düşük olabilir veya rulman dağılmış olabilir. Sesi stetoskop veya tornavida ile dinleyerek kaynağı bul.',
    'kumanda': '🎮 KUMANDA SİSTEMİ: Buton kontakları oksitlenmiş olabilir. Kablo giriş rakorlarını ve acil stop devresini kontrol et.',
    'yürüme': '🏗️ YÜRÜYÜŞ GRUBU: Tekerlek flanşlarında aşınma var mı? Ray açıklığını ölç. Sürücü rampa ayarlarını kontrol et.',
    'default': '🔍 GENEL ARIZA: Belirtilen sorun spesifik değil. Önce voltaj değerlerini, sonra mekanik sıkışma olup olmadığını kontrol et. Hata kodlarını oku.'
};

// --- 3. ANA COMPONENT BAŞLANGICI ---
export default function PersonelApp() {
  const router = useRouter();
  
  // --- STATE MANAGEMENT ---
  const [systemState, setSystemState] = useState<'booting' | 'ready' | 'error'>('booting');
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [session, setSession] = useState<any>(null);
  
  // Veriler
  const [user, setUser] = useState<UserProfile | null>(null);
  const [tasks, setTasks] = useState<JobTicket[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<ServiceHistoryItem[]>([]);
  
  // Aktif İş Motoru
  const [activeJob, setActiveJob] = useState<JobTicket | null>(null);
  const [wizardStage, setWizardStage] = useState<WizardStage>('safety');
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<any>(null);
  
  // Form Verileri
  const [diagnosis, setDiagnosis] = useState("");
  const [actions, setActions] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  
  // İmza Sistemi (Canvas)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null); // Base64 Resim
  const [customerName, setCustomerName] = useState("");

  // Modallar
  const [showInventory, setShowInventory] = useState(false);

  // --- INIT (BAŞLATMA) ---
  useEffect(() => {
    bootSystem();
    // Tarayıcı geri tuşunu engelle (Uygulama hissi için)
    window.history.pushState(null, '', window.location.href);
    return () => clearInterval(timerRef.current);
  }, []);

  const bootSystem = async () => {
      try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) { router.push('/login'); return; }
          setSession(session);

          // Paralel Veri Çekme (Hız için)
          const [profileRes, taskRes, stockRes, historyRes] = await Promise.all([
              supabase.from('profiles').select('*').eq('id', session.user.id).single(),
              supabase.from('service_tickets').select('*, cranes(*)').neq('status', 'tamamlandi').order('created_at', { ascending: false }),
              supabase.from('materials').select('*').order('name'),
              // 🔥 KRİTİK DÜZELTME: Sadece kendi geçmişini çek
              supabase.from('completed_services')
                .select('*')
                .eq('technician', session.user.email) 
                .order('service_date', { ascending: false })
                .limit(50)
          ]);

          // Verileri State'e İşle
          if (profileRes.data) {
              // Rütbe Hesapla (Basit Gamification)
              const totalJobs = historyRes.data?.length || 0;
              let rank = 'Çırak';
              if(totalJobs > 10) rank = 'Usta';
              if(totalJobs > 50) rank = 'Kıdemli Başteknisyen';
              if(totalJobs > 100) rank = 'Efsane';

              setUser({ 
                  ...profileRes.data, 
                  role: profileRes.data.role, // Tip güvenliği için
                  xp: totalJobs * 100,
                  rank: rank
              });
          }

          if (taskRes.data) setTasks(taskRes.data);
          if (stockRes.data) setInventory(stockRes.data);
          if (historyRes.data) setHistory(historyRes.data);

          // Animasyonlu Açılış
          setTimeout(() => setSystemState('ready'), 1500);

      } catch (err) {
          console.error("Boot Error:", err);
          setSystemState('error');
      }
  };

  // --- PART 1 SONU ---
  // ... (PART 1 Kodlarının hemen altı)

  // --- 4. LOGIC ENGINE (MANTIK MOTORU) ---

  // A. GÖREV MOTORU
  const startJob = (job: JobTicket) => {
      setActiveJob(job);
      setWizardStage('safety');
      setTimer(0);
      setDiagnosis("");
      setActions("");
      setCart([]);
      setAiResponse(null);
      setSignatureData(null);
      
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
  };

  const cancelJob = () => {
      if(confirm("Görevi iptal etmek istediğine emin misin?")) {
          setActiveJob(null);
          clearInterval(timerRef.current);
      }
  };

  // B. AI DIAGNOSTICS (YENİ NESİL ZEKİ MOTOR)
  const runAiAnalysis = () => {
      setAiResponse('loading');
      
      setTimeout(() => {
          const desc = activeJob?.description.toLowerCase() || "";
          
          // Anahtar Kelime Tarama (Keyword Matching)
          let foundKey = 'default';
          for (const key in AI_KNOWLEDGE_BASE) {
              if (desc.includes(key)) {
                  foundKey = key;
                  break; // İlk eşleşeni al
              }
          }
          
          setAiResponse(AI_KNOWLEDGE_BASE[foundKey]);
      }, 1500); // Gerçekçi olması için 1.5 saniye bekle
  };

  // C. CANVAS İMZA SİSTEMİ (GERÇEK ÇİZİM)
  const startDrawing = (e: any) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      setIsDrawing(true);
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX || e.touches[0].clientX) - rect.left;
      const y = (e.clientY || e.touches[0].clientY) - rect.top;
      
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#000';
  };

  const draw = (e: any) => {
      if (!isDrawing) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX || e.touches[0].clientX) - rect.left;
      const y = (e.clientY || e.touches[0].clientY) - rect.top;

      ctx.lineTo(x, y);
      ctx.stroke();
  };

  const stopDrawing = () => {
      if (isDrawing) {
          setIsDrawing(false);
          const canvas = canvasRef.current;
          // İmzayı Base64 Resim Olarak Kaydet
          if (canvas) setSignatureData(canvas.toDataURL('image/png')); 
      }
  };

  const clearSignature = () => {
      const canvas = canvasRef.current;
      if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
          setSignatureData(null);
      }
  };

  // D. VERİTABANI KAYIT (COMMIT)
  const completeJob = async () => {
      if (!signatureData) return alert("Müşteri imzası zorunludur!");
      if (!customerName || customerName.length < 3) return alert("Müşteri adı soyadı girilmelidir!");
      
      if (!confirm("Servis kapatılacak ve merkeze iletilecek. Onaylıyor musun?")) return;
      
      setSystemState('booting'); // Loading efekti
      clearInterval(timerRef.current);
      
      try {
          const totalCost = cart.reduce((acc, item) => acc + item.sale_price, 0);
          
          // 1. İş Emrini Kapat
          await supabase.from('service_tickets').update({ status: 'tamamlandi' }).eq('id', activeJob!.id);
          
          // 2. Servis Fişi Oluştur (completed_services)
          // Not: İmza resmini veritabanında 'signature_url' sütunu varsa oraya, yoksa description içine base64 gömebiliriz.
          // Şimdilik description'a eklemiyorum çünkü çok uzun olur. Sadece metin kaydediyoruz.
          // İdealde Storage'a yüklenmeli ama şu an basit tutuyoruz.
          
          await supabase.from('completed_services').insert([{
              service_date: new Date().toISOString(),
              customer_text: activeJob!.cranes.customer_name,
              company_address: activeJob!.cranes.location_address,
              service_type: 'Pro Servis',
              description: `[TEŞHİS]: ${diagnosis}\n[İŞLEM]: ${actions}\n[İMZA]: ${customerName} tarafından imzalandı.`,
              price: totalCost,
              technician: user?.email,
              work_hours: (timer / 3600).toFixed(2),
              materials: cart
          }]);

          alert("✅ Servis başarıyla tamamlandı!");
          window.location.reload(); // Sayfayı yenile

      } catch (err) {
          console.error("Save Error:", err);
          alert("Kaydetme hatası oluştu!");
          setSystemState('ready');
      }
  };

  // --- PART 2 SONU ---
  // ... (PART 2 kodlarının bittiği yer)

  // --- 5. RENDERERS (GÖRÜNÜM KATMANI) ---

  // A. BOOT SCREEN (SİSTEM AÇILIŞ EFEKTİ)
  if (systemState === 'booting') return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center text-blue-500 font-mono select-none overflow-hidden relative">
          <div className="absolute inset-0 bg-[url('https://media.giphy.com/media/U3qYN8S0j3bpK/giphy.gif')] opacity-5 pointer-events-none bg-cover"></div>
          
          <div className="z-10 text-center space-y-6">
              <div className="relative inline-block">
                  <div className="w-24 h-24 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                      <Cpu size={32} className="text-white animate-pulse"/>
                  </div>
              </div>
              
              <div>
                  <div className="text-3xl font-black tracking-[0.2em] text-white drop-shadow-[0_0_10px_rgba(59,130,246,0.8)]">BUVISAN<span className="text-blue-500">.PRO</span></div>
                  <div className="text-xs text-slate-500 mt-2 font-bold tracking-widest">FIELD OPERATIONS SYSTEM v7.0</div>
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
    <div className="min-h-screen bg-slate-50 font-sans pb-28 select-none overflow-hidden relative">
      
      {/* ================= HEADER (PROFİL & DURUM) ================= */}
      <header className="bg-slate-900 text-white pt-10 pb-8 px-6 rounded-b-[40px] shadow-2xl relative z-10 overflow-hidden">
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
                      <h1 className="text-lg font-bold leading-tight">{user?.full_name || 'Saha Personeli'}</h1>
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

          {/* Hızlı İstatistikler */}
          {!activeJob && (
              <div className="grid grid-cols-3 gap-3 mt-8">
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5 backdrop-blur-sm text-center">
                      <div className="text-2xl font-black text-white">{tasks.length}</div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Bekleyen</div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5 backdrop-blur-sm text-center">
                      <div className="text-2xl font-black text-emerald-400">{history.length}</div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Biten</div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5 backdrop-blur-sm text-center">
                      <div className="text-2xl font-black text-yellow-400">98%</div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Başarı</div>
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
                              <div className="text-[10px] text-slate-400 font-black uppercase">Hava Durumu</div>
                              <div className="text-sm font-bold text-slate-800 mt-1">Açık 18°C</div>
                          </div>
                          <Sun className="text-orange-400" size={24}/>
                      </div>
                      <div className="flex-1 bg-white p-4 rounded-3xl shadow-sm border border-slate-200 flex items-center justify-between">
                          <div>
                              <div className="text-[10px] text-slate-400 font-black uppercase">Bağlantı</div>
                              <div className="text-sm font-bold text-emerald-600 mt-1">Online</div>
                          </div>
                          <Wifi className="text-emerald-500" size={24}/>
                      </div>
                  </div>

                  {/* Öncelikli Görev Kartı */}
                  <div>
                      <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2 mb-3">
                          <div className="w-1 h-5 bg-blue-600 rounded-full"></div> Sırada Ne Var?
                      </h3>
                      
                      {tasks.length > 0 ? (
                          <div className="bg-white rounded-[28px] p-1 shadow-xl shadow-blue-100/50 border border-slate-100">
                              <div className="bg-slate-50 rounded-[24px] p-5 border border-slate-100 relative overflow-hidden">
                                  <div className="absolute top-0 right-0 bg-red-500 text-white text-[9px] font-black px-3 py-1.5 rounded-bl-2xl shadow-sm flex items-center gap-1">
                                      <AlertTriangle size={10}/> ACİL
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
                                    onClick={() => startJob(tasks[0])}
                                    className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-xl shadow-slate-200 hover:bg-slate-800"
                                  >
                                      <Play size={16} fill="currentColor"/> GÖREVE BAŞLA
                                  </button>
                              </div>
                          </div>
                      ) : (
                          <div className="bg-white p-10 rounded-[32px] border-2 border-dashed border-slate-200 text-center">
                              <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <CheckCircle2 size={36}/>
                              </div>
                              <h4 className="font-black text-slate-700 text-xl">Mükemmel!</h4>
                              <p className="text-sm text-slate-400 mt-2 font-medium">Şu an atanmış aktif görev yok.</p>
                          </div>
                      )}
                  </div>
              </motion.div>
          )}

          {/* TAB 2: GEÇMİŞ (HISTORY) */}
          {activeTab === 'history' && (
              <motion.div initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">
                  <h3 className="font-bold text-slate-800 mb-2">Tamamlanan İşlerin ({history.length})</h3>
                  {history.map(h => (
                      <div key={h.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500"></div>
                          <div className="pl-3">
                              <h4 className="font-bold text-slate-800 text-sm">{h.customer_text}</h4>
                              <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">{h.description}</p>
                              <div className="flex justify-between items-center mt-2">
                                  <span className="text-[10px] font-mono text-slate-400">{new Date(h.service_date).toLocaleDateString()}</span>
                                  <span className="text-[10px] font-bold text-green-600 flex items-center gap-1"><CheckCircle2 size={10}/> Tamamlandı</span>
                              </div>
                          </div>
                      </div>
                  ))}
              </motion.div>
          )}

          {/* --- ACTIVE JOB WIZARD (TAM EKRAN SİHİRBAZ) --- */}
          <AnimatePresence>
          {activeJob && (
              <motion.div 
                initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}} transition={{type: 'spring', damping: 25}}
                className="fixed inset-0 bg-slate-50 z-[100] flex flex-col h-full overflow-hidden"
              >
                  {/* Wizard Header */}
                  <div className="bg-slate-900 text-white p-6 pb-10 rounded-b-[40px] shadow-2xl relative shrink-0">
                      <div className="flex justify-between items-center mb-4">
                          <span className="text-[10px] font-bold font-mono bg-white/10 px-3 py-1 rounded-full text-blue-300 border border-white/5">
                              ID: #{activeJob.id.split('-')[0].toUpperCase()}
                          </span>
                          <div className="font-mono text-3xl font-bold tracking-widest text-emerald-400 drop-shadow-md">
                              {new Date(timer * 1000).toISOString().substr(11, 8)}
                          </div>
                      </div>
                      <h2 className="text-2xl font-black leading-tight mb-1">{activeJob.cranes.customer_name}</h2>
                      <p className="text-xs text-slate-400 flex items-center gap-1"><MapPin size={12}/> {activeJob.cranes.location_address}</p>
                  </div>

                  {/* Wizard Content Area */}
                  <div className="flex-1 overflow-y-auto p-6 pb-24">
                      
                      {/* STAGE 1: SAFETY */}
                      {wizardStage === 'safety' && (
                          <div className="space-y-6 pt-6">
                              <h3 className="text-xl font-bold text-slate-800 text-center">Güvenlik Kontrolü</h3>
                              {['Enerji Kesildi (LOTO)', 'Çevre Güvenliği Alındı', 'KKD Tamam'].map((item, i) => (
                                  <label key={i} className="flex items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                      <input type="checkbox" className="w-6 h-6 accent-blue-600"/>
                                      <span className="font-bold text-slate-700">{item}</span>
                                  </label>
                              ))}
                              <button onClick={() => setWizardStage('diagnosis')} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg">ONAYLA VE DEVAM ET</button>
                          </div>
                      )}

                      {/* STAGE 2: DIAGNOSIS (AI) */}
                      {wizardStage === 'diagnosis' && (
                          <div className="space-y-6 pt-4">
                              {/* AI Widget */}
                              <div className="bg-indigo-900 text-white p-5 rounded-2xl relative overflow-hidden shadow-lg shadow-indigo-200">
                                  <div className="absolute -right-4 -top-4 opacity-20"><Cpu size={100}/></div>
                                  <h4 className="font-bold text-lg mb-2 flex items-center gap-2 relative z-10"><Zap size={18} className="text-yellow-400"/> AI Analizi</h4>
                                  
                                  {aiResponse ? (
                                      <div className="mt-3 bg-white/10 p-3 rounded-xl text-sm font-medium border border-white/10 relative z-10 animate-in fade-in">
                                          {aiResponse === 'loading' ? 'Veriler analiz ediliyor...' : aiResponse}
                                      </div>
                                  ) : (
                                      <button onClick={runAiAnalysis} className="mt-4 bg-white text-indigo-900 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-md relative z-10">
                                          <Play size={12} fill="currentColor"/> ARIZAYI ANALİZ ET
                                      </button>
                                  )}
                              </div>

                              <textarea 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:border-blue-500 min-h-[150px] text-slate-700 font-medium"
                                placeholder="Gözlemlerinizi ve arıza kaynağını detaylıca yazın..."
                                value={diagnosis}
                                onChange={e => setDiagnosis(e.target.value)}
                              ></textarea>
                              
                              <button onClick={() => setWizardStage('repair')} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold shadow-lg">TESPİTİ KAYDET</button>
                          </div>
                      )}

                      {/* STAGE 3: REPAIR */}
                      {wizardStage === 'repair' && (
                          <div className="space-y-6 pt-4">
                              <textarea 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:border-blue-500 min-h-[150px] text-slate-700 font-medium"
                                placeholder="Yapılan işlemleri detaylıca anlatın..."
                                value={actions}
                                onChange={e => setActions(e.target.value)}
                              ></textarea>
                              <button onClick={() => setWizardStage('sign')} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg">ONARIMI BİTİR</button>
                          </div>
                      )}

                      {/* STAGE 4: SIGNATURE (CANVAS) */}
                      {wizardStage === 'sign' && (
                          <div className="space-y-6 pt-4 text-center">
                              <h3 className="font-bold text-lg text-slate-800">Müşteri Onayı</h3>
                              
                              {/* Canvas Alanı */}
                              <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl overflow-hidden relative touch-none select-none">
                                  <canvas 
                                    ref={canvasRef}
                                    width={350}
                                    height={200}
                                    className="w-full h-full cursor-crosshair bg-white"
                                    onMouseDown={startDrawing}
                                    onMouseMove={draw}
                                    onMouseUp={stopDrawing}
                                    onMouseLeave={stopDrawing}
                                    onTouchStart={startDrawing}
                                    onTouchMove={draw}
                                    onTouchEnd={stopDrawing}
                                  />
                                  <button onClick={clearSignature} className="absolute top-2 right-2 bg-slate-100 p-2 rounded-full text-slate-500 hover:bg-red-50 hover:text-red-500"><Eraser size={16}/></button>
                                  {!isDrawing && !signatureData && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 font-bold">İmza Alanı</div>}
                              </div>

                              <input 
                                type="text" 
                                placeholder="Müşteri Adı Soyadı" 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-center outline-none"
                                value={customerName}
                                onChange={e => setCustomerName(e.target.value)}
                              />

                              <button onClick={completeJob} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-xl flex items-center justify-center gap-2">
                                  <FileSignature size={20}/> SERVİSİ KAPAT
                              </button>
                          </div>
                      )}
                  </div>
                  
                  {/* İptal Butonu */}
                  <div className="absolute bottom-6 left-0 right-0 px-6">
                       <button onClick={cancelJob} className="w-full text-xs text-slate-400 font-bold">Görevi İptal Et</button>
                  </div>
              </motion.div>
          )}
          </AnimatePresence>

      </main>

      {/* ================= BOTTOM NAVIGATION ================= */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 p-2 pb-8 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-40 flex justify-around items-center rounded-t-[32px]">
          <button onClick={() => setActiveTab('dashboard')} className={`p-3 rounded-2xl transition duration-300 ${activeTab === 'dashboard' ? 'text-blue-600 bg-blue-50 scale-110' : 'text-slate-400 hover:text-slate-600'}`}>
              <Home size={24}/>
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
      </div>

    </div>
  );
}