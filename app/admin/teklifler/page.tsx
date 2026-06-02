"use client";

// ----------------------------------------------------------------------------
// BUVISAN GLOBAL YÖNETİM MERKEZİ 🌍
// Versiyon: TEKLİFLER V4.0 (İş Emirleri & Akıllı Servis Maliyet Otomasyonu 🔄)
// ----------------------------------------------------------------------------

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Loader2, Plus, FileText, Calendar, DollarSign, User, MapPin, 
  Box, Printer, Trash2, CheckCircle, XCircle, Search, FileCheck, Clock,
  ThumbsUp, ThumbsDown, MessageCircle, X, Link as LinkIcon, Calculator, AlertTriangle, TrendingUp, Settings
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

export default function TekliflerSayfasi() {
  
  // --- STATE ---
  const [yukleniyor, setYukleniyor] = useState(true);
  const [teklifler, setTeklifler] = useState<any[]>([]);
  const [stok, setStok] = useState<any[]>([]);
  const [aktifBiletler, setAktifBiletler] = useState<any[]>([]); 
  const [arama, setArama] = useState("");
  
  // FİLTRELEME SEKMESİ STATE'İ 
  const [aktifSekme, setAktifSekme] = useState<'hepsi' | 'beklemede' | 'onaylandi' | 'reddedildi'>('hepsi');

  // Modal & Form
  const [modalAcik, setModalAcik] = useState(false);
  const [onizlemeAcik, setOnizlemeAcik] = useState(false); 
  const [seciliTeklif, setSeciliTeklif] = useState<any | null>(null);

  // Form Verileri
  const [seciliBiletId, setSeciliBiletId] = useState<string>(""); 
  const [yeniTeklif, setYeniTeklif] = useState({
    customer_name: '', customer_address: '', customer_rep: '',
    offer_date: new Date().toISOString().split('T')[0],
    valid_until: new Date(new Date().setDate(new Date().getDate() + 15)).toISOString().split('T')[0], 
    template_type: 'standart', 
    description: '',
    total_price: 0
  });

  // Sepet (Malzemeler)
  const [kalemler, setKalemler] = useState<{id: number, ad: string, adet: number, birim_fiyat: number, toplam: number}[]>([]);
  
  // Malzeme Ekleme Yardımcıları
  const [secilenStokId, setSecilenStokId] = useState("");
  const [tempAdet, setTempAdet] = useState(1);
  const [tempFiyat, setTempFiyat] = useState(0);

  // 🔥 YENİ: AKILLI SERVİS HESAPLAYICI STATE'İ 🔥
  const [hesap, setHesap] = useState({
    kisiSayisi: 2,
    maas: 50000,
    yolSaati: 2,
    arizaSaati: 3,
    mesafeKm: 100,
    kmMaliyeti: 6,
    yemekMaliyeti: 600,
    genelGiderYuzdesi: 15,
    karMarji: 40
  });

  // Yazdırma Referansı
  const printRef = useRef<HTMLDivElement>(null);

  // --- VERİ ÇEKME ---
  useEffect(() => { verileriGetir(); }, []);

  const verileriGetir = async () => {
    const { data: teklifData } = await supabase.from('offers').select('*').order('created_at', { ascending: false });
    const { data: stokData } = await supabase.from('materials').select('*').order('name');
    
    const { data: biletData } = await supabase.from('service_tickets')
        .select('*, cranes(*)')
        .neq('pipeline_status', 'tamamlandi')
        .order('created_at', { ascending: false });
    
    if (teklifData) setTeklifler(teklifData);
    if (stokData) setStok(stokData);
    if (biletData) setAktifBiletler(biletData);

    setYukleniyor(false);
  };

  const handleBiletSecimi = (biletId: string) => {
      setSeciliBiletId(biletId);
      if (!biletId) return;

      const bilet = aktifBiletler.find(b => b.id === biletId);
      if (bilet) {
          setYeniTeklif({
              ...yeniTeklif,
              customer_name: bilet.cranes?.customer_name || bilet.manual_customer_name || '',
              customer_address: bilet.cranes?.location_address || bilet.manual_location || '',
              customer_rep: bilet.manual_customer_rep || '',
          });
      }
  };

  // --- İŞLEMLER ---
  const kalemEkle = () => {
    if(!tempAdet || !tempFiyat) return alert("Lütfen adet ve fiyat giriniz.");
    const stokUrun = stok.find(s => s.id === secilenStokId);
    const ad = stokUrun ? stokUrun.name : "Özel Hizmet/Ürün";
    
    setKalemler([...kalemler, {
        id: Date.now(), ad, adet: tempAdet, birim_fiyat: tempFiyat, toplam: tempAdet * tempFiyat
    }]);
    setSecilenStokId(""); setTempAdet(1); setTempFiyat(0);
  };

  // 🔥 YENİ: HESAPLANAN FİYATI TEKLİFE EKLEME FONKSİYONU 🔥
  const akilliFiyatiTeklifeEkle = (hesaplananFiyat: number) => {
      const ad = `Vinç Servis ve Müdahale Hizmeti (İşçilik, Yol ve Konaklama/Yemek Dahil)`;
      setKalemler([...kalemler, {
          id: Date.now(), 
          ad, 
          adet: 1, 
          birim_fiyat: Math.round(hesaplananFiyat), 
          toplam: Math.round(hesaplananFiyat)
      }]);
      alert("Akıllı fiyat başarıyla teklife eklendi! 🚀");
  };

  const kalemSil = (id: number) => setKalemler(kalemler.filter(k => k.id !== id));

  const toplamTutar = kalemler.reduce((acc, k) => acc + k.toplam, 0);

  const teklifKaydet = async () => {
    if (!yeniTeklif.customer_name) return alert("Müşteri adı zorunlu!");
    
    setYukleniyor(true);
    const paket = { ...yeniTeklif, items: kalemler, total_price: toplamTutar, related_ticket_id: seciliBiletId || null };
    
    const { error } = await supabase.from('offers').insert([paket]);
    
    if (error) {
        alert("Hata: " + error.message);
    } else {
        if (seciliBiletId) {
            await supabase.from('service_tickets')
                .update({ pipeline_status: 'teklif_bekliyor', status: 'bekliyor' })
                .eq('id', seciliBiletId);
        }

        alert("Teklif Oluşturuldu! Ana ekrandaki iş emri güncellendi. 📄");
        setModalAcik(false);
        verileriGetir();
        formuSifirla();
    }
    setYukleniyor(false);
  };

  const formuSifirla = () => {
      setYeniTeklif({
        customer_name: '', customer_address: '', customer_rep: '',
        offer_date: new Date().toISOString().split('T')[0],
        valid_until: new Date(new Date().setDate(new Date().getDate() + 15)).toISOString().split('T')[0],
        template_type: 'standart', description: '', total_price: 0
      });
      setKalemler([]);
      setSeciliBiletId("");
  };

  const sil = async (id: string) => {
      if(!confirm("Teklifi silmek istiyor musun?")) return;
      await supabase.from('offers').delete().eq('id', id);
      verileriGetir();
  };

  const durumGuncelle = async (id: string, yeniDurum: string) => {
      const { error } = await supabase.from('offers').update({ status: yeniDurum }).eq('id', id);
      if(!error) {
          verileriGetir(); 
      }
  };

  const whatsappPaylas = () => {
      if(!seciliTeklif) return;
      const mesaj = `Sayın ${seciliTeklif.customer_rep || 'Yetkili'}, ${seciliTeklif.template_type === 'standart' ? 'Fiyat Teklifiniz' : 'Sözleşmeniz'} ektedir. Toplam Tutar: ${seciliTeklif.total_price.toLocaleString()} TL. Saygılarımızla, Buvisan Vinç.`;
      const url = `https://wa.me/?text=${encodeURIComponent(mesaj)}`;
      window.open(url, '_blank');
  };

  const yazdir = () => {
      const printContent = printRef.current;
      if (!printContent) return;
      
      const win = window.open('', '', 'width=900,height=650');
      win?.document.write(`
        <html>
          <head>
            <title>Buvisan Teklif</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                @media print {
                    body { -webkit-print-color-adjust: exact; }
                }
            </style>
          </head>
          <body>${printContent.innerHTML}</body>
        </html>
      `);
      win?.document.close();
      win?.focus();
      setTimeout(() => { win?.print(); win?.close(); }, 500);
  };

  const filtrelenmis = teklifler.filter(t => {
      const aramaUyumu = t.customer_name.toLowerCase().includes(arama.toLowerCase());
      if (aktifSekme === 'hepsi') return aramaUyumu;
      return aramaUyumu && t.status === aktifSekme;
  });

  const bekleyenTutar = teklifler.filter(t => t.status === 'beklemede').reduce((a, b) => a + b.total_price, 0);
  const onayliTutar = teklifler.filter(t => t.status === 'onaylandi').reduce((a, b) => a + b.total_price, 0);

  // 🔥 AKILLI HESAPLAMA MATEMATİĞİ 🔥
  const hsSaatlikKisi = hesap.maas / 176;
  const hsToplamSure = hesap.yolSaati + hesap.arizaSaati;
  const hsIscilikMaliyeti = hsToplamSure * hsSaatlikKisi * hesap.kisiSayisi;
  const hsYolMaliyeti = hesap.mesafeKm * hesap.kmMaliyeti;
  
  const hsTabanMaliyet = hsIscilikMaliyeti + hsYolMaliyeti + hesap.yemekMaliyeti;
  const hsGenelGiderli = hsTabanMaliyet * (1 + (hesap.genelGiderYuzdesi / 100));
  const hsSatisFiyati = hsGenelGiderli * (1 + (hesap.karMarji / 100));
  const hsNetKar = hsSatisFiyati - hsTabanMaliyet;

  const handleHesap = (alan: string, deger: number) => {
      setHesap({...hesap, [alan]: deger});
  };

  if(yukleniyor && teklifler.length === 0) return <div className="h-screen flex justify-center items-center"><Loader2 className="animate-spin text-blue-600"/></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      
      {/* ÜST BAŞLIK */}
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><FileText className="text-blue-600"/> Teklif Yönetimi</h1>
            <p className="text-slate-500 text-sm">Arızalarla entegre profesyonel teklif, sözleşme ve sipariş formları.</p>
        </div>
        <div className="flex gap-2">
            <button onClick={() => { formuSifirla(); setModalAcik(true); }} className="bg-blue-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-lg"><Plus size={18}/> Yeni Teklif</button>
            <Link href="/admin" className="bg-white border px-5 py-2 rounded-xl font-bold text-slate-600 hover:bg-slate-100">Panele Dön</Link>
        </div>
      </div>

      {/* İSTATİSTİK */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <div className="text-xs font-bold text-slate-400 uppercase">Bekleyen Teklifler</div>
              <div className="text-2xl font-black text-orange-500">{bekleyenTutar.toLocaleString()} ₺</div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <div className="text-xs font-bold text-slate-400 uppercase">Onaylanan İşler</div>
              <div className="text-2xl font-black text-green-600">{onayliTutar.toLocaleString()} ₺</div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <div className="text-xs font-bold text-slate-400 uppercase">Toplam Teklif Sayısı</div>
              <div className="text-2xl font-black text-slate-800">{teklifler.length} Adet</div>
          </div>
      </div>

      {/* LİSTE */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          
          <div className="p-5 border-b border-slate-100 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-slate-50/50">
              <div className="flex items-center gap-3">
                  <h3 className="font-bold text-slate-700">📜 Teklif Geçmişi</h3>
                  <span className="text-xs font-bold text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-sm">{filtrelenmis.length} Kayıt</span>
              </div>
              
              <div className="flex flex-wrap md:flex-nowrap bg-slate-200/50 p-1 rounded-xl w-full xl:w-auto">
                   <button onClick={() => setAktifSekme('hepsi')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition ${aktifSekme === 'hepsi' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Tümü</button>
                   <button onClick={() => setAktifSekme('beklemede')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${aktifSekme === 'beklemede' ? 'bg-white text-orange-500 shadow-sm' : 'text-slate-500 hover:text-orange-500'}`}><Clock size={12}/> Bekleyenler</button>
                   <button onClick={() => setAktifSekme('onaylandi')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${aktifSekme === 'onaylandi' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500 hover:text-green-600'}`}><CheckCircle size={12}/> Onaylananlar</button>
                   <button onClick={() => setAktifSekme('reddedildi')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${aktifSekme === 'reddedildi' ? 'bg-white text-red-500 shadow-sm' : 'text-slate-500 hover:text-red-500'}`}><XCircle size={12}/> Reddedilenler</button>
               </div>

              <div className="relative w-full xl:w-64">
                  <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4"/>
                  <input type="text" placeholder="Müşteri Ara..." value={arama} onChange={e => setArama(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 transition bg-white"/>
              </div>
          </div>

          <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50/50 text-slate-500 font-bold uppercase text-[10px]">
                      <tr><th className="p-4 pl-6">Tarih</th><th className="p-4">Müşteri</th><th className="p-4">Şablon</th><th className="p-4">Tutar</th><th className="p-4">Durum</th><th className="p-4 text-right pr-6">İşlem</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {filtrelenmis.map(t => (
                          <tr key={t.id} className="hover:bg-slate-50/50 transition">
                              <td className="p-4 pl-6 font-mono text-slate-500 text-xs">{new Date(t.offer_date).toLocaleDateString('tr-TR')}</td>
                              <td className="p-4">
                                  <div className="font-bold text-slate-800">{t.customer_name}</div>
                                  {t.related_ticket_id && <div className="text-[9px] text-blue-500 mt-1 flex items-center gap-1"><LinkIcon size={10}/> Arızaya Bağlı Teklif</div>}
                              </td>
                              <td className="p-4"><span className="bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1 rounded text-[10px] uppercase font-bold">{t.template_type}</span></td>
                              <td className="p-4 font-black text-slate-700">{t.total_price.toLocaleString()} ₺</td>
                              <td className="p-4">
                                  {t.status === 'beklemede' && <span className="text-orange-500 bg-orange-50 border border-orange-100 px-2.5 py-1 rounded-full font-bold text-[10px] flex items-center gap-1 w-max"><Clock size={12}/> BEKLİYOR</span>}
                                  {t.status === 'onaylandi' && <span className="text-green-600 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full font-bold text-[10px] flex items-center gap-1 w-max"><CheckCircle size={12}/> ONAYLANDI</span>}
                                  {t.status === 'reddedildi' && <span className="text-red-500 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full font-bold text-[10px] flex items-center gap-1 w-max"><XCircle size={12}/> REDDEDİLDİ</span>}
                              </td>
                              <td className="p-4 pr-6 text-right flex justify-end gap-2 items-center">
                                  {t.status === 'beklemede' && (
                                      <>
                                        <button onClick={() => durumGuncelle(t.id, 'onaylandi')} className="p-2 bg-green-50 text-green-600 border border-green-100 rounded-lg hover:bg-green-600 hover:text-white transition" title="Onayla"><ThumbsUp size={16}/></button>
                                        <button onClick={() => durumGuncelle(t.id, 'reddedildi')} className="p-2 bg-red-50 text-red-500 border border-red-100 rounded-lg hover:bg-red-600 hover:text-white transition mr-2" title="Reddet"><ThumbsDown size={16}/></button>
                                      </>
                                  )}
                                  <button onClick={() => { setSeciliTeklif(t); setOnizlemeAcik(true); }} className="p-2 bg-blue-50 text-blue-500 border border-blue-100 rounded-lg hover:bg-blue-600 hover:text-white transition" title="Görüntüle & Yazdır"><Printer size={16}/></button>
                                  <button onClick={() => sil(t.id)} className="p-2 bg-slate-50 text-slate-400 border border-slate-200 rounded-lg hover:bg-red-500 hover:text-white transition"><Trash2 size={16}/></button>
                              </td>
                          </tr>
                      ))}
                      {filtrelenmis.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-medium">Bu kategoride gösterilecek kayıt bulunamadı.</td></tr>}
                  </tbody>
              </table>
          </div>
      </div>

      {/* --- MODAL 1: YENİ TEKLİF OLUŞTURMA SİHİRBAZI --- */}
      <AnimatePresence>
        {modalAcik && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-4xl rounded-[32px] shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
                    <div className="p-6 md:p-8 bg-slate-900 text-white flex justify-between items-center shrink-0 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5"><FileText size={100}/></div>
                        <h2 className="text-2xl font-black flex items-center gap-3 relative z-10"><FileText/> Yeni Teklif Oluştur</h2>
                        <button onClick={() => setModalAcik(false)} className="bg-slate-800 hover:bg-red-500 p-2 rounded-full transition relative z-10"><X/></button>
                    </div>
                    
                    <div className="p-6 md:p-8 overflow-y-auto space-y-6 bg-slate-50">
                        
                        {/* 1. İŞ EMRİ BAĞLANTISI */}
                        <div className="bg-orange-50 p-5 rounded-2xl border border-orange-200 shadow-sm relative overflow-hidden">
                            <div className="absolute right-0 top-0 opacity-10"><LinkIcon size={120}/></div>
                            <label className="text-xs font-bold text-orange-600 uppercase block mb-3 relative z-10">Bu Teklif Hangi Arıza / Keşif İçin Veriliyor? (Opsiyonel)</label>
                            <select 
                                className="w-full p-3 bg-white border border-orange-300 rounded-xl font-bold text-sm text-slate-800 outline-none focus:ring-2 focus:ring-orange-400 shadow-sm relative z-10 cursor-pointer"
                                value={seciliBiletId}
                                onChange={(e) => handleBiletSecimi(e.target.value)}
                            >
                                <option value="">Bağımsız Teklif (Arızaya Bağlama)</option>
                                {aktifBiletler.map(b => (
                                    <option key={b.id} value={b.id}>
                                        {b.cranes?.customer_name || b.manual_customer_name} - {b.description ? b.description.substring(0, 40) + '...' : 'Detay Yok'}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* 2. Şablon Seçimi */}
                        <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100">
                            <label className="text-xs font-bold text-blue-600 uppercase block mb-3">Şablon Türü Seçin</label>
                            <div className="flex gap-4">
                                {['standart', 'bakim', 'siparis'].map(tip => (
                                    <button 
                                        key={tip}
                                        onClick={() => setYeniTeklif({...yeniTeklif, template_type: tip})}
                                        className={`flex-1 py-3 rounded-xl border-2 font-bold uppercase text-xs transition ${yeniTeklif.template_type === tip ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-200' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-300'}`}
                                    >
                                        {tip === 'standart' ? 'Fiyat Teklifi' : tip === 'bakim' ? 'Periyodik Bakım' : 'Sipariş Formu'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 3. Müşteri Bilgileri */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Müşteri / Firma Adı</label>
                                <input type="text" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-400 shadow-sm" value={yeniTeklif.customer_name} onChange={e => setYeniTeklif({...yeniTeklif, customer_name: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Yetkili Kişi (Sayın...)</label>
                                <input type="text" className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-400 shadow-sm" value={yeniTeklif.customer_rep} onChange={e => setYeniTeklif({...yeniTeklif, customer_rep: e.target.value})} />
                            </div>
                            <div className="col-span-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Adres</label>
                                <input type="text" className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-400 shadow-sm" value={yeniTeklif.customer_address} onChange={e => setYeniTeklif({...yeniTeklif, customer_address: e.target.value})} />
                            </div>
                        </div>

                        {/* 🔥🔥🔥 4. AKILLI SERVİS FİYAT HESAPLAYICI (YENİ) 🔥🔥🔥 */}
                        <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="font-black text-indigo-800 flex items-center gap-2"><Calculator size={20}/> Akıllı Servis Fiyatı Hesaplayıcı</h4>
                                <span className="bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><Settings size={12}/> Dinamik Veri</span>
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                {/* Girdiler */}
                                <div className="bg-white p-2 rounded-xl border border-indigo-100">
                                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Maaş (Aylık/Kişi)</label>
                                    <input type="number" className="w-full font-bold text-sm outline-none text-slate-700" value={hesap.maas} onChange={e => handleHesap('maas', Number(e.target.value))} />
                                </div>
                                <div className="bg-white p-2 rounded-xl border border-indigo-100">
                                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Personel Sayısı</label>
                                    <input type="number" className="w-full font-bold text-sm outline-none text-slate-700" value={hesap.kisiSayisi} onChange={e => handleHesap('kisiSayisi', Number(e.target.value))} />
                                </div>
                                <div className="bg-white p-2 rounded-xl border border-indigo-100">
                                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Yol Süresi (Saat)</label>
                                    <input type="number" className="w-full font-bold text-sm outline-none text-slate-700" value={hesap.yolSaati} onChange={e => handleHesap('yolSaati', Number(e.target.value))} />
                                </div>
                                <div className="bg-white p-2 rounded-xl border border-indigo-100">
                                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Arıza Süresi (Saat)</label>
                                    <input type="number" className="w-full font-bold text-sm outline-none text-slate-700" value={hesap.arizaSaati} onChange={e => handleHesap('arizaSaati', Number(e.target.value))} />
                                </div>
                                <div className="bg-white p-2 rounded-xl border border-indigo-100">
                                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Mesafe (Gidiş-Dönüş KM)</label>
                                    <input type="number" className="w-full font-bold text-sm outline-none text-slate-700" value={hesap.mesafeKm} onChange={e => handleHesap('mesafeKm', Number(e.target.value))} />
                                </div>
                                <div className="bg-white p-2 rounded-xl border border-indigo-100">
                                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Araç Gideri (TL/KM)</label>
                                    <input type="number" className="w-full font-bold text-sm outline-none text-slate-700" value={hesap.kmMaliyeti} onChange={e => handleHesap('kmMaliyeti', Number(e.target.value))} />
                                </div>
                                <div className="bg-white p-2 rounded-xl border border-indigo-100">
                                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Yemek Masrafı (Toplam)</label>
                                    <input type="number" className="w-full font-bold text-sm outline-none text-slate-700" value={hesap.yemekMaliyeti} onChange={e => handleHesap('yemekMaliyeti', Number(e.target.value))} />
                                </div>
                                
                                {/* Kâr Marjları (Select ile) */}
                                <div className="col-span-2 md:col-span-4 grid grid-cols-2 gap-3 mt-2">
                                    <div className="bg-indigo-100/50 p-3 rounded-xl border border-indigo-200">
                                        <label className="text-[10px] font-bold text-indigo-600 uppercase block mb-1">Genel Gider Payı (%)</label>
                                        <select className="w-full bg-white border border-indigo-200 rounded-lg p-2 font-bold text-sm outline-none" value={hesap.genelGiderYuzdesi} onChange={e => handleHesap('genelGiderYuzdesi', Number(e.target.value))}>
                                            <option value={10}>%10</option>
                                            <option value={15}>%15</option>
                                            <option value={20}>%20</option>
                                            <option value={25}>%25</option>
                                        </select>
                                    </div>
                                    <div className="bg-green-50 p-3 rounded-xl border border-green-200">
                                        <label className="text-[10px] font-bold text-green-700 uppercase block mb-1">Hedef Kâr Marjı (%)</label>
                                        <select className="w-full bg-white border border-green-300 rounded-lg p-2 font-black text-green-700 text-sm outline-none shadow-sm" value={hesap.karMarji} onChange={e => handleHesap('karMarji', Number(e.target.value))}>
                                            <option value={30}>%30 Kâr</option>
                                            <option value={40}>%40 Kâr</option>
                                            <option value={50}>%50 Kâr</option>
                                            <option value={75}>%75 Kâr</option>
                                            <option value={100}>%100 Kâr</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Hesaplama Sonuç Tablosu */}
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 mb-4">
                                <div className="grid grid-cols-3 gap-4 text-center divide-x divide-slate-100">
                                    <div>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">İşçilik Maliyeti</div>
                                        <div className="font-bold text-slate-700">{Math.round(hsIscilikMaliyeti).toLocaleString()} ₺</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Yol Maliyeti</div>
                                        <div className="font-bold text-slate-700">{Math.round(hsYolMaliyeti).toLocaleString()} ₺</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Taban (Sıfır Zarar)</div>
                                        <div className="font-bold text-red-500">{Math.round(hsTabanMaliyet).toLocaleString()} ₺</div>
                                    </div>
                                </div>
                                <hr className="my-3 border-slate-100"/>
                                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                                    <div>
                                        <div className="text-xs font-bold text-slate-500 uppercase">Verilecek Fiyat (Kârlı)</div>
                                        <div className="text-[10px] text-green-600 font-bold mt-1">Net Kâr: +{Math.round(hsNetKar).toLocaleString()} ₺</div>
                                    </div>
                                    <div className="text-2xl font-black text-slate-800">{Math.round(hsSatisFiyati).toLocaleString()} ₺</div>
                                </div>
                            </div>

                            <button onClick={() => akilliFiyatiTeklifeEkle(hsSatisFiyati)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold p-3 rounded-xl shadow-md transition flex items-center justify-center gap-2">
                                <Plus size={18}/> Hesaplanmış Servis Fiyatını Teklife Ekle
                            </button>
                        </div>

                        {/* 5. Kalemler (Malzeme/İşçilik) */}
                        <div className="border border-slate-200 rounded-2xl p-5 bg-white shadow-sm">
                            <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Box size={16} className="text-blue-500"/> Hizmet ve Ürünler</h4>
                            
                            <div className="flex gap-2 mb-4 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                <select className="flex-1 p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none" value={secilenStokId} onChange={e => {
                                    setSecilenStokId(e.target.value);
                                    const urun = stok.find(s => s.id === e.target.value);
                                    if(urun) setTempFiyat(urun.sale_price);
                                }}>
                                    <option value="">Stoktan Seç (Opsiyonel)</option>
                                    {stok.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                                <input type="number" placeholder="Adet" className="w-20 p-2.5 bg-white border border-slate-200 rounded-lg text-center font-bold outline-none" value={tempAdet} onChange={e => setTempAdet(Number(e.target.value))} />
                                <input type="number" placeholder="Fiyat" className="w-28 p-2.5 bg-white border border-slate-200 rounded-lg font-bold outline-none" value={tempFiyat || ""} onChange={e => setTempFiyat(Number(e.target.value))} />
                                <button onClick={kalemEkle} className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-lg transition shadow-md"><Plus/></button>
                            </div>

                            <table className="w-full text-sm bg-white rounded-xl overflow-hidden border border-slate-100">
                                <thead className="bg-slate-50 text-[10px] text-slate-500 font-bold uppercase border-b border-slate-100"><tr><th className="p-3 text-left">Açıklama</th><th className="p-3 text-center">Adet</th><th className="p-3 text-right">Birim</th><th className="p-3 text-right">Toplam</th><th className="p-3"></th></tr></thead>
                                <tbody>
                                    {kalemler.map(k => (
                                        <tr key={k.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                                            <td className="p-3 font-medium text-slate-700">{k.ad}</td>
                                            <td className="p-3 text-center text-slate-500">{k.adet}</td>
                                            <td className="p-3 text-right text-slate-500">{k.birim_fiyat.toLocaleString()} ₺</td>
                                            <td className="p-3 text-right font-bold text-slate-800">{k.toplam.toLocaleString()} ₺</td>
                                            <td className="p-3 text-center"><button onClick={() => kalemSil(k.id)} className="text-red-400 hover:text-red-600 bg-red-50 p-1.5 rounded transition"><Trash2 size={14}/></button></td>
                                        </tr>
                                    ))}
                                    {kalemler.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400 text-xs">Henüz kalem eklenmedi.</td></tr>}
                                </tbody>
                            </table>
                            <div className="text-right mt-4 font-black text-2xl text-slate-800 bg-slate-50 inline-block float-right px-4 py-2 rounded-xl border border-slate-200">Toplam: {toplamTutar.toLocaleString()} ₺</div>
                            <div className="clear-both"></div>
                        </div>

                        {/* 6. Notlar */}
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Teklif Notları / Şartlar</label>
                            <textarea className="w-full p-4 bg-white border border-slate-200 rounded-xl text-sm resize-none outline-none focus:border-blue-400 shadow-sm leading-relaxed" rows={3} placeholder="Ödeme koşulları, garanti süresi vb..." value={yeniTeklif.description} onChange={e => setYeniTeklif({...yeniTeklif, description: e.target.value})}></textarea>
                        </div>
                    </div>

                    <div className="p-6 bg-white border-t border-slate-200 flex justify-end gap-3 shrink-0">
                        <button onClick={() => setModalAcik(false)} className="px-6 py-3.5 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-slate-600 transition text-sm">Vazgeç</button>
                        <button onClick={teklifKaydet} className="px-8 py-3.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition text-sm flex items-center gap-2">Teklifi Oluştur</button>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* --- MODAL 2: A4 KAĞIT ÖNİZLEME (ŞABLON MOTORU) --- */}
      <AnimatePresence>
        {onizlemeAcik && seciliTeklif && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-slate-900/90 z-[60] flex items-center justify-center p-4">
                
                <div className="bg-slate-200 w-full max-w-5xl h-[95vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden relative">
                    
                    <div className="bg-slate-800 text-white p-4 flex justify-between items-center shrink-0 z-50 shadow-md">
                        <h3 className="font-bold flex items-center gap-2"><FileCheck/> Önizleme Modu</h3>
                        <button onClick={() => setOnizlemeAcik(false)} className="hover:bg-slate-700 p-2 rounded-full"><X/></button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 flex justify-center bg-slate-600/50">
                        
                        <div ref={printRef} className="bg-white w-[210mm] min-h-[297mm] p-[15mm] shadow-xl relative text-black shrink-0">
                            
                            <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4 mb-8">
                                <div>
                                    <h1 className="text-3xl font-black text-slate-800 tracking-tighter">BUVİSAN</h1>
                                    <p className="text-sm font-bold text-slate-500">MAKİNA İMALAT SANAYİ VE TİCARET LİMİTED ŞİRKETİ</p>
                                </div>
                                <div className="text-right text-xs text-slate-600">
                                    <p>Demirci / Nilüfer / BURSA</p>
                                    <p>Tel: 0224 374 00 01</p>
                                    <p>Web: www.buvisan.com</p>
                                </div>
                            </div>

                            <div className="text-center mb-8">
                                <h2 className="text-xl font-bold uppercase border-b border-slate-300 inline-block pb-1">
                                    {seciliTeklif.template_type === 'standart' ? 'FİYAT TEKLİF FORMU' : 
                                     seciliTeklif.template_type === 'bakim' ? 'PERİYODİK BAKIM SÖZLEŞMESİ' : 'SİPARİŞ FORMU'}
                                </h2>
                                <p className="text-xs text-slate-400 mt-1">Tarih: {new Date(seciliTeklif.offer_date).toLocaleDateString('tr-TR')}</p>
                            </div>

                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-8 text-sm">
                                <div className="grid grid-cols-[100px_1fr] gap-2 mb-2">
                                    <span className="font-bold text-slate-600">Sayın:</span>
                                    <span>{seciliTeklif.customer_rep || 'Yetkili'}</span>
                                </div>
                                <div className="grid grid-cols-[100px_1fr] gap-2 mb-2">
                                    <span className="font-bold text-slate-600">Firma:</span>
                                    <span className="uppercase font-bold">{seciliTeklif.customer_name}</span>
                                </div>
                                <div className="grid grid-cols-[100px_1fr] gap-2">
                                    <span className="font-bold text-slate-600">Adres:</span>
                                    <span>{seciliTeklif.customer_address}</span>
                                </div>
                            </div>

                            <table className="w-full mb-8 border-collapse">
                                <thead>
                                    <tr className="bg-slate-100 text-slate-700 text-xs uppercase border-y border-slate-300">
                                        <th className="p-3 text-left">Açıklama / Malzeme</th>
                                        <th className="p-3 text-center">Miktar</th>
                                        <th className="p-3 text-right">Birim Fiyat</th>
                                        <th className="p-3 text-right">Tutar</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {seciliTeklif.items && seciliTeklif.items.map((item: any, i: number) => (
                                        <tr key={i} className="border-b border-slate-100">
                                            <td className="p-3">{item.ad}</td>
                                            <td className="p-3 text-center">{item.adet}</td>
                                            <td className="p-3 text-right">{Number(item.birim_fiyat).toLocaleString()} ₺</td>
                                            <td className="p-3 text-right font-bold">{Number(item.toplam).toLocaleString()} ₺</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-slate-800">
                                        <td colSpan={3} className="p-3 text-right font-bold uppercase text-slate-600">Genel Toplam</td>
                                        <td className="p-3 text-right font-black text-lg">{Number(seciliTeklif.total_price).toLocaleString()} ₺</td>
                                    </tr>
                                </tfoot>
                            </table>

                            <div className="mb-12">
                                <h4 className="font-bold text-sm border-b border-slate-200 mb-2 pb-1">Notlar ve Şartlar:</h4>
                                <div className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                                    {seciliTeklif.description || 'Bu teklif 15 gün süreyle geçerlidir. Fiyatlara KDV dahil değildir.'}
                                </div>
                            </div>

                            <div className="flex justify-between mt-auto pt-12 pb-8">
                                <div className="text-center">
                                    <p className="font-bold text-sm mb-12">Müşteri Onayı</p>
                                    <div className="border-t border-slate-400 w-32 mx-auto"></div>
                                    <p className="text-xs text-slate-400 mt-1">İmza / Kaşe</p>
                                </div>
                                <div className="text-center">
                                    <p className="font-bold text-sm mb-12">BUVİSAN Onayı</p>
                                    <div className="border-t border-slate-400 w-32 mx-auto"></div>
                                    <p className="text-xs text-slate-400 mt-1">İmza / Kaşe</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white border-t p-4 flex justify-center gap-4 shrink-0 z-50 shadow-[0_-5px_15px_rgba(0,0,0,0.1)]">
                        <button onClick={yazdir} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-700 flex items-center gap-2 transform active:scale-95 transition">
                            <Printer size={20}/> Yazdır / PDF Kaydet
                        </button>
                        <button onClick={whatsappPaylas} className="bg-green-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-green-600 flex items-center gap-2 transform active:scale-95 transition">
                            <MessageCircle size={20}/> WhatsApp'tan At
                        </button>
                        <button onClick={() => setOnizlemeAcik(false)} className="bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-bold shadow hover:bg-slate-200 flex items-center gap-2">
                            <XCircle size={20}/> Kapat
                        </button>
                    </div>

                </div>
            </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}