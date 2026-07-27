/**
 * AKILLI GRUP MALİYETİ — tebliğe uygun alt küme hesabı (saf, motor değişmez).
 *
 * Kural (Salih, 2026-07-26): Rapor grubu İLÇE bazlıdır ve geniştir; ama toplu
 * değerleme İNDİRİMİ tebliğdeki koşula göre ALT KÜMELERDE işler:
 *   - Arsa/Tarla (G1): aynı MAHALLE kümesi içinde (en büyük tam, diğerleri %20)
 *   - Bağımsız bölüm (G2): aynı ADA/PARSEL kümesi içinde (en büyük tam, diğerleri %15)
 * Rapor düzeyinde tekler BİR KEZ: belediye harcı, ulaşım, TDUB, bilgi merkezi.
 * Tapu harcı TAPU ADEDİ kadar; adet elle değiştirilebilir (TAKBİS kuralı).
 *
 * Uygulama: her alt küme, mevcut motorla (calculate) rapor-tekleri KAPALI olarak
 * hesaplanır (yalnız asgari hizmet bedeli + kendi indirimi); tekler burada bir
 * kez eklenir. Motor tek satır dahi değiştirilmez.
 */
import type { Tariff } from '../types/tariff';
import type { CalculationSettings, PropertyInput } from '../types/calculation';
import { calculate } from '../engine/calculationEngine';
import type { ServiceAlias } from '../types/serviceAliases';
import { trFold } from './fuzzy';
import type { ImportRow } from './excelImport';

export interface SmartGroupOptions {
  municipalityFee: number;
  titleDeedCount: number;
  transportEnabled: boolean;
  unionEnabled: boolean;
  infoCenterEnabled: boolean;
}

export interface SmartGroupCost {
  serviceSubtotal: number;      // alt kümeler toplamı (indirimler uygulanmış)
  bulkDiscountTotal: number;
  titleDeedTotal: number;
  municipalityFee: number;
  transportFee: number;
  unionFee: number;
  infoCenterFee: number;
  subtotal: number;             // KDV hariç rapor maliyeti
  vatAmount: number;
  grandTotal: number;
  /** Birden fazla indirim alt kümesi oluştu (Caferağa+Moda gibi) */
  subsetCount: number;
  warnings: string[];
}

/** Alt küme anahtarı: G1 → mahalle; G2 → ada/parsel; diğerleri → tek küme. */
function subsetKey(groupId: string, r: ImportRow): string {
  if (groupId === 'G1') return `mah:${trFold(r.mahalle) || '-'}`;
  if (groupId === 'G2') return `ap:${r.ada || '-'}/${r.parsel || '-'}`;
  return 'tek';
}

export function computeSmartGroup(
  tariff: Tariff, rows: ImportRow[], alias: ServiceAlias | undefined,
  settings: CalculationSettings, opts: SmartGroupOptions,
): SmartGroupCost | null {
  if (!alias) return null;
  const groupId = alias.groupId, subtypeId = alias.subtypeId;

  // İndirim alt kümeleri
  const subsets = new Map<string, ImportRow[]>();
  for (const r of rows) {
    const k = subsetKey(groupId, r);
    const arr = subsets.get(k);
    if (arr) arr.push(r); else subsets.set(k, [r]);
  }

  // Alt küme başına: yalnız asgari hizmet bedeli (+ kendi toplu indirimi)
  const subsetSettings: CalculationSettings = {
    ...settings,
    titleDeedFeePerDeed: 0,
    transportFeeEnabled: false,
    unionFeeEnabled: false,
    infoCenterFeeEnabled: false,
  };
  let serviceSubtotal = 0, bulkDiscountTotal = 0;
  const warnings: string[] = [];
  for (const subset of subsets.values()) {
    const properties: PropertyInput[] = subset.map((r, i) => ({
      id: `${r.id}-p${i}`,
      groupId, subtypeId,
      area: r.alan,
      label: [r.mahalle, [r.ada, r.parsel].filter(Boolean).join('/')].filter(Boolean).join(' ') || `Taşınmaz ${i + 1}`,
      mahalle: r.mahalle || undefined,
      ada: r.ada || undefined,
      parsel: r.parsel || undefined,
      sameNeighborhood: groupId === 'G1' && subset.length > 1 ? true : undefined,
      sameParcel: groupId === 'G2' && subset.length > 1 ? true : undefined,
    }));
    const res = calculate(tariff, {
      properties, titleDeedCount: 0, municipalityFee: 0, otherFees: [], settings: subsetSettings,
    });
    serviceSubtotal += res.minimumServiceFeeSubtotal - res.bulkDiscountTotal;   // indirimli tutar
    bulkDiscountTotal += res.bulkDiscountTotal;
    warnings.push(...res.warnings);
  }

  const r2 = (v: number) => Math.round(v * 100) / 100;
  serviceSubtotal = r2(serviceSubtotal);
  const titleDeedTotal = r2(Math.max(0, opts.titleDeedCount) * settings.titleDeedFeePerDeed);
  const transportFee = opts.transportEnabled ? settings.transportFeePerReport : 0;
  const unionFee = opts.unionEnabled ? settings.unionFeePerReport : 0;
  const infoCenterFee = opts.infoCenterEnabled ? settings.infoCenterFeePerReport : 0;
  const municipalityFee = Math.max(0, opts.municipalityFee);

  const subtotal = r2(serviceSubtotal + titleDeedTotal + municipalityFee + transportFee + unionFee + infoCenterFee);
  const vatAmount = r2(subtotal * (settings.vatRatePercent / 100));

  return {
    serviceSubtotal, bulkDiscountTotal: r2(bulkDiscountTotal), titleDeedTotal,
    municipalityFee, transportFee, unionFee, infoCenterFee,
    subtotal, vatAmount, grandTotal: r2(subtotal + vatAmount),
    subsetCount: subsets.size, warnings,
  };
}
