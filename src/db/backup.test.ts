/** Yedek dosyası doğrulama testleri (saf fonksiyon — DB erişimi yok). */
import { describe, it, expect } from 'vitest';
import { validateBackup } from './backup';

const valid = { app: 'dora-degerleme-pro', backupVersion: 1, exportedAt: 'x', calculations: [], proposals: [], settings: [], companyProfile: [] };

describe('validateBackup', () => {
  it('geçerli yedeği kabul eder', () => {
    expect(validateBackup(valid)).toBeNull();
  });
  it('yabancı dosyayı reddeder', () => {
    expect(validateBackup({ app: 'baska-uygulama' })).toContain('Dora Değerleme Pro yedeği değil');
  });
  it('desteklenmeyen sürümü reddeder', () => {
    expect(validateBackup({ ...valid, backupVersion: 99 })).toContain('Desteklenmeyen');
  });
  it('eksik bölümü adıyla bildirir', () => {
    const { proposals: _p, ...eksik } = valid;
    expect(validateBackup(eksik)).toContain('proposals');
  });
  it('JSON olmayan girdiyi reddeder', () => {
    expect(validateBackup(null)).toContain('geçerli bir JSON değil');
  });
});
