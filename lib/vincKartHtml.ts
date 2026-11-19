// ----------------------------------------------------------------------------
// BUVİSAN — VİNÇ DİJİTAL KİMLİK KARTI (A4) 🏗️
// ----------------------------------------------------------------------------
//  yeni-vinc ve vinc-duzenle sayfalarındaki "A4 Yazdır" butonu bu şablonu
//  kullanır. QR görseli, sayfadaki <canvas> elementinden data-URI olarak gelir.
//
//  NOT: Tutar yok — sadece makine künyesi. (Sistemdeki tüm tutarlar KDV hariçtir.)
// ----------------------------------------------------------------------------

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    background: #fff; color: #0f172a; font-size: 12px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sayfa { width: 794px; padding: 28px 34px; margin: 0 auto; }

  .ust { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0f172a; padding-bottom: 12px; }
  .marka { display: flex; align-items: center; gap: 10px; }
  .logo {
    width: 38px; height: 38px; border-radius: 10px;
    background: linear-gradient(135deg, #facc15, #f59e0b);
    display: flex; align-items: center; justify-content: center;
    font-weight: 900; font-size: 18px; color: #0f172a;
  }
  .marka h1 { font-size: 14px; font-weight: 900; letter-spacing: 0.6px; }
  .marka p { font-size: 8px; color: #64748b; font-weight: 800; letter-spacing: 1.3px; text-transform: uppercase; margin-top: 2px; }
  .tarih { text-align: right; font-size: 8px; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; }
  .tarih b { display: block; font-size: 11px; color: #0f172a; margin-top: 2px; }

  .baslik {
    background: linear-gradient(135deg, #0f172a, #1e293b);
    color: #fff; text-align: center; padding: 13px; margin: 14px 0 18px; border-radius: 10px;
  }
  .baslik h2 { font-size: 14px; font-weight: 900; letter-spacing: 1.6px; text-transform: uppercase; }
  .baslik p { font-size: 8.5px; color: #94a3b8; font-weight: 700; margin-top: 3px; letter-spacing: 0.5px; }

  .govde { display: flex; gap: 24px; align-items: flex-start; }
  .qr { width: 236px; flex-shrink: 0; text-align: center; }
  .qr .cerceve { border: 3px solid #0f172a; border-radius: 14px; padding: 10px; display: inline-block; }
  .qr img { width: 200px; height: 200px; display: block; }
  .qr .kod { font-family: Consolas, monospace; font-size: 7.5px; color: #64748b; margin-top: 7px; word-break: break-all; line-height: 1.4; }

  .bilgi { flex: 1; }
  .bilgi table { width: 100%; border-collapse: collapse; }
  .bilgi td { border-bottom: 1px solid #e2e8f0; padding: 8px 4px; vertical-align: top; }
  .bilgi td.e {
    width: 132px; color: #64748b; font-weight: 800; font-size: 8.5px;
    letter-spacing: 0.6px; text-transform: uppercase;
  }
  .bilgi td.d { font-weight: 900; color: #0f172a; font-size: 11.5px; }

  .kutu {
    margin-top: 16px; background: #f8fafc; border: 1.5px solid #cbd5e1;
    border-left: 4px solid #facc15; border-radius: 8px; padding: 11px 14px;
  }
  .kutu p { font-size: 9.5px; color: #475569; font-weight: 600; line-height: 1.65; }

  .alt {
    margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 9px;
    display: flex; justify-content: space-between; font-size: 8px; color: #94a3b8;
    font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px;
  }

  @media print { @page { size: A4 portrait; margin: 12mm; } .sayfa { width: 100%; padding: 0; } }
`;

function esc(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function satir(etiket: string, deger: any): string {
  const v = String(deger ?? "").trim();
  if (!v || v === "—") return "";
  return `<tr><td class="e">${esc(etiket)}</td><td class="d">${esc(v)}</td></tr>`;
}

export function vincKartHtml(v: {
  qrPng?: string;
  musteri?: string;
  model?: string;
  kapasite?: string;
  kaldirma?: string;
  seri?: string;
  adres?: string;
  url?: string;
}): string {
  const bugun = new Date().toLocaleDateString("tr-TR");
  const qr = v.qrPng
    ? `<img src="${v.qrPng}" alt="QR" />`
    : `<div style="width:200px;height:200px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-weight:800;font-size:11px;border:1px dashed #cbd5e1">QR hazır değil</div>`;

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>Vinç Kimlik Kartı${v.seri ? " - " + esc(v.seri) : ""}</title><style>${css}</style></head>
<body><div class="sayfa">

  <div class="ust">
    <div class="marka">
      <div class="logo">B</div>
      <div>
        <h1>BUVİSAN VİNÇ &amp; ASANSÖR SERVİS</h1>
        <p>Dijital Kimlik Kartı</p>
      </div>
    </div>
    <div class="tarih">Düzenleme tarihi<b>${bugun}</b></div>
  </div>

  <div class="baslik">
    <h2>${esc(v.musteri || "VİNÇ KİMLİK KARTI")}</h2>
    <p>Bu kartı vinç üzerinde görünür bir yere asınız</p>
  </div>

  <div class="govde">
    <div class="qr">
      <div class="cerceve">${qr}</div>
      <div class="kod">${esc(v.url || "")}</div>
    </div>

    <div class="bilgi">
      <table>
        ${satir("Müşteri", v.musteri)}
        ${satir("Model", v.model)}
        ${satir("Kapasite", v.kapasite)}
        ${satir("Kaldırma Yüksekliği", v.kaldirma)}
        ${satir("Seri No", v.seri)}
        ${satir("Konum / Adres", v.adres)}
      </table>

      <div class="kutu">
        <p><b>Bu QR kodu telefonunuzun kamerasıyla okutarak</b> vincin bilgilerine, geçmiş servis
        kayıtlarına ve periyodik bakım durumuna ulaşabilirsiniz. Arıza bildirimi ve servis talebi için
        de aynı sayfayı kullanabilirsiniz.</p>
      </div>
    </div>
  </div>

  <div class="alt">
    <span>BUVİSAN · 0224 374 00 01</span>
    <span>servis.buvisan.com</span>
  </div>

</div></body></html>`;
}
