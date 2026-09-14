import { CONFIG } from '../config';

// Meme API TMDB, appelee directement depuis le client comme le fait deja le
// site web (src/context/SearchContext.tsx) : il n'existe aucun endpoint de
// catalogue (trending/discover) cote Mainapi, seulement des resolveurs de
// sources par id TMDB.

export type MediaType = 'movie' | 'tv';

export interface TmdbListItem {
  id: number;
  media_type: MediaType;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
}

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

export interface TmdbDetails extends TmdbListItem {
  genres: { id: number; name: string }[];
  runtime?: number;
  number_of_seasons?: number;
  belongs_to_collection?: { id: number; name: string; poster_path: string | null; backdrop_path: string | null } | null;
  cast: TmdbCastMember[];
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbPerson {
  id: number;
  name: string;
  biography: string;
  profile_path: string | null;
  known_for_department: string;
  birthday: string | null;
}

export interface TmdbCollection {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: TmdbListItem[];
}

export type SortBy = 'popularity.desc' | 'vote_average.desc' | 'release_date.desc' | 'primary_release_date.desc';

function posterUrl(path: string | null, size: 'w342' | 'w500' = 'w342'): string | null {
  return path ? `${CONFIG.TMDB_IMAGE_URL}/${size}${path}` : null;
}

function backdropUrl(path: string | null, size: 'w780' | 'original' = 'w780'): string | null {
  return path ? `${CONFIG.TMDB_IMAGE_URL}/${size}${path}` : null;
}

async function tmdbGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const query = new URLSearchParams({
    api_key: CONFIG.TMDB_API_KEY,
    language: 'fr-FR',
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  const response = await fetch(`${CONFIG.TMDB_API_URL}${path}?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`TMDB ${path} a repondu ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function normalizeItem(raw: any, fallbackType?: MediaType): TmdbListItem {
  const media_type: MediaType = raw.media_type ?? fallbackType ?? (raw.first_air_date ? 'tv' : 'movie');
  return {
    id: raw.id,
    media_type,
    title: raw.title ?? raw.name ?? '',
    overview: raw.overview ?? '',
    poster_path: raw.poster_path ?? null,
    backdrop_path: raw.backdrop_path ?? null,
    vote_average: raw.vote_average ?? 0,
    release_date: raw.release_date ?? raw.first_air_date,
  };
}

export async function getTrending(mediaType: 'all' | MediaType = 'all'): Promise<TmdbListItem[]> {
  const data = await tmdbGet<{ results: any[] }>(`/trending/${mediaType}/week`);
  return data.results
    .filter(r => r.poster_path)
    .map(r => normalizeItem(r));
}

export async function discover(mediaType: MediaType, sortBy = 'popularity.desc'): Promise<TmdbListItem[]> {
  const data = await tmdbGet<{ results: any[] }>(`/discover/${mediaType}`, { sort_by: sortBy });
  return data.results
    .filter(r => r.poster_path)
    .map(r => normalizeItem(r, mediaType));
}

export async function discoverPaged(
  mediaType: MediaType,
  sortBy: SortBy = 'popularity.desc',
  page = 1,
): Promise<TmdbListItem[]> {
  const data = await tmdbGet<{ results: any[] }>(`/discover/${mediaType}`, { sort_by: sortBy, page });
  return data.results
    .filter(r => r.poster_path)
    .map(r => normalizeItem(r, mediaType));
}

// Meme approche que GenrePage.tsx cote web : resoudre l'id du mot-cle "anime"
// dynamiquement (il varie selon la langue TMDB) plutot que le figer en dur,
// et le mettre en cache car il ne change jamais pendant une session.
let cachedAnimeKeywordId: number | null = null;
async function resolveAnimeKeywordId(): Promise<number | null> {
  if (cachedAnimeKeywordId !== null) return cachedAnimeKeywordId;
  const data = await tmdbGet<{ results: { id: number; name: string }[] }>('/search/keyword', { query: 'anime' });
  cachedAnimeKeywordId = data.results[0]?.id ?? null;
  return cachedAnimeKeywordId;
}

export async function discoverGenre(
  mediaType: MediaType | 'anime',
  genreId: number,
  options: { sortBy?: SortBy; page?: number } = {},
): Promise<TmdbListItem[]> {
  const { sortBy = 'popularity.desc', page = 1 } = options;
  const resolvedType: MediaType = mediaType === 'anime' ? 'tv' : mediaType;
  const params: Record<string, string | number> = {
    sort_by: sortBy,
    page,
    'vote_count.gte': 5,
    include_adult: 'false',
  };
  if (mediaType === 'anime') {
    const keywordId = await resolveAnimeKeywordId();
    params.with_genres = keywordId ? `16,${genreId}` : `16`;
    if (keywordId) params.with_keywords = String(keywordId);
  } else {
    params.with_genres = genreId;
  }
  const data = await tmdbGet<{ results: any[] }>(`/discover/${resolvedType}`, params);
  return data.results
    .filter(r => r.poster_path)
    .map(r => normalizeItem(r, resolvedType));
}

// Mirror Anime.tsx cote web : discover/tv genre Animation (16) + mot-cle
// anime, vote_count.gte=25 (plus strict que discoverGenre pour filtrer le
// bruit des animations non-anime).
export async function discoverAnime(sortBy: SortBy = 'popularity.desc', page = 1): Promise<TmdbListItem[]> {
  const keywordId = await resolveAnimeKeywordId();
  const params: Record<string, string | number> = {
    sort_by: sortBy,
    page,
    with_genres: '16',
    'vote_count.gte': 25,
  };
  if (keywordId) params.with_keywords = String(keywordId);
  const data = await tmdbGet<{ results: any[] }>('/discover/tv', params);
  return data.results.filter(r => r.poster_path).map(r => normalizeItem(r, 'tv'));
}

export async function getGenreList(mediaType: MediaType): Promise<TmdbGenre[]> {
  const data = await tmdbGet<{ genres: TmdbGenre[] }>(`/genre/${mediaType}/list`);
  return data.genres;
}

export async function getPersonDetails(id: number): Promise<TmdbPerson> {
  return tmdbGet<TmdbPerson>(`/person/${id}`);
}

export async function getPersonCredits(id: number): Promise<TmdbListItem[]> {
  const data = await tmdbGet<{ cast: any[] }>(`/person/${id}/combined_credits`);
  return data.cast
    .filter(r => r.poster_path)
    .map(r => normalizeItem(r))
    .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0));
}

export async function getCollection(id: number): Promise<TmdbCollection> {
  const data = await tmdbGet<any>(`/collection/${id}`);
  return {
    id: data.id,
    name: data.name,
    overview: data.overview ?? '',
    poster_path: data.poster_path ?? null,
    backdrop_path: data.backdrop_path ?? null,
    parts: (data.parts ?? []).filter((p: any) => p.poster_path).map((p: any) => normalizeItem(p, 'movie')),
  };
}

export async function searchMulti(query: string): Promise<TmdbListItem[]> {
  if (!query.trim()) return [];
  const data = await tmdbGet<{ results: any[] }>('/search/multi', { query });
  return data.results
    .filter(r => r.poster_path && (r.media_type === 'movie' || r.media_type === 'tv'))
    .map(r => normalizeItem(r));
}

export async function getDetails(mediaType: MediaType, id: number): Promise<TmdbDetails> {
  const raw = await tmdbGet<any>(`/${mediaType}/${id}`, { append_to_response: 'credits' });
  return {
    ...normalizeItem(raw, mediaType),
    genres: raw.genres ?? [],
    runtime: raw.runtime,
    number_of_seasons: raw.number_of_seasons,
    belongs_to_collection: raw.belongs_to_collection ?? null,
    cast: (raw.credits?.cast ?? []).slice(0, 15).map((c: any) => ({
      id: c.id,
      name: c.name,
      character: c.character ?? '',
      profile_path: c.profile_path ?? null,
    })),
  };
}

export { posterUrl, backdropUrl };
