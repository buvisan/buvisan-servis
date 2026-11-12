// ----------------------------------------------------------------------------
// BUVİSAN - YAZDIR / PAYLAŞ / PDF 📄 (v2 — CSS gömülü)
// Telefonda PAYLAŞ menüsü → PDF kaydet / WhatsApp
// İndirilen HTML dosyası da DÜZGÜN görünür (CSS gömülü)
// ----------------------------------------------------------------------------

export type YazdirSecenek = {
  baslik?: string;
  dosyaAdi?: string;
};

/** Sayfadaki tüm CSS'i topla (link + style), metin olarak göm */
async function cssTopla(): Promise<string> {
  const parcalar: string[] = [];

  // 1) <style> etiketleri
  try {
    document.querySelectorAll("style").forEach((el) => {
      if (el.textContent) parcalar.push(el.textContent);
    });
  } catch { /* yoksay */ }

  // 2) <link rel="stylesheet"> → içeriğini indir
  try {
    const linkler = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
    );
    for (const link of linkler) {
      const href = link.href;
      if (!href) continue;
      try {
        const res = await fetch(href, { cache: "force-cache" });
        if (res.ok) {
          const metin = await res.text();
          if (metin && metin.length > 100) parcalar.push(metin);
        }
      } catch {
        // indirilemedi → link olarak ekle (mutlak URL)
        parcalar.push(`@import url("${href}");`);
      }
    }
  } catch { /* yoksay */ }

  return parcalar.join("\n\n");
}

export async function yazdirVeyaPaylas(
  icerikHtml: string,
  secenek: YazdirSecenek = {}
): Promise<"paylasildi" | "yazdirildi" | "indirildi" | "hata"> {
  const baslik = secenek.baslik || "BUVİSAN Raporu";
  const dosyaAdi = secenek.dosyaAdi || "buvisan-rapor";

  // ⭐ SAYFANIN CSS'İNİ TOPLA (Tailwind dahil)
  const css = await cssTopla();
  const html = tamHtml(icerikHtml, baslik, css);

  // ─── 1) NATIVE PAYLAŞ ───
  try {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const dosya = new File([blob], `${dosyaAdi}.html`, { type: "text/html" });
      const paylasilabilir = (navigator as any).canShare?.({ files: [dosya] });
      if (paylasilabilir !== false) {
        await (navigator as any).share({ title: baslik, files: [dosya] });
        return "paylasildi";
      }
    }
  } catch { /* devam */ }

  // ─── 2) PRINT (yeni pencere) ───
  try {
    const p = window.open("", "_blank");
    if (p) {
      p.document.open();
      p.document.write(html);
      p.document.close();
      setTimeout(() => {
        try { p.focus(); p.print(); } catch { /* yoksay */ }
      }, 800);
      return "yazdirildi";
    }
  } catch { /* devam */ }

  // ─── 3) İNDİR ───
  try {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dosyaAdi}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return "indirildi";
  } catch {
    alert("Yazdırma başlatılamadı. Tarayıcı menüsünden 'Paylaş' veya 'Yazdır' seçin.");
    return "hata";
  }
}

function tamHtml(icerik: string, baslik: string, sayfaCss: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${baslik}</title>

<!-- ⭐ SAYFANIN GERÇEK CSS'İ (Tailwind dahil) -->
<style>
${sayfaCss}
</style>

<!-- ⭐ YEDEK: sayfa CSS'i eksikse Tailwind CDN -->
<script src="https://cdn.tailwindcss.com"></script>

<style>
  /* ─── BUVİSAN PDF DÜZENİ ─── */
  * { box-sizing: border-box; }

  html, body {
    margin: 0; padding: 0;
    background: #fff;
    color: #0f172a;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body { padding: 12px; }

  /* A4 oranı — telefonda sığsın */
  .pdf-sayfa {
    width: 100%;
    max-width: 820px;
    margin: 0 auto;
  }

  /* Form kendi stilini korusun */
  .pdf-sayfa .srp-form,
  .pdf-sayfa > div {
    max-width: 100% !important;
    zoom: 1 !important;
    transform: none !important;
  }

  /* Tailwind yoksa temel tablo stili */
  .pdf-sayfa table {
    width: 100%;
    border-collapse: collapse;
  }
  .pdf-sayfa table th,
  .pdf-sayfa table td {
    border: 1px solid #cbd5e1;
    padding: 6px 8px;
    font-size: 12px;
    vertical-align: top;
  }
  .pdf-sayfa table th {
    background: #f1f5f9;
    font-weight: 700;
    text-align: left;
  }

  .pdf-sayfa img { max-height: 80px; width: auto; }

  /* ─── ÜST BAR (sadece ekranda) ─── */
  .yazdir-bar {
    position: sticky; top: 0; z-index: 999;
    background: #0f172a; color: #fff;
    padding: 10px 14px;
    display: flex; gap: 8px;
    align-items: center; justify-content: space-between;
    border-radius: 12px;
    margin-bottom: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,.15);
  }
  .yazdir-bar span { font-size: 13px; font-weight: 700; }
  .yazdir-bar button {
    border: 0; border-radius: 8px;
    padding: 8px 14px;
    font-weight: 800; font-size: 12px; cursor: pointer;
  }

  /* ─── YAZDIRMA ─── */
  @media print {
    .yazdir-bar { display: none !important; }
    body { padding: 0 !important; }
    .pdf-sayfa { max-width: 100% !important; }
    @page { size: A4 portrait; margin: 10mm; }
    tr, td, th { page-break-inside: avoid; }
    table { page-break-inside: auto; }
  }

  /* ─── TELEFON ─── */
  @media screen and (max-width: 640px) {
    body { padding: 6px; }
    .yazdir-bar { padding: 8px 10px; }
    .yazdir-bar button { padding: 7px 10px; font-size: 11px; }
  }
</style>
</head>
<body>
<div class="yazdir-bar">
  <span>${baslik}</span>
  <span style="display:flex;gap:6px">
    <button onclick="window.print()" style="background:#10b981;color:#fff">YAZDIR / PDF</button>
    <button onclick="window.close()" style="background:#475569;color:#fff">KAPAT</button>
  </span>
</div>
<div class="pdf-sayfa">
${icerik}
</div>
</body>
</html>`;
}
