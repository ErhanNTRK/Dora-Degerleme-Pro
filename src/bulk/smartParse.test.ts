/**
 * v2 AKILLI ALGILAMA — golden testler.
 * Üç gerçek müşteri Excel formatının ANONİM kopyaları üzerinde:
 *  A) Başlık 3. satırda + sol boş kolonlar + "Tapu Türü" ve "MAHAL NİTELİĞİ"
 *     ayrı kolonlar + nitelik metninde gömülü m².
 *  B) 1. satırda müşteri unvanı + "MAH" kısaltması + birleşik "ADA/PARSEL"
 *     ("__/4544" dahil) + fill-down devam satırı + fuzzy ("ALACATI M").
 *  C) Küçük harf il, sonu boşluklu ilçe, "Eski 0 Yeni 2344" deseni.
 */
import { describe, it, expect } from 'vitest';
import { smartParse, splitAdaParsel, resolveEskiYeni, areaFromNitelik, aliasFromTapuTuru, groupList, type SmartContext } from './excelImport';
import { DEFAULT_SERVICE_ALIASES } from '../types/serviceAliases';

const A = DEFAULT_SERVICE_ALIASES;
const CTX: SmartContext = {
  provinces: ['İSTANBUL', 'İZMİR', 'KIRŞEHİR', 'BALIKESİR'],
  districtsByProvince: new Map([
    ['istanbul', ['BEŞİKTAŞ', 'BEYOĞLU', 'BEYKOZ', 'KADIKÖY']],
    ['izmir', ['ÇEŞME', 'BORNOVA']],
    ['kirsehir', ['KAMAN']],
    ['balikesir', ['BANDIRMA']],
  ]),
  allDistricts: ['BEŞİKTAŞ', 'BEYOĞLU', 'BEYKOZ', 'KADIKÖY', 'ÇEŞME', 'BORNOVA', 'KAMAN', 'BANDIRMA'],
};

describe('yardımcılar', () => {
  it('birleşik ada/parsel bölünür; ada olmayan desenler tanınır', () => {
    expect(splitAdaParsel('1343/151')).toEqual({ ada: '1343', parsel: '151' });
    expect(splitAdaParsel('__/4544')).toEqual({ ada: '', parsel: '4544' });
    expect(splitAdaParsel('-/528')).toEqual({ ada: '', parsel: '528' });
    expect(splitAdaParsel('serbest metin')).toBeNull();
  });
  it('Eski/Yeni deseninde YENİ esas alınır', () => {
    expect(resolveEskiYeni('Eski 0 Yeni 2344')).toBe('2344');
    expect(resolveEskiYeni('Eski 165 Yeni 443')).toBe('443');
    expect(resolveEskiYeni('749')).toBe('749');
  });
  it('nitelik metnindeki gömülü m² okunur', () => {
    expect(areaFromNitelik('741,00 m2 arsa')).toBeCloseTo(741, 1);
    expect(areaFromNitelik('Akaryakıt tesisi')).toBeUndefined();
  });
  it('tapu türü eşlemesi: Kat Mülkiyeti→G2-T1, Cins Tashihi+konut→G2-T2, konut değilse null', () => {
    expect(aliasFromTapuTuru('Kat Mülkiyeti', 'Daire', A)).toBe('Daire (Konut)');
    expect(aliasFromTapuTuru('Cins Tashihi', 'Villa', A)).toBe('Müstakil Ev');
    expect(aliasFromTapuTuru('Cins Tashihi', 'Akaryakıt tesisi', A)).toBeNull();
  });
});

describe('Format A — başlık 3. satırda, iki tür kolonu, gömülü m²', () => {
  const data: unknown[][] = [
    [], [],
    ['', '', '', 'İl', 'İLÇE', 'Mahalle', 'Tapu Türü', 'ADA', 'PARSEL', 'MAHAL NİTELİĞİ'],
    ['', '', 1, 'KIRŞEHİR', 'KAMAN', 'YEŞİLTEPE', 'Cins Tashihi', '124', '3', 'Akaryakıt tesisi'],
    ['', '', 2, 'KIRŞEHİR', 'KAMAN', 'PINARBAŞI', 'Kat Mülkiyeti', '3493', '12', ' 741,00 m2 arsa'],
  ];
  const r = smartParse(data, A, CTX);

  it('başlık satırını bulur, kolonları doğru ayırır', () => {
    expect(r.headerRowIndex).toBe(2);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].il).toBe('KIRŞEHİR');
    expect(r.rows[0].ilce).toBe('KAMAN');
  });
  it('Tapu Türü nitelikle karışmaz; akaryakıt niteliği doğru eşlenir', () => {
    expect(r.rows[0].aliasName).toBe('Akaryakıt İstasyonu');
  });
  it('gömülü m² alan olarak okunur', () => {
    expect(r.rows[1].alan).toBeCloseTo(741, 1);
  });
});

describe('Format B — müşteri unvanı, birleşik ADA/PARSEL, fill-down, fuzzy', () => {
  const data: unknown[][] = [
    ['', 'ÖRNEK GAYRİMENKUL YATIRIM A.Ş.', '', '', '', '', '', '', ''],
    ['', 'İL', 'İLÇE', 'MAH', 'ADA/PARSEL', 'YÜZÖLÇÜMÜ', 'HİSSE', 'Blok/Kat vs', 'NİTELİK'],
    [1, 'İSTANBUL', 'BEŞİKTAŞ', 'YILDIZ', '1343/151', '661', '', '7', 'KAT MÜLKİYETİ (BAĞIMSIZ BÖLÜM) daire'],
    [2, 'İzmir', 'Çeşme', 'Alaçatı', '4245/1', '9.940,00 m2', 'Tam', 'I/Zemin', 'Dubleks Mesken'],
    [3, 'İZMİR', 'ÇEŞME', 'ALAÇATI M', '4245/1', '', '1', 'J', 'Dubleks Mesken'],
    ['', '', '', '', '', '', 'Tam', 'K/Zemin', 'Dubleks Mesken'],
    [4, 'İzmir', 'Çeşme', 'Alaçatı', '__/4544', '747', 'Tam', '', 'Tarla'],
  ];
  const r = smartParse(data, A, CTX);

  it('müşteri unvanını yakalar', () => {
    expect(r.customerName).toContain('ÖRNEK GAYRİMENKUL');
  });
  it('birleşik ada/parsel bölünür; ada bilinmeyen desen boş kalır', () => {
    expect(r.rows[0].ada).toBe('1343');
    expect(r.rows[0].parsel).toBe('151');
    const tarla = r.rows.find((x) => x.aliasName === 'Tarla / Bağ / Bahçe')!;
    expect(tarla.ada).toBe('');
    expect(tarla.parsel).toBe('4544');
  });
  it('fill-down: boş konumlu devam satırı üstteki işten miras alır', () => {
    const cont = r.rows[3];
    expect(cont.inherited).toBe(true);
    expect(cont.ilce).toBe('ÇEŞME');
    expect(cont.parsel).toBe('1');
  });
  it('fuzzy: küçük harf il ve "ALAÇATI M" resmi adlara bağlanır', () => {
    expect(r.rows[1].il).toBe('İZMİR');
    expect(r.rows[1].fuzzyNote).toContain('İZMİR');
  });
  it('gruplama ilçe bazlıdır: Çeşme\'deki 3 mesken tek rapor (mahalle bölmez)', () => {
    const groups = groupList(r.rows);
    const mesken = groups.find((g) => g.aliasName === 'Daire (Konut)' && g.ilce === 'ÇEŞME');
    expect(mesken?.rows).toHaveLength(2 + 1);   // 2 dolu satır + 1 fill-down devam
  });
});

describe('Format C — küçük harf il, boşluklu ilçe, Eski/Yeni', () => {
  const data: unknown[][] = [
    [], [],
    ['', 'İl', 'İLÇE', 'Mahalle', 'Tapu Türü', 'ADA', 'PARSEL', 'MAHAL NİTELİĞİ'],
    [1, 'istanbul', 'Beyoğlu', 'Örnek', 'Kat Mülkiyeti', '749', '36', 'Daire'],
    [2, 'istanbul', 'Beykoz ', 'Örnekköy', 'Cins Tashihi', 'Eski 0 Yeni 2344', 'Eski 165 Yeni 443', 'Müstakil Çiftlik'],
  ];
  const r = smartParse(data, A, CTX);

  it('fuzzy il/ilçe + Eski/Yeni birlikte çalışır', () => {
    expect(r.rows[0].il).toBe('İSTANBUL');
    expect(r.rows[1].ilce).toBe('BEYKOZ');
    expect(r.rows[1].ada).toBe('2344');
    expect(r.rows[1].parsel).toBe('443');
  });
  it('Kat Mülkiyeti → G2-T1 (Daire); Cins Tashihi + konut → G2-T2 (Müstakil Ev)', () => {
    expect(r.rows[0].aliasName).toBe('Daire (Konut)');
    expect(r.rows[1].aliasName).toBe('Müstakil Ev');
  });
});

describe('mahalle sözlüğü — ilçe yokken mahalleden çözüm', () => {
  const QCTX: SmartContext = {
    ...CTX,
    quarterIndex: new Map([
      ['levent', [{ il: 'İSTANBUL', ilce: 'BEŞİKTAŞ' }]],
      ['etiler', [{ il: 'İSTANBUL', ilce: 'BEŞİKTAŞ' }]],
      ['cumhuriyet', [{ il: 'İSTANBUL', ilce: 'KADIKÖY' }, { il: 'İZMİR', ilce: 'BORNOVA' }]],
    ]),
  };
  const data: unknown[][] = [
    ['Mahalle', 'ADA', 'PARSEL', 'NİTELİK', 'ALAN'],
    ['Levent', '10', '1', 'ARSA', '500'],
    ['Etiler', '11', '2', 'ARSA', '600'],
    ['Cumhuriyet', '12', '3', 'ARSA', '700'],
  ];
  const r = smartParse(data, A, QCTX);

  it('tek adaylı mahalleler ilçeye bağlanır (Levent→BEŞİKTAŞ)', () => {
    expect(r.rows[0].ilce).toBe('BEŞİKTAŞ');
    expect(r.rows[0].il).toBe('İSTANBUL');
    expect(r.rows[1].ilce).toBe('BEŞİKTAŞ');
  });
  it('çok adaylı mahallede dayatma yok — ilçe boş kalır, not düşülür', () => {
    expect(r.rows[2].ilce).toBe('');
    expect(r.rows[2].fuzzyNote).toContain('birden çok ilçede');
  });
  it('aynı ilçeye çözülen mahalleler aynı raporda gruplanır', () => {
    const groups = groupList(r.rows);
    const besiktas = groups.find((g) => g.ilce === 'BEŞİKTAŞ');
    expect(besiktas?.rows).toHaveLength(2);
  });
});
