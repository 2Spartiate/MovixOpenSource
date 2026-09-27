import type { ParentalPreferences } from './parentalControls.ts';

export type ParentalMediaType = 'movie' | 'tv';
export interface ParentalMediaMetadata {
  mediaType: ParentalMediaType;
  id: number;
  age: number | null;
  genres: Array<{ id: number; name: string }> | null;
  keywords: Array<{ id: number; name: string }> | null;
  title?: string;
  backdropPath?: string | null;
}
export type ParentalLockReason = 'age' | 'horror' | 'unknown' | null;
export type MediaAccessDecision = { kind: 'allowed' } | { kind: 'profile' } | { kind: 'parental'; reason: Exclude<ParentalLockReason, null> };

export function isHorrorMedia(media: ParentalMediaMetadata): boolean {
  // TMDB movie genre 27 is Horror. TV genre 10765 is Science Fiction & Fantasy.
  if (media.mediaType === 'movie' && media.genres?.some(genre => genre.id === 27)) return true;
  if (media.genres?.some(genre => /^(horror|horreur)$/i.test(genre.name.trim()))) return true;
  return media.keywords?.some(keyword => /\b(horror|horreur)\b/i.test(keyword.name)) === true;
}

export function getParentalLockReason(preferences: ParentalPreferences, media: ParentalMediaMetadata): ParentalLockReason {
  if (!preferences.enabled) return null;
  if (media.age === null) return 'unknown'; // A missing/failed TMDB rating requires the PIN.
  if (media.age > preferences.maximumAge) return 'age';
  if (preferences.lockHorror && (media.genres === null || media.keywords === null)) return 'unknown';
  if (preferences.lockHorror && isHorrorMedia(media)) return 'horror';
  return null;
}

export function decideMediaAccess(preferences: ParentalPreferences, media: ParentalMediaMetadata, profileAge: number): MediaAccessDecision {
  if (profileAge > 0 && (media.age === null ? profileAge < 18 : media.age > profileAge)) return { kind: 'profile' };
  const reason = getParentalLockReason(preferences, media);
  return reason ? { kind: 'parental', reason } : { kind: 'allowed' };
}
