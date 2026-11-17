'use client';

// ============================================================================
//  🩺 VERİ SAĞLIĞI DENETLEYİCİSİ
// ----------------------------------------------------------------------------
//  AMAÇ: sistemde sessizce biriken TUTARSIZ kayıtları tek ekranda bulmak ve
//        tek tıkla düzeltmek. (Son 3 hatanın hepsi bu sınıftandı.)
//
//  KONTROLLER
//   1) Sözleşme portala düşmüyor      → müşteri sözleşmesini göremiyor
//   2) Bakım takvimi eksik/fazla      → yılda X bakım diyor ama takvimde Y kayıt
//   3) Periyot ↔ yılda kaç bakım      → 6 ayda 1 ama yılda 4 görünüyor
//   4) Yıllık tutar                   → makine × fiyat × yılda tutmuyor
//   5) Süresi geçmiş ama "aktif"      → portalda hâlâ aktif sözleşme gibi duruyor
//   6) Mükerrer takvim kaydı          → aynı gün iki bakım
//   7) Gecikmiş bakım                 → tarihi geçmiş "planlandı" kaydı
//   8) Mükerrer seri no               → aynı vinç iki kez kayıtlı
//   9) Müşteri atanmamış vinç         → QR/müşteri eşleşmesi çalışmaz
//
//  Düzeltmeler RLS'li admin oturumuyla doğrudan yazılır; takvim onarımı
//  mevcut takvim_yenile() fonksiyonunu kullanır (yapılmış bakımlar korunur).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, RefreshCw, Loader2,
  Wrench, Users, CalendarClock, Database, ChevronDown, ChevronUp,
  ExternalLink, Info, Link2, Sparkles, Wallet, Hash,
} from 'lucide-react';

type Sorun = { id: string; baslik: string; detay: string; veri?: any };
type Onem = 'yuksek' | 'orta' | 'dusuk';
type Renk = 'rose' | 'amber' | 'teal' | 'indigo' | 'slate' | 'emerald';

type Kontrol = {
  kod: string;
  baslik: string;
  aciklama: string;
  ikon: any;
  renk: Renk;
  onem: Onem;
  sorunlar: Sorun[];
  duzeltEtiket?: string;
  duzelt?: (s: Sorun) => Promise<string>;
  href?: string;
  hrefEtiket?: string;
  toplu?: boolean;          // false → toplu düzeltmede atlanır (etkileşimli)
};

const RENK: Record<Renk, { soft: string; border: string; text: string; ikon: string; dot: string }> = {
  rose: { soft: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', ikon: 'bg-rose-100 text-rose-600', dot: 'bg-rose-500' },
  amber: { soft: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', ikon: 'bg-amber-100 text-amber-600', dot: 'bg-amber-500' },
  teal: { soft: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', ikon: 'bg-teal-100 text-teal-600', dot: 'bg-teal-500' },
  indigo: { soft: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', ikon: 'bg-indigo-100 text-indigo-600', dot: 'bg-indigo-500' },
  slate: { soft: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', ikon: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  emerald: { soft: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', ikon: 'bg-emerald-100 text-emerald-600', dot: 'bg-emerald-500' },
};

const rk = (r: string) => (RENK as any)[r] as (typeof RENK)[Renk];

const ONEM_ETIKET: Record<Onem, string> = { yuksek: 'YÜKSEK', orta: 'ORTA', dusuk: 'DÜŞÜK' };
const ONEM_RENK: Record<Onem, string> = {
  yuksek: 'bg-rose-100 text-rose-700',
  orta: 'bg-amber-100 text-amber-700',
  dusuk: 'bg-slate-100 text-slate-600',
};

const para = (n: any) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const tarihKisa = (d: any) => {
  if (!d) return '—';
  const s = String(d).slice(0, 10).split('-');
  return s.length === 3 ? `${s[2]}.${s[1]}.${s[0]}` : String(d);
};

// Yılda kaç bakım = 12 / periyot  (takvim_yenile de aynı kuralı kullanır)
const yildaBeklenen = (c: any) => {
  const p = Number(c?.maintenance_period_months) || 3;
  return Math.max(1, Math.min(12, Math.round(12 / Math.max(1, p))));
};

// Sözleşme süresine göre takvimde olması gereken kayıt sayısı
const beklenenPlan = (c: any) => {
  const yilda = yildaBeklenen(c);
  const s = new Date(c?.start_date);
  const e = new Date(c?.end_date);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return 0;
  const yil = Math.max(1, Math.round((e.getTime() - s.getTime()) / (365.25 * 864e5)));
  return yil * yilda;
};

const seri = (c: any) =>
  String(c?.seri_no ?? c?.serial_number ?? c?.seriNo ?? c?.serial ?? '').trim();
const musteriAdi = (c: any) =>
  String(c?.customer_name ?? c?.firma_adi ?? c?.musteri ?? c?.musteri_adi ?? '').trim();
const modelAdi = (c: any) =>
  String(c?.model ?? c?.makine_modeli ?? c?.makine_model ?? '—').trim();

const bosKontrol = (k: Omit<Kontrol, 'sorunlar'>): Kontrol => ({ ...k, sorunlar: [] });

export default function VeriSagligiPage() {
  const [kontroller, setKontroller] = useState<Kontrol[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState('');
  const [mesaj, setMesaj] = useState('');
  const [islem, setIslem] = useState('');
  const [topluIslem, setTopluIslem] = useState(false);
  const [acik, setAcik] = useState<Record<string, boolean>>({});
  const [sonKontrol, setSonKontrol] = useState('');
  const [sayac, setSayac] = useState({ toplam: 0, yuksek: 0, duzeltilebilir: 0, sozlesme: 0, plan: 0, vinc: 0 });

  const denetle = useCallback(async () => {
    setYukleniyor(true);
    setHata('');
    try {
      const [cR, pR, hR, vR] = await Promise.all([
        supabase.from('maintenance_contracts').select('*').order('end_date', { ascending: true }),
        supabase.from('bakim_plani').select('id,sozlesme_id,tarih,sira,durum'),
        supabase.from('musteri_hesaplar').select('id,firma_adi,ad_soyad,durum'),
        supabase.from('cranes').select('*').limit(1500),
      ]);

      const hatalar: string[] = [];
      if (cR.error) hatalar.push('Sözleşmeler: ' + cR.error.message);
      if (pR.error) hatalar.push('Bakım planı: ' + pR.error.message);

      const sozlesmeler = (cR.data || []) as any[];
      const planlar = (pR.data || []) as any[];
      const hesaplar = ((hR.data || []) as any[]).filter((x) => x.durum === 'onaylandi');
      const vincler = (vR.data || []) as any[];
      const bugun = new Date().toISOString().slice(0, 10);

      const planOf = (id: string) => planlar.filter((p) => p.sozlesme_id === id);
      const aktifSozlesme = (c: any) => c.asama !== 'teklif' && c.status !== 'bitti';

      // ── 1) HİTAP EKSİK → PORTAL EŞLEŞMİYOR ────────────────────────────
      const portala = bosKontrol({
        kod: 'portal',
        baslik: 'Hitap yok → sözleşme portala düşmüyor',
        aciklama: 'Sözleşmenin tam ünvanı hiçbir portal hesabıyla eşleşmiyor ve kısa ad (hitap) girilmemiş. Hitap ekle → müşteri sözleşmeyi ve PDF’ini görür.',
        ikon: Users,
        renk: 'rose',
        onem: 'yuksek',
        duzeltEtiket: 'HİTAP EKLE',
        toplu: false,
      });

      // ── 1b) HESABI OLMAYAN SÖZLEŞME (bilgi) ───────────────────────────
      const hesapsiz = bosKontrol({
        kod: 'hesapsiz',
        baslik: 'Sözleşmenin portal hesabı yok',
        aciklama: 'Bu müşteri henüz müşteri portalına kaydolmamış. Hesap açılınca sözleşme otomatik görünür.',
        ikon: Users,
        renk: 'slate',
        onem: 'dusuk',
        href: '/admin/musteri-hesaplari',
        hrefEtiket: 'Müşteri Hesapları',
      });

      if (hesaplar.length > 0) {
        // Aynı firma adına tek kez bak (hesap sayısı şişmesin) + makul üst sınır
        const firmalar = Array.from(new Set(
          hesaplar.map((h: any) => String(h.firma_adi || '').trim()).filter(Boolean)
        )).slice(0, 25);
        const aktifler = sozlesmeler.filter(aktifSozlesme).slice(0, 40);
        const ciftSayisi = firmalar.length * aktifler.length;

        if (ciftSayisi > 200) {
          portala.aciklama += ` (Çok fazla kayıt: ${ciftSayisi} eşleştirme atlandı — sözleşmeleri azaltıp tekrar dene.)`;
        } else if (firmalar.length > 0) {
          const eslesmeSonuc = await Promise.all(
            aktifler.map(async (ct) => {
              const skorlar = await Promise.all(
                firmalar.map(async (firma) => {
                  const [a, b] = await Promise.all([
                    supabase.rpc('firma_eslestir', { p_a: String(ct.company_name || ''), p_b: firma }),
                    ct.hitap_adi
                      ? supabase.rpc('firma_eslestir', { p_a: String(ct.hitap_adi), p_b: firma })
                      : Promise.resolve({ data: 0 } as any),
                  ]);
                  return Math.max(Number(a?.data) || 0, Number(b?.data) || 0);
                })
              );
              return { ct, eslesti: skorlar.some((x) => x >= 75), enIyi: Math.max(0, ...skorlar) };
            })
          );
          for (const { ct, eslesti, enIyi } of eslesmeSonuc) {
            if (eslesti) continue;
            const hitapVar = String(ct.hitap_adi || '').trim().length > 0;
            const satir = {
              id: ct.id,
              baslik: ct.company_name || '—',
              detay: hitapVar
                ? `Hitap: ${ct.hitap_adi} · en iyi eşleşme ${enIyi}% · hesap açılmamış olabilir`
                : `Hitap: YOK · tam ünvan eşleşmedi (${enIyi}%) · ${firmalar.length} onaylı firma`,
              veri: ct,
            };
            if (hitapVar) hesapsiz.sorunlar.push(satir);
            else portala.sorunlar.push(satir);
          }
        }
      }
      portala.duzelt = async (s) => {
        const ct = sozlesmeler.find((x) => x.id === s.id);
        const yeni = window.prompt(
          `${ct?.company_name || ''}\n\nMüşterinin portalda kullandığı kısa firma adı (hitap).\nÖrn: "RB KARESİ" hesabı için "KARESİ":`,
          String(ct?.hitap_adi || '')
        );
        if (yeni === null) throw new Error('İptal edildi');
        const { error } = await supabase
          .from('maintenance_contracts')
          .update({ hitap_adi: yeni.trim() || null })
          .eq('id', s.id);
        if (error) throw new Error(error.message);
        return `Hitap "${yeni.trim()}" olarak kaydedildi`;
      };

      // ── 2) BAKIM TAKVİMİ EKSİK / FAZLA ────────────────────────────────
      const takvim = bosKontrol({
        kod: 'takvim',
        baslik: 'Bakım takvimi sözleşmeyle uyuşmuyor',
        aciklama: 'Sözleşme "yılda X bakım" diyor ama takvimdeki kayıt sayısı farklı. Düzeltince takvim yeniden kurulur.',
        ikon: CalendarClock,
        renk: 'amber',
        onem: 'yuksek',
        duzeltEtiket: 'TAKVİMİ YENİLE',
        href: '/admin/bakim-takvimi',
        hrefEtiket: 'Bakım Takvimi',
      });
      for (const ct of sozlesmeler) {
        if (!aktifSozlesme(ct)) continue;
        const kayitlar = planOf(ct.id);
        if (kayitlar.some((p) => p.durum === 'yapildi')) continue; // yapılmış varsa sayı doğal olarak kayar
        const bek = beklenenPlan(ct);
        if (bek > 0 && kayitlar.length !== bek) {
          takvim.sorunlar.push({
            id: ct.id,
            baslik: ct.company_name || '—',
            detay: `Beklenen ${bek} kayıt · takvimde ${kayitlar.length} · yılda ${yildaBeklenen(ct)} × ${Math.round(bek / Math.max(1, yildaBeklenen(ct)))} yıl`,
            veri: ct,
          });
        }
      }
      takvim.duzelt = async (s) => {
        const { data, error } = await supabase.rpc('takvim_yenile', { p_sozlesme_id: s.id });
        if (error) throw new Error(error.message);
        if (!(data as any)?.ok) throw new Error((data as any)?.mesaj || 'Takvim yenilenemedi');
        return (data as any)?.mesaj || 'Takvim yenilendi';
      };

      // ── 3) PERİYOT ↔ YILDA KAÇ BAKIM ──────────────────────────────────
      const periyot = bosKontrol({
        kod: 'periyot',
        baslik: 'Periyot ile "yılda kaç bakım" tutarsız',
        aciklama: 'Aynı sözleşmede iki farklı bakım sayısı var. Periyot esas alınarak düzeltilir (takvim de yenilenir).',
        ikon: RefreshCw,
        renk: 'rose',
        onem: 'yuksek',
        duzeltEtiket: 'DÜZELT',
      });
      for (const ct of sozlesmeler) {
        const bek = yildaBeklenen(ct);
        const kayitli = Number(ct.visits_per_year) || 0;
        if (kayitli > 0 && kayitli !== bek) {
          periyot.sorunlar.push({
            id: ct.id,
            baslik: ct.company_name || '—',
            detay: `Periyot ${ct.maintenance_period_months || 3} ay → yılda ${bek} olmalı · kayıtlı ${kayitli}`,
            veri: ct,
          });
        }
      }
      periyot.duzelt = async (s) => {
        const ct = sozlesmeler.find((x) => x.id === s.id);
        const yilda = yildaBeklenen(ct);
        const ay = Math.max(1, Math.round(12 / yilda));
        const { error } = await supabase
          .from('maintenance_contracts')
          .update({
            visits_per_year: yilda,
            visit_count: yilda,
            maintenance_period_months: ay,
            yearly_total: Number(ct?.machine_count || 0) * Number(ct?.price_per_machine || 0) * yilda,
          })
          .eq('id', s.id);
        if (error) throw new Error(error.message);
        const r = await supabase.rpc('takvim_yenile', { p_sozlesme_id: s.id });
        if ((r.data as any)?.ok) return `Yılda ${yilda} bakım · takvim güncellendi`;
        return `Yılda ${yilda} bakım (takvim: ${(r.data as any)?.mesaj || 'güncellenemedi'})`;
      };

      // ── 4) YILLIK TUTAR ───────────────────────────────────────────────
      const tutar = bosKontrol({
        kod: 'tutar',
        baslik: 'Yıllık tutar hesabı yanlış',
        aciklama: 'Doğrusu: makine × makine başı fiyat × yılda kaç bakım (servis ücreti hariç).',
        ikon: Wallet,
        renk: 'teal',
        onem: 'orta',
        duzeltEtiket: 'YENİDEN HESAPLA',
      });
      for (const ct of sozlesmeler) {
        const yilda = yildaBeklenen(ct);
        const bek = Number(ct.machine_count || 0) * Number(ct.price_per_machine || 0) * yilda;
        const mevcut = Number(ct.yearly_total || 0);
        if (Math.abs(bek - mevcut) > 0.5) {
          tutar.sorunlar.push({
            id: ct.id,
            baslik: ct.company_name || '—',
            detay: `Kayıtlı ${para(mevcut)} ₺ · olması gereken ${para(bek)} ₺`,
            veri: ct,
          });
        }
      }
      tutar.duzelt = async (s) => {
        const ct = sozlesmeler.find((x) => x.id === s.id);
        const bek = Number(ct?.machine_count || 0) * Number(ct?.price_per_machine || 0) * yildaBeklenen(ct);
        const { error } = await supabase.from('maintenance_contracts').update({ yearly_total: bek }).eq('id', s.id);
        if (error) throw new Error(error.message);
        return `Yıllık tutar ${para(bek)} ₺ olarak güncellendi`;
      };

      // ── 5) SÜRESİ GEÇMİŞ AMA AKTİF ────────────────────────────────────
      const suresi = bosKontrol({
        kod: 'suresi',
        baslik: 'Süresi geçmiş ama hâlâ "aktif"',
        aciklama: 'Bitiş tarihi geçmiş sözleşme portalda aktif görünüyor. "Bitti" olarak işaretlenmeli.',
        ikon: AlertTriangle,
        renk: 'rose',
        onem: 'orta',
        duzeltEtiket: 'BİTTİ YAP',
      });
      for (const ct of sozlesmeler) {
        const bitis = String(ct.end_date || '').slice(0, 10);
        if (bitis && bitis < bugun && ct.status !== 'bitti') {
          suresi.sorunlar.push({
            id: ct.id,
            baslik: ct.company_name || '—',
            detay: `Bitiş ${tarihKisa(bitis)} · durum ${ct.status || 'aktif'}`,
            veri: ct,
          });
        }
      }
      suresi.duzelt = async (s) => {
        const { error } = await supabase.from('maintenance_contracts').update({ status: 'bitti' }).eq('id', s.id);
        if (error) throw new Error(error.message);
        return 'Sözleşme "bitti" olarak işaretlendi';
      };

      // ── 6) MÜKERRER TAKVİM KAYDI ──────────────────────────────────────
      const mukerrer = bosKontrol({
        kod: 'mukerrer',
        baslik: 'Aynı gün iki bakım kaydı',
        aciklama: 'Takvim yenilenirken aynı güne mükerrer kayıt düşmüş. Fazlalar silinir (yapılmış olan korunur).',
        ikon: Hash,
        renk: 'amber',
        onem: 'orta',
        duzeltEtiket: 'FAZLAYI SİL',
      });
      for (const ct of sozlesmeler) {
        const gruplar = new Map<string, any[]>();
        for (const p of planOf(ct.id)) {
          const gun = String(p.tarih || '').slice(0, 10);
          if (!gun) continue;
          const arr = gruplar.get(gun) || [];
          arr.push(p);
          gruplar.set(gun, arr);
        }
        for (const [gun, arr] of gruplar) {
          if (arr.length < 2) continue;
          const korunacak = arr.find((x) => x.durum === 'yapildi') || arr[0];
          const sil = arr.filter((x) => x.id !== korunacak.id).map((x) => x.id);
          mukerrer.sorunlar.push({
            id: `${ct.id}|${gun}`,
            baslik: ct.company_name || '—',
            detay: `${tarihKisa(gun)} · ${arr.length} kayıt · ${sil.length} fazla`,
            veri: { sil },
          });
        }
      }
      mukerrer.duzelt = async (s) => {
        const sil: string[] = s.veri?.sil || [];
        if (sil.length === 0) throw new Error('Silinecek kayıt yok');
        const { error } = await supabase.from('bakim_plani').delete().in('id', sil);
        if (error) throw new Error(error.message);
        return `${sil.length} mükerrer kayıt silindi`;
      };

      // ── 7) GECİKMİŞ BAKIM ─────────────────────────────────────────────
      const gecikmis = bosKontrol({
        kod: 'gecikmis',
        baslik: 'Tarihi geçmiş planlı bakım',
        aciklama: 'Bu bakımların tarihi geçmiş ama hâlâ "planlandı". Takvimden yapıldı/tarih değişikliği işaretlenmeli.',
        ikon: CalendarClock,
        renk: 'amber',
        onem: 'dusuk',
        href: '/admin/bakim-takvimi',
        hrefEtiket: 'Takvime git',
      });
      const sozAdi = new Map(sozlesmeler.map((c) => [c.id, c.company_name || '—']));
      for (const p of planlar) {
        if (p.durum !== 'planlandi') continue;
        const gun = String(p.tarih || '').slice(0, 10);
        if (gun && gun < bugun) {
          const gunFark = Math.round((Date.now() - new Date(gun).getTime()) / 864e5);
          gecikmis.sorunlar.push({
            id: p.id,
            baslik: sozAdi.get(p.sozlesme_id) || '—',
            detay: `${tarihKisa(gun)} · ${p.sira}. bakım · ${gunFark} gün gecikti`,
            veri: p,
          });
        }
      }

      // ── 8) MÜKERRER SERİ NO ───────────────────────────────────────────
      const seriTekrar = bosKontrol({
        kod: 'seri',
        baslik: 'Aynı seri no birden fazla vinçte',
        aciklama: 'Aynı makine iki kez kayıtlı olabilir. İncele, fazlaysa sil.',
        ikon: Database,
        renk: 'slate',
        onem: 'dusuk',
        href: '/admin/vincler',
        hrefEtiket: 'Vinç listesi',
      });
      const seriMap = new Map<string, any[]>();
      for (const v of vincler) {
        const s = seri(v).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (!s || s === '-' || s === 'YOK') continue;
        const arr = seriMap.get(s) || [];
        arr.push(v);
        seriMap.set(s, arr);
      }
      for (const [s, arr] of seriMap) {
        if (arr.length < 2) continue;
        seriTekrar.sorunlar.push({
          id: s,
          baslik: `Seri No: ${seri(arr[0])}`,
          detay: `${arr.length} kayıt · ${arr.map((v) => `${modelAdi(v)} (${musteriAdi(v) || 'müşteri yok'})`).join(' · ').slice(0, 160)}`,
        });
      }

      // ── 9) MÜŞTERİ ATANMAMIŞ VİNÇ ─────────────────────────────────────
      const musteriYok = bosKontrol({
        kod: 'musterisiz',
        baslik: 'Müşterisi atanmamış vinç',
        aciklama: 'Bu vinçlerin QR kodundan müşteri portalı eşleşmesi çalışmaz.',
        ikon: Wrench,
        renk: 'slate',
        onem: 'dusuk',
        href: '/admin/vincler',
        hrefEtiket: 'Vinç listesi',
      });
      for (const v of vincler) {
        const m = musteriAdi(v);
        if (!m || m === '—') {
          musteriYok.sorunlar.push({
            id: String(v.id),
            baslik: modelAdi(v),
            detay: `Seri: ${seri(v) || '—'} · müşteri alanı boş`,
          });
        }
      }

      const liste = [portala, takvim, periyot, tutar, suresi, mukerrer, hesapsiz, gecikmis, seriTekrar, musteriYok];
      setKontroller(liste.filter((k) => k.sorunlar.length > 0));

      const toplam = liste.reduce((t, k) => t + k.sorunlar.length, 0);
      setSayac({
        toplam,
        yuksek: liste.filter((k) => k.onem === 'yuksek').reduce((t, k) => t + k.sorunlar.length, 0),
        duzeltilebilir: liste.filter((k) => !!k.duzelt && k.toplu !== false).reduce((t, k) => t + k.sorunlar.length, 0),
        sozlesme: sozlesmeler.length,
        plan: planlar.length,
        vinc: vincler.length,
      });
      setSonKontrol(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
      if (hatalar.length > 0) setHata(hatalar.join(' · '));
    } catch (e: any) {
      setHata(e?.message || 'Denetim çalıştırılamadı');
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { denetle(); }, [denetle]);

  useEffect(() => {
    if (!mesaj) return;
    const z = setTimeout(() => setMesaj(''), 6000);
    return () => clearTimeout(z);
  }, [mesaj]);

  const duzelt = async (k: Kontrol, s: Sorun) => {
    if (!k.duzelt) return;
    const anahtar = `${k.kod}:${s.id}`;
    setIslem(anahtar);
    try {
      const m = await k.duzelt(s);
      setMesaj('✅ ' + (m || 'Düzeltildi'));
      await denetle();
    } catch (e: any) {
      setMesaj('❌ ' + (e?.message || 'Düzeltilemedi'));
    } finally {
      setIslem('');
    }
  };

  const hepsiniDuzelt = async () => {
    const isler = kontroller
      .filter((k) => !!k.duzelt && k.toplu !== false)
      .flatMap((k) => k.sorunlar.map((s) => ({ k, s })));
    if (isler.length === 0) return;
    if (!confirm(`${isler.length} kayıt otomatik düzeltilecek.\n\nDevam edilsin mi?`)) return;
    setTopluIslem(true);
    let ok = 0;
    let hataSayisi = 0;
    for (const { k, s } of isler) {
      try { await k.duzelt!(s); ok++; } catch { hataSayisi++; }
    }
    setTopluIslem(false);
    setMesaj(`✅ ${ok} kayıt düzeltildi${hataSayisi ? ` · ${hataSayisi} hata` : ''}`);
    await denetle();
  };

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8">

      {/* ÜST BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-slate-800 flex items-center gap-2.5">
            <ShieldCheck className="text-emerald-600" size={30} /> VERİ SAĞLIĞI
          </h1>
          <p className="text-slate-500 text-xs md:text-sm mt-0.5">
            Tutarsız kayıtları bulur ve tek tıkla düzeltir
            {sonKontrol && <span className="text-slate-400"> · son kontrol {sonKontrol}</span>}
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button onClick={denetle} disabled={yukleniyor || topluIslem}
            className="flex-1 md:flex-none bg-white border border-slate-200 px-4 py-3 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-slate-100 transition disabled:opacity-60">
            <RefreshCw size={16} className={yukleniyor ? 'animate-spin' : ''} /> YENİLE
          </button>
          {sayac.duzeltilebilir > 0 && (
            <button onClick={hepsiniDuzelt} disabled={topluIslem || yukleniyor}
              className="flex-1 md:flex-none bg-emerald-600 text-white px-4 py-3 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-emerald-700 transition disabled:opacity-60">
              {topluIslem ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              TÜMÜNÜ DÜZELT ({sayac.duzeltilebilir})
            </button>
          )}
          <Link href="/admin"
            className="flex-1 md:flex-none bg-slate-900 text-white px-4 py-3 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-slate-800 transition">
            PANEL
          </Link>
        </div>
      </div>

      {/* BİLDİRİM */}
      {mesaj && (
        <div className={`mb-4 p-3.5 rounded-2xl text-[11px] font-bold border ${mesaj.startsWith('✅')
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
          {mesaj}
        </div>
      )}

      {hata && (
        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 mb-5">
          <p className="font-black text-rose-800 flex items-center gap-2"><AlertTriangle size={18} /> Bazı veriler okunamadı</p>
          <p className="text-xs text-rose-600 font-medium mt-2">{hata}</p>
        </div>
      )}

      {/* ÖZET */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { e: 'TOPLAM SORUN', v: sayac.toplam, alt: `${kontroller.length} kontrolde`, r: sayac.toplam > 0 ? 'rose' : 'emerald' },
          { e: 'YÜKSEK ÖNCELİK', v: sayac.yuksek, alt: 'müşteriyi etkiler', r: sayac.yuksek > 0 ? 'amber' : 'emerald' },
          { e: 'OTOMATİK DÜZELTİLEBİLİR', v: sayac.duzeltilebilir, alt: 'tek tıkla', r: 'teal' },
          { e: 'DENETLENEN', v: sayac.sozlesme + sayac.plan + sayac.vinc, alt: `${sayac.sozlesme} sözleşme · ${sayac.plan} bakım · ${sayac.vinc} vinç`, r: 'indigo' },
        ].map((k, i) => {
          const r = rk(k.r);
          return (
            <div key={i} className={`rounded-3xl border p-4 ${r.soft} ${r.border}`}>
              <p className={`text-[10px] font-black uppercase tracking-wider ${r.text}`}>{k.e}</p>
              <p className={`text-2xl md:text-3xl font-black mt-1 leading-none ${r.text}`}>{k.v}</p>
              <p className={`text-[10px] font-bold mt-1.5 ${r.text} opacity-70`}>{k.alt}</p>
            </div>
          );
        })}
      </div>

      {/* YÜKLENİYOR */}
      {yukleniyor && kontroller.length === 0 ? (
        <div className="py-24 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-300 mx-auto" />
          <p className="text-xs font-black text-slate-400 mt-3">Denetim çalışıyor...</p>
        </div>
      ) : kontroller.length === 0 ? (
        /* TEMİZ */
        <div className="bg-white rounded-3xl border border-emerald-200 p-10 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl grid place-items-center mx-auto mb-4">
            <CheckCircle2 className="text-emerald-600" size={32} />
          </div>
          <h2 className="text-lg font-black text-slate-800">Her şey temiz 🎉</h2>
          <p className="text-xs font-bold text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
            {sayac.sozlesme} sözleşme, {sayac.plan} bakım kaydı ve {sayac.vinc} vinç kontrol edildi;
            tutarsızlık bulunamadı.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {kontroller.map((k) => {
            const Ikon = k.ikon;
            const r = RENK[k.renk];
            const acikMi = acik[k.kod] !== false; // varsayılan açık
            const gosterilecek = acikMi ? k.sorunlar.slice(0, 8) : [];
            return (
              <div key={k.kod} className={`bg-white rounded-3xl border ${r.border} overflow-hidden`}>
                {/* BAŞLIK */}
                <div className="flex items-start gap-3 p-4">
                  <div className={`w-11 h-11 rounded-2xl grid place-items-center shrink-0 ${r.ikon}`}>
                    <Ikon size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-black text-slate-800">{k.baslik}</h3>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg ${ONEM_RENK[k.onem]}`}>
                        {ONEM_ETIKET[k.onem]}
                      </span>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg ${r.soft} ${r.text}`}>
                        {k.sorunlar.length} kayıt
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-slate-500 mt-1 leading-relaxed">{k.aciklama}</p>
                  </div>
                  <button onClick={() => setAcik((o) => ({ ...o, [k.kod]: acikMi ? false : true }))}
                    className="shrink-0 w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 grid place-items-center text-slate-500 hover:bg-slate-100 transition">
                    {acikMi ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {/* SATIRLAR */}
                {acikMi && (
                  <div className="px-4 pb-4 space-y-1.5">
                    {gosterilecek.map((s) => {
                      const anahtar = `${k.kod}:${s.id}`;
                      const calisiyor = islem === anahtar;
                      return (
                        <div key={s.id} className="flex items-center gap-2.5 rounded-2xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-black text-slate-700 truncate">{s.baslik}</p>
                            <p className="text-[10px] font-medium text-slate-500 truncate">{s.detay}</p>
                          </div>
                          {k.duzelt && (
                            <button onClick={() => duzelt(k, s)} disabled={calisiyor || topluIslem}
                              className="shrink-0 px-3 py-2 rounded-xl bg-white border border-slate-200 text-[9px] font-black text-slate-600 hover:border-emerald-300 hover:text-emerald-700 transition disabled:opacity-50 flex items-center gap-1">
                              {calisiyor ? <Loader2 size={11} className="animate-spin" /> : <Wrench size={11} />}
                              {k.duzeltEtiket || 'DÜZELT'}
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {k.sorunlar.length > 8 && (
                      <p className="text-[10px] font-bold text-slate-400 px-1 pt-1">
                        + {k.sorunlar.length - 8} kayıt daha (önce yukarıdakileri düzelt, sonra yenile)
                      </p>
                    )}

                    <div className="flex items-center gap-3 pt-1.5">
                      {k.href && (
                        <Link href={k.href} className={`text-[10px] font-black flex items-center gap-1 ${r.text} hover:underline`}>
                          <ExternalLink size={11} /> {k.hrefEtiket || 'Aç'}
                        </Link>
                      )}
                      {k.duzelt && k.sorunlar.length > 1 && k.toplu !== false && (
                        <button onClick={async () => {
                          if (!confirm(`${k.sorunlar.length} kayıt düzeltilecek. Devam?`)) return;
                          setTopluIslem(true);
                          let ok = 0;
                          for (const s of k.sorunlar) { try { await k.duzelt!(s); ok++; } catch { /* yoksay */ } }
                          setTopluIslem(false);
                          setMesaj(`✅ ${ok} kayıt düzeltildi`);
                          await denetle();
                        }}
                          disabled={topluIslem}
                          className="text-[10px] font-black text-slate-500 hover:text-slate-800 flex items-center gap-1 disabled:opacity-50">
                          <Sparkles size={11} /> BU KONTROLÜN TÜMÜNÜ DÜZELT
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* NE İŞE YARAR */}
      <div className="mt-5 bg-white rounded-3xl border border-slate-200 p-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Info size={12} /> Bu ekran ne yapar?
        </p>
        <p className="text-[11px] font-medium text-slate-500 mt-2 leading-relaxed">
          Panel, müşteri portalı ve bakım takvimi <b>aynı veriyi farklı yerlerden</b> okur. Menüde yapılan bir
          değişiklik diğer ekranda yanlış görünebilir. Buradaki kontroller o farkları yakalar; “Düzelt” dediğinde
          veri tek doğru kaynağa (periyot, finance kaydı, takvim) göre onarılır. Bakım takvimi onarımı
          <b> yapılmış bakımlara dokunmaz</b>.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Link href="/admin/bakim-takvimi" className="text-[10px] font-black bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-600 hover:bg-slate-100 flex items-center gap-1">
            <CalendarClock size={12} /> Bakım Takvimi
          </Link>
          <Link href="/admin/vincler" className="text-[10px] font-black bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-600 hover:bg-slate-100 flex items-center gap-1">
            <Link2 size={12} /> Vinç Listesi
          </Link>
          <Link href="/admin/musteri-hesaplari" className="text-[10px] font-black bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-600 hover:bg-slate-100 flex items-center gap-1">
            <Users size={12} /> Müşteri Hesapları
          </Link>
        </div>
      </div>
    </div>
  );
}
