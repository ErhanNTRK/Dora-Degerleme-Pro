/**
 * RAPOR MALİYETİ v3 — satır başına yüzde modeli (saf; motor değişmez).
 *
 * Salih kuralları (2026-07-26):
 *  - Her taşınmazın TABAN ücreti kendi tarifesinden, motorla tek başına hesaplanır.
 *  - Çok taşınmazlı raporda EN YÜKSEK taban %100; diğerleri kendi grubunun tebliğ
 *    oranıyla önerilir (G2 → %15, G1 → %20, tebliğde oranı olmayanlar → %20).
 *    Kullanıcı her satırın yüzdesini serbestçe değiştirebilir (%100, %50, …).
 *  - Belediye harcı TAŞINMAZ BAŞINA ayrı satırdır (elle/sıfır); G1'de uygulanmaz.
 *  - Tapu harcı TAŞINMAZ BAŞINA birer gelir; her satırda artırılıp azaltılabilir.
 *  - Yol/TDUB/bilgi merkezi rapor başına TEK'tir; kapatılabilir.
 *  - Rapor için TEKLİF TUTARI elle ezilebilir (maliyet dökümü yine görünür).
 */
import type { Tariff } from '../types/tariff';
import type { CalculationSettings } from '../types/calculation';
import { calculate } from '../engine/calculationEngine';
import type { ServiceAlias } from '../types/serviceAliases';
import type { ImportRow } from './excelImport';

export interface RowFeeInput {
  row: ImportRow;
  alias: ServiceAlias | null;
  /** null → önerilen yüzde (en yüksek 100, diğerleri grup oranı) */
  pctOverride: number | null;
  /** Taşınmazın belediye harcı (G1'de 0 beklenir) */
  municipalityFee: number;
  /** Taşınmazın tapu (TAKBİS) adedi */
  deeds: number;
}

export interface RowFeeResult extends RowFeeInput {
  baseFee: number;
  defaultPct: number;
  appliedPct: number;
  rowServiceFee: number;
  titleDeedFee: number;
  /** Belediye harcı bu satırda mı uygulanır? Aynı ada/parseldeki taşınmazlar için
   *  harç PARSEL BAŞINA BİR KEZ alınır; parselin ilk satırı taşır, diğerleri false. */
  feeApplies: boolean;
  warning?: string;
}

export interface ReportCostV3 {
  rows: RowFeeResult[];
  serviceTotal: number;
  municipalityTotal: number;
  titleDeedTotal: number;
  transportFee: number;
  unionFee: number;
  infoCenterFee: number;
  computedSubtotal: number;      // hesaplanan maliyet (KDV hariç)
  subtotal: number;              // teklif ezmesi varsa o, yoksa computedSubtotal
  proposalOverridden: boolean;
  vatAmount: number;
  grandTotal: number;
  /** Grup, tebliğin kendiliğinden kurduğu türden mi (tek tür + koşul)? */
  tebligCompliant: boolean;
  warnings: string[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Tek taşınmazın taban ücreti: motor, tek başına ve rapor-tekleri kapalı çağrılır. */
export function computeBaseFee(
  tariff: Tariff, row: ImportRow, alias: ServiceAlias, settings: CalculationSettings,
): { fee: number; warning?: string } {
  const res = calculate(tariff, {
    properties: [{
      id: row.id, groupId: alias.groupId, subtypeId: alias.subtypeId, area: row.alan,
      label: [row.mahalle, [row.ada, row.parsel].filter(Boolean).join('/')].filter(Boolean).join(' ') || undefined,
    }],
    titleDeedCount: 0, municipalityFee: 0, otherFees: [],
    settings: {
      ...settings, titleDeedFeePerDeed: 0,
      transportFeeEnabled: false, unionFeeEnabled: false, infoCenterFeeEnabled: false,
    },
  });
  return { fee: res.minimumServiceFeeSubtotal, warning: res.warnings[0] };
}

/** Grubun tebliğ oranı: G2 %15, G1 %20, diğerleri (tebliğde oran yok) %20 önerilir. */
export function defaultDiscountPct(groupId: string): number {
  return groupId === 'G2' ? 15 : 20;
}

export function computeReportV3(
  tariff: Tariff, inputs: RowFeeInput[], settings: CalculationSettings,
  opts: { transport: boolean; union: boolean; infoCenter: boolean; proposalOverride: number | null },
): ReportCostV3 {
  const warnings: string[] = [];

  // 1) Taban ücretler
  const withBase = inputs.map((inp) => {
    if (!inp.alias) return { ...inp, baseFee: 0, warning: 'Tür seçilmedi' };
    const { fee, warning } = computeBaseFee(tariff, inp.row, inp.alias, settings);
    return { ...inp, baseFee: fee, warning };
  });

  // 2) Varsayılan yüzdeler: en yüksek taban %100, diğerleri kendi grubunun oranı
  const maxFee = Math.max(...withBase.map((w) => w.baseFee), 0);
  let fullGiven = false;
  const rows: RowFeeResult[] = withBase.map((w) => {
    let defaultPct = 100;
    if (withBase.length > 1) {
      if (!fullGiven && w.baseFee === maxFee) { defaultPct = 100; fullGiven = true; }
      else defaultPct = defaultDiscountPct(w.alias?.groupId ?? '');
    }
    const appliedPct = w.pctOverride ?? defaultPct;
    const rowServiceFee = r2(w.baseFee * appliedPct / 100);
    const titleDeedFee = r2(Math.max(0, w.deeds) * settings.titleDeedFeePerDeed);
    if (w.warning) warnings.push(w.warning);
    return { ...w, defaultPct, appliedPct, rowServiceFee, titleDeedFee, feeApplies: true };
  });

  /* Belediye harcı PARSEL BAŞINA bir kez: aynı ada/parseli paylaşan satırlardan
     yalnız ilki harcı taşır (ada/parsel boşsa satır kendi başına parseldir). */
  const seenParcel = new Set<string>();
  for (const x of rows) {
    const key = (x.row.ada || x.row.parsel)
      ? `${x.row.il}|${x.row.ilce}|${x.row.ada}/${x.row.parsel}`
      : `solo|${x.row.id}`;
    if (seenParcel.has(key)) x.feeApplies = false;
    else seenParcel.add(key);
  }

  if (rows.length >= 201) {
    warnings.push('201+ taşınmaz: tarifedeki 511.500 TL sabit ücret satırını elle kontrol edin.');
  }

  const serviceTotal = r2(rows.reduce((s, x) => s + x.rowServiceFee, 0));
  const municipalityTotal = r2(rows.reduce((s, x) => s + (x.feeApplies ? Math.max(0, x.municipalityFee) : 0), 0));
  const titleDeedTotal = r2(rows.reduce((s, x) => s + x.titleDeedFee, 0));
  const transportFee = opts.transport ? settings.transportFeePerReport : 0;
  const unionFee = opts.union ? settings.unionFeePerReport : 0;
  const infoCenterFee = opts.infoCenter ? settings.infoCenterFeePerReport : 0;

  const computedSubtotal = r2(serviceTotal + municipalityTotal + titleDeedTotal + transportFee + unionFee + infoCenterFee);
  const proposalOverridden = opts.proposalOverride != null;
  const subtotal = proposalOverridden ? r2(opts.proposalOverride!) : computedSubtotal;
  const vatAmount = r2(subtotal * (settings.vatRatePercent / 100));

  // Tebliğ uyumu: tek satır; ya da tek tür + (G1 aynı mahalle | G2 aynı ada/parsel)
  let tebligCompliant = rows.length <= 1;
  if (rows.length > 1) {
    const g = rows[0].alias?.groupId;
    const sameAlias = rows.every((x) => x.alias?.name === rows[0].alias?.name);
    if (sameAlias && g === 'G1') tebligCompliant = rows.every((x) => x.row.mahalle && x.row.mahalle === rows[0].row.mahalle);
    else if (sameAlias && g === 'G2') tebligCompliant = rows.every((x) => `${x.row.ada}/${x.row.parsel}` === `${rows[0].row.ada}/${rows[0].row.parsel}`);
    else tebligCompliant = false;
  }

  return {
    rows, serviceTotal, municipalityTotal, titleDeedTotal,
    transportFee, unionFee, infoCenterFee,
    computedSubtotal, subtotal, proposalOverridden,
    vatAmount, grandTotal: r2(subtotal + vatAmount),
    tebligCompliant, warnings,
  };
}
