"use client";

// ----------------------------------------------------------------------------
// BUVISAN - SERVİS RAPORU FORMU (A4) 📄
// Admin'in gördüğü formun BİREBİR aynısı — personel de aynısını görür.
// ✅ Kendi CSS'i gömülü → PDF/yazdırma penceresinde de doğru çıkar
// ✅ Mobilde otomatik küçülür (zoom) → taşma yok
// ----------------------------------------------------------------------------

import { forwardRef } from "react";
import { supabase } from "@/lib/supabaseClient";

const CSS = `
.srp-form {
  width: 210mm; min-height: 297mm; padding: 15mm; background: #fff; color: #000;
  font-family: Arial, Helvetica, sans-serif; position: relative; box-sizing: border-box;
  font-size: 11px; line-height: 1.35; margin: 0 auto; box-shadow: 0 10px 30px rgba(0,0,0,.15);
}
.srp-form * { box-sizing: border-box; }
.srp-head-row { display: flex; justify-content: space-between; align-items: flex-start;
  border-bottom: 3px solid #000; padding-bottom: 12px; margin-bottom: 14px; }
.srp-logo { width: 128px; height: 48px; background: #facc15; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 900; font-size: 22px; letter-spacing: -1px; flex: 0 0 auto; }
.srp-head-txt { text-align: right; font-size: 9px; font-weight: 700; text-transform: uppercase; line-height: 1.3; max-width: 62%; }
.srp-head-txt .alt { font-weight: 500; color: #555; text-transform: lowercase; }
.srp-grid2 { display: grid; grid-template-columns: 1fr 1fr; border: 2px solid #000; margin-bottom: 14px; }
.srp-grid2 > div:first-child { border-right: 2px solid #000; }
.srp-line { padding: 8px; border-bottom: 1px solid #000; display: flex; gap: 8px; align-items: flex-start; }
.srp-line:last-child { border-bottom: 0; }
.srp-lbl { width: 78px; font-weight: 700; font-size: 10px; flex: 0 0 auto; }
.srp-val { font-weight: 700; font-size: 12px; text-transform: uppercase; flex: 1 1 auto; word-break: break-word; }
.srp-val.alt { font-weight: 500; font-size: 10px; }
.srp-box-hdr { padding: 8px; background: #f1f5f9; border-bottom: 1px solid #000;
  display: flex; justify-content: space-between; align-items: center; }
.srp-box-hdr b { font-size: 13px; text-transform: uppercase; letter-spacing: .5px; }
.srp-no { color: #dc2626; font-weight: 700; font-size: 12px; }
.srp-tbl { width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 14px; }
.srp-tbl th, .srp-tbl td { border: 1px solid #000; padding: 6px 8px; font-size: 11px; }
.srp-tbl th { background: #f1f5f9; font-weight: 700; text-align: center; }
.srp-tbl td.c { text-align: center; }
.srp-tbl td.u { text-transform: uppercase; }
.srp-works { border: 2px solid #000; padding: 10px; min-height: 140px; margin-bottom: 14px; }
.srp-works .h { font-weight: 700; font-size: 10px; text-transform: uppercase; text-decoration: underline; display: block; margin-bottom: 6px; }
.srp-works .b { font-size: 12px; white-space: pre-line; }
.srp-totals { display: flex; justify-content: flex-end; gap: 22px; margin: 8px 2px 10px; font-size: 11px; font-weight: 700; }
.srp-photos { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.srp-photos img, .srp-photos video { width: 84px; height: 84px; object-fit: cover; border: 1px solid #000; }
.srp-sign { display: grid; grid-template-columns: 1fr 1fr 1fr; border: 2px solid #000;
  position: absolute; left: 15mm; bottom: 15mm; width: calc(100% - 30mm); }
.srp-sign > div { border-right: 1px solid #000; padding: 6px; height: 92px; position: relative; }
.srp-sign > div:last-child { border-right: 0; background: #f8fafc; }
.srp-sign .t { font-size: 9px; font-weight: 700; color: #64748b; }
.srp-sign .n { position: absolute; bottom: 6px; left: 0; width: 100%; text-align: center;
  font-weight: 700; text-transform: uppercase; font-size: 11px; padding: 0 4px; }
.srp-sign img { position: absolute; left: 6px; right: 6px; top: 20px; height: 44px; object-fit: contain; }
.srp-memn { position: absolute; left: 15mm; bottom: 52mm; width: calc(100% - 30mm);
  border: 2px solid #000; padding: 8px; }
.srp-memn .t { font-size: 9px; font-weight: 900; text-transform: uppercase; margin-bottom: 3px; }
.srp-memn .s { font-size: 13px; font-weight: 700; }
.srp-memn .y { font-size: 10px; font-style: italic; margin-top: 3px; }

@media screen and (max-width: 900px) {
  .srp-form { zoom: 0.42; }
}
@media print {
  .srp-form { zoom: 1 !important; box-shadow: none !important; margin: 0 !important; }
  @page { size: A4; margin: 0; }
}
`;

const ServisRaporuFormu = forwardRef<HTMLDivElement, { rapor: any }>(
  function ServisRaporuFormu({ rapor }, ref) {
    if (!rapor) return null;

    const parcalar = (() => {
      let p: any = rapor.degisen_parcalar;
      if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = []; } }
      if (!Array.isArray(p)) p = [];
      return p.filter((x: any) => x && String(x.parca_adi || "").trim());
    })();

    // ✍️ İMZA ÇÖZÜCÜ — farklı alan adları + storage path desteği
    const imzaHam =
      rapor.imza_url || rapor.musteri_imza || rapor.imza ||
      rapor.musteri_imzasi || rapor.signature || rapor.imza_path || null;

    const imzaSrc = (() => {
      if (!imzaHam) return null;
      const s = String(imzaHam).trim();
      if (!s) return null;
      // Zaten tam URL veya data URL
      if (/^(https?:|data:)/i.test(s)) return s;
      // Storage path → public URL
      try {
        const { data } = supabase.storage.from("imzalar").getPublicUrl(s.replace(/^\/+/, ""));
        return data?.publicUrl || null;
      } catch { return null; }
    })();

    const puan = Number(rapor.musteri_puani || 0);
    const yorum = rapor.musteri_yorumu;
    const bosSatir = Math.max(1, 4 - parcalar.length);

    return (
      <div className="srp-wrap">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div ref={ref} className="srp-form">

          {/* BAŞLIK */}
          <div className="srp-head-row">
            <div className="srp-logo">BUVİSAN</div>
            <div className="srp-head-txt">
              <div>ZM METAL MAKİNA İMALAT SANAYİ VE TİCARET LİMİTED ŞİRKETİ</div>
              <div className="alt">info@zmmetal.com.tr - www.buvisan.com</div>
              <div className="alt">Demirci Mah. / Bursa - Tel: 0224 374 00 01</div>
            </div>
          </div>

          {/* ÜST BİLGİLER */}
          <div className="srp-grid2">
            <div>
              <div className="srp-line">
                <span className="srp-lbl">FİRMA ADI:</span>
                <span className="srp-val">{rapor.firma_adi || "-"}</span>
              </div>
              <div className="srp-line" style={{ minHeight: 52 }}>
                <span className="srp-lbl">FİRMA ADRESİ:</span>
                <span className="srp-val alt">{rapor.firma_adresi || "-"}</span>
              </div>
            </div>
            <div>
              <div className="srp-box-hdr">
                <b>Servis Raporu</b>
                <span className="srp-no">No: {String(rapor.id || "").slice(0, 6).toUpperCase()}</span>
              </div>
              <div className="srp-line">
                <span className="srp-lbl">İŞYERİNE VARIŞ TARİH/SAAT:</span>
                <span className="srp-val">{rapor.isyerine_varis_tarih_saat || "-"}</span>
              </div>
              <div className="srp-line">
                <span className="srp-lbl">İŞYERİNDEN AYRILIŞ TARİH/SAAT:</span>
                <span className="srp-val">{rapor.isyerinden_ayrilis_tarih_saat || "-"}</span>
              </div>
            </div>
          </div>

          {/* VİNÇ */}
          <table className="srp-tbl">
            <thead>
              <tr>
                <th style={{ width: "16%" }}>VİNCİN</th>
                <th style={{ width: "32%" }}>MODELİ</th>
                <th style={{ width: "24%" }}>SERİ NO</th>
                <th style={{ width: "28%" }}>İŞLEM TÜRÜ</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="c u" style={{ fontWeight: 700, background: "#f8fafc" }}>Vinç</td>
                <td className="c u" style={{ fontWeight: 700 }}>{rapor.vinc_modeli || "-"}</td>
                <td className="c u" style={{ fontWeight: 700 }}>{rapor.vinc_seri_no || "-"}</td>
                <td className="u" style={{ fontWeight: 700, fontSize: 10 }}>
                  [ {rapor.islem_turu === "Servis" ? "X" : " "} ] SERVİS<br />
                  [ {rapor.islem_turu === "Garanti" ? "X" : " "} ] GARANTİ<br />
                  [ {rapor.islem_turu === "Per.Bakım" ? "X" : " "} ] PER.BAKIM<br />
                  [ {rapor.islem_turu === "Diğer" ? "X" : " "} ] DİĞER
                </td>
              </tr>
              <tr>
                <td colSpan={4} style={{ textAlign: "left", padding: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 10, textTransform: "uppercase", textDecoration: "underline" }}>
                    ARIZANIN CİNSİ:
                  </span>
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600 }}>
                    {rapor.arizanin_cinsi || "Belirtilmedi"}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          {/* YAPILAN İŞLER */}
          <div className="srp-works">
            <span className="h">YAPILAN İŞLER:</span>
            <div className="b">{rapor.yapilan_isler || "İşlem detayı girilmedi."}</div>
          </div>

          {/* PARÇALAR */}
          <table className="srp-tbl">
            <thead>
              <tr>
                <th style={{ width: "16%" }}>PARÇA NO</th>
                <th>PARÇA ADI</th>
                <th style={{ width: "14%" }}>ADET</th>
              </tr>
            </thead>
            <tbody>
              {parcalar.map((p: any, i: number) => (
                <tr key={i}>
                  <td className="c">{p.parca_no || "-"}</td>
                  <td className="u" style={{ paddingLeft: 14 }}>{p.parca_adi}</td>
                  <td className="c" style={{ fontWeight: 700 }}>{p.adet || "1"}</td>
                </tr>
              ))}
              {[...Array(bosSatir)].map((_, i) => (
                <tr key={"b" + i}>
                  <td style={{ height: 26 }}></td>
                  <td></td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* TOPLAMLAR */}
          {((rapor.malzeme_tutari > 0) || (rapor.sure_dakika > 0)) && (
            <div className="srp-totals">
              {rapor.sure_dakika > 0 && <span>SÜRE: {rapor.sure_dakika} dk</span>}
              {rapor.malzeme_tutari > 0 && (
                <span>MALZEME TUTARI: {Number(rapor.malzeme_tutari).toLocaleString("tr-TR")} ₺</span>
              )}
            </div>
          )}

          {/* FOTOĞRAFLAR */}
          {Array.isArray(rapor.medya_urls) && rapor.medya_urls.length > 0 && (
            <div>
              <p style={{ fontSize: 9, fontWeight: 900, marginBottom: 5 }}>
                SAHA FOTOĞRAFLARI ({rapor.medya_urls.length})
              </p>
              <div className="srp-photos">
                {rapor.medya_urls.map((u: any, i: number) => {
                  const url = typeof u === "string" ? u : (u?.url || u?.path || "");
                  if (!url) return null;
                  return /\.(mp4|mov|webm)$/i.test(url)
                    ? <video key={i} src={url} controls />
                    : <a key={i} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={"foto " + (i + 1)} /></a>;
                })}
              </div>
            </div>
          )}

          {/* MEMNUNİYET */}
          {(puan > 0 || yorum) && (
            <div className="srp-memn">
              <div className="t">MÜŞTERİ MEMNUNİYETİ</div>
              <div className="s">{"★".repeat(puan)}{"☆".repeat(Math.max(0, 5 - puan))} ({puan}/5)</div>
              {yorum && <div className="y">&quot;{yorum}&quot;</div>}
            </div>
          )}

          {/* İMZALAR */}
          <div className="srp-sign">
            <div>
              <span className="t">SERVİS YETKİLİSİ</span>
              <div className="n">{rapor.personel_adi || ""}</div>
            </div>
            <div style={{ overflow: "hidden" }}>
              <span className="t">MÜŞTERİ YETKİLİSİ</span>
              {imzaSrc
                ? <img src={imzaSrc} alt="Müşteri imzası" />
                : <span style={{ position: "absolute", top: 34, left: 0, width: "100%", textAlign: "center", fontSize: 8, color: "#cbd5e1", fontWeight: 700 }}>İMZA ALINMAMIŞ</span>}
              <div className="n">{rapor.imza_atan || ""}</div>
            </div>
            <div>
              <span className="t">RAPOR TARİHİ</span>
              <div className="n">
                {rapor.created_at ? new Date(rapor.created_at).toLocaleDateString("tr-TR") : "-"}
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  }
);

export default ServisRaporuFormu;
