/**
 * Guardrail testi — üç tutar modelinin müşteri tarafı.
 *
 * Motor testlerinin dışındaki TEK bilinçli test dosyasıdır. Koruduğu kural:
 * müşteriye giden Teklif metninde şirket içi maliyet kalemleri (tapu harcı tutarı,
 * belediye harcı tutarı, TDUB, bilgi merkezi, ulaşım/yol ücreti) ASLA yer almaz ve
 * teklif fiyatlaması yalnızca Teklif Bedeli + KDV'den türetilir.
 */
import { describe, it, expect } from 'vitest';
import { computeProposalPricing, buildProposalContent, buildServiceLines, buildDefaultProposalParagraphs, DEFAULT_PROPOSAL_TEMPLATE, renderProposalTemplate } from './buildProposalContent';
import { EMPTY_COMPANY_PROFILE, EMPTY_CUSTOMER_INFO } from '../types/profile';

describe('computeProposalPricing — bağımsızlık ve yuvarlama', () => {
  it('yalnızca teklif bedeli + KDV kullanır (35.000 → KDV 7.000 → 42.000)', () => {
    const p = computeProposalPricing(35000, 20);
    expect(p.vatAmount).toBe(7000);
    expect(p.grandTotal).toBe(42000);
  });
  it('kuruş yuvarlaması doğrudur (1.234,56 → KDV 246,91)', () => {
    const p = computeProposalPricing(1234.56, 20);
    expect(p.vatAmount).toBe(246.91);
    expect(p.grandTotal).toBe(1481.47);
  });
});

describe('buildProposalContent — yeni teklif sistemi davranışları', () => {
  const pricing = computeProposalPricing(50000, 20);
  const customer = { ...EMPTY_CUSTOMER_INFO, customerName: 'Test Müşteri' };
  const company = { ...EMPTY_COMPANY_PROFILE };

  it('varsayılan metin müşteri terminolojisini kullanır: Toplam Maliyet + Genel Toplam', () => {
    const { plainText } = buildProposalContent(customer, company, 2026, pricing);
    expect(plainText).toContain('Toplam Maliyet 50.000,00 TL');
    expect(plainText).toContain('Genel Toplam 60.000,00 TL');
    expect(plainText).not.toContain('Hizmet bedeli');
  });

  it('kullanıcının düzenlediği paragraflar aynen kullanılır (otomatik metin yalnızca öneridir)', () => {
    const custom = ['Birinci özel paragraf.', 'İkinci özel paragraf.'];
    const { paragraphs, plainText } = buildProposalContent(customer, company, 2026, pricing, [], {
      customParagraphs: custom,
    });
    expect(paragraphs).toEqual(custom);
    expect(plainText).toContain('Birinci özel paragraf.');
    expect(plainText).not.toContain('Toplam Maliyet 50.000,00 TL');
  });

  it('hizmet satırları numaralı ve TUTARSIZ olarak "Hizmet Kapsamı" altında listelenir', () => {
    const { plainText, serviceLines } = buildProposalContent(customer, company, 2026, pricing, [], {
      serviceLines: ['Konutlar — Mesken (120 m²)', 'Arsalar — Arsa (500 m²)'],
    });
    expect(serviceLines).toHaveLength(2);
    expect(plainText).toContain('Hizmet Kapsamı:');
    expect(plainText).toContain('1. Konutlar — Mesken (120 m²)');
    expect(plainText).toContain('2. Arsalar — Arsa (500 m²)');
  });
});

describe('teklif şablonu motoru', () => {
  const pricing = computeProposalPricing(85000, 20);
  const customer = { ...EMPTY_CUSTOMER_INFO };

  it('yönetici şablonu varsa varsayılan yerine o kullanılır ve yer tutucular dolar', () => {
    const company = {
      ...EMPTY_COMPANY_PROFILE,
      iban: 'TR11 2222',
      proposalTemplate: ['Merhaba, {YIL} yılı için teklifimiz {TOPLAM} + %{KDV_ORANI} KDV = {GENEL_TOPLAM}.', 'IBAN: {IBAN}'],
    };
    const p = buildDefaultProposalParagraphs(customer, company, 2026, pricing);
    expect(p).toEqual(['Merhaba, 2026 yılı için teklifimiz 85.000,00 TL + %20 KDV = 102.000,00 TL.', 'IBAN: TR11 2222']);
  });

  it('{IBAN} paragrafı IBAN boşken şablondan atlanır', () => {
    const company = { ...EMPTY_COMPANY_PROFILE, iban: '', proposalTemplate: ['Sabit paragraf.', 'Ödeme: {IBAN}'] };
    expect(buildDefaultProposalParagraphs(customer, company, 2026, pricing)).toEqual(['Sabit paragraf.']);
  });

  it('bilinmeyen yer tutucu aynen bırakılır (sessiz bozulma yok)', () => {
    const out = renderProposalTemplate(['Test {BILINMEYEN} kalır.'], customer, { ...EMPTY_COMPANY_PROFILE }, 2026, pricing);
    expect(out[0]).toBe('Test {BILINMEYEN} kalır.');
  });

  it('gömülü varsayılan şablon, eski varsayılan metinle birebir aynı çıktıyı üretir', () => {
    const company = { ...EMPTY_COMPANY_PROFILE, iban: 'TR00 0000' };
    const rendered = renderProposalTemplate(DEFAULT_PROPOSAL_TEMPLATE, customer, company, 2026, pricing);
    expect(rendered[0]).toContain('Kurumumuza göstermiş olduğunuz ilgi');
    expect(rendered[3]).toBe('Hizmet kapsamına ilişkin Toplam Maliyet 85.000,00 TL olup, %20 KDV ile birlikte Genel Toplam 102.000,00 TL (Yüz İki Bin Türk Lirası) olarak belirlenmiştir.');
    expect(rendered[4]).toBe('Ödemenizi aşağıdaki IBAN numarası üzerinden gerçekleştirebilirsiniz: TR00 0000');
  });
});

describe('buildProposalContent — isteğe bağlı alanlar', () => {
  const pricing = computeProposalPricing(50000, 20);

  it('IBAN boşsa hiçbir ödeme cümlesi yazılmaz', () => {
    const { plainText } = buildProposalContent(
      { ...EMPTY_CUSTOMER_INFO, customerName: 'Test' },
      { ...EMPTY_COMPANY_PROFILE, iban: '' },
      2026, pricing
    );
    expect(plainText).not.toContain('IBAN');
    expect(plainText).not.toContain('Ödeme');
  });

  it('çoklu teklif dökümü: rapor başına tutarlar plainTexte yazılır ve toplam tutarlıdır', () => {
    const items = [
      { label: 'Çeşme Oteli Değerlemesi (İzmir / Çeşme)', amount: 185000 },
      { label: 'Kadıköy Dükkanlar (İstanbul / Kadıköy)', amount: 64000 },
      { label: 'Malatya Bahçeler (12 adet)', amount: 96000 },
    ];
    const total = items.reduce((s, it) => s + it.amount, 0);
    const p2 = computeProposalPricing(total, 20);
    const { plainText, serviceFeeItems } = buildProposalContent(
      { ...EMPTY_CUSTOMER_INFO, customerName: 'Test' },
      { ...EMPTY_COMPANY_PROFILE },
      2026, p2, [], { serviceFeeItems: items }
    );
    expect(serviceFeeItems).toHaveLength(3);
    expect(plainText).toContain('Hizmet ve Ücret Dökümü:');
    expect(plainText).toContain('1. Çeşme Oteli Değerlemesi (İzmir / Çeşme): 185.000,00 TL');
    expect(plainText).toContain('Toplam Maliyet 345.000,00 TL');
    // Döküm varken iç kalemler yine görünmez:
    for (const forbidden of ['Tapu Harcı', 'Belediye Harcı', 'Birlik Payı', 'Yol Ücreti']) {
      expect(plainText).not.toContain(forbidden);
    }
  });

  it('hizmet satırında bağımsız bölüm numarası (varsa) yer alır', () => {
    const breakdowns = [
      { propertyId: 'a', label: 'Taşınmaz 1', groupName: 'Konutlar', subtypeName: 'Mesken', area: 145, baseFee: 0, finalFee: 0, isManual: false },
    ];
    const lines = buildServiceLines(breakdowns as never, [{ id: 'a', ada: '1954', parsel: '7', bagimsizBolum: '3, 5' }]);
    expect(lines[0]).toBe('Konutlar — Mesken (145 m²) — Ada 1954, Parsel 7, B.B. 3, 5');
  });

  it('hizmet satırlarına doldurulmuş mahalle/ada/parsel eklenir, boş olanlar atlanır', () => {
    const breakdowns = [
      { propertyId: 'a', label: 'Taşınmaz 1', groupName: 'Konutlar', subtypeName: 'Mesken', area: 145, baseFee: 0, finalFee: 0, isManual: false },
      { propertyId: 'b', label: 'Taşınmaz 2', groupName: 'Arsalar ve Araziler', subtypeName: 'Arsa', area: 500, baseFee: 0, finalFee: 0, isManual: false },
    ];
    const lines = buildServiceLines(breakdowns as never, [
      { id: 'a', mahalle: 'Merkez', ada: '1954', parsel: '7' },
      { id: 'b' },
    ]);
    expect(lines[0]).toBe('Konutlar — Mesken (145 m²) — Merkez Mah., Ada 1954, Parsel 7');
    expect(lines[1]).toBe('Arsalar ve Araziler — Arsa (500 m²)');
  });
});

describe('buildProposalContent — iç kalem sızıntısı yok', () => {
  it('teklif metni iç maliyet kalemi tutarlarını içermez', () => {
    const pricing = computeProposalPricing(50000, 20);
    const { plainText } = buildProposalContent(
      { ...EMPTY_CUSTOMER_INFO, customerName: 'Test Müşteri', reportSubject: 'Kredi teminatı' },
      { ...EMPTY_COMPANY_PROFILE, iban: 'TR00 0000 0000 0000 0000 0000 00' },
      2026,
      pricing
    );

    // Yasaklı iç kalemler. Kurumsal metin revizyonuyla (2026-07-17) kural sıkılaştı:
    // tapu/belediye harcı artık tutarsız bilgilendirme cümlesi olarak dahi GEÇEMEZ.
    // "TDUB" kısaltması yalnızca mevzuat referansı olarak meşrudur ("TDUB mevzuatı");
    // maliyet kalemi olarak ("TDUB Birlik Payı") yasaktır.
    const forbiddenLabels = [
      'Tapu Harcı', 'tapu harcı', 'Belediye Harcı', 'belediye harcı',
      'Birlik Payı', 'Bilgi Merkezi Payı', 'Ulaşım Bedeli', 'Yol Ücreti',
      'resmî gider', 'Resmî Gider', 'Diğer Gider',
    ];
    for (const label of forbiddenLabels) {
      expect(plainText).not.toContain(label);
    }

    // Metinde yalnızca teklif bedeli, KDV ve genel toplam tutarları geçebilir:
    const amountsInText = plainText.match(/[\d.]+,\d{2} TL/g) ?? [];
    const allowed = new Set(['50.000,00 TL', '10.000,00 TL', '60.000,00 TL']);
    for (const a of amountsInText) {
      expect(allowed.has(a), `Teklif metninde beklenmeyen tutar: ${a}`).toBe(true);
    }
  });
});
