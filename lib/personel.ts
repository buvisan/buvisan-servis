// ----------------------------------------------------------------------------
// BUVISAN - PERSONEL TANIMLARI (TEK DOĞRU KAYNAK) ✅
// ----------------------------------------------------------------------------
//  ÖNEMLİ: Personel listesi SADECE burada tutulur.
//  Daha önce iki ayrı liste vardı (rapor formu 5 kişi, atama ekranı 9 kişi)
//  ve sahada çalışan bazı kişiler kendi adını seçemiyordu.
//  Yeni personel eklenecek/çıkarılacaksa SADECE bu dosyayı düzenle.
// ----------------------------------------------------------------------------

export const PERSONEL_LISTESI = [
  'Kaya Ali TOSUN',
  'Veysel ÇARKLI',
  'Gökhan GÖK',
  'Kerim AKDOĞAN',
  'Okan ARAN',
  'Adem ACAR',
];
// NOT: Hamza ATTAR ayrıldı (listeden çıkarıldı). Yerine Okan ARAN zaten listede.
// Aylık maaşlar artık programdan güncellenir (personel_maas tablosu).

// Türkçe karakter + büyük/küçük harf farkını yok sayan normalleştirme
// ("VEYSEL ÇARKLI" === "Veysel Carkli" === "veysel çarklı")
export const isimNormalize = (s: string) =>
  (s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Serbest yazılmış bir ismin, hedef isimle eşleşip eşleşmediğini söyler.
 * Birebir aynı olmasa da (harf farkı, kısaltma, tek isim) eşleşir.
 */
export function isimEslesiyor(hedef: string, aranan: string): boolean {
  const h = isimNormalize(hedef);
  const a = isimNormalize(aranan);
  if (!h || !a) return false;
  if (h === a || h.includes(a) || a.includes(h)) return true;

  const parcalar = a.split(' ').filter((p) => p.length >= 3);
  return parcalar.length > 0 && parcalar.every((p) => h.includes(p));
}

/**
 * Giriş yapan kişinin adını, resmi personel listesindeki karşılığıyla bulur.
 * Bulunamazsa boş metin döner.
 */
export function listedenIsimBul(girisliAd: string): string {
  if (!girisliAd) return '';
  return PERSONEL_LISTESI.find((p) => isimEslesiyor(p, girisliAd)) || '';
}
