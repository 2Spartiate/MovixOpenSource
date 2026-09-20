const test = require('node:test');
const assert = require('node:assert/strict');
const { createBundleRegistry } = require('../bundleRegistry');
const { createKisskhCache } = require('../kisskhCache');
const { APPROVED_ALGORITHMS } = require('../approvedAlgorithms');

const ALGORITHM = Object.freeze({
  algorithmVersion: 'kkey-v1', bundleSha256: 'a'.repeat(64), moduleSha256: 'b'.repeat(64),
});

function harness() {
  const state = { now: 1_000_000, fetches: 0, reads: 0, failure: null, gate: null };
  const values = new Map();
  const writes = [];
  function read(key) {
    const entry = values.get(key);
    if (!entry || entry.expiresAt <= state.now) {
      values.delete(key);
      return null;
    }
    return entry.value;
  }
  const redis = {
    async get(key) { state.reads += 1; return read(key); },
    async set(key, value, mode, ttl, condition) {
      if (condition === 'NX' && read(key) !== null) return null;
      values.set(key, { value, expiresAt: state.now + (mode === 'EX' ? ttl * 1000 : ttl) });
      writes.push([key, value, mode, ttl]);
      return 'OK';
    },
    async eval(script, _count, key, token, ttl) {
      if (read(key) !== token) return 0;
      if (script.includes('PEXPIRE')) values.get(key).expiresAt = state.now + ttl;
      else values.delete(key);
      return 1;
    },
  };
  function worker(overrides = {}) {
    const cache = createKisskhCache({ redis, now: () => state.now, ...overrides });
    const registry = createBundleRegistry({
      cache,
      now: () => state.now,
      approved: new Map([[ALGORITHM.bundleSha256, ALGORITHM]]),
      resolveDns: async () => [{ address: '104.21.48.1', family: 4 }],
      hashText: (text) => text === 'module' ? ALGORITHM.moduleSha256
        : text === 'bundle' ? ALGORITHM.bundleSha256 : 'c'.repeat(64),
      async fetchText(url) {
        state.fetches += 1;
        await state.gate?.();
        if (state.failure === 'network') throw new Error('Temporary timeout');
        if (state.failure === 'security') return 'x'.repeat(2 * 1024 * 1024 + 1);
        if (state.failure === 'changed') return 'unknown';
        return url.includes('common.js') ? 'module' : 'bundle';
      },
      ...overrides,
    });
    return { cache, registry, resolve: () => registry.resolveApprovedAlgorithm() };
  }
  return { state, redis, writes, worker };
}

test('100 stale resolutions make one failed check, then retry after 60 seconds without renewing trust', async () => {
  const { state, worker, writes } = harness();
  const first = worker();
  assert.equal(await first.resolve(), ALGORITHM);
  state.now += 900_000;
  state.failure = 'network';
  assert.equal(await first.resolve(), ALGORITHM);
  const reads = state.reads;
  for (let i = 0; i < 99; i += 1) assert.equal(await first.resolve(), ALGORITHM);
  assert.equal(state.fetches, 3);
  assert.equal(state.reads, reads, 'The cooldown must also avoid repeated Redis reads');
  const validations = writes.filter(([key]) => key === 'kisskh:bundle:current');
  assert.equal(validations.length, 1);
  assert.deepEqual(validations[0].slice(2), ['EX', 900]);
  assert.deepEqual(writes.find(([key]) => key === 'kisskh:bundle:last-known').slice(2), ['EX', 86_400]);
  assert.deepEqual(Object.keys(JSON.parse(validations[0][1])).sort(), [
    'algorithmVersion', 'bundleSha256', 'checkedAt', 'moduleSha256',
  ]);
  assert.equal(JSON.parse(validations[0][1]).checkedAt, 1_000_000);
  assert.equal((await first.cache.getCurrentBundleMetadata({ allowStale: true })).checkedAt, 1_000_000);

  state.now += 59_999;
  assert.equal(await first.resolve(), ALGORITHM);
  assert.equal(state.fetches, 3);
  state.now += 1;
  state.failure = null;
  assert.equal(await first.resolve(), ALGORITHM);
  assert.equal(state.fetches, 5);
  assert.equal((await first.cache.getCurrentBundleMetadata()).checkedAt, state.now);
});

test('workers reload a peer validation after expiry and share its outage cooldown', async () => {
  const { state, worker } = harness();
  const first = worker();
  const second = worker();
  await first.resolve();
  await second.resolve();
  assert.equal(state.fetches, 2);

  state.now += 900_000;
  await first.resolve();
  await second.resolve();
  assert.equal(state.fetches, 4, 'The second worker must reload the refreshed Redis validation');

  state.now += 900_000;
  state.failure = 'network';
  await first.resolve();
  await second.resolve();
  await worker().resolve();
  assert.equal(state.fetches, 5, 'A newly started worker must share the cooldown and stale timestamp');
});

test('a renewable shared lock prevents concurrent cold bundle downloads', async () => {
  const { state, worker } = harness();
  let unblock;
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { unblock = resolve; });
  state.gate = async () => {
    if (state.fetches === 1) { started(); await gate; }
  };
  const first = worker();
  const second = worker();
  const owner = first.resolve();
  await ready;
  try {
    await assert.rejects(second.resolve(), (error) => error.code === 'provider_unavailable');
    await assert.rejects(worker({ approved: undefined }).resolve(), (error) => error.code === 'provider_unavailable',
      'A cold worker must wait for the owner result before using the compiled fallback');
    assert.equal(state.fetches, 1);
  } finally {
    unblock();
    await owner;
  }
  state.now += 1_000;
  assert.equal(await second.resolve(), ALGORITHM);
  assert.equal(state.fetches, 2);
});

test('cold failures are throttled even without Redis or a stale algorithm', async () => {
  const { state, worker } = harness();
  const first = worker({ cache: undefined });
  state.failure = 'network';
  for (let i = 0; i < 100; i += 1) {
    await assert.rejects(first.resolve(), (error) => error.code === 'provider_unavailable');
  }
  assert.equal(state.fetches, 1);
  state.now += 60_000;
  await assert.rejects(first.resolve(), (error) => error.code === 'provider_unavailable');
  assert.equal(state.fetches, 2);
});

test('the compiled fallback remains usable without being published as a verified bundle', async () => {
  const { state, worker, writes } = harness();
  state.failure = 'network';
  const first = worker({ approved: undefined });
  for (let i = 0; i < 100; i += 1) {
    assert.equal(await first.resolve(), APPROVED_ALGORITHMS.values().next().value);
  }
  assert.equal(state.fetches, 1);
  assert.equal(writes.some(([key]) => ['kisskh:bundle:current', 'kisskh:bundle:last-known'].includes(key)), false);
});

for (const [failure, code] of [['changed', 'provider_changed'], ['security', 'provider_security']]) {
  test(`${failure} checks stay rejected during the shared cooldown despite an approved stale cache`, async () => {
    const { state, worker } = harness();
    const first = worker();
    await first.resolve();
    state.now += 900_000;
    state.failure = failure;
    for (let i = 0; i < 100; i += 1) {
      await assert.rejects(first.resolve(), (error) => error.code === code);
    }
    await assert.rejects(worker().resolve(), (error) => error.code === code);
    assert.equal(state.fetches, 3);
    state.now += 60_000;
    state.failure = null;
    assert.equal(await first.resolve(), ALGORITHM);
    assert.equal(state.fetches, 5);
  });
}

test('a retry cooldown never extends the maximum stale lifetime', async () => {
  const { state, worker } = harness();
  const first = worker({ checkTtlSeconds: 2, staleMaxSeconds: 5, bundleCheckTtlSeconds: 2, bundleStaleMaxSeconds: 5 });
  await first.resolve();
  state.now += 2_000;
  state.failure = 'network';
  assert.equal(await first.resolve(), ALGORITHM);
  state.now += 3_001;
  await assert.rejects(first.resolve(), (error) => error.code === 'provider_unavailable');
  assert.equal(state.fetches, 3);
});

test('the metadata cache requires the actual verification timestamp and preserves its TTL', async () => {
  const { state, worker } = harness();
  const { cache } = worker();
  await assert.rejects(cache.recordBundleMetadata(ALGORITHM));
  await assert.rejects(cache.recordBundleMetadata({ ...ALGORITHM, checkedAt: state.now + 1 }));
  const checkedAt = state.now - 10_000;
  await cache.recordBundleMetadata({ ...ALGORITHM, checkedAt });
  assert.equal((await cache.getCurrentBundleMetadata()).checkedAt, checkedAt);
  state.now = checkedAt + 900_000;
  assert.equal(await cache.getCurrentBundleMetadata(), null);
});

test('custom verification and stale TTLs apply to shared records and only successful checks refresh them', async () => {
  const { state, worker, writes } = harness();
  const first = worker({ checkTtlSeconds: 16, staleMaxSeconds: 17, bundleCheckTtlSeconds: 16, bundleStaleMaxSeconds: 17 });
  await first.resolve();
  assert.deepEqual(writes.find(([key]) => key === 'kisskh:bundle:current').slice(2), ['EX', 16]);
  assert.deepEqual(writes.find(([key]) => key === 'kisskh:bundle:last-known').slice(2), ['EX', 17]);
  state.now += 16_000;
  await first.resolve();
  state.now += 16_000;
  state.failure = 'network';
  assert.equal(await first.resolve(), ALGORITHM);
  assert.equal((await first.cache.getCurrentBundleMetadata({ allowStale: true })).checkedAt, state.now - 16_000);
  state.now += 1_001;
  assert.equal(await first.cache.getCurrentBundleMetadata({ allowStale: true }), null);
  await assert.rejects(first.resolve(), (error) => error.code === 'provider_unavailable');
});

test('a worker rechecks shared metadata after obtaining a lock previously held by a peer', async () => {
  const { state, worker } = harness();
  const peer = worker();
  let operations = 0;
  const first = worker({
    cache: {
      getCurrentBundleMetadata: (...args) => peer.cache.getCurrentBundleMetadata(...args),
      getBundleCheckFailure: () => peer.cache.getBundleCheckFailure(),
      async singleFlight(_key, operation) {
        operations += 1;
        await peer.resolve();
        return operation({ async assertOwned() {} });
      },
    },
  });
  assert.equal(await first.resolve(), ALGORITHM);
  assert.equal(state.fetches, 2);
  assert.equal(operations, 1);
});

test('a lost lease cannot publish verified metadata or a shared outage', async () => {
  for (const failure of [null, 'network']) {
    const { state, worker, writes } = harness();
    const peer = worker();
    const { KisskhError } = require('../errors');
    const first = worker({
      cache: {
        ...peer.cache,
        async singleFlight(_key, operation) {
          return operation({
            async assertOwned() {
              throw new KisskhError('provider_unavailable', 'Lock perdu', { details: { reason: 'lock_contended' } });
            },
          });
        },
      },
    });
    state.failure = failure;
    await assert.rejects(first.resolve(), (error) => error.code === 'provider_unavailable');
    assert.equal(writes.length, 0);
  }
});

test('failed Redis operations preserve the local verification and retry cooldown', async () => {
  const { state, worker } = harness();
  const first = worker({ redis: {
    async get() { throw new Error('Redis offline'); },
    async set() { throw new Error('Redis offline'); },
  } });
  await first.resolve();
  state.now += 900_000;
  state.failure = 'network';
  for (let i = 0; i < 100; i += 1) assert.equal(await first.resolve(), ALGORITHM);
  assert.equal(state.fetches, 3);
});

test('losing the lock after detecting an unknown bundle still fails closed locally', async () => {
  const { state, worker, redis, writes } = harness();
  const first = worker();
  await first.resolve();
  state.now += 900_000;
  state.failure = 'changed';
  redis.eval = async () => 0;
  for (let i = 0; i < 10; i += 1) {
    await assert.rejects(first.resolve(), (error) => error.code === 'provider_changed');
  }
  assert.equal(state.fetches, 3);
  assert.equal(writes.some(([key]) => key.startsWith('kisskh:bundle:retry:')), false);
});
