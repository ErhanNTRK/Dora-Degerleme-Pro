import type { Tariff } from '../types/tariff';
import type { PropertyInput } from '../types/calculation';
import type { CustomerInfo } from '../types/profile';
import { findGroup } from '../engine/tariffLookup';

/** Otomatik özet metninde kullanılacak kısa/sade grup etiketleri (tarifedeki resmi uzun adlar yerine). */
const SHORT_GROUP_LABELS: Record<string, string> = {
  G1: 'Arsa/Tarım Alanı',
  G2: 'Konut',
  G3: 'Akaryakıt/Enerji Tesisi',
  G4: 'Sanayi Yapısı',
  G5: 'Dükkan/Ticari Alan',
  G7: 'Gayrimenkul Projesi',
  G8: 'Diğer',
  G9: 'Yeniden Değerleme',
  G10: 'Kültür Varlığı',
  G11: 'DAP Raporu',
};

/**
 * Taşınmazları türüne göre gruplayıp "5 adet Konut, 2 adet Dükkan/Ticari Alan, 1 adet Arsa/Tarım Alanı"
 * biçiminde otomatik bir özet metni üretir. Yalnızca bir başlangıç değeridir; kullanıcı isterse değiştirir.
 */
export function buildAutoPropertySummary(tariff: Tariff, properties: PropertyInput[]): string {
  const counts = new Map<string, number>();
  for (const p of properties) {
    const group = findGroup(tariff, p.groupId);
    const label = (group && SHORT_GROUP_LABELS[group.id]) ?? group?.name ?? 'Taşınmaz';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => `${count} adet ${label}`).join(', ');
}

function sanitizeForFileName(text: string): string {
  return text
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** "ABC İNŞAAT - FİYAT TEKLİFİ - 15.07.2026.pdf" biçiminde teklif dosya adı üretir. */
export function buildProposalFileName(customer: CustomerInfo, extension: 'pdf' | 'docx'): string {
  const label =
    customer.customerType === 'kurumsal'
      ? customer.companyName.trim() || customer.customerName.trim()
      : customer.customerName.trim() || customer.companyName.trim();
  const dateStr = new Date().toLocaleDateString('tr-TR');
  const namePart = label ? sanitizeForFileName(label).toLocaleUpperCase('tr') : 'MÜŞTERİ';
  return `${namePart} - FİYAT TEKLİFİ - ${dateStr}.${extension}`;
}
