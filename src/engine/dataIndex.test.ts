/**
 * Veri indeksi bütünlük testi: tariffs-index.json'un tutarlılığını ve referans verdiği
 * dosyaların gerçekten var olduğunu doğrular. Yeni yıl eklenirken bu test, indeksle
 * dosyaların birlikte yayınlanmasını garanti eder.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import indexJson from '../../public/data/tariffs-index.json';
import type { TariffsIndex } from '../types/dataIndex';

const index = indexJson as TariffsIndex;

describe('tariffs-index.json — bütünlük', () => {
  it('aktif yıl, yıllar listesinde mevcut', () => {
    expect(index.years.some((y) => y.year === index.activeYear)).toBe(true);
  });
  it('referans verilen tüm veri dosyaları repoda mevcut', () => {
    for (const y of index.years) {
      expect(existsSync(join(process.cwd(), 'public/data', y.tariffFile)), y.tariffFile).toBe(true);
      expect(existsSync(join(process.cwd(), 'public/data', y.locationFile)), y.locationFile).toBe(true);
    }
  });
  it('yıllar benzersiz ve dosya adları yıl ile tutarlı', () => {
    const years = index.years.map((y) => y.year);
    expect(new Set(years).size).toBe(years.length);
    for (const y of index.years) expect(y.tariffFile).toContain(String(y.year));
  });
});
