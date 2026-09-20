const assert = require('node:assert/strict');
const test = require('node:test');

const { createKisskhMetadataCache } = require('../kisskhMetadataCache');

const candidate = (id, title = `Drama ${id}`) => ({ id, title });
const drama = (id, title = `Drama ${id}`) => ({ id, title, episodes: [] });

function redisDouble(now) {
  const values = new Map();
  return {
    values,
    async get(key) {
      const entry = values.get(key);
      if (!entry || entry.expiresAt <= now()) return null;
      return entry.value;
    },
    async set(key, value, mode, ttl) {
      values.set(key, { value: String(value), expiresAt: now() + (mode === 'EX' ? ttl * 1_000 : 0) });
      return 'OK';
    },
  };
}

test('shares Search and Drama results across clients, including empty Search arrays', async () => {
  let clock = 10_000;
  const redis = redisDouble(() => clock);
  const first = createKisskhMetadataCache({ redis, now: () => clock });
  const second = createKisskhMetadataCache({ redis, now: () => clock });
  let calls = 0;

  assert.deepEqual(await first.search('https://kisskh.do', 'À la carte', 0, async () => {
    calls += 1;
    return [];
  }), []);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await second.search('https://kisskh.do', 'À la carte', 0, async () => {
    calls += 1;
    return [candidate(9)];
  }), []);
  assert.deepEqual(await first.drama('https://kisskh.do', 4608, async () => {
    calls += 1;
    return drama(4608);
  }), drama(4608));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await second.drama('https://kisskh.do', 4608, async () => {
    calls += 1;
    return drama(99);
  }), drama(4608));
  assert.equal(calls, 2);
});

test('a new client serves a normal twelve-query category batch from Redis', async () => {
  let clock = 10_000;
  const redis = redisDouble(() => clock);
  const first = createKisskhMetadataCache({ redis, now: () => clock });
  const queries = Array.from({ length: 12 }, (_, index) => `Batch ${index}`);
  await Promise.all(queries.map((query, index) =>
    first.search('https://kisskh.do', query, 3, async () => [candidate(index + 1, query)])));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(redis.values.size, 12);

  const second = createKisskhMetadataCache({ redis, now: () => clock });
  let upstream = 0;
  const results = await Promise.all(queries.map((query) =>
    second.search('https://kisskh.do', query, 3, async () => {
      upstream += 1;
      return [candidate(99, 'Unexpected')];
    })));
  assert.equal(upstream, 0);
  assert.deepEqual(results.map((result) => result[0].title), queries);
});

test('deduplicates concurrent calls and gives callers defensive copies', async () => {
  const cache = createKisskhMetadataCache();
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    await pending;
    return [candidate(1, 'Original')];
  };
  const waiting = Promise.all([
    cache.search('https://kisskh.do', 'Original', 0, fetcher),
    cache.search('https://kisskh.do', 'Original', 0, fetcher),
  ]);
  release();
  const [one, two] = await waiting;
  assert.equal(calls, 1);
  one[0].title = 'Mutated';
  assert.equal(two[0].title, 'Original');
  assert.equal((await cache.search('https://kisskh.do', 'Original', 0, fetcher))[0].title, 'Original');
});

test('oversized valid metadata remains isolated in flight without being cached', async () => {
  const cache = createKisskhMetadataCache({ maxEntryBytes: 64 });
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    await pending;
    return [candidate(1, 'x'.repeat(100))];
  };
  const first = cache.search('https://kisskh.do', 'Large', 0, fetcher);
  const second = cache.search('https://kisskh.do', 'Large', 0, fetcher);
  release();
  const [one, two] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  one[0].title = 'mutated';
  assert.equal(two[0].title, 'x'.repeat(100));
  const next = cache.search('https://kisskh.do', 'Large', 0, async () => {
    calls += 1;
    return [candidate(2, 'x'.repeat(100))];
  });
  assert.equal((await next)[0].id, 2);
  assert.equal(calls, 2);
});

test('registers a flight before a staggered Redis miss can trigger a second fetch', async () => {
  let releaseRedis;
  let redisReads = 0;
  const cache = createKisskhMetadataCache({
    redis: {
      get() {
        redisReads += 1;
        return new Promise((resolve) => { releaseRedis = resolve; });
      },
    },
    redisTimeoutMs: 100,
  });
  let fetches = 0;
  const fetcher = async () => { fetches += 1; return [candidate(1)]; };
  const first = cache.search('https://kisskh.do', 'Staggered', 0, fetcher);
  const second = cache.search('https://kisskh.do', 'Staggered', 0, fetcher);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(redisReads, 1, 'the second caller joins the flight before Redis resolves');
  releaseRedis(null);
  assert.deepEqual(await Promise.all([first, second]), [[candidate(1)], [candidate(1)]]);
  assert.equal(fetches, 1);
});

test('keeps Redis capacity occupied across successive timeout waves', async () => {
  let redisReads = 0;
  const cache = createKisskhMetadataCache({
    redis: { get() { redisReads += 1; return new Promise(() => {}); } },
    redisTimeoutMs: 1,
    maxInFlight: 2,
    maxRedisOperations: 2,
  });
  let fetches = 0;
  for (let wave = 0; wave < 3; wave += 1) {
    const results = await Promise.all(Array.from({ length: 10 }, (_, id) =>
      cache.search('https://kisskh.do', `Cold ${wave}-${id}`, 0, async () => {
      fetches += 1;
      return [candidate((wave * 10) + id + 1)];
      })));
    assert.equal(results.length, 10);
  }
  assert.equal(fetches, 30);
  assert.ok(redisReads <= 2, `Redis reads: ${redisReads}`);
});

test('expires and evicts locally, while separating origins, categories and endpoints', async () => {
  let clock = 1_000;
  const cache = createKisskhMetadataCache({ now: () => clock, ttlMs: 1_000, maxEntries: 2, maxBytes: 10_000 });
  let calls = 0;
  const value = (id) => async () => { calls += 1; return [candidate(id)]; };
  await cache.search('https://kisskh.do', 'Same', 0, value(1));
  await cache.search('https://kisskh.tv', 'Same', 0, value(2));
  await cache.search('https://kisskh.do', 'Same', 1, value(3));
  await cache.drama('https://kisskh.do', 1, async () => { calls += 1; return drama(1); });
  assert.equal(calls, 4);
  await cache.search('https://kisskh.do', 'Same', 0, value(4));
  assert.equal(calls, 5, 'oldest entry was evicted');
  clock += 1_000;
  await cache.drama('https://kisskh.do', 1, async () => { calls += 1; return drama(1); });
  assert.equal(calls, 6, 'expired entry is not served');
});

test('does not cache malformed successful payloads or failures and falls back when Redis is unavailable', async () => {
  const cache = createKisskhMetadataCache({
    redis: {
      async get() { throw new Error('offline'); },
      async set() { throw new Error('offline'); },
    },
  });
  let calls = 0;
  const invalidSearch = async () => { calls += 1; return { not: 'an array' }; };
  await cache.search('https://kisskh.do', 'Bad', 0, invalidSearch);
  await cache.search('https://kisskh.do', 'Bad', 0, invalidSearch);
  const invalidDrama = async () => { calls += 1; return []; };
  await cache.drama('https://kisskh.do', 8, invalidDrama);
  await cache.drama('https://kisskh.do', 8, invalidDrama);
  await assert.rejects(cache.search('https://kisskh.do', 'Failure', 0, async () => {
    calls += 1;
    throw new Error('timeout');
  }));
  await cache.search('https://kisskh.do', 'Failure', 0, async () => {
    calls += 1;
    return [];
  });
  assert.equal(calls, 6);
});

test('only caches validated Search candidates and requested Drama records', async () => {
  const cache = createKisskhMetadataCache();
  const malformed = [
    [null], [{ error: 'upstream' }], [candidate(1, ' ')], [{ id: 0, title: 'Bad' }],
  ];
  let calls = 0;
  for (const payload of malformed) {
    await cache.search('https://kisskh.do', `Bad ${calls}`, 0, async () => { calls += 1; return payload; });
    await cache.search('https://kisskh.do', `Bad ${calls - 1}`, 0, async () => { calls += 1; return payload; });
  }
  for (const payload of [
    {}, { error: 'upstream' }, drama(9), { id: 8, title: 'Valid', episodes: [{ id: 1, number: -1 }] },
  ]) {
    await cache.drama('https://kisskh.do', 8, async () => { calls += 1; return payload; });
    await cache.drama('https://kisskh.do', 8, async () => { calls += 1; return payload; });
  }
  assert.equal(calls, 16);
  const valid = { id: 8, title: 'Valid', episodes: [{ id: 80, number: 0 }, { id: 81, number: 1.5 }] };
  assert.deepEqual(await cache.drama('https://kisskh.do', 8, async () => { calls += 1; return valid; }), valid);
  assert.deepEqual(await cache.drama('https://kisskh.do', 8, async () => { calls += 1; return drama(8, 'Wrong'); }), valid);
  assert.equal(calls, 17);
});

test('skips disconnected Redis and rejects oversized or implausibly future shared entries', async () => {
  let calls = 0;
  const disconnected = {
    status: 'reconnecting',
    async get() { calls += 100; return null; },
    async set() { calls += 100; },
  };
  const cache = createKisskhMetadataCache({ redis: disconnected });
  await cache.search('https://kisskh.do', 'Status', 0, async () => { calls += 1; return [candidate(1)]; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);

  let clock = 1_000;
  const oversized = createKisskhMetadataCache({
    now: () => clock,
    ttlMs: 1_000,
    maxEntryBytes: 64,
    redis: { async get() { return 'x'.repeat(2_000); } },
  });
  let fetches = 0;
  await oversized.search('https://kisskh.do', 'Oversized', 0, async () => { fetches += 1; return [candidate(1)]; });
  const future = createKisskhMetadataCache({
    now: () => clock,
    ttlMs: 1_000,
    redis: { async get() { return JSON.stringify({ expiresAt: clock + 1_001, value: [candidate(1)] }); } },
  });
  await future.search('https://kisskh.do', 'Future', 0, async () => { fetches += 1; return [candidate(2)]; });
  assert.equal(fetches, 2);

  let writes = 0;
  const writeBounded = createKisskhMetadataCache({
    maxEntryBytes: 64,
    redis: { async set() { writes += 1; } },
  });
  await writeBounded.search('https://kisskh.do', 'Large', 0, async () => [candidate(3, 'x'.repeat(100))]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(writes, 0);
});
