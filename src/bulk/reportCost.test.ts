/** v3 rapor maliyeti — Salih kurallarının goldenleri (gerçek 2026 tarifesiyle). */
import { describe, it, expect } from 'vitest';
import tariffJson from '../../public/data/tariff-2026.json';
import type { Tariff } from '../types/tariff';
import type { CalculationSettings } from '../types/calculation';
import { computeReportV3, computeBaseFee, type RowFeeInput } from './reportCost';
import { guessAliasName, suggestGroupsV2, groupList, type ImportRow } from './excelImport';
import { DEFAULT_SERVICE_ALIASES } from '../types/serviceAliases';

const tariff = tariffJson as unknown as Tariff;
const A = DEFAULT_SERVICE_ALIASES;
const S: CalculationSettings = {
  titleDeedFeePerDeed: 500, infoCenterFeePerReport: 300, unionFeePerReport: 400,
  transportFeePerReport: 1000, vatRatePercent: 20,
  infoCenterFeeEnabled: true, unionFeeEnabled: true, transportFeeEnabled: true,
};
const row = (p: Partial<ImportRow>): ImportRow => ({
  id: p.id ?? Math.random().toString(36).slice(2), il: 'İSTANBUL', ilce: 'KADIKÖY',
  mahalle: '', ada: '', parsel: '', nitelik: '', alan: undefined, aliasName: null, groupKey: '', ...p,
});
const alias = (name: string) => A.find((a) => a.name === name)!;
const inp = (r: ImportRow, aliasName: string, extra?: Partial<RowFeeInput>): RowFeeInput => ({
  row: r, alias: alias(aliasName), pctOverride: null, municipalityFee: 0, deeds: 1, ...extra,
});

describe('nitelik fuzzy — yazım hataları', () => {
  it("Salih'in örnekleri: TARLLLA→Tarla, OFŞS→Ofis", () => {
    expect(guessAliasName('TARLLLA', A)).toBe('Tarla / Bağ / Bahçe');
    expect(guessAliasName('OFŞS', A)).toBe('Ofis / Büro');
    expect(guessAliasName('ARSAA', A)).toBe('Arsa');
  });
  it('tanınmayan hâlâ null (dayatma yok)', () => {
    expect(guessAliasName('XQZW', A)).toBeNull();
  });
});

describe('saf tebliğ gruplaması', () => {
  it('4-parsel örneği: 2 fabrika + arsa + tarla farklı mahallede → 4 AYRI rapor', () => {
    const rows = suggestGroupsV2([
      row({ id: 'f1', mahalle: 'SANAYİ', ada: '10', parsel: '1', nitelik: 'FABRİKA', aliasName: 'Fabrika' }),
      row({ id: 'f2', mahalle: 'SANAYİ', ada: '11', parsel: '2', nitelik: 'FABRİKA', aliasName: 'Fabrika' }),
      row({ id: 'a1', mahalle: 'SANAYİ', ada: '10', parsel: '3', nitelik: 'ARSA', aliasName: 'Arsa' }),
      row({ id: 't1', mahalle: 'KIRSAL', ada: '20', parsel: '5', nitelik: 'TARLA', aliasName: 'Tarla / Bağ / Bahçe' }),
    ], A);
    expect(groupList(rows)).toHaveLength(4);
  });
  it('G1 aynı mahalle kendiliğinden gruplanır; G2 yalnız aynı ada/parselde', () => {
    const rows = suggestGroupsV2([
      row({ id: 'a1', mahalle: 'CAFERAĞA', nitelik: 'ARSA', aliasName: 'Arsa' }),
      row({ id: 'a2', mahalle: 'CAFERAĞA', nitelik: 'ARSA', aliasName: 'Arsa' }),
      row({ id: 'a3', mahalle: 'MODA', nitelik: 'ARSA', aliasName: 'Arsa' }),
      row({ id: 'd1', ada: '100', parsel: '1', nitelik: 'DAİRE', aliasName: 'Daire (Konut)' }),
      row({ id: 'd2', ada: '100', parsel: '1', nitelik: 'DAİRE', aliasName: 'Daire (Konut)' }),
      row({ id: 'd3', ada: '200', parsel: '9', nitelik: 'DAİRE', aliasName: 'Daire (Konut)' }),
    ], A);
    const groups = groupList(rows);
    expect(groups).toHaveLength(4);   // Caferağa(2) · Moda(1) · 100/1(2) · 200/9(1)
    expect(groups.find((g) => g.key.includes('caferaga'))?.rows).toHaveLength(2);
    expect(groups.find((g) => g.key.includes('100/1'))?.rows).toHaveLength(2);
  });
});

describe('computeReportV3 — yüzde modeli', () => {
  it('villa+arsa özel raporu: en yüksek %100, arsa varsayılan %20; tekler bir kez; belediye/tapu satır bazlı', () => {
    const villa = row({ id: 'v', ada: '5', parsel: '1', alan: 400 });
    const arsa = row({ id: 'a', mahalle: 'X', alan: 800 });
    const c = computeReportV3(tariff, [
      inp(villa, 'Müstakil Ev', { municipalityFee: 3000, deeds: 1 }),
      inp(arsa, 'Arsa', { municipalityFee: 0, deeds: 1 }),
    ], S, { transport: true, union: true, infoCenter: true, proposalOverride: null });

    const vBase = computeBaseFee(tariff, villa, alias('Müstakil Ev'), S).fee;
    const aBase = computeBaseFee(tariff, arsa, alias('Arsa'), S).fee;
    // En yüksek taban %100; KÜÇÜĞÜN yüzdesi KENDİ grubunun oranıdır (G2→15, G1→20)
    const bigRow = c.rows.find((x) => x.baseFee === Math.max(vBase, aBase))!;
    const smallRow = c.rows.find((x) => x !== bigRow)!;
    expect(bigRow.appliedPct).toBe(100);
    const smallRate = smallRow.alias!.groupId === 'G2' ? 15 : 20;
    expect(smallRow.appliedPct).toBe(smallRate);
    expect(c.serviceTotal).toBeCloseTo(bigRow.baseFee + smallRow.baseFee * smallRate / 100, 1);
    expect(c.municipalityTotal).toBe(3000);
    expect(c.titleDeedTotal).toBe(2 * 500);
    expect(c.transportFee).toBe(1000);
    expect(c.tebligCompliant).toBe(false);          // karma tür → özel rapor rozeti
    expect(c.computedSubtotal).toBeCloseTo(c.serviceTotal + 3000 + 1000 + 1000 + 400 + 300, 2);
  });

  it('kullanıcı yüzdesi serbest: %50 yazılırsa hesap onunla yürür', () => {
    const r1 = row({ id: 'p1', mahalle: 'X', alan: 1000 });
    const r2 = row({ id: 'p2', mahalle: 'X', alan: 900 });
    const c = computeReportV3(tariff, [
      inp(r1, 'Arsa'), inp(r2, 'Arsa', { pctOverride: 50 }),
    ], S, { transport: false, union: false, infoCenter: false, proposalOverride: null });
    const r2row = c.rows.find((x) => x.row.id === 'p2')!;   // eşit tabanlarda id ile bul
    expect(r2row.appliedPct).toBe(50);
    expect(r2row.rowServiceFee).toBeCloseTo(r2row.baseFee * 0.5, 2);
    expect(c.tebligCompliant).toBe(true);           // aynı mahalle G1 → tebliğ kurgusu
  });

  it('G2 varsayılanı %15; tapu "TAKBİS almayın" → 0 yazılabilir; teklif tutarı ezilebilir', () => {
    const d1 = row({ id: 'd1', ada: '7', parsel: '3', alan: 150 });
    const d2 = row({ id: 'd2', ada: '7', parsel: '3', alan: 120 });
    const c = computeReportV3(tariff, [
      inp(d1, 'Daire (Konut)', { deeds: 0 }), inp(d2, 'Daire (Konut)', { deeds: 0 }),
    ], S, { transport: false, union: false, infoCenter: false, proposalOverride: 55000 });
    expect(c.rows.find((x) => x.row.id === 'd2')!.appliedPct === 15
        || c.rows.find((x) => x.row.id === 'd1')!.appliedPct === 15).toBe(true);
    expect(c.rows.some((x) => x.appliedPct === 100)).toBe(true);
    expect(c.titleDeedTotal).toBe(0);
    expect(c.proposalOverridden).toBe(true);
    expect(c.subtotal).toBe(55000);
    expect(c.grandTotal).toBeCloseTo(55000 * 1.2, 2);
    expect(c.computedSubtotal).toBeGreaterThan(0);  // maliyet dökümü yine hesaplı durur
  });
});

describe('belediye harcı — parsel başına bir kez', () => {
  it('aynı ada/parseldeki 3 daire için harç TEK; farklı parsel karma raporda parsel başına birer', () => {
    const mk = (id: string, ada: string, parsel: string) =>
      inp(row({ id, ada, parsel, alan: 120 }), 'Daire (Konut)', { municipalityFee: 5000 });
    const c = computeReportV3(tariff, [mk('d1', '7', '3'), mk('d2', '7', '3'), mk('d3', '7', '3')],
      S, { transport: false, union: false, infoCenter: false, proposalOverride: null });
    expect(c.rows.filter((x) => x.feeApplies)).toHaveLength(1);
    expect(c.municipalityTotal).toBe(5000);

    const c2 = computeReportV3(tariff, [mk('a1', '7', '3'), mk('a2', '7', '3'), mk('b1', '9', '1')],
      S, { transport: false, union: false, infoCenter: false, proposalOverride: null });
    expect(c2.municipalityTotal).toBe(10000);     // 7/3 bir kez + 9/1 bir kez
  });
  it('ada/parsel boş satırlar kendi başına parseldir (harçları toplanır)', () => {
    const c = computeReportV3(tariff, [
      inp(row({ id: 'x1', mahalle: 'A', alan: 500 }), 'Arsa', { municipalityFee: 0 }),
      inp(row({ id: 'x2', alan: 100 }), 'Dükkan', { municipalityFee: 2000 }),
    ], S, { transport: false, union: false, infoCenter: false, proposalOverride: null });
    expect(c.municipalityTotal).toBe(2000);
  });
});
