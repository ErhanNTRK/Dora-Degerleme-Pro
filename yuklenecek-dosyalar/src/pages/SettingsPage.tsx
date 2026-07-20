import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useTariff } from '../context/TariffContext';
import { useCompanyProfile } from '../context/CompanyProfileContext';
import { CheckIcon } from '../components/icons';
import { ImageUploadField } from '../components/ImageUploadField';
import type { CompanyProfile } from '../types/profile';

export function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const { tariff } = useTariff();
  const { profile, updateProfile } = useCompanyProfile();

  const [form, setForm] = useState(settings);
  const [companyForm, setCompanyForm] = useState<CompanyProfile>(profile);
  const [saved, setSaved] = useState(false);
  const [companySaved, setCompanySaved] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    setCompanyForm(profile);
  }, [profile]);

  async function handleSave() {
    if (!form) return;
    await updateSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  async function handleCompanySave() {
    await updateProfile(companyForm);
    setCompanySaved(true);
    setTimeout(() => setCompanySaved(false), 1800);
  }

  return (
    <div>
      <div className="page__header">
        <span className="page__eyebrow">Ayarlar</span>
        <h1 className="page__title">Sabit Ücretler, KDV ve Firma Profili</h1>
        <p className="page__desc">
          Tarife: {tariff?.tariffYear} — Kaynak: {tariff?.source}
        </p>
      </div>

      <div className="card">
        <div className="section-title">Firma Profili</div>
        <p className="field__hint" style={{ marginBottom: 12 }}>
          Bu bilgiler PDF, Teklif Yazısı ve Word çıktılarında otomatik kullanılır.
        </p>
        <div className="field">
          <label className="field__label">Firma Ünvanı</label>
          <input className="input" value={companyForm.companyName} onChange={(e) => setCompanyForm({ ...companyForm, companyName: e.target.value })} />
        </div>
        <div className="field">
          <label className="field__label">Adres</label>
          <input className="input" value={companyForm.address} onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} />
        </div>
        <div className="field">
          <label className="field__label">Telefon</label>
          <input className="input" value={companyForm.phone} onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })} />
        </div>
        <div className="field">
          <label className="field__label">E-Posta</label>
          <input className="input" type="email" value={companyForm.email} onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })} />
        </div>
        <div className="field">
          <label className="field__label">Vergi Dairesi</label>
          <input className="input" value={companyForm.taxOffice} onChange={(e) => setCompanyForm({ ...companyForm, taxOffice: e.target.value })} />
        </div>
        <div className="field">
          <label className="field__label">Vergi No</label>
          <input className="input" value={companyForm.taxNumber} onChange={(e) => setCompanyForm({ ...companyForm, taxNumber: e.target.value })} />
        </div>
        <div className="field">
          <label className="field__label">IBAN</label>
          <input className="input" value={companyForm.iban} onChange={(e) => setCompanyForm({ ...companyForm, iban: e.target.value })} placeholder="TR__ ____ ____ ____ ____ ____ __" />
        </div>
        <div className="field">
          <label className="field__label">Yetkili Adı</label>
          <input className="input" value={companyForm.authorizedName} onChange={(e) => setCompanyForm({ ...companyForm, authorizedName: e.target.value })} />
        </div>
        <div className="field">
          <label className="field__label">Yetkili Ünvanı</label>
          <input className="input" value={companyForm.authorizedTitle} onChange={(e) => setCompanyForm({ ...companyForm, authorizedTitle: e.target.value })} placeholder="Örn: Sorumlu Değerleme Uzmanı" />
        </div>
        <div className="field">
          <label className="field__label">Teklif Alt Notu</label>
          <input
            className="input"
            value={companyForm.proposalFooterNote ?? ''}
            onChange={(e) => setCompanyForm({ ...companyForm, proposalFooterNote: e.target.value })}
            placeholder="Örn: Bu teklif yalnızca belirtilen hizmet kapsamı için hazırlanmıştır."
          />
          <span className="field__hint">Teklif Yazısı ve Teklif PDF'de otomatik olarak yer alır.</span>
        </div>

        <ImageUploadField
          label="Logo"
          value={companyForm.logoDataUrl}
          onChange={(v) => setCompanyForm({ ...companyForm, logoDataUrl: v })}
          aspectHint="Kare formatta, yüksek çözünürlüklü logo önerilir."
        />
        <ImageUploadField
          label="İmza"
          value={companyForm.signatureDataUrl}
          onChange={(v) => setCompanyForm({ ...companyForm, signatureDataUrl: v })}
          aspectHint="Şeffaf (PNG) arka planlı imza görseli önerilir."
        />

        <button className="btn btn--primary btn--block" onClick={handleCompanySave} style={{ marginTop: 4 }}>
          {companySaved ? <><CheckIcon width={18} height={18} /> Kaydedildi</> : 'Firma Profilini Kaydet'}
        </button>
      </div>

      {form && (
        <>
          <div className="card">
            <div className="section-title">Sabit Ücretler (TL)</div>
            <div className="field">
              <label className="field__label">Tapu Harcı (tapu başına)</label>
              <input className="input" type="number" value={form.titleDeedFeePerDeed} onChange={(e) => setForm({ ...form, titleDeedFeePerDeed: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label className="field__label">Gayrimenkul Bilgi Merkezi Payı (rapor başına)</label>
              <input className="input" type="number" value={form.infoCenterFeePerReport} onChange={(e) => setForm({ ...form, infoCenterFeePerReport: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label className="field__label">TDUB Birlik Payı (rapor başına)</label>
              <input className="input" type="number" value={form.unionFeePerReport} onChange={(e) => setForm({ ...form, unionFeePerReport: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label className="field__label">Ulaşım Bedeli (rapor başına)</label>
              <input className="input" type="number" value={form.transportFeePerReport} onChange={(e) => setForm({ ...form, transportFeePerReport: Number(e.target.value) })} />
            </div>
          </div>

          <div className="card">
            <div className="section-title">KDV</div>
            <div className="field">
              <label className="field__label">Varsayılan KDV Oranı (%)</label>
              <input className="input" type="number" min={0} max={100} value={form.vatRatePercent} onChange={(e) => setForm({ ...form, vatRatePercent: Number(e.target.value) })} />
            </div>
          </div>

          <button className="btn btn--primary btn--block" onClick={handleSave}>
            {saved ? <><CheckIcon width={18} height={18} /> Kaydedildi</> : 'Sabit Ücretleri Kaydet'}
          </button>
        </>
      )}

      <p className="field__hint" style={{ marginTop: 14, textAlign: 'center' }}>
        Bu ayarlar yalnızca cihazınızda saklanır.
      </p>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="section-title">Yönetici</div>
        <Link to="/yonetici" className="btn btn--secondary btn--block" style={{ textDecoration: 'none' }}>
          Yönetici Merkezi — Tarife, Harçlar ve Teklif Şablonu
        </Link>
        <p className="field__hint" style={{ marginTop: 8 }}>
          Yıllık tarife/harç güncellemeleri ve teklif metni şablonu tek merkezden yönetilir.
        </p>
      </div>
    </div>
  );
}
