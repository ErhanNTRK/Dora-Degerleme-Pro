import type { Tariff } from '../types/tariff';
import type { CalculationInput, CalculationResult, PropertyFeeBreakdown } from '../types/calculation';
import { findGroup, findSubtype, resolveSubtypeBaseFee } from './tariffLookup';
import { applyBulkValuation, type BulkCandidate } from './bulkValuationEngine';

/**
 * Tek bir taşınmazın taban ücretini (toplu değerleme indirimi UYGULANMADAN ÖNCE) hesaplar.
 * 9. ve 11. grup gibi "referans grup ücretine göre" türler için referans taşınmazın
 * kendi ücretini önce hesaplar, sonra yüzde/çarpan uygular.
 */
function computePropertyBaseFee(
  tariff: Tariff,
  property: CalculationInput['properties'][number]
): { fee: number; warning?: string; note?: string; isManual: boolean } {
  const group = findGroup(tariff, property.groupId);
  const subtype = group ? findSubtype(tariff, property.groupId, property.subtypeId) : undefined;

  if (!group || !subtype) {
    return { fee: 0, warning: 'Grup veya alt tür bulunamadı.', isManual: false };
  }

  // Manuel ücret gerektiren alt türler (tarifede "Belirlenmemiştir")
  if (subtype.manualFeeRequired) {
    if (property.manualFee === undefined || property.manualFee <= 0) {
      return {
        fee: 0,
        warning: subtype.warningMessage ?? 'Bu tür için ücret manuel girilmelidir.',
        isManual: true,
      };
    }
    return { fee: property.manualFee, isManual: true, note: subtype.manualFeeReason };
  }

  // 9. Grup: referans grubun ücretinin yüzdesi
  if (group.isPercentOfBaseGroupFee && subtype.percentOfReferenceGroupFee !== undefined) {
    if (!property.referenceGroupId || !property.referenceSubtypeId) {
      return { fee: 0, warning: 'Yeniden değerleme için esas alınacak grup/tür seçilmedi.', isManual: false };
    }
    const refResult = resolveSubtypeBaseFee(tariff, property.referenceGroupId, property.referenceSubtypeId, property.referenceArea);
    if (!refResult) {
      return { fee: 0, warning: 'Esas alınan taşınmazın ücreti hesaplanamadı (alan veya tür eksik olabilir).', isManual: false };
    }
    const fee = Math.round(refResult.fee * (subtype.percentOfReferenceGroupFee / 100) * 100) / 100;
    return { fee, note: `Esas ücretin %${subtype.percentOfReferenceGroupFee}'i uygulanmıştır.`, isManual: false };
  }

  // 11. Grup: referans grubun ücretinin katı (DAP)
  if (group.isMultiplierOfBaseGroupFee && subtype.multiplierOfReferenceGroupFee !== undefined) {
    if (!property.referenceGroupId || !property.referenceSubtypeId) {
      return { fee: 0, warning: 'DAP raporu için esas alınacak grup/tür seçilmedi.', isManual: false };
    }
    const refResult = resolveSubtypeBaseFee(tariff, property.referenceGroupId, property.referenceSubtypeId, property.referenceArea);
    if (!refResult) {
      return { fee: 0, warning: 'Esas alınan taşınmazın ücreti hesaplanamadı (alan veya tür eksik olabilir).', isManual: false };
    }
    const fee = Math.round(refResult.fee * subtype.multiplierOfReferenceGroupFee * 100) / 100;
    return { fee, note: `Esas ücretin ${subtype.multiplierOfReferenceGroupFee} katı uygulanmıştır.`, isManual: false };
  }

  // Standart bracket / sabit ücret / türetilmiş (%10 artırımlı) alt türler
  const result = resolveSubtypeBaseFee(tariff, property.groupId, property.subtypeId, property.area);
  if (!result) {
    return { fee: 0, warning: 'Bu alan için tarifede uygun bir dilim bulunamadı. Alanı kontrol ediniz.', isManual: false };
  }
  return { fee: result.fee, isManual: false };
}

export function calculate(tariff: Tariff, input: CalculationInput): CalculationResult {
  const warnings: string[] = [];
  const breakdowns: PropertyFeeBreakdown[] = [];

  // 1) Her taşınmazın taban ücretini hesapla
  const baseFees = input.properties.map((p) => {
    const group = findGroup(tariff, p.groupId);
    const subtype = group ? findSubtype(tariff, p.groupId, p.subtypeId) : undefined;
    const result = computePropertyBaseFee(tariff, p);
    return { property: p, group, subtype, ...result };
  });

  // 2) Toplu değerleme (6. Grup) kuralını, aynı ana grupta (G1 veya G2) ve
  //    ilgili koşulu sağlayan (aynı mahalle/köy ya da aynı parsel) taşınmazlara uygula.
  const finalFeeByPropertyId = new Map<string, { fee: number; discountPercent?: number; note?: string }>();

  const g1Candidates = baseFees.filter((b) => b.group?.id === 'G1' && b.property.sameNeighborhood);
  const g2Candidates = baseFees.filter((b) => b.group?.id === 'G2' && b.property.sameParcel);

  function applyGroupBulk(candidates: typeof baseFees, groupId: string) {
    if (candidates.length < 2) return;
    const group = findGroup(tariff, groupId)!;
    const bulkInput: BulkCandidate[] = candidates.map((c) => ({ propertyId: c.property.id, baseFee: c.fee }));
    const results = applyBulkValuation(group, bulkInput);
    results.forEach((r) => {
      finalFeeByPropertyId.set(r.propertyId, { fee: r.appliedFee, discountPercent: r.appliedDiscountPercent, note: r.note });
    });
  }

  applyGroupBulk(g1Candidates, 'G1');
  applyGroupBulk(g2Candidates, 'G2');

  // 3) Sonuç satırlarını oluştur
  baseFees.forEach((b) => {
    const bulk = finalFeeByPropertyId.get(b.property.id);
    const finalFee = bulk ? bulk.fee : b.fee;
    if (b.warning) warnings.push(`${b.property.label ?? b.property.id}: ${b.warning}`);

    breakdowns.push({
      propertyId: b.property.id,
      label: b.property.label ?? `Taşınmaz ${breakdowns.length + 1}`,
      groupName: b.group?.name ?? '—',
      subtypeName: b.subtype?.name ?? '—',
      area: b.property.area,
      baseFee: b.fee,
      appliedDiscountPercent: bulk?.discountPercent,
      finalFee,
      isManual: b.isManual,
      warningMessage: b.warning,
      calculationNote: bulk?.note ?? b.note,
    });
  });

  const minimumServiceFeeSubtotal = breakdowns.reduce((sum, b) => sum + b.baseFee, 0);
  const finalPropertyTotal = breakdowns.reduce((sum, b) => sum + b.finalFee, 0);
  const bulkDiscountTotal = Math.round((minimumServiceFeeSubtotal - finalPropertyTotal) * 100) / 100;

  const titleDeedFeeTotal = Math.round(input.titleDeedCount * input.settings.titleDeedFeePerDeed * 100) / 100;
  const infoCenterFee = input.settings.infoCenterFeeEnabled ? input.settings.infoCenterFeePerReport : 0;
  const unionFee = input.settings.unionFeeEnabled ? input.settings.unionFeePerReport : 0;
  const transportFee = input.settings.transportFeeEnabled ? input.settings.transportFeePerReport : 0;
  const otherFeesTotal = Math.round(input.otherFees.reduce((sum, f) => sum + f.amount, 0) * 100) / 100;

  const subtotal =
    Math.round(
      (finalPropertyTotal +
        titleDeedFeeTotal +
        infoCenterFee +
        unionFee +
        transportFee +
        input.municipalityFee +
        otherFeesTotal) *
        100
    ) / 100;

  const vatAmount = Math.round(subtotal * (input.settings.vatRatePercent / 100) * 100) / 100;
  const grandTotal = Math.round((subtotal + vatAmount) * 100) / 100;

  return {
    propertyBreakdowns: breakdowns,
    minimumServiceFeeSubtotal: Math.round(minimumServiceFeeSubtotal * 100) / 100,
    bulkDiscountTotal,
    titleDeedFeeTotal,
    infoCenterFee,
    unionFee,
    transportFee,
    municipalityFee: input.municipalityFee,
    otherFeesTotal,
    subtotal,
    vatAmount,
    vatRatePercent: input.settings.vatRatePercent,
    grandTotal,
    warnings,
  };
}
