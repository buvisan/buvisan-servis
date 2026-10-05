import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _db: SupabaseClient | null = null;

// Bağlantı ancak ilk kullanıldığında kurulur, build sırasında değil
export const db = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!_db) {
      _db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
    }
    const v = (_db as any)[prop];
    return typeof v === "function" ? v.bind(_db) : v;
  },
});

const gunKaldi = (tarih?: string | null) =>
  tarih ? Math.ceil((new Date(tarih).getTime() - Date.now()) / 86400000) : null;

// Türkçe harfleri sadeleştirir: "ALAN KALIP" ve "Alan Kalıp" aynı olur
const sade = (s: string) =>
  (s ?? "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/[^a-z0-9]/g, "");

// Veritabanı araması için: Türkçe harfleri joker (_) yapar
// "Kalıp" -> "%kal_p%" ; KALIP, Kalip, kalıp hepsiyle eşleşir
const desen = (s: string) =>
  "%" +
  s.trim().replace(/[%_\\]/g, "")
    .replace(/[iıİIşŞçÇğĞöÖüÜ]/g, "_")
    .replace(/\s+/g, "%") +
  "%";

const IZINLI_TABLOLAR = [
  "blacklisted_companies", "completed_services", "crane_history", "cranes",
  "field_reports", "financial_records", "fleet_fines", "fleet_fuel",
  "fleet_maintenance", "fleet_vehicles", "maintenance_contracts", "materials",
  "offers", "service_reports", "service_tickets", "ticket_messages",
];

export async function mimliBul(firma: string) {
  const { data, error } = await db
    .from("blacklisted_companies")
    .select("company_name, reason_category, details");
  if (error) throw new Error(error.message); // kontrol yapılamazsa işlem durur
  const a = sade(firma);
  return (data ?? []).filter((k) => {
    const ad = sade(k.company_name);
    return a.length >= 3 && ad.length >= 3 && (ad.includes(a) || a.includes(ad));
  });
}

const VARSAYILAN_NOT = "Bu teklif 15 gün süreyle geçerlidir. Fiyatlara KDV dahil değildir.";
const bugunTR = (gunEkle = 0) =>
  new Date(Date.now() + gunEkle * 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });

const adNorm = (s: string) =>
  (s ?? "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

// Kısa ad, uzun adın başındaysa hepsini kısa ada bağlar
function firmaHaritasi(adlar: string[]) {
  const norm = [...new Set(adlar.map(adNorm).filter(Boolean))].sort((a, b) => a.length - b.length);
  const kanon: string[] = [];
  const harita: Record<string, string> = {};
  for (const n of norm) {
    const k = kanon.find((c) => n === c || n.startsWith(c + " "));
    if (k) harita[n] = k;
    else { kanon.push(n); harita[n] = n; }
  }
  return harita;
}

// Claude'a tanıttığımız araçların listesi
export const tools = [
  {
    name: "mimli_sirket_kontrol",
    description: "Bir firmanın mimli (kırmızı liste) olup olmadığını kontrol eder. Teklif, iş emri veya servis öncesi MUTLAKA çağır.",
    input_schema: { type: "object", properties: { firma_adi: { type: "string" } }, required: ["firma_adi"] },
  },
  {
    name: "musteri_gecmisi",
    description: "Bir müşterinin teklif ve tamamlanan servis geçmişini getirir.",
    input_schema: { type: "object", properties: { firma_adi: { type: "string" } }, required: ["firma_adi"] },
  },
  {
    name: "bekleyen_isler",
    description: "Servis iş emirlerini (service_tickets) en yeniden eskiye listeler. Durum alanlarıyla birlikte döner.",
    input_schema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "finans_ozet",
    description: "Bir ayın cirosunu (completed_services) ve giderlerini (financial_records) hesaplar. ay formatı: 2026-09",
    input_schema: { type: "object", properties: { ay: { type: "string" } }, required: ["ay"] },
  },
  {
    name: "arac_durumlari",
    description: "Filodaki araçların sigorta, kasko, muayene tarihlerine kaç gün kaldığını verir.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "sozlesme_durumlari",
    description: "Periyodik bakım sözleşmelerini ve bitişlerine kalan günü verir.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "depo_fiyat_ara",
    description: "Depodaki malzeme veya işçiliğin alış fiyatını, satış fiyatını ve marjını getirir.",
    input_schema: { type: "object", properties: { aranan: { type: "string" } }, required: ["aranan"] },
  },
    {
    name: "veri_sorgula",
    description: "Hazır araçlar yetmediğinde herhangi bir tabloyu (sadece okuma) sorgular. Firma/isim aramasında 'ilike' kullan, 'eq' kullanma. Sonuç boşsa kelimeyi kısaltıp tekrar dene.",
    input_schema: {
      type: "object",
      properties: {
        tablo: { type: "string", description: "Tablo adı" },
        sutunlar: { type: "string", description: "Virgülle ayrılmış sütunlar, boşsa hepsi" },
        filtreler: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sutun: { type: "string" },
              islem: { type: "string", enum: ["eq", "neq", "ilike", "gt", "gte", "lt", "lte"] },
              deger: { type: "string" },
            },
            required: ["sutun", "islem", "deger"],
          },
        },
        sirala: { type: "string", description: "Sıralanacak sütun" },
        azalan: { type: "boolean" },
        limit: { type: "number", description: "En fazla 100" },
      },
      required: ["tablo"],
    },
  },
    {
    name: "musteri_ciro_siralama",
    description: "Müşterileri ciroya veya iş sayısına göre sıralar. 'En çok iş/ciro yapan müşteri', 'X firmasından toplam ne kadar kazandık' gibi sorularda MUTLAKA bunu kullan, veri_sorgula ile sayma. Sadece fiyatı girilmiş işleri sayar, firma adı varyantlarını birleştirir (analiz sayfasıyla aynı kaynak).",
    input_schema: {
      type: "object",
      properties: {
        ay: { type: "string", description: "Örn 2026-09. Boşsa tüm zamanlar" },
        anahtar_kelime: { type: "string", description: "Sadece adında bu geçen firmalar, örn 'karesi'" },
        sirala: { type: "string", enum: ["ciro", "is_sayisi"] },
        ilk: { type: "number", description: "Kaç firma gösterilsin (varsayılan 5)" },
      },
    },
  },
    {
    name: "not_kaydet",
    description: "Kaya'nın kalıcı olarak hatırlanmasını istediği bir kuralı veya bilgiyi kaydeder. Sadece Kaya açıkça 'hatırla', 'not al', 'bundan sonra' gibi bir şey derse çağır. Kendi kendine not ekleme.",
    input_schema: {
      type: "object",
      properties: {
        konu: { type: "string", description: "Kısa başlık, örn: Coats indirim" },
        not_metni: { type: "string", description: "Hatırlanacak bilginin tam metni" },
      },
      required: ["not_metni"],
    },
  },
    {
    name: "teklif_taslagi_hazirla",
    description: "Müşteri için teklif TASLAĞI hazırlar. Teklifi kaydetmez, Kaya'nın onayına sunar. Fiyatlar depodan koddan gelir, birim_fiyat'ı sadece Kaya özellikle bir fiyat söylediyse gir. indirim_yuzde'yi sadece Kaya bu teklif için açıkça söylediyse gir.",
    input_schema: {
      type: "object",
      properties: {
        musteri: { type: "string", description: "Firma adı" },
        yetkili: { type: "string" },
        adres: { type: "string" },
        kalemler: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ad: { type: "string", description: "Depodaki malzeme/işçilik adı" },
              adet: { type: "number" },
              birim_fiyat: { type: "number", description: "Sadece Kaya fiyat söylediyse" },
            },
            required: ["ad", "adet"],
          },
        },
        indirim_yuzde: { type: "number", description: "0-50, sadece Kaya söylediyse" },
        not_metni: { type: "string", description: "Teklif notları/şartlar, boşsa standart metin" },
      },
      required: ["musteri", "kalemler"],
    },
  },
];

// Araçların gerçekte yaptığı işler (hepsi sadece SELECT)
export async function runTool(name: string, input: any) {
  switch (name) {
    case "mimli_sirket_kontrol": {
      // Liste küçük olduğu için hepsini çekip kod tarafında sadeleştirerek karşılaştırıyoruz
      const { data, error } = await db
        .from("blacklisted_companies")
        .select("company_name, contact_person, reason_category, details, created_at");
      if (error) return { hata: error.message };
      const aranan = sade(input.firma_adi);
      const eslesen = (data ?? []).filter((k) => {
        const ad = sade(k.company_name);
        return aranan.length >= 3 && (ad.includes(aranan) || aranan.includes(ad));
      });
      return eslesen.length
        ? { mimli: true, kayitlar: eslesen, uyari: "DURDUR. Kaya'dan onay bekle." }
        : { mimli: false, kontrol_edilen_toplam_kayit: data?.length };
    }

    case "musteri_gecmisi": {
      const f = desen(input.firma_adi);
      const [teklif, servis] = await Promise.all([
        db.from("offers").select("offer_date, template_type, total_price, final_price, status")
          .ilike("customer_name", f).order("offer_date", { ascending: false }).limit(10),
        db.from("completed_services").select("service_date, service_type, description, price, currency")
          .ilike("customer_text", f).order("service_date", { ascending: false }).limit(10),
      ]);
      return { teklifler: teklif.data, servisler: servis.data };
    }

    case "veri_sorgula": {
      if (!IZINLI_TABLOLAR.includes(input.tablo)) return { hata: "Bu tabloya erişim yok" };
      const sut = input.sutunlar || "*";
      if (!/^[a-z0-9_,\s*]+$/i.test(sut)) return { hata: "Geçersiz sütun listesi" };
      let q: any = db.from(input.tablo).select(sut);
      for (const f of input.filtreler ?? []) {
        if (f.islem === "ilike") q = q.ilike(f.sutun, desen(f.deger));
        else if (["eq", "neq", "gt", "gte", "lt", "lte"].includes(f.islem)) q = q[f.islem](f.sutun, f.deger);
      }
      if (input.sirala) q = q.order(input.sirala, { ascending: !input.azalan });
      q = q.limit(Math.min(Number(input.limit) || 50, 100));
      const { data, error } = await q;
      return error ? { hata: error.message } : { adet: data.length, kayitlar: data };
    }

    case "bekleyen_isler": {
      const { data, error } = await db
        .from("service_tickets")
        .select("id, created_at, issue_type, description, status, pipeline_status, priority, assigned_team, manual_customer_name, manual_location")
        .order("created_at", { ascending: false })
        .limit(input.limit ?? 30);
      return error ? { hata: error.message } : data;
    }

    case "finans_ozet": {
      const [y, m] = input.ay.split("-").map(Number);
      const bas = `${input.ay}-01`;
      const son = new Date(y, m, 0).getDate();
      const bit = `${input.ay}-${String(son).padStart(2, "0")}`;
      const [servis, fin] = await Promise.all([
        db.from("completed_services").select("price, currency").gte("service_date", bas).lte("service_date", bit),
        db.from("financial_records").select("*").eq("month_key", input.ay).maybeSingle(),
      ]);
      const ciro = (servis.data ?? []).reduce((t, s) => t + Number(s.price || 0), 0);
      const g = fin.data;
      const gider = g
        ? ["maas","malzeme","kira","tazminat","yakit","yemek","mesai_yemek","arac_yipranma","arac_sigorta","arac_bakim"]
            .reduce((t, k) => t + Number((g as any)[k] || 0), 0)
        : null;
      return { ay: input.ay, servis_sayisi: servis.data?.length, ciro_toplam: ciro, gider_toplam: gider, gider_detay: g, not: "Ciro KDV durumu ve para birimi kontrol edilmeli." };
    }

    case "arac_durumlari": {
      const { data, error } = await db.from("fleet_vehicles")
        .select("plate, vehicle_name, insurance_date, casco_date, inspection_date, current_km, next_oil_km, assigned_driver");
      if (error) return { hata: error.message };
      return data.map((a) => ({
        plat: a.plate, arac: a.vehicle_name, surucu: a.assigned_driver,
        sigorta_kalan_gun: gunKaldi(a.insurance_date),
        kasko_kalan_gun: gunKaldi(a.casco_date),
        muayene_kalan_gun: gunKaldi(a.inspection_date),
        km: a.current_km, sonraki_yag_km: a.next_oil_km,
      }));
    }

    case "sozlesme_durumlari": {
      const { data, error } = await db.from("maintenance_contracts")
        .select("company_name, machine_count, price_per_machine, maintenance_period_months, start_date, end_date, status");
      if (error) return { hata: error.message };
      return data.map((s) => ({ ...s, kalan_gun: gunKaldi(s.end_date) }));
    }

    case "depo_fiyat_ara": {
      const { data, error } = await db.from("materials")
        .select("name, unit, buy_price, sale_price, discount_rate")
        .ilike("name", `%${input.aranan}%`).limit(15);
      if (error) return { hata: error.message };
      return data.map((x) => ({
        ...x,
        marj_yuzde: x.buy_price > 0 ? Math.round(((x.sale_price - x.buy_price) / x.buy_price) * 100) : null,
      }));
    }
        case "musteri_ciro_siralama": {
      const satirlar: any[] = [];
      for (let from = 0; ; from += 1000) {
        let q: any = db.from("completed_services")
          .select("customer_text, price, service_date")
          .order("service_date").range(from, from + 999);
        if (input.ay) {
          const [y, m] = input.ay.split("-").map(Number);
          const son = new Date(y, m, 0).getDate();
          q = q.gte("service_date", `${input.ay}-01`).lte("service_date", `${input.ay}-${String(son).padStart(2, "0")}`);
        }
        const { data, error } = await q;
        if (error) return { hata: error.message };
        satirlar.push(...data);
        if (data.length < 1000) break;
      }

      const anahtar = input.anahtar_kelime ? adNorm(input.anahtar_kelime) : "";
      const paralilar = satirlar.filter(
        (r) => Number(r.price) > 0 && r.customer_text && (!anahtar || adNorm(r.customer_text).includes(anahtar))
      );
      const harita = firmaHaritasi(paralilar.map((r) => r.customer_text));

      const gr: Record<string, { ciro: number; is_sayisi: number; yazilislar: Set<string> }> = {};
      for (const r of paralilar) {
        const k = harita[adNorm(r.customer_text)];
        gr[k] ??= { ciro: 0, is_sayisi: 0, yazilislar: new Set() };
        gr[k].ciro += Number(r.price);
        gr[k].is_sayisi += 1;
        gr[k].yazilislar.add(r.customer_text);
      }

      const liste = Object.entries(gr)
        .map(([firma, v]) => ({
          firma: firma.toUpperCase(),
          ciro: Math.round(v.ciro * 100) / 100,
          is_sayisi: v.is_sayisi,
          birlestirilen_yazilislar: [...v.yazilislar],
        }))
        .sort((a, b) => (input.sirala === "is_sayisi" ? b.is_sayisi - a.is_sayisi : b.ciro - a.ciro))
        .slice(0, Number(input.ilk) || 5);

      return {
        donem: input.ay || "tüm zamanlar",
        fiyatli_is_toplam: paralilar.length,
        liste,
        not: "Sadece fiyatı girilmiş işler. Aynı firmanın farklı yazılışları birleştirildi.",
      };
    }

        case "not_kaydet": {
      const { error } = await db.from("ajan_notlari").insert({
        konu: input.konu ?? null,
        not_metni: input.not_metni,
      });
      return error ? { hata: error.message } : { kaydedildi: true };
    }

        case "teklif_taslagi_hazirla": {
      const musteri = String(input.musteri ?? "").trim();
      if (!musteri) return { hata: "Müşteri adı yok" };
      if (!Array.isArray(input.kalemler) || !input.kalemler.length) return { hata: "Kalem yok" };

      let mimli;
      try { mimli = await mimliBul(musteri); }
      catch (e: any) { return { hata: "Mimli kontrolü yapılamadı, taslak oluşturulmadı: " + e.message }; }
      if (mimli.length)
        return { reddedildi: true, neden: "Firma mimli listede", kayitlar: mimli, uyari: "Taslak OLUŞTURULMADI. Kaya'ya bildir ve onay bekle." };

      const ind = Number(input.indirim_yuzde) || 0;
      if (ind < 0 || ind > 50) return { hata: "İndirim 0-50 arasında olmalı" };

      const kalemler: any[] = [];
      for (const [i, k] of input.kalemler.entries()) {
        const adet = Number(k.adet);
        let ad = String(k.ad ?? "").trim();
        if (!ad || !(adet > 0)) return { hata: `Geçersiz kalem: ${ad || "(adsız)"}` };
        let fiyat = Number(k.birim_fiyat);

        if (!(fiyat > 0)) {
          const { data, error } = await db.from("materials").select("name, sale_price").ilike("name", desen(ad)).limit(20);
          if (error) return { hata: error.message };
          const tam = (data ?? []).filter((x) => adNorm(x.name) === adNorm(ad));
          const secilen = tam.length === 1 ? tam[0] : data?.length === 1 ? data[0] : null;
          if (!secilen)
            return {
              hata: `"${ad}" için depoda ${data?.length ? "birden fazla eşleşme var" : "kayıt yok"}. Kaya'ya sor, tahmin etme.`,
              adaylar: (data ?? []).slice(0, 8).map((x) => ({ ad: x.name, satis: x.sale_price })),
            };
          if (!(Number(secilen.sale_price) > 0))
            return { hata: `"${secilen.name}" için depoda satış fiyatı girilmemiş. Kaya'dan fiyat iste.` };
          ad = secilen.name;
          fiyat = Number(secilen.sale_price);
        }

        if (ind) fiyat = Math.round(fiyat * (1 - ind / 100) * 100) / 100;
        kalemler.push({ ad, id: Date.now() + i, adet, birim_fiyat: fiyat, toplam: Math.round(adet * fiyat * 100) / 100 });
      }

      const toplam = Math.round(kalemler.reduce((t, k) => t + k.toplam, 0) * 100) / 100;
      const teklif = {
        customer_name: musteri,
        customer_rep: input.yetkili ?? null,
        customer_address: input.adres ?? null,
        template_type: "standart",
        items: kalemler,
        total_price: toplam,
        status: "beklemede",
        description: input.not_metni || VARSAYILAN_NOT,
      };
      const ozet = `${musteri}: ${kalemler.length} kalem, ${toplam} TL${ind ? ` (%${ind} indirimli)` : ""}`;
      const { data: kayit, error } = await db
        .from("bekleyen_onaylar")
        .insert({ tur: "teklif", ozet, veri: { teklif, indirim_yuzde: ind } })
        .select("id").single();
      if (error) return { hata: error.message };

      return {
        taslak_olusturuldu: true,
        musteri,
        kalemler: kalemler.map((k) => ({ ad: k.ad, adet: k.adet, birim_fiyat: k.birim_fiyat, toplam: k.toplam })),
        genel_toplam: toplam,
        indirim_yuzde: ind,
        uyari: "Teklif HENÜZ KAYDEDİLMEDİ. Kaya ekrandaki Bekleyen Onaylar kutusundan Onayla'ya basınca kaydedilir. Kaya'ya bunu söyle.",
      };
    }
    
    default:
      return { hata: "Bilinmeyen araç" };
  }
}