/**
 * Tarife (asgari ücret listesi) veri modeline ait tip tanımları.
 * Bu tipler, Resmî Gazete'de yayımlanan tarife JSON dosyasının (public/data/tariff-*.json)
 * yapısını birebir yansıtır. Yeni bir yıl tarifesi geldiğinde bu tipler DEĞİŞMEMELİDİR;
 * yalnızca yeni bir JSON veri dosyası eklenir.
 */

export interface FeeBracket {
  /** Aralığın alt sınırı (m² veya adet). null ise sınır yok (ör. "Tamamı" satırları). */
  min: number | null;
  /** Aralığın üst sınırı. null ise "ve üzeri" anlamına gelir. */
  max: number | null;
  /** Bu aralık için asgari ücret (TL). */
  fee: number;
  /** Tabloda "Tamamı" gibi özel bir etiket varsa. */
  label?: string;
}

export interface TariffSubtype {
  id: string;
  name: string;
  brackets?: FeeBracket[];

  /** Bu alt tür başka bir alt türün ücretine çarpan uygulayarak türetiliyorsa (ör. G2-T2 -> G2-T1 x1.10) */
  baseSubtypeRef?: string;
  surchargeMultiplier?: number;
  surchargeNote?: string;

  /** Tarifede "Belirlenmemiştir" yazan kalemler için: kullanıcı manuel ücret girmek zorunda. */
  manualFeeRequired?: boolean;
  manualFeeReason?: string;
  warningMessage?: string;
  footnote?: string;

  /** 9. Grup (yeniden değerleme) gibi, ücretin başka bir grubun ücretinin yüzdesi olduğu durumlar. */
  percentOfReferenceGroupFee?: number;
  note?: string;

  /** 11. Grup (DAP) gibi, ücretin başka bir grubun ücretinin katı olduğu durumlar. */
  multiplierOfReferenceGroupFee?: number;
}

export interface BulkValuationFlatFeeThreshold {
  note: string;
  minPropertyCount: number;
  flatFee: number;
}

export interface BulkValuationRule {
  eligible: boolean;
  ruleId?: string;
  legalBasis?: string;
  description?: string;
  condition?: string;
  minPropertyCount?: number;
  maxPropertyCountForPercentRule?: number;
  largestParcelFullFee?: boolean;
  othersFeePercentOfOwnBracket?: number;
  propertyCountFlatFeeThreshold?: BulkValuationFlatFeeThreshold;
}

export interface TariffGroup {
  id: string;
  code: number;
  name: string;
  description?: string;
  areaUnit: string;
  manualFeeRequired?: boolean;
  isPercentOfBaseGroupFee?: boolean;
  isMultiplierOfBaseGroupFee?: boolean;
  subtypes: TariffSubtype[];
  bulkValuation: BulkValuationRule;
}

export interface StandardFeeDefinition {
  amount: number;
  label: string;
  unit: string;
  editable: boolean;
  legalBasis?: string;
}

export interface StandardFees {
  titleDeedFeePerDeed: StandardFeeDefinition;
  infoCenterFeePerReport: StandardFeeDefinition;
  unionFeePerReport: StandardFeeDefinition;
  transportFeePerReport: StandardFeeDefinition;
}

export interface Tariff {
  tariffId: string;
  tariffYear: number;
  effectiveDate: string;
  source: string;
  currency: string;
  vatRateDefaultPercent: number;
  standardFees: StandardFees;
  groups: TariffGroup[];
  unresolvedItemsLog?: Array<{ item: string; resolution: string; resolvedBy: string }>;
}
