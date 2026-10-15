"use client";

// ----------------------------------------------------------------------------
// BUVISAN SERVİS PLANLAYICI 🗓️  (v1.0)
// ----------------------------------------------------------------------------
//  * Aylık modern çizelge: hangi gün kaç iş var, hangi gün dolu
//  * Gün planı: o günün 3 randevusu müşteri kartı olarak
//  * Geçmiş: geçmişte ne planladık, ne yapıldı, ne iptal edildi
//  * Aksiyonlar: Yapıldı / Ertele / İptal / Personel ata / Not
//  * Ayarlar: günlük kapasite, kaç gün ileri, hafta sonu, tatil günleri
//  MEVCUT HİÇBİR SAYFAYI/SİSTEMİ DEĞİŞTİRMEZ.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { PERSONEL_LISTESI } from '@/lib/personel';
import KoordinatGirisi from '@/components/KoordinatGirisi';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, X,
  CheckCircle2, XCircle, Clock, Phone, MapPin, Wrench, Search, Settings2,
  User, AlertTriangle, Ban, Truck, CalendarClock, History, LayoutGrid,
  GripVertical, Save, Trash2, ExternalLink, RefreshCw, Users, TrendingUp, Info, Check
} from 'lucide-react';

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const GUNLER_UZUN = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

// Personel listesi TEK KAYNAKTAN gelir (lib/personel.ts).
// Rapor formu da aynı listeyi kullanır; iki liste bir daha ayrışmaz.
const isoTarih = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const tarihYaz = (t: string, uzun = false) => {
  if (!t) return '';
  const [y, m, g] = t.split('-').map(Number);
  const d = new Date(y, m - 1, g);
  const gun = uzun ? GUNLER_UZUN[(d.getDay() + 6) % 7] : GUNLER[(d.getDay() + 6) % 7];
  return `${g} ${AYLAR[m - 1]} ${y}, ${gun}`;
};

const IS_TIPI: Record<string, { ad: string; sinif: string; nokta: string; ikon: any }> = {
  ariza: { ad: 'Arıza / Servis', sinif: 'bg-rose-100 text-rose-700 border-rose-200', nokta: 'bg-rose-500', ikon: AlertTriangle },
  kesif: { ad: 'Keşif', sinif: 'bg-indigo-100 text-indigo-700 border-indigo-200', nokta: 'bg-indigo-500', ikon: Search },
  bakim: { ad: 'Bakım Sözleşmesi', sinif: 'bg-blue-100 text-blue-700 border-blue-200', nokta: 'bg-blue-500', ikon: CalendarClock },
};

const DURUM: Record<string, { ad: string; sinif: string }> = {
  planlandi: { ad: 'Planlandı', sinif: 'bg-amber-100 text-amber-700 border-amber-200' },
  yapildi: { ad: 'Yapıldı', sinif: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  iptal: { ad: 'İptal', sinif: 'bg-slate-200 text-slate-600 border-slate-300' },
  ertelendi: { ad: 'Ertelendi', sinif: 'bg-orange-100 text-orange-700 border-orange-200' },
};

export default function PlanlayiciSayfasi() {
  const router = useRouter();

  const [erisimIzni, setErisimIzni] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [islemde, setIslemde] = useState<string | null>(null);

  const [randevular, setRandevular] = useState<any[]>([]);
  const [kapasite, setKapasite] = useState(3);
  const [ileriGun, setIleriGun] = useState(60);
  const [cumartesiAcik, setCumartesiAcik] = useState(false);
  const [pazarAcik, setPazarAcik] = useState(false);
  const [tatilGunleri, setTatilGunleri] = useState<string[]>([]);

  const [ay, setAy] = useState(() => { const b = new Date(); return new Date(b.getFullYear(), b.getMonth(), 1); });
  const [seciliTarih, setSeciliTarih] = useState(() => isoTarih(new Date()));
  const [gorunum, setGorunum] = useState<'takvim' | 'gecmis'>('takvim');
  const [arama, setArama] = useState('');
  const [filtreTip, setFiltreTip] = useState<'hepsi' | 'ariza' | 'kesif' | 'bakim'>('hepsi');
  const [filtreDurum, setFiltreDurum] = useState<'hepsi' | 'planlandi' | 'yapildi' | 'iptal'>('hepsi');

  // MODALLAR
  const [ekleAcik, setEkleAcik] = useState(false);
  const [ayarAcik, setAyarAcik] = useState(false);
  const [tasimaId, setTasimaId] = useState<string | null>(null);
  const [tasimaTarih, setTasimaTarih] = useState('');
  const [personelId, setPersonelId] = useState<string | null>(null);
  const [personelSecim, setPersonelSecim] = useState<string[]>([]);
  const [notId, setNotId] = useState<string | null>(null);
  const [notMetni, setNotMetni] = useState('');
  const [konumId, setKonumId] = useState<string | null>(null);
  const [konumLat, setKonumLat] = useState<number | null>(null);
  const [konumLng, setKonumLng] = useState<number | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const [yeni, setYeni] = useState({
    musteri_adi: '', yetkili: '', telefon: '', adres: '', lat: null as number | null, lng: null as number | null, vinc_bilgisi: '',
    is_tipi: 'ariza', tarih: '', aciklama: '', personeller: [] as string[], ticketAc: true
  });

  const bugunIso = isoTarih(new Date());

  // ============================ VERİ ============================
  const verileriGetir = useCallback(async () => {
    const { data: rData, error: rErr } = await supabase
      .from('randevular')
      .select('*')
      .order('randevu_tarihi', { ascending: false })
      .order('slot', { ascending: true })
      .limit(2000);

    if (rErr) console.error('Randevular alınamadı:', rErr.message);
    setRandevular(rData || []);

    const { data: aData } = await supabase.from('randevu_ayarlari').select('*').eq('id', 1).single();
    if (aData) {
      setKapasite(Number(aData.gunluk_kapasite) || 3);
      setIleriGun(Number(aData.ileri_gun) || 60);
      setCumartesiAcik(!!aData.cumartesi_acik);
      setPazarAcik(!!aData.pazar_acik);
      setTatilGunleri((aData.tatil_gunleri || []).map((t: any) => String(t).slice(0, 10)));
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.replace('/login'); return; }
        const { data: profil } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        if (!profil || profil.role !== 'admin') { router.replace('/personel'); return; }
        setErisimIzni(true);
        await verileriGetir();
      } catch (e) { console.error(e); }
      finally { setYukleniyor(false); }
    })();
  }, [router, verileriGetir]);

  // ============================ YARDIMCILAR ============================
  const gunHaritasi = useMemo(() => {
    const m: Record<string, any[]> = {};
    randevular.forEach((r) => {
      const t = String(r.randevu_tarihi).slice(0, 10);
      if (!m[t]) m[t] = [];
      m[t].push(r);
    });
    return m;
  }, [randevular]);

  const doluSayisi = (t: string) => (gunHaritasi[t] || []).filter((r) => r.durum !== 'iptal').length;

  const gunKapaliMi = (d: Date) => {
    const iso = isoTarih(d);
    const dow = d.getDay();
    if (dow === 6 && !cumartesiAcik) return true;
    if (dow === 0 && !pazarAcik) return true;
    if (tatilGunleri.includes(iso)) return true;
    return false;
  };

  const slotlariGetir = (t: string) => {
    const liste = gunHaritasi[t] || [];
    return Array.from({ length: kapasite }, (_, i) => ({
      slot: i + 1,
      kayit: liste.find((r) => Number(r.slot) === i + 1 && r.durum !== 'iptal') || null,
      iptal: liste.find((r) => Number(r.slot) === i + 1 && r.durum === 'iptal') || null,
    }));
  };

  const filtrele = (liste: any[]) =>
    liste.filter((r) => {
      if (filtreTip !== 'hepsi' && r.is_tipi !== filtreTip) return false;
      if (filtreDurum !== 'hepsi' && r.durum !== filtreDurum) return false;
      if (arama.trim()) {
        const q = arama.trim().toLowerCase();
        const metin = `${r.musteri_adi || ''} ${r.yetkili || ''} ${r.telefon || ''} ${r.adres || ''} ${r.vinc_bilgisi || ''}`.toLowerCase();
        if (!metin.includes(q)) return false;
      }
      return true;
    });

  // ============================ AKSİYONLAR ============================
  async function durumDegistir(r: any, yeniDurum: string) {
    const etiket = DURUM[yeniDurum]?.ad || yeniDurum;
    if (!confirm(`"${r.musteri_adi}" randevusunu "${etiket}" olarak işaretlemek istiyor musunuz?`)) return;
    setIslemde(r.id);

    const { error } = await supabase.from('randevular').update({ durum: yeniDurum }).eq('id', r.id);
    if (error) { alert('Güncelleme hatası: ' + error.message); setIslemde(null); return; }

    // Bağlı arıza kaydını da güncelle (Operasyon Takibi ile senkron)
    if (r.ticket_id) {
      if (yeniDurum === 'yapildi') {
        await supabase.from('service_tickets')
          .update({ pipeline_status: 'tamamlandi', status: 'tamamlandi' })
          .eq('id', r.ticket_id);
      } else if (yeniDurum === 'planlandi') {
        await supabase.from('service_tickets')
          .update({ pipeline_status: 'mudahale_edilecek', status: 'bekliyor' })
          .eq('id', r.ticket_id);
      }
    }

    await verileriGetir();
    setIslemde(null);
  }

  async function randevuTasi(r: any) {
    if (!tasimaTarih) return alert('Lütfen yeni tarihi seçin.');
    if (tasimaTarih === String(r.randevu_tarihi).slice(0, 10)) { setTasimaId(null); return; }

    const hedef = new Date(tasimaTarih + 'T12:00:00');
    if (gunKapaliMi(hedef)) return alert('Seçtiğiniz gün hizmete kapalı (hafta sonu veya tatil).');

    const doluSlotlar = (gunHaritasi[tasimaTarih] || [])
      .filter((x) => x.durum !== 'iptal' && x.id !== r.id)
      .map((x) => Number(x.slot));

    let bosSlot: number | null = null;
    for (let i = 1; i <= kapasite; i++) if (!doluSlotlar.includes(i)) { bosSlot = i; break; }
    if (bosSlot === null) return alert('Seçtiğiniz gün tamamen dolu. Başka bir gün seçin.');

    if (!confirm(`Randevu ${tarihYaz(tasimaTarih)} gününe taşınacak. Onaylıyor musunuz?`)) return;

    setIslemde(r.id);
    const { error } = await supabase.from('randevular')
      .update({ randevu_tarihi: tasimaTarih, slot: bosSlot, durum: 'planlandi' })
      .eq('id', r.id);

    if (error) alert('Taşıma hatası: ' + error.message);
    else { setTasimaId(null); setTasimaTarih(''); setSeciliTarih(tasimaTarih); await verileriGetir(); }
    setIslemde(null);
  }

  async function randevuSil(r: any) {
    if (!confirm(`"${r.musteri_adi}" randevusu tamamen silinsin mi?\n(Operasyon Takibi'ndeki arıza kaydı SİLİNMEZ.)`)) return;
    setIslemde(r.id);
    const { error } = await supabase.from('randevular').delete().eq('id', r.id);
    if (error) alert('Silme hatası: ' + error.message);
    else await verileriGetir();
    setIslemde(null);
  }

  async function personelKaydet(r: any) {
    setIslemde(r.id);
    const birlesik = personelSecim.join(' - ');

    const { error } = await supabase.from('randevular')
      .update({ atanan_personel: birlesik || null })
      .eq('id', r.id);

    if (error) { alert('Hata: ' + error.message); setIslemde(null); return; }

    // Operasyon Takibi'ndeki iş emrinin ekibi de aynı olsun (tek kayıt, iki görünüm)
    if (r.ticket_id) {
      await supabase.from('service_tickets')
        .update({ assigned_team: birlesik || null })
        .eq('id', r.ticket_id);
    }

    setPersonelId(null);
    await verileriGetir();
    setIslemde(null);
  }

  async function notKaydet(r: any) {
    setIslemde(r.id);
    const { error } = await supabase.from('randevular').update({ admin_notu: notMetni || null }).eq('id', r.id);
    if (error) alert('Hata: ' + error.message);
    else { setNotId(null); setNotMetni(''); await verileriGetir(); }
    setIslemde(null);
  }


  // 📍 KONUM KAYDET (koordinat güncelle)
  async function konumKaydet(r: any) {
    if (konumLat === null || konumLng === null) {
      alert('Enlem ve boylam girin (veya Google Maps linki yapıştırıp AL tuşuna basın).');
      return;
    }
    const { error } = await supabase.from('randevular').update({ lat: konumLat, lng: konumLng }).eq('id', r.id);
    if (error) alert('Kaydedilemedi: ' + error.message);
    else { setKonumId(null); setKonumLat(null); setKonumLng(null); await verileriGetir(); }
  }
  async function manuelEkle() {
    if (!yeni.musteri_adi.trim() || !yeni.telefon.trim()) return alert('Firma adı ve telefon zorunludur.');
    if (!yeni.tarih) return alert('Lütfen tarih seçin.');

    const hedef = new Date(yeni.tarih + 'T12:00:00');
    if (gunKapaliMi(hedef)) return alert('Seçtiğiniz gün hizmete kapalı (hafta sonu veya tatil).');

    const doluSlotlar = (gunHaritasi[yeni.tarih] || []).filter((x) => x.durum !== 'iptal').map((x) => Number(x.slot));
    let bosSlot: number | null = null;
    for (let i = 1; i <= kapasite; i++) if (!doluSlotlar.includes(i)) { bosSlot = i; break; }
    if (bosSlot === null) return alert('O gün tamamen dolu.');

    setKaydediliyor(true);
    try {
      let ticketId: string | null = null;

      if (yeni.ticketAc) {
        const issueType = yeni.is_tipi === 'kesif' ? 'Keşif Talebi'
          : yeni.is_tipi === 'bakim' ? 'Bakım Sözleşmesi Talebi' : 'Arıza Bildirimi';
        const pipeline = yeni.is_tipi === 'kesif' ? 'kesif_bekliyor'
          : yeni.is_tipi === 'bakim' ? 'teklif_hazirlanacak' : 'acil_cozum';

        const { data: tData, error: tErr } = await supabase.from('service_tickets').insert([{
          issue_type: issueType,
          description: yeni.aciklama || 'Telefonla alınan randevu.',
          status: 'bekliyor',
          pipeline_status: pipeline,
          manual_customer_name: yeni.musteri_adi,
          manual_customer_rep: yeni.yetkili,
          manual_phone: yeni.telefon,
          manual_location: yeni.adres,
          manual_crane_info: yeni.vinc_bilgisi,
          priority: yeni.is_tipi === 'ariza' ? 'Kritik (Makine Durdu)' : 'Normal',
          assigned_team: yeni.personeller.join(' - ') || null,
        }]).select('id').single();

        if (tErr) throw tErr;
        ticketId = tData?.id || null;
      }

      const { error } = await supabase.from('randevular').insert([{
        musteri_adi: yeni.musteri_adi.trim(),
        yetkili: yeni.yetkili || null,
        telefon: yeni.telefon.trim(),
        adres: yeni.adres || null,
        lat: yeni.lat ?? null,
        lng: yeni.lng ?? null,
        vinc_bilgisi: yeni.vinc_bilgisi || null,
        is_tipi: yeni.is_tipi,
        randevu_tarihi: yeni.tarih,
        slot: bosSlot,
        durum: 'planlandi',
        kaynak: 'admin',
        atanan_personel: yeni.personeller.join(' - ') || null,
        admin_notu: yeni.aciklama || null,
        ticket_id: ticketId,
      }]);

      if (error) throw error;

      setEkleAcik(false);
      setYeni({ musteri_adi: '', yetkili: '', telefon: '', adres: '', lat: null as number | null, lng: null as number | null, vinc_bilgisi: '', is_tipi: 'ariza', tarih: seciliTarih, aciklama: '', personeller: [], ticketAc: true });
      setSeciliTarih(yeni.tarih);
      await verileriGetir();
    } catch (e: any) {
      alert('Kayıt hatası: ' + e.message);
    } finally {
      setKaydediliyor(false);
    }
  }

  async function ayarlariKaydet() {
    setKaydediliyor(true);
    const { error } = await supabase.from('randevu_ayarlari').update({
      gunluk_kapasite: Number(kapasite),
      ileri_gun: Number(ileriGun),
      cumartesi_acik: cumartesiAcik,
      pazar_acik: pazarAcik,
      tatil_gunleri: tatilGunleri,
      guncelleme: new Date().toISOString(),
    }).eq('id', 1);

    if (error) alert('Ayar kaydedilemedi: ' + error.message);
    else { setAyarAcik(false); await verileriGetir(); }
    setKaydediliyor(false);
  }

  // ============================ İSTATİSTİK ============================
  const istatistik = useMemo(() => {
    const ayBasi = isoTarih(new Date(ay.getFullYear(), ay.getMonth(), 1));
    const aySonu = isoTarih(new Date(ay.getFullYear(), ay.getMonth() + 1, 0));
    const aylik = randevular.filter((r) => {
      const t = String(r.randevu_tarihi).slice(0, 10);
      return t >= ayBasi && t <= aySonu && r.durum !== 'iptal';
    });
    const bugun = randevular.filter((r) => String(r.randevu_tarihi).slice(0, 10) === bugunIso && r.durum !== 'iptal');

    const haftaBasi = new Date();
    haftaBasi.setDate(haftaBasi.getDate() - ((haftaBasi.getDay() + 6) % 7));
    const haftaBasiIso = isoTarih(haftaBasi);
    const haftaSonuIso = isoTarih(new Date(haftaBasi.getFullYear(), haftaBasi.getMonth(), haftaBasi.getDate() + 6));
    const haftalik = randevular.filter((r) => {
      const t = String(r.randevu_tarihi).slice(0, 10);
      return t >= haftaBasiIso && t <= haftaSonuIso && r.durum !== 'iptal';
    });

    const yapilan = aylik.filter((r) => r.durum === 'yapildi').length;
    return {
      bugun: bugun.length,
      hafta: haftalik.length,
      ay: aylik.length,
      yapilan,
      bekleyen: aylik.length - yapilan,
      oran: aylik.length ? Math.round((yapilan / aylik.length) * 100) : 0,
    };
  }, [randevular, ay, bugunIso]);

  // ============================ TAKVİM HÜCRELERİ ============================
  const hucreler = useMemo(() => {
    const ilk = new Date(ay.getFullYear(), ay.getMonth(), 1);
    const kaydirma = (ilk.getDay() + 6) % 7;
    const gunSayisi = new Date(ay.getFullYear(), ay.getMonth() + 1, 0).getDate();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < kaydirma; i++) arr.push(null);
    for (let g = 1; g <= gunSayisi; g++) arr.push(new Date(ay.getFullYear(), ay.getMonth(), g));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [ay]);

  const seciliSlotlar = slotlariGetir(seciliTarih);
  const gecmisListesi = useMemo(
    () => filtrele(randevular.filter((r) => String(r.randevu_tarihi).slice(0, 10) < bugunIso)),
    [randevular, bugunIso, filtreTip, filtreDurum, arama]
  );

  // ============================ YÜKLEME / YETKİ ============================
  if (yukleniyor) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-bold">Planlayıcı yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!erisimIzni) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-xl max-w-sm">
          <Ban className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="font-black text-slate-800 mb-1">Erişim Yok</h2>
          <p className="text-slate-500 text-sm">Bu sayfayı görmek için yönetici olarak giriş yapmalısınız.</p>
        </div>
      </div>
    );
  }

  // ============================ ARAYÜZ ============================
  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-24">

      {/* ÜST HEADER */}
      <div className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-50 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin')} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-2.5 rounded-xl transition">
              <ArrowLeft size={18} />
            </button>
            <div className="bg-gradient-to-tr from-indigo-600 to-blue-400 p-2.5 rounded-xl shadow-lg shadow-indigo-900/50">
              <CalendarDays className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none">SERVİS PLANLAYICI</h1>
              <p className="text-[10px] text-indigo-400 font-medium tracking-widest uppercase">Randevu Çizelgesi</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={verileriGetir} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-2.5 rounded-xl transition" title="Yenile">
              <RefreshCw size={18} />
            </button>
            <button onClick={() => { setYeni({ ...yeni, tarih: seciliTarih }); setEkleAcik(true); }}
              className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition shadow-lg shadow-indigo-900/30">
              <Plus size={16} /> <span className="hidden sm:inline">Randevu Ekle</span>
            </button>
            <button onClick={() => setAyarAcik(true)} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-2.5 rounded-xl transition" title="Ayarlar">
              <Settings2 size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">

        {/* İSTATİSTİK ŞERİDİ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 text-slate-400 mb-1"><Clock size={14} /><span className="text-[10px] font-bold uppercase tracking-wider">Bugün</span></div>
            <p className="text-3xl font-black text-slate-800 leading-none">{istatistik.bugun}</p>
            <p className="text-[10px] text-slate-400 font-medium mt-1">planlı iş</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 text-slate-400 mb-1"><CalendarDays size={14} /><span className="text-[10px] font-bold uppercase tracking-wider">Bu Hafta</span></div>
            <p className="text-3xl font-black text-slate-800 leading-none">{istatistik.hafta}</p>
            <p className="text-[10px] text-slate-400 font-medium mt-1">randevu</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 text-slate-400 mb-1"><TrendingUp size={14} /><span className="text-[10px] font-bold uppercase tracking-wider">{AYLAR[ay.getMonth()]}</span></div>
            <p className="text-3xl font-black text-slate-800 leading-none">{istatistik.ay}</p>
            <p className="text-[10px] text-slate-400 font-medium mt-1">{istatistik.yapilan} yapıldı · {istatistik.bekleyen} bekliyor</p>
          </div>
          <div className="bg-gradient-to-br from-indigo-600 to-blue-600 rounded-2xl p-4 shadow-lg shadow-indigo-200 text-white">
            <div className="flex items-center gap-2 opacity-80 mb-1"><CheckCircle2 size={14} /><span className="text-[10px] font-bold uppercase tracking-wider">Tamamlanma</span></div>
            <p className="text-3xl font-black leading-none">{istatistik.oran}%</p>
            <div className="mt-2 w-full h-1.5 bg-white/25 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${istatistik.oran}%` }}></div>
            </div>
          </div>
        </div>

        {/* ARAÇ ÇUBUĞU */}
        <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-50 rounded-xl p-1">
            <button onClick={() => setGorunum('takvim')} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${gorunum === 'takvim' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>
              <LayoutGrid size={13} /> Takvim
            </button>
            <button onClick={() => setGorunum('gecmis')} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${gorunum === 'gecmis' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>
              <History size={13} /> Geçmiş
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 min-w-[140px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Firma, yetkili, telefon ara..."
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition" />
            </div>
            <select value={filtreTip} onChange={(e) => setFiltreTip(e.target.value as any)}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none cursor-pointer">
              <option value="hepsi">Tüm İşler</option>
              <option value="ariza">Arıza</option>
              <option value="kesif">Keşif</option>
              <option value="bakim">Bakım</option>
            </select>
            <select value={filtreDurum} onChange={(e) => setFiltreDurum(e.target.value as any)}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none cursor-pointer">
              <option value="hepsi">Tüm Durumlar</option>
              <option value="planlandi">Planlandı</option>
              <option value="yapildi">Yapıldı</option>
              <option value="iptal">İptal</option>
            </select>
          </div>
        </div>

        {/* ==================== TAKVİM GÖRÜNÜMÜ ==================== */}
        {gorunum === 'takvim' && (
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

            {/* TAKVİM */}
            <div className="xl:col-span-3 bg-white rounded-3xl p-4 md:p-5 border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button onClick={() => setAy(new Date(ay.getFullYear(), ay.getMonth() - 1, 1))} className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 transition">
                    <ChevronLeft size={16} />
                  </button>
                  <button onClick={() => setAy(new Date(ay.getFullYear(), ay.getMonth() + 1, 1))} className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 transition">
                    <ChevronRight size={16} />
                  </button>
                </div>
                <h2 className="text-lg font-black text-slate-800 tracking-tight">{AYLAR[ay.getMonth()]} {ay.getFullYear()}</h2>
                <button onClick={() => { const b = new Date(); setAy(new Date(b.getFullYear(), b.getMonth(), 1)); setSeciliTarih(isoTarih(b)); }}
                  className="px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition">
                  Bugün
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1.5 mb-2">
                {GUNLER.map((g) => (
                  <div key={g} className={`text-center text-[10px] font-bold uppercase tracking-wider ${g === 'Cmt' || g === 'Paz' ? 'text-slate-300' : 'text-slate-400'}`}>{g}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {hucreler.map((tarih, i) => {
                  if (!tarih) return <div key={`bos-${i}`} className="aspect-square" />;

                  const iso = isoTarih(tarih);
                  const kapali = gunKapaliMi(tarih);
                  const dolu = doluSayisi(iso);
                  const tamDolu = dolu >= kapasite;
                  const secili = iso === seciliTarih;
                  const bugunMu = iso === bugunIso;
                  const gecmis = iso < bugunIso;

                  return (
                    <button
                      key={iso}
                      onClick={() => setSeciliTarih(iso)}
                      className={[
                        'aspect-square rounded-2xl border p-1.5 flex flex-col justify-between text-left transition-all relative',
                        secili ? 'bg-slate-900 border-slate-900 text-white shadow-lg scale-[1.03] z-10'
                          : kapali ? 'bg-slate-50 border-slate-100 text-slate-300'
                            : gecmis ? 'bg-white border-slate-100 hover:border-slate-300 opacity-70'
                              : tamDolu ? 'bg-rose-50 border-rose-200 hover:border-rose-400'
                                : dolu > 0 ? 'bg-amber-50 border-amber-200 hover:border-amber-400'
                                  : 'bg-white border-slate-200 hover:border-emerald-400 hover:shadow-md',
                        bugunMu && !secili ? 'ring-2 ring-indigo-400/40' : '',
                      ].join(' ')}
                    >
                      <span className={`text-xs font-black leading-none ${secili ? 'text-white' : kapali ? 'text-slate-300' : 'text-slate-700'}`}>
                        {tarih.getDate()}
                      </span>

                      {!kapali && (
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-[3px]">
                            {Array.from({ length: kapasite }).map((_, k) => {
                              const kayit = (gunHaritasi[iso] || []).find((r) => Number(r.slot) === k + 1 && r.durum !== 'iptal');
                              const renk = kayit
                                ? (kayit.durum === 'yapildi' ? 'bg-emerald-500' : kayit.is_tipi === 'ariza' ? 'bg-rose-500' : kayit.is_tipi === 'kesif' ? 'bg-indigo-500' : 'bg-blue-500')
                                : secili ? 'bg-white/25' : 'bg-slate-200';
                              return <span key={k} className={`w-1.5 h-1.5 rounded-full ${renk}`} />;
                            })}
                          </div>
                          {dolu > 0 && (
                            <span className={`text-[8px] font-bold leading-none ${secili ? 'text-white/80' : tamDolu ? 'text-rose-600' : 'text-slate-500'}`}>
                              {tamDolu ? 'DOLU' : `${dolu}/${kapasite}`}
                            </span>
                          )}
                        </div>
                      )}
                      {kapali && <span className="text-[8px] font-bold text-slate-300">KAPALI</span>}
                    </button>
                  );
                })}
              </div>

              {/* AÇIKLAMA */}
              <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Renkler:</span>
                {[['bg-rose-500', 'Arıza'], ['bg-indigo-500', 'Keşif'], ['bg-blue-500', 'Bakım'], ['bg-emerald-500', 'Yapıldı'], ['bg-slate-200', 'Boş']].map(([c, l]) => (
                  <span key={l} className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
                    <span className={`w-2 h-2 rounded-full ${c}`} /> {l}
                  </span>
                ))}
              </div>
            </div>

            {/* SEÇİLİ GÜNÜN PLANI */}
            <div className="xl:col-span-2 space-y-3">
              <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-base font-black text-slate-800 leading-tight">{tarihYaz(seciliTarih, true)}</h3>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                      {gunKapaliMi(new Date(seciliTarih + 'T12:00:00'))
                        ? 'Hizmete kapalı gün'
                        : `${doluSayisi(seciliTarih)} / ${kapasite} randevu dolu`}
                    </p>
                  </div>
                  <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black border ${doluSayisi(seciliTarih) >= kapasite ? 'bg-rose-50 text-rose-600 border-rose-200'
                      : doluSayisi(seciliTarih) > 0 ? 'bg-amber-50 text-amber-600 border-amber-200'
                        : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
                    {doluSayisi(seciliTarih) >= kapasite ? 'DOLU' : `${kapasite - doluSayisi(seciliTarih)} YER BOŞ`}
                  </div>
                </div>

                <div className="space-y-3">
                  {seciliSlotlar.map(({ slot, kayit, iptal }) => (
                    <div key={slot}>
                      {kayit ? (
                        <RandevuKarti
                          kayit={kayit}
                          islemde={islemde === kayit.id}
                          onYapildi={() => durumDegistir(kayit, 'yapildi')}
                          onGeriAl={() => durumDegistir(kayit, 'planlandi')}
                          onIptal={() => durumDegistir(kayit, 'iptal')}
                          onTasi={() => { setTasimaId(kayit.id); setTasimaTarih(String(kayit.randevu_tarihi).slice(0, 10)); }}
                          onPersonel={() => { setPersonelId(kayit.id); setPersonelSecim(String(kayit.atanan_personel || '').split(' - ').map((x: string) => x.trim()).filter(Boolean)); }}
                          onNot={() => { setNotId(kayit.id); setNotMetni(kayit.admin_notu || ''); }}
                          onSil={() => randevuSil(kayit)}
                          tasimaAcik={tasimaId === kayit.id}
                          tasimaTarih={tasimaTarih}
                          setTasimaTarih={setTasimaTarih}
                          onTasiOnayla={() => randevuTasi(kayit)}
                          onTasiVazgec={() => { setTasimaId(null); setTasimaTarih(''); }}
                          personelAcik={personelId === kayit.id}
                          personelSecim={personelSecim}
                          onPersonelToggle={(p: string) => setPersonelSecim((onceki) => onceki.includes(p) ? onceki.filter((x) => x !== p) : [...onceki, p])}
                          onPersonelKaydet={() => personelKaydet(kayit)}
                          onPersonelVazgec={() => setPersonelId(null)}
                          notAcik={notId === kayit.id}
                          notMetni={notMetni}
                          setNotMetni={setNotMetni}
                          onNotKaydet={() => notKaydet(kayit)}
                          onNotVazgec={() => { setNotId(null); setNotMetni(''); }}
                  konumAcik={konumId === kayit.id}
                  onKonum={() => { setKonumId(kayit.id); setKonumLat(kayit.lat ?? null); setKonumLng(kayit.lng ?? null); }}
                  konumKaydet={() => konumKaydet(kayit)}
                  konumVazgec={() => { setKonumId(null); setKonumLat(null); setKonumLng(null); }}
                  konumLat={konumLat}
                  konumLng={konumLng}
                  setKonumLat={setKonumLat}
                  setKonumLng={setKonumLng}
                        />
                      ) : (
                        <button
                          onClick={() => { setYeni({ ...yeni, tarih: seciliTarih }); setEkleAcik(true); }}
                          disabled={gunKapaliMi(new Date(seciliTarih + 'T12:00:00'))}
                          className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-4 flex items-center gap-3 text-left hover:border-indigo-400 hover:bg-indigo-50/40 transition disabled:opacity-40 disabled:cursor-not-allowed group"
                        >
                          <div className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition">
                            <Plus size={16} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-500 group-hover:text-indigo-700">{slot}. randevu boş</p>
                            <p className="text-[10px] text-slate-400 font-medium">
                              {iptal ? 'Bu slot iptal edilmiş, yeniden doldurulabilir' : 'Müşteri eklemek için tıklayın'}
                            </p>
                          </div>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* GEÇMİŞ MİNİ ÖZET */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-5 text-white shadow-lg">
                <div className="flex items-center gap-2 mb-3">
                  <History size={16} className="text-slate-400" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Bu Ayın Özeti</h4>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
                    <p className="text-2xl font-black">{istatistik.ay}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">Planlandı</p>
                  </div>
                  <div className="bg-emerald-500/15 rounded-2xl p-3 border border-emerald-500/30">
                    <p className="text-2xl font-black text-emerald-400">{istatistik.yapilan}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-300/70 mt-0.5">Yapıldı</p>
                  </div>
                  <div className="bg-amber-500/15 rounded-2xl p-3 border border-amber-500/30">
                    <p className="text-2xl font-black text-amber-400">{istatistik.bekleyen}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-amber-300/70 mt-0.5">Bekliyor</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== GEÇMİŞ GÖRÜNÜMÜ ==================== */}
        {gorunum === 'gecmis' && (
          <div className="bg-white rounded-3xl p-4 md:p-6 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-1 h-6 bg-slate-800 rounded-full" />
              <h2 className="text-lg font-bold text-slate-800">Geçmiş İşler</h2>
              <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2.5 py-1 rounded-full">{gecmisListesi.length} kayıt</span>
            </div>

            {gecmisListesi.length === 0 ? (
              <div className="text-center py-16">
                <History className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm font-medium">Geçmiş kayıt bulunamadı.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(
                  gecmisListesi.reduce((acc: Record<string, any[]>, r: any) => {
                    const t = String(r.randevu_tarihi).slice(0, 10);
                    (acc[t] = acc[t] || []).push(r);
                    return acc;
                  }, {})
                )
                  .sort((a, b) => (a[0] < b[0] ? 1 : -1))
                  .map(([tarih, liste]) => (
                    <div key={tarih} className="border border-slate-100 rounded-2xl overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between">
                        <span className="text-xs font-black text-slate-600">{tarihYaz(tarih, true)}</span>
                        <span className="text-[10px] font-bold text-slate-400">
                          {liste.filter((r: any) => r.durum === 'yapildi').length} yapıldı · {liste.length} kayıt
                        </span>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {liste.map((r: any) => (
                          <div key={r.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50/60 transition">
                            <span className="text-[10px] font-black text-slate-300 w-4">{r.slot}</span>
                            <span className={`w-2 h-2 rounded-full ${IS_TIPI[r.is_tipi]?.nokta || 'bg-slate-300'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-700 truncate">{r.musteri_adi}</p>
                              <p className="text-[10px] text-slate-400 font-medium truncate">
                                {IS_TIPI[r.is_tipi]?.ad || r.is_tipi}
                                {r.atanan_personel ? ` · ${r.atanan_personel}` : ''}
                                {r.admin_notu ? ` · ${r.admin_notu}` : ''}
                              </p>
                            </div>
                            <span className={`text-[9px] font-black px-2.5 py-1 rounded-full border ${DURUM[r.durum]?.sinif || ''}`}>
                              {DURUM[r.durum]?.ad || r.durum}
                            </span>
                            {r.durum !== 'yapildi' && (
                              <button onClick={() => durumDegistir(r, 'yapildi')} title="Yapıldı işaretle"
                                className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition">
                                <CheckCircle2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ==================== RANDEVU EKLEME MODALI ==================== */}
      <AnimatePresence>
        {ekleAcik && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[999] flex items-end md:items-center justify-center p-0 md:p-4 overflow-y-auto"
            onClick={() => setEkleAcik(false)}>
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-2xl rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92dvh] overflow-y-auto">

              <div className="sticky top-0 bg-slate-900 text-white px-5 py-4 flex items-center justify-between rounded-t-3xl z-10">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-500/20 p-2 rounded-xl"><CalendarDays size={18} className="text-indigo-400" /></div>
                  <div>
                    <h3 className="font-black text-base leading-none">Yeni Randevu</h3>
                    <p className="text-[10px] text-slate-400 mt-1">Manuel planlama (telefonla gelen işler için)</p>
                  </div>
                </div>
                <button onClick={() => setEkleAcik(false)} className="bg-slate-800 hover:bg-red-500 p-2.5 rounded-full transition"><X size={18} /></button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">İş Tipi</label>
                  <div className="flex gap-2">
                    {(['ariza', 'kesif', 'bakim'] as const).map((tip) => (
                      <button key={tip} onClick={() => setYeni({ ...yeni, is_tipi: tip })}
                        className={`flex-1 py-3 rounded-xl text-xs font-bold border transition ${yeni.is_tipi === tip ? `${IS_TIPI[tip].sinif} shadow-sm` : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                        {IS_TIPI[tip].ad}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Firma Adı *</label>
                    <input value={yeni.musteri_adi} onChange={(e) => setYeni({ ...yeni, musteri_adi: e.target.value })} placeholder="Firma adı"
                      className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-400 transition" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Telefon *</label>
                    <input value={yeni.telefon} onChange={(e) => setYeni({ ...yeni, telefon: e.target.value })} placeholder="05XX XXX XX XX"
                      className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono outline-none focus:border-indigo-400 transition" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Yetkili</label>
                    <input value={yeni.yetkili} onChange={(e) => setYeni({ ...yeni, yetkili: e.target.value })} placeholder="Ad Soyad"
                      className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 transition" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Vinç / Makine</label>
                    <input value={yeni.vinc_bilgisi} onChange={(e) => setYeni({ ...yeni, vinc_bilgisi: e.target.value })} placeholder="Örn: 10 Ton Tavan Vinci"
                      className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 transition" />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Adres</label>
                  <input value={yeni.adres} onChange={(e) => setYeni({ ...yeni, adres: e.target.value })} placeholder="İl, ilçe, açık adres"
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 transition" />
                  <div className="mt-2">
                    <KoordinatGirisi
                      lat={yeni.lat}
                      lng={yeni.lng}
                      onChange={(la, ln) => setYeni({ ...yeni, lat: la, lng: ln })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Randevu Tarihi *</label>
                    <input type="date" value={yeni.tarih} onChange={(e) => setYeni({ ...yeni, tarih: e.target.value })}
                      className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-400 transition" />
                    <p className="text-[10px] text-slate-400 font-medium mt-1.5">
                      Boş yer: {yeni.tarih ? Math.max(kapasite - doluSayisi(yeni.tarih), 0) : '-'}
                      {yeni.tarih && gunKapaliMi(new Date(yeni.tarih + 'T12:00:00')) ? ' · KAPALI GÜN!' : ''}
                    </p>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Personel (birden fazla seçilebilir)</label>
                    <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                      {PERSONEL_LISTESI.map((p) => {
                        const secili = yeni.personeller.includes(p);
                        return (
                          <button key={p} type="button"
                            onClick={() => setYeni({ ...yeni, personeller: secili ? yeni.personeller.filter((x) => x !== p) : [...yeni.personeller, p] })}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition flex items-center gap-1 ${secili ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                            {secili && <Check size={10} />} {p}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Not / Arıza Açıklaması</label>
                  <textarea rows={3} value={yeni.aciklama} onChange={(e) => setYeni({ ...yeni, aciklama: e.target.value })} placeholder="Kısa açıklama..."
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none outline-none focus:border-indigo-400 transition" />
                </div>

                <label className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 cursor-pointer">
                  <input type="checkbox" checked={yeni.ticketAc} onChange={(e) => setYeni({ ...yeni, ticketAc: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600" />
                  <div>
                    <p className="text-xs font-bold text-slate-700">Operasyon Takibi'ne de kayıt aç</p>
                    <p className="text-[10px] text-slate-400 font-medium">İş, ana paneldeki arıza listesinde de görünür.</p>
                  </div>
                </label>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setEkleAcik(false)} className="px-5 py-3.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition text-sm">İptal</button>
                  <button onClick={manuelEkle} disabled={kaydediliyor}
                    className="flex-1 py-3.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 transition text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                    {kaydediliyor ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Randevuyu Kaydet
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== AYARLAR MODALI ==================== */}
      <AnimatePresence>
        {ayarAcik && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[999] flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => setAyarAcik(false)}>
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl max-h-[92dvh] overflow-y-auto">

              <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between rounded-t-3xl">
                <div className="flex items-center gap-3">
                  <div className="bg-white/10 p-2 rounded-xl"><Settings2 size={18} /></div>
                  <div>
                    <h3 className="font-black text-base leading-none">Randevu Ayarları</h3>
                    <p className="text-[10px] text-slate-400 mt-1">Kapasite ve çalışma günleri</p>
                  </div>
                </div>
                <button onClick={() => setAyarAcik(false)} className="bg-slate-800 hover:bg-red-500 p-2.5 rounded-full transition"><X size={18} /></button>
              </div>

              <div className="p-5 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Günlük Kapasite</label>
                    <input type="number" min={1} max={20} value={kapasite} onChange={(e) => setKapasite(Number(e.target.value))}
                      className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black outline-none focus:border-indigo-400 transition" />
                    <p className="text-[10px] text-slate-400 font-medium mt-1">Bir güne kaç müşteri alınabilir</p>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Kaç Gün İleri</label>
                    <input type="number" min={7} max={365} value={ileriGun} onChange={(e) => setIleriGun(Number(e.target.value))}
                      className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black outline-none focus:border-indigo-400 transition" />
                    <p className="text-[10px] text-slate-400 font-medium mt-1">Müşteri kaç gün sonrasına kadar seçebilir</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 cursor-pointer">
                    <input type="checkbox" checked={cumartesiAcik} onChange={(e) => setCumartesiAcik(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                    <span className="text-xs font-bold text-slate-700">Cumartesi günleri randevu alınabilsin</span>
                  </label>
                  <label className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 cursor-pointer">
                    <input type="checkbox" checked={pazarAcik} onChange={(e) => setPazarAcik(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                    <span className="text-xs font-bold text-slate-700">Pazar günleri randevu alınabilsin</span>
                  </label>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Tatil Günleri</label>
                  <textarea rows={4} value={tatilGunleri.join('\n')}
                    onChange={(e) => setTatilGunleri(e.target.value.split('\n').map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)))}
                    placeholder={'2026-01-01\n2026-04-23'}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:border-indigo-400 transition" />
                  <p className="text-[10px] text-slate-400 font-medium mt-1">Her satıra bir tarih (YYYY-AA-GG). Bu günler müşteriye kapalı görünür.</p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex gap-2">
                  <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-700 font-medium leading-relaxed">
                    Kapasiteyi düşürürseniz mevcut randevular silinmez; sadece yeni randevu alımı yeni sayıya göre yapılır.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setAyarAcik(false)} className="px-5 py-3.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition text-sm">Kapat</button>
                  <button onClick={ayarlariKaydet} disabled={kaydediliyor}
                    className="flex-1 py-3.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                    {kaydediliyor ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Ayarları Kaydet
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// RANDEVU KARTI
// ============================================================================
function RandevuKarti({
  kayit, islemde, onYapildi, onGeriAl, onIptal, onTasi, onPersonel, onNot, onSil,
  tasimaAcik, tasimaTarih, setTasimaTarih, onTasiOnayla, onTasiVazgec,
  personelAcik, personelSecim, onPersonelToggle, onPersonelKaydet, onPersonelVazgec,
  notAcik, notMetni, setNotMetni, onNotKaydet, onNotVazgec,
  konumAcik, onKonum, konumKaydet, konumVazgec, konumLat, konumLng, setKonumLat, setKonumLng,
}: any) {
  const tip = IS_TIPI[kayit.is_tipi] || IS_TIPI.ariza;
  const TipIkon = tip.ikon;
  const durum = DURUM[kayit.durum] || DURUM.planlandi;

  return (
    <div className={`rounded-2xl border-2 p-4 transition ${kayit.durum === 'yapildi' ? 'bg-emerald-50/50 border-emerald-200'
        : kayit.durum === 'iptal' ? 'bg-slate-50 border-slate-200 opacity-70'
          : kayit.is_tipi === 'ariza' ? 'bg-white border-rose-200' : 'bg-white border-slate-200'}`}>

      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="bg-slate-900 text-white text-[9px] font-black px-2 py-1 rounded-lg">{kayit.slot}. RANDEVU</span>
          <span className={`text-[9px] font-black px-2 py-1 rounded-lg border flex items-center gap-1 ${tip.sinif}`}>
            <TipIkon size={10} /> {tip.ad}
          </span>
          <span className={`text-[9px] font-black px-2 py-1 rounded-lg border ${durum.sinif}`}>{durum.ad}</span>
        </div>
        {islemde && <Loader2 size={14} className="animate-spin text-slate-400" />}
      </div>

      <h4 className="text-sm font-black text-slate-800 leading-tight mb-2">{kayit.musteri_adi}</h4>

      <div className="space-y-1 mb-3">
        {kayit.yetkili && (
          <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5"><User size={11} className="text-slate-400" /> {kayit.yetkili}</p>
        )}
        {kayit.telefon && (
          <a href={`tel:${kayit.telefon}`} className="text-[11px] text-blue-600 font-bold flex items-center gap-1.5 hover:underline">
            <Phone size={11} /> {kayit.telefon}
          </a>
        )}
        {kayit.adres && (
          <p className="text-[11px] text-slate-500 font-medium flex items-start gap-1.5"><MapPin size={11} className="text-slate-400 mt-0.5 shrink-0" /> {kayit.adres}</p>
        )}
        {kayit.vinc_bilgisi && (
          <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5"><Wrench size={11} className="text-slate-400" /> {kayit.vinc_bilgisi}</p>
        )}
        {kayit.atanan_personel && (
          <p className="text-[11px] text-indigo-600 font-bold flex items-center gap-1.5"><Truck size={11} /> {kayit.atanan_personel}</p>
        )}
        {kayit.admin_notu && (
          <p className="text-[11px] text-slate-600 font-medium bg-slate-50 border border-slate-100 rounded-lg p-2 mt-1.5">{kayit.admin_notu}</p>
        )}
      </div>

      {/* AKSİYONLAR */}
      <div className="flex flex-wrap gap-1.5">
        {kayit.durum !== 'yapildi' && (
          <button onClick={onYapildi} className="flex-1 min-w-[110px] bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg text-[10px] font-black transition flex items-center justify-center gap-1">
            <CheckCircle2 size={12} /> YAPILDI
          </button>
        )}
        {kayit.durum === 'yapildi' && (
          <button onClick={onGeriAl} className="flex-1 min-w-[110px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 py-2 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1">
            <Clock size={12} /> Geri Al
          </button>
        )}
        <button onClick={onTasi} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-2.5 py-2 rounded-lg text-[10px] font-bold transition flex items-center gap-1" title="Başka güne taşı">
          <CalendarClock size={12} /> Ertele
        </button>
        <button onClick={onPersonel} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-2.5 py-2 rounded-lg text-[10px] font-bold transition" title="Personel ata">
          <Users size={12} />
        </button>
        <button onClick={onNot} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-2.5 py-2 rounded-lg text-[10px] font-bold transition" title="Not ekle">
          <GripVertical size={12} />
        </button>
        <button onClick={onKonum} className={`border px-2.5 py-2 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${kayit.lat ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-600"}`} title="Konum ekle / düzenle">
          <MapPin size={12} /> {kayit.lat ? "" : "Konum"}
        </button>
        {kayit.durum !== 'iptal' && (
          <button onClick={onIptal} className="bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 px-2.5 py-2 rounded-lg text-[10px] font-bold transition" title="İptal et (yer açılır)">
            <XCircle size={12} />
          </button>
        )}
        <button onClick={onSil} className="bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 text-slate-400 hover:text-red-500 px-2.5 py-2 rounded-lg text-[10px] font-bold transition" title="Kaydı sil">
          <Trash2 size={12} />
        </button>
        {kayit.ticket_id && (
          <a href="/admin" className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 px-2.5 py-2 rounded-lg text-[10px] font-bold transition" title="Operasyon Takibi'nde aç">
            <ExternalLink size={12} />
          </a>
        )}
      </div>

      {/* ERTELE PANELİ */}
      {tasimaAcik && (
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Yeni tarihe taşı</p>
          <div className="flex gap-2">
            <input type="date" value={tasimaTarih} onChange={(e) => setTasimaTarih(e.target.value)}
              className="flex-1 p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-400" />
            <button onClick={onTasiOnayla} className="bg-indigo-600 text-white px-3 py-2.5 rounded-lg text-[10px] font-black hover:bg-indigo-500 transition">TAŞI</button>
            <button onClick={onTasiVazgec} className="bg-white border border-slate-200 text-slate-500 px-3 py-2.5 rounded-lg text-[10px] font-bold">İptal</button>
          </div>
        </div>
      )}

      {/* PERSONEL PANELİ (çoklu seçim - genelde iki kişi gider) */}
      {personelAcik && (
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Personel ata</p>
          <p className="text-[10px] text-slate-400 font-medium mb-2">Birden fazla kişi seçebilirsin (genelde 2 personel gider).</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {PERSONEL_LISTESI.map((p) => {
              const secili = (personelSecim || []).includes(p);
              return (
                <button key={p} onClick={() => onPersonelToggle(p)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition flex items-center gap-1 ${secili ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                  {secili && <Check size={10} />} {p}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={onPersonelKaydet} className="bg-slate-900 text-white px-3 py-2 rounded-lg text-[10px] font-black hover:bg-slate-800 transition">
              KAYDET ({(personelSecim || []).length})
            </button>
            <button onClick={onPersonelVazgec} className="bg-white border border-slate-200 text-slate-500 px-3 py-2 rounded-lg text-[10px] font-bold">İptal</button>
          </div>
        </div>
      )}

      {/* KONUM PANELİ */}
      {konumAcik && (
        <div className="mt-3">
          <KoordinatGirisi lat={konumLat} lng={konumLng}
            onChange={(la, ln) => { setKonumLat(la); setKonumLng(ln); }} />
          <div className="flex gap-2 mt-2">
            <button onClick={konumKaydet} className="bg-slate-900 text-white px-3 py-2 rounded-lg text-[10px] font-black hover:bg-slate-800 transition">
              KONUMU KAYDET
            </button>
            <button onClick={konumVazgec} className="bg-white border border-slate-200 text-slate-500 px-3 py-2 rounded-lg text-[10px] font-bold">İptal</button>
          </div>
        </div>
      )}

      {/* NOT PANELİ */}
      {notAcik && (
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Yönetici notu</p>
          <textarea rows={2} value={notMetni} onChange={(e) => setNotMetni(e.target.value)} placeholder="Not yazın..."
            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs resize-none outline-none focus:border-indigo-400 mb-2" />
          <div className="flex gap-2">
            <button onClick={onNotKaydet} className="bg-slate-900 text-white px-3 py-2 rounded-lg text-[10px] font-black hover:bg-slate-800 transition">KAYDET</button>
            <button onClick={onNotVazgec} className="bg-white border border-slate-200 text-slate-500 px-3 py-2 rounded-lg text-[10px] font-bold">İptal</button>
          </div>
        </div>
      )}
    </div>
  );
}
