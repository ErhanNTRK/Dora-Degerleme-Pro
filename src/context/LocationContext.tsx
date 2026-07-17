import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { LocationDatabase } from '../types/location';

interface LocationContextValue {
  locationDb: LocationDatabase | null;
  loading: boolean;
  error: string | null;
}

const LocationContext = createContext<LocationContextValue>({ locationDb: null, loading: true, error: null });

const LOCATION_CACHE_KEY = 'dora-location-cache-v1';

export function LocationProvider({ children }: { children: ReactNode }) {
  const [locationDb, setLocationDb] = useState<LocationDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/il-ilce-database.json`);
        if (!res.ok) throw new Error('İl/İlçe veri dosyası okunamadı');
        const data: LocationDatabase = await res.json();
        if (!cancelled) {
          setLocationDb(data);
          localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(data));
        }
      } catch {
        const cached = localStorage.getItem(LOCATION_CACHE_KEY);
        if (cached && !cancelled) {
          setLocationDb(JSON.parse(cached));
        } else if (!cancelled) {
          setError('İl/İlçe veritabanı yüklenemedi.');
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

  return <LocationContext.Provider value={{ locationDb, loading, error }}>{children}</LocationContext.Provider>;
}

export function useLocationDb() {
  return useContext(LocationContext);
}
