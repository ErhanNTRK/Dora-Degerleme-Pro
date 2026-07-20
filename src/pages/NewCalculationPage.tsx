import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTariff } from '../context/TariffContext';
import { useSettings } from '../context/SettingsContext';
import { useLocationDb } from '../context/LocationContext';
import { useCompanyProfile } from '../context/CompanyProfileContext';
import { PropertyCard } from '../components/PropertyCard';
import { Switch } from '../components/Switch';
import { Accordion } from '../components/Accordion';
import { ProposalPreviewModal } from '../components/ProposalPreviewModal';
import {
  PlusIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  AlertIcon,
  DownloadIcon,
  CheckIcon,
  CopyIcon,
  ShareIcon,
  WhatsAppIcon,
  FileWordIcon,
  UserIcon,
} from '../components/icons';
import type { PropertyInput, OtherFeeLine, CalculationSettings } from '../types/calculation';
import { EMPTY_CUSTOMER_INFO, type CustomerInfo } from '../types/profile';
import { calculate } from '../engine/calculationEngine';
import { db } from '../db/database';
import { formatTL, uid } from '../utils/format';
import { generateReportPdf, buildReportPdfBlob } from '../pdf/generateReportPdf';
import { buildProposalPdfBlob } from '../proposal/generateProposalPdf';
import { buildProposalDocxBlob } from '../proposal/generateProposalDocx';
import {
  computeAsgariHizmetBedeli,
  computeProposalPricing,
  buildProposalContent,
  buildDefaultProposalParagraphs,
  buildServiceLines,
  buildOfferOneLiner,
  collectPropertyDetailLines,
} from '../proposal/buildProposalContent';
import { buildAutoPropertySummary } from '../utils/proposalHelpers';
import { shareOrDownloadFile, shareTextToWhatsApp, copyTextToClipboard, downloadBlob } from '../utils/share';

const STEPS = ['Taşınmaz Bilgileri', 'Harçlar', 'Sonuç'] as const;
type ProposalActionKind = 'pdf-download' | 'pdf-share' | 'docx-download' | 'docx-share' | 'whatsapp';

export function NewCalculationPage() {
  const { tariff, serviceAliases, loading } = useTariff();
  const { settings } = useSettings();
  const { locationDb } = useLocationDb();
  const { profile: company } = useCompanyProfile();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [customer, setCustomer] = useState<CustomerInfo>(EMPTY_CUSTOMER_INFO);
  const [propertySummaryManual, setPropertySummaryManual] = useState(false);
  const [properties, setProperties] = useState<PropertyInput[]>([]);
  const [titleDeedCount, setTitleDeedCount] = useState(1);
  const [titleDeedManual, setTitleDeedManual] = useState(false);

  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [municipalityFee, setMunicipalityFee] = useState(0);
  const [municipalityFeeSource, setMunicipalityFeeSource] = useState<'database' | 'manual' | null>(null);

  const [showOtherFees, setShowOtherFees] = useState(false);
  const [otherFees, setOtherFees] = useState<OtherFeeLine[]>([]);
  const [calcSettings, setCalcSettings] = useState<CalculationSettings | null>(null);

  const [offerAmount, setOfferAmount] = useState<number | null>(null);
  // Teklif Bedeli, kullanıcı elle değiştirmediği sürece Toplam Maliyet'i izler
  // (tapu sayısı ve taşınmaz özetindeki "otomatik ama elle geçersiz kılınabilir" deseni).
  const [offerManual, setOfferManual] = useState(false);
  // Teklif metni: null → otomatik kurumsal metin (tutar değişikliklerini izler);
  // dizi → kullanıcı düzenlemesi (aynen basılır, tutar değişse bile ellenmez).
  const [customParagraphs, setCustomParagraphs] = useState<string[] | null>(null);
  // Çoklu hizmet görünümü: taşınmazlar teklifte tutarsız hizmet satırları olarak listelensin mi?
  const [showServiceLines, setShowServiceLines] = useState(false);
  // Teklifte "Taşınmaz Bilgileri" bölümü (mahalle/ada/parsel) gösterilsin mi?
  const [showPropertyDetails, setShowPropertyDetails] = useState(true);
  const [saved, setSaved] = useState(false);
  const [reportTitle, setReportTitle] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [pendingAction, setPendingAction] = useState<ProposalActionKind | null>(null);

  const effectiveSettings: CalculationSettings | null = useMemo(() => {
    if (calcSettings) return calcSettings;
    if (!settings) return null;
    return {
      titleDeedFeePerDeed: settings.titleDeedFeePerDeed,
      infoCenterFeePerReport: settings.infoCenterFeePerReport,
      unionFeePerReport: settings.unionFeePerReport,
      transportFeePerReport: settings.transportFeePerReport,
      vatRatePercent: settings.vatRatePercent,
      infoCenterFeeEnabled: true,
      unionFeeEnabled: true,
      transportFeeEnabled: true,
    };
  }, [calcSettings, settings]);

  // Yeni taşınmaz, çokludaki gibi en yaygın hizmetle (alias listesinin ilki) açılır;
  // böylece tekli ekran da "Ne değerleniyor?" öncelikli çalışır.
  function defaultPropertyFields() {
    const a = serviceAliases[0];
    return a
      ? { groupId: a.groupId, subtypeId: a.subtypeId, serviceAlias: a.name }
      : { groupId: tariff?.groups[0]?.id ?? '', subtypeId: tariff?.groups[0]?.subtypes[0]?.id ?? '' };
  }

  function addProperty() {
    setProperties((prev) => [
      ...prev,
      { id: uid(), ...defaultPropertyFields(), label: `Taşınmaz ${prev.length + 1}` },
    ]);
  }

  // İlk taşınmaz, tarife yüklendiğinde bir kez eklenir. Render gövdesinde setState çağırmak
  // React kurallarına aykırı olduğu için useEffect'e taşındı; fonksiyonel güncelleme içindeki
  // koruma sayesinde StrictMode'un çift çalıştırmasında dahi tek taşınmaz eklenir (idempotent).
  useEffect(() => {
    if (!tariff) return;
    setProperties((prev) =>
      prev.length > 0
        ? prev
        : [{ id: uid(), ...defaultPropertyFields(), label: 'Taşınmaz 1' }]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tariff]);

  function updateProperty(id: string, updated: PropertyInput) {
    setProperties((prev) => prev.map((p) => (p.id === id ? updated : p)));
  }

  function removeProperty(id: string) {
    setProperties((prev) => prev.filter((p) => p.id !== id));
  }

  // Madde 2: Tapu Sayısı, kullanıcı manuel değiştirmediği sürece taşınmaz sayısına otomatik eşitlenir.
  useEffect(() => {
    if (!titleDeedManual && properties.length > 0) {
      setTitleDeedCount(properties.length);
    }
  }, [properties.length, titleDeedManual]);

  // Madde 9: Otomatik taşınmaz özeti, kullanıcı manuel değiştirmediği sürece güncellenir.
  useEffect(() => {
    if (!propertySummaryManual && tariff && properties.length > 0) {
      const summary = buildAutoPropertySummary(tariff, properties);
      setCustomer((prev) => (prev.propertySummary === summary ? prev : { ...prev, propertySummary: summary }));
    }
  }, [tariff, properties, propertySummaryManual]);

  const g1Count = properties.filter((p) => p.groupId === 'G1').length;
  const g2Count = properties.filter((p) => p.groupId === 'G2').length;

  function addOtherFee() {
    setOtherFees((prev) => [...prev, { id: uid(), description: '', amount: 0 }]);
  }

  const provinceOptions = locationDb?.provinces.map((p) => p.name) ?? [];
  const districtOptions = province ? locationDb?.provinces.find((p) => p.name === province)?.districts ?? [] : [];

  async function handleProvinceChange(value: string) {
    setProvince(value);
    setDistrict('');
    setMunicipalityFee(0);
    setMunicipalityFeeSource(null);
  }

  // Belediye harcı yalnızca merkezi resmi veriden gelir; veri yoksa hesaplamaya özel
  // manuel giriş yapılır (cihazda kalıcı kayıt tutulmaz — resmi veri repo üzerinden,
  // Veri Yönetimi ekranıyla güncellenir ve tüm cihazlara otomatik dağılır).
  function handleDistrictChange(value: string) {
    setDistrict(value);
    if (!value) {
      setMunicipalityFee(0);
      setMunicipalityFeeSource(null);
      return;
    }
    const districtRecord = districtOptions.find((d) => d.name === value);
    if (districtRecord && districtRecord.fee !== null) {
      setMunicipalityFee(districtRecord.fee);
      setMunicipalityFeeSource('database');
      return;
    }
    setMunicipalityFee(0);
    setMunicipalityFeeSource('manual');
  }

  const result = useMemo(() => {
    if (step < 2 || !tariff || !effectiveSettings) return null;
    return calculate(tariff, {
      properties,
      titleDeedCount,
      municipalityFee,
      otherFees: showOtherFees ? otherFees : [],
      settings: effectiveSettings,
    });
  }, [step, tariff, properties, titleDeedCount, municipalityFee, showOtherFees, otherFees, effectiveSettings]);

  const asgariHizmetBedeli = result ? computeAsgariHizmetBedeli(result) : 0;
  // Toplam Maliyet = Asgari Hizmet Bedeli + Tapu Harcı + Belediye Harcı + Yol Ücreti + TDUB Birlik
  // Payı + Gayrimenkul Bilgi Merkezi Payı + Diğer Harçlar. Motor bunu zaten "subtotal" olarak hesaplar.
  const toplamMaliyet = result ? result.subtotal : 0;

  // Sonuç ilk hesaplandığında Teklif Bedeli'ni Toplam Maliyet'e eşitle (yalnızca bir kez; kullanıcı
  // sonrasında serbestçe değiştirebilir, bu değişiklik Asgari Hizmet Bedeli/Toplam Maliyet'i etkilemez).
  useEffect(() => {
    if (result && (offerAmount === null || !offerManual)) {
      setOfferAmount(result.subtotal);
    }
  }, [result, offerAmount, offerManual]);

  const pricing = offerAmount !== null && effectiveSettings ? computeProposalPricing(offerAmount, effectiveSettings.vatRatePercent) : null;
  const propertyDetailLines = result ? collectPropertyDetailLines(result.propertyBreakdowns, properties) : [];
  const serviceLines = result && showServiceLines ? buildServiceLines(result.propertyBreakdowns, properties, serviceAliases) : [];
  const contentOptions = { serviceLines, customParagraphs };
  // Belgelere giden taşınmaz bilgileri: kullanıcı kapatırsa hiçbir belgede görünmez.
  const docPropertyDetailLines = showPropertyDetails ? propertyDetailLines : [];
  // Editörde gösterilecek paragraflar: düzenleme varsa o, yoksa güncel tutarlarla otomatik metin.
  const editorParagraphs =
    customParagraphs ?? (pricing ? buildDefaultProposalParagraphs(customer, company, tariff!.tariffYear, pricing) : []);

  if (loading || !tariff || !effectiveSettings) {
    return <p>Tarife verisi yükleniyor…</p>;
  }

  async function handleSave() {
    if (!result || offerAmount === null || !pricing) return;
    const title = reportTitle.trim() || `Hesaplama — ${new Date().toLocaleDateString('tr-TR')}`;
    const calculationId = uid();
    await db.calculations.put({
      id: calculationId,
      createdAt: new Date().toISOString(),
      title,
      input: { properties, titleDeedCount, municipalityFee, otherFees: showOtherFees ? otherFees : [], settings: effectiveSettings! },
      result,
      tariffId: tariff!.tariffId,
      tariffYear: tariff!.tariffYear,
      customer,
      province: province || undefined,
      district: district || undefined,
      asgariHizmetBedeli,
      offerAmount,
    });

    const { plainText } = buildProposalContent(customer, company, tariff!.tariffYear, pricing, docPropertyDetailLines, contentOptions);
    await db.proposals.put({
      id: uid(),
      createdAt: new Date().toISOString(),
      title: `Teklif — ${title}`,
      calculationId,
      customer,
      company,
      result,
      tariffYear: tariff!.tariffYear,
      bodyText: plainText,
      offerAmount,
      offerGrandTotal: pricing.grandTotal,
      kind: 'single',
      vatRatePercent: pricing.vatRatePercent,
      contentOptions,
    });

    setSaved(true);
  }

  async function handleGenerateReportPdf(mode: 'download' | 'share' | 'whatsapp') {
    if (!result) return;
    const title = reportTitle.trim() || `Hesaplama — ${new Date().toLocaleDateString('tr-TR')}`;
    if (mode === 'download') {
      await generateReportPdf({ title, input: { properties, titleDeedCount, municipalityFee, otherFees: showOtherFees ? otherFees : [], settings: effectiveSettings! }, result, tariffYear: tariff!.tariffYear, company });
      return;
    }
    const { blob, fileName } = buildReportPdfBlob({ title, input: { properties, titleDeedCount, municipalityFee, otherFees: showOtherFees ? otherFees : [], settings: effectiveSettings! }, result, tariffYear: tariff!.tariffYear, company });
    if (mode === 'whatsapp') {
      shareTextToWhatsApp(`${title} — Asgari Hizmet Bedeli: ${formatTL(asgariHizmetBedeli)}`);
      return;
    }
    await shareOrDownloadFile(blob, fileName, 'application/pdf');
  }

  async function executeProposalAction(kind: ProposalActionKind) {
    if (!pricing) return;
    if (kind === 'pdf-download' || kind === 'pdf-share') {
      const { blob, fileName } = buildProposalPdfBlob({ customer, company, tariffYear: tariff!.tariffYear, pricing, propertyDetailLines: docPropertyDetailLines, contentOptions });
      if (kind === 'pdf-download') downloadBlob(blob, fileName);
      else await shareOrDownloadFile(blob, fileName, 'application/pdf');
    } else if (kind === 'docx-download' || kind === 'docx-share') {
      const { blob, fileName } = await buildProposalDocxBlob({ customer, company, tariffYear: tariff!.tariffYear, pricing, propertyDetailLines: docPropertyDetailLines, contentOptions });
      if (kind === 'docx-download') downloadBlob(blob, fileName);
      else await shareOrDownloadFile(blob, fileName, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    } else if (kind === 'whatsapp') {
      const { plainText } = buildProposalContent(customer, company, tariff!.tariffYear, pricing, docPropertyDetailLines, contentOptions);
      shareTextToWhatsApp(plainText);
    }
    setPendingAction(null);
  }

  async function handleProposalCopy() {
    if (!pricing) return;
    const ok = await copyTextToClipboard(buildOfferOneLiner(pricing));
    if (ok) {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1800);
    }
  }

  return (
    <div>
      <div className="page__header">
        <span className="page__eyebrow">Tek Tapu Teklifi</span>
        <h1 className="page__title">{STEPS[step]}</h1>
      </div>

      <div className="stepper">
        {STEPS.map((s, i) => (
          <div key={s} className={`stepper__dot${i <= step ? ' active' : ''}`} />
        ))}
      </div>

      {step === 0 && (
        <div>
          {properties.map((p, i) => (
            <PropertyCard
              key={p.id}
              tariff={tariff}
              index={i}
              property={p}
              onChange={(updated) => updateProperty(p.id, updated)}
              onRemove={() => removeProperty(p.id)}
              canRemove={properties.length > 1}
              showBulkOption={p.groupId === 'G1' && g1Count > 1 ? 'neighborhood' : p.groupId === 'G2' && g2Count > 1 ? 'parcel' : null}
            />
          ))}
          <button className="btn btn--secondary btn--block" onClick={addProperty} type="button">
            <PlusIcon width={18} height={18} /> Taşınmaz Ekle
          </button>

          <Accordion title={<><UserIcon width={16} height={16} /> Müşteri Bilgileri (İsteğe Bağlı)</>} defaultOpen={false}>
            <div className="checkbox-row" style={{ border: 'none', padding: '4px 0 10px' }}>
              <span className="checkbox-row__label">Müşteri Türü</span>
              <div className="btn-row" style={{ width: 'auto' }}>
                <button
                  type="button"
                  className={`btn btn--sm ${customer.customerType === 'bireysel' ? 'btn--primary' : 'btn--secondary'}`}
                  onClick={() => setCustomer({ ...customer, customerType: 'bireysel' })}
                >
                  Bireysel
                </button>
                <button
                  type="button"
                  className={`btn btn--sm ${customer.customerType === 'kurumsal' ? 'btn--primary' : 'btn--secondary'}`}
                  onClick={() => setCustomer({ ...customer, customerType: 'kurumsal' })}
                >
                  Kurumsal
                </button>
              </div>
            </div>
            <div className="property-row-split" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="field">
                <label className="field__label">Müşteri Adı</label>
                <input className="input" value={customer.customerName} onChange={(e) => setCustomer({ ...customer, customerName: e.target.value })} />
              </div>
              <div className="field">
                <label className="field__label">Firma Adı</label>
                <input className="input" value={customer.companyName} onChange={(e) => setCustomer({ ...customer, companyName: e.target.value })} />
              </div>
            </div>
            <div className="property-row-split" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="field">
                <label className="field__label">Telefon</label>
                <input className="input" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
              </div>
              <div className="field">
                <label className="field__label">E-Posta</label>
                <input className="input" type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label className="field__label">Rapor Konusu</label>
              <input className="input" value={customer.reportSubject} onChange={(e) => setCustomer({ ...customer, reportSubject: e.target.value })} placeholder="Örn: Kredi teminatı değerleme raporu" />
            </div>
            <div className="field">
              <label className="field__label">Taşınmaz Özeti (Otomatik, düzenlenebilir)</label>
              <input
                className="input"
                value={customer.propertySummary}
                onChange={(e) => {
                  setPropertySummaryManual(true);
                  setCustomer({ ...customer, propertySummary: e.target.value });
                }}
                placeholder="Örn: 5 adet Konut, 2 adet Dükkan, 1 adet Arsa"
              />
            </div>
            <div className="field">
              <label className="field__label">Açıklama</label>
              <input className="input" value={customer.description} onChange={(e) => setCustomer({ ...customer, description: e.target.value })} />
            </div>
          </Accordion>

          <div className="btn-row" style={{ marginTop: 20 }}>
            <button className="btn btn--primary btn--block" onClick={() => setStep(1)} type="button">
              Devam Et <ArrowRightIcon width={18} height={18} />
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="card">
            <div className="section-title">Tapu Bilgisi</div>
            <div className="field">
              <label className="field__label">Tapu Sayısı</label>
              <input
                className="input"
                type="number"
                min={0}
                value={titleDeedCount}
                onChange={(e) => {
                  setTitleDeedManual(true);
                  setTitleDeedCount(Number(e.target.value));
                }}
              />
              <span className="field__hint">
                Varsayılan olarak taşınmaz sayısına eşittir ({properties.length}); dilerseniz değiştirebilirsiniz. Her tapu için {formatTL(effectiveSettings.titleDeedFeePerDeed)} harç eklenir.
              </span>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Standart Ücretler</div>
            <div className="checkbox-row">
              <div>
                <div className="checkbox-row__label">Gayrimenkul Bilgi Merkezi Payı</div>
                <div className="checkbox-row__value">{formatTL(effectiveSettings.infoCenterFeePerReport)} — rapor başına</div>
              </div>
              <Switch checked={effectiveSettings.infoCenterFeeEnabled} onChange={(v) => setCalcSettings({ ...effectiveSettings, infoCenterFeeEnabled: v })} />
            </div>
            <div className="checkbox-row">
              <div>
                <div className="checkbox-row__label">TDUB Birlik Payı</div>
                <div className="checkbox-row__value">{formatTL(effectiveSettings.unionFeePerReport)} — rapor başına</div>
              </div>
              <Switch checked={effectiveSettings.unionFeeEnabled} onChange={(v) => setCalcSettings({ ...effectiveSettings, unionFeeEnabled: v })} />
            </div>
            <div className="checkbox-row">
              <div>
                <div className="checkbox-row__label">Ulaşım Bedeli</div>
                <div className="checkbox-row__value">{formatTL(effectiveSettings.transportFeePerReport)} — rapor başına</div>
              </div>
              <Switch checked={effectiveSettings.transportFeeEnabled} onChange={(v) => setCalcSettings({ ...effectiveSettings, transportFeeEnabled: v })} />
            </div>
          </div>

          <div className="card">
            <div className="section-title">Belediye Harcı</div>
            <div className="property-row-split" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="field">
                <label className="field__label">İl</label>
                <select className="select" value={province} onChange={(e) => handleProvinceChange(e.target.value)}>
                  <option value="">Seçiniz</option>
                  {provinceOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field__label">İlçe</label>
                <select className="select" value={district} onChange={(e) => handleDistrictChange(e.target.value)} disabled={!province}>
                  <option value="">Seçiniz</option>
                  {districtOptions.map((d) => (
                    <option key={d.name} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {municipalityFeeSource === 'manual' && (
              <div className="warning-banner">
                <AlertIcon width={18} height={18} />
                <span>Bu ilçe için belediye harcı tanımlanmamıştır. Lütfen manuel giriniz.</span>
              </div>
            )}
            {municipalityFeeSource === 'database' && (
              <p className="field__hint" style={{ marginBottom: 8 }}>Belediye harcı veri kaynağından otomatik getirildi.</p>
            )}

            <div className="field">
              <label className="field__label">Belediye Harcı (TL)</label>
              <input className="input" type="number" min={0} value={municipalityFee} onChange={(e) => setMunicipalityFee(Number(e.target.value))} />
            </div>

          </div>

          <div className="card">
            <label className="checkbox-row" style={{ cursor: 'pointer', border: 'none', padding: 0, marginBottom: showOtherFees ? 12 : 0 }}>
              <span className="section-title" style={{ marginBottom: 0 }}>Diğer Harçlar</span>
              <input type="checkbox" checked={showOtherFees} onChange={(e) => { setShowOtherFees(e.target.checked); if (!e.target.checked) setOtherFees([]); }} />
            </label>
            {showOtherFees && (
              <>
                {otherFees.map((f) => (
                  <div className="fee-line" key={f.id}>
                    <input className="input" placeholder="Harç Açıklaması (Kadastro, LİHKAB, DSİ, Orman, Noter…)" value={f.description} onChange={(e) => setOtherFees((prev) => prev.map((x) => (x.id === f.id ? { ...x, description: e.target.value } : x)))} />
                    <input className="input" type="number" placeholder="Tutar" value={f.amount} onChange={(e) => setOtherFees((prev) => prev.map((x) => (x.id === f.id ? { ...x, amount: Number(e.target.value) } : x)))} />
                    <button className="remove-btn" type="button" onClick={() => setOtherFees((prev) => prev.filter((x) => x.id !== f.id))}>Sil</button>
                  </div>
                ))}
                <button className="btn btn--secondary btn--sm" type="button" onClick={addOtherFee}>
                  <PlusIcon width={14} height={14} /> Harç Ekle
                </button>
              </>
            )}
          </div>

          <div className="card">
            <div className="section-title">KDV Oranı</div>
            <div className="field">
              <input className="input" type="number" min={0} max={100} value={effectiveSettings.vatRatePercent} onChange={(e) => setCalcSettings({ ...effectiveSettings, vatRatePercent: Number(e.target.value) })} />
            </div>
          </div>

          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn btn--secondary" onClick={() => setStep(0)} type="button">
              <ArrowLeftIcon width={18} height={18} />
            </button>
            <button className="btn btn--primary btn--block" onClick={() => setStep(2)} type="button">
              Hesapla <ArrowRightIcon width={18} height={18} />
            </button>
          </div>
        </div>
      )}

      {step === 2 && result && pricing && (
        <div>
          {result.warnings.length > 0 && (
            <div className="warning-banner">
              <AlertIcon width={18} height={18} />
              <div>
                {result.warnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="section-title">Taşınmaz Bazlı Döküm</div>
            {result.propertyBreakdowns.map((b) => (
              <div key={b.propertyId} className="result-row">
                <span className="result-row__label">
                  {b.label} — {b.subtypeName}
                  {b.area ? ` (${b.area} m²)` : ''}
                </span>
                <span className="result-row__value">{formatTL(b.finalFee)}</span>
              </div>
            ))}
            <p className="field__hint" style={{ marginTop: 6 }}>Tarife {tariff.tariffYear}</p>
          </div>

          <div className="card">
            <div className="section-title">Fiyatlandırma (Şirket İçi Görünüm)</div>

            <div className="result-row">
              <span className="result-row__label">Asgari Hizmet Bedeli</span>
              <span className="result-row__value">{formatTL(asgariHizmetBedeli)}</span>
            </div>
            <p className="field__hint" style={{ marginBottom: 10 }}>
              2026 Tarifesine göre hesaplama motorundan gelir, değiştirilemez.
            </p>

            <div className="result-row">
              <span className="result-row__label">Toplam Maliyet</span>
              <span className="result-row__value">{formatTL(toplamMaliyet)}</span>
            </div>
            <p className="field__hint" style={{ marginBottom: 6 }}>
              Asgari Hizmet Bedeli + Tapu Harcı + Belediye Harcı + Yol Ücreti + TDUB Birlik Payı +
              Gayrimenkul Bilgi Merkezi Payı + Diğer Harçlar (otomatik, KDV hariç).
            </p>

            <Accordion title="Maliyet Detayı (Ofis Kaydı)">
              <div className="result-row">
                <span className="result-row__label">Asgari Hizmet Bedeli</span>
                <span className="result-row__value">{formatTL(asgariHizmetBedeli)}</span>
              </div>
              <div className="result-row">
                <span className="result-row__label">Tapu Harcı ({titleDeedCount} tapu)</span>
                <span className="result-row__value">{formatTL(result.titleDeedFeeTotal)}</span>
              </div>
              <div className="result-row">
                <span className="result-row__label">Belediye Harcı</span>
                <span className="result-row__value">{formatTL(result.municipalityFee)}</span>
              </div>
              <div className="result-row">
                <span className="result-row__label">Yol Ücreti</span>
                <span className="result-row__value">{formatTL(result.transportFee)}</span>
              </div>
              <div className="result-row">
                <span className="result-row__label">TDUB Birlik Payı</span>
                <span className="result-row__value">{formatTL(result.unionFee)}</span>
              </div>
              <div className="result-row">
                <span className="result-row__label">Gayrimenkul Bilgi Merkezi Payı</span>
                <span className="result-row__value">{formatTL(result.infoCenterFee)}</span>
              </div>
              {result.otherFeesTotal > 0 && (
                <div className="result-row">
                  <span className="result-row__label">Diğer Harçlar</span>
                  <span className="result-row__value">{formatTL(result.otherFeesTotal)}</span>
                </div>
              )}
              <div className="result-row result-row--total">
                <span className="result-row__label">Toplam Maliyet</span>
                <span className="result-row__value">{formatTL(toplamMaliyet)}</span>
              </div>
              <p className="field__hint" style={{ marginTop: 8 }}>
                Bu döküm yalnızca ofis içi kayıt amaçlıdır; Teklif Yazısı, Teklif PDF ve Word'de
                kesinlikle gösterilmez.
              </p>
            </Accordion>

            <div className="field" style={{ marginTop: 14 }}>
              <label className="field__label">Teklif Bedeli (TL) — müşteriye sunulacak</label>
              <input
                className="input"
                type="number"
                min={0}
                value={offerAmount ?? 0}
                onChange={(e) => {
                  setOfferManual(true);
                  setOfferAmount(Number(e.target.value));
                }}
              />
              <span className="field__hint">
                Siz elle değiştirmediğiniz sürece Toplam Maliyet ile aynı kalır ve yeniden
                hesaplamalarda otomatik güncellenir. Elle değiştirmeniz Asgari Hizmet Bedeli'ni ve
                Toplam Maliyet'i kesinlikle etkilemez.
              </span>
            </div>

            <div className="result-row" style={{ marginTop: 4 }}>
              <span className="result-row__label">KDV (%{pricing.vatRatePercent})</span>
              <span className="result-row__value">{formatTL(pricing.vatAmount)}</span>
            </div>
            <div className="result-row result-row--total">
              <span className="result-row__label">Genel Toplam</span>
              <span className="result-row__value">{formatTL(pricing.grandTotal)}</span>
            </div>

            {propertyDetailLines.length > 0 && (
              <div className="checkbox-row" style={{ marginTop: 10 }}>
                <div>
                  <div className="checkbox-row__label">Taşınmaz bilgilerini teklifte göster</div>
                  <div className="checkbox-row__value">Mahalle/Ada/Parsel bilgileri belgede ayrı bölüm olarak yer alır.</div>
                </div>
                <button
                  type="button"
                  className="switch"
                  data-checked={showPropertyDetails}
                  onClick={() => setShowPropertyDetails((v) => !v)}
                  aria-label="Taşınmaz bilgilerini teklifte göster"
                >
                  <span className="switch__thumb" />
                </button>
              </div>
            )}

            {properties.length > 1 && (
              <div className="checkbox-row" style={{ marginTop: 10 }}>
                <div>
                  <div className="checkbox-row__label">Hizmetleri teklifte ayrı listele</div>
                  <div className="checkbox-row__value">
                    Taşınmazlar "Hizmet Kapsamı" altında tutarsız satırlar olarak görünür; tutar tek
                    satır Toplam Maliyet olarak kalır.
                  </div>
                </div>
                <button
                  type="button"
                  className="switch"
                  data-checked={showServiceLines}
                  onClick={() => setShowServiceLines((v) => !v)}
                  aria-label="Hizmetleri ayrı listele"
                >
                  <span className="switch__thumb" />
                </button>
              </div>
            )}

            <Accordion title="Teklif Metni" defaultOpen={false}>
              <p className="field__hint" style={{ marginBottom: 10 }}>
                Aşağıdaki metin otomatik oluşturulur ve yalnızca başlangıç önerisidir. Paragrafları
                düzenleyebilir, silebilir veya yenilerini ekleyebilirsiniz.
                {customParagraphs !== null && (
                  <strong>
                    {' '}Metin elle düzenlendi: tutar değişiklikleri metne otomatik yansımaz;
                    gerekirse "Otomatik Metne Dön" ile güncel metni yeniden oluşturun.
                  </strong>
                )}
              </p>
              {editorParagraphs.map((para, idx) => (
                <div key={idx} className="field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="field__label">Paragraf {idx + 1}</label>
                    <button
                      type="button"
                      className="remove-btn"
                      onClick={() => setCustomParagraphs(editorParagraphs.filter((_, i) => i !== idx))}
                    >
                      Sil
                    </button>
                  </div>
                  <textarea
                    className="textarea"
                    rows={3}
                    value={para}
                    onChange={(e) =>
                      setCustomParagraphs(editorParagraphs.map((t, i) => (i === idx ? e.target.value : t)))
                    }
                  />
                </div>
              ))}
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setCustomParagraphs([...editorParagraphs, ''])}
                >
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
            <div className="field">
              <label className="field__label">Rapor Başlığı (isteğe bağlı)</label>
              <input className="input" value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} placeholder="Örn: Zeytinburnu Ada 1954 Değerleme" />
            </div>
          </div>

          <div className="card">
            <div className="section-title">Hesaplama Raporu (Ofis Kaydı)</div>
            <div className="btn-row">
              <button className="btn btn--gold btn--block" type="button" onClick={() => handleGenerateReportPdf('download')}>
                <DownloadIcon width={18} height={18} /> PDF Oluştur
              </button>
            </div>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn btn--secondary" type="button" onClick={() => handleGenerateReportPdf('share')}>
                <ShareIcon width={16} height={16} /> Paylaş
              </button>
              <button className="btn btn--secondary" type="button" onClick={() => handleGenerateReportPdf('whatsapp')}>
                <WhatsAppIcon width={16} height={16} /> WhatsApp
              </button>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Fiyat Teklifi (Müşteriye Gönderilecek)</div>
            <div className="btn-row">
              <button className="btn btn--gold" type="button" onClick={() => setPendingAction('pdf-download')}>
                <DownloadIcon width={16} height={16} /> PDF
              </button>
              <button className="btn btn--gold" type="button" onClick={() => setPendingAction('docx-download')}>
                <FileWordIcon width={16} height={16} /> Word
              </button>
            </div>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn btn--secondary" type="button" onClick={() => setPendingAction('pdf-share')}>
                <ShareIcon width={16} height={16} /> PDF Paylaş
              </button>
              <button className="btn btn--secondary" type="button" onClick={() => setPendingAction('docx-share')}>
                <ShareIcon width={16} height={16} /> Word Paylaş
              </button>
            </div>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn btn--secondary" type="button" onClick={() => setPendingAction('whatsapp')}>
                <WhatsAppIcon width={16} height={16} /> WhatsApp
              </button>
              <button className="btn btn--secondary" type="button" onClick={handleProposalCopy}>
                {copyFeedback ? <CheckIcon width={16} height={16} /> : <CopyIcon width={16} height={16} />} Kopyala
              </button>
            </div>
          </div>

          <div className="btn-row">
            <button className="btn btn--primary btn--block" type="button" onClick={handleSave} disabled={saved}>
              {saved ? <><CheckIcon width={18} height={18} /> Kaydedildi</> : 'Geçmişe Kaydet'}
            </button>
          </div>

          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn btn--secondary btn--block" onClick={() => setStep(1)} type="button">
              <ArrowLeftIcon width={18} height={18} /> Harçlara Dön
            </button>
          </div>

          {saved && (
            <button className="btn btn--secondary btn--block" style={{ marginTop: 10 }} onClick={() => navigate('/gecmis')}>
              Geçmişi Görüntüle
            </button>
          )}
        </div>
      )}

      {pendingAction && pricing && (
        <ProposalPreviewModal
          content={buildProposalContent(customer, company, tariff!.tariffYear, pricing, docPropertyDetailLines, contentOptions)}
          company={company}
          customer={customer}
          propertyDetailLines={docPropertyDetailLines}
          pricing={pricing}
          onEdit={() => setPendingAction(null)}
          onConfirm={() => executeProposalAction(pendingAction)}
          confirmLabel={pendingAction.startsWith('docx') ? 'Word Oluştur' : pendingAction === 'whatsapp' ? 'WhatsApp ile Gönder' : 'Belgeyi Oluştur'}
        />
      )}
    </div>
  );
}
