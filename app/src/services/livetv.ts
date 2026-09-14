import AsyncStorage from '@react-native-async-storage/async-storage';

// Meme protocole que le site (format Stremio addon) : manifest.catalogs liste
// les categories disponibles, catalog/:type/:catalogId renvoie les chaines
// de cette categorie. La resolution de flux par chaine reste dans le
// pipeline WebView/bridge (cf. plan Goal 6) — ce module ne fait que le
// catalogue.

export type LiveTvSource = 'northlive' | 'vavoo' | 'matches';

export interface LiveTvCatalog {
  type: string;
  id: string;
  name: string;
  _free?: boolean;
}

export interface LiveTvChannel {
  id: string;
  type: string;
  name: string;
  poster?: string | null;
  logo?: string | null;
  background?: string | null;
  description?: string | null;
}

export function sourceFromCatalogId(catalogId: string): LiveTvSource | null {
  if (catalogId.startsWith('northlive_')) return 'northlive';
  if (catalogId.startsWith('vavoo_')) return 'vavoo';
  if (catalogId.startsWith('matches_')) return 'matches';
  return null;
}

// Meme cle et meme forme que SettingsScreen.tsx (ExtractionPrefs.livetv) —
// les deux ecrans doivent rester en phase sur les toggles par provider.
async function getEnabledLiveTvSources(): Promise<Set<LiveTvSource>> {
  const defaults: LiveTvSource[] = ['northlive', 'vavoo', 'matches'];
  try {
    const raw = await AsyncStorage.getItem('movix_extraction_prefs');
    if (!raw) return new Set(defaults);
    const parsed = JSON.parse(raw);
    const livetv = parsed?.livetv;
    if (!livetv) return new Set(defaults);
    return new Set(defaults.filter(key => livetv[key] !== false));
  } catch {
    return new Set(defaults);
  }
}

export async function getManifest(apiBase: string): Promise<LiveTvCatalog[]> {
  const response = await fetch(`${apiBase}/api/livetv/manifest`);
  if (!response.ok) {
    throw new Error(`Live TV manifest a repondu ${response.status}`);
  }
  const data = await response.json();
  const catalogs: LiveTvCatalog[] = Array.isArray(data?.catalogs) ? data.catalogs : [];
  const enabled = await getEnabledLiveTvSources();
  // Ne garder que les providers actives par l'utilisateur (memes toggles que
  // SettingsScreen.tsx) — tvmio/iptv restent web-only pour l'instant.
  return catalogs.filter(c => {
    const source = sourceFromCatalogId(c.id);
    return source !== null && enabled.has(source);
  });
}

export async function getCatalog(apiBase: string, type: string, catalogId: string): Promise<LiveTvChannel[]> {
  const response = await fetch(`${apiBase}/api/livetv/catalog/${type}/${catalogId}`);
  if (!response.ok) {
    throw new Error(`Live TV catalog ${catalogId} a repondu ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data?.metas) ? data.metas : [];
}

// Mirror du deep-link que src/pages/LiveTV.tsx sait lire via useSearchParams
// (source/targetId/kind/catalogId) pour ouvrir directement une chaine sans
// repasser par la selection sur la page.
export function buildLiveTvWatchUrl(primaryUrl: string, catalogId: string, channel: LiveTvChannel): string {
  const source = sourceFromCatalogId(catalogId);
  const params = new URLSearchParams({
    source: source ?? '',
    targetId: channel.id,
    kind: 'channel',
    catalogId,
  });
  return `${primaryUrl}/live-tv?${params.toString()}`;
}
