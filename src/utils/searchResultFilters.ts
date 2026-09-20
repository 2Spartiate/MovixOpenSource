// Critères « affichable » partagés entre le contexte de recherche (qui les
// applique à la requête TMDB et au pool filtré) et la page Search (qui les
// réapplique instantanément à la liste affichée).

interface DatedItem {
  release_date?: string;
  first_air_date?: string;
}

/** Sorti à ce jour : date connue et déjà passée. */
export const isReleased = (item: DatedItem): boolean => {
  const dateStr = item.release_date || item.first_air_date;
  if (!dateStr) return false;
  return new Date(dateStr).getTime() <= Date.now();
};

/** A un synopsis à afficher. */
export const hasUsefulContent = (item: { overview?: string }): boolean =>
  Boolean(item.overview && item.overview.trim().length > 0);
