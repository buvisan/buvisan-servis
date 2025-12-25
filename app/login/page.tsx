"use client";
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function GirisYap() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hata, setHata] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);

  const girisYap = async () => {
    setYukleniyor(true);
    setHata('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setHata("Giriş başarısız! E-posta veya şifre yanlış.");
      setYukleniyor(false);
    } else {
      // Başarılıysa Admin paneline fırlat
      router.push('/admin');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-xl shadow-lg w-96 border border-gray-200">
        <h1 className="text-2xl font-bold text-center text-blue-900 mb-6">Buvisan Panel</h1>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">E-Posta</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 border rounded mt-1"
              placeholder="admin@buvisan.com"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Şifre</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border rounded mt-1"
              placeholder="******"
            />
          </div>

          {hata && <div className="text-red-500 text-sm text-center font-bold">{hata}</div>}

          <button 
            onClick={girisYap}
            disabled={yukleniyor}
            className="w-full bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700 transition"
          >
            {yukleniyor ? "Giriş Yapılıyor..." : "GİRİŞ YAP"}
          </button>
        </div>
      </div>
    </div>
  );
}