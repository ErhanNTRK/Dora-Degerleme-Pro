import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Tariff } from '../types/tariff';
import { DEFAULT_TARIFFS_INDEX, type TariffsIndex } from '../types/dataIndex';

interface TariffContextValue {
  tariff: Tariff | null;
  /** Merkezi veri indeksi; LocationContext il/ilçe dosya adını buradan alır. */
  dataIndex: TariffsIndex;
  loading: boolean;
  error: string | null;
}

const TariffContext = createContext<TariffContextValue>({ tariff: null, dataIndex: DEFAULT_TARIFFS_INDEX, loading: true, error: null });

const TARIFF_CACHE_KEY = 'dora-tariff-cache-v1';
const INDEX_CACHE_KEY = 'dora-tariffs-index-cache-v1';

/** Ağ → localStorage cache → varsayılan sırasıyla JSON yükleyen ortak yardımcı. */
async function fetchJsonWithCache<T>(url: string, cacheKey: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('okunamadı');
    const data: T = await res.json();
    localStorage.setItem(cacheKey, JSON.stringify(data));
    return data;
  } catch {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        localStorage.removeItem(cacheKey);
      }
    }
    return null;
  }
}

export function TariffProvider({ children }: { children: ReactNode }) {
  const [tariff, setTariff] = useState<Tariff | null>(null);
  const [dataIndex, setDataIndex] = useState<TariffsIndex>(DEFAULT_TARIFFS_INDEX);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // 1) Merkezi indeks: aktif yıl ve dosya adları. Okunamazsa cache, o da yoksa
      //    güvenli varsayılan (ilk yayın verisi) — eski dağıtımlarla geriye dönük uyumlu.
      const index =
        (await fetchJsonWithCache<TariffsIndex>(`${import.meta.env.BASE_URL}data/tariffs-index.json`, INDEX_CACHE_KEY)) ??
        DEFAULT_TARIFFS_INDEX;
      const active = index.years.find((y) => y.year === index.activeYear) ?? index.years[index.years.length - 1] ?? DEFAULT_TARIFFS_INDEX.years[0];
      if (!cancelled) setDataIndex(index);

      // 2) Aktif yılın tarifesi (service worker offline'da cache'den karşılar).
      const data = await fetchJsonWithCache<Tariff>(
        `${import.meta.env.BASE_URL}data/${active.tariffFile}`,
        `${TARIFF_CACHE_KEY}:${active.tariffFile}`
      );
      if (cancelled) return;
      if (data) {
        setTariff(data);
      } else {
        setError('Tarife verisi yüklenemedi. Lütfen internet bağlantınızı kontrol edip uygulamayı yeniden açın.');
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return <TariffContext.Provider value={{ tariff, dataIndex, loading, error }}>{children}</TariffContext.Provider>;
}

export function useTariff() {
  return useContext(TariffContext);
}
