import { useEffect, useState } from 'react';
import { db, type MunicipalityFeeRecord } from '../db/database';
import { formatTL, formatDateTime, uid } from '../utils/format';
import { PlusIcon, TrashIcon, BuildingIcon } from '../components/icons';

export function MunicipalityFeesPage() {
  const [records, setRecords] = useState<MunicipalityFeeRecord[]>([]);
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [fee, setFee] = useState<number>(0);

  async function load() {
    const all = await db.municipalityFees.toArray();
    setRecords(all.sort((a, b) => a.province.localeCompare(b.province, 'tr') || a.district.localeCompare(b.district, 'tr')));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    if (!province.trim() || !district.trim() || fee <= 0) return;
    await db.municipalityFees.put({
      id: uid(),
      province: province.trim(),
      district: district.trim(),
      fee,
      updatedAt: new Date().toISOString(),
    });
    setProvince('');
    setDistrict('');
    setFee(0);
    load();
  }

  async function handleDelete(id: string) {
    await db.municipalityFees.delete(id);
    load();
  }

  return (
    <div>
      <div className="page__header">
        <span className="page__eyebrow">Belediye Harçları</span>
        <h1 className="page__title">İl / İlçe Harç Kayıtları</h1>
        <p className="page__desc">
          Bu listede kayıtlı olmayan ilçeler için hesaplama sırasında her zaman manuel giriş yapabilirsiniz.
        </p>
      </div>

      <div className="card">
        <div className="section-title">Yeni Kayıt Ekle</div>
        <div className="field">
          <label className="field__label">İl</label>
          <input className="input" value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Örn: İstanbul" />
        </div>
        <div className="field">
          <label className="field__label">İlçe</label>
          <input className="input" value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Örn: Zeytinburnu" />
        </div>
        <div className="field">
          <label className="field__label">Belediye Harcı (TL)</label>
          <input className="input" type="number" min={0} value={fee || ''} onChange={(e) => setFee(Number(e.target.value))} />
        </div>
        <button className="btn btn--primary btn--block" onClick={handleAdd}>
          <PlusIcon width={18} height={18} /> Kaydet
        </button>
      </div>

      <div className="card">
        <div className="section-title">Kayıtlı Harçlar ({records.length})</div>
        {records.length === 0 && (
          <div className="empty-state">
            <BuildingIcon className="empty-state__icon" />
            <p>Henüz kayıtlı belediye harcı yok.</p>
          </div>
        )}
        {records.map((r) => (
          <div key={r.id} style={{ padding: '10px 0', borderBottom: '1px dashed var(--color-border)' }}>
            <div className="result-row" style={{ padding: 0, border: 'none' }}>
              <span className="result-row__label">{r.province} / {r.district}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="result-row__value">{formatTL(r.fee)}</span>
                <button className="remove-btn" onClick={() => handleDelete(r.id)}>
                  <TrashIcon width={15} height={15} />
                </button>
              </div>
            </div>
            <span className="field__hint">Son Güncelleme: {formatDateTime(r.updatedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
