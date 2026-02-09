"use client";

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { ShieldCheck, User, Lock, Mail, Loader2, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const router = useRouter();
  
  // --- STATE ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  
  // LOGIN TÜRÜ: 'admin' veya 'personel'
  const [girisTuru, setGirisTuru] = useState<'admin' | 'personel'>('admin');

  // --- GİRİŞ FONKSİYONU ---
  const girisYap = async (e: any) => {
    e.preventDefault();
    setYukleniyor(true);

    try {
      // 1. Supabase ile Kimlik Doğrula
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        // 2. Kullanıcının Rolünü Kontrol Et (profiles tablosundan)
        const { data: profil, error: profilHata } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', data.user.id)
            .single();

        if (profilHata) throw new Error("Kullanıcı profili bulunamadı.");

        // 3. ROL EŞLEŞMESİ KONTROLÜ (Güvenlik Duvarı) 🛡️
        // Eğer 'Admin' sekmesinden giriyorsa ama rolü 'personel' ise -> HATA VER
        if (girisTuru === 'admin' && profil.role !== 'admin') {
            await supabase.auth.signOut(); // Oturumu geri kapat
            throw new Error("Yetkisiz Giriş! Bu alana sadece Yöneticiler girebilir.");
        }

        // Eğer 'Personel' sekmesinden giriyorsa ama rolü 'admin' ise -> İsteğe bağlı, ben izin vermiyorum karışmasın diye.
        if (girisTuru === 'personel' && profil.role !== 'personel') {
             await supabase.auth.signOut();
             throw new Error("Lütfen Yönetici panelinden giriş yapınız.");
        }

        // 4. Doğru Sayfaya Yönlendir
        if (profil.role === 'admin') {
            router.push('/admin');
        } else {
            router.push('/personel');
        }
      }

    } catch (error: any) {
      alert(error.message || "Giriş başarısız.");
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
      
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        
        {/* ÜST BAŞLIK ALANI */}
        <div className={`p-8 pb-6 transition-colors duration-500 ${girisTuru === 'admin' ? 'bg-slate-900' : 'bg-blue-600'}`}>
            <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-white backdrop-blur-sm shadow-inner">
                    {girisTuru === 'admin' ? <ShieldCheck size={32}/> : <User size={32}/>}
                </div>
            </div>
            <h2 className="text-2xl font-black text-center text-white tracking-tight">BUVİSAN</h2>
            <p className="text-center text-white/60 text-xs uppercase font-bold tracking-widest mt-1">Servis Yönetim Sistemi</p>
        </div>

        {/* SEKME GEÇİŞİ (TOGGLE) */}
        <div className="flex p-2 bg-slate-100 m-6 rounded-xl border border-slate-200">
            <button 
                onClick={() => setGirisTuru('admin')}
                className={`flex-1 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                    girisTuru === 'admin' 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
            >
                <ShieldCheck size={16}/> Yönetici
            </button>
            <button 
                onClick={() => setGirisTuru('personel')}
                className={`flex-1 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                    girisTuru === 'personel' 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
            >
                <User size={16}/> Personel
            </button>
        </div>

        {/* FORM ALANI */}
        <form onSubmit={girisYap} className="px-8 pb-8 space-y-4">
            
            <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 ml-1">E-Posta Adresi</label>
                <div className="relative">
                    <Mail className="absolute left-3 top-3.5 text-slate-400 w-5 h-5"/>
                    <input 
                        type="email" 
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                        placeholder="ornek@buvisan.com"
                    />
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 ml-1">Şifre</label>
                <div className="relative">
                    <Lock className="absolute left-3 top-3.5 text-slate-400 w-5 h-5"/>
                    <input 
                        type="password" 
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                        placeholder="••••••••"
                    />
                </div>
            </div>

            <div className="pt-2">
                <button 
                    type="submit" 
                    disabled={yukleniyor}
                    className={`w-full py-4 rounded-xl text-white font-bold shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
                        girisTuru === 'admin' 
                        ? 'bg-slate-900 hover:bg-slate-800 shadow-slate-200' 
                        : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                    }`}
                >
                    {yukleniyor ? <Loader2 className="animate-spin"/> : <ArrowRight/>}
                    {girisTuru === 'admin' ? 'Yönetici Girişi Yap' : 'Personel Girişi Yap'}
                </button>
            </div>

            <div className="text-center mt-4">
                <p className="text-xs text-slate-400">
                    Giriş sorunu mu yaşıyorsunuz? <br/>
                    <span className="text-slate-600 font-bold underline cursor-pointer">Bilgi İşlem ile görüşün.</span>
                </p>
            </div>

        </form>
      </div>
    </div>
  );
}