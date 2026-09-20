import { useSyncExternalStore } from 'react';
import { getMovieReleaseWarningsEnabled, subscribeToMovieReleaseWarnings } from '@/utils/movieReleasePreferences';

const getServerSnapshot = () => false;

export const useMovieReleaseWarnings = (): boolean => useSyncExternalStore(
  subscribeToMovieReleaseWarnings,
  getMovieReleaseWarningsEnabled,
  getServerSnapshot,
);
