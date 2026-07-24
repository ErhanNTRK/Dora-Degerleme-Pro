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
  [/TARLA|BA[ĞG]\b|BAH[ÇC]E|ZEYT[İI]NL[İI]K|F[İI]NDIKLIK|MERA|[ÇC]AYIR/u, 'Tarla / Bağ / Bahçe'],
  [/MESKEN|KONUT|DA[İI]RE|APARTMAN/u, 'Daire (Konut)'],
  [/M[ÜU]STAK[İI]L|K[ÂA]RG[İI]R EV|AH[ŞS]AP EV|\bEV\b/u, 'Müstakil Ev'],
  [/D[ÜU]KKAN|MA[ĞG]AZA|[İI][ŞS]YER[İI]/u, 'Dükkan'],
  [/OF[İI]S|B[ÜU]RO/u, 'Ofis / Büro'],
  [/FABR[İI]KA|[İI]MALATHANE|ATELYE|AT[ÖO]LYE/u, 'Fabrika'],
  [/DEPO|ANTREPO/u, 'Depo'],
  [/OTEL|MOTEL|PANS[İI]YON/u, 'Otel'],
  [/AKARYAKIT|BENZ[İI]N/u, 'Akaryakıt İstasyonu'],
];

export function guessAliasName(nitelik: string, aliases: ServiceAlias[]): string | null {
  const key = normKey(nitelik);
  if (!key) return null;
  for (const [re, name] of NITELIK_KEYWORDS) {
    if (re.test(key) && aliases.some((a) => a.name === name)) return name;
  }
  // Birebir alias adı yazılmışsa onu kabul et
  const direct = aliases.find((a) => normKey(a.name) === key || normKey(a.documentName) === key);
  return direct ? direct.name : null;
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
