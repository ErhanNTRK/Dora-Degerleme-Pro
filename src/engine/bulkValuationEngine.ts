import type { TariffGroup } from '../types/tariff';

export interface BulkCandidate {
  propertyId: string;
  baseFee: number;
}

export interface BulkResult {
  propertyId: string;
  appliedFee: number;
  appliedDiscountPercent?: number;
  note?: string;
}

/**
 * 6. Grup (Toplu Değerleme) kuralını, aynı grup içindeki uygun taşınmaz kümesine uygular.
 *
 * Kural özeti (SPK 2026 tarifesi):
 *  - En büyük alanlı/ücretli taşınmaz TAM ücret alır.
 *  - Diğerleri, kendi dilimindeki ücretin belirli bir yüzdesini alır (1. Grup: %20, 2. Grup: %15).
 *  - Taşınmaz sayısı belirli bir eşiği (kullanıcı onayıyla: 201) aşarsa, TÜM grup için sabit
 *    tavan ücret (511.500 TL) uygulanır — bu, tekil ücretlerin toplamının yerine geçer.
 */
export function applyBulkValuation(group: TariffGroup, candidates: BulkCandidate[]): BulkResult[] {
  const rule = group.bulkValuation;
  if (!rule.eligible || candidates.length < 2) {
    // Toplu değerleme kuralı geçerli değil veya tek taşınmaz var: her biri kendi tam ücretini alır.
    return candidates.map((c) => ({ propertyId: c.propertyId, appliedFee: c.baseFee }));
  }

  const threshold = rule.propertyCountFlatFeeThreshold;
  if (threshold && candidates.length >= threshold.minPropertyCount) {
    // Sabit tavan ücret: toplam grup ücreti flatFee'ye eşitlenir, en büyük taşınmaza atanır,
    // diğerleri 0 gösterilir ki toplamda tarifedeki sabit tutar korunsun.
    return candidates.map((c, idx) => ({
      propertyId: c.propertyId,
      appliedFee: idx === 0 ? threshold.flatFee : 0,
      note:
        idx === 0
          ? `Taşınmaz sayısı ${threshold.minPropertyCount} ve üzerinde olduğu için tarifedeki sabit tavan ücret (${threshold.flatFee.toLocaleString('tr-TR')} TL) tüm grup için uygulanmıştır.`
          : 'Bu taşınmazın ücreti, grup için uygulanan sabit tavan ücrete dahildir.',
    }));
  }

  // Yüzdesel indirim kuralı: en büyük ücretli taşınmaz tam ücret, diğerleri indirimli.
  const sorted = [...candidates].sort((a, b) => b.baseFee - a.baseFee);
  const discountPercent = rule.othersFeePercentOfOwnBracket ?? 100;

  return sorted.map((c, idx) => {
    if (idx === 0) {
      return { propertyId: c.propertyId, appliedFee: c.baseFee, note: 'En büyük alanlı/ücretli taşınmaz — tam ücret uygulanır.' };
    }
    const discounted = Math.round(c.baseFee * (discountPercent / 100) * 100) / 100;
    return {
      propertyId: c.propertyId,
      appliedFee: discounted,
      appliedDiscountPercent: discountPercent,
      note: `Toplu değerleme indirimi: kendi dilimindeki ücretin %${discountPercent}'i uygulanmıştır.`,
    };
  });
}
