/** computeSmartGroup — tebliğe uygun alt küme goldenleri (gerçek 2026 tarifesiyle). */
import { describe, it, expect } from 'vitest';
import tariffJson from '../../public/data/tariff-2026.json';
import type { Tariff } from '../types/tariff';
import type { CalculationSettings } from '../types/calculation';
import { calculate } from '../engine/calculationEngine';
import { computeSmartGroup } from './smartGroupCost';
import type { ImportRow } from './excelImport';
import { DEFAULT_SERVICE_ALIASES } from '../types/serviceAliases';

const tariff = tariffJson as unknown as Tariff;
const A = DEFAULT_SERVICE_ALIASES;
const S: CalculationSettings = {
  titleDeedFeePerDeed: 500, infoCenterFeePerReport: 300, unionFeePerReport: 400,
  transportFeePerReport: 1000, vatRatePercent: 20,
  infoCenterFeeEnabled: true, unionFeeEnabled: true, transportFeeEnabled: true,
};
const row = (p: Partial<ImportRow>): ImportRow => ({
  id: p.id ?? 'r', il: 'İSTANBUL', ilce: 'KADIKÖY', mahalle: '', ada: '', parsel: '',
  nitelik: '', alan: undefined, aliasName: null, groupKey: '', ...p,
});

/** Referans: aynı taşınmaz kümesini motorla tek başına hesaplar (yalnız asgari bedel). */
function refServiceFee(groupId: string, subtypeId: string, areas: number[], together: boolean): number {
  const res = calculate(tariff, {
    properties: areas.map((a, i) => ({
      id: `p${i}`, groupId, subtypeId, area: a,
      sameNeighborhood: groupId === 'G1' && together && areas.length > 1 ? true : undefined,
      sameParcel: groupId === 'G2' && together && areas.length > 1 ? true : undefined,
    })),
    titleDeedCount: 0, municipalityFee: 0, otherFees: [],
    settings: { ...S, titleDeedFeePerDeed: 0, transportFeeEnabled: false, unionFeeEnabled: false, infoCenterFeeEnabled: false },
  });
  return res.minimumServiceFeeSubtotal - res.bulkDiscountTotal;
}

describe('computeSmartGroup — Salih kuralları', () => {
  it("Kadıköy örneği: Caferağa 5 + Moda 3 TEK rapor; indirim MAHALLE alt kümelerinde", () => {
    const arsa = A.find((a) => a.name === 'Arsa')!;
    const rows = [
      ...[1000, 900, 800, 700, 600].map((a, i) => row({ id: `c${i}`, mahalle: 'CAFERAĞA', alan: a })),
      ...[500, 450, 400].map((a, i) => row({ id: `m${i}`, mahalle: 'MODA', alan: a })),
    ];
    const c = computeSmartGroup(tariff, rows, arsa, S, {
      municipalityFee: 4000, titleDeedCount: 8,
      transportEnabled: true, unionEnabled: true, infoCenterEnabled: true,
    })!;
    expect(c.subsetCount).toBe(2);
    const expected = refServiceFee('G1', arsa.subtypeId, [1000, 900, 800, 700, 600], true)
                   + refServiceFee('G1', arsa.subtypeId, [500, 450, 400], true);
    expect(c.serviceSubtotal).toBeCloseTo(expected, 2);
    // İndirim gerçekten uygulanmış (indirimsiz toplamdan küçük)
    const noDiscount = refServiceFee('G1', arsa.subtypeId, [1000, 900, 800, 700, 600], false)
                     + refServiceFee('G1', arsa.subtypeId, [500, 450, 400], false);
    expect(c.serviceSubtotal).toBeLessThan(noDiscount);
    // Rapor tekleri BİR KEZ; tapu 8 adet
    expect(c.transportFee).toBe(1000);
    expect(c.unionFee).toBe(400);
    expect(c.infoCenterFee).toBe(300);
    expect(c.titleDeedTotal).toBe(8 * 500);
    expect(c.municipalityFee).toBe(4000);
    expect(c.subtotal).toBeCloseTo(c.serviceSubtotal + 4000 + 1000 + 400 + 300 + 4000, 2);
    expect(c.grandTotal).toBeCloseTo(c.subtotal * 1.20, 2);
  });

  it('Alaçatı örneği: aynı ada/parseldeki 3 bağımsız bölüm G2 ada/parsel kümesinde indirimlenir', () => {
    const daire = A.find((a) => a.name === 'Daire (Konut)')!;
    const rows = [120, 110, 100].map((a, i) =>
      row({ id: `a${i}`, ilce: 'ÇEŞME', mahalle: 'ALAÇATI', ada: '4245', parsel: '1', alan: a }));
    const c = computeSmartGroup(tariff, rows, daire, S, {
      municipalityFee: 0, titleDeedCount: 3,
      transportEnabled: true, unionEnabled: false, infoCenterEnabled: true,
    })!;
    expect(c.subsetCount).toBe(1);
    expect(c.serviceSubtotal).toBeCloseTo(refServiceFee('G2', daire.subtypeId, [120, 110, 100], true), 2);
    expect(c.unionFee).toBe(0);              // kapatılan kalem gerçekten 0
  });

  it('farklı parsellerdeki bağımsız bölümler indirim almaz (ayrı alt kümeler)', () => {
    const daire = A.find((a) => a.name === 'Daire (Konut)')!;
    const rows = [
      row({ id: 'x1', ada: '10', parsel: '1', alan: 120 }),
      row({ id: 'x2', ada: '11', parsel: '2', alan: 120 }),
    ];
    const c = computeSmartGroup(tariff, rows, daire, S, {
      municipalityFee: 0, titleDeedCount: 2,
      transportEnabled: false, unionEnabled: false, infoCenterEnabled: false,
    })!;
    expect(c.subsetCount).toBe(2);
    expect(c.bulkDiscountTotal).toBe(0);
    expect(c.serviceSubtotal).toBeCloseTo(2 * refServiceFee('G2', daire.subtypeId, [120], false), 2);
  });

  it('tapu adedi taşınmaz sayısından bağımsız ezilebilir (TAKBİS kuralı)', () => {
    const arsa = A.find((a) => a.name === 'Arsa')!;
    const rows = [row({ id: 't1', mahalle: 'X', alan: 500 })];
    const c = computeSmartGroup(tariff, rows, arsa, S, {
      municipalityFee: 0, titleDeedCount: 3,   // 1 taşınmaz, 3 TAKBİS
      transportEnabled: false, unionEnabled: false, infoCenterEnabled: false,
    })!;
    expect(c.titleDeedTotal).toBe(3 * 500);
  });
});
