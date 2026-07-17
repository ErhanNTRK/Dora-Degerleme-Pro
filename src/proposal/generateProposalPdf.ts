import { jsPDF } from 'jspdf';
import type { CompanyProfile, CustomerInfo } from '../types/profile';
import { registerReportFonts, detectImageFormat } from '../pdf/generateReportPdf';
import { LOGO_BASE64 } from '../pdf/fonts/logoBase64';
import { buildProposalContent, type ProposalPricing, type PropertyDetailLine, type ProposalContentOptions } from './buildProposalContent';
import { formatTL } from '../utils/format';
import { buildProposalFileName } from '../utils/proposalHelpers';

const NAVY: [number, number, number] = [15, 42, 71];
const GRAY: [number, number, number] = [86, 103, 122];
const AMBER: [number, number, number] = [224, 160, 61];

interface ProposalPdfOpts {
  customer: CustomerInfo;
  company: CompanyProfile;
  tariffYear: number;
  pricing: ProposalPricing;
  propertyDetailLines?: PropertyDetailLine[];
  contentOptions?: ProposalContentOptions;
}

/**
 * Yerleşim metrikleri. Kompakt modda YALNIZCA boşluklar daralır; yazı tipi boyutları,
 * renkler ve görsel öğeler birebir aynı kalır. Amaç: mümkünse tek sayfa.
 */
const LAYOUT = {
  normal:  { startY: 16, logoSize: 30, headerBlock: 36, afterDivider: 10, titleSize: 19, titleGap: 12, salutationGap: 9, paraLine: 5.7, paraGap: 5.5, svcLine: 5.2, svcGap: 2, feeSepGap: 3.5, boxH: 34, boxRow1: 8, boxRow2: 14.5, boxSep: 18.5, boxTotal: 25.5, boxWords: 31, boxGap: 8, detailLine: 4.8, sigGap: 6 },
  compact: { startY: 12, logoSize: 24, headerBlock: 29, afterDivider: 7,  titleSize: 17, titleGap: 8.5, salutationGap: 7, paraLine: 5.2, paraGap: 3,   svcLine: 4.9, svcGap: 1.2, feeSepGap: 2.4, boxH: 28, boxRow1: 6.5, boxRow2: 12,  boxSep: 15.3, boxTotal: 21.2, boxWords: 25.6, boxGap: 5, detailLine: 4.3, sigGap: 4.5 },
} as const;

type LayoutMetrics = (typeof LAYOUT)[keyof typeof LAYOUT];

export function buildProposalPdfDoc(opts: ProposalPdfOpts): jsPDF {
  // İki geçişli yerleşim: önce ferah ölçülerle dene; birden fazla sayfaya taşarsa
  // kompakt ölçülerle yeniden çiz. Kompakt da tek sayfaya sığmıyorsa ferah iki
  // sayfalı hâl korunur (sıkışık çok sayfalı belge en kötü sonuçtur).
  const normal = renderProposalPdf(opts, LAYOUT.normal);
  if (normal.getNumberOfPages() <= 1) return normal;
  const compact = renderProposalPdf(opts, LAYOUT.compact);
  return compact.getNumberOfPages() <= 1 ? compact : normal;
}

/** Kurumsal bölüm başlığı: küçük amber blok + lacivert başlık. */
function drawSectionTitle(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFillColor(...AMBER);
  doc.rect(x, y - 3, 2.2, 3.6, 'F');
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(text, x + 4.2, y);
}

function renderProposalPdf({ customer, company, tariffYear, pricing, propertyDetailLines = [], contentOptions = {} }: ProposalPdfOpts, m: LayoutMetrics): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  registerReportFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let y: number = m.startY;

  // ---------- Üst blok: büyük logo + dikey ortalanmış firma künyesi ----------
  const logoSize = m.logoSize;
  try {
    const logoSrc = company.logoDataUrl || LOGO_BASE64;
    doc.addImage(logoSrc, detectImageFormat(logoSrc), margin, y, logoSize, logoSize);
  } catch {
    /* yoksay */
  }
  const infoX = margin + logoSize + 6;
  const infoW = pageWidth - margin - infoX;
  // Künye satır sayısına göre dikey ortala
  const contactLine = [company.address, company.phone, company.email].filter(Boolean).join('  •  ');
  const taxLine = [company.taxOffice && `V.D.: ${company.taxOffice}`, company.taxNumber && `VKN: ${company.taxNumber}`]
    .filter(Boolean)
    .join('  •  ');
  const infoLines = 1 + (contactLine ? 1 : 0) + (taxLine ? 1 : 0);
  let infoY = y + logoSize / 2 - (infoLines - 1) * 2.6 + 1.5;
  doc.setTextColor(...NAVY);
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(14.5);
  doc.text(company.companyName, infoX, infoY, { maxWidth: infoW });
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  if (contactLine) {
    infoY += 5.6;
    doc.text(contactLine, infoX, infoY, { maxWidth: infoW });
  }
  if (taxLine) {
    infoY += 4.6;
    doc.text(taxLine, infoX, infoY);
  }

  y += m.headerBlock;
  // Çift tonlu ayraç: kalın lacivert + hemen altında ince amber (kurumsal kimlik)
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.9);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setDrawColor(...AMBER);
  doc.setLineWidth(0.4);
  doc.line(margin, y + 1.1, pageWidth - margin, y + 1.1);
  y += m.afterDivider;

  // ---------- Başlık ----------
  const { salutation, paragraphs, serviceLines, serviceFeeItems, proposalDate, amountInWords } = buildProposalContent(
    customer, company, tariffYear, pricing, propertyDetailLines, contentOptions
  );

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(m.titleSize);
  doc.setTextColor(...NAVY);
  doc.text('FİYAT TEKLİFİ', margin, y);
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text(`Teklif Tarihi: ${proposalDate}`, pageWidth - margin, y, { align: 'right' });
  y += 3.2;
  doc.setDrawColor(...AMBER);
  doc.setLineWidth(1.2);
  doc.line(margin, y, margin + 40, y);
  y += m.titleGap;

  // ---------- Gövde ----------
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(salutation, margin, y);
  y += m.salutationGap;

  const bodyWidth = pageWidth - margin * 2;
  const writeParagraph = (para: string) => {
    if (y > pageHeight - 60) {
      doc.addPage();
      y = 24;
    }
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(30, 41, 59);
    const lines = doc.splitTextToSize(para, bodyWidth);
    doc.text(para, margin, y, { maxWidth: bodyWidth, align: 'justify' });
    y += lines.length * m.paraLine + m.paraGap;
  };

  writeParagraph(paragraphs[0] ?? '');

  // Hizmet ve Ücret Dökümü (çoklu teklif) — rapor başına müşteri tutarı; iç kalem değildir
  if (serviceFeeItems.length > 0) {
    if (y > pageHeight - 60) {
      doc.addPage();
      y = 24;
    }
    drawSectionTitle(doc, 'HİZMET VE ÜCRET DÖKÜMÜ', margin, y);
    y += 6.5;
    doc.setFontSize(9.8);
    serviceFeeItems.forEach((item, i) => {
      if (y > pageHeight - 50) {
        doc.addPage();
        y = 24;
      }
      doc.setFont('Roboto', 'normal');
      doc.setTextColor(30, 41, 59);
      const labelWrapped = doc.splitTextToSize(`${i + 1}.  ${item.label}`, bodyWidth - 42);
      doc.text(labelWrapped, margin + 2, y);
      doc.setFont('Roboto', 'bold');
      doc.text(formatTL(item.amount), margin + bodyWidth - 2, y, { align: 'right' });
      y += labelWrapped.length * m.svcLine + 1.5;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(margin + 2, y, margin + bodyWidth - 2, y);
      y += m.feeSepGap;
    });
    y += 4;
  }

  // Hizmet Kapsamı (çoklu hizmet görünümü) — tutar içermez, yalnızca hizmet tanımları
  if (serviceLines.length > 0) {
    if (y > pageHeight - 60) {
      doc.addPage();
      y = 24;
    }
    drawSectionTitle(doc, 'HİZMET KAPSAMI', margin, y);
    y += 6;
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    serviceLines.forEach((line, i) => {
      if (y > pageHeight - 50) {
        doc.addPage();
        y = 24;
      }
      const wrapped = doc.splitTextToSize(`${i + 1}.  ${line}`, bodyWidth - 4);
      doc.text(wrapped, margin + 2, y);
      y += wrapped.length * m.svcLine + m.svcGap;
    });
    y += 5;
  }

  for (const para of paragraphs.slice(1)) {
    writeParagraph(para);
  }

  // ---------- Tutar kutusu ----------
  if (y > pageHeight - 70) {
    doc.addPage();
    y = 24;
  }
  y += 2;
  const boxH = m.boxH;
  const boxW = pageWidth - margin * 2;
  doc.setFillColor(...NAVY);
  doc.roundedRect(margin, y, boxW, boxH, 2, 2, 'F');
  const rowX1 = margin + 6;
  const rowX2 = margin + boxW - 6;
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(226, 232, 240);
  doc.text('Toplam Maliyet', rowX1, y + m.boxRow1);
  doc.text(formatTL(pricing.offerAmount), rowX2, y + m.boxRow1, { align: 'right' });
  doc.text(`KDV (%${pricing.vatRatePercent})`, rowX1, y + m.boxRow2);
  doc.text(formatTL(pricing.vatAmount), rowX2, y + m.boxRow2, { align: 'right' });
  doc.setDrawColor(...AMBER);
  doc.setLineWidth(0.4);
  doc.line(rowX1, y + m.boxSep, rowX2, y + m.boxSep);
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...AMBER);
  doc.text('GENEL TOPLAM (KDV DAHİL)', rowX1, y + m.boxTotal);
  doc.setFontSize(13.5);
  doc.setTextColor(255, 255, 255);
  doc.text(formatTL(pricing.grandTotal), rowX2, y + m.boxTotal + 0.5, { align: 'right' });
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...AMBER);
  doc.text(amountInWords, rowX2, y + m.boxWords, { align: 'right', maxWidth: boxW - 12 });
  y += boxH + m.boxGap;

  // ---------- Taşınmaz detayları (yalnızca doluysa) ----------
  if (propertyDetailLines.length > 0) {
    if (y > pageHeight - 50) {
      doc.addPage();
      y = 24;
    }
    drawSectionTitle(doc, 'TAŞINMAZ BİLGİLERİ', margin, y);
    y += 6;
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    for (const line of propertyDetailLines) {
      const text = `${line.label}: ${line.parts.join(', ')}`;
      const wrapped = doc.splitTextToSize(text, pageWidth - margin * 2);
      if (y > pageHeight - 40) {
        doc.addPage();
        y = 24;
      }
      doc.text(wrapped, margin, y);
      y += wrapped.length * m.detailLine + 2;
    }
    y += 4;
  }

  if (y > pageHeight - 50) {
    doc.addPage();
    y = 24;
  }

  // ---------- İmza / Yetkili bloğu ----------
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...GRAY);
  doc.text('Saygılarımızla,', margin, y);
  y += m.sigGap;
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(company.companyName, margin, y);
  y += m.sigGap;
  if (company.signatureDataUrl) {
    try {
      doc.addImage(company.signatureDataUrl, detectImageFormat(company.signatureDataUrl), margin, y, 40, 16);
      y += 18;
    } catch {
      /* yoksay */
    }
  }
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...GRAY);
  if (company.authorizedName) {
    doc.text(company.authorizedName, margin, y);
    y += 4.5;
  }
  if (company.authorizedTitle) {
    doc.text(company.authorizedTitle, margin, y);
    y += 4.5;
  }

  // ---------- Teklif alt notu ----------
  if (company.proposalFooterNote?.trim()) {
    y += 6;
    if (y > pageHeight - 25) {
      doc.addPage();
      y = 24;
    }
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    const noteLines = doc.splitTextToSize(company.proposalFooterNote.trim(), pageWidth - margin * 2);
    doc.text(noteLines, margin, y);
  }

  // ---------- Alt bilgi (tüm sayfalar): künye solda, sayfa numarası sağda ----------
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 13.5, pageWidth - margin, pageHeight - 13.5);
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(`${company.companyName} — Fiyat Teklifi`, margin, pageHeight - 10);
    doc.text(`Sayfa ${i} / ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
  }

  return doc;
}

export function buildProposalPdfBlob(opts: ProposalPdfOpts): { blob: Blob; fileName: string } {
  const doc = buildProposalPdfDoc(opts);
  return { blob: doc.output('blob'), fileName: buildProposalFileName(opts.customer, 'pdf') };
}

export async function generateProposalPdf(opts: ProposalPdfOpts) {
  const doc = buildProposalPdfDoc(opts);
  doc.save(buildProposalFileName(opts.customer, 'pdf'));
}
