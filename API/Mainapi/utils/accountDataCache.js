const fsp = require('node:fs/promises');

function fileVersion(stats) {
  return [stats.dev, stats.ino, stats.size, stats.mtimeNs, stats.ctimeNs].join(':');
}

// Les objets retournés sont partagés en lecture seule. Un appelant qui modifie
// le compte doit en faire une copie ; aucun état d'autorisation SQL n'est caché.
function createAccountDataCache({
  fs = fsp,
  maxEntries = 256,
  maxBytes = 8 * 1024 * 1024,
  maxEntryBytes = 1024 * 1024,
  maxAgeMs = 60_000,
  now = Date.now,
} = {}) {
  const entries = new Map();
  const pending = new Map();
  let totalBytes = 0;

  function forget(filename) {
    const previous = entries.get(filename);
    if (previous) totalBytes -= previous.bytes;
    entries.delete(filename);
  }

  async function load(filename) {
    const handle = await fs.open(filename, 'r');
    try {
      // Le descripteur reste lié au bon fichier même si un autre worker le
      // remplace par rename entre le stat du chemin et la lecture.
      const before = await handle.stat({ bigint: true });
      const raw = await handle.readFile('utf8');
      const after = await handle.stat({ bigint: true });
      const parsed = JSON.parse(raw);
      const data = parsed && typeof parsed === 'object' ? parsed : null;
      const bytes = Buffer.byteLength(raw, 'utf8');
      if (fileVersion(before) === fileVersion(after)
          && bytes <= maxEntryBytes && bytes <= maxBytes && maxEntries > 0) {
        forget(filename);
        while (entries.size >= maxEntries || totalBytes + bytes > maxBytes) {
          forget(entries.keys().next().value);
        }
        entries.set(filename, { data, bytes, version: fileVersion(after), loadedAt: now() });
        totalBytes += bytes;
      }
      return data;
    } finally {
      await handle.close();
    }
  }

  async function read(filename) {
    let version;
    try {
      version = fileVersion(await fs.stat(filename, { bigint: true }));
    } catch (error) {
      forget(filename);
      throw error;
    }
    const cached = entries.get(filename);
    if (cached?.version === version && now() - cached.loadedAt < maxAgeMs) {
      entries.delete(filename);
      entries.set(filename, cached);
      return cached.data;
    }
    forget(filename);

    const running = pending.get(filename);
    if (running?.version === version) return running.promise;
    const entry = { version };
    entry.promise = load(filename).finally(() => {
      if (pending.get(filename) === entry) pending.delete(filename);
    });
    // La carte des lectures partagées est également bornée ; les requêtes
    // excédentaires lisent normalement sans conserver de référence globale.
    if (pending.size < maxEntries || pending.has(filename)) pending.set(filename, entry);
    return entry.promise;
  }

  return { read };
}

const accountDataCache = createAccountDataCache();
module.exports = { createAccountDataCache, readAccountData: accountDataCache.read };
