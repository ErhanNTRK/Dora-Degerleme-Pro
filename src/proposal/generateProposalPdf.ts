import { jsPDF } from 'jspdf';
import type { CompanyProfile, CustomerInfo } from '../types/profile';
import { registerReportFonts } from '../pdf/generateReportPdf';
import { LOGO_BASE64 } from '../pdf/fonts/logoBase64';
import { buildProposalContent, type ProposalPricing, type PropertyDetailLine } from './buildProposalContent';
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
}

export function buildProposalPdfDoc({ customer, company, tariffYear, pricing, propertyDetailLines = [] }: ProposalPdfOpts): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  registerReportFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let y = 20;

  // ---------- Üst logo + firma bilgisi ----------
  try {
    doc.addImage(company.logoDataUrl || LOGO_BASE64, 'JPEG', margin, y, 20, 20);
  } catch {
    /* yoksay */
  }
  doc.setTextColor(...NAVY);
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(13);
  doc.text(company.companyName, margin + 25, y + 7);
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  const contactLine = [company.address, company.phone, company.email].filter(Boolean).join('  •  ');
  if (contactLine) doc.text(contactLine, margin + 25, y + 12, { maxWidth: pageWidth - margin * 2 - 25 });
  const taxLine = [company.taxOffice && `V.D.: ${company.taxOffice}`, company.taxNumber && `VKN: ${company.taxNumber}`]
    .filter(Boolean)
    .join('  •  ');
  if (taxLine) doc.text(taxLine, margin + 25, y + 16.5);

  y += 28;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // ---------- Başlık ----------
  const { salutation, paragraphs, proposalDate, amountInWords } = buildProposalContent(customer, company, tariffYear, pricing, propertyDetailLines);

  doc.setFont('Roboto', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...NAVY);
  doc.text('FİYAT TEKLİFİ', margin, y);
  y += 6;
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text(`Teklif Tarihi: ${proposalDate}`, margin, y);
  y += 12;

  // ---------- Gövde ----------
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(salutation, margin, y);
  y += 9;

  doc.setFont('Roboto', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);
  for (const para of paragraphs) {
    if (y > pageHeight - 60) {
      doc.addPage();
      y = 24;
    }
    const lines = doc.splitTextToSize(para, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 5.6 + 5;
  }

  // ---------- Tutar kutusu ----------
  if (y > pageHeight - 70) {
    doc.addPage();
    y = 24;
  }
  y += 2;
  doc.setFillColor(...NAVY);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 22, 2, 2, 'F');
  doc.setTextColor(...AMBER);
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(10);
  doc.text('TOPLAM TUTAR (KDV DAHİL)', margin + 5, y + 8);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text(`${pricing.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, margin + 5, y + 17);
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...AMBER);
  doc.text(amountInWords, pageWidth - margin - 5, y + 17, { align: 'right', maxWidth: 85 });
  y += 30;

  // ---------- Taşınmaz detayları (yalnızca doluysa) ----------
  if (propertyDetailLines.length > 0) {
    if (y > pageHeight - 50) {
      doc.addPage();
      y = 24;
    }
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...NAVY);
    doc.text('TAŞINMAZ BİLGİLERİ', margin, y);
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
      y += wrapped.length * 4.8 + 2;
    }
    y += 4;
  }

  if (y > pageHeight - 50) {
    doc.addPage();
    y = 24;
  }

  // ---------- İmza / Yetkili bloğu ----------
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(company.companyName, margin, y);
  y += 6;
  if (company.signatureDataUrl) {
    try {
      doc.addImage(company.signatureDataUrl, 'PNG', margin, y, 40, 16);
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

  // ---------- Alt bilgi ----------
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GRAY);
  doc.text('Dora Değerleme Pro v1.1', pageWidth - margin, pageHeight - 12, { align: 'right' });
  doc.text('Profesyonel Değerleme ve Teklif Yönetim Sistemi', pageWidth - margin, pageHeight - 8.5, { align: 'right' });

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
