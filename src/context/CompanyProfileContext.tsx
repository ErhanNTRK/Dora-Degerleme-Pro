import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { db } from '../db/database';
import { EMPTY_COMPANY_PROFILE, type CompanyProfile } from '../types/profile';

interface CompanyProfileContextValue {
  profile: CompanyProfile;
  updateProfile: (partial: Partial<CompanyProfile>) => Promise<void>;
  loading: boolean;
}

const CompanyProfileContext = createContext<CompanyProfileContextValue>({
  profile: EMPTY_COMPANY_PROFILE,
  updateProfile: async () => {},
  loading: true,
});

export function CompanyProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_COMPANY_PROFILE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const existing = await db.companyProfile.get('company-profile');
      if (existing && !cancelled) {
        setProfile(existing);
      } else if (!cancelled) {
        await db.companyProfile.put(EMPTY_COMPANY_PROFILE);
      }
      if (!cancelled) setLoading(false);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updateProfile(partial: Partial<CompanyProfile>) {
    const updated = { ...profile, ...partial };
    await db.companyProfile.put(updated);
    setProfile(updated);
  }

  return <CompanyProfileContext.Provider value={{ profile, updateProfile, loading }}>{children}</CompanyProfileContext.Provider>;
}

export function useCompanyProfile() {
  return useContext(CompanyProfileContext);
}
