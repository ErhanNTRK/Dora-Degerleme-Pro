import { describe, it, expect } from 'vitest';
import { trFold, levenshtein, fuzzyMatch } from './fuzzy';

const ILCELER = ['KADIKÖY', 'BEŞİKTAŞ', 'BEYOĞLU', 'BEYKOZ', 'ÇEŞME', 'BORNOVA', 'ŞİŞLİ'];

describe('trFold / levenshtein', () => {
  it('Türkçe katlama farkları eritir', () => {
    expect(trFold('Kadıköy')).toBe(trFold('KADIKOY'));
    expect(trFold('  Beykoz ')).toBe('beykoz');
    expect(trFold('İstanbul')).toBe('istanbul');
  });
  it('mesafe hesabı', () => {
    expect(levenshtein('kadikoy', 'kadikoyy')).toBe(1);
    expect(levenshtein('besiktas', 'besiktash')).toBe(1);
  });
});

describe('fuzzyMatch — sahadaki yazımlar', () => {
  it.each([
    ['Kadikoy', 'KADIKÖY'], ['Kadıkoyy', 'KADIKÖY'], ['Kadıky', 'KADIKÖY'],
    ['Besiktas', 'BEŞİKTAŞ'], ['Beşiktaşh', 'BEŞİKTAŞ'], ['Şişlii', 'ŞİŞLİ'],
    ['Beykoz ', 'BEYKOZ'], ['çeşme', 'ÇEŞME'],
  ])('%s → %s', (raw, expected) => {
    expect(fuzzyMatch(raw, ILCELER)?.name).toBe(expected);
  });
  it('kuyruklu yazım: ALAÇATI M → ALAÇATI (önek toleransı)', () => {
    expect(fuzzyMatch('ALAÇATI M', ['ALAÇATI', 'ILICA'])?.name).toBe('ALAÇATI');
  });
  it('belirsizlikte dayatmaz: iki aday başa başsa null', () => {
    expect(fuzzyMatch('Karta', ['KARTAL', 'KARTAP'])).toBeNull();
  });
  it('alakasız ad null döner', () => {
    expect(fuzzyMatch('Ankara', ILCELER)).toBeNull();
  });
});
