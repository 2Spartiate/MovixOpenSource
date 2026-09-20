import { useEffect, useState } from 'react';
import { getTvAiringSchedule } from '@/services/tvAiringService';
import type { TvAiringSchedule, TvExternalIds } from '@/types/tvAiring';

export const useTvAiringSchedule = (showId: string | null, ids?: TvExternalIds) => {
  const imdbId = ids?.imdb_id;
  const tvdbId = ids?.tvdb_id;
  const key = `${showId ?? ''}:${imdbId ?? ''}:${tvdbId ?? ''}`;
  const [result, setResult] = useState<{ key: string; schedule: TvAiringSchedule | null } | null>(null);
  const [now, setNow] = useState(Date.now);
  // Invalider dès le rendu de navigation, avant même le nettoyage de l'effet.
  const schedule = result?.key === key ? result.schedule : null;

  useEffect(() => {
    if (!showId) return;
    let cancelled = false;
    const refresh = async () => {
      const value = await getTvAiringSchedule({ imdb_id: imdbId, tvdb_id: tvdbId });
      if (!cancelled) setResult({ key, schedule: value });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    void refresh();
    // Le service garde les données 15 min et les échecs seulement 1 min.
    const interval = window.setInterval(onVisible, 60_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [showId, imdbId, tvdbId, key]);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const nextAiring = Object.values(schedule?.episodes ?? {}).reduce((next, episode) => {
      const timestamp = episode.timestamp ? Date.parse(episode.timestamp) : NaN;
      return timestamp > now ? Math.min(next, timestamp) : next;
    }, Infinity);
    const timer = window.setTimeout(update, Math.max(1, Math.min(30_000, nextAiring - Date.now() + 1)));
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [schedule, now]);

  return { schedule, now };
};
