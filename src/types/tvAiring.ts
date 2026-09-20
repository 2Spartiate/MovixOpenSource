export interface TvExternalIds {
  imdb_id?: string | null;
  tvdb_id?: number | null;
}

export interface TvEpisodeDate {
  season_number: number;
  episode_number: number;
  air_date?: string | null;
}

export interface TvAiringSchedule {
  sourceUrl: string;
  episodes: Record<string, {
    date: string | null;
    /** Instant ISO avec fuseau, uniquement si TVmaze renseigne aussi airtime. */
    timestamp: string | null;
  }>;
}

export interface TvAiringStatus {
  kind: 'upcoming' | 'aired' | 'unconfirmed';
  /** Jour annoncé dans le pays de diffusion, sans conversion de fuseau. */
  date: string | null;
  timestamp: number | null;
  /** Avertissement avant l'heure précise, ou avant le jour local annoncé si l'heure manque. */
  needsWarning: boolean;
}
