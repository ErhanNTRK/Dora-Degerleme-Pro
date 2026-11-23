/**
 * Belge çıktısı (PDF / Word / Excel) kontrolleri.
 * PDF yazı tipi gömülü olduğundan metin PDF içinde okunamaz; bu yüzden jsPDF.text çağrıları
 * kaydedilir ve sayfaya gerçekten ne yazıldığı (metin + konum) doğrudan doğrulanır.
 */
import { describe, it, expect, vi } from 'vitest';
import type { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { buildProposalPdfDoc } from './generateProposalPdf';
import { buildProposalDocxBlob } from './generateProposalDocx';
import { computeProposalPricing, type ServiceFeeItem } from './buildProposalContent';
import { computeRowMoney } from './multiProposalRows';
import { buildSummarySheet, buildSummaryXlsxBlob, summaryTotals, type SummaryRow } from './summaryTable';
import { EMPTY_CUSTOMER_INFO, EMPTY_COMPANY_PROFILE } from '../types/profile';

/** jsPDF'in text() çağrılarını kaydeder: sayfaya ne yazıldığı (metin + dikey konum) doğrudan okunur. */
const textCalls: { text: string; y: number }[] = [];
vi.mock('jspdf', async (importOriginal) => {
  const mod = await importOriginal<typeof import('jspdf')>();
  class RecordingPdf extends mod.jsPDF {
    constructor(...args: ConstructorParameters<typeof mod.jsPDF>) {
      super(...args);
      const original = this.text.bind(this) as (...a: unknown[]) => unknown;
      (this as unknown as { text: unknown }).text = (text: unknown, x: unknown, y: unknown, opts: unknown) => {
        const parts = Array.isArray(text) ? (text as string[]) : [String(text)];
        parts.forEach((t) => textCalls.push({ text: t, y: Number(y) }));
        return original(text, x, y, opts);
      };
    }
  }
  return { ...mod, jsPDF: RecordingPdf };
});

const money = computeRowMoney([{ net: 0, gross: 80000 }, { net: 0, gross: 65000 }, { net: 0, gross: 65000 }], 20);
const pricing = computeProposalPricing(175000, 20, money.grossTotal);
const feeItems: ServiceFeeItem[] = ['Portakal Çiçeği Ofis', 'Refik Belendir Ofis', 'Protokol Ofis'].map((name, i) => ({
  label: `${i + 1}. ${name} — Plaza Değerlemesi`,
  amount: money.nets[i],
  grossAmount: money.grosses[i],
}));
const customer = { ...EMPTY_CUSTOMER_INFO, customerName: 'Test Müşteri' };
const company = { ...EMPTY_COMPANY_PROFILE };

function captureText(fn: () => jsPDF) {
  textCalls.length = 0;
  const doc = fn();
  return { doc, calls: [...textCalls] };
}

describe('teklif PDF içeriği', () => {
  it('her rapor tutarı, altında KDV dahil değeri ve toplamlar sayfaya yazılır', () => {
    const { doc, calls } = captureText(() => buildProposalPdfDoc({ customer, company, tariffYear: 2026, pricing, contentOptions: { serviceFeeItems: feeItems } }));
    const texts = calls.map((c) => c.text);
    expect(texts).toContain('HİZMET VE ÜCRET DÖKÜMÜ');
    for (const g of ['80.000,00 TL', '65.000,00 TL']) expect(texts).toContain(`KDV dahil: ${g}`);
    expect(texts).toContain('66.666,67 TL');
    expect(texts).toContain('54.166,66 TL');
    expect(texts).toContain('175.000,00 TL');
    expect(texts).toContain('210.000,00 TL');
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(2);
    const h = doc.internal.pageSize.getHeight();
    expect(calls.every((c) => c.y >= 0 && c.y <= h)).toBe(true);
  });

  it('KDV dahil değer verilmezse "KDV dahil:" satırı hiç yazılmaz', () => {
    const plain = feeItems.map(({ label, amount }) => ({ label, amount }));
    const { calls } = captureText(() => buildProposalPdfDoc({ customer, company, tariffYear: 2026, pricing, contentOptions: { serviceFeeItems: plain } }));
    expect(calls.some((c) => c.text.startsWith('KDV dahil:'))).toBe(false);
  });

  it('ayrı gösterim kapalıyken (yalnızca hizmet kapsamı) satır tutarları basılmaz', () => {
    const { calls } = captureText(() => buildProposalPdfDoc({ customer, company, tariffYear: 2026, pricing, contentOptions: { serviceLines: feeItems.map((f) => f.label) } }));
    const texts = calls.map((c) => c.text);
    expect(texts).toContain('HİZMET KAPSAMI');
    expect(texts).not.toContain('66.666,67 TL');
    expect(texts).toContain('210.000,00 TL');
  });
});

describe('teklif Word içeriği', () => {
  it('Word belgesi üretilir; tutarlar ve KDV dahil satırı belge metninde bulunur', async () => {
    const { blob } = await buildProposalDocxBlob({ customer, company, tariffYear: 2026, pricing, contentOptions: { serviceFeeItems: feeItems } });
    expect(blob.size).toBeGreaterThan(1000);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('66.666,67 TL');
    expect(xml).toContain('KDV dahil: 80.000,00 TL');
    expect(xml).toContain('210.000,00 TL');
  });
});

describe('rapor özeti Excel çıktısı', () => {
  const rows: SummaryRow[] = [
    { id: 'a', name: 'PORTAKAL · 6.311 m²', loc: 'ÇANKAYA Aziziye 4963/25', detail: true, base: 58485, transport: 2645.06, deed: 307, municipality: 1813, infoCenter: 176, union: 125, calc: 63551.06, total: 63551.06, gross: 76261.27 },
    { id: 'b', name: 'REFİK · 2.314 m²', loc: 'ÇANKAYA Aziziye Ayrancı 7047/2', detail: true, base: 45207, transport: 2645.06, deed: 307, municipality: 1813, infoCenter: 176, union: 125, calc: 50273.06, total: 50273.06, gross: 60327.67 },
  ];
  const totals = summaryTotals(rows);

  it('toplamlar sütun toplamlarıdır', () => {
    expect(totals.base).toBe(103692);
    expect(totals.total).toBe(113824.12);
    expect(totals.gross).toBe(136588.94);
  });

  it('matris başlık + satırlar + TOPLAM içerir, sayılar gerçek sayıdır', () => {
    const sheet = buildSummarySheet(rows, totals);
    expect(sheet).toHaveLength(4);
    expect(sheet[0][0]).toBe('Bina Adı');
    expect(sheet[1][2]).toBe(58485);
    expect(sheet[3][0]).toBe('TOPLAM');
    expect(sheet[3][8]).toBe(113824.12);
  });

  it('.xlsx dosyası geri okunduğunda aynı değerleri verir', async () => {
    const XLSX = await import('xlsx');
    const blob = await buildSummaryXlsxBlob(rows, totals);
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' });
    const data = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets['Rapor Özeti'], { header: 1 });
    expect(data[1][0]).toBe('PORTAKAL · 6.311 m²');
    expect(data[1][2]).toBe(58485);
    expect(data[3][9]).toBe(136588.94);
  });
});
