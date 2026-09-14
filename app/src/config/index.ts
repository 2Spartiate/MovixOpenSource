import { TMDB_API_KEY, TURNSTILE_SITE_KEY } from '@env';

export const CONFIG = {
  SITE_URL: 'https://movix.tax',
  // Host reel du backend Mainapi (VITE_MAIN_API cote web) — distinct du site
  // (Cloudflare Pages) qui, lui, a besoin du systeme de miroirs anti-blocage
  // (AddressContext). Pas de preuve que l'API ait besoin du meme systeme de
  // secours, donc constante fixe plutot que resolue dynamiquement.
  API_BASE_URL: 'https://api.movix.men',
  DNS_PRIMARY: '1.1.1.1',
  DNS_SECONDARY: '1.0.0.1',
  DNS_DOH_URL: 'https://cloudflare-dns.com/dns-query',
  APP_NAME: 'Movix',
  USER_AGENT:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  USER_AGENT_IOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  // Meme niveau d'exposition cote client que VITE_TMDB_API_KEY sur le web,
  // mais lue depuis app/.env (jamais commite) via react-native-dotenv plutot
  // que codee en dur : ce depot est public.
  TMDB_API_KEY,
  TMDB_API_URL: 'https://api.themoviedb.org/3',
  TMDB_IMAGE_URL: 'https://image.tmdb.org/t/p',
  // Cle publique Cloudflare Turnstile (equivalent VITE_TURNSTILE_INVISIBLE_SITEKEY
  // cote web) — pas un secret par nature, mais routee par @env comme le reste.
  TURNSTILE_SITE_KEY,
};

export const UPDATE_CHECK = {
  RENTRY_URL: 'https://rentry.co/movix',
  MANIFEST_PATH: '/app/version.json',
  GITHUB_VERSION_RAW_PATH: '/raw/refs/heads/main/app/version.json',
  TIMEOUT_MS: 5000,
  PENDING_DOWNLOAD_KEY: 'update:pendingDownload',
};

export const FALLBACK_CONFIG = {
  PRIMARY_URL: 'https://movix.tax',
  GITHUB_URL: 'https://github.com/Movix-STMG/MovixOpenSource',
  TELEGRAM_URL: 'https://t.me/movix_site',
};
