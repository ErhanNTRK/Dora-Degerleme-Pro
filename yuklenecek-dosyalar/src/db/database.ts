import Dexie, { type Table } from 'dexie';
import type { CalculationInput, CalculationResult } from '../types/calculation';
import type { CompanyProfile, CustomerInfo } from '../types/profile';

export interface SavedCalculation {
  id: string;
  createdAt: string;
  title: string;
  input: CalculationInput;
  result: CalculationResult;
  tariffId: string;
  tariffYear: number;
  customer: CustomerInfo;
  province?: string;
  district?: string;
  /** Asgari Hizmet Bedeli (hesaplama motorundan, hiçbir zaman değişmez). */
  asgariHizmetBedeli: number;
  /** Müşteriye sunulacak, kullanıcı tarafından değiştirilebilen teklif bedeli. Varsayılan = asgariHizmetBedeli. */
  offerAmount: number;
}

export interface MunicipalityFeeRecord {
  id: string;
  province: string;
  district: string;
  fee: number;
  updatedAt: string;
}

export interface AppSettingsRecord {
  id: 'app-settings';
  titleDeedFeePerDeed: number;
  infoCenterFeePerReport: number;
  unionFeePerReport: number;
  transportFeePerReport: number;
  vatRatePercent: number;
  themeMode: 'light' | 'dark' | 'system';
}

export interface SavedProposal {
  id: string;
  createdAt: string;
  title: string;
  calculationId?: string;
  /** Çoklu teklif: birleştirilen hesaplama kayıtlarının kimlikleri (v3). */
  calculationIds?: string[];
  /** 'multi' → birden fazla hesaplamayı birleştiren teklif; yoksa tekli kabul edilir. */
  kind?: 'single' | 'multi';
  customer: CustomerInfo;
  company: CompanyProfile;
  /** Tekli tekliflerde hesaplama sonucu snapshot'ı; çoklu tekliflerde bulunmaz. */
  result?: CalculationResult;
  /** Çoklu teklifler için KDV oranı (teklilerde result.vatRatePercent kullanılır). */
  vatRatePercent?: number;
  tariffYear: number;
  bodyText: string;
  offerAmount: number;
  offerGrandTotal: number;
  /** Belgenin birebir yeniden üretilebilmesi için içerik seçenekleri snapshot'ı. */
  contentOptions?: {
    serviceLines?: string[];
    serviceFeeItems?: Array<{ label: string; amount: number }>;
    customParagraphs?: string[] | null;
  };
}

class DoraDegerlemeDB extends Dexie {
  calculations!: Table<SavedCalculation, string>;
  municipalityFees!: Table<MunicipalityFeeRecord, string>;
  settings!: Table<AppSettingsRecord, string>;
  companyProfile!: Table<CompanyProfile, string>;
  proposals!: Table<SavedProposal, string>;

  constructor() {
    super('dora-degerleme-db');
    this.version(1).stores({
      calculations: 'id, createdAt, title',
      municipalityFees: 'id, province, district',
      settings: 'id',
    });
    this.version(2).stores({
      calculations: 'id, createdAt, title',
      municipalityFees: 'id, province, district',
      settings: 'id',
      companyProfile: 'id',
      proposals: 'id, createdAt, calculationId',
    });
    // v3 (2026-07-17): Çoklu teklif desteği — proposals.calculationIds (multiEntry indeks).
    // Geriye dönük uyumludur: mevcut kayıtlar değişmez, yalnızca yeni indeks eklenir.
    this.version(3).stores({
      proposals: 'id, createdAt, calculationId, *calculationIds',
    });
  }
}

export const db = new DoraDegerlemeDB();
