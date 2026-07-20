/**
 * YEDEKLEME / GERİ YÜKLEME — bulutsuz, ücretsiz, cihaz içi.
 *
 * Dışa aktarma: tüm yerel veritabanı (hesaplamalar, teklifler, ayarlar, firma profili)
 * tek bir JSON dosyası olarak indirilir. Geri yükleme: dosya seçilir, doğrulanır ve
 * kayıtlar kimlik bazında geri yazılır (aynı kimlikli kayıt güncellenir, diğerleri
 * korunur). Telefon değişiminde: yeni cihazda uygulamayı aç → dosyayı geri yükle.
 */
import { db, type SavedCalculation, type SavedProposal, type AppSettingsRecord } from './database';
import type { CompanyProfile } from '../types/profile';

export interface BackupFile {
  app: 'dora-degerleme-pro';
  backupVersion: 1;
  exportedAt: string;
  calculations: SavedCalculation[];
  proposals: SavedProposal[];
  settings: AppSettingsRecord[];
  companyProfile: CompanyProfile[];
}

export async function buildBackup(): Promise<{ blob: Blob; fileName: string }> {
  const data: BackupFile = {
    app: 'dora-degerleme-pro',
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    calculations: await db.calculations.toArray(),
    proposals: await db.proposals.toArray(),
    settings: await db.settings.toArray(),
    companyProfile: await db.companyProfile.toArray(),
  };
  const date = new Date().toLocaleDateString('tr-TR').replace(/\./g, '-');
  return {
    blob: new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    fileName: `dora-yedek-${date}.json`,
  };
}

/** Dosya içeriğini doğrular; sorun varsa Türkçe hata mesajı, temizse null döner. */
export function validateBackup(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return 'Dosya okunamadı: geçerli bir JSON değil.';
  const d = obj as Partial<BackupFile>;
  if (d.app !== 'dora-degerleme-pro') return 'Bu dosya bir Dora Değerleme Pro yedeği değil.';
  if (d.backupVersion !== 1) return `Desteklenmeyen yedek sürümü: ${String(d.backupVersion)}.`;
  for (const key of ['calculations', 'proposals', 'settings', 'companyProfile'] as const) {
    if (!Array.isArray(d[key])) return `Yedek dosyası eksik: "${key}" bölümü bulunamadı.`;
  }
  return null;
}

export interface ImportSummary {
  calculations: number;
  proposals: number;
}

/** Yedeği geri yükler. Kimlik bazında yazar: mevcut kayıtlar silinmez, aynı kimlikliler güncellenir. */
export async function importBackup(data: BackupFile): Promise<ImportSummary> {
  await db.transaction('rw', [db.calculations, db.proposals, db.settings, db.companyProfile], async () => {
    await db.calculations.bulkPut(data.calculations);
    await db.proposals.bulkPut(data.proposals);
    await db.settings.bulkPut(data.settings);
    await db.companyProfile.bulkPut(data.companyProfile);
  });
  return { calculations: data.calculations.length, proposals: data.proposals.length };
}
