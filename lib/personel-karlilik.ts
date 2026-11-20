// ============================================================================
//  💰 PERSONEL KÂRLILIK MOTORU (tek hesap yeri)
// ----------------------------------------------------------------------------
//  Personel performans ekranında bir isme tıklanınca açılan panelin TÜM
//  hesabı burada yapılır. API ucu (app/api/personel-karlilik) yalnızca veri
//  okur ve bu saf fonksiyonu çağırır — istemcide dağınık hesap YOK.
//
//  DOĞRULUK İLKELERİ
//   1) Uydurma yok: bir kalemin/sürenin gerçek kaydı yoksa tahmin edilmez,
//      iş "maliyeti eksik" işaretlenir ve kâr toplamından ÇIKARILIR.
//   2) Maliyet önceliği:
//        a) service_reports.degisen_parcalar[].birim_maliyet  (kullanım anında
//           saklanmış gerçek alış maliyeti)
//        b) completed_services.materials[].birim_maliyet      (saklıysa)
//        c) materials.buy_price                                (GÜNCEL fiyat →
//           "güncel fiyattan hesaplandı" etiketi)
//   3) Çift sayım yok: ciro YALNIZCA completed_services'ten okunur.
//      service_reports sadece maliyet verir, offers (teklif) hiç sayılmaz.
//      Aynı iş iki kez kaydedilmişse form_no / rapor bağı ile tekilleştirilir.
//   4) Personel eşleştirme: Türkçe normalizasyon (İ/ı, ş, ğ, ü, ö, ç) +
//      "A - B" ekip ayrıştırma. Ortak iş her iki kişiye TAM yazılır, ayrı
//      sütunda raporlanır (şirket toplamında çift sayılmasın diye).
//   5) Ay sınırı: işin kendi tarihi (completed_services.service_date).
// ============================================================================

export const KDV_NOTU = 'KDV hariç';

// ---------------------------------------------------------------------------
// Ham satır tipleri (Supabase'den select ile okunan kolonlar)
// ---------------------------------------------------------------------------
export type HamIs = {
  id: string;
  service_date?: string | null;
  created_at?: string | null;
  technician?: string | null;
  customer_text?: string | null;
  service_type?: string | null;
  description?: string | null;
  price?: number | string | null;
  work_hours?: number | string | null;
  materials?: unknown;
  materials_text?: string | null;
  currency?: string | null;
  form_number?: string | null;
};

export type HamRapor = {
  id: string;
  ticket_id?: string | null;
  finans_kayit_id?: string | null;
  personel_adi?: string | null;
  firma_adi?: string | null;
  degisen_parcalar?: unknown;
  malzeme_tutari?: number | string | null;
  sure_dakika?: number | string | null;
  created_at?: string | null;
  islem_turu?: string | null;
};

export type HamMalzeme = {
  id: string;
  name?: string | null;
  buy_price?: number | string | null;
};

export type HamMaas = {
  personel: string;
  maas?: number | string | null;
  aktif?: boolean | null;
};

export type HamRandevu = {
  id: string;
  ticket_id?: string | null;
  atanan_personel?: string | null;
  randevu_tarihi?: string | null;
  durum?: string | null;
  musteri_adi?: string | null;
  is_tipi?: string | null;
};

export type HamProfil = {
  id: string;
  full_name?: string | null;
  role?: string | null;
};

export type HamAyar = {
  sgk_katsayisi?: number | string | null;
  aylik_saat?: number | string | null;
};

export type Girdi = {
  personel: string;
  ay: string;
  isler: HamIs[];
  raporlar: HamRapor[];
  malzemeler: HamMalzeme[];
  maaslar: HamMaas[];
  randevular: HamRandevu[];
  profiller: HamProfil[];
  ayar: HamAyar | null;
  sirketSaatlik: number | null;
  kaynakSayilari?: {
    completed_services?: number;
    service_reports?: number;
    materials?: number;
    personel_maas?: number;
    randevular?: number;
    profiles?: number;
  };
};

// ---------------------------------------------------------------------------
// Küçük yardımcılar
// ---------------------------------------------------------------------------
export const sayi = (x: unknown): number | null => {
  if (x === null || x === undefined || x === '') return null;
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  const s = String(x).trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export const yuvarla = (n: number | null | undefined): number =>
  Math.round((Number(n) || 0) * 100) / 100;

/** Türkçe normalizasyon: büyük/küçük + İ/ı, ş, ğ, ü, ö, ç farkını yok sayar. */
export function trNormal(s: unknown): string {
  return String(s ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/i̇/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** İki isim aynı kişiyi mi gösteriyor? (token alt kümesi + birebir) */
export function isimEslesir(a: unknown, b: unknown): boolean {
  const na = trNormal(a);
  const nb = trNormal(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const pa = na.split(' ').filter((t) => t.length >= 2);
  const pb = nb.split(' ').filter((t) => t.length >= 2);
  if (pa.length === 0 || pb.length === 0) return false;
  const kisa = pa.length <= pb.length ? pa : pb;
  const uzun = pa.length <= pb.length ? pb : pa;
  // Tek kelimelik kısa isim (ör. "BASİL") yalnızca 4+ harfse eşleşsin
  if (kisa.length === 1 && kisa[0].length < 4) return false;
  return kisa.every((t) => uzun.includes(t));
}

/** "VEYSEL ÇARKLI - GÖKHAN GÖK" → ["VEYSEL ÇARKLI", "GÖKHAN GÖK"] */
export function ekipAyir(metin: unknown): string[] {
  const ham = String(metin ?? '').trim();
  if (!ham) return [];
  const parcalar = ham
    .split(/\s*[-–—]\s*|\s*\/\s*|\s*\+\s*|\s*&\s*|,|\s+ve\s+/i)
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter((x) => x.length >= 2);
  const gorulen = new Set<string>();
  const sonuc: string[] = [];
  for (const p of parcalar) {
    const n = trNormal(p);
    if (!n || gorulen.has(n)) continue;
    gorulen.add(n);
    sonuc.push(p);
  }
  return sonuc;
}

/** sql/21: iscilik_kalemi_mi() karşılığı — işçilik/hizmet satırı malzeme sayılmaz */
export function iscilikKalemiMi(ad: unknown): boolean {
  const n = trNormal(ad);
  if (!n) return false;
  return /(servis iscilig|saat basi|periyodik bakim|iscilik|yol ucreti|nakliye|montaj|demontaj|kesif)/.test(n);
}

export function dizi(x: unknown): any[] {
  if (Array.isArray(x)) return x;
  if (typeof x === 'string') {
    try {
      const p = JSON.parse(x);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Serbest metindeki malzeme satırlarını ayırır ("RULMAN x8, HALAT x40") */
export function metinKalemleri(metin: unknown): string[] {
  return String(metin ?? '')
    .split(/\n|,|;/)
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter((x) => x.length >= 2);
}

export type IsSatiri = {
  id: string;
  tarih: string;
  musteri: string;
  is_tipi: string;
  tutar: number;
  malzeme: number;
  iscilik: number;
  yol: number;
  diger: number;
  maliyet: number | null;
  kar: number | null;
  marj: number | null;
  maliyet_durumu: 'tam' | 'eksik';
  eksik_neden: string[];
  malzeme_kaynagi: 'rapor' | 'kayit' | 'depo' | 'yok' | 'bilinmiyor';
  guncel_fiyat: boolean;
  iscilik_kaynagi: 'kayit' | 'rapor_sure' | 'yok';
  saat: number | null;
  ekip: string[];
  ortak: boolean;
  diger_personeller: string[];
  form_no: string | null;
  rapor_id: string | null;
  kaynak: string;
  bedelsiz: boolean;
};

export type KarlilikSonuc = {
  ay: string;
  personel: string;
  istenen_personel: string;
  personel_id: string | null;
  eslesme: 'maas' | 'profil' | 'isim';
  kdv_haric: true;
  ozet: {
    ciro: number;
    is_sayisi: number;
    ortalama_is: number;
    tamamlanan: number;
    planlanan_randevu: number | null;
    hesaplanan: {
      ciro: number;
      maliyet: number;
      malzeme: number;
      iscilik: number;
      yol: number;
      diger: number;
      kar: number;
      marj: number | null;
      is_sayisi: number;
      ortalama_kar: number;
    };
    maliyetsiz: {
      is_sayisi: number;
      ciro: number;
      malzeme_bilinmeyen: number;
      sure_bilinmeyen: number;
    };
    ortak: { is_sayisi: number; ciro: number };
    tek: { is_sayisi: number; ciro: number };
  };
  isler: IsSatiri[];
  saatlik_ucret: { kisi: number | null; kisi_kaynagi: 'maas' | 'ortalama' | 'yok'; sirket: number | null };
  katsayilar: { sgk: number; aylik_saat: number; para_birimi: string };
  kaynaklar: {
    completed_services: { okunan: number; kullanilan: number; mukerrer: number };
    service_reports: { okunan: number; eslesen: number; malzeme_veren: number };
    materials: { okunan: number; fiyatli: number };
    personel_maas: { okunan: number; ucretli: number };
    randevular: { okunan: number; eslesen: number; personel_atanan: number };
    profiles: { okunan: number };
  };
  tekillestirme: string;
  uyarilar: string[];
};

type MalzemeIndeks = {
  byId: Map<string, HamMalzeme>;
  byAd: { ad: string; norm: string; malzeme: HamMalzeme }[];
  fiyatli: number;
};

function malzemeIndeksYap(malzemeler: HamMalzeme[]): MalzemeIndeks {
  const byId = new Map<string, HamMalzeme>();
  const byAd: { ad: string; norm: string; malzeme: HamMalzeme }[] = [];
  let fiyatli = 0;
  for (const m of malzemeler) {
    if (!m || !m.id) continue;
    byId.set(String(m.id), m);
    const ad = String(m.name ?? '').trim();
    if (ad) byAd.push({ ad, norm: trNormal(ad), malzeme: m });
    if ((sayi(m.buy_price) ?? 0) > 0) fiyatli++;
  }
  return { byId, byAd, fiyatli };
}

/** Kayıtta maliyet yoksa depodaki GÜNCEL alış fiyatına düşer. */
function depodanFiyat(kalem: any, indeks: MalzemeIndeks): number | null {
  const malzemeId = kalem?.malzeme_id != null ? String(kalem.malzeme_id) : '';
  if (malzemeId) {
    const m = indeks.byId.get(malzemeId);
    const f = sayi(m?.buy_price);
    if (f !== null && f > 0) return f;
  }
  const ad = String(kalem?.parca_adi ?? kalem?.ad ?? '').trim();
  const n = trNormal(ad);
  if (!n) return null;

  // 1) birebir ad eşleşmesi
  const birebir = indeks.byAd.filter((x) => x.norm === n);
  for (const x of birebir) {
    const f = sayi(x.malzeme.buy_price);
    if (f !== null && f > 0) return f;
  }
  // 2) içerik eşleşmesi (en uzun ad kazanır — sql/96 ile aynı mantık)
  const adaylar = indeks.byAd
    .filter((x) => x.norm.length >= 4 && (x.norm.includes(n) || n.includes(x.norm)))
    .sort((a, b) => b.norm.length - a.norm.length);
  for (const x of adaylar) {
    const f = sayi(x.malzeme.buy_price);
    if (f !== null && f > 0) return f;
  }
  return null;
}

type MalzemeSonuc = {
  tutar: number;
  bilinmiyor: boolean;
  guncel: boolean;
  kaynak: 'rapor' | 'kayit' | 'depo' | 'yok' | 'bilinmiyor';
  kalem: number;
  bilinmeyenler: string[];
};

function parcaMaliyeti(kalemler: any[], indeks: MalzemeIndeks, kaynak: 'rapor' | 'kayit'): MalzemeSonuc {
  let tutar = 0;
  let bilinmiyor = false;
  let guncel = false;
  let adet = 0;
  const bilinmeyenler: string[] = [];

  for (const ham of kalemler) {
    if (!ham || typeof ham !== 'object') continue;
    const ad = String((ham as any).parca_adi ?? (ham as any).ad ?? '').trim();
    if (!ad) continue;
    // İşçilik/hizmet satırı malzemeye sayılmaz (sql/21 iscilik_kalemi_mi)
    if (iscilikKalemiMi(ad)) continue;

    const miktar = sayi((ham as any).adet) ?? 1;
    const sakli = sayi((ham as any).birim_maliyet);
    if (sakli !== null && sakli > 0) {
      tutar += miktar * sakli;
      adet++;
      continue;
    }
    const depo = depodanFiyat(ham, indeks);
    if (depo !== null && depo > 0) {
      tutar += miktar * depo;
      adet++;
      guncel = true;
      continue;
    }
    bilinmiyor = true;
    bilinmeyenler.push(ad);
  }

  return {
    tutar: yuvarla(tutar),
    bilinmiyor,
    guncel,
    kaynak: adet === 0 ? (bilinmiyor ? 'bilinmiyor' : 'yok') : guncel ? 'depo' : kaynak,
    kalem: adet,
    bilinmeyenler,
  };
}

type UcretIndeks = {
  kisi: Map<string, { ad: string; saat: number }>;
  ortalama: number | null;
  ucretli: number;
};

function ucretIndeksYap(maaslar: HamMaas[], sgk: number, aylikSaat: number): UcretIndeks {
  const kisi = new Map<string, { ad: string; saat: number }>();
  let toplam = 0;
  let adet = 0;
  for (const m of maaslar) {
    if (!m || !m.personel) continue;
    if (m.aktif === false) continue;
    const maas = sayi(m.maas);
    if (maas === null || maas <= 0) continue;
    const saat = (maas * sgk) / aylikSaat;
    kisi.set(trNormal(m.personel), { ad: m.personel, saat });
    toplam += maas;
    adet++;
  }
  return { kisi, ortalama: adet > 0 ? (toplam / adet) * sgk / aylikSaat : null, ucretli: adet };
}

function kisiUcreti(ad: string, indeks: UcretIndeks): { saat: number; kaynak: 'maas' | 'ortalama' } | null {
  const n = trNormal(ad);
  const birebir = indeks.kisi.get(n);
  if (birebir) return { saat: birebir.saat, kaynak: 'maas' };
  // token alt kümesi ile ara (ör. "BASİL" ↔ "BASİL HAVATİMİ")
  for (const [anahtar, deger] of indeks.kisi) {
    if (isimEslesir(anahtar, n)) return { saat: deger.saat, kaynak: 'maas' };
  }
  if (indeks.ortalama !== null) return { saat: indeks.ortalama, kaynak: 'ortalama' };
  return null;
}

type EkipUcret = {
  toplamSaatlik: number | null;
  ortalamaVar: boolean;
  bilinmeyen: string[];
};

function ekipSaatlik(ekip: string[], indeks: UcretIndeks): EkipUcret {
  if (ekip.length === 0) {
    return { toplamSaatlik: indeks.ortalama, ortalamaVar: true, bilinmeyen: [] };
  }
  let toplam = 0;
  let ortalamaVar = false;
  const bilinmeyen: string[] = [];
  let bulunan = 0;
  for (const kisi of ekip) {
    const u = kisiUcreti(kisi, indeks);
    if (!u) {
      bilinmeyen.push(kisi);
      continue;
    }
    toplam += u.saat;
    bulunan++;
    if (u.kaynak === 'ortalama') ortalamaVar = true;
  }
  return {
    toplamSaatlik: bulunan > 0 ? toplam : null,
    ortalamaVar,
    bilinmeyen,
  };
}

const ayEtiketi = (ay: string) => {
  const [y, m] = String(ay).split('-').map(Number);
  return `${String(m).padStart(2, '0')}.${y}`;
};

/**
 * Ana hesap. Saf fonksiyon — veritabanına gitmez, saat/dosya okumaz.
 */
export function karlilikHesapla(g: Girdi): KarlilikSonuc {
  const uyarilar: string[] = [];
  const ay = g.ay;
  const sgk = sayi(g.ayar?.sgk_katsayisi) ?? 1.65;
  const aylikSaat = (() => {
    const v = sayi(g.ayar?.aylik_saat);
    return v && v > 0 ? v : 225;
  })();

  // ---- 1) Personel kimliğini çöz -----------------------------------------
  const maasAktif = g.maaslar.filter((m) => m && m.aktif !== false && (sayi(m.maas) ?? 0) > 0);
  const adaylar: string[] = [];
  for (const m of maasAktif) adaylar.push(m.personel);
  for (const p of g.profiller) if (p.full_name) adaylar.push(p.full_name);
  for (const r of g.raporlar) for (const k of ekipAyir(r.personel_adi)) adaylar.push(k);
  for (const i of g.isler) for (const k of ekipAyir(i.technician)) adaylar.push(k);

  const istenen = g.personel;
  const normIstenen = trNormal(istenen);
  let personel = istenen;
  let eslesme: KarlilikSonuc['eslesme'] = 'isim';

  const birebirMaas = maasAktif.find((m) => trNormal(m.personel) === normIstenen);
  if (birebirMaas) {
    personel = birebirMaas.personel;
    eslesme = 'maas';
  } else {
    const benzersiz = Array.from(new Set(adaylar.filter((a) => isimEslesir(a, istenen))));
    if (benzersiz.length === 1) {
      personel = benzersiz[0];
      eslesme = maasAktif.some((m) => trNormal(m.personel) === trNormal(benzersiz[0])) ? 'maas' : 'profil';
    } else if (benzersiz.length > 1) {
      // En çok kelime örtüşen aday kazanır
      const puanla = (a: string) => {
        const pa = trNormal(a).split(' ').filter(Boolean);
        const pi = normIstenen.split(' ').filter(Boolean);
        return pa.filter((t) => pi.includes(t)).length;
      };
      benzersiz.sort((a, b) => puanla(b) - puanla(a));
      personel = benzersiz[0];
      eslesme = maasAktif.some((m) => trNormal(m.personel) === trNormal(benzersiz[0])) ? 'maas' : 'profil';
    }
  }

  const profil = g.profiller.find((p) => p.full_name && isimEslesir(p.full_name, personel));

  // ---- 2) Raporları işe bağla --------------------------------------------
  const raporFinans = new Map<string, HamRapor[]>();
  for (const r of g.raporlar) {
    const k = String(r.finans_kayit_id ?? '').trim();
    if (!k) continue;
    const liste = raporFinans.get(k) ?? [];
    liste.push(r);
    raporFinans.set(k, liste);
  }
  const parcaSayisi = (r: HamRapor) => dizi(r.degisen_parcalar).length;
  const raporSec = (liste: HamRapor[]) =>
    [...liste].sort((a, b) => parcaSayisi(b) - parcaSayisi(a) || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0];

  const formIleRapor = new Map<string, HamRapor[]>();
  for (const r of g.raporlar) {
    const on = String(r.id ?? '').slice(0, 6).toLocaleUpperCase('tr-TR');
    if (!on) continue;
    const liste = formIleRapor.get(on) ?? [];
    liste.push(r);
    formIleRapor.set(on, liste);
  }

  // ---- 3) Randevular (sadece personel/plan bilgisi; ciro üretmez) ---------
  const randevuTicket = new Map<string, HamRandevu>();
  for (const r of g.randevular) {
    const t = String(r.ticket_id ?? '').trim();
    if (!t) continue;
    if (!randevuTicket.has(t)) randevuTicket.set(t, r);
  }

  // ---- 4) İşleri süz + çift kaydı tekilleştir -----------------------------
  const malzemeIndeks = malzemeIndeksYap(g.malzemeler);
  const ucretIndeks = ucretIndeksYap(g.maaslar, sgk, aylikSaat);

  const kisininIsleri: HamIs[] = [];
  for (const is of g.isler) {
    const ekip = ekipAyir(is.technician);
    if (ekip.length === 0) continue;
    if (!ekip.some((k) => isimEslesir(k, personel))) continue;
    kisininIsleri.push(is);
  }

  // Aynı iş iki kez finans kaydı olarak girilmişse form_no ile tekilleştir.
  const secilen = new Map<string, HamIs>();
  const serbest: HamIs[] = [];
  for (const is of kisininIsleri) {
    const form = String(is.form_number ?? '').trim().toLocaleUpperCase('tr-TR');
    if (!form) {
      serbest.push(is);
      continue;
    }
    const onceki = secilen.get(form);
    if (!onceki) {
      secilen.set(form, is);
      continue;
    }
    // Veri dolu olanı (raporu olanı) tut
    const oncekiRapor = raporFinans.get(String(onceki.id))?.length ?? 0;
    const yeniRapor = raporFinans.get(String(is.id))?.length ?? 0;
    if (yeniRapor > oncekiRapor) secilen.set(form, is);
  }
  const isler = [...secilen.values(), ...serbest];
  const mukerrer = kisininIsleri.length - isler.length;

  // ---- 5) İş bazlı maliyet ------------------------------------------------
  const satirlar: IsSatiri[] = [];
  let raporEslesen = 0;
  let raporMalzemeVeren = 0;
  let randevuEslesen = 0;

  for (const is of isler) {
    try {
      const finansId = String(is.id);
      let rapor: HamRapor | null = null;
      let baglanti = 'yok';
      const finansListe = raporFinans.get(finansId);
      if (finansListe && finansListe.length > 0) {
        rapor = raporSec(finansListe);
        baglanti = 'finans_kayit_id';
      } else {
        const form = String(is.form_number ?? '').trim().toLocaleUpperCase('tr-TR');
        if (form) {
          const adaylarForm = formIleRapor.get(form) ?? [];
          if (adaylarForm.length === 1) {
            rapor = adaylarForm[0];
            baglanti = 'form_no';
          }
        }
      }
      if (rapor) raporEslesen++;

      const randevu = rapor?.ticket_id ? randevuTicket.get(String(rapor.ticket_id)) : undefined;
      if (randevu) randevuEslesen++;

      // --- ekip: iş kaydı → rapor → randevu (sırayla) ---
      let ekip = ekipAyir(is.technician);
      if (ekip.length === 0) ekip = ekipAyir(rapor?.personel_adi);
      if (ekip.length === 0) ekip = ekipAyir(randevu?.atanan_personel);
      const digerPersoneller = ekip.filter((k) => !isimEslesir(k, personel));
      const ortak = digerPersoneller.length > 0;

      // --- malzeme: rapor (saklı maliyet) > iş kaydı > depo ---
      const raporParcalar = dizi(rapor?.degisen_parcalar);
      const isParcalar = dizi(is.materials);
      let malzeme: MalzemeSonuc;
      if (raporParcalar.length > 0) {
        malzeme = parcaMaliyeti(raporParcalar, malzemeIndeks, 'rapor');
        if (malzeme.kalem > 0) raporMalzemeVeren++;
        // Rapor kalemleri varsa iş kaydı kalemleri AYRICA eklenmez (çift sayım yok)
      } else if (isParcalar.length > 0) {
        malzeme = parcaMaliyeti(isParcalar, malzemeIndeks, 'kayit');
      } else {
        const metin = metinKalemleri(is.materials_text);
        const gercekKalem = metin.filter((m) => !iscilikKalemiMi(m));
        const tutar = sayi(rapor?.malzeme_tutari) ?? 0;
        if (gercekKalem.length > 0 || tutar > 0) {
          malzeme = { tutar: 0, bilinmiyor: true, guncel: false, kaynak: 'bilinmiyor', kalem: 0, bilinmeyenler: gercekKalem.slice(0, 5) };
        } else {
          malzeme = { tutar: 0, bilinmiyor: false, guncel: false, kaynak: 'yok', kalem: 0, bilinmeyenler: [] };
        }
      }

      // --- işçilik: saat × ekipteki kişilerin gerçek saat ücreti ---
      const saatKayit = sayi(is.work_hours);
      const raporDk = sayi(rapor?.sure_dakika);
      let saat: number | null = null;
      let iscilikKaynagi: IsSatiri['iscilik_kaynagi'] = 'yok';
      if (saatKayit !== null && saatKayit > 0) {
        saat = saatKayit;
        iscilikKaynagi = 'kayit';
      } else if (raporDk !== null && raporDk > 0) {
        saat = raporDk / 60;
        iscilikKaynagi = 'rapor_sure';
      }

      const ekipUcret = ekipSaatlik(ekip.length > 0 ? ekip : [personel], ucretIndeks);
      let iscilik = 0;
      let iscilikBilinmiyor = false;
      if (saat === null) iscilikBilinmiyor = true;
      else if (ekipUcret.toplamSaatlik === null || ekipUcret.toplamSaatlik <= 0) iscilikBilinmiyor = true;
      else iscilik = saat * ekipUcret.toplamSaatlik;

      const tutar = sayi(is.price) ?? 0;

      const eksikNeden: string[] = [];
      if (malzeme.bilinmiyor) eksikNeden.push('malzeme maliyeti yok');
      if (iscilikBilinmiyor) eksikNeden.push('işçilik/süre kaydı yok');
      const tam = eksikNeden.length === 0;
      const maliyet = tam ? yuvarla(malzeme.tutar + iscilik) : null;
      const kar = tam && maliyet !== null ? yuvarla(tutar - maliyet) : null;

      satirlar.push({
        id: finansId,
        tarih: String(is.service_date ?? '').slice(0, 10),
        musteri: String(is.customer_text ?? randevu?.musteri_adi ?? 'Bilinmiyor').trim() || 'Bilinmiyor',
        is_tipi: String(is.service_type ?? rapor?.islem_turu ?? 'Servis').trim() || 'Servis',
        tutar: yuvarla(tutar),
        malzeme: yuvarla(malzeme.tutar),
        iscilik: yuvarla(iscilik),
        yol: 0,
        diger: 0,
        maliyet,
        kar,
        marj: kar !== null && tutar > 0 ? yuvarla((kar / tutar) * 100) : null,
        maliyet_durumu: tam ? 'tam' : 'eksik',
        eksik_neden: eksikNeden,
        malzeme_kaynagi: malzeme.kaynak,
        guncel_fiyat: malzeme.guncel,
        iscilik_kaynagi: iscilikBilinmiyor ? 'yok' : iscilikKaynagi,
        saat: saat !== null ? yuvarla(saat) : null,
        ekip,
        ortak,
        diger_personeller: digerPersoneller,
        form_no: is.form_number ? String(is.form_number) : null,
        rapor_id: rapor?.id ?? null,
        kaynak: rapor ? `completed_services + service_reports (${baglanti})` : 'completed_services',
        bedelsiz: tutar <= 0,
      });
    } catch {
      uyarilar.push('Bir iş satırı hesaplanamadı, atlandı.');
    }
  }

  satirlar.sort((a, b) => (a.tarih < b.tarih ? 1 : a.tarih > b.tarih ? -1 : 0));

  // ---- 6) Toplamlar -------------------------------------------------------
  let ciro = 0;
  let hesaplananCiro = 0;
  let malzeme = 0;
  let iscilik = 0;
  let kar = 0;
  let tamIs = 0;
  let eksikIs = 0;
  let eksikCiro = 0;
  let malzemeBilinmeyen = 0;
  let sureBilinmeyen = 0;
  let ortakIs = 0;
  let ortakCiro = 0;

  for (const s of satirlar) {
    ciro += s.tutar;
    if (s.maliyet_durumu === 'tam') {
      tamIs++;
      hesaplananCiro += s.tutar;
      malzeme += s.malzeme;
      iscilik += s.iscilik;
      kar += s.kar ?? 0;
    } else {
      eksikIs++;
      eksikCiro += s.tutar;
      if (s.eksik_neden.includes('malzeme maliyeti yok')) malzemeBilinmeyen++;
      if (s.eksik_neden.includes('işçilik/süre kaydı yok')) sureBilinmeyen++;
    }
    if (s.ortak) {
      ortakIs++;
      ortakCiro += s.tutar;
    }
  }

  const toplamMaliyet = malzeme + iscilik;
  const marj = hesaplananCiro > 0 ? yuvarla((kar / hesaplananCiro) * 100) : null;

  // Kâr hesaplanan ciro ile genel ciro farklıysa mutlaka uyar
  if (eksikIs > 0) {
    uyarilar.push(
      `${eksikIs} işte maliyet kaydı eksik → kâra dahil edilmedi (${eksikCiro.toLocaleString('tr-TR')} ₺ ciro).`
    );
  }
  if (satirlar.some((s) => s.guncel_fiyat)) {
    uyarilar.push('Bazı malzeme kalemleri depodaki GÜNCEL alış fiyatıyla hesaplandı (kayıt anındaki maliyet yok).');
  }
  if (satirlar.some((s) => s.bedelsiz)) {
    uyarilar.push('Bedelsiz/garanti işler ciroya 0 ₺ yazar, maliyeti kârdan düşer.');
  }
  if (ortakIs > 0) {
    uyarilar.push(
      `${ortakIs} iş ortak yapıldı — her iki personele de tam yazıldı; şirket toplamında bu işler çift sayılmamalı.`
    );
  }
  const digerParaBirimi = isler.filter((i) => {
    const c = String(i.currency ?? '').trim().toLocaleUpperCase('tr-TR');
    return c !== '' && c !== 'TL' && c !== 'TRY';
  }).length;
  if (digerParaBirimi > 0) {
    uyarilar.push(
      `${digerParaBirimi} iş TL dışı para biriminde kayıtlı; tutarlar TL gibi toplandı — kontrol edin.`
    );
  }

  const planlanan = g.randevular.filter((r) => {
    if (String(r.durum ?? '') === 'iptal') return false;
    return ekipAyir(r.atanan_personel).some((k) => isimEslesir(k, personel));
  }).length;

  const kisiUcret = kisiUcreti(personel, ucretIndeks);

  return {
    ay,
    personel,
    istenen_personel: istenen,
    personel_id: profil?.id ?? null,
    eslesme,
    kdv_haric: true,
    ozet: {
      ciro: yuvarla(ciro),
      is_sayisi: satirlar.length,
      ortalama_is: satirlar.length > 0 ? yuvarla(ciro / satirlar.length) : 0,
      tamamlanan: satirlar.length,
      planlanan_randevu: g.randevular.length > 0 ? planlanan : null,
      hesaplanan: {
        ciro: yuvarla(hesaplananCiro),
        maliyet: yuvarla(toplamMaliyet),
        malzeme: yuvarla(malzeme),
        iscilik: yuvarla(iscilik),
        yol: 0,
        diger: 0,
        kar: yuvarla(kar),
        marj,
        is_sayisi: tamIs,
        ortalama_kar: tamIs > 0 ? yuvarla(kar / tamIs) : 0,
      },
      maliyetsiz: {
        is_sayisi: eksikIs,
        ciro: yuvarla(eksikCiro),
        malzeme_bilinmeyen: malzemeBilinmeyen,
        sure_bilinmeyen: sureBilinmeyen,
      },
      ortak: { is_sayisi: ortakIs, ciro: yuvarla(ortakCiro) },
      tek: { is_sayisi: satirlar.length - ortakIs, ciro: yuvarla(ciro - ortakCiro) },
    },
    isler: satirlar,
    saatlik_ucret: {
      kisi: kisiUcret ? yuvarla(kisiUcret.saat) : null,
      kisi_kaynagi: kisiUcret ? kisiUcret.kaynak : 'yok',
      sirket: g.sirketSaatlik !== null ? yuvarla(g.sirketSaatlik) : null,
    },
    katsayilar: { sgk: yuvarla(sgk), aylik_saat: aylikSaat, para_birimi: 'TL' },
    kaynaklar: {
      completed_services: {
        okunan: g.kaynakSayilari?.completed_services ?? g.isler.length,
        kullanilan: satirlar.length,
        mukerrer,
      },
      service_reports: {
        okunan: g.kaynakSayilari?.service_reports ?? g.raporlar.length,
        eslesen: raporEslesen,
        malzeme_veren: raporMalzemeVeren,
      },
      materials: {
        okunan: g.kaynakSayilari?.materials ?? g.malzemeler.length,
        fiyatli: malzemeIndeks.fiyatli,
      },
      personel_maas: {
        okunan: g.kaynakSayilari?.personel_maas ?? g.maaslar.length,
        ucretli: ucretIndeks.ucretli,
      },
      randevular: {
        okunan: g.kaynakSayilari?.randevular ?? g.randevular.length,
        eslesen: randevuEslesen,
        personel_atanan: planlanan,
      },
      profiles: { okunan: g.kaynakSayilari?.profiles ?? g.profiller.length },
    },
    tekillestirme:
      'Ciro yalnızca completed_services satırlarından okunur (her iş 1 kez). service_reports yalnızca maliyet verir, offers hiç sayılmaz. ' +
      'Aynı form_no ile iki kez girilmiş işler tekilleştirildi; rapor bağı finans_kayit_id (yoksa form_no) ile kuruldu.',
    uyarilar: Array.from(new Set(uyarilar)),
  };
}

export const ayBaslangic = (ay: string) => `${ay}-01`;

export function aySonraki(ay: string): string {
  const [y, m] = ay.split('-').map(Number);
  if (!y || !m) return ay;
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const ayEtiket = (ay: string) => ayEtiketi(ay);
