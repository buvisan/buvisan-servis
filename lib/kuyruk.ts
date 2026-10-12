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

/**
 * Raporda kullanılan parçaları depodan düşer.
 * Stok yetersizse veya altyapı yoksa rapor kaydını BOZMAZ, sadece uyarır.
 */
export async function parcalariStoktanDus(
  parcalar: any[],
  ticketId: string,
  kullanici?: string,
  aciklama?: string
) {
  for (const p of parcalar || []) {
    const malzemeId = p?.malzeme_id;
    const adet = Number(p?.adet) || 0;
    if (!malzemeId || adet <= 0) continue;

    try {
      const { data, error } = await supabase.rpc('stok_hareket', {
        p_malzeme_id: malzemeId,
        p_tip: 'cikis',
        p_miktar: adet,
        p_aciklama: aciklama || 'Servis raporu',
        p_ticket_id: ticketId || null,
        p_kullanici: kullanici || null,
      });
      if (error) console.warn('Stok düşülemedi:', error.message);
      else if ((data as any)?.ok === false) console.warn('Stok yetersiz:', (data as any)?.mesaj);
    } catch (e) {
      console.warn('Stok düşme hatası:', e);
    }
  }
}

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

      // Kullanılan parçaları depodan düş
      await parcalariStoktanDus(
        kayit.gelismis?.degisen_parcalar,
        kayit.ticket_id,
        kayit.gelismis?.personel_adi,
        'Servis raporu (kuyruktan)'
      );

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
