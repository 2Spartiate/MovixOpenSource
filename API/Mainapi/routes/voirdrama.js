/**
 * VoirDrama routes module.
 * Extracted from server.js -- handles drama TV series search and source extraction
 * from the VoirDrama website.
 *
 * Mounted at /api/drama  (paths below are relative to that prefix).
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fsp = require('fs').promises;
const axios = require('axios');
const cheerio = require('cheerio');
const { generateCacheKey } = require('../utils/cacheManager');
const { respondWithResolvedSources } = require('../utils/embedExtraction');

// VoirDrama ne sépare pas les langues : `data` est un tableau plat de lecteurs
// dont l'URL vit dans `link`. La route sert déjà UN épisode par appel
// (`?season=&episode=` obligatoires), donc rien à cibler en plus.
const respondWithSources = (req, res, payload) =>
  respondWithResolvedSources(req, res, payload, { movieMapKey: 'data', label: 'VOIRDRAMA' });
const { fetchTmdbDetails } = require('../utils/tmdbCache');
const { createSingleFlight } = require('../utils/singleFlight');
const diagnostics = require('../utils/diagnostics');

// === VOIRDRAMA CONFIGURATION ===
const VOIRDRAMA_BASE_URL = 'https://voirdrama.to';
const runDramaRefresh = createSingleFlight();
const DRAMA_REFRESH_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DRAMA_REFRESH_FAILURE_BACKOFF_MS = 60 * 1000;
const DRAMA_REFRESH_STATE_LIMIT = 500;
const refreshChecks = new Map();
const refreshCooldowns = new Map();

function remember(map, key, value) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > DRAMA_REFRESH_STATE_LIMIT) map.delete(map.keys().next().value);
}

function hasPlayableSources(payload) {
  return payload?.success && Array.isArray(payload.data) && payload.data.some((source) => source && source.link);
}

function isRetryableDramaFailure(payload) {
  return payload?.success === false && (payload.retryable === true
    // Cet ancien message désignait aussi les pages d'erreur Cloudflare mises en cache.
    || payload.error === 'Film/Série non trouvé sur Voirdrama');
}

function temporaryDramaFailure(error) {
  return {
    success: false,
    error: String(error.message || 'VoirDrama temporairement indisponible').slice(0, 1024),
    retryable: true,
    ...(Number.isInteger(error.upstreamStatus) ? { upstreamStatus: error.upstreamStatus } : {}),
  };
}

function assertDramaResponse(response, stage) {
  if (response.statusCode >= 200 && response.statusCode < 300) return;
  const error = new Error(`VoirDrama temporairement indisponible (HTTP ${response.statusCode}, ${stage})`);
  error.upstreamStatus = response.statusCode;
  throw error;
}

function respondWithDramaError(res, payload) {
  if (isRetryableDramaFailure(payload)) {
    res.set('Retry-After', String(DRAMA_REFRESH_FAILURE_BACKOFF_MS / 1000));
    return res.status(503).json(payload);
  }
  return res.status(404).json(payload);
}

function deferDramaRefresh(cacheKey, result) {
  // Conserver le résultat pendant la pause évite un retour null sur un cache froid.
  remember(refreshCooldowns, cacheKey, { until: Date.now() + DRAMA_REFRESH_FAILURE_BACKOFF_MS, result });
  return result;
}

// Impit — remplacement de got-scraping (Rust TLS fingerprint + HTTP/2 natif, pas de http2-wrapper)
let impitClient = null;
async function getImpitClient() {
  if (!impitClient) {
    const { Impit } = await import('impit');
    impitClient = new Impit({ browser: 'chrome' });
  }
  return impitClient;
}

function impitFetch(url, options = {}) {
  return diagnostics.observeTextRequest('impit', url, options, () => fetchImpitBody(url, options));
}

async function fetchImpitBody(url, options) {
  const client = await getImpitClient();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await client.fetch(url, { ...options, signal: controller.signal });
    const body = await response.text();
    return { statusCode: response.status, body };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Dependencies injected via configure()
// ---------------------------------------------------------------------------
let TMDB_API_KEY;
let TMDB_API_URL;
let getFromCacheNoExpiration;
let saveToCache;
let shouldUpdateCache24h;
let fetchDramaTvDataForRefresh = null;

/**
 * Inject runtime dependencies that still live in server.js.
 */
function configure(deps) {
  if (deps.TMDB_API_KEY) TMDB_API_KEY = deps.TMDB_API_KEY;
  if (deps.TMDB_API_URL) TMDB_API_URL = deps.TMDB_API_URL;
  if (deps.getFromCacheNoExpiration) getFromCacheNoExpiration = deps.getFromCacheNoExpiration;
  if (deps.saveToCache) saveToCache = deps.saveToCache;
  if (deps.shouldUpdateCache24h) shouldUpdateCache24h = deps.shouldUpdateCache24h;
  if (typeof deps.fetchDramaTvData === 'function') fetchDramaTvDataForRefresh = deps.fetchDramaTvData;
}

async function readDramaCache(cacheDir, cacheKey) {
  const data = await getFromCacheNoExpiration(cacheDir, cacheKey);
  return isRetryableDramaFailure(data) ? null : data;
}

async function shouldRefreshDramaCache(cacheDir, cacheKey) {
  const now = Date.now();
  if (now < (refreshCooldowns.get(cacheKey)?.until || 0)) return false;
  const previousCheck = refreshChecks.get(cacheKey);
  if (previousCheck && now - previousCheck < DRAMA_REFRESH_CHECK_INTERVAL_MS) return false;
  const shouldRefresh = await shouldUpdateCache24h(cacheDir, cacheKey);
  // Seul un cache frais est espacé ici. Une entrée stale doit être revalidée après un échec.
  if (!shouldRefresh) remember(refreshChecks, cacheKey, now);
  return shouldRefresh;
}

async function refreshDramaCache(cacheDir, cacheKey, tmdbid, season, episode, cachedData) {
  const cooldown = refreshCooldowns.get(cacheKey);
  if (Date.now() < cooldown?.until) return hasPlayableSources(cachedData) ? cachedData : cooldown.result;

  return runDramaRefresh(cacheKey, async () => {
    const pendingCooldown = refreshCooldowns.get(cacheKey);
    if (Date.now() < pendingCooldown?.until) return hasPlayableSources(cachedData) ? cachedData : pendingCooldown.result;
    const currentData = await readDramaCache(cacheDir, cacheKey);
    if (currentData && !(await shouldRefreshDramaCache(cacheDir, cacheKey))) return currentData;
    const dataToPreserve = currentData || cachedData;
    try {
      const freshData = await (fetchDramaTvDataForRefresh || fetchDramaTvData)(tmdbid, season, episode);
      // Une panne amont ne doit jamais devenir un résultat négatif durable.
      if (isRetryableDramaFailure(freshData)) {
        return deferDramaRefresh(cacheKey, hasPlayableSources(dataToPreserve) ? dataToPreserve : freshData);
      }
      // A stale usable answer must survive a failed upstream refresh.
      if (hasPlayableSources(dataToPreserve) && !hasPlayableSources(freshData)) {
        return deferDramaRefresh(cacheKey, dataToPreserve);
      }
      const saved = await saveToCache(cacheDir, cacheKey, freshData);
      if (saved === false) {
        return deferDramaRefresh(cacheKey, dataToPreserve || freshData);
      }
      remember(refreshChecks, cacheKey, Date.now());
      refreshCooldowns.delete(cacheKey);
      return freshData;
    } catch (error) {
      return deferDramaRefresh(cacheKey, hasPlayableSources(dataToPreserve) ? dataToPreserve : temporaryDramaFailure(error));
    }
  });
}

// ---------------------------------------------------------------------------
// fetchDramaTvData -- search VoirDrama and extract episode sources
// ---------------------------------------------------------------------------
async function fetchDramaTvData(tmdbId, season, episode) {
  try {
    // 1. Get Series Name from TMDB (cached via Redis)
    const tmdbData = await fetchTmdbDetails(TMDB_API_URL, TMDB_API_KEY, tmdbId, 'tv', 'fr-FR');
    if (!tmdbData) throw new Error('TMDB data not found');

    const showName = tmdbData.name;
    const seasonInt = parseInt(season);
    const tmdbSeasons = tmdbData.seasons || [];
    const targetSeason = tmdbSeasons.find(s => s.season_number === seasonInt);
    const firstAirDate = (targetSeason && targetSeason.air_date) || tmdbData.first_air_date;

    // 2. Construct Search Query
    // Si c'est saison 1, tu prends le nom direct, si c'est saison 2, 3 etc, tu mets ex : Culinary Class Wars 2
    let searchQuery = showName;
    if (parseInt(season) > 1) {
      searchQuery += ` ${season}`;
    }

    // 3. Search on Voirdrama
    const formData = new URLSearchParams();
    formData.append('action', 'ajaxsearchpro_search');
    formData.append('aspp', searchQuery);
    formData.append('asid', '7');
    formData.append('asp_inst_id', '7_1');
    formData.append('options', 'aspf[vf__1]=vf&asp_gen[]=excerpt&asp_gen[]=content&asp_gen[]=title&filters_initial=1&filters_changed=0&qtranslate_lang=0&current_page_id=510');

    const searchResponse = await impitFetch(`${VOIRDRAMA_BASE_URL}/wp-admin/admin-ajax.php`, {
      method: 'POST',
      body: formData.toString(),
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'referer': VOIRDRAMA_BASE_URL + '/',
      },
    });
    assertDramaResponse(searchResponse, 'recherche');

    // 4. Parse Search Result
    const rawData = searchResponse.body;
    // Extract HTML part between markers
    // ___ASPSTART_HTML___ ... ___ASPEND_HTML___
    const htmlMatch = rawData.match(/___ASPSTART_HTML___([\s\S]*?)___ASPEND_HTML___/);

    if (!htmlMatch) {
      throw new Error(`Réponse de recherche VoirDrama invalide (HTTP ${searchResponse.statusCode}, bodyLength=${rawData.length})`);
    }

    const $ = cheerio.load(htmlMatch[1]);

    let bestLink = null;
    let candidateError = null;
    let fallbackLink = $('div.asp_content h3 a.asp_res_url').first().attr('href');

    if (!firstAirDate) {
      bestLink = fallbackLink;
    } else {
      // Month map for parsing "Dec 12, 2025"
      const monthsMap = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
        'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
      };

      // Try to find a date match
      const candidates = [];
      $('div.item').each((i, el) => {
        const link = $(el).find('a.asp_res_url').attr('href');
        const dateText = $(el).find('.summary-content').text().trim();

        if (link) {
          candidates.push({ link, dateText });
        }
      });

      for (const candidate of candidates) {
        const { link, dateText } = candidate;
        let matched = false;

        // 1. Try to check date from search result if present
        if (dateText) {
          const parts = dateText.split(/[\s,]+/);
          if (parts.length >= 3) {
            const mStr = parts[0].substring(0, 3);
            const dStr = parts[1];
            const yStr = parts[2];
            const month = monthsMap[mStr];

            if (month && dStr && yStr) {
              const day = dStr.padStart(2, '0');
              const formattedDate = `${yStr}-${month}-${day}`;
              if (formattedDate === firstAirDate) {
                bestLink = link;
                matched = true;
              }
            }
          }
        }

        if (matched) break;

        // 2. If no match yet (or no dateText), fetch the page to check the date
        if (!bestLink) {
          try {
            const pageResponse = await impitFetch(link);
            if (pageResponse.statusCode === 404) continue;
            assertDramaResponse(pageResponse, 'fiche série');
            const $page = cheerio.load(pageResponse.body);

            let pageDateFound = false;

            $page('.summary-content').each((_, el) => {
              const txt = $(el).text().trim();
              // Try parsing this text
              const parts = txt.split(/[\s,]+/);
              if (parts.length >= 3) {
                const mStr = parts[0].substring(0, 3);
                const dStr = parts[1];
                const yStr = parts[2];
                const month = monthsMap[mStr];
                if (month && dStr && yStr) {
                  const day = dStr.padStart(2, '0');
                  const fDate = `${yStr}-${month}-${day}`;
                  if (fDate === firstAirDate) {
                    pageDateFound = true;
                    return false;
                  }
                }
              }
            });

            if (pageDateFound) {
              bestLink = link;
              break;
            }

          } catch (err) {
            // Essayer les autres candidats, sans masquer une panne si aucun ne correspond.
            candidateError = err;
          }
        }
      }
    }

    // Fallback if no specific date match found
    if (!bestLink) {
      if (candidateError) throw candidateError;
      return { success: false, error: 'Série non trouvée sur Voirdrama (Aucune date correspondante)' };
    }

    // 5. Construct Episode URL
    // Format: https://voirdrama.to/drama/slug/ -> https://voirdrama.to/drama/slug/slug-episode-vostfr/
    // Remove trailing slash if present
    const cleanLink = bestLink.replace(/\/$/, '');
    const slug = cleanLink.split('/').pop();

    const paddedEpisode = episode.toString().padStart(2, '0');
    // Note: User example had slug repeated: /slug/slug-01-vostfr/
    const episodeUrl = `${cleanLink}/${slug}-${paddedEpisode}-vostfr/`;

    // 6. Fetch Episode Page
    const episodeResponse = await impitFetch(episodeUrl);
    if (episodeResponse.statusCode === 404) {
      return { success: false, error: 'Épisode non trouvé sur Voirdrama' };
    }
    assertDramaResponse(episodeResponse, 'page épisode');

    // 7. Extract Sources
    const episodeHtml = episodeResponse.body;
    const sourcesMatch = episodeHtml.match(/var thisChapterSources = ({[\s\S]*?});/);

    if (!sourcesMatch) {
      return { success: false, error: 'Sources non trouvées sur la page de l\'épisode' };
    }

    const sourcesJson = JSON.parse(sourcesMatch[1]);
    const sources = [];

    for (const [key, value] of Object.entries(sourcesJson)) {
      // 1. Clean Name
      let name = key;
      try {
        name = JSON.parse(`"${key}"`); // Decode unicode if needed
      } catch (e) { }

      // Remove "☰", "LECTEUR", numbers and extra spaces
      name = name.replace(/[☰]/g, '').replace(/LECTEUR\s*\d+/i, '').trim();

      // Map common abbreviated names if possible
      if (name === 'VIDM') name = 'Vidmoly';
      if (name === 'RU') name = 'Ok.ru';
      if (name === 'VOE') name = 'Voe';
      if (name === 'UQLOAD') name = 'Uqload';
      if (name === 'UPSTREAM') name = 'Upstream';
      if (name === 'DOOD') name = 'Doodstream';


      // 2. Extract Link
      let url = null;

      // Look for iframe src specifically to avoid script tags
      const iframeMatch = value.match(/<iframe[^>]+src="([^"]+)"/i);
      if (iframeMatch) {
        url = iframeMatch[1];
      } else {
        // Fallback: try to find http links that look like video embeds
        const urlMatch = value.match(/https?:\/\/[^"\s']+/);
        if (urlMatch) {
          const candidate = urlMatch[0];
          // Exclude recaptcha, google api, and local admin-ajax
          if (!candidate.includes('google.com/recaptcha') && !candidate.includes('admin-ajax.php')) {
            url = candidate;
          }
        }
      }

      // 3. Filter and Add
      if (url) {
        sources.push({
          name: name,
          link: url,
          // raw: value // Optional: keep raw for debug if needed, but user didn't ask for it
        });
      }
    }

    return {
      success: true,
      data: sources,
      tmdbId: tmdbId,
      season: season,
      episode: episode
    };

  } catch (error) {
    console.error('[VOIRDRAMA] Error:', error.message);
    return temporaryDramaFailure(error);
  }
}

// ---------------------------------------------------------------------------
// GET /:type/:tmdbid
// Route /api/drama/:type/:tmdbid
// Options: season (saison), episode (episode)
// ---------------------------------------------------------------------------
router.get('/:type/:tmdbid', async (req, res) => {
  const { type, tmdbid } = req.params;
  const { season, episode } = req.query;

  if (type !== 'tv') {
    return res.status(400).json({
      success: false,
      error: 'Ce point de terminaison ne supporte que type=tv pour le moment avec saison/episode'
    });
  }

  if (!season || !episode) {
    return res.status(400).json({
      success: false,
      error: 'Les paramètres ?season= et ?episode= sont requis.'
    });
  }

  const cacheKey = generateCacheKey(`voirdrama_${tmdbid}_${season}_${episode}`);
  const cacheDir = path.join(__dirname, '..', 'cache', 'voirdrama');

  try {
    await fsp.mkdir(cacheDir, { recursive: true });

    // Stale-while-revalidate: return cached data immediately
    const cachedData = await readDramaCache(cacheDir, cacheKey);
    if (cachedData) {
      // Return cached data immediately
      if (!cachedData.success) {
        respondWithDramaError(res, cachedData);
      } else {
        await respondWithSources(req, res, cachedData);
      }
      // Background update if cache should be updated. Une seule opération publie le résultat.
      const shouldUpdate = await shouldRefreshDramaCache(cacheDir, cacheKey);
      if (shouldUpdate) {
        refreshDramaCache(cacheDir, cacheKey, tmdbid, season, episode, cachedData)
          .catch((bgError) => console.error('[VOIRDRAMA] Background update error:', bgError.message));
      }
      return;
    }

    // No cache: all callers await the same fetch and publication.
    const result = await refreshDramaCache(cacheDir, cacheKey, tmdbid, season, episode, null);

    if (!result.success) {
      return respondWithDramaError(res, result);
    }

    await respondWithSources(req, res, result);

  } catch (error) {
    console.error('[API DRAMA] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur interne',
      details: error.message
    });
  }
});

module.exports = router;
module.exports.configure = configure;
module.exports.fetchDramaTvData = fetchDramaTvData;
