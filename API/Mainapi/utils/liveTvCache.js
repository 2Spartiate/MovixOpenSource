'use strict';

const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createSingleFlight } = require('./singleFlight');
const { compactRefreshError } = require('./refreshError');

function freezeJson(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

// mtime alone does not detect a same-size atomic replacement on every filesystem.
function identity(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs ?? stat.mtime.getTime(),
    stat.ctimeMs ?? stat.ctime?.getTime()].join(':');
}

function createLiveTvDiskCache({ fs, directory, now = Date.now, maxEntries = 128,
  maxBytes = 32 * 1024 * 1024 }) {
  const memory = new Map();
  const queued = new Map();
  const readFlight = createSingleFlight();
  let bytes = 0;
  function forget(key) {
    bytes -= memory.get(key)?.bytes || 0;
    memory.delete(key);
  }
  function remember(key, entry) {
    forget(key);
    if (entry.bytes > maxBytes || maxEntries < 1) return;
    memory.set(key, entry);
    bytes += entry.bytes;
    while (memory.size > maxEntries || bytes > maxBytes) forget(memory.keys().next().value);
  }
  function serialize(key, task) {
    const previous = queued.get(key) || Promise.resolve();
    const promise = previous.catch(() => {}).then(task);
    queued.set(key, promise);
    const cleanup = () => { if (queued.get(key) === promise) queued.delete(key); };
    promise.then(cleanup, cleanup);
    return promise;
  }
  const filename = key => path.join(directory, `${key}.json`);

  async function read(key, maxAgeMs) {
    const entry = await readFlight(key, () => serialize(key, async () => {
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const before = await fs.stat(filename(key));
          const version = identity(before);
          const cached = memory.get(key);
          if (cached?.version === version) {
            memory.delete(key);
            memory.set(key, cached);
            return cached;
          }
          forget(key);
          const text = await fs.readFile(filename(key), 'utf8');
          const after = await fs.stat(filename(key));
          if (identity(after) !== version) continue;
          const loaded = { version, time: after.mtimeMs ?? after.mtime.getTime(),
            bytes: Buffer.byteLength(text), value: freezeJson(JSON.parse(text)) };
          remember(key, loaded);
          return loaded;
        }
        return null; // A concurrent publisher changed the file twice; retry next request.
      } catch (error) {
        forget(key);
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    }));
    // Each caller keeps its own TTL, even when sharing the same disk operation.
    return entry && now() - entry.time <= maxAgeMs ? entry.value : null;
  }

  function write(key, value) {
    // Snapshot before scheduling: later caller mutations cannot change publication.
    const text = JSON.stringify(value);
    return serialize(key, async () => {
      const temporary = `${filename(key)}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, text, 'utf8');
        await fs.rename(temporary, filename(key));
        // Re-read on the next access: another worker may already have replaced it.
        forget(key);
        return true;
      } catch (error) {
        await fs.unlink(temporary).catch(() => {});
        throw error;
      }
    });
  }

  function remove(key) {
    return serialize(key, async () => {
      await fs.unlink(filename(key));
      forget(key);
    });
  }
  return { read, write, remove };
}

// Refresh coordination keeps errors briefly, never marks stale data fresh.
function createLiveTvRefresh({ now = Date.now, retryMs = 15000, maxEntries = 256 } = {}) {
  const run = createSingleFlight();
  const failures = new Map();
  return (key, task, fallback) => run(key, async () => {
    const failure = failures.get(key);
    if (failure && now() < failure.until) {
      const stale = await fallback?.();
      if (stale != null) return stale;
      throw failure.error;
    }
    failures.delete(key);
    try {
      return await task();
    } catch (error) {
      failures.set(key, { error: compactRefreshError(error), until: now() + retryMs });
      while (failures.size > maxEntries) failures.delete(failures.keys().next().value);
      const stale = await fallback?.();
      if (stale != null) return stale;
      throw error;
    }
  });
}

module.exports = { createLiveTvDiskCache, createLiveTvRefresh };
