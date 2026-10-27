"use client";

// ----------------------------------------------------------------------------
// BUVİSAN - ADMIN BİLDİRİM SAYAÇLARI 🔴
// Her admin butonunda canlı bildirim sayısı
//   • "Yeni" tipi: son ziyaretten sonra eklenenler (ziyaret edince sıfırlanır)
//   • "Bekleyen" tipi: her zaman toplam bekleyen (iş bitince düşer)
// localStorage ile "görüldü" takibi
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type BildirimSayilari = {
  sahaRaporlari: number;
  bakimFormlari: number;
  teklifBekleyen: number;
  personelTalepleri: number;
  acikArizalar: number;
  canliTakip: number;
  bakimYaklasan: number;
  saglikKritik: number;
};

const BOS: BildirimSayilari = {
  sahaRaporlari: 0, bakimFormlari: 0, teklifBekleyen: 0, personelTalepleri: 0,
  acikArizalar: 0, canliTakip: 0, bakimYaklasan: 0, saglikKritik: 0,
};

// localStorage anahtarları
const ANAHTAR = "buvisan_son_gorulen";

function sonGorulen(anahtar: string): string {
  try {
    const v = window.localStorage.getItem(`${ANAHTAR}_${anahtar}`);
    return v || "1970-01-01T00:00:00Z";
  } catch { return "1970-01-01T00:00:00Z"; }
}

export function gorulduIsaretle(anahtar: string) {
  try {
    window.localStorage.setItem(`${ANAHTAR}_${anahtar}`, new Date().toISOString());
  } catch { /* yoksay */ }
}

export function useBildirimler() {
  const [sayilar, setSayilar] = useState<BildirimSayilari>(BOS);
  const [yukleniyor, setYukleniyor] = useState(true);

  const hesapla = useCallback(async () => {
    try {
      const sonSaha = sonGorulen("saha");
      const sonBakim = sonGorulen("bakim");
      const sonTalep = sonGorulen("talep");

      // ═══ SAHA RAPORLARI (yeni) ═══
      let saha = 0;
      try {
        const { count: c1 } = await supabase.from("service_reports")
          .select("id", { count: "exact", head: true })
          .gt("created_at", sonSaha);
        saha += c1 || 0;
      } catch { /* yoksay */ }
      try {
        const { count: c2 } = await supabase.from("bakim_formlari")
          .select("id", { count: "exact", head: true })
          .gt("created_at", sonBakim);
        saha += c2 || 0;
      } catch { /* yoksay */ }

      // ═══ BAKIM FORMLARI (yeni) ═══
      let bakim = 0;
      try {
        const { count } = await supabase.from("bakim_formlari")
          .select("id", { count: "exact", head: true })
          .gt("created_at", sonBakim);
        bakim = count || 0;
      } catch { /* yoksay */ }

      // ═══ TEKLİF BEKLEYEN ═══
      let teklif = 0;
      try {
        const { data } = await supabase.rpc("teklif_bekleyen_listesi", { p_durum: "BEKLIYOR" });
        teklif = (data || []).length;
      } catch { /* yoksay */ }

      // ═══ PERSONEL TALEPLERİ (yeni) ═══
      let talep = 0;
      try {
        const { count } = await supabase.from("personel_talepler")
          .select("id", { count: "exact", head: true })
          .gt("created_at", sonTalep)
          .in("durum", ["bekliyor", "BEKLIYOR", "onay_bekliyor"]);
        talep = count || 0;
      } catch { /* yoksay */ }

      // ═══ AÇIK ARIZALAR ═══
      let ariza = 0;
      try {
        const { data } = await supabase.from("service_tickets")
          .select("id, pipeline_status")
          .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString());
        ariza = (data || []).filter((t: any) =>
          !["tamamlandi", "iptal", "cozuldu"].includes(t.pipeline_status)).length;
      } catch { /* yoksay */ }

      // ═══ CANLI TAKİP (aktif) ═══
      let takip = 0;
      try {
        const { count } = await supabase.from("is_takip")
          .select("id", { count: "exact", head: true })
          .not("durum", "in", "(tamamlandi,iptal,teslim_edildi)");
        takip = count || 0;
      } catch { /* yoksay */ }

      // ═══ YAKLAŞAN BAKIM (30 gün) ═══
      let bakimY = 0;
      try {
        const { data } = await supabase.from("cranes")
          .select("id, next_maintenance_date")
          .not("next_maintenance_date", "is", null)
          .lte("next_maintenance_date", new Date(Date.now() + 30 * 86400000).toISOString());
        bakimY = (data || []).length;
      } catch { /* yoksay */ }

      // ═══ KRİTİK VİNÇ SAĞLIĞI ═══
      let saglik = 0;
      try {
        const { data } = await supabase.rpc("vinc_saglik_listesi");
        saglik = (data || []).filter((v: any) => Number(v.saglik_skoru || 100) < 40).length;
      } catch { /* yoksay */ }

      setSayilar({
        sahaRaporlari: saha,
        bakimFormlari: bakim,
        teklifBekleyen: teklif,
        personelTalepleri: talep,
        acikArizalar: ariza,
        canliTakip: takip,
        bakimYaklasan: bakimY,
        saglikKritik: saglik,
      });
    } finally { setYukleniyor(false); }
  }, []);

  useEffect(() => {
    hesapla();
    // 30 saniyede bir güncelle (anlık)
    const t = setInterval(hesapla, 30000);
    // Sekmeye geri dönünce hemen güncelle
    const onFocus = () => hesapla();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [hesapla]);

  return { sayilar, yukleniyor, yenile: hesapla };
}
