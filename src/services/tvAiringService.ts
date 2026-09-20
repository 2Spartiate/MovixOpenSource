import type { TvAiringSchedule, TvExternalIds } from '@/types/tvAiring';

const API_URL = 'https://api.tvmaze.com';
const CACHE_TTL_MS = 15 * 60_000;
const FAILURE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 100;
const cache = new Map<string, { expires: number; value: TvAiringSchedule | null }>();
const pending = new Map<string, Promise<TvAiringSchedule | null>>();

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const getJson = async (path: string): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`TVmaze HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const fetchSchedule = async (lookups: Array<[string, string]>): Promise<TvAiringSchedule | null> => {
  for (const [kind, id] of lookups) {
    const show = await getJson(`/lookup/shows?${kind}=${encodeURIComponent(id)}`);
    if (show === null) continue;
    if (!record(show) || !Number.isSafeInteger(show.id) || Number(show.id) <= 0
      || !record(show.externals) || String(show.externals[kind]) !== id) return null;

    const data = await getJson(`/shows/${show.id}/episodes`);
    if (!Array.isArray(data)) return null;
    const episodes: TvAiringSchedule['episodes'] = {};
    for (const episode of data) {
      if (!record(episode) || !Number.isSafeInteger(episode.season) || Number(episode.season) < 1
        || !Number.isSafeInteger(episode.number) || Number(episode.number) < 1) continue;
      // TVmaze peut fournir un airstamp par défaut même lorsque airtime est vide.
      const hasTime = typeof episode.airtime === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(episode.airtime);
      const stamp = hasTime && typeof episode.airstamp === 'string'
        && /T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(episode.airstamp)
        && Number.isFinite(Date.parse(episode.airstamp)) ? episode.airstamp : null;
      episodes[`${episode.season}:${episode.number}`] = {
        date: typeof episode.airdate === 'string' ? episode.airdate : null,
        timestamp: stamp,
      };
    }
    return { sourceUrl: `https://www.tvmaze.com/shows/${show.id}`, episodes };
  }
  return null;
};

/** Données publiques uniquement. Une panne TVmaze laisse la fiche TMDB utilisable. */
export const getTvAiringSchedule = async (ids?: TvExternalIds): Promise<TvAiringSchedule | null> => {
  const lookups: Array<[string, string]> = [];
  if (typeof ids?.imdb_id === 'string' && /^tt\d+$/.test(ids.imdb_id)) lookups.push(['imdb', ids.imdb_id]);
  if (Number.isSafeInteger(ids?.tvdb_id) && Number(ids?.tvdb_id) > 0) lookups.push(['thetvdb', String(ids!.tvdb_id)]);
  if (!lookups.length) return null;
  const key = JSON.stringify(lookups);
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.value;
  const existing = pending.get(key);
  if (existing) return existing;

  const request = fetchSchedule(lookups).catch(() => null).then((value) => {
    cache.delete(key);
    cache.set(key, { value, expires: Date.now() + (value ? CACHE_TTL_MS : FAILURE_TTL_MS) });
    if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
    return value;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
};
