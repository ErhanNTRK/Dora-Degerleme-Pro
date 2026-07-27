/**
 * TOPLU EXCEL İÇE AKTARMA v2 — akıllı teklif hazırlama ekranı.
 *
 * Karışık müşteri Excel'leri için: başlık satırını kendisi bulur, müşteri
 * unvanını yakalar, kolonları başlık + İÇERİK analiziyle tanır (il/ilçe
 * veritabanına karşı), yazım hatalarını fuzzy eşlemeyle düzeltir (dayatmadan),
 * birleşik ADA/PARSEL ve "Eski/Yeni" desenlerini çözer, boş konumlu devam
 * satırlarına üstten miras verir. Raporlar İLÇE bazlı gruplanır (mahalle grubu
 * bölmez); toplu değerleme indirimi tebliğe uygun alt kümelerde hesaplanır
 * (G1: aynı mahalle · G2: aynı ada/parsel). Her rapor kartında TÜM maliyet
 * kalemleri AYRI satırlar halinde gösterilir ve tek tek kapatılabilir/ezilebilir;
 * tapu adedi elle değiştirilebilir (TAKBİS kuralı). Satırlar sürükle-bırak veya
 * seçiciyle taşınır; gruplar birleştirilebilir/silinebilir. Onayla → Çoklu
 * Teklif kompozerine taslak olarak aktarılır (maliyet dökümü ofis görünümünde;
 * müşteri teklifinde KDV hariç tutar + KDV = genel toplam).
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
  smartParse, groupList, groupToProposalRow, suggestGroupsV2,
  MULTI_PROPOSAL_DRAFT_KEY,
  type ImportRow, type ReportGroup, type SmartContext, type SmartParseResult,
} from '../bulk/excelImport';
import { computeSmartGroup, type SmartGroupCost } from '../bulk/smartGroupCost';
import { trFold } from '../bulk/fuzzy';
import { EMPTY_CUSTOMER_INFO } from '../types/profile';
import { AlertIcon } from '../components/icons';

interface GroupMeta {
  /** null → otomatik (G1'de 0/uygulanmaz, diğerlerinde ilçe kaydı) */
  municipalityFee: number | null;
  /** null → taşınmaz adedi */
  titleDeedCount: number | null;
  transport: boolean;
  union: boolean;
  infoCenter: boolean;
}
const DEFAULT_META: GroupMeta = { municipalityFee: null, titleDeedCount: null, transport: true, union: true, infoCenter: true };

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
  const [meta, setMeta] = useState<Map<string, GroupMeta>>(new Map());
  const [fees, setFees] = useState<Map<string, number>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragRow, setDragRow] = useState<string | null>(null);
  const [quarterIndex, setQuarterIndex] = useState<Map<string, { il: string; ilce: string }[]> | undefined>(undefined);

  // Mahalle sözlüğü (opsiyonel veri dosyası; yoksa özellik sessizce devre dışı)
  useMemo(() => {
    fetch(`${import.meta.env.BASE_URL}data/mahalle-database.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.provinces) return;
        const idx = new Map<string, { il: string; ilce: string }[]>();
        for (const p of d.provinces) {
          for (const t of p.districts ?? []) {
            for (const q of t.quarters ?? []) {
              const k = trFold(q);
              const arr = idx.get(k) ?? [];
              arr.push({ il: p.name, ilce: t.name });
              idx.set(k, arr);
            }
          }
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
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as unknown[][];
      if (data.length < 1) { setError('Dosyada veri bulunamadı.'); return; }

      // Belediye harçları: kurumsal kayıtlar + il-ilçe veritabanındaki tutarlar
      const map = new Map<string, number>();
      for (const p of locationDb?.provinces ?? []) {
        for (const d of p.districts) {
          if (d.fee != null) map.set(`${trFold(p.name)}|${trFold(d.name)}`, d.fee);
        }
      }
      for (const r of await db.municipalityFees.toArray()) {
        map.set(`${trFold(r.province)}|${trFold(r.district)}`, r.fee);
      }
      setFees(map);

      const result = smartParse(data, serviceAliases, ctx);
      setFileName(f.name);
      setParsed(result);
      setRows(result.rows);
      setCustomer(result.customerName);
      setMeta(new Map());
      if (!result.rows.length) setError('Tabloda taşınmaz satırı bulunamadı. Dosyayı kontrol edin.');
    } catch (e) {
      setError('Excel okunamadı: dosyanın .xlsx biçiminde olduğundan emin olun.');
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  const groups = useMemo(() => groupList(rows), [rows]);
  const getMeta = (key: string): GroupMeta => meta.get(key) ?? DEFAULT_META;
  const setGroupMeta = (key: string, patch: Partial<GroupMeta>) =>
    setMeta((prev) => new Map(prev).set(key, { ...getMeta(key), ...patch }));

  function moveRow(rowId: string, targetKey: string) {
    setRows((prev) => prev.map((r) => {
      if (r.id !== rowId) return r;
      if (targetKey === '__new__') return { ...r, groupKey: `yeni|${rowId}|${Date.now()}` };
      const target = prev.find((x) => x.groupKey === targetKey);
      return { ...r, groupKey: targetKey, aliasName: target?.aliasName ?? r.aliasName };
    }));
  }
  function mergeGroup(fromKey: string, toKey: string) {
    if (fromKey === toKey) return;
    const target = rows.find((x) => x.groupKey === toKey);
    setRows((prev) => prev.map((r) => (r.groupKey === fromKey
      ? { ...r, groupKey: toKey, aliasName: target?.aliasName ?? r.aliasName } : r)));
  }
  function deleteGroup(key: string) {
    const g = groups.find((x) => x.key === key);
    if (!g) return;
    if (!window.confirm(`Rapor silinsin mi? İçindeki ${g.rows.length} satır listeden kaldırılacak.`)) return;
    setRows((prev) => prev.filter((r) => r.groupKey !== key));
  }
  function setGroupAlias(key: string, aliasName: string) {
    setRows((prev) => prev.map((r) => (r.groupKey === key ? { ...r, aliasName: aliasName || null } : r)));
  }
  function setRowArea(rowId: string, alan: number | undefined) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, alan } : r)));
  }
  function regroup() {
    setRows((prev) => suggestGroupsV2(prev));
    setMeta(new Map());
  }

  interface GroupView { g: ReportGroup; m: GroupMeta; autoFee: number; fee: number; deeds: number; cost: SmartGroupCost | null; arsaTarla: boolean }
  const views: GroupView[] = useMemo(() => groups.map((g) => {
    const m = getMeta(g.key);
    const alias = g.aliasName ? serviceAliases.find((a) => a.name === g.aliasName) : undefined;
    const arsaTarla = alias?.groupId === 'G1';
    const autoFee = arsaTarla ? 0 : (feeLookup(g.il, g.ilce) ?? 0);
    const fee = m.municipalityFee ?? autoFee;
    const deeds = m.titleDeedCount ?? g.rows.length;
    const cost = tariff && settings && alias ? computeSmartGroup(tariff, g.rows, alias, {
      titleDeedFeePerDeed: settings.titleDeedFeePerDeed,
      infoCenterFeePerReport: settings.infoCenterFeePerReport,
      unionFeePerReport: settings.unionFeePerReport,
      transportFeePerReport: settings.transportFeePerReport,
      vatRatePercent: settings.vatRatePercent,
      infoCenterFeeEnabled: true, unionFeeEnabled: true, transportFeeEnabled: true,
    }, {
      municipalityFee: fee, titleDeedCount: deeds,
      transportEnabled: m.transport, unionEnabled: m.union, infoCenterEnabled: m.infoCenter,
    }) : null;
    return { g, m, autoFee, fee, deeds, cost, arsaTarla };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [groups, meta, tariff, settings, serviceAliases, fees]);

  const missingAlias = groups.filter((g) => !g.aliasName).length;
  const kdvOran = settings?.vatRatePercent ?? 20;
  const totalSubtotal = views.reduce((s, v) => s + (v.cost?.subtotal ?? 0), 0);

  function approveAndSend() {
    if (!tariff) return;
    if (missingAlias > 0 && !window.confirm(
      `${missingAlias} raporun hizmet türü seçilmedi; bu raporlar 0 TL hesaplanır. Yine de aktarılsın mı?`)) return;
    if (localStorage.getItem(MULTI_PROPOSAL_DRAFT_KEY)
      && !window.confirm('Çoklu Teklif ekranında kayıtlı bir taslak var; üzerine yazılacak. Devam edilsin mi?')) return;

    const proposalRows = views.map((v) => {
      const base = groupToProposalRow(v.g, serviceAliases, feeLookup, uid());
      const heterojen = (v.cost?.subsetCount ?? 1) > 1;
      return {
        ...base,
        municipalityFee: v.fee,
        municipalityFeeSource: v.m.municipalityFee != null ? 'manual' as const : base.municipalityFeeSource,
        titleDeedCountOverride: v.m.titleDeedCount,
        transportFeeEnabled: v.m.transport,
        unionFeeEnabled: v.m.union,
        infoCenterFeeEnabled: v.m.infoCenter,
        // Karışık indirim alt kümeli raporlar: tebliğe uygun tutar burada hesaplandı,
        // kompozerde satır tutarı olarak sabitlenir (motor tek kümeyle farklı bulurdu).
        manualAmount: heterojen && v.cost ? v.cost.subtotal : base.manualAmount,
        label: heterojen ? `${v.g.ilce} ${v.g.aliasName ?? ''} (${v.g.rows.length} taşınmaz · tebliğ alt kümeli)`.trim() : base.label,
      };
    });

    const isCompany = /A\.?Ş|LTD|ŞTİ|ŞİRKET|HOLDİNG|BANK/i.test(customer);
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

  const feeLine = (label: string, enabled: boolean, onToggle: (() => void) | null, amount: number, extra?: React.ReactNode) => (
    <div className={`bulk-cost__row${enabled ? '' : ' bulk-cost__row--off'}`}>
      <span>
        {onToggle && (
          <input type="checkbox" checked={enabled} onChange={onToggle} title="Kalemi aç/kapat" />
        )}
        {' '}{label} {extra}
      </span>
      <b>{enabled ? formatTL(amount) : '0,00 TL'}</b>
    </div>
  );

  return (
    <div className="page">
      <div className="page__head">
        <span className="page__eyebrow">Toplu İş Girişi</span>
        <h1 className="page__title">Excel'den Rapor Oluştur</h1>
        <p className="page__desc">
          Müşteriden gelen listeyi (.xlsx) olduğu gibi yükleyin: başlık satırı, kolonlar ve
          yazım hataları otomatik çözülür; raporlar SPK tebliğine göre gruplanır. Gruplar
          tamamen düzenlenebilir — sistem önerir, karar sizindir.
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
            <p className="muted">Excel'in üst satırından yakalandı; teklife bu adla aktarılır — düzeltebilirsiniz.</p>
            <input className="input" style={{ maxWidth: 480 }} value={customer}
                   placeholder="Müşteri adı / unvanı"
                   onChange={(e) => setCustomer(e.target.value)} />
          </div>

          <div className="card">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span>3 · Rapor Grupları ({groups.length} rapor)</span>
              <button type="button" className="btn" onClick={regroup}>↺ Önerilen gruplamaya dön</button>
            </div>
            <p className="muted">
              Aynı karttaki taşınmazlar AYNI RAPORDA hesaplanır (belediye/yol/TDUB/bilgi merkezi bir kez;
              tapu harcı tapu adedince). Satırı sürükleyip başka kartın üzerine bırakın ya da satırdaki
              seçiciyi kullanın. ⤷ işareti üst satırdan miras alınan konumu, ✎ fuzzy yazım düzeltmesini gösterir.
            </p>

            {views.map(({ g, m, autoFee, fee, deeds, cost, arsaTarla }, gi) => (
              <div className={`bulk-group${dragRow ? ' bulk-group--droppable' : ''}`} key={g.key}
                   onDragOver={(e) => { if (dragRow) e.preventDefault(); }}
                   onDrop={(e) => { e.preventDefault(); if (dragRow) { moveRow(dragRow, g.key); setDragRow(null); } }}>
                <div className="bulk-group__head">
                  <div>
                    <b>Rapor {gi + 1}</b> · {g.il || '—'} / {g.ilce || (g.mahalle ? `(${g.mahalle} — ilçe Excel'de yok)` : '—')}
                    <span className="muted"> · {g.rows.length} taşınmaz{(cost?.subsetCount ?? 1) > 1 ? ` · ${cost!.subsetCount} indirim alt kümesi` : ''}</span>
                  </div>
                  <div className="bulk-group__tools">
                    <select value={g.aliasName ?? ''} onChange={(e) => setGroupAlias(g.key, e.target.value)}
                            className={g.aliasName ? '' : 'input--warn'} title="Hizmet türü">
                      <option value="">Tür seçiniz…</option>
                      {serviceAliases.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                    </select>
                    <select value="" title="Bu raporu başka raporla birleştir"
                            onChange={(e) => { if (e.target.value) mergeGroup(g.key, e.target.value); }}>
                      <option value="">Birleştir…</option>
                      {groups.filter((x) => x.key !== g.key).map((x) => (
                        <option key={x.key} value={x.key}>Rapor {groups.indexOf(x) + 1} ({x.ilce || x.mahalle})</option>
                      ))}
                    </select>
                    <button type="button" className="b-del" title="Raporu sil" onClick={() => deleteGroup(g.key)}>✕</button>
                  </div>
                </div>

                <div className="bulk-rows">
                  <div className="bulk-row bulk-row--head">
                    <span>Mahalle</span><span>Ada/Parsel</span><span>Nitelik (Excel)</span><span>Alan m²</span><span>Rapor</span>
                  </div>
                  {g.rows.map((r) => (
                    <div className={`bulk-row${dragRow === r.id ? ' bulk-row--drag' : ''}`} key={r.id}
                         draggable
                         onDragStart={() => setDragRow(r.id)}
                         onDragEnd={() => setDragRow(null)}>
                      <span>
                        {r.inherited && <span title="Konum üst satırdan miras alındı">⤷ </span>}
                        {r.mahalle || '—'}
                        {r.fuzzyNote && <span className="muted" title={r.fuzzyNote}> ✎</span>}
                      </span>
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

                {/* OFİS maliyet dökümü — her kalem AYRI satır; kapatılabilir/ezilebilir */}
                {cost && (
                  <div className="bulk-cost">
                    <div className="bulk-cost__row">
                      <span>Asgari hizmet bedeli (tarife{cost.bulkDiscountTotal > 0 ? ` · toplu değerleme indirimi −${formatTL(cost.bulkDiscountTotal)}` : ''})</span>
                      <b>{formatTL(cost.serviceSubtotal)}</b>
                    </div>
                    <div className="bulk-cost__row">
                      <span>
                        Tapu ücreti ·{' '}
                        <input type="number" className="bulk-mini" min={0} value={deeds}
                               title="Tapu (TAKBİS) adedi — bir iş için birden fazla belge çekilebilir"
                               onChange={(e) => setGroupMeta(g.key, { titleDeedCount: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                        {' '}tapu
                        {m.titleDeedCount != null && m.titleDeedCount !== g.rows.length && (
                          <button type="button" className="linklike" onClick={() => setGroupMeta(g.key, { titleDeedCount: null })}>↺ {g.rows.length}</button>
                        )}
                      </span>
                      <b>{formatTL(cost.titleDeedTotal)}</b>
                    </div>
                    <div className="bulk-cost__row">
                      <span>
                        Belediye harcı ·{' '}
                        <input type="number" className="bulk-mini bulk-mini--wide" min={0} value={fee}
                               title="Sıfırlanabilir / elle değiştirilebilir — otomatik değer zorunlu değildir"
                               onChange={(e) => setGroupMeta(g.key, { municipalityFee: Math.max(0, Number(e.target.value) || 0) })} />
                        {arsaTarla && <em className="muted"> (Arsa/Tarla — uygulanmaz)</em>}
                        {!arsaTarla && m.municipalityFee == null && autoFee > 0 && <em className="muted"> (kayıttan)</em>}
                        {!arsaTarla && m.municipalityFee == null && autoFee === 0 && <em className="muted"> (kayıt yok)</em>}
                        {m.municipalityFee != null && (
                          <button type="button" className="linklike" onClick={() => setGroupMeta(g.key, { municipalityFee: null })}>↺ otomatik</button>
                        )}
                      </span>
                      <b>{formatTL(cost.municipalityFee)}</b>
                    </div>
                    {feeLine('Ulaşım ücreti', m.transport, () => setGroupMeta(g.key, { transport: !m.transport }), cost.transportFee || (settings?.transportFeePerReport ?? 0))}
                    {feeLine('TDUB payı', m.union, () => setGroupMeta(g.key, { union: !m.union }), cost.unionFee || (settings?.unionFeePerReport ?? 0))}
                    {feeLine('Bilgi merkezi payı', m.infoCenter, () => setGroupMeta(g.key, { infoCenter: !m.infoCenter }), cost.infoCenterFee || (settings?.infoCenterFeePerReport ?? 0))}
                    <div className="bulk-cost__row bulk-cost__total"><span>Rapor maliyeti (KDV hariç)</span><b>{formatTL(cost.subtotal)}</b></div>
                    <div className="bulk-cost__row muted"><span>+ KDV %{kdvOran}</span><b>{formatTL(cost.vatAmount)}</b></div>
                  </div>
                )}
                {!g.aliasName && (
                  <div className="alert alert--warn"><AlertIcon /> Tür seçilmedi — bu rapor hesaplanamıyor. (Nitelik yanıltıcı olabilir; iş arsa değerlemesiyse "Arsa" seçin.)</div>
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
              <b>Toplam maliyet (KDV hariç): {formatTL(totalSubtotal)}</b>
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
