/**
 * FrenchStream helper module.
 * Extracted from server.js -- retrieves Omega sources directly from FrenchCloud.
 * This is NOT an Express router; it exports plain functions used by tmdb.js.
 */

const cheerio = require('cheerio');
const axios = require('axios');

const FRENCHSTREAM_BASE_URL = 'https://frenchstream.food';
const FRENCHCLOUD_BASE_URL = 'https://frenchcloud.cam';

// ---------------------------------------------------------------------------
// Dependencies injected via configure()
// ---------------------------------------------------------------------------
let axiosFrenchStreamRequest;
let findTvSeriesOnTMDB;

/**
 * Inject runtime dependencies that still live in server.js.
 */
function configure(deps) {
  if (deps.axiosFrenchStreamRequest) axiosFrenchStreamRequest = deps.axiosFrenchStreamRequest;
  if (deps.findTvSeriesOnTMDB) findTvSeriesOnTMDB = deps.findTvSeriesOnTMDB;
}

function getFrenchCloudUrl(type, imdbId) {
  // Conserver les zéros initiaux de l'identifiant IMDb.
  const id = String(imdbId).replace(/^tt/i, '');
  if (!/^\d+$/.test(id)) throw new Error('Identifiant IMDb invalide');
  return `${FRENCHCLOUD_BASE_URL}/${type}/${id}`;
}

function requestFrenchCloud(url) {
  return axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': `${FRENCHCLOUD_BASE_URL}/`,
    },
    timeout: 15000,
    decompress: true,
  });
}

function normalizeFrenchCloudPlayerLink(value) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value, FRENCHCLOUD_BASE_URL);
    if (!['http:', 'https:'].includes(url.protocol) ||
        url.hostname === 'frenchcloud.cam' || url.hostname.endsWith('.frenchcloud.cam')) return null;
    return url.href;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// getFrenchStreamMovie
// ---------------------------------------------------------------------------
async function getFrenchStreamMovie(imdbId) {
  try {
    const iframeSrc = getFrenchCloudUrl('film', imdbId);
    const iframeResponse = await requestFrenchCloud(iframeSrc);

    const $iframe = cheerio.load(iframeResponse.data);
    if (!$iframe('._player').length) throw new Error('Page FrenchCloud invalide');
    const playerLinks = [];

    $iframe('._source_list li[data-link], ._player-mirrors li[data-link]').each((index, element) => {
      const $element = $iframe(element);
      const link = normalizeFrenchCloudPlayerLink($element.attr('data-link'));
      const playerName = $element.text().trim();
      const isHD = $element.hasClass('fullhd');

      if (!link || playerLinks.some(player => player.link === link)) return;

      playerLinks.push({
        player: playerName,
        link,
        is_hd: isHD
      });
    });

    return {
      iframe_src: iframeSrc,
      player_links: playerLinks
    };

  } catch (error) {
    if (error.response?.status === 404) return { error: 'Movie not found on FrenchCloud' };
    return { error: `Failed to fetch movie data: ${error.message}` };
  }
}

// ---------------------------------------------------------------------------
// getFrenchStreamSeries
// ---------------------------------------------------------------------------
async function getFrenchStreamSeries(id) {
  try {
    const link = getFrenchCloudUrl('serial', id);
    const details = await getFrenchStreamSeriesDetails(link, id);
    if (details.error) return details;
    const episodeCount = details.seasons.reduce((count, season) => count + season.episodes.length, 0);
    if (!episodeCount) return [];

    const languages = new Set(details.seasons.flatMap(season =>
      season.episodes.flatMap(episode => Object.keys(episode.versions))));
    return [{
      ...details,
      link,
      poster: null,
      audio_type: [...languages].map(language => language.toUpperCase()).join(' / '),
      episode_count: episodeCount,
    }];
  } catch (error) {
    return { error: `Erreur lors de la recuperation des series: ${error.message}` };
  }
}

// ---------------------------------------------------------------------------
// getFrenchStreamSeriesDetails
// ---------------------------------------------------------------------------
async function getFrenchStreamSeriesDetails(seriesUrl, originalTitle) {
  try {
    const response = await requestFrenchCloud(seriesUrl);
    const $ = cheerio.load(response.data);
    if (!$('._root').length) throw new Error('Page FrenchCloud invalide');

    const title = $('title').text().trim() || originalTitle;
    const seasonNumbers = new Map();
    $('._stab[data-season]').each((_, element) => {
      const tab = $(element);
      const match = tab.text().match(/\d+/);
      if (match) seasonNumbers.set(tab.attr('data-season'), Number(match[0]));
    });

    const seasons = [];
    $('._grp[data-season]').each((_, element) => {
      const group = $(element);
      // data-season est un ID interne ; le numéro réel est dans l'onglet S1, S2…
      const label = group.find('._ep[data-label]').first().attr('data-label') || '';
      const seasonMatch = label.match(/\bS(\d+)\b/i);
      const seasonNumber = seasonNumbers.get(group.attr('data-season')) ??
        (seasonMatch ? Number(seasonMatch[1]) : null);
      if (seasonNumber === null) return;

      const episodes = new Map();
      group.find('._ep[data-link]').each((_, episodeElement) => {
        const episode = $(episodeElement);
        const link = normalizeFrenchCloudPlayerLink(episode.attr('data-link'));
        if (!link) return;

        const episodeLabel = episode.attr('data-label') || '';
        const numberMatch = episodeLabel.match(/\bE(\d+)\b/i) ||
          episode.find('._epn').text().match(/\d+/);
        if (!numberMatch) return;
        const number = String(Number(numberMatch[1] || numberMatch[0]));
        const episodeTitle = episode.find('._ept').text().trim() || episodeLabel || `Épisode ${number}`;
        const language = /vostfr/i.test(episodeLabel + ' ' + episodeTitle) ? 'vostfr' : 'vf';
        if (!episodes.has(number)) episodes.set(number, { number, versions: {} });
        const versions = episodes.get(number).versions;
        if (!versions[language]) versions[language] = { title: episodeTitle, players: [] };
        if (!versions[language].players.some(player => player.link === link)) {
          versions[language].players.push({ name: new URL(link).hostname, link });
        }
      });

      seasons.push({
        number: seasonNumber,
        title: `Saison ${seasonNumber}`,
        episodes: [...episodes.values()].sort((a, b) => Number(a.number) - Number(b.number)),
      });
    });
    seasons.sort((a, b) => a.number - b.number);

    // L'embed ne fournit plus la date de sortie ni le synopsis de FrenchStream.
    const tmdbData = title && seasons.some(season => season.episodes.length) && findTvSeriesOnTMDB
      ? await findTvSeriesOnTMDB(title, null, null)
      : null;
    return {
      title,
      release_date: null,
      summary: null,
      tmdb_data: tmdbData,
      seasons,
    };
  } catch (error) {
    if (error.response?.status === 404) return { error: 'Series not found on FrenchCloud (404)' };
    return { error: `Failed to fetch series details: ${error.message}` };
  }
}

// ---------------------------------------------------------------------------
// extractSeriesInfo  -- helper to extract base name and part number
// ---------------------------------------------------------------------------
const extractSeriesInfo = (title) => {
  let baseName = title;
  let partNumber = 1; // Default to part 1
  let seasonInfo = {}; // Store season range if present

  // Match "Part X (Saison Y - Z)"
  const partMatch = title.match(/\s*Part\s+(\d+)\s*\(Saison\s+(\d+)\s*-\s*(\d+)\)/i);
  if (partMatch) {
    partNumber = parseInt(partMatch[1]);
    seasonInfo = {
      part: partNumber,
      start: parseInt(partMatch[2]),
      end: parseInt(partMatch[3])
    };
    // Remove the Part info from the base name
    baseName = baseName.replace(/\s*Part\s+\d+\s*\(Saison\s+\d+\s*-\s*\d+\)/i, '');
  }

  // Remove trailing "- Saison X"
  baseName = baseName.replace(/\s*-\s*Saison\s+\d+$/i, '');

  // Remove potential year in parenthesis if not already removed by part info
  baseName = baseName.replace(/\s*\(\d{4}\)/, '');

  return { baseName: baseName.trim(), partNumber, seasonInfo };
};

// ---------------------------------------------------------------------------
// mergeSeriesParts  -- merge multiple parts of a series
// ---------------------------------------------------------------------------
const mergeSeriesParts = (parts) => {
  if (!parts || parts.length === 0) {
    return null;
  }
  if (parts.length === 1) {
    return parts[0]; // Nothing to merge
  }

  // Sort parts by partNumber (extracted during grouping)
  parts.sort((a, b) => a.partNumber - b.partNumber);

  const mainPart = parts[0];
  const mergedSeasons = [...(mainPart.seasons || [])]; // Start with seasons from part 1

  // Track the maximum season number added so far
  let maxSeasonNumberSoFar = 0;
  if (mergedSeasons.length > 0) {
    maxSeasonNumberSoFar = Math.max(...mergedSeasons.map(s => s.number));
  }

  for (let i = 1; i < parts.length; i++) {
    const currentPart = parts[i];

    // Calculate the adjustment based on the max season number from the *previous* merged parts
    const adjustment = maxSeasonNumberSoFar;

    if (!currentPart.seasons || currentPart.seasons.length === 0) {
      console.log(`    Part ${currentPart.partNumber} has no seasons to merge.`);
      continue;
    }

    console.log(`    Adjusting ${currentPart.seasons.length} season(s) for Part ${currentPart.partNumber}.`);

    let partMaxSeason = 0; // Track max season added *in this part*
    currentPart.seasons.forEach(season => {
      const originalSeasonNumber = season.number;
      // The adjusted season number is the previous max + the original number from this part
      const adjustedSeasonNumber = adjustment + originalSeasonNumber;
      console.log(`      Merging Season ${originalSeasonNumber} -> ${adjustedSeasonNumber}`);

      // Create a new season object to avoid modifying the original
      const adjustedSeason = {
        ...season,
        number: adjustedSeasonNumber,
        // Adjust title like "Saison X"
        title: `Saison ${adjustedSeasonNumber}`
      };
      mergedSeasons.push(adjustedSeason);
      if (adjustedSeasonNumber > partMaxSeason) {
        partMaxSeason = adjustedSeasonNumber;
      }
    });
    // Update the overall max season number
    maxSeasonNumberSoFar = partMaxSeason;
  }

  // Return the main part with merged seasons
  // Ensure seasons are sorted correctly after merging
  mergedSeasons.sort((a, b) => a.number - b.number);

  return {
    ...mainPart, // Use metadata from the main part
    seasons: mergedSeasons
  };
};

// ---------------------------------------------------------------------------
// cleanTvCacheData  -- helper to clean TV cache data before sending
// ---------------------------------------------------------------------------
const cleanTvCacheData = (cachedData) => {
  if (!cachedData || !cachedData.series) {
    return cachedData; // Return as is if structure is unexpected
  }
  return {
    type: cachedData.type || 'tv', // ensure type is present
    series: (cachedData.series || []).map(s => ({
      title: s.title || s.baseName, // Use baseName if available
      audio_type: s.audio_type,
      episode_count: s.episode_count,
      release_date: s.release_date,
      summary: s.summary,
      tmdb_data: s.tmdb_data ? {
        id: s.tmdb_data.id,
        name: s.tmdb_data.name,
        overview: s.tmdb_data.overview,
        first_air_date: s.tmdb_data.first_air_date,
        poster_path: s.tmdb_data.poster_path,
        backdrop_path: s.tmdb_data.backdrop_path,
        vote_average: s.tmdb_data.vote_average,
        match_score: s.tmdb_data.match_score,
        is_season_part: s.tmdb_data.is_season_part, // Include season part info
        season_offset: s.tmdb_data.season_offset
      } : null,
      seasons: s.seasons || []
    }))
  };
};

// ---------------------------------------------------------------------------
// checkFrenchStreamVersion
// ---------------------------------------------------------------------------
async function checkFrenchStreamVersion(imdbId) {
  try {
    const url = `${FRENCHSTREAM_BASE_URL}/xfsearch/${imdbId}`;
    const response = await axiosFrenchStreamRequest({ method: 'get', url });
    const $ = cheerio.load(response.data);

    // Recherche de la version du film avec le XPath fourni
    const versionElement = $('*[id="dle-content"] div div span:nth-child(2) a');
    const version = versionElement.text().trim();

    return {
      version: version || 'Unknown',
      url: versionElement.attr('href') || null
    };
  } catch (error) {
    return { version: 'Unknown', url: null };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  configure,
  getFrenchStreamMovie,
  getFrenchStreamSeries,
  getFrenchStreamSeriesDetails,
  extractSeriesInfo,
  mergeSeriesParts,
  cleanTvCacheData,
  checkFrenchStreamVersion
};
