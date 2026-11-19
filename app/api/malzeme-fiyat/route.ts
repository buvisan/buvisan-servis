import { NextRequest, NextResponse } from 'next/server';
import { adminMi, yetkiYok } from '@/lib/api-yetki';
import {
  FiyatHatasi,
  MAKS_MALZEME,
  malzemeFiyatlariArastir,
  type MalzemeGirdi,
} from '@/lib/fiyatMotoruAi';

// ----------------------------------------------------------------------------
// 💰 MALZEME FİYAT ARAŞTIRMASI (Google Search grounding + tahmin yedeği)
// ----------------------------------------------------------------------------
//  GİRDİ : { malzemeler: [{ ad, adet }], is_tipi?, musteri? }
//  ÇIKTI : { ok, satirlar: [{ ad, adet, birim_fiyat, toplam, kaynak, guven,
//                             bulundu, kaynak_notu, kaynak_url }],
//            saglayici, model, google_grounding, sure_ms, uyari }
//
//  ⚠️ Tüm fiyatlar TL ve KDV HARİÇ.
//  ⚠️ Fiyat bulunamayan satır 0 DEĞİL → birim_fiyat: null, bulundu: false.
//  ⚠️ Anahtar koda yazılmaz; GOOGLE_GENERATIVE_AI_API_KEY (ve yedekler)
//     process.env'den okunur. Anahtar yoksa çökmez, Türkçe yönlendirme döner.
//  ⚠️ Sağlayıcı seçimi / grounding / tahmin zinciri: lib/fiyatMotoruAi.ts
// ----------------------------------------------------------------------------

export const runtime = 'nodejs';
// Ekran 40 sn'de kesiyor; sunucu bütçesi 38 sn (lib/fiyatMotoruAi.ts).
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const yetki = await adminMi(req);
  if (!yetki.ok) return yetkiYok();

  let govde: any;
  try {
    govde = await req.json();
  } catch {
    return NextResponse.json({ ok: false, mesaj: 'Geçersiz istek.' }, { status: 400 });
  }

  const hamListe = Array.isArray(govde?.malzemeler) ? govde.malzemeler : null;
  if (!hamListe || hamListe.length === 0) {
    return NextResponse.json({ ok: false, mesaj: 'Malzeme listesi boş.' }, { status: 400 });
  }
  if (hamListe.length > MAKS_MALZEME) {
    return NextResponse.json(
      { ok: false, mesaj: `Tek seferde en fazla ${MAKS_MALZEME} malzeme araştırılabilir.` },
      { status: 400 }
    );
  }

  const malzemeler: MalzemeGirdi[] = hamListe
    .map((m: any) => ({ ad: String(m?.ad || ''), adet: Number(m?.adet) || 1 }))
    .filter((m: MalzemeGirdi) => m.ad.trim().length > 1);

  if (malzemeler.length === 0) {
    return NextResponse.json(
      { ok: false, mesaj: 'Malzeme adı en az 2 karakter olmalı.' },
      { status: 400 }
    );
  }

  try {
    const sonuc = await malzemeFiyatlariArastir({
      malzemeler,
      is_tipi: typeof govde?.is_tipi === 'string' ? govde.is_tipi : null,
      musteri: typeof govde?.musteri === 'string' ? govde.musteri : null,
    });

    console.log(
      `[malzeme-fiyat] ${sonuc.satirlar.length} satır · ${sonuc.saglayici}/${sonuc.model} · ` +
        `grounding=${sonuc.google_grounding} · ${sonuc.sure_ms}ms · ` +
        `bulunamayan=${sonuc.satirlar.filter((s) => !s.bulundu).length}`
    );

    return NextResponse.json({
      ok: true,
      satirlar: sonuc.satirlar,
      saglayici: sonuc.saglayici,
      model: sonuc.model,
      google_grounding: sonuc.google_grounding,
      sure_ms: sonuc.sure_ms,
      uyari: sonuc.uyari,
    });
  } catch (e: any) {
    if (e instanceof FiyatHatasi) {
      if (e.kod === 'gecersiz') {
        return NextResponse.json({ ok: false, mesaj: e.message }, { status: 400 });
      }
      // Anahtar yok → yapılandırma sorunu (ekran çökmemeli, elle girişe düşer)
      if (e.kod === 'anahtar-yok') {
        console.warn('[malzeme-fiyat] anahtar tanımlı değil');
        return NextResponse.json(
          { ok: false, anahtar_yok: true, mesaj: e.message },
          { status: 200 }
        );
      }
      console.error('[malzeme-fiyat] başarısız →', e.message, e.ayrinti);
      return NextResponse.json(
        { ok: false, mesaj: e.message, ayrinti: e.ayrinti },
        { status: 502 }
      );
    }

    console.error('[malzeme-fiyat] beklenmeyen hata →', e);
    return NextResponse.json(
      { ok: false, mesaj: 'Fiyat araştırması sırasında beklenmeyen bir hata oluştu. Fiyatları elle girebilirsiniz.' },
      { status: 500 }
    );
  }
}
