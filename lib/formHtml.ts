// ----------------------------------------------------------------------------
// BUVİSAN - PROFESYONEL A4 FORM ŞABLONLARI 📄
// Saf CSS · Tailwind YOK · html2canvas uyumlu
// ----------------------------------------------------------------------------

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    background: #fff;
    color: #111827;
    font-size: 12px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .sayfa {
    width: 794px;
    min-height: 0;
    padding: 40px 44px 32px;
    background: #fff;
    margin: 0 auto;
    display: block;
  }

  /* ─────────── ÜST BLOK ─────────── */
  .ust { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }

  .marka { display: flex; flex-direction: column; gap: 8px; }
  .logo {
    background: linear-gradient(135deg, #facc15 0%, #eab308 100%);
    border-radius: 6px;
    padding: 10px 20px;
    display: inline-block;
    box-shadow: 0 1px 2px rgba(0,0,0,0.08);
  }
  .logo b {
    font-size: 24px;
    font-weight: 900;
    letter-spacing: 0.5px;
    color: #0f172a;
  }
  .marka-alt {
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 1.1px;
    color: #64748b;
    text-transform: uppercase;
  }

  .iletisim { text-align: right; font-size: 9.5px; line-height: 1.75; color: #64748b; font-weight: 500; }
  .iletisim b {
    display: block;
    font-size: 10px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: 0.2px;
    margin-bottom: 3px;
    max-width: 300px;
  }

  .serit {
    height: 3px;
    background: linear-gradient(90deg, #0f172a 0%, #334155 55%, #facc15 55%, #facc15 100%);
    margin: 20px 0 26px;
    border-radius: 2px;
  }

  /* ─────────── BAŞLIK ─────────── */
  .baslik { text-align: center; margin-bottom: 26px; }
  .baslik h1 {
    font-size: 19px;
    font-weight: 900;
    letter-spacing: 2.2px;
    color: #0f172a;
    text-transform: uppercase;
  }
  .baslik .alt {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    font-size: 10px;
    font-weight: 600;
    color: #64748b;
  }
  .baslik .alt b { color: #dc2626; font-weight: 900; letter-spacing: 0.5px; }

  /* ─────────── BİLGİ KUTUSU ─────────── */
  .bilgi-kutu {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #f8fafc;
    overflow: hidden;
    margin-bottom: 20px;
  }
  .bilgi-kutu table { width: 100%; border-collapse: collapse; }
  .bilgi-kutu td {
    padding: 8px 14px;
    font-size: 11px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
  }
  .bilgi-kutu tr:last-child td { border-bottom: 0; }
  .bilgi-kutu td.e {
    width: 132px;
    font-weight: 800;
    color: #475569;
    font-size: 9.5px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    background: #f1f5f9;
    white-space: nowrap;
  }
  .bilgi-kutu td.d { font-weight: 600; color: #0f172a; }

  /* ─────────── BÖLÜM ─────────── */
  .bolum { margin-bottom: 16px; }
  .bolum-baslik {
    font-size: 9.5px;
    font-weight: 900;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: #0f172a;
    padding: 0 0 6px;
    border-bottom: 1.5px solid #0f172a;
    margin-bottom: 8px;
  }
  .bolum-icerik {
    font-size: 11.5px;
    line-height: 1.75;
    color: #334155;
    white-space: pre-wrap;
    padding: 2px 0;
  }

  /* ─────────── TABLO ─────────── */
  table.tbl { width: 100%; border-collapse: collapse; }
  table.tbl th {
    background: #0f172a;
    color: #fff;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.9px;
    text-transform: uppercase;
    padding: 9px 12px;
    text-align: left;
    border: 0;
  }
  table.tbl th:first-child { border-radius: 6px 0 0 0; }
  table.tbl th:last-child { border-radius: 0 6px 0 0; }
  table.tbl td {
    padding: 9px 12px;
    font-size: 11px;
    color: #1e293b;
    border-bottom: 1px solid #e2e8f0;
    font-weight: 500;
  }
  table.tbl tbody tr:nth-child(even) td { background: #f8fafc; }
  table.tbl td.sag { text-align: right; font-variant-numeric: tabular-nums; }
  table.tbl td.orta { text-align: center; font-variant-numeric: tabular-nums; }

  table.tbl tr.toplam td {
    background: #f8fafc !important;
    border-top: 2px solid #0f172a;
    border-bottom: 0;
    font-size: 12.5px;
    font-weight: 900;
    color: #0f172a;
    padding: 12px;
  }

  .tbl-cerceve {
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 16px;
  }

  /* ─────────── MEMNUNİYET ─────────── */
  .memnuniyet {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: 1px solid #a7f3d0;
    background: #f0fdf4;
    border-radius: 8px;
    padding: 11px 16px;
    margin: 4px 0 18px;
  }
  .memnuniyet .et {
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.9px;
    text-transform: uppercase;
    color: #065f46;
  }
  .memnuniyet .yildiz {
    font-size: 14px;
    letter-spacing: 2.5px;
    color: #0f172a;
  }
  .memnuniyet .yildiz span { color: #d1d5db; }

  /* ─────────── İMZA ─────────── */
  .imza-alan {
    display: flex;
    gap: 14px;
    margin-top: 24px;
    padding-top: 0;
  }
  .imza-kutu {
    flex: 1;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px 12px;
    min-height: 118px;
    display: flex;
    flex-direction: column;
    background: #fff;
  }
  .imza-kutu .et {
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 0.9px;
    text-transform: uppercase;
    color: #94a3b8;
  }
  .imza-kutu .ad {
    font-size: 11px;
    font-weight: 800;
    color: #0f172a;
    margin-top: 4px;
    line-height: 1.35;
  }
  .imza-kutu img {
    max-height: 46px;
    max-width: 100%;
    margin-top: auto;
    align-self: flex-start;
    object-fit: contain;
  }
  .imza-cizgi {
    margin-top: auto;
    border-bottom: 1px dashed #cbd5e1;
    height: 34px;
  }

  /* ─────────── ALT ─────────── */
  .alt {
    margin-top: 18px;
    padding-top: 10px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.4px;
    color: #94a3b8;
  }

  @media print {
    @page { size: A4 portrait; margin: 0; }
    body { background: #fff; }
    .sayfa { width: 100%; min-height: auto; padding: 12mm; }
    table.tbl tbody tr { page-break-inside: avoid; }
  }
`;

const ustBlok = `
  <div class="ust">
    <div class="marka">
      <div class="logo"><b>BUVİSAN</b></div>
      <div class="marka-alt">Vinç &amp; Asansör Servis</div>
    </div>
    <div class="iletisim">
      <b>ZM METAL MAKİNA İMALAT SANAYİ VE TİCARET LİMİTED ŞİRKETİ</b>
      info@zmmetal.com.tr &nbsp;·&nbsp; www.buvisan.com<br>
      Demirci Mah. / Nilüfer / BURSA<br>
      Tel: 0224 374 00 01
    </div>
  </div>
  <div class="serit"></div>
`;

const altBlok = `
  <div class="alt">
    <span>BUVİSAN Vinç Servis · www.buvisan.com</span>
    <span>0224 374 00 01</span>
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
  if (d.length === 3 && d[0].length === 4) return `${d[2]}.${d[1]}.${d[0]}`;
  try { return new Date(s).toLocaleDateString("tr-TR"); } catch { return String(s); }
}

function para(n: any): string {
  const v = Number(n) || 0;
  return v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

function jsonDizi(v: any): any[] {
  try {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") { const j = JSON.parse(v); return Array.isArray(j) ? j : []; }
    return [];
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════
// SERVİS RAPORU
// ═══════════════════════════════════════════════════════════
export function servisRaporuHtml(r: any): string {
  const parcalar = jsonDizi(r?.degisen_parcalar);
  const puan = Math.max(0, Math.min(5, Number(r?.musteri_puani) || 0));
  const no = String(r?.id || "").slice(0, 6).toUpperCase();

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>Servis Raporu ${esc(no)}</title><style>${css}</style></head>
<body><div class="sayfa">
  ${ustBlok}

  <div class="baslik">
    <h1>Servis Raporu</h1>
    <div class="alt">Rapor No: <b>${esc(no)}</b> &nbsp;·&nbsp; ${tarih(r?.created_at)}</div>
  </div>

  <div class="bilgi-kutu"><table>
    <tr><td class="e">Firma Adı</td><td class="d">${esc(r?.firma_adi || "—")}</td></tr>
    <tr><td class="e">Firma Adresi</td><td class="d">${esc(r?.firma_adresi || "—")}</td></tr>
    <tr><td class="e">İşyerine Varış</td><td class="d">${esc(r?.isyerine_varis_tarih_saat || "—")}</td></tr>
    <tr><td class="e">İşyerinden Ayrılış</td><td class="d">${esc(r?.isyerinden_ayrilis_tarih_saat || "—")}</td></tr>
    <tr><td class="e">Toplam Süre</td><td class="d">${r?.sure_dakika ? esc(r.sure_dakika) + " dakika" : "—"}</td></tr>
  </table></div>

  <div class="tbl-cerceve"><table class="tbl">
    <thead><tr>
      <th>Vinç Modeli</th><th>Seri No</th><th>İşlem Türü</th><th>Personel</th>
    </tr></thead>
    <tbody><tr>
      <td>${esc(r?.vinc_modeli || "—")}</td>
      <td>${esc(r?.vinc_seri_no || "—")}</td>
      <td>${esc(String(r?.islem_turu || "Servis").toUpperCase())}</td>
      <td><b>${esc(String(r?.personel_adi || "—").toUpperCase())}</b></td>
    </tr></tbody>
  </table></div>

  <div class="bolum">
    <div class="bolum-baslik">Arızanın Cinsi</div>
    <div class="bolum-icerik">${esc(r?.arizanin_cinsi || "—")}</div>
  </div>

  <div class="bolum">
    <div class="bolum-baslik">Yapılan İşler</div>
    <div class="bolum-icerik">${esc(r?.yapilan_isler || "—")}</div>
  </div>

  <div class="bolum">
    <div class="bolum-baslik">Değişen Parçalar</div>
    <div class="tbl-cerceve" style="margin-bottom:0"><table class="tbl">
      <thead><tr>
        <th style="width:100px">Parça No</th><th>Parça Adı</th><th style="width:70px;text-align:center">Adet</th>
      </tr></thead>
      <tbody>
        ${parcalar.length > 0
          ? parcalar.map((p: any) => `<tr>
              <td>${esc(p?.parca_no || p?.no || "—")}</td>
              <td>${esc(p?.ad || p?.parca_adi || p?.name || "—")}</td>
              <td class="orta"><b>${esc(p?.adet ?? p?.qty ?? 1)}</b></td>
            </tr>`).join("")
          : `<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:14px">Parça değişimi yapılmadı</td></tr>`}
      </tbody>
    </table></div>
  </div>

  ${puan > 0 ? `<div class="memnuniyet">
    <span class="et">★ Müşteri Memnuniyeti</span>
    <span class="yildiz">${"★".repeat(puan)}<span>${"★".repeat(5 - puan)}</span> &nbsp; <b>${puan}/5</b></span>
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

  ${altBlok}
</div></body></html>`;
}

// ═══════════════════════════════════════════════════════════
// BAKIM FORMU
// ═══════════════════════════════════════════════════════════
export function bakimFormuHtml(b: any): string {
  const maddeler = jsonDizi(b?.maddeler);
  const makine = (() => {
    try {
      const m = b?.makine_bilgileri;
      if (!m) return {} as any;
      if (typeof m === "object") return m;
      return JSON.parse(String(m));
    } catch { return {} as any; }
  })();
  const puan = Math.max(0, Math.min(5, Number(b?.musteri_puani) || 0));
  const tip = b?.form_tipi === "asansor" ? "ASANSÖR" : "VİNÇ";

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>Bakım Formu ${esc(b?.seri_no)}</title><style>${css}</style></head>
<body><div class="sayfa">
  ${ustBlok}

  <div class="baslik">
    <h1>${tip} Periyodik Bakım Formu</h1>
    <div class="alt">Form No: <b>${esc(b?.seri_no || "—")}</b> &nbsp;·&nbsp; ${tarih(b?.kontrol_tarihi)}</div>
  </div>

  <div class="bilgi-kutu"><table>
    <tr><td class="e">Müşteri</td><td class="d">${esc(b?.musteri || "—")}</td></tr>
    <tr><td class="e">Yetkili</td><td class="d">${esc(b?.yetkili || "—")}</td></tr>
    <tr><td class="e">Telefon</td><td class="d">${esc(b?.telefon || "—")}</td></tr>
    <tr><td class="e">Adres</td><td class="d">${esc(b?.adres || "—")}</td></tr>
    <tr><td class="e">Bakım Personeli</td><td class="d"><b>${esc(String(b?.personel || "—").toUpperCase())}</b></td></tr>
    <tr><td class="e">Kontrol Tarihi</td><td class="d">${tarih(b?.kontrol_tarihi)} ${esc(b?.kontrol_saati || "")}</td></tr>
  </table></div>

  ${Object.keys(makine).length > 0 ? `
  <div class="bolum">
    <div class="bolum-baslik">Makine Bilgileri</div>
    <div class="tbl-cerceve" style="margin-bottom:0"><table class="tbl">
      <tbody>
        ${Object.entries(makine).filter(([, v]) => v).map(([k, v]) =>
          `<tr><td style="width:150px;font-weight:800;background:#f8fafc;font-size:9.5px;letter-spacing:0.5px;text-transform:uppercase;color:#475569">${esc(k.replace(/_/g, " "))}</td><td><b>${esc(v)}</b></td></tr>`
        ).join("")}
      </tbody>
    </table></div>
  </div>` : ""}

  <div class="tbl-cerceve"><table class="tbl">
    <thead><tr>
      <th style="text-align:center">Onay</th>
      <th style="text-align:center">Ret</th>
      <th style="text-align:center">Memnuniyet</th>
      <th style="text-align:center">Durum</th>
    </tr></thead>
    <tbody><tr>
      <td class="orta" style="font-weight:900;color:#059669;font-size:16px">${esc(b?.onay_sayisi ?? 0)}</td>
      <td class="orta" style="font-weight:900;color:#dc2626;font-size:16px">${esc(b?.ret_sayisi ?? 0)}</td>
      <td class="orta">${puan > 0 ? "★".repeat(puan) + ` <b>${puan}/5</b>` : "—"}</td>
      <td class="orta" style="font-weight:900;font-size:10px;letter-spacing:0.5px">${b?.is_durumu === "devam_ediyor" ? "DEVAM EDİYOR" : "TAMAMLANDI"}</td>
    </tr></tbody>
  </table></div>

  ${maddeler.length > 0 ? `
  <div class="bolum">
    <div class="bolum-baslik">Kontrol Maddeleri</div>
    <div class="tbl-cerceve" style="margin-bottom:0"><table class="tbl">
      <thead><tr>
        <th>Kontrol Maddesi</th>
        <th style="width:38px;text-align:center">R</th>
        <th style="width:38px;text-align:center">O</th>
        <th>Kontrol Maddesi</th>
        <th style="width:38px;text-align:center">R</th>
        <th style="width:38px;text-align:center">O</th>
      </tr></thead>
      <tbody>
        ${(() => {
          // 2 sütunlu düzen: her satırda 2 madde
          const satirlar: string[] = [];
          for (let i = 0; i < maddeler.length; i += 2) {
            const a = maddeler[i];
            const b = maddeler[i + 1];
            const hucre = (m: any) => {
              if (!m) return '<td></td><td></td><td></td>';
              const ret = m?.durum === "ret" || m?.ret;
              return '<td>' + esc(m?.madde || m?.ad || m?.metin || "—") + '</td>'
                + '<td class="orta" style="color:#dc2626;font-weight:900">' + (ret ? "✕" : "") + '</td>'
                + '<td class="orta" style="color:#059669;font-weight:900">' + (ret ? "" : "✓") + '</td>';
            };
            satirlar.push('<tr>' + hucre(a) + hucre(b) + '</tr>');
          }
          return satirlar.join("");
        })()}
      </tbody>
    </table></div>
  </div>` : ""}

  ${b?.notlar ? `<div class="bolum">
    <div class="bolum-baslik">Notlar</div>
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

  ${altBlok}
</div></body></html>`;
}

// ═══════════════════════════════════════════════════════════
// FİYAT TEKLİFİ
// ═══════════════════════════════════════════════════════════
export function teklifHtml(t: any, kalemler: any[]): string {
  const liste = (kalemler || []).length > 0 ? kalemler : jsonDizi(t?.items);
  const toplam = liste.reduce((s: number, k: any) => {
    const adet = Number(k?.adet) || 1;
    const bf = Number(k?.birim_fiyat) || 0;
    const tt = Number(k?.toplam) || adet * bf;
    return s + tt;
  }, 0);
  const genel = Number(t?.total_price) || toplam;

  const baslik =
    t?.template_type === "bakim" ? "PERİYODİK BAKIM SÖZLEŞMESİ"
    : t?.template_type === "siparis" ? "SİPARİŞ FORMU"
    : "FİYAT TEKLİF FORMU";

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>${baslik}</title><style>${css}</style></head>
<body><div class="sayfa">
  ${ustBlok}

  <div class="baslik">
    <h1>${baslik}</h1>
    <div class="alt">Teklif Tarihi: <b>${tarih(t?.offer_date || t?.created_at)}</b>${t?.valid_until ? ` &nbsp;·&nbsp; Geçerlilik: ${tarih(t.valid_until)}` : ""}</div>
  </div>

  <div class="bilgi-kutu"><table>
    <tr><td class="e">Sayın</td><td class="d">${esc(t?.customer_rep || t?.yetkili || "Yetkili")}</td></tr>
    <tr><td class="e">Firma</td><td class="d"><b>${esc(t?.customer_name || t?.musteri || "—")}</b></td></tr>
    <tr><td class="e">Adres</td><td class="d">${esc(t?.customer_address || t?.adres || "—")}</td></tr>
  </table></div>

  <div class="tbl-cerceve"><table class="tbl">
    <thead><tr>
      <th>Açıklama / Malzeme</th>
      <th style="width:64px;text-align:center">Miktar</th>
      <th style="width:118px;text-align:right">Birim Fiyat</th>
      <th style="width:118px;text-align:right">Tutar</th>
    </tr></thead>
    <tbody>
      ${liste.length > 0
        ? liste.map((k: any) => {
            const adet = Number(k?.adet) || 1;
            const bf = Number(k?.birim_fiyat) || 0;
            const tt = Number(k?.toplam) || adet * bf;
            return `<tr>
              <td><b>${esc(k?.ad || k?.description || "—")}</b>${k?.detay ? `<div style="font-size:9.5px;color:#64748b;margin-top:3px;font-weight:500">${esc(k.detay)}</div>` : ""}</td>
              <td class="orta">${adet}</td>
              <td class="sag">${para(bf)}</td>
              <td class="sag"><b>${para(tt)}</b></td>
            </tr>`;
          }).join("")
        : `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:16px">Kalem bulunmuyor</td></tr>`}
      <tr class="toplam">
        <td colspan="3" class="sag">GENEL TOPLAM</td>
        <td class="sag">${para(genel)}</td>
      </tr>
    </tbody>
  </table></div>

  <div class="bolum">
    <div class="bolum-baslik">Notlar ve Şartlar</div>
    <div class="bolum-icerik">${esc(t?.description || "Bu teklif 15 gün süreyle geçerlidir. Fiyatlara KDV dahil değildir.")}</div>
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

  ${altBlok}
</div></body></html>`;
}

// ═══════════════════════════════════════════════════════════
// SATIŞ FORMU / İRSALİYE
// ═══════════════════════════════════════════════════════════
export function satisHtml(s: any): string {
  const kalemler = jsonDizi(s?.kalemler);
  const toplam = kalemler.reduce((t: number, k: any) => t + (Number(k?.toplam) || 0), 0);
  const ara = Number(s?.ara_toplam) || toplam;
  const iskonto = Number(s?.iskonto) || 0;
  const kdvOrani = Number(s?.kdv_orani) ?? 20;
  const kdv = Number(s?.kdv_tutar) || Math.round((ara - iskonto) * kdvOrani) / 100;
  const genel = Number(s?.genel_toplam) || (ara - iskonto + kdv);
  const irsaliye = s?.belge_tipi === "irsaliye";
  const baslik = irsaliye ? "SEVK İRSALİYESİ" : "SATIŞ FORMU";

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>${baslik} ${esc(s?.satis_no || "")}</title><style>${css}</style></head>
<body><div class="sayfa">
  ${ustBlok}

  <div class="baslik">
    <h1>${baslik}</h1>
    <div class="alt">
      Belge No: <b>${esc(s?.satis_no || "—")}</b>
      &nbsp;·&nbsp; Tarih: ${esc(s?.tarih_tr || tarih(s?.satis_tarihi))}
      ${s?.irsaliye_no ? ` &nbsp;·&nbsp; İrsaliye: ${esc(s.irsaliye_no)}` : ""}
    </div>
  </div>

  <div class="bilgi-kutu"><table>
    <tr><td class="e">Müşteri</td><td class="d"><b>${esc(s?.musteri || "—")}</b></td></tr>
    <tr><td class="e">Yetkili</td><td class="d">${esc(s?.yetkili || "—")}</td></tr>
    <tr><td class="e">Telefon</td><td class="d">${esc(s?.telefon || "—")}</td></tr>
    <tr><td class="e">Adres</td><td class="d">${esc(s?.adres || "—")}</td></tr>
    ${s?.odeme_tipi ? `<tr><td class="e">Ödeme</td><td class="d">${esc(String(s.odeme_tipi).toUpperCase())}</td></tr>` : ""}
  </table></div>

  <div class="tbl-cerceve"><table class="tbl">
    <thead><tr>
      <th style="width:44px;text-align:center">No</th>
      <th>Malzeme / Ürün</th>
      <th style="width:70px;text-align:center">Miktar</th>
      <th style="width:64px;text-align:center">Birim</th>
      <th style="width:112px;text-align:right">Birim Fiyat</th>
      <th style="width:112px;text-align:right">Tutar</th>
    </tr></thead>
    <tbody>
      ${kalemler.length > 0
        ? kalemler.map((k: any, i: number) => `<tr>
            <td class="orta">${i + 1}</td>
            <td><b>${esc(k?.parca_adi || "—")}</b>${k?.parca_kodu ? `<div style="font-size:9px;color:#64748b;margin-top:2px">${esc(k.parca_kodu)}</div>` : ""}</td>
            <td class="orta">${esc(k?.adet ?? 1)}</td>
            <td class="orta">${esc(k?.birim || "Adet")}</td>
            <td class="sag">${para(k?.birim_fiyat)}</td>
            <td class="sag"><b>${para(k?.toplam)}</b></td>
          </tr>`).join("")
        : `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:16px">Kalem bulunmuyor</td></tr>`}
      <tr class="toplam">
        <td colspan="5" class="sag">ARA TOPLAM</td>
        <td class="sag">${para(ara)}</td>
      </tr>
      ${iskonto > 0 ? `<tr><td colspan="5" class="sag" style="font-weight:700">İSKONTO</td><td class="sag" style="color:#dc2626;font-weight:800">− ${para(iskonto)}</td></tr>` : ""}
      <tr>
        <td colspan="5" class="sag" style="font-weight:700;background:#f8fafc">KDV (%${esc(kdvOrani)})</td>
        <td class="sag" style="font-weight:800;background:#f8fafc">${para(kdv)}</td>
      </tr>
      <tr class="toplam">
        <td colspan="5" class="sag">GENEL TOPLAM</td>
        <td class="sag">${para(genel)}</td>
      </tr>
    </tbody>
  </table></div>

  ${s?.notlar ? `<div class="bolum">
    <div class="bolum-baslik">Notlar</div>
    <div class="bolum-icerik">${esc(s.notlar)}</div>
  </div>` : ""}

  ${irsaliye ? `
  <div class="bolum">
    <div class="bolum-baslik">Teslim Beyanı</div>
    <div class="bolum-icerik">Yukarıda belirtilen malzemeleri eksiksiz ve hasarsız olarak teslim aldım.</div>
  </div>` : ""}

  <div class="imza-alan">
    <div class="imza-kutu">
      <div class="et">Teslim Eden</div>
      <div class="ad">BUVİSAN</div>
      <div class="imza-cizgi"></div>
    </div>
    <div class="imza-kutu">
      <div class="et">Teslim Alan</div>
      <div class="ad">${esc(String(s?.yetkili || s?.musteri || "—").toUpperCase())}</div>
      <div class="imza-cizgi"></div>
    </div>
    <div class="imza-kutu">
      <div class="et">Tarih</div>
      <div class="ad">${esc(s?.tarih_tr || tarih(s?.satis_tarihi))}</div>
      <div class="imza-cizgi"></div>
    </div>
  </div>

  ${altBlok}
</div></body></html>`;
}
