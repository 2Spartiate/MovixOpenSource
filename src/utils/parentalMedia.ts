import { getContentAge, type AgeClassifiableMediaType } from './contentAgeFilter';
import type { ParentalMediaMetadata } from './parentalPolicy';

const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || '';
const mediaRequests = new Map<string, Promise<ParentalMediaMetadata>>();

export function getParentalMediaMetadata(mediaType: AgeClassifiableMediaType, id: number): Promise<ParentalMediaMetadata> {
  const key = `${mediaType}:${id}`;
  const existing = mediaRequests.get(key);
  if (existing) return existing;

  const request = (async (): Promise<ParentalMediaMetadata> => {
    let genres: ParentalMediaMetadata['genres'] = null;
    let keywords: ParentalMediaMetadata['keywords'] = null;
    let title: string | undefined;
    let backdropPath: string | null | undefined;
    let adult = false;
    try {
      if (TMDB_API_KEY) {
        const response = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${encodeURIComponent(TMDB_API_KEY)}&append_to_response=keywords`);
        if (response.ok) {
          const data = await response.json();
          genres = Array.isArray(data.genres) ? data.genres : null;
          const tags = mediaType === 'movie' ? data.keywords?.keywords : data.keywords?.results;
          keywords = Array.isArray(tags) ? tags : null;
          title = data.title || data.name;
          backdropPath = data.backdrop_path;
          adult = data.adult === true;
        }
      }
    } catch { /* Unknown metadata is handled conservatively by the guard. */ }
    const age = await getContentAge({ id, media_type: mediaType, adult });
    return { mediaType, id, age, genres, keywords, title, backdropPath };
  })().finally(() => mediaRequests.delete(key));

  mediaRequests.set(key, request);
  return request;
}
