import { useEffect, useMemo, useState } from 'react';
import { db, type SavedCalculation } from '../db/database';
import { useSettings } from '../context/SettingsContext';
import { useCompanyProfile } from '../context/CompanyProfileContext';
import { useTariff } from '../context/TariffContext';
import { useLocationDb } from '../context/LocationContext';
import type { CalculationSettings } from '../types/calculation';
import {
  buildProposalContent,
  buildDefaultProposalParagraphs,
  computeProposalPricing,
  type ServiceFeeItem,
} from '../proposal/buildProposalContent';
import {
  createEmptyRow,
  computeRow,
  rowDocumentLabel,
  rowEffectiveAmount,
  findCrossRowIssues,
  mergeRows,
  computeRowMoney,
  splitRowPerProperty,
  type ProposalRow,
} from '../proposal/multiProposalRows';
import { buildProposalPdfBlobLazy, buildProposalDocxBlobLazy, preloadDocs } from '../proposal/lazyDocs';
import { ProposalPreviewModal } from '../components/ProposalPreviewModal';
import { Accordion } from '../components/Accordion';
import { ProposalRowCard } from '../components/ProposalRowCard';
import { ProposalSummaryTable } from '../components/ProposalSummaryTable';
import { buildSummaryRows, summaryTotals } from '../proposal/summaryTable';
import { EMPTY_CUSTOMER_INFO } from '../types/profile';
import { formatTL, uid } from '../utils/format';
import { downloadBlob, shareOrDownloadFile, shareTextToWhatsApp } from '../utils/share';
import { DownloadIcon, ShareIcon, WhatsAppIcon, AlertIcon } from '../components/icons';

type ActionKind = 'pdf-download' | 'pdf-share' | 'docx-download' | 'docx-share' | 'whatsapp';

/**
 * Taslak koruması: sahada yarım kalan çoklu teklif, sayfa yenilense / uygulama arka
 * plana atılsa bile kaybolmaz. Taslak cihazda tutulur; "Taslağı Sil" ile temizlenir.
 */
import { MULTI_PROPOSAL_DRAFT_KEY } from '../bulk/excelImport';
const DRAFT_KEY = MULTI_PROPOSAL_DRAFT_KEY;   // tek doğruluk kaynağı: src/bulk/excelImport

interface ComposerDraft {
  rows: ProposalRow[];
  customer: typeof EMPTY_CUSTOMER_INFO;
  showFeeBreakdown: boolean;
  showItemVat?: boolean;
  customParagraphs: string[] | null;
  /** Kayıtlı bir teklif düzenleniyorsa kimliği: Kaydet o teklifi günceller. */
  editingId?: string;
}

function readDraft(): ComposerDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as ComposerDraft;
    return Array.isArray(d.rows) && d.rows.length > 0 ? d : null;
  } catch {
    localStorage.removeItem(DRAFT_KEY);
    return null;
  }
}

/**
 * ÇOKLU TEKLİF KOMPOZERİ — tamamen bağımsız akış.
 *
 * Kullanıcı tekli teklif oluşturmak zorunda kalmadan, tek ekranda istediği kadar
 * rapor satırı ekler. Her satır SPK anlamında bir rapordur ve motor satır başına
 * DEĞİŞTİRİLMEDEN çağrılır → rapor başına tapu/belediye/ulaşım/TDUB/bilgi merkezi
 * ücretleri mevzuata uygun otomatik hesaplanır. Satır tutarı istenirse elle ezilir;
 * bu yalnızca müşteri teklifini etkiler, motoru ve kayıtları etkilemez.
 */
export function MultiProposalPage() {
  const { tariff, serviceAliases } = useTariff();
  const { settings } = useSettings();
  const { profile: company } = useCompanyProfile();
  const { locationDb } = useLocationDb();

  const [draft] = useState<ComposerDraft | null>(() => readDraft());
  const [rows, setRows] = useState<ProposalRow[]>(draft?.rows ?? []);
  const [customer, setCustomer] = useState(draft?.customer ?? { ...EMPTY_CUSTOMER_INFO });
  const [showFeeBreakdown, setShowFeeBreakdown] = useState(draft?.showFeeBreakdown ?? true);
  const [customParagraphs, setCustomParagraphs] = useState<string[] | null>(draft?.customParagraphs ?? null);
  /** Her satır tutarının altında KDV dahil tutarı da yazılsın mı (PDF/Word/metin). */
  const [showItemVat, setShowItemVat] = useState(draft?.showItemVat ?? true);
  const [editingId, setEditingId] = useState<string | undefined>(draft?.editingId);
  const [pendingAction, setPendingAction] = useState<ActionKind | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedCalcs, setSavedCalcs] = useState<SavedCalculation[]>([]);
  const [importSelectId, setImportSelectId] = useState('');

  useEffect(() => { if (pendingAction) preloadDocs(); }, [pendingAction]);

  useEffect(() => {
    db.calculations.orderBy('createdAt').reverse().toArray().then(setSavedCalcs);
  }, []);

  function newRow(): ProposalRow {
    const base = createEmptyRow(tariff!, uid());
    const first = serviceAliases[0];
    // Varsayılan: en yaygın hizmet türü (listenin ilki) — sahada en az dokunuş.
    const last = rows[rows.length - 1];
    const loc = last && last.kind === 'custom' ? { province: last.province, district: last.district } : {};
    return first ? { ...base, ...loc, serviceAlias: first.name, groupId: first.groupId, subtypeId: first.subtypeId } : { ...base, ...loc };
  }

  // Otomatik taslak: her anlamlı değişiklikte cihaza yazılır (~anlık, veri küçük).
  useEffect(() => {
    if (rows.length === 0) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ rows, customer, showFeeBreakdown, showItemVat, customParagraphs, editingId } satisfies ComposerDraft));
    } catch {
      /* depolama dolu ise sessiz geç — taslak kritik veri değildir */
    }
  }, [rows, customer, showFeeBreakdown, showItemVat, customParagraphs, editingId]);

  // İlk satır tarife yüklenince eklenir (idempotent — StrictMode güvenli).
  useEffect(() => {
    if (!tariff) return;
    setRows((prev) => (prev.length > 0 ? prev : [{ ...createEmptyRow(tariff, uid()), ...(serviceAliases[0] ? { serviceAlias: serviceAliases[0].name, groupId: serviceAliases[0].groupId, subtypeId: serviceAliases[0].subtypeId } : {}) }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tariff]);

  const calcSettings: CalculationSettings | null = useMemo(() => {
    if (!settings) return null;
    return {
      titleDeedFeePerDeed: settings.titleDeedFeePerDeed,
      infoCenterFeePerReport: settings.infoCenterFeePerReport,
      unionFeePerReport: settings.unionFeePerReport,
      transportFeePerReport: settings.transportFeePerReport,
      vatRatePercent: settings.vatRatePercent,
      // Her satır ayrı bir rapor olduğu için rapor başına ücretler SPK gereği açıktır.
      infoCenterFeeEnabled: true,
      unionFeeEnabled: true,
      transportFeeEnabled: true,
    };
  }, [settings]);

  /** İl/ilçe için resmi belediye harcı: number = kayıtlı harç, null = ilçe seçili ama
   *  veri yok (manuel gerekir), undefined = ilçe seçilmemiş. Her render'da taze okunur. */
  function officialDistrictFee(province: string, district: string): number | null | undefined {
    if (!district) return undefined;
    const d = locationDb?.provinces.find((p) => p.name === province)?.districts.find((x) => x.name === district);
    return d ? d.fee : null;
  }

  /** Satırın motora giden harcı: uzman ezmişse o (0 dahil); yoksa resmi veri; o da yoksa
   *  manuel giriş. Resmi veri VARSAYILANDIR, son söz uzmanındır. */
  function resolvedRowFee(row: ProposalRow): number {
    if (row.municipalityFeeOverride !== null && row.municipalityFeeOverride !== undefined) {
      return row.municipalityFeeOverride;
    }
    const official = officialDistrictFee(row.province, row.district);
    return typeof official === 'number' ? official : row.municipalityFee;
  }

  const computations = useMemo(() => {
    if (!tariff || !calcSettings) return new Map<string, ReturnType<typeof computeRow>>();
    return new Map(rows.map((r) => [r.id, computeRow(tariff, { ...r, municipalityFee: resolvedRowFee(r) }, calcSettings)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tariff, calcSettings, locationDb]);

  /** Müşteriye gösterilecek satır tutarı: elle girilmişse o, değilse hesaplanan maliyet. Yuvarlama otomatik YAPILMAZ. */
  function customerAmount(r: ProposalRow): number {
    return rowEffectiveAmount(r, computations.get(r.id) ?? { subtotal: 0, warnings: [], result: null });
  }

  const vatRatePct = settings?.vatRatePercent ?? 20;
  /** Net/brüt satır tutarları: KDV dahil rakam yazılmışsa toplamlar kuruşsuz dengelenir. */
  const money = useMemo(
    () => computeRowMoney(rows.map((r) => ({ net: customerAmount(r), gross: r.manualAmount !== null ? r.grossAmount : null })), vatRatePct),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, computations, vatRatePct]
  );

  const feeItems: ServiceFeeItem[] = useMemo(() => {
    if (!tariff) return [];
    return rows.map((r, i) => ({
      label: rowDocumentLabel(r, tariff, serviceAliases),
      amount: money.nets[i],
      ...(showItemVat ? { grossAmount: money.grosses[i] } : {}),
    }));
  }, [rows, tariff, money, serviceAliases, showItemVat]);

  const totalAmount = Math.round(feeItems.reduce((s, it) => s + Math.max(0, it.amount), 0) * 100) / 100;
  const summaryRows = tariff ? buildSummaryRows(rows, computations, money, tariff) : [];
  const summaryTotalsValue = summaryTotals(summaryRows, money.grossTotal);
  const vatRate = settings?.vatRatePercent ?? 20;
  const pricing = rows.length > 0 ? computeProposalPricing(totalAmount, vatRate, money.grossTotal) : null;
  const tariffYear = tariff?.tariffYear ?? new Date().getFullYear();

  const contentOptions = {
    serviceFeeItems: showFeeBreakdown ? feeItems : [],
    serviceLines: showFeeBreakdown ? [] : feeItems.map((it) => it.label),
    customParagraphs,
  };

  const editorParagraphs =
    customParagraphs ?? (pricing ? buildDefaultProposalParagraphs(customer, company, tariffYear, pricing) : []);

  // ---------------- Satır işlemleri ----------------
  function updateRow(id: string, partial: Partial<ProposalRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...partial } : r)));
    setSaved(false);
  }

  function addRow() {
    if (!tariff) return;
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function moveRow(id: string, dir: -1 | 1) {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  /** Tüm teklifi baştan başlatır: taslağı siler, tek boş satır ve boş müşteri bilgisiyle açar. */
  function resetProposal() {
    if (!tariff) return;
    if (!window.confirm('Teklif sıfırlansın mı? Girdiğiniz tüm satırlar ve müşteri bilgileri silinir.')) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* sessiz geç */ }
    const first = serviceAliases[0];
    const base = createEmptyRow(tariff, uid());
    setRows([first ? { ...base, serviceAlias: first.name, groupId: first.groupId, subtypeId: first.subtypeId } : base]);
    setCustomer({ ...EMPTY_CUSTOMER_INFO });
    setShowFeeBreakdown(true);
    setCustomParagraphs(null);
    setPendingAction(null);
    setEditingId(undefined);
    setSaved(false);
  }

  function splitRow(row: ProposalRow) {
    setRows((prev) => prev.flatMap((r) => (r.id === row.id ? splitRowPerProperty(r, uid) : [r])));
    setSaved(false);
  }

  function importSavedCalculation(calcId: string) {
    const calc = savedCalcs.find((c) => c.id === calcId);
    if (!calc || !tariff) return;
    setRows((prev) => [
      ...prev,
      {
        ...createEmptyRow(tariff, uid()),
        kind: 'saved',
        savedCalculationId: calc.id,
        savedSubtotal: calc.result.subtotal,
        savedTitle: calc.title,
        province: calc.province ?? '',
        district: calc.district ?? '',
      },
    ]);
    setImportSelectId('');
  }

  function handleRowDistrictChange(row: ProposalRow, provinceName: string, districtName: string) {
    // Harç burada HESAPLANMAZ; resolvedRowFee her an resmi veriye taze bakar.
    // İl/ilçe değişiminde manuel giriş ve ezme sıfırlanır ki eski değer yeni ilçeye taşınmasın.
    updateRow(row.id, { province: provinceName, district: districtName, municipalityFee: 0, municipalityFeeOverride: undefined, municipalityFeeSource: null });
  }

  /** Aynı belediyedeki satırlar için il/ilçeyi tek dokunuşla hepsine kopyalar (mahalle/ada/parsel satıra özgü kalır). */
  function applyLocationToAll(src: ProposalRow) {
    setRows((prev) => prev.map((r) => (r.kind === 'custom' ? { ...r, province: src.province, district: src.district, municipalityFee: 0, municipalityFeeOverride: undefined, municipalityFeeSource: null } : r)));
    setSaved(false);
  }

  // ---------------- Belge / kayıt ----------------
  async function executeAction(kind: ActionKind) {
    if (!pricing) return;
    if (kind === 'pdf-download' || kind === 'pdf-share') {
      const { blob, fileName } = await buildProposalPdfBlobLazy({ customer, company, tariffYear, pricing, contentOptions });
      if (kind === 'pdf-download') downloadBlob(blob, fileName);
      else await shareOrDownloadFile(blob, fileName, 'application/pdf');
    } else if (kind === 'docx-download' || kind === 'docx-share') {
      const { blob, fileName } = await buildProposalDocxBlobLazy({ customer, company, tariffYear, pricing, contentOptions });
      if (kind === 'docx-download') downloadBlob(blob, fileName);
      else await shareOrDownloadFile(blob, fileName, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    } else {
      const { plainText } = buildProposalContent(customer, company, tariffYear, pricing, [], contentOptions);
      shareTextToWhatsApp(plainText);
    }
    setPendingAction(null);
  }

  async function handleSave() {
    if (!pricing || rows.length === 0) return;
    const { plainText } = buildProposalContent(customer, company, tariffYear, pricing, [], contentOptions);
    const customerLabel = customer.companyName.trim() || customer.customerName.trim() || 'Müşteri';
    const linkedIds = rows.filter((r) => r.kind === 'saved' && r.savedCalculationId).map((r) => r.savedCalculationId!);
    await db.proposals.put({
      id: editingId ?? uid(),
      createdAt: new Date().toISOString(),
      title: `Çoklu Teklif — ${customerLabel} (${rows.length} rapor)`,
      kind: 'multi',
      calculationIds: linkedIds.length > 0 ? linkedIds : undefined,
      customer,
      company,
      tariffYear,
      vatRatePercent: vatRate,
      bodyText: plainText,
      offerAmount: pricing.offerAmount,
      offerGrandTotal: pricing.grandTotal,
      contentOptions,
      multiDraft: { rows, customer, showFeeBreakdown, showItemVat, customParagraphs },
    });
    localStorage.removeItem(DRAFT_KEY); // kaydedilen teklif taslak olarak geri dönmesin
    setSaved(true);
  }

  if (!tariff || !calcSettings) return <p>Tarife verisi yükleniyor…</p>;

  const provinceOptions = locationDb?.provinces ?? [];

  return (
    <div style={{ paddingBottom: 76 }}>
      <div className="page__header">
        <span className="page__eyebrow">Teklif</span>
        <h1 className="page__title">Çoklu Teklif</h1>
        <p className="page__desc">
          Her satır ayrı bir değerleme raporudur; tutarı kendi harçlarıyla otomatik hesaplanır.
          Satır ekleyin, silin, sıralayın — tek belgede profesyonel teklif hazırlayın.
        </p>
        {editingId && (
          <p className="field__hint" style={{ marginBottom: 8, fontWeight: 650 }}>
            ✎ Kayıtlı bir teklif düzenleniyor. "Değişiklikleri Kaydet" o teklifi günceller.
          </p>
        )}
        <button type="button" className="btn btn--secondary btn--sm" onClick={resetProposal}>
          Teklifi Sıfırla
        </button>
      </div>

      {/* ---------------- Rapor satırları ---------------- */}
      {rows.map((row, idx) => (
        <ProposalRowCard
          key={row.id}
          row={row}
          idx={idx}
          rowCount={rows.length}
          comp={computations.get(row.id) ?? { subtotal: 0, warnings: [], result: null }}
          gross={money.grosses[idx]}
          vatRatePct={vatRatePct}
          tariff={tariff}
          serviceAliases={serviceAliases}
          provinces={provinceOptions}
          officialDistrictFee={officialDistrictFee}
          updateRow={updateRow}
          moveRow={moveRow}
          removeRow={removeRow}
          splitRow={splitRow}
          applyLocationToAll={applyLocationToAll}
          onDistrictChange={handleRowDistrictChange}
        />
      ))}

      {findCrossRowIssues(rows).map((issue) => (
        <div key={issue.rowIds.join('-')} className="warning-banner" style={{ alignItems: 'center' }}>
          <AlertIcon width={18} height={18} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{issue.message}</span>
          {issue.canMerge && (
            <button type="button" className="btn btn--gold btn--sm" style={{ flexShrink: 0 }} onClick={() => { setRows((prev) => mergeRows(prev, issue.rowIds)); setSaved(false); }}>
              Birleştir
            </button>
          )}
        </div>
      ))}

      <div className="btn-row">
        <button type="button" className="btn btn--secondary btn--block" onClick={addRow}>+ Satır Ekle</button>
      </div>
      {savedCalcs.length > 0 && (
        <div className="field" style={{ marginTop: 10 }}>
          <label className="field__label">Kayıtlı hesaplamadan satır ekle (isteğe bağlı)</label>
          <select className="select" value={importSelectId} onChange={(e) => e.target.value && importSavedCalculation(e.target.value)}>
            <option value="">Seçiniz…</option>
            {savedCalcs.map((c) => (
              <option key={c.id} value={c.id}>{c.title} — {formatTL(c.result.subtotal)}</option>
            ))}
          </select>
        </div>
      )}

      {pricing && (
        <>
          <ProposalSummaryTable rows={summaryRows} totals={summaryTotalsValue} />

          {/* ---------------- Müşteri ---------------- */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="section-title">Müşteri</div>
            <div className="field">
              <label className="field__label">Müşteri Türü</label>
              <select className="select" value={customer.customerType} onChange={(e) => setCustomer({ ...customer, customerType: e.target.value as typeof customer.customerType })}>
                <option value="bireysel">Bireysel</option>
                <option value="kurumsal">Kurumsal</option>
              </select>
            </div>
            {customer.customerType === 'kurumsal' && (
              <div className="field">
                <label className="field__label">Firma Ünvanı</label>
                <input className="input" value={customer.companyName} onChange={(e) => setCustomer({ ...customer, companyName: e.target.value })} />
              </div>
            )}
            <div className="field">
              <label className="field__label">{customer.customerType === 'kurumsal' ? 'İlgili Kişi (isteğe bağlı)' : 'Ad Soyad'}</label>
              <input className="input" value={customer.customerName} onChange={(e) => setCustomer({ ...customer, customerName: e.target.value })} />
            </div>
            <div className="field">
              <label className="field__label">Teklif Konusu (isteğe bağlı)</label>
              <input className="input" value={customer.reportSubject} onChange={(e) => setCustomer({ ...customer, reportSubject: e.target.value })} placeholder="Örn: Portföy değerleme çalışması" />
            </div>
          </div>

          {/* ---------------- Tutarlar + metin ---------------- */}
          <div className="card">
            <div className="section-title">Teklif Tutarı</div>
            <div className="checkbox-row">
              <div>
                <div className="checkbox-row__label">PDF'te her raporun ücretini ayrı göster</div>
                <div className="checkbox-row__value">Açık: her rapor tutarıyla alt alta listelenir, altında toplam yazar. Kapalı: raporlar tutarsız listelenir, yalnızca toplam görünür.</div>
              </div>
              <button type="button" className="switch" data-checked={showFeeBreakdown} onClick={() => setShowFeeBreakdown((v) => !v)} aria-label="Ücretleri ayrı göster">
                <span className="switch__thumb" />
              </button>
            </div>
            <div className="checkbox-row">
              <div>
                <div className="checkbox-row__label">Her tutarın altında KDV dahil değeri de yaz</div>
                <div className="checkbox-row__value">PDF, Word ve metinde her raporun altında "KDV dahil: …" görünür. Yalnızca ayrı gösterim açıkken geçerlidir.</div>
              </div>
              <button type="button" className="switch" data-checked={showItemVat} onClick={() => setShowItemVat((v) => !v)} aria-label="KDV dahil değeri yaz">
                <span className="switch__thumb" />
              </button>
            </div>
            <div className="result-row" style={{ marginTop: 6 }}>
              <span className="result-row__label">Toplam Maliyet</span>
              <span className="result-row__value">{formatTL(pricing.offerAmount)}</span>
            </div>
            <div className="result-row">
              <span className="result-row__label">KDV (%{pricing.vatRatePercent})</span>
              <span className="result-row__value">{formatTL(pricing.vatAmount)}</span>
            </div>
            <div className="result-row result-row--total">
              <span className="result-row__label">Genel Toplam</span>
              <span className="result-row__value">{formatTL(pricing.grandTotal)}</span>
            </div>

            <Accordion title="Teklif Metni" defaultOpen={false}>
              <p className="field__hint" style={{ marginBottom: 10 }}>
                Metin otomatik oluşturulur ve yalnızca başlangıç önerisidir; düzenleyebilirsiniz.
                {customParagraphs !== null && <strong> Metin elle düzenlendi: tutar değişiklikleri metne otomatik yansımaz.</strong>}
              </p>
              {editorParagraphs.map((para, i) => (
                <div key={i} className="field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="field__label">Paragraf {i + 1}</label>
                    <button type="button" className="remove-btn" onClick={() => setCustomParagraphs(editorParagraphs.filter((_, j) => j !== i))}>Sil</button>
                  </div>
                  <textarea className="textarea" rows={3} value={para} onChange={(e) => setCustomParagraphs(editorParagraphs.map((t, j) => (j === i ? e.target.value : t)))} />
                </div>
              ))}
              <div className="btn-row">
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => setCustomParagraphs([...editorParagraphs, ''])}>Paragraf Ekle</button>
                {customParagraphs !== null && (
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => setCustomParagraphs(null)}>Otomatik Metne Dön</button>
                )}
              </div>
            </Accordion>
          </div>

          {/* ---------------- Belge ---------------- */}
          <div className="card">
            <div className="section-title">Teklif Belgesi</div>
            <div className="btn-row">
              <button className="btn btn--gold btn--block" type="button" onClick={() => setPendingAction('pdf-download')}>
                <DownloadIcon width={18} height={18} /> Teklif PDF
              </button>
              <button className="btn btn--primary btn--block" type="button" onClick={() => setPendingAction('docx-download')}>
                <DownloadIcon width={18} height={18} /> Teklif Word
              </button>
            </div>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn btn--secondary" type="button" onClick={() => setPendingAction('pdf-share')}>
                <ShareIcon width={16} height={16} /> PDF Paylaş
              </button>
              <button className="btn btn--secondary" type="button" onClick={() => setPendingAction('whatsapp')}>
                <WhatsAppIcon width={16} height={16} /> WhatsApp
              </button>
            </div>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn btn--secondary btn--block" type="button" onClick={handleSave} disabled={saved}>
                {saved ? 'Teklif Kaydedildi ✓' : editingId ? 'Değişiklikleri Kaydet' : 'Teklifi Kaydet'}
              </button>
            </div>
          </div>
        </>
      )}

      {pricing && !pendingAction && (
        <div className="summary-bar">
          <div>
            <div className="summary-bar__label">Genel Toplam (KDV Dahil)</div>
            <div className="summary-bar__amount">{formatTL(pricing.grandTotal)}</div>
          </div>
          <button type="button" className="btn btn--gold" onClick={() => setPendingAction('pdf-download')}>
            <DownloadIcon width={18} height={18} /> Teklif PDF
          </button>
        </div>
      )}

      {pendingAction && pricing && (
        <ProposalPreviewModal
          content={buildProposalContent(customer, company, tariffYear, pricing, [], contentOptions)}
          company={company}
          customer={customer}
          propertyDetailLines={[]}
          pricing={pricing}
          onEdit={() => setPendingAction(null)}
          onConfirm={() => executeAction(pendingAction)}
          confirmLabel={pendingAction.startsWith('docx') ? 'Word Oluştur' : pendingAction === 'whatsapp' ? 'WhatsApp ile Gönder' : 'Belgeyi Oluştur'}
        />
      )}
    </div>
  );
}
