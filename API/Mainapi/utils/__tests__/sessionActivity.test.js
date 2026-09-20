const test = require('node:test');
const assert = require('node:assert/strict');
const { createSessionActivityUpdater } = require('../sessionActivity');

function fixture(options = {}) {
  let time = 0;
  let redisCalls = 0;
  let sqlCalls = 0;
  let sqlFailures = 0;
  const reservations = new Map();
  const queries = [];
  const redis = {
    status: 'ready',
    async eval(_script, keyCount, key, interval) {
      assert.equal(keyCount, 1);
      redisCalls++;
      const ttl = (reservations.get(key) || 0) - time;
      if (ttl > 0) return [0, ttl];
      reservations.set(key, time + Number(interval));
      return [1, Number(interval)];
    },
  };
  const pool = {
    async execute(sql, params) {
      sqlCalls++;
      queries.push({ sql, params });
      if (sqlFailures-- > 0) throw new Error('database unavailable');
      return [{ affectedRows: 1 }];
    },
  };
  const worker = () => createSessionActivityUpdater({
    redis, getPool: () => pool, now: () => time, onError() {}, ...options,
  });
  return {
    worker, redis, pool, queries, advance: ms => { time += ms; },
    failSql: () => { sqlFailures = 1; },
    counts: () => ({ redis: redisCalls, sql: sqlCalls }),
  };
}

test('une rafale de plusieurs workers ne produit qu’un UPDATE par minute', async () => {
  const f = fixture();
  const workers = [f.worker(), f.worker(), f.worker()];
  await Promise.all(Array.from({ length: 90 }, (_, i) => workers[i % 3]('oauth', 'user', 'session')));
  assert.deepEqual(f.counts(), { redis: 3, sql: 1 });
  f.advance(59_999);
  assert.equal(await workers[0]('oauth', 'user', 'session'), false);
  f.advance(1);
  await Promise.all(workers.map(update => update('oauth', 'user', 'session')));
  assert.equal(f.counts().sql, 2);
});

test('une session visitée tardivement utilise le TTL partagé restant', async () => {
  const f = fixture();
  const first = f.worker();
  const second = f.worker();
  await first('oauth', 'user', 'session');
  f.advance(59_000);
  await second('oauth', 'user', 'session');
  f.advance(1_000);
  assert.equal(await second('oauth', 'user', 'session'), true);
  assert.equal(f.counts().sql, 2);
});

test('les types de compte et les sessions ont des créneaux distincts', async () => {
  const f = fixture();
  const update = f.worker();
  await update('oauth', 'user', 'one');
  await update('oauth', 'user', 'two');
  await update('bip39', 'user', 'one');
  assert.equal(f.counts().sql, 3);
});

test('Redis indisponible conserve un repli SQL conditionnel et borné', async () => {
  const f = fixture();
  f.redis.status = 'end';
  const update = f.worker();
  await Promise.all(Array.from({ length: 10 }, () => update('oauth', 'user', 'session')));
  assert.deepEqual(f.counts(), { redis: 0, sql: 1 });
  assert.match(f.queries[0].sql, /accessed_at IS NULL OR accessed_at <= DATE_SUB\(NOW\(\), INTERVAL \? SECOND\)/);
  assert.deepEqual(f.queries[0].params, ['session', 'user', 'oauth', 60]);
});

test('une panne Redis après connexion utilise aussi le repli SQL', async () => {
  const f = fixture();
  f.redis.eval = async () => { throw new Error('redis unavailable'); };
  assert.equal(await f.worker()('oauth', 'user', 'session'), true);
  assert.equal(f.counts().sql, 1);
});

test('une erreur SQL ne rejette pas et le prochain créneau peut réessayer', async () => {
  const f = fixture();
  const update = f.worker();
  f.failSql();
  assert.equal(await update('oauth', 'user', 'session'), false);
  f.advance(60_000);
  assert.equal(await update('oauth', 'user', 'session'), true);
});
