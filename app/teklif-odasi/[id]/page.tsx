"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams } from 'next/navigation';
import { Loader2, CheckCircle, FileText, Wallet, Clock, ShieldCheck, Wrench, ThumbsUp, ThumbsDown, XCircle } from 'lucide-react';

export default function TeklifOdasiMusteriEkrani() {
  const params = useParams();
  const id = params.id as string;
  
  const [teklif, setTeklif] = useState<any>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState(false);
  const [islemYukleniyor, setIslemYukleniyor] = useState(false);

  // Müşterinin kendi ekranında oynayacağı, firmanızın iş modeline uygun YENİ opsiyonlar
  const [opsiyonlar, setOpsiyonlar] = useState({
    pesinOdeme: false,
    hizliMudahale: false,
    uzatilmisGaranti: false,
    genelBakim: false
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
    
    let anaTutar = Number(teklif.total_price);
    let ekstraHizmetler = 0;

    if (opsiyonlar.hizliMudahale) ekstraHizmetler += 4500;
    if (opsiyonlar.uzatilmisGaranti) ekstraHizmetler += 5500;
    if (opsiyonlar.genelBakim) ekstraHizmetler += 8500;

    let araToplam = anaTutar + ekstraHizmetler;

    // Peşin ödeme seçilirse %5 indirim uygula
    if (opsiyonlar.pesinOdeme) {
      araToplam = araToplam - (araToplam * 0.05);
    }

    return araToplam;
  };

  const indirimMiktari = () => {
    if (!teklif || !opsiyonlar.pesinOdeme) return 0;
    let anaTutar = Number(teklif.total_price);
    let ekstraHizmetler = 0;
    if (opsiyonlar.hizliMudahale) ekstraHizmetler += 4500;
    if (opsiyonlar.uzatilmisGaranti) ekstraHizmetler += 5500;
    if (opsiyonlar.genelBakim) ekstraHizmetler += 8500;
    
    return (anaTutar + ekstraHizmetler) * 0.05;
  };

  // Teklifi Onaylama veya Reddetme Fonksiyonu
  const teklifCevapla = async (yeniDurum: 'onaylandi' | 'reddedildi') => {
    if (!confirm(`Teklifi ${yeniDurum === 'onaylandi' ? 'ONAYLAMAK' : 'REDDETMEK'} istediğinize emin misiniz?`)) return;
    
    setIslemYukleniyor(true);
    try {
      const { error } = await supabase
        .from('offers')
        .update({ 
            status: yeniDurum,
            final_price: dinamikToplamHesapla(),
            selected_options: opsiyonlar
        })
        .eq('id', id);

      if (error) throw error;

      setTeklif({ ...teklif, status: yeniDurum });
      
    } catch (err) {
      alert("İşlem sırasında bir hata oluştu, lütfen tekrar deneyin.");
    } finally {
      setIslemYukleniyor(false);
    }
  };

  if (yukleniyor) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center text-white">
        <Loader2 className="animate-spin text-blue-500 mb-4" size={48} />
        <p className="animate-pulse font-bold tracking-widest text-sm text-slate-400">Teklif Odası Hazırlanıyor...</p>
      </div>
    );
  }

  if (hata || !teklif) {
    return (
      <div className="min-h-screen bg-slate-900 flex justify-center items-center text-white p-6">
        <div className="bg-slate-800 p-8 rounded-3xl text-center max-w-md w-full border border-slate-700">
          <FileText size={64} className="text-slate-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Teklif Bulunamadı</h1>
          <p className="text-slate-400 text-sm">Bu teklif bağlantısı geçersiz, süresi dolmuş veya sistemden silinmiş olabilir. Lütfen yetkili ile iletişime geçin.</p>
        </div>
      </div>
    );
  }

  const islemTamamlandi = teklif.status === 'onaylandi' || teklif.status === 'reddedildi';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-4 md:p-8 font-sans selection:bg-indigo-500/30">
      <div className="max-w-5xl mx-auto">
        
        {/* Üst Bilgi Başlığı */}
        <div className="bg-slate-800 rounded-3xl p-6 md:p-10 mb-6 shadow-2xl border border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
          
          {teklif.status === 'onaylandi' && <div className="absolute right-10 top-1/2 -translate-y-1/2 opacity-5 pointer-events-none"><CheckCircle size={200} className="text-green-500"/></div>}
          {teklif.status === 'reddedildi' && <div className="absolute right-10 top-1/2 -translate-y-1/2 opacity-5 pointer-events-none"><XCircle size={200} className="text-red-500"/></div>}

          <div className="relative z-10">
            <h2 className="text-indigo-400 font-bold tracking-widest text-xs uppercase mb-2">Özel Teklif Odası</h2>
            <h1 className="text-3xl md:text-4xl font-black text-white">{teklif.customer_name}</h1>
            <p className="text-slate-400 mt-2 text-sm max-w-lg leading-relaxed">
              Sayın <span className="text-white font-bold">{teklif.customer_rep || 'Yetkili'}</span>, size özel hazırlanan interaktif teklif detayları aşağıdadır. Lütfen opsiyonlarınızı belirleyip teklifi yanıtlayınız.
            </p>
          </div>
          <div className="bg-slate-900/80 backdrop-blur-md p-5 rounded-2xl border border-slate-700 text-right shrink-0 min-w-[200px] relative z-10">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Güncel Toplam Tutar</p>
            <p className="text-4xl font-black text-emerald-400">{Math.round(dinamikToplamHesapla()).toLocaleString()} ₺</p>
            {opsiyonlar.pesinOdeme && (
              <p className="text-[10px] text-emerald-500 mt-1 font-bold">-{Math.round(indirimMiktari()).toLocaleString()} ₺ Peşin İndirimi Uygulandı</p>
            )}
          </div>
        </div>

        {islemTamamlandi && (
          <div className={`p-6 rounded-2xl mb-6 border flex items-center gap-4 ${teklif.status === 'onaylandi' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
            {teklif.status === 'onaylandi' ? <CheckCircle size={32} /> : <XCircle size={32} />}
            <div>
              <h3 className="font-bold text-lg">{teklif.status === 'onaylandi' ? 'Bu Teklif Onaylanmıştır' : 'Bu Teklif Reddedilmiştir'}</h3>
              <p className="text-sm opacity-80 mt-1">İşleminiz kaydedildi ve operasyon ekibimize bilgi verildi. Teşekkür ederiz.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Sol Taraf: Teklif Detayları (Maliyet kısımları tamamen gizlendi) */}
          <div className="lg:col-span-2 bg-slate-800 rounded-3xl p-6 md:p-10 shadow-xl border border-slate-700">
            <h3 className="text-xl font-bold text-white mb-6 border-b border-slate-700 pb-4">Hizmet ve Malzeme Dökümü</h3>
            
            <div className="space-y-4 mb-8">
              {teklif.items && teklif.items.map((item: any, i: number) => (
                <div key={i} className="flex justify-between items-center bg-slate-900/50 p-5 rounded-2xl border border-slate-700/50 hover:border-slate-600 transition-colors">
                  <div>
                    <div className="font-bold text-slate-200 text-lg">{item.ad}</div>
                    {/* İÇ MALİYETLERİ GÖSTEREN item.detay KISMI BURADAN KALDIRILDI */}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500 font-mono mb-1">{item.adet} x {Number(item.birim_fiyat).toLocaleString()} ₺</div>
                    <div className="font-black text-white text-lg">{Number(item.toplam).toLocaleString()} ₺</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-indigo-900/20 border border-indigo-500/20 p-6 rounded-2xl">
              <h4 className="font-bold text-indigo-300 mb-2 text-sm">Teklif Şartları ve Standart İşleyiş</h4>
              <p className="text-sm text-indigo-100/70 whitespace-pre-line leading-relaxed">
                {teklif.description || 'Bu teklif 15 gün süreyle geçerlidir. Fiyatlara KDV dahil değildir.\n\n• İşletmemiz müdahalelerde kesinlikle 2. el parça kullanmamaktadır. Tüm değişimler SIFIR yedek parçalarla sağlanır.\n• Standart hizmetlerimizde, müdahale sonrası 3 hafta içerisinde gerçekleşen aynı arızalar için servis veya işçilik ücreti talep edilmemektedir.'}
              </p>
            </div>
          </div>

          {/* Sağ Taraf: Müşteriye Özel Yenilenmiş İnteraktif Opsiyon Paneli */}
          <div className="space-y-6">
            <div className={`bg-slate-800 rounded-3xl p-6 shadow-xl border border-slate-700 transition-opacity ${islemTamamlandi ? 'opacity-50 pointer-events-none' : ''}`}>
              <h3 className="text-sm font-black text-white uppercase tracking-wider mb-2 flex items-center gap-2">
                <Wrench size={18} className="text-indigo-400"/>
                Opsiyonel Hizmetler
              </h3>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">İhtiyaçlarınıza göre aşağıdaki ek hizmetleri teklife dahil edebilirsiniz.</p>

              <div className="space-y-4">
                
                {/* Opsiyon 1: Ödeme Şekli (Korundu) */}
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-700 hover:border-slate-600 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-sm font-bold text-slate-200 flex items-center gap-1.5"><Wallet size={14} className="text-emerald-400"/> Ödeme Vadesi</span>
                    <span className="text-xs font-mono text-emerald-400 font-bold">%5 İndirim</span>
                  </div>
                  <button 
                    onClick={() => setOpsiyonlar({...opsiyonlar, pesinOdeme: !opsiyonlar.pesinOdeme})}
                    className={`w-full text-left p-3 rounded-xl text-sm font-bold border transition ${opsiyonlar.pesinOdeme ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'}`}
                  >
                    {opsiyonlar.pesinOdeme ? "💵 Peşin Ödeme (İndirim Uygulandı)" : "⏱️ Vadeli Ödeme (Standart)"}
                  </button>
                </div>

                {/* YENİ Opsiyon 2: Acil Müdahale */}
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-700 hover:border-slate-600 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-sm font-bold text-slate-200 flex items-center gap-1.5"><Clock size={14} className="text-red-400"/> Servis Önceliği</span>
                    <span className="text-xs font-mono text-slate-400">+{ (4500).toLocaleString() } ₺</span>
                  </div>
                  <button 
                    onClick={() => setOpsiyonlar({...opsiyonlar, hizliMudahale: !opsiyonlar.hizliMudahale})}
                    className={`w-full text-left p-3 rounded-xl text-sm font-bold border transition ${opsiyonlar.hizliMudahale ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'}`}
                  >
                    {opsiyonlar.hizliMudahale ? "🚀 Aynı Gün Öncelikli Müdahale" : "⏳ Standart Servis Planlaması"}
                  </button>
                </div>

                {/* YENİ Opsiyon 3: Uzatılmış Garanti */}
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-700 hover:border-slate-600 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-sm font-bold text-slate-200 flex items-center gap-1.5"><ShieldCheck size={14} className="text-blue-400"/> İşçilik Garantisi</span>
                    <span className="text-xs font-mono text-slate-400">+{ (5500).toLocaleString() } ₺</span>
                  </div>
                  <button 
                    onClick={() => setOpsiyonlar({...opsiyonlar, uzatilmisGaranti: !opsiyonlar.uzatilmisGaranti})}
                    className={`w-full text-left p-3 rounded-xl text-sm font-bold border transition ${opsiyonlar.uzatilmisGaranti ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'}`}
                  >
                    {opsiyonlar.uzatilmisGaranti ? "🛡️ 3 Aylık Uzatılmış İşçilik Garantisi" : "📋 Standart Garanti (3 Hafta)"}
                  </button>
                </div>

                {/* YENİ Opsiyon 4: Genel Bakım & Yağlama */}
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-700 hover:border-slate-600 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-sm font-bold text-slate-200 flex items-center gap-1.5"><Wrench size={14} className="text-orange-400"/> Genel Kontrol</span>
                    <span className="text-xs font-mono text-slate-400">+{ (8500).toLocaleString() } ₺</span>
                  </div>
                  <button 
                    onClick={() => setOpsiyonlar({...opsiyonlar, genelBakim: !opsiyonlar.genelBakim})}
                    className={`w-full text-left p-3 rounded-xl text-sm font-bold border transition ${opsiyonlar.genelBakim ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'}`}
                  >
                    {opsiyonlar.genelBakim ? "⚙️ Genel Yağlama ve Fiziksel Check-up Eklendi" : "❌ Sadece İlgili Arıza Giderimi"}
                  </button>
                </div>

              </div>
            </div>

            {/* ONAYLA / REDDET BUTONLARI */}
            {!islemTamamlandi && (
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => teklifCevapla('onaylandi')}
                  disabled={islemYukleniyor}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black text-sm p-4 rounded-2xl shadow-lg shadow-emerald-500/20 transition transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                >
                  {islemYukleniyor ? <Loader2 className="animate-spin" size={18}/> : <ThumbsUp size={18}/>}
                  TEKLİFİ ONAYLIYORUM
                </button>
                
                <button 
                  onClick={() => teklifCevapla('reddedildi')}
                  disabled={islemYukleniyor}
                  className="w-full bg-slate-800 hover:bg-rose-600 disabled:bg-slate-800 text-slate-300 hover:text-white font-bold text-sm p-4 rounded-2xl border border-slate-700 hover:border-rose-600 transition flex items-center justify-center gap-2"
                >
                  <ThumbsDown size={18}/>
                  Talebi İptal Et / Reddet
                </button>
                <p className="text-center text-[10px] text-slate-500 px-2 leading-relaxed">
                  İşlemi onayladığınızda veya reddettiğinizde operasyon birimimize anında bildirim gönderilecek ve süreç başlatılacaktır.
                </p>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}