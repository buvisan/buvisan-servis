import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminMi } from '@/lib/api-yetki';

// ----------------------------------------------------------------------------
// BUVİSAN - YEDEK API'si 💾
// ----------------------------------------------------------------------------
//  Kritik tabloları JSON olarak dışa aktarır ve ÖZEL (private) "yedekler"
//  bucket'ına yükler. İndirme sadece kısa ömürlü imzalı link ile yapılır.
//
//  POST                → yeni yedek al   (admin oturumu veya CRON_SECRET)
//  GET  ?islem=liste   → son yedekler    (admin oturumu veya CRON_SECRET)
//  GET  ?islem=indir&dosya=... → imzalı indirme linki (5 dk)
//
//  ⚠️ Burada AÇIK erişim YOK. CRON_SECRET tanımlı değilse otomatik yedek
//     çalışmaz (Vercel cron jeton gönderemez) — elle "YEDEK AL" kullanılır.
// ----------------------------------------------------------------------------

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'yedekler';
const KLASOR = 'yedek';

/** Yedeklenecek tablolar (olmayan tablo atlanır) */
const TABLOLAR = [
  'cranes',
  'customers',
  'completed_services',
  'service_reports',
  'bakim_formlari',
  'bakim_plani',
  'maintenance_contracts',
  'offers',
  'satislar',
  'musteri_hesaplar',
  'musteri_sohbet',
  'musteri_telefon_izinleri',
  'cari_tahsilatlar',
  'schema_migrations',
  'hatirlatma_gonderim',
  'bildirim_kuyrugu',
];

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

async function yetkiliMi(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET || '';
  if (secret) {
    const h = req.headers.get('authorization') || '';
    if (h === `Bearer ${secret}`) return true;
    if (req.nextUrl.searchParams.get('secret') === secret) return true;
  }
  const admin = await adminMi(req);
  return admin.ok;
}

async function bucketHazirla() {
  try {
    const { error } = await db.storage.createBucket(BUCKET, { public: false });
    // zaten varsa hata döner → yoksay
    if (error && !/already exists|duplicate/i.test(error.message)) {
      return error.message;
    }
  } catch { /* yoksay */ }
  return null;
}

function dosyaAdi() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${KLASOR}/${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.json`;
}

async function yedekAl() {
  const bucketHata = await bucketHazirla();
  if (bucketHata) {
    return NextResponse.json({ ok: false, mesaj: 'Bucket hazırlanamadı: ' + bucketHata }, { status: 500 });
  }

  const sonuc = await Promise.all(
    TABLOLAR.map(async (tablo) => {
      try {
        const { data, error } = await db.from(tablo).select('*').limit(50000);
        if (error) return { tablo, ok: false as const, hata: error.message };
        return { tablo, ok: true as const, satirlar: data || [] };
      } catch (e: any) {
        return { tablo, ok: false as const, hata: e?.message || 'okunamadı' };
      }
    })
  );

  const tablolar: Record<string, any[]> = {};
  const sayilar: Record<string, number> = {};
  const atlanan: string[] = [];

  for (const s of sonuc) {
    if (s.ok) {
      tablolar[s.tablo] = s.satirlar;
      sayilar[s.tablo] = s.satirlar.length;
    } else {
      atlanan.push(`${s.tablo}: ${s.hata}`);
    }
  }

  const icerik = {
    meta: {
      tarih: new Date().toISOString(),
      surum: 'v1',
      kaynak: 'buvisan-servis',
      not: 'Tüm tutarlar KDV hariçtir.',
    },
    sayilar,
    atlanan,
    tablolar,
  };

  const metin = JSON.stringify(icerik);
  const boyut = Buffer.byteLength(metin, 'utf8');

  if (boyut > 25 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, mesaj: `Yedek çok büyük (${(boyut / 1048576).toFixed(1)} MB) — sınır 25 MB.` },
      { status: 413 }
    );
  }

  const ad = dosyaAdi();
  const { error: yuklemeHata } = await db.storage
    .from(BUCKET)
    .upload(ad, metin, { contentType: 'application/json', upsert: true });

  if (yuklemeHata) {
    return NextResponse.json({ ok: false, mesaj: 'Yüklenemedi: ' + yuklemeHata.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    dosya: ad,
    boyut,
    boyut_mb: Number((boyut / 1048576).toFixed(2)),
    tablo_sayisi: Object.keys(tablolar).length,
    toplam_satir: Object.values(sayilar).reduce((t, n) => t + n, 0),
    sayilar,
    atlanan,
    mesaj: `Yedek alındı · ${Object.keys(tablolar).length} tablo · ${Object.values(sayilar).reduce((t, n) => t + n, 0)} satır`,
  });
}

async function liste() {
  const bucketHata = await bucketHazirla();
  if (bucketHata) {
    return NextResponse.json({ ok: false, mesaj: bucketHata }, { status: 500 });
  }
  const { data, error } = await db.storage
    .from(BUCKET)
    .list(KLASOR, { limit: 50, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) return NextResponse.json({ ok: false, mesaj: error.message }, { status: 500 });

  const yedekler = (data || [])
    .filter((f) => (f.name || '').endsWith('.json'))
    .map((f) => ({
      dosya: `${KLASOR}/${f.name}`,
      ad: f.name,
      boyut: Number((f.metadata as any)?.size || 0),
      boyut_mb: Number((((f.metadata as any)?.size || 0) / 1048576).toFixed(2)),
      tarih: f.created_at || f.updated_at || null,
    }));

  return NextResponse.json({ ok: true, yedekler, adet: yedekler.length });
}

async function indir(dosya: string) {
  if (!dosya || !dosya.startsWith(`${KLASOR}/`)) {
    return NextResponse.json({ ok: false, mesaj: 'Geçersiz dosya adı' }, { status: 400 });
  }
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(dosya, 300);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ ok: false, mesaj: error?.message || 'Link oluşturulamadı' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, url: data.signedUrl });
}

export async function POST(req: NextRequest) {
  if (!(await yetkiliMi(req))) {
    return NextResponse.json({ ok: false, mesaj: 'Yetkisiz' }, { status: 401 });
  }
  try {
    return await yedekAl();
  } catch (e: any) {
    return NextResponse.json({ ok: false, mesaj: e?.message || 'Sunucu hatası' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!(await yetkiliMi(req))) {
    return NextResponse.json({ ok: false, mesaj: 'Yetkisiz' }, { status: 401 });
  }
  try {
    // Vercel Cron GET çağırır → parametresiz istek = YEDEK AL
    const islem = req.nextUrl.searchParams.get('islem') || 'al';
    if (islem === 'liste') {
      return await liste();
    }
    if (islem === 'indir') {
      return await indir(req.nextUrl.searchParams.get('dosya') || '');
    }
    return await yedekAl();
  } catch (e: any) {
    return NextResponse.json({ ok: false, mesaj: e?.message || 'Sunucu hatası' }, { status: 500 });
  }
}
