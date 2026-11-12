// ----------------------------------------------------------------------------
// BUVİSAN - GERÇEK PDF ÜRETİMİ 📄 (v3)
// html2canvas + jsPDF → telefona GERÇEK PDF dosyası indirir
// Telefonda A4 oranı korunur (ölçekleme ile)
// ----------------------------------------------------------------------------

export type PdfSecenek = {
  baslik?: string;
  dosyaAdi?: string;
};

/** Sayfadaki tüm CSS'i topla (link + style) */
async function cssTopla(): Promise<string> {
  const parcalar: string[] = [];

  // ⚠️ SADECE <style> etiketleri — Tailwind <link> HARİÇ (oklch/lab hatası)
  try {
    document.querySelectorAll("style").forEach((el) => {
      const t = el.textContent || "";
      if (t && t.length > 20) parcalar.push(t);
    });
  } catch { /* yoksay */ }

  return parcalar.join("\n\n");
}

/** Gizli iframe içinde A4 genişliğinde render et */
async function a4Render(icerikHtml: string, css: string): Promise<HTMLElement> {
  const kapsayici = document.createElement("div");
  kapsayici.style.cssText = `
    position: fixed;
    left: -10000px;
    top: 0;
    width: 794px;
    background: #fff;
    z-index: -1;
    pointer-events: none;
  `;

  const iframe = document.createElement("iframe");
  iframe.style.cssText = `width:794px;height:1123px;border:0;position:absolute;left:-10000px;top:0;`;
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) { document.body.removeChild(iframe); throw new Error("iframe yok"); }

  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>${css}</style>
    <style>
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      html, body { margin:0; padding:0; background:#fff; color:#0f172a;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; }
      body { padding: 0; width: 794px; }
      .pdf-sayfa { width: 794px; padding: 24px; background:#fff; }
      .pdf-sayfa table { width:100%; border-collapse: collapse; }
      .pdf-sayfa table th, .pdf-sayfa table td { border:1px solid #cbd5e1; padding:6px 8px; vertical-align: top; }
      .pdf-sayfa table th { background:#f1f5f9; font-weight:700; text-align:left; }
      .pdf-sayfa img { max-height: 80px; width:auto; }
      .pdf-sayfa .srp-form { zoom: 1 !important; transform:none !important; max-width:100% !important; }
    </style>
    </head><body><div class="pdf-sayfa">${icerikHtml}</div></body></html>`);
  doc.close();

  // görseller/fontlar yüklensin
  await new Promise((r) => setTimeout(r, 900));

  const el = doc.querySelector(".pdf-sayfa") as HTMLElement | null;
  if (!el) { document.body.removeChild(iframe); throw new Error("içerik yok"); }

  // iframe'i geçici olarak görünür yap (html2canvas için)
  iframe.style.left = "0";
  iframe.style.top = "0";
  iframe.style.opacity = "0.01";
  iframe.style.pointerEvents = "none";

  kapsayici.dataset.iframeId = "buv-pdf-frame";
  document.body.appendChild(kapsayici);

  return el;
}

/**
 * Gerçek PDF üret ve indir.
 * Telefonda: indirme → "Dosyalara Kaydet" → PDF
 */
export async function pdfIndir(
  icerikHtml: string,
  secenek: PdfSecenek = {}
): Promise<"basarili" | "hata"> {
  const baslik = secenek.baslik || "BUVISAN Raporu";
  const dosyaAdi = (secenek.dosyaAdi || "buvisan-rapor").replace(/[^a-zA-Z0-9-_]/g, "-");

  let iframeEl: HTMLIFrameElement | null = null;

  try {
    const css = await cssTopla();

    // ─── iframe kur ───
    iframeEl = document.createElement("iframe");
    iframeEl.style.cssText = "position:fixed;left:0;top:0;width:794px;height:1123px;border:0;opacity:0.01;pointer-events:none;z-index:-1;";
    document.body.appendChild(iframeEl);

    const doc = iframeEl.contentDocument;
    if (!doc) throw new Error("iframe dokümanı yok");

    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>${css}</style>
      <style>
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        html, body { margin:0; padding:0; background:#fff; color:#0f172a;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; }
        body { width: 794px; }
        .pdf-sayfa { width: 794px; padding: 24px; background:#fff; }
        .pdf-sayfa table { width:100%; border-collapse: collapse; }
        .pdf-sayfa table th, .pdf-sayfa table td { border:1px solid #cbd5e1; padding:6px 8px; vertical-align: top; }
        .pdf-sayfa table th { background:#f1f5f9; font-weight:700; text-align:left; }
        .pdf-sayfa img { max-height: 80px; width:auto; }
        .pdf-sayfa .srp-form { zoom: 1 !important; transform:none !important; max-width:100% !important; }
        /* düz renk zorlaması — oklch/lab kalıntılarını ez */
        .pdf-sayfa, .pdf-sayfa * {
          color: #0f172a !important;
          background-color: transparent !important;
          border-color: #94a3b8 !important;
        }
        .pdf-sayfa table th { background-color: #f1f5f9 !important; }
        .pdf-sayfa .bg-yellow-400, .pdf-sayfa [class*="bg-yellow"] { background-color: #facc15 !important; }
        .pdf-sayfa .text-red-600, .pdf-sayfa [class*="text-red"] { color: #dc2626 !important; }
      </style>
      </head><body><div class="pdf-sayfa" id="pdf-hedef">${icerikHtml}</div></body></html>`);
    doc.close();

    await new Promise((r) => setTimeout(r, 900));

    const hedef = doc.getElementById("pdf-hedef");
    if (!hedef) throw new Error("PDF içeriği bulunamadı");

    // ─── html2canvas ───
    const html2canvas = (await import("html2canvas")).default;
    const kanvas = await html2canvas(hedef as HTMLElement, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: 794,
      width: 794,
    });

    // ─── jsPDF ───
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const sayfaG = 210;
    const sayfaY = 297;
    const kenar = 8;
    const kullanilabilirG = sayfaG - kenar * 2;
    const oran = kullanilabilirG / kanvas.width;
    const resimY = kanvas.height * oran;

    const resim = kanvas.toDataURL("image/jpeg", 0.95);

    if (resimY <= sayfaY - kenar * 2) {
      pdf.addImage(resim, "JPEG", kenar, kenar, kullanilabilirG, resimY);
    } else {
      // Çok sayfalı
      let kalan = resimY;
      let konum = kenar;
      let ilkSayfa = true;
      while (kalan > 0 && ilkSayfa) {
        const dilimY = Math.min(kalan, sayfaY - kenar * 2);
        pdf.addImage(resim, "JPEG", kenar, konum, kullanilabilirG, resimY, undefined, "FAST");
        pdf.addPage();
        ilkSayfa = false;
        kalan -= dilimY;
      }
    }

    pdf.save(`${dosyaAdi}.pdf`);
    return "basarili";
  } catch (e: any) {
    console.error("PDF hatası:", e);
    alert("PDF oluşturulamadı.\n\n" + (e?.message || "") + "\n\nTarayıcı menüsünden 'Yazdır → PDF olarak kaydet' deneyin.");
    return "hata";
  } finally {
    // temizlik
    try { if (iframeEl && iframeEl.parentNode) iframeEl.parentNode.removeChild(iframeEl); } catch { /* yoksay */ }
  }
}

/**
 * Yazdırma penceresi aç (yedek yöntem)
 */
export async function yazdirPencereAc(icerikHtml: string, secenek: PdfSecenek = {}): Promise<void> {
  const baslik = secenek.baslik || "BUVİSAN Raporu";
  const css = await cssTopla();
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${baslik}</title>
<style>${css}</style>
<style>
  * { box-sizing:border-box; }
  html,body { margin:0; padding:0; background:#fff; color:#0f172a;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
    -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { padding:10px; }

  /* ⭐ A4 oranı ölçekleme — telefonda sığsın */
  .pdf-olcek {
    width: 794px;
    transform-origin: top left;
    transform: scale(var(--olcek, 1));
    margin-bottom: calc((var(--olcek, 1) - 1) * 1123px);
  }
  .pdf-sayfa { width:794px; padding:24px; background:#fff; }
  .pdf-sayfa table { width:100%; border-collapse:collapse; }
  .pdf-sayfa table th, .pdf-sayfa table td { border:1px solid #cbd5e1; padding:6px 8px; vertical-align:top; }
  .pdf-sayfa table th { background:#f1f5f9; font-weight:700; text-align:left; }
  .pdf-sayfa img { max-height:80px; width:auto; }
  .pdf-sayfa .srp-form { zoom:1 !important; transform:none !important; max-width:100% !important; }

  .yazdir-bar { position:sticky; top:0; z-index:999; background:#0f172a; color:#fff;
    padding:10px 14px; display:flex; gap:8px; align-items:center; justify-content:space-between;
    border-radius:12px; margin-bottom:12px; }
  .yazdir-bar span { font-size:13px; font-weight:700; }
  .yazdir-bar button { border:0; border-radius:8px; padding:9px 14px; font-weight:800; font-size:12px; cursor:pointer; }

  @media print {
    .yazdir-bar { display:none !important; }
    body { padding:0 !important; }
    .pdf-olcek { transform:none !important; margin-bottom:0 !important; }
    @page { size:A4 portrait; margin:8mm; }
    tr,td,th { page-break-inside:avoid; }
  }
</style>
</head><body>
<div class="yazdir-bar">
  <span>${baslik}</span>
  <span style="display:flex;gap:6px">
    <button onclick="window.print()" style="background:#10b981;color:#fff">YAZDIR / PDF</button>
    <button onclick="window.close()" style="background:#475569;color:#fff">KAPAT</button>
  </span>
</div>
<div class="pdf-olcek" id="olcek"><div class="pdf-sayfa">${icerikHtml}</div></div>
<script>
  (function(){
    function olcekle(){
      var g = document.documentElement.clientWidth || window.innerWidth;
      var s = Math.min(1, (g - 24) / 794);
      if (s < 0.2) s = 0.2;
      var el = document.getElementById('olcek');
      if (el) {
        el.style.setProperty('--olcek', s);
        el.style.transform = 'scale(' + s + ')';
        el.style.marginBottom = ((s - 1) * el.scrollHeight) + 'px';
      }
    }
    olcekle();
    window.addEventListener('resize', olcekle);
    setTimeout(olcekle, 400);
  })();
</script>
</body></html>`;

  const p = window.open("", "_blank");
  if (!p) { alert("Pop-up engellendi. Tarayıcı ayarlarından izin verin."); return; }
  p.document.open();
  p.document.write(html);
  p.document.close();
}

/** Eski isim — geriye uyumluluk */
export async function yazdirVeyaPaylas(
  icerikHtml: string,
  secenek: PdfSecenek = {}
): Promise<"paylasildi" | "yazdirildi" | "indirildi" | "hata"> {
  const r = await pdfIndir(icerikHtml, secenek);
  return r === "basarili" ? "indirildi" : "hata";
}
