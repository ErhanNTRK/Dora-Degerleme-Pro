import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db, type SavedCalculation, type SavedProposal } from '../db/database';
import { EMPTY_COMPANY_PROFILE } from '../types/profile';
import { formatTL, formatDateTime } from '../utils/format';
import { HistoryIcon, TrashIcon, DownloadIcon, WhatsAppIcon, FileWordIcon, ShareIcon } from '../components/icons';
import { generateReportPdf } from '../pdf/generateReportPdf';
import { buildProposalPdfBlob } from '../proposal/generateProposalPdf';
import { buildProposalDocxBlob } from '../proposal/generateProposalDocx';
import { computeProposalPricing, collectPropertyDetailLines } from '../proposal/buildProposalContent';
import { shareOrDownloadFile, shareTextToWhatsApp, downloadBlob } from '../utils/share';

type Tab = 'hesaplamalar' | 'teklifler';

function matchesSearch(query: string, customerName?: string, companyName?: string, province?: string, district?: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLocaleLowerCase('tr');
  return [customerName, companyName, province, district].some((field) => field?.toLocaleLowerCase('tr').includes(q));
}

export function HistoryPage() {
  const [tab, setTab] = useState<Tab>('teklifler');
  const [calculations, setCalculations] = useState<SavedCalculation[]>([]);
  const [proposals, setProposals] = useState<SavedProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  async function load() {
    const [calcs, props] = await Promise.all([
      db.calculations.orderBy('createdAt').reverse().toArray(),
      db.proposals.orderBy('createdAt').reverse().toArray(),
    ]);
    setCalculations(calcs);
    setProposals(props);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filteredCalculations = useMemo(
    () => calculations.filter((c) => matchesSearch(search, c.customer?.customerName, c.customer?.companyName, c.province, c.district)),
    [calculations, search]
  );
  const filteredProposals = useMemo(
    () => proposals.filter((p) => matchesSearch(search, p.customer?.customerName, p.customer?.companyName)),
    [proposals, search]
  );

  async function handleDeleteCalculation(id: string) {
    if (!window.confirm('Bu hesaplama kaydı kalıcı olarak silinecek. Emin misiniz?')) return;
    await db.calculations.delete(id);
    load();
  }

  async function handleDeleteProposal(id: string) {
    if (!window.confirm('Bu teklif kaydı kalıcı olarak silinecek. Emin misiniz?')) return;
    await db.proposals.delete(id);
    load();
  }

  async function handleRegenerateReportPdf(item: SavedCalculation) {
    const company = (await db.companyProfile.get('company-profile')) ?? EMPTY_COMPANY_PROFILE;
    await generateReportPdf({ title: item.title, input: item.input, result: item.result, tariffYear: item.tariffYear, company });
  }

  async function getProposalPropertyDetailLines(item: SavedProposal) {
    if (!item.calculationId || !item.result) return [];
    const calc = await db.calculations.get(item.calculationId);
    if (!calc) return [];
    return collectPropertyDetailLines(item.result.propertyBreakdowns, calc.input.properties);
  }

  // KDV: çoklu tekliflerde vatRatePercent alanı, tekli eski kayıtlarda result snapshot'ı.
  function proposalVatRate(item: SavedProposal): number {
    return item.vatRatePercent ?? item.result?.vatRatePercent ?? 20;
  }

  async function handleRegenerateProposalPdf(item: SavedProposal, mode: 'download' | 'share') {
    const pricing = computeProposalPricing(item.offerAmount, proposalVatRate(item));
    const propertyDetailLines = await getProposalPropertyDetailLines(item);
    const { blob, fileName } = buildProposalPdfBlob({ customer: item.customer, company: item.company, tariffYear: item.tariffYear, pricing, propertyDetailLines, contentOptions: item.contentOptions ?? {} });
    if (mode === 'download') downloadBlob(blob, fileName);
    else await shareOrDownloadFile(blob, fileName, 'application/pdf');
  }

  async function handleRegenerateProposalDocx(item: SavedProposal, mode: 'download' | 'share') {
    const pricing = computeProposalPricing(item.offerAmount, proposalVatRate(item));
    const propertyDetailLines = await getProposalPropertyDetailLines(item);
    const { blob, fileName } = await buildProposalDocxBlob({ customer: item.customer, company: item.company, tariffYear: item.tariffYear, pricing, propertyDetailLines, contentOptions: item.contentOptions ?? {} });
    if (mode === 'download') downloadBlob(blob, fileName);
    else await shareOrDownloadFile(blob, fileName, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }

  function handleProposalWhatsApp(item: SavedProposal) {
    shareTextToWhatsApp(item.bodyText);
  }

  return (
    <div>
      <div className="page__header">
        <span className="page__eyebrow">Geçmiş</span>
        <h1 className="page__title">Kayıtlı Teklifler</h1>
        <p className="page__desc">Kayıtlı teklif ve hesaplamalarınız tarih damgasıyla bu cihazda saklanır; dilediğinizde yeniden PDF/Word üretebilirsiniz.</p>
      </div>

      <div className="field">
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Müşteri adı, firma adı, il veya ilçe ile ara…"
        />
      </div>

      <div className="btn-row" style={{ marginBottom: 16 }}>
<button className={`btn ${tab === 'teklifler' ? 'btn--primary' : 'btn--secondary'} btn--block`} onClick={() => setTab('teklifler')}>
          Teklifler ({filteredProposals.length})
        </button>

        <button className={`btn ${tab === 'hesaplamalar' ? 'btn--primary' : 'btn--secondary'} btn--block`} onClick={() => setTab('hesaplamalar')}>
          Hesaplamalar ({filteredCalculations.length})
        </button>

      </div>

      {loading && <p>Yükleniyor…</p>}

      {!loading && tab === 'hesaplamalar' && filteredCalculations.length === 0 && (
        <div className="empty-state">
          <HistoryIcon className="empty-state__icon" />
          <p>{calculations.length === 0 ? 'Henüz kayıtlı bir hesaplama yok.' : 'Aramanızla eşleşen kayıt bulunamadı.'}</p>
        </div>
      )}

      {tab === 'hesaplamalar' &&
        filteredCalculations.map((item) => (
          <div key={item.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="history-item__title">{item.title}</div>
                <div className="history-item__meta">
                  {[item.customer?.customerName, item.customer?.companyName].filter(Boolean).join(' • ') || 'Müşteri bilgisi girilmedi'}
                </div>
                <div className="history-item__meta">
                  {[item.province, item.district].filter(Boolean).join(' / ') || 'İl/İlçe girilmedi'} • {item.input.properties.length} taşınmaz • Tarife {item.tariffYear ?? '—'}
                </div>
              </div>
            </div>
            <div className="result-row">
              <span className="result-row__label">Asgari Hizmet Bedeli</span>
              <span className="history-item__amount">{formatTL(item.asgariHizmetBedeli ?? 0)}</span>
            </div>
            <div className="result-row">
              <span className="result-row__label">Teklif Bedeli</span>
              <span className="history-item__amount">{formatTL(item.offerAmount ?? item.asgariHizmetBedeli ?? 0)}</span>
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn btn--secondary btn--sm btn--block" onClick={() => handleRegenerateReportPdf(item)}>
                <DownloadIcon width={15} height={15} /> PDF
              </button>
              <button className="btn btn--danger btn--sm" onClick={() => handleDeleteCalculation(item.id)}>
                <TrashIcon width={15} height={15} />
              </button>
            </div>
          </div>
        ))}

      {!loading && tab === 'teklifler' && filteredProposals.length === 0 && (
        <div className="empty-state">
          <HistoryIcon className="empty-state__icon" />
          <p>{proposals.length === 0 ? 'Henüz kayıtlı bir teklif yok. Bir hesaplamayı kaydettiğinizde teklifi de otomatik oluşturulur.' : 'Aramanızla eşleşen teklif bulunamadı.'}</p>
        </div>
      )}

      {tab === 'teklifler' &&
        filteredProposals.map((item) => (
          <div key={item.id} className="card" style={{ marginBottom: 12 }}>
            <div className="history-item__title">{item.title}</div>
            <div className="history-item__meta">
              {[item.customer?.customerName, item.customer?.companyName].filter(Boolean).join(' • ') || 'Müşteri bilgisi girilmedi'} • {formatDateTime(item.createdAt)}
            </div>
            <div className="result-row">
              <span className="result-row__label">Toplam Tutar</span>
              <span className="history-item__amount">{formatTL(item.offerGrandTotal)}</span>
            </div>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn btn--secondary btn--sm" onClick={() => handleRegenerateProposalPdf(item, 'download')}>
                <DownloadIcon width={14} height={14} /> PDF
              </button>
              <button className="btn btn--secondary btn--sm" onClick={() => handleRegenerateProposalDocx(item, 'download')}>
                <FileWordIcon width={14} height={14} /> Word
              </button>
            </div>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn btn--secondary btn--sm" onClick={() => handleRegenerateProposalPdf(item, 'share')}>
                <ShareIcon width={14} height={14} /> Paylaş
              </button>
              <button className="btn btn--secondary btn--sm" onClick={() => handleProposalWhatsApp(item)}>
                <WhatsAppIcon width={14} height={14} /> WhatsApp
              </button>
              <button className="btn btn--danger btn--sm" onClick={() => handleDeleteProposal(item.id)}>
                <TrashIcon width={14} height={14} />
              </button>
            </div>
          </div>
        ))}

      <Link to="/hesapla" className="btn btn--primary btn--block" style={{ marginTop: 8 }}>
        Yeni Hesaplama Yap
      </Link>
    </div>
  );
}
