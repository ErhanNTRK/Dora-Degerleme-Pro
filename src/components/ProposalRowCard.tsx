import type { Tariff } from '../types/tariff';
import type { LocationDatabase } from '../types/location';
import type { ServiceAlias } from '../types/serviceAliases';
import { findAliasByName } from '../types/serviceAliases';
import { rowDocumentLabel, rowEffectiveAmount, type ProposalRow, type RowComputation } from '../proposal/multiProposalRows';
import { Accordion } from './Accordion';
import { AlertIcon } from './icons';
import { formatTL } from '../utils/format';

interface ProposalRowCardProps {
  row: ProposalRow;
  idx: number;
  rowCount: number;
  comp: RowComputation;
  /** Bu satırın KDV dahil tutarı (yazılmışsa o, değilse hesaplanan). */
  gross: number | undefined;
  vatRatePct: number;
  tariff: Tariff;
  serviceAliases: ServiceAlias[];
  provinces: LocationDatabase['provinces'];
  /** İl/ilçe için resmi belediye harcı: sayı = kayıtlı, null = veri yok, undefined = ilçe seçilmemiş. */
  officialDistrictFee: (province: string, district: string) => number | null | undefined;
  updateRow: (id: string, partial: Partial<ProposalRow>) => void;
  moveRow: (id: string, dir: -1 | 1) => void;
  removeRow: (id: string) => void;
  splitRow: (row: ProposalRow) => void;
  applyLocationToAll: (row: ProposalRow) => void;
  onDistrictChange: (row: ProposalRow, province: string, district: string) => void;
}

/** Çoklu teklifteki tek rapor satırının kartı (giriş alanları, konum, ücret kalemleri, tutarlar). */
export function ProposalRowCard({
  row, idx, rowCount, comp, gross, vatRatePct, tariff, serviceAliases, provinces, officialDistrictFee,
  updateRow, moveRow, removeRow, splitRow, applyLocationToAll, onDistrictChange: handleRowDistrictChange,
}: ProposalRowCardProps) {
  const group = tariff.groups.find((g) => g.id === row.groupId);
  const districts = provinces.find((p) => p.name === row.province)?.districts ?? [];
  const bulkEligible = (row.groupId === 'G1' || row.groupId === 'G2') && row.count > 1;
  const effAmount = rowEffectiveAmount(row, comp);
  const locSummary = row.district ? `${row.province} / ${row.district}` : 'Konum seçilmedi';
  return (
    <div className="property-card">
      {/* Başlık: numara + tutar her an görünür + sırala/sil */}
      <div className="property-card__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="property-card__badge">{idx + 1}</span>
          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatTL(effAmount)}{row.manualAmount !== null && ' ✎'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => moveRow(row.id, -1)} disabled={idx === 0} aria-label="Yukarı taşı">↑</button>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => moveRow(row.id, 1)} disabled={idx === rowCount - 1} aria-label="Aşağı taşı">↓</button>
          {rowCount > 1 && (
            <button type="button" className="remove-btn" onClick={() => removeRow(row.id)}>Sil</button>
          )}
        </div>
      </div>

      {row.kind === 'saved' ? (
        <p className="field__hint">
          Kayıtlı hesaplamadan aktarıldı: <strong>{row.savedTitle}</strong>
        </p>
      ) : (
        <>
          {/* Eğitici tek satır: bu satır TEK rapordur */}
          <p className="field__hint" style={{ marginBottom: 8 }}>
            Tek rapor · Tapu ×{Math.max(1, row.count)} · Diğer rapor harçları 1 kez
          </p>

          <div className="property-row-split">
            <div className="field">
              <label className="field__label">Ne değerleniyor?</label>
              <select
                className="select"
                value={row.serviceAlias ?? '__spk'}
                onChange={(e) => {
                  if (e.target.value === '__spk') {
                    updateRow(row.id, { serviceAlias: undefined });
                    return;
                  }
                  const a = findAliasByName(serviceAliases, e.target.value);
                  if (a) updateRow(row.id, { serviceAlias: a.name, groupId: a.groupId, subtypeId: a.subtypeId });
                }}
              >
                {serviceAliases.map((a) => (
                  <option key={a.name} value={a.name}>{a.name}</option>
                ))}
                <option value="__spk">Diğer — SPK grubuyla seç…</option>
              </select>
            </div>
            <div className="field">
              <label className="field__label">Adet</label>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={1}
                value={row.count === 0 ? '' : row.count}
                onChange={(e) => {
                  // Silme anında alan boş kalabilmeli (0 = geçici boş durum); aksi hâlde
                  // "1'i sil, 2 yaz" yapılamaz — kural onBlur'da uygulanır.
                  const raw = e.target.value;
                  const count = raw === '' ? 0 : Math.max(0, Math.floor(Number(raw) || 0));
                  const areas =
                    row.areas && count >= 1
                      ? Array.from({ length: count }, (_, j) => row.areas![j] ?? row.areas![row.areas!.length - 1] ?? 0)
                      : row.areas;
                  updateRow(row.id, { count, areas: count === 1 ? undefined : areas, area: count === 1 ? (row.areas?.[0] ?? row.area) : row.area });
                }}
                onBlur={() => {
                  if (row.count < 1) updateRow(row.id, { count: 1 });
                }}
              />
            </div>
          </div>

          {row.count > 1 && (
            <div className="warning-banner" style={{ alignItems: 'center' }}>
              <AlertIcon width={18} height={18} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>Adet {row.count}: tüm taşınmazlar TEK rapor sayılır (belediye, bilgi merkezi, TDUB, yol 1 kez). Her plaza ayrı görünsün istiyorsanız ayırın.</span>
              <button type="button" className="btn btn--gold btn--sm" style={{ flexShrink: 0 }} onClick={() => splitRow(row)}>Her taşınmazı ayrı satıra böl</button>
            </div>
          )}

          {!row.serviceAlias && (
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
                <label className="field__label">Tür</label>
                <select className="select" value={row.subtypeId} onChange={(e) => updateRow(row.id, { subtypeId: e.target.value })}>
                  {group?.subtypes.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {row.count <= 1 ? (
            <div className="field">
              <label className="field__label">Alan (m²)</label>
              <input className="input" type="number" inputMode="decimal" min={0} value={row.area ?? ''} onChange={(e) => updateRow(row.id, { area: e.target.value ? Number(e.target.value) : undefined, areas: undefined })} />
            </div>
          ) : (
            <div className="field">
              <label className="field__label">Taşınmaz Alanları (m²) — her taşınmazın kendi alanı</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {Array.from({ length: row.count }, (_, i) => (
                  <input
                    key={i}
                    className="input"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder={`${i + 1}. m²`}
                    value={(row.areas?.[i] ?? row.area) || ''}
                    onChange={(e) => {
                      const next = Array.from({ length: row.count }, (_, j) => row.areas?.[j] ?? row.area ?? 0);
                      next[i] = e.target.value ? Number(e.target.value) : 0;
                      updateRow(row.id, { areas: next, area: undefined });
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Konum: açık alanda — il/ilçe seçilince belediye harcı otomatik eklenir */}
          <div className="property-row-split">
            <div className="field">
              <label className="field__label">İl</label>
              <select className="select" value={row.province} onChange={(e) => handleRowDistrictChange(row, e.target.value, '')}>
                <option value="">Seçiniz</option>
                {provinces.map((p) => (
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
          {rowCount > 1 && row.district && (
            <button type="button" className="btn btn--secondary btn--sm" style={{ marginBottom: 10 }} onClick={() => applyLocationToAll(row)}>
              Bu il/ilçeyi tüm satırlara uygula
            </button>
          )}
          {(() => {
            const official = officialDistrictFee(row.province, row.district);
            if (typeof official === 'number') {
              const overridden = row.municipalityFeeOverride !== null && row.municipalityFeeOverride !== undefined;
              const shown = overridden ? row.municipalityFeeOverride! : official;
              return (
                <div className="field">
                  <label className="field__label">Belediye Harcı (TL)</label>
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={shown === 0 ? '' : shown}
                    placeholder="0"
                    onChange={(e) => updateRow(row.id, { municipalityFeeOverride: e.target.value ? Number(e.target.value) : 0 })}
                  />
                  <span className="field__hint">
                    {overridden ? (
                      <>Elle değiştirildi (resmi veri: {formatTL(official)}). <button type="button" className="remove-btn" style={{ padding: 0 }} onClick={() => updateRow(row.id, { municipalityFeeOverride: undefined })}>Resmi değere dön</button></>
                    ) : (
                      <>✓ Resmi veriden alındı. Zam/muafiyet durumunda üzerine yazabilirsiniz; 0 da geçerlidir.</>
                    )}
                  </span>
                </div>
              );
            }
            return (
              <div className="field">
                <label className="field__label">Belediye Harcı (TL){row.district ? ' — bu ilçe için resmi veri yok' : ' — elle girin (ilçe seçilirse otomatik gelir)'}</label>
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={row.municipalityFee || ''}
                  onChange={(e) => updateRow(row.id, { municipalityFee: e.target.value ? Number(e.target.value) : 0 })}
                />
              </div>
            );
          })()}


          {bulkEligible && (
            <div className="checkbox-row">
              <div>
                <div className="checkbox-row__label">{row.groupId === 'G1' ? 'Aynı mahalle/köy sınırlarında' : 'Aynı parsel üzerinde'}</div>
                <div className="checkbox-row__value">SPK toplu değerleme: en büyüğü tam, diğerleri %{row.groupId === 'G1' ? 20 : 15}.</div>
              </div>
              <button type="button" className="switch" data-checked={row.bulkTogether} onClick={() => updateRow(row.id, { bulkTogether: !row.bulkTogether })} aria-label="Toplu değerleme">
                <span className="switch__thumb" />
              </button>
            </div>
          )}

          {comp.warnings.length > 0 && row.manualAmount === null && (
            <div className="warning-banner">
              <AlertIcon width={18} height={18} />
              <span>{comp.warnings[0]} Gerekirse alttaki "Satır Tutarı"ndan satır tutarını elle girin.</span>
            </div>
          )}
        </>
      )}

      {/* İkincil alanlar: katlanır — telefonda ana akışı kısa tutar */}
      <Accordion title={`Konum ve Ücret Ayrıntıları — ${locSummary}`} defaultOpen={true}>
        {row.kind === 'custom' && (
          <>
            <div className="field">
              <label className="field__label">Bina / Proje Adı (isteğe bağlı)</label>
              <input className="input" placeholder="Örn: Dora Plaza" value={row.buildingName ?? ''} onChange={(e) => updateRow(row.id, { buildingName: e.target.value || undefined })} />
            </div>
            {comp.result && comp.parts && (
              <div style={{ marginBottom: 12 }}>
                <div className="section-title" style={{ marginBottom: 6 }}>Ücret Kalemleri (ofis içi — her kalemi elle girebilirsiniz)</div>
                {([
                  ['Baz Ücret (Asgari Hizmet Bedeli)', 'baseFeeOverride', comp.parts.base] as const,
                  ['Yol / Ulaşım Ücreti', 'transportFeeOverride', comp.parts.transport] as const,
                  ['Tapu Harcı', 'titleDeedFeeOverride', comp.parts.deed] as const,
                  ['Gayrimenkul Bilgi Merkezi Payı', 'infoCenterFeeOverride', comp.parts.infoCenter] as const,
                  ['TDUB Birlik Payı', 'unionFeeOverride', comp.parts.union] as const,
                ]).map(([label, key, amount]) => {
                  const edited = row[key] !== null && row[key] !== undefined;
                  return (
                    <div key={key} className="field" style={{ marginBottom: 8 }}>
                      <label className="field__label">{label} (TL)</label>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          className="input"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={amount}
                          onChange={(e) => updateRow(row.id, { [key]: e.target.value === '' ? 0 : Number(e.target.value), manualAmount: null, grossAmount: null })}
                        />
                        {edited && (
                          <button type="button" className="remove-btn" style={{ padding: 0, whiteSpace: 'nowrap' }} onClick={() => updateRow(row.id, { [key]: null })}>Otomatik</button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="result-row">
                  <span className="result-row__label">Belediye Harcı</span>
                  <span className="result-row__value">{formatTL(comp.parts.municipality)}</span>
                </div>
                <div className="result-row result-row--total" style={{ fontSize: 14 }}>
                  <span className="result-row__label">Satır Toplam Maliyeti</span>
                  <span className="result-row__value">{formatTL(comp.subtotal)}</span>
                </div>
              </div>
            )}
            <div className="property-row-split">
              <div className="field">
                <label className="field__label">Mahalle</label>
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
          </>
        )}

        <div className="field">
          <label className="field__label">Belgedeki Satır Adını Tamamen Değiştir (isteğe bağlı)</label>
          <input className="input" value={row.label} placeholder={rowDocumentLabel(row, tariff, serviceAliases)} onChange={(e) => updateRow(row.id, { label: e.target.value })} />
        </div>

        <div className="field">
          <label className="field__label">Satır Tutarı (Toplam Maliyet)</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0}
            value={effAmount}
            onChange={(e) => updateRow(row.id, { manualAmount: Number(e.target.value), grossAmount: null })}
          />
          <span className="field__hint">
            {row.manualAmount !== null ? (
              <>Elle girildi. <button type="button" className="remove-btn" style={{ padding: 0 }} onClick={() => updateRow(row.id, { manualAmount: null, grossAmount: null })}>Otomatik hesaba dön ({formatTL(comp.subtotal)})</button></>
            ) : (
              'Harçlar dahil otomatik hesaplandı. Yuvarlamak veya değiştirmek için tutarı kendiniz yazın; hesaplama etkilenmez.'
            )}
          </span>
        </div>

        <div className="field">
          <label className="field__label">KDV Dahil Tutar (TL) — pazarlıkla netleşen rakamı buraya yazın</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0}
            value={gross ?? ''}
            onChange={(e) => {
              const g = Number(e.target.value);
              updateRow(row.id, { grossAmount: g, manualAmount: Math.round((g / (1 + vatRatePct / 100)) * 100) / 100 });
            }}
          />
          <span className="field__hint">
            {row.grossAmount !== null && row.grossAmount !== undefined ? (
              <>KDV hariç tutar otomatik bulunur. Tüm satırlara KDV dahil tutar yazarsanız Genel Toplam bu tutarların tam toplamı olur, kuruş farkı kalmaz. <button type="button" className="remove-btn" style={{ padding: 0 }} onClick={() => updateRow(row.id, { manualAmount: null, grossAmount: null })}>Otomatik hesaba dön</button></>
            ) : (
              `Otomatik: KDV hariç tutar × ${(1 + vatRatePct / 100).toLocaleString('tr-TR')}. Yuvarlak bir KDV dahil rakam yazarsanız KDV hariç tutar ondan hesaplanır.`
            )}
          </span>
        </div>
      </Accordion>
    </div>
  );
}
