// ----------------------------------------------------------------------------
// BUVISAN - ADRES GEOCoding yardımcısı 🌍
// Nominatim (OpenStreetMap) ile adres → koordinat. Ücretsiz, API key yok.
// Türkiye dışı adresleri eler. Sonucu DB'ye kaydeder (tekrar sormasın).
// ----------------------------------------------------------------------------

import { supabase } from "@/lib/supabaseClient";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// Yurt dışı ipuçları → bu adresler Türkiye haritasında gösterilmez
const YURT_DISI = [
  "skopje", "üsküp", "uskup", "makedonya", "macedonia", "kazakistan", "kazakhstan",
  "karaganda", "almaty", "astana", "nur-sultan", "russia", "rusya", "moskova", "moscow",
  "germany", "almanya", "berlin", "france", "fransa", "paris", "holland", "hollanda",
  "italy", "italya", "rome", "spain", "ispanya", "greece", "yunanistan", "atina",
  "bulgaria", "bulgaristan", "sofya", "sofia", "iran", "tehran", "tahran",
  "iraq", "irak", "bagdat", "baghdad", "syria", "surin", "suriyet", "dubai", "dubai",
  "qatar", "katar", "saudi", "suudi", "azerbaycan", "azerbaijan", "baku", "bakü",
  "georgia", "gurcistan", "tbilisi", "ukraine", "ukrayna", "kiev", "kyiv",
  "romania", "romanya", "bucharest", "bukres", "serbia", "sirbistan", "belgrade",
  "kosovo", "kosova", "albania", "arnavutluk", "tirana", "tiran",
];

export type GeoSonuc = {
  lat: number;
  lng: number;
  gosterilen: string;
  hassasiyet: "bina" | "sokak" | "mahalle" | "ilce";
};

/** Adres yurt dışı mı? */
export function yurtDisiMi(adres: string): boolean {
  const a = (adres || "").toLocaleLowerCase("tr");
  return YURT_DISI.some((k) => a.includes(k));
}

/** Adres çok mu belirsiz? (sadece ilçe adı gibi) */
export function belirsizMi(adres: string): boolean {
  const a = (adres || "").trim();
  if (a.length < 12) return true;
  // Sadece ilçe adı yazılmışsa
  if (!/\d/.test(a) && a.split(/\s+/).length <= 2) return true;
  return false;
}

/** Google Maps linki — ADRES METNİYLE açar (her zaman doğru yer) */
export function googleMapsLink(adres: string, lat?: any, lng?: any): string {
  const a = (adres || "").trim();
  if (a.length > 5) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
  }
  if (lat && lng) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return "https://www.google.com/maps";
}

/** Yol tarifi linki */
export function yolTarifiLink(adres: string, lat?: any, lng?: any): string {
  const hedef = (adres || "").trim().length > 5
    ? encodeURIComponent(adres)
    : `${lat},${lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${hedef}&travelmode=driving`;
}

/**
 * Nominatim ile adres → koordinat.
 * Türkiye'ye öncelik verir, Bursa ipucu ekler.
 */
export async function adresGeocode(adres: string): Promise<GeoSonuc | null> {
  const ham = (adres || "").trim();
  if (ham.length < 8) return null;
  if (yurtDisiMi(ham)) return null;   // 🌍 yurt dışı → haritaya koyma

  // Bursa ipucu ekle (adres zaten Bursa içeriyorsa ekleme)
  const a = ham.toLocaleLowerCase("tr");
  const sorgu = a.includes("bursa") || a.includes("türkiye") || a.includes("turkiye")
    ? ham
    : `${ham}, Bursa, Türkiye`;

  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(sorgu)}&format=json&limit=1&countrycodes=tr&addressdetails=1`;
    const r = await fetch(url, { headers: { "Accept-Language": "tr" } });
    if (!r.ok) return null;
    const j = await r.json();
    if (!Array.isArray(j) || j.length === 0) return null;

    const h = j[0];
    const lat = Number(h.lat), lng = Number(h.lon);
    if (!lat || !lng) return null;
    // Türkiye sınırları dışındaysa alma
    if (lat < 35.5 || lat > 42.5 || lng < 25.5 || lng > 45) return null;

    const tip = String(h.type || "");
    const hassasiyet: GeoSonuc["hassasiyet"] =
      tip.includes("house") || tip.includes("building") ? "bina"
      : tip.includes("road") || tip.includes("street") ? "sokak"
      : tip.includes("suburb") || tip.includes("neighbourhood") ? "mahalle"
      : "ilce";

    return { lat, lng, gosterilen: h.display_name || sorgu, hassasiyet };
  } catch {
    return null;
  }
}

/** Koordinatı DB'ye kaydet (bir daha sorulmasın) */
export async function geocodeKaydet(
  kaynak: "randevular" | "service_tickets" | "cranes",
  kayitId: string,
  g: GeoSonuc,
  adres: string
) {
  try {
    await supabase.rpc("geocode_kaydet", {
      p_kaynak: kaynak, p_kayit_id: kayitId,
      p_lat: g.lat, p_lng: g.lng,
      p_adres: adres, p_hassasiyet: g.hassasiyet,
    });
  } catch { /* sessiz */ }
}

/**
 * Koordinatsız kayıtları toplu geocode et.
 * Sırayla sorar (Nominatim saniyede 1 istek sınırı var).
 * İlerlemeyi onProgress ile bildirir.
 */
export async function topluGeocode(
  limit = 10,
  onProgress?: (yapilan: number, toplam: number, basarili: number) => void
): Promise<number> {
  const { data } = await supabase.rpc("geocode_bekleyenler", { p_limit: limit });
  const liste = (data || []) as any[];
  let basarili = 0;

  for (let i = 0; i < liste.length; i++) {
    const k = liste[i];
    const adres = String(k.adres || "");
    if (!adres || yurtDisiMi(adres) || belirsizMi(adres)) {
      onProgress?.(i + 1, liste.length, basarili);
      continue;
    }
    const g = await adresGeocode(adres);
    if (g) {
      await geocodeKaydet(k.kaynak, k.kayit_id, g, adres);
      basarili++;
    }
    onProgress?.(i + 1, liste.length, basarili);
    // Nominatim kuralı: saniyede 1 istek
    await new Promise((r) => setTimeout(r, 1100));
  }
  return basarili;
}
