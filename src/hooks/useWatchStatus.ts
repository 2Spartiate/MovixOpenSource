import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface WatchStatus {
  id: number;
  type: 'movie' | 'tv';
  episodeInfo?: {
    season: number;
    episode: number;
  };
  title: string;
  poster_path: string;
  addedAt: string;
}

interface UseWatchStatusProps {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  poster_path: string;
  episodeInfo?: {
    season: number;
    episode: number;
  };
}

const useWatchStatus = ({ id, type, title, poster_path, episodeInfo }: UseWatchStatusProps) => {
  const { t } = useTranslation();
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isWatched, setIsWatched] = useState(false);

  const getKey = (status: string) => {
    const baseKey = `${status}_${type}`;
    return episodeInfo ? `${baseKey}_episodes` : baseKey;
  };

  const updateStatus = (status: string, value: boolean): boolean => {
    try {
      const key = getKey(status);
      const items = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(items)) throw new Error('Liste locale invalide');

      if (value) {
        const newItem: WatchStatus = {
          id,
          type,
          title,
          poster_path,
          episodeInfo,
          addedAt: new Date().toISOString()
        };

        const updatedItems = [...items.filter((item: WatchStatus) =>
          episodeInfo
            ? item.id !== id ||
              item.episodeInfo?.season !== episodeInfo.season ||
              item.episodeInfo?.episode !== episodeInfo.episode
            : item.id !== id
        ), newItem];

        localStorage.setItem(key, JSON.stringify(updatedItems));
      } else {
        const filteredItems = items.filter((item: WatchStatus) =>
          episodeInfo
            ? item.id !== id ||
              item.episodeInfo?.season !== episodeInfo.season ||
              item.episodeInfo?.episode !== episodeInfo.episode
            : item.id !== id
        );
        localStorage.setItem(key, JSON.stringify(filteredItems));
      }
      return true;
    } catch {
      // Ne pas afficher un statut enregistré ni effacer d'autres données si
      // le quota est atteint ou si le stockage est indisponible.
      toast.error(t('common.storageWriteFailed'));
      return false;
    }
  };

  useEffect(() => {
    const checkStatus = (status: string) => {
      try {
        const key = getKey(status);
        const items = JSON.parse(localStorage.getItem(key) || '[]');
        if (!Array.isArray(items)) return false;
        return items.some((item: WatchStatus) =>
          episodeInfo
            ? item.id === id &&
              item.episodeInfo?.season === episodeInfo.season &&
              item.episodeInfo?.episode === episodeInfo.episode
            : item.id === id
        );
      } catch {
        return false;
      }
    };

    setIsInWatchlist(checkStatus('watchlist'));
    setIsFavorite(checkStatus('favorite'));
    setIsWatched(checkStatus('watched'));
  }, [id, type, episodeInfo]);

  return {
    isInWatchlist,
    isFavorite,
    isWatched,
    toggleWatchlist: () => {
      if (updateStatus('watchlist', !isInWatchlist)) setIsInWatchlist(!isInWatchlist);
    },
    toggleFavorite: () => {
      if (updateStatus('favorite', !isFavorite)) setIsFavorite(!isFavorite);
    },
    toggleWatched: () => {
      if (updateStatus('watched', !isWatched)) setIsWatched(!isWatched);
    }
  };
};

export default useWatchStatus;
