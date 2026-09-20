'use strict';
const { createHash } = require('node:crypto');

// Uniquement le HTML public de recherche, jamais une session ou des liens résolus.
function createFStreamSearchCache({ redis = null, now = Date.now, ttlMs = 30_000,
  maxEntries = 128, maxBytes = 1024 * 1024, maxEntryBytes = 128 * 1024,
  maxInFlight = 32, maxRedisOperations = 16, redisTimeoutMs = 50 } = {}) {
  const entries = new Map();
  const inFlight = new Map();
  let bytes = 0;
  let redisOperations = 0;
  const valid = html => typeof html === 'string'
    && Buffer.byteLength(html) <= maxEntryBytes
    && /class\s*=\s*["'][^"']*\bsearch-item\b/i.test(html)
    && !/bot shield active|cf-chl-|just a moment|verification\.\.\./i.test(html);

  function forget(key) {
    const entry = entries.get(key);
    if (entry) bytes -= entry.bytes;
    entries.delete(key);
  }
  function remember(key, html, expiresAt) {
    const size = Buffer.byteLength(html);
    if (size > maxBytes) return;
    forget(key);
    entries.set(key, { html, expiresAt, bytes: size });
    bytes += size;
    while (entries.size > maxEntries || bytes > maxBytes) forget(entries.keys().next().value);
  }
  async function redisCall(work) {
    if (!redis || (redis.status !== undefined && redis.status !== 'ready')
        || redisOperations >= maxRedisOperations) return null;
    redisOperations++;
    let timer;
    const operation = Promise.resolve().then(work).catch(() => null);
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), redisTimeoutMs); });
    void operation.finally(() => { clearTimeout(timer); redisOperations--; });
    return Promise.race([operation, timeout]);
  }
  async function readShared(key) {
    const raw = await redisCall(() => redis.get(key));
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > maxEntryBytes * 2 + 1024) return null;
    try {
      const entry = JSON.parse(raw);
      if (!Number.isSafeInteger(entry?.expiresAt) || entry.expiresAt <= now()
          || entry.expiresAt > now() + ttlMs || !valid(entry.html)) return null;
      remember(key, entry.html, entry.expiresAt);
      return entry.html;
    } catch { return null; }
  }
  async function fetchAndCache(key, fetcher) {
    const html = await fetcher();
    if (valid(html)) {
      const expiresAt = now() + ttlMs;
      remember(key, html, expiresAt);
      void redisCall(() => redis.set(key, JSON.stringify({ html, expiresAt }), 'PX', ttlMs));
    }
    return html;
  }
  return {
    async load(endpoint, query, page, fetcher) {
      // Garder casse et accents : des titres différents ne doivent pas fusionner.
      const normalized = String(query).trim().replace(/\s+/g, ' ');
      const key = 'fstream:search:v1:' + createHash('sha256')
        .update(JSON.stringify([endpoint, normalized, String(page)])).digest('hex');
      const local = entries.get(key);
      if (local && local.expiresAt > now()) {
        entries.delete(key);
        entries.set(key, local);
        return local.html;
      }
      if (local) forget(key);
      if (inFlight.has(key)) return inFlight.get(key);
      const fetch = () => fetchAndCache(key, () => fetcher(normalized));
      // Redis et la table des promesses restent bornés même lors d'une panne.
      if (inFlight.size >= maxInFlight) return fetch();
      const operation = (async () => (await readShared(key)) ?? fetch())();
      inFlight.set(key, operation);
      try { return await operation; }
      finally { inFlight.delete(key); }
    },
  };
}

module.exports = { createFStreamSearchCache };
