"use client";

// ----------------------------------------------------------------------------
// BUVISAN SAHA PERSONELİ UYGULAMASI 🛠️ V1.3 (EKİP SEÇİMİ EKLENDİ)
// (Dijital Servis Formu, Sesli Müşteri Kaydı ve Çoklu Personel Takibi)
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import GununPlani from '@/components/GununPlani';
import Gecmisim from '@/components/Gecmisim';
import ImzaPad from '@/components/ImzaPad';
import SesliYazi from '@/components/SesliYazi';
import KuyrukBandi from '@/components/KuyrukBandi';
import { PERSONEL_LISTESI, listedenIsimBul } from '@/lib/personel';
import { kuyrugaEkle, agHatasiMi, parcalariStoktanDus } from '@/lib/kuyruk';
import { 
  LogOut, MapPin, CheckCircle2, Clock, Truck, 
  Wrench, ChevronRight, FileSignature, ArrowLeft, Plus, Trash2, Send, Loader2, User, HardHat, FileText, CalendarClock, Mic,
  Users, CheckSquare, Square, Phone, Navigation, Search, Zap, Camera, Video, ImageIcon, X, Crosshair, WifiOff
} from 'lucide-react';

// ----------------------------------------------------------------------------
// ZAMAN YARDIMCILARI (varış/ayrılış damgası + otomatik iş süresi)
// ----------------------------------------------------------------------------
const simdiDamga = () => {
  const s = new Date();
  const saat = `${s.getHours().toString().padStart(2, '0')}:${s.getMinutes().toString().padStart(2, '0')}`;
  return `${s.toLocaleDateString('tr-TR')} ${saat}`;
};

const zamanCoz = (t: string): Date | null => {
  if (!t) return null;
  const m = String(t).match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})[\s,]+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const yil = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(yil, Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
  return isNaN(d.getTime()) ? null : d;
};

const sureYazi = (bas: string, bit: string) => {
  const a = zamanCoz(bas); const b = zamanCoz(bit);
  if (!a || !b) return '';
  const dk = Math.round((b.getTime() - a.getTime()) / 60000);
  if (dk <= 0) return '';
  const sa = Math.floor(dk / 60); const k = dk % 60;
  return sa > 0 ? `${sa} saat ${k} dk` : `${k} dakika`;
};

// Taslak koruması: sahadaki form kazara kapanırsa/yenilenirse kaybolmasın
const TASLAK_ONEK = 'buvisan_rapor_taslak_';

export default function PersonelEkrani() {
  const router = useRouter();
  const [yukleniyor, setYukleniyor] = useState(true);
  const [isler, setIsler] = useState<any[]>([]);
  const [aktifPersonel, setAktifPersonel] = useState<any>(null);

  // --- FORM STATELERİ ---
  const [seciliIs, setSeciliIs] = useState<any>(null);
  const [formAcik, setFormAcik] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [basarili, setBasarili] = useState(false);

  // Kağıt formun birebir dijital hali
  const [raporForm, setRaporForm] = useState({
      isyerine_varis: '', isyerinden_ayrilis: '', 
      vinc_modeli: '', vinc_seri_no: '', vinc_kapasite: '',
      arizanin_cinsi: '', islem_turu: 'Servis', yapilan_isler: '',
      degisen_parcalar: [{ parca_no: '', parca_adi: '', adet: '', birim_fiyat: 0 }],
      secilen_personeller: [] as string[] // <-- YENİ EKLENDİ (Çoklu Personel Seçimi)
  });

  // --- FAZ 2: MEDYA / İMZA / KONUM / DEPO ---
  const [medyaDosyalar, setMedyaDosyalar] = useState<File[]>([]);
  const [medyaOnizlemeler, setMedyaOnizlemeler] = useState<{ url: string; type: string }[]>([]);
  const dosyaInputRef = useRef<HTMLInputElement>(null);
  const [imzaBlob, setImzaBlob] = useState<Blob | null>(null);
  const [imzaAnahtar, setImzaAnahtar] = useState(0);
  const [konum, setKonum] = useState<{ lat: number; lng: number } | null>(null);
  const [konumDurumu, setKonumDurumu] = useState<'yok' | 'aliniyor' | 'alindi' | 'hata'>('yok');
  const [malzemeOnerileri, setMalzemeOnerileri] = useState<any[]>([]);
  const [aktifParcaIndex, setAktifParcaIndex] = useState<number | null>(null);
  const [yuklemeMesaji, setYuklemeMesaji] = useState('');
  const [kuyruklandi, setKuyruklandi] = useState(false);

  // --- MEDYA SEÇİMİ (en fazla 5 dosya) ---
  const medyaSecildi = (e: any) => {
      const dosyalar = Array.from(e.target.files) as File[];
      if (medyaDosyalar.length + dosyalar.length > 5) {
          alert("En fazla 5 adet fotoğraf/video yükleyebilirsiniz.");
          return;
      }
      const yeni = [...medyaDosyalar, ...dosyalar].slice(0, 5);
      setMedyaDosyalar(yeni);
      setMedyaOnizlemeler(yeni.map((d) => ({
          url: URL.createObjectURL(d),
          type: d.type.startsWith('video/') ? 'video' : 'image',
      })));
      if (dosyaInputRef.current) dosyaInputRef.current.value = '';
  };

  const medyaSil = (index: number) => {
      setMedyaDosyalar((o) => o.filter((_, i) => i !== index));
      setMedyaOnizlemeler((o) => o.filter((_, i) => i !== index));
  };

  // --- KONUM AL (canlı harita ile uyumlu) ---
  const konumAl = () => {
      if (!navigator.geolocation) { setKonumDurumu('hata'); return; }
      setKonumDurumu('aliniyor');
      navigator.geolocation.getCurrentPosition(
          (p) => {
              setKonum({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) });
              setKonumDurumu('alindi');
          },
          () => setKonumDurumu('hata'),
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
  };

  // --- DEPODAN PARÇA ARAMA (materials tablosu) ---
  const malzemeAra = async (kelime: string, index: number) => {
      setAktifParcaIndex(index);
      if (!kelime || kelime.trim().length < 2) { setMalzemeOnerileri([]); return; }
      const { data } = await supabase
          .from('materials')
          .select('id, name, sale_price, unit')
          .ilike('name', `%${kelime.trim()}%`)
          .limit(6);
      setMalzemeOnerileri(data || []);
  };

  const malzemeSec = (index: number, m: any) => {
      const yeni = [...raporForm.degisen_parcalar];
      // malzeme_id saklanıyor → rapor kaydedilince bu parça depodan otomatik düşecek
      yeni[index] = { ...yeni[index], malzeme_id: m.id, parca_adi: m.name, birim_fiyat: Number(m.sale_price) || 0 };
      setRaporForm({ ...raporForm, degisen_parcalar: yeni });
      setMalzemeOnerileri([]);
      setAktifParcaIndex(null);
  };

  // Kullanılan parçaların toplam tutarı
  const malzemeTutari = useMemo(
      () => raporForm.degisen_parcalar.reduce(
          (t: number, p: any) => t + (Number(p.adet) || 0) * (Number(p.birim_fiyat) || 0), 0),
      [raporForm.degisen_parcalar]
  );

  useEffect(() => { verileriGetir(); }, []);

  // --- ARAMA / FİLTRE (sahada 40+ iş arasında kaybolmamak için) ---
  const [arama, setArama] = useState('');
  const [filtre, setFiltre] = useState<'hepsi' | 'kritik' | 'normal'>('hepsi');

  // --- TASLAK KORUMASI ---
  const [taslakGeriYuklendi, setTaslakGeriYuklendi] = useState(false);

  const filtreliIsler = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr-TR');
    return isler.filter((is: any) => {
      const kritik = is.priority === 'Kritik (Makine Durdu)';
      if (filtre === 'kritik' && !kritik) return false;
      if (filtre === 'normal' && kritik) return false;
      if (!q) return true;
      const metin = `${is.cranes?.customer_name || ''} ${is.manual_customer_name || ''} ${is.manual_location || ''} ${is.cranes?.location_address || ''} ${is.manual_phone || ''} ${is.description || ''}`.toLocaleLowerCase('tr-TR');
      return metin.includes(q);
    });
  }, [isler, arama, filtre]);

  const kritikSayisi = useMemo(() => isler.filter((i: any) => i.priority === 'Kritik (Makine Durdu)').length, [isler]);

  async function verileriGetir() {
      try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) { router.replace('/login'); return; }

          const { data: profil } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
          if (!profil) { router.replace('/login'); return; }
          
          setAktifPersonel(profil);

          const { data: isData } = await supabase
              .from('service_tickets')
              .select('*, cranes(*)')
              .neq('pipeline_status', 'tamamlandi')
              .order('created_at', { ascending: false });

          if (isData) setIsler(isData);

      } catch (error) { console.error("Hata:", error); } 
      finally { setYukleniyor(false); }
  }

  async function cikisYap() { await supabase.auth.signOut(); router.push('/login'); }

  // --- PARÇA LİSTESİ YÖNETİMİ ---
  const parcaEkle = () => setRaporForm({...raporForm, degisen_parcalar: [...raporForm.degisen_parcalar, { parca_no: '', parca_adi: '', adet: '', birim_fiyat: 0 }]});
  const parcaSil = (index: number) => {
      const yeniListe = [...raporForm.degisen_parcalar];
      yeniListe.splice(index, 1);
      setRaporForm({...raporForm, degisen_parcalar: yeniListe});
  }
  const parcaGuncelle = (index: number, alan: string, deger: string) => {
      const yeniListe = [...raporForm.degisen_parcalar];
      // @ts-ignore
      yeniListe[index][alan] = deger;
      setRaporForm({...raporForm, degisen_parcalar: yeniListe});
  }

  // --- YENİ: PERSONEL SEÇİM FONKSİYONU ---
  const personelToggle = (isim: string) => {
      const mevcutListe = raporForm.secilen_personeller;
      if (mevcutListe.includes(isim)) {
          setRaporForm({ ...raporForm, secilen_personeller: mevcutListe.filter(p => p !== isim) });
      } else {
          setRaporForm({ ...raporForm, secilen_personeller: [...mevcutListe, isim] });
      }
  };

  const formuAc = (isKaydi: any) => {
      setSeciliIs(isKaydi);
      setBasarili(false);
      setKuyruklandi(false);
      setTaslakGeriYuklendi(false);

      // 1) ÖNCE TASLAK: sahadayken yarım kalan form varsa onu geri getir
      let taslak: any = null;
      try {
          const kayit = window.localStorage.getItem(TASLAK_ONEK + isKaydi.id);
          if (kayit) taslak = JSON.parse(kayit);
      } catch { /* yoksay */ }

      if (taslak) {
          setRaporForm(taslak);
          setTaslakGeriYuklendi(true);
          setFormAcik(true);
          return;
      }

      setRaporForm(bosForm(isKaydi));
      setFormAcik(true);
  }

  // Sıfırdan form: varış saati otomatik damgalanır, ekip önceden doldurulur
  const bosForm = (isKaydi: any) => {
      // Planlayıcıda atanmış ekip varsa onlar seçili gelsin
      const ekipten = String(isKaydi.assigned_team || '')
          .split(' - ').map((x: string) => x.trim()).filter(Boolean)
          .map((x: string) => listedenIsimBul(x))
          .filter(Boolean);

      // Ekip boşsa giriş yapan kişi otomatik seçili olsun
      const benimAdim = listedenIsimBul(aktifPersonel?.full_name || '');
      const baslangicEkip = ekipten.length > 0 ? ekipten : (benimAdim ? [benimAdim] : []);

      return {
          isyerine_varis: simdiDamga(),
          isyerinden_ayrilis: '',
          vinc_modeli: isKaydi.cranes?.model_name || isKaydi.manual_crane_info || '',
          vinc_seri_no: isKaydi.cranes?.serial_number || '',
          vinc_kapasite: isKaydi.cranes?.capacity || '',
          arizanin_cinsi: isKaydi.description || '',
          islem_turu: isKaydi.ticket_type === 'kesif' ? 'Diğer' : 'Servis',
          yapilan_isler: '',
          degisen_parcalar: [{ parca_no: '', parca_adi: '', adet: '', birim_fiyat: 0 }],
          secilen_personeller: baslangicEkip
      };
  }

  // Taslağı sil ve formu sıfırdan doldur
  const taslagiTemizle = () => {
      if (!seciliIs) return;
      try { window.localStorage.removeItem(TASLAK_ONEK + seciliIs.id); } catch { /* yoksay */ }
      setTaslakGeriYuklendi(false);
      setRaporForm(bosForm(seciliIs));
  }

  // Form her değiştiğinde taslağı cihaza kaydet (sahada form kaybı olmasın)
  useEffect(() => {
      if (!formAcik || !seciliIs || basarili) return;
      try {
          window.localStorage.setItem(TASLAK_ONEK + seciliIs.id, JSON.stringify(raporForm));
      } catch { /* yoksay */ }
  }, [raporForm, formAcik, seciliIs, basarili]);

  const raporuKaydet = async () => {
      setGonderiliyor(true);

      const firma_adi = seciliIs.cranes?.customer_name || seciliIs.manual_customer_name || 'Bilinmiyor';
      const firma_adresi = seciliIs.cranes?.location_address || seciliIs.manual_location || 'Belirtilmedi';

      // Çoklu seçilen personelleri araya tire (-) koyarak birleştir, seçilmediyse formu dolduranın adını yaz
      const kaydedilecekPersoneller = raporForm.secilen_personeller.length > 0 
          ? raporForm.secilen_personeller.join(" - ") 
          : aktifPersonel?.full_name || 'Bilinmeyen Personel';

      // Çevrimdışı kalınırsa rapor bu paketle kuyruğa alınır (hiçbir rapor kaybolmaz)
      let kuyrukPaketi: any = null;

      try {
          // --- 1) FOTOĞRAF / VİDEO YÜKLEME ---
          let yuklenenMedya: string[] = [];
          if (medyaDosyalar.length > 0) {
              setYuklemeMesaji(`Medyalar yükleniyor... (0/${medyaDosyalar.length})`);
              yuklenenMedya = await Promise.all(medyaDosyalar.map(async (dosya, i) => {
                  const uzanti = dosya.name.split('.').pop() || 'jpg';
                  const ad = `saha_${Date.now()}-${Math.random().toString(36).substring(7)}.${uzanti}`;
                  const { error: upHata } = await supabase.storage.from('saha_raporlari').upload(ad, dosya);
                  if (upHata) throw upHata;
                  const { data } = supabase.storage.from('saha_raporlari').getPublicUrl(ad);
                  setYuklemeMesaji(`Medyalar yükleniyor... (${i + 1}/${medyaDosyalar.length})`);
                  return data.publicUrl;
              }));
          }

          // --- 2) MÜŞTERİ İMZASI ---
          let imzaUrl: string | null = null;
          if (imzaBlob) {
              setYuklemeMesaji('Müşteri imzası kaydediliyor...');
              const ad = `imza_${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
              const { error: imzaHata } = await supabase.storage
                  .from('saha_raporlari')
                  .upload(ad, imzaBlob, { contentType: 'image/png' });
              if (!imzaHata) {
                  imzaUrl = supabase.storage.from('saha_raporlari').getPublicUrl(ad).data.publicUrl;
              }
          }

          setYuklemeMesaji('Rapor kaydediliyor...');

          // --- 3) SAHADA GEÇEN SÜRE ---
          const bas = zamanCoz(raporForm.isyerine_varis);
          const bit = zamanCoz(raporForm.isyerinden_ayrilis);
          let sureDk: number | null = null;
          if (bas && bit) {
              const dk = Math.round((bit.getTime() - bas.getTime()) / 60000);
              sureDk = dk > 0 ? dk : null;
          }

          const temelPaket: any = {
              ticket_id: seciliIs.id,
              personel_adi: kaydedilecekPersoneller, // <-- Çoklu seçilen personeller "A - B" olarak
              firma_adi: firma_adi,
              firma_adresi: firma_adresi,
              isyerine_varis_tarih_saat: raporForm.isyerine_varis,
              isyerinden_ayrilis_tarih_saat: raporForm.isyerinden_ayrilis,
              vinc_modeli: raporForm.vinc_modeli,
              vinc_seri_no: raporForm.vinc_seri_no,
              vinc_kapasite: raporForm.vinc_kapasite,
              arizanin_cinsi: raporForm.arizanin_cinsi,
              islem_turu: raporForm.islem_turu,
              yapilan_isler: raporForm.yapilan_isler,
              degisen_parcalar: raporForm.degisen_parcalar
          };

          const gelismisPaket = {
              ...temelPaket,
              medya_urls: yuklenenMedya,
              imza_url: imzaUrl,
              lat: konum?.lat ?? null,
              lng: konum?.lng ?? null,
              sure_dakika: sureDk,
              malzeme_tutari: malzemeTutari
          };

          kuyrukPaketi = {
              id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
              ticket_id: seciliIs.id,
              olusturma: new Date().toISOString(),
              temel: temelPaket,
              gelismis: gelismisPaket,
          };

          // Önce tam paket denenir; yeni kolonlar henüz yoksa rapor KAYBOLMASIN diye
          // temel paketle tekrar denenir.
          let kayitHatasi: any = null;
          const ilkDeneme = await supabase.from('service_reports').insert([gelismisPaket]);

          if (ilkDeneme.error) {
              const mesaj = ilkDeneme.error.message || '';
              const kolonYok = ilkDeneme.error.code === 'PGRST204'
                  || mesaj.includes('schema cache')
                  || mesaj.includes('Could not find');

              if (!kolonYok) {
                  kayitHatasi = ilkDeneme.error;
              } else {
                  console.warn('Yeni kolonlar bulunamadı, temel kayıt yapılıyor:', mesaj);
                  const ikinciDeneme = await supabase.from('service_reports').insert([temelPaket]);
                  if (ikinciDeneme.error) kayitHatasi = ikinciDeneme.error;
              }
          }

          if (kayitHatasi) throw kayitHatasi;

          await supabase.from('service_tickets').update({ pipeline_status: 'tamamlandi', status: 'tamamlandi' }).eq('id', seciliIs.id);

          // Planlayıcıdaki randevuyu da otomatik "Yapıldı" yap (hata olsa bile rapor kaydı bozulmaz)
          try {
              await supabase.rpc('randevu_tamamla', { p_ticket_id: seciliIs.id });
          } catch (senkronHata) {
              console.warn('Randevu senkronu yapılamadı:', senkronHata);
          }

          // Kayıt başarılı → taslağı ve ekleri temizle
          try { window.localStorage.removeItem(TASLAK_ONEK + seciliIs.id); } catch { /* yoksay */ }

          // 📦 Kullanılan parçaları depodan düş (hata olsa bile rapor kaydı bozulmaz)
          await parcalariStoktanDus(
              raporForm.degisen_parcalar,
              seciliIs.id,
              kaydedilecekPersoneller,
              `Servis raporu — ${firma_adi}`
          );

          setTaslakGeriYuklendi(false);
          setMedyaDosyalar([]);
          setMedyaOnizlemeler([]);
          setImzaBlob(null);
          setImzaAnahtar((o) => o + 1);
          setKonum(null);
          setKonumDurumu('yok');
          setMalzemeOnerileri([]);

          setBasarili(true);
          setTimeout(() => {
              setFormAcik(false);
              verileriGetir();
          }, 3000);

      } catch (err: any) {
          const mesaj = String(err?.message || '');
          const cevrimdisi = (typeof navigator !== 'undefined' && !navigator.onLine) || agHatasiMi(mesaj);

          if (cevrimdisi && kuyrukPaketi) {
              // Medya/imza yüklendi, sadece kayıt düşemedi → kuyruğa al, internet gelince kendi gitsin
              kuyrugaEkle(kuyrukPaketi);
              try { window.localStorage.removeItem(TASLAK_ONEK + seciliIs.id); } catch { /* yoksay */ }
              setTaslakGeriYuklendi(false);
              setKuyruklandi(true);
              setBasarili(true);
              setTimeout(() => {
                  setFormAcik(false);
                  verileriGetir();
              }, 3000);
          } else if (cevrimdisi) {
              alert('İnternet bağlantısı yok.\n\nFormun cihazında saklandı. Bağlantı gelince tekrar "Kaydet" demen yeterli — hiçbir bilgi kaybolmadı.');
          } else {
              alert("Kaydedilirken hata oluştu: " + mesaj);
          }
      } finally {
          setGonderiliyor(false);
          setYuklemeMesaji('');
      }
  }

  if (yukleniyor) return (
      <div className="min-h-[100dvh] bg-slate-900 flex flex-col items-center justify-center text-white">
         <Loader2 className="animate-spin w-12 h-12 text-blue-500 mb-4"/>
         <div className="font-bold text-lg animate-pulse tracking-widest uppercase">SAHA UYGULAMASI AÇILIYOR</div>
      </div>
  );

  return (
    <div className="min-h-[100dvh] bg-slate-100 font-sans pb-24">
      
      {/* ÜST HEADER */}
      <div className="bg-slate-900 text-white p-4 shadow-xl sticky top-0 z-40 rounded-b-3xl">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg"><HardHat className="w-6 h-6 text-white" /></div>
            <div>
                <h1 className="text-xl font-black tracking-tight leading-none">SAHA EKİBİ</h1>
                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mt-1">Buvisan Operasyon</p>
            </div>
          </div>
          <button onClick={cikisYap} className="text-slate-400 hover:text-white bg-white/10 p-2.5 rounded-full transition"><LogOut className="w-5 h-5" /></button>
        </div>
        
        <div className="bg-slate-800 rounded-2xl p-4 flex items-center gap-3 border border-slate-700">
            <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center text-slate-300"><User size={20}/></div>
            <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Hoş Geldin,</div>
                <div className="font-bold">{aktifPersonel?.full_name || 'Personel'}</div>
            </div>
        </div>
      </div>

      {/* 📴 BEKLEYEN RAPORLAR (çevrimdışı kuyruk) */}
      <KuyrukBandi />

      {/* 📅 SERVİS PLANI (BUGÜN / YARIN) - Tüm ekip + kendi işlerin vurgulu */}
      <GununPlani aktifPersonel={aktifPersonel} onRaporAc={formuAc} />

      {/* 🕘 GEÇMİŞİM - tamamladığım işler, süreler, performans */}
      <Gecmisim aktifPersonel={aktifPersonel} />

      {/* BEKLEYEN İŞLER LİSTESİ */}
      <div className="p-4 space-y-4">
          <div className="flex items-center justify-between mb-1 ml-1">
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></div> Aktif Operasyonlar ({isler.length})
              </h2>
              {kritikSayisi > 0 && (
                  <span className="bg-red-100 text-red-600 border border-red-200 text-[10px] font-black px-2.5 py-1 rounded-full animate-pulse">
                      🚨 {kritikSayisi} KRİTİK
                  </span>
              )}
          </div>

          {/* ARAMA + FİLTRE */}
          <div className="flex flex-col sm:flex-row gap-2 pb-1">
              <div className="relative flex-1">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                      value={arama}
                      onChange={(e) => setArama(e.target.value)}
                      placeholder="Firma, adres veya telefon ara..."
                      className="w-full pl-10 pr-3 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 shadow-sm"
                  />
              </div>
              <div className="flex bg-white border border-slate-200 rounded-2xl p-1 shadow-sm shrink-0">
                  {([['hepsi', 'Tümü'], ['kritik', 'Kritik'], ['normal', 'Normal']] as const).map(([k, etiket]) => (
                      <button
                          key={k}
                          onClick={() => setFiltre(k)}
                          className={`flex-1 px-3.5 py-2 rounded-xl text-[11px] font-bold transition ${filtre === k ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                          {etiket}
                      </button>
                  ))}
              </div>
          </div>

          {filtreliIsler.length === 0 ? (
              <div className="bg-white p-10 rounded-3xl text-center border border-dashed border-slate-300 shadow-sm">
                  <div className="bg-emerald-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle2 className="w-8 h-8 text-emerald-500" /></div>
                  <h3 className="text-lg font-bold text-slate-700">{isler.length === 0 ? 'Saha Temiz!' : 'Sonuç Bulunamadı'}</h3>
                  <p className="text-slate-400 text-xs mt-1">{isler.length === 0 ? 'Şu an bekleyen bir iş bulunmuyor.' : 'Arama kelimesini veya filtreyi değiştirmeyi dene.'}</p>
              </div>
          ) : (
              filtreliIsler.map((is) => {
                  const isKritik = is.priority === 'Kritik (Makine Durdu)';
                  const firma = is.cranes?.customer_name || is.manual_customer_name || "Bilinmeyen Firma";
                  const adres = is.cranes?.location_address || is.manual_location || "Adres Yok";
                  const telefon = is.manual_phone || '';

                  // Konum varsa koordinata, yoksa adrese göre navigasyon
                  const haritaLinki = (is.lat && is.lng)
                      ? `https://www.google.com/maps/dir/?api=1&destination=${is.lat},${is.lng}`
                      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adres === 'Adres Yok' ? firma : adres)}`;
                  
                  return (
                      <div key={is.id} className={`bg-white rounded-[2rem] p-5 shadow-lg border-l-[6px] relative overflow-hidden ${isKritik ? 'border-l-red-500 shadow-red-100' : 'border-l-blue-500'}`}>
                          
                          {/* Üst Bilgiler */}
                          <div className="flex justify-between items-start mb-3">
                              <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${isKritik ? 'bg-red-50 text-red-600 border-red-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                                  {isKritik ? '🚨 KRİTİK (ACİL)' : 'NORMAL İŞ EMRİ'}
                              </span>
                              <span className="text-[10px] text-slate-400 font-bold bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 flex items-center gap-1">
                                  <Clock size={10}/> {new Date(is.created_at).toLocaleDateString('tr-TR')}
                              </span>
                          </div>

                          <h3 className="text-lg font-extrabold text-slate-800 leading-tight mb-2">{firma}</h3>
                          
                          <div className="flex items-start gap-2 text-slate-500 text-xs font-medium mb-3">
                              <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                              <p className="leading-snug">{adres}</p>
                          </div>

                          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs text-slate-700 font-medium mb-3">
                              <strong className="text-slate-800 block mb-1">Sorun:</strong> {is.description}
                          </div>

                          {is.audio_url && (
                              <div className="bg-blue-50 border border-blue-100 p-3 rounded-2xl mb-4 shadow-sm">
                                  <span className="text-[10px] font-bold text-blue-700 uppercase flex items-center gap-1.5 mb-2">
                                      <Mic size={14} className="text-blue-600 animate-pulse" /> Müşterinin Ses Kaydı:
                                  </span>
                                  <audio src={is.audio_url} controls className="w-full h-9 rounded-lg" />
                              </div>
                          )}

                          {/* HIZLI AKSİYONLAR: Müşteriyi ara + Yol tarifi al */}
                          <div className="grid grid-cols-2 gap-2 mb-2">
                              {telefon ? (
                                  <a href={`tel:${telefon}`} className="bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-emerald-100 active:scale-95 transition text-[11px]">
                                      <Phone size={15}/> MÜŞTERİYİ ARA
                                  </a>
                              ) : (
                                  <div className="bg-slate-50 border border-slate-100 text-slate-300 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 text-[11px]">
                                      <Phone size={15}/> TELEFON YOK
                                  </div>
                              )}
                              <a href={haritaLinki} target="_blank" rel="noopener noreferrer" className="bg-blue-50 border border-blue-200 text-blue-700 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-100 active:scale-95 transition text-[11px]">
                                  <Navigation size={15}/> YOL TARİFİ
                              </a>
                          </div>

                          <button onClick={() => formuAc(is)} className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-2xl flex items-center justify-between px-5 hover:bg-black transition shadow-md active:scale-95">
                              <span className="flex items-center gap-2"><FileSignature size={18}/> DİJİTAL FORMU DOLDUR</span>
                              <ChevronRight size={18} className="text-slate-400"/>
                          </button>

                      </div>
                  );
              })
          )}
      </div>

      {/* ==========================================
          DİJİTAL SERVİS FORMU MODALI (AŞAĞIDAN AÇILIR)
          ========================================== */}
      <AnimatePresence>
        {formAcik && seciliIs && (
            <>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50"/>
                
                <motion.div 
                    initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="fixed inset-x-0 bottom-0 z-[60] bg-slate-50 rounded-t-[2.5rem] shadow-2xl overflow-hidden max-h-[95dvh] flex flex-col"
                >
                    {basarili ? (
                        <div className="p-10 text-center flex flex-col items-center justify-center min-h-[400px]">
                            <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-inner ${kuyruklandi ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                                {kuyruklandi
                                    ? <WifiOff size={50} className="text-amber-500" />
                                    : <CheckCircle2 size={50} className="text-emerald-500" />}
                            </div>
                            <h2 className="text-2xl font-black text-slate-800 mb-2">
                                {kuyruklandi ? 'Rapor Kuyruğa Alındı' : 'Rapor İletildi!'}
                            </h2>
                            <p className="text-slate-500 text-sm leading-relaxed mb-4">
                                {kuyruklandi
                                    ? 'İnternet bağlantısı yoktu. Rapor cihazında güvenle bekliyor ve bağlantı gelince kendiliğinden gönderilecek.'
                                    : 'Servis formu başarıyla Admin paneline aktarıldı ve iş emri kapatıldı.'}
                            </p>
                            {kuyruklandi && (
                                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-[11px] font-bold text-amber-700 leading-relaxed">
                                    🛡️ Hiçbir bilgi kaybolmadı — formu kapatabilirsin.<br />
                                    Fotoğraflar ve imza da kuyrukla birlikte gönderilecek.
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Form Header */}
                            <div className="bg-white border-b border-slate-200 p-5 flex items-center justify-between shrink-0 rounded-t-[2.5rem] relative shadow-sm">
                                <button onClick={() => setFormAcik(false)} className="bg-slate-100 p-2.5 rounded-full text-slate-600 hover:bg-slate-200 transition"><ArrowLeft size={20}/></button>
                                <div className="text-center absolute left-1/2 -translate-x-1/2">
                                    <h2 className="font-black text-slate-800 text-lg">Servis Raporu</h2>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Saha Formu (No: {seciliIs.id.slice(0,5).toUpperCase()})</p>
                                </div>
                                <div className="w-10"></div>
                            </div>

                            {/* Form Body (Scrollable) */}
                            <div className="overflow-y-auto p-5 space-y-6 pb-32 custom-scrollbar">

                                {/* TASLAK BİLDİRİMİ (sahada yarım kalan form) */}
                                {taslakGeriYuklendi && (
                                    <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex items-center gap-3">
                                        <FileText size={16} className="text-amber-600 shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-[11px] font-black text-amber-800">Yarım kalan formun geri yüklendi</p>
                                            <p className="text-[10px] text-amber-600 font-medium">Kaldığın yerden devam edebilirsin, kaydettiğinde temizlenir.</p>
                                        </div>
                                        <button onClick={taslagiTemizle} className="text-[10px] font-black text-amber-700 bg-white border border-amber-300 px-2.5 py-1.5 rounded-lg hover:bg-amber-100 transition">
                                            SIFIRLA
                                        </button>
                                    </div>
                                )}
                                
                                {/* Üst Firma Bilgisi (Sadece Okunur) */}
                                <div className="bg-blue-600 text-white p-5 rounded-3xl shadow-lg shadow-blue-500/30">
                                    <div className="text-[10px] font-bold text-blue-200 uppercase tracking-wider mb-1">Müşteri / Firma Adı</div>
                                    <div className="font-extrabold text-xl leading-tight mb-2">{seciliIs.cranes?.customer_name || seciliIs.manual_customer_name}</div>
                                    <div className="text-[10px] font-bold text-blue-200 uppercase tracking-wider mb-1">Firma Adresi</div>
                                    <div className="font-medium text-sm text-blue-50 leading-snug">{seciliIs.cranes?.location_address || seciliIs.manual_location}</div>
                                </div>

                                {/* YENİ: OPERASYONA KATILAN EKİP */}
                                <div className="space-y-4 bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm">
                                    <div>
                                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-1">
                                            <Users className="w-4 h-4 text-blue-500"/> Operasyona Katılan Ekip
                                        </h3>
                                        <p className="text-[10px] text-slate-500 font-medium ml-1">Lütfen sahada işlemi gerçekleştiren tüm personelleri seçiniz.</p>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-2">
                                        {PERSONEL_LISTESI.map(personel => (
                                            <button 
                                                key={personel} 
                                                onClick={() => personelToggle(personel)} 
                                                className={`py-3 px-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 ${raporForm.secilen_personeller.includes(personel) ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                            >
                                                {raporForm.secilen_personeller.includes(personel) ? <CheckSquare size={14}/> : <Square size={14}/>}
                                                <span className="truncate">{personel}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* SES KAYDI ALANI */}
                                {seciliIs.audio_url && (
                                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-3xl shadow-sm">
                                        <div className="flex items-center gap-2 text-xs font-bold text-blue-800 uppercase mb-2">
                                            <Mic size={16} className="text-blue-600 animate-pulse" /> Müşterinin Ses Kaydı:
                                        </div>
                                        <audio src={seciliIs.audio_url} controls className="w-full h-10 rounded-xl" />
                                    </div>
                                )}

                                {/* TARİH / SAAT ALANI */}
                                <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-blue-500"/> Süre Takibi
                                    </h3>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 block">İşyerine Varış</label>
                                            <input type="text" placeholder="gg.aa.yyyy ss:dd" value={raporForm.isyerine_varis} onChange={e=>setRaporForm({...raporForm, isyerine_varis: e.target.value})} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-500 shadow-sm" />
                                            <button type="button" onClick={() => setRaporForm({ ...raporForm, isyerine_varis: simdiDamga() })} className="w-full py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl text-[10px] font-black hover:bg-blue-100 active:scale-95 transition flex items-center justify-center gap-1">
                                                <Zap size={11}/> ŞİMDİ · VARDIM
                                            </button>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 block">İşyerinden Ayrılış</label>
                                            <input type="text" placeholder="gg.aa.yyyy ss:dd" value={raporForm.isyerinden_ayrilis} onChange={e=>setRaporForm({...raporForm, isyerinden_ayrilis: e.target.value})} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-500 shadow-sm" />
                                            <button type="button" onClick={() => setRaporForm({ ...raporForm, isyerinden_ayrilis: simdiDamga() })} className="w-full py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-[10px] font-black hover:bg-amber-100 active:scale-95 transition flex items-center justify-center gap-1">
                                                <Zap size={11}/> ŞİMDİ · BİTİRDİM
                                            </button>
                                        </div>
                                    </div>

                                    {sureYazi(raporForm.isyerine_varis, raporForm.isyerinden_ayrilis) && (
                                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center justify-center gap-2">
                                            <Clock size={14} className="text-emerald-600"/>
                                            <span className="text-xs font-black text-emerald-700">
                                                Sahada geçen süre: {sureYazi(raporForm.isyerine_varis, raporForm.isyerinden_ayrilis)}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="h-px w-full bg-slate-200"></div>

                                {/* VİNÇ BİLGİLERİ */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2"><Truck className="w-4 h-4 text-blue-500"/> Makine / Vinç Bilgileri</h3>
                                    
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block">Modeli</label>
                                        <input type="text" placeholder="Model bilgisi" value={raporForm.vinc_modeli} onChange={e=>setRaporForm({...raporForm, vinc_modeli: e.target.value})} className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 shadow-sm" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block">Seri No</label>
                                            <input type="text" placeholder="Seri no" value={raporForm.vinc_seri_no} onChange={e=>setRaporForm({...raporForm, vinc_seri_no: e.target.value})} className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-mono text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 shadow-sm" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block">Kapasite / Tonaj</label>
                                            <input type="text" placeholder="Tonaj" value={raporForm.vinc_kapasite} onChange={e=>setRaporForm({...raporForm, vinc_kapasite: e.target.value})} className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 shadow-sm" />
                                        </div>
                                    </div>
                                </div>

                                {/* İŞLEM TÜRÜ VE ARIZA CİNSİ */}
                                <div className="space-y-4 bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 block">Servis İşlem Türü Seçin</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {['Servis', 'Garanti', 'Per.Bakım', 'Diğer'].map(tur => (
                                                <button key={tur} onClick={() => setRaporForm({...raporForm, islem_turu: tur})} className={`py-3 rounded-xl text-xs font-bold transition border ${raporForm.islem_turu === tur ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                    {tur}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 mt-4">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 block">Arızanın Cinsi (Sorun Ne İdi?)</label>
                                        <textarea rows={2} placeholder="Arıza detayını buraya girin..." value={raporForm.arizanin_cinsi} onChange={e=>setRaporForm({...raporForm, arizanin_cinsi: e.target.value})} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-500 transition resize-none leading-relaxed" />
                                        <SesliYazi
                                            etiket="Sesle anlat"
                                            onMetin={(m) => setRaporForm((o) => ({ ...o, arizanin_cinsi: o.arizanin_cinsi ? o.arizanin_cinsi + ' ' + m : m }))}
                                        />
                                    </div>
                                </div>

                                {/* YAPILAN İŞLER (BÜYÜK ALAN) */}
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-black text-slate-800 uppercase tracking-wider ml-1 flex items-center gap-2"><Wrench className="w-4 h-4 text-amber-500"/> Yapılan İşlemler (Detaylı)</label>
                                    <textarea rows={4} placeholder="Makine incelendi, şu parçalar söküldü, yerine bu takıldı, test edildi vb..." value={raporForm.yapilan_isler} onChange={e=>setRaporForm({...raporForm, yapilan_isler: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-3xl text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-amber-400 shadow-inner resize-none leading-relaxed" />
                                    <SesliYazi
                                        etiket="Sesle yaz · Ellerin boş kalsın"
                                        onMetin={(m) => setRaporForm((o) => ({ ...o, yapilan_isler: o.yapilan_isler ? o.yapilan_isler + ' ' + m : m }))}
                                    />
                                </div>

                                {/* FOTOĞRAF / VİDEO YÜKLEME */}
                                <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                            <Camera className="w-4 h-4 text-blue-500"/> Fotoğraf / Video
                                        </h3>
                                        <span className="text-[10px] font-black text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                                            {medyaOnizlemeler.length}/5
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 font-medium mb-3 ml-1">
                                        İş öncesi / sonrası görüntü ekleyin. Admin panelinde raporla birlikte görünür.
                                    </p>

                                    <input
                                        type="file"
                                        accept="image/*,video/*"
                                        multiple
                                        ref={dosyaInputRef}
                                        onChange={medyaSecildi}
                                        className="hidden"
                                    />

                                    <div className="grid grid-cols-3 gap-2">
                                        {medyaOnizlemeler.map((m, i) => (
                                            <div key={i} className="relative rounded-xl overflow-hidden border border-slate-300 aspect-square bg-black">
                                                {m.type === 'image'
                                                    ? <img src={m.url} className="w-full h-full object-cover" />
                                                    : <video src={m.url} className="w-full h-full object-cover" />}
                                                <button type="button" onClick={() => medyaSil(i)} className="absolute top-1 right-1 bg-red-500 text-white p-1.5 rounded-lg shadow-lg active:scale-90 transition">
                                                    <Trash2 size={11}/>
                                                </button>
                                                {m.type === 'video' && (
                                                    <div className="absolute bottom-1 left-1 bg-black/60 p-1 rounded-md">
                                                        <Video size={11} className="text-white"/>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {medyaOnizlemeler.length < 5 && (
                                            <button type="button" onClick={() => dosyaInputRef.current?.click()} className="aspect-square border-2 border-dashed border-slate-300 bg-slate-50 rounded-xl text-slate-400 hover:border-blue-500 hover:text-blue-500 transition flex flex-col items-center justify-center gap-1">
                                                <div className="flex gap-1"><ImageIcon size={16}/><Video size={16}/></div>
                                                <span className="text-[9px] font-bold">Ekle</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* DEĞİŞEN PARÇALAR TABLOSU (DİNAMİK) */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-[11px] font-black text-slate-800 uppercase tracking-wider ml-1 flex items-center gap-2"><FileText className="w-4 h-4 text-emerald-500"/> Değişen / Kullanılan Parçalar</label>
                                    </div>
                                    
                                    <div className="space-y-3">
                                        {raporForm.degisen_parcalar.map((parca, index) => (
                                            <div key={index} className="bg-white p-4 rounded-[2rem] border border-slate-200 shadow-sm relative group">
                                                <div className="absolute -top-2.5 left-4 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Kalem {index + 1}</div>
                                                
                                                <div className="grid grid-cols-12 gap-3 mt-2">
                                                    <div className="col-span-3">
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase px-1">Kod / No</label>
                                                        <input type="text" placeholder="No" value={parca.parca_no} onChange={(e) => parcaGuncelle(index, 'parca_no', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 placeholder:text-slate-400 text-center outline-none focus:bg-white" />
                                                    </div>
                                                    <div className="col-span-6 relative">
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase px-1 flex items-center justify-between">
                                                            <span>Parça Adı</span>
                                                            {Number(parca.birim_fiyat) > 0 && (
                                                                <span className="text-emerald-600">{Number(parca.birim_fiyat).toLocaleString('tr-TR')} ₺</span>
                                                            )}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            placeholder="Depodan ara veya yaz..."
                                                            value={parca.parca_adi}
                                                            onChange={(e) => { parcaGuncelle(index, 'parca_adi', e.target.value); malzemeAra(e.target.value, index); }}
                                                            onBlur={() => setTimeout(() => { if (aktifParcaIndex === index) { setMalzemeOnerileri([]); setAktifParcaIndex(null); } }, 250)}
                                                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:border-emerald-400"
                                                        />

                                                        {/* DEPO ÖNERİLERİ */}
                                                        {aktifParcaIndex === index && malzemeOnerileri.length > 0 && (
                                                            <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
                                                                <div className="bg-emerald-50 px-3 py-1.5 border-b border-emerald-100">
                                                                    <p className="text-[9px] font-black text-emerald-700 uppercase tracking-wider">Depodan seç</p>
                                                                </div>
                                                                {malzemeOnerileri.map((m) => (
                                                                    <button key={m.name} type="button" onClick={() => malzemeSec(index, m)}
                                                                        className="w-full px-3 py-2.5 text-left hover:bg-emerald-50 transition border-b border-slate-50 last:border-0">
                                                                        <p className="text-[11px] font-bold text-slate-700">{m.name}</p>
                                                                        <p className="text-[9px] text-slate-400 font-medium">
                                                                            {Number(m.sale_price || 0).toLocaleString('tr-TR')} ₺ · {m.unit || 'adet'}
                                                                        </p>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="col-span-3 relative">
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase px-1">Adet</label>
                                                        <input type="text" placeholder="Adet" value={parca.adet} onChange={(e) => parcaGuncelle(index, 'adet', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 placeholder:text-slate-400 text-center outline-none focus:bg-white pr-7" />
                                                        
                                                        {raporForm.degisen_parcalar.length > 1 && (
                                                            <button onClick={() => parcaSil(index)} className="absolute -right-2 -top-6 bg-red-100 text-red-500 p-1.5 rounded-full hover:bg-red-500 hover:text-white transition shadow-sm"><Trash2 size={12}/></button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <button onClick={parcaEkle} className="w-full py-3.5 border-2 border-dashed border-emerald-300 bg-emerald-50 text-emerald-600 rounded-2xl text-xs font-bold hover:bg-emerald-100 transition flex items-center justify-center gap-2 mt-2">
                                        <Plus size={16}/> YENİ PARÇA SATIRI EKLE
                                    </button>

                                    {malzemeTutari > 0 && (
                                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between mt-2">
                                            <span className="text-[11px] font-black text-emerald-700 uppercase tracking-wider">Parça Toplamı</span>
                                            <span className="text-lg font-black text-emerald-700">{malzemeTutari.toLocaleString('tr-TR')} ₺</span>
                                        </div>
                                    )}
                                </div>

                                {/* MÜŞTERİ İMZASI */}
                                <ImzaPad key={imzaAnahtar} onChange={setImzaBlob} />

                                {/* İŞ YERİ KONUMU */}
                                <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm">
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-2">
                                        <Crosshair className="w-4 h-4 text-emerald-500"/> İş Yeri Konumu
                                    </h3>
                                    <p className="text-[10px] text-slate-500 font-medium mb-3 ml-1">
                                        İşi yaptığınız konumu kaydedin; admin panelindeki canlı haritada görünür.
                                    </p>

                                    {konum ? (
                                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center justify-between">
                                            <div>
                                                <p className="text-[11px] font-black text-emerald-700">Konum kaydedildi ✅</p>
                                                <p className="text-[10px] text-emerald-600 font-mono mt-1">{konum.lat}, {konum.lng}</p>
                                            </div>
                                            <a href={`https://www.google.com/maps?q=${konum.lat},${konum.lng}`} target="_blank" rel="noopener noreferrer"
                                                className="text-[10px] font-black text-emerald-700 bg-white border border-emerald-200 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 transition">
                                                HARİTADA GÖR
                                            </a>
                                        </div>
                                    ) : (
                                        <button type="button" onClick={konumAl} disabled={konumDurumu === 'aliniyor'}
                                            className="w-full py-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl text-xs font-black hover:bg-emerald-100 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-60">
                                            {konumDurumu === 'aliniyor' ? <Loader2 size={15} className="animate-spin"/> : <Crosshair size={15}/>}
                                            {konumDurumu === 'aliniyor' ? 'KONUM ALINIYOR...' : konumDurumu === 'hata' ? 'KONUM ALINAMADI · TEKRAR DENE' : 'KONUMUMU KAYDET'}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Sabit Alt Buton */}
                            <div className="bg-white border-t border-slate-200 p-5 absolute bottom-0 left-0 w-full z-10 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] pb-8">
                                {gonderiliyor && yuklemeMesaji && (
                                    <p className="text-[10px] font-black text-blue-600 text-center mb-2 animate-pulse">{yuklemeMesaji}</p>
                                )}
                                <button onClick={raporuKaydet} disabled={gonderiliyor} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-500/30 flex justify-center items-center gap-2 active:scale-95 transition-all text-base">
                                    {gonderiliyor ? <Loader2 className="animate-spin w-5 h-5"/> : <Send className="w-5 h-5"/>}
                                    {gonderiliyor ? "SİSTEME KAYDEDİLİYOR..." : "FORMU KAYDET VE İŞİ BİTİR"}
                                </button>
                            </div>
                        </>
                    )}
                </motion.div>
            </>
        )}
      </AnimatePresence>
    </div>
  );
}