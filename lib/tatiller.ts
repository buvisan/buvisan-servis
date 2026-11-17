// ----------------------------------------------------------------------------
// BUVİSAN - TÜRKİYE RESMÎ TATİLLERİ 🎉
// Sabit + dinî bayramlar (Hicri takvim — yıllara göre tablo)
// ----------------------------------------------------------------------------

export type Tatil = { ad: string; tur: "resmi" | "dini" | "arefe" };

// Sabit resmî tatiller (her yıl aynı)
const SABIT: Record<string, Tatil> = {
  "01-01": { ad: "Yılbaşı", tur: "resmi" },
  "04-23": { ad: "Ulusal Egemenlik ve Çocuk Bayramı", tur: "resmi" },
  "05-01": { ad: "Emek ve Dayanışma Günü", tur: "resmi" },
  "05-19": { ad: "Atatürk'ü Anma, Gençlik ve Spor Bayramı", tur: "resmi" },
  "07-15": { ad: "Demokrasi ve Millî Birlik Günü", tur: "resmi" },
  "08-30": { ad: "Zafer Bayramı", tur: "resmi" },
  "10-29": { ad: "Cumhuriyet Bayramı", tur: "resmi" },
};

// Dinî bayramlar — Ramazan ve Kurban Bayramı 1. günü (Diyanet takvimi)
// Kaynak: Diyanet İşleri Başkanlığı dini günler takvimi
const DINI: Record<number, { ramazan: string; kurban: string }> = {
  2024: { ramazan: "2024-04-10", kurban: "2024-06-16" },
  2025: { ramazan: "2025-03-30", kurban: "2025-06-06" },
  2026: { ramazan: "2026-03-20", kurban: "2026-05-27" },
  2027: { ramazan: "2027-03-09", kurban: "2027-05-16" },
  2028: { ramazan: "2028-02-26", kurban: "2028-05-05" },
  2029: { ramazan: "2029-02-14", kurban: "2029-04-24" },
  2030: { ramazan: "2030-02-04", kurban: "2030-04-13" },
  2031: { ramazan: "2031-01-24", kurban: "2031-04-02" },
  2032: { ramazan: "2032-01-14", kurban: "2032-03-22" },
  2033: { ramazan: "2033-01-02", kurban: "2033-03-11" },
  2034: { ramazan: "2034-12-12", kurban: "2034-02-28" },
  2035: { ramazan: "2035-12-01", kurban: "2035-02-18" },
};

function tarihEkle(base: string, gun: number): string {
  const d = new Date(base + "T12:00:00");
  d.setDate(d.getDate() + gun);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const g = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${g}`;
}

/**
 * Belirli bir yılın tüm tatillerini döndürür.
 * Anahtar: "YYYY-MM-DD"
 */
export function yilTatilleri(yil: number): Record<string, Tatil> {
  const sonuc: Record<string, Tatil> = {};

  // Sabit tatiller
  for (const [mmdd, t] of Object.entries(SABIT)) {
    sonuc[`${yil}-${mmdd}`] = t;
  }

  // Dinî bayramlar
  const d = DINI[yil];
  if (d) {
    // Ramazan Bayramı: Arefe + 3 gün
    sonuc[tarihEkle(d.ramazan, -1)] = { ad: "Ramazan Bayramı Arefesi", tur: "arefe" };
    sonuc[tarihEkle(d.ramazan, 0)] = { ad: "Ramazan Bayramı 1. Gün", tur: "dini" };
    sonuc[tarihEkle(d.ramazan, 1)] = { ad: "Ramazan Bayramı 2. Gün", tur: "dini" };
    sonuc[tarihEkle(d.ramazan, 2)] = { ad: "Ramazan Bayramı 3. Gün", tur: "dini" };

    // Kurban Bayramı: Arefe + 4 gün
    sonuc[tarihEkle(d.kurban, -1)] = { ad: "Kurban Bayramı Arefesi", tur: "arefe" };
    sonuc[tarihEkle(d.kurban, 0)] = { ad: "Kurban Bayramı 1. Gün", tur: "dini" };
    sonuc[tarihEkle(d.kurban, 1)] = { ad: "Kurban Bayramı 2. Gün", tur: "dini" };
    sonuc[tarihEkle(d.kurban, 2)] = { ad: "Kurban Bayramı 3. Gün", tur: "dini" };
    sonuc[tarihEkle(d.kurban, 3)] = { ad: "Kurban Bayramı 4. Gün", tur: "dini" };
  }

  return sonuc;
}

/** Bu tarih tatil mi? */
export function tatilMi(iso: string, yil: number): Tatil | null {
  return yilTatilleri(yil)[iso] || null;
}
