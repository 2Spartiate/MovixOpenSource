'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createWiflixRefreshState } = require('../../utils/wiflixRefreshState');
const good = { success: true, players: { vf: [{ url: 'https://cached.test/embed' }] } };

async function fixture(t, fetcher, { initial = good } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wiflix-refresh-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'key.json');
  if (initial) {
    await fs.writeFile(file, JSON.stringify(initial));
    const old = new Date(Date.now() - 4 * 60 * 60 * 1000);
    await fs.utimes(file, old, old);
  }
  let time = Date.now(), busy = false, calls = 0, writes = 0;
  const filename = path.resolve(__dirname, '../wiflix.js');
  const source = await fs.readFile(filename, 'utf8');
  const start = source.indexOf('const updateWiflixCache = async (');
  const end = source.indexOf('// === Routes ===', start);
  assert.ok(start > 0 && end > start);
  const read = async () => { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; } };
  const scrape = async (_id, previous) => { calls++; return fetcher(previous); };
  const createWorker = () => {
    const context = vm.createContext({
      WIFLIX_UPDATE_LOCK_TTL: 60,
      refreshState: createWiflixRefreshState({ now: () => time }),
      acquireRedisLock: async () => {
        if (busy) return null;
        busy = true;
        return { release: async () => { busy = false; } };
      },
      getFromCacheNoExpiration: async (_dir, _key, bypassMemory) => { assert.equal(bypassMemory, true); return read(); },
      fetchCinestreamMovieData: scrape,
      fetchWiflixTvData: async (id, _season, previous) => scrape(id, previous),
      saveToCache: async (_dir, _key, data) => { writes++; await fs.writeFile(file, JSON.stringify(data)); return true; },
      console: { error() {} },
    });
    vm.runInContext(source.slice(start, end) + '\nglobalThis.update = updateWiflixCache;', context, { filename });
    return (type = 'movie') => context.update(dir, 'key', type, '42', 1);
  };
  return { dir, file, read, createWorker, advance: ms => { time += ms; },
    counts: () => ({ calls, writes }), state: createWiflixRefreshState({ now: () => time }) };
}

test('un échec sur ancien succès ne relance pas un scrape dans un autre worker avant 60 secondes', async t => {
  const f = await fixture(t, async () => ({ success: false }));
  const before = (await fs.stat(f.file)).mtimeMs;
  const first = f.createWorker(), second = f.createWorker();
  await first();
  await second();
  assert.deepEqual(f.counts(), { calls: 1, writes: 0 });
  assert.deepEqual(await f.read(), good);
  assert.equal((await fs.stat(f.file)).mtimeMs, before);
  assert.ok(await f.state.remaining(f.dir, 'key', good) > 0);
  f.advance(61_000);
  await second();
  assert.deepEqual(f.counts(), { calls: 2, writes: 0 });
});

test('les exceptions et le repli sur le même objet conservent les liens et le délai', async t => {
  for (const fetcher of [async () => { throw new Error('timeout'); }, async previous => previous]) {
    const f = await fixture(t, fetcher);
    await f.createWorker()('tv');
    await f.createWorker()('tv');
    assert.deepEqual(f.counts(), { calls: 1, writes: 0 });
    assert.deepEqual(await f.read(), good);
  }
});

test('un succès après reprise supprime le délai et les lecteurs suivants ne rescrapent pas', async t => {
  let fail = true;
  const updated = { success: true, players: { vf: [{ url: 'https://new.test/embed' }] } };
  const f = await fixture(t, async () => fail ? { success: false } : updated);
  await f.createWorker()();
  f.advance(61_000);
  fail = false;
  await f.createWorker()();
  await f.createWorker()();
  assert.deepEqual(f.counts(), { calls: 2, writes: 1 });
  assert.deepEqual(await f.read(), updated);
  await assert.rejects(fs.stat(path.join(f.dir, 'key.retry')), { code: 'ENOENT' });
});

test('la fraîcheur est recontrôlée sous verrou et un cache négatif conserve ses cinq minutes', async t => {
  const f = await fixture(t, async () => ({ success: false }), { initial: null });
  await f.createWorker()();
  f.advance(61_000);
  await f.createWorker()();
  assert.deepEqual(f.counts(), { calls: 1, writes: 1 });
  await fs.writeFile(f.file, JSON.stringify(good));
  await f.createWorker()();
  assert.deepEqual(f.counts(), { calls: 1, writes: 1 });
});

test('deux workers concurrents ne lancent qu’un scrape', async t => {
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, async () => { started(); await gate; return { success: false }; });
  const first = f.createWorker()();
  await ready;
  await f.createWorker()();
  release();
  await first;
  assert.deepEqual(f.counts(), { calls: 1, writes: 0 });
});
