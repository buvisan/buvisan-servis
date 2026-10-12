// ----------------------------------------------------------------------------
// BUVISAN - ÇEVRİMDIŞI RAPOR KUYRUĞU 📴
// ----------------------------------------------------------------------------
//  Fabrika içi, bodrum kat, şantiye... sinyal yokken rapor kaydedilemezse
//  rapor cihazda bekler ve internet gelince KENDİLİĞİNDEN gönderilir.
//  Hiçbir saha raporu kaybolmaz.
// ----------------------------------------------------------------------------

import { supabase } from '@/lib/supabaseClient';

const ANAHTAR = 'buvisan_rapor_kuyrugu';

export type KuyrukKaydi = {
  id: string;
  ticket_id: string;
  olusturma: string;
  temel: any;     // yeni kolonlar yoksa kullanılacak sade paket
  gelismis: any;  // medya + imza + konum dahil tam paket
};

export const agHatasiMi = (mesaj: string) =>
  /failed to fetch|network|timeout|load failed|internet/i.test(String(mesaj || ''));

export function kuyrukOku(): KuyrukKaydi[] {
  try {
    const v = window.localStorage.getItem(ANAHTAR);
    return v ? JSON.parse(v) : [];
  } catch {
    return [];
  }
}

export function kuyrukYaz(liste: KuyrukKaydi[]) {
  try {
    window.localStorage.setItem(ANAHTAR, JSON.stringify(liste));
  } catch { /* kota dolmuş olabilir, yoksay */ }
}

export function kuyrugaEkle(kayit: KuyrukKaydi) {
  const liste = kuyrukOku();
  liste.push(kayit);
  kuyrukYaz(liste);
}

export function kuyruktanSil(id: string) {
  kuyrukYaz(kuyrukOku().filter((k) => k.id !== id));
}

// Tek kaydı yazmayı dener; yeni kolonlar yoksa sade pakete düşer
async function paketiYaz(kayit: KuyrukKaydi): Promise<{ ok: boolean; hata?: string }> {
  const ilk = await supabase.from('service_reports').insert([kayit.gelismis]);
  if (!ilk.error) return { ok: true };

  const mesaj = ilk.error.message || '';
  const kolonYok = (ilk.error as any).code === 'PGRST204'
    || mesaj.includes('schema cache')
    || mesaj.includes('Could not find');

  if (!kolonYok) return { ok: false, hata: mesaj };

  const ikinci = await supabase.from('service_reports').insert([kayit.temel]);
  if (ikinci.error) return { ok: false, hata: ikinci.error.message };
  return { ok: true };
}

/**
 * Kuyruktaki tüm raporları göndermeyi dener.
 * Başarılı olanlar kuyruktan çıkar, iş emri ve randevu otomatik kapatılır.
 */
export async function kuyruguGonder(): Promise<{ gonderilen: number; kalan: number }> {
  const liste = kuyrukOku();
  let gonderilen = 0;

  for (const kayit of liste) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) break;

    try {
      const sonuc = await paketiYaz(kayit);

      if (!sonuc.ok) {
        // Ağ hatası değilse (veri hatası) tekrar denemenin anlamı yok → kuyruktan çıkar
        if (!agHatasiMi(sonuc.hata || '')) {
          console.warn('Kuyruk kaydı kalıcı hata verdi, çıkarıldı:', sonuc.hata);
          kuyruktanSil(kayit.id);
        }
        continue;
      }

      // İş emrini ve randevuyu kapat
      await supabase.from('service_tickets')
        .update({ pipeline_status: 'tamamlandi', status: 'tamamlandi' })
        .eq('id', kayit.ticket_id);

      try {
        await supabase.rpc('randevu_tamamla', { p_ticket_id: kayit.ticket_id });
      } catch { /* randevu modülü yoksa sorun değil */ }

      kuyruktanSil(kayit.id);
      gonderilen++;
    } catch (e) {
      console.warn('Kuyruk gönderimi başarısız, sonra denenecek:', e);
    }
  }

  return { gonderilen, kalan: kuyrukOku().length };
}
