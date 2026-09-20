const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Garder le resolver et le matcher réels, isoler les caches et les appels externes.
function loadRuntime(tmdbHelpers, searches) {
  const filename = path.resolve(__dirname, '../kisskh.js');
  const routeRequire = createRequire(filename);
  const cache = {
    async getNotFound() { return null; },
    async getResolution() { return null; },
    async getMatch() { return null; },
    async getCatalogSnapshot() { return { refreshedAt: Date.now(), updatedAt: Date.now(), items: [{ id: 1, title: 'Another title' }] }; },
    async setNotFound() {},
    async singleFlight(_key, operation) { return operation(); },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    exports: module.exports,
    __dirname: path.dirname(filename),
    URL,
    require(request) {
      if (request === '../utils/tmdbCache') return tmdbHelpers;
      if (request === '../services/kisskh/kisskhCache') {
        return { ...routeRequire(request), createKisskhCache: () => cache };
      }
      if (request === '../services/kisskh/proxyPolicy') {
        return { createKisskhProxyPolicy: () => ({ async assertCircuitClosed() {} }) };
      }
      if (request === '../services/kisskh/kisskhClient') {
        return { createKisskhClient: () => ({
          async list() { throw new Error('Le catalogue frais est déjà disponible'); },
          async search(...args) { searches.push(args); return []; },
          async getDrama() { throw new Error('Aucun résultat à enrichir'); },
          async getEpisode() { throw new Error('Aucun épisode à extraire'); },
          async getSubtitles() { throw new Error('Aucun sous-titre à extraire'); },
        }) };
      }
      return routeRequire(request);
    },
  }, { filename });
  return module.exports.createRuntimeDependencies;
}

function metadataHelpers(calls) {
  return {
    async fetchTmdbDetails(...args) {
      calls.push(['details', ...args]);
      const [, , id, mediaType] = args;
      return mediaType === 'tv' ? {
        id, name: 'Diagnostic Drama', original_name: 'Diagnostic Drama',
        first_air_date: '2025-01-01', origin_country: ['KR'], number_of_seasons: 1,
        seasons: [{ season_number: 1, episode_count: 16 }],
      } : {
        id, title: 'Diagnostic Movie', original_title: 'Diagnostic Movie',
        release_date: '2025-01-01', production_countries: [{ iso_3166_1: 'KR' }],
      };
    },
    async fetchTmdbAlternativeTitles(...args) {
      calls.push(['alternatives', ...args]);
      return args[3] === 'movie' ? { id: args[2], titles: [] } : { id: args[2], results: [] };
    },
  };
}

for (const mediaType of ['tv', 'movie']) {
  for (const custom of [false, true]) {
    test(`runtime resolves cold ${mediaType} metadata with ${custom ? 'explicit TMDB dependencies' : 'the Main API configuration'}`, async () => {
      const calls = [];
      const searches = [];
      const sharedHelpers = metadataHelpers(calls);
      const createRuntimeDependencies = loadRuntime(sharedHelpers, searches);
      const customCalls = [];
      const expectedUrl = custom ? 'https://custom-tmdb.example/3' : 'https://api.themoviedb.org/3';
      const expectedKey = custom ? 'custom-test-key' : 'main-api-test-key';
      const runtime = createRuntimeDependencies({
        env: { KISSKH_ENABLED: 'true', PROXIESEMBED_PUBLIC_URL: 'https://proxy.example' },
        redis: {},
        TMDB_API_URL: 'https://api.themoviedb.org/3',
        TMDB_API_KEY: 'main-api-test-key',
        ...(custom ? {
          ...metadataHelpers(customCalls),
          tmdbApiUrl: expectedUrl,
          tmdbApiKey: expectedKey,
        } : {}),
      });
      const request = { tmdbId: 90447, season: mediaType === 'tv' ? 1 : 0, episode: 1 };
      const warm = mediaType === 'tv' ? runtime.resolver.warmTv : runtime.resolver.warmMovie;

      // Une absence dans le catalogue frais doit aboutir à « introuvable ».
      await assert.rejects(warm(request), error => error.code === 'not_found');
      assert.deepEqual(custom ? customCalls : calls, [
        ['details', expectedUrl, expectedKey, request.tmdbId, mediaType, 'fr-FR'],
        ['details', expectedUrl, expectedKey, request.tmdbId, mediaType, 'en-US'],
        ['alternatives', expectedUrl, expectedKey, request.tmdbId, mediaType],
      ]);
      assert.equal(searches.length, 0, 'Le catalogue doit éviter les recherches KissKH');
      if (custom) assert.deepEqual(calls, [], 'Les fonctions injectées doivent être conservées');
    });
  }
}
