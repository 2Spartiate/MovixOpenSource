'use strict';

/** Partage uniquement le travail en cours ; sa durée ne dépend pas d'un appelant. */
function createSingleFlight() {
  const pending = new Map();
  return function run(key, task) {
    const existing = pending.get(key);
    if (existing) return existing;
    const promise = Promise.resolve().then(task);
    pending.set(key, promise);
    const cleanup = () => {
      if (pending.get(key) === promise) pending.delete(key);
    };
    // Les deux handlers absorbent le résultat de nettoyage sans créer de rejet orphelin.
    promise.then(cleanup, cleanup);
    return promise;
  };
}

module.exports = { createSingleFlight };
