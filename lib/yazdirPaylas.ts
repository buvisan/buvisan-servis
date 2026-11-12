// ----------------------------------------------------------------------------
// BUVİSAN - YAZDIR / PAYLAŞ / PDF 📄
// Mobil uyumlu: önce native paylaşım, sonra print, sonra indirme
// ----------------------------------------------------------------------------

export type YazdirSecenek = {
  baslik?: string;
  dosyaAdi?: string;
};

/**
 * En güvenilir yöntemden başlar:
 *   1) navigator.share (telefonda PAYLAŞ menüsü → PDF kaydet / WhatsApp)
 *   2) window.print (masaüstünde yazdırma penceresi)
 *   3) alert ile uyarı
 */
export async function yazdirVeyaPaylas(
  icerikHtml: string,
  secenek: YazdirSecenek = {}
): Promise<"paylasildi" | "yazdirildi" | "indirildi" | "hata"> {
  const baslik = secenek.baslik || "BUVİSAN Raporu";
  const dosyaAdi = secenek.dosyaAdi || "buvisan-rapor";

  // ─── 1) NATIVE PAYLAŞ (telefon) ───
  try {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      // HTML dosyası olarak paylaş (PDF olarak da kaydedilebilir)
      const blob = new Blob([tamHtml(icerikHtml, baslik)], {
        type: "text/html;charset=utf-8",
      });
      const dosya = new File([blob], `${dosyaAdi}.html`, { type: "text/html" });

      const paylasilabilir = (navigator as any).canShare?.({ files: [dosya] });
      if (paylasilabilir !== false) {
        await (navigator as any).share({
          title: baslik,
          files: [dosya],
        });
        return "paylasildi";
      }
    }
  } catch {
    // kullanıcı iptal etti veya desteklenmiyor → devam
  }

  // ─── 2) PRINT ───
  try {
    const pencere = window.open("", "_blank");
    if (pencere) {
      pencere.document.open();
      pencere.document.write(tamHtml(icerikHtml, baslik));
      pencere.document.close();
      setTimeout(() => {
        try { pencere.focus(); pencere.print(); } catch { /* yoksay */ }
      }, 700);
      return "yazdirildi";
    }
  } catch {
    // devam
  }

  // ─── 3) İNDİR ───
  try {
    const blob = new Blob([tamHtml(icerikHtml, baslik)], {
      type: "text/html;charset=utf-8",
    });
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

function tamHtml(icerik: string, baslik: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${baslik}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    margin: 0; padding: 16px;
    background: #fff; color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; }
  th { background: #f1f5f9; text-align: left; }
  img { max-height: 70px; }
  .srp-form { max-width: 100% !important; zoom: 1 !important; }
  .yazdir-bar {
    position: sticky; top: 0; z-index: 999;
    background: #0f172a; color: #fff;
    padding: 10px 14px; display: flex; gap: 8px;
    align-items: center; justify-content: space-between;
    margin: -16px -16px 16px -16px;
  }
  .yazdir-bar button {
    border: 0; border-radius: 8px; padding: 8px 14px;
    font-weight: bold; font-size: 12px; cursor: pointer;
  }
  @media print {
    .yazdir-bar { display: none !important; }
    body { padding: 0; }
    @page { size: A4 portrait; margin: 10mm; }
    tr, td, th { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="yazdir-bar">
  <span style="font-size:13px;font-weight:bold">${baslik}</span>
  <span>
    <button onclick="window.print()" style="background:#10b981;color:#fff">YAZDIR / PDF</button>
    <button onclick="window.close()" style="background:#475569;color:#fff;margin-left:6px">KAPAT</button>
  </span>
</div>
${icerik}
</body>
</html>`;
}
