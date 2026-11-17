// ----------------------------------------------------------------------------
// BUVİSAN - TEKNİK SERVİS VE BAKIM SÖZLEŞMESİ 📄
// Word şablonuna birebir uygun · dinamik alanlar
// ----------------------------------------------------------------------------

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    background: #fff; color: #111827; font-size: 15px; line-height: 1.75;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sayfa { width: 794px; padding: 46px 50px; background: #fff; margin: 0 auto; }
  h1 { font-size: 21px; font-weight: 900; text-align: center; letter-spacing: 0.6px; margin-bottom: 4px; }
  .no { text-align: center; font-size: 13px; font-weight: 700; color: #dc2626; margin-bottom: 18px; }
  h2 { font-size: 15.5px; font-weight: 900; margin: 20px 0 9px; letter-spacing: 0.3px; }
  p { font-size: 14.5px; margin-bottom: 9px; text-align: justify; }
  ul { margin: 4px 0 8px 18px; }
  li { font-size: 13.5px; margin-bottom: 3px; }
  .kutu { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 16px; margin: 10px 0 14px; }
  .kutu p { margin-bottom: 6px; font-size: 14.5px; }
  .kutu b { font-weight: 900; }
  .vurgu { color: #0f172a; font-weight: 900; }
  .imza { margin-top: 34px; display: flex; gap: 22px; }
  .imza-k { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; min-height: 120px; }
  .imza-k .et { font-size: 8px; font-weight: 900; letter-spacing: 0.7px; color: #94a3b8; text-transform: uppercase; }
  .imza-k .ad { font-size: 11px; font-weight: 900; margin-top: 5px; }
  .imza-cizgi { margin-top: 42px; border-bottom: 1px dashed #cbd5e1; }
  .alt { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 8px; color: #94a3b8; }
  .sayfa-kes { page-break-after: always; }
  @media print { @page { size: A4 portrait; margin: 12mm; } .sayfa { width: 100%; padding: 0; } }
`;

function esc(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tarih(s: any): string {
  if (!s) return "—";
  const d = String(s).slice(0, 10).split("-");
  if (d.length === 3 && d[0].length === 4) return `${d[2]}.${d[1]}.${d[0]}`;
  return String(s);
}

function para(n: any): string {
  return (Number(n) || 0).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + "₺";
}

export function sozlesmeHtml(s: any): string {
  const firma = String(s?.company_name || "FİRMA");
  const hitap = String(s?.hitap_adi || firma).toUpperCase();
  const makine = Number(s?.machine_count || 0);
  const makineFiyat = Number(s?.price_per_machine || 0);
  const servisFiyat = Number(s?.service_price || makineFiyat || 0);
  const periyotAy = Math.max(1, Number(s?.maintenance_period_months || 3));
  const yilda = Math.max(1, Math.round(12 / periyotAy));   // period TEK DOĞRU KAYNAK
  const periyot = Math.max(1, Math.round(12 / yilda));
  const basla = tarih(s?.start_date);
  const bitis = tarih(s?.end_date);
  const yillik = makine * makineFiyat * yilda;   // servis ücreti DAHİL DEĞİL
  const tip = String(s?.machine_type || "vinç");
  const no = "261711-" + String(s?.id || "001").replace(/-/g, "").slice(0, 3).toUpperCase();
  const sozlesmeNo = s?.sozlesme_no || no;

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>Teknik Servis ve Bakım Sözleşmesi - ${esc(firma)}</title><style>${css}</style></head>
<body><div class="sayfa">

<h1>TEKNİK SERVİS VE BAKIM SÖZLEŞMESİ</h1>
<div class="no">SÖZLEŞME NO: ${esc(sozlesmeNo)}</div>

<h2>1.TARAFLAR</h2>
<p>1- ZM METAL MAK. İML. SAN. VE TİC. LTD. ŞTİ. (BUVİSAN OLARAK ANILACAKTIR)</p>
<p>2- <b>${esc(firma)}</b> (${esc(hitap)} OLARAK ANILACAKTIR)</p>

<h2>2.SÖZLEŞME KAPSAMI</h2>
<p>İşbu sözleşme bakım ve servis olarak nelerin yapılacağı ve bu görevin etkili olarak nasıl uygulanacağı hususunda esasları belirlemektedir.</p>

<div class="kutu">
  <p>Sözleşme Başlangıç Tarihi: <b class="vurgu">${esc(basla)}</b></p>
  <p>Sözleşme Bitiş Tarihi: <b class="vurgu">${esc(bitis)}</b></p>
  <p>Sözleşme Süresi: <b class="vurgu">12 Ay (1 Yıl)</b></p>
  <p>-Teknik Servis Ücreti İlk İki Saate Kadar (Bir Makine İçin): <b class="vurgu">${para(servisFiyat)}</b></p>
  <p>-Periyodik Bakım Ücreti (Bir Makine İçin): <b class="vurgu">${para(makineFiyat)}</b></p>
  <p>-Periyodik Bakım Yapılacak ${tip === "asansör" ? "Asansör" : "Vinç"}: <b class="vurgu">${makine}</b></p>
  <p>-Bakım Periyodu: <b class="vurgu">1 yılda ${yilda} kez yapılacaktır.</b> ( ${periyot} Ayda 1 )</p>
  <p>-Toplam Ödenecek Tutar (1 Yıl): <b class="vurgu">${para(yillik)}</b></p>
</div>

<p>Bu sözleşme on beş madde ve dört sayfadır. İki nüsha olarak hazırlanıp, tarafların imzasından sonra bir nüsha BUVİSAN'da diğer nüsha ${esc(hitap)}'da kalacaktır. Yukarıda belirtilen fiyata KDV dâhil değildir. Fiyatlar (TL) cinsinden olup, sözleşme 01.01.2027 tarihinden sonra kesilecek faturalarda ASGARİ ÜCRET'E yapılan zam oranına göre fiyat artışı yapılacaktır.</p>

<h2>3.YARDIMCI ÜRÜNLER</h2>
<p>${tip === "asansör" ? "Asansör" : "Vinç"} kullanımı esnasında kullanıcı tarafından veya kendiliğinden deforme olan ve yenilenmesi gereken yedek parçalar teknik servis esnasında ayrıca faturalandırılacaktır.</p>

<h2>4.TEKNİK SERVİS VE BAKIM</h2>
<p>Özellikleri belirtilen ürün ve donanımlar için yapılan teknik servis ve bakım sözleşmesi gereğince ${esc(hitap)} ve BUVİSAN aşağıdaki yazılı yükümlülükleri yerine getirmeyi taahhüt eder. BUVİSAN mühendisleri ve teknisyenleri kontratın imzalandığı günü takiben en fazla on gün içinde ${esc(hitap)}'a müracaat ederek işletmede bulunan ürünlerin bakımını yapacak ve servis formunu bölüm şefine imza ve tasdik ettirecektir.</p>

<p><b>Servis ve Periyodik Koruyucu Bakım Hizmetinin İçeriği:</b></p>
<p>BUVİSAN, sözleşme kapsamındaki ürünlere ${periyot} ayda bir koruyucu bakım uygulamakla yükümlüdür. İlgili cihazın, performanslı bir şekilde çalışabilmesi için periyodik bakımlar sırasında yapılacak kontroller şunlardır :</p>
<ul>
  <li>Fren fonksiyon kontrol ve bakımları</li>
  <li>Limit şalter fonksiyon kontrol ve bakımı</li>
  <li>Halat hasarı, lif kontrol ve bakımları</li>
  <li>Yağlama ve seviye tespit kontrol ve bakımları</li>
  <li>Yağ keçelerinin sızdırmazlık kontrol ve bakımları</li>
  <li>Bağlantı cıvataları, kaynak kontrol ve bakımları</li>
  <li>Kiriş ve kaldırma makinası sistemlerinin kontrol ve bakımları</li>
  <li>Yürüyüş takımı sistemlerinin kontrol ve bakımları</li>
  <li>Kanca bloğu ve çatlak kontrol bakımları</li>
  <li>Halat kılavuzu kontrol ve bakımları</li>
  <li>Kumanda panosu genel kontrol ve bakımları</li>
  <li>Enerji alma sistemleri kontrol ve bakımları</li>
  <li>Enerji taşıma sistemleri kontrol ve bakımları</li>
  <li>Bara ve bara ekipmanları kontrol ve bakımları</li>
  <li>Kablo ve enerji taşıyıcı sistemlerin kontrol ve bakımları</li>
  <li>Durdurucu tampon kontrol ve bakımları</li>
  <li>Çelik konstrüksiyon çatlak kontrol ve bakımları</li>
  <li>Uyarı levha kontrolleri</li>
  <li>Kumanda tuş butonları kontrol ve bakımları</li>
  <li>Tambur, makara blokları kontrol ve emniyeti</li>
  <li>${tip === "asansör" ? "Asansör" : "Vinç"} alt ve üst sınırlayıcı kontrol ve bakımları</li>
  <li>${tip === "asansör" ? "Asansör" : "Vinç"} çalışma esnasında ses ve lamba ikaz kontrol ve bakımları</li>
</ul>

<p><b>Bildirilen Arızaların Giderilmesi:</b></p>
<p>Arıza bildirimleri resmi tatil ve pazar günleri dışında yapılır.</p>
<p>Firma, bakım onarım ziyaretlerini normal çalışma günlerinde ve saatlerinde yapmakla yükümlüdür. Periyodik bakım, normal çalışma saatleri içinde yapılır. Resmi tatil ve bayram günlerine rastlayan bakım tatil bitiminde devam eder. Bakım tarihi ve zamanı BUVİSAN ve ${esc(hitap)} arasındaki mutabakata göre belirlenecektir.</p>
<p>BUVİSAN teknik servis personeli, arıza bildirimine müteakip on iki(12) saat içinde arızaya müdahale edecektir.</p>
<p>Cumartesi günleri doğabilecek acil arıza onarımları için ilk iki(2) saate kadar 10.000₺+KDV artan her saat 1.750₺+KDV servis ücreti alınır. Servis ücretine esas teşkil eden süre, merkezimizden hareket edip, tekrar merkezimize dönüş arasında geçen süredir.</p>
<p>Resmi tatil ve pazar günleri doğabilecek acil arıza onarımları için ilk iki(2) saat 12.000₺+KDV artan her saat 2.500₺+KDV servis ücreti alınır. Servis ücretine esas teşkil eden süre, merkezimizden hareket edip, tekrar merkezimize dönüş arasında geçen süredir.</p>
<p>Normal bakım ve arıza onarımı yapılırken ${esc(hitap)}, idarece görevlendirilecek bir teknik elemanı hazır bulunduracaktır.</p>
<p>Bakım onarım sırasında ihtiyaç duyulan malzemeler BUVİSAN tarafından temin edilecek ve ${esc(hitap)}'a ayrıca fatura edilecektir. Bu sözleşmede öngörülen işler, firmanın kalifiye personeli veya tayin edilmiş temsilcileri tarafından yapılır.</p>
<p>Bakım sözleşmesi kapsamındaki ürünler için gerek duyulacak yedek parçalar, ücreti karşılığında ${esc(hitap)} tarafından karşılanacaktır. BUVİSAN parça değişiminden önce, ${esc(hitap)}'ı parçanın nevi ve fiyatı hakkında bilgilendirmek ve onay almakla yükümlüdür. ${esc(hitap)} onayının gecikmesi ve onayın verilmemesi durumunda doğabilecek zararlardan BUVİSAN kesinlikle sorumlu tutulmayacaktır. Değiştirilen parçaların bedeli fatura tarihinden itibaren yirmi(20) gün sonra takip eden ilk Cuma günü ödeme yapılacaktır.</p>
<p>Bakım sözleşmesi kapsamında arızalı parçanın BUVİSAN dışında bir yerden temini istendiğinde, sözleşmenin geçerli olabilmesi için BUVİSAN'ın parçanın uyumluluğu konusunda onayı alınmalı ve bu parça BUVİSAN teknik uzmanları tarafından değiştirilmelidir.</p>

<h2>5.${esc(hitap)}'NIN YÜKÜMLÜLÜKLERİ</h2>
<p>${esc(hitap)}, ürün/cihazların ihtiyaçlarına uygun, BUVİSAN tarafından önerilen her türlü çevre şartlarına (topraklı priz, tozdan arındırılmış ortam, 40°C -15°C sıcaklık ve %40-60 bağıl neme sahip) mekânlar sağlayacaktır.</p>
<p>Ürünleri, yayınlanmış olan çalışma şartlarına uygun olarak ve her zaman dikkatle kullanmak ${esc(hitap)}'nın sorumluluğundadır. Hatalı kullanma ve çalıştırma hatalarından doğacak problemlerin düzeltilmesi firmaya ayrı bir ödeme yapılmasını gerektirir.</p>
<p>${esc(hitap)}, ürün/cihaz durumlarının, karşılaşılan anormalliklerin ve alınan düzeltici tedbirlerin kaydedildiği bir sicil defteri tutmak zorundadır.</p>
<p>${esc(hitap)}, bu sözleşme kapsamında olan ürün/cihazlara hiçbir zarar vermeyeceğini, kullanırken ve günlük bakım yaparken, ürünleri hasardan koruyacağını, bizzat veya üçüncü firmalarca BUVİSAN'ın onayını almadan herhangi bir teknik müdahale, eklenti veya bağlantıda bulunulmayacağını taahhüt eder.</p>
<p>BUVİSAN'ın, bu sözleşmenin getirdiği yükümlülükleri yerine getirebilmesi için ${esc(hitap)}, ürünleri yeterli süreler için teknisyenlerin/mühendislerin denetimine tahsis edecektir. Firma, periyodik bakıma gelmeden en az kırk sekiz saat önce ${esc(hitap)}'ı arayarak randevu alacaktır. Eğer ürünler, acil nedenlerle Madde 4'de bahsedilen bakım ziyaretleri için tahsis edilemeyecekse, firmaya en az üç gün önceden haber verilecektir. Bu durumda planlanmış ziyaretten sonra yedi gün geçmeden bir alternatif tarihte anlaşmaya varılır.</p>
<p>Periyodik kontrol yapılacak sahanın ${tip === "asansör" ? "asansör" : "vinç"} kurulumuna uygun hale getirilmesi ve İSG (İş Sağlığı ve Güvenliği) için gerekli güvenlik önlemleri müşteri tarafından sağlanacaktır.</p>
<p>Yemek saatleri içerisinde firmada çalışma yapılıyorsa, yemek firma tarafından karşılanmalıdır.</p>

<h2>6.SİSTEMİN ÇALIŞIR DURUMDA TUTULMASI</h2>
<p>BUVİSAN, ${esc(hitap)}'nın ürünleri sürekli kullanabilmesi için çalışır durumda tutmakla yükümlüdür. Bu nedenle gerekli ve önemli yedek parçaları kendi servis merkezinde stoklar. Üretici firmaların gerekli parçaları sağlayamamasından BUVİSAN sorumlu değildir. Üründeki arıza yurt dışından bir parça getirmeyi gerektirdiğinde BUVİSAN bu işlemi yazılı siparişin onaylanmasını takiben mümkün olduğu en kısa zamanda yerine getirir.</p>

<h2>7.SİSTEMİN DURUMU</h2>
<p>Sözleşmenin yürürlüğe girdiği tarihte ürünün normal çalışır durumda olması gerekir. Ürün için verilen garanti süresi dolduktan sonra sözleşme tarihine kadar bir ara dönem geçmiş ve eskimiş parçalar var ise, BUVİSAN ürünü normal çalışır hale getirmek için ek bir ücret talep edebilir. BUVİSAN yaptığı teklifin kabulünden sonra ürünün bakımını yapar ve ürünü çalışır vaziyette teslim eder. BUVİSAN bakımını olanaksız gördüğü üniteleri ${esc(hitap)}'nın yetkili elemanlarının onayını almak suretiyle sözleşme kapsamı dışında tutabilir. ${esc(hitap)} ücreti kendisine ait olmak üzere bu üniteleri değiştirme hakkına sahiptir.</p>

<h2>8.SÖZLEŞME SÜRESİ</h2>
<p>Bu sözleşme imza tarihinden itibaren sözleşmenin birinci sayfasında yazılı süre için geçerlidir. ${esc(hitap)}'nın uzatma isteği durumunda koşulları yeniden görüşülmek üzere yenilenir, otomatik olarak uzatılmaz. Taraflar bu sözleşmenin birinci sayfasında yazılı adreslerini kanuni ikametgah kabul etmiş olup, vaki olacak adres değişikliklerinin bir hafta içerisinde yazılı olarak diğer tarafa bildirilmemesi halinde sözleşmede yazılı adrese yapılacak her türlü tebligatın muteber olacağını şimdiden kabul etmişlerdir.</p>
<p>Eğer taraflardan birisi bu sözleşme gereği olan yükümlülüklerini yerine getirmez ise, diğer tarafa hatasını taahhütlü mektupla bildirmesinden bir ay sonra ve bu süre içerisinde de düzeltici/yapıcı bir önlem alınmadığı takdirde sözleşme fesih edilmiş sayılacaktır.</p>

<h2>9.SİGORTA</h2>
<p>Ürünün kaybolması ve zarara uğraması hallerinden BUVİSAN sorumlu değildir. Herhangi bir hasara karşı ürünün sigortalanmasından ${esc(hitap)} sorumludur. Şirket merkezine veya BUVİSAN'dan ${esc(hitap)}'a yapılacak sevkiyatlarda ürünler ${esc(hitap)} tarafından sigortalanır.</p>

<h2>10.TAAHHÜTLERİN YERİNE GETİRİLMESİ VE FORCE MAJOR</h2>
<p>Üründe kasıtlı veya yetersiz altyapı, topraklama, yanlış kullanım, elektrik kontağı gibi doğabilecek her türlü teknik arızalar, grev, lokavt, işçi hareketleri ve siyasal olaylar gibi hallerde veya uluslararası FORCE MAJOR tanımlarına uygun nedenlerden ötürü BUVİSAN bu sözleşmede taahhüt ettiği yükümlülükleri yerine getiremediği takdirde bunun sorumluluğu kendisine ait değildir. ${esc(hitap)}, BUVİSAN'dan hak talep edemez.</p>

<h2>11.DEVREDİLEMEZLİK</h2>
<p>Bu sözleşme BUVİSAN ile ${esc(hitap)} arasında düzenlenmiş olup, şirket topluluğu dışındaki üçüncü bir şahıs veya firmaya devredilemez. İki tarafta sorumluluklardan ve haklardan vazgeçemez.</p>

<h2>12.İHTİLAF DURUMU</h2>
<p>Bu sözleşme üzerinde doğabilecek ihtilaflarda Bursa Mahkemeleri ve İcra Daireleri yetkilidir.</p>

<h2>14.</h2>
<p>İşbu sözleşme ${esc(basla)} tarihinde iki nüsha olarak tanzim edilmiş olup okunup imza altına alınmıştır.</p>

<h2>15.</h2>
<p>İşbu sözleşme toplam 4 sayfadan oluşmaktadır.</p>

<div class="imza">
  <div class="imza-k">
    <div class="et">BUVİSAN</div>
    <div class="ad">ZM METAL MAKİNA SAN. TİC. LTD. ŞTİ</div>
    <div class="imza-cizgi"></div>
  </div>
  <div class="imza-k">
    <div class="et">MÜŞTERİ</div>
    <div class="ad">${esc(hitap)}</div>
    <div class="imza-cizgi"></div>
  </div>
</div>

<div class="alt">BUVİSAN Vinç Servis · www.buvisan.com · 0224 374 00 01</div>
</div></body></html>`;
}
