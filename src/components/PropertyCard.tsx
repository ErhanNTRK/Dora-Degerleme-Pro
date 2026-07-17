import type { Tariff } from '../types/tariff';
import type { PropertyInput } from '../types/calculation';
import { TrashIcon, AlertIcon } from './icons';
import { findGroup, findSubtype } from '../engine/tariffLookup';
import { Accordion } from './Accordion';
import { findAliasByName, type ServiceAlias } from '../types/serviceAliases';

interface Props {
  tariff: Tariff;
  index: number;
  property: PropertyInput;
  onChange: (updated: PropertyInput) => void;
  onRemove: () => void;
  canRemove: boolean;
  showBulkOption?: 'neighborhood' | 'parcel' | null;
  /** Sade hizmet adları (görünüm katmanı). Boşsa yalnızca SPK seçimi gösterilir. */
  serviceAliases?: ServiceAlias[];
}

export function PropertyCard({ tariff, index, property, onChange, onRemove, canRemove, showBulkOption, serviceAliases = [] }: Props) {
  const group = findGroup(tariff, property.groupId);
  const subtype = group ? findSubtype(tariff, property.groupId, property.subtypeId) : undefined;

  const isReferenceType = !!group?.isPercentOfBaseGroupFee || !!group?.isMultiplierOfBaseGroupFee;
  const isManual = !!subtype?.manualFeeRequired;
  const hasFixedFee =
    !isManual &&
    !subtype?.baseSubtypeRef &&
    subtype?.brackets?.length === 1 &&
    subtype.brackets[0].min === null &&
    subtype.brackets[0].max === null;
  const needsArea = !isManual && !isReferenceType && !hasFixedFee;

  function handleGroupChange(groupId: string) {
    const g = findGroup(tariff, groupId);
    const firstSubtype = g?.subtypes[0];
    onChange({
      ...property,
      groupId,
      subtypeId: firstSubtype?.id ?? '',
      area: undefined,
      manualFee: undefined,
      referenceGroupId: undefined,
      referenceSubtypeId: undefined,
      referenceArea: undefined,
    });
  }

  function handleSubtypeChange(subtypeId: string) {
    onChange({ ...property, subtypeId, area: undefined, manualFee: undefined });
  }

  /** Sade hizmet seçimi: alias arka planda doğru SPK grup/türünü ayarlar. */
  function handleAliasChange(name: string) {
    if (name === '__spk') {
      onChange({ ...property, serviceAlias: undefined });
      return;
    }
    const alias = findAliasByName(serviceAliases, name);
    if (!alias) return;
    onChange({
      ...property,
      serviceAlias: name,
      groupId: alias.groupId,
      subtypeId: alias.subtypeId,
      manualFee: undefined,
      referenceGroupId: undefined,
      referenceSubtypeId: undefined,
      referenceArea: undefined,
    });
  }

  const usingAlias = serviceAliases.length > 0 && !!property.serviceAlias;

  // Referans grup seçimi (9. ve 11. grup için) — kendi grubu hariç, alan bazlı gerçek gruplar
  const referenceGroups = tariff.groups.filter((g) => !g.isPercentOfBaseGroupFee && !g.isMultiplierOfBaseGroupFee);
  const referenceGroup = property.referenceGroupId ? findGroup(tariff, property.referenceGroupId) : undefined;
  const referenceSubtype =
    property.referenceGroupId && property.referenceSubtypeId
      ? findSubtype(tariff, property.referenceGroupId, property.referenceSubtypeId)
      : undefined;
  const refNeedsArea =
    referenceSubtype &&
    !referenceSubtype.manualFeeRequired &&
    !(referenceSubtype.brackets?.length === 1 && referenceSubtype.brackets[0].min === null);

  return (
    <div className="property-card">
      <div className="property-card__header">
        <span className="property-card__badge">{index + 1}</span>
        {canRemove && (
          <button className="remove-btn" onClick={onRemove} type="button">
            <TrashIcon width={16} height={16} /> Kaldır
          </button>
        )}
      </div>

      {serviceAliases.length > 0 && (
        <div className="field">
          <label className="field__label">Ne değerleniyor?</label>
          <select className="select" value={usingAlias ? property.serviceAlias : '__spk'} onChange={(e) => handleAliasChange(e.target.value)}>
            {serviceAliases.map((a) => (
              <option key={a.name} value={a.name}>{a.name}</option>
            ))}
            <option value="__spk">Diğer — SPK grubuyla seç…</option>
          </select>
        </div>
      )}

      {!usingAlias && (
        <div className="field">
          <label className="field__label">Taşınmaz Grubu</label>
          <select className="select" value={property.groupId} onChange={(e) => handleGroupChange(e.target.value)}>
            {tariff.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code}. Grup — {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="property-row-split" style={{ gridTemplateColumns: needsArea ? '1fr 92px' : '1fr' }}>
        {group && !usingAlias && (
          <div className="field">
            <label className="field__label">Tür</label>
            <select className="select" value={property.subtypeId} onChange={(e) => handleSubtypeChange(e.target.value)}>
              {group.subtypes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {needsArea && (
          <div className="field">
            <label className="field__label">m²</label>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="145"
              value={property.area ?? ''}
              onChange={(e) => onChange({ ...property, area: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          </div>
        )}
      </div>

      {hasFixedFee && (
        <p className="field__hint">
          Bu tür için tarifede sabit ücret tanımlıdır: <strong>{subtype?.brackets?.[0].fee.toLocaleString('tr-TR')} TL</strong>
        </p>
      )}

      {isManual && (
        <>
          <div className="warning-banner">
            <AlertIcon width={18} height={18} />
            <span>{subtype?.warningMessage ?? 'Bu tür için tarifede ücret belirlenmemiştir. Lütfen manuel giriniz.'}</span>
          </div>
          <div className="field">
            <label className="field__label">Ücret (manuel, TL)</label>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="Örn: 50000"
              value={property.manualFee ?? ''}
              onChange={(e) => onChange({ ...property, manualFee: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          </div>
        </>
      )}

      {isReferenceType && (
        <>
          <p className="field__hint" style={{ marginBottom: 8 }}>
            {group?.id === 'G9'
              ? 'Yeniden değerleme, esas alınacak taşınmazın grubuna/türüne göre hesaplanır.'
              : 'Değer artış payı, taşınmazın esas girdiği gruba/türe göre hesaplanır.'}
          </p>
          <div className="field">
            <label className="field__label">Esas Alınacak Grup</label>
            <select
              className="select"
              value={property.referenceGroupId ?? ''}
              onChange={(e) =>
                onChange({
                  ...property,
                  referenceGroupId: e.target.value,
                  referenceSubtypeId: findGroup(tariff, e.target.value)?.subtypes[0]?.id,
                  referenceArea: undefined,
                })
              }
            >
              <option value="" disabled>
                Seçiniz
              </option>
              {referenceGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code}. Grup — {g.name}
                </option>
              ))}
            </select>
          </div>

          {referenceGroup && (
            <div className="field">
              <label className="field__label">Esas Alınacak Tür</label>
              <select
                className="select"
                value={property.referenceSubtypeId ?? ''}
                onChange={(e) => onChange({ ...property, referenceSubtypeId: e.target.value, referenceArea: undefined })}
              >
                {referenceGroup.subtypes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {refNeedsArea && (
            <div className="field">
              <label className="field__label">Esas Taşınmazın Brüt Alanı (m²)</label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min={0}
                value={property.referenceArea ?? ''}
                onChange={(e) => onChange({ ...property, referenceArea: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </div>
          )}
        </>
      )}

      {showBulkOption === 'neighborhood' && (
        <label className="checkbox-row" style={{ cursor: 'pointer' }}>
          <span className="checkbox-row__label">Aynı mahalle/köy sınırlarında</span>
          <input
            type="checkbox"
            checked={!!property.sameNeighborhood}
            onChange={(e) => onChange({ ...property, sameNeighborhood: e.target.checked })}
          />
        </label>
      )}
      {showBulkOption === 'parcel' && (
        <label className="checkbox-row" style={{ cursor: 'pointer' }}>
          <span className="checkbox-row__label">Aynı parsel, aynı tarih/rapor</span>
          <input
            type="checkbox"
            checked={!!property.sameParcel}
            onChange={(e) => onChange({ ...property, sameParcel: e.target.checked })}
          />
        </label>
      )}

      <Accordion title="Ek Bilgiler (İsteğe Bağlı)">
        <div className="property-row-split" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="field">
            <label className="field__label">Mahalle</label>
            <input className="input" value={property.mahalle ?? ''} onChange={(e) => onChange({ ...property, mahalle: e.target.value })} />
          </div>
          <div className="field">
            <label className="field__label">Ada</label>
            <input className="input" value={property.ada ?? ''} onChange={(e) => onChange({ ...property, ada: e.target.value })} />
          </div>
        </div>
        <div className="property-row-split" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="field">
            <label className="field__label">Parsel</label>
            <input className="input" value={property.parsel ?? ''} onChange={(e) => onChange({ ...property, parsel: e.target.value })} />
          </div>
          <div className="field">
            <label className="field__label">Pafta</label>
            <input className="input" value={property.pafta ?? ''} onChange={(e) => onChange({ ...property, pafta: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label className="field__label">Bağımsız Bölüm</label>
          <input className="input" value={property.bagimsizBolum ?? ''} onChange={(e) => onChange({ ...property, bagimsizBolum: e.target.value })} />
        </div>
        <div className="field">
          <label className="field__label">Açık Adres</label>
          <input className="input" value={property.acikAdres ?? ''} onChange={(e) => onChange({ ...property, acikAdres: e.target.value })} />
        </div>
        <p className="field__hint">Bu bilgiler yalnızca doldurulursa Teklif Yazısı/PDF içinde gösterilir. İl/İlçe ayrıca yazılmaz.</p>
      </Accordion>
    </div>
  );
}
