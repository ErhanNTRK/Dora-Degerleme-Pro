/**
 * Çoklu Teklif kompozerinin satır modeli.
 *
 * Her satır SPK anlamında BİR RAPORDUR ve motor (src/engine) satır başına hiç
 * değiştirilmeden çağrılır: rapor başına tapu, belediye harcı, ulaşım, TDUB ve
 * bilgi merkezi ücretleri böylece mevzuata uygun otomatik hesaplanır. Bu modül
 * saf fonksiyonlardan oluşur (React'siz) ve regresyon testlerine tabidir.
 */
import type { Tariff } from '../types/tariff';
import type { CalculationInput, CalculationResult, CalculationSettings, PropertyInput } from '../types/calculation';
import { calculate } from '../engine/calculationEngine';
import { serviceDocumentName, type ServiceAlias } from '../types/serviceAliases';

export interface ProposalRow {
  id: string;
  kind: 'custom' | 'saved';
  /** Belgede görünecek satır adı (ör. "Çeşme Oteli Değerlemesi"). Boşsa otomatik üretilir. */
  label: string;
  province: string;
  district: string;
  municipalityFee: number;
  municipalityFeeSource: 'database' | 'manual' | null;
  /** Uzmanın resmi harcı ezmesi (zam geldi / harç alınmayacak vb.). null/undefined → resmi
   *  veri kullanılır; 0 dahil her sayı geçerli ezmedir. Yalnızca bu satırı etkiler. */
  municipalityFeeOverride?: number | null;
  // --- custom satır alanları ---
  groupId: string;
  subtypeId: string;
  /** Tek taşınmaz veya tüm taşınmazlar aynı alandaysa kullanılan alan. */
  area?: number;
  /** Adet > 1 ve alanlar FARKLIYSA taşınmaz başına m² listesi (uzunluk = count).
   *  Aynı binadaki 50/155/275 m² üç daire TEK RAPOR olarak bu alanla girilir;
   *  motor her taşınmazın dilim ücretini ayrı bulur, toplu değerlemeyi doğru uygular. */
  areas?: number[];
  /** Aynı türden taşınmaz adedi (ör. "Kadıköy'de 2 dükkan" → 2). Tapu sayısı da budur. */
  count: number;
  /** Adet > 1 iken: G1 aynı mahalle / G2 aynı parsel toplu değerleme koşulu. */
  bulkTogether: boolean;
  /** Manuel ücretli alt türler veya kullanıcı ezmesi için satır tutarı (null → motor). */
  manualAmount: number | null;
  /** Rapor başına ücret anahtarları (varsayılan: açık). Kapatmak yalnızca BU satırın
   *  maliyetini etkiler; ör. yol ücreti alınmayacak bir iş için kapatılır. */
  transportFeeEnabled?: boolean;
  unionFeeEnabled?: boolean;
  infoCenterFeeEnabled?: boolean;
  /** Kullanıcının seçtiği sade hizmet adı (görünüm katmanı; hesaplamayı etkilemez). */
  serviceAlias?: string;
  /** UI durumu: SPK grup/tür seçicisi açık mı (alias yerine gelişmiş seçim). Kalıcı değildir. */
  useSpkSelect?: boolean;
  /** SPK çapraz uyarıları ve belge satırı için konum bilgileri. */
  mahalle?: string;
  ada?: string;
  parsel?: string;
  // --- saved satır alanları ---
  savedCalculationId?: string;
  savedSubtotal?: number;
  savedTitle?: string;
}

export function createEmptyRow(tariff: Tariff, id: string): ProposalRow {
  const g = tariff.groups[0];
  return {
    id,
    kind: 'custom',
    label: '',
    province: '',
    district: '',
    municipalityFee: 0,
    municipalityFeeSource: null,
    groupId: g?.id ?? '',
    subtypeId: g?.subtypes[0]?.id ?? '',
    count: 1,
    bulkTogether: true,
    manualAmount: null,
  };
}

/** Satırı motora verilecek tek raporluk hesaplama girdisine çevirir. */
export function buildRowCalculationInput(row: ProposalRow, settings: CalculationSettings): CalculationInput {
  const group = row.groupId;
  const properties: PropertyInput[] = Array.from({ length: Math.max(1, row.count) }, (_, i) => ({
    id: `${row.id}-p${i}`,
    groupId: row.groupId,
    subtypeId: row.subtypeId,
    area: row.areas?.[i] ?? row.area,
    serviceAlias: row.serviceAlias,
    label: `Taşınmaz ${i + 1}`,
    mahalle: row.mahalle,
    ada: row.ada,
    parsel: row.parsel,
    // Toplu değerleme koşulları yalnızca ilgili grupta ve adet > 1 iken anlamlıdır:
    sameNeighborhood: group === 'G1' && row.count > 1 && row.bulkTogether ? true : undefined,
    sameParcel: group === 'G2' && row.count > 1 && row.bulkTogether ? true : undefined,
  }));
  return {
    properties,
    titleDeedCount: Math.max(1, row.count),
    municipalityFee: row.municipalityFee,
    otherFees: [],
    settings,
  };
}

export interface RowComputation {
  /** Satırın müşteri tutarı varsayılanı (raporun Toplam Maliyet'i). */
  subtotal: number;
  warnings: string[];
  result: CalculationResult | null;
}

/** Satırın Toplam Maliyet'ini hesaplar. Motor DEĞİŞTİRİLMEDEN satır başına çağrılır. */
export function computeRow(tariff: Tariff, row: ProposalRow, settings: CalculationSettings): RowComputation {
  if (row.kind === 'saved') {
    return { subtotal: row.savedSubtotal ?? 0, warnings: [], result: null };
  }
  const rowSettings: CalculationSettings = {
    ...settings,
    transportFeeEnabled: row.transportFeeEnabled ?? settings.transportFeeEnabled,
    unionFeeEnabled: row.unionFeeEnabled ?? settings.unionFeeEnabled,
    infoCenterFeeEnabled: row.infoCenterFeeEnabled ?? settings.infoCenterFeeEnabled,
  };
  const result = calculate(tariff, buildRowCalculationInput(row, rowSettings));
  return { subtotal: result.subtotal, warnings: result.warnings, result };
}

/**
 * Satırın teklif belgesindeki etiketi (tutarsız kısım).
 * Öncelik: kullanıcı etiketi → sade hizmet adı ("2 Adet Dükkan Değerlemesi") → SPK adları.
 * Müşteri SPK kategori adlarını değil gerçek hizmet adını görür.
 */
export function rowDocumentLabel(row: ProposalRow, tariff: Tariff, aliases: ServiceAlias[] = []): string {
  if (row.label.trim()) return withLocation(row.label.trim(), row);
  if (row.kind === 'saved') return withLocation(row.savedTitle ?? 'Değerleme Raporu', row);
  const areaPart = rowAreaText(row);
  const aliasName = serviceDocumentName(aliases, row.serviceAlias, row.count);
  if (aliasName) return withLocation(`${aliasName}${areaPart}`.replace(' Değerlemesi (', ' Değerlemesi ('), row);
  const group = tariff.groups.find((g) => g.id === row.groupId);
  const subtype = group?.subtypes.find((s) => s.id === row.subtypeId);
  const name = [group?.name, subtype?.name].filter(Boolean).join(' — ') || 'Değerleme Hizmeti';
  const countPart = row.count > 1 ? `${row.count} adet ` : '';
  return withLocation(`${countPart}${name}${areaPart} Değerlemesi`, row);
}

/** Alan gösterimi: tek alan "(145 m²)"; farklı alanlar "(50, 155, 275 m²)"; çoksa toplam. */
function rowAreaText(row: ProposalRow): string {
  const areas = (row.areas ?? []).filter((a) => a > 0);
  if (areas.length > 1) {
    const distinct = new Set(areas);
    if (distinct.size === 1) return ` (${areas.length} × ${areas[0].toLocaleString('tr-TR')} m²)`;
    if (areas.length <= 4) return ` (${areas.map((a) => a.toLocaleString('tr-TR')).join(', ')} m²)`;
    const total = areas.reduce((s, a) => s + a, 0);
    return ` (toplam ${total.toLocaleString('tr-TR')} m²)`;
  }
  return row.area ? ` (${row.area.toLocaleString('tr-TR')} m²)` : '';
}

function withLocation(base: string, row: ProposalRow): string {
  const loc = [row.province, row.district].filter(Boolean).join(' / ');
  const parts: string[] = [];
  if (row.mahalle) parts.push(`${row.mahalle} Mah.`);
  if (row.ada) parts.push(`Ada ${row.ada}`);
  if (row.parsel) parts.push(`Parsel ${row.parsel}`);
  const detail = [loc, parts.join(', ')].filter(Boolean).join(' — ');
  return detail ? `${base} (${detail})` : base;
}

/** Satırın müşteriye yansıyacak nihai tutarı: elle ezilmişse o, değilse motor sonucu. */
export function rowEffectiveAmount(row: ProposalRow, computed: RowComputation): number {
  return row.manualAmount !== null ? row.manualAmount : computed.subtotal;
}

// ---------------------------------------------------------------------------
// SPK çapraz denetimi (satırlar ARASI): farklı satırlara bölünmüş ama tarife
// gereği aynı raporda toplu değerlemeye tabi olması gereken taşınmazları bulur.
// Motor felsefesiyle tutarlı olarak ENGELLEMEZ; görünür uyarı üretir ve uygun
// durumlarda tek dokunuşla birleştirme önerir.
// ---------------------------------------------------------------------------
export interface CrossRowIssue {
  rowIds: string[];
  /** 1'den başlayan satır numaraları (kullanıcıya gösterim için). */
  rowNumbers: number[];
  message: string;
  /** Satırlar aynı tür/alan ise otomatik birleştirilebilir. */
  canMerge: boolean;
}

const norm = (v?: string) => (v ?? '').trim().toLocaleUpperCase('tr');

export function findCrossRowIssues(rows: ProposalRow[]): CrossRowIssue[] {
  const issues: CrossRowIssue[] = [];
  const custom = rows.map((r, i) => ({ r, n: i + 1 })).filter((x) => x.r.kind === 'custom');

  const groupBy = (keyFn: (r: ProposalRow) => string | null) => {
    const map = new Map<string, { r: ProposalRow; n: number }[]>();
    for (const x of custom) {
      const key = keyFn(x.r);
      if (!key) continue;
      map.set(key, [...(map.get(key) ?? []), x]);
    }
    return [...map.values()].filter((g) => g.length > 1);
  };

  // 2. Grup: aynı il/ilçe + aynı ada/parsel → aynı raporda %15 toplu değerleme kuralı
  for (const g of groupBy((r) =>
    r.groupId === 'G2' && r.ada && r.parsel ? ['G2', norm(r.province), norm(r.district), norm(r.ada), norm(r.parsel)].join('|') : null
  )) {
    const sameShape = g.every((x) => x.r.subtypeId === g[0].r.subtypeId);
    issues.push({
      rowIds: g.map((x) => x.r.id),
      rowNumbers: g.map((x) => x.n),
      message: `${g.map((x) => x.n + '.').join(' ve ')} satırlar aynı parsel üzerinde (Ada ${g[0].r.ada}, Parsel ${g[0].r.parsel}). SPK tarifesi gereği aynı raporda toplu değerlemeye (%15) tabidir; tek satırda birleştirilmesi önerilir.`,
      canMerge: sameShape,
    });
  }

  // 1. Grup: aynı il/ilçe + aynı mahalle → aynı raporda %20 toplu değerleme kuralı
  for (const g of groupBy((r) =>
    r.groupId === 'G1' && r.mahalle ? ['G1', norm(r.province), norm(r.district), norm(r.mahalle)].join('|') : null
  )) {
    const sameShape = g.every((x) => x.r.subtypeId === g[0].r.subtypeId);
    issues.push({
      rowIds: g.map((x) => x.r.id),
      rowNumbers: g.map((x) => x.n),
      message: `${g.map((x) => x.n + '.').join(' ve ')} satırlar aynı mahallede (${g[0].r.mahalle}). SPK tarifesi gereği aynı raporda toplu değerlemeye (%20) tabidir; tek satırda birleştirilmesi önerilir.`,
      canMerge: sameShape,
    });
  }

  return issues;
}

/** Uyumlu satırları tek satırda birleştirir: adetler toplanır, toplu değerleme açılır. */
export function mergeRows(rows: ProposalRow[], rowIds: string[]): ProposalRow[] {
  const targets = rows.filter((r) => rowIds.includes(r.id));
  if (targets.length < 2) return rows;
  const first = targets[0];
  // Her satırın taşınmaz başına alanları (areas yoksa area tekrarı) tek listeye toplanır;
  // böylece farklı alanlı taşınmazlar birleşen TEK raporda kendi dilim ücretlerini korur.
  const unitAreas = targets.flatMap((r) => {
    const n = Math.max(1, r.count);
    return r.areas?.length === n ? r.areas : Array.from({ length: n }, () => r.area ?? 0);
  });
  const merged: ProposalRow = {
    ...first,
    count: unitAreas.length,
    areas: unitAreas.every((a) => a === unitAreas[0]) ? undefined : unitAreas,
    area: unitAreas.every((a) => a === unitAreas[0]) ? unitAreas[0] || first.area : undefined,
    bulkTogether: true,
    manualAmount: null, // birleşince tutar motor tarafından yeniden hesaplanmalı
  };
  return rows.filter((r) => !rowIds.includes(r.id) || r.id === first.id).map((r) => (r.id === first.id ? merged : r));
}
