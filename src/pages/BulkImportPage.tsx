/**
 * TOPLU EXCEL İÇE AKTARMA SAYFASI
 *
 * Akış: .xlsx yükle → kolonlar otomatik algılanır (düzeltilebilir) → satırlar
 * İL/İLÇE/MAHALLE + tapu niteliğine göre RAPORLARA gruplanır (öneri) → kullanıcı
 * satırları raporlar arasında taşır, türleri/alanları düzeltir → her rapor için
 * OFİS maliyet dökümü (tarife ücreti, tapu, belediye harcı, ulaşım, TDUB, bilgi
 * merkezi; Arsa/Tarla raporlarında belediye harcı uygulanmaz) → ONAYLA →
 * satırlar mevcut Çoklu Teklif kompozerine taslak olarak aktarılır; teklif orada
 * KDV hariç tutar + %20 KDV = genel toplam olarak müşteriye üretilir.
 *
 * Kural: hesaplama motoru (src/engine) DEĞİŞTİRİLMEDEN, rapor başına çağrılır.
 */
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTariff } from '../context/TariffContext';
import { useSettings } from '../context/SettingsContext';
import { db } from '../db/database';
import { formatTL, uid } from '../utils/format';
import {
  detectColumns, rowsFromSheet, suggestGroups, groupList, groupToProposalRow,
  MULTI_PROPOSAL_DRAFT_KEY,
  type ImportField, type ImportRow, type ReportGroup,
} from '../bulk/excelImport';
import { buildRowCalculationInput } from '../proposal/multiProposalRows';
import { calculate } from '../engine/calculationEngine';
import { EMPTY_CUSTOMER_INFO } from '../types/profile';
import { AlertIcon } from '../components/icons';

const FIELD_LABELS: Record<ImportField, string> = {
  il: 'İl', ilce: 'İlçe', mahalle: 'Mahalle', ada: 'Ada', parsel: 'Parsel',
  nitelik: 'Tapu Niteliği', alan: 'Alan (m²)',
};

export function BulkImportPage() {
  const navigate = useNavigate();
  const { tariff, serviceAliases } = useTariff();
  const { settings } = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState<unknown[][]>([]);
  const [header, setHeader] = useState<unknown[]>([]);
  const [cols, setCols] = useState<Record<ImportField, number> | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fees, setFees] = useState<Map<string, number>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const feeLookup = (p: string, d: string): number | null => {
    const v = fees.get(`${p.toLocaleUpperCase('tr-TR')}|${d.toLocaleUpperCase('tr-TR')}`);
    return v === undefined ? null : v;
  };

  async function onFile(f: File) {
    setBusy(true); setError('');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as unknown[][];
      if (data.length < 2) { setError('Dosyada başlık satırı ve en az bir veri satırı bulunamadı.'); return; }
      const head = data[0];
      const detected = detectColumns(head);
      const feeRecords = await db.municipalityFees.toArray();
      const map = new Map<string, number>();
      for (const r of feeRecords) map.set(`${r.province.toLocaleUpperCase('tr-TR')}|${r.district.toLocaleUpperCase('tr-TR')}`, r.fee);
      setFees(map);
      setFileName(f.name);
      setHeader(head);
      setSheet(data.slice(1));
      setCols(detected);
      setRows(suggestGroups(rowsFromSheet(data.slice(1), detected, serviceAliases)));
    } catch (e) {
      setError('Excel okunamadı: dosyanın .xlsx biçiminde olduğundan emin olun.');
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  function remapColumn(field: ImportField, idx: number) {
    if (!cols) return;
    const next = { ...cols, [field]: idx };
    setCols(next);
    setRows(suggestGroups(rowsFromSheet(sheet, next, serviceAliases)));
  }

  const groups = useMemo(() => groupList(rows), [rows]);

  /** Satırı başka rapora taşı ("yeni" → kendi başına yeni rapor). */
  function moveRow(rowId: string, targetKey: string) {
    setRows((prev) => prev.map((r) => {
      if (r.id !== rowId) return r;
      if (targetKey === '__new__') {
        return { ...r, groupKey: `yeni|${rowId}|${Date.now()}` };
      }
      const target = prev.find((x) => x.groupKey === targetKey);
      return { ...r, groupKey: targetKey, aliasName: target?.aliasName ?? r.aliasName };
    }));
  }

  /** Grubun hizmet türünü değiştir (gruptaki tüm satırlara uygulanır). */
  function setGroupAlias(key: string, aliasName: string) {
    setRows((prev) => prev.map((r) => (r.groupKey === key ? { ...r, aliasName: aliasName || null } : r)));
  }

  function setRowArea(rowId: string, alan: number | undefined) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, alan } : r)));
  }

  /** Grup → ofis maliyet dökümü (motor rapor başına, değiştirilmeden). */
  function computeGroup(g: ReportGroup) {
    if (!tariff || !settings) return null;
    const row = groupToProposalRow(g, serviceAliases, feeLookup, `blk-${g.key}`);
    if (!row.groupId) return { row, result: null };
    const input = buildRowCalculationInput(row, {
      titleDeedFeePerDeed: settings.titleDeedFeePerDeed,
      infoCenterFeePerReport: settings.infoCenterFeePerReport,
      unionFeePerReport: settings.unionFeePerReport,
      transportFeePerReport: settings.transportFeePerReport,
      vatRatePercent: settings.vatRatePercent,
      infoCenterFeeEnabled: true,
      unionFeeEnabled: true,
      transportFeeEnabled: true,
    });
    return { row, result: calculate(tariff, input) };
  }

  const computed = useMemo(
    () => groups.map((g) => ({ g, c: computeGroup(g) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, tariff, settings, fees],
  );

  const missingAlias = groups.filter((g) => !g.aliasName).length;
  const kdvOran = settings?.vatRatePercent ?? 20;

  /** Onay: raporları Çoklu Teklif taslağına yaz ve kompozere geç. */
  function approveAndSend() {
    if (!tariff) return;
    if (missingAlias > 0 && !window.confirm(
      `${missingAlias} raporun hizmet türü seçilmedi; bu raporlar 0 TL hesaplanır. Yine de aktarılsın mı?`)) return;
    const existing = localStorage.getItem(MULTI_PROPOSAL_DRAFT_KEY);
    if (existing && !window.confirm('Çoklu Teklif ekranında kayıtlı bir taslak var; üzerine yazılacak. Devam edilsin mi?')) return;
    const proposalRows = groups.map((g) => groupToProposalRow(g, serviceAliases, feeLookup, uid()));
    localStorage.setItem(MULTI_PROPOSAL_DRAFT_KEY, JSON.stringify({
      rows: proposalRows,
      customer: EMPTY_CUSTOMER_INFO,
      showFeeBreakdown: true,        // maliyet kalemleri OFİS görünümünde açık başlar
      customParagraphs: null,
    }));
    navigate('/coklu-teklif');
  }

  return (
    <div className="page">
      <div className="page__head">
        <span className="page__eyebrow">Toplu İş Girişi</span>
        <h1 className="page__title">Excel'den Rapor Oluştur</h1>
        <p className="page__desc">
          Taşınmaz listesini (.xlsx) yükleyin: satırlar il / ilçe / mahalle ve tapu niteliğine göre
          raporlara gruplanır. Grupları düzenleyip onayladığınızda Çoklu Teklif ekranına aktarılır.
        </p>
      </div>

      <div className="card">
        <div className="section-title">1 · Dosya</div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
               onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ''; }} />
        <button type="button" className="btn btn--primary" disabled={busy}
                onClick={() => fileRef.current?.click()}>
          {busy ? 'Okunuyor…' : '📄 Excel Dosyası Yükle'}
        </button>
        {fileName && <span className="muted" style={{ marginLeft: 10 }}>{fileName} · {rows.length} satır</span>}
        {error && <div className="alert alert--warn" style={{ marginTop: 10 }}><AlertIcon /> {error}</div>}
      </div>

      {cols && (
        <div className="card">
          <div className="section-title">2 · Kolon Eşleme</div>
          <p className="muted">Başlıklar otomatik algılandı; yanlışsa buradan düzeltin — satırlar anında yeniden okunur.</p>
          <div className="bulk-colmap">
            {(Object.keys(FIELD_LABELS) as ImportField[]).map((f) => (
              <label key={f} className="bulk-colmap__item">
                <span>{FIELD_LABELS[f]}</span>
                <select value={cols[f]} onChange={(e) => remapColumn(f, Number(e.target.value))}>
                  <option value={-1}>— yok —</option>
                  {header.map((h, i) => (
                    <option key={i} value={i}>{String(h || `Kolon ${i + 1}`)}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      {groups.length > 0 && (
        <>
          <div className="card">
            <div className="section-title">3 · Rapor Grupları ({groups.length} rapor)</div>
            <p className="muted">
              Aynı kartta görünen taşınmazlar AYNI RAPORDA hesaplanır. Bir satırı başka rapora
              taşımak için satırdaki rapor seçicisini kullanın; "➕ yeni rapor" satırı kendi
              başına ayırır. Türü değiştirmek gruptaki tüm satırlara uygulanır.
            </p>
            {computed.map(({ g, c }, gi) => {
              const res = c?.result ?? null;
              const arsaTarla = c?.row.groupId === 'G1';
              return (
                <div className="bulk-group" key={g.key}>
                  <div className="bulk-group__head">
                    <div>
                      <b>Rapor {gi + 1}</b> · {g.il || '—'} / {g.ilce || '—'} {g.mahalle && `· ${g.mahalle}`}
                      <span className="muted"> · {g.rows.length} taşınmaz</span>
                    </div>
                    <select value={g.aliasName ?? ''} onChange={(e) => setGroupAlias(g.key, e.target.value)}
                            className={g.aliasName ? '' : 'input--warn'}>
                      <option value="">Tür seçiniz…</option>
                      {serviceAliases.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                    </select>
                  </div>

                  <div className="bulk-rows">
                    <div className="bulk-row bulk-row--head">
                      <span>Ada/Parsel</span><span>Nitelik (Excel)</span><span>Alan m²</span><span>Rapor</span>
                    </div>
                    {g.rows.map((r) => (
                      <div className="bulk-row" key={r.id}>
                        <span>{[r.ada, r.parsel].filter(Boolean).join('/') || '—'}</span>
                        <span className="muted" title={r.nitelik}>{r.nitelik || '—'}</span>
                        <span>
                          <input type="number" inputMode="decimal" value={r.alan ?? ''} placeholder="—"
                                 onChange={(e) => setRowArea(r.id, e.target.value === '' ? undefined : Number(e.target.value))} />
                        </span>
                        <span>
                          <select value={r.groupKey} onChange={(e) => moveRow(r.id, e.target.value)}>
                            {groups.map((gg, i2) => (
                              <option key={gg.key} value={gg.key}>Rapor {i2 + 1}</option>
                            ))}
                            <option value="__new__">➕ yeni rapor</option>
                          </select>
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* OFİS maliyet dökümü — teklife girmez, KDV'siz kalemler */}
                  {res && (
                    <div className="bulk-cost">
                      <div className="bulk-cost__row"><span>Asgari hizmet bedeli (tarife{res.bulkDiscountTotal > 0 ? ' · toplu değerleme indirimli' : ''})</span><b>{formatTL(res.minimumServiceFeeSubtotal)}</b></div>
                      <div className="bulk-cost__row"><span>Tapu ücreti ({g.rows.length} tapu)</span><b>{formatTL(res.titleDeedFeeTotal)}</b></div>
                      <div className="bulk-cost__row">
                        <span>Belediye harcı {arsaTarla && <em className="muted">(Arsa/Tarla — uygulanmaz)</em>}
                          {!arsaTarla && c?.row.municipalityFeeSource === 'manual' && <em className="muted">(ilçe kaydı yok — kompozerde elle girin)</em>}
                        </span>
                        <b>{formatTL(res.municipalityFee)}</b>
                      </div>
                      <div className="bulk-cost__row"><span>Ulaşım + TDUB + Bilgi Merkezi</span><b>{formatTL(res.transportFee + res.unionFee + res.infoCenterFee)}</b></div>
                      <div className="bulk-cost__row bulk-cost__total"><span>Rapor maliyeti (KDV hariç)</span><b>{formatTL(res.subtotal)}</b></div>
                    </div>
                  )}
                  {!g.aliasName && (
                    <div className="alert alert--warn"><AlertIcon /> Tür seçilmedi — bu rapor hesaplanamıyor.</div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="card">
            <div className="section-title">4 · Onay ve Aktarım</div>
            <p className="muted">
              Onayladığınızda raporlar Çoklu Teklif ekranına taslak olarak aktarılır. Maliyet
              kalemleri yalnızca ofis görünümündedir; müşteriye giden teklifte KDV hariç tutar ve
              "+ KDV %{kdvOran}" ile genel toplam yer alır.
            </p>
            <div className="bulk-summary">
              <span>{groups.length} rapor · {rows.length} taşınmaz</span>
              <b>
                Toplam maliyet (KDV hariç): {formatTL(computed.reduce((s, x) => s + (x.c?.result?.subtotal ?? 0), 0))}
              </b>
            </div>
            <button type="button" className="btn btn--primary" onClick={approveAndSend} disabled={!tariff || groups.length === 0}>
              ✔ Onayla ve Çoklu Teklife Aktar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
