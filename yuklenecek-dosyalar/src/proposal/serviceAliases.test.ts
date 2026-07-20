/**
 * Hizmet adı katmanı testleri: alias eşlemesinin tarifeyle bütünlüğü, doğal belge
 * adları ve satırlar arası SPK çapraz denetimi.
 */
import { describe, it, expect } from 'vitest';
import tariffJson from '../../public/data/tariff-2026.json';
import aliasJson from '../../public/data/service-aliases.json';
import type { Tariff } from '../types/tariff';
import type { ServiceAliasFile } from '../types/serviceAliases';
import { serviceDocumentName } from '../types/serviceAliases';
import { createEmptyRow, rowDocumentLabel, findCrossRowIssues, mergeRows } from './multiProposalRows';

const tariff = tariffJson as unknown as Tariff;
const aliasFile = aliasJson as ServiceAliasFile;
const aliases = aliasFile.aliases;

describe('service-aliases.json — tarife bütünlüğü', () => {
  it('her alias, tarifede gerçekten var olan grup/tür kimliğine işaret eder', () => {
    for (const a of aliases) {
      const g = tariff.groups.find((x) => x.id === a.groupId);
      expect(g, `${a.name} → ${a.groupId}`).toBeDefined();
      expect(g!.subtypes.some((s) => s.id === a.subtypeId), `${a.name} → ${a.subtypeId}`).toBe(true);
    }
  });
  it('alias adları benzersizdir', () => {
    const names = aliases.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it('kritik eşlemeler doğru SPK kalemine gider (mevzuat kontrolü)', () => {
    const get = (n: string) => aliases.find((a) => a.name === n)!;
    expect(get('Dükkan').groupId).toBe('G5'); // Dükkan 5. gruptadır
    expect(get('Ofis / Büro').groupId).toBe('G2'); // Ofis SPK'da 2. gruptadır
    expect(get('Arsa').subtypeId).toBe('G1-T2');
    expect(get('Fabrika').groupId).toBe('G4');
  });
});

describe('doğal belge adları', () => {
  it('"2 Adet Dükkan Değerlemesi" biçiminde üretir', () => {
    expect(serviceDocumentName(aliases, 'Dükkan', 2)).toBe('2 Adet Dükkan Değerlemesi');
    expect(serviceDocumentName(aliases, 'Arsa', 1)).toBe('Arsa Değerlemesi');
    expect(serviceDocumentName(aliases, 'Motel / Pansiyon', 3)).toBe('3 Adet Konaklama Tesisi Değerlemesi');
  });
  it('satır etiketi: alias + alan + konum; SPK adları görünmez', () => {
    const r = { ...createEmptyRow(tariff, 'r1'), serviceAlias: 'Dükkan', groupId: 'G5', subtypeId: 'G5-T1', count: 3, area: 85, province: 'İSTANBUL', district: 'KADIKÖY' };
    const label = rowDocumentLabel(r, tariff, aliases);
    expect(label).toContain('3 Adet Dükkan Değerlemesi');
    expect(label).toContain('İSTANBUL / KADIKÖY');
    expect(label).not.toContain('Hizmet Amaçlı'); // uzun SPK adı asla sızmaz
  });
});

describe('SPK çapraz denetimi (satırlar arası)', () => {
  it('aynı parseldeki G2 satırlarını yakalar ve uyumlu olanları birleştirebilir', () => {
    const a = { ...createEmptyRow(tariff, 'a'), groupId: 'G2', subtypeId: 'G2-T1', area: 100, count: 1, province: 'İSTANBUL', district: 'KADIKÖY', ada: '77', parsel: '12' };
    const b = { ...createEmptyRow(tariff, 'b'), groupId: 'G2', subtypeId: 'G2-T1', area: 100, count: 2, province: 'İSTANBUL', district: 'KADIKÖY', ada: '77', parsel: '12' };
    const issues = findCrossRowIssues([a, b]);
    expect(issues).toHaveLength(1);
    expect(issues[0].canMerge).toBe(true);
    expect(issues[0].message).toContain('%15');

    const merged = mergeRows([a, b], issues[0].rowIds);
    expect(merged).toHaveLength(1);
    expect(merged[0].count).toBe(3);
    expect(merged[0].bulkTogether).toBe(true);
    expect(merged[0].manualAmount).toBeNull();
  });
  it('farklı parsel veya farklı ilçe uyarı üretmez', () => {
    const a = { ...createEmptyRow(tariff, 'a'), groupId: 'G2', subtypeId: 'G2-T1', ada: '77', parsel: '12', province: 'İSTANBUL', district: 'KADIKÖY' };
    const b = { ...createEmptyRow(tariff, 'b'), groupId: 'G2', subtypeId: 'G2-T1', ada: '77', parsel: '13', province: 'İSTANBUL', district: 'KADIKÖY' };
    const c = { ...createEmptyRow(tariff, 'c'), groupId: 'G2', subtypeId: 'G2-T1', ada: '77', parsel: '12', province: 'ANKARA', district: 'ÇANKAYA' };
    expect(findCrossRowIssues([a, b, c])).toHaveLength(0);
  });
  it('aynı mahalledeki farklı alanlı G1 satırları: %20 uyarısı + alanları koruyarak birleştirme', () => {
    const a = { ...createEmptyRow(tariff, 'a'), groupId: 'G1', subtypeId: 'G1-T1', area: 5000, mahalle: 'Merkez', province: 'MALATYA', district: 'BATTALGAZİ' };
    const b = { ...createEmptyRow(tariff, 'b'), groupId: 'G1', subtypeId: 'G1-T1', area: 8000, count: 2, mahalle: 'merkez', province: 'MALATYA', district: 'BATTALGAZİ' };
    const issues = findCrossRowIssues([a, b]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('%20');
    expect(issues[0].canMerge).toBe(true); // farklı alanlar artık listeye toplanarak birleşir
    const merged = mergeRows([a, b], issues[0].rowIds);
    expect(merged).toHaveLength(1);
    expect(merged[0].count).toBe(3);
    expect(merged[0].areas).toEqual([5000, 8000, 8000]); // her taşınmaz kendi alanını korur
  });
});
