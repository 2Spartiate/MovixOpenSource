/**
 * Shared certification utilities for TMDB age classifications.
 * Used by MovieDetails, TVDetails, and profile age restriction checks.
 */

export const allAgesCerts = new Set([
  'TP', 'TP+', 'G', 'PG', 'TV-Y', 'TV-G', 'TV-PG', 'U', '0', 'T', 'ALL', 'L', 'AA', 'A', 'ATP'
]);

export const ageMap: Record<string, number> = {
  '6': 6, '6+': 6,
  '7': 7, 'TV-Y7': 7,
  '10': 10,
  '12': 12, '12A': 12, 'PG12': 12, 'IIB': 12,
  'PG-13': 13, 'R13': 13, 'R-13': 13, '+13': 13,
  '14': 14, '14A': 14, '14+': 14, 'TV-14': 14,
  '15': 15, 'MA 15+': 15, 'M': 15, 'R15+': 15, 'K15': 15, 'B': 15, 'B-15': 15,
  '16': 16, '+16': 16, 'NC16': 16, 'K-16': 16, 'N-16': 16, '16+': 16,
  'R': 17, 'TV-MA': 17, 'NC-17': 17,
  '18': 18, '18+': 18, '18A': 18, 'R18+': 18, 'M18': 18, 'III': 18, 'R-18': 18, '18SG': 18, 'N-18': 18, 'C': 18, 'D': 18,
  '19': 19, '21+': 21,
};

/** A missing or unrecognised classification is unknown, never all ages. */
export const parseCertificationAge = (certification: unknown): number | null => {
  if (typeof certification !== 'string') return null;
  const normalized = certification.trim().toUpperCase();
  if (allAgesCerts.has(normalized)) return 0;
  return ageMap[normalized] ?? null;
};

/** Prefer a recognised French rating, then a recognised US rating, then other regions. */
export function getPreferredRegionalAge<T extends { iso_3166_1?: string }>(
  regions: readonly T[],
  certifications: (region: T) => readonly unknown[],
): number | null {
  const ordered = [
    ...['FR', 'US'].flatMap(code => regions.filter(region => region.iso_3166_1 === code)),
    ...regions.filter(region => region.iso_3166_1 !== 'FR' && region.iso_3166_1 !== 'US'),
  ];
  for (const region of ordered) {
    for (const certification of certifications(region)) {
      const age = parseCertificationAge(certification);
      if (age !== null) return age;
    }
  }
  return null;
}

export const getClassificationLabel = (certification: string, t: (key: string, options?: Record<string, unknown>) => string): string => {
  if (allAgesCerts.has(certification)) {
    return t('details.allAges');
  }
  if (certification in ageMap) {
    return t('details.ageAndAbove', { age: ageMap[certification] });
  }
  return certification;
};

/** Legacy display helper. Decisions must use parseCertificationAge, which preserves unknown. */
export const getNumericAge = (certification: string): number => {
  return parseCertificationAge(certification) ?? 0;
};

/**
 * Check if content is allowed for a profile's age restriction.
 * @param contentCert - TMDB certification string (e.g. "PG-13", "R", "18+")
 * @param profileAgeRestriction - Profile age restriction (0 = no restriction, 7, 12, 16, 18)
 * @returns true if content is allowed
 */
export const isContentAllowed = (contentCert: string, profileAgeRestriction: number): boolean => {
  if (!profileAgeRestriction || profileAgeRestriction === 0) return true;
  const normalizedCert = contentCert?.trim().toUpperCase();
  // A missing/unrecognised classification must not expose a title to a minor
  // profile while the app cannot establish that it is suitable. Adults (18+)
  // retain access to these unrated titles.
  const contentAge = parseCertificationAge(normalizedCert);
  if (contentAge === null) {
    return profileAgeRestriction >= 18;
  }
  return contentAge <= profileAgeRestriction;
};
