'use client';

// ============================================================================
//  ⏰ HATIRLATMA MERKEZİ
// ----------------------------------------------------------------------------
//  Otomatik hatırlatma motorunun gözü burada:
//    • Bakımdan 7 / 1 gün önce  → MÜŞTERİYE (portal sohbeti + push)
//    • 3 gündür cevapsız teklif → MÜŞTERİYE (sohbet + push → /teklif-odasi/<id>) + admin özeti
//    • Her pazartesi 06:00      → ADMIN'e haftalık özet
//    • Portal hesabı yoksa      → ADMIN'e düşer
//
//  Motor veritabanında: hatirlatma_uret() · Kuyruk: bildirim_kuyrugu
//  Push gönderimi: /api/push-gonder · Zamanlama: vercel.json cron (06:00)
//
//  ⚠️ TUTAR KURALI: bu sistemdeki tüm tutarlar KDV HARİÇTİR.
//     (Tek istisna depo ekranındaki hesaplayıcının KDV'li çıktısı.)
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import {
  Bell, BellRing, RefreshCw, Loader2, Play, Send, Clock, Users,
  CheckCircle2, AlertTriangle, CalendarClock, Info, Sparkles, ExternalLink,
} from 'lucide-react';

type KuyrukKaydi = {
  id: string;
  hedef_rol: string | null;
  hedef_kisi: string | null;
  baslik: string;
  mesaj: string;
  url: string | null;
  oncelik: string | null;
  durum: string | null;
  created_at: string;
};

type Gonderim = {
  anahtar: string;
  tip: string;
  created_at: string;
};

const zaman = (s: any) => {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return String(s); }
};

const ROL_ETIKET: Record<string, { ad: string; sinif: string }> = {
  musteri: { ad: 'MÜŞTERİ', sinif: 'bg-violet-100 text-violet-700' },
  admin: { ad: 'ADMIN', sinif: 'bg-slate-800 text-white' },
  personel: { ad: 'PERSONEL', sinif: 'bg-indigo-100 text-indigo-700' },
  hepsi: { ad: 'HERKES', sinif: 'bg-slate-100 text-slate-600' },
};

const TIP_ETIKET: Record<string, string> = {
  bakim: 'BAKIM',
  teklif: 'TEKLİF',
  ozet: 'HAFTALIK ÖZET',
};

export default function HatirlatmalarPage() {
  const [kuyruk, setKuyruk] = useState<KuyrukKaydi[]>([]);
  const [kayitlar, setKayitlar] = useState<Gonderim[]>([]);
  const [teklifler, setTeklifler] = useState<any[]>([]);
  const [cihaz, setCihaz] = useState(0);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [calisiyor, setCalisiyor] = useState(false);
  const [mesaj, setMesaj] = useState('');
  const [hata, setHata] = useState('');
  const [sekme, setSekme] = useState<'kuyruk' | 'kayit'>('kuyruk');

  const getir = useCallback(async () => {
    setYukleniyor(true);
    setHata('');
    try {
      const [q, g, c, t] = await Promise.all([
        supabase.from('bildirim_kuyrugu').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('hatirlatma_gonderim').select('anahtar,tip,created_at').order('created_at', { ascending: false }).limit(100),
        supabase.from('push_abonelikler').select('id', { count: 'exact', head: true }).eq('aktif', true),
        supabase.from('offers').select('id,status,total_price,created_at,offer_date').limit(500),
      ]);
      if (q.error) setHata(q.error.message);
      if (t.error) setMesaj('⚠️ Teklifler okunamadı: ' + t.error.message);
      setKuyruk((q.data as any[]) || []);
      setKayitlar((g.data as any[]) || []);
      setTeklifler((t.data as any[]) || []);
      setCihaz(Number(c.count) || 0);
    } catch (e: any) {
      setHata(e?.message || 'Veri alınamadı');
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { getir(); }, [getir]);

  useEffect(() => {
    if (!mesaj) return;
    const z = setTimeout(() => setMesaj(''), 7000);
    return () => clearTimeout(z);
  }, [mesaj]);

  const simdiCalistir = async () => {
    if (calisiyor) return;
    setCalisiyor(true);
    setMesaj('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/hatirlatma', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
        },
      });
      const j: any = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setMesaj('❌ ' + (j?.mesaj || 'Çalıştırılamadı'));
        return;
      }
      const pushTxt = j?.push?.gonderilen != null
        ? ` · ${j.push.gonderilen} push gönderildi`
        : (j?.push?.mesaj ? ` · push: ${j.push.mesaj}` : '');
      setMesaj(`✅ ${j.mesaj || ''}${pushTxt}`.trim());
      await getir();
    } catch (e: any) {
      setMesaj('❌ ' + (e?.message || 'Hata'));
    } finally {
      setCalisiyor(false);
    }
  };

  const bekleyen = kuyruk.filter((k) => (k.durum || 'bekliyor') === 'bekliyor').length;
  const bugun = kuyruk.filter((k) => String(k.created_at || '').slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

  // ─── Teklif takibi (kapanma oranı + 3 günü geçenler) ───
  const tDurum = (s: any) => String(s ?? '').toLowerCase().trim();
  const tBekleyen = teklifler.filter((t) => ['bekliyor', 'beklemede', ''].includes(tDurum(t.status)));
  const tOnay = teklifler.filter((t) => ['onaylandi', 'onayli', 'kabul'].includes(tDurum(t.status)));
  const tRed = teklifler.filter((t) => ['reddedildi', 'red', 'iptal'].includes(tDurum(t.status)));
  const kapanmaOran = (tOnay.length + tRed.length) > 0
    ? Math.round((tOnay.length / (tOnay.length + tRed.length)) * 100)
    : 0;
  const ucGun = tBekleyen
    .map((t) => {
      const iso = String(t.offer_date || t.created_at || '').slice(0, 10);
      const gun = iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : 0;
      return { ...t, gun, iso };
    })
    .filter((t) => t.gun >= 3)
    .sort((a, b) => b.gun - a.gun);

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8">

      {/* ÜST BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-slate-800 flex items-center gap-2.5">
            <BellRing className="text-violet-600" size={30} /> HATIRLATMALAR
          </h1>
          <p className="text-slate-500 text-xs md:text-sm mt-0.5">
            Otomatik hatırlatma motoru · bakım 7/1 gün · haftalık özet
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button onClick={simdiCalistir} disabled={calisiyor || yukleniyor}
            className="flex-1 md:flex-none bg-violet-600 text-white px-4 py-3 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-violet-700 transition disabled:opacity-60">
            {calisiyor ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            ŞİMDİ ÇALIŞTIR
          </button>
          <button onClick={getir} disabled={yukleniyor}
            className="flex-1 md:flex-none bg-white border border-slate-200 px-4 py-3 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-slate-100 transition disabled:opacity-60">
            <RefreshCw size={16} className={yukleniyor ? 'animate-spin' : ''} /> YENİLE
          </button>
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
          <p className="font-black text-rose-800 flex items-center gap-2"><AlertTriangle size={18} /> Veri alınamadı</p>
          <p className="text-xs text-rose-600 font-medium mt-2">{hata}</p>
          <p className="text-xs text-rose-500 font-bold mt-2">
            → <code className="bg-white px-1.5 py-0.5 rounded">sql/204-hatirlatma-motoru.sql</code> çalıştırıldı mı?
          </p>
        </div>
      )}

      {/* ÖZET */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { e: 'BEKLEYEN BİLDİRİM', v: bekleyen, alt: 'push sırasında', r: 'violet' },
          { e: 'BUGÜN ÜRETİLEN', v: bugun, alt: 'hatırlatma', r: 'indigo' },
          { e: 'AKTİF CİHAZ', v: cihaz, alt: 'push aboneliği', r: 'teal' },
          { e: 'TOPLAM KAYIT', v: kayitlar.length, alt: 'gönderim geçmişi', r: 'slate' },
        ].map((k, i) => {
          const renkler: Record<string, string> = {
            violet: 'bg-violet-50 border-violet-200 text-violet-700',
            indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
            teal: 'bg-teal-50 border-teal-200 text-teal-700',
            slate: 'bg-slate-50 border-slate-200 text-slate-700',
          };
          return (
            <div key={i} className={`rounded-3xl border p-4 ${renkler[k.r]}`}>
              <p className="text-[10px] font-black uppercase tracking-wider">{k.e}</p>
              <p className="text-2xl md:text-3xl font-black mt-1 leading-none">{k.v}</p>
              <p className="text-[10px] font-bold mt-1.5 opacity-70">{k.alt}</p>
            </div>
          );
        })}
      </div>

      {/* KURALLAR */}
      <div className="bg-white rounded-3xl border border-slate-200 p-4 mb-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles size={12} /> Aktif kurallar
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
          {[
            { ikon: CalendarClock, baslik: 'Bakımdan 7 gün önce', alt: 'Müşteriye portal mesajı + push', renk: 'bg-teal-50 text-teal-600' },
            { ikon: Bell, baslik: 'Bakımdan 1 gün önce', alt: 'Müşteriye son hatırlatma', renk: 'bg-amber-50 text-amber-600' },
            { ikon: Send, baslik: 'Teklif 3 gün cevapsız', alt: 'Müşteriye + admin’e hatırlatma', renk: 'bg-violet-50 text-violet-600' },
            { ikon: Users, baslik: 'Her pazartesi 06:00', alt: 'Admin’e haftalık özet', renk: 'bg-indigo-50 text-indigo-600' },
          ].map((k, i) => {
            const I = k.ikon;
            return (
              <div key={i} className="flex items-center gap-2.5 bg-slate-50 rounded-2xl px-3 py-2.5">
                <span className={`w-8 h-8 rounded-xl grid place-items-center shrink-0 ${k.renk}`}><I size={15} /></span>
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-slate-700 truncate">{k.baslik}</p>
                  <p className="text-[10px] font-medium text-slate-500 truncate">{k.alt}</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] font-medium text-slate-400 mt-3 leading-relaxed">
          Günde 1 kez <b>06:00</b>'da Vercel Cron otomatik çalıştırır. Aynı hatırlatma ikinci kez üretilmez.
          Portal hesabı olmayan müşteride bildirim admin'e düşer.
        </p>
      </div>

      {/* TEKLİF TAKİBİ */}
      <div className="bg-white rounded-3xl border border-slate-200 p-4 mb-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 grid place-items-center shrink-0">
            <Send size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black text-slate-800">Teklif Takibi</h2>
            <p className="text-[10px] font-medium text-slate-400">3 gündür cevapsız teklif → müşteriye hatırlatma</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[8px] font-black text-slate-400 uppercase">Kapanma oranı</p>
            <p className="text-lg font-black text-slate-800 leading-none">{kapanmaOran}%</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { e: 'BEKLEYEN', v: tBekleyen.length, r: 'bg-amber-50 border-amber-200 text-amber-700' },
            { e: '3+ GÜN', v: ucGun.length, r: 'bg-rose-50 border-rose-200 text-rose-700' },
            { e: 'ONAYLANAN', v: tOnay.length, r: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
            { e: 'REDDEDİLEN', v: tRed.length, r: 'bg-slate-50 border-slate-200 text-slate-600' },
          ].map((k, i) => (
            <div key={i} className={`rounded-2xl border px-3 py-2 ${k.r}`}>
              <p className="text-[8px] font-black uppercase tracking-wide">{k.e}</p>
              <p className="text-lg font-black leading-tight">{k.v}</p>
            </div>
          ))}
        </div>

        {ucGun.length > 0 && (
          <div className="mt-3 rounded-2xl border border-slate-200 overflow-hidden">
            {ucGun.slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center gap-2 px-2.5 py-2 border-b border-slate-100 last:border-0">
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 shrink-0">
                  {t.gun} gün
                </span>
                <p className="text-[10px] font-bold text-slate-600 truncate flex-1">
                  #{String(t.id).slice(0, 6).toUpperCase()} · {Number(t.total_price || 0).toLocaleString('tr-TR')} ₺ (KDV hariç)
                </p>
                <a href={`/teklif-odasi/${t.id}`} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 text-[9px] font-black text-slate-500 hover:text-slate-800 flex items-center gap-1">
                  <ExternalLink size={10} /> AÇ
                </a>
              </div>
            ))}
            {ucGun.length > 6 && (
              <p className="text-[9px] font-bold text-slate-400 px-2.5 py-1.5">+ {ucGun.length - 6} teklif daha</p>
            )}
          </div>
        )}
      </div>

      {/* SEKMELER */}
      <div className="flex gap-1 bg-white rounded-2xl p-1.5 border border-slate-200 mb-3 w-full md:w-fit">
        {([['kuyruk', `Bildirim Kuyruğu (${kuyruk.length})`], ['kayit', `Gönderim Geçmişi (${kayitlar.length})`]] as const).map(([k, ad]) => (
          <button key={k} onClick={() => setSekme(k as 'kuyruk' | 'kayit')}
            className={`flex-1 md:flex-none px-4 py-2.5 rounded-xl text-[10px] font-black transition ${sekme === k ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            {ad}
          </button>
        ))}
      </div>

      {/* LİSTELER */}
      {yukleniyor && kuyruk.length === 0 ? (
        <div className="py-24 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-300 mx-auto" />
          <p className="text-xs font-black text-slate-400 mt-3">Yükleniyor...</p>
        </div>
      ) : sekme === 'kuyruk' ? (
        kuyruk.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl grid place-items-center mx-auto mb-3">
              <Bell className="text-slate-300" size={26} />
            </div>
            <p className="text-sm font-black text-slate-600">Kuyruk boş</p>
            <p className="text-[11px] font-bold text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
              Yaklaşan bakım veya haftalık özet oluştuğunda burada görünür. “ŞİMDİ ÇALIŞTIR” ile motoru elle deneyebilirsin.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {kuyruk.map((k) => {
              const rol = ROL_ETIKET[String(k.hedef_rol || 'hepsi')] || ROL_ETIKET.hepsi;
              const gonderildi = (k.durum || 'bekliyor') !== 'bekliyor';
              return (
                <div key={k.id} className="bg-white rounded-2xl border border-slate-200 p-3.5">
                  <div className="flex items-start gap-2.5">
                    <span className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${gonderildi ? 'bg-emerald-50 text-emerald-600' : 'bg-violet-50 text-violet-600'}`}>
                      {gonderildi ? <CheckCircle2 size={16} /> : <BellRing size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[12px] font-black text-slate-800">{k.baslik}</p>
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${rol.sinif}`}>{rol.ad}</span>
                        {k.hedef_kisi && (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{k.hedef_kisi}</span>
                        )}
                        {k.oncelik === 'yuksek' && (
                          <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">YÜKSEK</span>
                        )}
                      </div>
                      <p className="text-[11px] font-medium text-slate-600 mt-1 leading-relaxed">{k.mesaj}</p>
                      <p className="text-[9px] font-bold text-slate-400 mt-1.5 flex items-center gap-1">
                        <Clock size={10} /> {zaman(k.created_at)}
                        <span className="mx-1">·</span>
                        {gonderildi ? 'gönderildi' : 'bekliyor'}
                      </p>
                    </div>
                    {k.url && (
                      <Link href={k.url} className="shrink-0 p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100">
                        <Send size={13} />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        kayitlar.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
            <p className="text-sm font-black text-slate-600">Henüz hatırlatma üretilmemiş</p>
            <p className="text-[11px] font-bold text-slate-400 mt-1">
              Motor çalıştıkça üretilen her hatırlatma burada tek tek kaydedilir (mükerrer gönderim olmaz).
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
            {kayitlar.map((g) => (
              <div key={g.anahtar} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0">
                <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                  {TIP_ETIKET[g.tip] || String(g.tip).toUpperCase()}
                </span>
                <p className="text-[10px] font-bold text-slate-600 truncate flex-1">{g.anahtar}</p>
                <p className="text-[9px] font-bold text-slate-400 shrink-0">{zaman(g.created_at)}</p>
              </div>
            ))}
          </div>
        )
      )}

      {/* BİLGİ */}
      <div className="mt-4 bg-white rounded-3xl border border-slate-200 p-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Info size={12} /> Nasıl çalışır?
        </p>
        <p className="text-[11px] font-medium text-slate-500 mt-2 leading-relaxed">
          <b>hatirlatma_uret()</b> fonksiyonu bakım takvimini, teklifleri ve sözleşmeleri tarar. Her hatırlatma
          <b> anahtar</b> ile bir kez kaydedilir → aynı bakım için iki kez bildirim gitmez. Müşteriye giden
          hatırlatma müşteri portalındaki <b>SOHBET</b> ekranına da düşer; müşteri oradan BAKIM sekmesine geçip
          tarih değişikliği talep edebilir. Push bildirimi, cihazın aboneliği varsa (<b>{cihaz}</b> aktif cihaz) iletilir.
        </p>
        <p className="text-[10px] font-black text-slate-400 mt-3">
          NOT: Tüm tutarlar KDV hariçtir (tek istisna depo ekranındaki KDV'li hesaplayıcı).
        </p>
      </div>
    </div>
  );
}
