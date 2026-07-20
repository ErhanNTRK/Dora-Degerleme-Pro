/**
 * Tarife verisi bütünlük testi (golden values).
 *
 * Amaç: public/data/tariff-2026.json'daki KRİTİK sabitleri test koduna pinlemek.
 * Motor testleri "kod doğru hesaplıyor mu"yu, bu dosya ise "veri değişmedi mi"yi korur;
 * böylece veri ve kod aynı anda hatalı değişse bile en az bir test kırılır.
 *
 * NOT: 2027 tarifesi geldiğinde bu değerler BİLİNÇLİ bir commit ile güncellenmelidir —
 * bu, tarife değişikliğinin kazara değil kayıtlı bir karar olmasını garanti eder.
 */
import { describe, it, expect } from 'vitest';
import tariffJson from '../../public/data/tariff-2026.json';
import type { Tariff } from '../types/tariff';

const tariff = tariffJson as unknown as Tariff;

describe('tariff-2026.json — kritik sabitler', () => {
  it('tarife kimliği ve KDV', () => {
    expect(tariff.tariffId).toBe('tariff-2026');
    expect(tariff.tariffYear).toBe(2026);
    expect(tariff.vatRateDefaultPercent).toBe(20);
  });

  it('standart ücretler (Resmî Gazete değerleri)', () => {
    expect(tariff.standardFees.titleDeedFeePerDeed.amount).toBe(307);
    expect(tariff.standardFees.infoCenterFeePerReport.amount).toBe(176);
    expect(tariff.standardFees.unionFeePerReport.amount).toBe(125);
    expect(tariff.standardFees.transportFeePerReport.amount).toBe(2645.06);
  });

  it('grup listesi tam ve sıralı (G6 tarifede ayrı grup değil, toplu değerleme kuralıdır)', () => {
    expect(tariff.groups.map((g) => g.id)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G7', 'G8', 'G9', 'G10', 'G11']);
  });

  it('G1-T1 dilim yapısı birebir', () => {
    const b = tariff.groups.find((g) => g.id === 'G1')!.subtypes.find((s) => s.id === 'G1-T1')!.brackets!;
    expect(b).toEqual([
      { min: 1, max: 20000, fee: 17568 },
      { min: 20001, max: 100000, fee: 20232 },
      { min: 100001, max: null, fee: 24051 },
    ]);
  });

  it('G2-T1 dilim yapısı birebir', () => {
    const b = tariff.groups.find((g) => g.id === 'G2')!.subtypes.find((s) => s.id === 'G2-T1')!.brackets!;
    expect(b).toEqual([
      { min: 1, max: 149, fee: 16500 },
      { min: 150, max: 250, fee: 17622 },
      { min: 251, max: 500, fee: 20217 },
      { min: 501, max: 1000, fee: 23946 },
      { min: 1001, max: 5000, fee: 35187 },
      { min: 5001, max: null, fee: 55569 },
    ]);
  });

  it('G2-T2 türetme kuralı: G2-T1 × 1.10', () => {
    const s = tariff.groups.find((g) => g.id === 'G2')!.subtypes.find((x) => x.id === 'G2-T2')!;
    expect(s.baseSubtypeRef).toBe('G2-T1');
    expect(s.surchargeMultiplier).toBe(1.1);
  });

  it('toplu değerleme kuralları: G1 %20, G2 %15, tavan 201 → 511.500', () => {
    const g1 = tariff.groups.find((g) => g.id === 'G1')!.bulkValuation;
    const g2 = tariff.groups.find((g) => g.id === 'G2')!.bulkValuation;
    expect(g1.othersFeePercentOfOwnBracket).toBe(20);
    expect(g2.othersFeePercentOfOwnBracket).toBe(15);
    for (const rule of [g1, g2]) {
      expect(rule.propertyCountFlatFeeThreshold?.minPropertyCount).toBe(201);
      expect(rule.propertyCountFlatFeeThreshold?.flatFee).toBe(511500);
    }
  });

  it('referans tabanlı gruplar: G9 %100/%30/%50, G11 5 katı', () => {
    const g9 = tariff.groups.find((g) => g.id === 'G9')!;
    expect(g9.subtypes.map((s) => s.percentOfReferenceGroupFee)).toEqual([100, 30, 50]);
    const g11 = tariff.groups.find((g) => g.id === 'G11')!;
    expect(g11.subtypes[0].multiplierOfReferenceGroupFee).toBe(5);
  });

  it('manuel ücretli alt türler mevcut ve işaretli (3./7./8. grup "Belirlenmemiştir" kalemleri)', () => {
    const manualCount = tariff.groups.flatMap((g) => g.subtypes).filter((s) => s.manualFeeRequired).length;
    expect(manualCount).toBeGreaterThan(0);
  });
});
