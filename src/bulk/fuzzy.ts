/**
 * FUZZY EŞLEME — Türkçe'ye duyarlı ad eşleştirme (saf, React'siz).
 *
 * Müşteri Excel'lerinde il/ilçe/mahalle adları yazım hatalı gelir:
 * "Kadikoy", "Kadıköyy", "Besiktas", "istanbul", "Beykoz " (sonda boşluk),
 * "ALAÇATI M" (kısaltma). Bu modül adları TR-katlayıp (ş→s, ı→i, ç→c, ğ→g,
 * ö→o, ü→u) Levenshtein mesafesiyle resmi listeye bağlar.
 *
 * İlke: eşik aşılırsa veya iki aday başa baş kalırsa DAYATMA YOK — null döner,
 * arayüz kullanıcıya sorar.
 */

/** Türkçe katlama: küçük harfe indir, aksan/nokta farklarını düzleştir, kırp. */
export function trFold(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/\u0307/g, '')
    .replace(/[şŞ]/g, 's').replace(/[ıİI]/g, 'i').replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g').replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Klasik Levenshtein (iteratif, O(mn)); kısa idari adlar için yeterli. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

export interface FuzzyMatch {
  /** Resmi ad (listedeki haliyle) */
  name: string;
  distance: number;
  /** true → birebir (katlama sonrası) eşleşme */
  exact: boolean;
}

/**
 * Adayı resmi listeye bağlar.
 * - Katlanmış tam eşleşme → exact.
 * - "ALAÇATI M" gibi kuyruklu yazımlar için önek eşleşmesi de denenir.
 * - Aksi halde mesafe ≤ maxDist olan TEK aday varsa döner; iki aday aynı
 *   mesafedeyse belirsizlik vardır → null.
 */
export function fuzzyMatch(raw: string, candidates: string[], maxDist = 2): FuzzyMatch | null {
  const q = trFold(raw);
  if (!q) return null;

  let best: FuzzyMatch | null = null;
  let tie = false;

  for (const c of candidates) {
    const f = trFold(c);
    if (f === q) return { name: c, distance: 0, exact: true };
    // Önek toleransı: "alacati m" ↔ "alacati" (kuyruk ≤ 4 karakter)
    const pref = q.startsWith(f) || f.startsWith(q);
    const d = pref && Math.abs(f.length - q.length) <= 4
      ? Math.min(1, levenshtein(q, f))
      : levenshtein(q, f);
    if (d <= maxDist) {
      if (!best || d < best.distance) { best = { name: c, distance: d, exact: false }; tie = false; }
      else if (d === best.distance && c !== best.name) tie = true;
    }
  }
  if (!best || tie) return null;
  // Çok kısa adlarda 2 mesafe fazla agresif: 4 harf ve altı için en çok 1 kabul
  if (q.length <= 4 && best.distance > 1) return null;
  return best;
}
