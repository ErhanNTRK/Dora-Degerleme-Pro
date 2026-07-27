/**
 * TOPLU EXCEL İÇE AKTARMA v3 — saf tebliğ + tam kullanıcı kontrolü.
 *
 * İlk öneri TAMAMEN 2026 tarifesine göredir: G1 aynı mahallede, G2 aynı
 * ada/parselde kendiliğinden gruplanır; diğer her şey taşınmaz başına AYRI
 * rapordur (2 fabrika → 2 kart). Birleştirme kullanıcının hakkıdır (villa+arsası
 * gibi özel raporlar): sistem engellemez, "özel rapor" rozetiyle işaretler.
 *
 * Rapor kartında her taşınmaz KENDİ satırıyla yaşar: tür (fuzzy önerili,
 * değiştirilebilir) · mahalle/ada/parsel (elle yazılabilir) · alan · taban ücret ·
 * YÜZDE (en yüksek %100, diğerleri G2 %15 / G1 %20 / diğer %20 önerilir; %50
 * dahil serbestçe ezilir) · belediye harcı (taşınmaz başına; elle/sıfır) ·
 * tapu adedi (taşınmaz başına birer; "TAKBİS almayın" → 0). Yol/TDUB/bilgi
 * merkezi rapor başına TEK'tir ve kapatılabilir. Rapor için TEKLİF TUTARI
 * elle ezilebilir; ofis maliyet dökümü yine görünür. Onayla → Çoklu Teklif.
 *
 * Kural: hesaplama motoru (src/engine) DEĞİŞTİRİLMEDEN çağrılır.
 */
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTariff } from '../context/TariffContext';
import { useSettings } from '../context/SettingsContext';
import { useLocationDb } from '../context/LocationContext';
import { db } from '../db/database';
import { formatTL, uid } from '../utils/format';
import {
  smartParse, groupList, suggestGroupsV2,
  MULTI_PROPOSAL_DRAFT_KEY,
  type ImportRow, type SmartContext, type SmartParseResult,
} from '../bulk/excelImport';
import { computeReportV3, type RowFeeInput, type ReportCostV3 } from '../bulk/reportCost';
import { trFold } from '../bulk/fuzzy';
import { EMPTY_CUSTOMER_INFO } from '../types/profile';
import { AlertIcon } from '../components/icons';

interface RowMeta {
  /** null → otomatik (G1'de 0, diğerlerinde ilçe kaydı) */
  municipalityFee: number | null;
  /** Tapu (TAKBİS) adedi — taşınmaz başına birer gelir */
  deeds: number;
  /** null → önerilen yüzde */
  pct: number | null;
}
interface GroupMeta {
  transport: boolean;
  union: boolean;
  infoCenter: boolean;
  /** Teklif tutarı ezmesi (KDV hariç); null → hesaplanan maliyet */
  proposal: number | null;
}
const DEF_ROW: RowMeta = { municipalityFee: null, deeds: 1, pct: null };
const DEF_GROUP: GroupMeta = { transport: true, union: true, infoCenter: true, proposal: null };

export function BulkImportPage() {
  const navigate = useNavigate();
  const { tariff, serviceAliases } = useTariff();
  const { settings } = useSettings();
  const { locationDb } = useLocationDb();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<SmartParseResult | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [customer, setCustomer] = useState('');
  const [rowMeta, setRowMeta] = useState<Map<string, RowMeta>>(new Map());
  const [groupMeta, setGroupMeta] = useState<Map<string, GroupMeta>>(new Map());
  const [fees, setFees] = useState<Map<string, number>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragRow, setDragRow] = useState<string | null>(null);
  const [quarterIndex, setQuarterIndex] = useState<Map<string, { il: string; ilce: string }[]> | undefined>(undefined);

  useMemo(() => {
    fetch(`${import.meta.env.BASE_URL}data/mahalle-database.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.provinces) return;
        const idx = new Map<string, { il: string; ilce: string }[]>();
        for (const p of d.provinces) for (const t of p.districts ?? []) for (const q of t.quarters ?? []) {
          const k = trFold(q);
          const arr = idx.get(k) ?? [];
          arr.push({ il: p.name, ilce: t.name });
          idx.set(k, arr);
        }
        setQuarterIndex(idx);
      })
      .catch(() => {});
  }, []);

  const ctx: SmartContext = useMemo(() => {
    const provinces = (locationDb?.provinces ?? []).map((p) => p.name);
    const districtsByProvince = new Map<string, string[]>();
    const allDistricts: string[] = [];
    for (const p of locationDb?.provinces ?? []) {
      const ds = p.districts.map((d) => d.name);
      districtsByProvince.set(trFold(p.name), ds);
      allDistricts.push(...ds);
    }
    return { provinces, districtsByProvince, allDistricts, quarterIndex };
  }, [locationDb, quarterIndex]);

  const feeLookup = (p: string, d: string): number | null => {
    const v = fees.get(`${trFold(p)}|${trFold(d)}`);
    return v === undefined ? null : v;
  };

  async function onFile(f: File) {
    setBusy(true); setError('');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }) as unknown[][];
      if (data.length < 1) { setError('Dosyada veri bulunamadı.'); return; }
      const map = new Map<string, number>();
      for (const p of locationDb?.provinces ?? []) for (const d of p.districts) {
        if (d.fee != null) map.set(`${trFold(p.name)}|${trFold(d.name)}`, d.fee);
      }
      for (const r of await db.municipalityFees.toArray()) map.set(`${trFold(r.province)}|${trFold(r.district)}`, r.fee);
      setFees(map);
      // Mahalle sözlüğü henüz inmemişse dosya çözümünden önce bekle (yarış durumu düzeltmesi)
      let qi = quarterIndex;
      if (!qi) {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}data/mahalle-database.json`);
          if (res.ok) {
            const d = await res.json();
            qi = new Map();
            for (const p of d.provinces ?? []) for (const t of p.districts ?? []) for (const q of t.quarters ?? []) {
              const k = trFold(q);
              const arr = qi.get(k) ?? [];
              arr.push({ il: p.name, ilce: t.name });
              qi.set(k, arr);
            }
            setQuarterIndex(qi);
          }
        } catch { /* sözlüksüz devam */ }
      }
      const result = smartParse(data, serviceAliases, { ...ctx, quarterIndex: qi });
      setFileName(f.name); setParsed(result); setRows(result.rows);
      setCustomer(result.customerName);
      setRowMeta(new Map()); setGroupMeta(new Map());
      if (!result.rows.length) setError('Tabloda taşınmaz satırı bulunamadı. Dosyayı kontrol edin.');
    } catch (e) {
      setError('Excel okunamadı: dosyanın .xlsx biçiminde olduğundan emin olun.');
      console.error(e);
    } finally { setBusy(false); }
  }

  const groups = useMemo(() => groupList(rows), [rows]);
  const getRM = (id: string): RowMeta => rowMeta.get(id) ?? DEF_ROW;
  const setRM = (id: string, patch: Partial<RowMeta>) =>
    setRowMeta((prev) => new Map(prev).set(id, { ...getRM(id), ...patch }));
  const getGM = (key: string): GroupMeta => groupMeta.get(key) ?? DEF_GROUP;
  const setGM = (key: string, patch: Partial<GroupMeta>) =>
    setGroupMeta((prev) => new Map(prev).set(key, { ...getGM(key), ...patch }));

  const patchRow = (id: string, patch: Partial<ImportRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const moveRow = (rowId: string, targetKey: string) =>
    setRows((prev) => prev.map((r) => (r.id !== rowId ? r
      : { ...r, groupKey: targetKey === '__new__' ? `solo|${rowId}|${Date.now()}` : targetKey })));
  const mergeGroup = (fromKey: string, toKey: string) => {
    if (fromKey !== toKey) setRows((prev) => prev.map((r) => (r.groupKey === fromKey ? { ...r, groupKey: toKey } : r)));
  };
  const deleteGroup = (key: string) => {
    const g = groups.find((x) => x.key === key);
    if (g && window.confirm(`Rapor silinsin mi? İçindeki ${g.rows.length} satır listeden kaldırılacak.`))
      setRows((prev) => prev.filter((r) => r.groupKey !== key));
  };
  const regroup = () => { setRows((prev) => suggestGroupsV2(prev, serviceAliases)); setGroupMeta(new Map()); };

  interface View { key: string; rows: ImportRow[]; gm: GroupMeta; cost: ReportCostV3 | null; title: string }
  const views: View[] = useMemo(() => groups.map((g) => {
    const gm = getGM(g.key);
    const inputs: RowFeeInput[] = g.rows.map((r) => {
      const rm = getRM(r.id);
      const alias = r.aliasName ? serviceAliases.find((a) => a.name === r.aliasName) ?? null : null;
      const autoFee = alias?.groupId === 'G1' ? 0 : (r.il && r.ilce ? (feeLookup(r.il, r.ilce) ?? 0) : 0);
      return { row: r, alias, pctOverride: rm.pct, municipalityFee: rm.municipalityFee ?? autoFee, deeds: rm.deeds };
    });
    const cost = tariff && settings ? computeReportV3(tariff, inputs, {
      titleDeedFeePerDeed: settings.titleDeedFeePerDeed,
      infoCenterFeePerReport: settings.infoCenterFeePerReport,
      unionFeePerReport: settings.unionFeePerReport,
      transportFeePerReport: settings.transportFeePerReport,
      vatRatePercent: settings.vatRatePercent,
      infoCenterFeeEnabled: true, unionFeeEnabled: true, transportFeeEnabled: true,
    }, { transport: gm.transport, union: gm.union, infoCenter: gm.infoCenter, proposalOverride: gm.proposal }) : null;
    const first = g.rows[0];
    const title = [first?.il, first?.ilce].filter(Boolean).join(' / ') || first?.mahalle || '—';
    return { key: g.key, rows: g.rows, gm, cost, title };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [groups, rowMeta, groupMeta, tariff, settings, serviceAliases, fees]);

  const missingAlias = rows.filter((r) => !r.aliasName).length;
  const kdvOran = settings?.vatRatePercent ?? 20;
  const totalSubtotal = views.reduce((s, v) => s + (v.cost?.subtotal ?? 0), 0);

  function approveAndSend() {
    if (!tariff) return;
    if (missingAlias > 0 && !window.confirm(
      `${missingAlias} taşınmazın türü seçilmedi; bu satırlar 0 TL hesaplanır. Yine de aktarılsın mı?`)) return;
    if (localStorage.getItem(MULTI_PROPOSAL_DRAFT_KEY)
      && !window.confirm('Çoklu Teklif ekranında kayıtlı bir taslak var; üzerine yazılacak. Devam edilsin mi?')) return;

    const proposalRows = views.map((v) => {
      const c = v.cost!;
      const first = v.rows[0];
      const alias = first.aliasName ? serviceAliases.find((a) => a.name === first.aliasName) : undefined;
      const single = v.rows.length === 1;
      const rm0 = single ? getRM(v.rows[0].id) : null;
      const pure = single && c && alias && !c.proposalOverridden
        && c.rows[0].appliedPct === 100
        && rm0?.municipalityFee == null            // harç elle ezilmemiş (otomatik)
        && c.rows[0].deeds === 1;
      const adaParsel = v.rows.map((r) => [r.ada, r.parsel].filter(Boolean).join('/')).filter(Boolean).join(', ');
      const label = single
        ? ''
        : `${v.title} — ${v.rows.length} taşınmaz${c?.tebligCompliant ? '' : ' (özel rapor)'}`;

      // Tek taşınmazlı, ezmesiz satırlar motora birebir gider; kalanlar tutar-sabitli aktarılır
      if (pure && alias) {
        return {
          id: uid(), kind: 'custom' as const, label: '',
          province: first.il, district: first.ilce,
          municipalityFee: c.rows[0].municipalityFee,
          municipalityFeeSource: alias.groupId === 'G1' ? null
            : (c.rows[0].municipalityFee > 0 ? 'database' as const : 'manual' as const),
          groupId: alias.groupId, subtypeId: alias.subtypeId,
          count: 1, area: first.alan, areas: undefined,
          bulkTogether: false, manualAmount: null,
          titleDeedCountOverride: null,
          transportFeeEnabled: v.gm.transport, unionFeeEnabled: v.gm.union, infoCenterFeeEnabled: v.gm.infoCenter,
          serviceAlias: alias.name,
          mahalle: first.mahalle || undefined, ada: first.ada || undefined, parsel: first.parsel || undefined,
        };
      }
      return {
        id: uid(), kind: 'custom' as const, label,
        province: first.il, district: first.ilce,
        municipalityFee: c?.municipalityTotal ?? 0, municipalityFeeSource: 'manual' as const,
        groupId: alias?.groupId ?? '', subtypeId: alias?.subtypeId ?? '',
        count: v.rows.length, area: undefined, areas: undefined,
        bulkTogether: false,
        manualAmount: c?.subtotal ?? 0,          // yüzdeler/ezmelerle KDV hariç rapor tutarı sabitlenir
        titleDeedCountOverride: null,
        transportFeeEnabled: v.gm.transport, unionFeeEnabled: v.gm.union, infoCenterFeeEnabled: v.gm.infoCenter,
        serviceAlias: alias?.name,
        mahalle: first.mahalle || undefined, ada: adaParsel || undefined, parsel: undefined,
      };
    });

    const isCompany = /A\.?Ş|LTD|ŞTİ|ŞİRKET|HOLDİNG|BANK|BELEDİYE/i.test(customer);
    localStorage.setItem(MULTI_PROPOSAL_DRAFT_KEY, JSON.stringify({
      rows: proposalRows,
      customer: {
        ...EMPTY_CUSTOMER_INFO,
        customerType: isCompany ? 'kurumsal' : 'bireysel',
        customerName: isCompany ? '' : customer,
        companyName: isCompany ? customer : '',
      },
      showFeeBreakdown: true,
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
          Müşteriden gelen listeyi (.xlsx) olduğu gibi yükleyin. İlk öneri tamamen 2026 tarifesine
          göredir; birleştirme ve tüm değişiklikler size aittir — sistem önerir, dayatmaz.
        </p>
      </div>

      <div className="card">
        <div className="section-title">1 · Dosya</div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
               onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ''; }} />
        <button type="button" className="btn btn--primary" disabled={busy}
                onClick={() => fileRef.current?.click()}>
          {busy ? 'Çözümleniyor…' : '📄 Excel Dosyası Yükle'}
        </button>
        {fileName && (
          <span className="muted" style={{ marginLeft: 10 }}>
            {fileName} · {rows.length} satır{parsed ? ` · başlık: ${parsed.headerRowIndex + 1}. satır` : ''}
          </span>
        )}
        {error && <div className="alert alert--warn" style={{ marginTop: 10 }}><AlertIcon /> {error}</div>}
        {parsed?.notes.map((n, i) => (
          <div key={i} className="alert alert--warn" style={{ marginTop: 10 }}><AlertIcon /> {n}</div>
        ))}
      </div>

      {parsed && rows.length > 0 && (
        <>
          <div className="card">
            <div className="section-title">2 · Müşteri</div>
            <input className="input" style={{ maxWidth: 480 }} value={customer}
                   placeholder="Müşteri adı / unvanı"
                   onChange={(e) => setCustomer(e.target.value)} />
          </div>

          <div className="card">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span>3 · Raporlar ({groups.length})</span>
              <button type="button" className="btn" onClick={regroup}>↺ Tebliğ önerisine dön</button>
            </div>
            <p className="muted">
              Satırı sürükleyip başka kartın üzerine bırakın ya da satırdaki seçiciyi kullanın.
              Yüzde: en yüksek taban %100, diğerleri G2 %15 · G1 %20 · diğer %20 önerilir — serbestçe değiştirin.
              ⤷ mirası, ✎ fuzzy düzeltmeyi gösterir; mahalle/ada/parsel elle yazılabilir.
            </p>

            {views.map((v, gi) => (
              <div className={`bulk-group${dragRow ? ' bulk-group--droppable' : ''}`} key={v.key}
                   onDragOver={(e) => { if (dragRow) e.preventDefault(); }}
                   onDrop={(e) => { e.preventDefault(); if (dragRow) { moveRow(dragRow, v.key); setDragRow(null); } }}>
                <div className="bulk-group__head">
                  <div>
                    <b>Rapor {gi + 1}</b> · {v.title}
                    <span className="muted"> · {v.rows.length} taşınmaz</span>
                    {v.cost && (v.cost.tebligCompliant
                      ? <span className="badge badge--ok" title="Tebliğin kendiliğinden kurduğu grup">tebliğ</span>
                      : v.rows.length > 1 && <span className="badge badge--warn" title="Kullanıcı birleştirmesi — tebliğ varsayılanından ayrıldınız">özel rapor</span>)}
                  </div>
                  <div className="bulk-group__tools">
                    <select value="" title="Bu raporu başka raporla birleştir"
                            onChange={(e) => { if (e.target.value) mergeGroup(v.key, e.target.value); }}>
                      <option value="">Birleştir…</option>
                      {views.filter((x) => x.key !== v.key).map((x) => (
                        <option key={x.key} value={x.key}>Rapor {views.indexOf(x) + 1} ({x.title})</option>
                      ))}
                    </select>
                    <button type="button" className="b-del" title="Raporu sil" onClick={() => deleteGroup(v.key)}>✕</button>
                  </div>
                </div>

                <div className="bulk-rows">
                  {v.rows.map((r) => {
                    const rm = getRM(r.id);
                    const cr = v.cost?.rows.find((x) => x.row.id === r.id);
                    const multi = v.rows.length > 1;
                    return (
                      <div className={`prop-card${dragRow === r.id ? ' bulk-row--drag' : ''}`} key={r.id}
                           draggable onDragStart={() => setDragRow(r.id)} onDragEnd={() => setDragRow(null)}>
                        <div className="prop-card__top">
                          <label className="pfield pfield--type">
                            <span>Tür {r.nitelik && <em title={r.nitelik}>(Excel: {r.nitelik.length > 18 ? r.nitelik.slice(0, 18) + '…' : r.nitelik})</em>}</span>
                            <select value={r.aliasName ?? ''} className={r.aliasName ? '' : 'input--warn'}
                                    onChange={(e) => patchRow(r.id, { aliasName: e.target.value || null })}>
                              <option value="">Tür seçiniz…</option>
                              {serviceAliases.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                            </select>
                          </label>
                          <label className="pfield">
                            <span>Mahalle {r.inherited && <em title="Üst satırdan miras">⤷</em>} {r.fuzzyNote && <em title={r.fuzzyNote}>✎</em>}</span>
                            <input value={r.mahalle} placeholder="—" onChange={(e) => patchRow(r.id, { mahalle: e.target.value })} />
                          </label>
                          <label className="pfield pfield--s">
                            <span>Ada</span>
                            <input value={r.ada} placeholder="—" onChange={(e) => patchRow(r.id, { ada: e.target.value })} />
                          </label>
                          <label className="pfield pfield--s">
                            <span>Parsel</span>
                            <input value={r.parsel} placeholder="—" onChange={(e) => patchRow(r.id, { parsel: e.target.value })} />
                          </label>
                          <label className="pfield pfield--s">
                            <span>Alan m²</span>
                            <input type="number" inputMode="decimal" value={r.alan ?? ''} placeholder="—"
                                   onChange={(e) => patchRow(r.id, { alan: e.target.value === '' ? undefined : Number(e.target.value) })} />
                          </label>
                        </div>
                        <div className="prop-card__bottom">
                          <div className="pfield pfield--ro">
                            <span>Taban ücret</span>
                            <b>{cr ? formatTL(cr.baseFee) : '—'}</b>
                          </div>
                          {multi && (
                            <label className="pfield pfield--s">
                              <span>Yüzde {cr && <em>öneri: %{cr.defaultPct}</em>}</span>
                              <span className="pfx">
                                <i>%</i>
                                <input type="number" min={0} max={100} value={rm.pct ?? cr?.defaultPct ?? 100}
                                       onChange={(e) => setRM(r.id, { pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
                                {rm.pct != null && rm.pct !== cr?.defaultPct && (
                                  <button type="button" className="linklike" title="Önerilen yüzdeye dön"
                                          onClick={() => setRM(r.id, { pct: null })}>↺</button>
                                )}
                              </span>
                            </label>
                          )}
                          {cr?.feeApplies === false ? (
                            <div className="pfield pfield--ro">
                              <span>Belediye harcı</span>
                              <em className="muted">aynı parsel — harç yukarıdaki satırda</em>
                            </div>
                          ) : (
                            <label className="pfield">
                              <span>Belediye harcı{cr?.alias?.groupId === 'G1' ? ' (Arsa/Tarla — uygulanmaz)' : rm.municipalityFee == null && (cr?.municipalityFee ?? 0) > 0 ? ' (kayıttan)' : ''}</span>
                              <span className="pfx">
                                <i>₺</i>
                                <input type="number" min={0} value={cr?.municipalityFee ?? 0}
                                       onChange={(e) => setRM(r.id, { municipalityFee: Math.max(0, Number(e.target.value) || 0) })} />
                                {rm.municipalityFee != null && (
                                  <button type="button" className="linklike" title="Otomatiğe dön"
                                          onClick={() => setRM(r.id, { municipalityFee: null })}>↺</button>
                                )}
                              </span>
                            </label>
                          )}
                          <label className="pfield pfield--s">
                            <span>Tapu adedi</span>
                            <input type="number" min={0} value={rm.deeds}
                                   title='"TAKBİS almayın" için 0 yazın'
                                   onChange={(e) => setRM(r.id, { deeds: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                          </label>
                          <label className="pfield pfield--s">
                            <span>Rapor</span>
                            <select value={r.groupKey} onChange={(e) => moveRow(r.id, e.target.value)}>
                              {views.map((gg, i2) => <option key={gg.key} value={gg.key}>Rapor {i2 + 1}</option>)}
                              <option value="__new__">➕ yeni</option>
                            </select>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {v.cost && (
                  <div className="bulk-cost">
                    <div className="bulk-cost__row">
                      <span>Hizmet bedeli (satır yüzdeleriyle)</span>
                      <b>{formatTL(v.cost.serviceTotal)}</b>
                    </div>
                    <div className="bulk-cost__row"><span>Belediye harçları (taşınmaz başına)</span><b>{formatTL(v.cost.municipalityTotal)}</b></div>
                    <div className="bulk-cost__row"><span>Tapu ücretleri (taşınmaz başına)</span><b>{formatTL(v.cost.titleDeedTotal)}</b></div>
                    {([['Ulaşım ücreti', 'transport', v.cost.transportFee, settings?.transportFeePerReport],
                       ['TDUB payı', 'union', v.cost.unionFee, settings?.unionFeePerReport],
                       ['Bilgi merkezi payı', 'infoCenter', v.cost.infoCenterFee, settings?.infoCenterFeePerReport]] as const
                    ).map(([lbl, k, amt, def]) => (
                      <div key={k} className={`bulk-cost__row${v.gm[k] ? '' : ' bulk-cost__row--off'}`}>
                        <span>
                          <input type="checkbox" checked={v.gm[k]} title="Kalemi aç/kapat"
                                 onChange={() => setGM(v.key, { [k]: !v.gm[k] } as Partial<GroupMeta>)} />
                          {' '}{lbl}
                        </span>
                        <b>{v.gm[k] ? formatTL(amt || def || 0) : '0,00 TL'}</b>
                      </div>
                    ))}
                    <div className="bulk-cost__row"><span>Hesaplanan maliyet (KDV hariç)</span><b>{formatTL(v.cost.computedSubtotal)}</b></div>
                    <div className="bulk-cost__row bulk-cost__total">
                      <span>
                        Teklif tutarı (KDV hariç) ·{' '}
                        <input type="number" className="bulk-mini bulk-mini--wide" min={0}
                               value={v.gm.proposal ?? v.cost.computedSubtotal}
                               title="Pazarlıklı teklif için elle ezin; maliyet dökümü yukarıda görünmeye devam eder"
                               onChange={(e) => setGM(v.key, { proposal: Math.max(0, Number(e.target.value) || 0) })} />
                        {v.gm.proposal != null && (
                          <button type="button" className="linklike" onClick={() => setGM(v.key, { proposal: null })}>↺ hesaplanan</button>
                        )}
                      </span>
                      <b>{formatTL(v.cost.subtotal)}</b>
                    </div>
                    <div className="bulk-cost__row muted"><span>+ KDV %{kdvOran}</span><b>{formatTL(v.cost.vatAmount)}</b></div>
                    {v.cost.warnings.map((w, i) => (
                      <div key={i} className="alert alert--warn"><AlertIcon /> {w}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="bulk-group bulk-group--newdrop"
                 onDragOver={(e) => { if (dragRow) e.preventDefault(); }}
                 onDrop={(e) => { e.preventDefault(); if (dragRow) { moveRow(dragRow, '__new__'); setDragRow(null); } }}>
              ➕ Satırı buraya bırak → yeni rapor
            </div>
          </div>

          <div className="card">
            <div className="section-title">4 · Onay ve Aktarım</div>
            <p className="muted">
              Maliyet kalemleri yalnızca ofis görünümündedir; müşteriye giden teklifte KDV hariç
              tutar ve "+ KDV %{kdvOran}" ile genel toplam yer alır.
            </p>
            <div className="bulk-summary">
              <span>{groups.length} rapor · {rows.length} taşınmaz{customer ? ` · ${customer}` : ''}</span>
              <b>Toplam teklif (KDV hariç): {formatTL(totalSubtotal)}</b>
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
