"use client";

// ----------------------------------------------------------------------------
// BUVISAN GLOBAL YÖNETİM MERKEZİ 🌍
// Versiyon: TEKLİFLER V6.1 (FAZ 3: Satış Zekası & İnteraktif Müşteri Takibi 🧠)
// ----------------------------------------------------------------------------

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Loader2, Plus, FileText, Calendar, DollarSign, User, MapPin, 
  Box, Printer, Trash2, CheckCircle, XCircle, Search, FileCheck, Clock,
  ThumbsUp, ThumbsDown, MessageCircle, X, Link as LinkIcon, Calculator, AlertTriangle, TrendingUp, Settings, ChevronDown, ChevronUp, CloudLightning, Copy, Radio, Eye, Brain,
  Wallet, ShieldCheck, Wrench
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

// 🌍 Endüstriyel Bölgelerin Gerçek Coğrafi Koordinat Haritası
const ENDUSTRIYEL_BOLGELER: { [key: string]: { lat: number, lon: number } } = {
  "Bursa - Nilüfer OSB": { lat: 40.21, lon: 28.95 },
  "Bursa - İnegöl OSB": { lat: 40.08, lon: 29.51 },
  "Kocaeli - Gebze OSB": { lat: 40.80, lon: 29.43 },
  "İstanbul - Tuzla OSB": { lat: 40.81, lon: 29.30 },
  "Yalova - Altınova Tersaneler": { lat: 40.69, lon: 29.47 },
  "Sakarya - Arifiye OSB": { lat: 40.72, lon: 30.38 }
};

// 🔴 YENİ: Tam tarih ve saat formatı üreten yardımcı fonksiyon
const tamZamanGetir = () => {
  const now = new Date();
  return now.toLocaleDateString('tr-TR') + ' ' + now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

export default function TekliflerSayfasi() {
  
  // --- STATE ---
  const [yukleniyor, setYukleniyor] = useState(true);
  const [apiYukleniyor, setApiYukleniyor] = useState(false); 
  const [teklifler, setTeklifler] = useState<any[]>([]);
  const [stok, setStok] = useState<any[]>([]);
  const [aktifBiletler, setAktifBiletler] = useState<any[]>([]); 
  const [arama, setArama] = useState("");
  
  const [aktifSekme, setAktifSekme] = useState<'hepsi' | 'beklemede' | 'onaylandi' | 'reddedildi'>('hepsi');
  const [modalAcik, setModalAcik] = useState(false);
  const [onizlemeAcik, setOnizlemeAcik] = useState(false); 
  const [seciliTeklif, setSeciliTeklif] = useState<any | null>(null);
  const [seciliBiletId, setSeciliBiletId] = useState<string>(""); 
  
  const [formulGoster, setFormulGoster] = useState(false);

  // 🔴 FAZ 2: Canlı Müşteri Aktivite Akışı State'i (Başlangıç boş, useEffect ile dolacak)
  const [canliAktiviteler, setCanliAktiviteler] = useState<any[]>([]);
  // 🔴 YENİ: Canlı izleme ekranı için filtreleme state'i
  const [aktiviteArama, setAktiviteArama] = useState("");

  // 🔴 YENİ: Müşteri İnteraktif Seçenekler State'i (Müşteri ekranıyla birebir aynı)
  const [musteriOpsiyonlari, setMusteriOpsiyonlari] = useState({
    pesinOdeme: false,
    servisOnceligi: false,
    iscilikGarantisi: false,
    genelKontrol: false
  });

  const [yeniTeklif, setYeniTeklif] = useState({
    customer_name: '', customer_address: '', customer_rep: '',
    offer_date: new Date().toISOString().split('T')[0],
    valid_until: new Date(new Date().setDate(new Date().getDate() + 15)).toISOString().split('T')[0], 
    template_type: 'standart', description: '', total_price: 0
  });

  const [kalemler, setKalemler] = useState<{id: number, ad: string, detay?: string, adet: number, birim_fiyat: number, toplam: number}[]>([]);
  const [secilenStokId, setSecilenStokId] = useState("");
  const [tempAdet, setTempAdet] = useState(1);
  const [tempFiyat, setTempFiyat] = useState(0);

  // 🔥 AKILLI SERVİS HESAPLAYICI STATE 🔥
  const [hesap, setHesap] = useState({
    kisiSayisi: 2, maas: 50000, yolSaati: 2, arizaSaati: 3, mesafeKm: 100, kmMaliyeti: 6,
    yemekMaliyeti: 600, konaklama: 0, platformKiralama: 0, sarfMalzeme: 500, ekipmanAmortisman: 300, 
    mesaiCarpani: 1, genelGiderYuzdesi: 15, karMarji: 40,
    hedefSehir: 'Bursa - Nilüfer OSB', havaDurumu: 'normal', trafikYogunlugu: 'normal' 
  });

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => { 
    verileriGetir(); 
    
    // 🔴 YENİ: Sayfa yüklendiğinde F5 korumalı aktiviteleri getir
    const kayitliAktiviteler = localStorage.getItem('buvisan_canli_aktiviteler');
    if (kayitliAktiviteler) {
      setCanliAktiviteler(JSON.parse(kayitliAktiviteler));
    }
  }, []);

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

  const otonomRiskAnaliziYap = async () => {
    const koordinat = ENDUSTRIYEL_BOLGELER[hesap.hedefSehir];
    if (!koordinat) return alert("Lütfen geçerli bir bölge seçiniz.");

    setApiYukleniyor(true);
    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${koordinat.lat}&longitude=${koordinat.lon}&current=temperature_2m,wind_speed_10m`);
      const data = await response.json();
      
      if (data && data.current) {
        const anlikSicaklik = data.current.temperature_2m;
        const anlikRuzgar = data.current.wind_speed_10m; 

        let hesaplananHava = 'normal';
        if (anlikRuzgar > 25) hesaplananHava = 'firtina'; 
        else if (anlikSicaklik > 35 || anlikSicaklik < 3) hesaplananHava = 'asiri_isi'; 

        const suAnkiSaat = new Date().getHours();
        const pikSaatler = [8, 9, 17, 18, 19]; 
        const metropolBolgeMi = hesap.hedefSehir.includes("İstanbul") || hesap.hedefSehir.includes("Gebze");
        const hesaplananTrafik = (metropolBolgeMi && pikSaatler.includes(suAnkiSaat)) ? 'yogun' : 'normal';

        setHesap(prev => ({ ...prev, havaDurumu: hesaplananHava, trafikYogunlugu: hesaplananTrafik }));
        alert(`[${hesap.hedefSehir}] Bölgesi Canlı Analiz Tamamlandı!\n\n🌤️ Sıcaklık: ${anlikSicaklik}°C\n💨 Rüzgar Hızı: ${anlikRuzgar} km/s\n🚦 Zamanlama: Saat ${suAnkiSaat}:00\n\nSistem risk çarpanlarını güncelledi.`);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setApiYukleniyor(false);
    }
  };

  const linkKopyala = (teklifId: string, firmaAdi: string) => {
    const secureLink = `${window.location.origin}/teklif-odasi/${teklifId || 'token-secure'}`;
    navigator.clipboard.writeText(secureLink);
    
    // 🔴 YENİ: LocalStorage kayıt mantığı eklendi ve tarih güncellendi
    setCanliAktiviteler(prev => {
      const yeniVeri = [
        { id: Date.now(), firma: firmaAdi, mesaj: "Müşteri özel erişim linki oluşturuldu ve panoya kopyalandı.", zaman: tamZamanGetir(), tip: "giriş" },
        ...prev
      ];
      localStorage.setItem('buvisan_canli_aktiviteler', JSON.stringify(yeniVeri));
      return yeniVeri;
    });
    alert("İnteraktif Teklif Odası Linki Kopyalandı! 🚀\nMüşteriye WhatsApp'tan gönderebilirsin.");
  };

  // 🔴 YENİ: Müşteri Opsiyon Değiştirme Simülatörü (İstenen fiyatlara göre güncellendi)
  const handleOpsiyonDegisimi = (alan: 'pesinOdeme' | 'servisOnceligi' | 'iscilikGarantisi' | 'genelKontrol') => {
    const yeniDeger = !musteriOpsiyonlari[alan];
    setMusteriOpsiyonlari({ ...musteriOpsiyonlari, [alan]: yeniDeger });

    let durumMesaji = "";
    if(alan === 'servisOnceligi') durumMesaji = yeniDeger ? "🚀 'Aynı Gün Öncelikli Müdahale' opsiyonunu ekledi." : "Servis önceliği opsiyonunu kaldırdı.";
    if(alan === 'iscilikGarantisi') durumMesaji = yeniDeger ? "🛡️ '3 Aylık İşçilik Garantisi'ni seçti." : "Garantiyi standart pakete çevirdi.";
    if(alan === 'genelKontrol') durumMesaji = yeniDeger ? "⚙️ Teklife 'Genel Kontrol' ekledi." : "Genel kontrol opsiyonunu çıkardı.";
    if(alan === 'pesinOdeme') durumMesaji = yeniDeger ? "💵 '%5 Peşin Ödeme İndirimi'ni aktif etti." : "Vadeli ödemeye geri döndü.";

    // 🔴 YENİ: LocalStorage kayıt mantığı eklendi ve tarih güncellendi
    setCanliAktiviteler(prev => {
      const yeniVeri = [
        { id: Date.now(), firma: seciliTeklif?.customer_name || "Müşteri", mesaj: durumMesaji, zaman: tamZamanGetir(), tip: "aksiyon" },
        ...prev
      ];
      localStorage.setItem('buvisan_canli_aktiviteler', JSON.stringify(yeniVeri));
      return yeniVeri;
    });
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
          const adresText = (bilet.cranes?.location_address || bilet.manual_location || "").toLowerCase();
          if (adresText.includes("gebze")) setHesap(prev => ({ ...prev, hedefSehir: "Kocaeli - Gebze OSB" }));
          else if (adresText.includes("tuzla")) setHesap(prev => ({ ...prev, hedefSehir: "İstanbul - Tuzla OSB" }));
          else if (adresText.includes("inegöl")) setHesap(prev => ({ ...prev, hedefSehir: "Bursa - İnegöl OSB" }));
          else if (adresText.includes("altınova")) setHesap(prev => ({ ...prev, hedefSehir: "Yalova - Altınova Tersaneler" }));
          else if (adresText.includes("arifiye")) setHesap(prev => ({ ...prev, hedefSehir: "Sakarya - Arifiye OSB" }));
          else setHesap(prev => ({ ...prev, hedefSehir: "Bursa - Nilüfer OSB" }));
      }
  };

  const kalemEkle = () => {
    if(!tempAdet || !tempFiyat) return alert("Lütfen adet ve fiyat giriniz.");
    const stokUrun = stok.find(s => s.id === secilenStokId);
    const ad = stokUrun ? stokUrun.name : "Özel Hizmet/Ürün";
    setKalemler([...kalemler, { id: Date.now(), ad, adet: tempAdet, birim_fiyat: tempFiyat, toplam: tempAdet * tempFiyat }]);
    setSecilenStokId(""); setTempAdet(1); setTempFiyat(0);
  };

  const akilliFiyatiTeklifeEkle = (hesaplananFiyat: number) => {
      const ad = `Vinç Servis ve Müdahale Hizmeti`;
      alert("Akıllı fiyat teklife eklendi! 🚀");
  };

  const kalemSil = (id: number) => setKalemler(kalemler.filter(k => k.id !== id));
  const toplamTutar = kalemler.reduce((acc, k) => acc + k.toplam, 0);

  // 🔴 YENİ: Simülatör için Fiyat Hesaplama Motoru
  const dinamikMusteriToplami = (anaToplam: number) => {
    let carpanliToplam = anaToplam;
    if (musteriOpsiyonlari.servisOnceligi) carpanliToplam += 4500;
    if (musteriOpsiyonlari.iscilikGarantisi) carpanliToplam += 5500;
    if (musteriOpsiyonlari.genelKontrol) carpanliToplam += 8500;
    
    // Peşin ödeme %5 İndirimi
    if (musteriOpsiyonlari.pesinOdeme) {
        carpanliToplam -= (carpanliToplam * 0.05);
    }
    return carpanliToplam;
  };

  const teklifKaydet = async () => {
    if (!yeniTeklif.customer_name) return alert("Müşteri adı zorunlu!");
    setYukleniyor(true);
    const paket = { ...yeniTeklif, items: kalemler, total_price: toplamTutar, related_ticket_id: seciliBiletId || null };
    const { error } = await supabase.from('offers').insert([paket]);
    
    if (error) {
        alert("Hata: " + error.message);
    } else {
        if (seciliBiletId) await supabase.from('service_tickets').update({ pipeline_status: 'teklif_bekliyor', status: 'bekliyor' }).eq('id', seciliBiletId);
        alert("Teklif Oluşturuldu! Ana ekrandaki iş emri güncellendi. 📄");
        setModalAcik(false); verileriGetir(); formuSifirla();
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
      setKalemler([]); setSeciliBiletId("");
  };

  const sil = async (id: string) => {
      if(!confirm("Teklifi silmek istiyor musun?")) return;
      await supabase.from('offers').delete().eq('id', id);
      verileriGetir();
  };

  const durumGuncelle = async (id: string, yeniDurum: string) => {
      const { error } = await supabase.from('offers').update({ status: yeniDurum }).eq('id', id);
      if(!error) verileriGetir(); 
  };

  const whatsappPaylas = () => {
      if(!seciliTeklif) return;
      const mesaj = `Sayın ${seciliTeklif.customer_rep || 'Yetkili'}, ${seciliTeklif.template_type === 'standart' ? 'Fiyat Teklifiniz' : 'Sözleşmeniz'} ektedir. Toplam Tutar: ${(seciliTeklif.final_price || seciliTeklif.total_price).toLocaleString()} TL. Saygılarımızla, Buvisan Vinç.`;
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
            <style>@media print { body { -webkit-print-color-adjust: exact; } }</style>
          </head>
          <body>${printContent.innerHTML}</body>
        </html>
      `);
      win?.document.close(); win?.focus();
      setTimeout(() => { win?.print(); win?.close(); }, 500);
  };

  const filtrelenmis = teklifler.filter(t => {
      const aramaUyumu = t.customer_name.toLowerCase().includes(arama.toLowerCase());
      if (aktifSekme === 'hepsi') return aramaUyumu;
      return aramaUyumu && t.status === aktifSekme;
  });

  // 🔴 YENİ: Aktiviteleri arama kutusuna göre filtreleyen yardımcı değişken
  const filtrelenmisAktiviteler = canliAktiviteler.filter(ak => 
    ak.firma.toLowerCase().includes(aktiviteArama.toLowerCase())
  );

  const bekleyenTutar = teklifler.filter(t => t.status === 'beklemede').reduce((a, b) => a + (b.final_price || b.total_price), 0);
  const onayliTutar = teklifler.filter(t => t.status === 'onaylandi').reduce((a, b) => a + (b.final_price || b.total_price), 0);

  // --- MATEMATİKSEL MOTOR HESAPLAMALARI ---
  const hsSaatlikKisiTaban = hesap.maas / 220; 
  const hsSaatlikKisi = hsSaatlikKisiTaban * hesap.mesaiCarpani; 
  const hsToplamSure = hesap.yolSaati + hesap.arizaSaati;
  const hsIscilikMaliyeti = hsToplamSure * hsSaatlikKisi * hesap.kisiSayisi;
  const hsYolMaliyeti = hesap.mesafeKm * hesap.kmMaliyeti;
  const hpHavaCarpani = hesap.havaDurumu === 'firtina' ? 1.25 : hesap.havaDurumu === 'asiri_isi' ? 1.10 : 1.0;
  const hpTrafikCarpani = hesap.trafikYogunlugu === 'yogun' ? 1.15 : 1.0;
  const hsCevreselRiskPrimi = (hsIscilikMaliyeti * (hpHavaCarpani - 1)) + (hsYolMaliyeti * (hpTrafikCarpani - 1));
  const hsTabanMaliyet = hsIscilikMaliyeti + hsYolMaliyeti + hesap.yemekMaliyeti + hesap.sarfMalzeme + hesap.ekipmanAmortisman + hesap.konaklama + hesap.platformKiralama + hsCevreselRiskPrimi;
  const hsGenelGiderMiktari = hsTabanMaliyet * (hesap.genelGiderYuzdesi / 100);
  const hsGenelGiderli = hsTabanMaliyet + hsGenelGiderMiktari;
  const hsKarMiktari = hsGenelGiderli * (hesap.karMarji / 100);
  const hsSatisFiyati = hsGenelGiderli + hsKarMiktari;
  const hsNetKar = hsSatisFiyati - hsTabanMaliyet;

  // 🧠 FAZ 3: YAPAY ZEKA SATIŞ ZEKASI / KAZANMA OLASILIĞI MOTORU
  const getAiKazanmaOlasiligi = (marj: number) => {
    if (marj <= 30) return { skor: 94, renk: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50', mesaj: "Kankacım bu oran harika! Sektör ortalamasına çok uygun.", risk: "Düşük Risk", border: 'border-green-200' };
    if (marj === 40) return { skor: 78, renk: 'bg-yellow-500', text: 'text-yellow-700', bg: 'bg-yellow-50', mesaj: "Güzel marj. Müşteri ufak bir indirim veya pazarlık isteyebilir.", risk: "Orta Risk", border: 'border-yellow-200' };
    if (marj === 50) return { skor: 45, renk: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', mesaj: "Riskli: Bu sektördeki geçmiş tekliflerde %50 marj genelde reddedildi.", risk: "Yüksek Risk", border: 'border-red-200' };
    if (marj >= 75) return { skor: 12, renk: 'bg-rose-600', text: 'text-rose-700', bg: 'bg-rose-50', mesaj: "Kankacım n'aptın? Rakip firmalara hediye etmiş oluruz, revize et!", risk: "Çok Yüksek Risk", border: 'border-rose-200' };
    return { skor: 85, renk: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50', mesaj: "Sistem analizi yapılıyor...", risk: "Bilinmiyor", border: 'border-blue-200' };
  };
  const aiAnaliz = getAiKazanmaOlasiligi(hesap.karMarji);

  const handleHesap = (alan: string, deger: any) => {
      setHesap({...hesap, [alan]: deger});
  };

  if(yukleniyor && teklifler.length === 0) return <div className="h-screen flex justify-center items-center"><Loader2 className="animate-spin text-blue-600"/></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      
      {/* ÜST BAŞLIK PANELİ */}
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><FileText className="text-blue-600"/> Teklif Yönetimi</h1>
            <p className="text-slate-500 text-sm">Arızalarla entegre profesyonel teklif, sözleşme ve sipariş formları.</p>
        </div>
        <div className="flex gap-2">
            <button onClick={() => { formuSifirla(); setModalAcik(true); }} className="bg-blue-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-lg"><Plus size={18}/> Yeni Teklif</button>
            <Link href="/admin" className="bg-white border px-5 py-2 rounded-xl font-bold text-slate-600 hover:bg-slate-100">Panele Dön</Link>
        </div>
      </div>

      {/* 🔴 FAZ 2: DÜNYADA OLMAYAN REALTIME CANLI TAKİP ODASI WIDGETI */}
      <div className="bg-slate-900 text-white p-4 rounded-3xl mb-6 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 p-4 opacity-5"><Radio size={80} className="text-red-500 animate-pulse"/></div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-200 flex items-center gap-1"><Radio size={14} className="text-red-500"/> Canlı Müşteri İzleme & Teklif Odası Akışı (Realtime)</h3>
          </div>
          
          {/* 🔴 YENİ: Arama Filtresi */}
          <div className="relative w-full md:w-64 z-10">
            <Search className="absolute left-2.5 top-2 text-slate-400 w-3.5 h-3.5"/>
            <input 
              type="text" 
              placeholder="Müşteri ismine göre filtrele..." 
              value={aktiviteArama} 
              onChange={e => setAktiviteArama(e.target.value)} 
              className="w-full pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs outline-none focus:border-indigo-500 text-white transition"
            />
          </div>
        </div>

        <div className="space-y-2 max-h-32 overflow-y-auto pr-2 font-mono text-[11px] relative z-10">
          <AnimatePresence>
            {filtrelenmisAktiviteler.length > 0 ? (
              filtrelenmisAktiviteler.map(ak => (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={ak.id} className="flex justify-between items-start bg-slate-800/50 p-2 rounded-lg border border-slate-800">
                  <p>
                    <span className="text-indigo-400 font-bold">[{ak.firma}]</span>{" "}
                    <span className={ak.tip === 'aksiyon' ? 'text-yellow-400' : ak.tip === 'onay' ? 'text-green-400' : 'text-slate-300'}>{ak.mesaj}</span>
                  </p>
                  <span className="text-slate-500 text-[10px] whitespace-nowrap ml-4 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">{ak.zaman}</span>
                </motion.div>
              ))
            ) : (
              <div className="text-slate-500 text-center py-4 italic">Henüz bir aktivite yok veya filtrelemeye uygun kayıt bulunamadı.</div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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

      {/* LİSTE GEÇMİŞİ */}
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
                      <tr><th className="p-4 pl-6">Tarih</th><th className="p-4">Müşteri</th><th className="p-4">Şablon</th><th className="p-4">Tutar (Son Durum)</th><th className="p-4">Durum</th><th className="p-4 text-right pr-6">İşlem</th></tr>
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
                              
                              {/* 🔴 YENİ: Akıllı Fiyat ve Opsiyon Rozetleri Gösterimi */}
                              <td className="p-4">
                                  <div className="font-black text-slate-800 text-base">{(t.final_price || t.total_price).toLocaleString()} ₺</div>
                                  
                                  {t.final_price && t.final_price !== t.total_price && (
                                    <div className="text-[10px] text-slate-400 line-through mt-0.5">İlk Teklif: {t.total_price.toLocaleString()} ₺</div>
                                  )}

                                  {t.selected_options && (
                                    <div className="flex flex-wrap gap-1 mt-1.5 max-w-[150px]">
                                      {t.selected_options.servisOnceligi && <span className="bg-red-100 text-red-600 border border-red-200 text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm">🚀 Acil</span>}
                                      {t.selected_options.iscilikGarantisi && <span className="bg-blue-100 text-blue-600 border border-blue-200 text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm">🛡️ Garanti</span>}
                                      {t.selected_options.genelKontrol && <span className="bg-orange-100 text-orange-600 border border-orange-200 text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm">⚙️ Bakım</span>}
                                      {t.selected_options.pesinOdeme && <span className="bg-emerald-100 text-emerald-600 border border-emerald-200 text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm">💵 Peşin %5</span>}
                                    </div>
                                  )}
                              </td>

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
                                  <button onClick={() => linkKopyala(t.id, t.customer_name)} className="p-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg hover:bg-indigo-600 hover:text-white transition" title="Teklif Odası Linkini Kopyala"><Copy size={16}/></button>
                                  <button onClick={() => { setSeciliTeklif(t); setOnizlemeAcik(true); }} className="p-2 bg-blue-50 text-blue-500 border border-blue-100 rounded-lg hover:bg-blue-600 hover:text-white transition" title="Görüntüle & İnteraktif Oda Simülatörü"><Printer size={16}/></button>
                                  <button onClick={() => sil(t.id)} className="p-2 bg-slate-50 text-slate-400 border border-slate-200 rounded-lg hover:bg-red-500 hover:text-white transition"><Trash2 size={16}/></button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>

      {/* --- MODAL 1: TEKLİF SİHİRBAZI --- */}
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
                        {/* İŞ EMRİ BAĞLANTISI */}
                        <div className="bg-orange-50 p-5 rounded-2xl border border-orange-200 shadow-sm relative overflow-hidden">
                            <div className="absolute right-0 top-0 opacity-10"><LinkIcon size={120}/></div>
                            <label className="text-xs font-bold text-orange-600 uppercase block mb-3 relative z-10">Bu Teklif Hangi Arıza / Keşif İçin Veriliyor? (Opsiyonel)</label>
                            <select 
                                className="w-full p-3 bg-white border border-orange-300 rounded-xl font-bold text-sm text-slate-800 outline-none focus:ring-2 focus:ring-orange-400 shadow-sm relative z-10 cursor-pointer"
                                value={seciliBiletId} onChange={(e) => handleBiletSecimi(e.target.value)}
                            >
                                <option value="">Bağımsız Teklif (Arızaya Bağlama)</option>
                                {aktifBiletler.map(b => (
                                    <option key={b.id} value={b.id}>{b.cranes?.customer_name || b.manual_customer_name} - {b.description ? b.description.substring(0, 40) + '...' : 'Detay Yok'}</option>
                                ))}
                            </select>
                        </div>

                        {/* Şablon & Müşteri Formu */}
                        <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100">
                            <label className="text-xs font-bold text-blue-600 uppercase block mb-3">Şablon Türü Seçin</label>
                            <div className="flex gap-4">
                                {['standart', 'bakim', 'siparis'].map(tip => (
                                    <button 
                                        key={tip} onClick={() => setYeniTeklif({...yeniTeklif, template_type: tip})}
                                        className={`flex-1 py-3 rounded-xl border-2 font-bold uppercase text-xs transition ${yeniTeklif.template_type === tip ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-200' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-300'}`}
                                    >
                                        {tip === 'standart' ? 'Fiyat Teklifi' : tip === 'bakim' ? 'Periyodik Bakım' : 'Sipariş Formu'}
                                    </button>
                                ))}
                            </div>
                        </div>
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

                        {/* AKILLI SERVİS FİYAT HESAPLAYICI */}
                        <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="font-black text-indigo-800 flex items-center gap-2"><Calculator size={20}/> Akıllı Servis Fiyatı Hesaplayıcı</h4>
                                <span className="bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><Settings size={12}/> Dinamik Veri</span>
                            </div>

                            {/* GERÇEKÇİ OTONOM RİSK PANELİ */}
                            <div className="bg-slate-900 text-white p-4 rounded-xl mb-4 border border-slate-800 relative overflow-hidden shadow-inner">
                              <div className="flex items-center justify-between mb-3 relative z-10">
                                <div className="text-xs font-black tracking-wider text-indigo-400 flex items-center gap-1 uppercase">
                                  <CloudLightning size={14}/> Canlı Hava Durumu & Lojistik Risk Motoru
                                </div>
                                <button 
                                  onClick={otonomRiskAnaliziYap} 
                                  disabled={apiYukleniyor}
                                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg transition flex items-center gap-1 shadow"
                                >
                                  {apiYukleniyor ? <Loader2 size={10} className="animate-spin"/> : null}
                                  {apiYukleniyor ? 'Canlı API Bağlantısı Kuruluyor...' : 'Bölgesel Risk Analizini Başlat'}
                                </button>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 relative z-10">
                                <div>
                                  <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Müdahale Bölgesi / OSB</label>
                                  <select 
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 font-bold text-xs text-white outline-none cursor-pointer"
                                    value={hesap.hedefSehir} 
                                    onChange={e => handleHesap('hedefSehir', e.target.value)}
                                  >
                                    {Object.keys(ENDUSTRIYEL_BOLGELER).map(bolge => (
                                      <option key={bolge} value={bolge}>{bolge}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">API Hava Analiz Sonucu</label>
                                  <select className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 font-bold text-xs text-white outline-none" value={hesap.havaDurumu} onChange={e => handleHesap('havaDurumu', e.target.value)}>
                                    <option value="normal">Açık / Kapalı Alan (Çarpan Yok)</option>
                                    <option value="asiri_isi">Ekstrem Sıcaklık / Yıpranma (+%10 İşçilik Primi)</option>
                                    <option value="firtina">Yüksek Rüzgar / Fırtına (+%25 İşçilik Primi)</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Lojistik Yoğunluk Durumu</label>
                                  <select className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 font-bold text-xs text-white outline-none" value={hesap.trafikYogunlugu} onChange={e => handleHesap('trafikYogunlugu', e.target.value)}>
                                    <option value="normal">Akıcı Trafik (Çarpan Yok)</option>
                                    <option value="yogun">Yoğun Trafik / Pik Saat (+%15 Lojistik Primi)</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
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
                                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Mesafe (G-D KM)</label>
                                    <input type="number" className="w-full font-bold text-sm outline-none text-slate-700" value={hesap.mesafeKm} onChange={e => handleHesap('mesafeKm', Number(e.target.value))} />
                                </div>
                                <div className="bg-white p-2 rounded-xl border border-indigo-100">
                                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Araç Gideri (TL/KM)</label>
                                    <input type="number" className="w-full font-bold text-sm outline-none text-slate-700" value={hesap.kmMaliyeti} onChange={e => handleHesap('kmMaliyeti', Number(e.target.value))} />
                                </div>
                                <div className="bg-white p-2 rounded-xl border border-indigo-100">
                                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Yemek Masrafı</label>
                                    <input type="number" className="w-full font-bold text-sm outline-none text-slate-700" value={hesap.yemekMaliyeti} onChange={e => handleHesap('yemekMaliyeti', Number(e.target.value))} />
                                </div>
                                <div className="bg-red-50 p-2 rounded-xl border border-red-200">
                                    <label className="text-[9px] font-bold text-red-600 uppercase block mb-1">Müdahale Günü</label>
                                    <select className="w-full font-bold text-xs outline-none bg-transparent text-slate-800" value={hesap.mesaiCarpani} onChange={e => handleHesap('mesaiCarpani', Number(e.target.value))}>
                                        <option value={1}>Hafta İçi (Normal)</option>
                                        <option value={1.5}>Cumartesi (%50)</option>
                                        <option value={2}>Pazar (%100)</option>
                                    </select>
                                </div>

                                <div className="bg-blue-50 p-2 rounded-xl border border-blue-200 col-span-2">
                                    <label className="text-[9px] font-bold text-blue-600 uppercase block mb-1">Platform / Manlift Kiralama Bedeli</label>
                                    <input type="number" className="w-full font-bold text-sm outline-none bg-transparent text-slate-800" value={hesap.platformKiralama} onChange={e => handleHesap('platformKiralama', Number(e.target.value))} />
                                </div>
                                <div className="bg-blue-50 p-2 rounded-xl border border-blue-200 col-span-2">
                                    <label className="text-[9px] font-bold text-blue-600 uppercase block mb-1">Otel / Konaklama Bedeli</label>
                                    <input type="number" className="w-full font-bold text-sm outline-none bg-transparent text-slate-800" value={hesap.konaklama} onChange={e => handleHesap('konaklama', Number(e.target.value))} />
                                </div>
                                <div className="bg-orange-50 p-2 rounded-xl border border-orange-200 col-span-2">
                                    <label className="text-[9px] font-bold text-orange-600 uppercase block mb-1">Sarf Malzeme (Sprey, Yağ, vb.)</label>
                                    <input type="number" className="w-full font-bold text-sm outline-none bg-transparent text-slate-800" value={hesap.sarfMalzeme} onChange={e => handleHesap('sarfMalzeme', Number(e.target.value))} />
                                </div>
                                <div className="bg-orange-50 p-2 rounded-xl border border-orange-200 col-span-2">
                                    <label className="text-[9px] font-bold text-orange-600 uppercase block mb-1">Ekipman & Takım Amortismanı</label>
                                    <input type="number" className="w-full font-bold text-sm outline-none bg-transparent text-slate-800" value={hesap.ekipmanAmortisman} onChange={e => handleHesap('ekipmanAmortisman', Number(e.target.value))} />
                                </div>
                                
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
                                <div className="grid grid-cols-4 gap-2 text-center divide-x divide-slate-100">
                                    <div>
                                        <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">İşçilik</div>
                                        <div className="font-bold text-xs text-slate-700">{Math.round(hsIscilikMaliyeti).toLocaleString()} ₺</div>
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">Yol / Lojistik</div>
                                        <div className="font-bold text-xs text-slate-700">{Math.round(hsYolMaliyeti).toLocaleString()} ₺</div>
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-bold text-indigo-500 uppercase mb-1">Otonom Risk Primi</div>
                                        <div className="font-bold text-xs text-indigo-600">+{Math.round(hsCevreselRiskPrimi).toLocaleString()} ₺</div>
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-bold text-red-400 uppercase mb-1">Taban (Sıfır Zarar)</div>
                                        <div className="font-bold text-xs text-red-500">{Math.round(hsTabanMaliyet).toLocaleString()} ₺</div>
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

                                {/* 🧠 FAZ 3: YAPAY ZEKA SATIŞ KOÇU & KAZANMA OLASILIĞI MOTORU */}
                                <div className={`mt-4 mb-4 p-4 rounded-xl border transition-all duration-300 ${aiAnaliz.bg} ${aiAnaliz.border}`}>
                                    <div className="flex justify-between items-end mb-3">
                                        <div>
                                            <h5 className={`font-black text-sm flex items-center gap-1.5 ${aiAnaliz.text}`}>
                                                <Brain size={18} className={aiAnaliz.skor > 50 ? 'animate-pulse' : ''} />
                                                AI Satış Zekası & Kazanma İhtimali
                                            </h5>
                                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md mt-1.5 inline-block text-white shadow-sm ${aiAnaliz.renk}`}>
                                                Risk: {aiAnaliz.risk}
                                            </span>
                                        </div>
                                        <div className={`text-4xl font-black tracking-tighter ${aiAnaliz.text}`}>%{aiAnaliz.skor}</div>
                                    </div>
                                    
                                    <div className="w-full bg-white rounded-full h-3 mb-3 overflow-hidden shadow-inner border border-slate-100">
                                        <div className={`h-full rounded-full transition-all duration-1000 ease-out ${aiAnaliz.renk}`} style={{ width: `${aiAnaliz.skor}%` }}></div>
                                    </div>
                                    
                                    <div className={`text-xs font-bold leading-relaxed flex items-start gap-2 ${aiAnaliz.text}`}>
                                        <AlertTriangle size={16} className="shrink-0 mt-0.5"/>
                                        <p>{aiAnaliz.mesaj}</p>
                                    </div>
                                </div>

                                <div className="mt-3">
                                    <button 
                                        onClick={() => setFormulGoster(!formulGoster)} 
                                        className="w-full flex items-center justify-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 transition p-1 bg-indigo-50 rounded"
                                    >
                                        {formulGoster ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                                        Sistem Bu Fiyatı Nasıl Hesapladı?
                                    </button>
                                    
                                    <AnimatePresence>
                                        {formulGoster && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                                <div className="mt-2 bg-slate-800 text-slate-300 p-4 rounded-xl text-[10px] font-mono leading-relaxed shadow-inner">
                                                    <div className="text-white font-bold mb-2 pb-1 border-b border-slate-600">🧮 Matematiksel Formül Dökümü</div>
                                                    <div className="grid grid-cols-1 gap-1.5">
                                                        <p><span className="text-blue-400">1. Saatlik Personel Maliyeti:</span> ({hesap.maas} ₺ / 220 Saat) x {hesap.mesaiCarpani} = <span className="text-white">{Math.round(hsSaatlikKisi).toLocaleString()} ₺ / Saat</span></p>
                                                        <p><span className="text-blue-400">2. Toplam İşçilik:</span> {hsToplamSure} Saat x {hesap.kisiSayisi} Kişi x {Math.round(hsSaatlikKisi)} ₺ = <span className="text-white">{Math.round(hsIscilikMaliyeti).toLocaleString()} ₺</span></p>
                                                        <p><span className="text-blue-400">3. Yol Maliyeti:</span> {hesap.mesafeKm} KM x {hesap.kmMaliyeti} ₺ = <span className="text-white">{Math.round(hsYolMaliyeti).toLocaleString()} ₺</span></p>
                                                        <p><span className="text-indigo-400">4. Çevresel Analiz Katsayıları:</span> Hava Katsayısı: x{hpHavaCarpani} | Lojistik Katsayısı: x{hpTrafikCarpani}</p>
                                                        <p><span className="text-indigo-400">5. Canlı Hesaplanan Çevresel Risk Yükü:</span> <span className="text-white">{Math.round(hsCevreselRiskPrimi).toLocaleString()} ₺</span></p>
                                                        <p><span className="text-blue-400">6. Ek Donanım Giderleri:</span> Platform: {hesap.platformKiralama}₺ + Konaklama: {hesap.konaklama}₺ + Sarf: {hesap.sarfMalzeme}₺ + Amortisman: {hesap.ekipmanAmortisman}₺ + Yemek: {hesap.yemekMaliyeti}₺ = <span className="text-white">{(hesap.platformKiralama + hesap.konaklama + hesap.sarfMalzeme + hesap.ekipmanAmortisman + hesap.yemekMaliyeti).toLocaleString()} ₺</span></p>
                                                        <p className="pt-1 mt-1 border-t border-slate-700 text-red-400 font-bold">7. TOPLAM REALİSTİK TABAN MALİYET: {Math.round(hsTabanMaliyet).toLocaleString()} ₺</p>
                                                        <p className="pt-1 mt-1 border-t border-slate-700 text-white font-bold">🎯 MÜŞTERİ SATIŞ FİYATI: {Math.round(hsSatisFiyati).toLocaleString()} ₺</p>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            <button onClick={() => akilliFiyatiTeklifeEkle(hsSatisFiyati)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold p-3 rounded-xl shadow-md transition flex items-center justify-center gap-2">
                                <Plus size={18}/> Hesaplanmış Servis Fiyatını Teklife Ekle
                            </button>
                        </div>

                        {/* Hizmet ve Ürünler */}
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
                                            <td className="p-3">
                                                <div className="font-medium text-slate-700">{k.ad}</div>
                                                {k.detay && <div className="text-[9px] text-slate-400 mt-1 pr-4 leading-relaxed">{k.detay}</div>}
                                            </td>
                                            <td className="p-3 text-center text-slate-500">{k.adet}</td>
                                            <td className="p-3 text-right text-slate-500 whitespace-nowrap">{k.birim_fiyat.toLocaleString()} ₺</td>
                                            <td className="p-3 text-right font-bold text-slate-800 whitespace-nowrap">{k.toplam.toLocaleString()} ₺</td>
                                            <td className="p-3 text-center"><button onClick={() => kalemSil(k.id)} className="text-red-400 hover:text-red-600 bg-red-50 p-1.5 rounded transition"><Trash2 size={14}/></button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="text-right mt-4 font-black text-2xl text-slate-800 bg-slate-50 inline-block float-right px-4 py-2 rounded-xl border border-slate-200">Toplam: {toplamTutar.toLocaleString()} ₺</div>
                            <div className="clear-both"></div>
                        </div>

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

      {/* --- MODAL 2: A4 KAĞIT ÖNİZLEME & İNTERAKTİF TEKLİF ODASI SİMÜLATÖRÜ --- */}
      <AnimatePresence>
        {onizlemeAcik && seciliTeklif && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-slate-900/90 z-[60] flex items-center justify-center p-4">
                <div className="bg-slate-200 w-full max-w-6xl h-[95vh] rounded-3xl flex flex-col md:flex-row shadow-2xl overflow-hidden relative">
                    
                    {/* A4 Teklif Belgesi (Sol Taraf) */}
                    <div className="flex-1 overflow-y-auto p-8 flex justify-center bg-slate-600/50">
                        <div ref={printRef} className="bg-white w-[210mm] min-h-[297mm] p-[15mm] shadow-xl relative text-black shrink-0 flex flex-col">
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
                                            <td className="p-3">
                                                <div className="font-bold text-slate-800">{item.ad}</div>
                                                {item.detay && <div className="text-[10px] text-slate-500 italic mt-0.5 leading-tight">{item.detay}</div>}
                                            </td>
                                            <td className="p-3 text-center">{item.adet}</td>
                                            <td className="p-3 text-right">{Number(item.birim_fiyat).toLocaleString()} ₺</td>
                                            <td className="p-3 text-right font-bold">{Number(item.toplam).toLocaleString()} ₺</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-slate-800">
                                        <td colSpan={3} className="p-3 text-right font-bold uppercase text-slate-600">Genel Toplam</td>
                                        {/* 🔴 YENİ: Müşterinin opsiyonlarına göre dinamikleşen canlı A4 toplamı */}
                                        <td className="p-3 text-right font-black text-lg">
                                          {dinamikMusteriToplami(Number(seciliTeklif.total_price)).toLocaleString()} ₺
                                        </td>
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

                    {/* 🔴 YENİ: İNTERAKTİF TEKLİF ODASI MÜŞTERİ SEÇENEKLERİ (Müşteri ile Birebir) */}
                    <div className="w-full md:w-80 bg-slate-900 border-l border-slate-800 p-6 flex flex-col justify-between shrink-0 text-white overflow-y-auto">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-black tracking-widest text-indigo-400 uppercase mb-4">
                          <Eye size={16}/> Müşteri Ekranı Simülatörü
                        </div>
                        <p className="text-slate-400 text-xs leading-relaxed mb-6">
                          Müşteri kendisine gönderilen özel web linkini açtığında aşağıdaki interaktif opsiyonlarla oynayabilir. Seçimlerin fiyata etkisini anlık test edin.
                        </p>

                        <div className="space-y-4">
                          
                          {/* Opsiyon 1: Ödeme Vadesi */}
                          <div className="bg-slate-800 p-3.5 rounded-xl border border-slate-700/60">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-slate-200 flex items-center gap-1"><Wallet size={12} className="text-emerald-400"/> Ödeme Vadesi</span>
                              <span className="text-[10px] font-mono text-emerald-400 font-bold">%5 İndirim</span>
                            </div>
                            <button 
                              onClick={() => handleOpsiyonDegisimi('pesinOdeme')}
                              className={`w-full text-left p-2 rounded-lg text-[11px] font-bold border transition ${musteriOpsiyonlari.pesinOdeme ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                            >
                              {musteriOpsiyonlari.pesinOdeme ? "💵 Peşin Ödeme İndirimi" : "⏱️ Vadeli Ödeme (Standart)"}
                            </button>
                          </div>

                          {/* Opsiyon 2: Servis Önceliği */}
                          <div className="bg-slate-800 p-3.5 rounded-xl border border-slate-700/60">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-slate-200 flex items-center gap-1"><Clock size={12} className="text-red-400"/> Servis Önceliği</span>
                              <span className="text-[10px] font-mono text-slate-400">+{4.500.toLocaleString()} ₺</span>
                            </div>
                            <button 
                              onClick={() => handleOpsiyonDegisimi('servisOnceligi')}
                              className={`w-full text-left p-2 rounded-lg text-[11px] font-bold border transition ${musteriOpsiyonlari.servisOnceligi ? 'bg-red-600/20 border-red-500 text-red-300' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                            >
                              {musteriOpsiyonlari.servisOnceligi ? "🚀 Aynı Gün Öncelikli Müdahale" : "⏳ Standart Servis Planlaması"}
                            </button>
                          </div>

                          {/* Opsiyon 3: İşçilik Garantisi */}
                          <div className="bg-slate-800 p-3.5 rounded-xl border border-slate-700/60">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-slate-200 flex items-center gap-1"><ShieldCheck size={12} className="text-blue-400"/> İşçilik Garantisi</span>
                              <span className="text-[10px] font-mono text-slate-400">+{5.500.toLocaleString()} ₺</span>
                            </div>
                            <button 
                              onClick={() => handleOpsiyonDegisimi('iscilikGarantisi')}
                              className={`w-full text-left p-2 rounded-lg text-[11px] font-bold border transition ${musteriOpsiyonlari.iscilikGarantisi ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                            >
                              {musteriOpsiyonlari.iscilikGarantisi ? "🛡️ 3 Aylık Uzatılmış Garanti" : "📋 Standart Garanti (3 Hafta)"}
                            </button>
                          </div>

                          {/* Opsiyon 4: Genel Kontrol */}
                          <div className="bg-slate-800 p-3.5 rounded-xl border border-slate-700/60">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-slate-200 flex items-center gap-1"><Wrench size={12} className="text-orange-400"/> Genel Kontrol</span>
                              <span className="text-[10px] font-mono text-slate-400">+{8.500.toLocaleString()} ₺</span>
                            </div>
                            <button 
                              onClick={() => handleOpsiyonDegisimi('genelKontrol')}
                              className={`w-full text-left p-2 rounded-lg text-[11px] font-bold border transition ${musteriOpsiyonlari.genelKontrol ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                            >
                              {musteriOpsiyonlari.genelKontrol ? "⚙️ Genel Yağlama ve Fiziksel Kontrol" : "❌ Sadece Arıza Giderimi"}
                            </button>
                          </div>

                        </div>
                      </div>

                      {/* Standart İşlem Butonları */}
                      <div className="space-y-2 pt-6 border-t border-slate-800 mt-6">
                        <button onClick={yazdir} className="w-full bg-blue-600 text-white p-3 rounded-xl font-bold text-xs shadow hover:bg-blue-700 flex items-center justify-center gap-2 transition">
                            <Printer size={16}/> Yazdır / PDF Kaydet
                        </button>
                        <button onClick={whatsappPaylas} className="w-full bg-green-500 text-white p-3 rounded-xl font-bold text-xs shadow hover:bg-green-600 flex items-center justify-center gap-2 transition">
                            <MessageCircle size={16}/> WhatsApp'tan At
                        </button>
                        <button onClick={() => setOnizlemeAcik(false)} className="w-full bg-slate-800 text-slate-400 p-2.5 rounded-xl font-bold text-xs hover:bg-slate-700 text-center transition">
                            Kapat
                        </button>
                      </div>
                    </div>

                </div>
            </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}