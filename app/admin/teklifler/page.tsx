"use client";

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Loader2, Plus, FileText, Calendar, DollarSign, User, MapPin, 
  Box, Printer, Trash2, CheckCircle, XCircle, Search, FileCheck, Clock,
  ThumbsUp, ThumbsDown, MessageCircle // 🔥 Yeni ikonlar eklendi
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

export default function TekliflerSayfasi() {
  
  // --- STATE ---
  const [yukleniyor, setYukleniyor] = useState(true);
  const [teklifler, setTeklifler] = useState<any[]>([]);
  const [stok, setStok] = useState<any[]>([]);
  const [arama, setArama] = useState("");
  
  // Modal & Form
  const [modalAcik, setModalAcik] = useState(false);
  const [onizlemeAcik, setOnizlemeAcik] = useState(false); // Şablon Önizleme Modu
  const [seciliTeklif, setSeciliTeklif] = useState<any | null>(null);

  // Form Verileri
  const [yeniTeklif, setYeniTeklif] = useState({
    customer_name: '', customer_address: '', customer_rep: '',
    offer_date: new Date().toISOString().split('T')[0],
    valid_until: new Date(new Date().setDate(new Date().getDate() + 15)).toISOString().split('T')[0], // 15 gün geçerli
    template_type: 'standart', // standart, bakim, siparis
    description: '',
    total_price: 0
  });

  // Sepet (Malzemeler)
  const [kalemler, setKalemler] = useState<{id: number, ad: string, adet: number, birim_fiyat: number, toplam: number}[]>([]);
  
  // Malzeme Ekleme Yardımcıları
  const [secilenStokId, setSecilenStokId] = useState("");
  const [tempAdet, setTempAdet] = useState(1);
  const [tempFiyat, setTempFiyat] = useState(0);

  // Yazdırma Referansı
  const printRef = useRef<HTMLDivElement>(null);

  // --- VERİ ÇEKME ---
  useEffect(() => { verileriGetir(); }, []);

  const verileriGetir = async () => {
    const { data: teklifData } = await supabase.from('offers').select('*').order('created_at', { ascending: false });
    const { data: stokData } = await supabase.from('materials').select('*').order('name');
    
    if (teklifData) setTeklifler(teklifData);
    if (stokData) setStok(stokData);
    setYukleniyor(false);
  };

  // --- İŞLEMLER ---
  const kalemEkle = () => {
    const stokUrun = stok.find(s => s.id === secilenStokId);
    const ad = stokUrun ? stokUrun.name : "Özel Hizmet/Ürün";
    
    setKalemler([...kalemler, {
        id: Date.now(), ad, adet: tempAdet, birim_fiyat: tempFiyat, toplam: tempAdet * tempFiyat
    }]);
    setSecilenStokId(""); setTempAdet(1); setTempFiyat(0);
  };

  const kalemSil = (id: number) => setKalemler(kalemler.filter(k => k.id !== id));

  const toplamTutar = kalemler.reduce((acc, k) => acc + k.toplam, 0);

  const teklifKaydet = async () => {
    if (!yeniTeklif.customer_name) return alert("Müşteri adı zorunlu!");
    
    setYukleniyor(true);
    const paket = { ...yeniTeklif, items: kalemler, total_price: toplamTutar };
    
    const { error } = await supabase.from('offers').insert([paket]);
    
    if (error) alert("Hata: " + error.message);
    else {
        alert("Teklif Oluşturuldu! 📄");
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
  };

  const sil = async (id: string) => {
      if(!confirm("Teklifi silmek istiyor musun?")) return;
      await supabase.from('offers').delete().eq('id', id);
      verileriGetir();
  };

  // 🔥 YENİ: DURUM GÜNCELLEME (ONAYLA / REDDET) 🔥
  const durumGuncelle = async (id: string, yeniDurum: string) => {
      const { error } = await supabase.from('offers').update({ status: yeniDurum }).eq('id', id);
      if(!error) {
          verileriGetir(); // Listeyi yenile ki istatistikler güncellensin
      }
  };

  // 🔥 YENİ: WHATSAPP PAYLAŞIM 🔥
  const whatsappPaylas = () => {
      if(!seciliTeklif) return;
      const mesaj = `Sayın ${seciliTeklif.customer_rep || 'Yetkili'}, ${seciliTeklif.template_type === 'standart' ? 'Fiyat Teklifiniz' : 'Sözleşmeniz'} ektedir. Toplam Tutar: ${seciliTeklif.total_price.toLocaleString()} TL. Saygılarımızla, Buvisan Vinç.`;
      const url = `https://wa.me/?text=${encodeURIComponent(mesaj)}`;
      window.open(url, '_blank');
  };

  // --- YAZDIRMA / PDF ---
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

  // Arama
  const filtrelenmis = teklifler.filter(t => t.customer_name.toLowerCase().includes(arama.toLowerCase()));

  // İstatistikler
  const bekleyenTutar = teklifler.filter(t => t.status === 'beklemede').reduce((a, b) => a + b.total_price, 0);
  const onayliTutar = teklifler.filter(t => t.status === 'onaylandi').reduce((a, b) => a + b.total_price, 0);

  if(yukleniyor && teklifler.length === 0) return <div className="h-screen flex justify-center items-center"><Loader2 className="animate-spin text-blue-600"/></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      
      {/* ÜST BAŞLIK */}
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><FileText className="text-blue-600"/> Teklif Yönetimi</h1>
            <p className="text-slate-500 text-sm">Profesyonel teklifler, sözleşmeler ve sipariş formları.</p>
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
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-slate-700">📜 Teklif Geçmişi</h3>
              <div className="relative"><Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4"/><input type="text" placeholder="Müşteri Ara..." value={arama} onChange={e => setArama(e.target.value)} className="pl-9 pr-4 py-2 border rounded-lg text-sm outline-none"/></div>
          </div>
          <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                  <tr><th className="p-4">Tarih</th><th className="p-4">Müşteri</th><th className="p-4">Şablon</th><th className="p-4">Tutar</th><th className="p-4">Durum</th><th className="p-4 text-right">İşlem</th></tr>
              </thead>
              <tbody className="divide-y">
                  {filtrelenmis.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50">
                          <td className="p-4 font-mono text-slate-500">{new Date(t.offer_date).toLocaleDateString('tr-TR')}</td>
                          <td className="p-4 font-bold text-slate-800">{t.customer_name}</td>
                          <td className="p-4"><span className="bg-blue-50 text-blue-600 px-2 py-1 rounded text-xs uppercase font-bold">{t.template_type}</span></td>
                          <td className="p-4 font-black text-slate-700">{t.total_price.toLocaleString()} ₺</td>
                          <td className="p-4">
                              {/* DURUM GÖSTERGESİ */}
                              {t.status === 'beklemede' && <span className="text-orange-500 font-bold text-xs flex items-center gap-1"><Clock size={12}/> Bekliyor</span>}
                              {t.status === 'onaylandi' && <span className="text-green-600 font-bold text-xs flex items-center gap-1"><CheckCircle size={12}/> Onaylandı</span>}
                              {t.status === 'reddedildi' && <span className="text-red-500 font-bold text-xs flex items-center gap-1"><XCircle size={12}/> Reddedildi</span>}
                          </td>
                          <td className="p-4 text-right flex justify-end gap-2 items-center">
                              {/* 🔥 DURUM BUTONLARI (Sadece beklemedeyse görünür) */}
                              {t.status === 'beklemede' && (
                                  <>
                                    <button onClick={() => durumGuncelle(t.id, 'onaylandi')} className="p-2 bg-green-100 text-green-600 rounded hover:bg-green-200 transition" title="Onayla"><ThumbsUp size={16}/></button>
                                    <button onClick={() => durumGuncelle(t.id, 'reddedildi')} className="p-2 bg-red-100 text-red-600 rounded hover:bg-red-200 transition mr-2" title="Reddet"><ThumbsDown size={16}/></button>
                                  </>
                              )}
                              
                              <button onClick={() => { setSeciliTeklif(t); setOnizlemeAcik(true); }} className="p-2 bg-blue-50 text-blue-600 rounded hover:bg-blue-100" title="Görüntüle & Yazdır"><Printer size={16}/></button>
                              <button onClick={() => sil(t.id)} className="p-2 bg-red-50 text-red-500 rounded hover:bg-red-100"><Trash2 size={16}/></button>
                          </td>
                      </tr>
                  ))}
              </tbody>
          </table>
      </div>

      {/* --- MODAL 1: YENİ TEKLİF OLUŞTURMA SİHİRBAZI --- */}
      <AnimatePresence>
        {modalAcik && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                    <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                        <h2 className="text-xl font-bold flex items-center gap-2"><FileText/> Yeni Teklif Oluştur</h2>
                        <button onClick={() => setModalAcik(false)}><XCircle/></button>
                    </div>
                    
                    <div className="p-6 overflow-y-auto space-y-6">
                        {/* 1. Şablon Seçimi */}
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <label className="text-xs font-bold text-blue-600 uppercase block mb-2">Şablon Türü Seçin</label>
                            <div className="flex gap-4">
                                {['standart', 'bakim', 'siparis'].map(tip => (
                                    <button 
                                        key={tip}
                                        onClick={() => setYeniTeklif({...yeniTeklif, template_type: tip})}
                                        className={`flex-1 py-3 rounded-lg border-2 font-bold uppercase text-xs transition ${yeniTeklif.template_type === tip ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-300'}`}
                                    >
                                        {tip === 'standart' ? 'Fiyat Teklifi' : tip === 'bakim' ? 'Periyodik Bakım' : 'Sipariş Formu'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 2. Müşteri Bilgileri */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-400">Müşteri / Firma Adı</label>
                                <input type="text" className="w-full p-3 border rounded-lg font-bold" value={yeniTeklif.customer_name} onChange={e => setYeniTeklif({...yeniTeklif, customer_name: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400">Yetkili Kişi (Sayın...)</label>
                                <input type="text" className="w-full p-3 border rounded-lg" value={yeniTeklif.customer_rep} onChange={e => setYeniTeklif({...yeniTeklif, customer_rep: e.target.value})} />
                            </div>
                            <div className="col-span-2">
                                <label className="text-xs font-bold text-slate-400">Adres</label>
                                <input type="text" className="w-full p-3 border rounded-lg" value={yeniTeklif.customer_address} onChange={e => setYeniTeklif({...yeniTeklif, customer_address: e.target.value})} />
                            </div>
                        </div>

                        {/* 3. Kalemler (Malzeme/İşçilik) */}
                        <div className="border rounded-xl p-4 bg-slate-50">
                            <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><Box size={16}/> Hizmet ve Ürünler</h4>
                            
                            <div className="flex gap-2 mb-4">
                                <select className="flex-1 p-2 border rounded-lg text-sm" value={secilenStokId} onChange={e => {
                                    setSecilenStokId(e.target.value);
                                    const urun = stok.find(s => s.id === e.target.value);
                                    if(urun) setTempFiyat(urun.sale_price);
                                }}>
                                    <option value="">Stoktan Seç (Opsiyonel)</option>
                                    {stok.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                                <input type="number" placeholder="Adet" className="w-20 p-2 border rounded-lg text-center" value={tempAdet} onChange={e => setTempAdet(Number(e.target.value))} />
                                <input type="number" placeholder="Fiyat" className="w-24 p-2 border rounded-lg" value={tempFiyat} onChange={e => setTempFiyat(Number(e.target.value))} />
                                <button onClick={kalemEkle} className="bg-green-600 text-white p-2 rounded-lg"><Plus/></button>
                            </div>

                            <table className="w-full text-sm bg-white rounded-lg overflow-hidden shadow-sm">
                                <thead className="bg-slate-100 text-xs text-slate-500 font-bold uppercase"><tr><th className="p-2 text-left">Açıklama</th><th className="p-2">Adet</th><th className="p-2 text-right">Birim</th><th className="p-2 text-right">Toplam</th><th className="p-2"></th></tr></thead>
                                <tbody>
                                    {kalemler.map(k => (
                                        <tr key={k.id} className="border-b">
                                            <td className="p-2">{k.ad}</td>
                                            <td className="p-2 text-center">{k.adet}</td>
                                            <td className="p-2 text-right">{k.birim_fiyat} ₺</td>
                                            <td className="p-2 text-right font-bold">{k.toplam} ₺</td>
                                            <td className="p-2 text-center"><button onClick={() => kalemSil(k.id)} className="text-red-500"><Trash2 size={14}/></button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="text-right mt-2 font-black text-xl text-slate-800">Toplam: {toplamTutar.toLocaleString()} ₺</div>
                        </div>

                        {/* 4. Notlar */}
                        <div>
                            <label className="text-xs font-bold text-slate-400">Teklif Notları / Şartlar</label>
                            <textarea className="w-full p-3 border rounded-lg text-sm" rows={3} placeholder="Ödeme koşulları, garanti süresi vb..." value={yeniTeklif.description} onChange={e => setYeniTeklif({...yeniTeklif, description: e.target.value})}></textarea>
                        </div>
                    </div>

                    <div className="p-4 bg-slate-100 flex justify-end gap-3">
                        <button onClick={() => setModalAcik(false)} className="px-6 py-3 bg-white border rounded-xl font-bold text-slate-600">Vazgeç</button>
                        <button onClick={teklifKaydet} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg">Teklifi Oluştur</button>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* --- MODAL 2: A4 KAĞIT ÖNİZLEME (ŞABLON MOTORU) --- */}
      <AnimatePresence>
        {onizlemeAcik && seciliTeklif && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-slate-800/90 z-[60] flex items-center justify-center p-4 overflow-y-auto">
                <div className="max-h-full overflow-y-auto w-full flex flex-col items-center">
                    
                    {/* A4 KAĞIDI (YAZDIRILACAK ALAN) */}
                    <div ref={printRef} className="bg-white w-[210mm] min-h-[297mm] p-[15mm] shadow-2xl relative text-black">
                        
                        {/* HEADER: LOGO VE FİRMA BİLGİSİ */}
                        <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4 mb-8">
                            <div>
                                <h1 className="text-3xl font-black text-slate-800 tracking-tighter">ZM METAL</h1>
                                <p className="text-sm font-bold text-slate-500">MAKİNA İMALAT SANAYİ VE TİCARET LİMİTED ŞİRKETİ</p>
                            </div>
                            <div className="text-right text-xs text-slate-600">
                                <p>Demirci / Nilüfer / BURSA</p>
                                <p>Tel: 0224 374 00 01</p>
                                <p>Web: www.buvisan.com</p>
                            </div>
                        </div>

                        {/* BELGE BAŞLIĞI */}
                        <div className="text-center mb-8">
                            <h2 className="text-xl font-bold uppercase border-b border-slate-300 inline-block pb-1">
                                {seciliTeklif.template_type === 'standart' ? 'FİYAT TEKLİF FORMU' : 
                                 seciliTeklif.template_type === 'bakim' ? 'PERİYODİK BAKIM SÖZLEŞMESİ' : 'SİPARİŞ FORMU'}
                            </h2>
                            <p className="text-xs text-slate-400 mt-1">Tarih: {new Date(seciliTeklif.offer_date).toLocaleDateString('tr-TR')}</p>
                        </div>

                        {/* MÜŞTERİ BİLGİLERİ KUTUSU */}
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

                        {/* TABLO */}
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

                        {/* ŞARTLAR VE NOTLAR */}
                        <div className="mb-12">
                            <h4 className="font-bold text-sm border-b border-slate-200 mb-2 pb-1">Notlar ve Şartlar:</h4>
                            <div className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                                {seciliTeklif.description || 'Bu teklif 15 gün süreyle geçerlidir. Fiyatlara KDV dahil değildir.'}
                                {seciliTeklif.template_type === 'bakim' && `
                                \n\n* Bakım periyotları üretici standartlarına uygundur.
                                * Değişen parçalar ayrıca faturalandırılacaktır.
                                * İş güvenliği kurallarına tam riayet edilecektir.`}
                            </div>
                        </div>

                        {/* İMZA ALANI */}
                        <div className="flex justify-between mt-auto pt-12">
                            <div className="text-center">
                                <p className="font-bold text-sm mb-8">Müşteri Onayı</p>
                                <div className="border-t border-slate-400 w-32 mx-auto"></div>
                                <p className="text-xs text-slate-400 mt-1">İmza / Kaşe</p>
                            </div>
                            <div className="text-center">
                                <p className="font-bold text-sm mb-8">BUVİSAN Onayı</p>
                                <div className="border-t border-slate-400 w-32 mx-auto"></div>
                                <p className="text-xs text-slate-400 mt-1">İmza / Kaşe</p>
                            </div>
                        </div>

                    </div>

                    {/* AKSİYON BUTONLARI (KAĞIDIN ALTINDA) */}
                    <div className="flex gap-4 mt-6 pb-10">
                        <button onClick={yazdir} className="bg-blue-600 text-white px-8 py-3 rounded-full font-bold shadow-xl hover:bg-blue-700 flex items-center gap-2 transform hover:scale-105 transition"><Printer/> Yazdır / PDF Kaydet</button>
                        {/* 🔥 WHATSAPP BUTONU EKLENDİ 🔥 */}
                        <button onClick={whatsappPaylas} className="bg-green-500 text-white px-8 py-3 rounded-full font-bold shadow-xl hover:bg-green-600 flex items-center gap-2 transform hover:scale-105 transition"><MessageCircle/> WhatsApp'tan At</button>
                        <button onClick={() => setOnizlemeAcik(false)} className="bg-white text-slate-800 px-8 py-3 rounded-full font-bold shadow-xl hover:bg-slate-100 flex items-center gap-2"><XCircle/> Kapat</button>
                    </div>

                </div>
            </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}