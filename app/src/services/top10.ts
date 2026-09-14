import type { TmdbListItem } from './tmdb';

// Contrairement a tmdb.ts, ceci n'est pas TMDB : /api/top10 est un vrai
// endpoint Movix (analytics sur les vues reelles, cf. API/Mainapi/top10Routes.js),
// donc il a besoin de l'origine du site (resolue via AddressContext), pas
// d'une cle TMDB. Pas d'auth requise.

export type Top10Kind = 'movies' | 'tv' | 'anime';
export type Top10Period = 'day' | 'week' | 'month' | 'year' | 'all';
export type Top10Algo = 'viewers' | 'hours' | 'sessions';

export async function getTop10(
  apiBase: string,
  kind: Top10Kind,
  period: Top10Period = 'week',
  algo: Top10Algo = 'viewers',
): Promise<TmdbListItem[]> {
  const url = `${apiBase}/api/top10/${kind}?period=${period}&algo=${algo}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Top10 ${kind} a repondu ${response.status}`);
  }
  const data = await response.json();
  const results = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
  return results.map((r: any) => ({
    id: r.id ?? r.tmdb_id,
    media_type: kind === 'tv' || kind === 'anime' ? 'tv' : 'movie',
    title: r.title ?? r.name ?? '',
    overview: r.overview ?? '',
    poster_path: r.poster_path ?? null,
    backdrop_path: r.backdrop_path ?? null,
    vote_average: r.vote_average ?? 0,
    release_date: r.release_date ?? r.first_air_date,
  }));
}
