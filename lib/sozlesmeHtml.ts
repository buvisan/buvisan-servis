// ----------------------------------------------------------------------------
// BUVİSAN - TEKNİK SERVİS VE BAKIM SÖZLEŞMESİ 📄
// Word şablonuna birebir uygun · dinamik alanlar
// ----------------------------------------------------------------------------

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    background: #fff; color: #1e293b; font-size: 12.5px; line-height: 1.7;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sayfa { width: 794px; padding: 0 0 0 0; background: #fff; margin: 0 auto; }

  /* ───── ÜST BLOK ───── */
  .ust {
    display: flex; justify-content: space-between; align-items: center;
    padding: 20px 34px 16px; border-bottom: 3px solid #0f172a;
    background: #fff;
  }
  .ust img { height: 46px; width: auto; }
  .ust-sag { text-align: right; font-size: 8.5px; line-height: 1.5; color: #64748b; font-weight: 600; }
  .ust-sag b { display: block; font-size: 9.5px; color: #0f172a; font-weight: 900; margin-bottom: 2px; }

  /* ───── BAŞLIK ŞERİDİ ───── */
  .baslik-serit {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #fff; text-align: center; padding: 16px 34px 14px;
  }
  .baslik-serit h1 { font-size: 16.5px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; }
  .baslik-serit .no {
    display: inline-block; margin-top: 7px; background: #facc15; color: #0f172a;
    font-size: 10px; font-weight: 900; padding: 3px 14px; border-radius: 4px; letter-spacing: 0.5px;
  }

  /* ───── İÇERİK ───── */
  .icerik { padding: 24px 34px 26px; }

  .madde { margin-bottom: 18px; }
  .madde-bas {
    display: flex; align-items: center; gap: 9px; margin-bottom: 8px;
    padding-bottom: 5px; border-bottom: 1.5px solid #e2e8f0;
  }
  .madde-no {
    background: #0f172a; color: #fff; font-size: 10px; font-weight: 900;
    min-width: 24px; height: 24px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .madde-bas h2 {
    font-size: 12.5px; font-weight: 900; color: #0f172a;
    letter-spacing: 0.6px; text-transform: uppercase;
  }

  p { font-size: 11.5px; margin-bottom: 7px; text-align: justify; color: #334155; }
  ul { margin: 6px 0 9px 0; padding-left: 0; list-style: none; }
  li {
    font-size: 11px; margin-bottom: 2.5px; color: #475569;
    padding-left: 16px; position: relative;
  }
  li::before {
    content: ""; position: absolute; left: 4px; top: 8px;
    width: 5px; height: 5px; border-radius: 50%; background: #facc15;
  }

  /* ───── BİLGİ KUTUSU ───── */
  .kutu {
    background: #f8fafc; border: 1.5px solid #cbd5e1;
    border-left: 4px solid #facc15; border-radius: 8px;
    padding: 14px 18px; margin: 12px 0 16px;
  }
  .kutu .satir {
    display: flex; justify-content: space-between; gap: 12px;
    font-size: 11.5px; padding: 3.5px 0; border-bottom: 1px dotted #e2e8f0;
  }
  .kutu .satir:last-child { border-bottom: 0; }
  .kutu .satir span:first-child { color: #64748b; font-weight: 600; }
  .kutu .satir b { color: #0f172a; font-weight: 900; }
  .kutu .toplam {
    margin-top: 8px; padding-top: 8px; border-top: 2px solid #0f172a;
    display: flex; justify-content: space-between; font-size: 13px;
  }
  .kutu .toplam b { color: #059669; font-size: 15px; font-weight: 900; }

  /* ───── İMZA ───── */
  .imza-baslik {
    text-align: center; font-size: 10px; font-weight: 900; letter-spacing: 1.2px;
    color: #0f172a; text-transform: uppercase; margin: 26px 0 12px;
    padding-top: 16px; border-top: 2px solid #0f172a;
  }
  .imza { display: flex; gap: 18px; }
  .imza-k {
    flex: 1; border: 1.5px solid #cbd5e1; border-radius: 8px;
    padding: 11px 13px; min-height: 118px; background: #fff;
  }
  .imza-k .et {
    font-size: 7.5px; font-weight: 900; letter-spacing: 0.8px;
    color: #94a3b8; text-transform: uppercase;
  }
  .imza-k .ad { font-size: 11px; font-weight: 900; margin-top: 5px; color: #0f172a; line-height: 1.3; }
  .imza-cizgi { margin-top: 40px; border-bottom: 1px dashed #cbd5e1; }

  /* ───── ALT ───── */
  .alt {
    margin-top: 22px; padding: 10px 34px; background: #0f172a; color: #94a3b8;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 8px; font-weight: 700; letter-spacing: 0.4px;
  }
  .alt b { color: #facc15; }

  @media print {
    @page { size: A4 portrait; margin: 0; }
    body { background: #fff; }
    .sayfa { width: 100%; }
  }
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

  <!-- ÜST: LOGOLAR -->
  <div class="ust">
    <img src="/buvisan-logo.webp" alt="BUVİSAN" />
    <div class="ust-sag">
      <b>ZM METAL MAKİNA İMALAT SAN. VE TİC. LTD. ŞTİ.</b>
      Demirci Mah. / Nilüfer / BURSA<br>
      Tel: 0224 374 00 01 · www.buvisan.com
    </div>
  </div>

  <!-- BAŞLIK -->
  <div class="baslik-serit">
    <h1>Teknik Servis ve Bakım Sözleşmesi</h1>
    <div class="no">SÖZLEŞME NO: ${esc(sozlesmeNo)}</div>
  </div>

  <div class="icerik">

  <!-- 1 -->
  <div class="madde">
    <div class="madde-bas"><div class="madde-no">1</div><h2>Taraflar</h2></div>
    <p>1- ZM METAL MAK. İML. SAN. VE TİC. LTD. ŞTİ. (BUVİSAN OLARAK ANILACAKTIR)</p>
    <p>2- <b>${esc(firma)}</b> (${esc(hitap)} OLARAK ANILACAKTIR)</p>
  </div>

  <!-- 2 -->
  <div class="madde">
    <div class="madde-bas"><div class="madde-no">2</div><h2>Sözleşme Kapsamı</h2></div>
    <p>İşbu sözleşme bakım ve servis olarak nelerin yapılacağı ve bu görevin etkili olarak nasıl uygulanacağı hususunda esasları belirlemektedir.</p>

    <div class="kutu">
      <div class="satir"><span>Sözleşme Başlangıç Tarihi</span><b>${esc(basla)}</b></div>
      <div class="satir"><span>Sözleşme Bitiş Tarihi</span><b>${esc(bitis)}</b></div>
      <div class="satir"><span>Sözleşme Süresi</span><b>12 Ay (1 Yıl)</b></div>
      <div class="satir"><span>Teknik Servis Ücreti (İlk 2 Saat · Bir Makine)</span><b>${para(servisFiyat)}</b></div>
      <div class="satir"><span>Periyodik Bakım Ücreti (Bir Makine)</span><b>${para(makineFiyat)}</b></div>
      <div class="satir"><span>Periyodik Bakım Yapılacak ${tip === "asansör" ? "Asansör" : "Vinç"}</span><b>${makine} Adet</b></div>
      <div class="satir"><span>Bakım Periyodu</span><b>1 yılda ${yilda} kez (${periyot} ayda 1)</b></div>
      <div class="toplam"><span>Toplam Ödenecek Tutar (1 Yıl)</span><b>${para(yillik)}</b></div>
    </div>

    <p>Bu sözleşme on beş madde ve dört sayfadır. İki nüsha olarak hazırlanıp, tarafların imzasından sonra bir nüsha BUVİSAN'da diğer nüsha ${esc(hitap)}'da kalacaktır. Yukarıda belirtilen fiyata KDV dâhil değildir. Fiyatlar (TL) cinsinden olup, sözleşme 01.01.2027 tarihinden sonra kesilecek faturalarda ASGARİ ÜCRET'E yapılan zam oranına göre fiyat artışı yapılacaktır.</p>
  </div>

  <!-- 3 -->
  <div class="madde">
    <div class="madde-bas"><div class="madde-no">3</div><h2>Yardımcı Ürünler</h2></div>
    <p>${tip === "asansör" ? "Asansör" : "Vinç"} kullanımı esnasında kullanıcı tarafından veya kendiliğinden deforme olan ve yenilenmesi gereken yedek parçalar teknik servis esnasında ayrıca faturalandırılacaktır.</p>
  </div>

  <!-- 4 -->
  <div class="madde">
    <div class="madde-bas"><div class="madde-no">4</div><h2>Teknik Servis ve Bakım</h2></div>
    <p>Özellikleri belirtilen ürün ve donanımlar için yapılan teknik servis ve bakım sözleşmesi gereğince ${esc(hitap)} ve BUVİSAN aşağıdaki yazılı yükümlülükleri yerine getirmeyi taahhüt eder. BUVİSAN mühendisleri ve teknisyenleri kontratın imzalandığı günü takiben en fazla on gün içinde ${esc(hitap)}'a müracaat ederek işletmede bulunan ürünlerin bakımını yapacak ve servis formunu bölüm şefine imza ve tasdik ettirecektir.</p>

    <p><b>Servis ve Periyodik Koruyucu Bakım Hizmetinin İçeriği:</b></p>
    <p>BUVİSAN, sözleşme kapsamındaki ürünlere ${periyot} ayda bir koruyucu bakım uygulamakla yükümlüdür. İlgili cihazın performanslı bir şekilde çalışabilmesi için periyodik bakımlar sırasında yapılacak kontroller şunlardır:</p>
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
    <p>Arıza bildirimleri resmi tatil ve pazar günleri dışında yapılır. Firma, bakım onarım ziyaretlerini normal çalışma günlerinde ve saatlerinde yapmakla yükümlüdür. Periyodik bakım, normal çalışma saatleri içinde yapılır. Resmi tatil ve bayram günlerine rastlayan bakım tatil bitiminde devam eder. Bakım tarihi ve zamanı BUVİSAN ve ${esc(hitap)} arasındaki mutabakata göre belirlenecektir.</p>
    <p>BUVİSAN teknik servis personeli, arıza bildirimine müteakip on iki (12) saat içinde arızaya müdahale edecektir.</p>
    <p>Cumartesi günleri doğabilecek acil arıza onarımları için ilk iki (2) saate kadar 10.000₺+KDV, artan her saat 1.750₺+KDV servis ücreti alınır. Servis ücretine esas teşkil eden süre, merkezimizden hareket edip tekrar merkezimize dönüş arasında geçen süredir.</p>
    <p>Resmi tatil ve pazar günleri doğabilecek acil arıza onarımları için ilk iki (2) saat 12.000₺+KDV, artan her saat 2.500₺+KDV servis ücreti alınır. Servis ücretine esas teşkil eden süre, merkezimizden hareket edip tekrar merkezimize dönüş arasında geçen süredir.</p>
    <p>Normal bakım ve arıza onarımı yapılırken ${esc(hitap)}, idarece görevlendirilecek bir teknik elemanı hazır bulunduracaktır.</p>
    <p>Bakım onarım sırasında ihtiyaç duyulan malzemeler BUVİSAN tarafından temin edilecek ve ${esc(hitap)}'a ayrıca fatura edilecektir. Bu sözleşmede öngörülen işler, firmanın kalifiye personeli veya tayin edilmiş temsilcileri tarafından yapılır.</p>
    <p>Bakım sözleşmesi kapsamındaki ürünler için gerek duyulacak yedek parçalar, ücreti karşılığında ${esc(hitap)} tarafından karşılanacaktır. BUVİSAN parça değişiminden önce ${esc(hitap)}'ı parçanın nevi ve fiyatı hakkında bilgilendirmek ve onay almakla yükümlüdür. ${esc(hitap)} onayının gecikmesi ve onayın verilmemesi durumunda doğabilecek zararlardan BUVİSAN kesinlikle sorumlu tutulmayacaktır. Değiştirilen parçaların bedeli fatura tarihinden itibaren yirmi (20) gün sonra takip eden ilk Cuma günü ödeme yapılacaktır.</p>
    <p>Bakım sözleşmesi kapsamında arızalı parçanın BUVİSAN dışında bir yerden temini istendiğinde, sözleşmenin geçerli olabilmesi için BUVİSAN'ın parçanın uyumluluğu konusunda onayı alınmalı ve bu parça BUVİSAN teknik uzmanları tarafından değiştirilmelidir.</p>
  </div>

  <!-- 5 -->
  <div class="madde">
    <div class="madde-bas"><div class="madde-no">5</div><h2>${esc(hitap)}'nın Yükümlülükleri</h2></div>
    <p>${esc(hitap)}, ürün/cihazların ihtiyaçlarına uygun, BUVİSAN tarafından önerilen her türlü çevre şartlarına (topraklı priz, tozdan arındırılmış ortam, 40°C -15°C sıcaklık ve %40-60 bağıl neme sahip) mekânlar sağlayacaktır.</p>
    <p>Ürünleri, yayınlanmış olan çalışma şartlarına uygun olarak ve her zaman dikkatle kullanmak ${esc(hitap)}'nın sorumluluğundadır. Hatalı kullanma ve çalıştırma hatalarından doğacak problemlerin düzeltilmesi firmaya ayrı bir ödeme yapılmasını gerektirir.</p>
    <p>${esc(hitap)}, ürün/cihaz durumlarının, karşılaşılan anormalliklerin ve alınan düzeltici tedbirlerin kaydedildiği bir sicil defteri tutmak zorundadır.</p>
    <p>${esc(hitap)}, bu sözleşme kapsamında olan ürün/cihazlara hiçbir zarar vermeyeceğini, kullanırken ve günlük bakım yaparken ürünleri hasardan koruyacağını, bizzat veya üçüncü firmalarca BUVİSAN'ın onayını almadan herhangi bir teknik müdahale, eklenti veya bağlantıda bulunulmayacağını taahhüt eder.</p>
    <p>BUVİSAN'ın bu sözleşmenin getirdiği yükümlülükleri yerine getirebilmesi için ${esc(hitap)}, ürünleri yeterli süreler için teknisyenlerin/mühendislerin denetimine tahsis edecektir. Firma, periyodik bakıma gelmeden en az kırk sekiz saat önce ${esc(hitap)}'ı arayarak randevu alacaktır. Eğer ürünler acil nedenlerle Madde 4'te bahsedilen bakım ziyaretleri için tahsis edilemeyecekse, firmaya en az üç gün önceden haber verilecektir. Bu durumda planlanmış ziyaretten sonra yedi gün geçmeden bir alternatif tarihte anlaşmaya varılır.</p>
    <p>Periyodik kontrol yapılacak sahanın ${tip === "asansör" ? "asansör" : "vinç"} kurulumuna uygun hale getirilmesi ve İSG (İş Sağlığı ve Güvenliği) için gerekli güvenlik önlemleri müşteri tarafından sağlanacaktır.</p>
    <p>Yemek saatleri içerisinde firmada çalışma yapılıyorsa, yemek firma tarafından karşılanmalıdır.</p>
  </div>

  <!-- 6 -->
  <div class="madde">
    <div class="madde-bas"><div class="madde-no">6</div><h2>Sistemin Çalışır Durumda Tutulması</h2></div>
    <p>BUVİSAN, ${esc(hitap)}'nın ürünleri sürekli kullanabilmesi için çalışır durumda tutmakla yükümlüdür. Bu nedenle gerekli ve önemli yedek parçaları kendi servis merkezinde stoklar. Üretici firmaların gerekli parçaları sağlayamamasından BUVİSAN sorumlu değildir. Üründeki arıza yurt dışından bir parça getirmeyi gerektirdiğinde BUVİSAN bu işlemi yazılı siparişin onaylanmasını takiben mümkün olduğu en kısa zamanda yerine getirir.</p>
  </div>

  <!-- 7 -->
  <div class="madde">
    <div class="madde-bas"><div class="madde-no">7</div><h2>Sistemin Durumu</h2></div>
    <p>Sözleşmenin yürürlüğe girdiği tarihte ürünün normal çalışır durumda olması gerekir. Ürün için verilen garanti süresi dolduktan sonra sözleşme tarihine kadar bir ara dönem geçmiş ve eskimiş parçalar var ise BUVİSAN ürünü normal çalışır hale getirmek için ek bir ücret talep edebilir. BUVİSAN yaptığı teklifin kabulünden sonra ürünün bakımını yapar ve ürünü çalışır vaziyette teslim eder. BUVİSAN bakımını olanaksız gördüğü üniteleri ${esc(hitap)}'nın yetkili elemanlarının onayını almak suretiyle sözleşme kapsamı dışında tutabilir. ${esc(hitap)} ücreti kendisine ait olmak üzere bu üniteleri değiştirme hakkına sahiptir.</p>
  </div>

  <!-- 8 -->
  <div class="madde">
    <div class="madde-bas"><div class="madde-no">8</div><h2>Sözleşme Süresi</h2></div>
    <p>Bu sözleşme imza tarihinden itibaren sözleşmenin birinci sayfasında yazılı süre için geçerlidir. ${esc(hitap)}'nın uzatma isteği durumunda koşulları yeniden görüşülmek üzere yenilenir, otomatik olarak uzatılmaz. Taraflar bu sözleşmenin birinci sayfasında yazılı adreslerini kanuni ikametgah kabul etmiş olup, vaki olacak adres değişikliklerinin bir hafta içerisinde yazılı olarak diğer tarafa bildirilmemesi halinde sözleşmede yazılı adrese yapılacak her türlü tebligatın muteber olacağını şimdiden kabul etmişlerdir.</p>
    <p>Eğer taraflardan birisi bu sözleşme gereği olan yükümlülüklerini yerine getirmez ise, diğer tarafa hatasını taahhütlü mektupla bildirmesinden bir ay sonra ve bu süre içerisinde de düzeltici/yapıcı bir önlem alınmadığı takdirde sözleşme fesih edilmiş sayılacaktır.</p>
  </div>

  <!-- 9 -->
  <div class="madde">
    <div class="madde-bas"><div class="madde-no">9</div><h2>Sigorta</h2></div>
    <p>Ürünün kaybolması ve zarara uğraması hallerinden BUVİSAN sorumlu değildir. Herhangi bir hasara karşı ürünün sigortalanmasından ${esc(hitap)} sorumludur. Şirket merkezine veya BUVİSAN'dan ${esc(hitap)}'a yapılacak sevkiyatlarda ürünler ${esc(hitap)} tarafından sigortalanır.</p>
  </div>

  <!-- 10 -->
  <div class="madde">
    <div class="madde-bas"><div class="madde-no">10</div><h2>Taahhütlerin Yerine Getirilmesi ve Force Major</h2></div>
    <p>Üründe kasıtlı veya yetersiz altyapı, topraklama, yanlış kullanım, elektrik kontağı gibi doğabilecek her türlü teknik arızalar, grev, lokavt, işçi hareketleri ve siyasal olaylar gibi hallerde veya uluslararası FORCE MAJOR tanımlarına uygun nedenlerden ötürü BUVİSAN bu sözleşmede taahhüt ettiği yükümlülükleri yerine getiremediği takdirde bunun sorumluluğu kendisine ait değildir. ${esc(hitap)}, BUVİSAN'dan hak talep edemez.</p>
  </div>

  <!-- 11 -->
  <div class="madde">
    <div class="madde-bas"><div class="madde-no">11</div><h2>Devredilemezlik</h2></div>
    <p>Bu sözleşme BUVİSAN ile ${esc(hitap)} arasında düzenlenmiş olup, şirket topluluğu dışındaki üçüncü bir şahıs veya firmaya devredilemez. İki taraf da sorumluluklardan ve haklardan vazgeçemez.</p>
  </div>

  <!-- 12 -->
  <div class="madde">
    <div class="madde-bas"><div class="madde-no">12</div><h2>İhtilaf Durumu</h2></div>
    <p>Bu sözleşme üzerinde doğabilecek ihtilaflarda Bursa Mahkemeleri ve İcra Daireleri yetkilidir.</p>
  </div>

  <!-- 13 -->
  <div class="madde">
    <div class="madde-bas"><div class="madde-no">13</div><h2>Yürürlük</h2></div>
    <p>İşbu sözleşme ${esc(basla)} tarihinde iki nüsha olarak tanzim edilmiş olup okunup imza altına alınmıştır. İşbu sözleşme toplam 4 sayfadan oluşmaktadır.</p>
  </div>

  <!-- İMZALAR -->
  <div class="imza-baslik">İmza Bölümü</div>
  <div class="imza">
    <div class="imza-k">
      <div class="et">BUVİSAN</div>
      <div class="ad">ZM METAL MAKİNA<br>SAN. TİC. LTD. ŞTİ.</div>
      <div class="imza-cizgi"></div>
    </div>
    <div class="imza-k">
      <div class="et">MÜŞTERİ</div>
      <div class="ad">${esc(firma)}<br>${esc(hitap)}</div>
      <div class="imza-cizgi"></div>
    </div>
  </div>

  </div>

  <!-- ALT -->
  <div class="alt">
    <span><b>BUVİSAN</b> · ZM Metal Makina · 0224 374 00 01</span>
    <span>Sözleşme No: ${esc(sozlesmeNo)}</span>
    <span>www.buvisan.com</span>
  </div>

</div></body></html>`;
}
