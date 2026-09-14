import AsyncStorage from '@react-native-async-storage/async-storage';

// Memes cles et meme forme que le web (src/pages/Profile.tsx WatchItem,
// src/utils/syncStorage.ts SYNCABLE_EXACT_KEYS) — indispensable pour que
// pushSync/pullSync restent compatibles avec le site et les autres appareils.
// Champs optionnels du WatchItem web (searchText/backdrop_path/overview/
// shareCode) omis ici : pas utilises par l'UI mobile v1, mais on ne les
// efface jamais s'ils sont deja presents (cf. mergeItem).

export type LibraryMediaType = 'movie' | 'tv';

export interface WatchItem {
  id: number;
  type: LibraryMediaType;
  title: string;
  poster_path: string | null;
  addedAt: string;
  episodeInfo?: { season: number; episode: number };
  [extra: string]: unknown;
}

export interface ContinueWatchingData {
  movies: WatchItem[];
  tv: WatchItem[];
}

const FAVORITE_KEYS: Record<LibraryMediaType, string> = {
  movie: 'favorite_movie',
  tv: 'favorites_tv',
};
const WATCHLIST_KEYS: Record<LibraryMediaType, string> = {
  movie: 'watchlist_movie',
  tv: 'watchlist_tv',
};
const WATCHED_KEYS: Record<LibraryMediaType, string> = {
  movie: 'watched_movie',
  tv: 'watched_tv',
};
const CONTINUE_WATCHING_KEY = 'continueWatching';
export const LIBRARY_KEYS = [
  ...Object.values(FAVORITE_KEYS),
  ...Object.values(WATCHLIST_KEYS),
  ...Object.values(WATCHED_KEYS),
  CONTINUE_WATCHING_KEY,
  'episodeReleaseAlerts',
];

async function readArray(key: string): Promise<WatchItem[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeArray(key: string, items: WatchItem[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(items));
}

async function toggleInList(key: string, item: WatchItem): Promise<boolean> {
  const items = await readArray(key);
  const exists = items.some(i => i.id === item.id);
  const next = exists ? items.filter(i => i.id !== item.id) : [...items, item];
  await writeArray(key, next);
  return !exists;
}

export const getFavorites = (type: LibraryMediaType) => readArray(FAVORITE_KEYS[type]);
export const toggleFavorite = (type: LibraryMediaType, item: WatchItem) => toggleInList(FAVORITE_KEYS[type], item);
export const isFavorite = async (type: LibraryMediaType, id: number) =>
  (await readArray(FAVORITE_KEYS[type])).some(i => i.id === id);

export const getWatchlist = (type: LibraryMediaType) => readArray(WATCHLIST_KEYS[type]);
export const toggleWatchlist = (type: LibraryMediaType, item: WatchItem) => toggleInList(WATCHLIST_KEYS[type], item);
export const isInWatchlist = async (type: LibraryMediaType, id: number) =>
  (await readArray(WATCHLIST_KEYS[type])).some(i => i.id === id);

export const getWatched = (type: LibraryMediaType) => readArray(WATCHED_KEYS[type]);
export const toggleWatched = (type: LibraryMediaType, item: WatchItem) => toggleInList(WATCHED_KEYS[type], item);

export async function getContinueWatching(): Promise<ContinueWatchingData> {
  try {
    const raw = await AsyncStorage.getItem(CONTINUE_WATCHING_KEY);
    const parsed = raw ? JSON.parse(raw) : { movies: [], tv: [] };
    return {
      movies: Array.isArray(parsed?.movies) ? parsed.movies : [],
      tv: Array.isArray(parsed?.tv) ? parsed.tv : [],
    };
  } catch {
    return { movies: [], tv: [] };
  }
}

export interface EpisodeAlert {
  id: number;
  mediaType: LibraryMediaType;
  title: string;
  season: number;
  episode: number;
  airDate: string;
  notifyDaysBefore: number;
}

export async function getEpisodeAlerts(): Promise<EpisodeAlert[]> {
  try {
    const raw = await AsyncStorage.getItem('episodeReleaseAlerts');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
