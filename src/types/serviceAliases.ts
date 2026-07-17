/**
 * Hizmet türü takma adları (görünüm katmanı).
 *
 * Kullanıcı ve müşteri SPK'nın uzun kategori adlarını görmez; "Dükkan", "Otel",
 * "Arsa" gibi sade adlar görür. Hesaplama DAİMA groupId/subtypeId üzerinden SPK
 * tarifesiyle yapılır — bu katman motora ve tarife verisine hiç dokunmaz.
 * Liste public/data/service-aliases.json'dan yüklenir; okunamazsa aşağıdaki
 * gömülü varsayılan kullanılır. Yeni ad eklemek kod değişikliği gerektirmez.
 */
export interface ServiceAlias {
  /** Seçim listesinde görünen ad (ör. "Motel / Pansiyon"). */
  name: string;
  /** Belgede kullanılan ad (ör. "Konaklama Tesisi" → "2 Adet Konaklama Tesisi Değerlemesi"). */
  documentName: string;
  groupId: string;
  subtypeId: string;
}

export interface ServiceAliasFile {
  schemaVersion: number;
  aliases: ServiceAlias[];
}

export const DEFAULT_SERVICE_ALIASES: ServiceAlias[] = [
  { name: 'Daire (Konut)', documentName: 'Daire', groupId: 'G2', subtypeId: 'G2-T1' },
  { name: 'Dükkan', documentName: 'Dükkan', groupId: 'G5', subtypeId: 'G5-T1' },
  { name: 'Arsa', documentName: 'Arsa', groupId: 'G1', subtypeId: 'G1-T2' },
  { name: 'Ofis / Büro', documentName: 'Ofis', groupId: 'G2', subtypeId: 'G2-T1' },
  { name: 'Tarla / Bağ / Bahçe', documentName: 'Tarla', groupId: 'G1', subtypeId: 'G1-T1' },
  { name: 'Müstakil Ev', documentName: 'Müstakil Ev', groupId: 'G2', subtypeId: 'G2-T2' },
  { name: 'Otel', documentName: 'Otel', groupId: 'G5', subtypeId: 'G5-T1' },
  { name: 'Depo', documentName: 'Depo', groupId: 'G4', subtypeId: 'G4-T1' },
  { name: 'Fabrika', documentName: 'Fabrika', groupId: 'G4', subtypeId: 'G4-T1' },
  { name: 'Akaryakıt İstasyonu', documentName: 'Akaryakıt İstasyonu', groupId: 'G3', subtypeId: 'G3-T1' },
];

/** Seçim adına göre alias bulur. */
export function findAliasByName(aliases: ServiceAlias[], name: string): ServiceAlias | undefined {
  return aliases.find((a) => a.name === name);
}

/**
 * Belge etiketi: "2 Adet Dükkan Değerlemesi" / "Arsa Değerlemesi".
 * Alias yoksa null döner (çağıran taraf SPK adlarına düşer).
 */
export function serviceDocumentName(aliases: ServiceAlias[], aliasName: string | undefined, count: number): string | null {
  if (!aliasName) return null;
  const alias = findAliasByName(aliases, aliasName);
  if (!alias) return null;
  const countPart = count > 1 ? `${count} Adet ` : '';
  return `${countPart}${alias.documentName} Değerlemesi`;
}
