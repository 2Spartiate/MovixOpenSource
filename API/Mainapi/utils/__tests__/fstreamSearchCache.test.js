'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFStreamSearchCache } = require('../fstreamSearchCache');
const html = title => `<div class="search-item"><div class="search-title">${title}</div></div>`;
const endpoint = 'https://source.test/engine/ajax/search.php';
const tick = () => new Promise(resolve => setImmediate(resolve));

test('une rafale et les recherches suivantes partagent un appel, puis expirent à 30 secondes', async () => {
  let time = 1_000, calls = 0;
  const cache = createFStreamSearchCache({ now: () => time });
  const fetcher = async query => { calls++; await tick(); assert.equal(query, 'Dark Matter'); return html('Saison 1'); };
  const results = await Promise.all(Array.from({ length: 50 }, () => cache.load(endpoint, ' Dark  Matter ', 1, fetcher)));
  assert.ok(results.every(result => result === html('Saison 1')));
  await cache.load(endpoint, 'Dark Matter', 1, fetcher);
  assert.equal(calls, 1);
  time += 30_000;
  assert.equal(await cache.load(endpoint, 'Dark Matter', 1, async () => { calls++; return html('Saison 2'); }), html('Saison 2'));
  assert.equal(calls, 2);
});

test('deux workers partagent Redis sans prolonger la fraîcheur et isolent origine, titre et page', async () => {
  let time = 1_000, calls = 0;
  const shared = new Map();
  const redis = { status: 'ready', get: async key => shared.get(key), set: async (key, value) => { shared.set(key, value); } };
  const first = createFStreamSearchCache({ redis, now: () => time });
  const second = createFStreamSearchCache({ redis, now: () => time });
  const fetcher = async () => { calls++; return html('Titre'); };
  await first.load(endpoint, 'Titre', 1, fetcher);
  await tick();
  time += 20_000;
  await second.load(endpoint, 'Titre', 1, fetcher);
  assert.equal(calls, 1);
  time += 10_000;
  await second.load(endpoint, 'Titre', 1, fetcher);
  await second.load(endpoint, 'Titre', 2, fetcher);
  await second.load(endpoint + '?mirror=2', 'Titre', 1, fetcher);
  await second.load(endpoint, 'Titré', 1, fetcher);
  assert.equal(calls, 5);
});

test('erreurs, pages de challenge, résultats vides et gros corps ne sont pas mémorisés', async () => {
  const cache = createFStreamSearchCache({ maxEntryBytes: 150 });
  for (const result of ['', 'Bot shield active.', html('Just a moment'), html('x'.repeat(200))]) {
    let calls = 0;
    const fetcher = async () => { calls++; return result; };
    await cache.load(endpoint, 'Titre', 1, fetcher);
    await cache.load(endpoint, 'Titre', 1, fetcher);
    assert.equal(calls, 2);
  }
  await assert.rejects(cache.load(endpoint, 'Titre', 1, async () => { throw new Error('timeout'); }), /timeout/);
  assert.equal(await cache.load(endpoint, 'Titre', 1, async () => html('OK')), html('OK'));
});

test('les limites d’entrées et d’octets provoquent une éviction', async () => {
  for (const limits of [{ maxEntries: 1 }, { maxBytes: 100 }]) {
    let calls = 0;
    const cache = createFStreamSearchCache(limits);
    const fetcher = async () => { calls++; return html('Résultat'); };
    await cache.load(endpoint, 'A', 1, fetcher);
    await cache.load(endpoint, 'B', 1, fetcher);
    await cache.load(endpoint, 'A', 1, fetcher);
    assert.equal(calls, 3);
  }
});

test('Redis suspendu reste borné et ne bloque pas les recherches ; reconnexion sans commande', async () => {
  let gets = 0, sets = 0;
  const redis = { status: 'ready', get() { gets++; return new Promise(() => {}); }, set() { sets++; return new Promise(() => {}); } };
  const cache = createFStreamSearchCache({ redis, redisTimeoutMs: 5, maxRedisOperations: 2, maxInFlight: 2 });
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) => cache.load(endpoint, `Titre ${i}`, 1, async () => html('OK'))));
  assert.equal(results.length, 30);
  assert.equal(gets, 2);
  assert.equal(sets, 0);
  redis.status = 'reconnecting';
  await cache.load(endpoint, 'Autre', 1, async () => html('OK'));
  assert.equal(gets, 2);
});
