import { NextRequest, NextResponse } from 'next/server';
import { adminMi, yetkiYok } from '@/lib/api-yetki';
import { FiyatHatasi, malzemeFiyatlariArastir } from '@/lib/fiyatMotoruAi';
import { malzemeFiyatlariniArastir, MAKS_MALZEME } from '@/lib/fiyatArastir';
import { kitapAra, kitapYaz } from '@/lib/fiyatKitabi';

// ----------------------------------------------------------------------------
// 💰 MALZEME FİYAT ARAŞTIRMASI — ÜCRETSİZ kaynaklar öncelikli (ücretli API YOK)
// ----------------------------------------------------------------------------
//  ZİNCİR:  1) FİYAT KİTABI (sql/209)  → anında, ücretsiz, doğru  (KİTAP)
//           2) ÜCRETSİZ WEB (lib/malzemeFiyatWeb.ts)
//              SearXNG · DuckDuckGo HTML/Lite · Bing · n11 · Akakçe
//              + ürün sayfalarından JSON-LD fiyat okuma          (WEB)
//           3) AI TAHMİNİ — yalnızca son çare, grounding YOK     (TAHMİNİ)
//
//  İş mantığı: lib/fiyatArastir.ts · web arama: lib/malzemeFiyatWeb.ts
//              kitap: lib/fiyatKitabi.ts · AI: lib/fiyatMotoruAi.ts
//
//  GİRDİ : { malzemeler: [{ ad, adet }], is_tipi?, musteri? }
//          { action: 'kaydet', ad, birim_fiyat, kaynak?, kaynak_url? }  ← elle
//  ÇIKTI : { ok, satirlar:[{ ad, adet, birim_fiyat, toplam, kaynak, guven,
//                            bulundu, kaynak_notu, kaynak_url, kaynaklar[],
//                            min, maks, kaynak_sayisi, kdv_notu }],
//            kitap, web, ai, sure_ms, uyari, kdv_haric }
//
//  ⚠️ TÜM TUTARLAR KDV HARİÇ. Fiyat bulunamayan satır 0 DEĞİL → birim_fiyat null.
//  ⚠️ Satırlar 4'lü gruplar halinde PARALEL aranır; toplam süre 30 sn'yi geçmez.
//  ⚠️ Dış istek hatası ekranı çökertmez (elle girişe düşer).
// ----------------------------------------------------------------------------

export const runtime = 'nodejs';
// Ekran 40 sn'de kesiyor; sunucu bütçesi 30 sn (lib/fiyatArastir.ts).
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const yetki = await adminMi(req);
  if (!yetki.ok) return yetkiYok();

  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim() || null;

  let govde: any;
  try {
    govde = await req.json();
  } catch {
    return NextResponse.json({ ok: false, mesaj: 'Geçersiz istek.' }, { status: 400 });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  ELLE FİYAT KAYDI — "✔ Bu fiyatı kaydet" → fiyat kitabı (kaynak: elle)
  // ══════════════════════════════════════════════════════════════════════════
  if (govde?.action === 'kaydet') {
    const ad = String(govde?.ad || '').trim();
    const birim = Number(govde?.birim_fiyat);
    if (ad.length < 2) {
      return NextResponse.json({ ok: false, mesaj: 'Malzeme adı en az 2 karakter olmalı.' }, { status: 400 });
    }
    if (!(birim > 0) || !Number.isFinite(birim)) {
      return NextResponse.json({ ok: false, mesaj: 'Kaydedilecek fiyat 0 olamaz.' }, { status: 400 });
    }

    const kaynak = govde?.kaynak === 'elle' ? 'elle' : (govde?.kaynak === 'kitap' ? 'kitap' : 'web');
    const sonuc = await kitapYaz({
      ad,
      birim_fiyat: Math.round(birim * 100) / 100,
      kaynak,
      kaynak_url: govde?.kaynak_url ? String(govde.kaynak_url) : null,
      adet_birimi: 'adet',
    }, token);

    return NextResponse.json(
      sonuc.ok
        ? { ok: true, mesaj: 'Fiyat kitaba kaydedildi (KDV hariç). Sonraki aramada bu fiyat kullanılacak.' }
        : { ok: false, mesaj: sonuc.mesaj || 'Fiyat kitaba kaydedilemedi (209 SQL çalıştırıldı mı?).' }
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  ARAŞTIRMA
  // ══════════════════════════════════════════════════════════════════════════
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

  const malzemeler = hamListe
    .map((m: any) => ({
      ad: String(m?.ad || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      adet: Math.max(1, Math.min(999, Math.round(Number(m?.adet) || 1))),
    }))
    .filter((m: { ad: string }) => m.ad.length > 1);

  if (malzemeler.length === 0) {
    return NextResponse.json(
      { ok: false, mesaj: 'Malzeme adı en az 2 karakter olmalı.' },
      { status: 400 }
    );
  }

  try {
    const sonuc = await malzemeFiyatlariniArastir(
      {
        malzemeler,
        is_tipi: typeof govde?.is_tipi === 'string' ? govde.is_tipi : null,
        musteri: typeof govde?.musteri === 'string' ? govde.musteri : null,
      },
      {
        // 1) FİYAT KİTABI (209) — tablo yoksa boş döner, akış devam eder
        kitapOku: (adlar) => kitapAra(adlar, token).then((m) => {
          const cikti = new Map<string, any>();
          m.forEach((v, k) => cikti.set(k, {
            birim_fiyat: v.birim_fiyat,
            kaynak: v.kaynak,
            kaynak_url: v.kaynak_url,
            guncelleme: v.guncelleme,
            kullanim_sayisi: v.kullanim_sayisi,
          }));
          return cikti;
        }),
        kitapYaz: (kayit) => kitapYaz(kayit, token),

        // 3) AI TAHMİNİ — yalnızca son çare (grounding DENENMEZ: 429 veriyor)
        aiAra: async ({ malzemeler: liste, is_tipi, musteri, butceMs }) => {
          const cevap = await malzemeFiyatlariArastir({
            malzemeler: liste,
            is_tipi,
            musteri,
            butceMs,
            sadeceTahmin: true,
          });
          return {
            satirlar: cevap.satirlar.map((s) => ({
              ad: s.ad,
              birim_fiyat: s.birim_fiyat,
              guven: s.guven,
              bulundu: s.bulundu,
            })),
            saglayici: cevap.saglayici,
            model: cevap.model,
          };
        },
      }
    );

    console.log(
      `[malzeme-fiyat] ${sonuc.satirlar.length} satır · kitap=${sonuc.kitap.bulunan} ` +
        `web=${sonuc.web.bulunan} tahmini=${sonuc.ai.satir} · kitaba yazılan=${sonuc.kitap.yazilan} · ` +
        `${sonuc.sure_ms}ms · web kaynakları: ${sonuc.web.cevap_veren.join(',') || '-'}`
    );

    return NextResponse.json({ ok: true, ...sonuc, kdv_haric: true });
  } catch (e: any) {
    if (e instanceof FiyatHatasi) {
      console.error('[malzeme-fiyat] başarısız →', e.message, e.ayrinti);
      return NextResponse.json(
        { ok: false, mesaj: e.message, ayrinti: e.ayrinti },
        { status: e.kod === 'gecersiz' ? 400 : 502 }
      );
    }

    console.error('[malzeme-fiyat] beklenmeyen hata →', e);
    return NextResponse.json(
      { ok: false, mesaj: 'Fiyat araştırması sırasında beklenmeyen bir hata oluştu. Fiyatları elle girebilirsiniz.' },
      { status: 500 }
    );
  }
}
