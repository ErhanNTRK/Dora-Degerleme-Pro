/**
 * Çoklu Teklif "Rapor Özeti" tablosunun veri katmanı (React'siz, test edilebilir):
 * satır başına baz ücret + her harç kalemi, sütun toplamları ve Excel çıktısı.
 */
import type { Tariff } from '../types/tariff';
import { rowDocumentLabel, type ProposalRow, type RowComputation } from './multiProposalRows';

export interface SummaryRow {
  id: string;
  /** Kısa bina adı + alan (tablo ilk sütunu). */
  name: string;
  /** İlçe · Mahalle · Ada/Parsel. */
  loc: string;
  /** Kalem dökümü var mı (kayıtlı hesaplamadan gelen satırlarda yok). */
  detail: boolean;
  base: number;
  transport: number;
  deed: number;
  municipality: number;
  infoCenter: number;
  union: number;
  /** Hesaplanan (elle girişten bağımsız) satır toplamı. */
  calc: number;
  /** Müşteriye giden KDV hariç tutar. */
  total: number;
  /** Müşteriye giden KDV dahil tutar. */
  gross: number;
}

export type SummaryTotals = Pick<SummaryRow, 'base' | 'transport' | 'deed' | 'municipality' | 'infoCenter' | 'union' | 'calc' | 'total' | 'gross'>;

/** Tablo için kısa bina adı: bina adı (varsa) yoksa hizmet adı; alan eklenir. */
export function rowShortName(r: ProposalRow, tariff: Tariff): string {
  const areas = (r.areas ?? []).filter((x) => x > 0);
  const areaText = areas.length > 0 ? `${areas.reduce((t, x) => t + x, 0).toLocaleString('tr-TR')} m²` : r.area ? `${r.area.toLocaleString('tr-TR')} m²` : '';
  const named = r.buildingName?.trim() || r.label.trim();
  const base = named || rowDocumentLabel({ ...r, area: undefined, areas: undefined, mahalle: undefined, ada: undefined, parsel: undefined, province: '', district: '' }, tariff);
  return [base, areaText].filter(Boolean).join(' · ');
}

/** "İlçe · Mahalle Ada/Parsel" — girilmeyenler atlanır. */
export function rowLocationText(r: ProposalRow): string {
  const adaParsel = r.ada || r.parsel ? `${r.ada ?? ''}/${r.parsel ?? ''}` : '';
  return [r.district, r.mahalle, adaParsel].filter(Boolean).join(' ');
}

export function buildSummaryRows(
  rows: ProposalRow[],
  computations: Map<string, RowComputation>,
  money: { nets: number[]; grosses: number[] },
  tariff: Tariff
): SummaryRow[] {
  return rows.map((r, i) => {
    const c = computations.get(r.id) ?? { subtotal: 0, warnings: [], result: null };
    const pt = c.parts;
    return {
      id: r.id,
      name: rowShortName(r, tariff),
      loc: rowLocationText(r),
      detail: !!pt,
      base: pt?.base ?? 0,
      transport: pt?.transport ?? 0,
      deed: pt?.deed ?? 0,
      municipality: pt?.municipality ?? 0,
      infoCenter: pt?.infoCenter ?? 0,
      union: pt?.union ?? 0,
      calc: c.subtotal,
      total: money.nets[i],
      gross: money.grosses[i],
    };
  });
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function summaryTotals(rows: SummaryRow[], grossTotal?: number): SummaryTotals {
  const sum = (k: keyof SummaryTotals) => r2(rows.reduce((t, b) => t + b[k], 0));
  return {
    base: sum('base'), transport: sum('transport'), deed: sum('deed'), municipality: sum('municipality'),
    infoCenter: sum('infoCenter'), union: sum('union'), calc: sum('calc'), total: sum('total'),
    gross: grossTotal ?? sum('gross'),
  };
}

export const SUMMARY_HEADERS = ['Bina Adı', 'Mahalle / Ada / Parsel', 'Rapor Ücreti', 'Tapu', 'Belediye', 'Yol', 'Gayr. Bilgi Merkezi Payı', 'TDUB Birlik Payı', 'Toplam', 'KDV Dahil'];

/** Excel için matris: başlık + her rapor + TOPLAM satırı. Sayılar gerçek sayıdır (Excel'de toplanabilir). */
export function buildSummarySheet(rows: SummaryRow[], totals: SummaryTotals): (string | number)[][] {
  const num = (r: SummaryRow, v: number) => (r.detail ? v : '');
  return [
    SUMMARY_HEADERS,
    ...rows.map((r) => [r.name, r.loc, num(r, r.base), num(r, r.deed), num(r, r.municipality), num(r, r.transport), num(r, r.infoCenter), num(r, r.union), r.total, r.gross]),
    ['TOPLAM', '', totals.base, totals.deed, totals.municipality, totals.transport, totals.infoCenter, totals.union, totals.total, totals.gross],
  ];
}

/** Rapor özetini .xlsx olarak üretir (xlsx kütüphanesi yalnızca bu anda yüklenir). */
export async function buildSummaryXlsxBlob(rows: SummaryRow[], totals: SummaryTotals): Promise<Blob> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(buildSummarySheet(rows, totals));
  ws['!cols'] = [{ wch: 38 }, { wch: 30 }, ...Array.from({ length: 8 }, () => ({ wch: 16 }))];
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let R = 1; R <= range.e.r; R++) {
    for (let C = 2; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && cell.t === 'n') cell.z = '#,##0.00';
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rapor Özeti');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
