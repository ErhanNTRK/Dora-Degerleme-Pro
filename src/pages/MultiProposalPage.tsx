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
  type ProposalRow,
} from '../proposal/multiProposalRows';
import { buildProposalPdfBlob } from '../proposal/generateProposalPdf';
import { buildProposalDocxBlob } from '../proposal/generateProposalDocx';
import { ProposalPreviewModal } from '../components/ProposalPreviewModal';
import { Accordion } from '../components/Accordion';
import { EMPTY_CUSTOMER_INFO } from '../types/profile';
import { formatTL, uid } from '../utils/format';
import { downloadBlob, shareOrDownloadFile, shareTextToWhatsApp } from '../utils/share';
import { DownloadIcon, ShareIcon, WhatsAppIcon, AlertIcon } from '../components/icons';

type ActionKind = 'pdf-download' | 'pdf-share' | 'docx-download' | 'docx-share' | 'whatsapp';

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
  const { tariff } = useTariff();
  const { settings } = useSettings();
  const { profile: company } = useCompanyProfile();
  const { locationDb } = useLocationDb();

  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [customer, setCustomer] = useState({ ...EMPTY_CUSTOMER_INFO });
  const [showFeeBreakdown, setShowFeeBreakdown] = useState(true);
  const [customParagraphs, setCustomParagraphs] = useState<string[] | null>(null);
  const [pendingAction, setPendingAction] = useState<ActionKind | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedCalcs, setSavedCalcs] = useState<SavedCalculation[]>([]);
  const [importSelectId, setImportSelectId] = useState('');

  useEffect(() => {
    db.calculations.orderBy('createdAt').reverse().toArray().then(setSavedCalcs);
  }, []);

  // İlk satır tarife yüklenince eklenir (idempotent — StrictMode güvenli).
  useEffect(() => {
    if (!tariff) return;
    setRows((prev) => (prev.length > 0 ? prev : [createEmptyRow(tariff, uid())]));
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

  const computations = useMemo(() => {
    if (!tariff || !calcSettings) return new Map<string, ReturnType<typeof computeRow>>();
    return new Map(rows.map((r) => [r.id, computeRow(tariff, r, calcSettings)]));
  }, [rows, tariff, calcSettings]);

  const feeItems: ServiceFeeItem[] = useMemo(() => {
    if (!tariff) return [];
    return rows.map((r) => ({
      label: rowDocumentLabel(r, tariff),
      amount: rowEffectiveAmount(r, computations.get(r.id) ?? { subtotal: 0, warnings: [], result: null }),
    }));
  }, [rows, tariff, computations]);

  const totalAmount = Math.round(feeItems.reduce((s, it) => s + Math.max(0, it.amount), 0) * 100) / 100;
  const vatRate = settings?.vatRatePercent ?? 20;
  const pricing = rows.length > 0 ? computeProposalPricing(totalAmount, vatRate) : null;
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
    setRows((prev) => [...prev, createEmptyRow(tariff, uid())]);
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
    const prov = locationDb?.provinces.find((p) => p.name === provinceName);
    const d = prov?.districts.find((x) => x.name === districtName);
    if (districtName && d && d.fee !== null) {
      updateRow(row.id, { province: provinceName, district: districtName, municipalityFee: d.fee, municipalityFeeSource: 'database' });
    } else if (districtName) {
      updateRow(row.id, { province: provinceName, district: districtName, municipalityFee: 0, municipalityFeeSource: 'manual' });
    } else {
      updateRow(row.id, { province: provinceName, district: '', municipalityFee: 0, municipalityFeeSource: null });
    }
  }

  // ---------------- Belge / kayıt ----------------
  async function executeAction(kind: ActionKind) {
    if (!pricing) return;
    if (kind === 'pdf-download' || kind === 'pdf-share') {
      const { blob, fileName } = buildProposalPdfBlob({ customer, company, tariffYear, pricing, contentOptions });
      if (kind === 'pdf-download') downloadBlob(blob, fileName);
      else await shareOrDownloadFile(blob, fileName, 'application/pdf');
    } else if (kind === 'docx-download' || kind === 'docx-share') {
      const { blob, fileName } = await buildProposalDocxBlob({ customer, company, tariffYear, pricing, contentOptions });
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
      id: uid(),
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
    });
    setSaved(true);
  }

  if (!tariff || !calcSettings) return <p>Tarife verisi yükleniyor…</p>;

  const provinceOptions = locationDb?.provinces ?? [];

  return (
    <div>
      <div className="page__header">
        <span className="page__eyebrow">Teklif</span>
        <h1 className="page__title">Çoklu Teklif</h1>
        <p className="page__desc">
          Her satır ayrı bir değerleme raporudur; tutarı kendi harçlarıyla otomatik hesaplanır.
          Satır ekleyin, silin, sıralayın — tek belgede profesyonel teklif hazırlayın.
        </p>
      </div>

      {/* ---------------- Rapor satırları ---------------- */}
      {rows.map((row, idx) => {
        const comp = computations.get(row.id) ?? { subtotal: 0, warnings: [], result: null };
        const group = tariff.groups.find((g) => g.id === row.groupId);
        const districts = provinceOptions.find((p) => p.name === row.province)?.districts ?? [];
        const bulkEligible = (row.groupId === 'G1' || row.groupId === 'G2') && row.count > 1;
        return (
          <div key={row.id} className="property-card">
            <div className="property-card__header">
              <span className="property-card__badge">{idx + 1}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => moveRow(row.id, -1)} disabled={idx === 0} aria-label="Yukarı taşı">↑</button>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => moveRow(row.id, 1)} disabled={idx === rows.length - 1} aria-label="Aşağı taşı">↓</button>
                {rows.length > 1 && (
                  <button type="button" className="remove-btn" onClick={() => removeRow(row.id)}>Sil</button>
                )}
              </div>
            </div>

            <div className="field">
              <label className="field__label">Satır Adı (belgede görünecek — isteğe bağlı)</label>
              <input className="input" value={row.label} placeholder={rowDocumentLabel(row, tariff)} onChange={(e) => updateRow(row.id, { label: e.target.value })} />
            </div>

            {row.kind === 'saved' ? (
              <p className="field__hint">
                Kayıtlı hesaplamadan aktarıldı: <strong>{row.savedTitle}</strong> — Toplam Maliyet {formatTL(row.savedSubtotal ?? 0)}
              </p>
            ) : (
              <>
                <div className="property-row-split">
                  <div className="field">
                    <label className="field__label">Grup</label>
                    <select
                      className="select"
                      value={row.groupId}
                      onChange={(e) => {
                        const g = tariff.groups.find((x) => x.id === e.target.value);
                        updateRow(row.id, { groupId: e.target.value, subtypeId: g?.subtypes[0]?.id ?? '' });
                      }}
                    >
                      {tariff.groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field__label">Adet</label>
                    <input className="input" type="number" min={1} value={row.count} onChange={(e) => updateRow(row.id, { count: Math.max(1, Number(e.target.value)) })} />
                  </div>
                </div>

                <div className="property-row-split">
                  <div className="field">
                    <label className="field__label">Tür</label>
                    <select className="select" value={row.subtypeId} onChange={(e) => updateRow(row.id, { subtypeId: e.target.value })}>
                      {group?.subtypes.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field__label">Alan (m²)</label>
                    <input className="input" type="number" min={0} value={row.area ?? ''} onChange={(e) => updateRow(row.id, { area: e.target.value ? Number(e.target.value) : undefined })} />
                  </div>
                </div>

                {bulkEligible && (
                  <div className="checkbox-row">
                    <div>
                      <div className="checkbox-row__label">{row.groupId === 'G1' ? 'Aynı mahalle/köy sınırlarında' : 'Aynı parsel üzerinde'}</div>
                      <div className="checkbox-row__value">SPK toplu değerleme indirimi uygulanır (en büyüğü tam, diğerleri %{row.groupId === 'G1' ? 20 : 15}).</div>
                    </div>
                    <button type="button" className="switch" data-checked={row.bulkTogether} onClick={() => updateRow(row.id, { bulkTogether: !row.bulkTogether })} aria-label="Toplu değerleme">
                      <span className="switch__thumb" />
                    </button>
                  </div>
                )}

                <div className="property-row-split">
                  <div className="field">
                    <label className="field__label">İl</label>
                    <select className="select" value={row.province} onChange={(e) => handleRowDistrictChange(row, e.target.value, '')}>
                      <option value="">Seçiniz</option>
                      {provinceOptions.map((p) => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field__label">İlçe</label>
                    <select className="select" value={row.district} disabled={!row.province} onChange={(e) => handleRowDistrictChange(row, row.province, e.target.value)}>
                      <option value="">Seçiniz</option>
                      {districts.map((d) => (
                        <option key={d.name} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {row.municipalityFeeSource === 'manual' && (
                  <div className="field">
                    <label className="field__label">Belediye Harcı (TL) — bu ilçe için resmi veri yok</label>
                    <input className="input" type="number" min={0} value={row.municipalityFee} onChange={(e) => updateRow(row.id, { municipalityFee: Number(e.target.value) })} />
                  </div>
                )}

                <div className="property-row-split">
                  <div className="field">
                    <label className="field__label">Mahalle (isteğe bağlı)</label>
                    <input className="input" value={row.mahalle ?? ''} onChange={(e) => updateRow(row.id, { mahalle: e.target.value || undefined })} />
                  </div>
                  <div className="field">
                    <label className="field__label">Ada / Parsel</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className="input" placeholder="Ada" value={row.ada ?? ''} onChange={(e) => updateRow(row.id, { ada: e.target.value || undefined })} />
                      <input className="input" placeholder="Parsel" value={row.parsel ?? ''} onChange={(e) => updateRow(row.id, { parsel: e.target.value || undefined })} />
                    </div>
                  </div>
                </div>

                {comp.warnings.length > 0 && row.manualAmount === null && (
                  <div className="warning-banner">
                    <AlertIcon width={18} height={18} />
                    <span>{comp.warnings[0]} Gerekirse aşağıdan satır tutarını elle girin.</span>
                  </div>
                )}
              </>
            )}

            <div className="field">
              <label className="field__label">Satır Tutarı (Toplam Maliyet)</label>
              <input
                className="input"
                type="number"
                min={0}
                value={rowEffectiveAmount(row, comp)}
                onChange={(e) => updateRow(row.id, { manualAmount: Number(e.target.value) })}
              />
              <span className="field__hint">
                {row.manualAmount !== null ? (
                  <>Elle girildi. <button type="button" className="remove-btn" style={{ padding: 0 }} onClick={() => updateRow(row.id, { manualAmount: null })}>Otomatik hesaba dön ({formatTL(comp.subtotal)})</button></>
                ) : (
                  'Motor tarafından rapor başına harçlar dahil otomatik hesaplandı; değiştirmeniz motoru etkilemez.'
                )}
              </span>
            </div>
          </div>
        );
      })}

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
                <div className="checkbox-row__label">Ücretleri raporlara göre ayrı göster</div>
                <div className="checkbox-row__value">Kapalıyken raporlar tutarsız listelenir; yalnızca tek satır Toplam Maliyet görünür.</div>
              </div>
              <button type="button" className="switch" data-checked={showFeeBreakdown} onClick={() => setShowFeeBreakdown((v) => !v)} aria-label="Ücretleri ayrı göster">
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
                {saved ? 'Teklif Kaydedildi ✓' : 'Teklifi Kaydet'}
              </button>
            </div>
          </div>
        </>
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
