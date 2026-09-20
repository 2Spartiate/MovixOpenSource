'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLiveTvDiskCache, createLiveTvRefresh } = require('../liveTvCache');

function fixture(options = {}) {
  let time = 100000;
  let version = 0;
  let reads = 0;
  let writes = 0;
  let corrupt = false;
  const files = new Map();
  const missing = () => Object.assign(new Error('absent'), { code: 'ENOENT' });
  function seed(name, value, mtime = time) {
    files.set(name, { text: JSON.stringify(value), time: mtime, ino: ++version });
  }
  const fs = {
    async stat(name) {
      const file = files.get(name);
      if (!file) throw missing();
      return { mtimeMs: file.time, size: Buffer.byteLength(file.text), ino: file.ino };
    },
    async readFile(name) {
      reads++;
      if (!files.has(name)) throw missing();
      return corrupt ? '{invalid' : files.get(name).text;
    },
    async writeFile(name, text) { writes++; files.set(name, { text, time, ino: ++version }); },
    async rename(from, to) { files.set(to, files.get(from)); files.delete(from); },
    async unlink(name) { if (!files.delete(name)) throw missing(); },
  };
  const cache = createLiveTvDiskCache({ fs, directory: '.', now: () => time, ...options });
  return { cache, fs, seed: (key, value, mtime) => seed(`${key}.json`, value, mtime),
    advance: ms => { time += ms; }, corrupt: () => { corrupt = true; },
    counts: () => ({ reads, writes }), files };
}

test('20 lectures simultanées puis 20 hits ne lisent et ne parsèment le fichier qu’une fois', async () => {
  const f = fixture();
  f.seed('catalog', { metas: [{ id: 'one' }] });
  const values = await Promise.all(Array.from({ length: 20 }, () => f.cache.read('catalog', 60000)));
  for (let i = 0; i < 20; i++) assert.equal(await f.cache.read('catalog', 60000), values[0]);
  assert.deepEqual(f.counts(), { reads: 1, writes: 0 });
  assert.ok(Object.isFrozen(values[0].metas[0]));
});

test('TTL distincts des lecteurs et expiration sans prolongation par les hits', async () => {
  const f = fixture();
  f.seed('catalog', { ok: true });
  f.advance(61000);
  const [fresh, stale] = await Promise.all([f.cache.read('catalog', 60000), f.cache.read('catalog', 3600000)]);
  assert.equal(fresh, null);
  assert.deepEqual(stale, { ok: true });
  assert.equal(f.counts().reads, 1);
});

test('changement externe à même mtime/taille, purge et corruption invalident la mémoire', async () => {
  const f = fixture();
  f.seed('catalog', { id: 1 });
  await f.cache.read('catalog', 60000);
  f.seed('catalog', { id: 2 });
  assert.deepEqual(await f.cache.read('catalog', 60000), { id: 2 });
  await f.cache.remove('catalog');
  assert.equal(await f.cache.read('catalog', 60000), null);
  f.seed('catalog', { id: 3 });
  f.corrupt();
  await assert.rejects(f.cache.read('catalog', 60000), SyntaxError);
});

test('budget LRU en entrées et en octets, fichiers trop grands non retenus', async () => {
  const f = fixture({ maxEntries: 1, maxBytes: 15 });
  f.seed('a', { a: 1 }); f.seed('b', { b: 1 }); f.seed('large', { value: 'x'.repeat(20) });
  for (const key of ['a', 'b', 'a', 'large', 'large']) await f.cache.read(key, 60000);
  assert.equal(f.counts().reads, 5);
});

test('une publication attend la lecture engagée, ne restaure pas sa version et clone ses données', async () => {
  const f = fixture();
  f.seed('catalog', { id: 1 });
  let release;
  const originalRead = f.fs.readFile;
  f.fs.readFile = async name => {
    const text = await originalRead(name);
    await new Promise(resolve => { release = resolve; });
    return text;
  };
  const reading = f.cache.read('catalog', 60000);
  while (!release) await Promise.resolve();
  const next = { id: 2 };
  const writing = f.cache.write('catalog', next);
  next.id = 3;
  release();
  await reading;
  await writing;
  f.fs.readFile = originalRead;
  assert.deepEqual(await f.cache.read('catalog', 60000), { id: 2 });
  assert.equal(f.files.size, 1);
});

test('un changement de fichier pendant la lecture provoque une nouvelle lecture cohérente', async () => {
  const f = fixture();
  f.seed('catalog', { id: 1 });
  const originalRead = f.fs.readFile;
  f.fs.readFile = async name => {
    const result = await originalRead(name);
    if (f.counts().reads === 1) f.seed('catalog', { id: 2 });
    return result;
  };
  assert.deepEqual(await f.cache.read('catalog', 60000), { id: 2 });
  assert.equal(f.counts().reads, 2);
});

test('échec d’écriture conserve le fichier précédent et permet une reprise', async () => {
  const f = fixture();
  f.seed('catalog', { id: 1 });
  const rename = f.fs.rename;
  f.fs.rename = async () => { throw new Error('échec'); };
  await assert.rejects(f.cache.write('catalog', { id: 2 }), /échec/);
  assert.deepEqual(await f.cache.read('catalog', 60000), { id: 1 });
  assert.equal(f.files.size, 1);
  f.fs.rename = rename;
  await f.cache.write('catalog', { id: 2 });
  assert.deepEqual(await f.cache.read('catalog', 60000), { id: 2 });
});

test('régénération partagée, erreur temporisée, dernier résultat disponible et reprise', async () => {
  let now = 100;
  let calls = 0;
  const refresh = createLiveTvRefresh({ now: () => now });
  const old = { metas: [1] };
  const failure = async () => { calls++; throw new Error('amont'); };
  const results = await Promise.all(Array.from({ length: 20 }, () => refresh('one', failure, () => old)));
  assert.ok(results.every(value => value === old));
  assert.equal(calls, 1);
  assert.equal(await refresh('one', failure, () => old), old);
  assert.equal(calls, 1);
  await assert.rejects(refresh('one', failure), /amont/);
  now += 15001;
  assert.equal(await refresh('one', async () => { calls++; return 'new'; }), 'new');
  assert.equal(calls, 2);
  assert.equal(await refresh('other', async () => 'isolated'), 'isolated');
});
