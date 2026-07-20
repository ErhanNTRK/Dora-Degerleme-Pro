import { useState } from 'react';
import { useCompanyProfile } from '../context/CompanyProfileContext';
import { useTariff } from '../context/TariffContext';
import {
  DEFAULT_PROPOSAL_TEMPLATE,
  renderProposalTemplate,
  computeProposalPricing,
} from '../proposal/buildProposalContent';
import { EMPTY_CUSTOMER_INFO } from '../types/profile';
import { CheckIcon } from '../components/icons';

/**
 * TEKLİF ŞABLONU (Yönetici)
 *
 * Otomatik teklif metninin kaynağı buradaki şablondur. Yönetici paragrafları
 * düzenler; tutar/yıl gibi değerler yer tutucularla teklif anında doldurulur.
 * Kaydedilen şablon cihaz profilinde tutulur; boş bırakılırsa uygulamanın gömülü
 * varsayılan metni kullanılır. Kural: {IBAN} içeren paragraf, IBAN boşsa yazılmaz.
 */
const PLACEHOLDERS: Array<[string, string]> = [
  ['{TOPLAM}', 'Toplam Maliyet (ör. 85.000,00 TL)'],
  ['{KDV_ORANI}', 'KDV oranı (ör. 20)'],
  ['{GENEL_TOPLAM}', 'Genel Toplam (KDV dahil)'],
  ['{GENEL_TOPLAM_YAZI}', 'Genel Toplamın yazıyla hâli'],
  ['{YIL}', 'Tarife yılı'],
  ['{IBAN}', 'Firma IBAN (boşsa paragraf atlanır)'],
  ['{KONU}', 'Teklif konusu (girildiyse parantez içinde)'],
];

export function ProposalTemplatePage() {
  const { profile, updateProfile } = useCompanyProfile();
  const { tariff } = useTariff();

  const [paragraphs, setParagraphs] = useState<string[]>(
    profile.proposalTemplate?.length ? [...profile.proposalTemplate] : [...DEFAULT_PROPOSAL_TEMPLATE]
  );
  const [saved, setSaved] = useState(false);

  const previewPricing = computeProposalPricing(85000, 20);
  const preview = renderProposalTemplate(
    paragraphs,
    { ...EMPTY_CUSTOMER_INFO, reportSubject: 'Örnek konu' },
    profile,
    tariff?.tariffYear ?? new Date().getFullYear(),
    previewPricing
  );

  function edit(i: number, value: string) {
    setParagraphs((prev) => prev.map((p, j) => (j === i ? value : p)));
    setSaved(false);
  }

  async function handleSave() {
    await updateProfile({ proposalTemplate: paragraphs.filter((p) => p.trim().length > 0) });
    setSaved(true);
  }

  async function handleReset() {
    if (!window.confirm('Şablon, uygulamanın gömülü varsayılan metnine döndürülecek. Emin misiniz?')) return;
    setParagraphs([...DEFAULT_PROPOSAL_TEMPLATE]);
    await updateProfile({ proposalTemplate: undefined });
    setSaved(true);
  }

  return (
    <div>
      <div className="page__header">
        <span className="page__eyebrow">Yönetici</span>
        <h1 className="page__title">Teklif Şablonu</h1>
        <p className="page__desc">
          Otomatik teklif metninin kaynağı bu şablondur. Tutarlar ve yıl, teklif anında yer
          tutuculardan doldurulur; uzmanlar teklif ekranında metni yine serbestçe düzenleyebilir.
        </p>
      </div>

      <div className="card">
        <div className="section-title">Yer Tutucular</div>
        {PLACEHOLDERS.map(([k, desc]) => (
          <div key={k} className="result-row" style={{ padding: '6px 0' }}>
            <span className="result-row__value" style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{k}</span>
            <span className="result-row__label" style={{ fontSize: 12.5, textAlign: 'right' }}>{desc}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="section-title">Paragraflar</div>
        {paragraphs.map((para, i) => (
          <div key={i} className="field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="field__label">Paragraf {i + 1}</label>
              <button type="button" className="remove-btn" onClick={() => { setParagraphs((prev) => prev.filter((_, j) => j !== i)); setSaved(false); }}>
                Sil
              </button>
            </div>
            <textarea className="textarea" rows={3} value={para} onChange={(e) => edit(i, e.target.value)} />
          </div>
        ))}
        <div className="btn-row">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => { setParagraphs((prev) => [...prev, '']); setSaved(false); }}>
            Paragraf Ekle
          </button>
          <button type="button" className="btn btn--secondary btn--sm" onClick={handleReset}>
            Varsayılana Dön
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Önizleme (örnek tutarlarla)</div>
        {preview.map((p, i) => (
          <p key={i} className="field__hint" style={{ marginBottom: 8, whiteSpace: 'pre-wrap' }}>{p}</p>
        ))}
      </div>

      <button className="btn btn--primary btn--block" type="button" onClick={handleSave}>
        {saved ? <><CheckIcon width={18} height={18} /> Kaydedildi</> : 'Şablonu Kaydet'}
      </button>
      <p className="field__hint" style={{ marginTop: 10, textAlign: 'center' }}>
        Şablon bu cihazın firma profiline kaydedilir ve tüm yeni tekliflerde kullanılır.
      </p>
    </div>
  );
}
