import { useMemo, useState } from 'react';
import { useTariff } from '../context/TariffContext';
import type { Tariff } from '../types/tariff';
import type { TariffsIndex } from '../types/dataIndex';
import type { LocationDatabase } from '../types/location';
import { formatTL } from '../utils/format';
import { downloadBlob } from '../utils/share';
import { AlertIcon, DownloadIcon } from '../components/icons';

/**
 * VERİ YÖNETİMİ (Yönetici Sihirbazı)
 *
 * Amaç: Her yıl SPK tarifesini ve belediye harçlarını TEK ekrandan güncellemek.
 *
 * Çalışma modeli (backend'siz merkezi dağıtım): Bu ekran cihaz veritabanına YAZMAZ.
 * Yeni yılın veri dosyalarını üretir ve indirir; yönetici bu dosyaları repoya
 * (public/data/) yükler. Service worker sayesinde tüm cihazlar bir sonraki açılışta
 * yeni tarifeye otomatik geçer. Böylece "kullanıcı cihazında ezilen resmi veri"
 * sorunu kökten ortadan kalkar ve yapı 2027, 2028... için kod değişikliği
 * gerektirmeden sürdürülebilir.
 *
 * Hesaplama motoru bu ekrandan tamamen bağımsızdır; motor yalnızca kendisine verilen
 * tarife JSON'unu uygular.
 */

/** Yüzde artışla yeni yıl tarifesi üretir. Tutarlar tam TL'ye, ulaşım 2 haneye yuvarlanır. */
function generateNextYearTariff(current: Tariff, targetYear: number, increasePercent: number): Tariff {
  const k = 1 + increasePercent / 100;
  const money = (v: number) => Math.round(v * k);
  const money2 = (v: number) => Math.round(v * k * 100) / 100;

  const next: Tariff = JSON.parse(JSON.stringify(current));
  next.tariffId = `tariff-${targetYear}`;
  next.tariffYear = targetYear;
  next.source = `GÜNCELLENECEK — ${targetYear} yılı Resmî Gazete bilgisi`;
  next.effectiveDate = `${targetYear}-01-01`;

  next.standardFees.titleDeedFeePerDeed.amount = money(next.standardFees.titleDeedFeePerDeed.amount);
  next.standardFees.infoCenterFeePerReport.amount = money(next.standardFees.infoCenterFeePerReport.amount);
  next.standardFees.unionFeePerReport.amount = money(next.standardFees.unionFeePerReport.amount);
  next.standardFees.transportFeePerReport.amount = money2(next.standardFees.transportFeePerReport.amount);

  for (const g of next.groups) {
    for (const st of g.subtypes) {
      if (st.brackets) for (const b of st.brackets) b.fee = money(b.fee);
    }
    const flat = g.bulkValuation?.propertyCountFlatFeeThreshold;
    if (flat && typeof flat.flatFee === 'number') flat.flatFee = money(flat.flatFee);
  }
  return next;
}

/** Üretilen tarifede temel tutarlılık denetimleri; sorun listesi döner (boş = temiz). */
function validateTariff(t: Tariff, base: Tariff): string[] {
  const issues: string[] = [];
  if (t.groups.length !== base.groups.length) issues.push('Grup sayısı kaynaktan farklı.');
  for (const g of t.groups) {
    for (const st of g.subtypes) {
      if (!st.brackets) continue;
      for (let i = 0; i < st.brackets.length; i++) {
        const b = st.brackets[i];
        if (b.fee <= 0) issues.push(`${st.id}: ${i + 1}. dilim ücreti geçersiz (${b.fee}).`);
        if (b.min !== null && b.max !== null && b.min > b.max) issues.push(`${st.id}: ${i + 1}. dilim aralığı hatalı (min > max).`);
        const prev = st.brackets[i - 1];
        if (prev && prev.max !== null && b.min !== null && b.min !== prev.max + 1) issues.push(`${st.id}: ${i + 1}. dilim önceki dilimle bitişik değil.`);
      }
    }
  }
  return issues;
}

function downloadJson(obj: unknown, fileName: string) {
  downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), fileName);
}

export function DataManagementPage() {
  const { tariff, dataIndex } = useTariff();

  const [targetYear, setTargetYear] = useState<number>((tariff?.tariffYear ?? new Date().getFullYear()) + 1);
  const [increasePercent, setIncreasePercent] = useState<number>(0);
  const [generated, setGenerated] = useState<Tariff | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [locationJson, setLocationJson] = useState<LocationDatabase | null>(null);
  const [locationFileError, setLocationFileError] = useState<string | null>(null);

  const activeEntry = dataIndex.years.find((y) => y.year === dataIndex.activeYear);

  const preview = useMemo(() => {
    if (!generated) return null;
    const g2 = generated.groups.find((g) => g.id === 'G2');
    return {
      titleDeed: generated.standardFees.titleDeedFeePerDeed.amount,
      transport: generated.standardFees.transportFeePerReport.amount,
      g2FirstBracket: g2?.subtypes[0]?.brackets?.[0]?.fee,
    };
  }, [generated]);

  function handleGenerate() {
    if (!tariff) return;
    const next = generateNextYearTariff(tariff, targetYear, increasePercent);
    setGenerated(next);
    setIssues(validateTariff(next, tariff));
  }

  async function handleLocationFile(file: File | null) {
    setLocationFileError(null);
    setLocationJson(null);
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as LocationDatabase;
      if (!Array.isArray(parsed.provinces) || parsed.provinces.length < 81) {
        throw new Error('provinces alanı eksik veya il sayısı 81 altında');
      }
      setLocationJson(parsed);
    } catch (e) {
      setLocationFileError(`Dosya doğrulanamadı: ${e instanceof Error ? e.message : 'geçersiz JSON'}`);
    }
  }

  function handleExport() {
    if (!generated) return;
    const tariffFile = `tariff-${targetYear}.json`;
    const locationFile = locationJson ? `il-ilce-${targetYear}.json` : (activeEntry?.locationFile ?? 'il-ilce-database.json');

    const newIndex: TariffsIndex = {
      schemaVersion: dataIndex.schemaVersion,
      activeYear: targetYear,
      years: [
        ...dataIndex.years.filter((y) => y.year !== targetYear),
        { year: targetYear, tariffFile, locationFile, note: `${targetYear} SPK Gayrimenkul Değerleme Asgari Ücret Tarifesi` },
      ].sort((a, b) => a.year - b.year),
    };

    downloadJson(generated, tariffFile);
    downloadJson(newIndex, 'tariffs-index.json');
    if (locationJson) downloadJson(locationJson, locationFile);
  }

  if (!tariff) return <p>Tarife verisi yükleniyor…</p>;

  return (
    <div>
      <div className="page__header">
        <span className="page__eyebrow">Yönetici</span>
        <h1 className="page__title">Veri Yönetimi</h1>
        <p className="page__desc">
          Yıllık SPK tarifesi ve belediye harçları buradan güncellenir. Üretilen dosyalar repoya
          (public/data/) yüklendiğinde tüm cihazlar otomatik olarak yeni tarifeye geçer.
        </p>
      </div>

      <div className="card">
        <div className="section-title">Aktif Veri</div>
        <div className="result-row"><span className="result-row__label">Aktif Yıl</span><span className="result-row__value">{dataIndex.activeYear}</span></div>
        <div className="result-row"><span className="result-row__label">Tarife Dosyası</span><span className="result-row__value">{activeEntry?.tariffFile ?? '—'}</span></div>
        <div className="result-row"><span className="result-row__label">İl/İlçe Dosyası</span><span className="result-row__value">{activeEntry?.locationFile ?? '—'}</span></div>
        <div className="result-row"><span className="result-row__label">Kaynak</span><span className="result-row__value" style={{ fontSize: 12 }}>{tariff.source}</span></div>
      </div>

      <div className="card">
        <div className="section-title">Yeni Yıl Tarifesi Üret</div>
        <div className="field">
          <label className="field__label">Hedef Yıl</label>
          <input className="input" type="number" min={tariff.tariffYear + 1} value={targetYear} onChange={(e) => setTargetYear(Number(e.target.value))} />
        </div>
        <div className="field">
          <label className="field__label">Genel Artış Oranı (%)</label>
          <input className="input" type="number" step="0.01" value={increasePercent} onChange={(e) => setIncreasePercent(Number(e.target.value))} />
          <span className="field__hint">
            Tüm dilim ücretleri, sabit ücretler ve toplu değerleme tavanı bu oranla artırılıp tam
            TL'ye yuvarlanır (ulaşım bedeli 2 hane). Resmî Gazete değerleri birebir farklıysa,
            indirilen JSON'da ilgili kalemleri elle düzeltebilirsiniz.
          </span>
        </div>
        <button type="button" className="btn btn--primary btn--block" onClick={handleGenerate}>
          Taslağı Oluştur ve Doğrula
        </button>

        {generated && preview && (
          <div style={{ marginTop: 14 }}>
            {issues.length === 0 ? (
              <p className="field__hint" style={{ color: 'var(--color-success)', fontWeight: 650 }}>
                ✓ Doğrulama temiz: {generated.groups.length} grup, dilim yapıları tutarlı.
              </p>
            ) : (
              <div className="warning-banner">
                <AlertIcon width={18} height={18} />
                <span>{issues.length} sorun bulundu: {issues.slice(0, 3).join(' • ')}{issues.length > 3 ? ' …' : ''}</span>
              </div>
            )}
            <div className="result-row"><span className="result-row__label">Tapu Ücreti (yeni)</span><span className="result-row__value">{formatTL(preview.titleDeed)}</span></div>
            <div className="result-row"><span className="result-row__label">Ulaşım Bedeli (yeni)</span><span className="result-row__value">{formatTL(preview.transport)}</span></div>
            {preview.g2FirstBracket && (
              <div className="result-row"><span className="result-row__label">Konut 1. Dilim (yeni)</span><span className="result-row__value">{formatTL(preview.g2FirstBracket)}</span></div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">Belediye Harçları (isteğe bağlı)</div>
        <p className="field__hint" style={{ marginBottom: 10 }}>
          Yeni yılın il/ilçe belediye harçları JSON dosyasını buraya yükleyin; doğrulanır ve
          dışa aktarım paketine {`il-ilce-${targetYear}.json`} olarak eklenir. Yüklemezseniz
          mevcut dosya kullanılmaya devam eder. (Excel'den JSON üretimi için
          scripts/convert-il-ilce-excel-to-json.mjs betiği kullanılabilir.)
        </p>
        <input className="input" type="file" accept="application/json,.json" onChange={(e) => handleLocationFile(e.target.files?.[0] ?? null)} />
        {locationJson && (
          <p className="field__hint" style={{ color: 'var(--color-success)', marginTop: 8 }}>
            ✓ Doğrulandı: {locationJson.provinceCount ?? locationJson.provinces.length} il, {locationJson.districtCount ?? '—'} ilçe.
          </p>
        )}
        {locationFileError && (
          <div className="warning-banner" style={{ marginTop: 8 }}><AlertIcon width={18} height={18} /><span>{locationFileError}</span></div>
        )}
      </div>

      <div className="card">
        <div className="section-title">Dışa Aktar ve Yayınla</div>
        <p className="field__hint" style={{ marginBottom: 10 }}>
          İndirilen dosyaları repoda <strong>public/data/</strong> klasörüne yükleyin
          (tariffs-index.json mevcutun üzerine yazılır). Yayın sonrası tüm cihazlar ilk
          açılışta {targetYear} tarifesine geçer; eski yıl dosyaları geçmiş kayıtlar için korunur.
        </p>
        <button type="button" className="btn btn--gold btn--block" onClick={handleExport} disabled={!generated || issues.length > 0}>
          <DownloadIcon width={18} height={18} /> Yayın Dosyalarını İndir
        </button>
      </div>
    </div>
  );
}
