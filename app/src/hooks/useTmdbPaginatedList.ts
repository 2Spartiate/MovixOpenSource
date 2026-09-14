import { useCallback, useEffect, useRef, useState } from 'react';
import type { TmdbListItem } from '../services/tmdb';

// Pagination infinie partagee par tous les ecrans grille (Movies/TVShows/
// Anime/Genre) : plus simple pour du mobile que le systeme page-number de
// GenrePage.tsx cote web (remplace plutot qu'accumule).
export function useTmdbPaginatedList(fetchPage: (page: number) => Promise<TmdbListItem[]>) {
  const [items, setItems] = useState<TmdbListItem[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  const seenIds = useRef(new Set<string>());

  const appendPage = useCallback((nextPage: number, results: TmdbListItem[]) => {
    const deduped = results.filter(r => {
      const key = `${r.media_type}-${r.id}`;
      if (seenIds.current.has(key)) return false;
      seenIds.current.add(key);
      return true;
    });
    setItems(prev => [...prev, ...deduped]);
    setPage(nextPage);
    setHasMore(results.length > 0);
  }, []);

  const reset = useCallback(() => {
    seenIds.current.clear();
    setItems([]);
    setPage(0);
    setHasMore(true);
    setError(null);
  }, []);

  useEffect(() => {
    reset();
    setLoading(true);
    fetchPageRef.current(1)
      .then(results => appendPage(1, results))
      .catch(err => setError(err?.message ?? 'Erreur de chargement'))
      .finally(() => setLoading(false));
    // fetchPage identity changes (e.g. genreId/sortBy) intentionally retrigger a full reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPageRef.current(page + 1)
      .then(results => appendPage(page + 1, results))
      .catch(err => setError(err?.message ?? 'Erreur de chargement'))
      .finally(() => setLoadingMore(false));
  }, [appendPage, hasMore, loading, loadingMore, page]);

  return { items, loading, loadingMore, error, hasMore, loadMore };
}
