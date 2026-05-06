"use client";

// ----------------------------------------------------------------------------
// BUVISAN GLOBAL YÖNETİM MERKEZİ 🌍
// Versiyon: FINAL PRO MAX V4 (Otomatik Sabit Giderler ve Finans Modalı 📊)
// ----------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Loader2, Plus, Search, Trash2, Save, Package, ArrowLeft, 
  Edit2, TrendingUp, DollarSign, BarChart3, AlertCircle, X, 
  Activity, DownloadCloud, ShieldCheck, Calculator, Clock, Users, UserPlus,
  CalendarDays, TrendingDown, Wallet
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

export default function MalzemelerSayfasi() {

  // ==========================================================================
  // 1. STATE VE AYARLAR
  // ==========================================================================
  const [yukleniyor, setYukleniyor] = useState(true);
  
  // Veriler
  const [malzemeler, setMalzemeler] = useState<any[]>([]);
  const [analizliMalzemeler, setAnalizliMalzemeler] = useState<any[]>([]);
  const [tumServisler, setTumServisler] = useState<any[]>([]); 
  
  // Modallar
  const [formAcik, setFormAcik] = useState(false);
  const [showFinancialModal, setShowFinancialModal] = useState(false);
  const [showMesaiModal, setShowMesaiModal] = useState(false); 
  const [showPersonelModal, setShowPersonelModal] = useState(false);

  // Form Kontrolleri
  const [arama, setArama] = useState("");
  const [duzenlemeId, setDuzenlemeId] = useState<string | null>(null);
  const [yeniMalzeme, setYeniMalzeme] = useState({
    name: '', unit: 'Adet', buy_price: '', sale_price: '', discount_rate: '0'
  });

  // DİNAMİK FİNANSAL DÖNEM SEÇİCİ
  const [seciliAy, setSeciliAy] = useState(new Date().toISOString().slice(0, 7));
  const [aylikMalzemeAnalizi, setAylikMalzemeAnalizi] = useState({ ciro: 0, maliyet: 0, kar: 0 });

  // Finansal Modal State
  const [finansalLoading, setFinansalLoading] = useState(false);
  const [finansalVeri, setFinansalVeri] = useState<any>({
    maas: 0, malzeme: 0, kira: 50000, tazminat: 0, yakit: 0, yemek: 15000, mesaiYemek: 3500, aracYipranma: 3000, aracSigorta: 0, aracBakim: 7000, kdvDahilFatura: 0, gResmiFatura: 0
  });

  // PERSONEL VERİLERİ 
  const [personelListesi, setPersonelListesi] = useState<any[]>([]);
  const [yeniPersonelAd, setYeniPersonelAd] = useState("");
  const [mesaiForm, setMesaiForm] = useState({ maas: 0, saat15: 0, saat20: 0, izin: 0 });

  // İstatistik (Genel)
  const [istatistik, setIstatistik] = useState({
    toplamUrunCesidi: 0, enCokSatan: '-', enKarliUrun: '-', toplamMalzemeKari: 0
  });

  // ==========================================================================
  // 2. VERİ ÇEKME MOTORU
  // ==========================================================================
  useEffect(() => {
    verileriGetirVeAnalizEt();
  }, []);

  useEffect(() => {
    aylikPerformansHesapla();
    if(showFinancialModal) finansalVeriyiGetir(seciliAy);
    if(showPersonelModal) personelVerisiniGetir(seciliAy);
  }, [seciliAy, tumServisler, malzemeler, showFinancialModal, showPersonelModal]);

  const verileriGetirVeAnalizEt = async () => {
    try {
        setYukleniyor(true);
        const { data: stokData } = await supabase.from('materials').select('*').order('name', { ascending: true });
        const { data: servisData } = await supabase.from('completed_services').select('*'); 

        if (stokData && servisData) {
            setMalzemeler(stokData);
            setTumServisler(servisData);
            genelPerformansHesapla(stokData, servisData);
        }
    } catch (error) {
        console.error("Veri hatası:", error);
    } finally {
        setYukleniyor(false);
    }
  };

  const aylikPerformansHesapla = () => {
      if (tumServisler.length === 0 || malzemeler.length === 0) return;

      const [secilenYil, secilenAyIndex] = seciliAy.split('-').map(Number);
      let toplamCiro = 0;
      let toplamMaliyet = 0;

      tumServisler.forEach(servis => {
          if (!servis.service_date) return;
          const islemTarihi = new Date(servis.service_date);
          
          if (islemTarihi.getFullYear() === secilenYil && (islemTarihi.getMonth() + 1) === secilenAyIndex) {
              if (servis.materials && Array.isArray(servis.materials)) {
                  servis.materials.forEach((satilanMalzeme: any) => {
                      const adet = Number(satilanMalzeme.adet || 1);
                      const satisFiyati = Number(satilanMalzeme.toplam_fiyat || satilanMalzeme.fiyat || 0);
                      const stokMalzemesi = malzemeler.find(m => m.name === (satilanMalzeme.ad || satilanMalzeme.name));
                      const alisFiyati = stokMalzemesi ? Number(stokMalzemesi.buy_price) : 0;
                      const maliyet = alisFiyati * adet;

                      toplamCiro += satisFiyati;
                      toplamMaliyet += maliyet;
                  });
              }
          }
      });

      setAylikMalzemeAnalizi({ ciro: toplamCiro, maliyet: toplamMaliyet, kar: toplamCiro - toplamMaliyet });
  };

  const genelPerformansHesapla = (stokListesi: any[], servisListesi: any[]) => {
      const satisOzeti: any = {}; 
      servisListesi.forEach(servis => {
          if (servis.materials && Array.isArray(servis.materials)) {
              servis.materials.forEach((m: any) => {
                  const anahtar = m.ad || m.name; 
                  if (!satisOzeti[anahtar]) satisOzeti[anahtar] = { toplamSatisAdedi: 0, toplamCiro: 0 };
                  satisOzeti[anahtar].toplamSatisAdedi += Number(m.adet || 1);
                  satisOzeti[anahtar].toplamCiro += Number(m.toplam_fiyat || m.fiyat);
              });
          }
      });

      let toplamKar = 0; let enCokSatanAd = '-'; let enCokSatanMiktar = 0; let enKarliAd = '-'; let enYuksekKar = 0;

      const detayliListe = stokListesi.map(malzeme => {
          const satisVerisi = satisOzeti[malzeme.name] || { toplamSatisAdedi: 0, toplamCiro: 0 };
          const birimKar = Number(malzeme.sale_price) - Number(malzeme.buy_price);
          const toplamUrunKari = birimKar * satisVerisi.toplamSatisAdedi;
          toplamKar += toplamUrunKari;

          if (satisVerisi.toplamSatisAdedi > enCokSatanMiktar) { enCokSatanMiktar = satisVerisi.toplamSatisAdedi; enCokSatanAd = malzeme.name; }
          if (toplamUrunKari > enYuksekKar) { enYuksekKar = toplamUrunKari; enKarliAd = malzeme.name; }

          return {
              ...malzeme,
              performans: {
                  satisAdedi: satisVerisi.toplamSatisAdedi,
                  toplamCiro: satisVerisi.toplamCiro,
                  toplamKar: toplamUrunKari,
                  karMarji: Number(malzeme.buy_price) > 0 ? ((Number(malzeme.sale_price) - Number(malzeme.buy_price)) / Number(malzeme.buy_price)) * 100 : 100
              }
          };
      });

      setIstatistik({ toplamUrunCesidi: stokListesi.length, enCokSatan: enCokSatanAd, enKarliUrun: enKarliAd, toplamMalzemeKari: toplamKar });
      setAnalizliMalzemeler(detayliListe.sort((a, b) => b.performans.toplamKar - a.performans.toplamKar));
  };

  // ==========================================================================
  // 3. FİNANSAL İŞLEMLER (OTOMATİK SABİT GİDERLER EKLENDİ)
  // ==========================================================================
  const finansalVeriyiGetir = async (ayKey: string) => {
    setFinansalLoading(true);
    const { data } = await supabase.from('financial_records').select('*').eq('month_key', ayKey).single();
    
    // Eğer o aya ait veri varsa onu getir, yoksa senin FİX rakamlarını otomatik doldur!
    if (data) {
      setFinansalVeri({
        maas: data.maas || 0, 
        malzeme: data.malzeme || 0, 
        kira: data.kira !== null ? data.kira : 50000, 
        tazminat: data.tazminat || 0, 
        yakit: data.yakit || 0, 
        yemek: data.yemek !== null ? data.yemek : 15000, 
        mesaiYemek: data.mesai_yemek !== null ? data.mesai_yemek : 3500, 
        aracYipranma: data.arac_yipranma !== null ? data.arac_yipranma : 3000, 
        aracSigorta: data.arac_sigorta || 0, 
        aracBakim: data.arac_bakim !== null ? data.arac_bakim : 7000,
        kdvDahilFatura: data.kdv_dahil_fatura || 0, 
        gResmiFatura: data.g_resmi_fatura || 0
      });
    } else {
      setFinansalVeri({ 
        maas: 0, malzeme: 0, kira: 50000, tazminat: 0, yakit: 0, 
        yemek: 15000, mesaiYemek: 3500, aracYipranma: 3000, 
        aracSigorta: 0, aracBakim: 7000, kdvDahilFatura: 0, gResmiFatura: 0 
      });
    }
    setFinansalLoading(false);
  };

  const finansalVeriyiKaydet = async () => {
    setFinansalLoading(true);
    const { error } = await supabase.from('financial_records').upsert({
        month_key: seciliAy,
        maas: finansalVeri.maas, malzeme: finansalVeri.malzeme, kira: finansalVeri.kira, tazminat: finansalVeri.tazminat,
        yakit: finansalVeri.yakit, yemek: finansalVeri.yemek, mesai_yemek: finansalVeri.mesaiYemek, arac_yipranma: finansalVeri.aracYipranma,
        arac_sigorta: finansalVeri.aracSigorta, arac_bakim: finansalVeri.aracBakim, kdv_dahil_fatura: finansalVeri.kdvDahilFatura, g_resmi_fatura: finansalVeri.gResmiFatura,
        updated_at: new Date()
    }, { onConflict: 'month_key' });
    if (error) alert("Hata: " + error.message); else alert("✅ Veriler Kaydedildi!");
    setFinansalLoading(false);
  };

  // ==========================================================================
  // 4. PERSONEL DETAY YÖNETİMİ
  // ==========================================================================
  const personelVerisiniGetir = async (ayKey: string) => {
      setFinansalLoading(true);
      const { data } = await supabase.from('personnel_monthly_lists').select('*').eq('month_key', ayKey).single();
      if(data && data.personnel_data) setPersonelListesi(data.personnel_data);
      else setPersonelListesi([]);
      setFinansalLoading(false);
  };

  const personelEkle = () => {
      if(!yeniPersonelAd) return alert("İsim yazmalısın.");
      setPersonelListesi([...personelListesi, { 
          id: Date.now(), ad: yeniPersonelAd, maas: 0, mesai50_saat: 0, mesai100_saat: 0, eksik_saat: 0, servis_primi: 0, avans: 0
      }]);
      setYeniPersonelAd("");
  };

  const personelVeriGuncelle = (id: number, key: string, val: number) => {
      setPersonelListesi(personelListesi.map(p => p.id === id ? { ...p, [key]: val } : p));
  };

  const personelSil = (id: number) => {
      if(confirm("Bu kişiyi listeden çıkarmak istiyor musun?")) setPersonelListesi(personelListesi.filter(p => p.id !== id));
  };

  const hesapla = (p: any) => {
      const saatUcreti = (Number(p.maas) || 0) / 225;
      const mesai50Tutar = saatUcreti * 1.5 * (Number(p.mesai50_saat) || 0);
      const mesai100Tutar = saatUcreti * 2.0 * (Number(p.mesai100_saat) || 0);
      const kesintiTutar = saatUcreti * (Number(p.eksik_saat) || 0);
      const servis = Number(p.servis_primi) || 0;
      const avans = Number(p.avans) || 0;
      const toplamAlacak = (Number(p.maas)||0) + mesai50Tutar + mesai100Tutar + servis - kesintiTutar - avans;
      return { saatUcreti, mesai50Tutar, mesai100Tutar, kesintiTutar, toplamAlacak };
  };

  const personelListesiniKaydet = async () => {
      setFinansalLoading(true);
      const toplamGider = personelListesi.reduce((acc, p) => acc + hesapla(p).toplamAlacak, 0);
      const { error } = await supabase.from('personnel_monthly_lists').upsert({
          month_key: seciliAy, personnel_data: personelListesi, total_expense: toplamGider, updated_at: new Date()
      }, { onConflict: 'month_key' });
      if (error) alert("Hata: " + error.message); else alert("✅ Personel Hakediş Listesi Kaydedildi!");
      setFinansalLoading(false);
  };

  const personelToplamAlacak = personelListesi.reduce((acc, p) => acc + hesapla(p).toplamAlacak, 0);

  // SİSTEM YEDEKLEME
  const tamSistemYedegiAl = async () => {
    if (!confirm("⚠️ TÜM SİSTEM YEDEĞİ bilgisayarına indirilsin mi?")) return;
    setFinansalLoading(true);
    try {
        const tablolar = ['materials', 'financial_records', 'completed_services', 'service_tickets', 'cranes', 'proposals', 'offers', 'profiles', 'customers', 'personnel_monthly_lists'];
        const yedekDosyasi: any = { tarih: new Date().toLocaleString(), sistem: "BUVISAN_TAM_YEDEK", veri: {} };
        await Promise.all(tablolar.map(async (tablo) => {
            const { data } = await supabase.from(tablo).select('*');
            if (data && data.length > 0) yedekDosyasi.veri[tablo] = data;
        }));
        const json = JSON.stringify(yedekDosyasi, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `BUVISAN_FULL_YEDEK_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        alert("✅ YEDEKLEME BAŞARILI! Dosya 'İndirilenler' klasöründe.");
    } catch (e: any) { alert("Yedekleme hatası: " + e.message); } 
    finally { setFinansalLoading(false); }
  };

  // CRUD
  const kaydetVeyaGuncelle = async () => {
    if (!yeniMalzeme.name || !yeniMalzeme.sale_price) return alert("Eksik bilgi!");
    setYukleniyor(true);
    const paket = { name: yeniMalzeme.name, unit: yeniMalzeme.unit, buy_price: Number(yeniMalzeme.buy_price), sale_price: Number(yeniMalzeme.sale_price), discount_rate: Number(yeniMalzeme.discount_rate) };
    let err;
    if(duzenlemeId) err = (await supabase.from('materials').update(paket).eq('id', duzenlemeId)).error;
    else err = (await supabase.from('materials').insert([paket])).error;
    if(err) alert(err.message); else { setFormAcik(false); formuSifirla(); verileriGetirVeAnalizEt(); }
    setYukleniyor(false);
  };
  const duzenle = (m: any) => { setDuzenlemeId(m.id); setYeniMalzeme({ name: m.name, unit: m.unit, buy_price: m.buy_price, sale_price: m.sale_price, discount_rate: m.discount_rate }); setFormAcik(true); };
  const formuSifirla = () => { setDuzenlemeId(null); setYeniMalzeme({ name: '', unit: 'Adet', buy_price: '', sale_price: '', discount_rate: '0' }); };
  const sil = async (id: string) => { if(confirm("Silmek istiyor musun?")) { await supabase.from('materials').delete().eq('id', id); verileriGetirVeAnalizEt(); } };
  const formatCurrency = (val: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(val);
  const filtrelenmisListe = analizliMalzemeler.filter(m => m.name.toLowerCase().includes(arama.toLowerCase()));
  const grafikVerisi = analizliMalzemeler.slice(0, 5).map(m => ({ name: m.name.substring(0,10), kar: m.performans.toplamKar }));

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-24 font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Package className="text-blue-600"/> Malzeme ve Performans</h1>
            <p className="text-slate-500 text-sm">Stok, fiyat, masraf ve kârlılık yönetimi.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <button onClick={() => setShowPersonelModal(true)} className="flex-1 md:flex-none bg-orange-100 border border-orange-200 text-orange-700 px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-orange-200 transition">
                <Users size={18}/> Personel Gider Detayı
            </button>
            <button onClick={() => setShowMesaiModal(true)} className="flex-1 md:flex-none bg-white border-2 border-indigo-100 text-indigo-600 px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-50 transition">
                <Calculator size={18}/> Mesai Hesapla
            </button>
            <button onClick={() => { formuSifirla(); setFormAcik(true); }} className="flex-1 md:flex-none bg-blue-600 text-white px-5 py-2 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-blue-700 transition">
                <Plus size={18}/> Yeni Malzeme
            </button>
            <Link href="/admin" className="flex-1 md:flex-none bg-white border px-5 py-2 rounded-xl font-bold text-slate-600 flex items-center justify-center gap-2 hover:bg-slate-50"><ArrowLeft size={18}/> Panel</Link>
        </div>
      </div>

      {/* =========================================================================
          🔥 BÖLÜM 1: DİNAMİK AYLIK MALZEME ANALİZİ PANOSU 🔥
          ========================================================================= */}
      <div className="mb-8 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-900 p-5 rounded-3xl shadow-lg border border-slate-800">
              <div className="flex items-center gap-3 text-white mb-4 sm:mb-0">
                  <div className="p-3 bg-blue-500/20 rounded-xl text-blue-400"><CalendarDays size={24}/></div>
                  <div>
                      <h2 className="text-lg font-black tracking-widest uppercase">Aylık Malzeme Analizi</h2>
                      <p className="text-[10px] text-slate-400 font-bold">Seçili ayda sahada kullanılan malzemelerin kâr/zarar durumu.</p>
                  </div>
              </div>
              <select 
                  value={seciliAy} 
                  onChange={e => setSeciliAy(e.target.value)} 
                  className="w-full sm:w-auto bg-slate-800 border-2 border-slate-700 text-white text-sm font-black px-6 py-3 rounded-xl outline-none cursor-pointer hover:bg-slate-700 transition appearance-none text-center"
              >
                  {Array.from({length:6},(_,i)=>2024+i).map(y=>["OCAK","ŞUBAT","MART","NİSAN","MAYIS","HAZİRAN","TEMMUZ","AĞUSTOS","EYLÜL","EKİM","KASIM","ARALIK"].map((a,ix)=><option key={`${y}-${ix+1}`} value={`${y}-${String(ix+1).padStart(2,'0')}`}>{a} {y}</option>))}
              </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* MALİYET */}
              <div className="bg-white p-5 rounded-2xl border-2 border-red-100 shadow-sm relative overflow-hidden flex flex-col justify-center">
                  <TrendingDown size={80} className="absolute -right-4 -bottom-4 text-red-50 opacity-50"/>
                  <div className="relative z-10">
                      <p className="text-[10px] font-bold text-red-500 uppercase flex items-center gap-1"><TrendingDown size={14}/> Toplam Malzeme Maliyeti (Alış)</p>
                      <p className="text-3xl font-black text-red-600 mt-1">{formatCurrency(aylikMalzemeAnalizi.maliyet)}</p>
                  </div>
              </div>
              
              {/* CİRO (SATIŞ) */}
              <div className="bg-white p-5 rounded-2xl border-2 border-blue-100 shadow-sm relative overflow-hidden flex flex-col justify-center">
                  <DollarSign size={80} className="absolute -right-4 -bottom-4 text-blue-50 opacity-50"/>
                  <div className="relative z-10">
                      <p className="text-[10px] font-bold text-blue-500 uppercase flex items-center gap-1"><DollarSign size={14}/> Toplam Malzeme Satışı (Ciro)</p>
                      <p className="text-3xl font-black text-blue-600 mt-1">{formatCurrency(aylikMalzemeAnalizi.ciro)}</p>
                  </div>
              </div>

              {/* NET KÂR */}
              <div className={`p-5 rounded-2xl shadow-sm border-2 relative overflow-hidden flex flex-col justify-center ${aylikMalzemeAnalizi.kar >= 0 ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 border-emerald-400 text-white' : 'bg-gradient-to-br from-red-500 to-red-600 border-red-400 text-white'}`}>
                  <Wallet size={80} className="absolute -right-4 -bottom-4 opacity-10"/>
                  <div className="relative z-10">
                      <p className="text-[10px] font-bold uppercase flex items-center gap-1 opacity-90"><Wallet size={14}/> {seciliAy} NET MALZEME KÂRI</p>
                      <p className="text-4xl font-black tracking-tighter mt-1">{formatCurrency(aylikMalzemeAnalizi.kar)}</p>
                  </div>
              </div>
          </div>
      </div>

      <div className="h-px w-full bg-slate-200 my-8"></div>

      {/* =========================================================================
          🔥 BÖLÜM 2: DEPO GENEL İSTATİSTİKLERİ (TÜM ZAMANLAR) 🔥
          ========================================================================= */}
      <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><Package size={20} className="text-blue-600"/> Depo Genel Analizi (Tüm Zamanlar)</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><div className="text-xs text-slate-400 font-bold uppercase mb-1 flex items-center gap-2"><Package size={14}/> Çeşit</div><div className="text-2xl font-black text-slate-800">{istatistik.toplamUrunCesidi}</div></div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><div className="text-xs text-slate-400 font-bold uppercase mb-1 flex items-center gap-2"><TrendingUp size={14}/> En Çok Satan</div><div className="text-lg font-bold text-blue-600 truncate">{istatistik.enCokSatan}</div></div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><div className="text-xs text-slate-400 font-bold uppercase mb-1 flex items-center gap-2"><DollarSign size={14}/> En Kârlı</div><div className="text-lg font-bold text-green-600 truncate">{istatistik.enKarliUrun}</div></div>
        
        {/* Diğer Giderler (Kira vb.) İçin Finansal Yönetim Modalı Butonu */}
        <button onClick={() => setShowFinancialModal(true)} className="bg-slate-900 p-5 rounded-2xl shadow-xl flex flex-col items-start hover:scale-[1.02] transition group relative overflow-hidden">
            <BarChart3 size={80} className="absolute right-[-10px] bottom-[-10px] text-white/5"/>
            <div className="text-[10px] text-slate-400 font-bold uppercase mb-1 flex items-center gap-2 relative z-10"><Activity size={14} className="text-emerald-400 animate-pulse"/> DİĞER GİDERLER (KİRA VB.)</div>
            <div className="text-xl font-black text-white relative z-10">FİNANS MODALI →</div>
        </button>
      </div>

      {/* LİSTE VE GRAFİK */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-white p-6 rounded-3xl shadow-sm border hidden lg:block"><h3 className="text-sm font-bold text-slate-500 mb-6 uppercase"><TrendingUp size={16} className="inline mr-2"/> En Kârlı 5 Ürün</h3><div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={grafikVerisi} layout="vertical"><CartesianGrid opacity={0.3}/><XAxis type="number" hide/><YAxis dataKey="name" type="category" width={100} tick={{fontSize:10}}/><Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}/><Bar dataKey="kar" fill="#10b981" radius={[0,4,4,0]} barSize={20}/></BarChart></ResponsiveContainer></div></div>
        <div className="lg:col-span-2 space-y-4">
            <div className="bg-white p-2 rounded-2xl border flex items-center gap-2 shadow-sm"><div className="p-2 text-slate-400"><Search size={20}/></div><input type="text" placeholder="Malzeme Ara..." value={arama} onChange={e=>setArama(e.target.value)} className="flex-1 p-2 bg-transparent outline-none font-bold"/></div>
            <div className="bg-white rounded-3xl shadow-sm border overflow-hidden">
                <table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]"><tr><th className="p-4 pl-6">Malzeme</th><th className="p-4 text-right">Fiyatlar</th><th className="p-4 text-center">Satış</th><th className="p-4 text-right">Toplam Kâr</th><th className="p-4 text-right pr-6">İşlem</th></tr></thead>
                    <tbody className="divide-y divide-slate-100 font-medium">{filtrelenmisListe.map(m=>(<tr key={m.id} className="hover:bg-blue-50/50"><td className="p-4 pl-6"><div className="font-bold text-slate-800">{m.name}</div><div className="text-[10px] text-slate-400">Marj: %{Math.round(m.performans.karMarji)}</div></td><td className="p-4 text-right"><div className="text-xs text-red-400">Alış: {formatCurrency(m.buy_price)}</div><div className="text-sm text-blue-600 font-black">Satış: {formatCurrency(m.sale_price)}</div></td><td className="p-4 text-center"><span className="bg-slate-100 px-3 py-1 rounded-full text-xs font-bold">{m.performans.satisAdedi} {m.unit}</span></td><td className="p-4 text-right font-bold text-green-600">{formatCurrency(m.performans.toplamKar)}</td><td className="p-4 text-right pr-6 flex justify-end gap-2"><button onClick={()=>duzenle(m)} className="p-2 bg-blue-50 text-blue-500 rounded-lg"><Edit2 size={16}/></button><button onClick={()=>sil(m.id)} className="p-2 bg-red-50 text-red-500 rounded-lg"><Trash2 size={16}/></button></td></tr>))}</tbody></table>
            </div>
        </div>
      </div>

      {/* 🚀 YENİ: DETAYLI PERSONEL GİDER MODALI (EXCEL FORMATINDA) */}
      <AnimatePresence>
        {showPersonelModal && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-orange-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
                <motion.div initial={{scale:0.95,y:20}} animate={{scale:1,y:0}} exit={{scale:0.95,y:20}} className="bg-white w-full max-w-[90rem] h-[90vh] rounded-[40px] shadow-2xl overflow-hidden flex flex-col">
                    
                    {/* Header */}
                    <div className="p-6 border-b flex justify-between items-center bg-orange-50 shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-orange-600 rounded-2xl text-white"><Users size={28}/></div>
                            <div>
                                <h2 className="text-2xl font-black text-slate-800">PERSONEL PUANTAJ VE HAKEDİŞ</h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="bg-white border-2 border-orange-200 text-orange-700 text-xs font-black px-4 py-1.5 rounded-full shadow-sm">{seciliAy}</span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">{finansalLoading ? 'Yükleniyor...' : 'Maaş/225 Modu Aktif'}</span>
                                </div>
                            </div>
                        </div>
                        <button onClick={()=>setShowPersonelModal(false)} className="p-3 bg-white hover:text-red-500 rounded-2xl border"><X size={24}/></button>
                    </div>

                    {/* İçerik */}
                    <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
                        <div className="flex gap-2 mb-6 max-w-md">
                            <input type="text" placeholder="Ad Soyad Giriniz..." value={yeniPersonelAd} onChange={e=>setYeniPersonelAd(e.target.value)} className="flex-1 p-3 rounded-xl border font-bold text-sm outline-none focus:ring-2 focus:ring-orange-300"/>
                            <button onClick={personelEkle} className="bg-orange-600 text-white px-6 rounded-xl font-bold hover:bg-orange-700 flex items-center gap-2"><UserPlus size={18}/> Ekle</button>
                        </div>

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-6 overflow-x-auto">
                            <table className="w-full text-sm text-left min-w-[1000px]">
                                <thead className="bg-slate-100 text-slate-500 font-bold uppercase text-[10px]">
                                    <tr>
                                        <th className="p-4 pl-6 w-48">Personel</th>
                                        <th className="p-4">Brüt Maaş</th>
                                        <th className="p-4 bg-blue-50/50">Ek.Mesai %50 (Saat)</th>
                                        <th className="p-4 bg-purple-50/50">Ek.Mesai %100 (Saat)</th>
                                        <th className="p-4 bg-red-50/50">Eksik/İzin (Saat)</th>
                                        <th className="p-4">Servis Primi</th>
                                        <th className="p-4">Avans</th>
                                        <th className="p-4 text-right bg-green-50/50 text-green-700 font-black">TOPLAM ALACAĞI</th>
                                        <th className="p-4 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {personelListesi.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-400">Henüz personel eklenmedi.</td></tr>}
                                    {personelListesi.map(p => {
                                        const h = hesapla(p);
                                        return (
                                            <tr key={p.id} className="hover:bg-orange-50/30 transition group">
                                                <td className="p-4 pl-6 font-bold text-slate-800">
                                                    {p.ad}
                                                    <div className="text-[9px] text-slate-400 font-mono mt-1">Saat Ücreti: {formatCurrency(h.saatUcreti)}</div>
                                                </td>
                                                <td className="p-4">
                                                    <input type="number" className="w-28 p-2 border rounded-lg font-mono font-bold text-slate-700" value={p.maas} onChange={e=>personelVeriGuncelle(p.id,'maas',Number(e.target.value))}/>
                                                </td>
                                                <td className="p-4 bg-blue-50/30">
                                                    <input type="number" placeholder="Saat" className="w-20 p-2 border rounded-lg font-mono text-blue-600 text-center" value={p.mesai50_saat} onChange={e=>personelVeriGuncelle(p.id,'mesai50_saat',Number(e.target.value))}/>
                                                    <div className="text-[9px] text-blue-400 font-mono mt-1 text-center">+{formatCurrency(h.mesai50Tutar)}</div>
                                                </td>
                                                <td className="p-4 bg-purple-50/30">
                                                    <input type="number" placeholder="Saat" className="w-20 p-2 border rounded-lg font-mono text-purple-600 text-center" value={p.mesai100_saat} onChange={e=>personelVeriGuncelle(p.id,'mesai100_saat',Number(e.target.value))}/>
                                                    <div className="text-[9px] text-purple-400 font-mono mt-1 text-center">+{formatCurrency(h.mesai100Tutar)}</div>
                                                </td>
                                                <td className="p-4 bg-red-50/30">
                                                    <input type="number" placeholder="Saat" className="w-20 p-2 border rounded-lg font-mono text-red-600 text-center" value={p.eksik_saat} onChange={e=>personelVeriGuncelle(p.id,'eksik_saat',Number(e.target.value))}/>
                                                    <div className="text-[9px] text-red-400 font-mono mt-1 text-center">-{formatCurrency(h.kesintiTutar)}</div>
                                                </td>
                                                <td className="p-4">
                                                    <input type="number" placeholder="0" className="w-24 p-2 border rounded-lg font-mono text-slate-600" value={p.servis_primi} onChange={e=>personelVeriGuncelle(p.id,'servis_primi',Number(e.target.value))}/>
                                                </td>
                                                <td className="p-4">
                                                    <input type="number" placeholder="0" className="w-24 p-2 border rounded-lg font-mono text-slate-600" value={p.avans} onChange={e=>personelVeriGuncelle(p.id,'avans',Number(e.target.value))}/>
                                                </td>
                                                <td className="p-4 text-right font-black text-lg text-green-700 bg-green-50/30 border-l border-green-100">
                                                    {formatCurrency(h.toplamAlacak)}
                                                </td>
                                                <td className="p-4 text-center"><button onClick={()=>personelSil(p.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={18}/></button></td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                        <div className="flex gap-8">
                            <div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase">Personel Sayısı</div>
                                <div className="text-xl font-bold">{personelListesi.length} Kişi</div>
                            </div>
                            <div>
                                <div className="text-[10px] font-bold text-orange-400 uppercase">ÖDENECEK TOPLAM TUTAR</div>
                                <div className="text-3xl font-black tracking-tight">{formatCurrency(personelToplamAlacak)}</div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={personelListesiniKaydet} disabled={finansalLoading} className="bg-orange-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-orange-700 transition shadow-lg shadow-orange-900/50 flex items-center gap-2">
                                {finansalLoading ? <Loader2 className="animate-spin"/> : <Save size={18}/>} KAYDET VE GÜNCELLE
                            </button>
                        </div>
                    </div>

                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* Mesai Modalı */}
      <AnimatePresence>{showMesaiModal && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-indigo-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4" onClick={()=>setShowMesaiModal(false)}>
            <motion.div initial={{scale:0.95,y:20}} animate={{scale:1,y:0}} exit={{scale:0.95,y:20}} className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
                <div className="p-6 border-b flex justify-between items-center bg-indigo-50"><div className="flex items-center gap-3"><div className="p-2 bg-indigo-600 rounded-xl text-white"><Calculator size={24}/></div><div><h2 className="text-xl font-black text-slate-800">MESAİ ROBOTU</h2><p className="text-[10px] text-indigo-500 font-bold">Maaş / 225 Prensibi ile Otomatik Hesap</p></div></div><button onClick={()=>setShowMesaiModal(false)} className="p-2 bg-white rounded-full text-slate-400 hover:text-red-500"><X/></button></div>
                <div className="p-8 flex flex-col md:flex-row gap-8">
                    <div className="flex-1 space-y-4">
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase">Personel Net Maaşı</label><input type="number" value={mesaiForm.maas} onChange={e=>setMesaiForm({...mesaiForm,maas:Number(e.target.value)})} className="w-full p-3 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-indigo-500"/></div>
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase">Cmt + Hafta İçi Mesai (Saat)</label><input type="number" placeholder="Örn: 10" value={mesaiForm.saat15} onChange={e=>setMesaiForm({...mesaiForm,saat15:Number(e.target.value)})} className="w-full p-3 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500"/></div>
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase">Pazar + Tatil Mesai (Saat)</label><input type="number" placeholder="Örn: 5" value={mesaiForm.saat20} onChange={e=>setMesaiForm({...mesaiForm,saat20:Number(e.target.value)})} className="w-full p-3 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-orange-500"/></div>
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase">Kullanılan İzin (Saat)</label><input type="number" placeholder="Örn: 8" value={mesaiForm.izin} onChange={e=>setMesaiForm({...mesaiForm,izin:Number(e.target.value)})} className="w-full p-3 border-2 border-red-50 rounded-xl font-bold outline-none focus:ring-2 focus:ring-red-500 text-red-600"/></div>
                    </div>
                    <div className="flex-1 bg-slate-50 rounded-3xl p-6 border border-slate-100 flex flex-col justify-center space-y-4">
                        {(()=>{
                            const saatlikUcret = mesaiForm.maas > 0 ? mesaiForm.maas / 225 : 0;
                            const mesaiKazanci = (saatlikUcret * 1.5 * mesaiForm.saat15) + (saatlikUcret * 2.0 * mesaiForm.saat20);
                            const izinKesintisi = saatlikUcret * mesaiForm.izin;
                            const netFark = mesaiKazanci - izinKesintisi;
                            const toplamOdenecek = mesaiForm.maas + netFark;
                            return <><div className="flex justify-between text-xs font-bold text-slate-500 pb-2 border-b"><span>Saatlik Ücret (X):</span><span>{formatCurrency(saatlikUcret)}</span></div><div className="flex justify-between text-xs font-bold text-green-600"><span>Mesai Geliri (+):</span><span>{formatCurrency(mesaiKazanci)}</span></div><div className="flex justify-between text-xs font-bold text-red-500"><span>İzin Kesintisi (-):</span><span>{formatCurrency(izinKesintisi)}</span></div><div className={`p-4 rounded-xl text-center ${netFark>=0?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}><div className="text-[10px] font-black uppercase">MAAŞA ETKİ</div><div className="text-2xl font-black">{netFark>0?'+':''}{formatCurrency(netFark)}</div></div><div className="bg-slate-900 rounded-2xl p-4 text-center text-white shadow-lg"><div className="text-[10px] font-black uppercase opacity-60">TOPLAM ÖDENECEK</div><div className="text-3xl font-black tracking-tighter">{formatCurrency(toplamOdenecek)}</div></div></>
                        })()}
                    </div>
                </div>
            </motion.div>
        </motion.div>
      )}</AnimatePresence>

      {/* 🔥 GERİ GELEN ŞAHESER: FİNANSAL MODAL (TAM NET KÂR HESAPLAYICISI) 🔥 */}
      <AnimatePresence>{showFinancialModal && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-2 md:p-6" onClick={() => setShowFinancialModal(false)}>
            <motion.div initial={{scale:0.9,y:50}} animate={{scale:1,y:0}} exit={{scale:0.9,y:50}} className="bg-white w-full max-w-7xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]" onClick={e => e.stopPropagation()}>
                
                {/* Modal Header & Dönem Seçici */}
                <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-slate-900 rounded-2xl text-emerald-400"><TrendingUp size={28}/></div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-800">FİNANS YÖNETİMİ (DİĞER GİDERLER)</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs font-bold text-slate-500">Seçili Dönem:</span>
                                <select value={seciliAy} onChange={e=>setSeciliAy(e.target.value)} className="bg-white border border-slate-300 text-slate-700 text-xs font-black px-3 py-1 rounded shadow-sm outline-none cursor-pointer hover:bg-slate-100">
                                    {Array.from({length:6},(_,i)=>2024+i).map(y=>["OCAK","ŞUBAT","MART","NİSAN","MAYIS","HAZİRAN","TEMMUZ","AĞUSTOS","EYLÜL","EKİM","KASIM","ARALIK"].map((a,ix)=><option key={`${y}-${ix+1}`} value={`${y}-${String(ix+1).padStart(2,'0')}`}>{a} {y}</option>))}
                                </select>
                            </div>
                        </div>
                    </div>
                    <button onClick={()=>setShowFinancialModal(false)} className="p-3 bg-white hover:text-red-500 rounded-2xl border transition"><X size={24}/></button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                    {/* Sol Kısım: Veri Girişi */}
                    <div className="w-full md:w-1/2 p-8 overflow-y-auto border-r bg-slate-50/30">
                        <h3 className="font-black text-slate-800 text-sm mb-6 flex items-center gap-2"><Edit2 size={16}/> GİDER/GELİR GİRİŞİ ({seciliAy})</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* FATURALAR GERİ GELDİ */}
                            {[{id:'maas',l:'Personel Maaş',c:'r'},{id:'kira',l:'Kira',c:'r'},{id:'yakit',l:'Yakıt',c:'r'},{id:'yemek',l:'Yemek',c:'r'},{id:'tazminat',l:'Tazminat',c:'r'},{id:'mesaiYemek',l:'Mesai Yemek',c:'r'},{id:'aracYipranma',l:'Araç Yıp.',c:'r'},{id:'aracSigorta',l:'Sigorta',c:'r'},{id:'aracBakim',l:'Bakım',c:'r'},{id:'kdvDahilFatura',l:'FATURA (KDV DAHİL)',c:'g'},{id:'gResmiFatura',l:'G.RESMİ GELİR',c:'g'}].map(i=>(
                                <div key={i.id}>
                                    <label className={`text-[10px] font-black uppercase ${i.c==='r'?'text-slate-400':'text-emerald-600'}`}>{i.l}</label>
                                    <input type="number" value={finansalVeri[i.id]} onChange={e=>setFinansalVeri({...finansalVeri,[i.id]:Number(e.target.value)})} className={`w-full p-3 border rounded-2xl font-black text-sm outline-none focus:ring-2 ${i.c==='r'?'text-slate-700':'text-emerald-700 border-emerald-100'}`}/>
                                </div>
                            ))}
                        </div>
                        <div className="mt-8 flex gap-3">
                            <button onClick={finansalVeriyiKaydet} disabled={finansalLoading} className="flex-1 bg-blue-600 text-white py-3 rounded-2xl font-black text-xs hover:bg-blue-700 transition flex items-center justify-center gap-2">{finansalLoading?<Loader2 className="animate-spin"/>:<><DownloadCloud size={16}/> BULUTA KAYDET</>}</button>
                            <button onClick={tamSistemYedegiAl} className="flex-1 bg-emerald-600 text-white py-3 rounded-2xl font-black text-xs hover:bg-emerald-700 transition flex items-center justify-center gap-2"><ShieldCheck size={16}/> BİLGİSAYARA YEDEKLE</button>
                        </div>
                    </div>
                    
                    {/* Sağ Kısım: Şirket Geneli Net Kâr Analizi */}
                    <div className="w-full md:w-1/2 p-8 overflow-y-auto bg-white flex flex-col justify-center">
                        {(()=>{
                            // Tüm masrafları topla (Faturalar hariç)
                            const topGider = Object.entries(finansalVeri).filter(([k])=>!k.includes('Fatura')).reduce((a,b)=>a+(b[1] as number),0);
                            // Net Gelir (Faturanın KDV'siz hali + Gayriresmi gelir)
                            const netGelir = (finansalVeri.kdvDahilFatura/1.20) + finansalVeri.gResmiFatura;
                            // Brüt
                            const brut = netGelir - topGider;
                            // Kurumlar veya Gelir Vergisi (Sadece kar varsa alınır, varsayılan %20)
                            const vergi = brut > 0 ? brut * 0.20 : 0;
                            // Cüzdanda kalan en net rakam
                            const net = brut - vergi;
                            
                            return (
                            <div className="space-y-6 text-center animate-in fade-in">
                                <h4 className="text-xs font-black text-slate-400 tracking-widest">{seciliAy} FİRMA NET KÂR / ZARAR DURUMU</h4>
                                <div className={`text-6xl font-black tracking-tighter ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {formatCurrency(net)}
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4 text-left">
                                    <div className="p-4 bg-slate-100 rounded-3xl">
                                        <div className="text-[10px] font-bold text-slate-500">GİDERLER (SABİT)</div>
                                        <div className="text-xl font-black text-red-500">{formatCurrency(topGider)}</div>
                                    </div>
                                    <div className="p-4 bg-emerald-50 rounded-3xl">
                                        <div className="text-[10px] font-bold text-emerald-600">GELİR (NET)</div>
                                        <div className="text-xl font-black text-emerald-700">{formatCurrency(netGelir)}</div>
                                    </div>
                                </div>
                                
                                <div className="p-4 bg-yellow-50 rounded-2xl border border-yellow-100 text-yellow-800 text-xs font-bold text-left flex gap-3">
                                    <AlertCircle size={20} className="shrink-0"/>
                                    <div>Bu ayki <b>{formatCurrency(brut)}</b> brüt kâr üzerinden, sisteme <b>{formatCurrency(vergi)}</b> tahmini gelir vergisi hesaplanıp netten düşülmüştür.</div>
                                </div>
                            </div>
                            )
                        })()}
                    </div>
                </div>
            </motion.div>
        </motion.div>
      )}</AnimatePresence>

      {/* MALZEME FORMU */}
      <AnimatePresence>{formAcik && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={()=>setFormAcik(false)}>
            <motion.div initial={{scale:0.95,y:20}} animate={{scale:1,y:0}} exit={{scale:0.95,y:20}} className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
                <div className="p-6 border-b flex justify-between items-center bg-blue-50"><h2 className="text-xl font-bold text-blue-700 flex items-center gap-2">{duzenlemeId?<Edit2/>:<Plus/>} {duzenlemeId?'Düzenle':'Ekle'}</h2><button onClick={()=>setFormAcik(false)}><X/></button></div>
                <div className="p-6 space-y-4">
                    <input placeholder="Malzeme Adı" value={yeniMalzeme.name} onChange={e=>setYeniMalzeme({...yeniMalzeme,name:e.target.value})} className="w-full p-3 border rounded-xl font-bold"/>
                    <div className="grid grid-cols-2 gap-4"><select value={yeniMalzeme.unit} onChange={e=>setYeniMalzeme({...yeniMalzeme,unit:e.target.value})} className="p-3 border rounded-xl"><option>Adet</option><option>Metre</option><option>Kg</option><option>Takım</option></select><input type="number" placeholder="İskonto" value={yeniMalzeme.discount_rate} onChange={e=>setYeniMalzeme({...yeniMalzeme,discount_rate:e.target.value})} className="p-3 border rounded-xl"/></div>
                    <div className="grid grid-cols-2 gap-4"><input type="number" placeholder="Alış" value={yeniMalzeme.buy_price} onChange={e=>setYeniMalzeme({...yeniMalzeme,buy_price:e.target.value})} className="p-3 border rounded-xl"/><input type="number" placeholder="Satış" value={yeniMalzeme.sale_price} onChange={e=>setYeniMalzeme({...yeniMalzeme,sale_price:e.target.value})} className="p-3 border-2 border-blue-100 rounded-xl font-black text-blue-600"/></div>
                </div>
                <div className="p-6 bg-slate-50 flex gap-3"><button onClick={()=>setFormAcik(false)} className="flex-1 py-3 bg-white border rounded-xl font-bold">Vazgeç</button><button onClick={kaydetVeyaGuncelle} className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-bold">Kaydet</button></div>
            </motion.div>
        </motion.div>
      )}</AnimatePresence>
    </div>
  );
}