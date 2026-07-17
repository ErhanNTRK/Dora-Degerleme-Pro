import { useEffect, useMemo, useState } from 'react';
import { db, type SavedCalculation } from '../db/database';
import { useSettings } from '../context/SettingsContext';
import { useCompanyProfile } from '../context/CompanyProfileContext';
import { useTariff } from '../context/TariffContext';
import {
  buildProposalContent,
  buildDefaultProposalParagraphs,
  computeProposalPricing,
  type ServiceFeeItem,
} from '../proposal/buildProposalContent';
import { buildProposalPdfBlob } from '../proposal/generateProposalPdf';
import { buildProposalDocxBlob } from '../proposal/generateProposalDocx';
import { ProposalPreviewModal } from '../components/ProposalPreviewModal';
import { Accordion } from '../components/Accordion';
import { EMPTY_CUSTOMER_INFO } from '../types/profile';
import { formatTL, uid } from '../utils/format';
import { downloadBlob, shareOrDownloadFile, shareTextToWhatsApp } from '../utils/share';
import { DownloadIcon, ShareIcon, WhatsAppIcon } from '../components/icons';

type ActionKind = 'pdf-download' | 'pdf-share' | 'docx-download' | 'docx-share' | 'whatsapp';

/**
 * Çoklu Teklif: birden fazla KAYITLI hesaplamayı tek müşteri teklifinde birleştirir.
 *
 * Mimari not (motor dokunulmazlığı): her rapor kendi hesaplaması olarak yapılır ve
 * kaydedilir; rapor başına tapu/belediye/yol/TDUB/bilgi merkezi ücretleri motor
 * tarafından O hesaplamada zaten doğru hesaplanmıştır. Bu sayfa yalnızca müşteriye
 * sunulan tutarları birleştirir — motor, tarife ve harç mantığına DOKUNMAZ.
 * Belgede iç kalemler asla görünmez; rapor başına gösterilen tutar, o hesaplamanın
 * müşteri tutarıdır (varsayılan: Toplam Maliyet, kullanıcı satır satır düzenleyebilir).
 */
export function MultiProposalPage() {
  const { tariff } = useTariff();
  const { settings } = useSettings();
  const { profile: company } = useCompanyProfile();

  const [calculations, setCalculations] = useState<SavedCalculation[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customer, setCustomer] = useState({ ...EMPTY_CUSTOMER_INFO });
  // Rapor başına müşteri tutarları (yalnızca seçili kayıtlar için; anahtar = calculationId).
  const [rowAmounts, setRowAmounts] = useState<Record<string, number>>({});
  const [showFeeBreakdown, setShowFeeBreakdown] = useState(true);
  const [customParagraphs, setCustomParagraphs] = useState<string[] | null>(null);
  const [pendingAction, setPendingAction] = useState<ActionKind | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    db.calculations.orderBy('createdAt').reverse().toArray().then(setCalculations);
  }, []);

  const selected = useMemo(
    () => selectedIds.map((id) => calculations.find((c) => c.id === id)).filter((c): c is SavedCalculation => Boolean(c)),
    [selectedIds, calculations]
  );

  function toggleSelect(calc: SavedCalculation) {
    setSelectedIds((prev) => (prev.includes(calc.id) ? prev.filter((x) => x !== calc.id) : [...prev, calc.id]));
    setRowAmounts((prev) => (calc.id in prev ? prev : { ...prev, [calc.id]: calc.result.subtotal }));
    setSaved(false);
  }

  function rowLabel(calc: SavedCalculation): string {
    const loc = [calc.province, calc.district].filter(Boolean).join(' / ');
    return loc ? `${calc.title} (${loc})` : calc.title;
  }

  const feeItems: ServiceFeeItem[] = selected.map((c) => ({ label: rowLabel(c), amount: rowAmounts[c.id] ?? c.result.subtotal }));
  const totalAmount = feeItems.reduce((s, it) => s + Math.max(0, it.amount), 0);
  const vatRate = settings?.vatRatePercent ?? 20;
  const pricing = selected.length > 0 ? computeProposalPricing(Math.round(totalAmount * 100) / 100, vatRate) : null;

  const contentOptions = {
    serviceFeeItems: showFeeBreakdown ? feeItems : [],
    serviceLines: showFeeBreakdown ? [] : feeItems.map((it) => it.label),
    customParagraphs,
  };

  const tariffYear = tariff?.tariffYear ?? new Date().getFullYear();
  const editorParagraphs =
    customParagraphs ?? (pricing ? buildDefaultProposalParagraphs(customer, company, tariffYear, pricing) : []);

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
    if (!pricing || selected.length === 0) return;
    const { plainText } = buildProposalContent(customer, company, tariffYear, pricing, [], contentOptions);
    const customerLabel = customer.companyName.trim() || customer.customerName.trim() || 'Müşteri';
    await db.proposals.put({
      id: uid(),
      createdAt: new Date().toISOString(),
      title: `Çoklu Teklif — ${customerLabel} (${selected.length} rapor)`,
      kind: 'multi',
      calculationIds: selected.map((c) => c.id),
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

  return (
    <div>
      <div className="page__header">
        <span className="page__eyebrow">Teklif</span>
        <h1 className="page__title">Çoklu Teklif</h1>
        <p className="page__desc">
          Kayıtlı hesaplamaları tek teklifte birleştirin. Her rapor kendi harçlarıyla ayrı
          hesaplanmış olmalıdır; bu ekran yalnızca müşteriye sunulan tutarları birleştirir.
        </p>
      </div>

      <div className="card">
        <div className="section-title">1. Raporları Seçin</div>
        {calculations.length === 0 && (
          <p className="field__hint">
            Henüz kayıtlı hesaplama yok. Önce her rapor için "Yeni Hesaplama" ile hesaplama yapıp
            kaydedin (her lokasyon/rapor kendi belediye harcı ve ücretleriyle ayrı kaydedilmelidir).
          </p>
        )}
        {calculations.map((calc) => (
          <div key={calc.id} className="checkbox-row">
            <div>
              <div className="checkbox-row__label">{rowLabel(calc)}</div>
              <div className="checkbox-row__value">
                {new Date(calc.createdAt).toLocaleDateString('tr-TR')} • Toplam Maliyet: {formatTL(calc.result.subtotal)}
              </div>
            </div>
            <button
              type="button"
              className="switch"
              data-checked={selectedIds.includes(calc.id)}
              onClick={() => toggleSelect(calc)}
              aria-label={`${calc.title} seç`}
            >
              <span className="switch__thumb" />
            </button>
          </div>
        ))}
      </div>

      {selected.length > 0 && pricing && (
        <>
          <div className="card">
            <div className="section-title">2. Müşteri</div>
            <div className="field">
              <label className="field__label">Müşteri Türü</label>
              <select
                className="select"
                value={customer.customerType}
                onChange={(e) => setCustomer({ ...customer, customerType: e.target.value as typeof customer.customerType })}
              >
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

          <div className="card">
            <div className="section-title">3. Tutarlar</div>
            <div className="checkbox-row">
              <div>
                <div className="checkbox-row__label">Ücretleri raporlara göre ayrı göster</div>
                <div className="checkbox-row__value">
                  Açık: belgede rapor başına tutarlı "Hizmet ve Ücret Dökümü" yer alır. Kapalı:
                  raporlar tutarsız listelenir, yalnızca tek satır Toplam Maliyet görünür.
                </div>
              </div>
              <button
                type="button"
                className="switch"
                data-checked={showFeeBreakdown}
                onClick={() => setShowFeeBreakdown((v) => !v)}
                aria-label="Ücretleri ayrı göster"
              >
                <span className="switch__thumb" />
              </button>
            </div>

            {selected.map((calc) => (
              <div key={calc.id} className="field" style={{ marginTop: 10 }}>
                <label className="field__label">{rowLabel(calc)}</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={rowAmounts[calc.id] ?? calc.result.subtotal}
                  onChange={(e) => setRowAmounts({ ...rowAmounts, [calc.id]: Number(e.target.value) })}
                />
                <span className="field__hint">Varsayılan: bu raporun Toplam Maliyet'i ({formatTL(calc.result.subtotal)}). Değiştirmeniz hesaplama kaydını etkilemez.</span>
              </div>
            ))}

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
                {customParagraphs !== null && (
                  <strong> Metin elle düzenlendi: tutar değişiklikleri metne otomatik yansımaz.</strong>
                )}
              </p>
              {editorParagraphs.map((para, idx) => (
                <div key={idx} className="field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="field__label">Paragraf {idx + 1}</label>
                    <button type="button" className="remove-btn" onClick={() => setCustomParagraphs(editorParagraphs.filter((_, i) => i !== idx))}>
                      Sil
                    </button>
                  </div>
                  <textarea
                    className="textarea"
                    rows={3}
                    value={para}
                    onChange={(e) => setCustomParagraphs(editorParagraphs.map((t, i) => (i === idx ? e.target.value : t)))}
                  />
                </div>
              ))}
              <div className="btn-row">
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => setCustomParagraphs([...editorParagraphs, ''])}>
                  Paragraf Ekle
                </button>
                {customParagraphs !== null && (
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => setCustomParagraphs(null)}>
                    Otomatik Metne Dön
                  </button>
                )}
              </div>
            </Accordion>
          </div>

          <div className="card">
            <div className="section-title">4. Teklif Belgesi</div>
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
