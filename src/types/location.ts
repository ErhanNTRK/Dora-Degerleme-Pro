export interface DistrictRecord {
  code: string | null;
  name: string;
  /** Excel veri kaynağından gelen belediye harcı. null ise tarifede/veri kaynağında tanımlı değildir. */
  fee: number | null;
}

export interface ProvinceRecord {
  name: string;
  districts: DistrictRecord[];
}

export interface LocationDatabase {
  sourceNote: string;
  generatedAt: string;
  provinceCount: number;
  districtCount: number;
  provinces: ProvinceRecord[];
}
