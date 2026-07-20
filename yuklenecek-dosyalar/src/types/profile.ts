export interface CompanyProfile {
  id: 'company-profile';
  companyName: string;
  address: string;
  phone: string;
  email: string;
  taxOffice: string;
  taxNumber: string;
  iban: string;
  authorizedName: string;
  authorizedTitle: string;
  /** Base64 data-URL olarak saklanır (IndexedDB, cihaz içi). */
  logoDataUrl?: string;
  signatureDataUrl?: string;
  /** Teklif Yazısı ve Teklif PDF'de otomatik yer alan, kullanıcı tarafından değiştirilebilen alt not. */
  proposalFooterNote?: string;
  /** Yönetici tarafından düzenlenen teklif metni şablonu (yer tutucularla).
   *  Boş/tanımsız → uygulamanın gömülü varsayılan metni kullanılır. */
  proposalTemplate?: string[];
}

export const EMPTY_COMPANY_PROFILE: CompanyProfile = {
  id: 'company-profile',
  companyName: 'Dora Gayrimenkul Değerleme A.Ş.',
  address: '',
  phone: '',
  email: '',
  taxOffice: '',
  taxNumber: '',
  iban: '',
  authorizedName: '',
  authorizedTitle: '',
  proposalFooterNote: 'Bu teklif yalnızca belirtilen hizmet kapsamı için hazırlanmıştır.',
};

export type CustomerType = 'bireysel' | 'kurumsal';

export interface CustomerInfo {
  customerType: CustomerType;
  customerName: string;
  companyName: string;
  phone: string;
  email: string;
  reportSubject: string;
  description: string;
  /** Taşınmazlara göre otomatik oluşturulan, kullanıcı tarafından değiştirilebilen özet (ör. "5 adet Konut, 2 adet Dükkan"). */
  propertySummary: string;
}

export const EMPTY_CUSTOMER_INFO: CustomerInfo = {
  customerType: 'bireysel',
  customerName: '',
  companyName: '',
  phone: '',
  email: '',
  reportSubject: '',
  description: '',
  propertySummary: '',
};
