function isNorthliveRefreshOwner(env = process.env) {
  // A process started outside server.js has no slot and can maintain its local
  // catalogue. Cluster workers receive an explicit role from the primary.
  if (env.NORTHLIVE_REFRESH_OWNER === '1') return true;
  if (env.NORTHLIVE_REFRESH_OWNER === '0') return false;
  return env.MOVIX_WORKER_SLOT === undefined;
}

function createWorkerSlotManager(workerCount) {
  const slotsByWorkerId = new Map();
  const count = Number.isSafeInteger(workerCount) && workerCount > 0 ? workerCount : 1;

  return {
    environmentFor(slot) {
      const stableSlot = Math.max(0, Math.min(count - 1, Number(slot) || 0));
      return {
        MOVIX_WORKER_SLOT: String(stableSlot),
        NORTHLIVE_REFRESH_OWNER: stableSlot === 0 ? '1' : '0',
      };
    },
    register(worker, slot) {
      slotsByWorkerId.set(worker.id, slot);
      return worker;
    },
    release(worker) {
      const slot = slotsByWorkerId.get(worker.id);
      slotsByWorkerId.delete(worker.id);
      return slot;
    },
  };
}

module.exports = {
  isNorthliveRefreshOwner,
  createWorkerSlotManager,
};
