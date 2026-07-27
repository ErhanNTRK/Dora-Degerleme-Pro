/**
 * TOPLU EXCEL İÇE AKTARMA — ÇEKİRDEK (saf fonksiyonlar, React'siz)
 *
 * Amaç: Ofise gelen taşınmaz listesi Excel'ini okuyup (İL / İLÇE / MAHALLE /
 * ADA / PARSEL / TAPU NİTELİĞİ [+ ALAN]) SPK anlamında RAPORLARA gruplamak ve
 * mevcut Çoklu Teklif kompozerinin satır modeline (ProposalRow) çevirmek.
 *
 * İlkeler (proje kuralları):
 *  - src/engine'e DOKUNULMAZ; ücretler mevcut motorla, satır başına hesaplanır.
 *  - Bu modül yalnızca veri hazırlar: gruplama bir ÖNERİDİR, kullanıcı arayüzde
 *    her satırı başka rapora taşıyabilir, türünü ve alanını değiştirebilir.
 *  - Arsa/Tarla (G1) raporlarına belediye harcı uygulanmaz; diğerlerinde ilçe
 *    kaydından gelir (yoksa 0 + elle giriş).
 */
import type { ServiceAlias } from '../types/serviceAliases';
import type { ProposalRow } from '../proposal/multiProposalRows';

/** Çoklu Teklif taslağının localStorage anahtarı — tek doğruluk kaynağı burasıdır. */
export const MULTI_PROPOSAL_DRAFT_KEY = 'dora-multi-proposal-draft-v1';

/* ─────────────────── 1) Kolon algılama ─────────────────── */
export type ImportField = 'il' | 'ilce' | 'mahalle' | 'ada' | 'parsel' | 'nitelik' | 'alan';

const HEADER_PATTERNS: Record<ImportField, RegExp[]> = {
  il: [/^il(i)?$/, /^şehir$/],
  ilce: [/^ilçe(si)?$/, /^ilce(si)?$/],
  mahalle: [/^mah(alle)?(si)?(\s*\/\s*köy)?$/, /^köy$/, /^mahalle\s*\/\s*köy$/],
  ada: [/^ada(\s*no)?$/],
  parsel: [/^parsel(\s*no)?$/],
  nitelik: [/niteli/, /^cins(i)?$/, /^tapu\s*cinsi$/, /vasf|vasıf/, /kullanım/],
  alan: [/alan/, /yüzölçüm/, /^m2$/, /^m²$/, /metrekare/],
};

const norm = (s: unknown): string => String(s ?? '').trim();
const normKey = (s: unknown): string =>
  norm(s).toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ');
/** Başlık karşılaştırması: Türkçe küçük harfe indirger (İ→i, I→ı) — 'İL' vb. doğru eşleşir. */
const normHeader = (s: unknown): string =>
  norm(s).toLocaleLowerCase('tr-TR').replace(/\u0307/g, '').replace(/\s+/g, ' ');

/** Başlık satırından kolon indekslerini algılar. Bulunamayanlar -1 döner. */
export function detectColumns(headerRow: unknown[]): Record<ImportField, number> {
  const out: Record<ImportField, number> = { il: -1, ilce: -1, mahalle: -1, ada: -1, parsel: -1, nitelik: -1, alan: -1 };
  headerRow.forEach((cell, idx) => {
    const h = normHeader(cell);
    if (!h) return;
    (Object.keys(HEADER_PATTERNS) as ImportField[]).forEach((field) => {
      if (out[field] !== -1) return;
      if (HEADER_PATTERNS[field].some((re) => re.test(h))) out[field] = idx;
    });
  });
  return out;
}

/* ─────────────────── 2) Satır modeli ─────────────────── */
export interface ImportRow {
  id: string;
  il: string;
  ilce: string;
  mahalle: string;
  ada: string;
  parsel: string;
  nitelik: string;
  /** m² — Excel'de varsa */
  alan?: number;
  /** Önerilen hizmet türü (serviceAliases adı); kullanıcı değiştirebilir. */
  aliasName: string | null;
  /** Kullanıcının satırı atadığı rapor grubu anahtarı. */
  groupKey: string;
  /** v2: konum bilgisi üst satırdan miras alındı (devam satırı) */
  inherited?: boolean;
  /** v2: fuzzy düzeltme açıklaması ("il: \"istanbul\"→İSTANBUL") */
  fuzzyNote?: string;
}

/** Türkçe sayı toleranslı m² ayrıştırma ("1.830,40" / "1830.4" / "1830"). */
export function parseArea(v: unknown): number | undefined {
  const s = norm(v).replace(/m²|m2/gi, '').trim();
  if (!s) return undefined;
  let cleaned = s;
  if (s.includes(',')) cleaned = s.replace(/\./g, '').replace(',', '.');            // TR: 1.830,40
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) cleaned = s.replace(/\./g, '');         // TR binlik: 1.000
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/* ─────────────────── 3) Nitelik → hizmet türü önerisi ─────────────────── */
/** Anahtar kelime → alias adı. Emin olunamayan nitelikler null bırakılır (kullanıcı seçer). */
const NITELIK_KEYWORDS: [RegExp, string][] = [
  [/ARSA/u, 'Arsa'],
  [/TARLA|BA[ĞG](?![A-PR-VYZÇĞİÖŞÜ])|BAH[ÇC]E|ZEYT[İI]NL[İI]K|F[İI]NDIKLIK|MERA|[ÇC]AYIR/u, 'Tarla / Bağ / Bahçe'],
  [/MESKEN|KONUT|DA[İI]RE|APARTMAN/u, 'Daire (Konut)'],
  [/M[ÜU]STAK[İI]L|K[ÂA]RG[İI]R EV|AH[ŞS]AP EV|\bEV\b/u, 'Müstakil Ev'],
  [/D[ÜU]KKAN|MA[ĞG]AZA|[İI][ŞS]YER[İI]/u, 'Dükkan'],
  [/OF[İI]S|B[ÜU]RO/u, 'Ofis / Büro'],
  [/FABR[İI]KA|[İI]MALATHANE|ATELYE|AT[ÖO]LYE/u, 'Fabrika'],
  [/DEPO|ANTREPO/u, 'Depo'],
  [/OTEL|MOTEL|PANS[İI]YON/u, 'Otel'],
  [/AKARYAKIT|BENZ[İI]N/u, 'Akaryakıt İstasyonu'],
];

/** Yazım hatalı nitelikler için kelime sözlüğü (fuzzy hedefleri). */
const NITELIK_LEXICON: [string, string][] = [
  ['arsa', 'Arsa'], ['tarla', 'Tarla / Bağ / Bahçe'], ['bahçe', 'Tarla / Bağ / Bahçe'],
  ['zeytinlik', 'Tarla / Bağ / Bahçe'], ['mesken', 'Daire (Konut)'], ['daire', 'Daire (Konut)'],
  ['konut', 'Daire (Konut)'], ['villa', 'Müstakil Ev'], ['müstakil', 'Müstakil Ev'],
  ['dükkan', 'Dükkan'], ['mağaza', 'Dükkan'], ['işyeri', 'Dükkan'],
  ['ofis', 'Ofis / Büro'], ['büro', 'Ofis / Büro'], ['fabrika', 'Fabrika'],
  ['depo', 'Depo'], ['antrepo', 'Depo'], ['otel', 'Otel'], ['pansiyon', 'Otel'],
  ['akaryakıt', 'Akaryakıt İstasyonu'],
];

export function guessAliasName(nitelik: string, aliases: ServiceAlias[]): string | null {
  const key = normKey(nitelik);
  if (!key) return null;
  for (const [re, name] of NITELIK_KEYWORDS) {
    if (re.test(key) && aliases.some((a) => a.name === name)) return name;
  }
  // Birebir alias adı yazılmışsa onu kabul et
  const direct = aliases.find((a) => normKey(a.name) === key || normKey(a.documentName) === key);
  if (direct) return direct.name;
  // Fuzzy: "TARLLLA"→tarla, "OFŞS"→ofis — kelime kelime, belirsizlikte dayatma yok
  const words = NITELIK_LEXICON.map(([w]) => w);
  for (const token of trFold(nitelik).split(' ')) {
    if (token.length < 3) continue;
    const m = fuzzyMatch(token, words, 2);
    if (m) {
      const hit = NITELIK_LEXICON.find(([w]) => w === m.name)!;
      if (aliases.some((a) => a.name === hit[1])) return hit[1];
    }
  }
  return null;
}

/** Arsa/Tarla (G1) raporlarında belediye harcı uygulanmaz. */
export function isArsaTarla(aliasName: string | null, aliases: ServiceAlias[]): boolean {
  if (!aliasName) return false;
  const a = aliases.find((x) => x.name === aliasName);
  return a?.groupId === 'G1';
}

/* ─────────────────── 4) Ham tablo → satırlar ─────────────────── */
export function rowsFromSheet(
  data: unknown[][], cols: Record<ImportField, number>, aliases: ServiceAlias[],
): ImportRow[] {
  const get = (row: unknown[], f: ImportField) => (cols[f] >= 0 ? norm(row[cols[f]]) : '');
  const out: ImportRow[] = [];
  data.forEach((row, i) => {
    const il = get(row, 'il'), ilce = get(row, 'ilce'), mahalle = get(row, 'mahalle');
    const ada = get(row, 'ada'), parsel = get(row, 'parsel'), nitelik = get(row, 'nitelik');
    // Tamamen boş satırları atla
    if (!il && !ilce && !mahalle && !ada && !parsel && !nitelik) return;
    const aliasName = guessAliasName(nitelik, aliases);
    out.push({
      id: `xls-${i}`,
      il, ilce, mahalle, ada, parsel, nitelik,
      alan: cols.alan >= 0 ? parseArea(row[cols.alan]) : undefined,
      aliasName,
      groupKey: '',   // suggestGroups doldurur
    });
  });
  return out;
}

/* ─────────────────── 5) Rapor gruplama önerisi ─────────────────── */
/**
 * Aynı raporda olma önerisi: aynı İL + İLÇE + MAHALLE + hizmet türü tek rapordur
 * (SPK toplu değerleme kuralları da tür grubu içinde satır başına motorca uygulanır).
 * Türü tanınamayan satırlar kendi "tanımsız" kümesinde toplanır ki gözden kaçmasın.
 */
export function suggestGroups(rows: ImportRow[]): ImportRow[] {
  return rows.map((r) => ({
    ...r,
    groupKey: [normKey(r.il), normKey(r.ilce), normKey(r.mahalle), r.aliasName ?? '??'].join('|'),
  }));
}

export interface ReportGroup {
  key: string;
  il: string;
  ilce: string;
  mahalle: string;
  aliasName: string | null;
  rows: ImportRow[];
}

export function groupList(rows: ImportRow[]): ReportGroup[] {
  const map = new Map<string, ReportGroup>();
  for (const r of rows) {
    const g = map.get(r.groupKey);
    if (g) { g.rows.push(r); continue; }
    map.set(r.groupKey, { key: r.groupKey, il: r.il, ilce: r.ilce, mahalle: r.mahalle, aliasName: r.aliasName, rows: [r] });
  }
  return [...map.values()];
}

/* ─────────────────── 6) Grup → ProposalRow ─────────────────── */
export interface FeeLookup {
  (province: string, district: string): number | null;
}

export function groupToProposalRow(
  g: ReportGroup, aliases: ServiceAlias[], feeLookup: FeeLookup, id: string,
): ProposalRow {
  const alias = g.aliasName ? aliases.find((a) => a.name === g.aliasName) : undefined;
  const arsaTarla = alias?.groupId === 'G1';
  const areas = g.rows.map((r) => r.alan);
  const allAreas = areas.every((a): a is number => a !== undefined && a > 0);
  const sameArea = allAreas && areas.every((a) => a === areas[0]);
  const dbFee = arsaTarla ? null : feeLookup(g.il, g.ilce);
  const adaParsel = g.rows
    .map((r) => [r.ada, r.parsel].filter(Boolean).join('/'))
    .filter(Boolean).join(', ');

  return {
    id,
    kind: 'custom',
    label: '',
    province: g.il,
    district: g.ilce,
    municipalityFee: arsaTarla ? 0 : (dbFee ?? 0),
    municipalityFeeSource: arsaTarla ? null : (dbFee != null ? 'database' : 'manual'),
    groupId: alias?.groupId ?? '',
    subtypeId: alias?.subtypeId ?? '',
    count: g.rows.length,
    // Alanlar farklıysa taşınmaz başına liste; hepsi aynıysa tek alan
    area: allAreas && sameArea ? areas[0] : (g.rows.length === 1 ? areas[0] : undefined),
    areas: allAreas && !sameArea && g.rows.length > 1 ? (areas as number[]) : undefined,
    bulkTogether: true,
    manualAmount: null,
    serviceAlias: alias?.name,
    mahalle: g.mahalle || undefined,
    ada: adaParsel || undefined,
    parsel: undefined,   // ada alanında "ada/parsel" birleşik yazıldı
  };
}

/* ═══════════════════ v2 — AKILLI ALGILAMA KATMANI ═══════════════════
   Gerçek müşteri dosyalarından çıkan kurallar: başlık satırı 2.-3. satırda
   olabilir, üstünde müşteri unvanı bulunabilir, ADA/PARSEL tek kolonda
   ("1343/151", "__/4544", "-/528"), hücrede "Eski 0 Yeni 2344" deseni,
   nitelik metninde gömülü m² ("741,00 m2 arsa"), devam satırlarında boş
   konum hücreleri (fill-down), il/ilçe adlarında yazım hataları (fuzzy). */
import { fuzzyMatch, trFold } from './fuzzy';

export interface SmartContext {
  /** Resmi il adları (il-ilce-database'den) */
  provinces: string[];
  /** İl adı (katlanmış) → o ilin ilçe adları */
  districtsByProvince: Map<string, string[]>;
  /** Tüm ilçe adları (il bilinmiyorken tarama için) */
  allDistricts: string[];
  /** Mahalle sözlüğü: katlanmış mahalle adı → aday "İL|İLÇE" kümeleri.
   *  Opsiyonel (mahalle-database.json yoksa boş bırakılır). */
  quarterIndex?: Map<string, { il: string; ilce: string }[]>;
}

export interface SmartParseResult {
  headerRowIndex: number;          // 0 tabanlı, veri dizisi içinde
  customerName: string;            // başlık öncesi yakalanan unvan adayı ('' olabilir)
  cols: Record<ImportField, number>;
  rows: ImportRow[];
  notes: string[];                 // "ilçe yok → aynı mahalle varsayıldı" gibi genel notlar
}

/** Satırın başlık olma puanı: tanınan alan sayısı. */
function headerScore(row: unknown[]): number {
  const det = detectColumns(row);
  return (Object.values(det) as number[]).filter((v) => v >= 0).length;
}

/** İlk maxScan satırda en yüksek puanlı satırı başlık kabul eder. */
export function findHeaderRow(data: unknown[][], maxScan = 15): { index: number; score: number } {
  let best = { index: 0, score: -1 };
  for (let i = 0; i < Math.min(data.length, maxScan); i++) {
    const sc = headerScore(data[i] ?? []);
    if (sc > best.score) best = { index: i, score: sc };
  }
  return best;
}

/** Başlık satırından ÖNCEKİ dolu metin satırından müşteri unvanı adayı çıkarır. */
export function extractCustomerName(data: unknown[][], headerIndex: number): string {
  for (let i = headerIndex - 1; i >= 0; i--) {
    const cells = (data[i] ?? []).map((c) => norm(c)).filter(Boolean);
    if (!cells.length) continue;
    const text = cells.join(' ').replace(/\s+/g, ' ').trim();
    // Tek hücrelik/kısa antet satırı; sayısal liste değilse unvan adayıdır
    if (text.length >= 5 && !/^\d+[\d\s.,/-]*$/.test(text)) return text;
  }
  return '';
}

/** "Eski 0 Yeni 2344" → "2344"; düz değerler aynen döner. */
export function resolveEskiYeni(v: string): string {
  const m = /yeni\s*[:.]?\s*([\w-]+)/i.exec(v);
  return m ? m[1] : v.trim();
}

/** Birleşik "ada/parsel" hücresini böler: "1343/151" → {ada,parsel}; "__/4544", "-/528" → ada boş. */
export function splitAdaParsel(v: string): { ada: string; parsel: string } | null {
  const m = /^\s*([\w_.-]*)\s*[\/\\-]\s*(\d+)\s*$/.exec(v);
  if (!m) return null;
  const ada = /^\d+$/.test(m[1]) ? m[1] : '';
  return { ada, parsel: m[2] };
}

/** Nitelik metnindeki gömülü m²: "741,00 m2 arsa" → 741. */
export function areaFromNitelik(nitelik: string): number | undefined {
  const m = /([\d.,]+)\s*m\s*[²2]/i.exec(nitelik);
  return m ? parseArea(m[1]) : undefined;
}

/** Tapu Türü + nitelik → G2 alt türü önerisi (Salih onaylı kural). */
export function aliasFromTapuTuru(tapuTuru: string, nitelik: string, aliases: ServiceAlias[]): string | null {
  const t = trFold(tapuTuru);
  const konut = /mesken|daire|konut|villa|dubleks|ciftlik|apart|\bev\b/.test(trFold(nitelik));
  if (/kat\s*mulkiyeti|kat\s*irtifaki/.test(t)) {
    return aliases.some((a) => a.subtypeId === 'G2-T1') ? 'Daire (Konut)' : null;
  }
  if (/cins\s*tashih/.test(t) && konut) {
    const a = aliases.find((x) => x.subtypeId === 'G2-T2');
    return a ? a.name : null;
  }
  return null;   // nitelik belirler (mevcut guessAliasName)
}

/** Değer bazlı kolon tahmini: başlık eksik/yanlışken içerikten il-ilçe-nitelik-alan bulur. */
export function detectByValues(
  data: unknown[][], start: number, ctx: SmartContext, existing: Record<ImportField, number>,
): Record<ImportField, number> {
  const out = { ...existing };
  const sample = data.slice(start, start + 25);
  const colCount = Math.max(...sample.map((r) => r.length), 0);
  const provSet = new Set(ctx.provinces.map(trFold));
  const distSet = new Set(ctx.allDistricts.map(trFold));

  const scoreCol = (c: number) => {
    let prov = 0, dist = 0, nit = 0, num = 0, filled = 0, adaparsel = 0, numSum = 0;
    for (const r of sample) {
      const v = norm(r[c]); if (!v) continue;
      filled++;
      const f = trFold(v);
      if (provSet.has(f)) prov++;
      if (distSet.has(f)) dist++;
      if (NITELIK_KEYWORDS.some(([re]) => re.test(normKey(v)))) nit++;
      const a = parseArea(v);
      if (a !== undefined) { num++; numSum += a; }
      if (splitAdaParsel(v)) adaparsel++;
    }
    return { prov, dist, nit, num, filled, adaparsel, numAvg: num ? numSum / num : 0 };
  };

  const scores = Array.from({ length: colCount }, (_, c) => scoreCol(c));
  const used = new Set(Object.values(out).filter((v) => v >= 0));
  const pick = (field: ImportField, metric: (s: ReturnType<typeof scoreCol>) => number, minRatio: number) => {
    if (out[field] >= 0) return;
    let bi = -1, bv = 0;
    scores.forEach((s, c) => {
      if (used.has(c) || !s.filled) return;
      const v = metric(s) / s.filled;
      if (v > bv) { bv = v; bi = c; }
    });
    if (bi >= 0 && bv >= minRatio) { out[field] = bi; used.add(bi); }
  };

  pick('il', (s) => s.prov, 0.6);
  pick('ilce', (s) => s.dist, 0.6);
  pick('nitelik', (s) => s.nit, 0.4);
  pick('ada', (s) => s.adaparsel, 0.6);       // birleşik ada/parsel kolonu ada'ya oturur, sonra bölünür
  // Sıra-numarası kolonu tuzağı: alan adayında ortalama değer anlamlı büyüklükte olmalı
  pick('alan', (s) => (s.numAvg >= 20 ? s.num : 0), 0.6);
  return out;
}

/** v2 tam ayrıştırma: başlık bul → müşteri yakala → kolonlar (başlık + değer) →
 *  satırlar (fill-down, eski/yeni, birleşik ada/parsel, gömülü m², fuzzy il/ilçe). */
export function smartParse(
  data: unknown[][], aliases: ServiceAlias[], ctx: SmartContext,
): SmartParseResult {
  const { index: headerRowIndex, score } = findHeaderRow(data);
  const headerless = score <= 1;
  const header = headerless ? [] : (data[headerRowIndex] ?? []);
  const bodyStart = headerless ? 0 : headerRowIndex + 1;
  let cols = headerless
    ? { il: -1, ilce: -1, mahalle: -1, ada: -1, parsel: -1, nitelik: -1, alan: -1 }
    : detectColumns(header);
  cols = detectByValues(data, bodyStart, ctx, cols);

  // Tapu Türü kolonu: başlıkta "tapu türü / tapu cinsi" ara (nitelikten ayrı)
  let tapuCol = -1;
  header.forEach((h, i) => {
    if (tapuCol === -1 && /tapu\s*(turu|türü|cinsi)/.test(trFold(String(h ?? '')))) tapuCol = i;
  });
  // "Tapu Türü" nitelik olarak yakalandıysa ve ayrıca MAHAL NİTELİĞİ varsa onları ayır
  if (tapuCol !== -1 && cols.nitelik === tapuCol) {
    cols = { ...cols, nitelik: -1 };
    cols = detectByValues(data, bodyStart, ctx, cols);
  }

  const notes: string[] = [];
  const customerName = headerless ? '' : extractCustomerName(data, headerRowIndex);
  const get = (row: unknown[], f: ImportField) => (cols[f] >= 0 ? norm(row[cols[f]]) : '');

  const rows: ImportRow[] = [];
  let last: Partial<ImportRow> = {};
  data.slice(bodyStart).forEach((row, i) => {
    let il = get(row, 'il'), ilce = get(row, 'ilce'), mahalle = get(row, 'mahalle');
    let ada = resolveEskiYeni(get(row, 'ada'));
    let parsel = resolveEskiYeni(get(row, 'parsel'));
    const tapuTuru = tapuCol >= 0 ? norm(row[tapuCol]) : '';
    const nitelik = get(row, 'nitelik');
    let alan = cols.alan >= 0 ? parseArea(row[cols.alan]) : undefined;
    if (alan === undefined && nitelik) alan = areaFromNitelik(nitelik);

    // Birleşik ada/parsel (parsel kolonu yoksa)
    if (ada && !parsel) {
      const sp = splitAdaParsel(ada);
      if (sp) { ada = sp.ada; parsel = sp.parsel; }
    }

    const hasLocation = !!(il || ilce || mahalle);
    const hasContent = !!(ada || parsel || nitelik || tapuTuru || alan !== undefined);
    if (!hasLocation && !hasContent) return;

    // Fill-down: devam satırı boş konumları üstten miras alır
    let inherited = false;
    if (!hasLocation && hasContent && (last.il || last.ilce || last.mahalle)) {
      il = last.il ?? ''; ilce = last.ilce ?? ''; mahalle = last.mahalle ?? '';
      if (!ada && !parsel) { ada = last.ada ?? ''; parsel = last.parsel ?? ''; }
      inherited = true;
    }

    // Fuzzy: il resmi ada bağlanır; ilçe, il biliniyorsa o ilin listesine
    let fuzzyNote = '';
    const ilM = il ? fuzzyMatch(il, ctx.provinces) : null;
    if (ilM && ilM.name !== il) { fuzzyNote += `il: "${il}"→${ilM.name} `; il = ilM.name; }
    const distList = ilM ? (ctx.districtsByProvince.get(trFold(ilM.name)) ?? ctx.allDistricts) : ctx.allDistricts;
    const ilceM = ilce ? fuzzyMatch(ilce, distList) : null;
    if (ilceM && ilceM.name !== ilce) { fuzzyNote += `ilçe: "${ilce}"→${ilceM.name}`; ilce = ilceM.name; }

    // Mahalle sözlüğü: ilçe yoksa mahalleden çöz (tek adaysa; çok adayda dayatma yok)
    if (!ilce && mahalle && ctx.quarterIndex) {
      const cands = ctx.quarterIndex.get(trFold(mahalle))
        ?? (fuzzyMatch(mahalle, [...ctx.quarterIndex.keys()], 1)
            ? ctx.quarterIndex.get(fuzzyMatch(mahalle, [...ctx.quarterIndex.keys()], 1)!.name) : undefined);
      const filtered = il ? cands?.filter((c) => trFold(c.il) === trFold(il)) : cands;
      if (filtered && filtered.length === 1) {
        ilce = filtered[0].ilce;
        if (!il) il = filtered[0].il;
        fuzzyNote = `${fuzzyNote} mahalle sözlüğü: ${mahalle}→${ilce}`.trim();
      } else if (filtered && filtered.length > 1) {
        fuzzyNote = `${fuzzyNote} mahalle birden çok ilçede (${filtered.length} aday) — ilçe seçilmedi`.trim();
      }
    }

    const aliasName = aliasFromTapuTuru(tapuTuru, nitelik, aliases) ?? guessAliasName(nitelik, aliases);

    const r: ImportRow = {
      id: `xls-${bodyStart + i}`,
      il, ilce, mahalle, ada, parsel,
      nitelik: tapuTuru && nitelik ? `${nitelik} · ${tapuTuru}` : (nitelik || tapuTuru),
      alan, aliasName, groupKey: '',
      inherited: inherited || undefined,
      fuzzyNote: fuzzyNote.trim() || undefined,
    };
    rows.push(r);
    last = r;
  });

  if (rows.length && rows.every((r) => !r.ilce)) {
    notes.push('Excel\'de ilçe bilgisi yok: satırlar AYNI MAHALLE varsayımıyla gruplandı (SPK toplu değerleme koşulu sağlanmış sayılır). Yanlışsa satırları ayırın.');
  }
  return { headerRowIndex, customerName, cols, rows: suggestGroupsV2(rows, aliases), notes };
}

/** SAF TEBLİĞ gruplaması (Salih kuralı, 2026-07-26): sistem hiçbir birleştirmeyi
 *  kendiliğinden yapmaz. Yalnız tebliğ koşulu kendiliğinden sağlanıyorsa grup kurar:
 *   - G1 (arsa/tarla): aynı il+ilçe+MAHALLE
 *   - G2 (bağımsız bölüm/müstakil): aynı il+ilçe+ADA/PARSEL
 *   - diğer her şey: TAŞINMAZ BAŞINA AYRI RAPOR (2 fabrika → 2 kart)
 *  Birleştirme kullanıcının hakkıdır (özel rapor). */
export function suggestGroupsV2(rows: ImportRow[], aliases: ServiceAlias[]): ImportRow[] {
  const gid = (r: ImportRow) => aliases.find((a) => a.name === r.aliasName)?.groupId ?? '';
  return rows.map((r) => {
    const g = gid(r);
    const loc = [trFold(r.il), trFold(r.ilce) || `mah:${trFold(r.mahalle)}`].join('|');
    if (g === 'G1' && r.mahalle) return { ...r, groupKey: `g1|${loc}|${trFold(r.mahalle)}` };
    if (g === 'G2' && (r.ada || r.parsel)) return { ...r, groupKey: `g2|${loc}|${r.ada}/${r.parsel}` };
    return { ...r, groupKey: `solo|${r.id}` };
  });
}
