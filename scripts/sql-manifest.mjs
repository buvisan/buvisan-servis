// ----------------------------------------------------------------------------
// SQL DOSYA ENVANTERİ ÜRETİCİ
// ----------------------------------------------------------------------------
//  sql/ klasöründeki dosyaları numarasına göre sıralayıp lib/sql-manifest.json
//  dosyasına yazar. Admin → Sistem ekranı "hangi SQL çalıştı / hangisi bekliyor"
//  karşılaştırmasını bu listeyle yapar.
//
//  KULLANIM: npm run sql:liste
// ----------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';

const kok = process.cwd();
const sqlDir = path.join(kok, 'sql');
const cikti = path.join(kok, 'lib', 'sql-manifest.json');

if (!fs.existsSync(sqlDir)) {
  console.error('sql/ klasörü bulunamadı');
  process.exit(1);
}

const numarasi = (ad) => {
  const n = parseInt(String(ad).split('-')[0], 10);
  return Number.isFinite(n) ? n : 999999;
};

const dosyalar = fs
  .readdirSync(sqlDir)
  .filter((f) => f.toLowerCase().endsWith('.sql'))
  .sort((a, b) => numarasi(a) - numarasi(b) || a.localeCompare(b, 'tr'));

fs.writeFileSync(cikti, JSON.stringify(dosyalar, null, 2) + '\n', 'utf8');

console.log(`${dosyalar.length} SQL dosyası → lib/sql-manifest.json`);
console.log(`ilk: ${dosyalar[0]} · son: ${dosyalar[dosyalar.length - 1]}`);
