"use client";

/**
 * -----------------------------------------------------------------------------
 * BUVISAN FIELD OS [PLATINUM EDITION] | PART 1: CORE & EXPERT AI
 * -----------------------------------------------------------------------------
 * Features:
 * - NO External Animation Libs (Zero Error)
 * - BUVISAN EXPERT AI v2.0 (Deep Learning Simulation)
 * - Advanced Crane Diagnostics (Monorail, Double Girder, Elevator)
 * -----------------------------------------------------------------------------
 */

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { 
  LogOut, MapPin, Wrench, CheckCircle2, Play, 
  Package, Plus, X, Globe, Search, History, Home, 
  Box, ChevronRight, AlertTriangle, AlertOctagon,
  Zap, Sun, CloudRain, Wifi, Loader2, Cpu,
  PenTool, Eraser, FileSignature, Award, Shield,
  MoreVertical, Calendar, User, ArrowRight, BrainCircuit
} from 'lucide-react';

// --- 1. TİP TANIMLAMALARI (TYPESCRIPT FIX) ---

type UserRole = 'admin' | 'personel';
type JobStatus = 'beklemede' | 'islemde' | 'tamamlandi';
type AppTab = 'dashboard' | 'inventory' | 'history';
type WizardStage = 'start' | 'safety' | 'diagnosis' | 'repair' | 'sign';

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  xp: number;
  rank: string;
}

interface JobTicket {
  id: string;
  created_at: string;
  description: string;
  status: string;
  priority: 'normal' | 'yuksek' | 'kritik';
  cranes: {
    customer_name: string;
    location_address: string;
    model_name: string; // Örn: "Çift Kiriş Gezer Köprülü"
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

interface CartItem extends InventoryItem {
  cartId: number;
}

interface WeatherData {
  temp: number;
  condition: string;
  code: number;
}

// --- 2. BUVISAN EXPERT AI DATABASE (DEVASA ARIZA KÜTÜPHANESİ) ---
// Vinç tiplerine ve spesifik arızalara göre dallanan akıllı yapı.

const EXPERT_KNOWLEDGE_BASE = {
  // A. MONORAY VİNÇ SİSTEMLERİ
  monoray: {
    'halat': '⚠️ MONORAY HALAT HATASI: Halat kılavuzu (gezdirici) plastik segmanlarını kontrol et. Halatın tambur yivlerine tam oturup oturmadığına bak. Halat çapında %10 incelme varsa DEĞİŞTİR.',
    'yürüme': '🏗️ MONORAY YÜRÜYÜŞ: Araba pinyon dişlisi sıyırmış olabilir. Tekerlek rulman boşluklarını kontrol et. Fren balatası diske yapışık kalmış olabilir.',
    'kanca': '🪝 KANCA BLOĞU: Monoray kancaları sık döner. Eksenel rulman kilitlenmiş olabilir. Kanca ağzı açıklığı %10\'u geçtiyse raporla.'
  },
  
  // B. ÇİFT KİRİŞ (DOUBLE GIRDER) SİSTEMLERİ
  ciftkiris: {
    'köprü': '🌉 KÖPRÜ YÜRÜYÜŞ: Başlık (End carriage) tekerlekleri raya sürtüyor olabilir (Kusma). Ray açıklığını (Span) lazer metre ile ölç. Redüktör tork kolu gevşemiş olabilir.',
    'kedi': '🐱 KEDİ (ARABA) SORUNU: Araba raylarında kot farkı olabilir. Kablo taşıma sistemi (Festoon) kornişe takılıyor mu kontrol et.',
    'halat': '⚠️ ANA KALDIRMA HALATI: Çift donanım halatlarında dengesiz yüklenme olabilir. Denge makarasını (Equalizer) kontrol et.',
    'senkron': '🔄 SENKRONİZASYON: Çift motorlu sistemde motorlardan biri termik açmış veya manyetik fren geç açıyor. Sürücü parametrelerinden (Master/Slave) ayar gerekebilir.'
  },

  // C. SABİT VİNÇ / YÜK ASANSÖRÜ
  asansor: {
    'kabin': '📦 KABİN/PLATFORM: Kabin patenleri raylarda sıkışıyor. Ray yağlamasını kontrol et. Paraşüt fren sistemi devreye girmiş mi?',
    'hidrolik': '🛢️ HİDROLİK ÜNİTE: Valf bloğunda sızıntı veya tıkanıklık var. Yağ basıncını manometre ile ölç. Hortum rekorlarını sık.',
    'kapı': '🚪 KAPI KİLİT MEKANİZMASI: Kapı fiş kontakları (Switch) devreyi tamamlamıyor. Kilit dilinin yuvasına tam oturduğundan emin ol.'
  },

  // D. GENEL ELEKTRİK & SÜRÜCÜ (Tüm Vinçler İçin)
  elektrik: {
    'sürücü': '⚡ SÜRÜCÜ (INVERTER) HATASI: Ekrandaki hata kodunu (OC, OV, OL) oku. Frenleme direnci (Braking Resistor) yanmış veya kablosu kopmuş olabilir.',
    'faz': '🔌 FAZ HATASI: Faz koruma rölesi (FKR) devrede. Şebeke voltajlarını ölç. Nötr gevşekliği olabilir.',
    'kontaktör': '🔥 KONTAKTÖR YAPIŞMASI: Ana kaldırma kontaktörü platinleri ark yapmış. Acil stop devresini test et ve kontaktörü değiştir.'
  },
  
  // E. VARSAYILAN (Tanımsız)
  default: '🔍 DETAYLI ANALİZ GEREKLİ: Belirtilen arıza spesifik bir kategoriye girmiyor. Lütfen şu sırayla kontrol et: 1. Enerji Girişi 2. Kumanda Devresi 3. Mekanik Sıkışma 4. Sürücü Hata Kodları.'
};

// --- BÖLÜM 1 SONU ---
// ... (BÖLÜM 1 Kodlarının hemen altı)

// --- 3. ANA COMPONENT (LOGIC ENGINE) ---
export default function PersonelApp() {
  const router = useRouter();
  
  // ================= STATE MANAGEMENT (DURUM YÖNETİMİ) =================
  // Not: TypeScript hatası almamak için tipleri 'as' ile belirtiyoruz.
  
  // A. SİSTEM & KULLANICI
  const [systemState, setSystemState] = useState<'booting' | 'ready' | 'error'>('booting');
  const [activeTab, setActiveTab] = useState('dashboard' as AppTab);
  const [user, setUser] = useState<UserProfile | null>(null);
  
  // B. VERİ HAVUZLARI
  const [tasks, setTasks] = useState<JobTicket[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [weather, setWeather] = useState<WeatherData>({ temp: 0, condition: 'Yükleniyor', code: 0 });

  // C. AKTİF İŞ MOTORU
  const [activeJob, setActiveJob] = useState<JobTicket | null>(null);
  const [wizardStage, setWizardStage] = useState('start' as WizardStage);
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<any>(null);

  // D. FORM & İŞLEM VERİLERİ
  const [diagnosis, setDiagnosis] = useState("");
  const [actions, setActions] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // 🔥 AI RESPONSE (UZMAN CEVABI)
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  
  // E. İMZA (CANVAS) STATE
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");

  // F. UI MODALLAR
  const [showInventory, setShowInventory] = useState(false);

  // ================= 4. SİSTEM BAŞLATMA (BOOT SEQUENCE) =================
  useEffect(() => {
    bootSystem();
    // Geri tuşunu engelle (App hissi için)
    window.history.pushState(null, '', window.location.href);
    return () => clearInterval(timerRef.current);
  }, []);

  const bootSystem = async () => {
      try {
          // 1. Oturum Kontrolü
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) { router.replace('/login'); return; }

          // 2. Profil Çek
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
          
          // Profil verisini hazırla
          // Eğer full_name boşsa e-postadan üret
          const realName = profile?.full_name || session.user.email?.split('@')[0].toUpperCase();
          
          setUser({
              id: session.user.id,
              email: session.user.email!,
              full_name: realName,
              role: profile?.role || 'personel',
              xp: profile?.xp || 0,
              rank: profile?.rank || 'Çırak'
          });

          // 3. Verileri Çek
          const [tasksRes, stockRes, historyRes] = await Promise.all([
              // a. Açık İşler
              supabase.from('service_tickets')
                .select('*, cranes(*)')
                .neq('status', 'tamamlandi')
                .order('created_at', { ascending: false }),
              
              // b. Stok
              supabase.from('materials').select('*').order('name'),

              // c. Geçmiş (SADECE BU PERSONELİN YAPTIKLARI)
              supabase.from('completed_services')
                .select('*')
                .eq('technician', session.user.email) 
                .order('service_date', { ascending: false })
                .limit(20)
          ]);

          if (tasksRes.data) {
              // --- AKILLI FİLTRELEME ---
              // Eğer işin içinde personelin adı geçiyorsa VEYA genel bir işse göster.
              // Şimdilik test için hepsini gösteriyoruz.
              setTasks(tasksRes.data);
          }
          if (stockRes.data) setInventory(stockRes.data);
          if (historyRes.data) setHistory(historyRes.data);

          // 4. Hava Durumu
          fetchRealWeather();

          // 5. Sistemi Aç
          setTimeout(() => setSystemState('ready'), 1500);

      } catch (err) {
          console.error("Boot Error:", err);
          setSystemState('error');
      }
  };

  const fetchRealWeather = async () => {
      try {
          // OpenMeteo API - Bursa
          const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=40.18&longitude=29.06&current=temperature_2m,weather_code&timezone=auto');
          const data = await res.json();
          const code = data.current.weather_code;
          let condition = "Açık";
          if(code > 2) condition = "Bulutlu";
          if(code > 45) condition = "Sisli";
          if(code > 50) condition = "Yağmurlu";
          setWeather({ temp: Math.round(data.current.temperature_2m), condition, code });
      } catch (e) { console.log("Hava durumu hatası"); }
  };

  // ================= 5. İŞLEV FONKSİYONLARI =================

  // A. GÖREV MOTORU
  const startJob = (job: JobTicket) => {
      setActiveJob(job);
      setWizardStage('start');
      setTimer(0);
      setDiagnosis("");
      setActions("");
      setCart([]);
      setAiResponse(null);
      setSignatureData(null);
      setCustomerName("");

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
  };

  const cancelJob = () => {
      if(confirm("Görevi iptal etmek istediğine emin misin?")) {
          setActiveJob(null);
          clearInterval(timerRef.current);
      }
  };

  // B. BUVISAN EXPERT AI ENGINE (ZEKİ MOTOR) 🧠
  const runExpertAnalysis = () => {
      setAiResponse('loading');
      
      setTimeout(() => {
          if (!activeJob) return;

          const desc = activeJob.description.toLowerCase();
          const model = activeJob.cranes.model_name ? activeJob.cranes.model_name.toLowerCase() : '';
          
          let advice = '';

          // 1. ADIM: Vinç Tipini Tespit Et
          let category: keyof typeof EXPERT_KNOWLEDGE_BASE = 'default';
          
          if (model.includes('monoray')) category = 'monoray';
          else if (model.includes('çift') || model.includes('gezer')) category = 'ciftkiris';
          else if (model.includes('asansör') || model.includes('sabit')) category = 'asansor';
          else if (desc.includes('sürücü') || desc.includes('elektrik')) category = 'elektrik';

          // 2. ADIM: Arıza Tipini Tespit Et (Kategorinin içinden)
          const knowledgeBank = EXPERT_KNOWLEDGE_BASE[category] as Record<string, string>;
          let matchFound = false;

          for (const key in knowledgeBank) {
              if (desc.includes(key)) {
                  advice = knowledgeBank[key];
                  matchFound = true;
                  break;
              }
          }

          // 3. ADIM: Eğer spesifik kategori içinde bulunamazsa, Genel Elektrik'e bak
          if (!matchFound) {
              const generalBank = EXPERT_KNOWLEDGE_BASE['elektrik'];
              for (const key in generalBank) {
                  if (desc.includes(key)) {
                      advice = (generalBank as any)[key];
                      matchFound = true;
                      break;
                  }
              }
          }

          // 4. ADIM: Hiçbir şey bulunamazsa Varsayılan Tavsiyeyi Ver
          if (!matchFound) {
              advice = EXPERT_KNOWLEDGE_BASE['default'] as string;
          }

          setAiResponse(advice);

      }, 2000); // 2 saniye analiz simülasyonu
  };

  // C. STOK & İMZA
  const addToCart = (item: InventoryItem) => {
      setCart([...cart, { ...item, cartId: Date.now() }]);
      setShowInventory(false);
  };
  
  const removeFromCart = (cartId: number) => {
      setCart(cart.filter(i => i.cartId !== cartId));
  };

  // Canvas Logic
  const startDrawing = (e: any) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      setIsDrawing(true);
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
      const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
      
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
      
      if(e.cancelable) e.preventDefault(); 
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
      const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;

      ctx.lineTo(x, y);
      ctx.stroke();
  };

  const stopDrawing = () => {
      if (isDrawing) {
          setIsDrawing(false);
          if (canvasRef.current) setSignatureData(canvasRef.current.toDataURL());
      }
  };

  const clearCanvas = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          setSignatureData(null);
      }
  };

  // D. KAYDET (COMMIT)
  const completeJob = async () => {
      if (!signatureData) return alert("❌ Müşteri imzası zorunludur!");
      if (customerName.length < 3) return alert("❌ Müşteri adı soyadı girilmelidir!");
      if (diagnosis.length < 5) return alert("❌ Teşhis alanı boş bırakılamaz.");

      if (!confirm("✅ Servis tamamlanıp merkeze iletilecek. Onaylıyor musun?")) return;

      setSystemState('booting'); // Loading aç
      clearInterval(timerRef.current);

      try {
          const total = cart.reduce((acc, item) => acc + item.sale_price, 0);
          
          // 1. Bileti Kapat
          await supabase.from('service_tickets').update({ status: 'tamamlandi' }).eq('id', activeJob!.id);
          
          // 2. Geçmişe Ekle
          const fullDesc = `[TEŞHİS]: ${diagnosis}\n[İŞLEM]: ${actions}\n[AI RAPORU]: ${aiResponse || 'Kullanılmadı'}\n[İMZALAYAN]: ${customerName}`;

          await supabase.from('completed_services').insert([{
              service_date: new Date().toISOString(),
              customer_text: activeJob!.cranes.customer_name,
              company_address: activeJob!.cranes.location_address,
              service_type: 'Pro Servis',
              description: fullDesc,
              price: total,
              technician: user?.email,
              work_hours: (timer / 3600).toFixed(2),
              materials: cart
          }]);

          alert("🎉 İşlem Başarıyla Kaydedildi!");
          window.location.reload();

      } catch (err) {
          console.error(err);
          alert("Hata oluştu, lütfen interneti kontrol et.");
          setSystemState('ready');
      }
  };

// --- BÖLÜM 2 SONU ---
// ... (Bölüm 2 kodlarının hemen altı)

  // ================= 6. RENDER (GÖRÜNÜM) KATMANI =================

  // A. BOOT SCREEN (SİSTEM AÇILIŞ EFEKTİ)
  if (systemState === 'booting') return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center text-blue-500 font-mono select-none overflow-hidden relative">
          {/* Arka Plan Efekti */}
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
                  <div className="text-xs text-slate-500 mt-2 font-bold tracking-widest">FIELD OPERATIONS v9.0</div>
              </div>

              <div className="text-left bg-slate-900/80 p-4 rounded-xl border border-slate-800 text-xs font-mono w-64 mx-auto space-y-1 shadow-2xl">
                  <div className="text-green-500">&gt; Kernel initialized... OK</div>
                  <div className="text-green-500 delay-75">&gt; Loading user profile... OK</div>
                  <div className="text-blue-400 animate-pulse">&gt; Syncing database...</div>
              </div>
          </div>
      </div>
  );

  // B. ANA EKRAN YAPISI
  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-28 select-none overflow-hidden relative">
      
      {/* --- HEADER (PROFİL & DURUM) --- */}
      <header className="bg-slate-900 text-white pt-10 pb-8 px-6 rounded-b-[40px] shadow-2xl relative z-10 overflow-hidden">
          {/* Arka Plan Süslemesi */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

          <div className="flex justify-between items-start relative z-10">
              <div className="flex items-center gap-4">
                  {/* Avatar & Level */}
                  <div className="relative group">
                      <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center text-xl font-bold shadow-lg border-2 border-white/10 group-active:scale-95 transition">
                          {user?.full_name ? user.full_name[0].toUpperCase() : 'U'}
                      </div>
                      <div className="absolute -bottom-2 -right-2 bg-yellow-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full shadow-md border-2 border-slate-900 flex items-center gap-1">
                          <Award size={10}/> {user?.xp ? Math.floor(user.xp / 100) + 1 : 1}
                      </div>
                  </div>
                  {/* İsim & Rütbe */}
                  <div>
                      <h1 className="text-lg font-bold leading-tight">{user?.full_name || 'Saha Personeli'}</h1>
                      <div className="flex items-center gap-2 text-xs text-blue-300/80 mt-1 font-medium bg-blue-900/30 px-2 py-0.5 rounded-lg w-fit border border-blue-500/20">
                          <Shield size={12}/> {user?.rank}
                      </div>
                  </div>
              </div>
              {/* Harita Butonu */}
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
                      <div className="text-2xl font-black text-yellow-400">98%</div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Puan</div>
                  </div>
              </div>
          )}
      </header>

      {/* --- ANA İÇERİK (TABS) --- */}
      <main className="p-5 space-y-6">
          
          {/* TAB 1: DASHBOARD (ANA SAYFA) */}
          {activeTab === 'dashboard' && !activeJob && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  
                  {/* Hava Durumu & Bağlantı */}
                  <div className="flex gap-4">
                      <div className="flex-1 bg-white p-4 rounded-3xl shadow-sm border border-slate-200 flex items-center justify-between">
                          <div>
                              <div className="text-[10px] text-slate-400 font-black uppercase">BURSA</div>
                              <div className="text-sm font-bold text-slate-800 mt-1">{weather.condition} {weather.temp}°C</div>
                          </div>
                          {weather.code < 3 ? <Sun className="text-orange-400" size={24}/> : <CloudRain className="text-blue-400" size={24}/>}
                      </div>
                      <div className="flex-1 bg-white p-4 rounded-3xl shadow-sm border border-slate-200 flex items-center justify-between">
                          <div>
                              <div className="text-[10px] text-slate-400 font-black uppercase">BAĞLANTI</div>
                              <div className="text-sm font-bold mt-1 text-emerald-600">Online</div>
                          </div>
                          <Wifi className="text-emerald-500" size={24}/>
                      </div>
                  </div>

                  {/* GÖREV LİSTESİ */}
                  <div>
                      <div className="flex justify-between items-center mb-3 px-1">
                          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                              <div className="w-1 h-5 bg-blue-600 rounded-full"></div> İş Emirleri
                          </h3>
                      </div>
                      
                      {tasks.length > 0 ? (
                          <div className="space-y-4">
                              {tasks.map((task) => (
                                <div key={task.id} className="bg-white rounded-[28px] p-1 shadow-xl shadow-blue-100/50 border border-slate-100 relative overflow-hidden group">
                                    <div className="bg-slate-50 rounded-[24px] p-5 border border-slate-100 relative overflow-hidden">
                                        {/* Öncelik Etiketi */}
                                        <div className={`absolute top-0 right-0 text-white text-[9px] font-black px-3 py-1.5 rounded-bl-2xl shadow-sm flex items-center gap-1 ${task.priority === 'kritik' ? 'bg-red-500' : 'bg-blue-500'}`}>
                                            <AlertTriangle size={10}/> {task.priority ? task.priority.toUpperCase() : 'NORMAL'}
                                        </div>
                                        
                                        <div className="flex items-start gap-4 mb-4 mt-2">
                                            <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-200">
                                                <Wrench size={20}/>
                                            </div>
                                            <div>
                                                <h4 className="font-black text-slate-800 text-lg leading-tight line-clamp-1">{task.cranes.customer_name}</h4>
                                                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 font-medium"><MapPin size={12} className="text-red-400"/> {task.cranes.location_address}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="bg-white p-4 rounded-2xl text-xs text-slate-600 mb-5 border border-slate-200 leading-relaxed font-medium">
                                            {task.description}
                                        </div>

                                        <button 
                                            onClick={() => startJob(task)}
                                            className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-xl shadow-slate-200 hover:bg-slate-800"
                                        >
                                            <Play size={16} fill="currentColor"/> GÖREVE BAŞLA
                                        </button>
                                    </div>
                                </div>
                              ))}
                          </div>
                      ) : (
                          <div className="bg-white p-10 rounded-[32px] border-2 border-dashed border-slate-200 text-center">
                              <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                                  <CheckCircle2 size={36}/>
                              </div>
                              <h4 className="font-black text-slate-700 text-xl">Harikasın!</h4>
                              <p className="text-sm text-slate-400 mt-2 font-medium">Şu an aktif bir iş emri bulunmuyor.</p>
                          </div>
                      )}
                  </div>
              </div>
          )}

          {/* TAB 2: ENVANTER (STOK) */}
          {activeTab === 'inventory' && !activeJob && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-3 sticky top-0 z-20">
                    <Search className="text-slate-400" size={20}/>
                    <input type="text" placeholder="Parça ara..." className="w-full outline-none text-sm font-bold text-slate-700"/>
                </div>
                {inventory.map((item) => (
                    <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.stock_quantity < 5 ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                                <Box size={20}/>
                            </div>
                            <div>
                                <div className="font-bold text-slate-700 text-sm">{item.name}</div>
                                <div className="text-[10px] text-slate-400 font-bold bg-slate-50 px-2 py-0.5 rounded w-fit mt-1">Stok: {item.stock_quantity}</div>
                            </div>
                        </div>
                        <div className="font-black text-slate-800">{item.sale_price} ₺</div>
                    </div>
                ))}
            </div>
          )}

// --- BÖLÜM 3 SONU ---
{/* TAB 3: GEÇMİŞ (HISTORY) */}
          {activeTab === 'history' && !activeJob && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h3 className="font-bold text-slate-800 px-1">Tamamlanan İşler ({history.length})</h3>
                {history.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-sm">Henüz geçmiş kayıt yok.</div>
                ) : (
                    history.map((h: any) => (
                        <div key={h.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500"></div>
                            <div className="pl-3">
                                <h4 className="font-bold text-slate-800 text-sm">{h.customer_text}</h4>
                                <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">{h.description?.split('\n')[0]}</p>
                                <div className="flex justify-between items-center mt-2">
                                    <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded">{new Date(h.service_date).toLocaleDateString()}</span>
                                    <span className="text-[10px] font-bold text-green-600 flex items-center gap-1"><CheckCircle2 size={10}/> Tamamlandı</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
          )}

          {/* --- AKTİF GÖREV SİHİRBAZI (WIZARD MODE) --- */}
          {activeJob && (
              <div className="fixed inset-0 bg-slate-50 z-[100] flex flex-col h-full overflow-hidden animate-in slide-in-from-bottom duration-500">
                  
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
                      
                      {/* Adım Göstergesi */}
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

                  {/* Wizard İçerik Alanı */}
                  <div className="flex-1 overflow-y-auto p-6 pb-24">
                      
                      {/* ADIM 0: BAŞLANGIÇ */}
                      {wizardStage === 'start' && (
                          <div className="text-center pt-10 space-y-6 animate-in zoom-in duration-300">
                              <div className="w-24 h-24 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-blue-200">
                                  <Zap size={48} className="animate-pulse"/>
                              </div>
                              <h3 className="text-2xl font-black text-slate-800">Servis Başlatıldı</h3>
                              <p className="text-slate-500 font-medium">Sayaç çalışıyor. Lütfen iş güvenliği prosedürlerini uygulamak için ilerleyin.</p>
                              <button onClick={() => setWizardStage('safety')} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-lg shadow-xl mt-8 flex items-center justify-center gap-2 active:scale-95 transition">
                                  KONTROLLERE BAŞLA <ArrowRight/>
                              </button>
                          </div>
                      )}

                      {/* ADIM 1: GÜVENLİK */}
                      {wizardStage === 'safety' && (
                          <div className="space-y-4 pt-4 animate-in slide-in-from-right duration-300">
                              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><AlertOctagon className="text-orange-500"/> Güvenlik Kontrolü</h3>
                              {['Enerji Kesildi (LOTO)', 'Çevre Güvenliği Alındı', 'KKD Ekipmanları Tam', 'Vinç Altı Boş'].map((item, i) => (
                                  <label key={i} className="flex items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm active:scale-[0.98] transition hover:border-blue-300 cursor-pointer">
                                      <input type="checkbox" className="w-6 h-6 accent-blue-600 rounded-lg"/>
                                      <span className="font-bold text-slate-700 text-sm">{item}</span>
                                  </label>
                              ))}
                              <button onClick={() => setWizardStage('diagnosis')} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold shadow-lg mt-4 flex items-center justify-center gap-2 active:scale-95 transition">
                                  ONAYLA VE DEVAM ET <ChevronRight/>
                              </button>
                          </div>
                      )}

                      {/* ADIM 2: TEŞHİS & AI (UZMAN MODU) */}
                      {wizardStage === 'diagnosis' && (
                          <div className="space-y-6 animate-in slide-in-from-right duration-300">
                              
                              {/* AI KART (AKILLI BEYİN) */}
                              <div className={`p-5 rounded-2xl relative overflow-hidden shadow-lg transition-all duration-500 ${aiSuggestion ? 'bg-indigo-900 text-white' : 'bg-white border border-slate-200'}`}>
                                  <div className="absolute -right-4 -top-4 opacity-10"><Cpu size={100}/></div>
                                  
                                  <h4 className={`font-bold text-lg flex items-center gap-2 relative z-10 ${aiSuggestion ? 'text-white' : 'text-slate-800'}`}>
                                      <Zap size={18} className="text-yellow-400"/> BUVISAN EXPERT AI
                                  </h4>
                                  
                                  {aiSuggestion ? (
                                      <div className="mt-3 relative z-10 animate-in fade-in leading-relaxed space-y-2">
                                          <div className="text-sm font-bold text-yellow-300">{(aiSuggestion as any).title}</div>
                                          <div className="text-xs opacity-90">{(aiSuggestion as any).advice}</div>
                                          {aiSuggestion.risk === 'high' && <div className="inline-block bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase mt-1">Yüksek Risk</div>}
                                      </div>
                                  ) : (
                                      <div className="mt-2">
                                          <p className="text-xs text-slate-400 mb-3">Arıza tanımını analiz ederek olası sebepleri ve çözüm önerilerini getirir.</p>
                                          <button onClick={runExpertAnalysis} className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md hover:bg-indigo-700 transition w-full justify-center active:scale-95">
                                              <Play size={12} fill="currentColor"/> ARIZAYI ANALİZ ET
                                          </button>
                                      </div>
                                  )}
                              </div>

                              <div>
                                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1 mb-2 block">TEKNİSYEN TESPİTİ</label>
                                  <textarea 
                                    className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition min-h-[150px] text-slate-700 font-medium placeholder:text-slate-300 shadow-sm"
                                    placeholder="Gözlemlerini ve tespit ettiğin arızayı buraya yaz..."
                                    value={diagnosis}
                                    onChange={e => setDiagnosis(e.target.value)}
                                  ></textarea>
                              </div>
                              
                              <button onClick={() => setWizardStage('repair')} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2 active:scale-95 transition">
                                  TESPİTİ KAYDET <ChevronRight size={18}/>
                              </button>
                          </div>
                      )}

                      {/* ADIM 3: ONARIM & PARÇA */}
                      {wizardStage === 'repair' && (
                          <div className="space-y-6 animate-in slide-in-from-right duration-300">
                              
                              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                                  <div className="flex justify-between items-center mb-4">
                                      <h4 className="font-bold text-slate-800 flex items-center gap-2"><Package size={18}/> Kullanılan Parçalar</h4>
                                      <button onClick={() => setShowInventory(true)} className="bg-blue-50 text-blue-600 p-2 rounded-xl hover:bg-blue-100 transition active:scale-95"><Plus size={20}/></button>
                                  </div>
                                  
                                  {cart.length === 0 ? (
                                      <div className="text-center py-6 text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                          Henüz parça eklenmedi.
                                      </div>
                                  ) : (
                                      <div className="space-y-2">
                                          {cart.map((item, i) => (
                                              <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm animate-in fade-in slide-in-from-bottom-2">
                                                  <div>
                                                      <span className="font-bold text-slate-700 block">{item.name}</span>
                                                      <span className="text-[10px] text-slate-400">{item.sale_price} ₺</span>
                                                  </div>
                                                  <button onClick={() => removeFromCart(item.cartId)} className="text-red-400 p-2 bg-red-50 rounded-lg hover:bg-red-100"><X size={16}/></button>
                                              </div>
                                          ))}
                                      </div>
                                  )}
                              </div>

                              <div>
                                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1 mb-2 block">YAPILAN İŞLEM DETAYI</label>
                                  <textarea 
                                    className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition min-h-[150px] text-slate-700 font-medium placeholder:text-slate-300 shadow-sm"
                                    placeholder="Değişen parçaları ve yapılan ayarları detaylıca yaz..."
                                    value={actions}
                                    onChange={e => setActions(e.target.value)}
                                  ></textarea>
                              </div>

                              <button onClick={() => setWizardStage('sign')} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2 active:scale-95 transition">
                                  ONARIMI TAMAMLA <ChevronRight size={18}/>
                              </button>
                          </div>
                      )}

                      {/* ADIM 4: İMZA (CANVAS) */}
                      {wizardStage === 'sign' && (
                          <div className="space-y-6 text-center animate-in slide-in-from-right duration-300">
                              
                              <h3 className="font-bold text-lg text-slate-800">Müşteri Onayı</h3>
                              
                              {/* Canvas Alanı */}
                              <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl overflow-hidden relative touch-none select-none h-64 shadow-inner cursor-crosshair">
                                  <canvas 
                                    ref={canvasRef}
                                    width={350}
                                    height={256}
                                    className="w-full h-full relative z-10"
                                    onMouseDown={startDrawing}
                                    onMouseMove={draw}
                                    onMouseUp={stopDrawing}
                                    onMouseLeave={stopDrawing}
                                    onTouchStart={startDrawing}
                                    onTouchMove={draw}
                                    onTouchEnd={stopDrawing}
                                  />
                                  <button onClick={clearCanvas} className="absolute top-3 right-3 bg-slate-100 p-2 rounded-full text-slate-500 hover:bg-red-50 hover:text-red-500 z-20 shadow-sm transition"><Eraser size={18}/></button>
                                  {!isDrawing && !signatureData && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 font-bold select-none"><PenTool className="mr-2"/> İmza Alanı</div>}
                              </div>

                              <input 
                                type="text" 
                                placeholder="Müşteri Adı Soyadı" 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-center outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition shadow-sm"
                                value={customerName}
                                onChange={e => setCustomerName(e.target.value)}
                              />

                              <div className="bg-emerald-50 p-4 rounded-xl text-xs text-emerald-700 text-left border border-emerald-100">
                                  <strong>Onay Beyanı:</strong> İşbu imza ile yukarıda belirtilen arıza tespitini, yapılan işlemleri, kullanılan parçaları ve işçilik süresini onaylıyorum.
                              </div>

                              <button onClick={completeJob} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-xl shadow-emerald-200 flex items-center justify-center gap-2 active:scale-95 transition hover:bg-emerald-700">
                                  <FileSignature size={20}/> SERVİSİ KAPAT VE GÖNDER
                              </button>
                          </div>
                      )}

                  </div>
                  
                  {/* İptal Butonu (Footer) */}
                  <div className="absolute bottom-6 left-0 right-0 px-6 pointer-events-none">
                       <button onClick={cancelJob} className="w-full text-xs text-slate-400 font-bold py-3 hover:text-red-500 transition pointer-events-auto">Görevi İptal Et</button>
                  </div>
              </div>
          )}

          {/* --- STOK SEÇİM MODALI --- */}
          {showInventory && (
              <div className="fixed inset-0 bg-slate-900/90 z-[150] flex items-end sm:items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-white w-full max-w-md rounded-[32px] overflow-hidden max-h-[80vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
                      <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                          <h3 className="font-bold text-slate-800 text-lg">Depodan Parça Ekle</h3>
                          <button onClick={() => setShowInventory(false)} className="bg-white p-2 rounded-full shadow-sm hover:bg-slate-100 transition"><X size={20}/></button>
                      </div>
                      <div className="overflow-y-auto p-3 space-y-2">
                          {inventory.map((item) => (
                              <button 
                                  key={item.id} 
                                  onClick={() => addToCart(item)}
                                  className="w-full text-left p-4 rounded-2xl border border-slate-100 bg-white hover:bg-blue-50 hover:border-blue-200 transition flex justify-between items-center group active:scale-[0.98]"
                              >
                                  <div>
                                      <div className="font-bold text-slate-800 group-hover:text-blue-700">{item.name}</div>
                                      <div className="text-xs text-slate-400 mt-0.5 font-mono">STOK: {item.stock_quantity}</div>
                                  </div>
                                  <div className="text-right">
                                      <div className="font-bold text-slate-900">{item.sale_price} ₺</div>
                                      <div className="text-[9px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded mt-1">EKLE +</div>
                                  </div>
                              </button>
                          ))}
                      </div>
                  </div>
              </div>
          )}

      </main>

      {/* --- ALT NAVİGASYON (MENÜ) --- */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-200 p-2 pb-8 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-40 flex justify-around items-center rounded-t-[32px]">
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
          
          <button onClick={() => {
              if(confirm("Çıkış yapmak istediğine emin misin?")) {
                  supabase.auth.signOut();
                  router.push('/login');
              }
          }} className="p-3 rounded-2xl text-slate-300 hover:text-red-500 transition">
              <LogOut size={24}/>
          </button>
      </div>

    </div>
  );
}