'use client';

// ============================================================================
//  🤖 AKILLI ANALİZ MERKEZİ — Foto AI + FİYAT MOTORU + Anomali Alarmı
// ----------------------------------------------------------------------------
//  Veri: fiyat_onerisi() · anomali_tara() · foto_analiz_gecmisi() · foto_analiz_kaydet()
//        fiyat_motoru_ayar() (208) · malzeme_fiyat_kitabi() (209) · offers
//  AI  : /api/foto-analiz (Gemini + yedek sağlayıcı zinciri)
//  Fiyat: /api/malzeme-fiyat
//         1) FİYAT KİTABI (209) → anında, ücretsiz, doğru (kaynak: KİTAP)
//         2) ÜCRETSİZ WEB (SearXNG · DuckDuckGo · Bing · n11 · Akakçe)
//            → medyan + KDV dönüşümü (kaynak: WEB)
//         3) AI tahmini YALNIZCA son çare (kaynak: TAHMİNİ)
//  İlke: her bölüm bağımsız, biri hata verse diğerleri çalışır
//  Para: bu ekrandaki TÜM tutarlar KDV HARİÇTİR
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { teklifHtml } from '@/lib/formHtml';
import { yazdirVeyaPaylas } from '@/lib/yazdirPaylas';
import {
  Sparkles, Loader2, RefreshCw, ArrowLeft, AlertTriangle, Camera,
  Calculator, TrendingUp, CheckCircle2, X, Upload, Shield, Clock,
  Package, Lightbulb, History, Zap,
  Plus, Trash2, Search, Percent, FileText, ExternalLink, Globe, Users, Truck,
  BookMarked, ChevronDown, ChevronUp, Save, Link2
} from 'lucide-react';

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
// Birim fiyatlar kuruşlu olabilir → en fazla 2 hane (tutarlar KDV hariç)
const para2 = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });


// Güvenli sayı: null / undefined / "" / NaN → varsayılan
const sayi = (n: any, varsayilan = 0) => {
  const v = Number(n);
  return Number.isFinite(v) ? v : varsayilan;
};
// Para hesabı için kuruşa yuvarla (tutarlar KDV hariç)
const kurus = (n: any) => Math.round(sayi(n) * 100) / 100;
// Güven yüzdesi → 0-100 arası tam sayı (bant genişliği NaN olmasın)
const yuzde = (n: any) => Math.max(0, Math.min(100, Math.round(sayi(n))));

// ----------------------------------------------------------------------------
//  💰 FİYAT MOTORU — SABİTLER / TİPLER
// ----------------------------------------------------------------------------
//  Tüm tutarlar KDV HARİÇ. Aciliyet, maliyet üzerine %25 çarpan olarak eklenir.
//  Personel saat ücreti: 208 → fiyat_motoru_ayar(), yoksa 96 →
//  eleman_saat_maliyeti(), o da yoksa aşağıdaki varsayılan (env ile değiştirilir).
// ----------------------------------------------------------------------------
const ACILLIK_ORANI = 0.25;          // acil iş → maliyet × 1.25
const MARJ_VARSAYILAN = 40;          // önerilen kâr marjı (%)
const MARJ_MIN = 0;
const MARJ_MAKS = 200;
const DUSUK_MARJ = 20;               // bunun altına düşünce uyarı
const SAAT_UCRETI_VARSAYILAN = (() => {
  const v = Number(process.env.NEXT_PUBLIC_PERSONEL_SAAT_UCRETI);
  return Number.isFinite(v) && v > 0 ? v : 345;   // ₺/saat (2 kişi × SGK dahil ort.)
})();
const KM_BIRIM_VARSAYILAN = (() => {
  const v = Number(process.env.NEXT_PUBLIC_KM_BIRIM);
  return Number.isFinite(v) && v > 0 ? v : 12;    // ₺/km
})();
const GUNLUK_SAAT = 8;               // "gün" seçilirse saat = gün × 8

/** Malzeme fiyatının kaynağı — KİTAP > WEB > TAHMİNİ */
type FiyatKaynagi = 'kitap' | 'web' | 'tahmini';

/** Ekranda "kaynaklar" açılır listesinde gösterilen tek kaynak */
type FiyatKaynakSatiri = {
  site: string;
  baslik: string;
  url: string | null;
  /** KDV hariç fiyat */
  fiyat: number;
  kaynak_adi?: string;
};

type MalzemeTipi = {
  id: string;
  ad: string;
  adet: number;
  /** KDV hariç birim fiyat — bulunamadıysa null (0 DEĞİL) */
  birim: number | null;
  kaynak: FiyatKaynagi | null;
  guven: number;
  bulundu: boolean;
  /** kullanıcı elle yazdı mı? */
  elle: boolean;
  not: string | null;
  /** web aramasında bulunan kaynaklar (site + başlık + link) */
  kaynaklar: FiyatKaynakSatiri[];
  /** KDV dönüşümü notu ("perakende fiyatı KDV hariçe çevrildi") */
  kdv_notu: string | null;
  /** en az 2 kaynak varsa aralık (KDV hariç) */
  min: number | null;
  maks: number | null;
  kaynak_sayisi: number;
  /** fiyat kitabından mı geldi (kaynak: kitap) */
  kitap_kaydi: { kaynak: string; guncelleme: string | null; kullanim: number } | null;
  /** "✔ Bu fiyatı kaydet" başarılı oldu mu */
  kaydedildi: boolean;
  /** kaynaklar listesi açık mı */
  acik: boolean;
};

type DigerTuru = { id: string; ad: string; tutar: number | null };

const yeniId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const bosMalzeme = (): MalzemeTipi => ({
  id: yeniId(), ad: '', adet: 1, birim: null, kaynak: null,
  guven: 0, bulundu: false, elle: false, not: null,
  kaynaklar: [], kdv_notu: null, min: null, maks: null, kaynak_sayisi: 0,
  kitap_kaydi: null, kaydedildi: false, acik: false,
});
const bosDiger = (): DigerTuru => ({ id: yeniId(), ad: '', tutar: null });

/** Malzeme adı eşleştirme anahtarı (Türkçe harf/noktalama farkını yok sayar) */
const adAnahtar = (s: any) =>
  String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');

/**
 * Kaynak rozeti — KİTAP / WEB / TAHMİNİ / ELLE / FİYAT YOK
 * KİTAP = daha önce bulunup saklanmış gerçek fiyat (en güvenilir)
 * WEB   = ücretsiz kaynaklardan yeni bulundu (kaynak listesi açılır)
 * TAHMİNİ = AI tahmini (gerçek kaynak YOK — güvenmeyin)
 */
function KaynakRozet({ kaynak, guven, elle, bulundu, etiket }: {
  kaynak: FiyatKaynagi | null; guven: number; elle: boolean; bulundu: boolean; etiket?: string;
}) {
  if (etiket) {
    return (
      <span className="text-[8px] font-black px-1.5 py-0.5 rounded border bg-slate-100 text-slate-600 border-slate-200 whitespace-nowrap">
        {etiket}
      </span>
    );
  }
  if (!bulundu) {
    return (
      <span className="text-[8px] font-black px-1.5 py-0.5 rounded border bg-rose-50 text-rose-600 border-rose-200 whitespace-nowrap">
        FİYAT YOK
      </span>
    );
  }
  if (elle) {
    return (
      <span className="text-[8px] font-black px-1.5 py-0.5 rounded border bg-slate-100 text-slate-600 border-slate-200 whitespace-nowrap">
        ELLE
      </span>
    );
  }
  if (kaynak === 'kitap') {
    return (
      <span className="text-[8px] font-black px-1.5 py-0.5 rounded border bg-violet-50 text-violet-700 border-violet-200 whitespace-nowrap inline-flex items-center gap-0.5">
        <BookMarked size={8} /> KİTAP
      </span>
    );
  }
  if (kaynak === 'web') {
    return (
      <span className="text-[8px] font-black px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap inline-flex items-center gap-0.5">
        <Globe size={8} /> WEB
      </span>
    );
  }
  return (
    <span className="text-[8px] font-black px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200 whitespace-nowrap">
      TAHMİNİ %{yuzde(guven)}
    </span>
  );
}

const ACILLIK_RENK: Record<string, string> = {
  'KRİTİK': 'bg-rose-100 text-rose-700 border-rose-300',
  'YÜKSEK': 'bg-orange-100 text-orange-700 border-orange-300',
  'ORTA': 'bg-amber-100 text-amber-700 border-amber-300',
  'DÜŞÜK': 'bg-emerald-100 text-emerald-700 border-emerald-300',
};

// ----------------------------------------------------------------------------
//  FOTOĞRAF HAZIRLAMA
// ----------------------------------------------------------------------------
//  Telefon fotoğrafları 3-10 MB olabiliyor; base64'e çevrilince ~%33 büyüyor
//  ve Vercel'in ~4.5 MB istek gövdesi sınırına takılıyordu (ANALİZ ET çalışmıyordu).
//  Bu yüzden büyük görseller gönderilmeden ÖNCE tarayıcıda küçültülür.
// ----------------------------------------------------------------------------
const KUCULT_ESIK = 1_400_000; // bundan büyük data-URL küçültülür (~1 MB dosya)
const UST_SINIR = 4_200_000;   // sunucuya gönderilebilecek en büyük data-URL
const EN_FAZLA_KENAR = 1600;   // küçültmede en uzun kenar (px)

function dosyaOku(dosya: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const okuyucu = new FileReader();
    okuyucu.onload = () => resolve(String(okuyucu.result || ''));
    okuyucu.onerror = () => reject(new Error('Fotoğraf okunamadı.'));
    okuyucu.readAsDataURL(dosya);
  });
}

function gorselYukle(veriUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Fotoğraf açılamadı.'));
    img.src = veriUrl;
  });
}

async function gorseliKucult(veriUrl: string): Promise<string> {
  const img = await gorselYukle(veriUrl);
  const kenar = Math.max(img.width || 0, img.height || 0);
  if (!kenar) return veriUrl;
  const oran = Math.min(1, EN_FAZLA_KENAR / kenar);
  const g = Math.max(1, Math.round((img.width || kenar) * oran));
  const y = Math.max(1, Math.round((img.height || kenar) * oran));
  const tuval = document.createElement('canvas');
  tuval.width = g;
  tuval.height = y;
  const ctx = tuval.getContext('2d');
  if (!ctx) return veriUrl;
  ctx.drawImage(img, 0, 0, g, y);
  const kucuk = tuval.toDataURL('image/jpeg', 0.82);
  return kucuk.length < veriUrl.length ? kucuk : veriUrl;
}

type MesajTuru = 'hata' | 'uyari' | 'basari';

export default function AkilliAnalizPage() {
  const dosyaRef = useRef<HTMLInputElement>(null);
  const [sekme, setSekme] = useState<'foto' | 'fiyat' | 'anomali'>('foto');
  const [onizleme, setOnizleme] = useState<string | null>(null);
  const [fotoYuk, setFotoYuk] = useState(false);
  const [analiz, setAnaliz] = useState<any>(null);
  const [analizYuk, setAnalizYuk] = useState(false);
  const [mesaj, setMesaj] = useState<{ tur: MesajTuru; metin: string } | null>(null);
  const [musteri, setMusteri] = useState('');
  const [notr, setNotr] = useState('');

  // ─── FİYAT MOTORU GİRDİLERİ (tutarlar KDV hariç) ───
  const [fIsTipi, setFIsTipi] = useState('');
  const [fMusteri, setFMusteri] = useState('');
  const [fMesafe, setFMesafe] = useState('');
  const [fAcil, setFAcil] = useState(false);

  const [malzemeler, setMalzemeler] = useState<MalzemeTipi[]>(() => [bosMalzeme()]);
  const [digerler, setDigerler] = useState<DigerTuru[]>([]);

  const [teknisyen, setTeknisyen] = useState(2);
  const [sureTuru, setSureTuru] = useState<'saat' | 'gun'>('saat');
  const [sure, setSure] = useState(3);
  const [saatUcreti, setSaatUcreti] = useState(SAAT_UCRETI_VARSAYILAN);
  const [saatUcretiKaynak, setSaatUcretiKaynak] = useState<'ayar' | 'varsayilan' | 'elle'>('varsayilan');
  const [kmBirim, setKmBirim] = useState(KM_BIRIM_VARSAYILAN);

  const [marj, setMarj] = useState(MARJ_VARSAYILAN);
  const [marjElle, setMarjElle] = useState(false);

  const [fiyatYuk, setFiyatYuk] = useState(false);
  const [fiyatUyari, setFiyatUyari] = useState<string | null>(null);
  /** Araştırma özeti: "Kitaptan 2 · webden 1 · AI tahmini 0 · 3.4 sn" */
  const [fiyatOzet, setFiyatOzet] = useState<string | null>(null);
  const [referans, setReferans] = useState<any>(null);
  const [musteriListe, setMusteriListe] = useState<string[]>([]);
  const [teklifYuk, setTeklifYuk] = useState(false);
  const [olusanTeklif, setOlusanTeklif] = useState<{ id: string; kod: string } | null>(null);

  // Anomali
  const [anomali, setAnomali] = useState<any>(null);
  const [anomaliYuk, setAnomaliYuk] = useState(true);
  const [anomaliHata, setAnomaliHata] = useState<string | null>(null);

  // Geçmiş
  const [gecmis, setGecmis] = useState<any[]>([]);
  const [gecmisYuk, setGecmisYuk] = useState(true);
  const [gecmisHata, setGecmisHata] = useState<string | null>(null);

  const mesajYaz = (metin: string, tur: MesajTuru = 'hata') => setMesaj({ tur, metin });

  const gecmisGetir = useCallback(async () => {
    setGecmisYuk(true);
    try {
      const { data, error } = await supabase.rpc('foto_analiz_gecmisi', { p_limit: 20 });
      if (error) {
        setGecmisHata(error.message);
        setGecmis([]);
        return;
      }
      setGecmisHata(null);
      setGecmis(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setGecmisHata(e?.message || 'Geçmiş okunamadı.');
      setGecmis([]);
    } finally {
      setGecmisYuk(false);
    }
  }, []);

  const anomaliGetir = useCallback(async () => {
    setAnomaliYuk(true);
    setAnomaliHata(null);
    try {
      const { data, error } = await supabase.rpc('anomali_tara');
      if (error) {
        // Hata durumunda "anomali yok" DEME — yanlış güven verir
        setAnomali(null);
        setAnomaliHata(error.message);
        return;
      }
      if (!data || typeof data !== 'object') {
        setAnomali(null);
        setAnomaliHata('Tarama boş sonuç döndü.');
        return;
      }
      setAnomali(data);
    } catch (e: any) {
      setAnomali(null);
      setAnomaliHata(e?.message || 'Tarama yapılamadı.');
    } finally {
      setAnomaliYuk(false);
    }
  }, []);

  useEffect(() => { anomaliGetir(); gecmisGetir(); }, [anomaliGetir, gecmisGetir]);

  // ══════════════════════════════════════════════════════════════════════
  //  💰 FİYAT MOTORU — AYARLAR / MÜŞTERİ ÖNERİLERİ
  // ══════════════════════════════════════════════════════════════════════
  //  Personel saat ücreti üç kademede okunur:
  //    1) fiyat_motoru_ayar()  → 208 SQL (tek çağrı, maaş + SGK + km)
  //    2) eleman_saat_maliyeti() / maliyet_ayar() → 96 SQL (eski kurulum)
  //    3) varsayılan (NEXT_PUBLIC_PERSONEL_SAAT_UCRETI / NEXT_PUBLIC_KM_BIRIM)
  //  Hiçbirinde çökmez; ekranda hangi kaynağın kullanıldığı yazar.
  // ══════════════════════════════════════════════════════════════════════
  const ayarlariGetir = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('fiyat_motoru_ayar');
      if (!error && data && typeof data === 'object') {
        const ucret = Number((data as any).saat_ucreti);
        const km = Number((data as any).km_birim);
        if (ucret > 0) { setSaatUcreti(kurus(ucret)); setSaatUcretiKaynak('ayar'); }
        if (km > 0) setKmBirim(kurus(km));
        return;
      }
    } catch { /* 208 çalıştırılmamış olabilir → eski fonksiyonlar */ }

    try {
      const { data } = await supabase.rpc('eleman_saat_maliyeti', {});
      const ucret = Number(data);
      if (ucret > 0) { setSaatUcreti(kurus(ucret)); setSaatUcretiKaynak('ayar'); }
    } catch { /* yoksay */ }

    try {
      const { data } = await supabase.rpc('maliyet_ayar');
      const km = Number((data as any)?.km_birim);
      if (km > 0) setKmBirim(kurus(km));
    } catch { /* yoksay */ }
  }, []);

  // Müşteri autocomplete: portal hesapları + geçmiş teklifler (cranes'e dokunulmaz)
  const musterileriGetir = useCallback(async () => {
    try {
      const [hesaplar, teklifler] = await Promise.all([
        supabase.from('musteri_hesaplar').select('firma_adi').limit(400),
        supabase.from('offers').select('customer_name').limit(400),
      ]);
      const kume = new Set<string>();
      (hesaplar.data || []).forEach((r: any) => {
        const a = String(r?.firma_adi || '').trim();
        if (a) kume.add(a);
      });
      (teklifler.data || []).forEach((r: any) => {
        const a = String(r?.customer_name || '').trim();
        if (a) kume.add(a);
      });
      setMusteriListe(Array.from(kume).sort((a, b) => a.localeCompare(b, 'tr')).slice(0, 300));
    } catch { /* autocomplete opsiyonel — hata ekrana basılmaz */ }
  }, []);

  useEffect(() => { ayarlariGetir(); musterileriGetir(); }, [ayarlariGetir, musterileriGetir]);

  // ─── HESAP (tamamı client-side → marj değişince ANINDA güncellenir) ───
  const hesaplar = useMemo(() => {
    const malzemeToplam = malzemeler.reduce(
      (t, m) => t + Math.max(0, sayi(m.adet, 0)) * Math.max(0, sayi(m.birim, 0)),
      0
    );
    const sureSaat = sureTuru === 'gun' ? Math.max(0, sayi(sure)) * GUNLUK_SAAT : Math.max(0, sayi(sure));
    const teknisyenSayi = Math.max(0, sayi(teknisyen));
    const iscilik = teknisyenSayi * sureSaat * Math.max(0, sayi(saatUcreti));
    const km = Math.max(0, sayi(fMesafe));
    const yol = km * Math.max(0, sayi(kmBirim));
    const digerToplam = digerler.reduce((t, d) => t + Math.max(0, sayi(d.tutar)), 0);

    const araMaliyet = malzemeToplam + iscilik + yol + digerToplam;
    const aciliyetTutar = fAcil ? araMaliyet * ACILLIK_ORANI : 0;
    const maliyet = araMaliyet + aciliyetTutar;
    const marjYuzde = Math.max(MARJ_MIN, Math.min(MARJ_MAKS, sayi(marj)));
    const kar = maliyet * (marjYuzde / 100);
    const satis = maliyet + kar;

    return {
      malzemeToplam: kurus(malzemeToplam),
      iscilik: kurus(iscilik),
      yol: kurus(yol),
      digerToplam: kurus(digerToplam),
      araMaliyet: kurus(araMaliyet),
      aciliyetTutar: kurus(aciliyetTutar),
      maliyet: kurus(maliyet),
      kar: kurus(kar),
      satis: kurus(satis),
      sureSaat: kurus(sureSaat),
      teknisyenSayi,
      km,
      marjYuzde,
      malzemeKalem: malzemeler.filter((m) => m.ad.trim() && sayi(m.birim) > 0).length,
      digerKalem: digerler.filter((d) => d.ad.trim() && sayi(d.tutar) > 0).length,
    };
  }, [malzemeler, digerler, teknisyen, sureTuru, sure, saatUcreti, fMesafe, kmBirim, fAcil, marj]);

  // Önerilen marj: geçmiş işlerin tahmini kâr oranı (fiyat_onerisi) → yoksa %40
  const onerilenMarj = useMemo(() => {
    const onerilen = Number(referans?.tahmini_kar_orani);
    const taban = Number.isFinite(onerilen) && onerilen >= 5 && onerilen <= 120
      ? Math.round(onerilen)
      : MARJ_VARSAYILAN;
    return Math.max(10, Math.min(120, taban));
  }, [referans]);

  // ─── MALZEME / DİĞER GİDER SATIR İŞLEMLERİ ───
  const malzemeEkle = () => setMalzemeler((p) => (p.length >= 24 ? p : [...p, bosMalzeme()]));
  const malzemeSil = (id: string) =>
    setMalzemeler((p) => (p.length <= 1 ? p.map((m) => (m.id === id ? bosMalzeme() : m)) : p.filter((m) => m.id !== id)));
  const malzemeAlan = (id: string, alan: 'ad' | 'adet', deger: any) =>
    setMalzemeler((p) => p.map((m) => (m.id === id ? { ...m, [alan]: deger } : m)));
  // Elle fiyat girişi → kaynak "elle", satır bulundu sayılır
  const malzemeFiyat = (id: string, ham: string) =>
    setMalzemeler((p) => p.map((m) => {
      if (m.id !== id) return m;
      if (ham.trim() === '') {
        return { ...m, birim: null, bulundu: false, elle: false, kaynak: null, guven: 0, kaydedildi: false };
      }
      const deger = Math.max(0, sayi(ham));
      return { ...m, birim: kurus(deger), bulundu: deger > 0, elle: true, kaydedildi: false };
    }));

  /** Satırdaki kaynak listesini aç/kapat */
  const kaynakAc = (id: string) =>
    setMalzemeler((p) => p.map((m) => (m.id === id ? { ...m, acik: !m.acik } : m)));

  // ─── "✔ BU FİYATI KAYDET" → fiyat kitabına yaz (öğrenen sistem) ───
  const [kaydetYuk, setKaydetYuk] = useState<string | null>(null);
  const fiyatKaydet = async (m: MalzemeTipi) => {
    const ad = m.ad.trim();
    const birim = kurus(sayi(m.birim));
    if (ad.length < 2) { mesajYaz('Kaydetmek için malzeme adı gerekli.', 'uyari'); return; }
    if (!(birim > 0)) { mesajYaz('Kaydetmek için birim fiyat girin (KDV hariç).', 'uyari'); return; }

    setKaydetYuk(m.id);
    try {
      const { data: oturum } = await supabase.auth.getSession();
      const token = oturum?.session?.access_token;
      const yanit = await fetch('/api/malzeme-fiyat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'kaydet',
          ad,
          birim_fiyat: birim,
          kaynak: m.elle ? 'elle' : (m.kaynak === 'kitap' ? 'kitap' : 'web'),
          kaynak_url: m.kaynaklar[0]?.url || null,
        }),
      });

      let sonuc: any = null;
      try { sonuc = await yanit.json(); } catch { sonuc = null; }

      if (!yanit.ok || !sonuc?.ok) {
        mesajYaz(sonuc?.mesaj || 'Fiyat kaydedilemedi (fiyat kitabı tablosu 209 çalıştırılmış olmalı).');
        return;
      }

      setMalzemeler((p) => p.map((x) => (
        x.id === m.id
          ? { ...x, kaynak: 'kitap', elle: false, guven: 92, kaydedildi: true, not: 'Fiyat kitabına kaydedildi — sonraki aramalarda bu fiyat kullanılacak (KDV hariç)' }
          : x
      )));
      mesajYaz(`✅ "${ad}" fiyatı kitaba kaydedildi (KDV hariç ${para2(birim)} ₺).`, 'basari');
    } catch (e: any) {
      mesajYaz('Fiyat kaydedilemedi: ' + (e?.message || 'bağlantı hatası'));
    } finally {
      setKaydetYuk(null);
    }
  };

  const digerEkle = () => setDigerler((p) => [...p, bosDiger()]);
  const digerSil = (id: string) => setDigerler((p) => p.filter((d) => d.id !== id));
  const digerAlan = (id: string, alan: 'ad' | 'tutar', deger: any) =>
    setDigerler((p) => p.map((d) => (d.id === id ? { ...d, [alan]: deger } : d)));

  // ─── MALZEME FİYAT ARAŞTIRMASI (AI · satırlar sunucuda PARALEL) ───
  const fiyatArastir = async () => {
    const temiz = malzemeler
      .map((m) => ({ id: m.id, ad: m.ad.trim(), adet: Math.max(1, Math.round(sayi(m.adet, 1))) }))
      .filter((m) => m.ad.length > 1);

    if (temiz.length === 0) {
      mesajYaz('Fiyat araştırmak için en az bir malzeme adı yazın (en az 2 karakter).', 'uyari');
      return;
    }

    setFiyatYuk(true);
    setMesaj(null);
    setFiyatUyari(null);

    // Sunucu 38 sn'de kendini durdurur; ekran 40 sn'de keser
    const denetleyici = new AbortController();
    const zamanAsimi = setTimeout(() => denetleyici.abort(), 40_000);

    try {
      const { data: oturum } = await supabase.auth.getSession();
      const token = oturum?.session?.access_token;

      // Geçmiş işlerin medyanı (mevcut fiyat_onerisi) — malzemeden BAĞIMSIZ,
      // hata verse de akış devam eder (yalnızca referans kutusu boş kalır).
      const referansSozu = (async () => {
        try {
          const { data } = await supabase.rpc('fiyat_onerisi', {
            p_is_tipi: fIsTipi.trim() || null,
            p_musteri: fMusteri.trim() || null,
            p_mesafe_km: Math.max(0, sayi(fMesafe)),
            p_acil: fAcil,
          });
          return data;
        } catch { return null; }
      })();

      const yanit = await fetch('/api/malzeme-fiyat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          malzemeler: temiz.map((m) => ({ ad: m.ad, adet: m.adet })),
          is_tipi: fIsTipi.trim() || null,
          musteri: fMusteri.trim() || null,
        }),
        signal: denetleyici.signal,
      });

      let sonuc: any = null;
      try { sonuc = await yanit.json(); } catch { sonuc = null; }

      const ref = await referansSozu;
      if (ref && typeof ref === 'object') {
        setReferans(ref);
        const refMarj = Number((ref as any).tahmini_kar_orani);
        if (!marjElle && Number.isFinite(refMarj) && refMarj >= 5 && refMarj <= 120) {
          setMarj(Math.max(10, Math.min(120, Math.round(refMarj))));
        }
      }

      if (!yanit.ok || !sonuc?.ok) {
        const mesaj = sonuc?.mesaj || `Fiyat araştırması yapılamadı (sunucu ${yanit.status}).`;
        setFiyatUyari(mesaj + ' Fiyatları elle girebilirsiniz.');
        setMalzemeler((prev) => prev.map((m) => (
          temiz.some((t) => t.id === m.id)
            ? {
                ...m, birim: null, kaynak: null, guven: 0, bulundu: false, elle: false,
                not: null, kaynaklar: [], kdv_notu: null, min: null, maks: null,
                kaynak_sayisi: 0, kitap_kaydi: null, kaydedildi: false,
              }
            : m
        )));
        return;
      }

      const gelen: any[] = Array.isArray(sonuc.satirlar) ? sonuc.satirlar : [];
      setMalzemeler((prev) => prev.map((m) => {
        const idx = temiz.findIndex((t) => t.id === m.id);
        if (idx < 0) return m;
        // Sıra korunur; kayma olursa ada göre eşleştir
        const siradaki = gelen[idx];
        const g = siradaki && adAnahtar(siradaki.ad) === adAnahtar(m.ad)
          ? siradaki
          : (gelen.find((x) => adAnahtar(x?.ad) === adAnahtar(m.ad)) || siradaki);
        if (!g) {
          return {
            ...m, birim: null, kaynak: null, guven: 0, bulundu: false, elle: false,
            not: null, kaynaklar: [], kdv_notu: null, min: null, maks: null,
            kaynak_sayisi: 0, kitap_kaydi: null, kaydedildi: false,
          };
        }

        const birim = Number(g.birim_fiyat);
        const bulundu = Boolean(g.bulundu) && Number.isFinite(birim) && birim > 0;
        const kaynak: FiyatKaynagi | null = bulundu
          ? (g.kaynak === 'kitap' ? 'kitap' : g.kaynak === 'web' ? 'web' : 'tahmini')
          : null;

        return {
          ...m,
          birim: bulundu ? kurus(birim) : null,
          kaynak,
          guven: sayi(g.guven),
          bulundu,
          elle: false,
          not: g.kaynak_notu ? String(g.kaynak_notu) : null,
          kaynaklar: Array.isArray(g.kaynaklar)
            ? g.kaynaklar.slice(0, 3).map((k: any) => ({
                site: String(k?.site || 'kaynak'),
                baslik: String(k?.baslik || ''),
                url: k?.url ? String(k.url) : null,
                fiyat: kurus(sayi(k?.fiyat)),
                kaynak_adi: k?.kaynak_adi ? String(k.kaynak_adi) : undefined,
              }))
            : [],
          kdv_notu: g.kdv_notu ? String(g.kdv_notu) : null,
          min: g.min === null || g.min === undefined ? null : kurus(sayi(g.min)),
          maks: g.maks === null || g.maks === undefined ? null : kurus(sayi(g.maks)),
          kaynak_sayisi: sayi(g.kaynak_sayisi),
          kitap_kaydi: g.kitap_kaydi && typeof g.kitap_kaydi === 'object'
            ? {
                kaynak: String(g.kitap_kaydi.kaynak || ''),
                guncelleme: g.kitap_kaydi.guncelleme ? String(g.kitap_kaydi.guncelleme) : null,
                kullanim: sayi(g.kitap_kaydi.kullanim),
              }
            : null,
          kaydedildi: false,
          acik: false,
        };
      }));

      // Özet satırı: kitap / web / tahmini kaç satır, web'de hangi kaynaklar cevap verdi
      const kb = sayi(sonuc?.kitap?.bulunan);
      const wb = sayi(sonuc?.web?.bulunan);
      const ai = sayi(sonuc?.ai?.satir);
      const cevaplayan = Array.isArray(sonuc?.web?.cevap_veren) ? sonuc.web.cevap_veren.join(', ') : '';
      const yazilan = sayi(sonuc?.kitap?.yazilan);
      setFiyatOzet([
        `Kitaptan ${kb} · webden ${wb} · AI tahmini ${ai}`,
        yazilan > 0 ? `${yazilan} fiyat kitaba öğrenildi` : '',
        cevaplayan ? `cevap veren: ${cevaplayan}` : '',
        `${(sayi(sonuc?.sure_ms) / 1000).toFixed(1)} sn · tüm tutarlar KDV hariç`,
      ].filter(Boolean).join(' · '));

      if (sonuc.uyari) setFiyatUyari(String(sonuc.uyari));
      else if (ai > 0) {
        setFiyatUyari('Bazı satırlar gerçek kaynak bulunamadığı için TAHMİNİ fiyatla doldu (KDV hariç) — kullanmadan önce doğrulayın.');
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setFiyatUyari('Fiyat araştırması 40 saniyede tamamlanmadı. Tekrar deneyin veya fiyatları elle girin.');
      } else {
        setFiyatUyari('Bağlantı hatası: ' + (e?.message || 'bilinmeyen') + ' — fiyatları elle girebilirsiniz.');
      }
    } finally {
      clearTimeout(zamanAsimi);
      setFiyatYuk(false);
    }
  };

  // ─── PDF KALEMLERİ (aynı teklif şablonu kullanılır) ───
  //  Kalemler MALİYET (KDV hariç) olarak yazılır; şablonun altında ARA TOPLAM,
  //  KÂR MARJI ve GENEL TOPLAM satırları görünür (lib/formHtml.ts → teklifHtml).
  const pdfKalemleri = (): any[] => {
    const liste: any[] = [];

    malzemeler.forEach((m) => {
      const ad = m.ad.trim();
      const birim = Math.max(0, sayi(m.birim));
      if (!ad || birim <= 0) return;
      const adet = Math.max(1, Math.round(sayi(m.adet, 1)));
      const kaynakNotu = m.elle
        ? 'Elle girilen fiyat (KDV hariç)'
        : m.kaynak === 'kitap'
          ? 'Fiyat kitabı — doğrulanmış fiyat (KDV hariç)'
          : m.kaynak === 'web'
            ? 'Ücretsiz web fiyat araştırması (KDV hariç)'
            : 'TAHMİNİ fiyat — kaynak yok (KDV hariç)';
      liste.push({
        ad,
        detay: m.not ? `${kaynakNotu} · ${m.not}` : kaynakNotu,
        adet,
        birim_fiyat: kurus(birim),
        toplam: kurus(birim * adet),
      });
    });

    if (hesaplar.iscilik > 0) {
      liste.push({
        ad: 'İşçilik',
        detay: `${hesaplar.teknisyenSayi} teknisyen × ${para2(hesaplar.sureSaat)} saat × ${para2(saatUcreti)} ₺/saat (KDV hariç)`,
        adet: 1,
        birim_fiyat: hesaplar.iscilik,
        toplam: hesaplar.iscilik,
      });
    }

    if (hesaplar.yol > 0) {
      liste.push({
        ad: 'Yol / Ulaşım',
        detay: `${para2(hesaplar.km)} km × ${para2(kmBirim)} ₺/km (KDV hariç)`,
        adet: 1,
        birim_fiyat: hesaplar.yol,
        toplam: hesaplar.yol,
      });
    }

    digerler.forEach((d) => {
      const ad = d.ad.trim();
      const tutar = Math.max(0, sayi(d.tutar));
      if (!ad || tutar <= 0) return;
      liste.push({
        ad,
        detay: 'Diğer gider (KDV hariç)',
        adet: 1,
        birim_fiyat: kurus(tutar),
        toplam: kurus(tutar),
      });
    });

    if (hesaplar.aciliyetTutar > 0) {
      liste.push({
        ad: 'Aciliyet zammı (%25)',
        detay: 'Acil iş çarpanı (KDV hariç)',
        adet: 1,
        birim_fiyat: hesaplar.aciliyetTutar,
        toplam: hesaplar.aciliyetTutar,
      });
    }

    return liste;
  };

  /** DB'ye yazılacak teklif alanları — mevcut "teklifler" ekranıyla AYNI isimler */
  const teklifTemel = () => {
    const bugun = new Date().toISOString().slice(0, 10);
    const gecerlilik = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
    const notlar = [
      'Tüm tutarlar KDV hariçtir.',
      `Teklif ${gecerlilik.split('-').reverse().join('.')} tarihine kadar geçerlidir.`,
      `Kapsam: ${fIsTipi.trim() || 'Vinç servis / bakım'}${hesaplar.km > 0 ? ` · ${para2(hesaplar.km)} km mesafe` : ''}${fAcil ? ' · ACİL İŞ' : ''}.`,
      `Maliyet dökümü (KDV hariç): malzeme ${para2(hesaplar.malzemeToplam)} ₺ + işçilik ${para2(hesaplar.iscilik)} ₺ + yol ${para2(hesaplar.yol)} ₺ + diğer ${para2(hesaplar.digerToplam)} ₺${hesaplar.aciliyetTutar > 0 ? ` + aciliyet ${para2(hesaplar.aciliyetTutar)} ₺` : ''} = ${para2(hesaplar.maliyet)} ₺.`,
      `Uygulanan kâr marjı: %${para2(marj)}.`,
    ].join('\n');

    return {
      customer_name: fMusteri.trim(),
      offer_date: bugun,
      valid_until: gecerlilik,
      template_type: 'standart',
      description: notlar,
      items: pdfKalemleri(),
      total_price: Math.round(hesaplar.satis),
      final_price: Math.round(hesaplar.satis),
      status: 'beklemede',
      kar_marji: kurus(marj),
      maliyet_detay: {
        kdv_haric: true,
        malzeme: hesaplar.malzemeToplam,
        iscilik: hesaplar.iscilik,
        yol: hesaplar.yol,
        diger: hesaplar.digerToplam,
        aciliyet: hesaplar.aciliyetTutar,
        maliyet: hesaplar.maliyet,
        kar: hesaplar.kar,
        satis: hesaplar.satis,
        kar_marji: kurus(marj),
        teknisyen: hesaplar.teknisyenSayi,
        sure_saat: hesaplar.sureSaat,
        saat_ucreti: kurus(saatUcreti),
        km: hesaplar.km,
        km_birim: kurus(kmBirim),
        kaynaklar: {
          kitap: malzemeler.filter((m) => m.kaynak === 'kitap' && !m.elle && m.bulundu).length,
          web: malzemeler.filter((m) => m.kaynak === 'web' && !m.elle && m.bulundu).length,
          tahmini: malzemeler.filter((m) => m.kaynak === 'tahmini' && !m.elle && m.bulundu).length,
          elle: malzemeler.filter((m) => m.elle && m.bulundu).length,
        },
      },
    };
  };

  /** PDF üret + indir (mevcut BUVİSAN teklif şablonu) */
  const pdfUret = async (kod?: string) => {
    const teklif = {
      ...teklifTemel(),
      teklif_no: kod || '',
      ara_toplam: Math.round(hesaplar.maliyet),
      kar_tutari: Math.round(hesaplar.kar),
    };
    const html = teklifHtml(teklif, teklif.items);
    return yazdirVeyaPaylas(html, {
      baslik: 'Fiyat Teklif Formu',
      dosyaAdi: 'teklif-' + String(kod || fMusteri || 'musteri').replace(/[^a-zA-Z0-9]+/g, '-'),
    });
  };

  // ─── TEKLİF OLUŞTUR → offers kaydı + PDF ───
  const teklifOlustur = async () => {
    if (!fMusteri.trim()) { mesajYaz('Teklif için müşteri adı gerekli.', 'uyari'); return; }

    const fiyatsiz = malzemeler.filter((m) => m.ad.trim() && sayi(m.birim) <= 0);
    if (fiyatsiz.length > 0) {
      mesajYaz(
        'Fiyatı girilmemiş malzeme var: ' + fiyatsiz.map((m) => m.ad.trim()).join(', ') +
        '. Fiyat girin veya satırı silin (0 ₺ yazılmaz).',
        'uyari'
      );
      return;
    }
    if (hesaplar.maliyet <= 0) {
      mesajYaz('Maliyet 0 ₺ görünüyor — malzeme, işçilik veya yol girin.', 'uyari');
      return;
    }

    setTeklifYuk(true);
    setMesaj(null);
    try {
      const paket: any = teklifTemel();
      const ekle = async (govde: any) => supabase.from('offers').insert([govde]).select('id').single();

      let cevap: any = await ekle(paket);
      // 208 çalıştırılmamışsa (kolon yok) temel alanlarla tekrar dene → teklif kaybolmaz
      if (cevap?.error && /column|sütun|schema|cache|kar_marji|maliyet_detay/i.test(String(cevap.error.message || ''))) {
        const temel: any = { ...paket };
        delete temel.kar_marji;
        delete temel.maliyet_detay;
        cevap = await ekle(temel);
      }
      if (cevap?.error) throw new Error(cevap.error.message || 'Teklif kaydedilemedi.');

      const id = String(cevap?.data?.id || '');
      const kod = id ? id.replace(/-/g, '').slice(0, 6).toUpperCase() : '';
      setOlusanTeklif({ id, kod: kod || '—' });

      const pdfSonuc = await pdfUret(kod);
      mesajYaz(
        `✅ Teklif #${kod || '—'} oluşturuldu (KDV hariç ${para(hesaplar.satis)} ₺).` +
        (pdfSonuc === 'hata' ? ' PDF oluşturulamadı — "PDF İNDİR" ile tekrar deneyin.' : ' PDF indirildi.'),
        'basari'
      );
      if (typeof window !== 'undefined') {
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* yoksay */ }
      }
    } catch (e: any) {
      mesajYaz('Teklif oluşturulamadı: ' + (e?.message || 'bilinmeyen hata'));
    } finally {
      setTeklifYuk(false);
    }
  };

  // ─── KALEM DÖKÜMÜ (sağ panel tablosu) ───
  const dokum = useMemo(() => {
    const satirlar: {
      ad: string; detay: string; adet: number | null; birim: number | null;
      toplam: number; kaynak: 'kitap' | 'web' | 'tahmini' | 'elle' | 'iscilik' | 'yol' | 'diger' | 'aciliyet';
      guven: number; etiket?: string;
    }[] = [];

    malzemeler.forEach((m) => {
      const ad = m.ad.trim();
      if (!ad) return;
      const birim = Math.max(0, sayi(m.birim));
      const adet = Math.max(1, Math.round(sayi(m.adet, 1)));
      satirlar.push({
        ad,
        detay: m.elle
          ? 'elle girildi'
          : m.kaynak === 'kitap'
            ? 'fiyat kitabı'
            : m.kaynak === 'web'
              ? `web araştırması${m.kaynak_sayisi > 1 ? ` (${m.kaynak_sayisi} kaynak)` : ''}`
              : m.bulundu ? 'AI tahmini' : 'fiyat bulunamadı',
        adet,
        birim: m.bulundu ? birim : null,
        toplam: kurus(birim * adet),
        kaynak: m.elle ? 'elle' : (m.kaynak || 'tahmini'),
        guven: sayi(m.guven),
      });
    });

    if (hesaplar.iscilik > 0) {
      satirlar.push({
        ad: 'İşçilik',
        detay: `${hesaplar.teknisyenSayi} tek. × ${para2(hesaplar.sureSaat)} saat × ${para2(saatUcreti)} ₺`,
        adet: null, birim: null, toplam: hesaplar.iscilik, kaynak: 'iscilik', guven: 100, etiket: 'PERSONEL',
      });
    }
    if (hesaplar.yol > 0) {
      satirlar.push({
        ad: 'Yol / Ulaşım',
        detay: `${para2(hesaplar.km)} km × ${para2(kmBirim)} ₺/km`,
        adet: null, birim: null, toplam: hesaplar.yol, kaynak: 'yol', guven: 100, etiket: 'MESAFE',
      });
    }
    digerler.forEach((d) => {
      const tutar = Math.max(0, sayi(d.tutar));
      if (!d.ad.trim() || tutar <= 0) return;
      satirlar.push({
        ad: d.ad.trim(), detay: 'diğer gider',
        adet: null, birim: null, toplam: kurus(tutar), kaynak: 'diger', guven: 100, etiket: 'ELLE',
      });
    });
    if (hesaplar.aciliyetTutar > 0) {
      satirlar.push({
        ad: 'Aciliyet zammı', detay: 'maliyet × 1,25',
        adet: null, birim: null, toplam: hesaplar.aciliyetTutar, kaynak: 'aciliyet', guven: 100, etiket: '×1,25',
      });
    }

    return satirlar;
  }, [malzemeler, digerler, hesaplar, saatUcreti, kmBirim]);


  // ─── FOTOĞRAF SEÇ ───
  const fotoSec = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    // Aynı fotoğraf ikinci kez seçilebilsin (value sıfırlanmazsa onChange tetiklenmez)
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { mesajYaz('Lütfen bir fotoğraf seçin.'); return; }

    setFotoYuk(true);
    setMesaj(null);
    setAnaliz(null);
    try {
      let url = await dosyaOku(f);
      if (url.length > KUCULT_ESIK) {
        try { url = await gorseliKucult(url); } catch { /* küçültme olmazsa ham veriyle devam */ }
      }
      if (url.length > UST_SINIR) {
        setOnizleme(null);
        mesajYaz('Fotoğraf çok büyük (' + (f.size / 1024 / 1024).toFixed(1) + ' MB). Daha düşük çözünürlükte çekmeyi dene.');
        return;
      }
      setOnizleme(url);
    } catch (err: any) {
      setOnizleme(null);
      mesajYaz(err?.message || 'Fotoğraf okunamadı.');
    } finally {
      setFotoYuk(false);
    }
  };

  // ─── AI ANALİZİ ───
  const analizEt = async () => {
    if (!onizleme) { mesajYaz('Önce fotoğraf seçin.'); return; }
    setAnalizYuk(true);
    setMesaj(null);
    // Sunucu tarafı 25 sn'de cevap verir; ağ/bağlantı takılırsa ekran sonsuza
    // kadar beklemesin diye istemci tarafında 30 sn'lik bir üst sınır var.
    const denetleyici = new AbortController();
    const zamanAsimi = setTimeout(() => denetleyici.abort(), 30_000);
    try {
      const { data: oturum } = await supabase.auth.getSession();
      const token = oturum?.session?.access_token;

      const yanit = await fetch('/api/foto-analiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          gorsel: onizleme,
          musteri: musteri.trim() || null,
          aciklama: notr.trim() || null,
        }),
        signal: denetleyici.signal,
      });

      // Sunucu JSON dışında bir şey dönerse (HTML hata sayfası vb.) patlamasın
      let sonuc: any = null;
      try { sonuc = await yanit.json(); } catch { sonuc = null; }

      if (!yanit.ok || !sonuc?.ok) {
        // API 403'te { hata }, 4xx/5xx'te { mesaj } döner → ikisini de göster
        mesajYaz(
          sonuc?.mesaj || sonuc?.hata || `Analiz yapılamadı (sunucu ${yanit.status}).`
        );
        return;
      }

      const a = sonuc.analiz;
      if (!a || typeof a !== 'object') {
        mesajYaz('Yapay zeka geçerli bir analiz döndürmedi. Tekrar dene.', 'uyari');
        return;
      }
      setAnaliz(a);

      // Sonucu veritabanına kaydet (geçmiş + doğruluk takibi)
      const { error: kayitHatasi } = await supabase.rpc('foto_analiz_kaydet', {
        p_musteri: musteri.trim() || 'Bilinmiyor',
        p_tespit: String(a.tespit || 'Tespit yapılamadı'),
        p_onerilen_parca: Array.isArray(a.parcalar) ? (a.parcalar.join(', ') || null) : null,
        p_guven: yuzde(a.guven),
        p_ai_notu: Array.isArray(a.oneriler) ? (a.oneriler.join(' | ') || null) : null,
      });
      if (kayitHatasi) {
        mesajYaz('Analiz tamamlandı ama geçmişe kaydedilemedi: ' + kayitHatasi.message, 'uyari');
      }
      await gecmisGetir();
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        mesajYaz('Analiz 30 saniyede tamamlanmadı. Fotoğraf büyük olabilir — tekrar deneyin.');
      } else {
        mesajYaz('Bağlantı hatası: ' + (e?.message || 'bilinmeyen'));
      }
    } finally {
      clearTimeout(zamanAsimi);
      setAnalizYuk(false);
    }
  };

  // ─── FOTO ANALİZİ (ekran) ───
  const analizGuven = yuzde(analiz?.guven);
  const aciliyet = analiz?.aciliyet || 'ORTA';

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8">

      {/* ÜST BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-slate-800 flex items-center gap-2.5">
            <Sparkles className="text-fuchsia-600" size={30} /> AKILLI ANALİZ
          </h1>
          <p className="text-slate-500 text-xs md:text-sm mt-0.5">
            Fotoğraftan arıza tespiti · fiyat motoru (malzeme + işçilik + kâr) · anomali alarmı
          </p>
        </div>
        <Link href="/admin" className="bg-slate-900 text-white px-4 py-3 rounded-2xl font-black text-xs flex items-center gap-2">
          <ArrowLeft size={15} /> PANEL
        </Link>
      </div>

      {mesaj && (
        <div className={`p-4 rounded-2xl text-xs font-bold mb-5 border ${
          mesaj.tur === 'basari' || mesaj.metin.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : mesaj.tur === 'uyari' ? 'bg-amber-50 text-amber-800 border-amber-200'
          : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{mesaj.metin}</div>
      )}

      {/* SEKMELER */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {[
          { k: 'foto', a: '📸 Fotoğraftan Arıza', i: <Camera size={14} /> },
          { k: 'fiyat', a: '💰 Fiyat Motoru', i: <Calculator size={14} /> },
          { k: 'anomali', a: `🚨 Anomali${sayi(anomali?.toplam) > 0 ? ` (${sayi(anomali?.toplam)})` : ''}`, i: <AlertTriangle size={14} /> },
        ].map((s) => (
          <button key={s.k} onClick={() => { setSekme(s.k as any); setMesaj(null); }}
            className={`px-4 py-3 rounded-2xl text-xs font-black border transition whitespace-nowrap flex items-center gap-2 ${
              sekme === s.k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>
            {s.i} {s.a}
          </button>
        ))}
      </div>

      {/* ═══════════ FOTOĞRAFTAN ARIZA ═══════════ */}
      {sekme === 'foto' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* SOL: FOTOĞRAF */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-fuchsia-600 to-purple-700 px-4 py-3">
              <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Camera size={15} /> FOTOĞRAF YÜKLE
              </p>
            </div>
            <div className="p-4 space-y-3">
              <input ref={dosyaRef} type="file" accept="image/*" capture="environment"
                onChange={fotoSec} className="hidden" />

              {fotoYuk ? (
                <div className="w-full h-52 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center gap-2 bg-slate-50">
                  <Loader2 size={28} className="text-slate-400 animate-spin" />
                  <p className="text-xs font-black text-slate-500">Fotoğraf hazırlanıyor...</p>
                </div>
              ) : onizleme ? (
                <div className="relative">
                  <img src={onizleme} alt="Arıza fotoğrafı"
                    className="w-full rounded-2xl border-2 border-slate-200 object-contain max-h-[340px] bg-slate-50" />
                  <button onClick={() => { setOnizleme(null); setAnaliz(null); setMesaj(null); }}
                    className="absolute top-2 right-2 bg-white/90 rounded-xl p-2 shadow-lg">
                    <X size={16} className="text-slate-600" />
                  </button>
                </div>
              ) : (
                <button onClick={() => dosyaRef.current?.click()}
                  className="w-full h-52 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center gap-2 hover:border-fuchsia-400 hover:bg-fuchsia-50/50 transition">
                  <Upload size={32} className="text-slate-300" />
                  <p className="text-xs font-black text-slate-500">Fotoğraf çek veya seç</p>
                  <p className="text-[10px] font-medium text-slate-400">Arızalı parçayı net göster</p>
                </button>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Müşteri</label>
                  <input type="text" value={musteri} onChange={(e) => setMusteri(e.target.value)}
                    placeholder="Örn: RB KARESİ"
                    className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-fuchsia-400" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Not (isteğe bağlı)</label>
                  <input type="text" value={notr} onChange={(e) => setNotr(e.target.value)}
                    placeholder="Örn: ses geliyor"
                    className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-fuchsia-400" />
                </div>
              </div>

              <button onClick={analizEt} disabled={analizYuk || fotoYuk || !onizleme}
                className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-slate-300 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98]">
                {analizYuk ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {analizYuk ? 'YAPAY ZEKA İNCELİYOR...' : 'ANALİZ ET'}
              </button>

              <p className="text-[9px] text-slate-400 font-medium text-center">
                Fotoğraf sunucuda <strong>saklanmaz</strong> · sadece analiz sonucu kaydedilir
              </p>
            </div>
          </div>

          {/* SAĞ: SONUÇ */}
          <div className="space-y-4">
            {analizYuk && (
              <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-fuchsia-500 mx-auto" />
                <p className="text-xs font-black text-slate-600 mt-3">Yapay zeka fotoğrafı inceliyor...</p>
                <p className="text-[10px] text-slate-400 font-medium mt-1">10-20 saniye sürebilir</p>
              </div>
            )}

            {analiz && !analizYuk && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3 flex items-center justify-between">
                  <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Sparkles size={15} /> YAPAY ZEKA SONUCU
                  </p>
                  <span className={`text-[10px] font-black px-2 py-1 rounded-lg border ${ACILLIK_RENK[aciliyet] || ACILLIK_RENK['ORTA']}`}>
                    {aciliyet}
                  </span>
                </div>

                <div className="p-4 space-y-4">
                  {/* TESPİT */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5">TESPİT</p>
                    <p className="text-sm font-bold text-slate-700 leading-relaxed bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                      {analiz.tespit || 'Tespit yapılamadı'}
                    </p>
                  </div>

                  {/* GÜVEN */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase">GÜVEN ORANI</span>
                      <span className={`text-sm font-black ${
                        analizGuven >= 70 ? 'text-emerald-600'
                        : analizGuven >= 40 ? 'text-amber-600' : 'text-rose-600'}`}>
                        %{analizGuven}
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${
                        analizGuven >= 70 ? 'bg-emerald-500'
                        : analizGuven >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        style={{ width: `${analizGuven}%` }} />
                    </div>
                    {analizGuven < 50 && (
                      <p className="text-[10px] font-bold text-amber-600 mt-1.5">
                        ⚠️ Güven düşük — daha net bir fotoğraf çekmeyi dene
                      </p>
                    )}
                  </div>

                  {/* PARÇALAR */}
                  {Array.isArray(analiz.parcalar) && analiz.parcalar.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                        <Package size={11} /> GEREKLİ PARÇALAR
                      </p>
                      <div className="space-y-1.5">
                        {analiz.parcalar.map((p: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                            <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                            <span className="text-[12px] font-bold text-emerald-800">{String(p)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SÜRE */}
                  {sayi(analiz.is_suresi_saat) > 0 && (
                    <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl p-3">
                      <Clock size={18} className="text-blue-600 shrink-0" />
                      <div>
                        <p className="text-[10px] font-black text-blue-600 uppercase">TAHMİNİ SÜRE</p>
                        <p className="text-sm font-black text-blue-800">{sayi(analiz.is_suresi_saat)} saat</p>
                      </div>
                    </div>
                  )}

                  {/* ÖNERİLER */}
                  {Array.isArray(analiz.oneriler) && analiz.oneriler.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                        <Lightbulb size={11} /> ÖNERİLER
                      </p>
                      <ul className="space-y-1">
                        {analiz.oneriler.map((o: any, i: number) => (
                          <li key={i} className="text-[11px] font-medium text-slate-600 flex items-start gap-2">
                            <span className="text-fuchsia-500 font-black">•</span> {String(o)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* GÜVENLİK */}
                  {analiz.guvenlik && (
                    <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-3.5">
                      <p className="text-[10px] font-black text-rose-600 uppercase flex items-center gap-1.5 mb-1">
                        <Shield size={12} /> İŞ GÜVENLİĞİ UYARISI
                      </p>
                      <p className="text-[12px] font-bold text-rose-800">{String(analiz.guvenlik)}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {!analiz && !analizYuk && (
              <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
                <Sparkles className="w-11 h-11 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-black text-slate-500">Fotoğraf yükle ve analiz et</p>
                <p className="text-[11px] text-slate-400 font-medium mt-1.5 leading-relaxed">
                  Yapay zeka arızayı tespit eder, gerekli parçayı söyler,<br />
                  tahmini süreyi ve güvenlik uyarısını verir.
                </p>
              </div>
            )}

            {/* GEÇMİŞ — her zaman görünür (yükleme / boş / hata durumu var) */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <History size={14} className="text-slate-400" />
                  <p className="text-[11px] font-black text-slate-600 uppercase tracking-wider">SON ANALİZLER</p>
                </div>
                {gecmis.length > 0 && (
                  <span className="text-[9px] font-black text-slate-400">{gecmis.length}</span>
                )}
              </div>

              {gecmisYuk ? (
                <div className="px-4 py-6 text-center">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-300 mx-auto" />
                  <p className="text-[10px] font-bold text-slate-400 mt-2">Geçmiş okunuyor...</p>
                </div>
              ) : gecmisHata ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-[11px] font-black text-rose-600">Geçmiş okunamadı</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-1 break-words">{gecmisHata}</p>
                  <button onClick={gecmisGetir} className="text-[10px] font-black text-slate-600 underline mt-2">
                    Tekrar dene
                  </button>
                </div>
              ) : gecmis.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-[11px] font-black text-slate-500">Henüz analiz yok</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">
                    İlk fotoğraf analizinden sonra kayıtlar burada listelenir.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50 max-h-56 overflow-y-auto">
                  {gecmis.slice(0, 6).map((g: any, i: number) => (
                    <div key={g?.id || i} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-black text-slate-700 truncate">{g?.musteri || 'Bilinmiyor'}</span>
                        <span className={`text-[9px] font-black shrink-0 ${
                          sayi(g?.guven) >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>%{yuzde(g?.guven)}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                        {g?.tespit || '—'}{g?.tarih ? ` · ${g.tarih}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ FİYAT MOTORU (eski "Fiyat Önerisi") ═══════════ */}
      {sekme === 'fiyat' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* ═════════ SOL: GİRDİLER ═════════ */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-3 flex items-center justify-between gap-2">
              <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Calculator size={15} /> FİYAT MOTORU · GİRDİLER
              </p>
              <span className="text-[9px] font-black text-emerald-50 bg-white/20 px-2 py-1 rounded-lg shrink-0">
                KDV HARİÇ
              </span>
            </div>

            <div className="p-4 space-y-4">
              {/* İŞ TİPİ + MÜŞTERİ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">İş Tipi</label>
                  <input type="text" value={fIsTipi} onChange={(e) => setFIsTipi(e.target.value)}
                    placeholder="Örn: Rulman, Fren, Bakım"
                    className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Müşteri</label>
                  <input type="text" list="akilli-musteriler" value={fMusteri}
                    onChange={(e) => setFMusteri(e.target.value)}
                    placeholder="Örn: RB KARESİ"
                    className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-emerald-400" />
                  <datalist id="akilli-musteriler">
                    {musteriListe.map((m) => <option key={m} value={m} />)}
                  </datalist>
                </div>
              </div>

              {/* MALZEME LİSTESİ */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Package size={12} /> Malzeme Listesi
                    <span className="text-slate-400">({hesaplar.malzemeKalem}/{malzemeler.length})</span>
                  </p>
                  <button onClick={malzemeEkle} disabled={malzemeler.length >= 24}
                    className="bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl text-[10px] font-black text-slate-600 flex items-center gap-1 hover:bg-slate-100 disabled:opacity-40">
                    <Plus size={11} /> SATIR
                  </button>
                </div>

                <div className="space-y-2">
                  {malzemeler.map((m, i) => (
                    <div key={m.id} className="bg-white rounded-xl border border-slate-200 p-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black text-slate-300 w-3 shrink-0">{i + 1}</span>
                        <input type="text" value={m.ad} onChange={(e) => malzemeAlan(m.id, 'ad', e.target.value)}
                          placeholder="Malzeme adı (ör. Rulman 6205)"
                          className="flex-1 min-w-0 p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-[12px] outline-none focus:border-emerald-400" />
                        <input type="number" min={1} max={999} value={m.adet}
                          onChange={(e) => malzemeAlan(m.id, 'adet', Math.max(1, Math.round(sayi(e.target.value, 1))))}
                          title="Adet"
                          className="w-14 shrink-0 p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-[12px] text-center outline-none focus:border-emerald-400" />
                        <button onClick={() => malzemeSil(m.id)} title="Satırı sil"
                          className="shrink-0 p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200">
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 mt-1.5 pl-4">
                        <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Birim</span>
                        <input type="number" min={0} step="0.01" value={m.birim ?? ''}
                          onChange={(e) => malzemeFiyat(m.id, e.target.value)}
                          placeholder="—"
                          className="w-24 p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-[11px] text-right outline-none focus:border-emerald-400" />
                        <span className="text-[9px] font-bold text-slate-400">₺ · KDV hariç</span>
                        <span className="ml-auto">
                          <KaynakRozet kaynak={m.kaynak} guven={m.guven} elle={m.elle} bulundu={m.bulundu} />
                        </span>
                      </div>

                      {/* KAYNAK DETAYI: web fiyatıysa açılır liste + KDV notu */}
                      {(m.kaynaklar.length > 0 || m.kdv_notu || m.kaynak_sayisi > 1) && (
                        <div className="mt-1 pl-4">
                          <div className="flex items-center flex-wrap gap-1.5">
                            {m.kaynaklar.length > 0 && (
                              <button onClick={() => kaynakAc(m.id)}
                                className="text-[9px] font-black text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg inline-flex items-center gap-1 hover:bg-blue-100">
                                <Link2 size={9} /> KAYNAKLAR ({m.kaynaklar.length})
                                {m.acik ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                              </button>
                            )}
                            {m.kaynak_sayisi > 1 && m.min !== null && m.maks !== null && (
                              <span className="text-[9px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg whitespace-nowrap">
                                {para2(m.min)} – {para2(m.maks)} ₺ · KDV hariç
                              </span>
                            )}
                            {m.kitap_kaydi && (
                              <span className="text-[9px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-1 rounded-lg whitespace-nowrap">
                                kitapta {m.kitap_kaydi.kullanim}× kullanıldı
                              </span>
                            )}
                          </div>

                          {m.acik && m.kaynaklar.length > 0 && (
                            <div className="mt-1 space-y-1">
                              {m.kaynaklar.map((k, ki) => (
                                <div key={ki} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[9px] font-black text-slate-600 truncate">{k.site}</span>
                                    <span className="text-[9px] font-black text-slate-800 shrink-0">
                                      {para2(k.fiyat)} ₺ <span className="text-slate-400 font-bold">KDV hariç</span>
                                    </span>
                                  </div>
                                  <p className="text-[8px] text-slate-500 font-medium truncate" title={k.baslik}>{k.baslik || '—'}</p>
                                  {k.url && (
                                    <a href={k.url} target="_blank" rel="noopener noreferrer"
                                      className="text-[8px] font-black text-blue-600 hover:underline inline-flex items-center gap-0.5 mt-0.5">
                                      kaynağı aç <ExternalLink size={8} />
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {m.kdv_notu && (
                            <p className="text-[8px] text-amber-700 font-bold mt-1 leading-relaxed">
                              ⓘ {m.kdv_notu}
                            </p>
                          )}
                        </div>
                      )}

                      {m.not && (
                        <p className="text-[8px] text-slate-400 font-medium mt-1 pl-4 leading-relaxed" title={m.not}>{m.not}</p>
                      )}

                      {/* ELLE DOĞRULA VE KAYDET → fiyat kitabı (öğrenen sistem) */}
                      {m.bulundu && sayi(m.birim) > 0 && (
                        <div className="flex items-center justify-end gap-1.5 mt-1 pl-4">
                          {m.kaydedildi ? (
                            <span className="text-[9px] font-black text-emerald-700 inline-flex items-center gap-1">
                              <CheckCircle2 size={10} /> Kitaba kaydedildi
                            </span>
                          ) : (
                            <button onClick={() => fiyatKaydet(m)} disabled={kaydetYuk === m.id}
                              title="Bu fiyatı fiyat kitabına yaz — sonraki aramalarda anında gelsin"
                              className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg inline-flex items-center gap-1 hover:bg-emerald-100 disabled:opacity-50">
                              {kaydetYuk === m.id ? <Loader2 size={9} className="animate-spin" /> : <Save size={9} />}
                              Bu fiyatı kaydet
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button onClick={fiyatArastir} disabled={fiyatYuk}
                  className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white py-3 rounded-xl font-black text-[11px] flex items-center justify-center gap-2 shadow-sm">
                  {fiyatYuk ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  {fiyatYuk ? 'FİYATLAR ARAŞTIRILIYOR (≤40 sn)...' : 'MALZEME FİYATLARINI ARAŞTIR'}
                </button>
                <p className="text-[9px] text-slate-400 font-medium text-center mt-1.5 leading-relaxed">
                  1) <strong>Fiyat kitabı</strong> (anında, ücretsiz) → 2) <strong>ücretsiz web araması</strong>
                  {' '}(SearXNG · DuckDuckGo · Bing · n11 · Akakçe) → 3) <strong>AI tahmini</strong> (son çare)<br />
                  Fiyatlar <strong>KDV hariç</strong> · perakende fiyatı 1,20'ye bölünür · bulunamayan satır 0 ₺ değil, elle girilir
                </p>

                {fiyatOzet && (
                  <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                    <p className="text-[10px] font-bold text-emerald-800 leading-relaxed">{fiyatOzet}</p>
                  </div>
                )}

                {fiyatUyari && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                    <p className="text-[10px] font-bold text-amber-800 leading-relaxed">{fiyatUyari}</p>
                  </div>
                )}
              </div>

              {/* İŞÇİLİK */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2">
                  <Users size={12} /> İşçilik
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[8px] font-black uppercase tracking-wider text-slate-400">Teknisyen</label>
                    <input type="number" min={1} max={20} value={teknisyen}
                      onChange={(e) => setTeknisyen(Math.max(1, Math.round(sayi(e.target.value, 1))))}
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg font-bold text-[12px] text-center outline-none focus:border-emerald-400" />
                  </div>
                  <div>
                    <label className="text-[8px] font-black uppercase tracking-wider text-slate-400">Süre</label>
                    <div className="flex gap-1 mt-1">
                      <input type="number" min={0} step="0.5" value={sure}
                        onChange={(e) => setSure(Math.max(0, sayi(e.target.value)))}
                        className="w-full min-w-0 p-2 bg-white border border-slate-200 rounded-lg font-bold text-[12px] text-center outline-none focus:border-emerald-400" />
                      <button onClick={() => setSureTuru(sureTuru === 'saat' ? 'gun' : 'saat')}
                        title="Saat / gün değiştir"
                        className="shrink-0 px-2 py-2 bg-white border border-slate-200 rounded-lg font-black text-[9px] text-slate-600 hover:bg-slate-100 uppercase">
                        {sureTuru === 'saat' ? 'saat' : 'gün'}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[8px] font-black uppercase tracking-wider text-slate-400">Saat ücreti</label>
                    <input type="number" min={0} step="0.01" value={saatUcreti}
                      onChange={(e) => { setSaatUcreti(Math.max(0, sayi(e.target.value))); setSaatUcretiKaynak('elle'); }}
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg font-bold text-[12px] text-center outline-none focus:border-emerald-400" />
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 font-medium mt-1.5 leading-relaxed">
                  Saat ücreti{' '}
                  <strong className="text-slate-600">
                    {saatUcretiKaynak === 'ayar' ? 'personel maaşından' : saatUcretiKaynak === 'elle' ? 'elle girildi' : 'varsayılan değer'}
                  </strong>{' '}
                  · {hesaplar.teknisyenSayi} tek. × {para2(hesaplar.sureSaat)} saat ={' '}
                  <strong className="text-slate-600">{para2(hesaplar.iscilik)} ₺</strong> (KDV hariç)
                </p>
              </div>

              {/* YOL + DİĞER GİDERLER */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Truck size={12} /> Yol &amp; Diğer Giderler
                  </p>
                  <button onClick={digerEkle}
                    className="bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl text-[10px] font-black text-slate-600 flex items-center gap-1 hover:bg-slate-100">
                    <Plus size={11} /> SATIR
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[8px] font-black uppercase tracking-wider text-slate-400">Mesafe (km)</label>
                    <input type="number" min={0} step={1} value={fMesafe}
                      onChange={(e) => setFMesafe(e.target.value)}
                      placeholder="Örn: 35"
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg font-bold text-[12px] text-center outline-none focus:border-emerald-400" />
                  </div>
                  <div>
                    <label className="text-[8px] font-black uppercase tracking-wider text-slate-400">km ücreti (₺)</label>
                    <input type="number" min={0} step="0.5" value={kmBirim}
                      onChange={(e) => setKmBirim(Math.max(0, sayi(e.target.value)))}
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg font-bold text-[12px] text-center outline-none focus:border-emerald-400" />
                  </div>
                </div>

                {digerler.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {digerler.map((d) => (
                      <div key={d.id} className="flex items-center gap-1.5">
                        <input type="text" value={d.ad} onChange={(e) => digerAlan(d.id, 'ad', e.target.value)}
                          placeholder="Örn: Vinç kirası, konaklama, otel"
                          className="flex-1 min-w-0 p-2 bg-white border border-slate-200 rounded-lg font-bold text-[12px] outline-none focus:border-emerald-400" />
                        <input type="number" min={0} step="0.01" value={d.tutar ?? ''}
                          onChange={(e) => digerAlan(d.id, 'tutar', e.target.value === '' ? null : Math.max(0, sayi(e.target.value)))}
                          placeholder="₺"
                          className="w-20 shrink-0 p-2 bg-white border border-slate-200 rounded-lg font-bold text-[11px] text-right outline-none focus:border-emerald-400" />
                        <button onClick={() => digerSil(d.id)} title="Satırı sil"
                          className="shrink-0 p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[9px] text-slate-400 font-medium mt-1.5 leading-relaxed">
                  Yol: {para2(hesaplar.km)} km × {para2(kmBirim)} ₺ ={' '}
                  <strong className="text-slate-600">{para2(hesaplar.yol)} ₺</strong>
                  {' '}· diğer giderler {para2(hesaplar.digerToplam)} ₺ (KDV hariç)
                </p>
              </div>

              {/* ACİLİYET */}
              <button onClick={() => setFAcil(!fAcil)}
                className={`w-full py-3.5 rounded-2xl font-black text-xs border-2 transition ${
                  fAcil ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                {fAcil ? '⚡ ACİL İŞ — maliyet × 1,25' : '⚡ Acil iş mi? (tıkla — maliyet × 1,25)'}
              </button>
              <p className="text-[9px] text-slate-400 font-medium text-center">
                Tüm tutarlar <strong>KDV hariç</strong> hesaplanır · marj değişince fiyat anında güncellenir
              </p>
            </div>
          </div>

          {/* ═════════ SAĞ: HESAP ═════════ */}
          <div className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3 flex items-center justify-between gap-2">
                <p className="text-xs font-black text-white uppercase tracking-wider">SATIŞ FİYATI</p>
                <span className="text-[9px] font-black text-slate-100 bg-white/15 px-2 py-1 rounded-lg shrink-0">
                  KDV HARİÇ
                </span>
              </div>

              <div className="p-5">
                <div className="text-center mb-4">
                  <p className="text-4xl font-black text-emerald-700 leading-none">{para(hesaplar.satis)} ₺</p>
                  <p className="text-[9px] font-bold text-slate-400 mt-1">
                    KDV hariç · maliyet {para2(hesaplar.maliyet)} ₺ + kâr {para2(hesaplar.kar)} ₺
                  </p>
                </div>

                {hesaplar.maliyet <= 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 mb-3">
                    <p className="text-[10px] font-bold text-amber-800">
                      Malzeme, işçilik veya mesafe girin — tutarlar anında hesaplanır.
                    </p>
                  </div>
                )}

                {/* KÂR MARJI — slider + sayı kutusu (client-side, istek yok) */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Percent size={11} /> Kâr Marjı
                    </span>
                    <span className="text-[9px] font-black text-slate-400">önerilen %{onerilenMarj}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <input type="range" min={MARJ_MIN} max={MARJ_MAKS} step={1} value={sayi(marj)}
                      onChange={(e) => { setMarj(sayi(e.target.value)); setMarjElle(true); }}
                      className="flex-1 accent-emerald-600 min-w-0" />
                    <div className="flex items-center gap-1 shrink-0">
                      <input type="number" min={MARJ_MIN} max={MARJ_MAKS} value={marj}
                        onChange={(e) => { setMarj(Math.max(MARJ_MIN, Math.min(MARJ_MAKS, sayi(e.target.value)))); setMarjElle(true); }}
                        className="w-16 p-2 bg-white border border-slate-200 rounded-lg font-black text-sm text-center outline-none focus:border-emerald-400" />
                      <span className="text-xs font-black text-slate-500">%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 gap-2">
                    <p className="text-[9px] font-bold text-slate-400">Kâr: {para2(hesaplar.kar)} ₺ (KDV hariç)</p>
                    {onerilenMarj !== sayi(marj) && (
                      <button onClick={() => { setMarj(onerilenMarj); setMarjElle(false); }}
                        className="text-[9px] font-black text-emerald-700 underline shrink-0">önerileni uygula</button>
                    )}
                  </div>
                  {sayi(marj) < DUSUK_MARJ && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2 mt-2">
                      <p className="text-[10px] font-bold text-amber-800">
                        ⚠️ Kâr marjı düşük — %{DUSUK_MARJ} altında maliyet artışı kârı siler.
                      </p>
                    </div>
                  )}
                </div>

                {/* MALİYET DÖKÜMÜ */}
                <div className="mt-4 space-y-1.5">
                  {[
                    { e: 'Malzeme', v: hesaplar.malzemeToplam, ek: `${hesaplar.malzemeKalem} kalem` },
                    { e: 'İşçilik', v: hesaplar.iscilik, ek: `${hesaplar.teknisyenSayi} tek. × ${para2(hesaplar.sureSaat)} s` },
                    { e: 'Yol', v: hesaplar.yol, ek: `${para2(hesaplar.km)} km` },
                    { e: 'Diğer', v: hesaplar.digerToplam, ek: `${hesaplar.digerKalem} satır` },
                    { e: 'Aciliyet (+%25)', v: hesaplar.aciliyetTutar, ek: fAcil ? 'açık' : 'kapalı' },
                  ].map((x, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] font-bold py-1 border-b border-slate-100 last:border-0 gap-2">
                      <span className="text-slate-500">
                        {x.e} <span className="text-[9px] text-slate-400 font-medium">{x.ek}</span>
                      </span>
                      <span className="text-slate-700 shrink-0">{para2(x.v)} ₺</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1.5 text-[12px] font-black text-slate-800 gap-2">
                    <span>MALİYET (KDV hariç)</span>
                    <span className="shrink-0">{para2(hesaplar.maliyet)} ₺</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-emerald-700 gap-2">
                    <span>Kâr (%{para2(marj)})</span>
                    <span className="shrink-0">+{para2(hesaplar.kar)} ₺</span>
                  </div>
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-[13px] font-black text-emerald-800 gap-2">
                    <span>SATIŞ (KDV hariç)</span>
                    <span className="shrink-0">{para2(hesaplar.satis)} ₺</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* KALEM DÖKÜMÜ — her kalem + kaynağı */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Calculator size={12} /> Kalem Dökümü
                </p>
                <span className="text-[8px] font-black text-slate-400">KDV HARİÇ</span>
              </div>

              {dokum.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Package className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-[11px] font-black text-slate-500">Kalem yok</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">
                    Malzeme ekleyin, işçilik veya mesafe girin.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[8px] tracking-wider">
                      <tr>
                        <th className="px-3 py-2">Kalem</th>
                        <th className="px-2 py-2 text-center">Adet</th>
                        <th className="px-2 py-2 text-right">Birim</th>
                        <th className="px-2 py-2 text-right">Toplam</th>
                        <th className="px-3 py-2 text-right">Kaynak</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {dokum.map((k, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2">
                            <p className="text-[11px] font-bold text-slate-700 leading-tight">{k.ad}</p>
                            <p className="text-[9px] text-slate-400 font-medium truncate max-w-[150px]">{k.detay}</p>
                          </td>
                          <td className="px-2 py-2 text-center text-[10px] font-bold text-slate-500">{k.adet ?? '—'}</td>
                          <td className="px-2 py-2 text-right text-[10px] font-bold text-slate-600">
                            {k.birim === null ? '—' : para2(k.birim) + ' ₺'}
                          </td>
                          <td className="px-2 py-2 text-right text-[11px] font-black text-slate-800">{para2(k.toplam)} ₺</td>
                          <td className="px-3 py-2 text-right">
                            <KaynakRozet
                              kaynak={k.kaynak === 'kitap' || k.kaynak === 'web' || k.kaynak === 'tahmini' ? k.kaynak : null}
                              guven={k.guven}
                              elle={k.kaynak === 'elle'}
                              bulundu={k.etiket ? true : k.birim !== null}
                              etiket={k.etiket}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="px-4 py-2 text-[9px] font-bold text-slate-400 border-t border-slate-100 text-right">
                Tüm tutarlar KDV hariçtir
              </p>
            </div>

            {/* TEKLİF OLUŞTUR → offers kaydı + PDF */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4">
              <button onClick={teklifOlustur} disabled={teklifYuk || hesaplar.maliyet <= 0}
                className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.99]">
                {teklifYuk ? <Loader2 size={17} className="animate-spin" /> : <FileText size={17} />}
                {teklifYuk ? 'TEKLİF HAZIRLANIYOR...' : 'TEKLİF OLUŞTUR (PDF)'}
              </button>
              <p className="text-[9px] text-slate-400 font-medium text-center mt-2 leading-relaxed">
                BUVİSAN teklif şablonu → PDF · <strong>offers</strong> tablosuna <strong>beklemede</strong> kaydedilir<br />
                Tüm tutarlar KDV hariçtir
              </p>

              {olusanTeklif && (
                <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
                  <p className="text-[11px] font-black text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 size={13} /> Teklif #{olusanTeklif.kod} oluşturuldu
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Link href="/admin/teklifler"
                      className="bg-emerald-600 text-white px-3 py-2 rounded-xl font-black text-[10px] flex items-center gap-1.5">
                      <FileText size={11} /> TEKLİFLERDE GÖR <ExternalLink size={10} />
                    </Link>
                    <button onClick={() => pdfUret(olusanTeklif.kod)}
                      className="bg-white border border-emerald-300 text-emerald-700 px-3 py-2 rounded-xl font-black text-[10px] flex items-center gap-1.5">
                      <Upload size={11} /> PDF İNDİR
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* GEÇMİŞ İŞ REFERANSI (eski fiyat_onerisi) — teklif fiyatını DEĞİŞTİRMEZ */}
            {referans && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
                  <TrendingUp size={12} /> Geçmiş İş Referansı
                </p>
                <div className="space-y-1">
                  {sayi(referans.benzer_is) > 0 && (
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 gap-2">
                      <span>Benzer {sayi(referans.benzer_is)} işin medyanı</span>
                      <span className="shrink-0">{para(referans.medyan)} ₺</span>
                    </div>
                  )}
                  {sayi(referans.musteri_is) > 0 && (
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 gap-2">
                      <span>Bu müşteriyle {sayi(referans.musteri_is)} iş</span>
                      <span className="shrink-0">{para(referans.musteri_ciro)} ₺</span>
                    </div>
                  )}
                  {sayi(referans.tahmini_malzeme) > 0 && (
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 gap-2">
                      <span>Geçmiş malzeme ortalaması</span>
                      <span className="shrink-0">{para(referans.tahmini_malzeme)} ₺</span>
                    </div>
                  )}
                </div>
                {referans.uyari && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-2 mt-2">
                    <p className="text-[10px] font-bold text-amber-800">{referans.uyari}</p>
                  </div>
                )}
                {referans.mesaj && (
                  <p className="text-[9px] text-slate-400 font-medium mt-2 leading-relaxed">{referans.mesaj}</p>
                )}
                <p className="text-[8px] font-bold text-slate-400 mt-1.5">
                  Referans tutarlar KDV hariçtir · teklif fiyatını değiştirmez
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ ANOMALİ ALARMI ═══════════ */}
      {sekme === 'anomali' && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[10px] font-bold text-slate-400">
              {anomali?.tarih ? `Son tarama: ${anomali.tarih}` : 'Tarama hazır'} · tutarlar KDV hariç
            </p>
            <button onClick={anomaliGetir} disabled={anomaliYuk}
              className="bg-white border border-slate-200 px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-slate-100">
              <RefreshCw size={14} className={anomaliYuk ? 'animate-spin' : ''} /> TARA
            </button>
          </div>

          {anomaliYuk ? (
            <div className="py-16 text-center"><Loader2 className="w-9 h-9 animate-spin text-slate-400 mx-auto" /></div>
          ) : anomaliHata ? (
            <div className="bg-white rounded-3xl border border-rose-200 p-12 text-center">
              <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
              <p className="text-sm font-black text-slate-700">Anomali taraması yapılamadı</p>
              <p className="text-[11px] text-slate-400 font-medium mt-1 break-words">{anomaliHata}</p>
              <button onClick={anomaliGetir}
                className="mt-4 bg-slate-900 text-white px-4 py-2.5 rounded-2xl font-black text-xs inline-flex items-center gap-2">
                <RefreshCw size={13} /> TEKRAR DENE
              </button>
            </div>
          ) : !anomali || sayi(anomali.toplam) === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-sm font-black text-slate-700">Anomali yok 🎉</p>
              <p className="text-[11px] text-slate-400 font-medium mt-1">
                Giderler normal, kâr marjları sağlıklı, müşteri aktivitesi yerinde.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-gradient-to-r from-rose-600 to-orange-600 rounded-3xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-black text-rose-100 uppercase tracking-wider flex items-center gap-1.5">
                    <Zap size={13} /> DİKKAT GEREKEN DURUMLAR
                  </p>
                  <p className="text-xl font-black text-white mt-1">{sayi(anomali.toplam)} uyarı</p>
                </div>
                {sayi(anomali.yuksek_oncelikli) > 0 && (
                  <div className="bg-white/20 rounded-2xl px-4 py-2 text-center">
                    <p className="text-2xl font-black text-white leading-none">{sayi(anomali.yuksek_oncelikli)}</p>
                    <p className="text-[9px] font-black text-rose-100">ACİL</p>
                  </div>
                )}
              </div>

              {(Array.isArray(anomali.uyarilar) ? anomali.uyarilar : []).map((u: any, i: number) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.05, 0.3) }}
                  className={`bg-white rounded-3xl border-2 p-4 ${
                    u?.seviye === 'yuksek' ? 'border-rose-200' : u?.seviye === 'orta' ? 'border-amber-200' : 'border-slate-200'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                      u?.seviye === 'yuksek' ? 'bg-rose-100 text-rose-600'
                      : u?.seviye === 'orta' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                      {u?.tip === 'gider' ? <TrendingUp size={18} />
                        : u?.tip === 'kar' ? <Calculator size={18} />
                        : u?.tip === 'musteri' ? <AlertTriangle size={18} /> : <Clock size={18} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-black text-slate-800 leading-tight">{u?.baslik || 'Uyarı'}</p>
                      {u?.detay && <p className="text-[11px] text-slate-500 font-medium mt-1">{u.detay}</p>}
                      {u?.oneri && (
                        <div className="bg-slate-50 rounded-xl p-2.5 mt-2 border border-slate-100">
                          <p className="text-[10px] font-bold text-slate-600 flex items-start gap-1.5">
                            <Lightbulb size={11} className="text-amber-500 mt-0.5 shrink-0" /> {u.oneri}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
