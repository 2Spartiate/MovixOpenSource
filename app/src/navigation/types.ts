import type { MediaType } from '../services/tmdb';

export type TabParamList = {
  Home: undefined;
  Search: undefined;
  Library: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  Detail: { id: number; mediaType: MediaType };
  // Ecran de secours tant que la Phase 2 (handoff WebView cachee ->
  // PlayerScreen natif) n'est pas construite : reutilise BrowserScreen tel
  // quel, preload sur l'URL de lecture du site.
  WebPlayer: { url: string; title: string };
  // Goal 3 — Catalogue complet
  Movies: undefined;
  TVShows: undefined;
  Anime: undefined;
  Genre: { mediaType: MediaType | 'anime'; genreId: number; genreName: string };
  Top10: undefined;
  Person: { id: number; name: string };
  Collection: { id: number; name: string };
  // Goal 6 — Live TV
  LiveTV: undefined;
  // Goal 4 — Compte & Bibliotheque
  Login: undefined;
  CreateAccount: undefined;
  ProfileSelect: undefined;
  ProfileEdit: { profileId?: string };
};
