import type { CompanyProfile, CustomerInfo } from '../types/profile';
import type { ProposalPricing, PropertyDetailLine } from '../proposal/buildProposalContent';
import { formatTL } from '../utils/format';
import { amountToTurkishWords } from '../utils/turkishNumberToWords';

interface Props {
  company: CompanyProfile;
  customer: CustomerInfo;
  propertyDetailLines: PropertyDetailLine[];
  pricing: ProposalPricing;
  onEdit: () => void;
  onConfirm: () => void;
  confirmLabel: string;
}

export function ProposalPreviewModal({ company, customer, propertyDetailLines, pricing, onEdit, onConfirm, confirmLabel }: Props) {
  const customerLabel =
    customer.customerType === 'kurumsal'
      ? customer.companyName || customer.customerName || 'Belirtilmedi'
      : customer.customerName || customer.companyName || 'Belirtilmedi';

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-sheet">
        <div className="modal-sheet__header">
          <h2 className="page__title" style={{ fontSize: 18 }}>Belge Önizleme</h2>
          <p className="field__hint">Belgeyi oluşturmadan/göndermeden önce son kontrolü yapın.</p>
        </div>

        <div className="modal-sheet__body">
          <div className="card">
            <div className="section-title">Firma Bilgileri</div>
            <div className="result-row"><span className="result-row__label">Ünvan</span><span className="result-row__value">{company.companyName || '—'}</span></div>
            {company.authorizedName && <div className="result-row"><span className="result-row__label">Yetkili</span><span className="result-row__value">{company.authorizedName}</span></div>}
          </div>

          <div className="card">
            <div className="section-title">Müşteri Bilgileri</div>
            <div className="result-row"><span className="result-row__label">{customer.customerType === 'kurumsal' ? 'Firma' : 'Ad Soyad'}</span><span className="result-row__value">{customerLabel}</span></div>
            {customer.phone && <div className="result-row"><span className="result-row__label">Telefon</span><span className="result-row__value">{customer.phone}</span></div>}
            {customer.email && <div className="result-row"><span className="result-row__label">E-Posta</span><span className="result-row__value">{customer.email}</span></div>}
          </div>

          {propertyDetailLines.length > 0 && (
            <div className="card">
              <div className="section-title">Taşınmaz Bilgileri</div>
              {propertyDetailLines.map((l) => (
                <div key={l.label} style={{ marginBottom: 6 }}>
                  <div className="result-row__label" style={{ fontWeight: 650, marginBottom: 2 }}>{l.label}</div>
                  <p className="field__hint">{l.parts.join(', ')}</p>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="section-title">Tutar</div>
            <div className="result-row">
              <span className="result-row__label">Hizmet Bedeli</span>
              <span className="result-row__value">{formatTL(pricing.offerAmount)}</span>
            </div>
            <div className="result-row">
              <span className="result-row__label">KDV (%{pricing.vatRatePercent})</span>
              <span className="result-row__value">{formatTL(pricing.vatAmount)}</span>
            </div>
            <div className="result-row result-row--total">
              <span className="result-row__label">Toplam Tutar</span>
              <span className="result-row__value">{formatTL(pricing.grandTotal)}</span>
            </div>
            <p className="field__hint" style={{ marginTop: 6 }}>{amountToTurkishWords(pricing.grandTotal)}</p>
          </div>
        </div>

        <div className="modal-sheet__footer">
          <button type="button" className="btn btn--secondary btn--block" onClick={onEdit}>Düzenle</button>
          <button type="button" className="btn btn--gold btn--block" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
