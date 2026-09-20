const writeFileAtomic = require('write-file-atomic');

function isCompleteCatalog(channels) {
  return Array.isArray(channels) && channels.length > 0;
}

async function publishNorthliveCatalog(filePath, channels, writer = writeFileAtomic) {
  try {
    await writer(filePath, JSON.stringify(channels), { encoding: 'utf8', fsync: false });
    return true;
  } catch {
    return false;
  }
}

async function scrapeNorthlivePages({ fetchPage, mapChannel, maxPages = 40 }) {
  const seen = new Set();
  const channels = [];
  let totalPages = null;

  for (let page = 1; page <= maxPages; page++) {
    let response;
    try {
      response = await fetchPage(page);
    } catch {
      return null;
    }
    const data = response?.data?.data;
    const pagination = response?.data?.pagination;
    const total = Number(pagination?.total);
    const perPage = Number(pagination?.per_page);
    if (!Array.isArray(data) || !Number.isSafeInteger(total) || total <= 0 ||
        !Number.isSafeInteger(perPage) || perPage <= 0) {
      return null;
    }
    const announcedPages = Math.ceil(total / perPage);
    if (announcedPages > maxPages || (totalPages !== null && totalPages !== announcedPages) || page > announcedPages) {
      return null;
    }
    totalPages = announcedPages;
    // Every advertised page must contain records. In particular, accepting an
    // empty final page would turn a partial response into a published snapshot.
    if (data.length === 0) return null;

    for (const channel of data) {
      const mapped = mapChannel(channel);
      if (!mapped || seen.has(mapped.slug)) continue;
      seen.add(mapped.slug);
      channels.push(mapped);
    }

    if (page === totalPages) return channels.length ? channels : null;
  }

  // The safety cap stopped traversal before the upstream's advertised end.
  return null;
}

/**
 * Coordinates one Northlive publisher with cache-only readers. The caller
 * supplies storage and scraping so this module stays deterministic in tests.
 */
function createNorthliveCatalog({
  isOwner,
  readFresh,
  readStale,
  publish,
  scrape,
  logger = console,
  now = Date.now,
  cacheCheckMs = 1000,
}) {
  let memory = [];
  let refreshInFlight = null;
  let cacheReadInFlight = null;
  let nextCacheRead = 0;
  let publication = 0;

  async function readCached() {
    if (now() < nextCacheRead) return memory;
    if (cacheReadInFlight) return cacheReadInFlight;
    const startedAtPublication = publication;
    cacheReadInFlight = (async () => {
      const fresh = await readFresh();
      const cached = isCompleteCatalog(fresh) ? fresh : await readStale();
      // A read started before the owner published must not restore its old JSON.
      if (publication === startedAtPublication && isCompleteCatalog(cached)) memory = cached;
      return memory;
    })().finally(() => {
      nextCacheRead = now() + cacheCheckMs;
      cacheReadInFlight = null;
    });
    return cacheReadInFlight;
  }

  async function refresh() {
    if (!isOwner) return readCached();
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      try {
        const channels = await scrape();
        if (!isCompleteCatalog(channels)) {
          logger.warn('[NORTHLIVE] Catalogue incomplet — conservation du précédent');
          return readCached();
        }
        const saved = await publish(channels);
        if (!saved) {
          logger.warn('[NORTHLIVE] Publication échouée — conservation du précédent catalogue');
          return readCached();
        }
        publication++;
        memory = channels;
        nextCacheRead = now() + cacheCheckMs;
        return channels;
      } catch (error) {
        logger.warn(`[NORTHLIVE] Rafraîchissement échoué: ${error.message}`);
        return readCached();
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  }

  async function getChannels({ force = false } = {}) {
    if (isOwner && force) return refresh();
    const cached = await readCached();
    if (isCompleteCatalog(cached) || !isOwner) return cached;
    return refresh();
  }

  return { getChannels, refresh, isOwner: Boolean(isOwner) };
}

module.exports = {
  createNorthliveCatalog,
  isCompleteCatalog,
  publishNorthliveCatalog,
  scrapeNorthlivePages,
};
