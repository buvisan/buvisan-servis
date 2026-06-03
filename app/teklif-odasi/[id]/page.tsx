"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams } from 'next/navigation';
import { Loader2, CheckCircle, Shield, Clock, FileText } from 'lucide-react';

export default function TeklifOdasiMusteriEkrani() {
  const params = useParams();
  const id = params.id as string;
  
  const [teklif, setTeklif] = useState<any>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState(false);

  // Müşterinin kendi ekranında oynayacağı interaktif opsiyonlar
  const [opsiyonlar, setOpsiyonlar] = useState({
    orijinalParca: true,
    ekstraGaranti: false,
    hizliMontaj: false
  });

  useEffect(() => {
    if (id) teklifiGetir();
  }, [id]);

  const teklifiGetir = async () => {
    try {
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        setHata(true);
      } else {
        setTeklif(data);
        
        // İLERİ SEVİYE NOT: Burada Supabase'e "Müşteri linke tıkladı" logu atabilirsin 
        // ve Admin panelindeki canlı akışa bu veriyi gerçek zamanlı düşürebilirsin.
      }
    } catch (err) {
      setHata(true);
    } finally {
      setYukleniyor(false);
    }
  };

  // Dinamik fiyat hesaplama
  const dinamikToplamHesapla = () => {
    if (!teklif) return 0;
    let toplam = Number(teklif.total_price);
    if (!opsiyonlar.orijinalParca) toplam -= 3500;
    if (opsiyonlar.ekstraGaranti) toplam += 5000;
    if (opsiyonlar.hizliMontaj) toplam += 4000;
    return toplam;
  };

  if (yukleniyor) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center text-white">
        <Loader2 className="animate-spin text-blue-500 mb-4" size={48} />
        <p className="animate-pulse">Size özel teklif odanız hazırlanıyor...</p>
      </div>
    );
  }

  if (hata || !teklif) {
    return (
      <div className="min-h-screen bg-slate-900 flex justify-center items-center text-white p-6">
        <div className="bg-slate-800 p-8 rounded-3xl text-center max-w-md w-full border border-slate-700">
          <FileText size={64} className="text-slate-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Teklif Bulunamadı</h1>
          <p className="text-slate-400 text-sm">Bu teklif bağlantısı geçersiz, süresi dolmuş veya sistemden silinmiş olabilir. Lütfen Buvisan yetkilisi ile iletişime geçin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        
        {/* Üst Bilgi Başlığı */}
        <div className="bg-slate-800 rounded-3xl p-6 md:p-10 mb-6 shadow-2xl border border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h2 className="text-indigo-400 font-bold tracking-widest text-xs uppercase mb-2">Özel Teklif Odası</h2>
            <h1 className="text-3xl md:text-4xl font-black text-white">{teklif.customer_name}</h1>
            <p className="text-slate-400 mt-2 text-sm">Sayın {teklif.customer_rep || 'Yetkili'}, Buvisan tarafından size özel hazırlanan interaktif teklif detayları aşağıdadır.</p>
          </div>
          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-700 text-right shrink-0 min-w-[200px]">
            <p className="text-slate-400 text-xs font-bold uppercase mb-1">Güncel Toplam Tutar</p>
            <p className="text-3xl font-black text-green-400">{dinamikToplamHesapla().toLocaleString()} ₺</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Sol Taraf: Teklif Detayları (A4 Görünümü Gibi) */}
          <div className="lg:col-span-2 bg-slate-800 rounded-3xl p-6 md:p-10 shadow-xl border border-slate-700">
            <h3 className="text-xl font-bold text-white mb-6 border-b border-slate-700 pb-4">Hizmet ve Malzeme Dökümü</h3>
            
            <div className="space-y-4 mb-8">
              {teklif.items && teklif.items.map((item: any, i: number) => (
                <div key={i} className="flex justify-between items-center bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                  <div>
                    <div className="font-bold text-slate-200">{item.ad}</div>
                    {item.detay && <div className="text-xs text-slate-500 mt-1">{item.detay}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-400">{item.adet} x {Number(item.birim_fiyat).toLocaleString()} ₺</div>
                    <div className="font-bold text-white">{Number(item.toplam).toLocaleString()} ₺</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-indigo-900/20 border border-indigo-500/20 p-6 rounded-2xl">
              <h4 className="font-bold text-indigo-300 mb-2 text-sm">Teklif Şartları ve Notlar</h4>
              <p className="text-sm text-indigo-100/70 whitespace-pre-line leading-relaxed">
                {teklif.description || 'Bu teklif 15 gün süreyle geçerlidir. Fiyatlara KDV dahil değildir.'}
              </p>
            </div>
          </div>

          {/* Sağ Taraf: Müşteri İnteraktif Opsiyon Paneli */}
          <div className="space-y-6">
            <div className="bg-slate-800 rounded-3xl p-6 shadow-xl border border-slate-700">
              <h3 className="text-sm font-black text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <CheckCircle size={18} className="text-indigo-400"/>
                Tercihlerinizi Belirleyin
              </h3>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">Seçimlerinizi yaparak bütçenize veya aciliyetinize göre teklifi kendinize uyarlayabilirsiniz.</p>

            <div className="space-y-4">
                {/* Opsiyon 1 */}
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-700">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-sm font-bold text-slate-200">Yedek Parça Kalitesi</span>
                    <span className="text-xs font-mono text-slate-400">-{ (3500).toLocaleString() } ₺</span>
                  </div>
                  <button 
                    onClick={() => setOpsiyonlar({...opsiyonlar, orijinalParca: !opsiyonlar.orijinalParca})}
                    className={`w-full text-left p-3 rounded-xl text-sm font-bold border transition ${opsiyonlar.orijinalParca ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'}`}
                  >
                    {opsiyonlar.orijinalParca ? "🟢 %100 Orijinal Parça (Seçili)" : "🟡 Muadil Parça Kullanılsın"}
                  </button>
                </div>

                {/* Opsiyon 2 */}
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-700">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-sm font-bold text-slate-200 flex items-center gap-1.5"><Shield size={14}/> Ekstra Garanti</span>
                    <span className="text-xs font-mono text-green-400">+{ (5000).toLocaleString() } ₺</span>
                  </div>
                  <button 
                    onClick={() => setOpsiyonlar({...opsiyonlar, ekstraGaranti: !opsiyonlar.ekstraGaranti})}
                    className={`w-full text-left p-3 rounded-xl text-sm font-bold border transition ${opsiyonlar.ekstraGaranti ? 'bg-green-600/20 border-green-500 text-green-400' : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'}`}
                  >
                    {opsiyonlar.ekstraGaranti ? "🔒 +1 Yıl Garanti Eklendi" : "❌ İstemiyorum"}
                  </button>
                </div>

                {/* Opsiyon 3 */}
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-700">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-sm font-bold text-slate-200 flex items-center gap-1.5"><Clock size={14}/> Acil Müdahale</span>
                    <span className="text-xs font-mono text-green-400">+{ (4000).toLocaleString() } ₺</span>
                  </div>
                  <button 
                    onClick={() => setOpsiyonlar({...opsiyonlar, hizliMontaj: !opsiyonlar.hizliMontaj})}
                    className={`w-full text-left p-3 rounded-xl text-sm font-bold border transition ${opsiyonlar.hizliMontaj ? 'bg-orange-600/20 border-orange-500 text-orange-400' : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'}`}
                  >
                    {opsiyonlar.hizliMontaj ? "⚡ Ekspres Servis (24 Saat)" : "⏱️ Standart Planlama"}
                  </button>
                </div>
              </div>
            </div>

            <button className="w-full bg-green-500 hover:bg-green-600 text-white font-black text-lg p-5 rounded-3xl shadow-lg shadow-green-500/30 transition transform hover:-translate-y-1">
              TEKLİFİ ONAYLIYORUM
            </button>
            <p className="text-center text-[10px] text-slate-500">Onayladığınızda Buvisan yetkililerine anında bildirim gidecektir.</p>

          </div>
        </div>

      </div>
    </div>
  );
}