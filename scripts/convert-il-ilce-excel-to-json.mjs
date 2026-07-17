/**
 * Türkiye İl/İlçe Excel dosyasını, uygulamanın okuduğu JSON veri kaynağına dönüştürür.
 *
 * Kullanım:
 *   node scripts/convert-il-ilce-excel-to-json.mjs YOL/YENI_DOSYA.xlsx
 *
 * Beklenen Excel sütunları (ilk satır başlık): KOD, İL, İLÇE, BELEDİYE ÜCRETİ, ...
 * Çıktı: public/data/il-ilce-database.json (uygulama tarafından otomatik okunur, kod değişmez).
 */
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inputPath = process.argv[2];

if (!inputPath) {
  console.error('Kullanım: node scripts/convert-il-ilce-excel-to-json.mjs YOL/DOSYA.xlsx');
  process.exit(1);
}

const TR_ORDER = 'AaBbCcÇçDdEeFfGgĞğHhIıİiJjKkLlMmNnOoÖöPpQqRrSsŞşTtUuÜüVvWwXxYyZz';
function trKey(s) {
  return [...s].map((ch) => {
    const idx = TR_ORDER.indexOf(ch);
    return idx === -1 ? 999 : idx;
  });
}
function trCompare(a, b) {
  const ka = trKey(a);
  const kb = trKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const x = ka[i] ?? -1;
    const y = kb[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

function parseFee(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const workbook = XLSX.readFile(inputPath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

const provincesMap = new Map();
let skipped = 0;

for (const row of rows.slice(1)) {
  const [kod, il, ilce, ucret] = row;
  if (!il || !ilce) {
    skipped++;
    continue;
  }
  const provinceName = String(il).trim();
  const districtName = String(ilce).trim();
  const fee = parseFee(ucret);
  if (!provincesMap.has(provinceName)) provincesMap.set(provinceName, []);
  provincesMap.get(provinceName).push({ code: kod ? String(kod).trim() : null, name: districtName, fee });
}

const provinces = [...provincesMap.keys()]
  .sort(trCompare)
  .map((name) => ({
    name,
    districts: provincesMap.get(name).sort((a, b) => trCompare(a.name, b.name)),
  }));

const output = {
  sourceNote:
    'scripts/convert-il-ilce-excel-to-json.mjs ile yüklenen Excel dosyasından üretilmiştir. Belediye Ücreti boş olan ilçelerde uygulama manuel giriş ister.',
  generatedAt: new Date().toISOString().slice(0, 10),
  provinceCount: provinces.length,
  districtCount: provinces.reduce((sum, p) => sum + p.districts.length, 0),
  provinces,
};

const outPath = path.join(__dirname, '..', 'public', 'data', 'il-ilce-database.json');
fs.writeFileSync(outPath, JSON.stringify(output));

console.log(`İl sayısı: ${output.provinceCount}`);
console.log(`İlçe sayısı: ${output.districtCount}`);
console.log(`Atlanan (boş) satır: ${skipped}`);
console.log(`Yazıldı: ${outPath}`);
console.log('Not: Bu dosyayı güncelledikten sonra "npm run build" ile uygulamayı yeniden derleyin.');
