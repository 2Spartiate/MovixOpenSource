const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createWorkerSlotManager,
  isNorthliveRefreshOwner,
} = require('../workerSlots');

test('le slot Northlive zéro reste propriétaire après remplacement', () => {
  const slots = createWorkerSlotManager(3);
  const original = { id: 11 };
  slots.register(original, 0);
  const recoveredSlot = slots.release(original);
  const replacement = { id: 12 };
  slots.register(replacement, recoveredSlot);
  assert.deepEqual(slots.environmentFor(recoveredSlot), {
    MOVIX_WORKER_SLOT: '0', NORTHLIVE_REFRESH_OWNER: '1',
  });
  assert.deepEqual(slots.environmentFor(1), {
    MOVIX_WORKER_SLOT: '1', NORTHLIVE_REFRESH_OWNER: '0',
  });
  assert.equal(isNorthliveRefreshOwner({ MOVIX_WORKER_SLOT: '0', NORTHLIVE_REFRESH_OWNER: '1' }), true);
  assert.equal(isNorthliveRefreshOwner({ MOVIX_WORKER_SLOT: '1', NORTHLIVE_REFRESH_OWNER: '0' }), false);
  assert.equal(isNorthliveRefreshOwner({}), true);
});
