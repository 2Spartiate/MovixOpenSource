/**
 * Wiflix routes.
 * Extracted from server.js -- Wiflix search, player extraction, and routes.
 * Mount point: app.use('/api/wiflix', router)
 */

const express = require("express");
const router = express.Router();
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");
const fsp = require("fs").promises;

const { memoryCache } = require("../config/redis");
const {
  generateCacheKey,
  saveToCache,
} = require("../utils/cacheManager");
const {
  makeWiflixRequest,
  makeWiflixSearchRequest,
} = require("../utils/proxyManager");
const { acquireRedisLock } = require("../utils/redisLock");
const { createWiflixRefreshState } = require("../utils/wiflixRefreshState");
const refreshState = createWiflixRefreshState();
const { respondWithResolvedSources } = require("../utils/embedExtraction");

// Wiflix range la map de langues à même l'épisode (`{ vf: [], vostfr: [] }`),
// sans enveloppe `languages` — d'où `languageKey: null`.
const respondWithEpisodeSources = (req, res, payload) =>
  respondWithResolvedSources(req, res, payload, { languageKey: null, label: "WIFLIX TV" });

const respondWithMovieSources = (req, res, payload) =>
  respondWithResolvedSources(req, res, payload, { movieMapKey: "players", label: "WIFLIX MOVIE" });
const {
  fetchTmdbDetails,
  fetchTmdbSeason,
} = require("../utils/tmdbCache");
// Movies are scraped from cinestream.info (flemmix's bot-shield is painful for
// films); TV stays on flemmix below. Same return shape, so the route + cache
// here consume it unchanged.
const { fetchCinestreamMovieData } = require("./cinestream");

const TMDB_API_KEY = process.env.TMDB_API_KEY || "";
const TMDB_API_URL = "https://api.themoviedb.org/3";
// Source rotates domains (flemmix.fast -> ...). Override via env, no code change.
const WIFLIX_BASE_URL = process.env.WIFLIX_BASE_URL || "https://flemmix.fast";

// === Cache helpers (local, since getFromCacheNoExpiration is not yet in cacheManager) ===
const getFromCacheNoExpiration = async (cacheDir, key, bypassMemory = false) => {
  try {
    const memKey = `${cacheDir}:${key}`;
    const memData = bypassMemory ? null : await memoryCache.get(memKey);
    if (memData) return memData;

    const cacheFilePath = path.join(cacheDir, `${key}.json`);
    let fileContent;
    try {
      fileContent = await fsp.readFile(cacheFilePath, "utf8");
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }

    const cacheData = JSON.parse(fileContent);
    if (
      typeof cacheData === "string" ||
      cacheData === null ||
      cacheData === undefined
    ) {
      try {
        await fsp.unlink(cacheFilePath);
      } catch {}
      return null;
    }

    await memoryCache.set(memKey, cacheData);
    return cacheData;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    console.error(
      `Erreur lors de la recuperation du cache pour ${key}:`,
      error,
    );
    return null;
  }
};

// === Utility Functions ===
const normalizeString = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

// Normalise un titre en retirant les termes generiques FR/EN (articles, "film/movie", etc.)
// pour comparer le "coeur" du titre (ex: "The Super Mario Galaxy Movie" → "super mario galaxy")
const stripTitleNoise = (str) => {
  return normalizeString(str)
    .replace(/\b(le film|the movie|the film|le movie|film|movie|movies|films)\b/g, '')
    .replace(/\b(the|a|an|le|la|les|l|un|une|des|de|du|d)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const prepareWiflixTitle = (str) => {
  const title = str.toLowerCase().replace(/\s+saison\s+\d+\b/g, "").trim();
  // Le site ajoute parfois l'année au titre : « From (2022) ».
  // Conserver les nombres du titre lui-même, comme « 1899 » ou « 1923 ».
  const yearMatch = title.match(/\s+(?:\(((?:19|20)\d{2})\)|\[((?:19|20)\d{2})\])$/);
  return {
    title: yearMatch ? title.slice(0, yearMatch.index).trim() : title,
    year: yearMatch ? yearMatch[1] || yearMatch[2] : null,
  };
};

const getLevenshteinSimilarity = (str1, str2) => {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matrix = [];
  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  const maxLength = Math.max(s1.length, s2.length);
  return maxLength === 0
    ? 1
    : (maxLength - matrix[s2.length][s1.length]) / maxLength;
};

function formatNextUpdate(ms) {
  if (ms <= 0) return 'imminent';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// === Search ===
async function searchWiflixMovie(title, baseUrl = WIFLIX_BASE_URL) {
  const searchUrl = `${baseUrl}/`;
  const payload = `do=search&subaction=search&story=${encodeURIComponent(title)}`;
  try {
    let responseBody = null;

    try {
      // Cookie handshake: GET homepage to harvest the bot-shield session cookie,
      // then POST the search with it + h_check=25 on the same proxy.
      const res = await makeWiflixSearchRequest(baseUrl + "/", searchUrl, {
        data: payload,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": baseUrl + "/",
          "Origin": baseUrl,
        },
        timeout: 15000,
      });
      responseBody = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      console.log(`[WIFLIX SEARCH] OK via proxy`);
    } catch (err) {
      console.log(`[WIFLIX SEARCH] Echec: ${err.message}`);
      return { url: null, debugHtml: 'Erreur: service temporairement indisponible' };
    }

    if (!responseBody || responseBody.includes("Un instant, s'il vous plait")) {
      return { url: null, debugHtml: responseBody || 'Challenge Cloudflare non resolu' };
    }

    const $ = cheerio.load(responseBody);
    // Template has no #dle-content wrapper. Real results are div.mov; the
    // "Populaires" reco block (#no-results-rec) is hidden when results exist —
    // exclude it exactly like the site's own JS result counter does.
    const movBlocks = $("div.mov").not("#no-results-rec .mov");
    if (movBlocks.length === 0) return { url: null, debugHtml: responseBody };

    let bestMatch = null;
    let bestSimilarity = 0;
    const { title: cleanSearchTitle, year: searchYear } = prepareWiflixTitle(title);

    movBlocks.each((_, block) => {
      const $block = $(block);
      const $titleLink = $block.find("a.mov-t");
      if (!$titleLink.length) return;

      const href = $titleLink.attr("href");
      if (!href) return;

      const resultTitle = $titleLink.text().trim();
      if (!resultTitle || resultTitle.length < 2) return;

      const resultTitleLower = resultTitle.toLowerCase();
      const hasBlockSai = $block.find(".block-sai").length > 0;
      const isSeries =
        href.includes("/serie-") ||
        resultTitleLower.includes("saison") ||
        /saison-\d+/i.test(href) ||
        hasBlockSai;
      const searchIsSeries = title.toLowerCase().includes("saison");

      if (searchIsSeries && !isSeries) return;
      if (!searchIsSeries && isSeries) return;

      if (searchIsSeries) {
        const searchSeasonMatch = title.match(/saison\s+(\d+)/i);
        if (searchSeasonMatch) {
          const searchSeason = parseInt(searchSeasonMatch[1]);

          let resultSeasonNum = null;
          const titleSeasonMatch = resultTitle.match(/saison\s+(\d+)/i);
          if (titleSeasonMatch) {
            resultSeasonNum = parseInt(titleSeasonMatch[1]);
          }
          if (resultSeasonNum === null) {
            const blockSaiText = $block.find(".block-sai").text().trim();
            const saiMatch =
              blockSaiText.match(/saison\s+(\d+)/i) ||
              blockSaiText.match(/^(\d+)/);
            if (saiMatch) {
              resultSeasonNum = parseInt(saiMatch[1]);
            }
          }
          if (resultSeasonNum === null) {
            const urlSeasonMatch = href.match(/saison-(\d+)/i);
            if (urlSeasonMatch) {
              resultSeasonNum = parseInt(urlSeasonMatch[1]);
            }
          }

          if (resultSeasonNum === null || searchSeason !== resultSeasonNum)
            return;
        }
      }

      const { title: cleanResultTitle, year: resultYear } = prepareWiflixTitle(resultTitle);
      if (searchYear && resultYear && searchYear !== resultYear) return;

      let similarity = 0;
      if (cleanResultTitle === cleanSearchTitle) {
        similarity = 1.0;
      } else {
        similarity = getLevenshteinSimilarity(
          cleanResultTitle,
          cleanSearchTitle,
        );
        // Fallback: comparer les titres sans bruit FR/EN ("The ... Movie" vs "Le Film")
        if (similarity < 0.85) {
          const coreSearch = stripTitleNoise(cleanSearchTitle);
          const coreResult = stripTitleNoise(cleanResultTitle);
          if (coreSearch && coreResult) {
            const coreSim = coreSearch === coreResult
              ? 1.0
              : getLevenshteinSimilarity(coreSearch, coreResult);
            similarity = Math.max(similarity, coreSim);
          }
        }
      }

      // Certains titres de séries portent un préfixe de franchise sur le site,
      // ex. « Game Of Thrones: House of the Dragon ». Accepter uniquement le
      // suffixe complet d'un titre de plusieurs mots, après contrôle de saison.
      // Un titre complet exact conserve la priorité (1 contre 0.95).
      const prefixEnd = cleanResultTitle.indexOf(":");
      if (searchIsSeries && prefixEnd > 0
        && stripTitleNoise(cleanSearchTitle).split(" ").filter(Boolean).length >= 2
        && normalizeString(cleanResultTitle.slice(prefixEnd + 1)) === normalizeString(cleanSearchTitle)) {
        similarity = Math.max(similarity, 0.95);
      }

      let fullUrl = href;
      if (fullUrl && !fullUrl.startsWith("http")) {
        fullUrl = fullUrl.startsWith("/")
          ? `${baseUrl}${fullUrl}`
          : `${baseUrl}/${fullUrl}`;
      }

      if (similarity >= 0.85 && similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = fullUrl ? encodeURI(fullUrl) : fullUrl;
      }
    });

    return { url: bestMatch, debugHtml: bestMatch ? null : responseBody };
  } catch (error) {
    if (error.response?.status === 403) {
      console.error(
        `[WIFLIX SEARCH] 403 Forbidden pour "${title}" sur ${searchUrl}`,
      );
    }
    return { url: null, debugHtml: 'Erreur: service temporairement indisponible' };
  }
}

// === Release Date Extraction ===
function extractWiflixReleaseDate($) {
  try {
    const releaseDateElement = $(
      "body > div:first-child > div > div > div > div > div > article > div:first-child > div:nth-child(2) > ul > li:nth-child(2) > div:nth-child(2)",
    );
    if (releaseDateElement.length > 0) {
      const dateText = releaseDateElement.text().trim();
      const yearMatch = dateText.match(/(\d{4})/);
      if (yearMatch) return parseInt(yearMatch[1]);
    }

    const fallbackSelectors = [
      "div.mov-desc",
      ".mov-desc",
      'li:contains("Annee") + li',
      'li:contains("Date") + li',
    ];
    for (const selector of fallbackSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        const text = element.text().trim();
        const yearMatch = text.match(/(\d{4})/);
        if (yearMatch) return parseInt(yearMatch[1]);
      }
    }
    return null;
  } catch (error) {
    console.error("[WIFLIX] Erreur lors de l'extraction de la date:", error);
    return null;
  }
}

// === Player Extraction ===
async function extractWiflixPlayers(pageUrl) {
  try {
    let rawHtml = null;

    try {
      const res = await makeWiflixRequest(pageUrl, {
        timeout: 15000,
        headers: {
          "Referer": WIFLIX_BASE_URL + "/",
        },
      });
      rawHtml = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      console.log(`[WIFLIX PLAYERS] OK via proxy`);
    } catch (err) {
      console.log(`[WIFLIX PLAYERS] Echec: ${err.message}`);
    }

    if (!rawHtml) {
      return { players: [], releaseYear: null, debugHtml: 'Impossible de charger la page' };
    }
    const $ = cheerio.load(rawHtml);
    const players = [];
    const releaseYear = extractWiflixReleaseDate($);

    const episodeDivs = $(
      'div[class*="ep"][class*="vf"], div[class*="ep"][class*="vs"]',
    );

    if (episodeDivs.length > 0) {
      episodeDivs.each((index, element) => {
        const $episodeDiv = $(element);
        const episodeClass = $episodeDiv.attr("class");
        const episodeMatch = episodeClass.match(/ep(\d+)(vf|vs)/);
        if (episodeMatch) {
          const episodeNumber = parseInt(episodeMatch[1]);
          const type = episodeMatch[2] === "vf" ? "VF" : "VOSTFR";
          $episodeDiv.find("a[onclick]").each((linkIndex, linkElement) => {
            const $link = $(linkElement);
            const onclick = $link.attr("onclick");
            // Template dropped the .clichost class (like the movie page) — match any span.
            const $span = $link.find("span");
            if (onclick && $span.length) {
              const match = onclick.match(/loadVideo\('([^']+)'/);
              if (match && match[1]) {
                let processedUrl = match[1];
                const name = $span.text().trim();
                if (processedUrl.includes("tipfly.xyz")) {
                  const tipflyMatch = processedUrl.match(
                    /tipfly\.xyz\/em-?\d+-(.+)/,
                  );
                  if (tipflyMatch && tipflyMatch[1])
                    processedUrl = `https://oneupload.net/embed-${tipflyMatch[1]}.html`;
                } else if (
                  name.toLowerCase() === "voe" ||
                  processedUrl.includes("jilliandescribecompany.com")
                ) {
                  processedUrl = processedUrl.replace(
                    /^https?:\/\/[^/]+/,
                    "https://voe.sx",
                  );
                }
                const domainMatch = processedUrl.match(
                  /https?:\/\/(?:www\.)?([^\/]+)/,
                );
                const domainName = domainMatch ? domainMatch[1] : name;
                players.push({
                  name: domainName,
                  url: processedUrl,
                  episode: episodeNumber,
                  type,
                });
              }
            }
          });
        }
      });
    } else {
      const filmLinks = $(".tabs-sel a[onclick]");
      filmLinks.each((index, element) => {
        const $link = $(element);
        const onclick = $link.attr("onclick");
        const $span = $link.find("span");
        if (onclick && $span.length) {
          const match = onclick.match(/loadVideo\('([^']+)'/);
          if (match && match[1]) {
            let processedUrl = match[1];
            const name = $span.text().trim();
            let type = "VF";
            if (name.toLowerCase().includes("vostfr")) type = "VOSTFR";
            if (processedUrl.includes("tipfly.xyz")) {
              const tipflyMatch = processedUrl.match(
                /tipfly\.xyz\/em-?\d+-(.+)/,
              );
              if (tipflyMatch && tipflyMatch[1])
                processedUrl = `https://oneupload.net/embed-${tipflyMatch[1]}.html`;
            } else if (
              name.toLowerCase() === "voe" ||
              processedUrl.includes("jilliandescribecompany.com")
            ) {
              processedUrl = processedUrl.replace(
                /^https?:\/\/[^/]+/,
                "https://voe.sx",
              );
            }
            const domainMatch = processedUrl.match(
              /https?:\/\/(?:www\.)?([^\/]+)/,
            );
            const domainName = domainMatch ? domainMatch[1] : name;
            players.push({
              name: domainName,
              url: processedUrl,
              episode: 1,
              type,
            });
          }
        }
      });
    }

    return { players, releaseYear, debugHtml: players.length === 0 ? rawHtml : null };
  } catch (error) {
    return {
      players: [],
      releaseYear: null,
      debugHtml: error.response?.data || error.message || null,
    };
  }
}

// === Data Fetching ===
// Movie data now comes from cinestream.info (see ./cinestream + updateWiflixCache).
// flemmix is still scraped for TV below.

async function fetchWiflixTvData(tmdbId, season, cachedData = null) {
  try {
    const [tmdbData, seasonData] = await Promise.all([
      fetchTmdbDetails(TMDB_API_URL, TMDB_API_KEY, tmdbId, "tv", "fr-FR"),
      fetchTmdbSeason(TMDB_API_URL, TMDB_API_KEY, tmdbId, season, "fr-FR"),
    ]);
    const originalData = tmdbData;

    if (!tmdbData || !seasonData) {
      if (cachedData) return cachedData;
      return {
        success: false,
        error: "Serie ou saison non trouvee sur TMDB",
        tmdb_id: tmdbId,
        season,
      };
    }

    const titlesToTry = [
      tmdbData.name,
      originalData.original_name,
      originalData.name,
    ]
      .filter(Boolean)
      .filter((title, index, arr) => arr.indexOf(title) === index);

    let seriesUrl = null;
    let searchDebugHtml = null;
    for (const title of titlesToTry) {
      const searchResult = await searchWiflixMovie(`${title} saison ${season}`);
      if (searchResult.url) { seriesUrl = searchResult.url; break; }
      searchDebugHtml = searchResult.debugHtml;
    }

    if (!seriesUrl)
      return {
        success: false,
        error: "Serie non trouvee sur Wiflix",
        tmdb_id: tmdbId,
        season,
        titles_tried: titlesToTry,
        debugHtml: searchDebugHtml,
      };

    const extractionResult = await extractWiflixPlayers(seriesUrl);
    const players = extractionResult.players;
    const wiflixReleaseYear = extractionResult.releaseYear;

    if (players.length === 0)
      return {
        success: false,
        error: "Aucun lecteur video trouve",
        tmdb_id: tmdbId,
        season,
        wiflix_url: seriesUrl,
        debugHtml: extractionResult.debugHtml,
      };

    if (wiflixReleaseYear) {
      const tmdbReleaseYear = seasonData.air_date
        ? new Date(seasonData.air_date).getFullYear()
        : null;
      if (tmdbReleaseYear && wiflixReleaseYear !== tmdbReleaseYear) {
        console.log(
          `[WIFLIX TV] Date mismatch: TMDB Season ${season} (${tmdbReleaseYear}) vs Wiflix ${wiflixReleaseYear} pour ${tmdbData.name}`,
        );
        return {
          success: false,
          error: "Serie non disponible sur Wiflix (date de sortie differente)",
          tmdb_id: tmdbId,
          season,
          wiflix_url: seriesUrl,
          tmdb_release_year: tmdbReleaseYear,
          wiflix_release_year: wiflixReleaseYear,
        };
      }
    }

    const episodes = {};
    players.forEach((player) => {
      const episodeNum = player.episode;
      if (!episodes[episodeNum]) episodes[episodeNum] = { vf: [], vostfr: [] };
      if (player.type === "VOSTFR") episodes[episodeNum].vostfr.push(player);
      else episodes[episodeNum].vf.push(player);
    });

    return {
      success: true,
      tmdb_id: tmdbId,
      title: tmdbData.name,
      original_title: originalData.original_name,
      season: parseInt(season),
      wiflix_url: seriesUrl,
      episodes,
      cache_timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[WIFLIX TV] Erreur: ${error.message}`);
    if (cachedData) {
      console.log(
        `[WIFLIX] Cache preserve malgre l'erreur pour tv ${tmdbId} saison ${season}`,
      );
      return cachedData;
    }
    return {
      success: false,
      error: "Erreur lors de la recuperation des donnees Wiflix",
      message: error.message,
      tmdb_id: tmdbId,
      season,
    };
  }
}

// === Background Cache Update ===
const WIFLIX_UPDATE_LOCK_TTL = 60; // 60s max per scrape — auto-expires if worker crashes

const updateWiflixCache = async (
  cacheDir,
  cacheKey,
  type,
  tmdbId,
  season = null,
) => {
  // Dedup cross-cluster: only one worker scrapes a given cacheKey at a time
  const lock = await acquireRedisLock(`wiflix:update:${cacheKey}`, {
    ttl: WIFLIX_UPDATE_LOCK_TTL,
    retries: 0, // Don't wait — if another worker is already on it, skip
  });
  if (!lock) return; // Another worker (or this one) is already updating this key

  try {
    // Une autre actualisation peut s'être terminée depuis la réponse au visiteur.
    const existingCache = await getFromCacheNoExpiration(cacheDir, cacheKey, true);
    if (await refreshState.remaining(cacheDir, cacheKey, existingCache) > 0) return;

    let newData;
    if (type === "movie")
      newData = await fetchCinestreamMovieData(tmdbId, existingCache);
    else if (type === "tv")
      newData = await fetchWiflixTvData(tmdbId, season, existingCache);
    else throw new Error(`Type non supporte: ${type}`);

    if (
      typeof newData === "string" &&
      newData.includes("Maintenance en cours")
    )
      throw new Error("Maintenance en cours - donnees invalides");
    if (
      typeof newData === "string" ||
      newData === null ||
      newData === undefined
    )
      throw new Error("Donnees invalides - non-JSON");

    if (newData) {
      const isFailedResult = newData.success === false;
      // Les extracteurs peuvent également retourner l'ancien objet sur panne.
      if (isFailedResult || newData === existingCache) {
        await refreshState.defer(cacheDir, cacheKey);
        if (existingCache?.success) return;
      }
      let saved;
      if (newData.success) {
        const { debugHtml: _dh, ...cacheableData } = newData;
        saved = await saveToCache(cacheDir, cacheKey, cacheableData);
      } else {
        saved = await saveToCache(cacheDir, cacheKey, newData);
      }
      if (saved === false) await refreshState.defer(cacheDir, cacheKey);
      else if (newData.success) await refreshState.clear(cacheDir, cacheKey);
    }
  } catch (error) {
    console.error(`[WIFLIX UPDATE] ${type} ${tmdbId}: ${error.message}`);
    await refreshState.defer(cacheDir, cacheKey).catch((retryError) => {
      console.error(`[WIFLIX UPDATE] Délai de reprise non enregistré: ${retryError.message}`);
    });
  } finally {
    await lock.release();
  }
};

// === Routes ===

// GET /movie/:tmdbId
router.get("/movie/:tmdbId", async (req, res) => {
  const { tmdbId } = req.params;
  const cacheKey = generateCacheKey(`wiflix_movie_${tmdbId}`);
  const cacheDir = path.join(__dirname, "..", "cache", "wiflix");

  try {
    await fsp.mkdir(cacheDir, { recursive: true });

    const cachedData = await getFromCacheNoExpiration(cacheDir, cacheKey);
    let dataReturned = false;

    if (cachedData) {
      const remaining = await refreshState.remaining(cacheDir, cacheKey, cachedData).catch(() => 0);
      const shouldSkipUpdate = remaining > 0;
      const nextUpdateIn = shouldSkipUpdate ? formatNextUpdate(remaining) : 'imminent';

      await respondWithMovieSources(req, res, { ...cachedData, next_update_in: nextUpdateIn });
      dataReturned = true;

      if (!shouldSkipUpdate)
        updateWiflixCache(cacheDir, cacheKey, "movie", tmdbId);
    }

    if (!dataReturned) {
      res.status(202).json({
        success: false,
        pending: true,
        message: "Recherche en cours, reessayez dans quelques secondes",
        tmdb_id: tmdbId,
      });

      updateWiflixCache(cacheDir, cacheKey, "movie", tmdbId);
    }
  } catch (error) {
    console.error(`[WIFLIX MOVIE] Erreur: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "Erreur lors de la recuperation des donnees Wiflix",
        message: error.message,
        tmdb_id: tmdbId,
      });
    }
  }
});

// GET /tv/:tmdbId/:season
router.get("/tv/:tmdbId/:season", async (req, res) => {
  const { tmdbId, season } = req.params;
  const cacheKey = generateCacheKey(`wiflix_tv_${tmdbId}_${season}`);
  const cacheDir = path.join(__dirname, "..", "cache", "wiflix");

  try {
    await fsp.mkdir(cacheDir, { recursive: true });

    const cachedData = await getFromCacheNoExpiration(cacheDir, cacheKey);
    let dataReturned = false;

    if (cachedData) {
      const remaining = await refreshState.remaining(cacheDir, cacheKey, cachedData).catch(() => 0);
      const shouldSkipUpdate = remaining > 0;
      const nextUpdateIn = shouldSkipUpdate ? formatNextUpdate(remaining) : 'imminent';

      await respondWithEpisodeSources(req, res, { ...cachedData, next_update_in: nextUpdateIn });
      dataReturned = true;

      if (!shouldSkipUpdate)
        updateWiflixCache(cacheDir, cacheKey, "tv", tmdbId, season);
    }

    if (!dataReturned) {
      res.status(202).json({
        success: false,
        pending: true,
        message: "Recherche en cours, reessayez dans quelques secondes",
        tmdb_id: tmdbId,
        season: parseInt(season),
      });

      updateWiflixCache(cacheDir, cacheKey, "tv", tmdbId, season);
    }
  } catch (error) {
    console.error(`[WIFLIX TV] Erreur: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "Erreur lors de la recuperation des donnees Wiflix",
        message: error.message,
        tmdb_id: tmdbId,
        season,
      });
    }
  }
});

module.exports = router;
