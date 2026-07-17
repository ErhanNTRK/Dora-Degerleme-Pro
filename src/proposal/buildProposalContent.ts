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
  /** Çoklu teklif: rapor başına tutarlı döküm satırları (yalnızca çoklu modda dolu). */
  serviceFeeItems: ServiceFeeItem[];
  /** Çoklu hizmet görünümü: teklif belgesinde "Hizmet Kapsamı" altında listelenecek satırlar.
   *  TUTAR İÇERMEZ — yalnızca hizmet tanımıdır; toplam tek satır "Toplam Maliyet"tir. */
  serviceLines: string[];
  amountInWords: string;
  proposalDate: string;
  plainText: string;
}

export interface ServiceFeeItem {
  label: string;
  /** Müşteriye sunulan, rapor başına Toplam Maliyet. İÇ KALEM DEĞİLDİR — kullanıcının
   *  onayladığı/düzenlediği müşteri tutarıdır; tapu/belediye vb. döküm asla buraya girmez. */
  amount: number;
}

export interface ProposalContentOptions {
  /** Doluysa taşınmazlar teklifte ayrı hizmet satırları olarak listelenir (tutarsız). */
  serviceLines?: string[];
  /** Çoklu teklif: rapor başına TUTARLI hizmet satırları ("Hizmet ve Ücret Dökümü").
   *  Verilirse serviceLines yok sayılır; toplamları Toplam Maliyet'e eşit olmalıdır. */
  serviceFeeItems?: ServiceFeeItem[];
  /** Kullanıcının düzenlediği paragraflar. null/undefined → otomatik metin kullanılır.
   *  Otomatik metin yalnızca başlangıç önerisidir; düzenlenmiş metin aynen basılır. */
  customParagraphs?: string[] | null;
}

/** Teklif belgesindeki hizmet satırlarını hesaplama sonucundan (tutarsız) üretir.
 *  rawProperties verilirse doldurulmuş konum bilgileri (mahalle/ada/parsel) satıra eklenir. */
export function buildServiceLines(
  breakdowns: CalculationResult['propertyBreakdowns'],
  rawProperties: Array<{ id: string; mahalle?: string; ada?: string; parsel?: string; bagimsizBolum?: string }> = []
): string[] {
  return breakdowns.map((b) => {
    const name = `${b.groupName} — ${b.subtypeName}`;
    const area = b.area ? ` (${b.area.toLocaleString('tr-TR')} m²)` : '';
    const raw = rawProperties.find((r) => r.id === b.propertyId);
    const locParts: string[] = [];
    if (raw?.mahalle) locParts.push(`${raw.mahalle} Mah.`);
    if (raw?.ada) locParts.push(`Ada ${raw.ada}`);
    if (raw?.parsel) locParts.push(`Parsel ${raw.parsel}`);
    if (raw?.bagimsizBolum) locParts.push(`B.B. ${raw.bagimsizBolum}`);
    const loc = locParts.length > 0 ? ` — ${locParts.join(', ')}` : '';
    const base = b.label && !b.label.startsWith('Taşınmaz') ? `${b.label}: ${name}` : name;
    return `${base}${area}${loc}`;
  });
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

/**
 * Kurumsal varsayılan teklif metni. Kullanıcı düzenlemesi için başlangıç önerisidir;
 * sayfadaki paragraf editörü bu fonksiyonun çıktısıyla açılır.
 *
 * Dil ilkeleri: sade, resmî, güven veren; tekrar yok; iç maliyet kalemlerinden
 * (tapu/belediye harcı, TDUB, bilgi merkezi, ulaşım, resmî giderler) HİÇ bahsedilmez.
 * Müşteriye görünen tek tutar seti: Toplam Maliyet + KDV + Genel Toplam.
 */
export function buildDefaultProposalParagraphs(
  customer: CustomerInfo,
  company: CompanyProfile,
  tariffYear: number,
  pricing: ProposalPricing
): string[] {
  const subjectPieces: string[] = [];
  if (customer.reportSubject.trim()) subjectPieces.push(customer.reportSubject.trim());
  if (customer.propertySummary.trim()) subjectPieces.push(customer.propertySummary.trim());
  const subjectDetail = subjectPieces.length > 0 ? ` (${subjectPieces.join(' — ')})` : '';
  const amountInWords = amountToTurkishWords(pricing.grandTotal);

  const paragraphs = [
    `Kurumumuza göstermiş olduğunuz ilgi için teşekkür eder, talebiniz doğrultusunda hazırlanan gayrimenkul değerleme hizmet teklifimizi${subjectDetail} bilgilerinize sunarız.`,
    `Değerleme çalışması; Sermaye Piyasası Kurulu (SPK) düzenlemeleri, Türkiye Değerleme Uzmanları Birliği (TDUB) mevzuatı ve ${tariffYear} Yılı Gayrimenkul Değerleme Asgari Ücret Tarifesi esas alınarak, lisanslı değerleme uzmanlarımız tarafından bağımsızlık, tarafsızlık ve gizlilik ilkeleri çerçevesinde yürütülecektir.`,
    'Çalışma tamamlandığında bulgular, mevzuata uygun olarak hazırlanmış kapsamlı bir değerleme raporu hâlinde tarafınıza teslim edilecektir.',
    `Hizmet kapsamına ilişkin Toplam Maliyet ${formatTL(pricing.offerAmount)} olup, %${pricing.vatRatePercent} KDV ile birlikte Genel Toplam ${formatTL(pricing.grandTotal)} ${amountInWords} olarak belirlenmiştir.`,
  ];
  // IBAN girilmişse ödeme paragrafı eklenir; girilmemişse HİÇ ödeme cümlesi yazılmaz
  // (IBAN zorunlu değildir, dolgu cümlesi de basılmaz).
  if (company.iban.trim()) {
    paragraphs.push(`Ödemenizi aşağıdaki IBAN numarası üzerinden gerçekleştirebilirsiniz: ${company.iban.trim()}`);
  }
  paragraphs.push('Teklifimizi değerlendirmeniz için teşekkür eder, sorularınız için bizimle her zaman iletişime geçebileceğinizi belirtmek isteriz.');
  return paragraphs;
}

export function buildProposalContent(
  customer: CustomerInfo,
  company: CompanyProfile,
  tariffYear: number,
  pricing: ProposalPricing,
  propertyDetailLines: PropertyDetailLine[] = [],
  options: ProposalContentOptions = {}
): ProposalContent {
  const salutation = buildSalutation(customer);
  const proposalDate = new Date().toLocaleDateString('tr-TR');
  const amountInWords = amountToTurkishWords(pricing.grandTotal);
  const serviceFeeItems = options.serviceFeeItems ?? [];
  const serviceLines = serviceFeeItems.length > 0 ? [] : (options.serviceLines ?? []);

  const paragraphs: string[] =
    options.customParagraphs && options.customParagraphs.length > 0
      ? options.customParagraphs
      : buildDefaultProposalParagraphs(customer, company, tariffYear, pricing);

  const propertyDetailText =
    propertyDetailLines.length > 0
      ? ['', 'Taşınmaz Bilgileri:', ...propertyDetailLines.map((l) => `${l.label}: ${l.parts.join(', ')}`)]
      : [];

  const footerNote = company.proposalFooterNote?.trim();

  const serviceText =
    serviceFeeItems.length > 0
      ? ['', 'Hizmet ve Ücret Dökümü:', ...serviceFeeItems.map((it, i) => `${i + 1}. ${it.label}: ${formatTL(it.amount)}`), '']
      : serviceLines.length > 0
        ? ['', 'Hizmet Kapsamı:', ...serviceLines.map((l, i) => `${i + 1}. ${l}`), '']
        : [];

  const plainText = [
    `Teklif Tarihi: ${proposalDate}`,
    '',
    salutation,
    '',
    paragraphs[0],
    ...serviceText,
    ...paragraphs.slice(1),
    ...propertyDetailText,
    '',
    footerNote ?? '',
    '',
    'Saygılarımızla,',
    company.companyName,
    company.authorizedName ? `${company.authorizedName}${company.authorizedTitle ? ' — ' + company.authorizedTitle : ''}` : '',
  ]
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
    .join('\n')
    .trim();

  return { salutation, paragraphs, serviceLines, serviceFeeItems, amountInWords, proposalDate, plainText };
}

/** "Kopyala" butonu için tek satırlık, WhatsApp'a doğrudan yapıştırılabilecek format. */
export function buildOfferOneLiner(pricing: ProposalPricing): string {
  return `${formatTL(pricing.offerAmount)} + KDV`;
}
