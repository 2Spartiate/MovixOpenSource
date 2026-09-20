const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const test = require('node:test');
const express = require('express');
const ts = require('typescript');
const { createKisskhRouter } = require('../kisskh');
const { createKisskhCache, createFallbackCapabilityStore } = require('../../services/kisskh/kisskhCache');
const { createKisskhResolver } = require('../../services/kisskh/kisskhResolver');
const { createKisskhClient } = require('../../services/kisskh/kisskhClient');
const { createKisskhProxyPolicy } = require('../../services/kisskh/proxyPolicy');
const { createBundleRegistry } = require('../../services/kisskh/bundleRegistry');
const { APPROVED_ALGORITHMS } = require('../../services/kisskh/approvedAlgorithms');

const PROVIDER = 'https://kisskh.do';
const PUBLIC_PROXY = 'https://proxy.example';
const ALGORITHM = [...APPROVED_ALGORITHMS.values()][0];

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function redisDouble(now) {
  const values = new Map();
  const read = (key) => {
    const entry = values.get(key);
    if (entry && entry.expiresAt <= now()) values.delete(key);
    return values.get(key)?.value ?? null;
  };
  return {
    async get(key) { return read(key); },
    async set(key, value, mode, ttl, condition) {
      if (condition === 'NX' && read(key) !== null) return null;
      values.set(key, { value: String(value), expiresAt: now() + ttl * (mode === 'EX' ? 1000 : 1) });
      return 'OK';
    },
    async del(...keys) { keys.forEach((key) => values.delete(key)); },
    async getdel(key) {
      const value = read(key);
      values.delete(key);
      return value;
    },
    async eval(script, _keyCount, key, token, ttl) {
      if (read(key) !== token) return 0;
      if (script.includes('PEXPIRE')) values.get(key).expiresAt = now() + Number(ttl);
      else values.delete(key);
      return 1;
    },
  };
}

// Executer le service frontend reel : seules sa configuration runtime et la cle
// VIP viennent de la fixture. Son fetch, ses validations et ses erreurs restent reels.
const frontendFile = path.resolve(__dirname, '../../../../src/services/kisskhService.ts');
const frontendSource = ts.transpileModule(fs.readFileSync(frontendFile, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function frontendService(url, vip = false) {
  const loaded = new Module(frontendFile, module);
  loaded.require = (name) => {
    if (name === '../config/runtime') return { MAIN_API: url, PROXIES_EMBED_API: PUBLIC_PROXY };
    if (name === '../utils/vipUtils') return { getVipHeaders: () => vip ? { 'x-access-key': 'test-vip' } : {} };
    throw new Error(`Unexpected frontend dependency: ${name}`);
  };
  loaded._compile(frontendSource, frontendFile);
  return loaded.exports;
}

async function ready(operation) {
  const deadline = Date.now() + 3_000;
  while (true) {
    try { return await operation(); } catch (error) {
      if (error.code !== 'retrieval_in_progress' || Date.now() >= deadline) throw error;
      await delay(5);
    }
  }
}

async function fixture(t) {
  const cacheDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'movix-kisskh-e2e-'));
  const state = { clock: 1_000_000, requests: [], servers: [], pending: new Set(), listGate: null, status: 200, dramaId: 1001 };
  const now = () => state.clock;
  state.redis = redisDouble(now);
  t.after(async () => {
    state.listGate?.resolve();
    await Promise.all(state.servers.map((server) => new Promise((resolve) => server.close(resolve))));
    while (state.pending.size) await Promise.allSettled([...state.pending]);
    await fsp.rm(cacheDir, { recursive: true, force: true });
  });
  const catalogue = () => [
    ...Array.from({ length: 100 }, (_, index) => ({ id: index + 1, title: `Unrelated title ${index}`, episodesCount: 1 })),
    { id: state.dramaId, title: 'The Signal (2016)', episodesCount: 2 },
    { id: 2001, title: 'Raya and the Last Dragon (2021)', episodesCount: 1 },
  ];
  const request = async (options) => {
    const url = new URL(options.url);
    state.requests.push(url.pathname);
    assert.equal(url.origin, PROVIDER);
    assert.equal(options.headers.Referer, `${PROVIDER}/`);
    assert.ok(options.proxy);
    if (state.status !== 200) return { status: state.status, headers: { 'retry-after': '60' }, data: '' };
    let data;
    if (url.pathname === '/api/DramaList/List') {
      const page = Number(url.searchParams.get('page'));
      if (page === 1 && state.listGate) await state.listGate.promise;
      data = { page, pageSize: 100, totalCount: 102, data: catalogue().slice((page - 1) * 100, page * 100) };
    } else if (url.pathname.startsWith('/api/DramaList/Drama/')) {
      const id = Number(url.pathname.split('/').at(-1));
      const entry = catalogue().find((item) => item.id === id);
      assert.ok(entry, `Unexpected drama ${id}`);
      data = { ...entry, type: id === 2001 ? 'Movie' : 'TVSeries',
        episodes: [{ id: id * 10 + 1, number: id === 2001 ? 0 : 1 }, ...(id === 2001 ? [] : [
          { id: id * 10 + 9, number: 1.5 }, { id: id * 10 + 2, number: 2 },
        ])] };
    } else if (url.pathname.startsWith('/api/DramaList/Episode/')) {
      assert.match(url.searchParams.get('kkey'), /^[0-9a-f]{32,}$/i);
      const id = url.pathname.split('/').at(-1).replace('.png', '');
      data = { Video: `https://media.example/${id}.mp4` };
    } else if (url.pathname.startsWith('/api/Sub/')) {
      assert.match(url.searchParams.get('kkey'), /^[0-9a-f]{32,}$/i);
      data = [{ src: 'https://subs.example/en.srt', land: 'en', label: 'English' }];
    } else if (url.pathname === '/api/DramaList/Search') data = [];
    else throw new Error(`Unexpected upstream path: ${url.pathname}`);
    return { status: 200, headers: { 'content-type': 'application/json' }, data: JSON.stringify(data) };
  };

  async function worker(redis = state.redis) {
    const cache = createKisskhCache({ cacheDir, redis, now });
    const capabilityStore = createFallbackCapabilityStore({ redis, now, providerBaseUrl: PROVIDER });
    const proxyPolicy = createKisskhProxyPolicy({
      redis: {}, now, sleep: async (ms) => { state.clock += ms; },
      getProxyCandidates: async () => [{ type: 'socks5', host: 'proxy.example', port: 1080 }],
      reserveProxy: async () => true,
    });
    const bundleRegistry = createBundleRegistry({
      providerBaseUrl: PROVIDER, now,
      loadCurrentMetadata: async () => ({ ...ALGORITHM, checkedAt: now() }),
      fetchText: async () => { throw new Error('Approved cached bundle must avoid HTTP'); },
    });
    const client = createKisskhClient({
      redis,
      baseUrl: PROVIDER, proxyPolicy, bundleRegistry, request, now,
      resolveDns: async () => [{ address: '93.184.216.34', family: 4 }],
    });
    const resolver = createKisskhResolver({
      cache, capabilityStore, bundleRegistry, kisskhClient: client, now,
      providerBaseUrl: PROVIDER, publicProxyUrl: PUBLIC_PROXY,
      fetchTmdbDetails: async (_url, _key, id, mediaType) => mediaType === 'movie'
        ? { id, title: 'Raya and the Last Dragon', original_title: 'Raya and the Last Dragon', release_date: '2021-01-01' }
        : { id, name: id >= 900 ? 'Absent title' : 'Signal', original_name: id >= 900 ? 'Absent title' : 'Signal',
          number_of_seasons: 1, first_air_date: '2016-01-01', origin_country: ['KR'],
          seasons: [{ season_number: 1, episode_count: 2 }] },
      fetchTmdbAlternativeTitles: async (_url, _key, _id, mediaType) => mediaType === 'movie' ? { titles: [] } : { results: [] },
    });
    const trackedResolver = { ...resolver };
    for (const name of ['warmTv', 'warmMovie', 'warmCatalog']) {
      trackedResolver[name] = (...args) => {
        const pending = resolver[name](...args);
        state.pending.add(pending);
        pending.then(() => state.pending.delete(pending), () => state.pending.delete(pending));
        return pending;
      };
    }
    const app = express();
    app.use('/api/kisskh', createKisskhRouter({
      enabled: true, resolver: trackedResolver, capabilityStore, proxyPolicy, now,
      providerBaseUrl: PROVIDER, publicProxyUrl: PUBLIC_PROXY,
      verifyAccessKey: async (key) => ({ vip: key === 'test-vip' }),
    }));
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    state.servers.push(server);
    const url = `http://127.0.0.1:${server.address().port}`;
    return { cache, resolver, url, frontend: frontendService(url), vip: frontendService(url, true) };
  }
  return { state, worker, now };
}

test('frontend to HTTP to KissKH resolves TV and movies with episode zero, coalesces requests and survives a restart', async (t) => {
  const { state, worker, now } = await fixture(t);
  const first = await worker();
  state.listGate = deferred();
  const tv = () => first.frontend.resolveKisskhTv(42, 1, 1);
  await assert.rejects(tv(), (error) => error.code === 'retrieval_in_progress');
  await Promise.all(Array.from({ length: 8 }, () => assert.rejects(tv(), (error) => error.code === 'retrieval_in_progress')));
  assert.equal(state.requests.filter((pathname) => pathname === '/api/DramaList/List').length, 1);
  state.listGate.resolve();
  const result = await ready(tv);
  assert.equal(result.match.kisskhDramaId, 1001);
  assert.equal(result.match.episodeId, 10011);
  assert.equal(result.sources[0].url, 'https://media.example/10011.mp4');
  assert.equal(result.subtitles[0].proxyUrl, 'https://subs.example/en.srt');
  assert.equal(state.requests.filter((pathname) => pathname === '/api/DramaList/List').length, 2);
  assert.equal(state.requests.filter((pathname) => pathname === '/api/DramaList/Drama/1001').length, 1);

  const callsBeforeHits = state.requests.length;
  await Promise.all(Array.from({ length: 12 }, tv));
  const vip = await first.vip.resolveKisskhTv(42, 1, 1);
  assert.equal(new URL(vip.sources[0].url).origin, PUBLIC_PROXY);
  assert.equal(new URL(vip.subtitles[0].proxyUrl).origin, PUBLIC_PROXY);
  assert.equal(state.requests.length, callsBeforeHits);
  const raw = await fetch(`${first.url}/api/kisskh/tv/42?season=1&episode=1`);
  assert.equal(raw.headers.get('cache-control'), 'no-store');
  await raw.json();
  const exchange = await fetch(`${first.url}/api/kisskh/fallback/${vip.sources[0].fallbackToken}`, { method: 'POST' });
  assert.equal(exchange.status, 200);
  assert.equal((await exchange.json()).url, 'https://media.example/10011.mp4');
  const reused = await fetch(`${first.url}/api/kisskh/fallback/${vip.sources[0].fallbackToken}`, { method: 'POST' });
  assert.equal(reused.status, 404);
  await reused.json();

  const episodeTwo = await ready(() => first.frontend.resolveKisskhTv(42, 1, 2));
  assert.equal(episodeTwo.match.episodeId, 10012);
  const movie = await ready(() => first.frontend.resolveKisskhMovie(42));
  assert.equal(movie.match.kisskhDramaId, 2001);
  assert.equal(movie.match.season, 0);
  assert.equal(movie.match.episode, 1);
  assert.equal(movie.sources[0].url, 'https://media.example/20011.mp4');
  assert.equal(state.requests.includes('/api/DramaList/Search'), false);

  const peer = await worker();
  const callsBeforePeer = state.requests.length;
  const sameDrama = await ready(() => peer.frontend.resolveKisskhTv(43, 1, 1));
  assert.equal(sameDrama.match.kisskhDramaId, 1001);
  assert.equal(state.requests.length, callsBeforePeer, 'Another worker reuses the shared Drama metadata and disk assets');

  const restarted = await worker(redisDouble(now));
  const callsBeforeRestart = state.requests.length;
  assert.deepEqual((await restarted.frontend.resolveKisskhTv(42, 1, 1)).match, result.match);
  assert.deepEqual((await restarted.frontend.resolveKisskhMovie(42)).match, movie.match);
  assert.equal(state.requests.length, callsBeforeRestart);
});

test('a second HTTP worker sees the renewed catalogue without downloading every page again', async (t) => {
  const { state, worker } = await fixture(t);
  const owner = await worker();
  await ready(() => owner.frontend.resolveKisskhTv(42, 1, 1));
  const reader = await worker();
  await ready(() => reader.frontend.resolveKisskhTv(43, 1, 1));
  state.clock += 43_200_000;
  state.dramaId = 1002;
  await owner.resolver.warmCatalog();
  const lists = state.requests.filter((pathname) => pathname === '/api/DramaList/List').length;
  const result = await ready(() => reader.frontend.resolveKisskhTv(44, 1, 1));
  assert.equal(result.match.kisskhDramaId, 1002);
  assert.equal(result.sources[0].url, 'https://media.example/10021.mp4');
  assert.equal(state.requests.filter((pathname) => pathname === '/api/DramaList/List').length, lists);
});

test('an upstream 429 reaches the frontend and the circuit prevents repeated upstream work', async (t) => {
  const { state, worker } = await fixture(t);
  state.status = 429;
  const service = (await worker()).frontend;
  await assert.rejects(ready(() => service.resolveKisskhTv(42, 1, 1)), (error) => error.code === 'provider_rate_limited');
  const requests = state.requests.length;
  await assert.rejects(ready(() => service.resolveKisskhTv(43, 1, 1)), (error) => error.code === 'provider_rate_limited');
  assert.equal(state.requests.length, requests);
  assert.equal(requests, 1);
});

test('a confirmed missing title returns not_found to the frontend and reuses the negative cache', async (t) => {
  const { state, worker } = await fixture(t);
  const service = (await worker()).frontend;
  await assert.rejects(ready(() => service.resolveKisskhTv(999, 1, 1)), (error) => error.code === 'not_found');
  const requests = state.requests.length;
  assert.equal(state.requests.includes('/api/DramaList/Search'), false);
  await assert.rejects(service.resolveKisskhTv(999, 1, 1), (error) => error.code === 'not_found');
  assert.equal(state.requests.length, requests);
  await assert.rejects(service.resolveKisskhTv(999, 1, 2), (error) => error.code === 'not_found');
  const peer = (await worker()).frontend;
  await assert.rejects(peer.resolveKisskhTv(999, 1, 3), (error) => error.code === 'not_found');
  assert.equal(state.requests.length, requests, 'A title absence is shared across episodes and workers');

  await assert.rejects(ready(() => peer.resolveKisskhTv(998, 1, 1)), (error) => error.code === 'not_found');
  assert.equal(state.requests.length, requests, 'A different TMDB ID is checked against the same local catalogue');
  state.clock += 300_001;
  await assert.rejects(ready(() => service.resolveKisskhTv(999, 1, 1)), (error) => error.code === 'not_found');
  assert.equal(state.requests.length, requests, 'An expired absence is checked against the fresh local catalogue');
});
