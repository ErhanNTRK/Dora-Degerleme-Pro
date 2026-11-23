import type { CSSProperties } from 'react';
import { buildSummaryXlsxBlob, type SummaryRow, type SummaryTotals } from '../proposal/summaryTable';
import { downloadBlob } from '../utils/share';
import { DownloadIcon } from './icons';

/** Tablo için sade tutar: tam sayıysa kuruşsuz (58.485 TL), değilse 2 haneli (2.645,06 TL). */
const fmt = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' TL';

const BORDER = '1px solid rgba(127,127,127,0.35)';
const HEADERS = ['Bina Adı', 'Mahalle / Ada / Parsel', 'Rapor Ücreti', 'Tapu', 'Belediye', 'Yol', 'Gayr. Bilgi + TDUB', 'Toplam', 'KDV Dahil'];

interface Props {
  rows: SummaryRow[];
  totals: SummaryTotals;
}

/** Ofis içi rapor özeti: her rapor tek satır, kalemler yan yana (PDF'e yansımaz). */
export function ProposalSummaryTable({ rows, totals }: Props) {
  const cell: CSSProperties = { padding: '6px 4px', border: BORDER, textAlign: 'right', whiteSpace: 'nowrap' };

  async function handleExcel() {
    const blob = await buildSummaryXlsxBlob(rows, totals);
    downloadBlob(blob, `Rapor-Ozeti-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="section-title">Rapor Özeti (ofis içi — PDF'e yansımaz)</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            <tr style={{ background: 'rgba(127,127,127,0.12)', textAlign: 'center' }}>
              {HEADERS.map((h) => (
                <th key={h} style={{ padding: '6px 4px', border: BORDER, fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((b, i) => {
              const money = (v: number) => (b.detail ? fmt(v) : '—');
              return (
                <tr key={b.id}>
                  <td style={{ ...cell, textAlign: 'left', whiteSpace: 'normal', fontWeight: 700, minWidth: 130 }}>{i + 1}. {b.name}</td>
                  <td style={{ ...cell, textAlign: 'left', whiteSpace: 'normal' }}>{b.loc || '—'}</td>
                  <td style={cell}>{money(b.base)}</td>
                  <td style={cell}>{money(b.deed)}</td>
                  <td style={cell}>{money(b.municipality)}</td>
                  <td style={cell}>{money(b.transport)}</td>
                  <td style={cell}>
                    {money(b.infoCenter + b.union)}
                    {b.detail && <div style={{ fontSize: 11, opacity: 0.65 }}>{fmt(b.infoCenter)} + {fmt(b.union)}</div>}
                  </td>
                  <td style={{ ...cell, fontWeight: 700 }}>{fmt(b.total)}{b.total !== b.calc && ' ✎'}</td>
                  <td style={{ ...cell, fontWeight: 700 }}>{fmt(b.gross)}</td>
                </tr>
              );
            })}
            <tr style={{ background: 'rgba(127,127,127,0.12)', fontWeight: 700 }}>
              <td style={{ ...cell, textAlign: 'left' }} colSpan={2}>TOPLAM</td>
              <td style={cell}>{fmt(totals.base)}</td>
              <td style={cell}>{fmt(totals.deed)}</td>
              <td style={cell}>{fmt(totals.municipality)}</td>
              <td style={cell}>{fmt(totals.transport)}</td>
              <td style={cell}>{fmt(totals.infoCenter + totals.union)}</td>
              <td style={cell}>{fmt(totals.total)}</td>
              <td style={cell}>{fmt(totals.gross)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {totals.total !== totals.calc && (
        <span className="field__hint" style={{ display: 'block', marginTop: 6 }}>
          ✎ Elle girilen tutar var: hesaplanan toplam {fmt(totals.calc)}, müşteriye giden {fmt(totals.total)}.
        </span>
      )}
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn--secondary btn--sm" onClick={handleExcel}>
          <DownloadIcon width={14} height={14} /> Excel olarak indir
        </button>
      </div>
    </div>
  );
}
