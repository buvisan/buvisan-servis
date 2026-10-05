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

    default:
      return { hata: "Bilinmeyen araç" };
  }
}