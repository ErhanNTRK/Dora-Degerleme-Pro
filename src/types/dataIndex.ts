/**
 * Merkezi veri indeksi (public/data/tariffs-index.json).
 *
 * Çok-yıl mimarisinin kalbi: uygulama açılışta bu indeksi okur, aktif yılın tarife ve
 * il/ilçe dosyalarını yükler. Yeni yıl geldiğinde KOD DEĞİŞMEZ — yalnızca yeni yıl
 * dosyaları ve güncellenmiş indeks repoya yüklenir; service worker sayesinde tüm
 * cihazlar kendiliğinden yeni tarifeye geçer. Dosyalar Veri Yönetimi sihirbazından üretilir.
 */
export interface TariffYearEntry {
  year: number;
  tariffFile: string;
  locationFile: string;
  note?: string;
}

export interface TariffsIndex {
  schemaVersion: number;
  activeYear: number;
  years: TariffYearEntry[];
}

/** İndeks dosyası okunamazsa kullanılacak güvenli varsayılan (ilk yayın verisi). */
export const DEFAULT_TARIFFS_INDEX: TariffsIndex = {
  schemaVersion: 1,
  activeYear: 2026,
  years: [{ year: 2026, tariffFile: 'tariff-2026.json', locationFile: 'il-ilce-database.json' }],
};
