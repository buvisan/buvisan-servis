// ----------------------------------------------------------------------------
// BUVİSAN - PDF + YAZDIR 📄 (v4 — saf HTML girdi)
// Girdi: TAM HTML dokümanı (kendi <style>'ı var, Tailwind yok)
// Çıktı: gerçek PDF indir; olmazsa yazdırma penceresi
// ----------------------------------------------------------------------------

export type PdfSecenek = {
  baslik?: string;
  dosyaAdi?: string;
  cokSayfali?: boolean;   // true = kucultmeden sayfalara bol
};

/** Tam HTML'i gizli iframe'e yaz */
function iframeKur(html: string): { iframe: HTMLIFrameElement; kok: HTMLElement } {
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;background:#fff;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) throw new Error("iframe dokumani olusturulamadi");

  doc.open();
  // ⭐ PDF icin tek sayfa garantisi: min-height'i kaldir
  const pdfHtml = html.replace(
    "</style>",
    ".sayfa{min-height:auto !important;padding-bottom:28px !important}"
    + "@media print{.sayfa{min-height:auto !important}}"
    + "</style>"
  );
  doc.write(pdfHtml);
  doc.close();

  const kok = (doc.querySelector(".sayfa") || doc.body) as HTMLElement;
  if (!kok) throw new Error("icerik bulunamadi");

  return { iframe, kok };
}

/** Gerçek PDF üret + indir */
export async function pdfIndir(
  html: string,
  secenek: PdfSecenek = {}
): Promise<"basarili" | "hata"> {
  const dosyaAdi = (secenek.dosyaAdi || "buvisan-form").replace(/[^a-zA-Z0-9-_]/g, "-");
  let iframe: HTMLIFrameElement | null = null;

  try {
    const kurulum = iframeKur(html);
    iframe = kurulum.iframe;
    const kok = kurulum.kok;

    // gorseller/fontlar yuklensin
    await new Promise((r) => setTimeout(r, 800));

    // html2canvas icin gorunur yap
    iframe.style.left = "0";
    iframe.style.top = "0";
    iframe.style.opacity = "0.01";
    iframe.style.zIndex = "-1";

    const html2canvas = (await import("html2canvas")).default;
    const kanvas = await html2canvas(kok, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      width: 794,
      windowWidth: 794,
    });

    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const kenar = 6;
    const g = 210 - kenar * 2;
    const maxY = 297 - kenar * 2;
    const resim = kanvas.toDataURL("image/jpeg", 0.95);

    if (secenek.cokSayfali) {
      // ⭐ AKILLI KESİM: beyaz satır bul, içeriği bölme
      const oran = g / kanvas.width;
      const maxYPx = Math.floor(maxY / oran);          // sayfa basina piksel
      const ctx2 = kanvas.getContext("2d");
      const veri = ctx2 ? ctx2.getImageData(0, 0, kanvas.width, kanvas.height).data : null;

      // Bir satirin neredeyse tamamen beyaz olup olmadigi
      const bosSatir = (y: number): boolean => {
        if (!veri) return true;
        const gen = kanvas.width;
        let koyu = 0;
        for (let x = 0; x < gen; x += 4) {
          const i = (y * gen + x) * 4;
          const r = veri[i], gg = veri[i + 1], b = veri[i + 2];
          if (r < 240 || gg < 240 || b < 240) koyu++;
        }
        return koyu <= 2;
      };

      const kesimler: number[] = [];
      let imlec = 0;
      let guvenlik = 0;

      while (imlec < kanvas.height && guvenlik < 30) {
        guvenlik++;
        const hedef = Math.min(imlec + maxYPx, kanvas.height);
        if (hedef >= kanvas.height) { kesimler.push(kanvas.height); break; }

        // Hedefin ±90px araliginda en yakin bos satiri bul
        let kesim = hedef;
        let bulundu = false;
        for (let fark = 0; fark <= 90; fark++) {
          const alt = hedef + fark;
          const ust = hedef - fark;
          if (alt < kanvas.height && bosSatir(alt)) { kesim = alt; bulundu = true; break; }
          if (ust > imlec + 80 && bosSatir(ust)) { kesim = ust; bulundu = true; break; }
        }

        kesimler.push(kesim);
        imlec = kesim;
      }
      if (kesimler.length === 0) kesimler.push(kanvas.height);

      // Dilimleri olustur
      let onceki = 0;
      for (let i = 0; i < kesimler.length; i++) {
        if (i > 0) pdf.addPage();
        const dilimY = kesimler[i] - onceki;
        if (dilimY <= 0) continue;

        const dilim = document.createElement("canvas");
        dilim.width = kanvas.width;
        dilim.height = dilimY;
        dilim.getContext("2d")!.drawImage(kanvas, 0, -onceki);

        const h = (dilimY * g) / kanvas.width;
        pdf.addImage(dilim.toDataURL("image/jpeg", 0.95), "JPEG", kenar, kenar, g, h);
        onceki = kesimler[i];
      }
    } else {
      // TEK SAYFA: küçült
      const oranG = g / kanvas.width;
      const oranY = maxY / kanvas.height;
      const oran = Math.min(oranG, oranY);
      const w = kanvas.width * oran;
      const h = kanvas.height * oran;
      const x = kenar + (g - w) / 2;
      pdf.addImage(resim, "JPEG", x, kenar, w, h);
    }

    pdf.save(`${dosyaAdi}.pdf`);
    return "basarili";
  } catch (e: any) {
    console.warn("PDF hatasi:", e && e.message);
    return "hata";
  } finally {
    try {
      if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    } catch { /* yoksay */ }
  }
}

/** Yazdırma penceresi aç (PDF olarak kaydet seçeneği ile) */
export function yazdirPencereAc(html: string, secenek: PdfSecenek = {}): boolean {
  try {
    const p = window.open("", "_blank");
    if (!p) {
      alert("Pop-up engellendi. Tarayici adres cubugundaki engelleyiciyi kapatin.");
      return false;
    }

    const bar =
      '<div id="buv-bar" style="position:sticky;top:0;z-index:9999;background:#0f172a;color:#fff;padding:12px;display:flex;gap:8px;align-items:center;justify-content:space-between;font-family:Arial">' +
        '<span style="font-size:13px;font-weight:800">' + (secenek.baslik || "BUVISAN Form") + '</span>' +
        '<span style="display:flex;gap:6px">' +
          '<button onclick="window.print()" style="background:#10b981;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:800;font-size:13px">YAZDIR / PDF</button>' +
          '<button onclick="window.close()" style="background:#475569;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:800;font-size:13px">KAPAT</button>' +
        '</span>' +
      '</div>';

    const stil =
      '<style>' +
        '@media print { #buv-bar { display:none !important; } .sayfa { transform:none !important; } }' +
        '@page { size: A4 portrait; margin: 0; }' +
        'body { background:#e5e7eb; }' +
      '</style>';

    const olcek =
      '<scr' + 'ipt>' +
      '(function(){' +
      'function olcekle(){' +
      'var g=document.documentElement.clientWidth||window.innerWidth;' +
      'var s=Math.min(1,(g-20)/794); if(s<0.15)s=0.15;' +
      'var el=document.querySelector(".sayfa");' +
      'if(el){el.style.transformOrigin="top left";el.style.transform="scale("+s+")";' +
      'document.body.style.width=(794*s+20)+"px";document.body.style.margin="0 auto";' +
      'document.body.style.overflowX="hidden";}' +
      '}' +
      'olcekle(); window.addEventListener("resize",olcekle); setTimeout(olcekle,300);' +
      '})();' +
      '</scr' + 'ipt>';

    const tam = html
      .replace("<body>", "<body>" + bar + stil)
      .replace("</body>", olcek + "</body>");

    p.document.open();
    p.document.write(tam);
    p.document.close();
    return true;
  } catch {
    return false;
  }
}

/** Ana giriş: PDF dene → olmazsa yazdır */
export async function yazdirVeyaPaylas(
  html: string,
  secenek: PdfSecenek = {}
): Promise<"pdf" | "yazdir" | "hata"> {
  const r = await pdfIndir(html, secenek);
  if (r === "basarili") return "pdf";

  if (yazdirPencereAc(html, secenek)) return "yazdir";
  return "hata";
}
