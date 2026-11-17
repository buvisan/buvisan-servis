import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminMi } from '@/lib/api-yetki';

// ----------------------------------------------------------------------------
// BUVİSAN - HATIRLATMA MOTORU API'si ⏰
// ----------------------------------------------------------------------------
//  GET  → Vercel Cron (her gün 06:00) çalıştırır
//  POST → Admin panelindeki "ŞİMDİ ÇALIŞTIR" düğmesi
//
//  1) hatirlatma_uret()  → bakım 7/1 gün + haftalık admin özeti kuyruğa girer
//  2) push-gonder       → kuyruktakiler cihazlara gönderilir
//
//  Yetki: CRON_SECRET (Bearer veya ?secret=) YA DA yönetici oturumu.
//  Secret tanımlı değilse (kurulmamışsa) cron çalışsın diye izin verilir;
//  mevcut /api/push-gonder da aynı davranışı kullanıyor.
// ----------------------------------------------------------------------------

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

function cronMu(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return true;
  const header = req.headers.get('authorization') || '';
  const q = req.nextUrl.searchParams.get('secret') || '';
  return header === `Bearer ${secret}` || q === secret;
}

async function calistir(req: NextRequest) {
  const cron = cronMu(req);
  if (!cron) {
    const admin = await adminMi(req);
    if (!admin.ok) {
      return NextResponse.json({ ok: false, mesaj: 'Yetkisiz' }, { status: 401 });
    }
  }

  // 1) Hatırlatmaları üret
  const { data, error } = await db.rpc('hatirlatma_uret');
  if (error) {
    return NextResponse.json(
      {
        ok: false,
        mesaj:
          error.message.includes('does not exist') || error.code === 'PGRST202'
            ? 'hatirlatma_uret() bulunamadı → sql/204-hatirlatma-motoru.sql çalıştırılmalı.'
            : error.message,
      },
      { status: 500 }
    );
  }

  const uretim = (data as any) || {};

  // 2) Kuyruğa girenleri push olarak gönder
  let push: any = null;
  if ((uretim.toplam || 0) > 0) {
    try {
      const secret = process.env.CRON_SECRET || '';
      const r = await fetch(new URL('/api/push-gonder', req.nextUrl.origin), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(secret ? { authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({ limit: 60 }),
        cache: 'no-store',
      });
      push = await r.json().catch(() => null);
    } catch (e: any) {
      push = { ok: false, mesaj: e?.message || 'Push gönderilemedi' };
    }
  }

  return NextResponse.json({ ...uretim, push });
}

export async function GET(req: NextRequest) {
  return calistir(req);
}

export async function POST(req: NextRequest) {
  return calistir(req);
}
