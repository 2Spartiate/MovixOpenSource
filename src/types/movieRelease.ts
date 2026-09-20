export type MovieReleaseType = 1 | 2 | 3 | 4 | 5 | 6;

export interface MovieReleaseEntry {
  date: string;
  country: string | null;
  type: MovieReleaseType;
}

export interface MovieReleaseCatalog {
  theatrical: MovieReleaseEntry | null;
  digital: MovieReleaseEntry | null;
  /** Première sortie hors cinéma connue : numérique, DVD/Blu-ray ou TV. */
  homeVideo: MovieReleaseEntry | null;
  /** Date générique TMDB, dont le type peut être une première de festival. */
  referenceDate: string | null;
}
