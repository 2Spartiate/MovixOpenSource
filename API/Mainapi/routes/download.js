/**
 * Download routes module.
 * Extracted from server.js -- handles film/series download link retrieval,
 * m3u8 extraction, and Darkibox premium.
 *
 * Mounted at /api  (paths below are relative to that prefix).
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { generateCacheKey } = require('../utils/cacheManager');
const { createSingleFlight } = require('../utils/singleFlight');
const { mapWithConcurrency, axiosGetWithDeadline } = require('../utils/downloadM3u8');

// TTL for empty download results ({"sources":[]}) to avoid repeated ~20s m3u8 re-extractions
const EMPTY_RESULT_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const M3U8_CACHE_EXPIRY_MS = 8 * 60 * 60 * 1000;
const DOWNLOAD_EXTRACTION_CONCURRENCY = 4;
const DOWNLOAD_REFRESH_FAILURE_COOLDOWN_MS = 2 * 60 * 1000;
const DOWNLOAD_REFRESH_STATE_LIMIT = 500;
const runDownloadRefresh = createSingleFlight();
const downloadRefreshCooldowns = new Map();

function rememberDownloadCooldown(cacheKey) {
  const now = Date.now();
  for (const [key, until] of downloadRefreshCooldowns) {
    if (until <= now) downloadRefreshCooldowns.delete(key);
  }
  if (downloadRefreshCooldowns.has(cacheKey)) downloadRefreshCooldowns.delete(cacheKey);
  downloadRefreshCooldowns.set(cacheKey, now + DOWNLOAD_REFRESH_FAILURE_COOLDOWN_MS);
  while (downloadRefreshCooldowns.size > DOWNLOAD_REFRESH_STATE_LIMIT) downloadRefreshCooldowns.delete(downloadRefreshCooldowns.keys().next().value);
}

function hasDownloadCooldown(cacheKey) {
  const until = downloadRefreshCooldowns.get(cacheKey) || 0;
  if (until <= Date.now()) {
    downloadRefreshCooldowns.delete(cacheKey);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Dependencies injected via configure()
// ---------------------------------------------------------------------------
let DARKINO_MAINTENANCE;
let DARKINOS_CACHE_DIR;
let getFromCacheNoExpiration;
let saveToCache;

/**
 * Inject runtime dependencies that still live in app.js.
 */
function configure(deps) {
  if (deps.DARKINO_MAINTENANCE !== undefined) DARKINO_MAINTENANCE = deps.DARKINO_MAINTENANCE;
  if (deps.DARKINOS_CACHE_DIR) DARKINOS_CACHE_DIR = deps.DARKINOS_CACHE_DIR;
  if (deps.getFromCacheNoExpiration) getFromCacheNoExpiration = deps.getFromCacheNoExpiration;
  if (deps.saveToCache) saveToCache = deps.saveToCache;
}

// ---------------------------------------------------------------------------
// Utility functions (were inline in server.js)
// ---------------------------------------------------------------------------

const truncateForLog = (value, maxLength = 240) => {
  if (typeof value !== 'string') return value;
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
};

const buildLogContext = (context = {}) => {
  const parts = Object.entries(context)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`);
  return parts.length > 0 ? parts.join(' ') : 'no-context';
};

const summarizeErrorForLog = (error) => {
  const responseBody = error?.response?.data;
  return {
    message: error?.message,
    code: error?.code,
    status: error?.response?.status,
    statusText: error?.response?.statusText,
    responseSnippet: typeof responseBody === 'string'
      ? truncateForLog(responseBody, 500)
      : responseBody && typeof responseBody === 'object'
        ? truncateForLog(JSON.stringify(responseBody), 500)
        : undefined
  };
};

const summarizeSourceForLog = (source) => {
  if (!source) return null;
  return {
    src: truncateForLog(source.src),
    language: source.language,
    quality: source.quality,
    sub: source.sub,
    hasM3u8: !!source.m3u8
  };
};

const summarizeSourcesForLog = (sources = [], limit = 5) =>
  sources.slice(0, limit).map(summarizeSourceForLog);

const validateM3u8Url = async (m3u8Url, _useProxy = false, logContext = {}) => {
  if (!m3u8Url) return { isValid: false, quality: null };
  try {
    const response = await axios.get(m3u8Url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site'
      },
      timeout: 2000,
      validateStatus: (status) => status === 200,
      decompress: true
    });
    const contentType = response.headers['content-type'];
    const isValidContent = contentType && (
      contentType.includes('application/vnd.apple.mpegurl') ||
      contentType.includes('application/x-mpegurl') ||
      contentType.includes('audio/mpegurl') ||
      contentType.includes('text/plain')
    );
    const isValidM3u8 = response.data && typeof response.data === 'string' &&
      (response.data.includes('#EXTM3U') || response.data.includes('#EXT-X-VERSION'));
    const isValid = isValidContent || isValidM3u8;
    let quality = null;
    if (isValid && response.data && typeof response.data === 'string') {
      const content = response.data;
      const resolutionMatch = content.match(/RESOLUTION=(\d+x\d+)/i);
      if (resolutionMatch) {
        const [width, height] = resolutionMatch[1].split('x').map(Number);
        if (width >= 3840 || height >= 2160) quality = '4K';
        else if (width >= 1920 || height >= 1080) quality = '1080p';
        else if (width >= 1280 || height >= 720) quality = '720p';
        else if (width >= 854 || height >= 480) quality = '480p';
        else if (width >= 640 || height >= 360) quality = '360p';
        else quality = `${height}p`;
      } else {
        const qualityMatch = content.match(/(\d+p|4k|hd|sd)/gi);
        if (qualityMatch) {
          const qs = qualityMatch[0].toLowerCase();
          if (qs.includes('4k')) quality = '4K';
          else if (qs.includes('1080p') || qs.includes('hd')) quality = '1080p';
          else if (qs.includes('720p')) quality = '720p';
          else if (qs.includes('480p')) quality = '480p';
          else if (qs.includes('360p')) quality = '360p';
          else quality = qs.toUpperCase();
        }
      }
    }
    return { isValid, quality };
  } catch (_error) {
    return { isValid: false, quality: null };
  }
};

const extractM3u8Url = async (darkiboxUrl, logContext = {}) => {
  try {
    const response = await axiosGetWithDeadline(axios, darkiboxUrl);
    const htmlContent = response.data;
    const playerConfigMatch = htmlContent.match(/sources:\s*\[\s*{\s*src:\s*"([^"]+)"/);
    if (playerConfigMatch && playerConfigMatch[1]) {
      const m3u8Url = playerConfigMatch[1];
      const validation = await validateM3u8Url(m3u8Url, false, {
        ...logContext,
        sourceUrl: truncateForLog(darkiboxUrl, 160)
      });
      if (validation.isValid) {
        return { url: m3u8Url, quality: validation.quality };
      }
      return null;
    }
    return null;
  } catch (_error) {
    return null;
  }
};

function shouldRefreshM3u8Cache(cachedData, now = Date.now()) {
  if (!cachedData || cachedData.sources === undefined) return false;
  if (cachedData.emptyResultTimestamp && now - cachedData.emptyResultTimestamp < EMPTY_RESULT_CACHE_TTL_MS) return false;
  const hasValidSources = Array.isArray(cachedData.sourcesWithM3u8) && cachedData.sourcesWithM3u8.some(source => source.m3u8);
  return !cachedData.m3u8Timestamp || now - cachedData.m3u8Timestamp > M3U8_CACHE_EXPIRY_MS || !hasValidSources;
}

async function refreshM3u8Cache(cacheKey, requestContext = {}) {
  if (hasDownloadCooldown(cacheKey)) {
    return getFromCacheNoExpiration(DARKINOS_CACHE_DIR, cacheKey);
  }

  return runDownloadRefresh(cacheKey, async () => {
    const cachedData = await getFromCacheNoExpiration(DARKINOS_CACHE_DIR, cacheKey);
    // Recheck freshness after joining the common task: another operation may have published it.
    if (!shouldRefreshM3u8Cache(cachedData)) return cachedData;
    if (hasDownloadCooldown(cacheKey)) return cachedData;

    const sources = Array.isArray(cachedData.sources) ? cachedData.sources : [];
    const previousValidSources = Array.isArray(cachedData.sourcesWithM3u8)
      ? cachedData.sourcesWithM3u8.filter(source => source.m3u8)
      : [];
    const sourcesWithM3u8 = await mapWithConcurrency(sources, DOWNLOAD_EXTRACTION_CONCURRENCY, async (source, sourceIndex) => {
      const m3u8Result = await extractM3u8Url(source.src, { ...requestContext, phase: 'cache_reextract', sourceIndex });
      if (m3u8Result) return { ...source, m3u8: m3u8Result.url, quality: m3u8Result.quality || source.quality };
      return { ...source, m3u8: null };
    });
    const validSources = sourcesWithM3u8.filter(source => source.m3u8);

    // Une panne de ré-extraction ne doit ni effacer les liens exploitables ni provoquer une salve par requête.
    if (validSources.length === 0 && previousValidSources.length > 0) {
      rememberDownloadCooldown(cacheKey);
      return cachedData;
    }

    const newCacheData = { ...cachedData, sourcesWithM3u8, m3u8Timestamp: Date.now() };
    if (validSources.length === 0) newCacheData.emptyResultTimestamp = Date.now();
    else delete newCacheData.emptyResultTimestamp;
    try {
      const saved = await saveToCache(DARKINOS_CACHE_DIR, cacheKey, newCacheData);
      if (saved === false) {
        rememberDownloadCooldown(cacheKey);
        return cachedData;
      }
    } catch {
      rememberDownloadCooldown(cacheKey);
      return cachedData;
    }
    downloadRefreshCooldowns.delete(cacheKey);
    return newCacheData;
  });
}

const deduplicateSourcesWithPreference = (sources = []) => {
  const normalizeLang = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
  const mergeMissingFields = (main, other) => {
    const merged = { ...main };
    for (const field of ['language', 'quality', 'sub', 'provider', 'm3u8', 'src']) {
      if ((merged[field] === undefined || merged[field] === null || merged[field] === '') && other[field]) {
        merged[field] = other[field];
      }
    }
    return merged;
  };
  const choosePreferred = (current, candidate) => {
    if (!current) return { ...candidate };
    if (!candidate) return { ...current };
    const currentLang = normalizeLang(current.language);
    const candidateLang = normalizeLang(candidate.language);
    let winner = current, loser = candidate;
    if (!current.m3u8 && candidate.m3u8) { winner = candidate; loser = current; }
    else if (current.m3u8 && !candidate.m3u8) { winner = current; loser = candidate; }
    else if (candidateLang === 'multi' && currentLang !== 'multi') { winner = candidate; loser = current; }
    else if (currentLang === 'multi' && candidateLang !== 'multi') { winner = current; loser = candidate; }
    else if (!current.language && candidate.language) { winner = candidate; loser = current; }
    return mergeMissingFields(winner, loser);
  };
  const byKey = new Map();
  for (const source of sources) {
    if (!source) continue;
    const key = source.m3u8 || source.src;
    if (!key) continue;
    byKey.set(key, choosePreferred(byKey.get(key), source));
  }
  return [...byKey.values()];
};

// ===========================================================================
// ROUTES  (mounted at /api, so paths are relative)
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /films/download/:id  -- retrieve download links for a film
// ---------------------------------------------------------------------------
router.get('/films/download/:id', async (req, res) => {
  if (DARKINO_MAINTENANCE) {
    return res.status(200).json({ error: 'Service Darkino temporairement indisponible (maintenance)' });
  }
  try {
    const { id } = req.params;
    const cacheKey = generateCacheKey(`films_download_${id}`);
    let cachedData = await getFromCacheNoExpiration(DARKINOS_CACHE_DIR, cacheKey);

    if (cachedData && cachedData.sources !== undefined) {
      const now = Date.now();
      // Short-circuit: empty result cached recently -- skip ~20s re-extraction
      if (cachedData.emptyResultTimestamp && (now - cachedData.emptyResultTimestamp < EMPTY_RESULT_CACHE_TTL_MS)) {
        return res.status(200).json({ sources: [] });
      }
      if (shouldRefreshM3u8Cache(cachedData, now)) cachedData = await refreshM3u8Cache(cacheKey, { route: 'films_download', id, cacheKey });
      const dedupedSources = deduplicateSourcesWithPreference(cachedData.sourcesWithM3u8 || []);
      // Filtrer les sources avec m3u8: null avant de retourner
      const filteredSources = dedupedSources.filter(source => source.m3u8);
      // Retourner les sources dedupliquees et filtrees
      res.status(200).json({ sources: filteredSources });
      return;
    }
    // Hydracker freeze: no upstream fallback. Cache-only.
    const sources = [];
    const basicSources = sources.map(source => ({
      src: source.src,
      language: source.language,
      quality: source.quality,
      sub: source.sub
    }));

    // Extract and cache m3u8 URLs
    let sourcesWithM3u8 = await Promise.all(
      basicSources.map(async (source, idx) => {
        if (source.m3u8) {
          const validation = await validateM3u8Url(source.m3u8, false);
          if (validation.isValid) {
            return {
              ...source,
              m3u8: source.m3u8,
              quality: validation.quality || source.quality
            };
          } else {
            return { ...source, m3u8: null };
          }
        } else {
          const m3u8Result = await extractM3u8Url(source.src);
          if (m3u8Result) {
            return {
              ...source,
              m3u8: m3u8Result.url,
              quality: m3u8Result.quality || source.quality
            };
          }
          return { ...source, m3u8: null };
        }
      })
    );
    // Retry extraction if no valid sources (up to 2 more times)
    let validSources = sourcesWithM3u8.filter(source => source.m3u8);
    let m3u8RetryCount = 0;
    while (validSources.length === 0 && m3u8RetryCount < 2) {
      m3u8RetryCount++;
      await new Promise(r => setTimeout(r, 500));
      sourcesWithM3u8 = await Promise.all(
        basicSources.map(async (source, idx) => {
          if (source.m3u8) {
            const validation = await validateM3u8Url(source.m3u8, false);
            if (validation.isValid) {
              return {
                ...source,
                m3u8: source.m3u8,
                quality: validation.quality || source.quality
              };
            } else {
              return { ...source, m3u8: null };
            }
          } else {
            const m3u8Result = await extractM3u8Url(source.src);
            if (m3u8Result) {
              return {
                ...source,
                m3u8: m3u8Result.url,
                quality: m3u8Result.quality || source.quality
              };
            }
            return { ...source, m3u8: null };
          }
        })
      );
      validSources = sourcesWithM3u8.filter(source => source.m3u8);
    }
    const dedupedSources = deduplicateSourcesWithPreference(sourcesWithM3u8);
    // Filtrer les sources avec m3u8: null avant de retourner
    const filteredSources = dedupedSources.filter(source => source.m3u8);
    // Save both the basic sources and the sources with m3u8
    const cacheDataToSave = {
      sources: basicSources,
      sourcesWithM3u8: sourcesWithM3u8,
      m3u8Timestamp: Date.now()
    };
    if (filteredSources.length === 0) {
      cacheDataToSave.emptyResultTimestamp = Date.now();
    }
    await saveToCache(DARKINOS_CACHE_DIR, cacheKey, cacheDataToSave);
    res.status(200).json({ sources: filteredSources });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la recuperation des liens de telechargement' });
  }
});

// ---------------------------------------------------------------------------
// GET /series/download/:titleId/season/:seasonId/episode/:episodeId
// ---------------------------------------------------------------------------
router.get('/series/download/:titleId/season/:seasonId/episode/:episodeId', async (req, res) => {
  if (DARKINO_MAINTENANCE) {
    return res.status(200).json({ error: 'Service Darkino temporairement indisponible (maintenance)' });
  }
  const { titleId, seasonId, episodeId } = req.params;
  const cacheKey = generateCacheKey(`series_download_${titleId}_${seasonId}_${episodeId}`);
  const requestContext = {
    route: 'series_download',
    titleId,
    seasonId,
    episodeId,
    cacheKey
  };
  try {
    let cachedData = await getFromCacheNoExpiration(DARKINOS_CACHE_DIR, cacheKey);

    if (cachedData && cachedData.sources !== undefined) {
      const now = Date.now();
      // Short-circuit: empty result cached recently -- skip ~20s re-extraction
      if (cachedData.emptyResultTimestamp && (now - cachedData.emptyResultTimestamp < EMPTY_RESULT_CACHE_TTL_MS)) {
        return res.status(200).json({ sources: [] });
      }
      if (shouldRefreshM3u8Cache(cachedData, now)) cachedData = await refreshM3u8Cache(cacheKey, requestContext);
      const validSources = (cachedData.sourcesWithM3u8 || []).filter(source => source.m3u8);
      const dedupedSources = deduplicateSourcesWithPreference(validSources);
      const filteredSources = dedupedSources.filter(source => source.m3u8);
      // If result is empty, we've just saved emptyResultTimestamp above -- return empty and let TTL block retries
      const shouldForceLiveRefetch = false;
      if (!shouldForceLiveRefetch) {
        res.status(200).json({ sources: filteredSources });
        return;
      }
    }
    // Hydracker freeze: no upstream fallback. Cache-only.
    const sources = [];
    const basicSources = sources.map(source => ({
      src: source.src,
      language: source.language,
      quality: source.quality,
      sub: source.sub
    }));
    // Extract and cache m3u8 URLs
    let sourcesWithM3u8 = await Promise.all(
      basicSources.map(async (source, sourceIndex) => {
        if (source.m3u8) {
          const validation = await validateM3u8Url(source.m3u8, false, {
            ...requestContext,
            phase: 'initial_validation',
            sourceIndex
          });
          if (validation.isValid) {
            return {
              ...source,
              m3u8: source.m3u8,
              quality: validation.quality || source.quality
            };
          } else {
            return { ...source, m3u8: null };
          }
        } else {
          const m3u8Result = await extractM3u8Url(source.src, {
            ...requestContext,
            phase: 'initial_extract',
            sourceIndex
          });
          if (m3u8Result) {
            return {
              ...source,
              m3u8: m3u8Result.url,
              quality: m3u8Result.quality || source.quality
            };
          }
          return { ...source, m3u8: null };
        }
      })
    );
    // Retry extraction if no valid sources (up to 2 more times)
    let validSources = sourcesWithM3u8.filter(source => source.m3u8);
    let m3u8RetryCount = 0;
    while (validSources.length === 0 && m3u8RetryCount < 2) {
      m3u8RetryCount++;
      await new Promise(r => setTimeout(r, 500));
      sourcesWithM3u8 = await Promise.all(
        basicSources.map(async (source, sourceIndex) => {
          if (source.m3u8) {
            const validation = await validateM3u8Url(source.m3u8, false, {
              ...requestContext,
              phase: `retry_validation_${m3u8RetryCount}`,
              sourceIndex
            });
            if (validation.isValid) {
              return {
                ...source,
                m3u8: source.m3u8,
                quality: validation.quality || source.quality
              };
            } else {
              return { ...source, m3u8: null };
            }
          } else {
            const m3u8Result = await extractM3u8Url(source.src, {
              ...requestContext,
              phase: `retry_extract_${m3u8RetryCount}`,
              sourceIndex
            });
            if (m3u8Result) {
              return {
                ...source,
                m3u8: m3u8Result.url,
                quality: m3u8Result.quality || source.quality
              };
            }
            return { ...source, m3u8: null };
          }
        })
      );
      validSources = sourcesWithM3u8.filter(source => source.m3u8);
    }
    // Deduplication des sources par m3u8 (prioritaire) puis src
    const seenM3u8 = new Set();
    const seenSrc = new Set();
    const dedupedSources = [];
    for (const source of sourcesWithM3u8) {
      const key = source.m3u8 || source.src;
      if (!key) continue;
      if (!seenM3u8.has(key)) {
        seenM3u8.add(key);
        dedupedSources.push(source);
      }
    }
    // Deduplication supplementaire sur src
    const finalSources = [];
    for (const source of dedupedSources) {
      if (!seenSrc.has(source.src)) {
        seenSrc.add(source.src);
        finalSources.push(source);
      }
    }
    // Filtrer les sources avec m3u8: null avant de retourner
    const filteredSources = finalSources.filter(source => source.m3u8 !== null);
    // Save both the basic sources and the sources with m3u8
    const cacheDataToSave = {
      sources: basicSources,
      sourcesWithM3u8: sourcesWithM3u8,
      m3u8Timestamp: Date.now()
    };
    if (filteredSources.length === 0) {
      cacheDataToSave.emptyResultTimestamp = Date.now();
    }
    await saveToCache(DARKINOS_CACHE_DIR, cacheKey, cacheDataToSave);
    res.status(200).json({ sources: filteredSources });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la recuperation des liens de telechargement' });
  }
});

// ---------------------------------------------------------------------------
// GET /darkino/download-premium/:id
// ---------------------------------------------------------------------------
router.get('/darkino/download-premium/:id', async (_req, res) => {
  // Hydracker freeze (2026-05-15): upstream decode is disabled.
  res.status(410).json({
    success: false,
    error: 'gone',
    message: 'Decode upstream désactivé. Utilise /api/darkiworld/decode/:id.'
  });
});

// ---------------------------------------------------------------------------
// GET /titles/:id/download  -- FROZEN: returns 410 Gone
// ---------------------------------------------------------------------------
router.get('/titles/:id/download', async (_req, res) => {
  res.status(410).json({
    success: false,
    error: 'gone',
    message: 'Hydracker /titles/{id}/download désactivé. Utilise /api/darkiworld/download/:type/:id.'
  });
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = router;
module.exports.configure = configure;
