import type { CalculationResult } from '../types/calculation';
import type { CompanyProfile, CustomerInfo } from '../types/profile';
import { formatTL } from '../utils/format';
import { amountToTurkishWords } from '../utils/turkishNumberToWords';

export interface ProposalPricing {
  /** Kullanıcının manuel girdiği/değiştirdiği, müşteriye sunulacak hizmet bedeli. */
  offerAmount: number;
  vatRatePercent: number;
  vatAmount: number;
  /** Hizmet Bedeli + KDV. Tapu harcı, belediye harcı, ulaşım, TDUB/bilgi merkezi payı ve diğer
   *  harçlar KESİNLİKLE dahil edilmez — bu kalemler müşteriye asla gösterilmez. */
  grandTotal: number;
}

/**
 * Teklif fiyatlaması, hesaplama motorunun iç kalemlerinden (tapu harcı, belediye harcı vb.)
 * tamamen bağımsızdır. Yalnızca kullanıcının girdiği Hizmet Bedeli ve KDV oranı kullanılır.
 */
export function computeProposalPricing(offerAmount: number, vatRatePercent: number): ProposalPricing {
  const vatAmount = Math.round(offerAmount * (vatRatePercent / 100) * 100) / 100;
  const grandTotal = Math.round((offerAmount + vatAmount) * 100) / 100;
  return { offerAmount, vatRatePercent, vatAmount, grandTotal };
}

export function computeAsgariHizmetBedeli(result: CalculationResult): number {
  return result.propertyBreakdowns.reduce((sum, b) => sum + b.finalFee, 0);
}

export interface PropertyDetailLine {
  label: string;
  parts: string[];
}

/** Yalnızca doldurulmuş isteğe bağlı taşınmaz bilgilerini (mahalle/ada/parsel vb.) döndürür. */
export function collectPropertyDetailLines(properties: CalculationResult['propertyBreakdowns'], rawProperties: Array<{ id: string; mahalle?: string; ada?: string; parsel?: string; pafta?: string; bagimsizBolum?: string; acikAdres?: string }>): PropertyDetailLine[] {
  const lines: PropertyDetailLine[] = [];
  for (const b of properties) {
    const raw = rawProperties.find((r) => r.id === b.propertyId);
    if (!raw) continue;
    const parts: string[] = [];
    if (raw.mahalle) parts.push(`Mahalle: ${raw.mahalle}`);
    if (raw.ada) parts.push(`Ada: ${raw.ada}`);
    if (raw.parsel) parts.push(`Parsel: ${raw.parsel}`);
    if (raw.pafta) parts.push(`Pafta: ${raw.pafta}`);
    if (raw.bagimsizBolum) parts.push(`Bağımsız Bölüm: ${raw.bagimsizBolum}`);
    if (raw.acikAdres) parts.push(`Adres: ${raw.acikAdres}`);
    if (parts.length > 0) lines.push({ label: b.label, parts });
  }
  return lines;
}

export interface ProposalContent {
  salutation: string;
  paragraphs: string[];
  amountInWords: string;
  proposalDate: string;
  plainText: string;
}

function buildSalutation(customer: CustomerInfo): string {
  if (customer.customerType === 'kurumsal') {
    if (customer.companyName.trim()) return `Sayın ${customer.companyName.trim()} Yetkilisi,`;
    if (customer.customerName.trim()) return `Sayın ${customer.customerName.trim()},`;
  } else {
    if (customer.customerName.trim()) return `Sayın ${customer.customerName.trim()},`;
    if (customer.companyName.trim()) return `Sayın ${customer.companyName.trim()} Yetkilisi,`;
  }
  return 'Sayın İlgili,';
}

export function buildProposalContent(
  customer: CustomerInfo,
  company: CompanyProfile,
  tariffYear: number,
  pricing: ProposalPricing,
  propertyDetailLines: PropertyDetailLine[] = []
): ProposalContent {
  const salutation = buildSalutation(customer);
  const proposalDate = new Date().toLocaleDateString('tr-TR');
  const amountInWords = amountToTurkishWords(pricing.grandTotal);

  const subjectPieces: string[] = [];
  if (customer.reportSubject.trim()) subjectPieces.push(customer.reportSubject.trim());
  if (customer.propertySummary.trim()) subjectPieces.push(customer.propertySummary.trim());
  const subjectDetail = subjectPieces.length > 0 ? ` (${subjectPieces.join(' — ')})` : '';

  const paragraphs: string[] = [
    `Talep etmiş olduğunuz gayrimenkul değerleme hizmetine${subjectDetail} ilişkin teklifimizi bilgilerinize sunarız.`,
    `Değerleme çalışması, Sermaye Piyasası Kurulu (SPK) ve Türkiye Değerleme Uzmanları Birliği (TDUB) mevzuatına, ${tariffYear} Yılı Gayrimenkul Değerleme Asgari Ücret Tarifesi'ne uygun olarak, lisanslı değerleme uzmanlarımız tarafından yürütülecektir.`,
    `Hizmet bedeli ${formatTL(pricing.offerAmount)} + KDV (%${pricing.vatRatePercent}) olup, toplam tutar ${formatTL(pricing.grandTotal)} ${amountInWords} olarak hesaplanmıştır. Tapu harcı, belediye harcı ve sair resmî giderler bu tutara dahil değildir; ilgili kurumlara ayrıca ödenir.`,
    company.iban.trim()
      ? `Ödeme, aşağıda yer alan IBAN numarasına yapılabilir: ${company.iban.trim()}`
      : 'Ödeme bilgileri, teklifin onaylanmasının ardından tarafınızla ayrıca paylaşılacaktır.',
    'Teklifimizin değerlendirilmesini rica eder, çalışmalarımızda başarılar dileriz.',
  ];

  const propertyDetailText =
    propertyDetailLines.length > 0
      ? ['', 'Taşınmaz Bilgileri:', ...propertyDetailLines.map((l) => `${l.label}: ${l.parts.join(', ')}`)]
      : [];

  const footerNote = company.proposalFooterNote?.trim();

  const plainText = [
    `Teklif Tarihi: ${proposalDate}`,
    '',
    salutation,
    '',
    ...paragraphs,
    ...propertyDetailText,
    '',
    footerNote ?? '',
    '',
    company.companyName,
    company.authorizedName ? `${company.authorizedName}${company.authorizedTitle ? ' — ' + company.authorizedTitle : ''}` : '',
  ]
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
    .join('\n')
    .trim();

  return { salutation, paragraphs, amountInWords, proposalDate, plainText };
}

/** "Kopyala" butonu için tek satırlık, WhatsApp'a doğrudan yapıştırılabilecek format. */
export function buildOfferOneLiner(pricing: ProposalPricing): string {
  return `${formatTL(pricing.offerAmount)} + KDV`;
}
