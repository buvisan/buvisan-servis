"use client";
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock, Mail, ChevronRight, Loader2 } from 'lucide-react';

export default function GirisYap() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hata, setHata] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);

  const girisYap = async () => {
    setYukleniyor(true);
    setHata('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setHata("Giriş başarısız! Bilgileri kontrol et.");
      setYukleniyor(false);
    } else {
      router.push('/admin');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white/10 backdrop-blur-lg p-8 rounded-3xl shadow-2xl w-full max-w-sm border border-white/20 relative z-10"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">BUVİSAN</h1>
          <p className="text-blue-200 text-xs font-medium tracking-widest uppercase mt-2">Admin Security Gate</p>
        </div>
        
        <div className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-3.5 text-blue-300 w-5 h-5" />
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="E-Posta Adresi"
            />
          </div>
          
          <div className="relative">
            <Lock className="absolute left-3 top-3.5 text-blue-300 w-5 h-5" />
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="Şifre"
            />
          </div>

          {hata && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-red-500/20 text-red-200 text-sm p-3 rounded-lg text-center border border-red-500/50">
              {hata}
            </motion.div>
          )}

          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={girisYap}
            disabled={yukleniyor}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2"
          >
            {yukleniyor ? <Loader2 className="animate-spin" /> : <>GİRİŞ YAP <ChevronRight className="w-4 h-4" /></>}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}