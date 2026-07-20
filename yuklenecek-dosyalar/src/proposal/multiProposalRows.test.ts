/**
 * Çoklu Teklif satır modeli regresyon testleri.
 * Kanıtlanan: her satır motor tarafından BİR RAPOR olarak, rapor başına harçlar
 * dahil ve SPK toplu değerleme kurallarıyla hesaplanır; motor değişmemiştir.
 */
import { describe, it, expect } from 'vitest';
import tariffJson from '../../public/data/tariff-2026.json';
import type { Tariff } from '../types/tariff';
import { createEmptyRow, computeRow, rowDocumentLabel, rowEffectiveAmount } from './multiProposalRows';

const tariff = tariffJson as unknown as Tariff;
const settings = {
  titleDeedFeePerDeed: 307, infoCenterFeePerReport: 176, unionFeePerReport: 125,
  transportFeePerReport: 2645.06, vatRatePercent: 20,
  infoCenterFeeEnabled: true, unionFeeEnabled: true, transportFeeEnabled: true,
};

function row(partial: object) {
  return { ...createEmptyRow(tariff, 'r1'), ...partial };
}

describe('computeRow — satır = bir rapor', () => {
  it('tek konut: rapor başına tüm harçlar dahil Toplam Maliyet', () => {
    const r = row({ groupId: 'G2', subtypeId: 'G2-T1', area: 100, count: 1, municipalityFee: 1500 });
    const c = computeRow(tariff, r, settings);
    expect(c.subtotal).toBeCloseTo(16500 + 307 + 1500 + 176 + 125 + 2645.06, 2);
  });

  it('"Kadıköy 2 dükkan aynı parsel": G2 toplu değerleme %15 + tapu 2 adet', () => {
    const r = row({ groupId: 'G2', subtypeId: 'G2-T1', area: 100, count: 2, bulkTogether: true, municipalityFee: 0 });
    const c = computeRow(tariff, r, settings);
    // Taşınmazlar: 16.500 (tam) + 2.475 (%15) = 18.975; + 2×307 tapu + rapor ücretleri
    expect(c.subtotal).toBeCloseTo(18975 + 614 + 176 + 125 + 2645.06, 2);
  });

  it('toplu değerleme kapalıysa her taşınmaz tam ücret öder', () => {
    const r = row({ groupId: 'G2', subtypeId: 'G2-T1', area: 100, count: 2, bulkTogether: false });
    const c = computeRow(tariff, r, settings);
    expect(c.subtotal).toBeCloseTo(33000 + 614 + 176 + 125 + 2645.06, 2);
  });

  it('kayıtlı satır: motor çağrılmaz, kayıtlı Toplam Maliyet aynen kullanılır', () => {
    const r = row({ kind: 'saved', savedSubtotal: 123456.78, savedTitle: 'Çeşme Oteli' });
    const c = computeRow(tariff, r, settings);
    expect(c.subtotal).toBe(123456.78);
    expect(c.result).toBeNull();
  });
});

describe('computeRow — aynı raporda FARKLI alanlı taşınmazlar', () => {
  it('aynı binada 3 daire (50/155/275 m²): tek rapor, dilimler taşınmaz başına, %15 toplu değerleme', () => {
    const r = row({ groupId: 'G2', subtypeId: 'G2-T1', count: 3, areas: [50, 155, 275], bulkTogether: true, municipalityFee: 0 });
    const c = computeRow(tariff, r, settings);
    // Dilimler: 50→16.500, 155→17.622, 275→20.217. En büyük (20.217) tam; diğerleri %15.
    const expectedProps = 20217 + 0.15 * 16500 + 0.15 * 17622;
    expect(c.subtotal).toBeCloseTo(expectedProps + 3 * 307 + 176 + 125 + 2645.06, 2);
  });
  it('2 dükkan (5/550 m²) tek satır: TEK rapor harcı, her dükkan kendi dilim ücretini tam öder (G5 toplu değerleme kapsamı dışı)', () => {
    const r = row({ groupId: 'G5', subtypeId: 'G5-T1', count: 2, areas: [5, 550] });
    const c = computeRow(tariff, r, settings);
    expect(c.result!.infoCenterFee).toBe(176); // rapor ücreti bir kez
    expect(c.result!.propertyBreakdowns[0].finalFee).toBe(c.result!.propertyBreakdowns[0].baseFee);
    expect(c.result!.propertyBreakdowns[1].finalFee).toBe(c.result!.propertyBreakdowns[1].baseFee);
    expect(c.result!.propertyBreakdowns[0].baseFee).not.toBe(c.result!.propertyBreakdowns[1].baseFee);
  });
});

describe('computeRow — satır bazında harç anahtarları', () => {
  it('ulaşım ücreti kapatılınca yalnızca o satırın maliyetinden düşer', () => {
    const base = row({ groupId: 'G2', subtypeId: 'G2-T1', area: 100 });
    const withTransport = computeRow(tariff, base, settings);
    const without = computeRow(tariff, { ...base, transportFeeEnabled: false }, settings);
    expect(withTransport.subtotal - without.subtotal).toBeCloseTo(2645.06, 2);
    expect(without.result!.transportFee).toBe(0);
    expect(without.result!.unionFee).toBe(125); // diğer harçlar etkilenmez
  });
});

describe('rowEffectiveAmount ve rowDocumentLabel', () => {
  it('elle ezme yalnızca müşteri tutarını değiştirir', () => {
    const r = row({ groupId: 'G2', subtypeId: 'G2-T1', area: 100, manualAmount: 25000 });
    const c = computeRow(tariff, r, settings);
    expect(rowEffectiveAmount(r, c)).toBe(25000);
    expect(c.subtotal).not.toBe(25000); // motor sonucu bağımsız kalır
  });

  it('otomatik etiket: adet + grup/tür + alan + konum', () => {
    const r = row({ groupId: 'G2', subtypeId: 'G2-T1', area: 85, count: 2, province: 'İSTANBUL', district: 'KADIKÖY', ada: '77', parsel: '12' });
    const label = rowDocumentLabel(r, tariff);
    expect(label).toContain('2 adet');
    expect(label).toContain('85 m²');
    expect(label).toContain('İSTANBUL / KADIKÖY');
    expect(label).toContain('Ada 77, Parsel 12');
  });
});
