/**
 * Hesaplama motoru (src/engine) regresyon testleri.
 *
 * Amaç: Motorun 2026 SPK tarifesine göre ürettiği tutarların gelecekteki hiçbir
 * değişiklikte bozulmadığını garanti etmek. Beklenen değerler tarifenin kendisinden
 * (public/data/tariff-2026.json) alınmıştır; motor kodu bu testlerde DEĞİŞTİRİLMEZ.
 *
 * Kapsam bilinçli olarak dardır: yalnızca motor. UI testi, E2E, coverage hedefi yoktur.
 */
import { describe, it, expect } from 'vitest';
import tariffJson from '../../public/data/tariff-2026.json';
import type { Tariff } from '../types/tariff';
import type { CalculationInput, PropertyInput } from '../types/calculation';
import { findBracketForArea, resolveSubtypeBaseFee } from './tariffLookup';
import { applyBulkValuation } from './bulkValuationEngine';
import { calculate } from './calculationEngine';

const tariff = tariffJson as unknown as Tariff;

/** Testlerde tekrarı azaltmak için varsayılan ayarlar (tarifedeki standart ücretlerle). */
function defaultSettings() {
  return {
    titleDeedFeePerDeed: 307,
    infoCenterFeePerReport: 176,
    unionFeePerReport: 125,
    transportFeePerReport: 2645.06,
    vatRatePercent: 20,
    infoCenterFeeEnabled: true,
    unionFeeEnabled: true,
    transportFeeEnabled: true,
  };
}

function makeInput(properties: PropertyInput[], overrides: Partial<CalculationInput> = {}): CalculationInput {
  return {
    properties,
    titleDeedCount: properties.length,
    municipalityFee: 0,
    otherFees: [],
    settings: defaultSettings(),
    ...overrides,
  };
}

let idCounter = 0;
function prop(partial: Partial<PropertyInput> & Pick<PropertyInput, 'groupId' | 'subtypeId'>): PropertyInput {
  return { id: `t${++idCounter}`, ...partial };
}

// ---------------------------------------------------------------------------
// 1) Bracket (dilim) seçimi — tariffLookup
// ---------------------------------------------------------------------------
describe('findBracketForArea — dilim sınırları', () => {
  const g1t1 = tariff.groups.find((g) => g.id === 'G1')!.subtypes.find((s) => s.id === 'G1-T1')!.brackets!;

  it('alt sınırda doğru dilimi bulur (1 m² → 17.568)', () => {
    expect(findBracketForArea(g1t1, 1)?.fee).toBe(17568);
  });
  it('üst sınırda doğru dilimi bulur (20.000 m² → 17.568)', () => {
    expect(findBracketForArea(g1t1, 20000)?.fee).toBe(17568);
  });
  it('sınırın bir üstünde sonraki dilime geçer (20.001 m² → 20.232)', () => {
    expect(findBracketForArea(g1t1, 20001)?.fee).toBe(20232);
  });
  it('açık uçlu son dilimi bulur (150.000 m² → 24.051)', () => {
    expect(findBracketForArea(g1t1, 150000)?.fee).toBe(24051);
  });
});

// ---------------------------------------------------------------------------
// 2) Taban ücret çözümleme — standart, türetilmiş, manuel
// ---------------------------------------------------------------------------
describe('resolveSubtypeBaseFee — ücret rejimleri', () => {
  it('G2-T1 standart dilim: 100 m² konut → 16.500', () => {
    expect(resolveSubtypeBaseFee(tariff, 'G2', 'G2-T1', 100)?.fee).toBe(16500);
  });
  it('G2-T2 türetilmiş ücret: G2-T1 × 1.10 (%10 artırım) → 100 m² = 18.150', () => {
    expect(resolveSubtypeBaseFee(tariff, 'G2', 'G2-T2', 100)?.fee).toBe(18150);
  });
  it('G1-T2 arsa: 1.000 m² → 22.479; 1.001 m² → 26.925', () => {
    expect(resolveSubtypeBaseFee(tariff, 'G1', 'G1-T2', 1000)?.fee).toBe(22479);
    expect(resolveSubtypeBaseFee(tariff, 'G1', 'G1-T2', 1001)?.fee).toBe(26925);
  });
  it('alan verilmeden dilimli tür çözümlenemez (null)', () => {
    expect(resolveSubtypeBaseFee(tariff, 'G2', 'G2-T1', undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3) Manuel ücret zorunlu alt türler
// ---------------------------------------------------------------------------
describe('calculate — manuel ücret gerektiren alt türler', () => {
  const manualSubtype = (() => {
    for (const g of tariff.groups) {
      for (const s of g.subtypes) if (s.manualFeeRequired) return { groupId: g.id, subtypeId: s.id };
    }
    throw new Error('Tarifede manuel ücretli alt tür bulunamadı');
  })();

  it('manuel ücret girilmemişse uyarı üretir ve ücret 0 olur', () => {
    const r = calculate(tariff, makeInput([prop({ ...manualSubtype })]));
    expect(r.propertyBreakdowns[0].baseFee).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('manuel ücret girilmişse aynen kullanılır', () => {
    const r = calculate(tariff, makeInput([prop({ ...manualSubtype, manualFee: 42000 })]));
    expect(r.propertyBreakdowns[0].baseFee).toBe(42000);
    expect(r.propertyBreakdowns[0].isManual).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4) Referans grup ücretine göre hesaplanan türler (G9 yüzde, G11 kat)
// ---------------------------------------------------------------------------
describe('calculate — G9 yeniden değerleme ve G11 DAP', () => {
  it('G9-T3 revize rapor: referans ücretin %50si (100 m² G2-T1 → 8.250)', () => {
    const r = calculate(
      tariff,
      makeInput([prop({ groupId: 'G9', subtypeId: 'G9-T3', referenceGroupId: 'G2', referenceSubtypeId: 'G2-T1', referenceArea: 100 })])
    );
    expect(r.propertyBreakdowns[0].baseFee).toBe(8250);
  });
  it('G11-T1 DAP: referans ücretin 5 katı (100 m² G2-T1 → 82.500)', () => {
    const r = calculate(
      tariff,
      makeInput([prop({ groupId: 'G11', subtypeId: 'G11-T1', referenceGroupId: 'G2', referenceSubtypeId: 'G2-T1', referenceArea: 100 })])
    );
    expect(r.propertyBreakdowns[0].baseFee).toBe(82500);
  });
  it('referans seçilmemişse uyarı üretir', () => {
    const r = calculate(tariff, makeInput([prop({ groupId: 'G11', subtypeId: 'G11-T1' })]));
    expect(r.propertyBreakdowns[0].baseFee).toBe(0);
    expect(r.warnings.some((w) => w.includes('DAP'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5) Toplu değerleme (6. Grup kuralı)
// ---------------------------------------------------------------------------
describe('applyBulkValuation — 6. Grup kuralları', () => {
  const g1 = tariff.groups.find((g) => g.id === 'G1')!;
  const g2 = tariff.groups.find((g) => g.id === 'G2')!;

  it('tek aday: indirim uygulanmaz', () => {
    const r = applyBulkValuation(g1, [{ propertyId: 'a', baseFee: 20000 }]);
    expect(r[0].appliedFee).toBe(20000);
    expect(r[0].appliedDiscountPercent).toBeUndefined();
  });
  it('G1: en yüksek ücretli tam, diğerleri %20', () => {
    const r = applyBulkValuation(g1, [
      { propertyId: 'a', baseFee: 17568 },
      { propertyId: 'b', baseFee: 24051 },
    ]);
    const byId = Object.fromEntries(r.map((x) => [x.propertyId, x]));
    expect(byId['b'].appliedFee).toBe(24051); // en büyük → tam
    expect(byId['a'].appliedFee).toBe(3513.6); // 17.568 × 0.20
    expect(byId['a'].appliedDiscountPercent).toBe(20);
  });
  it('G2: en yüksek ücretli tam, diğerleri %15', () => {
    const r = applyBulkValuation(g2, [
      { propertyId: 'a', baseFee: 16500 },
      { propertyId: 'b', baseFee: 16500 },
      { propertyId: 'c', baseFee: 20217 },
    ]);
    const byId = Object.fromEntries(r.map((x) => [x.propertyId, x]));
    expect(byId['c'].appliedFee).toBe(20217);
    expect(byId['a'].appliedFee).toBe(2475); // 16.500 × 0.15
    expect(byId['b'].appliedFee).toBe(2475);
  });
  it('201+ taşınmaz: toplam, sabit tavan 511.500 TL olur', () => {
    const candidates = Array.from({ length: 201 }, (_, i) => ({ propertyId: `p${i}`, baseFee: 16500 }));
    const r = applyBulkValuation(g2, candidates);
    const total = r.reduce((s, x) => s + x.appliedFee, 0);
    expect(total).toBe(511500);
  });
});

describe('calculate — toplu değerleme yalnızca işaretli taşınmazlara uygulanır', () => {
  it('sameNeighborhood işaretli olmayan G1 taşınmazları tam ücret alır', () => {
    const r = calculate(
      tariff,
      makeInput([
        prop({ groupId: 'G1', subtypeId: 'G1-T1', area: 5000 }),
        prop({ groupId: 'G1', subtypeId: 'G1-T1', area: 5000 }),
      ])
    );
    expect(r.propertyBreakdowns.every((b) => b.finalFee === 17568)).toBe(true);
    expect(r.bulkDiscountTotal).toBe(0);
  });
  it('sameNeighborhood işaretli G1 çiftinde ikincisi %20 öder ve bulkDiscountTotal doğru hesaplanır', () => {
    const r = calculate(
      tariff,
      makeInput([
        prop({ groupId: 'G1', subtypeId: 'G1-T1', area: 5000, sameNeighborhood: true }),
        prop({ groupId: 'G1', subtypeId: 'G1-T1', area: 5000, sameNeighborhood: true }),
      ])
    );
    const fees = r.propertyBreakdowns.map((b) => b.finalFee).sort((a, b) => a - b);
    expect(fees).toEqual([3513.6, 17568]);
    expect(r.bulkDiscountTotal).toBe(17568 - 3513.6);
  });
});

// ---------------------------------------------------------------------------
// 6) calculate — toplamların bileşimi (üç tutar modelinin motor tarafı)
// ---------------------------------------------------------------------------
describe('calculate — toplamlar, KDV ve genel toplam', () => {
  it('subtotal = taşınmaz toplamı + tapu + belediye + sabit ücretler + diğer harçlar', () => {
    const r = calculate(
      tariff,
      makeInput([prop({ groupId: 'G2', subtypeId: 'G2-T1', area: 100 })], {
        titleDeedCount: 2,
        municipalityFee: 1500,
        otherFees: [{ id: 'x', description: 'Noter', amount: 800 }],
      })
    );
    const expectedSubtotal = 16500 + 2 * 307 + 1500 + 176 + 125 + 2645.06 + 800;
    expect(r.subtotal).toBeCloseTo(expectedSubtotal, 2);
    expect(r.vatAmount).toBeCloseTo(Math.round(expectedSubtotal * 0.2 * 100) / 100, 2);
    expect(r.grandTotal).toBeCloseTo(r.subtotal + r.vatAmount, 2);
  });

  it('kapatılan sabit ücretler (bilgi merkezi/TDUB/ulaşım) toplama girmez', () => {
    const settings = { ...defaultSettings(), infoCenterFeeEnabled: false, unionFeeEnabled: false, transportFeeEnabled: false };
    const r = calculate(tariff, makeInput([prop({ groupId: 'G2', subtypeId: 'G2-T1', area: 100 })], { titleDeedCount: 0, settings }));
    expect(r.infoCenterFee).toBe(0);
    expect(r.unionFee).toBe(0);
    expect(r.transportFee).toBe(0);
    expect(r.subtotal).toBe(16500);
  });

  it('Asgari Hizmet Bedeli = taşınmaz finalFee toplamı (harçlardan bağımsız)', () => {
    const r = calculate(
      tariff,
      makeInput([prop({ groupId: 'G2', subtypeId: 'G2-T1', area: 100 }), prop({ groupId: 'G1', subtypeId: 'G1-T2', area: 500 })], {
        municipalityFee: 9999,
      })
    );
    const ahb = r.propertyBreakdowns.reduce((s, b) => s + b.finalFee, 0);
    expect(ahb).toBe(16500 + 22479);
    // Belediye harcı AHB'yi değil yalnızca subtotal'ı etkiler:
    expect(r.subtotal).toBeCloseTo(ahb + 9999 + 307 * 2 + 176 + 125 + 2645.06, 2);
  });
});
