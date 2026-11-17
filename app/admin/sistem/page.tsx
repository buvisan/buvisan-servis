'use client';

// ============================================================================
//  🛠️ SİSTEM & YEDEK
// ----------------------------------------------------------------------------
//  Teknik sağlık ekranı:
//    • Migration kaydı — hangi SQL çalıştı, hangisi bekliyor
//    • Yedek — kritik tabloları JSON olarak özel bucket'a al / indir
//    • Canlı sayaçlar — tablolarda kaç kayıt var
//    • Hatırlatma motoru durumu
//
//  SQL: 205-migration-kaydi.sql (schema_migrations + migration_isaretle)
//  Yedek: /api/yedek (private "yedekler" bucket, imzalı indirme)
//
//  ⚠️ Tüm tutarlar KDV hariçtir (tek istisna depo hesaplayıcısı).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import sqlDosyalari from '@/lib/sql-manifest.json';
import {
  Database, HardDriveDownload, Loader2, RefreshCw, CheckCircle2, AlertTriangle,
  Play, Download, ShieldCheck, FileCode2, Info, Bell,
} from 'lucide-react';

type Migration = { dosya: string; uygulandi_at: string | null; not: string | null };
type Yedek = { dosya: string; ad: string; boyut: number; boyut_mb: number; tarih: string | null };

const no = (ad: string) => parseInt(String(ad).split('-')[0], 10) || 0;

const zaman = (s: any) => {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return String(s); }
};

const boyutYazi = (b: number) => {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
};

export default function SistemPage() {
  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [yedekler, setYedekler] = useState<Yedek[]>([]);
  const [sayilar, setSayilar] = useState<Record<string, number>>({});
  const [sonHatirlatma, setSonHatirlatma] = useState<string>('');
  const [bekleyenBildirim, setBekleyenBildirim] = useState(0);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [islem, setIslem] = useState('');
  const [mesaj, setMesaj] = useState('');
  const [hata, setHata] = useState('');
  const [migrationYok, setMigrationYok] = useState(false);
  const [manuelDosya, setManuelDosya] = useState('');

  const token = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || '';
    } catch { return ''; }
  }, []);

  const yedekleriGetir = useCallback(async () => {
    try {
      const t = await token();
      const r = await fetch('/api/yedek?islem=liste', {
        headers: t ? { authorization: `Bearer ${t}` } : {},
        cache: 'no-store',
      });
      const j: any = await r.json().catch(() => null);
      if (j?.ok) setYedekler(j.yedekler || []);
    } catch { /* yoksay */ }
  }, [token]);

  const getir = useCallback(async () => {
    setYukleniyor(true);
    setHata('');
    try {
      // 1) Migration kayıtları
      const m = await supabase.from('schema_migrations').select('dosya,uygulandi_at,not').order('uygulandi_at', { ascending: false });
      if (m.error) {
        setMigrationYok(true);
        setMigrations([]);
      } else {
        setMigrationYok(false);
        setMigrations((m.data as any[]) || []);
      }

      // 2) Canlı sayaçlar
      const tablolar = ['cranes', 'customers', 'completed_services', 'offers', 'musteri_hesaplar'];
      const sonuclar = await Promise.all(
        tablolar.map((t) => supabase.from(t).select('id', { count: 'exact', head: true }))
      );
      const s: Record<string, number> = {};
      tablolar.forEach((t, i) => { s[t] = Number(sonuclar[i].count) || 0; });
      setSayilar(s);

      // 3) Hatırlatma durumu
      const [hg, bk] = await Promise.all([
        supabase.from('hatirlatma_gonderim').select('created_at').order('created_at', { ascending: false }).limit(1),
        supabase.from('bildirim_kuyrugu').select('id', { count: 'exact', head: true }).eq('durum', 'bekliyor'),
      ]);
      setSonHatirlatma(((hg.data as any[]) || [])[0]?.created_at || '');
      setBekleyenBildirim(Number(bk.count) || 0);

      // 4) Yedekler
      await yedekleriGetir();
    } catch (e: any) {
      setHata(e?.message || 'Veri alınamadı');
    } finally {
      setYukleniyor(false);
    }
  }, [yedekleriGetir]);

  useEffect(() => { getir(); }, [getir]);

  useEffect(() => {
    if (!mesaj) return;
    const z = setTimeout(() => setMesaj(''), 8000);
    return () => clearTimeout(z);
  }, [mesaj]);

  const yedekAl = async () => {
    if (islem) return;
    setIslem('yedek');
    setMesaj('');
    try {
      const t = await token();
      const r = await fetch('/api/yedek', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) },
      });
      const j: any = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) { setMesaj('❌ ' + (j?.mesaj || 'Yedek alınamadı')); return; }
      setMesaj(`✅ ${j.mesaj} · ${j.boyut_mb} MB`);
      await yedekleriGetir();
    } catch (e: any) {
      setMesaj('❌ ' + (e?.message || 'Hata'));
    } finally {
      setIslem('');
    }
  };

  const yedekIndir = async (dosya: string) => {
    setIslem('indir:' + dosya);
    try {
      const t = await token();
      const r = await fetch(`/api/yedek?islem=indir&dosya=${encodeURIComponent(dosya)}`, {
        headers: t ? { authorization: `Bearer ${t}` } : {},
      });
      const j: any = await r.json().catch(() => null);
      if (!j?.ok || !j.url) { setMesaj('❌ ' + (j?.mesaj || 'İndirme linki alınamadı')); return; }
      window.open(j.url, '_blank', 'noopener');
    } finally {
      setIslem('');
    }
  };

  const isaretle = async (dosya: string) => {
    if (!dosya.trim()) return;
    setIslem('isaret:' + dosya);
    try {
      const { data, error } = await supabase.rpc('migration_isaretle', {
        p_dosya: dosya.trim(),
        p_not: 'panelden işaretlendi',
      });
      if (error) { setMesaj('❌ ' + error.message); return; }
      if (!(data as any)?.ok) { setMesaj('❌ ' + ((data as any)?.mesaj || 'Kaydedilemedi')); return; }
      setMesaj('✅ ' + (data as any).mesaj);
      setManuelDosya('');
      await getir();
    } finally {
      setIslem('');
    }
  };

  const kayitliSet = new Set(migrations.map((m) => m.dosya));
  const maxKayit = migrations.reduce((m, k) => Math.max(m, no(k.dosya)), 0);
  // Sezgisel: en yüksek kayıtlı numaradan büyük olan ve kayıtlı olmayan dosyalar bekliyor sayılır
  const bekleyen = (sqlDosyalari as string[]).filter((f) => no(f) > maxKayit && !kayitliSet.has(f));

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-8 font-sans text-slate-800 pb-28 lg:pb-8">

      {/* ÜST BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-slate-800 flex items-center gap-2.5">
            <ShieldCheck className="text-slate-700" size={30} /> SİSTEM &amp; YEDEK
          </h1>
          <p className="text-slate-500 text-xs md:text-sm mt-0.5">
            Migration takibi · veri yedeği · canlı sayaçlar
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
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
        </div>
      )}

      {/* ÖZET */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { e: 'SQL DOSYASI', v: (sqlDosyalari as string[]).length, alt: 'repoda', r: 'slate' },
          { e: 'KAYITLI', v: migrations.length, alt: 'migration', r: 'emerald' },
          { e: 'BEKLEYEN', v: bekleyen.length, alt: 'çalıştırılacak', r: bekleyen.length > 0 ? 'amber' : 'emerald' },
          { e: 'YEDEK', v: yedekler.length, alt: yedekler[0] ? 'son: ' + zaman(yedekler[0].tarih) : 'henüz yok', r: yedekler.length > 0 ? 'teal' : 'rose' },
        ].map((k, i) => {
          const r: Record<string, string> = {
            slate: 'bg-slate-50 border-slate-200 text-slate-700',
            emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
            amber: 'bg-amber-50 border-amber-200 text-amber-700',
            teal: 'bg-teal-50 border-teal-200 text-teal-700',
            rose: 'bg-rose-50 border-rose-200 text-rose-700',
          };
          return (
            <div key={i} className={`rounded-3xl border p-4 ${r[k.r]}`}>
              <p className="text-[10px] font-black uppercase tracking-wider">{k.e}</p>
              <p className="text-2xl md:text-3xl font-black mt-1 leading-none">{k.v}</p>
              <p className="text-[10px] font-bold mt-1.5 opacity-70 truncate">{k.alt}</p>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-3">

        {/* ─── MIGRATION ─── */}
        <div className="bg-white rounded-3xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 grid place-items-center shrink-0">
              <FileCode2 size={16} />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-slate-800">Migration Takibi</h2>
              <p className="text-[10px] font-medium text-slate-400">Hangi SQL çalıştı, hangisi bekliyor</p>
            </div>
          </div>

          {migrationYok ? (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5">
              <p className="text-[11px] font-black text-amber-800 flex items-center gap-1.5">
                <AlertTriangle size={13} /> Migration tablosu yok
              </p>
              <p className="text-[10px] font-medium text-amber-700 mt-1 leading-relaxed">
                <code className="bg-white px-1 rounded">sql/205-migration-kaydi.sql</code> dosyasını Supabase
                SQL Editor’de çalıştır → bu bölüm açılır.
              </p>
            </div>
          ) : (
            <>
              {/* BEKLEYENLER */}
              <div className="mb-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                  Bekleyen ({bekleyen.length})
                </p>
                {bekleyen.length === 0 ? (
                  <p className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Tüm SQL dosyaları kayıtlı görünüyor
                  </p>
                ) : (
                  <div className="space-y-1">
                    {bekleyen.map((f) => (
                      <div key={f} className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-2.5 py-2">
                        <p className="text-[10px] font-black text-amber-800 truncate flex-1">{f}</p>
                        <button onClick={() => isaretle(f)} disabled={!!islem}
                          className="shrink-0 px-2 py-1 rounded-lg bg-white border border-amber-300 text-[9px] font-black text-amber-700 disabled:opacity-50">
                          {islem === 'isaret:' + f ? '...' : 'İŞARETLE'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SON KAYITLAR */}
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Son kayıtlar</p>
              <div className="rounded-2xl border border-slate-200 overflow-hidden max-h-56 overflow-y-auto">
                {migrations.length === 0 ? (
                  <p className="text-[10px] font-bold text-slate-400 p-3">Henüz kayıt yok</p>
                ) : migrations.slice(0, 40).map((m) => (
                  <div key={m.dosya} className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-100 last:border-0">
                    <CheckCircle2 size={11} className="text-emerald-600 shrink-0" />
                    <p className="text-[10px] font-bold text-slate-600 truncate flex-1">{m.dosya}</p>
                    <p className="text-[9px] font-bold text-slate-400 shrink-0">{zaman(m.uygulandi_at)}</p>
                  </div>
                ))}
              </div>

              {/* MANUEL */}
              <div className="mt-3 flex gap-1.5">
                <input value={manuelDosya} onChange={(e) => setManuelDosya(e.target.value)}
                  list="sql-dosyalari"
                  placeholder="Dosya adı (örn: 206-yeni.sql)"
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:border-slate-400" />
                <datalist id="sql-dosyalari">
                  {(sqlDosyalari as string[]).map((f) => <option key={f} value={f} />)}
                </datalist>
                <button onClick={() => isaretle(manuelDosya)} disabled={!manuelDosya.trim() || !!islem}
                  className="px-3 py-2 rounded-xl bg-slate-900 text-white text-[9px] font-black disabled:opacity-40">
                  KAYDET
                </button>
              </div>
              <p className="text-[9px] font-medium text-slate-400 mt-2 leading-relaxed">
                Sezgisel: en yüksek kayıtlı numaradan büyük dosyalar “bekliyor” sayılır. Yeni SQL dosyasının
                sonuna <code className="bg-slate-100 px-1 rounded">migration_isaretle('…')</code> eklemeyi unutma.
              </p>
            </>
          )}
        </div>

        {/* ─── YEDEK ─── */}
        <div className="bg-white rounded-3xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 grid place-items-center shrink-0">
              <HardDriveDownload size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-black text-slate-800">Veri Yedeği</h2>
              <p className="text-[10px] font-medium text-slate-400">Kritik tablolar → özel bucket (JSON)</p>
            </div>
            <button onClick={yedekAl} disabled={!!islem}
              className="shrink-0 px-3 py-2 rounded-xl bg-teal-600 text-white text-[9px] font-black flex items-center gap-1 disabled:opacity-50 hover:bg-teal-700 transition">
              {islem === 'yedek' ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />} YEDEK AL
            </button>
          </div>

          {yedekler.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-center">
              <Database className="text-slate-300 mx-auto mb-2" size={22} />
              <p className="text-[11px] font-black text-slate-500">Henüz yedek yok</p>
              <p className="text-[10px] font-medium text-slate-400 mt-1">
                “YEDEK AL” ile ilk yedeği oluştur.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 overflow-hidden max-h-60 overflow-y-auto">
              {yedekler.map((y) => (
                <div key={y.dosya} className="flex items-center gap-2 px-2.5 py-2 border-b border-slate-100 last:border-0">
                  <Database size={12} className="text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-slate-700 truncate">{y.ad}</p>
                    <p className="text-[9px] font-bold text-slate-400">{zaman(y.tarih)} · {boyutYazi(y.boyut)}</p>
                  </div>
                  <button onClick={() => yedekIndir(y.dosya)} disabled={!!islem}
                    className="shrink-0 p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 disabled:opacity-50">
                    {islem === 'indir:' + y.dosya ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-[9px] font-medium text-slate-400 mt-2 leading-relaxed">
            Yedekler <b>özel</b> bucket’ta (<code className="bg-slate-100 px-1 rounded">yedekler</code>) tutulur;
            indirme 5 dakikalık imzalı link ile yapılır. Otomatik günlük yedek için Vercel’de
            <code className="bg-slate-100 px-1 rounded">CRON_SECRET</code> tanımlı olmalı.
          </p>
        </div>

        {/* ─── CANLI SAYAÇLAR ─── */}
        <div className="bg-white rounded-3xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 grid place-items-center shrink-0">
              <Database size={16} />
            </span>
            <div>
              <h2 className="text-sm font-black text-slate-800">Canlı Veri</h2>
              <p className="text-[10px] font-medium text-slate-400">Tablolardaki güncel kayıt sayısı</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(sayilar).map(([t, n]) => (
              <div key={t} className="rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-wide truncate">{t}</p>
                <p className="text-lg font-black text-slate-800 leading-tight">{n.toLocaleString('tr-TR')}</p>
              </div>
            ))}
          </div>
          <p className="text-[9px] font-medium text-slate-400 mt-2">
            Yedek alınırken bu tablolar JSON’a yazılır (yedekleyici 16 tablo dener).
          </p>
        </div>

        {/* ─── MOTOR DURUMU ─── */}
        <div className="bg-white rounded-3xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 grid place-items-center shrink-0">
              <Bell size={16} />
            </span>
            <div>
              <h2 className="text-sm font-black text-slate-800">Hatırlatma Motoru</h2>
              <p className="text-[10px] font-medium text-slate-400">Son üretim + bekleyen push</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2.5">
              <span className="text-[10px] font-black text-slate-500 uppercase">Son hatırlatma</span>
              <span className="text-[11px] font-black text-slate-800">{sonHatirlatma ? zaman(sonHatirlatma) : 'hiç yok'}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2.5">
              <span className="text-[10px] font-black text-slate-500 uppercase">Bekleyen bildirim</span>
              <span className="text-[11px] font-black text-slate-800">{bekleyenBildirim}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Link href="/admin/hatirlatmalar" className="text-[10px] font-black bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-600 hover:bg-slate-100 flex items-center gap-1">
              <Bell size={12} /> Hatırlatmalar
            </Link>
            <Link href="/admin/veri-sagligi" className="text-[10px] font-black bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-600 hover:bg-slate-100 flex items-center gap-1">
              <ShieldCheck size={12} /> Veri Sağlığı
            </Link>
          </div>
        </div>
      </div>

      {/* BİLGİ */}
      <div className="mt-4 bg-white rounded-3xl border border-slate-200 p-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Info size={12} /> Yeni SQL ekleme kuralı
        </p>
        <p className="text-[11px] font-medium text-slate-500 mt-2 leading-relaxed">
          <b>sql/</b> klasörüne yeni dosya ekledikten sonra <code className="bg-slate-100 px-1 rounded">npm run sql:liste</code>
          &nbsp;çalıştır (envanteri yeniler), dosyanın sonuna da şu bloğu koy — böylece çalıştırıldığı an kaydolur:
        </p>
        <pre className="mt-2 bg-slate-900 text-slate-100 rounded-2xl p-3 text-[10px] leading-relaxed overflow-x-auto">
{`do $$
begin
  perform public.migration_isaretle('206-yeni-dosya.sql', 'kısa not');
exception when others then
  raise notice 'migration kaydı atlandı';
end $$;`}
        </pre>
        <p className="text-[10px] font-black text-slate-400 mt-3">
          NOT: Tüm tutarlar KDV hariçtir (tek istisna depo ekranındaki KDV'li hesaplayıcı).
        </p>
      </div>
    </div>
  );
}
