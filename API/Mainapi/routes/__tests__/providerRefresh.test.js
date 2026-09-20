'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const { createSingleFlight } = require('../../utils/singleFlight');

function loadFranceTv(axios) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'francetv.js'), 'utf8');
  const module = { exports: {} };
  vm.compileFunction(source, ['require', 'module', 'console'], { filename: 'francetv.js' })((request) => {
    const modules = {
      express,
      axios,
      cheerio: {},
      '../utils/cacheManager': { CACHE_DIR: { FTV: 'ftv' }, generateCacheKey: (key) => key },
      '../utils/mediaSigning': { encodeSignedToken: () => null, decodeSignedToken: () => null, signingConfigured: () => false },
      '../utils/singleFlight': { createSingleFlight },
    };
    if (!(request in modules)) throw new Error(`Dépendance non simulée : ${request}`);
    return modules[request];
  }, module, { ...console, log() {}, warn() {}, error() {} });
  return module.exports;
}

test('France.tv partage le hash à froid et ne scanne pas les chunks restant après la découverte', async () => {
  const hash = 'a'.repeat(40);
  let pageCalls = 0;
  const chunks = [];
  let abortedChunks = 0;
  const axios = {
    get: (url, options = {}) => {
      if (url.endsWith('/recherche/')) {
        pageCalls++;
        return { data: Array.from({ length: 8 }, (_, i) => `<script src="/_next/static/chunks/${i}.js"></script>`).join('') };
      }
      chunks.push(url);
      if (url.endsWith('/0.js')) return { data: `createServerReference("${hash}",0,"searchAction")` };
      return new Promise((_resolve, reject) => {
        const onAbort = () => { abortedChunks++; reject(new Error('aborted')); };
        if (options.signal?.aborted) onAbort();
        else options.signal?.addEventListener('abort', onAbort, { once: true });
      });
    },
  };
  const route = loadFranceTv(axios);
  const results = await Promise.all(Array.from({ length: 20 }, () => route.getFtvNextActionHash()));
  assert.deepEqual(results, Array(20).fill(hash));
  assert.equal(pageCalls, 1, '20 appelants à froid partagent la page de recherche');
  assert.ok(chunks.length <= 4, 'le scan cesse de lancer des chunks après la découverte');
  assert.equal(abortedChunks, chunks.length - 1, 'les chunks en vol sont annulés dès que le hash est trouvé');
  assert.equal(await route.getFtvNextActionHash(), hash);
  assert.equal(pageCalls, 1, 'le TTL évite une nouvelle préparation');
});

function loadVoirDrama({ request, tmdbData } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'voirdrama.js'), 'utf8');
  const module = { exports: {} };
  let now = 1_000_000;
  const logs = [];
  vm.compileFunction(source, ['require', 'module', 'console', '__dirname', 'Date'], { filename: 'voirdrama.js', importModuleDynamically: () => Promise.reject(new Error('impit ne doit pas être appelé')) })((moduleName) => {
    const modules = {
      express,
      path,
      fs: { promises: { mkdir: async () => {}, unlink: async () => {} } },
      axios: {},
      cheerio: require('cheerio'),
      '../utils/cacheManager': { generateCacheKey: (key) => key },
      '../utils/embedExtraction': { respondWithResolvedSources: async (_req, res, body) => res.json(body) },
      '../utils/tmdbCache': { fetchTmdbDetails: async () => tmdbData || null },
      '../utils/diagnostics': { observeTextRequest: (_kind, url, options, operation) => request ? request(url, options) : operation() },
      '../utils/singleFlight': { createSingleFlight },
    };
    if (!(moduleName in modules)) throw new Error(`Dépendance non simulée : ${moduleName}`);
    return modules[moduleName];
  }, module, Object.fromEntries(['log', 'warn', 'error'].map((level) => [level, (...args) => logs.push(args.join(' '))])), path.join(__dirname, '..'), { now: () => now });
  return { router: module.exports, logs, advanceTime: (ms) => { now += ms; } };
}

function dramaHandler(router) {
  return router.stack.find((layer) => layer.route?.path === '/:type/:tmdbid').route.stack[0].handle;
}

test('VoirDrama partage le miss, publie une fois et conserve un hit périmé après erreur', async () => {
  const { router, advanceTime } = loadVoirDrama();
  const cache = new Map();
  const writes = [];
  let calls = 0;
  let stale = false;
  router.configure({
    getFromCacheNoExpiration: async (_dir, key) => cache.get(key) || null,
    saveToCache: async (_dir, key, value) => { cache.set(key, value); writes.push(value); },
    shouldUpdateCache24h: async () => stale,
    fetchDramaTvData: async () => { calls++; return calls === 1 ? { success: true, data: [{ link: 'https://video.test' }] } : { success: false, error: 'amont indisponible' }; },
  });
  const handler = dramaHandler(router);
  const request = async () => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ params: { type: 'tv', tmdbid: '11' }, query: { season: '1', episode: '2' } }, res);
    return res;
  };

  const responses = await Promise.all(Array.from({ length: 20 }, request));
  assert.equal(calls, 1, '20 misses ne doivent lancer qu’un parcours');
  assert.equal(writes.length, 1, 'le résultat commun est publié une seule fois');
  assert.ok(responses.every((res) => res.statusCode === 200));

  stale = true;
  advanceTime(5 * 60 * 1000);
  await request();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.equal(writes.length, 1, 'une erreur de refresh ne remplace pas la donnée utilisable');
  await request();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2, 'le cooldown évite de répéter immédiatement le refresh en échec');
});

test('VoirDrama préserve les lecteurs lors d’un succès vide', async () => {
  const { router } = loadVoirDrama();
  const key = 'voirdrama_11_1_2';
  const cache = new Map([[key, { success: true, data: [{ link: 'https://video.test/old' }] }]]);
  let calls = 0;
  router.configure({
    getFromCacheNoExpiration: async (_dir, cacheKey) => cache.get(cacheKey) || null,
    saveToCache: async (_dir, cacheKey, value) => { cache.set(cacheKey, value); return true; },
    shouldUpdateCache24h: async () => true,
    fetchDramaTvData: async () => { calls++; return { success: true, data: [] }; },
  });
  const handler = dramaHandler(router);
  const request = async () => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ params: { type: 'tv', tmdbid: '11' }, query: { season: '1', episode: '2' } }, res);
    return res;
  };
  await request(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.deepEqual(cache.get(key).data, [{ link: 'https://video.test/old' }]);
});

const dramaTmdbData = { name: 'Drama Test', first_air_date: '2025-12-12' };
const dramaSearchResponse = (html) => ({ statusCode: 200, body: `___ASPSTART_HTML___${html}___ASPEND_HTML___` });
const dramaSearchHtml = '<div class="item"><div class="asp_content"><h3><a class="asp_res_url" href="https://voirdrama.to/drama/test/">Drama Test</a></h3></div><div class="summary-content">Dec 12, 2025</div></div>';
const dramaEpisodeResponse = { statusCode: 200, body: `var thisChapterSources = ${JSON.stringify({ VIDM: '<iframe src="https://video.test/embed"></iframe>' })};` };
const dramaCloudflareResponse = { statusCode: 520, body: '<!DOCTYPE html><title>voirdrama.to | 520: Web server is returning an unknown error</title>' };

function configureDramaCache(router, initialData = null) {
  const cache = new Map(initialData ? [['voirdrama_11_1_2', initialData]] : []);
  const writes = [];
  router.configure({
    getFromCacheNoExpiration: async (_dir, key) => cache.get(key) || null,
    saveToCache: async (_dir, key, value) => { cache.set(key, value); writes.push(value); return true; },
    shouldUpdateCache24h: async () => false,
  });
  const handler = dramaHandler(router);
  return {
    cache,
    writes,
    request: async () => {
      const res = {
        statusCode: 200, headers: {},
        status(code) { this.statusCode = code; return this; },
        set(name, value) { this.headers[name] = value; return this; },
        json(body) { this.body = body; return this; },
      };
      await handler({ params: { type: 'tv', tmdbid: '11' }, query: { season: '1', episode: '2' } }, res);
      return res;
    },
  };
}

test('VoirDrama renvoie 503 après un 520 sans cache disque, mutualise la reprise puis récupère les lecteurs', async () => {
  let calls = 0;
  let unavailable = true;
  const { router, logs, advanceTime } = loadVoirDrama({
    tmdbData: dramaTmdbData,
    request: async (url) => {
      calls++;
      if (unavailable) return dramaCloudflareResponse;
      return url.endsWith('admin-ajax.php') ? dramaSearchResponse(dramaSearchHtml) : dramaEpisodeResponse;
    },
  });
  const { cache, writes, request } = configureDramaCache(router);
  const responses = await Promise.all(Array.from({ length: 20 }, request));
  assert.ok(responses.every((res) => res.statusCode === 503), 'une panne amont ne signifie pas que la série est absente');
  assert.equal(responses[0].body.retryable, true);
  assert.equal(responses[0].body.upstreamStatus, 520);
  assert.equal(responses[0].headers['Retry-After'], '60');
  assert.equal(calls, 1);
  assert.equal(writes.length, 0);
  assert.equal(cache.size, 0);
  assert.ok(logs.some((line) => line.includes('520')));
  assert.ok(logs.every((line) => !line.includes('<!DOCTYPE') && !line.includes('<title>')));

  unavailable = false;
  advanceTime(59_999);
  assert.equal((await request()).statusCode, 503);
  assert.equal(calls, 1, 'aucune nouvelle recherche pendant le délai de reprise');
  advanceTime(1);
  const recovered = await request();
  assert.equal(recovered.statusCode, 200);
  assert.deepEqual(recovered.body.data, [{ name: 'Vidmoly', link: 'https://video.test/embed' }]);
  assert.equal(calls, 3, 'la reprise récupère la recherche et la page épisode');
  assert.equal(writes.length, 1);
  assert.equal((await request()).statusCode, 200);
  assert.equal(calls, 3, 'le cache utilisable retrouve sa durée habituelle');
});

test('VoirDrama revalide immédiatement les anciens faux introuvables', async () => {
  const { router } = loadVoirDrama({
    tmdbData: dramaTmdbData,
    request: async (url) => url.endsWith('admin-ajax.php') ? dramaSearchResponse(dramaSearchHtml) : dramaEpisodeResponse,
  });
  const { writes, request } = configureDramaCache(router, { success: false, error: 'Film/Série non trouvé sur Voirdrama' });
  const response = await request();
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data[0].link, 'https://video.test/embed');
  assert.equal(writes.length, 1);
});

test('VoirDrama distingue un corps de recherche invalide d’un résultat vide valide', async () => {
  const invalid = loadVoirDrama({ tmdbData: dramaTmdbData, request: async () => ({ statusCode: 200, body: '<html>Service indisponible</html>' }) });
  const invalidCache = configureDramaCache(invalid.router);
  assert.equal((await invalidCache.request()).statusCode, 503);
  assert.equal(invalidCache.writes.length, 0);
  assert.ok(invalid.logs.every((line) => !line.includes('<html>')));

  let calls = 0;
  const empty = loadVoirDrama({ tmdbData: dramaTmdbData, request: async () => { calls++; return dramaSearchResponse('<div></div>'); } });
  const emptyCache = configureDramaCache(empty.router);
  assert.equal((await emptyCache.request()).statusCode, 404);
  assert.equal((await emptyCache.request()).statusCode, 404);
  assert.equal(emptyCache.writes.length, 1);
  assert.equal(calls, 1, 'un vrai résultat vide peut rester en cache');
});

test('VoirDrama conserve les erreurs HTTP des pages candidates et de l’épisode', async () => {
  for (const searchHtml of [dramaSearchHtml, dramaSearchHtml.replace('Dec 12, 2025', '')]) {
    const { router } = loadVoirDrama({
      tmdbData: dramaTmdbData,
      request: async (url) => url.endsWith('admin-ajax.php') ? dramaSearchResponse(searchHtml) : dramaCloudflareResponse,
    });
    const { writes, request } = configureDramaCache(router);
    const response = await request();
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.upstreamStatus, 520);
    assert.equal(writes.length, 0);
  }
});

test('VoirDrama conserve un vrai 404 de page épisode comme absence de contenu', async () => {
  const { router } = loadVoirDrama({
    tmdbData: dramaTmdbData,
    request: async (url) => url.endsWith('admin-ajax.php') ? dramaSearchResponse(dramaSearchHtml) : { statusCode: 404, body: '<html>Not found</html>' },
  });
  const { writes, request } = configureDramaCache(router);
  const response = await request();
  assert.equal(response.statusCode, 404);
  assert.notEqual(response.body.retryable, true);
  assert.equal(writes.length, 1);
});

test('VoirDrama traite une coupure réseau comme une indisponibilité temporaire', async () => {
  let calls = 0;
  const { router } = loadVoirDrama({
    tmdbData: dramaTmdbData,
    request: async () => { calls++; throw new Error('connect ETIMEDOUT'); },
  });
  const { writes, request } = configureDramaCache(router);
  assert.equal((await request()).statusCode, 503);
  assert.equal((await request()).statusCode, 503);
  assert.equal(calls, 1);
  assert.equal(writes.length, 0);
});
