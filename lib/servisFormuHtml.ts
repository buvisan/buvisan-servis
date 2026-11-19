// ----------------------------------------------------------------------------
// BUVİSAN — SERVİS FORMU (A4) 📄
// Müşteri portalı: geçmiş servis kaydı → "FORMU GÖRÜNTÜLE" (A4 PDF)
// ----------------------------------------------------------------------------
//  VERİ KAYNAĞI: supabase.rpc("musteri_servis_detay",
//                               { p_token, p_kaynak, p_id })
//    → sql/203-musteri-sozlesme-servis-detay.sql
//    (token kontrolü + "bu kayıt size ait değil" kontrolü RPC'nin içinde;
//     bu şablon SADECE o RPC'nin döndürdüğü alanları basar, yeni yetki açmaz.)
//
//  KULLANILAN ALANLAR (RPC çıktısındaki gerçek adlar):
//    hepsi     : ok, kaynak, tarih, tur, form_no, personel, makine,
//                aciklama, tutar, para_birimi
//    'rapor'   : yapilan_isler, malzeme
//    'completed': malzeme
//    'bakim'   : makine_bilgileri, maddeler, onay, ret, musteri_yorumu
//
//  ⚠️ PARA KURALI: sistemdeki tüm tutarlar KDV HARİÇTİR → tutar her zaman
//     "KDV hariç" ibaresiyle basılır.
//  ⚠️ Personel prim / maliyet verisi müşteriye BASILMAZ → şablon beyaz liste
//     (whitelist) ile sadece yukarıdaki alanları kullanır.
//  ⚠️ Eksik alan → boş geçilir, hata vermez (satir() boş değeri atlar).
// ----------------------------------------------------------------------------

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    background: #fff; color: #0f172a; font-size: 12px; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sayfa { width: 794px; padding: 28px 34px 22px; margin: 0 auto; }

  /* ───── ÜST: LOGO + MARKA ───── */
  .ust {
    display: flex; justify-content: space-between; align-items: center; gap: 18px;
    border-bottom: 3px solid #0f172a; padding-bottom: 12px;
  }
  .marka { display: flex; align-items: center; gap: 10px; }
  .logo {
    width: 40px; height: 40px; border-radius: 10px;
    background: linear-gradient(135deg, #facc15, #f59e0b);
    display: flex; align-items: center; justify-content: center;
    font-weight: 900; font-size: 19px; color: #0f172a;
  }
  .marka h1 { font-size: 14px; font-weight: 900; letter-spacing: 0.6px; }
  .marka p {
    font-size: 8px; color: #64748b; font-weight: 800; letter-spacing: 1.3px;
    text-transform: uppercase; margin-top: 2px;
  }
  .ust-sag {
    text-align: right; font-size: 8px; color: #94a3b8; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.6px; line-height: 1.5;
  }
  .ust-sag b { display: block; font-size: 11px; color: #0f172a; margin-top: 2px; letter-spacing: 0.3px; }

  /* ───── BAŞLIK ŞERİDİ ───── */
  .baslik {
    background: linear-gradient(135deg, #0f172a, #1e293b);
    color: #fff; text-align: center; padding: 13px; margin: 14px 0 16px; border-radius: 10px;
  }
  .baslik h2 { font-size: 15px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; }
  .baslik p { font-size: 8.5px; color: #94a3b8; font-weight: 700; margin-top: 3px; letter-spacing: 0.5px; }

  /* ───── BİLGİ KUTUSU ───── */
  .bilgi { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 15px; background: #f8fafc; }
  .bilgi table { width: 100%; border-collapse: collapse; }
  .bilgi td { padding: 7px 12px; font-size: 10.5px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .bilgi tr:last-child td { border-bottom: 0; }
  .bilgi td.e {
    width: 132px; font-size: 8.5px; font-weight: 900; letter-spacing: 0.6px;
    text-transform: uppercase; color: #475569; background: #f1f5f9; white-space: nowrap;
  }
  .bilgi td.d { font-weight: 700; color: #0f172a; }

  /* ───── BÖLÜM ───── */
  .bolum { margin-bottom: 13px; }
  .bolum h3 {
    font-size: 9px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase;
    color: #0f172a; padding-bottom: 5px; border-bottom: 1.5px solid #0f172a;
    margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; gap: 10px;
  }
  .bolum h3 span { font-size: 8px; color: #64748b; letter-spacing: 0.5px; }
  .icerik {
    font-size: 11px; color: #334155; line-height: 1.7;
    white-space: pre-wrap; font-weight: 600;
  }

  /* ───── TABLO ───── */
  table.tbl { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; }
  table.tbl th {
    background: #0f172a; color: #fff; font-size: 8px; font-weight: 800;
    letter-spacing: 0.8px; text-transform: uppercase; padding: 7px 10px; text-align: left;
  }
  table.tbl td { padding: 6px 10px; font-size: 10px; color: #1e293b; border-bottom: 1px solid #e2e8f0; font-weight: 600; }
  table.tbl tr:last-child td { border-bottom: 0; }
  table.tbl td.orta { text-align: center; }
  table.tbl td.ok { color: #059669; font-weight: 900; font-size: 11px; }
  table.tbl td.ret { color: #dc2626; font-weight: 900; font-size: 11px; }
  table.tbl td.e {
    width: 150px; font-size: 8.5px; font-weight: 900; letter-spacing: 0.6px;
    text-transform: uppercase; color: #475569; background: #f8fafc; white-space: nowrap;
  }

  /* ───── TUTAR (KDV HARİÇ) ───── */
  .tutar {
    border: 1.5px solid #cbd5e1; border-left: 4px solid #facc15; border-radius: 8px;
    background: #f8fafc; padding: 11px 14px; display: flex;
    justify-content: space-between; align-items: center; gap: 12px;
  }
  .tutar .et { font-size: 8.5px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase; color: #64748b; }
  .tutar .tut { font-size: 19px; font-weight: 900; color: #0f172a; line-height: 1.15; }
  .tutar .kdv {
    display: inline-block; margin-top: 4px; background: #facc15; color: #0f172a;
    font-size: 8.5px; font-weight: 900; padding: 2px 8px; border-radius: 4px; letter-spacing: 0.4px;
  }

  /* ───── İMZA ───── */
  .imza-baslik {
    margin: 18px 0 9px; font-size: 9px; font-weight: 900; letter-spacing: 1.2px;
    text-transform: uppercase; color: #0f172a;
    padding-top: 14px; border-top: 2px solid #0f172a;
  }
  .imza { display: flex; gap: 14px; }
  .imza-k {
    flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px;
    min-height: 112px; display: flex; flex-direction: column; background: #fff;
  }
  .imza-k .et {
    font-size: 8px; font-weight: 900; letter-spacing: 0.9px;
    text-transform: uppercase; color: #94a3b8;
  }
  .imza-k .ad { font-size: 10.5px; font-weight: 800; color: #0f172a; margin-top: 4px; line-height: 1.35; }
  .imza-k .not { font-size: 7.5px; font-weight: 800; color: #94a3b8; margin-top: 2px; letter-spacing: 0.3px; }
  .imza-cizgi { margin-top: auto; border-bottom: 1.5px dashed #94a3b8; height: 36px; }

  /* ───── ALT ───── */
  .kdv-not {
    margin-top: 12px; border: 1px dashed #cbd5e1; border-radius: 6px;
    padding: 6px 10px; font-size: 8px; font-weight: 800; color: #475569;
    text-align: center; letter-spacing: 0.3px;
  }
  .dip {
    margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 8px;
    display: flex; justify-content: space-between; gap: 10px;
    font-size: 7.5px; color: #94a3b8; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.6px;
  }

  @media print { @page { size: A4 portrait; margin: 12mm; } .sayfa { width: 100%; padding: 0; } }
`;

function esc(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** RPC 'DD.MM.YYYY' döndürür; ISO gelirse çevir, boşsa boş bırak. */
function tarih(s: any): string {
  const v = String(s ?? "").trim();
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const p = v.slice(0, 10).split("-");
    return `${p[2]}.${p[1]}.${p[0]}`;
  }
  return v;
}

/** Tutar — HER ZAMAN KDV hariç gösterilir. */
function para(n: any, pb: any): string {
  const v = Number(n) || 0;
  const birim = String(pb || "TRY").toUpperCase();
  const sembol = birim === "TRY" || birim === "" ? "₺" : birim === "USD" ? "$" : birim === "EUR" ? "€" : birim;
  return v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + sembol;
}

/** Boş / "—" değerleri atlayan bilgi satırı. */
function satir(etiket: string, deger: any): string {
  const v = String(deger ?? "").trim();
  if (!v || v === "—") return "";
  return `<tr><td class="e">${esc(etiket)}</td><td class="d">${esc(v)}</td></tr>`;
}

function jsonObj(v: any): Record<string, any> {
  try {
    if (!v) return {};
    if (typeof v === "object" && !Array.isArray(v)) return v as Record<string, any>;
    if (typeof v === "string") {
      const j = JSON.parse(v);
      return j && typeof j === "object" && !Array.isArray(j) ? j : {};
    }
    return {};
  } catch { return {}; }
}

function jsonDizi(v: any): any[] {
  try {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      const j = JSON.parse(v);
      return Array.isArray(j) ? j : [];
    }
    return [];
  } catch { return []; }
}

/** Türkçe büyük harf (I/İ doğru olsun: "Servis" → "SERVİS") */
function buyuk(s: any): string {
  try { return String(s ?? "").toLocaleUpperCase("tr-TR"); }
  catch { return String(s ?? "").toUpperCase(); }
}

export type ServisFormuMusteri = {
  firma?: string;
  yetkili?: string;
  telefon?: string;
};

/**
 * Müşteri portalı servis formu (A4).
 * @param d  musteri_servis_detay RPC çıktısı (liste satırıyla birleştirilmiş olabilir)
 */
export function servisFormuHtml(d: any, musteri: ServisFormuMusteri = {}): string {
  const kaynak = String(d?.kaynak || "").trim();
  const tur = String(d?.tur || "Servis").trim() || "Servis";
  const no = String(d?.form_no || "").trim();
  const tarihMetin = tarih(d?.tarih);
  const makine = String(d?.makine || "").trim();
  const teknisyen = String(d?.personel || "").trim();
  const aciklama = String(d?.aciklama || "").trim();
  const yapilan = String(d?.yapilan_isler || "").trim();
  const malzeme = String(d?.malzeme || "").trim();
  const musteriYorumu = String(d?.musteri_yorumu || "").trim();
  const tutar = Number(d?.tutar) || 0;

  // aciklama alanının anlamı kaynağa göre değişiyor (sql/203):
  //   'completed' → description = YAPILAN İŞ   |  'rapor' → arızanın cinsi (konu)
  //   'bakim'     → notlar                     |  diğer  → konu kabul edilir
  let konu = "";
  let isler = "";
  let notlar = "";
  if (kaynak === "completed") {
    isler = aciklama;
  } else if (kaynak === "bakim") {
    notlar = aciklama;
    isler = yapilan;
  } else {
    konu = aciklama;
    isler = yapilan;
  }

  const firma = String(musteri?.firma || "").trim();
  const yetkili = String(musteri?.yetkili || "").trim();
  const telefon = String(musteri?.telefon || "").trim();

  const makineBilgileri = jsonObj(d?.makine_bilgileri);
  const makineSatirlari = Object.entries(makineBilgileri)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "");

  const maddeler = jsonDizi(d?.maddeler);
  const onay = Number(d?.onay || 0);
  const ret = Number(d?.ret || 0);

  // Kontrol listesi: 2 madde / satır (dar sayfa, uzun listelerde bile tek sayfa)
  const maddeTablosu = (() => {
    if (maddeler.length === 0) return "";
    const hucre = (m: any) => {
      if (!m) return '<td style="border:0"></td><td class="orta" style="border:0;width:30px"></td>';
      const r = String(m?.sonuc || "").toLowerCase() === "ret";
      return '<td>' + esc(m?.madde || m?.ad || "—") + "</td>"
        + '<td class="orta ' + (r ? "ret" : "ok") + '" style="width:30px">' + (r ? "✕" : "✓") + "</td>";
    };
    const satirlar: string[] = [];
    for (let i = 0; i < maddeler.length; i += 2) {
      satirlar.push("<tr>" + hucre(maddeler[i]) + hucre(maddeler[i + 1]) + "</tr>");
    }
    return '<div class="bolum"><h3>Kontrol Listesi'
      + '<span>' + onay + " onay" + (ret > 0 ? " · " + ret + " ret" : "") + "</span></h3>"
      + '<table class="tbl" style="table-layout:fixed"><tbody>' + satirlar.join("") + "</tbody></table></div>";
  })();

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>Servis Formu${no ? " - " + esc(no) : ""}</title><style>${css}</style></head>
<body><div class="sayfa">

  <div class="ust">
    <div class="marka">
      <div class="logo">B</div>
      <div>
        <h1>BUVİSAN VİNÇ &amp; ASANSÖR SERVİS</h1>
        <p>ZM Metal Makina · Servis Formu</p>
      </div>
    </div>
    <div class="ust-sag">Düzenleme Tarihi<b>${esc(tarihMetin || "—")}</b></div>
  </div>

  <div class="baslik">
    <h2>Servis Formu</h2>
    <p>${esc(buyuk(tur))}${no ? " · FORM NO: " + esc(no) : ""}${tarihMetin ? " · " + esc(tarihMetin) : ""}</p>
  </div>

  <div class="bilgi"><table>
    ${satir("Müşteri", firma)}
    ${satir("Yetkili", yetkili)}
    ${satir("Telefon", telefon)}
    ${satir("Form No", no)}
    ${satir("Tarih", tarihMetin)}
    ${satir("Servis Türü", tur)}
    ${satir("Makine", makine)}
    ${satir("Teknisyen", teknisyen)}
  </table></div>

  ${konu ? `<div class="bolum">
    <h3>Arıza / Talep Konusu</h3>
    <div class="icerik">${esc(konu)}</div>
  </div>` : ""}

  ${isler ? `<div class="bolum">
    <h3>Yapılan İşlemler</h3>
    <div class="icerik">${esc(isler)}</div>
  </div>` : ""}

  ${notlar ? `<div class="bolum">
    <h3>Notlar</h3>
    <div class="icerik">${esc(notlar)}</div>
  </div>` : ""}

  ${!konu && !isler && !notlar ? `<div class="bolum">
    <h3>Yapılan İşlemler</h3>
    <div class="icerik" style="color:#94a3b8">Bu servis kaydı için işlem açıklaması girilmemiş.</div>
  </div>` : ""}

  ${malzeme ? `<div class="bolum">
    <h3>Kullanılan Parçalar</h3>
    <div class="icerik">${esc(malzeme)}</div>
  </div>` : ""}

  ${makineSatirlari.length > 0 ? `<div class="bolum">
    <h3>Makine Bilgileri</h3>
    <table class="tbl"><tbody>
      ${makineSatirlari.map(([k, v]) =>
        `<tr><td class="e">${esc(String(k).replace(/_/g, " "))}</td><td>${esc(v)}</td></tr>`
      ).join("")}
    </tbody></table>
  </div>` : ""}

  ${maddeTablosu}

  ${musteriYorumu ? `<div class="bolum">
    <h3>Müşteri Notu</h3>
    <div class="icerik" style="font-style:italic;color:#475569">“${esc(musteriYorumu)}”</div>
  </div>` : ""}

  ${tutar > 0 ? `<div class="tutar">
    <div>
      <div class="et">Servis Bedeli</div>
      <div class="kdv">KDV HARİÇ</div>
    </div>
    <div class="tut">${para(tutar, d?.para_birimi)}</div>
  </div>` : ""}

  <div class="imza-baslik">İmza Bölümü</div>
  <div class="imza">
    <div class="imza-k">
      <div class="et">BUVİSAN Servis Yetkilisi</div>
      <div class="ad">${esc(teknisyen || "—")}</div>
      <div class="not">Ad Soyad / İmza</div>
      <div class="imza-cizgi"></div>
    </div>
    <div class="imza-k">
      <div class="et">Müşteri Yetkilisi</div>
      <div class="ad">${esc(firma || "—")}</div>
      <div class="not">Ad Soyad / Kaşe / İmza</div>
      <div class="imza-cizgi"></div>
    </div>
  </div>

  <div class="kdv-not">Bu formda gösterilen tüm tutarlar KDV hariçtir.</div>

  <div class="dip">
    <span>BUVİSAN · ZM Metal Makina · 0224 374 00 01</span>
    <span>${no ? "Form No: " + esc(no) : "Müşteri Portalı"}</span>
    <span>www.buvisan.com</span>
  </div>

</div></body></html>`;
}
