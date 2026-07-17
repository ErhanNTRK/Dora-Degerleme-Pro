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

export interface ProposalRow {
  id: string;
  kind: 'custom' | 'saved';
  /** Belgede görünecek satır adı (ör. "Çeşme Oteli Değerlemesi"). Boşsa otomatik üretilir. */
  label: string;
  province: string;
  district: string;
  municipalityFee: number;
  municipalityFeeSource: 'database' | 'manual' | null;
  // --- custom satır alanları ---
  groupId: string;
  subtypeId: string;
  area?: number;
  /** Aynı türden taşınmaz adedi (ör. "Kadıköy'de 2 dükkan" → 2). Tapu sayısı da budur. */
  count: number;
  /** Adet > 1 iken: G1 aynı mahalle / G2 aynı parsel toplu değerleme koşulu. */
  bulkTogether: boolean;
  /** Manuel ücretli alt türler veya kullanıcı ezmesi için satır tutarı (null → motor). */
  manualAmount: number | null;
  /** SPK çapraz uyarıları (Faz 3) ve belge satırı için konum bilgileri. */
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
    area: row.area,
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
  const result = calculate(tariff, buildRowCalculationInput(row, settings));
  return { subtotal: result.subtotal, warnings: result.warnings, result };
}

/** Satırın teklif belgesindeki etiketi (tutarsız kısım). */
export function rowDocumentLabel(row: ProposalRow, tariff: Tariff): string {
  if (row.label.trim()) return withLocation(row.label.trim(), row);
  if (row.kind === 'saved') return withLocation(row.savedTitle ?? 'Değerleme Raporu', row);
  const group = tariff.groups.find((g) => g.id === row.groupId);
  const subtype = group?.subtypes.find((s) => s.id === row.subtypeId);
  const name = [group?.name, subtype?.name].filter(Boolean).join(' — ') || 'Değerleme Hizmeti';
  const countPart = row.count > 1 ? `${row.count} adet ` : '';
  const areaPart = row.area ? ` (${row.area.toLocaleString('tr-TR')} m²)` : '';
  return withLocation(`${countPart}${name}${areaPart} Değerlemesi`, row);
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
