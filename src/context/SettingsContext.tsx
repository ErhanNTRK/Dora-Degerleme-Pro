import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { db, type AppSettingsRecord } from '../db/database';
import { useTariff } from './TariffContext';

interface SettingsContextValue {
  settings: AppSettingsRecord | null;
  updateSettings: (partial: Partial<AppSettingsRecord>) => Promise<void>;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: null,
  updateSettings: async () => {},
  loading: true,
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { tariff } = useTariff();
  const [settings, setSettings] = useState<AppSettingsRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tariff) return;
    let cancelled = false;

    async function init() {
      const existing = await db.settings.get('app-settings');
      if (existing) {
        if (!cancelled) setSettings(existing);
      } else if (tariff) {
        const defaults: AppSettingsRecord = {
          id: 'app-settings',
          titleDeedFeePerDeed: tariff.standardFees.titleDeedFeePerDeed.amount,
          infoCenterFeePerReport: tariff.standardFees.infoCenterFeePerReport.amount,
          unionFeePerReport: tariff.standardFees.unionFeePerReport.amount,
          transportFeePerReport: tariff.standardFees.transportFeePerReport.amount,
          vatRatePercent: tariff.vatRateDefaultPercent,
          themeMode: 'light',
        };
        await db.settings.put(defaults);
        if (!cancelled) setSettings(defaults);
      }
      if (!cancelled) setLoading(false);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [tariff]);

  async function updateSettings(partial: Partial<AppSettingsRecord>) {
    if (!settings) return;
    const updated = { ...settings, ...partial };
    await db.settings.put(updated);
    setSettings(updated);
  }

  return <SettingsContext.Provider value={{ settings, updateSettings, loading }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
