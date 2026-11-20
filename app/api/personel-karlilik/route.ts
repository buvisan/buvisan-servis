import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminMi } from '@/lib/api-yetki';
import {
  karlilikHesapla,
  ayBaslangic,
  aySonraki,
  type HamIs,
  type HamMalzeme,
  type HamMaas,
  type HamProfil,
  type HamRandevu,
  type HamRapor,
} from '@/lib/personel-karlilik';

// ============================================================================
//  💰 PERSONEL KÂRLILIK / MALİYET ANALİZİ — TEK HESAP UÇU
// ----------------------------------------------------------------------------
//  GET /api/personel-karlilik?personel=VEYSEL%20ÇARKLI&ay=2026-01
//
//  • Sadece yönetici (profiles.role = 'admin') — prim/maaş/maliyet bilgisi
//    personelin kendi ekranında GÖRÜNMEZ.
//  • Kullanıcının kendi jetonuyla okunur → RLS yönetici kuralları geçerli.
//  • Hesap istemcide DEĞİL, lib/personel-karlilik.ts içinde tek yerde.
//  • Okunan tablolar: completed_services (ciro), service_reports (saklı
//    maliyet), materials (güncel alış fiyatı), personel_maas (kişi maaşı),
//    randevular (personel/plan), profiles (kimlik eşleşmesi).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAYFA = 1000; // PostgREST varsayılan satır sınırı
const EN_FAZLA_SAYFA = 20;

type Sonuc<T> = { data: T[]; hata: string | null };

function gunEkle(iso: string, gun: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + gun);
  return d.toISOString().slice(0, 10);
}

/** Sayfa sayfa okur — 1000 satır sınırına takılmaz. */
async function sayfali(
  supabase: any,
  tablo: string,
  kolonlar: string,
  kur: (q: any) => any
): Promise<Sonuc<any>> {
  const tum: any[] = [];
  for (let i = 0; i < EN_FAZLA_SAYFA; i++) {
    let q = supabase.from(tablo).select(kolonlar);
    q = kur(q).range(i * SAYFA, i * SAYFA + SAYFA - 1);
    const { data, error } = await q;
    if (error) return { data: tum, hata: `${tablo}: ${error.message}` };
    const dizi = Array.isArray(data) ? data : [];
    tum.push(...dizi);
    if (dizi.length < SAYFA) return { data: tum, hata: null };
  }
  return { data: tum, hata: `${tablo}: satır sınırı aşıldı (${EN_FAZLA_SAYFA * SAYFA})` };
}

async function inCek(
  supabase: any,
  tablo: string,
  kolonlar: string,
  alan: string,
  degerler: string[]
): Promise<Sonuc<any>> {
  const temiz = Array.from(new Set(degerler.filter(Boolean)));
  if (temiz.length === 0) return { data: [], hata: null };
  const tum: any[] = [];
  const parca = 150;
  for (let i = 0; i < temiz.length; i += parca) {
    const { data, error } = await supabase
      .from(tablo)
      .select(kolonlar)
      .in(alan, temiz.slice(i, i + parca))
      .limit(SAYFA);
    if (error) return { data: tum, hata: `${tablo}: ${error.message}` };
    if (Array.isArray(data)) tum.push(...data);
  }
  return { data: tum, hata: null };
}

export async function GET(req: Request) {
  const yetki = await adminMi(req);
  if (!yetki.ok) {
    return NextResponse.json(
      { hata: 'Yetki yok. Bu analiz için yönetici girişi gerekir.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const url = new URL(req.url);
  const personel = (url.searchParams.get('personel') || '').trim();
  const ay = (url.searchParams.get('ay') || '').trim();

  if (!personel) {
    return NextResponse.json({ hata: 'personel parametresi zorunlu.' }, { status: 400 });
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ay)) {
    return NextResponse.json({ hata: 'ay parametresi YYYY-MM biçiminde olmalı.' }, { status: 400 });
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
  );

  const bas = ayBaslangic(ay);
  const son = ayBaslangic(aySonraki(ay));
  // Rapor, işten birkaç gün sonra kaydedilebilir → geniş pencere
  const raporBas = gunEkle(bas, -60);
  const raporSon = gunEkle(son, 60);

  const [islerQ, raporlarQ, malzemelerQ, maasQ, randevularQ, profillerQ, ayarQ, sirketQ] =
    await Promise.all([
      sayfali(
        supabase,
        'completed_services',
        'id, service_date, created_at, technician, customer_text, service_type, price, work_hours, materials, materials_text, currency, form_number',
        (q: any) => q.gte('service_date', bas).lt('service_date', son).order('service_date', { ascending: true }).order('id', { ascending: true })
      ),
      sayfali(
        supabase,
        'service_reports',
        'id, ticket_id, finans_kayit_id, personel_adi, firma_adi, degisen_parcalar, malzeme_tutari, sure_dakika, created_at, islem_turu',
        (q: any) => q.gte('created_at', raporBas).lt('created_at', raporSon).order('created_at', { ascending: true }).order('id', { ascending: true })
      ),
      sayfali(supabase, 'materials', 'id, name, buy_price', (q: any) => q.order('id', { ascending: true })),
      sayfali(supabase, 'personel_maas', 'personel, maas, aktif', (q: any) => q.order('personel', { ascending: true })),
      sayfali(
        supabase,
        'randevular',
        'id, ticket_id, atanan_personel, randevu_tarihi, durum, musteri_adi, is_tipi',
        (q: any) => q.gte('randevu_tarihi', bas).lt('randevu_tarihi', son).order('randevu_tarihi', { ascending: true }).order('id', { ascending: true })
      ),
      sayfali(supabase, 'profiles', 'id, full_name, role', (q: any) => q.order('id', { ascending: true })),
      supabase.rpc('maliyet_ayar'),
      supabase.rpc('saatlik_iscilik_maliyeti', { p_ay: ay }),
    ]);

  if (islerQ.hata) {
    return NextResponse.json(
      { hata: 'İş kayıtları okunamadı.', detay: islerQ.hata },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const isler = (islerQ.data ?? []) as HamIs[];
  const kaynakHatalari: string[] = [];
  if (raporlarQ.hata) kaynakHatalari.push(raporlarQ.hata);
  if (malzemelerQ.hata) kaynakHatalari.push(malzemelerQ.hata);
  if (maasQ.hata) kaynakHatalari.push(maasQ.hata);
  if (randevularQ.hata) kaynakHatalari.push(randevularQ.hata);
  if (profillerQ.hata) kaynakHatalari.push(profillerQ.hata);

  // İşe bağlı raporlar tarih penceresi dışında kalmış olabilir → kimlikle de çek
  const finansIdler = isler.map((i) => String(i.id)).filter(Boolean);
  const raporKimlik = await inCek(
    supabase,
    'service_reports',
    'id, ticket_id, finans_kayit_id, personel_adi, firma_adi, degisen_parcalar, malzeme_tutari, sure_dakika, created_at, islem_turu',
    'finans_kayit_id',
    finansIdler
  );
  if (raporKimlik.hata) kaynakHatalari.push(raporKimlik.hata);

  const raporHaritasi = new Map<string, HamRapor>();
  for (const r of [...(raporlarQ.data ?? []), ...(raporKimlik.data ?? [])] as HamRapor[]) {
    if (r?.id) raporHaritasi.set(String(r.id), r);
  }
  const raporlar = Array.from(raporHaritasi.values());

  const ayar = (ayarQ?.error ? null : ayarQ?.data) as { sgk_katsayisi?: number; aylik_saat?: number } | null;
  const sirketSaatlik = sirketQ?.error ? null : (Number(sirketQ?.data) || null);

  const sonuc = karlilikHesapla({
    personel,
    ay,
    isler,
    raporlar,
    malzemeler: (malzemelerQ.data ?? []) as HamMalzeme[],
    maaslar: (maasQ.data ?? []) as HamMaas[],
    randevular: (randevularQ.data ?? []) as HamRandevu[],
    profiller: (profillerQ.data ?? []) as HamProfil[],
    ayar,
    sirketSaatlik,
    kaynakSayilari: {
      completed_services: isler.length,
      service_reports: raporlar.length,
      materials: (malzemelerQ.data ?? []).length,
      personel_maas: (maasQ.data ?? []).length,
      randevular: (randevularQ.data ?? []).length,
      profiles: (profillerQ.data ?? []).length,
    },
  });

  return NextResponse.json(
    { ok: true, ...sonuc, kaynak_hatalari: kaynakHatalari },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
