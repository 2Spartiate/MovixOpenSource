const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createFStreamCacheStore } = require('../fstreamCache');

function createRedis() {
  const values = new Map();
  const expires = new Map();
  return {
    values,
    writesFail: false,
    payloadReads: 0,
    async get(key) {
      if ((expires.get(key) || Infinity) <= Date.now()) values.delete(key);
      if (/^fstream:[^:]+$/.test(key)) this.payloadReads++;
      return values.get(key) || null;
    },
    async set(key, value, ...args) {
      if (this.writesFail) throw new Error('Redis write unavailable');
      if (args.includes('NX') && await this.get(key)) return null;
      values.set(key, value);
      expires.set(key, args.includes('PX') ? Date.now() + Number(args[args.indexOf('PX') + 1]) : Infinity);
      return 'OK';
    },
    async del(...keys) {
      if (this.writesFail) throw new Error('Redis write unavailable');
      keys.flat().forEach((key) => values.delete(key));
    },
    async eval(script, _count, key, token, ttl) {
      if (this.writesFail) throw new Error('Redis write unavailable');
      if (await this.get(key) !== token) return 0;
      if (script.includes('pexpire')) { expires.set(key, Date.now() + Number(ttl)); return 1; }
      values.delete(key);
      return 1;
    },
  };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const playable = (url) => ({ success: true, total: 1, players: { VF: [{ url }] } });
const drainRepairs = (...stores) => Promise.all(stores.flatMap(store => [...store.repairs.values()]));
async function fixture(t, options = {}) {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'movix-fstream-regression-'));
  const stores = [];
  t.after(async () => {
    await drainRepairs(...stores);
    await fs.rm(cacheDir, { recursive: true, force: true });
  });
  const redis = createRedis();
  const create = (extra = {}) => {
    const store = createFStreamCacheStore({ cacheDir, redis, ...options, ...extra });
    stores.push(store);
    return store;
  };
  return { cacheDir, redis, create, store: create() };
}

test('a purge during a scrape fences publication of pre-purge data', async (t) => {
  const { store, create } = await fixture(t);
  let started, finish;
  const began = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { finish = resolve; });
  const pending = store.getOrRefresh('key', async () => { started(); await gate; return playable('old'); });
  await began;
  await create().invalidate('key');
  finish();
  assert.equal(await pending, null);
  assert.equal(await create().get('key'), null);
});

test('Redis recovery cannot mask a newer disk write or resurrect a purge', async (t) => {
  const { store, redis, create } = await fixture(t);
  await store.save('key', playable('old'));
  redis.writesFail = true;
  await store.save('key', playable('new'));
  redis.writesFail = false;
  assert.deepEqual((await create().get('key')).data, playable('new'));
  redis.writesFail = true;
  await store.invalidate('key');
  redis.writesFail = false;
  assert.equal(await create().get('key'), null);
});

test('empty refreshes enter cooldown and failure bookkeeping is bounded', async (t) => {
  const { store } = await fixture(t, { retryMs: 30, localLimit: 2 });
  let calls = 0;
  for (let i = 0; i < 2; i++) await store.getOrRefresh('key', async () => { calls++; return null; });
  assert.equal(calls, 1);
  for (let i = 0; i < 8; i++) await store.getOrRefresh(`fail-${i}`, async () => { throw new Error('offline'); });
  assert.ok(store.failures.size <= 2);
  await delay(40);
  await store.getOrRefresh('key', async () => playable('ok'));
  assert.equal(store.failures.size, 0);
});

test('les échecs FStream journalisent leur cause une seule fois pendant la pause de reprise', async (t) => {
  const { store, create } = await fixture(t, { retryMs: 10000 });
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
  for (const key of ['movie_42', 'tv_5920_s6']) {
    let calls = 0;
    const scrape = async () => { calls++; throw new Error('Erreur HTTP: 503'); };
    assert.equal(await store.getOrRefresh(key, scrape), null);
    assert.equal(await store.getOrRefresh(key, scrape), null);
    assert.equal(await create().getOrRefresh(key, scrape), null);
    assert.equal(calls, 1);
    assert.equal(await store.get(key), null);
  }
  assert.equal(errors.length, 2);
  assert.match(errors[0], /movie_42.*Erreur HTTP: 503/);
  assert.match(errors[1], /tv_5920_s6.*Erreur HTTP: 503/);
});

test('disk rehydration retains version so subsequent L1 hits avoid payload parsing', async (t) => {
  const { store, redis, create } = await fixture(t);
  await store.save('key', playable('disk'));
  redis.values.clear();
  const reader = create();
  const first = await reader.get('key');
  const reads = redis.payloadReads;
  assert.ok(first.version);
  assert.strictEqual(await reader.get('key'), first);
  assert.strictEqual(await reader.get('key'), first);
  assert.equal(redis.payloadReads, reads);
});

test('a warm JSON cache does not wait for Redis before answering', async (t) => {
  const { store, redis, create } = await fixture(t);
  const expected = playable('local');
  await store.save('key', expected);
  const originalGet = redis.get.bind(redis);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  redis.get = async key => { await gate; return originalGet(key); };
  const reader = create();
  const requests = Promise.all([store.get('key'), reader.get('key')]);
  try {
    const result = await Promise.race([requests, delay(150).then(() => null)]);
    assert.ok(result, 'both L1 and JSON must answer while Redis is still waiting');
    assert.deepEqual(result.map(entry => entry.data), [expected, expected]);
  } finally {
    release();
    await requests;
    await drainRepairs(reader, store);
  }
});

test('a reconnecting Redis never queues a cache read or repair', async (t) => {
  const { store, redis, create } = await fixture(t);
  await store.save('key', playable('offline'));
  redis.status = 'reconnecting';
  let calls = 0;
  redis.get = async () => { calls++; return null; };
  redis.set = async () => { calls++; return 'OK'; };
  const reader = create();
  assert.deepEqual((await store.get('key')).data, playable('offline'));
  assert.deepEqual((await reader.get('key')).data, playable('offline'));
  assert.equal(await reader.get('missing'), null);
  assert.equal(calls, 0);
});

test('a missing JSON cache has a bounded wait even if a ready Redis stops answering', async (t) => {
  const { store, redis } = await fixture(t, { redisReadTimeoutMs: 20 });
  redis.status = 'ready';
  redis.get = () => new Promise(() => {});
  const result = await Promise.race([store.get('missing'), delay(500).then(() => 'still waiting')]);
  assert.equal(result, null);
});

test('a disk read overlapping a purge cannot return or republish the deleted snapshot', async (t) => {
  const { store, redis, create, cacheDir } = await fixture(t);
  await store.save('key', playable('before-purge'));
  const reader = create();
  const originalRead = fs.readFile.bind(fs);
  let started, finish, intercepted = false;
  const began = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { finish = resolve; });
  t.mock.method(fs, 'readFile', async (filename, ...args) => {
    const raw = await originalRead(filename, ...args);
    if (filename === path.join(cacheDir, 'key.json') && !intercepted) {
      intercepted = true;
      started();
      await gate;
    }
    return raw;
  });
  const reading = reader.get('key');
  try {
    await began;
    await store.invalidate('key');
    finish();
    assert.equal(await reading, null);
    await drainRepairs(reader);
    assert.equal(redis.values.has('fstream:key'), false);
  } finally { finish(); await reading; }
});

test('long scrapes renew the lease and remain shared between workers', async (t) => {
  const { store, create } = await fixture(t, { lockTtlMs: 90, lockWaitMs: 1000 });
  let calls = 0, started;
  const began = new Promise((resolve) => { started = resolve; });
  const first = store.getOrRefresh('key', async () => { calls++; started(); await delay(240); return playable('fresh'); });
  await began;
  await delay(140);
  const second = create().getOrRefresh('key', async () => { calls++; return playable('duplicate'); });
  const results = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(results[0], results[1]);
});

test('a scraper whose lease was lost cannot overwrite its successor', async (t) => {
  const { store, redis, create } = await fixture(t);
  let started, finish;
  const began = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { finish = resolve; });
  const first = store.getOrRefresh('key', async () => { started(); await gate; return playable('old'); });
  await began;
  await redis.del('fstream:refresh-lock:key');
  await create().getOrRefresh('key', async () => playable('new'));
  finish();
  await first;
  assert.deepEqual((await store.get('key')).data, playable('new'));
});

test('L1 also respects its byte budget', async (t) => {
  const { store } = await fixture(t, { localMaxBytes: 128 });
  await store.save('large', playable('x'.repeat(10000)));
  assert.equal(store.local.size, 0);
});

test('all unusable results share a cooldown across workers and retain playable links', async (t) => {
  const { store, create } = await fixture(t, { refreshMs: 1, retryMs: 10000 });
  let scrapes = 0;
  for (const [index, empty] of [null, undefined, { success: false }, { success: true, total: 0 }].entries()) {
    const key = `empty-${index}`;
    await store.save(key, playable('cached'));
    await delay(5);
    const first = await store.getOrRefresh(key, async () => { scrapes++; return empty; });
    const second = await create().getOrRefresh(key, async () => { scrapes++; return playable('unexpected'); });
    assert.deepEqual(first, playable('cached'));
    assert.deepEqual(second, playable('cached'));
  }
  assert.equal(scrapes, 4);
});

test('a failed JSON publication enters cooldown', async (t) => {
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
  const { store, cacheDir, create } = await fixture(t);
  // A directory at the destination deterministically rejects atomic writes on
  // Windows and Unix without touching permissions or any service.
  await fs.mkdir(path.join(cacheDir, 'blocked.json'));
  let calls = 0;
  const scrape = async () => { calls++; return playable('new'); };
  assert.equal(await store.getOrRefresh('blocked', scrape), null);
  assert.equal(await create().getOrRefresh('blocked', scrape), null);
  assert.equal(calls, 1);
  assert.ok(errors.length > 0);
  assert.ok(errors.every((message) => message.includes('EISDIR')));
});

test('Redis payload write failure keeps JSON durable and applies retry backoff', async (t) => {
  const { store, redis, cacheDir } = await fixture(t, { refreshMs: 1 });
  const set = redis.set.bind(redis);
  redis.set = async (key, ...args) => {
    if (key === 'fstream:key') throw new Error('payload write failed');
    return set(key, ...args);
  };
  let calls = 0;
  const scrape = async () => { calls++; return playable('durable'); };
  assert.deepEqual(await store.getOrRefresh('key', scrape), playable('durable'));
  await delay(5);
  assert.deepEqual(await store.getOrRefresh('key', scrape), playable('durable'));
  assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(cacheDir, 'key.json'), 'utf8')).data, playable('durable'));
});

test('purge waits for an in-progress disk rehydration and does not leave it in Redis', async (t) => {
  const { store, redis, create } = await fixture(t);
  await store.save('key', playable('disk'));
  redis.values.clear();
  let started, finish;
  const began = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { finish = resolve; });
  const set = redis.set.bind(redis);
  redis.set = async (key, ...args) => {
    if (key === 'fstream:key') { started(); await gate; }
    return set(key, ...args);
  };
  const rehydrate = create().get('key');
  await began;
  const purge = create().invalidate('key');
  finish();
  await Promise.all([rehydrate, purge]);
  assert.equal(await store.get('key'), null);
  assert.equal(redis.values.has('fstream:key'), false);
});

test('legacy disk versions stay stable and expired Redis can be repaired from L1', async (t) => {
  const { store, redis, cacheDir } = await fixture(t, { redisRepairIntervalMs: 0 });
  await fs.writeFile(path.join(cacheDir, 'key.json'), JSON.stringify({ data: playable('legacy'), cachedAt: Date.now() }));
  const entry = await store.get('key');
  await drainRepairs(store);
  assert.ok(entry.version);
  const reads = redis.payloadReads;
  assert.strictEqual(await store.get('key'), entry);
  await drainRepairs(store);
  redis.values.clear();
  assert.strictEqual(await store.get('key'), entry);
  await drainRepairs(store);
  assert.equal(redis.payloadReads, reads);
  assert.ok(redis.values.has('fstream:key'));
});

test('invalid TV selections cannot reappear from stale error fallbacks', async (t) => {
  const { store } = await fixture(t, { refreshMs: 1 });
  await store.save('key', { ...playable('wrong'), title: 'Wrong' });
  await delay(5);
  assert.equal(await store.getOrRefresh('key', async () => { throw new Error('offline'); }, (data) => data.title === 'Correct'), null);
});

test('business responses are shared during cooldown without replacing playable cache', async (t) => {
  const { store, create, cacheDir } = await fixture(t, { refreshMs: 1, retryMs: 10000 });
  const response = { __fstreamResponse: true, status: 404, body: { error: 'Aucun lecteur video trouve', searchQuery: 'Film', bestResult: 'Film' } };
  let calls = 0;
  const scrape = async () => { calls++; await delay(20); return response; };
  const results = await Promise.all([store.getOrRefresh('key', scrape), create().getOrRefresh('key', scrape)]);
  assert.deepEqual(results, [response, response]);
  assert.deepEqual(await create().getOrRefresh('key', scrape), response);
  assert.equal(calls, 1);
  assert.equal(await store.get('key'), null);
  await assert.rejects(fs.access(path.join(cacheDir, 'key.json')));
  await store.save('key', playable('cached'));
  await delay(5);
  assert.deepEqual(await store.getOrRefresh('key', scrape), playable('cached'));
  assert.deepEqual((await store.get('key')).data, playable('cached'));
});

test('business responses expire, remain byte bounded and obey purge generations', async (t) => {
  const { store, create } = await fixture(t, { retryMs: 40, localMaxBytes: 160, localLimit: 2 });
  const response = { __fstreamResponse: true, status: 200, body: { success: false, total: 0, detail: 'x'.repeat(500) } };
  await store.getOrRefresh('key', async () => response);
  assert.equal(store.failures.size, 0, 'large responses must bypass the bounded local retry cache');
  await store.invalidate('key');
  assert.deepEqual(await create().getOrRefresh('key', async () => playable('post-purge')), playable('post-purge'));

  await store.getOrRefresh('expires', async () => response);
  await delay(55);
  assert.deepEqual(await create().getOrRefresh('expires', async () => playable('after-ttl')), playable('after-ttl'));

  let started, finish;
  const began = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { finish = resolve; });
  const pending = store.getOrRefresh('in-flight', async () => { started(); await gate; return response; });
  await began;
  await create().invalidate('in-flight');
  finish();
  assert.equal(await pending, null);
  assert.deepEqual(await create().getOrRefresh('in-flight', async () => playable('after-purge')), playable('after-purge'));
});

test('FStream cache reads a fresh Redis value without scraping', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'movix-fstream-cache-'));
  const redis = createRedis();
  const store = createFStreamCacheStore({ cacheDir, redis, refreshMs: 40 * 60 * 1000 });
  const payload = { success: true, players: { VF: [{ url: 'https://player.example' }] }, total: 1 };
  let scrapes = 0;

  try {
    await store.save('movie-42', payload);
    await fs.rm(path.join(cacheDir, 'movie-42.json'));

    const result = await store.getOrRefresh('movie-42', async () => {
      scrapes += 1;
      return { success: true, players: {} };
    });

    assert.deepEqual(result, payload);
    assert.equal(scrapes, 0);
  } finally {
    await drainRepairs(store);
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});

test('FStream cache falls back to fresh JSON when Redis has no value at startup', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'movix-fstream-disk-'));
  const redis = createRedis();
  const payload = { success: true, players: { VF: [{ url: 'https://disk.example' }] }, total: 1 };
  let scrapes = 0;
  const writer = createFStreamCacheStore({ cacheDir, redis });
  const reader = createFStreamCacheStore({ cacheDir, redis });

  try {
    await writer.save('movie-42', payload);
    redis.values.clear();
    const result = await reader.getOrRefresh('movie-42', async () => {
      scrapes += 1;
      return null;
    });

    assert.deepEqual(result, payload);
    assert.equal(scrapes, 0);
    await drainRepairs(reader);
    assert.ok(redis.values.has('fstream:movie-42'));
  } finally {
    await drainRepairs(writer, reader);
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});

test('FStream cache refreshes a stale entry once and writes JSON plus Redis', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'movix-fstream-refresh-'));
  const redis = createRedis();
  const store = createFStreamCacheStore({ cacheDir, redis, refreshMs: 1 });
  let scrapes = 0;
  const fresh = { success: true, players: { VF: [{ url: 'https://fresh.example' }] }, total: 1 };

  try {
    await store.save('movie-42', { success: true, players: { VF: [{ url: 'https://old.example' }] }, total: 1 });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const result = await store.getOrRefresh('movie-42', async () => {
      scrapes += 1;
      return fresh;
    });

    assert.deepEqual(result, fresh);
    assert.equal(scrapes, 1);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(cacheDir, 'movie-42.json'), 'utf8')).data, fresh);
    assert.ok(redis.values.has('fstream:movie-42'));
  } finally {
    await drainRepairs(store);
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});

test('FStream cache serializes two workers and preserves playable data after a failed refresh', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'movix-fstream-workers-'));
  const redis = createRedis();
  const one = createFStreamCacheStore({ cacheDir, redis, refreshMs: 1, lockTtlMs: 1000, lockWaitMs: 1000 });
  const two = createFStreamCacheStore({ cacheDir, redis, refreshMs: 1, lockTtlMs: 1000, lockWaitMs: 1000 });
  const playable = { success: true, players: { VF: [{ url: 'https://cached.example' }] }, total: 1 };
  let scrapes = 0;

  try {
    await one.save('movie-42', playable);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const [first, second] = await Promise.all([
      one.getOrRefresh('movie-42', async () => {
        scrapes += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        throw new Error('upstream unavailable');
      }),
      two.getOrRefresh('movie-42', async () => {
        scrapes += 1;
        return { success: true, players: { VF: [{ url: 'https://unexpected.example' }] }, total: 1 };
      }),
    ]);

    assert.equal(scrapes, 1);
    assert.deepEqual(first, playable);
    assert.deepEqual(second, playable);
    assert.deepEqual((await one.get('movie-42')).data, playable);
  } finally {
    await drainRepairs(one, two);
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});

test('FStream cache invalidation clears local, Redis and disk entries', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'movix-fstream-invalidate-'));
  const redis = createRedis();
  const store = createFStreamCacheStore({ cacheDir, redis });

  try {
    await store.save('movie-42', { success: true, players: { VF: [{ url: 'https://player.example' }] }, total: 1 });
    await store.invalidate('movie-42');
    assert.equal(await store.get('movie-42'), null);
    await assert.rejects(fs.access(path.join(cacheDir, 'movie-42.json')));
    assert.equal(redis.values.has('fstream:movie-42'), false);
  } finally {
    await drainRepairs(store);
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});

test('FStream local cache remains bounded for frequent keys', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'movix-fstream-local-'));
  const store = createFStreamCacheStore({ cacheDir, redis: createRedis(), localLimit: 2 });
  const payload = { success: true, players: { VF: [{ url: 'https://player.example' }] }, total: 1 };

  try {
    await store.save('one', payload);
    await store.save('two', payload);
    await store.save('three', payload);
    assert.equal(store.local.size, 2);
    assert.equal(store.local.has('one'), false);
  } finally {
    await drainRepairs(store);
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});
