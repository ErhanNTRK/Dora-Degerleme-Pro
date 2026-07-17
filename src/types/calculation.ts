/** Bir hesaplamaya dahil edilen tek bir taşınmaz. */
export interface PropertyInput {
  id: string;
  groupId: string;
  subtypeId: string;
  /** m² cinsinden brüt alan. Alan bazlı olmayan gruplarda (ör. G3-T1 akaryakıt istasyonu) kullanılmaz. */
  area?: number;
  /** manualFeeRequired=true olan alt türler için kullanıcının girdiği ücret. */
  manualFee?: number;
  /** 9. ve 11. grup gibi "referans grup ücretine göre" hesaplanan türler için: kullanıcının seçtiği esas grup/alt tür/alan. */
  referenceGroupId?: string;
  referenceSubtypeId?: string;
  referenceArea?: number;
  /** Aynı mahalle/köy sınırlarında mı (1. grup toplu değerleme koşulu) */
  sameNeighborhood?: boolean;
  /** Aynı parselde mi (2. grup toplu değerleme koşulu) */
  sameParcel?: boolean;
  label?: string;

  // Aşağıdaki alanlar tamamen isteğe bağlıdır, hesaplamayı ETKİLEMEZ; yalnızca Teklif Yazısı/PDF
  // içinde dolu olanlar gösterilir. İl/İlçe zaten rapor genelinde seçildiği için burada tutulmaz.
  /** Görünüm katmanı: kullanıcının seçtiği sade hizmet adı (hesaplamayı etkilemez). */
  serviceAlias?: string;
  mahalle?: string;
  ada?: string;
  parsel?: string;
  pafta?: string;
  bagimsizBolum?: string;
  acikAdres?: string;
}

export interface OtherFeeLine {
  id: string;
  description: string;
  amount: number;
}

export interface CalculationSettings {
  titleDeedFeePerDeed: number;
  infoCenterFeePerReport: number;
  unionFeePerReport: number;
  transportFeePerReport: number;
  vatRatePercent: number;
  infoCenterFeeEnabled: boolean;
  unionFeeEnabled: boolean;
  transportFeeEnabled: boolean;
}

export interface CalculationInput {
  properties: PropertyInput[];
  titleDeedCount: number;
  municipalityFee: number;
  otherFees: OtherFeeLine[];
  settings: CalculationSettings;
}

export interface PropertyFeeBreakdown {
  propertyId: string;
  label: string;
  groupName: string;
  subtypeName: string;
  area?: number;
  baseFee: number;
  appliedDiscountPercent?: number;
  finalFee: number;
  isManual: boolean;
  warningMessage?: string;
  calculationNote?: string;
}

export interface CalculationResult {
  propertyBreakdowns: PropertyFeeBreakdown[];
  minimumServiceFeeSubtotal: number;
  bulkDiscountTotal: number;
  titleDeedFeeTotal: number;
  infoCenterFee: number;
  unionFee: number;
  transportFee: number;
  municipalityFee: number;
  otherFeesTotal: number;
  subtotal: number;
  vatAmount: number;
  vatRatePercent: number;
  grandTotal: number;
  warnings: string[];
}
