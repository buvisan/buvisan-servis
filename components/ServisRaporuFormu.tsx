"use client";

// ----------------------------------------------------------------------------
// BUVISAN - SERVİS RAPORU FORMU (A4) 📄
// Admin'in gördüğü formun BİREBİR aynısı — personel de aynısını görür.
// Kullanım: <ServisRaporuFormu rapor={rapor} icRef={printRef} />
// ----------------------------------------------------------------------------

import { forwardRef } from "react";

const ServisRaporuFormu = forwardRef<HTMLDivElement, { rapor: any }>(
  function ServisRaporuFormu({ rapor }, ref) {
    if (!rapor) return null;

    const parcalar = (() => {
      let p: any = rapor.degisen_parcalar;
      if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = []; } }
      if (!Array.isArray(p)) p = [];
      return p.filter((x: any) => x && String(x.parca_adi || "").trim());
    })();

    const puan = Number(rapor.musteri_puani || 0);
    const yorum = rapor.musteri_yorumu;

    return (
      <div ref={ref} className="bg-white w-[210mm] min-h-[297mm] p-[15mm] shadow-2xl relative text-black shrink-0 font-sans mx-auto box-border overflow-hidden">

        {/* BAŞLIK + LOGO */}
        <div className="flex justify-between items-start border-b-[3px] border-black pb-4 mb-4">
          <div className="flex items-center gap-4">
            <div className="w-32 h-12 bg-yellow-400 rounded-lg flex items-center justify-center font-black text-2xl tracking-tighter shadow-sm border border-slate-200">
              BUVİSAN
            </div>
          </div>
          <div className="text-right text-[10px] font-bold text-slate-800 uppercase leading-tight">
            <p>ZM METAL MAKİNA İMALAT SANAYİ VE TİCARET LİMİTED ŞİRKETİ</p>
            <p className="text-slate-500 font-medium lowercase">info@zmmetal.com.tr - www.buvisan.com</p>
            <p className="text-slate-500 font-medium">Demirci Mah. / Bursa - Tel: 0224 374 00 01</p>
          </div>
        </div>

        {/* ÜST BİLGİLER */}
        <div className="w-full border-2 border-black grid grid-cols-2 mb-4">
          <div className="border-r-2 border-black">
            <div className="border-b border-black p-2 flex">
              <span className="w-24 font-bold text-xs">FİRMA ADI:</span>
              <span className="font-bold text-sm uppercase">{rapor.firma_adi}</span>
            </div>
            <div className="p-2 flex h-[50px]">
              <span className="w-24 font-bold text-xs">FİRMA ADRESİ:</span>
              <span className="text-xs uppercase line-clamp-2">{rapor.firma_adresi}</span>
            </div>
          </div>
          <div>
            <div className="border-b border-black p-2 bg-slate-100 flex justify-between">
              <span className="font-black text-sm uppercase">Servis Raporu</span>
              <span className="font-bold text-sm text-red-600">No: {String(rapor.id || "").slice(0, 6).toUpperCase()}</span>
            </div>
            <div className="border-b border-black p-2 text-xs font-bold bg-slate-50">
              İŞYERİNE VARIŞ TARİH/SAAT: <span className="ml-2 text-sm">{rapor.isyerine_varis_tarih_saat || "-"}</span>
            </div>
            <div className="p-2 text-xs font-bold bg-slate-50">
              İŞYERİNDEN AYRILIŞ TARİH/SAAT: <span className="ml-2 text-sm">{rapor.isyerinden_ayrilis_tarih_saat || "-"}</span>
            </div>
          </div>
        </div>

        {/* VİNÇ BİLGİLERİ */}
        <table className="w-full border-2 border-black border-collapse mb-4 text-center">
          <thead>
            <tr className="bg-slate-100 text-xs font-bold">
              <th className="border border-black p-2 w-[15%]">VİNCİN</th>
              <th className="border border-black p-2 w-[30%]">MODELİ</th>
              <th className="border border-black p-2 w-[25%]">SERİ NO</th>
              <th className="border border-black p-2 w-[30%] text-left pl-4" colSpan={2}>
                <span className="mr-4">[ {rapor.islem_turu === "Servis" ? "X" : " "} ] SERVİS</span>
                <span>[ {rapor.islem_turu === "Garanti" ? "X" : " "} ] GARANTİ</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="text-sm font-bold uppercase">
              <td className="border border-black p-2 bg-slate-50">Vinç</td>
              <td className="border border-black p-2">{rapor.vinc_modeli || "-"}</td>
              <td className="border border-black p-2 font-mono">{rapor.vinc_seri_no || "-"}</td>
              <td className="border border-black p-2 text-left pl-4 text-xs" colSpan={2}>
                <span className="mr-4">[ {rapor.islem_turu === "Per.Bakım" ? "X" : " "} ] PER.BAKIM</span>
                <span>[ {rapor.islem_turu === "Diğer" ? "X" : " "} ] DİĞER</span>
              </td>
            </tr>
            <tr>
              <td colSpan={5} className="border border-black p-3 text-left">
                <span className="font-bold text-xs uppercase underline">ARIZANIN CİNSİ:</span>
                <span className="ml-2 text-sm font-semibold">{rapor.arizanin_cinsi || "Belirtilmedi"}</span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* YAPILAN İŞLER */}
        <div className="w-full border-2 border-black min-h-[150px] p-3 mb-4 flex flex-col">
          <span className="font-bold text-xs uppercase underline mb-2 block">YAPILAN İŞLER:</span>
          <div className="text-sm font-medium leading-relaxed whitespace-pre-line flex-1">
            {rapor.yapilan_isler || "İşlem detayı girilmedi."}
          </div>
        </div>

        {/* PARÇALAR */}
        <table className="w-full border-2 border-black border-collapse mb-8 text-center text-sm">
          <thead>
            <tr className="bg-slate-100 font-bold text-xs">
              <th className="border border-black p-2 w-[15%]">PARÇA NO</th>
              <th className="border border-black p-2 w-[70%]">PARÇA ADI</th>
              <th className="border border-black p-2 w-[15%]">ADET</th>
            </tr>
          </thead>
          <tbody>
            {parcalar.map((parca: any, i: number) => (
              <tr key={i} className="font-medium">
                <td className="border border-black p-2">{parca.parca_no || "-"}</td>
                <td className="border border-black p-2 text-left px-4 uppercase">{parca.parca_adi}</td>
                <td className="border border-black p-2 font-bold">{parca.adet || "1"}</td>
              </tr>
            ))}
            {[...Array(parcalar.length > 0 ? 1 : 4)].map((_, i) => (
              <tr key={"bos" + i}>
                <td className="border border-black p-4"></td>
                <td className="border border-black p-4"></td>
                <td className="border border-black p-4"></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* MALZEME / SÜRE / KONUM */}
        {((rapor.malzeme_tutari > 0) || (rapor.sure_dakika > 0) || rapor.lat) && (
          <div className="flex flex-wrap justify-end gap-6 mt-3 mb-2 px-1">
            {rapor.sure_dakika > 0 && (
              <span className="text-xs font-bold">SÜRE: {rapor.sure_dakika} dk</span>
            )}
            {rapor.malzeme_tutari > 0 && (
              <span className="text-xs font-black">
                MALZEME TUTARI: {Number(rapor.malzeme_tutari).toLocaleString("tr-TR")} ₺
              </span>
            )}
            {rapor.lat && (
              <a href={`https://maps.google.com/?q=${rapor.lat},${rapor.lng}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs font-bold text-blue-600 underline">
                📍 KONUMU GÖR
              </a>
            )}
          </div>
        )}

        {/* SAHA FOTOĞRAFLARI */}
        {Array.isArray(rapor.medya_urls) && rapor.medya_urls.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-black mb-1.5">
              SAHA FOTOĞRAFLARI / VİDEOLARI ({rapor.medya_urls.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {rapor.medya_urls.map((u: any, i: number) => {
                const url = typeof u === "string" ? u : (u?.url || u?.path || "");
                if (!url) return null;
                const videoMu = /\.(mp4|mov|webm)$/i.test(url);
                return videoMu ? (
                  <video key={i} src={url} controls className="w-28 h-28 object-cover border border-black" />
                ) : (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={`Saha fotoğrafı ${i + 1}`} className="w-28 h-28 object-cover border border-black" />
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* İMZALAR */}
        <div className="w-full border-2 border-black grid grid-cols-3 absolute bottom-[15mm] left-[15mm] w-[calc(100%-30mm)]">
          <div className="border-r border-black p-2 h-24 relative">
            <span className="text-[10px] font-bold text-slate-500 block absolute top-1 left-2">SERVİS YETKİLİSİ</span>
            <div className="absolute bottom-2 left-0 w-full text-center font-bold uppercase text-sm">
              {rapor.personel_adi}
            </div>
          </div>
          <div className="border-r border-black p-2 h-24 relative overflow-hidden">
            <span className="text-[10px] font-bold text-slate-500 block absolute top-1 left-2">MÜŞTERİ YETKİLİSİ</span>
            {rapor.imza_url ? (
              <img src={rapor.imza_url} alt="Müşteri imzası"
                className="absolute left-2 right-2 top-5 h-12 object-contain" />
            ) : (
              <span className="absolute inset-x-0 top-9 text-center text-[9px] text-slate-300 font-bold">
                İMZA ALINMAMIŞ
              </span>
            )}
            <div className="absolute bottom-1 left-0 w-full text-center font-bold uppercase text-xs truncate px-1">
              {rapor.imza_atan || ""}
            </div>
          </div>
          <div className="p-2 h-24 relative bg-slate-50">
            <span className="text-[10px] font-bold text-slate-500 block absolute top-1 left-2">RAPOR TARİHİ</span>
            <div className="absolute bottom-2 left-0 w-full text-center font-bold text-sm">
              {rapor.created_at ? new Date(rapor.created_at).toLocaleDateString("tr-TR") : "-"}
            </div>
          </div>
        </div>

        {/* MEMNUNİYET */}
        {(puan > 0 || yorum) && (
          <div className="rounded-2xl border-2 border-black p-3 mb-2 absolute bottom-[52mm] left-[15mm] w-[calc(100%-30mm)]">
            <p className="text-[10px] font-black uppercase mb-1">MÜŞTERİ MEMNUNİYETİ</p>
            <p className="text-sm font-bold">
              {"★".repeat(puan)}{"☆".repeat(5 - puan)} ({puan}/5)
            </p>
            {yorum && <p className="text-[10px] italic mt-1">"{yorum}"</p>}
          </div>
        )}
      </div>
    );
  }
);

export default ServisRaporuFormu;
