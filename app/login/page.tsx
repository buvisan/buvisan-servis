"use client";

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { ShieldCheck, User, Lock, Mail, Loader2, ArrowRight, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  
  // --- STATE ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hataMesaji, setHataMesaji] = useState("");
  
  // LOGIN TÜRÜ: 'admin' veya 'personel'
  const [girisTuru, setGirisTuru] = useState<'admin' | 'personel'>('admin');

  // --- GİRİŞ FONKSİYONU ---
  const girisYap = async (e: any) => {
    e.preventDefault();
    setYukleniyor(true);
    setHataMesaji("");

    try {
      // 1. Girdileri Temizle (Telefondaki büyük harf/boşluk sorununu çözer)
      const temizEmail = email.trim().toLowerCase();
      const temizSifre = password.trim();

      // 2. Supabase ile Kimlik Doğrula
      const { data, error } = await supabase.auth.signInWithPassword({
        email: temizEmail,
        password: temizSifre,
      });

      if (error) throw error;

      if (data.user) {
        // 3. Profil Kontrolü (Yoksa Oluştur - Auto Fix)
        let { data: profil } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', data.user.id)
            .single();

        if (!profil) {
            // Profil yoksa oluştur (Varsayılan: personel)
            const { error: insertError } = await supabase.from('profiles').insert([
                { id: data.user.id, email: temizEmail, role: 'personel', full_name: 'Yeni Kullanıcı' }
            ]);
            if (!insertError) {
                profil = { role: 'personel' }; // Geçici atama
            }
        }

        // 4. ROL KONTROLÜ (Güvenlik Duvarı)
        if (girisTuru === 'admin' && profil?.role !== 'admin') {
            await supabase.auth.signOut();
            throw new Error("Bu alana sadece Yöneticiler girebilir.");
        }

        if (girisTuru === 'personel' && profil?.role === 'admin') {
             // Admin, personel tarafından da girebilsin (Test için kolaylık)
             // İstersen burayı engelleyebilirsin ama açık kalsın şimdilik.
        }

        // 5. Yönlendirme
        if (girisTuru === 'admin') router.push('/admin');
        else router.push('/personel');
      }

    } catch (error: any) {
      console.error("Giriş Hatası:", error);
      setHataMesaji(error.message === "Invalid login credentials" ? "E-posta veya şifre hatalı!" : error.message);
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        
        {/* ÜST BAŞLIK */}
        <div className={`p-8 pb-6 transition-colors duration-500 ${girisTuru === 'admin' ? 'bg-slate-900' : 'bg-blue-600'}`}>
            <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-white backdrop-blur-sm shadow-inner">
                    {girisTuru === 'admin' ? <ShieldCheck size={32}/> : <User size={32}/>}
                </div>
            </div>
            <h2 className="text-2xl font-black text-center text-white tracking-tight">BUVİSAN</h2>
            <p className="text-center text-white/60 text-xs uppercase font-bold tracking-widest mt-1">Servis Yönetim Sistemi</p>
        </div>

        {/* SEKME GEÇİŞİ */}
        <div className="flex p-2 bg-slate-100 m-6 rounded-xl border border-slate-200">
            <button onClick={() => setGirisTuru('admin')} className={`flex-1 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${girisTuru === 'admin' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}><ShieldCheck size={16}/> Yönetici</button>
            <button onClick={() => setGirisTuru('personel')} className={`flex-1 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${girisTuru === 'personel' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}><User size={16}/> Personel</button>
        </div>

        {/* HATA MESAJI */}
        {hataMesaji && (
            <div className="mx-6 mb-4 p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl flex items-center gap-2 border border-red-100">
                <AlertCircle size={16}/> {hataMesaji}
            </div>
        )}

        {/* FORM */}
        <form onSubmit={girisYap} className="px-8 pb-8 space-y-4">
            <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 ml-1">E-Posta</label>
                <div className="relative">
                    <Mail className="absolute left-3 top-3.5 text-slate-400 w-5 h-5"/>
                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition" placeholder="ornek@buvisan.com"/>
                </div>
            </div>
            <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 ml-1">Şifre</label>
                <div className="relative">
                    <Lock className="absolute left-3 top-3.5 text-slate-400 w-5 h-5"/>
                    <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition" placeholder="••••••••"/>
                </div>
            </div>
            <div className="pt-2">
                <button type="submit" disabled={yukleniyor} className={`w-full py-4 rounded-xl text-white font-bold shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-95 ${girisTuru === 'admin' ? 'bg-slate-900 hover:bg-slate-800' : 'bg-blue-600 hover:bg-blue-700'}`}>
                    {yukleniyor ? <Loader2 className="animate-spin"/> : <ArrowRight/>} Giriş Yap
                </button>
            </div>
        </form>
      </div>
    </div>
  );
}