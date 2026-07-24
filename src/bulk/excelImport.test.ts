/** Toplu Excel içe aktarma — regresyon testleri (yalnız src/bulk; motor testleri ayrıdır). */
import { describe, it, expect } from 'vitest';
import {
  detectColumns, parseArea, guessAliasName, isArsaTarla,
  rowsFromSheet, suggestGroups, groupList, groupToProposalRow,
} from './excelImport';
import { DEFAULT_SERVICE_ALIASES } from '../types/serviceAliases';

const A = DEFAULT_SERVICE_ALIASES;

describe('detectColumns', () => {
  it('tipik başlıkları algılar (İL/İLÇE/MAHALLE/ADA/PARSEL/TAPU NİTELİĞİ/ALAN)', () => {
    const c = detectColumns(['SIRA', 'İL', 'İLÇE', 'MAHALLE', 'ADA', 'PARSEL', 'TAPU NİTELİĞİ', 'ALAN (m²)']);
    expect(c.il).toBe(1); expect(c.ilce).toBe(2); expect(c.mahalle).toBe(3);
    expect(c.ada).toBe(4); expect(c.parsel).toBe(5); expect(c.nitelik).toBe(6); expect(c.alan).toBe(7);
  });
  it('alternatif adları tanır (Cinsi, Yüzölçümü, Mahalle/Köy, Ada No)', () => {
    const c = detectColumns(['İli', 'İlçesi', 'Mahalle/Köy', 'Ada No', 'Parsel No', 'Cinsi', 'Yüzölçümü']);
    expect(Object.values(c).every((v) => v >= 0)).toBe(true);
  });
});

describe('parseArea', () => {
  it('TR ve EN biçimleri okur', () => {
    expect(parseArea('1.830,40')).toBeCloseTo(1830.4, 2);
    expect(parseArea('1830.4')).toBeCloseTo(1830.4, 2);
    expect(parseArea('250 m²')).toBe(250);
    expect(parseArea('')).toBeUndefined();
    expect(parseArea('yok')).toBeUndefined();
  });
});

describe('guessAliasName / isArsaTarla', () => {
  it('yaygın nitelikleri eşler', () => {
    expect(guessAliasName('ARSA', A)).toBe('Arsa');
    expect(guessAliasName('Tarla', A)).toBe('Tarla / Bağ / Bahçe');
    expect(guessAliasName('ZEYTİNLİK', A)).toBe('Tarla / Bağ / Bahçe');
    expect(guessAliasName('MESKEN', A)).toBe('Daire (Konut)');
    expect(guessAliasName('KARGİR EV', A)).toBe('Müstakil Ev');
    expect(guessAliasName('DÜKKAN', A)).toBe('Dükkan');
    expect(guessAliasName('FABRİKA BİNASI', A)).toBe('Fabrika');
  });
  it('tanınmayan nitelik null döner (kullanıcı seçer), asla uydurmaz', () => {
    expect(guessAliasName('KUYU VE MÜŞTEMİLATI', A)).toBeNull();
  });
  it('arsa/tarla G1 olarak işaretlenir (belediye harcı uygulanmaz)', () => {
    expect(isArsaTarla('Arsa', A)).toBe(true);
    expect(isArsaTarla('Tarla / Bağ / Bahçe', A)).toBe(true);
    expect(isArsaTarla('Daire (Konut)', A)).toBe(false);
  });
});

describe('gruplar ve ProposalRow dönüşümü', () => {
  const sheet: unknown[][] = [
    ['İstanbul', 'Zeytinburnu', 'Merkezefendi', '1954', '7', 'ARSA', '1.000'],
    ['İstanbul', 'Zeytinburnu', 'Merkezefendi', '1954', '8', 'ARSA', '850'],
    ['İstanbul', 'Zeytinburnu', 'Merkezefendi', '2001', '3', 'MESKEN', '120'],
    ['İstanbul', 'Kadıköy', 'Osmanağa', '55', '2', 'DÜKKAN', '80'],
    ['', '', '', '', '', '', ''],
  ];
  const cols = detectColumns(['İL', 'İLÇE', 'MAHALLE', 'ADA', 'PARSEL', 'NİTELİK', 'ALAN']);
  const rows = suggestGroups(rowsFromSheet(sheet, cols, A));

  it('boş satırı atlar; aynı il+ilçe+mahalle+tür tek rapora gruplar', () => {
    expect(rows).toHaveLength(4);
    const groups = groupList(rows);
    expect(groups).toHaveLength(3);           // 2 arsa birlikte, mesken ayrı, dükkan ayrı
    const arsaG = groups.find((g) => g.aliasName === 'Arsa')!;
    expect(arsaG.rows).toHaveLength(2);
  });

  it('arsa grubunda belediye harcı 0; meskende ilçe kaydından gelir', () => {
    const groups = groupList(rows);
    const lookup = (_p: string, d: string) => (d === 'Zeytinburnu' ? 4500 : null);
    const arsaRow = groupToProposalRow(groups.find((g) => g.aliasName === 'Arsa')!, A, lookup, 'r1');
    expect(arsaRow.municipalityFee).toBe(0);
    expect(arsaRow.groupId).toBe('G1');
    expect(arsaRow.count).toBe(2);
    expect(arsaRow.areas).toEqual([1000, 850]);      // farklı alanlar → taşınmaz başına liste
    expect(arsaRow.bulkTogether).toBe(true);          // aynı mahalle → toplu değerleme koşulu
    expect(arsaRow.ada).toContain('1954/7');

    const meskenRow = groupToProposalRow(groups.find((g) => g.aliasName === 'Daire (Konut)')!, A, lookup, 'r2');
    expect(meskenRow.municipalityFee).toBe(4500);
    expect(meskenRow.municipalityFeeSource).toBe('database');
    expect(meskenRow.area).toBe(120);

    const dukkanRow = groupToProposalRow(groups.find((g) => g.aliasName === 'Dükkan')!, A, lookup, 'r3');
    expect(dukkanRow.municipalityFee).toBe(0);        // Kadıköy kaydı yok → 0 + elle
    expect(dukkanRow.municipalityFeeSource).toBe('manual');
  });
});
