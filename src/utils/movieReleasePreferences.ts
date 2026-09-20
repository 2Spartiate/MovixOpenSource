export const MOVIE_RELEASE_WARNINGS_KEY = 'settings_movie_release_warnings';
const CHANGE_EVENT = 'settings_movie_release_warnings_changed';

/** Activation explicite uniquement, y compris après une mise à jour du site. */
export const getMovieReleaseWarningsEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MOVIE_RELEASE_WARNINGS_KEY) === 'true';
  } catch {
    return false;
  }
};

export const setMovieReleaseWarningsEnabled = (enabled: boolean): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MOVIE_RELEASE_WARNINGS_KEY, String(enabled));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Sans stockage, conserver le défaut plutôt qu'afficher un choix non enregistré.
  }
};

export const subscribeToMovieReleaseWarnings = (listener: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === MOVIE_RELEASE_WARNINGS_KEY || event.key === null) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('sync_storage_updated', listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('sync_storage_updated', listener);
    window.removeEventListener('storage', onStorage);
  };
};
