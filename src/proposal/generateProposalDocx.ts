import type { CompanyProfile, CustomerInfo } from '../types/profile';
import { buildProposalContent, type ProposalPricing, type PropertyDetailLine, type ProposalContentOptions } from './buildProposalContent';
import { formatTL } from '../utils/format';
import { buildProposalFileName } from '../utils/proposalHelpers';

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface ProposalDocxOpts {
  customer: CustomerInfo;
  company: CompanyProfile;
  tariffYear: number;
  pricing: ProposalPricing;
  propertyDetailLines?: PropertyDetailLine[];
  contentOptions?: ProposalContentOptions;
}

/**
 * 'docx' kütüphanesi büyük olduğu için yalnızca Word oluşturma talep edildiğinde
 * dinamik olarak yüklenir (ilk açılış performansını korumak için).
 */
export async function buildProposalDocxBlob({ customer, company, tariffYear, pricing, propertyDetailLines = [], contentOptions = {} }: ProposalDocxOpts): Promise<{ blob: Blob; fileName: string }> {
  const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel, BorderStyle } = await import('docx');
  const { salutation, paragraphs, serviceLines, serviceFeeItems, proposalDate, amountInWords } = buildProposalContent(customer, company, tariffYear, pricing, propertyDetailLines, contentOptions);

  const children: InstanceType<typeof Paragraph>[] = [];

  if (company.logoDataUrl) {
    try {
      children.push(
        new Paragraph({
          children: [new ImageRun({ data: dataUrlToUint8Array(company.logoDataUrl), transformation: { width: 90, height: 90 }, type: 'png' })],
        })
      );
    } catch {
      /* logo eklenemezse sessizce devam */
    }
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 80 },
      children: [new TextRun({ text: company.companyName, bold: true, color: '0F2A47', size: 26 })],
    })
  );

  const contactLine = [company.address, company.phone, company.email].filter(Boolean).join('  •  ');
  if (contactLine) {
    children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: contactLine, size: 18, color: '56677A' })] }));
  }
  const taxLine = [company.taxOffice && `V.D.: ${company.taxOffice}`, company.taxNumber && `VKN: ${company.taxNumber}`].filter(Boolean).join('  •  ');
  if (taxLine) {
    children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: taxLine, size: 18, color: '56677A' })] }));
  }

  children.push(
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '0F2A47' } },
      spacing: { after: 200 },
      children: [new TextRun({ text: '' })],
    })
  );

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 40 },
      children: [new TextRun({ text: 'FİYAT TEKLİFİ', bold: true, color: '0F2A47', size: 32 })],
    })
  );
  children.push(
    new Paragraph({
      spacing: { after: 260 },
      children: [new TextRun({ text: `Teklif Tarihi: ${proposalDate}`, color: '56677A', size: 18 })],
    })
  );

  children.push(new Paragraph({ spacing: { after: 180 }, children: [new TextRun({ text: salutation, bold: true, size: 22, color: '0F2A47' })] }));

  const bodyParagraph = (text: string) =>
    new Paragraph({
      spacing: { after: 180, line: 300 },
      alignment: AlignmentType.JUSTIFIED,
      children: [new TextRun({ text, size: 21 })],
    });

  if (paragraphs[0]) children.push(bodyParagraph(paragraphs[0]));

  // Hizmet ve Ücret Dökümü (çoklu teklif) — rapor başına müşteri tutarı
  if (serviceFeeItems.length > 0) {
    children.push(
      new Paragraph({ spacing: { before: 60, after: 80 }, children: [new TextRun({ text: 'HİZMET VE ÜCRET DÖKÜMÜ', bold: true, size: 21, color: '0F2A47' })] })
    );
    serviceFeeItems.forEach((item, i) => {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' } },
          tabStops: [{ type: 'right' as const, position: 9000 }],
          children: [
            new TextRun({ text: `${i + 1}.  ${item.label}`, size: 20 }),
            new TextRun({ text: `\t${formatTL(item.amount)}`, bold: true, size: 20 }),
          ],
        })
      );
    });
    children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: '' })] }));
  }

  // Hizmet Kapsamı (çoklu hizmet görünümü) — tutar içermez
  if (serviceLines.length > 0) {
    children.push(
      new Paragraph({ spacing: { before: 60, after: 80 }, children: [new TextRun({ text: 'HİZMET KAPSAMI', bold: true, size: 21, color: '0F2A47' })] })
    );
    serviceLines.forEach((line, i) => {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          indent: { left: 240 },
          children: [new TextRun({ text: `${i + 1}.  ${line}`, size: 20 })],
        })
      );
    });
    children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: '' })] }));
  }

  for (const para of paragraphs.slice(1)) {
    children.push(bodyParagraph(para));
  }

  // ---------- Tutar bloğu: Toplam Maliyet / KDV / Genel Toplam ----------
  const amountRow = (label: string, value: string, opts: { bold?: boolean; color?: string; size?: number; topBorder?: boolean } = {}) =>
    new Paragraph({
      spacing: { after: 40 },
      border: opts.topBorder ? { top: { style: BorderStyle.SINGLE, size: 4, color: 'E0A03D' } } : undefined,
      tabStops: [{ type: 'right' as const, position: 9000 }],
      children: [
        new TextRun({ text: label, bold: opts.bold ?? false, size: opts.size ?? 20, color: opts.color ?? '16232E' }),
        new TextRun({ text: `\t${value}`, bold: opts.bold ?? false, size: opts.size ?? 20, color: opts.color ?? '16232E' }),
      ],
    });

  children.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: '' })] }));
  children.push(amountRow('Toplam Maliyet', formatTL(pricing.offerAmount)));
  children.push(amountRow(`KDV (%${pricing.vatRatePercent})`, formatTL(pricing.vatAmount)));
  children.push(amountRow('GENEL TOPLAM (KDV DAHİL)', formatTL(pricing.grandTotal), { bold: true, color: '0F2A47', size: 24, topBorder: true }));
  children.push(
    new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: amountInWords, italics: true, size: 19, color: '56677A' })],
    })
  );

  // ---------- Taşınmaz detayları ----------
  if (propertyDetailLines.length > 0) {
    children.push(
      new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: 'TAŞINMAZ BİLGİLERİ', bold: true, size: 21, color: '0F2A47' })] })
    );
    for (const line of propertyDetailLines) {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: `${line.label}: `, bold: true, size: 19 }), new TextRun({ text: line.parts.join(', '), size: 19 })],
        })
      );
    }
    children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: '' })] }));
  }

  children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Saygılarımızla,', size: 20, color: '56677A' })] }));
  children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: company.companyName, bold: true, size: 21, color: '0F2A47' })] }));

  if (company.signatureDataUrl) {
    try {
      children.push(
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new ImageRun({ data: dataUrlToUint8Array(company.signatureDataUrl), transformation: { width: 140, height: 55 }, type: 'png' })],
        })
      );
    } catch {
      /* imza eklenemezse sessizce devam */
    }
  }

  if (company.authorizedName) {
    children.push(new Paragraph({ children: [new TextRun({ text: company.authorizedName, size: 19, color: '56677A' })] }));
  }
  if (company.authorizedTitle) {
    children.push(new Paragraph({ children: [new TextRun({ text: company.authorizedTitle, size: 19, color: '56677A' })] }));
  }

  if (company.proposalFooterNote?.trim()) {
    children.push(
      new Paragraph({
        spacing: { before: 200 },
        children: [new TextRun({ text: company.proposalFooterNote.trim(), size: 16, color: '8B98A8', italics: true })],
      })
    );
  }

  children.push(
    new Paragraph({
      spacing: { before: 300 },
      children: [new TextRun({ text: 'Dora Değerleme Pro v1.1 — Profesyonel Değerleme ve Teklif Yönetim Sistemi', size: 14, color: '8B98A8', italics: true })],
    })
  );

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  return { blob, fileName: buildProposalFileName(customer, 'docx') };
}
