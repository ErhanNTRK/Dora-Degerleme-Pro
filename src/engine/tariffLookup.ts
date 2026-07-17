import type { Tariff, TariffGroup, TariffSubtype, FeeBracket } from '../types/tariff';

export function findGroup(tariff: Tariff, groupId: string): TariffGroup | undefined {
  return tariff.groups.find((g) => g.id === groupId);
}

export function findSubtype(tariff: Tariff, groupId: string, subtypeId: string): TariffSubtype | undefined {
  const group = findGroup(tariff, groupId);
  return group?.subtypes.find((s) => s.id === subtypeId);
}

/**
 * Verilen alana (m²) karşılık gelen ücret aralığını (bracket) bulur.
 * Aralıklar sıralı ve ayrık kabul edilir; min veya max null olabilir (sınırsız uç).
 */
export function findBracketForArea(brackets: FeeBracket[], area: number): FeeBracket | undefined {
  return brackets.find((b) => {
    const minOk = b.min === null || area >= b.min;
    const maxOk = b.max === null || area <= b.max;
    return minOk && maxOk;
  });
}

/**
 * Bir alt türün taban ücretini (varsa alan bazlı dilimden) hesaplar.
 * baseSubtypeRef ile türetilmiş alt türler (ör. G2-T2) için referans alt türün
 * dilimine bakılıp çarpan uygulanır.
 */
export function resolveSubtypeBaseFee(
  tariff: Tariff,
  groupId: string,
  subtypeId: string,
  area: number | undefined
): { fee: number; bracketLabel?: string } | null {
  const group = findGroup(tariff, groupId);
  if (!group) return null;
  const subtype = findSubtype(tariff, groupId, subtypeId);
  if (!subtype) return null;

  if (subtype.manualFeeRequired) {
    return null; // Manuel ücret gerektirir, bracket hesaplaması yapılamaz.
  }

  if (subtype.baseSubtypeRef) {
    const baseSubtype = findSubtype(tariff, groupId, subtype.baseSubtypeRef);
    if (!baseSubtype?.brackets) return null;
    if (area === undefined) return null;
    const bracket = findBracketForArea(baseSubtype.brackets, area);
    if (!bracket) return null;
    const multiplier = subtype.surchargeMultiplier ?? 1;
    return { fee: Math.round(bracket.fee * multiplier * 100) / 100, bracketLabel: bracket.label };
  }

  if (subtype.brackets && subtype.brackets.length > 0) {
    // "Tamamı" tipi tek satırlık bracket (min/max null) veya alan bazlı dilim
    const singleFlat = subtype.brackets.length === 1 && subtype.brackets[0].min === null && subtype.brackets[0].max === null;
    if (singleFlat) {
      return { fee: subtype.brackets[0].fee, bracketLabel: subtype.brackets[0].label };
    }
    if (area === undefined) return null;
    const bracket = findBracketForArea(subtype.brackets, area);
    if (!bracket) return null;
    return { fee: bracket.fee, bracketLabel: bracket.label };
  }

  return null;
}
