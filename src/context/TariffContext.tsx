import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Tariff } from '../types/tariff';

interface TariffContextValue {
  tariff: Tariff | null;
  loading: boolean;
  error: string | null;
}

const TariffContext = createContext<TariffContextValue>({ tariff: null, loading: true, error: null });

const TARIFF_CACHE_KEY = 'dora-tariff-cache-v1';

export function TariffProvider({ children }: { children: ReactNode }) {
  const [tariff, setTariff] = useState<Tariff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Önce ağdan güncel tarifeyi çekmeyi dene (service worker offline'da cache'den karşılar)
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/tariff-2026.json`);
        if (!res.ok) throw new Error('Tarife dosyası okunamadı');
        const data: Tariff = await res.json();
        if (!cancelled) {
          setTariff(data);
          localStorage.setItem(TARIFF_CACHE_KEY, JSON.stringify(data));
        }
      } catch (e) {
        // Ağ/dosya erişimi başarısızsa, daha önce tarayıcıda saklanmış son sürümü kullan
        const cached = localStorage.getItem(TARIFF_CACHE_KEY);
        if (cached && !cancelled) {
          setTariff(JSON.parse(cached));
        } else if (!cancelled) {
          setError('Tarife verisi yüklenemedi. Lütfen internet bağlantınızı kontrol edip uygulamayı yeniden açın.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return <TariffContext.Provider value={{ tariff, loading, error }}>{children}</TariffContext.Provider>;
}

export function useTariff() {
  return useContext(TariffContext);
}
