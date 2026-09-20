'use strict';

/** Cache borné d'agents : une éviction ne détruit jamais une requête encore active. */
function createProxyAgentPool({ createAgent, maxEntries = 32, idleTtlMs = 60_000, now = Date.now }) {
  const entries = new Map();
  function retire(key, entry) {
    if (entries.get(key) === entry) entries.delete(key);
    entry.retired = true;
    if (entry.users === 0) entry.agent.destroy();
  }
  function sweep() {
    const time = now();
    for (const [key, entry] of entries) {
      if (entry.users === 0 && time - entry.lastUsed >= idleTtlMs) retire(key, entry);
    }
  }
  function acquire(key) {
    sweep();
    let entry = entries.get(key);
    if (!entry) {
      if (entries.size >= maxEntries) {
        const idle = [...entries].filter(([, value]) => value.users === 0)
          .sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
        if (idle) retire(...idle);
      }
      const cached = entries.size < maxEntries;
      // Cache plein et occupé : connexion ponctuelle, sans interrompre les utilisateurs actifs.
      entry = { agent: createAgent(key, cached), users: 0, lastUsed: now(), retired: !cached };
      if (cached) entries.set(key, entry);
    }
    entry.users++;
    let released = false;
    return {
      agent: entry.agent,
      release(discard = false) {
        if (released) return;
        released = true;
        entry.users--;
        entry.lastUsed = now();
        if (discard && !entry.retired) retire(key, entry);
        else if (entry.retired && entry.users === 0) entry.agent.destroy();
      },
    };
  }
  return {
    acquire, sweep,
    clear() { for (const [key, entry] of entries) retire(key, entry); },
  };
}

module.exports = { createProxyAgentPool };
