const crypto = require('node:crypto');

const DEFAULT_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_MAX_ENTRIES = 128;
const DEFAULT_MAX_BYTES = 512 * 1_024;
const DEFAULT_MAX_ENTRY_BYTES = 128 * 1_024;
const DEFAULT_REDIS_TIMEOUT_MS = 50;
const DEFAULT_MAX_IN_FLIGHT = 32;
const DEFAULT_MAX_REDIS_OPERATIONS = 32;
const CACHE_ENVELOPE_BYTES = 1_024;

function boundedInteger(value, fallback, maximum, label) {
  const resolved = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(resolved) || resolved <= 0 || resolved > maximum) {
    throw new TypeError(`${label} invalide`);
  }
  return resolved;
}

function serialise(value) {
  try {
    const encoded = JSON.stringify(value);
    return typeof encoded === 'string' ? encoded : null;
  } catch {
    return null;
  }
}

function validTitle(value) {
  return typeof value === 'string' && value.trim() && value.length <= 500 && !value.includes('\0');
}

function validSearch(value) {
  return Array.isArray(value) && value.length <= 1_000 && value.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !Number.isSafeInteger(entry.id) || entry.id <= 0) {
      return false;
    }
    return validTitle(entry.title) || validTitle(entry.name) || validTitle(entry.dramaName);
  });
}

function validDrama(value, dramaId) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && value.id === dramaId && validTitle(value.title) && Array.isArray(value.episodes)
    && value.episodes.length <= 1_000 && value.episodes.every((episode) => (
      episode && typeof episode === 'object' && !Array.isArray(episode)
      && Number.isSafeInteger(episode.id) && episode.id > 0
      && Number.isFinite(episode.number) && episode.number >= 0
    ));
}

function createKisskhMetadataCache(deps = {}) {
  const redis = deps.redis;
  const now = deps.now || Date.now;
  const ttlMs = boundedInteger(deps.ttlMs, DEFAULT_TTL_MS, 60 * 60 * 1_000, 'TTL metadata KissKH');
  const maxEntries = boundedInteger(deps.maxEntries, DEFAULT_MAX_ENTRIES, 4_096, 'taille cache metadata KissKH');
  const maxBytes = boundedInteger(deps.maxBytes, DEFAULT_MAX_BYTES, 8 * 1_024 * 1_024, 'poids cache metadata KissKH');
  const maxEntryBytes = boundedInteger(
    deps.maxEntryBytes,
    Math.min(DEFAULT_MAX_ENTRY_BYTES, maxBytes),
    maxBytes,
    'entree cache metadata KissKH',
  );
  const redisTimeoutMs = boundedInteger(deps.redisTimeoutMs, DEFAULT_REDIS_TIMEOUT_MS, 1_000, 'delai Redis metadata KissKH');
  const maxInFlight = boundedInteger(deps.maxInFlight, DEFAULT_MAX_IN_FLIGHT, 256, 'vols metadata KissKH');
  const maxRedisOperations = boundedInteger(
    deps.maxRedisOperations,
    DEFAULT_MAX_REDIS_OPERATIONS,
    64,
    'operations Redis metadata KissKH',
  );
  if (typeof now !== 'function') throw new TypeError('cache metadata KissKH invalide');

  const entries = new Map();
  const inFlight = new Map();
  let bytes = 0;
  let redisOperations = 0;

  function keyFor(kind, providerOrigin, identity) {
    const digest = crypto.createHash('sha256')
      .update(JSON.stringify([providerOrigin, kind, identity]), 'utf8')
      .digest('hex');
    return { local: `${kind}:${providerOrigin}:${identity}`, redis: `kisskh:metadata:v1:${kind}:${digest}` };
  }

  function forget(key) {
    const entry = entries.get(key);
    if (!entry) return;
    bytes -= entry.bytes;
    entries.delete(key);
  }

  function remember(key, serialized, expiresAt) {
    const size = Buffer.byteLength(serialized, 'utf8');
    if (size > maxEntryBytes || size > maxBytes) return false;
    forget(key);
    entries.set(key, { serialized, expiresAt, bytes: size });
    bytes += size;
    while (entries.size > maxEntries || bytes > maxBytes) forget(entries.keys().next().value);
    return true;
  }

  function readLocal(key) {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      forget(key);
      return null;
    }
    entries.delete(key);
    entries.set(key, entry);
    return JSON.parse(entry.serialized);
  }

  async function withinRedisBudget(work) {
    if (typeof work !== 'function') return null;
    if (redisOperations >= maxRedisOperations) return null;
    redisOperations += 1;
    const operation = Promise.resolve().then(work).catch(() => null);
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), redisTimeoutMs);
    });
    void operation.finally(() => {
      clearTimeout(timer);
      redisOperations -= 1;
    });
    return Promise.race([operation, timeout]);
  }

  async function readShared(redisKey, validator, localKey) {
    if (typeof redis?.get !== 'function' || (redis.status !== undefined && redis.status !== 'ready')) return null;
    const raw = await withinRedisBudget(() => redis.get(redisKey));
    if (typeof raw !== 'string') return null;
    if (Buffer.byteLength(raw, 'utf8') > maxEntryBytes + CACHE_ENVELOPE_BYTES) return null;
    let record;
    try { record = JSON.parse(raw); } catch { return null; }
    if (!record || typeof record !== 'object' || Array.isArray(record)
        || !Number.isSafeInteger(record.expiresAt) || record.expiresAt <= now()
        || record.expiresAt > now() + ttlMs || !validator(record.value)) return null;
    const serialized = serialise(record.value);
    if (!serialized || Buffer.byteLength(serialized, 'utf8') > maxEntryBytes) return null;
    remember(localKey, serialized, record.expiresAt);
    return serialized;
  }

  async function writeShared(redisKey, serialized, expiresAt) {
    if (typeof redis?.set !== 'function' || (redis.status !== undefined && redis.status !== 'ready')) return;
    const seconds = Math.max(1, Math.ceil((expiresAt - now()) / 1_000));
    const record = `{\"expiresAt\":${expiresAt},\"value\":${serialized}}`;
    if (Buffer.byteLength(record, 'utf8') > maxEntryBytes + CACHE_ENVELOPE_BYTES) return;
    await withinRedisBudget(() => redis.set(redisKey, record, 'EX', seconds));
  }

  async function load(kind, providerOrigin, identity, validator, fetcher) {
    const keys = keyFor(kind, providerOrigin, identity);
    const local = readLocal(keys.local);
    if (local !== null) return local;
    if (inFlight.has(keys.local)) {
      const result = await inFlight.get(keys.local);
      return result.cached ? JSON.parse(result.serialized) : result.value;
    }

    const fetchAndRemember = async () => {
      const result = await fetcher();
      if (!validator(result)) return { cached: false, value: result };
      const serialized = serialise(result);
      if (!serialized || Buffer.byteLength(serialized, 'utf8') > maxEntryBytes) {
        // Keep a serialized in-flight result so concurrent callers receive
        // independent copies, while deliberately skipping cache storage.
        return serialized ? { cached: true, serialized } : { cached: false, value: result };
      }
      const expiresAt = now() + ttlMs;
      remember(keys.local, serialized, expiresAt);
      // Shared writes are opportunistic and must never delay a trusted response.
      void writeShared(keys.redis, serialized, expiresAt);
      return { cached: true, serialized };
    };

    // Do not enqueue an unbounded number of keys behind an unavailable Redis.
    // The caller's existing metadata concurrency limit still governs this fallback.
    if (inFlight.size >= maxInFlight) {
      const result = await fetchAndRemember();
      return result.cached ? JSON.parse(result.serialized) : result.value;
    }

    // Register before the first await: a Redis miss may otherwise let a later
    // caller miss the local result published by the first caller.
    const operation = (async () => {
      const shared = await readShared(keys.redis, validator, keys.local);
      if (shared !== null) return { cached: true, serialized: shared };
      return fetchAndRemember();
    })();
    inFlight.set(keys.local, operation);
    try {
      const result = await operation;
      return result.cached ? JSON.parse(result.serialized) : result.value;
    } finally {
      inFlight.delete(keys.local);
    }
  }

  return Object.freeze({
    search(providerOrigin, query, type, fetcher) {
      return load('search', providerOrigin, `${type}:${query}`, validSearch, fetcher);
    },
    drama(providerOrigin, dramaId, fetcher) {
      return load('drama', providerOrigin, String(dramaId), (value) => validDrama(value, dramaId), fetcher);
    },
  });
}

module.exports = { createKisskhMetadataCache };
