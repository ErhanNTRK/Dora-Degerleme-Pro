import { jsPDF } from 'jspdf';
import type { CalculationInput, CalculationResult } from '../types/calculation';
import type { CompanyProfile } from '../types/profile';
import { ROBOTO_REGULAR_BASE64 } from './fonts/robotoRegularBase64';
import { ROBOTO_BOLD_BASE64 } from './fonts/robotoBoldBase64';
import { LOGO_BASE64 } from './fonts/logoBase64';
import { formatTL } from '../utils/format';

const NAVY: [number, number, number] = [15, 42, 71];
const NAVY_LIGHT: [number, number, number] = [232, 240, 249];
const AMBER: [number, number, number] = [224, 160, 61];
const GRAY: [number, number, number] = [86, 103, 122];
const BORDER: [number, number, number] = [226, 232, 240];

export function registerReportFonts(doc: jsPDF) {
  doc.addFileToVFS('Roboto-Regular.ttf', ROBOTO_REGULAR_BASE64);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFileToVFS('Roboto-Bold.ttf', ROBOTO_BOLD_BASE64);
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  doc.setFont('Roboto', 'normal');
}

interface GenerateOpts {
  title: string;
  input: CalculationInput;
  result: CalculationResult;
  tariffYear: number;
  company: CompanyProfile;
}

function drawFooterBranding(doc: jsPDF, pageWidth: number, pageHeight: number) {
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text('Dora Değerleme Pro ile oluşturulmuştur.', pageWidth - 16, pageHeight - 8, { align: 'right' });
}

export function buildReportPdfDoc({ title, input, result, tariffYear, company }: GenerateOpts): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  registerReportFonts(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  let y = 0;

  // ---------- Üst başlık şeridi ----------
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 32, 'F');
  try {
    doc.addImage(company.logoDataUrl || LOGO_BASE64, 'JPEG', margin, 5, 22, 22);
  } catch {
    /* logo yüklenemezse sessizce devam */
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(14);
  doc.text(company.companyName.toLocaleUpperCase('tr'), margin + 27, 14);
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(9.5);
  doc.text(`${tariffYear} Yılı Gayrimenkul Değerleme Asgari Ücret Hesaplaması`, margin + 27, 20.5);

  const now = new Date();
  const dateStr = now.toLocaleDateString('tr-TR');
  const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  doc.setFontSize(8.5);
  doc.text(`Tarih: ${dateStr}   Saat: ${timeStr}`, pageWidth - margin, 14, { align: 'right' });

  y = 42;
  doc.setTextColor(...NAVY);
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(13);
  doc.text(title, margin, y);
  y += 8;

  // ---------- Taşınmaz Bilgileri ----------
  doc.setFillColor(...NAVY_LIGHT);
  doc.rect(margin, y, pageWidth - margin * 2, 7, 'F');
  doc.setTextColor(...NAVY);
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(10);
  doc.text('TAŞINMAZ BİLGİLERİ', margin + 2, y + 5);
  y += 12;

  doc.setFont('Roboto', 'normal');
  doc.setFontSize(9);

  for (const b of result.propertyBreakdowns) {
    if (y > pageHeight - 40) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('Roboto', 'bold');
    doc.setTextColor(...NAVY);
    doc.text(`${b.label}`, margin, y);
    doc.setFont('Roboto', 'normal');
    doc.setTextColor(...GRAY);
    const areaText = b.area ? `  •  ${b.area} m²` : '';
    doc.text(`${b.groupName} — ${b.subtypeName}${areaText}`, margin, y + 4.5);
    doc.setTextColor(...NAVY);
    doc.setFont('Roboto', 'bold');
    doc.text(formatTL(b.finalFee), pageWidth - margin, y + 2, { align: 'right' });
    y += 10;
    doc.setDrawColor(...BORDER);
    doc.line(margin, y - 3, pageWidth - margin, y - 3);
  }

  y += 4;

  // ---------- Ücret Dökümü ----------
  if (y > pageHeight - 90) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(...NAVY_LIGHT);
  doc.rect(margin, y, pageWidth - margin * 2, 7, 'F');
  doc.setTextColor(...NAVY);
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(10);
  doc.text('ÜCRET DÖKÜMÜ', margin + 2, y + 5);
  y += 12;

  // Not: Toplu değerleme indirimi hesaplamaya dahildir ancak müşteri çıktısında ayrı satır
  // olarak gösterilmez (yalnızca taşınmaz bazlı nihai ücretler görünür).
  const rows: [string, string][] = [
    [`Tapu Harcı (${input.titleDeedCount} tapu)`, formatTL(result.titleDeedFeeTotal)],
    ['Gayrimenkul Bilgi Merkezi Payı', formatTL(result.infoCenterFee)],
    ['TDUB Birlik Payı', formatTL(result.unionFee)],
    ['Ulaşım Bedeli', formatTL(result.transportFee)],
    ['Belediye Harcı', formatTL(result.municipalityFee)],
  ];
  if (result.otherFeesTotal > 0) rows.push(['Diğer Harçlar', formatTL(result.otherFeesTotal)]);

  doc.setFont('Roboto', 'normal');
  doc.setFontSize(9.5);
  for (const [label, value] of rows) {
    doc.setTextColor(...GRAY);
    doc.text(label, margin, y);
    doc.setTextColor(...NAVY);
    doc.text(value, pageWidth - margin, y, { align: 'right' });
    y += 6.5;
    doc.setDrawColor(...BORDER);
    doc.line(margin, y - 3, pageWidth - margin, y - 3);
  }

  y += 2;
  doc.setFont('Roboto', 'normal');
  doc.setTextColor(...GRAY);
  doc.text('Ara Toplam', margin, y);
  doc.setTextColor(...NAVY);
  doc.text(formatTL(result.subtotal), pageWidth - margin, y, { align: 'right' });
  y += 6.5;
  doc.setTextColor(...GRAY);
  doc.text(`KDV (%${result.vatRatePercent})`, margin, y);
  doc.setTextColor(...NAVY);
  doc.text(formatTL(result.vatAmount), pageWidth - margin, y, { align: 'right' });
  y += 8;

  // ---------- Genel Toplam kutusu ----------
  doc.setFillColor(...NAVY);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 16, 2, 2, 'F');
  doc.setTextColor(...AMBER);
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(11);
  doc.text('ASGARİ HİZMET BEDELİ (GENEL TOPLAM)', margin + 5, y + 10);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text(formatTL(result.grandTotal), pageWidth - margin - 5, y + 10.5, { align: 'right' });
  y += 24;

  // ---------- Alt bilgi ----------
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text(
    `Bu belge ${company.companyName} tarafından SPK ${tariffYear} Yılı Gayrimenkul Değerleme Asgari Ücret Tarifesi esas alınarak oluşturulmuştur.`,
    margin,
    pageHeight - 12,
    { maxWidth: pageWidth - margin * 2 }
  );
  drawFooterBranding(doc, pageWidth, pageHeight);

  return doc;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '_') || 'degerleme-ucret-hesabi';
}

export function buildReportPdfBlob(opts: GenerateOpts): { blob: Blob; fileName: string } {
  const doc = buildReportPdfDoc(opts);
  const blob = doc.output('blob');
  return { blob, fileName: `${sanitizeFileName(opts.title)}.pdf` };
}

export async function generateReportPdf(opts: GenerateOpts) {
  const doc = buildReportPdfDoc(opts);
  doc.save(`${sanitizeFileName(opts.title)}.pdf`);
}
