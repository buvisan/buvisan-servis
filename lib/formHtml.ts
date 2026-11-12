// ----------------------------------------------------------------------------
// BUVİSAN - SAF CSS A4 FORM ÜRETİCİ 📄
// Tailwind YOK · oklch YOK · html2canvas %100 uyumlu
// ----------------------------------------------------------------------------

export type RaporVeri = any;

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    background: #fff; color: #111827;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sayfa {
    width: 794px; min-height: 1123px;
    padding: 32px 38px;
    background: #fff;
    margin: 0 auto;
  }
  .ust { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  .logo {
    background: #facc15; border-radius: 10px;
    padding: 14px 22px; display: inline-block;
  }
  .logo b { font-size: 26px; font-weight: 900; letter-spacing: -0.5px; color: #111827; }
  .firma-bilgi { text-align: right; font-size: 11px; line-height: 1.55; color: #6b7280; }
  .firma-bilgi b { display: block; font-size: 12.5px; color: #111827; margin-bottom: 2px; }
  .cizgi { height: 2.5px; background: #111827; margin: 16px 0 20px; }
  .baslik { text-align: center; margin-bottom: 20px; }
  .baslik h1 { font-size: 22px; font-weight: 900; letter-spacing: 0.5px; }
  .baslik p { font-size: 11px; color: #6b7280; margin-top: 4px; }

  table { width: 100%; border-collapse: collapse; }
  .kutu { border: 2px solid #111827; margin-bottom: 14px; }
  .kutu table td {
    border: 1px solid #111827; padding: 8px 10px;
    font-size: 12px; vertical-align: top;
  }
  .kutu table td.etiket { font-weight: 700; white-space: nowrap; width: 1%; background: #f9fafb; }

  .rapor-no { font-size: 20px; font-weight: 900; color: #dc2626; }
  .bolum { margin: 16px 0; }
  .bolum-bas {
    background: #e5e7eb; padding: 7px 10px;
    font-size: 11.5px; font-weight: 800; letter-spacing: 0.4px;
    border: 1px solid #9ca3af; border-bottom: 0;
  }
  .bolum-icerik {
    border: 1px solid #9ca3af; padding: 10px 12px;
    font-size: 12px; line-height: 1.65; min-height: 54px;
    white-space: pre-wrap;
  }

  .tbl th {
    background: #f3f4f6; border: 1px solid #9ca3af;
    padding: 7px 9px; font-size: 11px; font-weight: 800; text-align: left;
  }
  .tbl td {
    border: 1px solid #9ca3af; padding: 7px 9px;
    font-size: 11.5px;
  }
  .tbl td.sag { text-align: right; }
  .tbl td.orta { text-align: center; }
  .tbl tr.toplam td { font-weight: 900; background: #f9fafb; }

  .imza-alan { display: flex; gap: 18px; margin-top: 26px; }
  .imza-kutu {
    flex: 1; border: 1.5px solid #111827;
    padding: 8px 10px 0; min-height: 105px;
  }
  .imza-kutu .et { font-size: 9.5px; font-weight: 800; letter-spacing: 0.4px; color: #374151; text-transform: uppercase; }
  .imza-kutu .ad { font-size: 12px; font-weight: 900; margin-top: 6px; }
  .imza-kutu img { max-height: 48px; margin-top: 6px; }
  .imza-cizgi { border-bottom: 1px solid #9ca3af; height: 40px; margin-top: 4px; }

  .memnuniyet {
    border: 2px solid #34d399; border-radius: 10px;
    background: #ecfdf5; padding: 10px 14px; margin-top: 16px;
  }
  .memnuniyet .et { font-size: 10px; font-weight: 800; color: #065f46; letter-spacing: 0.4px; }
  .memnuniyet .yildiz { font-size: 18px; letter-spacing: 2px; color: #111827; margin-top: 4px; }

  .alt-yazi { text-align: center; font-size: 8.5px; color: #9ca3af; margin-top: 22px; }

  @media print { @page { size: A4 portrait; margin: 0; } body { background: #fff; } }
`;

const firma = `
  <div class="firma-bilgi">
    <b>ZM METAL MAKİNA İMALAT SANAYİ VE TİCARET LİMİTED ŞİRKETİ</b>
    info@zmmetal.com.tr - www.buvisan.com<br>
    DEMİRCİ MAH. / BURSA - TEL: 0224 374 00 01
  </div>
`;

function esc(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function tarih(s: any): string {
  if (!s) return "—";
  const d = String(s).slice(0, 10).split("-");
  if (d.length === 3) return `${d[2]}.${d[1]}.${d[0]}`;
  return String(s);
}

// ═══════════════════════════════════════════════════════════
// SERVİS RAPORU
// ═══════════════════════════════════════════════════════════
export function servisRaporuHtml(r: RaporVeri): string {
  const parcalar = (() => {
    try {
      const p = r?.degisen_parcalar;
      if (!p) return [] as any[];
      if (Array.isArray(p)) return p;
      if (typeof p === "string") {
        try { const j = JSON.parse(p); return Array.isArray(j) ? j : []; } catch { return []; }
      }
      return [];
    } catch { return []; }
  })();

  const puan = Number(r?.musteri_puani || 0);

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>Servis Raporu - ${esc(r?.firma_adi)}</title><style>${css}</style></head>
<body><div class="sayfa">

  <div class="ust">
    <div class="logo"><b>BUVİSAN</b></div>
    ${firma}
  </div>
  <div class="cizgi"></div>

  <div class="baslik">
    <h1>SERVİS RAPORU</h1>
    <p>No: <b style="color:#dc2626">${esc(String(r?.id || "").slice(0, 6).toUpperCase())}</b></p>
  </div>

  <div class="kutu"><table>
    <tr><td class="etiket">FİRMA ADI</td><td><b>${esc(r?.firma_adi || "—")}</b></td></tr>
    <tr><td class="etiket">FİRMA ADRESİ</td><td>${esc(r?.firma_adresi || "—")}</td></tr>
    <tr><td class="etiket">İŞYERİNE VARIŞ</td><td>${esc(r?.isyerine_varis_tarih_saat || "—")}</td></tr>
    <tr><td class="etiket">İŞYERİNDEN AYRILIŞ</td><td>${esc(r?.isyerinden_ayrilis_tarih_saat || "—")}</td></tr>
    <tr><td class="etiket">SÜRE</td><td>${r?.sure_dakika ? esc(r.sure_dakika) + " dakika" : "—"}</td></tr>
  </table></div>

  <table class="tbl" style="margin-bottom:14px">
    <tr>
      <th>VİNCİN MODELİ</th><th>SERİ NO</th><th>İŞLEM TÜRÜ</th><th>PERSONEL</th>
    </tr>
    <tr>
      <td>${esc(r?.vinc_modeli || "—")}</td>
      <td>${esc(r?.vinc_seri_no || "—")}</td>
      <td>${esc(r?.islem_turu || "SERVİS")}</td>
      <td>${esc(String(r?.personel_adi || "—").toUpperCase())}</td>
    </tr>
  </table>

  <div class="bolum">
    <div class="bolum-bas">ARIZANIN CİNSİ</div>
    <div class="bolum-icerik">${esc(r?.arizanin_cinsi || "—")}</div>
  </div>

  <div class="bolum">
    <div class="bolum-bas">YAPILAN İŞLER</div>
    <div class="bolum-icerik">${esc(r?.yapilan_isler || "—")}</div>
  </div>

  <div class="bolum">
    <div class="bolum-bas">DEĞİŞEN PARÇALAR</div>
    <table class="tbl">
      <tr><th style="width:90px">PARÇA NO</th><th>PARÇA ADI</th><th style="width:70px;text-align:center">ADET</th></tr>
      ${parcalar.length > 0
        ? parcalar.map((p: any, i: number) => `<tr>
            <td>${esc(p?.parca_no || p?.no || "-")}</td>
            <td>${esc(p?.ad || p?.parca_adi || p?.name || "-")}</td>
            <td class="orta">${esc(p?.adet ?? p?.qty ?? 1)}</td>
          </tr>`).join("")
        : `<tr><td colspan="3" style="text-align:center;color:#9ca3af">Parça değişimi yapılmadı</td></tr>`}
    </table>
  </div>

  ${puan > 0 ? `<div class="memnuniyet">
    <div class="et">⭐ MÜŞTERİ MEMNUNİYETİ</div>
    <div class="yildiz">${"★".repeat(puan)}${"☆".repeat(5 - puan)} &nbsp; ${puan}/5</div>
  </div>` : ""}

  <div class="imza-alan">
    <div class="imza-kutu">
      <div class="et">Servis Yetkilisi</div>
      <div class="ad">${esc(String(r?.personel_adi || "—").toUpperCase())}</div>
      <div class="imza-cizgi"></div>
    </div>
    <div class="imza-kutu">
      <div class="et">Müşteri Yetkilisi</div>
      <div class="ad">${esc(String(r?.imza_atan || "—").toUpperCase())}</div>
      ${r?.imza_url ? `<img src="${esc(r.imza_url)}" alt="imza">` : `<div class="imza-cizgi"></div>`}
    </div>
    <div class="imza-kutu">
      <div class="et">Rapor Tarihi</div>
      <div class="ad">${tarih(r?.created_at)}</div>
      <div class="imza-cizgi"></div>
    </div>
  </div>

  <div class="alt-yazi">BUVİSAN Vinç Servis · 0224 374 00 01 · www.buvisan.com</div>
</div></body></html>`;
}

// ═══════════════════════════════════════════════════════════
// BAKIM FORMU
// ═══════════════════════════════════════════════════════════
export function bakimFormuHtml(b: RaporVeri): string {
  const maddeler = (() => {
    try {
      const m = b?.maddeler;
      if (!m) return [] as any[];
      if (Array.isArray(m)) return m;
      if (typeof m === "string") { const j = JSON.parse(m); return Array.isArray(j) ? j : []; }
      return [];
    } catch { return []; }
  })();

  const makine = (() => {
    try {
      const m = b?.makine_bilgileri;
      if (!m) return {} as any;
      if (typeof m === "object") return m;
      return JSON.parse(String(m));
    } catch { return {} as any; }
  })();

  const puan = Number(b?.musteri_puani || 0);

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>Bakım Formu - ${esc(b?.musteri)}</title><style>${css}</style></head>
<body><div class="sayfa">

  <div class="ust">
    <div class="logo"><b>BUVİSAN</b></div>
    ${firma}
  </div>
  <div class="cizgi"></div>

  <div class="baslik">
    <h1>${b?.form_tipi === "asansor" ? "ASANSÖR" : "VİNÇ"} PERİYODİK BAKIM FORMU</h1>
    <p>Seri No: <b style="color:#dc2626">${esc(b?.seri_no || "—")}</b></p>
  </div>

  <div class="kutu"><table>
    <tr><td class="etiket">MÜŞTERİ</td><td><b>${esc(b?.musteri || "—")}</b></td></tr>
    <tr><td class="etiket">YETKİLİ</td><td>${esc(b?.yetkili || "—")}</td></tr>
    <tr><td class="etiket">TELEFON</td><td>${esc(b?.telefon || "—")}</td></tr>
    <tr><td class="etiket">ADRES</td><td>${esc(b?.adres || "—")}</td></tr>
    <tr><td class="etiket">PERSONEL</td><td>${esc(String(b?.personel || "—").toUpperCase())}</td></tr>
    <tr><td class="etiket">KONTROL TARİHİ</td><td>${tarih(b?.kontrol_tarihi)} ${esc(b?.kontrol_saati || "")}</td></tr>
  </table></div>

  ${Object.keys(makine).length > 0 ? `
  <div class="bolum">
    <div class="bolum-bas">MAKİNE BİLGİLERİ</div>
    <table class="tbl">
      ${Object.entries(makine).filter(([, v]) => v).map(([k, v]) =>
        `<tr><td class="etiket" style="width:130px;font-weight:700;background:#f9fafb">${esc(k.replace(/_/g, " ").toUpperCase())}</td><td>${esc(v)}</td></tr>`
      ).join("")}
    </table>
  </div>` : ""}

  <table class="tbl" style="margin:14px 0">
    <tr>
      <th style="width:70px;text-align:center">ONAY</th>
      <th style="width:70px;text-align:center">RET</th>
      <th style="width:130px;text-align:center">MEMNUNİYET</th>
      <th style="text-align:center">DURUM</th>
    </tr>
    <tr>
      <td class="orta" style="font-weight:900;color:#059669;font-size:15px">${esc(b?.onay_sayisi ?? 0)}</td>
      <td class="orta" style="font-weight:900;color:#dc2626;font-size:15px">${esc(b?.ret_sayisi ?? 0)}</td>
      <td class="orta">${puan > 0 ? "★".repeat(puan) + " " + puan + "/5" : "—"}</td>
      <td class="orta" style="font-weight:900">${b?.is_durumu === "devam_ediyor" ? "DEVAM EDİYOR" : "TAMAMLANDI"}</td>
    </tr>
  </table>

  ${maddeler.length > 0 ? `
  <div class="bolum">
    <div class="bolum-bas">KONTROL MADDELERİ</div>
    <table class="tbl">
      <tr><th>Kontrol Maddesi</th><th style="width:60px;text-align:center">RET</th><th style="width:60px;text-align:center">ONAY</th></tr>
      ${maddeler.map((m: any) => `<tr>
        <td>${esc(m?.madde || m?.ad || m?.metin || "-")}</td>
        <td class="orta" style="color:#dc2626;font-weight:900">${m?.durum === "ret" || m?.ret ? "✗" : ""}</td>
        <td class="orta" style="color:#059669;font-weight:900">${m?.durum === "onay" || m?.onay ? "✓" : (m?.durum ? "" : "✓")}</td>
      </tr>`).join("")}
    </table>
  </div>` : ""}

  ${b?.notlar ? `<div class="bolum">
    <div class="bolum-bas">NOTLAR</div>
    <div class="bolum-icerik">${esc(b.notlar)}</div>
  </div>` : ""}

  <div class="imza-alan">
    <div class="imza-kutu">
      <div class="et">Bakım Personeli</div>
      <div class="ad">${esc(String(b?.personel || "—").toUpperCase())}</div>
      ${b?.personel_imza ? `<img src="${esc(b.personel_imza)}" alt="imza">` : `<div class="imza-cizgi"></div>`}
    </div>
    <div class="imza-kutu">
      <div class="et">Müşteri Yetkilisi</div>
      <div class="ad">${esc(String(b?.musteri_adi || b?.yetkili || "—").toUpperCase())}</div>
      ${b?.musteri_imza ? `<img src="${esc(b.musteri_imza)}" alt="imza">` : `<div class="imza-cizgi"></div>`}
    </div>
    <div class="imza-kutu">
      <div class="et">Kontrol Tarihi</div>
      <div class="ad">${tarih(b?.kontrol_tarihi)}</div>
      <div class="imza-cizgi"></div>
    </div>
  </div>

  <div class="alt-yazi">BUVİSAN Vinç Servis · 0224 374 00 01 · www.buvisan.com</div>
</div></body></html>`;
}

// ═══════════════════════════════════════════════════════════
// FİYAT TEKLİFİ
// ═══════════════════════════════════════════════════════════
export function teklifHtml(t: RaporVeri, kalemler: any[]): string {
  const toplam = (kalemler || []).reduce(
    (s, k) => s + (Number(k?.toplam) || (Number(k?.adet) || 0) * (Number(k?.birim_fiyat) || 0)), 0
  );

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>Fiyat Teklif Formu</title><style>${css}</style></head>
<body><div class="sayfa">

  <div class="ust">
    <div class="logo"><b>BUVİSAN</b></div>
    ${firma}
  </div>
  <div class="cizgi"></div>

  <div class="baslik">
    <h1>FİYAT TEKLİF FORMU</h1>
    <p>Tarih: ${tarih(t?.created_at || new Date().toISOString())}</p>
  </div>

  <div class="kutu"><table>
    <tr><td class="etiket">SAYIN</td><td>${esc(t?.customer_rep || t?.yetkili || "Yetkili")}</td></tr>
    <tr><td class="etiket">FİRMA</td><td><b>${esc(t?.customer_name || t?.musteri || "—")}</b></td></tr>
    <tr><td class="etiket">ADRES</td><td>${esc(t?.customer_address || t?.adres || "—")}</td></tr>
  </table></div>

  <table class="tbl" style="margin:16px 0">
    <tr>
      <th>AÇIKLAMA / MALZEME</th>
      <th style="width:70px;text-align:center">MİKTAR</th>
      <th style="width:110px;text-align:right">BİRİM FİYAT</th>
      <th style="width:110px;text-align:right">TUTAR</th>
    </tr>
    ${(kalemler || []).length > 0
      ? kalemler.map((k: any) => {
          const adet = Number(k?.adet) || 1;
          const bf = Number(k?.birim_fiyat) || 0;
          const tt = Number(k?.toplam) || adet * bf;
          return `<tr>
            <td>${esc(k?.ad || "-")}</td>
            <td class="orta">${adet}</td>
            <td class="sag">${bf.toLocaleString("tr-TR")} ₺</td>
            <td class="sag"><b>${tt.toLocaleString("tr-TR")} ₺</b></td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="4" style="text-align:center;color:#9ca3af">Kalem yok</td></tr>`}
    <tr class="toplam">
      <td colspan="3" class="sag">GENEL TOPLAM</td>
      <td class="sag">${toplam.toLocaleString("tr-TR")} ₺</td>
    </tr>
  </table>

  <div class="bolum">
    <div class="bolum-bas">NOTLAR VE ŞARTLAR</div>
    <div class="bolum-icerik">Bu teklif 15 gün süreyle geçerlidir. Fiyatlara KDV dahil değildir.</div>
  </div>

  <div class="imza-alan">
    <div class="imza-kutu">
      <div class="et">Müşteri Onayı</div>
      <div class="ad">İmza / Kaşe</div>
      <div class="imza-cizgi"></div>
    </div>
    <div class="imza-kutu">
      <div class="et">BUVİSAN Onayı</div>
      <div class="ad">İmza / Kaşe</div>
      <div class="imza-cizgi"></div>
    </div>
  </div>

  <div class="alt-yazi">BUVİSAN Vinç Servis · 0224 374 00 01 · www.buvisan.com</div>
</div></body></html>`;
}
