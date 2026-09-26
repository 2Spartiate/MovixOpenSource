// TV-only playback policy for the embedded HLS player.
// Keeps profile/selection logic outside HLSPlayer so UI code stays declarative.

export type TvPlaybackProfile = 'vo-fr' | 'vf';
export type TvPlaybackProvider = 'nexus' | 'bravo';

export interface TvPlaybackCandidate {
  provider: TvPlaybackProvider;
  url: string;
  label: string;
  index: number;
  maxHeight: number | null;
  audioLanguages: string[];
  subtitleLanguages: string[];
  burnedFrenchSubtitles: boolean;
  likelyMulti: boolean;
}

export interface TvPlaybackResolution {
  profile: TvPlaybackProfile;
  candidate: TvPlaybackCandidate | null;
  reason: 'selected' | 'no-compatible-source';
}

export const TV_PLAYBACK_PROFILE_KEY = 'movix.tv.playback.profile.v1';

export function readTvPlaybackProfile(): TvPlaybackProfile {
  try {
    const saved = localStorage.getItem(TV_PLAYBACK_PROFILE_KEY);
    return saved === 'vf' ? 'vf' : 'vo-fr';
  } catch {
    return 'vo-fr';
  }
}

export function writeTvPlaybackProfile(profile: TvPlaybackProfile): void {
  try {
    localStorage.setItem(TV_PLAYBACK_PROFILE_KEY, profile);
  } catch {
    // Storage can be unavailable in private mode; keep the in-memory state.
  }
}

export function normalizeMediaLanguage(value: string | null | undefined): string {
  const lower = String(value || '').trim().toLowerCase().replace('_', '-');
  if (!lower) return '';
  return lower.split('-')[0];
}

export function isFrenchLanguage(value: string | null | undefined): boolean {
  const lang = normalizeMediaLanguage(value);
  if (lang === 'fr' || lang === 'fre' || lang === 'fra') return true;
  const text = String(value || '').toLowerCase();
  return /\bfrench\b|\bfrançais\b|\bfrancais\b|\bvff?\b|\bvfq\b/.test(text);
}

export function languageMatchesOriginal(
  value: string | null | undefined,
  originalLanguage: string | null | undefined,
): boolean {
  const candidate = normalizeMediaLanguage(value);
  const original = normalizeMediaLanguage(originalLanguage);
  if (!candidate || !original) return false;
  if (candidate === original) return true;
  const aliases: Record<string, string[]> = {
    en: ['eng'],
    ja: ['jpn', 'jp'],
    ko: ['kor', 'kr'],
    fr: ['fra', 'fre'],
    es: ['spa'],
    de: ['deu', 'ger'],
    it: ['ita'],
    pt: ['por'],
    zh: ['zho', 'chi'],
  };
  return aliases[original]?.includes(candidate) ?? false;
}

function qualityScore(height: number | null): number {
  return Number.isFinite(height) && (height ?? 0) > 0 ? Number(height) : 0;
}

function candidateScore(
  candidate: TvPlaybackCandidate,
  profile: TvPlaybackProfile,
  originalLanguage?: string | null,
): number | null {
  const height = qualityScore(candidate.maxHeight);

  if (profile === 'vf') {
    if (candidate.provider !== 'bravo') return null;
    const hasFrenchAudio = candidate.audioLanguages.some(isFrenchLanguage);
    if (!hasFrenchAudio && !candidate.likelyMulti) return null;
    return height * 100 + 10;
  }

  if (candidate.provider === 'nexus') {
    if (!candidate.burnedFrenchSubtitles) return null;
    return height * 100;
  }

  const hasOriginalAudio = candidate.audioLanguages.some(language =>
    languageMatchesOriginal(language, originalLanguage),
  );
  const hasNonFrenchAudio = candidate.audioLanguages.some(language =>
    language && !isFrenchLanguage(language),
  );
  const hasFrenchSubtitles = candidate.subtitleLanguages.some(isFrenchLanguage);

  // MULTI labels are useful when the manifest omits rendition metadata until
  // playback starts. If tracks are exposed, require a coherent VO + FR combo.
  const audioCompatible =
    hasOriginalAudio ||
    (!normalizeMediaLanguage(originalLanguage) && hasNonFrenchAudio) ||
    (candidate.likelyMulti && candidate.audioLanguages.length === 0);
  const subtitleCompatible =
    hasFrenchSubtitles ||
    (candidate.likelyMulti && candidate.subtitleLanguages.length === 0);

  if (!audioCompatible || !subtitleCompatible) return null;

  // Quality dominates. Bravo wins exact ties because switching audio/subtitles
  // is much more flexible than burned-in captions.
  return height * 100 + 10;
}

export function chooseTvPlaybackCandidate(
  candidates: TvPlaybackCandidate[],
  profile: TvPlaybackProfile,
  originalLanguage?: string | null,
): TvPlaybackResolution {
  const ranked = candidates
    .map(candidate => ({
      candidate,
      score: candidateScore(candidate, profile, originalLanguage),
    }))
    .filter((entry): entry is { candidate: TvPlaybackCandidate; score: number } =>
      entry.score !== null,
    )
    .sort((a, b) => b.score - a.score);

  return {
    profile,
    candidate: ranked[0]?.candidate ?? null,
    reason: ranked.length > 0 ? 'selected' : 'no-compatible-source',
  };
}

export function looksLikeNexusVostfr(source: {
  label?: string;
  isVostfr?: boolean;
}): boolean {
  if (source.isVostfr === true) return true;
  const label = String(source.label || '').toLowerCase();
  return /vostfr|vo\s*\+\s*fr|sub(?:title|s)?\s*fr|french\s*sub/.test(label);
}

export function looksLikeBravoMulti(label: string | undefined): boolean {
  return /\bmulti\b|multi[-_ ]?audio|vo\s*\/\s*vf/i.test(String(label || ''));
}
